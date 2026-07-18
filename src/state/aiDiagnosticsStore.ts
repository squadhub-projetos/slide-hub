import { create } from 'zustand'
import type { AiCallRecord } from '../types'
import { uid } from '../utils/id'

/**
 * Diagnóstico das chamadas de IA — prova de que a chamada real aconteceu
 * (endpoint, modelo, duração, status, tokens, requestId). NUNCA guarda
 * chave, headers de autorização, prompts completos ou dados sensíveis.
 */

const MAX_RECORDS = 30

interface AiDiagnosticsState {
  records: AiCallRecord[]
  record: (entry: Omit<AiCallRecord, 'id'>) => void
  clear: () => void
}

export const useAiDiagnosticsStore = create<AiDiagnosticsState>((set) => ({
  records: [],
  record: (entry) =>
    set((s) => ({ records: [{ id: uid('call'), ...entry }, ...s.records].slice(0, MAX_RECORDS) })),
  clear: () => set({ records: [] }),
}))

export function recordAiCall(entry: Omit<AiCallRecord, 'id'>): void {
  useAiDiagnosticsStore.getState().record(entry)
}
