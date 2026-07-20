import { create } from 'zustand'
import type { AiCapabilities, AiTestConfig } from '../types'

const STORAGE_KEY = 'slidehub:ai-test-config'

/**
 * Seleção temporária de provedor/modelo/modo POR ETAPA para a fase de
 * testes. Contém APENAS preferências públicas (nunca chaves); os IDs de
 * modelo válidos vêm do servidor via /api/ai/capabilities e toda escolha
 * é revalidada no servidor a cada chamada.
 */
export const DEFAULT_AI_TEST_CONFIG: AiTestConfig = {
  provider: 'auto',
  plannerModel: null,
  slideProvider: null,
  slideModel: null,
  chatModel: null,
  revisionModel: null,
  executionMode: 'fast',
  // 'auto' respeita a estratégia do projeto/slide — a escolha explícita
  // do usuário no slide nunca é sobreposta por este seletor de testes.
  visualStrategy: 'auto',
  referenceInfluence: 'moderate',
  generateImagesOnlyWhenNeeded: true,
  parallelSlideProduction: true,
  slideConcurrency: 3,
}

/** Versão do formato salvo — migra defaults antigos sem apagar escolhas. */
const CONFIG_VERSION = 2

function load(): AiTestConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_AI_TEST_CONFIG
    const stored = JSON.parse(raw) as Partial<AiTestConfig> & { _v?: number }
    // v1 tinha 'template-assets' como padrão implícito — migra para o
    // novo padrão criativo sem tocar em quem escolheu outra estratégia
    // conscientemente depois da migração.
    if ((stored._v ?? 1) < CONFIG_VERSION && stored.visualStrategy === 'template-assets') {
      stored.visualStrategy = 'auto'
    }
    return { ...DEFAULT_AI_TEST_CONFIG, ...stored }
  } catch {
    return DEFAULT_AI_TEST_CONFIG
  }
}

interface AiTestConfigState {
  config: AiTestConfig
  capabilities: AiCapabilities | null
  patch: (patch: Partial<AiTestConfig>) => void
  reset: () => void
  loadCapabilities: () => Promise<void>
}

export const useAiTestConfigStore = create<AiTestConfigState>((set, get) => ({
  config: load(),
  capabilities: null,

  patch: (patch) => {
    const config = { ...get().config, ...patch }
    // Trocar de provedor invalida os modelos selecionados do outro provedor.
    if (patch.provider && patch.provider !== get().config.provider && !patch.plannerModel) {
      config.plannerModel = null
      config.chatModel = null
      config.revisionModel = null
    }
    if (patch.slideProvider && patch.slideProvider !== get().config.slideProvider && !patch.slideModel) {
      config.slideModel = null
    }
    config.slideConcurrency = Math.max(1, Math.min(4, config.slideConcurrency))
    set({ config })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, _v: CONFIG_VERSION }))
    } catch {
      /* armazenamento indisponível — preferências ficam só na sessão */
    }
  },

  reset: () => {
    set({ config: DEFAULT_AI_TEST_CONFIG })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_AI_TEST_CONFIG, _v: CONFIG_VERSION }))
    } catch {
      /* idem */
    }
  },

  loadCapabilities: async () => {
    try {
      const response = await fetch('/api/ai/capabilities')
      if (!response.ok) return
      set({ capabilities: (await response.json()) as AiCapabilities })
    } catch {
      /* servidor indisponível — o seletor mostra estado de indisponibilidade */
    }
  },
}))

interface StageOverride {
  provider?: 'openai' | 'anthropic'
  model?: string
  executionMode?: AiTestConfig['executionMode']
}

/** Overrides efetivos do PLANEJAMENTO. */
export function plannerOverrides(): StageOverride {
  const { config } = useAiTestConfigStore.getState()
  return {
    provider: config.provider === 'auto' ? undefined : config.provider,
    model: config.plannerModel ?? undefined,
    executionMode: config.executionMode,
  }
}

/** Overrides efetivos da PRODUÇÃO POR SLIDE (herda do planner quando vazio). */
export function slideOverrides(): StageOverride {
  const { config } = useAiTestConfigStore.getState()
  const provider =
    config.slideProvider && config.slideProvider !== 'auto'
      ? config.slideProvider
      : config.provider === 'auto'
        ? undefined
        : config.provider
  return {
    provider,
    model: config.slideModel ?? undefined,
    executionMode: config.executionMode,
  }
}
