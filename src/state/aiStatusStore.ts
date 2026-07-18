import { create } from 'zustand'
import type { AiReadiness, GenerationStage } from '../types'
import { AI_MODE } from '../services/ai'
import { cloudApi, type ServerAiStatus } from '../services/cloud/cloudApi'

/**
 * Indicador do modo de IA: IA real / Simulação / Configuração incompleta /
 * API indisponível — verificado contra o servidor, nunca presumido.
 */

interface AiStatusState {
  readiness: AiReadiness
  server: ServerAiStatus | null
  /** Etapas REAIS da geração em andamento, por slide. */
  stages: Record<string, GenerationStage>
  check: () => Promise<void>
  setStage: (slideId: string, stage: GenerationStage) => void
  clearStage: (slideId: string) => void
}

export const useAiStatusStore = create<AiStatusState>((set) => ({
  readiness: AI_MODE === 'mock' ? 'ready' : 'checking',
  server: null,
  stages: {},

  check: async () => {
    if (AI_MODE === 'mock') {
      set({ readiness: 'ready' })
      return
    }
    set({ readiness: 'checking' })
    try {
      const server = await cloudApi.aiStatus()
      set({ server, readiness: server.openaiConfigured ? 'ready' : 'missing-key' })
    } catch {
      set({ readiness: 'unreachable' })
    }
  },

  setStage: (slideId, stage) => set((s) => ({ stages: { ...s.stages, [slideId]: stage } })),
  clearStage: (slideId) =>
    set((s) => {
      const stages = { ...s.stages }
      delete stages[slideId]
      return { stages }
    }),
}))

export function aiModeLabel(readiness: AiReadiness): { label: string; tone: 'ok' | 'warn' | 'error' } {
  if (AI_MODE === 'mock') return { label: 'Simulação', tone: 'warn' }
  switch (readiness) {
    case 'ready': return { label: 'IA real', tone: 'ok' }
    case 'missing-key': return { label: 'Configuração incompleta', tone: 'error' }
    case 'unreachable': return { label: 'API indisponível', tone: 'error' }
    case 'checking': return { label: 'Verificando…', tone: 'warn' }
  }
}
