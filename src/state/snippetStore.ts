import { create } from 'zustand'
import type { Snippet } from '../types'
import { SYSTEM_SNIPPET_IDS, SYSTEM_SNIPPETS } from '../config/defaultSnippets'
import { enqueueSync } from '../services/cloud/syncEngine'
import { storage } from '../services/storage/localStorageAdapter'
import { uid } from '../utils/id'
import { useUiStore } from './uiStore'

const KEY = 'snippets'

interface SnippetState {
  userSnippets: Snippet[]
  overrides: Record<string, Snippet>
  hydrated: boolean
  hydrate: () => Promise<void>
  all: () => Snippet[]
  getById: (id: string | null | undefined) => Snippet | null
  save: (snippet: Snippet) => void
  duplicate: (id: string) => Snippet | null
  remove: (id: string) => void
}

function persist(state: Pick<SnippetState, 'userSnippets' | 'overrides'>) {
  void storage.write(KEY, { userSnippets: state.userSnippets, overrides: state.overrides })
}

function sync(snippet: Snippet) {
  void enqueueSync({
    recordType: 'snippet',
    recordKey: snippet.id,
    name: snippet.name,
    payload: snippet,
    status: 'active',
    schemaVersion: 3,
  })
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  userSnippets: [],
  overrides: {},
  hydrated: false,

  hydrate: async () => {
    const stored = await storage.read<{ userSnippets: Snippet[]; overrides: Record<string, Snippet> }>(KEY)
    set({ userSnippets: stored?.userSnippets ?? [], overrides: stored?.overrides ?? {}, hydrated: true })
  },

  all: () => {
    const { overrides, userSnippets } = get()
    return [...SYSTEM_SNIPPETS.map((s) => overrides[s.id] ?? s), ...userSnippets]
  },

  getById: (id) => (id ? (get().all().find((s) => s.id === id) ?? null) : null),

  save: (snippet) => {
    const now = new Date().toISOString()
    const updated = { ...snippet, updatedAt: now }
    set((s) => {
      const next = SYSTEM_SNIPPET_IDS.has(snippet.id)
        ? { userSnippets: s.userSnippets, overrides: { ...s.overrides, [snippet.id]: { ...updated, isSystem: true } } }
        : {
            overrides: s.overrides,
            userSnippets: s.userSnippets.some((x) => x.id === snippet.id)
              ? s.userSnippets.map((x) => (x.id === snippet.id ? updated : x))
              : [...s.userSnippets, updated],
          }
      persist(next)
      return next
    })
    sync(updated)
  },

  duplicate: (id) => {
    const source = get().getById(id)
    if (!source) return null
    const now = new Date().toISOString()
    const copy: Snippet = { ...source, id: uid('snip'), name: `${source.name} (cópia)`, isSystem: false, createdAt: now, updatedAt: now }
    set((s) => {
      const next = { overrides: s.overrides, userSnippets: [...s.userSnippets, copy] }
      persist(next)
      return next
    })
    sync(copy)
    return copy
  },

  remove: (id) => {
    if (SYSTEM_SNIPPET_IDS.has(id)) {
      useUiStore.getState().toast('info', 'Snippet oficial', 'Snippets oficiais não podem ser excluídos.')
      return
    }
    set((s) => {
      const next = { overrides: s.overrides, userSnippets: s.userSnippets.filter((x) => x.id !== id) }
      persist(next)
      return next
    })
    void enqueueSync({ recordType: 'snippet', recordKey: id, name: id, payload: {}, status: 'archived', schemaVersion: 3 })
  },
}))
