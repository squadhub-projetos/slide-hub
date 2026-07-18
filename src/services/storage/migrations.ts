import {
  defaultComposition,
  defaultGradient,
  defaultIcons,
  defaultImagery,
  defaultLogoRules,
  defaultTextRules,
  defaultTexture,
  defaultTypography,
} from '../../config/defaultStyles'
import type {
  DeckPlan,
  DeckProject,
  DesignStyle,
  MeetingType,
  PlannedSlide,
  PlannerConfig,
  Slide,
  SlideVersion,
} from '../../types'
import { uid } from '../../utils/id'
import { projectRepository, schemaRepository, styleRepository, SCHEMA_VERSION } from './repositories'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Os dados v1 chegam sem tipo — este módulo é a fronteira de validação.
type Legacy = Record<string, any>

function isRecord(value: unknown): value is Legacy {
  return typeof value === 'object' && value !== null
}

function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return 0
  const n = parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function inferMeetingType(objective: string): MeetingType {
  const text = (objective || '').toLowerCase()
  if (/proposta|vender|investimento|fechamento/.test(text)) return 'proposal'
  if (/kickoff|escopo|expectativa/.test(text)) return 'kickoff'
  if (/cultura|time|reconhecer|informar/.test(text)) return 'townhall'
  return 'checkpoint'
}

function migrateConfig(old: Legacy): PlannerConfig {
  const objective = typeof old?.objective === 'string' ? old.objective : ''
  const audience = typeof old?.audience === 'string' ? old.audience : ''
  const internal = /interno|time/.test(audience.toLowerCase())
  return {
    meetingType: inferMeetingType(objective),
    audienceScope: internal ? 'internal' : 'external',
    audienceSegment: internal ? 'Geral' : /lideran|diretor/i.test(audience) ? 'Liderança Executiva' : 'Gestão Operacional',
    objective: 'custom',
    customObjective: objective || 'Apresentar o conteúdo com clareza',
    slideCount: typeof old?.slideCount === 'number' ? old.slideCount : 6,
    tone: typeof old?.tone === 'string' ? old.tone : 'Confiante',
    language: old?.language === 'en-US' ? 'en-US' : 'pt-BR',
    aspect: '16:9',
    styleId: typeof old?.styleId === 'string' ? old.styleId : null,
    variationsPerSlide: 1,
    imageQuality: 'high',
    webAssetPolicy: 'attachments-only',
    defaultStrategy: 'template-guided',
    aiComposition: 'overlay',
  }
}

const VALID_LAYOUTS = new Set([
  'cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta',
])
const VALID_STATUSES = new Set([
  'pending', 'generating', 'awaiting', 'revised', 'approvedManual', 'approvedAuto', 'error',
])

function migratePlannedSlide(old: Legacy, index: number): PlannedSlide {
  const content = Array.isArray(old?.content) ? old.content.filter((c: unknown) => typeof c === 'string') : []
  return {
    id: typeof old?.id === 'string' ? old.id : uid('ps'),
    order: index + 1,
    title: typeof old?.title === 'string' ? old.title : `Slide ${index + 1}`,
    subtitle: typeof old?.subtitle === 'string' ? old.subtitle : '',
    objective: typeof old?.objective === 'string' ? old.objective : '',
    keyMessage: typeof old?.keyMessage === 'string' ? old.keyMessage : (content[0] ?? ''),
    content,
    evidence: Array.isArray(old?.evidence) ? old.evidence : [],
    speakerIntent: typeof old?.speakerIntent === 'string' ? old.speakerIntent : (old?.objective ?? ''),
    layout: (VALID_LAYOUTS.has(String(old?.layout)) ? old.layout : 'textImage') as PlannedSlide['layout'],
    visualDirection: typeof old?.visualDirection === 'string' ? old.visualDirection : '',
    brandInstructions: typeof old?.brandInstructions === 'string' ? old.brandInstructions : '',
    attachmentIds: Array.isArray(old?.attachmentIds) ? old.attachmentIds : [],
    productionPrompt: typeof old?.productionPrompt === 'string' ? old.productionPrompt : '',
    negativePrompt: typeof old?.negativePrompt === 'string' ? old.negativePrompt : '',
    editedManually: old?.editedManually === true,
  }
}

function migratePlan(old: Legacy | null, config: PlannerConfig): DeckPlan | null {
  if (!isRecord(old)) return null
  if (isRecord(old.insights) && typeof old.masterPrompt === 'string') return old as unknown as DeckPlan
  const narrative = typeof old.narrative === 'string' ? old.narrative : ''
  const slides = Array.isArray(old.slides) ? old.slides.map(migratePlannedSlide) : []
  return {
    title: typeof old.title === 'string' ? old.title : 'Apresentação',
    subtitle: '',
    meetingType: config.meetingType,
    audienceScope: config.audienceScope,
    audienceSegment: config.audienceSegment,
    objective: config.customObjective,
    executiveSummary: narrative,
    centralMessage: typeof old.title === 'string' ? old.title : '',
    narrativeLogic: narrative,
    insights: {
      understanding: 'Plano migrado da versão anterior do Slide Hub.',
      centralMessage: typeof old.title === 'string' ? old.title : '',
      keyInsights: [],
      decisionsToProvoke: [],
      inferred: [],
      assumptions: ['Estrutura preservada exatamente como planejada na versão anterior.'],
      missingInformation: [],
      communicationRisks: [],
      narrativeSuggestion: narrative,
    },
    recommendedSlideCount: slides.length,
    attachmentsUsed: [],
    slides,
    masterPrompt: typeof old.consolidatedPrompt === 'string' ? old.consolidatedPrompt : '',
  }
}

