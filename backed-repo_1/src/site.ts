// Your business details. The legal pages read from here.
// Replace every value in [square brackets]. While any bracket remains, the legal pages show a "Draft" banner.
// Have a lawyer review the Terms, Privacy and Refund pages before launch.
export const SITE = {
  name: 'Backed',
  legalName: '[Your registered business name]',
  contactEmail: '[support email]',
  email: '[support email]',
  address: '[Your business address]',
  country: 'Nigeria',
  platformFee: '15%',
  refundDays: '7',
  retention: '7 years',
  updated: '[date]'
}
export const isPlaceholder = (v: string) => /^\[.*\]$/.test(v.trim())
export const hasPlaceholders = Object.values(SITE).some(isPlaceholder)
export const contactEmail = isPlaceholder(SITE.email) ? '' : SITE.email
