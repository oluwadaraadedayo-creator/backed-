// Helpers for buying without an account. Files starting with "_" are not exposed as endpoints by Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const GUEST_MAX_DOWNLOADS = 5      // download sessions per order before a fresh link is needed

const secretKey = () => process.env.GUEST_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// The download token is not stored. It is derived from the order reference with a server secret,
// so only a server that holds the secret can issue or check it.
export const guestToken = (reference) => createHmac('sha256', secretKey()).update(`guest:${reference}`).digest('hex').slice(0, 40)
export function tokenOk(reference, token) {
  if (!secretKey()) return false
  const a = Buffer.from(guestToken(reference)), b = Buffer.from(String(token || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export const maskEmail = (e) => {
  const [name = '', domain = ''] = String(e || '').split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

// Where Paystack may send the buyer back to. Only our own site is allowed, so the return address cannot be pointed elsewhere.
export function safeReturnUrl(candidate) {
  const own = [process.env.SITE_URL, process.env.PAYSTACK_CALLBACK_URL, process.env.ALLOWED_ORIGIN].filter(Boolean)
  const origins = new Set()
  for (const u of own) { try { origins.add(new URL(u).origin) } catch { /* ignore */ } }
  try {
    const u = new URL(String(candidate || ''))
    if (origins.has(u.origin)) return u.toString()
  } catch { /* fall through */ }
  return process.env.PAYSTACK_CALLBACK_URL || ''
}

// True when this caller has used up its allowance. If the counter itself fails, the request is allowed.
export async function overLimit(db, key, limit, windowSeconds) {
  try {
    const { data, error } = await db.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
    return !error && data === false
  } catch { return false }
}
