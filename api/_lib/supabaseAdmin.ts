import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './http'
import type { ServerEnv } from './env'

/**
 * Cliente administrativo do Supabase — EXCLUSIVAMENTE server-side.
 * Nunca importar deste módulo em src/: a SUPABASE_SECRET_KEY vive
 * apenas nas variáveis de ambiente do servidor.
 */

let client: SupabaseClient | null = null

export function isSupabaseConfigured(env: ServerEnv): boolean {
  return Boolean(env.supabaseUrl && env.supabaseSecretKey)
}

export function getSupabaseAdmin(env: ServerEnv): SupabaseClient {
  if (!isSupabaseConfigured(env)) {
    throw new HttpError(503, 'Supabase não configurado no servidor (SUPABASE_URL / SUPABASE_SECRET_KEY).')
  }
  if (!client) {
    client = createClient(env.supabaseUrl!, env.supabaseSecretKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
