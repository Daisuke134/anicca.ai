import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Privacy | Anicca' }

export default function PrivacyIndex() {
  const accept = headers().get('accept-language') || ''
  const lang = accept.startsWith('ja') ? 'ja' : 'en'
  redirect(`/privacy/${lang}`)
}
