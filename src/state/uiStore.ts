import { create } from 'zustand'
import { DEFAULT_PREFS, prefsRepository, type AppPrefs } from '../services/storage/repositories'
import { uid } from '../utils/id'

export type Tab = 'planner' | 'generator' | 'styles'
export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  message?: string
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

export type SaveState = 'idle' | 'saving' | 'saved'

interface UiState {
  tab: Tab
  prefs: AppPrefs
  toasts: Toast[]
  confirm: ConfirmRequest | null
  saveState: SaveState
  lastSavedAt: number | null
  hydrated: boolean
  hydrate: () => Promise<void>
  setTab: (tab: Tab) => void
  setApprovalSeconds: (seconds: number) => void
  markOnboarded: () => void
  toast: (kind: ToastKind, title: string, message?: string) => void
  dismissToast: (id: string) => void
  requestConfirm: (request: ConfirmRequest) => void
  closeConfirm: () => void
  setSaveState: (state: SaveState) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  tab: 'generator',
  prefs: DEFAULT_PREFS,
  toasts: [],
  confirm: null,
  saveState: 'idle',
  lastSavedAt: null,
  hydrated: false,

  hydrate: async () => {
    const stored = await prefsRepository.load()
    set({ prefs: { ...DEFAULT_PREFS, ...stored }, tab: stored?.activeTab ?? 'generator', hydrated: true })
  },

  setTab: (tab) => {
    set({ tab })
    void prefsRepository.save({ ...get().prefs, activeTab: tab })
    set((s) => ({ prefs: { ...s.prefs, activeTab: tab } }))
  },

  setApprovalSeconds: (seconds) => {
    const prefs = { ...get().prefs, approvalSeconds: seconds }
    set({ prefs })
    void prefsRepository.save(prefs)
  },

  markOnboarded: () => {
    const prefs = { ...get().prefs, onboarded: true }
    set({ prefs })
    void prefsRepository.save(prefs)
  },

  toast: (kind, title, message) => {
    const id = uid('toast')
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, title, message }] }))
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 4200)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  requestConfirm: (request) => set({ confirm: request }),
  closeConfirm: () => set({ confirm: null }),

  setSaveState: (saveState) =>
    set(saveState === 'saved' ? { saveState, lastSavedAt: Date.now() } : { saveState }),
}))
