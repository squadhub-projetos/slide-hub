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

// Ver nota em api/ai/plan-deck.ts — geração/edição de imagem em qualidade
// alta/4K também pode exceder o timeout padrão da Vercel sem este ajuste.
export const config = { maxDuration: 60 }

const MAX_IMAGE_DATA_URL = 12_000_000

const INTENSITY_RULES: Record<string, string> = {
  subtle:
    'AJUSTE SUTIL: preserve praticamente todo o slide — composição, cores e elementos. Aplique somente a mudança pedida, da forma mais discreta possível.',
  moderate:
    'ALTERAÇÃO MODERADA: modifique a área, a distribuição ou a composição solicitada de forma perceptível, mantendo a identidade visual geral.',
  recreate:
    'RECRIAÇÃO VISUAL: mantenha o conteúdo e o estilo, mas crie uma solução visual claramente diferente da imagem de origem.',
}

/**
 * Revisão REAL de um slide via edição de imagem (gpt-image-2):
 * imagem atual + instrução + máscara opcional + referências.
 * A saída é um ARQUIVO NOVO — o hash é comparado com o da origem e,
 * quando idêntico, o cliente é avisado (unchangedFromSource).
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const client = getOpenAi(env)
    const startedAt = Date.now()

    const instructions = requireString(body, 'instructions', 8000)
    const previous = body.previousImage as Record<string, unknown> | undefined
    const currentDataUrl = typeof previous?.dataUrl === 'string' ? previous.dataUrl : undefined
    if (!currentDataUrl || !currentDataUrl.startsWith('data:image/')) {
      throw new HttpError(400, 'previousImage.dataUrl (imagem atual) é obrigatório.')
    }
    if (currentDataUrl.length > MAX_IMAGE_DATA_URL) {
      throw new HttpError(413, 'Imagem atual excede o tamanho máximo.')
    }
    const maskDataUrl = optionalString(body, 'maskDataUrl', MAX_IMAGE_DATA_URL)
    const editScope = optionalString(body, 'editScope', 24) ?? 'full-slide'
    const intensity = optionalString(body, 'intensity', 16) ?? 'moderate'
    const quality = optionalString(body, 'quality', 16)
    const projectKey = optionalString(body, 'projectKey', 120) ?? 'sem-projeto'
    const slideKey = optionalString(body, 'slideKey', 120) ?? 'slide'
    const variationsRaw = Number(body.variations ?? 1)
    const variations = Math.max(1, Math.min(3, Number.isFinite(variationsRaw) ? Math.round(variationsRaw) : 1))
    const attachments = validateAttachments(body.attachments)
    const slidePlan = body.slidePlan as Record<string, unknown> | undefined
    const negativePrompt = typeof slidePlan?.negativePrompt === 'string' ? slidePlan.negativePrompt : ''

    const params = resolveImageParams(quality, env)

    const sourceBuffer = Buffer.from(currentDataUrl.split(',')[1] ?? '', 'base64')
    const sourceImageHash = sha256Hex(sourceBuffer)

    const scopeRules =
      editScope === 'masked-area'
        ? 'Altere PRIORITARIAMENTE a área indicada pela máscara. Preserve layout, textos, números, cores e demais elementos fora dela. Elementos vizinhos só podem ser ajustados minimamente para manter a coerência.'
        : 'Aplique a alteração mantendo a identidade visual, os textos e os números existentes.'
    const refNotes = attachments
      .filter((a) => a.imageDataUrl)
      .map((a) => `Referência "${a.name}" (${a.role}): ${a.usage || a.description || ''}${a.mustAppearExactly ? ' — preservar exatamente' : ''}`)
      .join('\n')

    const prompt = [
      `Revisão solicitada: ${instructions}`,
      INTENSITY_RULES[intensity] ?? INTENSITY_RULES.moderate,
      scopeRules,
      'Não modificar logos nem marcas (aplicados pelo sistema). Não inventar conteúdo novo. Ortografia impecável.',
      refNotes,
      negativePrompt ? `EVITAR: ${negativePrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const imageFiles = [await dataUrlToFile(currentDataUrl, 'current')]
    for (const a of attachments.filter((x) => x.imageDataUrl).slice(0, 5)) {
      imageFiles.push(await dataUrlToFile(a.imageDataUrl!, a.id))
    }

    const result = await client.images.edit({
      model: env.imageModel,
      image: imageFiles,
      mask: maskDataUrl ? await dataUrlToFile(maskDataUrl, 'mask') : undefined,
      prompt,
      n: variations,
      size: params.size as never,
      quality: params.quality as never,
    })

    const buffers = (result.data ?? [])
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
          source: 'edit' as const,
          promptHash,
          sourceImageHash,
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
          versionKey: `${generationId.slice(0, 8)}-r${index + 1}`,
          area: 'revisions',
          metadata: { ...metadata, resolution: params.size },
        })
        return {
          dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
          // Detecção de saída idêntica: hash, tamanho e dimensões — nunca a URL.
          unchangedFromSource:
            persisted.outputHash === sourceImageHash && buffer.length === sourceBuffer.length,
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
    handleError(res, error, 'revise-slide')
  }
}
