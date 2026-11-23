import { applyCors, adminClient, REFERENCE, AUDIO_BUCKET, DOWNLOAD_LINK_SECONDS, safeFilename } from '../_lib.js'
import { tokenOk, GUEST_MAX_DOWNLOADS } from '../_guest.js'

// Short-lived file links for someone who paid without an account. Needs the order reference and the token from the order page.
export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { reference, token } = req.body || {}
    if (!REFERENCE.test(String(reference || '')) || !tokenOk(reference, token)) return res.status(403).json({ error: 'This download link is not valid. Use "Find my order" to get a new one.' })
    const db = adminClient()
    const { data: order } = await db.from('orders').select('id,status,is_guest,product_id,guest_downloads_used').eq('payment_reference', reference).maybeSingle()
    if (!order || !order.is_guest || order.status !== 'paid') return res.status(403).json({ error: 'This download link is not valid. Use "Find my order" to get a new one.' })
    const used = order.guest_downloads_used || 0
    if (used >= GUEST_MAX_DOWNLOADS) return res.status(410).json({ error: 'You have used all downloads for this order. Use "Find my order" to get a fresh link.' })
    // Count first, so two quick requests cannot slip past the limit.
    const { data: bumped } = await db.from('orders').update({ guest_downloads_used: used + 1 }).eq('id', order.id).eq('guest_downloads_used', used).select('id')
    if (!bumped?.length) return res.status(429).json({ error: 'Please try again in a moment.' })

    const { data: files } = await db.from('product_files').select('id,title,position,storage_path,size_bytes,mime_type').eq('product_id', order.product_id).eq('status', 'active').order('position', { ascending: true })
    const out = []
    for (const f of files || []) {
      const ext = f.storage_path.split('.').pop()
      const filename = safeFilename(f.position, f.title, ext)
      const { data, error } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(f.storage_path, DOWNLOAD_LINK_SECONDS, { download: filename })
      if (!error && data?.signedUrl) out.push({ id: f.id, title: f.title, position: f.position, sizeBytes: f.size_bytes, mime: f.mime_type || '', filename, url: data.signedUrl })
    }
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ files: out, downloadsLeft: Math.max(0, GUEST_MAX_DOWNLOADS - used - 1), expiresInSeconds: DOWNLOAD_LINK_SECONDS })
  } catch (error) {
    console.error('guest-download failed', error)
    return res.status(500).json({ error: 'Could not prepare your files' })
  }
}
