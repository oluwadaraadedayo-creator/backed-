import { applyCors, adminClient, REFERENCE, ipHash } from '../_lib.js'
import { overLimit } from '../_guest.js'
import { sendGuestLink } from '../_email.js'

// Emails a fresh download link. It always answers the same way, so nobody can use it to learn which emails or references exist.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const reply = () => res.status(200).json({ ok: true })
  try {
    const reference = String(req.body?.reference || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!REFERENCE.test(reference) || !email) return reply()
    const db = adminClient()
    if (await overLimit(db, `guest-resend:${ipHash(req)}`, 5, 3600)) return res.status(429).json({ error: 'Too many requests. Please try again later.' })
    const { data: order } = await db.from('orders').select('id,status,is_guest,buyer_email,product_id').eq('payment_reference', reference).maybeSingle()
    if (!order || !order.is_guest || order.status !== 'paid' || String(order.buyer_email).toLowerCase() !== email) return reply()
    await db.from('orders').update({ guest_downloads_used: 0 }).eq('id', order.id)
    const { data: product } = await db.from('products').select('title').eq('id', order.product_id).maybeSingle()
    await sendGuestLink(db, { orderId: order.id, to: order.buyer_email, title: product?.title || 'your release', reference })
    return reply()
  } catch (error) {
    console.error('guest-resend failed', error)
    return reply()
  }
}
