import { randomUUID } from 'node:crypto'
import { readEnv, resolveImageParams } from '../_lib/env.js'
import { sha256Hex } from '../_lib/hashNode.js'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  optionalString,
  validateAttachments,
  HttpError,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import { persistGeneratedImage } from '../_lib/imagePersistence.js'
import { dataUrlToFile, getOpenAi } from '../_lib/openaiClient.js'

// Ver nota em api/ai/plan-deck.ts — geração de imagem em qualidade alta/4K
// também pode exceder o timeout padrão da Vercel sem este ajuste.
export const config = { maxDuration: 60 }

/**
 * Geração REAL de um slide como imagem (gpt-image-2, 16:9).
 * - Sem imagens de referência: images.generate.
 * - Com referências: images.edit (aceita imagens de entrada).
 * Cada saída é um ARQUIVO NOVO: hash SHA-256 calculado, imagem persistida
 * no Supabase Storage e metadados completos devolvidos ao cliente.
 * Este endpoint nunca devolve SVG nem template — apenas saída do modelo.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const client = getOpenAi(env)
    const startedAt = Date.now()

    const slidePlan = body.slidePlan as Record<string, unknown> | undefined
    const productionPrompt =
      (typeof slidePlan?.productionPrompt === 'string' && slidePlan.productionPrompt) ||
      requireString(body, 'masterPrompt', 40_000)
    const negativePrompt = typeof slidePlan?.negativePrompt === 'string' ? slidePlan.negativePrompt : ''
    const quality = optionalString(body, 'quality', 16)
    const projectKey = optionalString(body, 'projectKey', 120) ?? 'sem-projeto'
    const slideKey = optionalString(body, 'slideKey', 120) ?? 'slide'
    const variationsRaw = Number(body.variations ?? 1)
    const variations = Math.max(1, Math.min(3, Number.isFinite(variationsRaw) ? Math.round(variationsRaw) : 1))
    const attachments = validateAttachments(body.attachments)

    if (productionPrompt.length > 40_000) throw new HttpError(413, 'Prompt excede o limite.')

    const params = resolveImageParams(quality, env)
    const prompt = [
      productionPrompt,
      'Reservar área limpa para o logo oficial e para os textos (aplicados pelo sistema depois). Não desenhar logos nem marcas.',
      negativePrompt ? `EVITAR: ${negativePrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const inputImages = attachments.filter((a) => a.imageDataUrl)

    let data: { b64_json?: string }[]
    if (inputImages.length > 0) {
      const files = await Promise.all(
        inputImages.slice(0, 6).map((a) => dataUrlToFile(a.imageDataUrl!, a.id)),
      )
      const refNotes = inputImages
        .map((a) => `Imagem "${a.name}" (${a.role}): ${a.usage || a.description || 'referência'}${a.mustAppearExactly ? ' — preservar exatamente' : ''}`)
        .join('\n')
      const result = await client.images.edit({
        model: env.imageModel,
        image: files,
        prompt: `${prompt}\n\nReferências fornecidas:\n${refNotes}`,
        n: variations,
        size: params.size as never,
        quality: params.quality as never,
      })
      data = result.data ?? []
    } else {
      const result = await client.images.generate({
        model: env.imageModel,
        prompt,
        n: variations,
        size: params.size as never,
        quality: params.quality as never,
      })
      data = result.data ?? []
    }

    const buffers = data
      .filter((d) => typeof d.b64_json === 'string')
      .map((d) => Buffer.from(d.b64_json!, 'base64'))
    if (buffers.length === 0) throw new HttpError(502, 'A API de imagens não retornou resultados.')

    const [width, height] = params.size.split('x').map(Number)
    const promptHash = sha256Hex(prompt)
    const durationMs = Date.now() - startedAt

    const images = await Promise.all(
      buffers.map(async (buffer, index) => {
        const generationId = randomUUID()
        const metadata = {
          provider: 'openai' as const,
          model: env.imageModel,
          generationId,
          source: 'generation' as const,
          promptHash,
          outputHash: '',
          mimeType: 'image/png',
          width,
          height,
          quality: params.quality,
          createdAt: new Date().toISOString(),
          durationMs,
        }
        const persisted = await persistGeneratedImage({
          env,
          buffer,
          projectKey,
          slideKey,
          versionKey: `${generationId.slice(0, 8)}-v${index + 1}`,
          area: 'generated',
          metadata: { ...metadata, resolution: params.size },
        })
        return {
          dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
          metadata: {
            ...metadata,
            outputHash: persisted.outputHash,
            storagePath: persisted.storagePath,
            assetRecordKey: persisted.assetRecordKey,
          },
        }
      }),
    )

    res.status(200).json({
      images,
      model: env.imageModel,
      quality: params.quality,
      resolution: params.size,
      fileSource: 'openai',
    })
  } catch (error) {
    handleError(res, error, 'generate-slide')
  }
}
