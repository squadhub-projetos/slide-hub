import { useCallback, useEffect } from 'react'
import { AI_MODE, getAiProvider } from '../services/ai'
import { parseRevisionMods, renderSlideSvg } from '../services/ai/slideArtwork'
import { toAttachmentsForAi } from '../services/attachments/attachmentService'
import { renderMockAiImage } from '../services/rendering/mockArt'
import { composeAiVisualWithText } from '../services/rendering/overlayText'
import { renderTemplate } from '../services/rendering/templateRenderer'
import { recommendTemplate } from '../config/defaultTemplates'
import {
  buildDeckVisualBible,
  compileCreativeBrief,
  selectReferences,
} from '../services/ai/creativePromptCompiler'
import { useAiStatusStore } from '../state/aiStatusStore'
import { useAiTestConfigStore } from '../state/aiTestConfigStore'
import { useAttachmentStore } from '../state/attachmentStore'
import { useLibraryStore } from '../state/libraryStore'
import { useProjectStore } from '../state/projectStore'
import { useSnippetStore } from '../state/snippetStore'
import { useStyleStore } from '../state/styleStore'
import { useTemplateStore } from '../state/templateStore'
import { useUiStore } from '../state/uiStore'
import { blobStore, blobToDataUrl } from '../services/storage/blobStore'
import type {
  AttachmentForAi,
  DesignStyle,
  GeneratedImageMetadata,
  GenerateSlideRequest,
  GenerationStage,
  RenderStrategy,
  RevisionIntensity,
  Slide,
  SlideResult,
  SlideTemplate,
  SlideVersion,
} from '../types'
import { sha256OfDataUrl } from '../utils/hash'
import { uid } from '../utils/id'
import { hashString } from '../utils/random'

/**
 * Pipeline de geração com três estratégias explícitas:
 *  - 'ai-generated'    → chamada REAL ao modelo de imagem (ou simulação rotulada)
 *  - 'template-guided' → híbrido: regiões de IA reais + camadas determinísticas
 *  - 'structured'      → renderer estruturado, sem modelo de imagem
 * Sem fallback silencioso: no modo real, erros do provider aparecem como erros.
 */

interface StrategyContext {
  slide: Slide
  strategy: RenderStrategy
  style: DesignStyle
  template: SlideTemplate | null
  variations: number
}

function stage(slideId: string, s: GenerationStage) {
  useAiStatusStore.getState().setStage(slideId, s)
}

function resolveStrategy(slide: Slide): RenderStrategy {
  // PRECEDÊNCIA: a escolha EXPLÍCITA do usuário no slide vence sempre —
  // era o bug do "Regenerar com esta configuração": o seletor global de
  // testes sobrepunha a estratégia recém-escolhida no slide.
  if (slide.plan.renderStrategy) return slide.plan.renderStrategy
  const visual = useAiTestConfigStore.getState().config.visualStrategy
  if (visual === 'ai-creative') return 'ai-generated'
  if (visual === 'none') return 'structured'
  if (visual === 'template-assets' || visual === 'hybrid') return 'template-guided'
  const project = useProjectStore.getState().project
  return project?.plannerConfig.defaultStrategy ?? 'ai-generated'
}

/** Sinaliza (sem carregar blobs) se o slide tem foto/ativo real a aplicar. */
function hasPlacementAssets(slide: Slide): boolean {
  const project = useProjectStore.getState().project
  if (!project) return false
  return useAttachmentStore.getState().byOwner(project.id).some((a) => {
    if (a.role === 'do-not-use' || a.role === 'logo' || a.referenceOnly) return false
    if (!PLACEABLE_ROLES.has(a.role)) return false
    if (a.processing !== 'ready' || !a.mimeType.startsWith('image/')) return false
    if (a.scope === 'planning-only' || a.scope === 'visual-reference-only') return false
    if (a.scope === 'selected-slides') return a.linkedSlideIds.includes(slide.id) || slide.plan.attachmentIds.includes(a.id)
    return true
  })
}

function resolveTemplate(slide: Slide, style: DesignStyle): SlideTemplate | null {
  const templates = useTemplateStore.getState().all()
  if (slide.plan.templateId === null) return null
  if (slide.plan.templateId && slide.plan.templateId !== 'auto') {
    return useTemplateStore.getState().getById(slide.plan.templateId)
  }
  // Slide com foto anexada prioriza template capaz de recebê-la; slide
  // sem imagem evita template com slot — nada de área vazia como "pronto".
  return recommendTemplate(
    templates,
    style.id,
    slide.plan.layout,
    hasPlacementAssets(slide) ? 'with' : 'without',
  )
}

