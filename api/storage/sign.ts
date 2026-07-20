import { readEnv } from '../_lib/env.js'
import {
  handleError,
  requireBody,
  requirePost,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { assertWorkspacePath } from '../_lib/storagePaths.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const EXPIRES_SECONDS = 60 * 30 // 30 minutos — o cliente cacheia e renova

/**
 * URLs assinadas temporárias para o bucket privado.
 * Body: { paths: string[] } (máx. 40) — apenas caminhos do workspace.
 * As URLs NUNCA são persistidas; o banco guarda somente storagePath.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const supabase = getSupabaseAdmin(env)

    if (!Array.isArray(body.paths) || body.paths.length === 0) {
      throw new HttpError(400, 'paths (lista) é obrigatório.')
    }
    if (body.paths.length > 40) throw new HttpError(413, 'Máximo de 40 caminhos por chamada.')
    const paths = body.paths.map((p) => assertWorkspacePath(env.workspaceKey, String(p)))

    const { data, error } = await supabase.storage
      .from(env.supabaseBucket)
      .createSignedUrls(paths, EXPIRES_SECONDS)
    if (error) throw new HttpError(502, `Falha ao assinar URLs: ${error.message}`)

    const urls: Record<string, string | null> = {}
    for (const item of data ?? []) {
      urls[item.path ?? ''] = item.error ? null : item.signedUrl
    }
    res.status(200).json({ urls, expiresInSeconds: EXPIRES_SECONDS })
  } catch (error) {
    handleError(res, error, 'storage/sign')
  }
}
