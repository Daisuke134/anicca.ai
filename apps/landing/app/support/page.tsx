import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Support | Anicca' }

export default function SupportIndex() {
  const accept = headers().get('accept-language') || ''
  const lang = accept.startsWith('ja') ? 'ja' : 'en'
  redirect(`/support/${lang}`)
}
