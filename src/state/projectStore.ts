import { create } from 'zustand'
import type {
  ChatMessage,
  DeckPlan,
  DeckProject,
  PlannedSlide,
  PlannerConfig,
  Slide,
  SlideStatus,
  SlideVersion,
  VariationCount,
} from '../types'
import { getMeetingMeta } from '../features/planner/plannerOptions'
import { enqueueSync } from '../services/cloud/syncEngine'
import { projectRepository } from '../services/storage/repositories'
import { blobStore, blobToDataUrl, dataUrlToBlob } from '../services/storage/blobStore'
import { sanitizeFileName } from '../utils/filename'
import { uid } from '../utils/id'
import { useUiStore } from './uiStore'

const APPROVED: SlideStatus[] = ['approvedManual', 'approvedAuto']

export function isApproved(slide: Slide): boolean {
  return APPROVED.includes(slide.status)
}

export function currentVersionOf(slide: Slide): SlideVersion | null {
  return slide.versions.find((v) => v.id === slide.currentVersionId) ?? slide.versions.at(-1) ?? null
}

/** Versões da rodada ativa (variações da geração atual). */
export function activeRoundVersions(slide: Slide): SlideVersion[] {
  if (!slide.activeGroupId) return []
  return slide.versions.filter((v) => v.groupId === slide.activeGroupId)
}

export function isRoundComplete(slide: Slide): boolean {
  if (!slide.activeGroupId) return slide.versions.length > 0
  return activeRoundVersions(slide).length >= slide.requestedVariations
}

export function defaultPlannerConfig(styleId: string | null): PlannerConfig {
  return {
    meetingType: 'checkpoint',
    audienceScope: 'internal',
    audienceSegment: 'Geral',
    objective: getMeetingMeta('checkpoint').objectives[0],
    customObjective: '',
    slideCount: 6,
    tone: 'Confiante',
    language: 'pt-BR',
    aspect: '16:9',
    styleId,
    variationsPerSlide: 1,
    imageQuality: 'high',
    webAssetPolicy: 'attachments-only',
    // PROJETOS NOVOS nascem no Criativo por IA: o template é referência
    // de linguagem visual, não molde. Projetos antigos preservam a
    // estratégia já salva (nada é alterado silenciosamente).
    defaultStrategy: 'ai-generated',
    aiComposition: 'overlay',
  }
}

export function createEmptyProject(name = 'Nova apresentação', styleId: string | null = null): DeckProject {
  const now = new Date().toISOString()
  return {
    id: uid('deck'),
    name,
    fileName: sanitizeFileName(name),
    prompt: '',
    slideCount: 6,
    styleId,
    aspect: '16:9',
    language: 'pt-BR',
    phase: 'setup',
    plan: null,
    slides: [],
    currentSlideIndex: 0,
    plannerMessages: [],
    plannerConfig: defaultPlannerConfig(styleId),
    stats: { manualApprovals: 0, autoApprovals: 0, revisions: 0, startedAt: null, finishedAt: null },
    createdAt: now,
    updatedAt: now,
  }
}

export function slidesFromPlan(plan: DeckPlan, variations: VariationCount): Slide[] {
  return plan.slides.map((item) => ({
    id: uid('slide'),
    plan: item,
    status: 'pending',
    versions: [],
    currentVersionId: null,
    activeGroupId: null,
    requestedVariations: variations,
  }))
}

interface ProjectState {
  project: DeckProject | null
  hydrated: boolean
  hydrate: () => Promise<void>
  newProject: (name?: string, styleId?: string | null) => void
  patchProject: (patch: Partial<DeckProject>) => void
  patchPlannerConfig: (patch: Partial<PlannerConfig>) => void
  appendMessage: (message: ChatMessage) => void
  applyPlan: (plan: DeckPlan) => void
  updatePlanSlide: (slideId: string, next: PlannedSlide, masterPrompt?: string) => void
  startGeneration: () => void
  setCurrentSlide: (index: number) => void
  patchSlide: (slideId: string, patch: Partial<Slide>) => void
  beginRound: (slideId: string, groupId: string, requested: number) => boolean
  pushVersion: (slideId: string, version: SlideVersion) => void
  finishRound: (slideId: string, status: SlideStatus) => void
  failRound: (slideId: string, error: string) => void
  selectVersion: (slideId: string, versionId: string) => void
  renameVersion: (slideId: string, versionId: string, label: string) => void
  deleteVersion: (slideId: string, versionId: string) => void
  markVersionsExported: () => void
  approveSlide: (slideId: string, mode: 'manual' | 'auto') => void
  retrySlide: (slideId: string) => void
  regenerateSlide: (slideId: string) => void
  duplicateSlide: (slideId: string) => void
  deleteSlide: (slideId: string) => void
  moveSlide: (from: number, to: number) => void
  incrementRevisions: () => void
  reopenProject: () => void
}

