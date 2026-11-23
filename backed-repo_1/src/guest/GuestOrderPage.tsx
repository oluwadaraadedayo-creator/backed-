import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { guestCall } from './guestApi'

type OrderInfo = { status?: string; title?: string; token?: string; downloadsLeft?: number; email?: string }
type DlFile = { id: string; title: string; filename: string; url: string; sizeBytes?: number }
type DlResp = { files?: DlFile[]; downloadsLeft?: number }
type Phase = 'loading' | 'pending' | 'slow' | 'ready' | 'failed' | 'find'

const size = (b?: number) => (b ? `${(b / 1048576).toFixed(1)} MB` : '')

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F8] p-4 text-[#141A3C]">
      <div className="w-full max-w-md rounded-2xl border border-[#D8DBEA] bg-white p-6 text-[#141A3C]">{children}</div>
    </div>
  )
}

export default function GuestOrderPage() {
  const q = new URLSearchParams(window.location.search)
  const reference = q.get('reference') || q.get('ref') || ''
  const wantsFind = q.get('guest') === 'find' || !reference

  const [phase, setPhase] = useState<Phase>(wantsFind ? 'find' : 'loading')
  const [token, setToken] = useState('')
  const [title, setTitle] = useState('')
  const [email, setEmail] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const [files, setFiles] = useState<DlFile[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showFind, setShowFind] = useState(wantsFind)
  const [fe, setFe] = useState('')
  const [fr, setFr] = useState(reference)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (wantsFind) return
    let stop = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    async function check() {
      const { ok, status, data } = await guestCall<OrderInfo>('guest-order', { reference })
      if (stop) return
      if (ok && data.status === 'paid' && data.token) {
        setToken(data.token)
        setTitle(data.title || '')
        setEmail(data.email || '')
        setLeft(data.downloadsLeft ?? null)
        setPhase('ready')
        return
      }
      if (status === 404) { setPhase('failed'); setMsg('We could not find this order.'); return }
      tries += 1
      if (tries >= 40) { setPhase('failed'); setMsg('We have not received your payment yet. If you were charged, your download link will be emailed to you as soon as your bank confirms. If not, go back and try again.'); return }
      setPhase(tries > 5 ? 'slow' : 'pending')
      timer = setTimeout(check, 3000)
    }
    check()
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [reference, wantsFind])

  async function download() {
    setBusy(true)
    setMsg('')
    const { ok, status, data } = await guestCall<DlResp>('guest-download', { reference, token })
    setBusy(false)
    if (!ok) {
      setMsg(data.error || 'Could not start your download.')
      if ([403, 410, 429].includes(status)) setShowFind(true)
      return
    }
    setFiles(data.files || [])
    setLeft(data.downloadsLeft ?? null)
  }

  async function resend(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await guestCall('guest-resend', { reference: fr.trim(), email: fe.trim() })
    setBusy(false)
    setSent(true)
  }

  const findForm = (
    <form onSubmit={resend} className="mt-5 border-t border-[#D8DBEA] pt-5">
      <h2 className="text-lg font-semibold">Find my order</h2>
      <p className="mt-1 text-sm text-[#5B6180]">Enter the email you used and your order reference. We send a fresh link.</p>
      <label htmlFor="fe" className="mt-4 block text-sm font-medium">Email</label>
      <input id="fe" type="email" value={fe} onChange={(e) => setFe(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-[#D8DBEA] bg-white px-3 py-3 text-base text-[#141A3C] outline-none focus:border-[#2B3BFF]" />
      <label htmlFor="fr" className="mt-4 block text-sm font-medium">Order reference (starts with bkd_)</label>
      <input id="fr" value={fr} onChange={(e) => setFr(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-[#D8DBEA] bg-white px-3 py-3 text-base text-[#141A3C] outline-none focus:border-[#2B3BFF]" />
      <button type="submit" disabled={busy} className="mt-4 w-full rounded-lg bg-[#2B3BFF] px-4 py-3 font-semibold text-white disabled:opacity-50">Send me a new link</button>
      {sent && <p className="mt-3 text-sm text-[#5B6180]" role="status">If the details match, a new link is on its way to your email.</p>}
    </form>
  )

  if (phase === 'loading' || phase === 'pending') {
    return <Shell><h1 className="text-xl font-semibold">Confirming your payment</h1><p className="mt-2 text-sm text-[#5B6180]">This takes a few seconds. Please do not close this page.</p></Shell>
  }
  if (phase === 'slow') {
    return <Shell><h1 className="text-xl font-semibold">Still confirming your payment</h1><p className="mt-2 text-sm text-[#5B6180]">Banks can be slow. You can close this page. We will email your download link the moment payment is confirmed, and you will not be charged twice.</p></Shell>
  }
  if (phase === 'failed') {
    return <Shell><h1 className="text-xl font-semibold">Payment not confirmed</h1><p className="mt-2 text-sm text-[#5B6180]">{msg}</p><a href="/" className="mt-4 inline-block rounded-lg bg-[#2B3BFF] px-4 py-3 font-semibold text-white">Back to the store</a>{findForm}</Shell>
  }
  if (phase === 'find') {
    return <Shell><a href="/" className="text-sm text-[#5B6180] underline">Back to the store</a>{findForm}</Shell>
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Your download is ready</h1>
      <p className="mt-1 text-sm text-[#5B6180]">{title}{email ? `. We also emailed the link to ${email}.` : ''}</p>

      {files.length === 0 ? (
        <button onClick={download} disabled={busy || left === 0}
          className="mt-5 w-full rounded-lg bg-[#2B3BFF] px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Preparing...' : 'Get my files'}
        </button>
      ) : (
        <ul className="mt-5 space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#D8DBEA] p-3">
              <span className="min-w-0 truncate text-sm">{f.title} <span className="text-[#5B6180]">{size(f.sizeBytes)}</span></span>
              <a href={f.url} download={f.filename} className="shrink-0 rounded-lg bg-[#2B3BFF] px-3 py-2 text-sm font-semibold text-white">Download</a>
            </li>
          ))}
        </ul>
      )}

      {left !== null && <p className="mt-3 text-xs text-[#5B6180]">{left} download{left === 1 ? '' : 's'} left on this link. Links expire after 72 hours. Download links open for 10 minutes after you tap Get my files.</p>}
      {msg && <p className="mt-3 text-sm text-[#C0392B]" role="alert">{msg}</p>}
      <p className="mt-3 text-xs text-[#5B6180]">Order reference: {reference}</p>

      {showFind ? findForm : <button onClick={() => setShowFind(true)} className="mt-4 text-sm text-[#5B6180] underline">Lost your link? Find my order</button>}
    </Shell>
  )
}
