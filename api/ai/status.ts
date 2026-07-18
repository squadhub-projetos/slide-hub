import { readEnv } from '../_lib/env'
import { handleError, type ApiRequest, type ApiResponse } from '../_lib/http'
import { isSupabaseConfigured } from '../_lib/supabaseAdmin'

/**
 * Estado da configuração server-side, para o indicador de modo da interface.
 * Nunca expõe valores — apenas presença/ausência.
 */
export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const env = readEnv()
    res.status(200).json({
      openaiConfigured: Boolean(env.apiKey),
      supabaseConfigured: isSupabaseConfigured(env),
      textModel: env.textModel,
      imageModel: env.imageModel,
      imageQuality: env.imageQuality,
      imageSize: env.imageSize,
      webSearchEnabled: env.webSearchEnabled,
      workspace: env.workspaceKey,
    })
  } catch (error) {
    handleError(res, error, 'ai/status')
  }
}