let saveTimer: number | undefined

/**
 * Persiste sem data URLs pesados (imagens vão para o IndexedDB) e
 * enfileira a sincronização com o Supabase: um registro por projeto e
 * um registro por slide (payload leve, sem base64).
 */
function persist(project: DeckProject | null) {
  useUiStore.getState().setSaveState('saving')
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    if (project) {
      const lean: DeckProject = {
        ...project,
        slides: project.slides.map((slide) => ({
          ...slide,
          versions: slide.versions.map((version) => {
            let next = version
            if (next.imageDataUrl) {
              const key = next.imageStorageKey ?? `ver:${next.id}`
              void blobStore.put(key, dataUrlToBlob(next.imageDataUrl))
              next = { ...next, imageDataUrl: undefined, imageStorageKey: key }
            }
            if (next.rawImageDataUrl) {
              const rawKey = next.rawStorageKey ?? `ver-raw:${next.id}`
              void blobStore.put(rawKey, dataUrlToBlob(next.rawImageDataUrl))
              next = { ...next, rawImageDataUrl: undefined, rawStorageKey: rawKey }
            }
            return next
          }),
        })),
      }
      await projectRepository.save(lean)
      enqueueProjectSync(lean)
    } else {
      await projectRepository.clear()
    }
    useUiStore.getState().setSaveState('saved')
  }, 400)
}

/** Payload do slide para a nuvem: versões sem binário (só metadados/paths). */
function leanSlidePayload(slide: Slide) {
  return {
    ...slide,
    versions: slide.versions.map((v) => ({
      ...v,
      imageDataUrl: undefined,
      rawImageDataUrl: undefined,
      svg: v.svg && v.svg.length > 60_000 ? undefined : v.svg,
    })),
  }
}

function enqueueProjectSync(project: DeckProject) {
  void enqueueSync({
    recordType: 'project',
    recordKey: project.id,
    projectKey: project.id,
    name: project.name,
    payload: {
      ...project,
      slides: undefined,
      slideIds: project.slides.map((s) => s.id),
    },
    status: 'active',
    schemaVersion: 3,
  })
  project.slides.forEach((slide, index) => {
    void enqueueSync({
      recordType: 'slide',
      recordKey: slide.id,
      projectKey: project.id,
      position: index,
      name: slide.plan.title,
      payload: leanSlidePayload(slide),
      status: 'active',
      schemaVersion: 3,
    })
  })
}

