import OpenAI from 'openai'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http'
import { anthropicApiKey } from '../_lib/aiConfig'

/**
 * "Testar modelo": valida rapidamente se um modelo existe/está acessível
 * no provedor, SEM gerar conteúdo caro e sem expor chaves. Usado pelo
 * seletor para marcar "Modelo indisponível" em vez de deixar a geração
 * travar por minutos.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const provider = requireString(body, 'provider', 16)
    const model = requireString(body, 'model', 80)
    const startedAt = Date.now()

    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) throw new HttpError(503, 'A chave da OpenAI não está configurada.')
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 10_000, maxRetries: 0 })
      try {
        await client.models.retrieve(model)
      } catch (error) {
        const e = error as { status?: number }
        if (e.status === 404) {
          res.status(200).json({ ok: false, provider, model, reason: 'Modelo indisponível neste provedor.' })
          return
        }
        if (e.status === 401 || e.status === 403) throw new HttpError(e.status, 'Falha de autenticação com a OpenAI.')
        throw new HttpError(502, 'Não foi possível consultar a OpenAI.')
      }
      res.status(200).json({ ok: true, provider, model, durationMs: Date.now() - startedAt })
      return
    }

    if (provider === 'anthropic') {
      const key = anthropicApiKey()
      if (!key) throw new HttpError(503, 'A chave da Anthropic não está configurada.')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: controller.signal,
        })
        if (response.status === 404) {
          res.status(200).json({ ok: false, provider, model, reason: 'Modelo indisponível neste provedor.' })
          return
        }
        if (response.status === 401 || response.status === 403) {
          throw new HttpError(response.status, 'Falha de autenticação com a Anthropic.')
        }
        if (!response.ok) throw new HttpError(502, 'Não foi possível consultar a Anthropic.')
      } catch (error) {
        if (error instanceof HttpError) throw error
        throw new HttpError(504, 'A consulta à Anthropic excedeu o tempo limite.')
      } finally {
        clearTimeout(timer)
      }
      res.status(200).json({ ok: true, provider, model, durationMs: Date.now() - startedAt })
      return
    }

    throw new HttpError(400, `Provedor desconhecido: "${provider.slice(0, 24)}".`)
  } catch (error) {
    handleError(res, error, 'ai/test-model')
  }
}
