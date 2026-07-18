import { readEnv } from '../_lib/env'
import {
  handleError,
  requireBody,
  requirePost,
  validateAttachments,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http'
import { getOpenAi } from '../_lib/openaiClient'

// Ver nota em api/ai/plan-deck.ts — chamadas de IA real podem exceder o
// timeout padrão da Vercel sem este ajuste.
export const config = { maxDuration: 60 }

type ContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }

/**
 * Descreve anexos de imagem com o modelo de texto (visão) para preencher
 * automaticamente descrições sugeridas. Nunca afirma ter lido formatos
 * que não foram enviados como imagem/texto.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const client = getOpenAi(env)

    const attachments = validateAttachments(body.attachments)
    const images = attachments.filter((a) => a.imageDataUrl)
    if (images.length === 0) throw new HttpError(400, 'Nenhum anexo de imagem para analisar.')

    const parts: ContentPart[] = [
      {
        type: 'input_text',
        text: 'Para cada imagem a seguir, devolva JSON {"results":[{"id","description","suggestedRole"}]}. Descrições objetivas em pt-BR (1-2 frases). suggestedRole ∈ logo|photo|person|product|software|chart|diagram|screenshot|visual-reference|texture.',
      },
    ]
    for (const a of images) {
      parts.push({ type: 'input_text', text: `id: ${a.id} — nome: ${a.name}` })
      parts.push({ type: 'input_image', image_url: a.imageDataUrl!, detail: 'auto' })
    }

    const response = await client.responses.create({
      model: env.textModel,
      input: [{ role: 'user', content: parts }],
      text: {
        format: {
          type: 'json_schema',
          name: 'attachment_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['results'],
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'description', 'suggestedRole'],
                  properties: {
                    id: { type: 'string' },
                    description: { type: 'string' },
                    suggestedRole: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    })

    res.status(200).json(JSON.parse(response.output_text))
  } catch (error) {
    handleError(res, error, 'analyze-attachments')
  }
}
