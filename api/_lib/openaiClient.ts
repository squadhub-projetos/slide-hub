import OpenAI, { toFile } from 'openai'
import { HttpError } from './http'
import type { ServerEnv } from './env'

let client: OpenAI | null = null

export function getOpenAi(env: ServerEnv): OpenAI {
  if (!env.apiKey) {
    throw new HttpError(503, 'OPENAI_API_KEY não configurada no servidor. Configure nas variáveis de ambiente da Vercel.')
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.apiKey, timeout: 170_000, maxRetries: 1 })
  }
  return client
}

/** Converte um data URL de imagem em arquivo enviável ao SDK. */
export async function dataUrlToFile(dataUrl: string, name: string) {
  const [head, base64] = dataUrl.split(',')
  const mime = head.match(/data:(.*?)(;|$)/)?.[1] ?? 'image/png'
  const buffer = Buffer.from(base64, 'base64')
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'png'
  return toFile(buffer, `${name}.${ext}`, { type: mime })
}
