/**
 * Tipos estruturais mínimos dos handlers da Vercel (evita depender de
 * @vercel/node só pelos tipos) e utilitários de validação/erro.
 *
 * Regra de log: nunca registrar chave, base64, documentos, imagens ou
 * respostas completas da API — apenas mensagens curtas e códigos.
 */

export interface ApiRequest {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(payload: unknown): void
  setHeader(name: string, value: string): void
  end(payload?: string): void
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function requirePost(req: ApiRequest): void {
  if (req.method !== 'POST') throw new HttpError(405, 'Método não suportado. Use POST.')
}

export function requireBody(req: ApiRequest): Record<string, unknown> {
  const body = req.body
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'Corpo JSON obrigatório.')
  }
  return body as Record<string, unknown>
}

export function requireString(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Campo obrigatório ausente ou inválido: ${key}.`)
  }
  if (value.length > maxLength) {
    throw new HttpError(413, `Campo ${key} excede o limite de ${maxLength} caracteres.`)
  }
  return value
}

export function optionalString(body: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = body[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new HttpError(400, `Campo inválido: ${key}.`)
  if (value.length > maxLength) throw new HttpError(413, `Campo ${key} excede o limite.`)
  return value
}

const MAX_IMAGE_DATA_URL = 8_000_000 // ~6MB de binário
const MAX_ATTACHMENTS = 8

export interface IncomingAttachment {
  id: string
  name: string
  mimeType: string
  role: string
  description: string
  usage: string
  mustAppearExactly: boolean
  referenceOnly: boolean
  allowCrop: boolean
  imageDataUrl?: string
  textContent?: string
}

export function validateAttachments(raw: unknown): IncomingAttachment[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new HttpError(400, 'attachments deve ser uma lista.')
  if (raw.length > MAX_ATTACHMENTS) {
    throw new HttpError(413, `Máximo de ${MAX_ATTACHMENTS} anexos por chamada.`)
  }
  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new HttpError(400, `Anexo ${index} inválido.`)
    }
    const a = item as Record<string, unknown>
    const dataUrl = typeof a.imageDataUrl === 'string' ? a.imageDataUrl : undefined
    if (dataUrl) {
      if (!dataUrl.startsWith('data:image/')) {
        throw new HttpError(400, `Anexo ${index}: imageDataUrl precisa ser uma imagem em data URL.`)
      }
      if (dataUrl.length > MAX_IMAGE_DATA_URL) {
        throw new HttpError(413, `Anexo ${index}: imagem excede o tamanho máximo permitido.`)
      }
    }
    return {
      id: String(a.id ?? `att-${index}`).slice(0, 64),
      name: String(a.name ?? 'anexo').slice(0, 120),
      mimeType: String(a.mimeType ?? 'application/octet-stream').slice(0, 80),
      role: String(a.role ?? 'visual-reference').slice(0, 40),
      description: String(a.description ?? '').slice(0, 600),
      usage: String(a.usage ?? '').slice(0, 600),
      mustAppearExactly: a.mustAppearExactly === true,
      referenceOnly: a.referenceOnly === true,
      allowCrop: a.allowCrop !== false,
      imageDataUrl: dataUrl,
      textContent: typeof a.textContent === 'string' ? a.textContent.slice(0, 20_000) : undefined,
    }
  })
}

export function handleError(res: ApiResponse, error: unknown, route: string): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'Erro inesperado.'
  // Log seguro: rota + mensagem curta, sem payloads.
  console.error(`[${route}] ${message.slice(0, 300)}`)
  res.status(502).json({ error: 'Falha ao processar a solicitação de IA. Tente novamente.' })
}
