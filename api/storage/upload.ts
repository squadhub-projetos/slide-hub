import { readEnv } from '../_lib/env'
import { sha256Hex } from '../_lib/hashNode'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  optionalString,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http'
import { assertSafeKey, libraryPath, projectPath, sanitizeFilename } from '../_lib/storagePaths'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif', 'image/gif', 'image/bmp',
  'application/pdf', 'text/plain', 'text/csv',
])

/**
 * Upload de arquivo para o bucket privado. O caminho é SEMPRE gerado no
 * servidor (nunca aceito do cliente): área de projeto ou biblioteca.
 * Body: { kind: 'project'|'library', projectKey?, area?, key, filename, mimeType, base64 }
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const supabase = getSupabaseAdmin(env)

    const kind = requireString(body, 'kind', 16)
    const key = assertSafeKey(requireString(body, 'key', 120), 'key')
    const filename = sanitizeFilename(requireString(body, 'filename', 200))
    const mimeType = requireString(body, 'mimeType', 80)
    if (!ALLOWED_MIME.has(mimeType)) throw new HttpError(415, `Tipo não permitido: ${mimeType}.`)

    const base64 = requireString(body, 'base64', Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 64)
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length === 0) throw new HttpError(400, 'Arquivo vazio.')
    if (buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Arquivo excede 20MB.')

    let storagePath: string
    if (kind === 'library') {
      storagePath = libraryPath(env.workspaceKey, key, filename)
    } else if (kind === 'project') {
      const projectKey = assertSafeKey(requireString(body, 'projectKey', 120), 'projectKey')
      const area = optionalString(body, 'area', 20) ?? 'uploads'
      if (!['uploads', 'masks', 'thumbnails', 'exports'].includes(area)) {
        throw new HttpError(400, 'Área de upload inválida.')
      }
      storagePath = projectPath(env.workspaceKey, projectKey, area as 'uploads', `${key}-${filename}`)
    } else {
      throw new HttpError(400, 'kind deve ser project ou library.')
    }

    const { error } = await supabase.storage
      .from(env.supabaseBucket)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true })
    if (error) throw new HttpError(502, `Upload falhou: ${error.message}`)

    res.status(200).json({
      storagePath,
      bucket: env.supabaseBucket,
      fileSize: buffer.length,
      sha256: sha256Hex(buffer),
      mimeType,
    })
  } catch (error) {
    handleError(res, error, 'storage/upload')
  }
}