function migrateVersion(old: Legacy, project: Legacy): SlideVersion {
  if (typeof old?.groupId === 'string' && typeof old?.model === 'string') return old as unknown as SlideVersion
  const id = typeof old?.id === 'string' ? old.id : uid('ver')
  return {
    id,
    label: typeof old?.label === 'string' ? old.label : 'Versão',
    svg: typeof old?.svg === 'string' ? old.svg : undefined,
    groupId: id,
    variationIndex: 1,
    prompt: typeof project?.prompt === 'string' ? project.prompt : '',
    negativePrompt: '',
    styleId: typeof project?.styleId === 'string' ? project.styleId : null,
    model: 'mock-svg-v1',
    quality: 'high',
    resolution: '1600x900',
    attachmentIds: [],
    maskUsed: false,
    origin: 'migrated',
    revisionNote: typeof old?.revisionNote === 'string' ? old.revisionNote : undefined,
    createdAt: typeof old?.createdAt === 'string' ? old.createdAt : new Date().toISOString(),
  }
}

function migrateSlide(old: Legacy, index: number, project: Legacy): Slide {
  const versions = Array.isArray(old?.versions) ? old.versions.map((v: Legacy) => migrateVersion(v, project)) : []
  return {
    id: typeof old?.id === 'string' ? old.id : uid('slide'),
    plan: migratePlannedSlide(old?.plan ?? {}, index),
    status: (VALID_STATUSES.has(String(old?.status)) ? old.status : 'pending') as Slide['status'],
    versions,
    currentVersionId: typeof old?.currentVersionId === 'string' ? old.currentVersionId : (versions.at(-1)?.id ?? null),
    activeGroupId: versions.at(-1)?.groupId ?? null,
    requestedVariations: 1,
    error: typeof old?.error === 'string' ? old.error : undefined,
  }
}

