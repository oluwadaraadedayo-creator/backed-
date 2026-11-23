import { applyCors, adminClient, isUuid, resolveAmount, splitFor, platformFeePercent, enabledCurrencies, ipHash } from '../_lib.js'
import { safeReturnUrl, overLimit } from '../_guest.js'

// Starts a payment for someone who is not signed in. They give a name and an email; the receipt and download link go to that email.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY
    if (!secret) return res.status(503).json({ error: 'Payments are not configured' })
    const db = adminClient()
    if (await overLimit(db, `guest-init:${ipHash(req)}`, 12, 600)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })

    const { productId, amount, quantity, name, email } = req.body || {}
    if (!isUuid(productId)) return res.status(400).json({ error: 'A valid release is required' })
    const cleanName = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80)
    const cleanEmail = String(email || '').trim().toLowerCase()
    if (cleanName.length < 2) return res.status(400).json({ error: 'Enter your name.' })
    if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email, like name@mail.com.' })

    const { data: product } = await db.from('products')
      .select('id,title,price_minor,currency,status,creator_id,pricing_mode,min_price_minor')
      .eq('id', productId).eq('status', 'published').single()
    if (!product) return res.status(404).json({ error: 'Release not found or unavailable' })
    if (!enabledCurrencies().includes(product.currency || 'NGN')) return res.status(409).json({ error: 'This release is priced in a currency we do not accept yet' })

    const priced = resolveAmount(product, amount, quantity)
    if (priced.error) return res.status(priced.status).json({ error: priced.error })

    const { data: payout } = await db.from('artist_payouts').select('subaccount_code').eq('profile_id', product.creator_id).maybeSingle()
    if (!payout && process.env.ALLOW_UNSPLIT_SALES !== 'true') return res.status(409).json({ error: 'This artist has not set up payouts yet' })
    const split = splitFor({ amountMinor: priced.amountMinor, subaccountCode: payout?.subaccount_code, feePercent: platformFeePercent().value, bearer: process.env.PAYSTACK_FEE_BEARER })

    const reference = `bkd_${crypto.randomUUID()}`
    const { data: order, error: orderError } = await db.from('orders').insert({
      buyer_id: null, buyer_email: cleanEmail, is_guest: true, guest_name: cleanName, product_id: product.id, creator_id: product.creator_id,
      amount_minor: priced.amountMinor, quantity: priced.quantity, currency: priced.currency, payment_provider: 'paystack',
      payment_reference: reference, status: 'pending', platform_fee_minor: split.fee, subaccount_code: payout?.subaccount_code ?? null
    }).select('id').single()
    if (orderError || !order) { console.error('guest order insert failed', orderError?.code); return res.status(500).json({ error: 'Could not create order' }) }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail, amount: String(priced.amountMinor), currency: priced.currency, reference,
        callback_url: safeReturnUrl(req.body?.returnUrl), metadata: { order_id: order.id, product_id: product.id, quantity: priced.quantity, guest: true }, ...split.extra
      })
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
      console.error('paystack guest init failed', response.status, JSON.stringify(payload))
      await db.from('orders').update({ status: 'payment_initialization_failed' }).eq('id', order.id)
      return res.status(502).json({ error: 'Payment provider could not initialise checkout' })
    }
    return res.status(200).json({ authorizationUrl: payload.data.authorization_url, reference })
  } catch (error) {
    console.error('guest-initialize-payment failed', error)
    return res.status(500).json({ error: 'Unable to initialise payment' })
  }
}
