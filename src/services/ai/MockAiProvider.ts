import type {
  AiProvider,
  DeckPlan,
  GeneratedImageMetadata,
  GenerateSlideRequest,
  OfficialAssetSuggestion,
  PlanDeckRequest,
  PlannedSlide,
  ReplanSlideRequest,
  ReviseSlideRequest,
  SlideResult,
} from '../../types'
import { GAUSTEC_BRAND_ID, GET_CHURCH_BRAND_ID, getBrand } from '../../config/brands'
import { recordAiCall } from '../../state/aiDiagnosticsStore'
import { renderMockAiImage } from '../rendering/mockArt'
import { sha256Hex, sha256OfDataUrl } from '../../utils/hash'
import { uid } from '../../utils/id'
import { buildMockPlan, replanSingleSlide } from './mockPlanner'

const FAILURE_RATE = 0.08

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mockImages(req: GenerateSlideRequest, source: 'generation' | 'edit', sourceHash?: string): Promise<SlideResult> {
  const startedAt = Date.now()
  const count = Math.max(1, Math.min(3, req.variations))
  const images = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      // Cada chamada produz arte DIFERENTE (seed + entropia) — nunca a mesma saída.
      const dataUrl = renderMockAiImage({ style: req.style, seed: req.seed + i * 7919 })
      const outputHash = await sha256OfDataUrl(dataUrl)
      const metadata: GeneratedImageMetadata = {
        provider: 'mock',
        model: 'mock-simulacao',
        generationId: uid('mockgen'),
        source,
        promptHash: await sha256Hex(req.slidePlan.productionPrompt || req.masterPrompt),
        sourceImageHash: sourceHash,
        outputHash,
        mimeType: 'image/png',
        width: 1920,
        height: 1080,
        quality: req.quality,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
      return { dataUrl, metadata, unchangedFromSource: sourceHash ? outputHash === sourceHash : undefined }
    }),
  )
  return { images, model: 'mock-simulacao', quality: req.quality, resolution: '1920x1080', fileSource: 'mock' }
}

/**
 * MODO SIMULAÇÃO — identificado na interface e nos metadados
 * (provider 'mock', fileSource 'mock'). Produz resultados visualmente
 * distintos a cada chamada e NUNCA se passa pela OpenAI nem esconde
 * erros do provider real (que não é tocado neste modo).
 */
export class MockAiProvider implements AiProvider {
  async planDeck(req: PlanDeckRequest): Promise<DeckPlan> {
    const startedAt = Date.now()
    await delay(900, 1800)
    const plan = buildMockPlan(req)
    const durationMs = Date.now() - startedAt
    recordAiCall({
      endpoint: 'local (heurística de simulação)',
      kind: 'mock',
      model: 'heuristica-local',
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      ok: true,
      schemaValid: true,
    })
    return {
      ...plan,
      // Fala do chat sempre transparente: heurística local NUNCA se
      // apresenta como resposta de IA.
      assistantMessage:
        plan.slides.length === 0
          ? 'Modo simulação (sem IA): não consegui montar um rascunho com o que foi descrito. Responda às perguntas abaixo ou ative a IA real.'
          : `Montei um rascunho local para “${plan.title}” — isto é o modo simulação, sem chamada de IA. Ative a IA real para uma interpretação completa do briefing e da conversa.`,
      provenance: {
        provider: 'mock',
        model: 'heuristica-local',
        durationMs,
        schemaValid: true,
        createdAt: new Date().toISOString(),
      },
    }
  }

  async replanSlide(req: ReplanSlideRequest): Promise<PlannedSlide> {
    await delay(900, 1800)
    return replanSingleSlide(req.plan, req.slideId, req.config, req.style, [], req.instructions)
  }

  async generateSlide(req: GenerateSlideRequest): Promise<SlideResult> {
    await delay(1200, 2600)
    if (Math.random() < FAILURE_RATE) {
      throw new Error('[Simulação] Falha transitória simulada. Tente novamente.')
    }
    return mockImages(req, 'generation')
  }

  async reviseSlide(req: ReviseSlideRequest): Promise<SlideResult> {
    await delay(1100, 2200)
    if (Math.random() < FAILURE_RATE * 0.6) {
      throw new Error('[Simulação] Falha transitória simulada na revisão. Tente novamente.')
    }
    const sourceHash = req.sourceImageHash ?? (req.previousImage.dataUrl ? await sha256OfDataUrl(req.previousImage.dataUrl) : undefined)
    return mockImages(req, 'edit', sourceHash)
  }

  async searchOfficialAssets(brief: string, brands: string[]): Promise<OfficialAssetSuggestion[]> {
    await delay(800, 1600)
    const text = `${brief} ${brands.join(' ')}`.toLowerCase()
    const suggestions: OfficialAssetSuggestion[] = []
    // O mock só sugere ativos que realmente possui (nunca inventa logos).
    if (/gaustec/.test(text)) {
      const brand = getBrand(GAUSTEC_BRAND_ID)!
      suggestions.push({
        id: uid('asset'),
        brandName: 'Gaustec',
        imageUrl: brand.logoAsset,
        sourceDomain: 'registro interno do Slide Hub (simulação)',
        sourceUrl: 'about:internal-brand-registry',
        note: 'Ativo oficial já registrado no sistema.',
      })
    }
    if (/get\s?church/.test(text)) {
      const brand = getBrand(GET_CHURCH_BRAND_ID)!
      suggestions.push({
        id: uid('asset'),
        brandName: 'Get Church',
        imageUrl: brand.logoAsset,
        sourceDomain: 'registro interno do Slide Hub (simulação)',
        sourceUrl: 'about:internal-brand-registry',
        note: 'Ativo oficial já registrado no sistema.',
      })
    }
    return suggestions
  }
}