async function collectAttachments(slide: Slide): Promise<AttachmentForAi[]> {
  const project = useProjectStore.getState().project
  if (!project) return []
  const owned = useAttachmentStore.getState().byOwner(project.id)
  const relevant = owned.filter((a) => {
    if (a.role === 'do-not-use') return false
    if (a.scope === 'planning-only') return false
    if (a.scope === 'selected-slides') return a.linkedSlideIds.includes(slide.id) || slide.plan.attachmentIds.includes(a.id)
    return true
  })
  const attachments = await toAttachmentsForAi(relevant)
  const resolved = await resolveLibraryAssetsFromText(slide, project.id, project.styleId)
  return [...attachments, ...resolved]
}

/**
 * Resolução de ativos da biblioteca citados no prompt/conteúdo do slide
 * ("coloque o logo do n8n", "asset:n8n"), na prioridade documentada.
 * Nunca gera novamente um logo que já existe na biblioteca.
 */
async function resolveLibraryAssetsFromText(
  slide: Slide,
  projectKey: string,
  styleId: string | null,
): Promise<AttachmentForAi[]> {
  const library = useLibraryStore.getState()
  const style = useStyleStore.getState().getById(styleId)
  const text = `${slide.plan.productionPrompt} ${slide.plan.content.join(' ')} ${slide.plan.visualDirection}`
  const results: AttachmentForAi[] = []
  const seen = new Set<string>()
  const candidates = new Set<string>()
  for (const match of text.matchAll(/asset:([\w à-ú-]{2,40})/gi)) candidates.add(match[1].trim())
  for (const asset of library.assets.filter((a) => !a.archived)) {
    for (const alias of [asset.name, ...asset.aliases]) {
      if (alias.length >= 3 && text.toLowerCase().includes(alias.toLowerCase())) candidates.add(alias)
    }
  }
  for (const query of candidates) {
    const resolution = library.resolveByAlias(query, {
      projectKey,
      brandId: style?.brandId,
      slideAssetIds: slide.plan.attachmentIds,
    })
    if (!resolution || seen.has(resolution.asset.id)) continue
    seen.add(resolution.asset.id)
    const blob = resolution.asset.localBlobKey ? await blobStore.get(resolution.asset.localBlobKey) : null
    const imageDataUrl = blob ? await blobToDataUrl(blob) : undefined
    results.push({
      id: resolution.asset.id,
      name: resolution.asset.name,
      mimeType: resolution.asset.mimeType,
      role: resolution.asset.type === 'logo' ? 'logo' : 'visual-reference',
      description: resolution.asset.description,
      usage: `Resolvido por alias "${resolution.matchedAlias}" (${resolution.origin})`,
      mustAppearExactly: resolution.asset.exactUsage,
      referenceOnly: false,
      allowCrop: resolution.asset.allowCrop,
      imageDataUrl,
    })
    useUiStore.getState().toast('info', 'Ativo resolvido por alias', `“${resolution.asset.name}” (${resolution.matchedAlias}) será usado neste slide.`)
  }
  return results
}

async function buildRequest(slide: Slide, strategy: RenderStrategy, style: DesignStyle, variations: number): Promise<GenerateSlideRequest | null> {
  const project = useProjectStore.getState().project
  if (!project) return null
  const index = project.slides.findIndex((s) => s.id === slide.id)
  stage(slide.id, 'resolving-assets')
  const attachments = await collectAttachments(slide)
  return {
    projectTitle: project.name,
    projectKey: project.id,
    slideKey: slide.id,
    masterPrompt: project.prompt,
    slidePlan: slide.plan,
    index,
    total: project.slides.length,
    style,
    seed: hashString(slide.id) + slide.versions.length * 7919,
    variations,
    quality: project.plannerConfig.imageQuality,
    attachments,
    strategy,
  }
}

function templateRenderCtx(slide: Slide, style: DesignStyle, template: SlideTemplate) {
  const project = useProjectStore.getState().project!
  const index = project.slides.findIndex((s) => s.id === slide.id)
  const snippetStore = useSnippetStore.getState()
  const snippetIds = [...(template.snippetIds ?? []), ...(slide.plan.snippetIds ?? [])]
  const snippets = snippetIds.map((id) => snippetStore.getById(id)).filter((s) => s !== null)
  return {
    template,
    style,
    plan: slide.plan,
    snippets,
    projectName: project.name,
    slideNumber: index + 1,
    totalSlides: project.slides.length,
    nextSlideTitle: project.slides[index + 1]?.plan.title,
  }
}

