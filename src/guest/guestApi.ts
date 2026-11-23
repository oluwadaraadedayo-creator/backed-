const RAW = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const API = RAW.endsWith('/api') ? RAW : `${RAW}/api`
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')

// Guest checkout: buyers can pay with just a name and an email. The server routes are in api/_handlers/guest-*.js.
export const GUEST_ENABLED = true

// Where Paystack sends the buyer after paying, and where the emailed link points.
export const guestReturnUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}?guest=1`

export type GuestResult<T> = { ok: boolean; status: number; data: T & { error?: string } }

export async function guestCall<T>(route: string, body: unknown): Promise<GuestResult<T>> {
  try {
    const res = await fetch(`${API}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body)
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Check your network and try again.' } as unknown as T & { error?: string } }
  }
}
