import { readEnv } from '../_lib/env.js'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { assertWorkspacePath } from '../_lib/storagePaths.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

/** Remove um objeto do bucket (após as checagens de uso feitas no cliente). */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const supabase = getSupabaseAdmin(env)
    const path = assertWorkspacePath(env.workspaceKey, requireString(body, 'path', 400))

    const { error } = await supabase.storage.from(env.supabaseBucket).remove([path])
    if (error) {
      res.status(502).json({ error: `Falha ao remover objeto: ${error.message}` })
      return
    }
    res.status(200).json({ ok: true })
  } catch (error) {
    handleError(res, error, 'storage/delete-object')
  }
}