async function rendererMetadata(
  dataUrl: string,
  model: string,
  startedAt: number,
  source: 'generation' | 'edit',
  sourceHash?: string,
): Promise<GeneratedImageMetadata> {
  return {
    provider: 'renderer',
    model,
    generationId: uid('render'),
    source,
    promptHash: '',
    sourceImageHash: sourceHash,
    outputHash: await sha256OfDataUrl(dataUrl),
    mimeType: 'image/png',
    width: 1920,
    height: 1080,
    quality: 'deterministic',
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
}

function pushVersions(
  slideId: string,
  groupId: string,
  images: { dataUrl?: string; svg?: string; raw?: string; metadata?: GeneratedImageMetadata; unchangedFromSource?: boolean }[],
  base: {
    label: string
    prompt: string
    negativePrompt: string
    styleId: string
    model: string
    quality: string
    resolution: string
    attachmentIds: string[]
    maskUsed: boolean
    origin: SlideVersion['origin']
    strategy: RenderStrategy
    fileSource: SlideResult['fileSource']
    templateId?: string | null
    snippetIds?: string[]
    revisionNote?: string
    creative?: SlideVersion['creative']
  },
  startCount: number,
) {
  images.forEach((image, i) => {
    const version: SlideVersion = {
      id: uid('ver'),
      label: `${base.label} ${startCount + i + 1}`,
      svg: image.svg,
      imageDataUrl: image.dataUrl,
      rawImageDataUrl: image.raw,
      groupId,
      variationIndex: i + 1,
      prompt: base.prompt,
      negativePrompt: base.negativePrompt,
      styleId: base.styleId,
      model: base.model,
      quality: base.quality,
      resolution: base.resolution,
      attachmentIds: base.attachmentIds,
      maskUsed: base.maskUsed,
      origin: base.origin,
      strategy: base.strategy,
      fileSource: base.fileSource,
      templateId: base.templateId,
      snippetIds: base.snippetIds,
      generation: image.metadata,
      unchangedFromSource: image.unchangedFromSource,
      revisionNote: base.revisionNote,
      creative: base.creative,
      createdAt: new Date().toISOString(),
    }
    useProjectStore.getState().pushVersion(slideId, version)
  })
}

/**
 * Regiões de IA de um template — SOMENTE camadas 'ai-region'.
 * 'image-placeholder' NÃO é região de IA: é o lugar de uma imagem REAL
 * (foto anexada, ativo da biblioteca). Tratá-lo como região era a causa
 * de chamadas de imagem desnecessárias e de fotos anexadas substituídas
 * por arte genérica.
 */
function aiRegionsOf(template: SlideTemplate | null) {
  if (!template) return []
  return template.layers.filter((l) => l.visible && l.type === 'ai-region')
}

function imagePlaceholdersOf(template: SlideTemplate | null) {
  if (!template) return []
  return template.layers.filter((l) => l.visible && l.type === 'image-placeholder')
}

/**
 * Regiões de IA de CONTEÚDO (não full-bleed): quando existe um ativo real
 * (foto anexada), ele ocupa a região em vez de gerar uma imagem — a foto
 * do usuário nunca é substituída por arte genérica. Fundos full-bleed
 * continuam sendo território de geração/decoração.
 */
function contentRegionsOf(template: SlideTemplate | null) {
  if (!template) return []
  return template.layers.filter(
    (l) => l.visible && l.type === 'ai-region' && !(l.width >= 0.95 && l.height >= 0.95),
  )
}

const PLACEABLE_ROLES = new Set(['photo', 'person', 'product', 'chart', 'diagram', 'screenshot', 'required-content', 'visual-reference'])

interface PlacementBindings {
  /** layerId → dataURL do arquivo REAL do anexo. */
  regionImages: Record<string, string>
  /** layerId → modo de encaixe (retratos nunca são cortados por padrão). */
  regionFits: Record<string, 'cover' | 'contain'>
  boundAssetIds: string[]
  /** Nomes de ativos obrigatórios que NÃO couberam em nenhum placeholder. */
  unplacedRequired: string[]
}

/**
 * Vincula anexos de imagem aos image-placeholders do template — a foto
 * anexada vira camada REAL da composição, nunca recriada pela IA.
 */
async function collectPlacementBindings(slide: Slide, template: SlideTemplate | null): Promise<PlacementBindings> {
  const empty: PlacementBindings = { regionImages: {}, regionFits: {}, boundAssetIds: [], unplacedRequired: [] }
  const project = useProjectStore.getState().project
  if (!project || !template) return empty
  // Alvos de imagem real: placeholders primeiro, depois regiões de conteúdo.
  const placeholders = [...imagePlaceholdersOf(template), ...contentRegionsOf(template)]
  const owned = useAttachmentStore.getState().byOwner(project.id)
  const eligible = owned.filter((a) => {
    if (a.role === 'do-not-use' || a.role === 'logo' || a.referenceOnly) return false
    if (!PLACEABLE_ROLES.has(a.role)) return false
    if (a.processing !== 'ready' || !a.mimeType.startsWith('image/')) return false
    if (a.scope === 'planning-only' || a.scope === 'visual-reference-only') return false
    if (a.scope === 'selected-slides') return a.linkedSlideIds.includes(slide.id) || slide.plan.attachmentIds.includes(a.id)
    return true
  })
  if (eligible.length === 0) return empty

  // Prioridade: vinculado a este slide > obrigatório > pessoa/foto > demais.
  const score = (a: (typeof eligible)[number]) =>
    (a.linkedSlideIds.includes(slide.id) || slide.plan.attachmentIds.includes(a.id) ? 8 : 0) +
    (a.required || a.mustAppearExactly ? 4 : 0) +
    (a.role === 'person' || a.role === 'photo' ? 2 : 0)
  const ordered = [...eligible].sort((a, b) => score(b) - score(a))

  const result: PlacementBindings = { regionImages: {}, regionFits: {}, boundAssetIds: [], unplacedRequired: [] }
  for (let i = 0; i < placeholders.length && i < ordered.length; i++) {
    const asset = ordered[i]
    const blob = await blobStore.get(asset.storageKey)
    if (!blob) continue
    const layer = placeholders[i]
    result.regionImages[layer.id] = await blobToDataUrl(blob)
    result.regionFits[layer.id] =
      (asset.role === 'person' || asset.role === 'photo') && !asset.allowCrop
        ? 'contain'
        : asset.role === 'person' || asset.role === 'photo'
          ? 'contain'
          : 'cover'
    result.boundAssetIds.push(asset.id)
  }
  for (const asset of ordered) {
    const isRequired = asset.required || asset.mustAppearExactly
    const isForThisSlide = asset.linkedSlideIds.includes(slide.id) || slide.plan.attachmentIds.includes(asset.id)
    if (isRequired && isForThisSlide && !result.boundAssetIds.includes(asset.id)) {
      result.unplacedRequired.push(asset.name || asset.fileName)
    }
  }
  return result
}

/** Ativo obrigatório sem lugar no slide NUNCA é omitido em silêncio. */
function warnUnplacedRequired(unplaced: string[]) {
  if (unplaced.length === 0) return
  useUiStore.getState().toast(
    'error',
    'Ativo obrigatório não aplicado',
    `O slide foi gerado, mas ${unplaced.join(', ')} não coube em nenhum espaço de imagem do template. Troque o template do slide ou ajuste o anexo.`,
  )
}

async function runGeneration(ctx: StrategyContext): Promise<void> {
  const { slide, strategy, style, template } = ctx
  const project = useProjectStore.getState().project!
  const startedAt = Date.now()
  const groupId = slide.activeGroupId!
  const baseInfo = {
    prompt: slide.plan.productionPrompt || project.prompt,
    negativePrompt: slide.plan.negativePrompt,
    styleId: style.id,
    attachmentIds: [],
    maskUsed: false,
    origin: 'generation' as const,
    strategy,
    templateId: template?.id ?? null,
    snippetIds: slide.plan.snippetIds ?? [],
    label: 'Versão',
  }

  if (strategy === 'ai-generated') {
    stage(slide.id, 'building-prompt')
    const request = await buildRequest(slide, strategy, style, ctx.variations)
    if (!request) return
    // CRIATIVO POR IA: o template é REFERÊNCIA de linguagem visual, não
    // molde. O compilador (local, instantâneo) monta o prompt rico com
    // arquétipo anti-repetição, bíblia visual do deck e ≤3 referências.
    const index = project.slides.findIndex((s) => s.id === slide.id)
    const previous = project.slides[index - 1]
    const previousArchetype =
      previous?.versions.find((v) => v.id === previous.currentVersionId)?.creative?.compositionArchetype ?? null
    const testCfg = useAiTestConfigStore.getState().config
    const brief = compileCreativeBrief({
      plan: slide.plan,
      slideId: slide.id,
      index,
      total: project.slides.length,
      deckBible: buildDeckVisualBible(style, project.plannerConfig, project.name),
      previousArchetype,
      adjacentTitles: {
        previous: previous?.plan.title,
        next: project.slides[index + 1]?.plan.title,
      },
      references: selectReferences(useTemplateStore.getState().all(), style, slide.plan),
      influence: testCfg.referenceInfluence,
      attachments: request.attachments,
      brandNegativePrompt: style.textRules.negativePrompt,
    })
    const creativeMeta = {
      compositionArchetype: brief.compositionArchetype,
      referenceIds: brief.referenceIds,
      referenceInfluence: brief.referenceInfluence,
      promptChars: brief.prompt.length,
      overlaySpec: brief.overlaySpec,
    }
    stage(slide.id, 'calling-ai')
    const result = await getAiProvider().generateSlide({
      ...request,
      slidePlan: { ...slide.plan, productionPrompt: brief.prompt, negativePrompt: brief.negativePrompt },
    })
    stage(slide.id, 'receiving')
    const composeText = project.plannerConfig.aiComposition !== 'full'
    stage(slide.id, 'compositing')
    const images = await Promise.all(
      result.images.map(async (image) => {
        if (!image.dataUrl) return { ...image, raw: undefined }
        if (!composeText) return { dataUrl: image.dataUrl, raw: image.dataUrl, metadata: image.metadata }
        const composed = await composeAiVisualWithText({
          aiImageDataUrl: image.dataUrl,
          plan: slide.plan,
          style,
          projectName: project.name,
          slideNumber: request.index + 1,
          totalSlides: request.total,
          overlaySpec: brief.overlaySpec,
        })
        return { dataUrl: composed, raw: image.dataUrl, metadata: image.metadata }
      }),
    )
    stage(slide.id, 'storing')
    pushVersions(slide.id, groupId, images, {
      ...baseInfo,
      prompt: brief.prompt,
      negativePrompt: brief.negativePrompt,
      creative: creativeMeta,
      attachmentIds: request.attachments.map((a) => a.id),
      model: result.model,
      quality: result.quality,
      resolution: result.resolution,
      fileSource: result.fileSource,
    }, slide.versions.length)
    return
  }

  if (strategy === 'template-guided' && template) {
    // Foto/ativos anexados entram DIRETO nos placeholders e nas regiões
    // de conteúdo — arquivo real na composição, zero chamadas de imagem.
    stage(slide.id, 'resolving-assets')
    const placements = await collectPlacementBindings(slide, template)
    // Só restam para geração as regiões que NÃO receberam um ativo real.
    const regions = aiRegionsOf(template).filter((r) => !placements.regionImages[r.id])
    const testCfg = useAiTestConfigStore.getState().config
    // Regiões de IA só são geradas quando agregam valor: nunca no modo
    // "Template e ativos"; no híbrido/auto, pular quando "somente quando
    // necessário" está ativo e o slide já tem imagem real vinculada.
    const shouldGenerateRegions =
      regions.length > 0 &&
      testCfg.visualStrategy !== 'template-assets' &&
      !(testCfg.generateImagesOnlyWhenNeeded && placements.boundAssetIds.length > 0)

    let regionResults: string[][] = []
    let fileSource: SlideResult['fileSource'] = 'renderer'
    let model = 'template-renderer'
    let variations = ctx.variations

    if (shouldGenerateRegions) {
      const request = await buildRequest(slide, strategy, style, ctx.variations)
      if (!request) return
      const region = regions[0]
      const regionPrompt = [
        `Gere APENAS o elemento visual para a região "${region.name}" de um slide (sem textos, sem logos).`,
        region.generationBehavior?.localPrompt ?? '',
        `Contexto do slide: ${slide.plan.title} — ${slide.plan.keyMessage || slide.plan.objective}.`,
        `Estilo: ${style.aiInstructions}`,
      ].filter(Boolean).join('\n')

      if (AI_MODE === 'real') {
        stage(slide.id, 'building-prompt')
        stage(slide.id, 'calling-ai')
        const result = await getAiProvider().generateSlide({
          ...request,
          // Referências visuais NÃO incluem os ativos já compostos como
          // camada real — evita a IA "recriar" a foto no fundo.
          attachments: request.attachments.filter((a) => !placements.boundAssetIds.includes(a.id)),
          slidePlan: { ...slide.plan, productionPrompt: regionPrompt, negativePrompt: region.generationBehavior?.localNegativePrompt ?? slide.plan.negativePrompt },
        })
        stage(slide.id, 'receiving')
        regionResults = result.images.filter((i) => i.dataUrl).map((i) => [i.dataUrl!])
        fileSource = result.fileSource
        model = `${result.model} + template-renderer`
        variations = regionResults.length
      } else {
        // Simulação: arte rotulada, distinta por variação
        regionResults = Array.from({ length: ctx.variations }, (_, i) => [
          renderMockAiImage({ style, seed: hashString(slide.id) + i * 977 }),
        ])
        fileSource = 'mock'
        model = 'mock-simulacao + template-renderer'
      }
    } else {
      variations = 1 // renderer determinístico: sem variações artificiais
    }

    stage(slide.id, 'compositing')
    const renderCtx = templateRenderCtx(slide, style, template)
    const images = await Promise.all(
      Array.from({ length: Math.max(1, variations) }, async (_, i) => {
        const regionImages: Record<string, string> = { ...placements.regionImages }
        const regionSet = regionResults[i] ?? regionResults[0]
        if (regionSet) regions.forEach((r, ri) => { if (regionSet[ri] ?? regionSet[0]) regionImages[r.id] = regionSet[ri] ?? regionSet[0] })
        const dataUrl = await renderTemplate({ ...renderCtx, regionImages, regionFits: placements.regionFits, variantSeed: slide.versions.length + i })
        return { dataUrl, metadata: await rendererMetadata(dataUrl, model, startedAt, 'generation') }
      }),
    )
    stage(slide.id, 'storing')
    if (variations !== ctx.variations) {
      useProjectStore.getState().patchSlide(slide.id, { requestedVariations: Math.max(1, variations) })
    }
    pushVersions(slide.id, groupId, images, {
      ...baseInfo,
      attachmentIds: placements.boundAssetIds,
      model,
      quality: project.plannerConfig.imageQuality,
      resolution: '1920x1080',
      fileSource,
    }, slide.versions.length)
    warnUnplacedRequired(placements.unplacedRequired)
    return
  }

  // 'structured' (ou template-guided sem template): renderer estruturado
  stage(slide.id, 'compositing')
  useProjectStore.getState().patchSlide(slide.id, { requestedVariations: 1 })
  if (template) {
    // Mesmo sem geração de imagem, os ativos reais entram na composição.
    const placements = await collectPlacementBindings(slide, template)
    const dataUrl = await renderTemplate({
      ...templateRenderCtx(slide, style, template),
      regionImages: placements.regionImages,
      regionFits: placements.regionFits,
      variantSeed: slide.versions.length,
    })
    pushVersions(slide.id, groupId, [{ dataUrl, metadata: await rendererMetadata(dataUrl, 'structured-renderer', startedAt, 'generation') }], {
      ...baseInfo,
      attachmentIds: placements.boundAssetIds,
      strategy: 'structured',
      model: 'structured-renderer',
      quality: 'deterministic',
      resolution: '1920x1080',
      fileSource: 'renderer',
    }, slide.versions.length)
    warnUnplacedRequired(placements.unplacedRequired)
  } else {
    const index = project.slides.findIndex((s) => s.id === slide.id)
    const svg = renderSlideSvg({
      plan: slide.plan,
      style,
      projectTitle: project.name,
      index,
      total: project.slides.length,
      seed: hashString(slide.id) + slide.versions.length * 7919,
    })
    pushVersions(slide.id, groupId, [{ svg }], {
      ...baseInfo,
      strategy: 'structured',
      model: 'structured-renderer',
      quality: 'deterministic',
      resolution: '1600x900',
      fileSource: 'renderer',
    }, slide.versions.length)
  }
}

export interface ReviseOptions {
  maskDataUrl?: string
  editScope?: 'masked-area' | 'full-slide'
  variations?: number
  extraAttachments?: AttachmentForAi[]
  intensity?: RevisionIntensity
}

export function useSlideGeneration() {
  const project = useProjectStore((s) => s.project)
  const currentSlide = project?.slides[project.currentSlideIndex] ?? null
  const shouldGenerate =
    project?.phase === 'working' && currentSlide !== null && currentSlide.status === 'pending'

  const generate = useCallback(async (slideId: string, variationsOverride?: number) => {
    const store = useProjectStore.getState()
    const slide = store.project?.slides.find((s) => s.id === slideId)
    if (!slide || !store.project) return
    const style = useStyleStore.getState().getById(store.project.styleId) ?? useStyleStore.getState().getDefault()
    if (!style) return
    const strategy = resolveStrategy(slide)
    const variations = Math.max(1, Math.min(3, variationsOverride ?? store.project.plannerConfig.variationsPerSlide))
    const groupId = uid('round')
    if (!store.beginRound(slideId, groupId, variations)) return
    stage(slideId, 'preparing')
    try {
      stage(slideId, 'resolving-template')
      const template = strategy === 'ai-generated' ? null : resolveTemplate(slide, style)
      const fresh = useProjectStore.getState().project!.slides.find((s) => s.id === slideId)!
      await runGeneration({ slide: fresh, strategy, style, template, variations })
      stage(slideId, 'finalizing')
      useProjectStore.getState().finishRound(slideId, slide.versions.length > 0 ? 'revised' : 'awaiting')
    } catch (error) {
      useProjectStore.getState().failRound(
        slideId,
        error instanceof Error ? error.message : 'Falha inesperada na geração.',
      )
    } finally {
      useAiStatusStore.getState().clearStage(slideId)
    }
  }, [])

  const revise = useCallback(
    async (slideId: string, instructions: string, options: ReviseOptions = {}): Promise<boolean> => {
      const store = useProjectStore.getState()
      const slide = store.project?.slides.find((s) => s.id === slideId)
      const current = slide?.versions.find((v) => v.id === slide.currentVersionId)
      if (!slide || !current || !store.project) return false
      const style = useStyleStore.getState().getById(store.project.styleId) ?? useStyleStore.getState().getDefault()
      if (!style) return false
      const project = store.project
      const strategy = current.strategy ?? resolveStrategy(slide)
      const previousStatus = slide.status
      const variations = Math.max(1, Math.min(3, options.variations ?? 1))
      const intensity = options.intensity ?? 'moderate'
      const groupId = uid('round')
      if (!store.beginRound(slideId, groupId, variations)) return false
      const startedAt = Date.now()
      stage(slideId, 'preparing')

      try {
        const request = await buildRequest(slide, strategy, style, variations)
        if (!request) throw new Error('Projeto indisponível.')
        const template = current.templateId ? useTemplateStore.getState().getById(current.templateId) : resolveTemplate(slide, style)
        const attachments = [...request.attachments, ...(options.extraAttachments ?? [])]
        const baseInfo = {
          prompt: `${slide.plan.productionPrompt}\n\nRevisão: ${instructions}`,
          negativePrompt: slide.plan.negativePrompt,
          styleId: style.id,
          attachmentIds: attachments.map((a) => a.id),
          maskUsed: Boolean(options.maskDataUrl),
          origin: (options.maskDataUrl ? 'mask-edit' : 'revision') as SlideVersion['origin'],
          strategy,
          templateId: template?.id ?? null,
          snippetIds: slide.plan.snippetIds ?? [],
          label: 'Versão',
          revisionNote: instructions,
        }

        if (strategy === 'structured' || (strategy === 'template-guided' && aiRegionsOf(template).length === 0)) {
          // Determinístico: reaplica o conteúdo com modificadores da instrução
          stage(slideId, 'compositing')
          useProjectStore.getState().patchSlide(slideId, { requestedVariations: 1 })
          if (template && strategy !== 'structured') {
            const placements = await collectPlacementBindings(slide, template)
            const dataUrl = await renderTemplate({
              ...templateRenderCtx(slide, style, template),
              regionImages: placements.regionImages,
              regionFits: placements.regionFits,
              variantSeed: slide.versions.length,
            })
            pushVersions(slideId, groupId, [{ dataUrl, metadata: await rendererMetadata(dataUrl, 'template-renderer', startedAt, 'edit', current.generation?.outputHash) }], {
              ...baseInfo, model: 'template-renderer', quality: 'deterministic', resolution: '1920x1080', fileSource: 'renderer',
            }, slide.versions.length)
          } else {
            const index = project.slides.findIndex((s) => s.id === slideId)
            const svg = renderSlideSvg({
              plan: slide.plan,
              style,
              projectTitle: project.name,
              index,
              total: project.slides.length,
              seed: hashString(slide.id) + slide.versions.length * 7919,
              mods: parseRevisionMods(instructions),
            })
            pushVersions(slideId, groupId, [{ svg }], {
              ...baseInfo, model: 'structured-renderer', quality: 'deterministic', resolution: '1600x900', fileSource: 'renderer',
            }, slide.versions.length)
          }
        } else {
          // Revisão REAL por edição de imagem (ou simulação rotulada)
          const sourceImage = current.rawImageDataUrl ?? current.imageDataUrl
          if (!sourceImage) throw new Error('A versão atual não possui imagem para editar.')
          stage(slideId, 'building-prompt')
          const sourceImageHash = await sha256OfDataUrl(sourceImage)
          stage(slideId, 'calling-ai')
          const result = await getAiProvider().reviseSlide({
            ...request,
            attachments,
            instructions,
            previousImage: { dataUrl: sourceImage },
            sourceImageHash,
            maskDataUrl: options.maskDataUrl,
            editScope: options.editScope ?? 'full-slide',
            intensity,
          })
          stage(slideId, 'receiving')
          const composeText = strategy === 'ai-generated' && project.plannerConfig.aiComposition !== 'full'
          stage(slideId, 'compositing')
          const index = project.slides.findIndex((s) => s.id === slideId)
          const images = await Promise.all(
            result.images.map(async (image) => {
              if (!image.dataUrl) return image
              if (strategy === 'template-guided' && template) {
                const regions = aiRegionsOf(template)
                const placements = await collectPlacementBindings(slide, template)
                const regionImages: Record<string, string> = { ...placements.regionImages }
                // Ativos reais têm prioridade — a edição de IA só preenche
                // regiões que não estão ocupadas por um anexo.
                regions.forEach((r) => { if (!placements.regionImages[r.id]) regionImages[r.id] = image.dataUrl! })
                const composed = await renderTemplate({
                  ...templateRenderCtx(slide, style, template),
                  regionImages,
                  regionFits: placements.regionFits,
                })
                return { dataUrl: composed, raw: image.dataUrl, metadata: image.metadata, unchangedFromSource: image.unchangedFromSource }
              }
              if (!composeText) return { dataUrl: image.dataUrl, raw: image.dataUrl, metadata: image.metadata, unchangedFromSource: image.unchangedFromSource }
              const composed = await composeAiVisualWithText({
                aiImageDataUrl: image.dataUrl,
                plan: slide.plan,
                style,
                projectName: project.name,
                slideNumber: index + 1,
                totalSlides: project.slides.length,
              })
              return { dataUrl: composed, raw: image.dataUrl, metadata: image.metadata, unchangedFromSource: image.unchangedFromSource }
            }),
          )
          stage(slideId, 'storing')
          pushVersions(slideId, groupId, images, {
            ...baseInfo,
            model: result.model,
            quality: result.quality,
            resolution: result.resolution,
            fileSource: result.fileSource,
          }, slide.versions.length)

          if (images.every((i) => i.unchangedFromSource)) {
            useUiStore.getState().toast(
              'info',
              'Sem alteração visual detectável',
              'A edição retornou uma imagem idêntica (hash igual). Reforce a instrução, mude a intensidade ou edite o slide inteiro.',
            )
          }
        }

        stage(slideId, 'finalizing')
        useProjectStore.getState().finishRound(slideId, 'revised')
        useProjectStore.getState().incrementRevisions()
        return true
      } catch (error) {
        useProjectStore.getState().patchSlide(slideId, {
          status: previousStatus,
          activeGroupId: current.groupId,
          requestedVariations: slide.requestedVariations,
        })
        useUiStore.getState().toast(
          'error',
          'Revisão não aplicada',
          error instanceof Error ? error.message : 'Tente novamente.',
        )
        return false
      } finally {
        useAiStatusStore.getState().clearStage(slideId)
      }
    },
    [],
  )

  useEffect(() => {
    if (shouldGenerate && currentSlide) void generate(currentSlide.id)
  }, [shouldGenerate, currentSlide, generate])

  return { generate, revise }
}
