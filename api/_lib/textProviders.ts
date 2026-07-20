import OpenAI from 'openai'
import { HttpError } from './http'
import { anthropicApiKey, type ExecutionMode, type TextProviderId } from './aiConfig'

/**
 * Camada comum de geração TEXTUAL estruturada para OpenAI e Anthropic.
 * Centraliza autenticação, timeout, extração de uso e normalização —
 * nenhum endpoint precisa de `if provider === 'openai'` espalhado.
 * As chaves nunca saem daqui; nada é logado além de metadados.
 */

export interface StructuredCallRequest {
  model: string
  mode: ExecutionMode
  system: string
  /** Turnos anteriores da conversa (texto puro). */
  history: { role: 'user' | 'assistant'; text: string }[]
  /** Partes da mensagem final do usuário. */
  userParts: { text?: string; imageDataUrl?: string }[]
  schemaName: string
  schema: Record<string, unknown>
  timeoutMs: number
  /** Instrução extra (retry controlado por schema inválido). */
  extraInstruction?: string
}

export interface StructuredCallResult {
  parsed: unknown
  requestId?: string
  inputTokens?: number
  outputTokens?: number
}

export interface TextAIProvider {
  readonly id: TextProviderId
  generateStructured(req: StructuredCallRequest): Promise<StructuredCallResult>
}

/** Esforço de raciocínio por modo — SEMPRE mapeado, nunca fixo em high. */
function openAiEffort(mode: ExecutionMode): 'low' | 'medium' | 'high' {
  if (mode === 'quality') return 'high'
  if (mode === 'balanced') return 'medium'
  return 'low'
}

/* ------------------------------------------------------------------ */
/* OpenAI (Responses API + Structured Outputs)                         */
/* ------------------------------------------------------------------ */

export class OpenAITextProvider implements TextAIProvider {
  readonly id = 'openai' as const
  private client: OpenAI

  constructor(apiKey: string | undefined, timeoutMs: number) {
    if (!apiKey) throw new HttpError(503, 'A chave da OpenAI não está configurada.')
    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 })
  }

  async generateStructured(req: StructuredCallRequest): Promise<StructuredCallResult> {
    type Part = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' }
    const parts: Part[] = req.userParts.map((p) =>
      p.imageDataUrl
        ? { type: 'input_image' as const, image_url: p.imageDataUrl, detail: 'auto' as const }
        : { type: 'input_text' as const, text: p.text ?? '' },
    )
    const history = req.history.map((m) => ({ role: m.role, content: m.text }))
    const instructions = req.extraInstruction ? `${req.system}\n\n${req.extraInstruction}` : req.system

    let response
    try {
      response = await this.client.responses.create(
        {
          model: req.model,
          reasoning: { effort: openAiEffort(req.mode) },
          instructions,
          input: [...history, { role: 'user' as const, content: parts }],
          text: {
            format: { type: 'json_schema', name: req.schemaName, strict: true, schema: req.schema },
          },
        },
        { timeout: req.timeoutMs },
      )
    } catch (error) {
      // Taxonomia de erros: nunca devolver tudo como 502 genérico.
      const e = error as { status?: number; name?: string; message?: string }
      if (e.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(e.message ?? '')) {
        throw new HttpError(504, `A geração textual excedeu o tempo limite (${Math.round(req.timeoutMs / 1000)}s).`)
      }
      if (e.status === 401 || e.status === 403) {
        throw new HttpError(e.status, 'Falha de autenticação com a OpenAI. Verifique a OPENAI_API_KEY.')
      }
      if (e.status === 404 || (e.status === 400 && /model/i.test(e.message ?? ''))) {
        throw new HttpError(400, `O modelo "${req.model}" não está disponível na OpenAI.`)
      }
      if (e.status === 429) {
        throw new HttpError(429, 'Limite/quota da OpenAI atingido. Aguarde e tente novamente.')
      }
      throw new HttpError(502, `Erro da API da OpenAI${e.status ? ` (${e.status})` : ''}. ${(e.message ?? '').slice(0, 160)}`.trim())
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(response.output_text)
    } catch {
      throw new HttpError(502, 'O modelo retornou JSON inválido.')
    }
    return {
      parsed,
      requestId: response.id,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic (Messages API + tool-use forçado para JSON estruturado)   */
/* ------------------------------------------------------------------ */

const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function maxTokensFor(mode: ExecutionMode): number {
  if (mode === 'quality') return 16_000
  if (mode === 'balanced') return 10_000
  return 6_000
}

interface AnthropicContentBlock {
  type: string
  input?: unknown
  text?: string
}

export class AnthropicTextProvider implements TextAIProvider {
  readonly id = 'anthropic' as const
  private apiKey: string

  constructor(apiKey: string | undefined) {
    if (!apiKey) throw new HttpError(503, 'A chave da Anthropic não está configurada.')
    this.apiKey = apiKey
  }

  async generateStructured(req: StructuredCallRequest): Promise<StructuredCallResult> {
    type Block =
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    const blocks: Block[] = []
    for (const part of req.userParts) {
      if (part.imageDataUrl) {
        const match = part.imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/)
        if (match) blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })
      } else if (part.text) {
        blocks.push({ type: 'text', text: part.text })
      }
    }
    const messages = [
      ...req.history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: blocks },
    ]
    const system = req.extraInstruction ? `${req.system}\n\n${req.extraInstruction}` : req.system

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), req.timeoutMs)
    let response: Response
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: maxTokensFor(req.mode),
          system,
          messages,
          tools: [
            {
              name: req.schemaName,
              description: 'Devolve o resultado estruturado exatamente no schema.',
              input_schema: req.schema,
            },
          ],
          tool_choice: { type: 'tool', name: req.schemaName },
        }),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError(504, 'A geração textual excedeu o tempo limite.')
      }
      throw new HttpError(502, 'Não foi possível conectar à API da Anthropic.')
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let detail = ''
      try {
        const payload = (await response.json()) as { error?: { message?: string } }
        detail = payload.error?.message ?? ''
      } catch {
        /* corpo não-JSON */
      }
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(response.status, 'Falha de autenticação com a Anthropic. Verifique a ANTHROPIC_API_KEY.')
      }
      if (response.status === 404 && /model/i.test(detail)) {
        throw new HttpError(400, `O modelo selecionado não está disponível na Anthropic (${detail.slice(0, 120)}).`)
      }
      if (response.status === 429) {
        throw new HttpError(429, 'Limite da Anthropic atingido. Aguarde e tente novamente.')
      }
      throw new HttpError(502, `Erro da API da Anthropic (${response.status}). ${detail.slice(0, 200)}`.trim())
    }

    const payload = (await response.json()) as {
      id?: string
      content?: AnthropicContentBlock[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const toolUse = payload.content?.find((c) => c.type === 'tool_use')
    if (!toolUse?.input || typeof toolUse.input !== 'object') {
      throw new HttpError(502, 'A Anthropic não retornou o resultado estruturado esperado.')
    }
    return {
      parsed: toolUse.input,
      requestId: payload.id,
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens,
    }
  }
}

/* ------------------------------------------------------------------ */

export function getTextProvider(id: TextProviderId, timeoutMs: number): TextAIProvider {
  if (id === 'anthropic') return new AnthropicTextProvider(anthropicApiKey())
  return new OpenAITextProvider(process.env.OPENAI_API_KEY, timeoutMs)
}
