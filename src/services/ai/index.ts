import type { AiMode, AiProvider } from '../../types'
import { ApiAiProvider } from './ApiAiProvider'
import { MockAiProvider } from './MockAiProvider'

/**
 * Separação inequívoca de modos — SEM fallback silencioso:
 *  - VITE_USE_MOCK_AI=true  → 'mock' (Modo simulação, rotulado na interface)
 *  - qualquer outro valor   → 'real' (somente endpoints internos; erros reais
 *    aparecem como erros — nunca são substituídos por um mock)
 */
export const AI_MODE: AiMode = import.meta.env.VITE_USE_MOCK_AI === 'true' ? 'mock' : 'real'

let mockInstance: AiProvider | null = null
let realInstance: AiProvider | null = null

export function getAiProvider(): AiProvider {
  if (AI_MODE === 'mock') {
    if (!mockInstance) mockInstance = new MockAiProvider()
    return mockInstance
  }
  if (!realInstance) realInstance = new ApiAiProvider()
  return realInstance
}

export { MockAiProvider, ApiAiProvider }
