// @ts-nocheck
// One Supabase Edge Function that serves every endpoint of the old Vercel api folder.
// A small adapter makes the Edge request look like the Node (req, res) the handlers already expect,
// so the payment logic is unchanged. URL: https://<project-ref>.supabase.co/functions/v1/api/<route>
import { Buffer } from 'node:buffer'
import process from 'node:process'
globalThis.Buffer ??= Buffer
globalThis.process ??= process

import banks from './banks.js'
import createSubaccount from './create-subaccount.js'
import initializePayment from './initialize-payment.js'
import paystackWebhook from './paystack-webhook.js'
import report from './report.js'
import verifyPayment from './verify-payment.js'
import registerAudio from './_handlers/register-audio.js'
import removeAudio from './_handlers/remove-audio.js'
import registerPreview from './_handlers/register-preview.js'
import removePreview from './_handlers/remove-preview.js'
import registerArtwork from './_handlers/register-artwork.js'
import download from './_handlers/download.js'
import previews from './_handlers/previews.js'
import apply from './_handlers/apply.js'
import config from './_handlers/config.js'
import guestInitializePayment from './_handlers/guest-initialize-payment.js'
import guestOrder from './_handlers/guest-order.js'
import guestDownload from './_handlers/guest-download.js'
import guestResend from './_handlers/guest-resend.js'
import { createHmac } from 'node:crypto'
import { adminClient } from './_lib.js'

const ROUTES = {
  'banks': banks, 'create-subaccount': createSubaccount, 'initialize-payment': initializePayment,
  'paystack-webhook': paystackWebhook, 'report': report, 'verify-payment': verifyPayment,
  'register-audio': registerAudio, 'remove-audio': removeAudio, 'register-preview': registerPreview,
  'remove-preview': removePreview, 'register-artwork': registerArtwork, 'download': download,
  'previews': previews, 'apply': apply, 'config': config,
  'guest-initialize-payment': guestInitializePayment, 'guest-order': guestOrder, 'guest-download': guestDownload, 'guest-resend': guestResend
}

// ---------------------------------------------------------------------------
// Rate limits. Each rule is [max requests, window in seconds]. "ip" is per network address, "user" is per signed-in account.
// IP limits are generous on purpose: many Nigerian mobile users share one address. The per-user limits are the strict ones.
// paystack-webhook is deliberately absent: its signature protects it, and blocking it could lose payment confirmations.
// ---------------------------------------------------------------------------
const LIMITS = {
  'initialize-payment': { ip: [30, 600], user: [10, 600] },
  'verify-payment': { ip: [60, 600] },
  'banks': { ip: [30, 600] },
  'create-subaccount': { ip: [10, 3600], user: [5, 3600] },
  'download': { ip: [60, 600], user: [30, 600] },
  'previews': { ip: [120, 600] },
  'register-audio': { ip: [150, 600], user: [100, 600] },
  'register-preview': { ip: [60, 600], user: [40, 600] },
  'register-artwork': { ip: [30, 600], user: [20, 600] },
  'remove-audio': { ip: [100, 600], user: [60, 600] },
  'remove-preview': { ip: [60, 600], user: [40, 600] },
  'apply': { ip: [10, 3600], user: [5, 3600] },
  'report': { ip: [20, 3600] },
  'config': { ip: [120, 600] },
  'guest-order': { ip: [200, 600] },
  'guest-download': { ip: [60, 600] }
}

function clientIp(h) {
  return String(h['cf-connecting-ip'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim()
}

// Returns the window length in seconds when the caller is over a limit, otherwise false. If the limiter itself fails, it lets the request through.
async function overLimit(name, h) {
  const rule = LIMITS[name]
  if (!rule) return false
  try {
    const db = adminClient()
    const salt = process.env.IP_HASH_SALT || 'backed'
    const checks = [[`${name}:ip:${createHmac('sha256', salt).update(clientIp(h)).digest('hex').slice(0, 24)}`, ...rule.ip]]
    if (rule.user) {
      const auth = String(h['authorization'] || '')
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      if (token) {
        const { data } = await db.auth.getUser(token)
        if (data?.user?.id) checks.push([`${name}:user:${data.user.id}`, ...rule.user])
      }
    }
    for (const [key, limit, windowSec] of checks) {
      const { data, error } = await db.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSec })
      if (error) { console.error('rate limit check failed', error.message); return false }
      if (data === false) return windowSec
    }
    return false
  } catch (e) { console.error('rate limit error', e); return false }
}

const plain = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const name = url.pathname.split('/').filter(Boolean).pop() || ''
  const fn = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null
  if (!fn) return plain(404, { error: 'Not found' })

  if (request.method !== 'OPTIONS') {
    const wait = await overLimit(name, Object.fromEntries(request.headers))
    if (wait) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a few minutes and try again.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(wait), 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '', 'Vary': 'Origin' }
      })
    }
  }

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  const raw = hasBody ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array()
  const headers = Object.fromEntries(request.headers)               // keys are lower case
  let body
  // The webhook must see the exact bytes Paystack signed, so its body is never pre-parsed.
  if (name !== 'paystack-webhook' && raw.length && (headers['content-type'] || '').includes('application/json')) {
    try { body = JSON.parse(new TextDecoder().decode(raw)) } catch { body = undefined }
  }
  const req = {
    method: request.method, headers, body, url: request.url, query: Object.fromEntries(url.searchParams),
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw) }
  }

  return await new Promise((resolve) => {
    let status = 200
    const h = new Headers()
    const finish = (payload) => resolve(new Response([204, 304].includes(status) ? null : payload, { status, headers: h }))
    const res = {
      setHeader(k, v) { h.set(k, String(v)); return res },
      status(c) { status = c; return res },
      json(o) { h.set('Content-Type', 'application/json'); finish(JSON.stringify(o ?? null)); return res },
      end(b) { finish(b ?? null); return res }
    }
    Promise.resolve(fn(req, res))
      .then(() => resolve(plain(500, { error: 'No response' })))      // no-op if the handler already replied
      .catch((e) => { console.error('unhandled', name, e); resolve(plain(500, { error: 'Server error' })) })
  })
})
