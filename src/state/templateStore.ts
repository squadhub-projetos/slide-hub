import { create } from 'zustand'
import type { SlideTemplate, TemplateLayer } from '../types'
import { SYSTEM_TEMPLATE_IDS, SYSTEM_TEMPLATES } from '../config/defaultTemplates'
import { enqueueSync } from '../services/cloud/syncEngine'
import { storage } from '../services/storage/localStorageAdapter'
import { uid } from '../utils/id'
import { useUiStore } from './uiStore'

/**
 * Templates: seeds oficiais em código + overrides/novos do usuário.
 * Overrides permitem editar um template oficial DIRETAMENTE, sem destruir
 * o seed: "Restaurar padrão" remove o override e o original volta.
 */

interface StoredTemplates {
  overrides: Record<string, SlideTemplate>
  userTemplates: SlideTemplate[]
}

const KEY = 'templates'

interface TemplateState {
  overrides: Record<string, SlideTemplate>
  userTemplates: SlideTemplate[]
  hydrated: boolean
  hydrate: () => Promise<void>
  all: () => SlideTemplate[]
  getById: (id: string | null | undefined) => SlideTemplate | null
  isOverridden: (id: string) => boolean
  saveTemplate: (template: SlideTemplate) => void
  saveAsNew: (template: SlideTemplate, name: string) => SlideTemplate
  restoreDefault: (id: string) => void
  duplicate: (id: string) => SlideTemplate | null
  remove: (id: string) => void
  createBlank: (styleId: string | null, name?: string) => SlideTemplate
}

function persist(state: Pick<TemplateState, 'overrides' | 'userTemplates'>) {
  void storage.write<StoredTemplates>(KEY, {
    overrides: state.overrides,
    userTemplates: state.userTemplates,
  })
}

function syncTemplate(template: SlideTemplate) {
  void enqueueSync({
    recordType: 'template',
    recordKey: template.id,
    name: template.name,
    payload: template,
    status: 'active',
    schemaVersion: 3,
  })
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  overrides: {},
  userTemplates: [],
  hydrated: false,

  hydrate: async () => {
    const stored = await storage.read<StoredTemplates>(KEY)
    set({
      overrides: stored?.overrides ?? {},
      userTemplates: stored?.userTemplates ?? [],
      hydrated: true,
    })
  },

  all: () => {
    const { overrides, userTemplates } = get()
    const system = SYSTEM_TEMPLATES.map((t) => overrides[t.id] ?? t)
    return [...system, ...userTemplates]
  },

  getById: (id) => {
    if (!id) return null
    return get().all().find((t) => t.id === id) ?? null
  },

  isOverridden: (id) => id in get().overrides,

  saveTemplate: (template) => {
    const now = new Date().toISOString()
    if (SYSTEM_TEMPLATE_IDS.has(template.id)) {
      // Override do oficial: preserva histórico de versões do override.
      const existing = get().overrides[template.id]
      const previousVersions = [
        ...(existing?.previousVersions ?? []),
        ...(existing ? [{ savedAt: existing.updatedAt, layers: existing.layers }] : []),
      ].slice(-10)
      const override: SlideTemplate = {
        ...template,
        isSystem: true,
        overriddenAt: now,
        updatedAt: now,
        previousVersions,
      }
      set((s) => {
        const next = { overrides: { ...s.overrides, [template.id]: override }, userTemplates: s.userTemplates }
        persist(next)
        return next
      })
      syncTemplate(override)
      return
    }
    set((s) => {
      const exists = s.userTemplates.some((t) => t.id === template.id)
      const previous = s.userTemplates.find((t) => t.id === template.id)
      const updated: SlideTemplate = {
        ...template,
        updatedAt: now,
        previousVersions: [
          ...(previous?.previousVersions ?? []),
          ...(previous ? [{ savedAt: previous.updatedAt, layers: previous.layers }] : []),
        ].slice(-10),
      }
      const next = {
        overrides: s.overrides,
        userTemplates: exists
          ? s.userTemplates.map((t) => (t.id === template.id ? updated : t))
          : [...s.userTemplates, updated],
      }
      persist(next)
      syncTemplate(updated)
      return next
    })
  },

  saveAsNew: (template, name) => {
    const now = new Date().toISOString()
    const copy: SlideTemplate = {
      ...template,
      id: uid('tpl'),
      name,
      isSystem: false,
      overriddenAt: undefined,
      previousVersions: [],
      createdAt: now,
      updatedAt: now,
    }
    set((s) => {
      const next = { overrides: s.overrides, userTemplates: [...s.userTemplates, copy] }
      persist(next)
      return next
    })
    syncTemplate(copy)
    return copy
  },

  restoreDefault: (id) => {
    if (!SYSTEM_TEMPLATE_IDS.has(id)) return
    set((s) => {
      const overrides = { ...s.overrides }
      delete overrides[id]
      const next = { overrides, userTemplates: s.userTemplates }
      persist(next)
      return next
    })
    void enqueueSync({
      recordType: 'template',
      recordKey: id,
      name: `restore-${id}`,
      payload: { restored: true },
      status: 'archived',
      schemaVersion: 3,
    })
    useUiStore.getState().toast('success', 'Template restaurado', 'A versão oficial voltou a valer.')
  },

  duplicate: (id) => {
    const source = get().getById(id)
    if (!source) return null
    return get().saveAsNew(source, `${source.name} (cópia)`)
  },

  remove: (id) => {
    if (SYSTEM_TEMPLATE_IDS.has(id)) {
      useUiStore.getState().toast('info', 'Template oficial', 'Templates oficiais não podem ser excluídos — use Restaurar padrão para desfazer alterações.')
      return
    }
    set((s) => {
      const next = { overrides: s.overrides, userTemplates: s.userTemplates.filter((t) => t.id !== id) }
      persist(next)
      return next
    })
    void enqueueSync({ recordType: 'template', recordKey: id, name: id, payload: {}, status: 'archived', schemaVersion: 3 })
  },

  createBlank: (styleId, name = 'Novo template') => {
    const now = new Date().toISOString()
    const blankLayer: TemplateLayer = {
      id: 'l1', type: 'text-placeholder', name: 'Título principal',
      x: 0.06, y: 0.12, width: 0.6, height: 0.16,
      rotation: 0, zIndex: 1, opacity: 1, visible: true, locked: false,
      role: 'title', binding: 'slide.title', placeholderLabel: 'Título principal',
      text: { fontRole: 'heading', size: 48, weight: 700, color: 'auto', align: 'left', uppercase: false, lineHeight: 1.2, maxLines: 3, maxChars: 90, autoShrink: true },
    }
    return {
      id: uid('tpl'),
      name,
      description: '',
      styleId,
      brandId: null,
      kind: 'custom',
      keywords: [],
      layers: [blankLayer],
      snippetIds: [],
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    }
  },
}))
