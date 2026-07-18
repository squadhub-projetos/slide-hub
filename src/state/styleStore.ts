import { create } from 'zustand'
import type { DesignStyle } from '../types'
import { GAUSTEC_BRAND_ID, getBrand } from '../config/brands'
import { SYSTEM_STYLES, SYSTEM_STYLE_IDS } from '../config/defaultStyles'
import { extractPaletteFromAsset } from '../services/brands/brandAssets'
import { styleRepository } from '../services/storage/repositories'
import { uid } from '../utils/id'
import { useUiStore } from './uiStore'

interface StyleState {
  styles: DesignStyle[]
  hydrated: boolean
  hydrate: () => Promise<void>
  upsert: (style: DesignStyle) => void
  duplicate: (id: string) => DesignStyle | null
  remove: (id: string) => void
  toggleFavorite: (id: string) => void
  setDefault: (id: string) => void
  getById: (id: string | null) => DesignStyle | null
  getDefault: () => DesignStyle | null
}

let saveTimer: number | undefined

function persist(styles: DesignStyle[]) {
  const ui = useUiStore.getState()
  ui.setSaveState('saving')
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    await styleRepository.save(styles)
    useUiStore.getState().setSaveState('saved')
    // Nuvem: apenas estilos personalizados e marcadores de oficiais.
    const { enqueueSync } = await import('../services/cloud/syncEngine')
    for (const style of styles.filter((s) => !s.isSystem)) {
      void enqueueSync({
        recordType: 'style',
        recordKey: style.id,
        name: style.name,
        payload: style,
        status: 'active',
        schemaVersion: 3,
      })
    }
  }, 350)
}

function hueOf(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const n = parseInt(match[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return null
  const d = max - min
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) + 360) % 360
}

/** Ordena com os estilos do sistema fixados no início, na ordem oficial. */
function sortStyles(styles: DesignStyle[]): DesignStyle[] {
  const systemOrder = SYSTEM_STYLES.map((s) => s.id)
  return [...styles].sort((a, b) => {
    const ai = systemOrder.indexOf(a.id)
    const bi = systemOrder.indexOf(b.id)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name)
  })
}

export const useStyleStore = create<StyleState>((set, get) => ({
  styles: [],
  hydrated: false,

  hydrate: async () => {
    const stored = (await styleRepository.load()) ?? []
    // Estilos do sistema vêm sempre da definição em código; do storage
    // apenas os marcadores do usuário (favorito/padrão) são preservados.
    const system = SYSTEM_STYLES.map((sys) => {
      const saved = stored.find((s) => s.id === sys.id)
      return saved ? { ...sys, favorite: saved.favorite, isDefault: saved.isDefault } : sys
    })
    const userStyles = stored.filter((s) => !SYSTEM_STYLE_IDS.has(s.id))
    let styles = sortStyles([...system, ...userStyles])
    if (!styles.some((s) => s.isDefault)) {
      styles = styles.map((s) => ({ ...s, isDefault: s.id === SYSTEM_STYLES[0].id }))
    }
    set({ styles, hydrated: true })
    await styleRepository.save(styles)

    // Refina a paleta Gaustec extraindo cores do próprio arquivo do logo.
    try {
      const brand = getBrand(GAUSTEC_BRAND_ID)
      if (brand) {
        const colors = await extractPaletteFromAsset(brand.logoAsset, 5)
        const green = colors.find((c) => {
          const h = hueOf(c)
          return h !== null && h >= 90 && h <= 170
        })
        const yellow = colors.find((c) => {
          const h = hueOf(c)
          return h !== null && h >= 35 && h <= 75
        })
        if (green || yellow) {
          set((s) => ({
            styles: s.styles.map((style) =>
              style.id === 'style-gaustec-engineering'
                ? {
                    ...style,
                    palette: {
                      ...style.palette,
                      primary: green ?? style.palette.primary,
                      accent: yellow ?? style.palette.accent,
                    },
                  }
                : style,
            ),
          }))
        }
      }
    } catch {
      // Extração é refinamento: os valores de fallback já são coerentes.
    }
  },

  upsert: (style) => {
    if (SYSTEM_STYLE_IDS.has(style.id)) {
      useUiStore.getState().toast('info', 'Estilo do sistema', 'Estilos oficiais não são editáveis — duplique para criar uma cópia sua.')
      return
    }
    set((s) => {
      const exists = s.styles.some((item) => item.id === style.id)
      const next = sortStyles(
        exists
          ? s.styles.map((item) => (item.id === style.id ? { ...style, updatedAt: new Date().toISOString() } : item))
          : [...s.styles, style],
      )
      persist(next)
      return { styles: next }
    })
  },

  duplicate: (id) => {
    const source = get().styles.find((s) => s.id === id)
    if (!source) return null
    const now = new Date().toISOString()
    const copy: DesignStyle = {
      ...source,
      id: uid('style'),
      name: `${source.name} (cópia)`,
      isSystem: false,
      isDefault: false,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    }
    set((s) => {
      const next = sortStyles([...s.styles, copy])
      persist(next)
      return { styles: next }
    })
    return copy
  },

  remove: (id) => {
    if (SYSTEM_STYLE_IDS.has(id)) {
      useUiStore.getState().toast('info', 'Estilo do sistema', 'Os quatro estilos oficiais não podem ser excluídos.')
      return
    }
    set((s) => {
      const next = s.styles.filter((item) => item.id !== id)
      persist(next)
      return { styles: next }
    })
  },

  toggleFavorite: (id) => {
    set((s) => {
      const next = s.styles.map((item) =>
        item.id === id ? { ...item, favorite: !item.favorite } : item,
      )
      persist(next)
      return { styles: next }
    })
  },

  setDefault: (id) => {
    set((s) => {
      const next = s.styles.map((item) => ({ ...item, isDefault: item.id === id }))
      persist(next)
      return { styles: next }
    })
  },

  getById: (id) => (id ? (get().styles.find((s) => s.id === id) ?? null) : null),
  getDefault: () => get().styles.find((s) => s.isDefault) ?? get().styles[0] ?? null,
}))
