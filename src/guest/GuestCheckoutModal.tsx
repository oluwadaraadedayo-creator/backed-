import { useState } from 'react'
import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { guestCall, guestReturnUrl } from './guestApi'

type Props = {
  productId: string
  title: string
  amount?: number
  quantity?: number
  onClose: () => void
  onSignIn?: () => void
}

export default function GuestCheckoutModal({ productId, title, amount, quantity, onClose, onSignIn }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function pay(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) { setError('Enter your name.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email, like name@mail.com.'); return }
    setBusy(true)
    const { ok, data } = await guestCall<{ authorizationUrl?: string }>('guest-initialize-payment', {
      productId, amount, quantity, name: name.trim(), email: email.trim(), returnUrl: guestReturnUrl()
    })
    if (!ok || !data.authorizationUrl) {
      setBusy(false)
      setError(data.error || 'Could not start payment. Please try again.')
      return
    }
    window.location.href = data.authorizationUrl
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#141A3C]/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Buy without an account">
      <form onSubmit={pay} className="w-full max-w-md rounded-none border border-[#D8DBEA] bg-white p-6 text-[#141A3C] border-2 border-[#141A3C]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Buy without an account</h2>
            <p className="mt-1 text-sm text-[#5B6180]">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5B6180] hover:text-[#141A3C]">
            <X size={20} />
          </button>
        </div>

        <label htmlFor="guest-name" className="mt-5 block text-sm font-medium">Full name</label>
        <input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
          className="mt-1.5 w-full rounded-md border border-[#D8DBEA] bg-white px-3 py-3 text-base text-[#141A3C] outline-none focus:border-[#2B3BFF]" />

        <label htmlFor="guest-email" className="mt-4 block text-sm font-medium">Email for your download link</label>
        <input id="guest-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          className="mt-1.5 w-full rounded-md border border-[#D8DBEA] bg-white px-3 py-3 text-base text-[#141A3C] outline-none focus:border-[#2B3BFF]" />
        <p className="mt-1.5 text-xs text-[#5B6180]">We email your link here. Double check it, this is how you get your files.</p>

        {error && <p className="mt-3 text-sm text-[#C0392B]" role="alert">{error}</p>}

        <button type="submit" disabled={busy}
          className="mt-5 w-full rounded-md bg-[#2B3BFF] px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Opening payment...' : 'Continue to payment'}
        </button>
        <p className="mt-3 text-center text-xs text-[#5B6180]">Secure payment by Paystack. No password, no signup.</p>
                {onSignIn && <button type="button" onClick={onSignIn} className="mt-3 w-full text-center text-sm text-[#5B6180] underline">Already have an account? Sign in</button>}
      </form>
    </div>
  )
}
