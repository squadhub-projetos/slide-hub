import { readEnv } from '../_lib/env'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http'
import { ASSET_SUGGESTIONS_SCHEMA } from '../_lib/deckSchema'
import { getOpenAi } from '../_lib/openaiClient'

// Ver nota em api/ai/plan-deck.ts — busca com web search pode ser lenta o
// bastante para exceder o timeout padrão da Vercel sem este ajuste.
export const config = { maxDuration: 60 }

/**
 * Busca ativos oficiais (logos/brand kits) via web search do modelo de
 * texto. Gated por OPENAI_ENABLE_WEB_SEARCH — quando desativado, falha
 * de forma segura devolvendo lista vazia com aviso.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()

    if (!env.webSearchEnabled) {
      res.status(200).json({
        suggestions: [],
        disabled: true,
        message: 'Busca de ativos oficiais desativada (OPENAI_ENABLE_WEB_SEARCH=false). Anexe o arquivo manualmente.',
      })
      return
    }

    const client = getOpenAi(env)
    const brief = requireString(body, 'brief', 12_000)
    const brands = Array.isArray(body.brands)
      ? (body.brands as unknown[]).map(String).slice(0, 8)
      : []

    const response = await client.responses.create({
      model: env.textModel,
      tools: [{ type: 'web_search' }],
      instructions: `Você localiza ativos OFICIAIS de marca (logo, press kit, brand kit).
Regras:
- Considere apenas domínios oficiais da marca ou páginas de imprensa/brand guidelines oficiais.
- NUNCA sugira resultados de bancos de imagem, Google Imagens, fan sites ou repositórios não oficiais.
- Se não houver fonte confiável, não sugira nada para aquela marca.
- imageUrl deve apontar diretamente para o arquivo de imagem oficial.
- note deve indicar o tipo de página de origem (site oficial, press kit, brand kit, documentação).`,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Marcas/softwares detectados: ${brands.join(', ') || '(detectar no briefing)'}\n\nBriefing:\n${brief}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'asset_suggestions',
          strict: true,
          schema: ASSET_SUGGESTIONS_SCHEMA as Record<string, unknown>,
        },
      },
    })

    const parsed = JSON.parse(response.output_text) as {
      suggestions: { brandName: string; imageUrl: string; sourceDomain: string; sourceUrl: string; note: string }[]
    }
    const suggestions = parsed.suggestions.map((s, i) => ({ ...s, id: `web-${Date.now()}-${i}` }))
    res.status(200).json({ suggestions })
  } catch (error) {
    handleError(res, error, 'search-official-assets')
  }
}
