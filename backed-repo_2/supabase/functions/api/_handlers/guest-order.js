import { applyCors, adminClient, confirmPayment, REFERENCE } from '../_lib.js'
import { guestToken, maskEmail, GUEST_MAX_DOWNLOADS } from '../_guest.js'

// The page a guest lands on after paying. While the payment is still pending it asks Paystack directly, so the page does not wait for the webhook.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const reference = String(req.body?.reference || '')
    if (!REFERENCE.test(reference)) return res.status(404).json({ error: 'Order not found' })
    const db = adminClient()
    const load = () => db.from('orders').select('id,status,is_guest,buyer_email,product_id,guest_downloads_used').eq('payment_reference', reference).maybeSingle()
    let { data: order } = await load()
    if (!order || !order.is_guest) return res.status(404).json({ error: 'Order not found' })
    if (order.status === 'pending' && process.env.PAYSTACK_SECRET_KEY) {
      await confirmPayment(db, process.env.PAYSTACK_SECRET_KEY, reference)
      ;({ data: order } = await load())
    }
    res.setHeader('Cache-Control', 'no-store')
    if (order.status !== 'paid') return res.status(200).json({ status: order.status })
    const { data: product } = await db.from('products').select('title').eq('id', order.product_id).maybeSingle()
    return res.status(200).json({
      status: 'paid', token: guestToken(reference), title: product?.title || 'your release',
      email: maskEmail(order.buyer_email), downloadsLeft: Math.max(0, GUEST_MAX_DOWNLOADS - (order.guest_downloads_used || 0))
    })
  } catch (error) {
    console.error('guest-order failed', error)
    return res.status(500).json({ error: 'Could not load your order' })
  }
}