export const useProjectStore = create<ProjectState>((set, get) => {
  function update(mutator: (project: DeckProject) => DeckProject) {
    const current = get().project
    if (!current) return
    const next = { ...mutator(current), updatedAt: new Date().toISOString() }
    set({ project: next })
    persist(next)
  }

  function updateSlide(slideId: string, mutator: (slide: Slide) => Slide) {
    update((p) => ({
      ...p,
      slides: p.slides.map((slide) => (slide.id === slideId ? mutator(slide) : slide)),
    }))
  }

  return {
    project: null,
    hydrated: false,

    hydrate: async () => {
      const stored = await projectRepository.load()
      set({ project: stored ?? null, hydrated: true })
      // Restaura imagens das versões a partir do IndexedDB (fora do caminho crítico).
      if (stored) {
        const restore = async (slideId: string, versionId: string, key: string, field: 'imageDataUrl' | 'rawImageDataUrl') => {
          const blob = await blobStore.get(key)
          if (!blob) return
          const dataUrl = await blobToDataUrl(blob)
          set((s) => {
            if (!s.project) return s
            return {
              project: {
                ...s.project,
                slides: s.project.slides.map((sl) =>
                  sl.id === slideId
                    ? {
                        ...sl,
                        versions: sl.versions.map((v) => (v.id === versionId ? { ...v, [field]: dataUrl } : v)),
                      }
                    : sl,
                ),
              },
            }
          })
        }
        for (const slide of stored.slides) {
          for (const version of slide.versions) {
            if (version.imageStorageKey && !version.imageDataUrl) {
              await restore(slide.id, version.id, version.imageStorageKey, 'imageDataUrl')
            }
            if (version.rawStorageKey && !version.rawImageDataUrl) {
              await restore(slide.id, version.id, version.rawStorageKey, 'rawImageDataUrl')
            }
          }
        }
      }
    },

    newProject: (name, styleId = null) => {
      const project = createEmptyProject(name, styleId)
      set({ project })
      persist(project)
    },

    patchProject: (patch) => update((p) => ({ ...p, ...patch })),

    patchPlannerConfig: (patch) =>
      update((p) => {
        const nextConfig = { ...p.plannerConfig, ...patch }
        // Trocar o tipo de reunião realinha o objetivo à nova lista e
        // pré-seleciona interno/externo: checkpoint e town-hall são
        // encontros internos por padrão; kickoff e proposta, externos.
        // São padrões iniciais — o usuário (Opções avançadas) e a IA
        // (briefing tipo "kickoff interno") podem sobrescrever.
        if (patch.meetingType && patch.meetingType !== p.plannerConfig.meetingType) {
          if (!patch.objective) nextConfig.objective = getMeetingMeta(patch.meetingType).objectives[0]
          if (!patch.audienceScope) {
            nextConfig.audienceScope =
              patch.meetingType === 'kickoff' || patch.meetingType === 'proposal' ? 'external' : 'internal'
          }
        }
        if (nextConfig.audienceScope !== p.plannerConfig.audienceScope && !patch.audienceSegment) {
          nextConfig.audienceSegment = nextConfig.audienceScope === 'internal' ? 'Geral' : 'Gestão Operacional'
        }
        return { ...p, plannerConfig: nextConfig }
      }),

    appendMessage: (message) =>
      update((p) => ({ ...p, plannerMessages: [...p.plannerMessages, message] })),

    applyPlan: (plan) =>
      update((p) => ({
        ...p,
        plan,
        name: plan.title,
        fileName: sanitizeFileName(plan.title),
        prompt: plan.masterPrompt,
        slideCount: plan.slides.length,
        styleId: p.plannerConfig.styleId ?? p.styleId,
        language: p.plannerConfig.language,
        aspect: p.plannerConfig.aspect,
        slides: slidesFromPlan(plan, p.plannerConfig.variationsPerSlide),
        currentSlideIndex: 0,
        phase: 'setup',
      })),

    updatePlanSlide: (slideId, next, masterPrompt) =>
      update((p) => {
        const plan = p.plan
          ? {
              ...p.plan,
              slides: p.plan.slides.map((s) => (s.id === next.id ? next : s)),
              masterPrompt: masterPrompt ?? p.plan.masterPrompt,
            }
          : p.plan
        return {
          ...p,
          plan,
          prompt: masterPrompt ?? p.prompt,
          slides: p.slides.map((slide) =>
            slide.id === slideId || slide.plan.id === next.id ? { ...slide, plan: next } : slide,
          ),
        }
      }),

    startGeneration: () =>
      update((p) => ({
        ...p,
        phase: 'working',
        currentSlideIndex: 0,
        stats: { ...p.stats, startedAt: p.stats.startedAt ?? new Date().toISOString(), finishedAt: null },
      })),

    setCurrentSlide: (index) =>
      update((p) => ({
        ...p,
        currentSlideIndex: Math.max(0, Math.min(index, p.slides.length - 1)),
      })),

    patchSlide: (slideId, patch) => updateSlide(slideId, (slide) => ({ ...slide, ...patch })),

    // Reivindica atomicamente uma rodada de geração (protege contra StrictMode).
    beginRound: (slideId, groupId, requested) => {
      const slide = get().project?.slides.find((s) => s.id === slideId)
      if (!slide || slide.status === 'generating') return false
      updateSlide(slideId, (s) => ({
        ...s,
        status: 'generating',
        activeGroupId: groupId,
        requestedVariations: Math.max(1, Math.min(3, requested)),
        error: undefined,
      }))
      return true
    },

    pushVersion: (slideId, version) =>
      updateSlide(slideId, (slide) => {
        const versions = [...slide.versions, version]
        const isFirstOfRound = version.groupId === slide.activeGroupId &&
          versions.filter((v) => v.groupId === slide.activeGroupId).length === 1
        return {
          ...slide,
          versions,
          currentVersionId: isFirstOfRound ? version.id : slide.currentVersionId,
        }
      }),

    finishRound: (slideId, status) =>
      updateSlide(slideId, (slide) => ({ ...slide, status, error: undefined })),

    failRound: (slideId, error) =>
      updateSlide(slideId, (slide) => ({ ...slide, status: 'error', error })),

    selectVersion: (slideId, versionId) =>
      updateSlide(slideId, (slide) => {
        if (!slide.versions.some((v) => v.id === versionId)) return slide
        const stillApproved = APPROVED.includes(slide.status)
        return {
          ...slide,
          currentVersionId: versionId,
          // Selecionar outra versão de um slide já aprovado exige nova revisão.
          status: stillApproved ? 'revised' : slide.status,
        }
      }),

    renameVersion: (slideId, versionId, label) =>
      updateSlide(slideId, (slide) => ({
        ...slide,
        versions: slide.versions.map((v) => (v.id === versionId ? { ...v, label } : v)),
      })),

    deleteVersion: (slideId, versionId) =>
      updateSlide(slideId, (slide) => {
        if (slide.currentVersionId === versionId) return slide
        const removed = slide.versions.find((v) => v.id === versionId)
        if (removed?.imageStorageKey) void blobStore.remove(removed.imageStorageKey)
        return { ...slide, versions: slide.versions.filter((v) => v.id !== versionId) }
      }),

    markVersionsExported: () =>
      update((p) => ({
        ...p,
        slides: p.slides.map((slide) => ({
          ...slide,
          versions: slide.versions.map((v) =>
            v.id === slide.currentVersionId ? { ...v, exportedAt: new Date().toISOString() } : v,
          ),
        })),
      })),

    approveSlide: (slideId, mode) =>
      update((p) => {
        const slides = p.slides.map((slide): Slide =>
          slide.id === slideId
            ? { ...slide, status: mode === 'manual' ? 'approvedManual' : 'approvedAuto' }
            : slide,
        )
        const approvedIndex = slides.findIndex((s) => s.id === slideId)
        const order = [...slides.keys()].filter((i) => i > approvedIndex).concat(
          [...slides.keys()].filter((i) => i < approvedIndex),
        )
        const nextIndex = order.find((i) => !APPROVED.includes(slides[i].status))
        const done = nextIndex === undefined
        return {
          ...p,
          slides,
          currentSlideIndex: done ? approvedIndex : nextIndex,
          phase: done ? 'complete' : p.phase,
          stats: {
            ...p.stats,
            manualApprovals: p.stats.manualApprovals + (mode === 'manual' ? 1 : 0),
            autoApprovals: p.stats.autoApprovals + (mode === 'auto' ? 1 : 0),
            finishedAt: done ? new Date().toISOString() : p.stats.finishedAt,
          },
        }
      }),

    retrySlide: (slideId) =>
      updateSlide(slideId, (slide) => ({ ...slide, status: 'pending', error: undefined })),

    regenerateSlide: (slideId) =>
      update((p) => {
        const index = p.slides.findIndex((s) => s.id === slideId)
        return {
          ...p,
          phase: p.phase === 'complete' ? 'working' : p.phase,
          currentSlideIndex: index >= 0 ? index : p.currentSlideIndex,
          slides: p.slides.map((slide) =>
            slide.id === slideId ? { ...slide, status: 'pending', error: undefined } : slide,
          ),
          stats: { ...p.stats, finishedAt: null },
        }
      }),

    duplicateSlide: (slideId) =>
      update((p) => {
        const index = p.slides.findIndex((s) => s.id === slideId)
        if (index < 0) return p
        const source = p.slides[index]
        const idMap = new Map<string, string>()
        const versions = source.versions.map((v) => {
          const newId = uid('ver')
          idMap.set(v.id, newId)
          return { ...v, id: newId, imageStorageKey: undefined, origin: 'duplicate' as const }
        })
        const copy: Slide = {
          ...source,
          id: uid('slide'),
          plan: { ...source.plan, id: uid('ps') },
          versions,
          currentVersionId: source.currentVersionId ? (idMap.get(source.currentVersionId) ?? null) : null,
          activeGroupId: source.activeGroupId,
          status: source.versions.length > 0 ? 'awaiting' : 'pending',
        }
        const slides = [...p.slides]
        slides.splice(index + 1, 0, copy)
        return { ...p, slides, phase: 'working', stats: { ...p.stats, finishedAt: null } }
      }),

    deleteSlide: (slideId) =>
      update((p) => {
        const removed = p.slides.find((s) => s.id === slideId)
        for (const v of removed?.versions ?? []) {
          if (v.imageStorageKey) void blobStore.remove(v.imageStorageKey)
        }
        const slides = p.slides.filter((s) => s.id !== slideId)
        const allApproved = slides.length > 0 && slides.every((s) => APPROVED.includes(s.status))
        return {
          ...p,
          slides,
          slideCount: slides.length,
          currentSlideIndex: Math.min(p.currentSlideIndex, Math.max(slides.length - 1, 0)),
          phase: slides.length === 0 ? 'setup' : allApproved ? 'complete' : p.phase,
        }
      }),

    moveSlide: (from, to) =>
      update((p) => {
        if (from === to || from < 0 || to < 0 || from >= p.slides.length || to >= p.slides.length) return p
        const slides = [...p.slides]
        const [moved] = slides.splice(from, 1)
        slides.splice(to, 0, moved)
        const currentId = p.slides[p.currentSlideIndex]?.id
        return {
          ...p,
          slides,
          currentSlideIndex: Math.max(0, slides.findIndex((s) => s.id === currentId)),
        }
      }),

    incrementRevisions: () =>
      update((p) => ({ ...p, stats: { ...p.stats, revisions: p.stats.revisions + 1 } })),

    reopenProject: () => update((p) => ({ ...p, phase: 'working', stats: { ...p.stats, finishedAt: null } })),
  }
})