export function migrateProject(old: unknown): DeckProject | null {
  if (!isRecord(old)) return null
  // Já está no schema atual?
  if (isRecord(old.plannerConfig) && 'meetingType' in old.plannerConfig) return old as unknown as DeckProject
  try {
    const config = migrateConfig(old.plannerConfig ?? {})
    const slides = Array.isArray(old.slides) ? old.slides.map((s: Legacy, i: number) => migrateSlide(s, i, old)) : []
    return {
      id: typeof old.id === 'string' ? old.id : uid('deck'),
      name: typeof old.name === 'string' ? old.name : 'Apresentação migrada',
      fileName: typeof old.fileName === 'string' ? old.fileName : 'apresentacao',
      prompt: typeof old.prompt === 'string' ? old.prompt : '',
      slideCount: typeof old.slideCount === 'number' ? old.slideCount : slides.length,
      styleId: typeof old.styleId === 'string' ? old.styleId : null,
      aspect: '16:9',
      language: old.language === 'en-US' ? 'en-US' : 'pt-BR',
      phase: old.phase === 'working' || old.phase === 'complete' ? old.phase : 'setup',
      plan: migratePlan(old.plan ?? null, config),
      slides,
      currentSlideIndex: typeof old.currentSlideIndex === 'number' ? old.currentSlideIndex : 0,
      plannerMessages: Array.isArray(old.plannerMessages)
        ? old.plannerMessages.map((m: Legacy) => ({
            id: typeof m?.id === 'string' ? m.id : uid('msg'),
            role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            text: typeof m?.text === 'string' ? m.text : '',
            createdAt: typeof m?.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
            plan: m?.plan ? (migratePlan(m.plan, config) ?? undefined) : undefined,
          }))
        : [],
      plannerConfig: config,
      stats: isRecord(old.stats)
        ? {
            manualApprovals: old.stats.manualApprovals ?? 0,
            autoApprovals: old.stats.autoApprovals ?? 0,
            revisions: old.stats.revisions ?? 0,
            startedAt: old.stats.startedAt ?? null,
            finishedAt: old.stats.finishedAt ?? null,
          }
        : { manualApprovals: 0, autoApprovals: 0, revisions: 0, startedAt: null, finishedAt: null },
      createdAt: typeof old.createdAt === 'string' ? old.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch {
    // Dados irrecuperáveis: não quebrar o app nem apagar nada — ignora o projeto.
    return null
  }
}

export function migrateStyle(old: unknown): DesignStyle | null {
  if (!isRecord(old)) return null
  if (isRecord(old.composition) && isRecord(old.gradient)) return old as unknown as DesignStyle
  try {
    const palette = isRecord(old.palette) ? old.palette : {}
    const background = typeof palette.background === 'string' ? palette.background : '#0b1120'
    const densityMap: Record<string, DesignStyle['density']> = {
      airy: 'clean',
      balanced: 'balanced',
      dense: 'informative',
    }
    const iconStyle = String(old.iconStyle ?? '').toLowerCase()
    return {
      id: typeof old.id === 'string' ? old.id : uid('style'),
      brandId: null,
      name: typeof old.name === 'string' ? old.name : 'Estilo migrado',
      client: typeof old.client === 'string' ? old.client : '',
      description: typeof old.description === 'string' ? old.description : '',
      theme: luminance(background) > 0.5 ? 'light' : 'dark',
      palette: {
        background,
        surface: palette.surface ?? '#101a30',
        primary: palette.primary ?? '#2563eb',
        secondary: palette.secondary ?? '#7c3aed',
        accent: palette.accent ?? '#22d3ee',
        text: palette.text ?? '#e7ecf5',
        muted: palette.muted ?? '#8b96ab',
      },
      typography: defaultTypography({
        heading: old.typography?.heading ?? 'Segoe UI',
        body: old.typography?.body ?? 'Segoe UI',
        numbers: old.typography?.heading ?? 'Segoe UI',
      }),
      contrast: old.contrast === 'low' || old.contrast === 'high' ? old.contrast : 'medium',
      gradient: defaultGradient({
        intensity: typeof old.gradientIntensity === 'number' ? old.gradientIntensity : 50,
        solidFallback: background,
      }),
      composition: defaultComposition({
        cornerRadius: typeof old.cornerRadius === 'number' ? old.cornerRadius : 10,
      }),
      icons: defaultIcons({
        mode: /sólid|solid|preench/.test(iconStyle) ? 'solid' : /sem|nenhum|none/.test(iconStyle) ? 'none' : 'linear',
        color: palette.accent ?? '#22d3ee',
      }),
      imagery: defaultImagery({ direction: typeof old.imageDirection === 'string' ? old.imageDirection : '' }),
      texture: defaultTexture(),
      density: densityMap[String(old.density)] ?? 'balanced',
      visualDirection: typeof old.visualDirection === 'string' ? old.visualDirection : '',
      compositionRules: typeof old.compositionRules === 'string' ? old.compositionRules : '',
      keywords: Array.isArray(old.keywords) ? old.keywords : [],
      aiInstructions: typeof old.aiInstructions === 'string' ? old.aiInstructions : '',
      textRules: defaultTextRules(),
      logoRules: defaultLogoRules({ coBranding: 'client-only', required: false }),
      webAssetPolicy: 'attachments-only',
      brandAssetIds: [],
      isSystem: false,
      favorite: old.favorite === true,
      isDefault: old.isDefault === true,
      createdAt: typeof old.createdAt === 'string' ? old.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** v2 → v3: estratégia de renderização, composição de IA e campos de sync. */
function applyV3Defaults(project: DeckProject): DeckProject {
  const config = project.plannerConfig as PlannerConfig & Partial<Record<'defaultStrategy' | 'aiComposition', unknown>>
  return {
    ...project,
    plannerConfig: {
      ...config,
      defaultStrategy: (config.defaultStrategy as PlannerConfig['defaultStrategy']) ?? 'template-guided',
      aiComposition: (config.aiComposition as PlannerConfig['aiComposition']) ?? 'overlay',
    },
    plan: project.plan
      ? {
          ...project.plan,
          slides: project.plan.slides.map((s) => ({
            ...s,
            renderStrategy: s.renderStrategy,
            templateId: s.templateId,
            snippetIds: s.snippetIds ?? [],
          })),
        }
      : null,
    slides: project.slides.map((slide) => ({
      ...slide,
      plan: { ...slide.plan, snippetIds: slide.plan.snippetIds ?? [] },
      versions: slide.versions.map((v) => ({
        ...v,
        // Versões antigas eram sempre do renderer estruturado (SVG) ou mock.
        strategy: v.strategy ?? 'structured',
        fileSource: v.fileSource ?? (v.svg ? 'renderer' : 'mock'),
      })),
    })),
  }
}

/**
 * Executada uma única vez no boot, antes da hidratação dos stores.
 * Nunca apaga dados do usuário: o que não puder ser migrado é mantido
 * intocado no storage e apenas ignorado pela aplicação.
 */
export async function runMigrations(): Promise<void> {
  const stored = await schemaRepository.load()
  if (stored === SCHEMA_VERSION) return

  const rawProject = await projectRepository.load()
  if (rawProject) {
    const migrated = migrateProject(rawProject)
    if (migrated) await projectRepository.save(applyV3Defaults(migrated))
  }

  const rawStyles = await styleRepository.load()
  if (rawStyles && Array.isArray(rawStyles)) {
    const migrated = rawStyles
      .map(migrateStyle)
      .filter((s): s is DesignStyle => s !== null)
    await styleRepository.save(migrated)
  }

  await schemaRepository.save(SCHEMA_VERSION)
}
