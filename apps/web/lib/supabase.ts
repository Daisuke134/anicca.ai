import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

// Supabaseクライアントの作成（クライアント側）
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// シングルトンインスタンス（オプション）
let supabase: ReturnType<typeof createClient> | undefined

export function getSupabase() {
  if (!supabase) {
    supabase = createClient()
  }
  return supabase
}