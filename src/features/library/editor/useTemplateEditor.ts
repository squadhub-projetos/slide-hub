import { useCallback, useRef, useState } from 'react'
import type { TemplateLayer } from '../../../types'
import { uid } from '../../../utils/id'

/**
 * Estado do editor visual de templates: camadas, seleção múltipla,
 * histórico (undo/redo), clipboard, agrupamento, ordem, alinhamento,
 * distribuição e snapping — desacoplado da apresentação.
 */

export interface EditorGuides {
  v: number | null
  h: number | null
}

const SNAP = 0.008
const SNAP_TARGETS = [0.06, 0.5, 0.94]

export function useTemplateEditor(initial: TemplateLayer[]) {
  const [layers, setLayersState] = useState<TemplateLayer[]>(initial)
  const [selection, setSelection] = useState<string[]>([])
  const [guides, setGuides] = useState<EditorGuides>({ v: null, h: null })
  const historyRef = useRef<TemplateLayer[][]>([])
  const redoRef = useRef<TemplateLayer[][]>([])
  const clipboardRef = useRef<TemplateLayer[]>([])
  const [historyTick, setHistoryTick] = useState(0)

  const snapshot = useCallback(() => {
    historyRef.current.push(layers)
    if (historyRef.current.length > 50) historyRef.current.shift()
    redoRef.current = []
    setHistoryTick((t) => t + 1)
  }, [layers])

  const setLayers = useCallback((next: TemplateLayer[] | ((prev: TemplateLayer[]) => TemplateLayer[]), record = true) => {
    setLayersState((prev) => {
      if (record) {
        historyRef.current.push(prev)
        if (historyRef.current.length > 50) historyRef.current.shift()
        redoRef.current = []
      }
      return typeof next === 'function' ? next(prev) : next
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setLayersState((current) => {
      redoRef.current.push(current)
      return previous
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    setLayersState((current) => {
      historyRef.current.push(current)
      return next
    })
    setHistoryTick((t) => t + 1)
  }, [])

  const select = useCallback((id: string | null, additive = false) => {
    setSelection((prev) => {
      if (id === null) return []
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      return [id]
    })
  }, [])

  const selectedLayers = layers.filter((l) => selection.includes(l.id))

  const patchSelected = useCallback(
    (patch: Partial<TemplateLayer> | ((layer: TemplateLayer) => Partial<TemplateLayer>), record = true) => {
      setLayers(
        (prev) =>
          prev.map((l) =>
            selection.includes(l.id) && !l.locked
              ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) }
              : l,
          ),
        record,
      )
    },
    [selection, setLayers],
  )

  /** Move com snapping a centro/margens; retorna guias ativas. */
  const moveSelected = useCallback(
    (dx: number, dy: number, record = false) => {
      let guideV: number | null = null
      let guideH: number | null = null
      setLayers(
        (prev) =>
          prev.map((l) => {
            if (!selection.includes(l.id) || l.locked) return l
            let x = Math.max(-0.2, Math.min(1.1, l.x + dx))
            let y = Math.max(-0.2, Math.min(1.1, l.y + dy))
            for (const target of SNAP_TARGETS) {
              const centerX = x + l.width / 2
              if (Math.abs(centerX - target) < SNAP) {
                x = target - l.width / 2
                guideV = target
              }
              if (Math.abs(x - target) < SNAP) {
                x = target
                guideV = target
              }
              const centerY = y + l.height / 2
              if (Math.abs(centerY - target) < SNAP) {
                y = target - l.height / 2
                guideH = target
              }
              if (Math.abs(y - target) < SNAP) {
                y = target
                guideH = target
              }
            }
            return { ...l, x, y }
          }),
        record,
      )
      setGuides({ v: guideV, h: guideH })
    },
    [selection, setLayers],
  )

  const clearGuides = useCallback(() => setGuides({ v: null, h: null }), [])

  const duplicateSelected = useCallback(() => {
    setLayers((prev) => {
      const copies = prev
        .filter((l) => selection.includes(l.id))
        .map((l) => ({ ...l, id: uid('lyr'), name: `${l.name} (cópia)`, x: l.x + 0.02, y: l.y + 0.02, zIndex: Math.max(...prev.map((p) => p.zIndex)) + 1 }))
      setSelection(copies.map((c) => c.id))
      return [...prev, ...copies]
    })
  }, [selection, setLayers])

  const deleteSelected = useCallback(() => {
    setLayers((prev) => prev.filter((l) => !selection.includes(l.id) || l.locked))
    setSelection([])
  }, [selection, setLayers])

  const copySelected = useCallback(() => {
    clipboardRef.current = selectedLayers.map((l) => ({ ...l }))
  }, [selectedLayers])

  const paste = useCallback(() => {
    if (clipboardRef.current.length === 0) return
    setLayers((prev) => {
      const maxZ = Math.max(0, ...prev.map((p) => p.zIndex))
      const copies = clipboardRef.current.map((l, i) => ({ ...l, id: uid('lyr'), x: l.x + 0.03, y: l.y + 0.03, zIndex: maxZ + i + 1 }))
      setSelection(copies.map((c) => c.id))
      return [...prev, ...copies]
    })
  }, [setLayers])

  const groupSelected = useCallback(() => {
    if (selection.length < 2) return
    const groupId = uid('grp')
    patchSelected({ groupId })
  }, [selection, patchSelected])

  const ungroupSelected = useCallback(() => patchSelected({ groupId: undefined }), [patchSelected])

  const reorder = useCallback(
    (direction: 'front' | 'back') => {
      setLayers((prev) => {
        const maxZ = Math.max(0, ...prev.map((p) => p.zIndex))
        const minZ = Math.min(0, ...prev.map((p) => p.zIndex))
        return prev.map((l) =>
          selection.includes(l.id)
            ? { ...l, zIndex: direction === 'front' ? maxZ + 1 : minZ - 1 }
            : l,
        )
      })
    },
    [selection, setLayers],
  )

  const align = useCallback(
    (edge: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
      if (selectedLayers.length === 0) return
      const minX = Math.min(...selectedLayers.map((l) => l.x))
      const maxX = Math.max(...selectedLayers.map((l) => l.x + l.width))
      const minY = Math.min(...selectedLayers.map((l) => l.y))
      const maxY = Math.max(...selectedLayers.map((l) => l.y + l.height))
      const single = selectedLayers.length === 1
      patchSelected((l) => {
        switch (edge) {
          case 'left': return { x: single ? 0.06 : minX }
          case 'right': return { x: single ? 0.94 - l.width : maxX - l.width }
          case 'center-h': return { x: single ? 0.5 - l.width / 2 : (minX + maxX) / 2 - l.width / 2 }
          case 'top': return { y: single ? 0.06 : minY }
          case 'bottom': return { y: single ? 0.94 - l.height : maxY - l.height }
          case 'center-v': return { y: single ? 0.5 - l.height / 2 : (minY + maxY) / 2 - l.height / 2 }
        }
      })
    },
    [selectedLayers, patchSelected],
  )

  const distribute = useCallback(
    (axis: 'h' | 'v') => {
      if (selectedLayers.length < 3) return
      const sorted = [...selectedLayers].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const span = axis === 'h' ? last.x - first.x : last.y - first.y
      const step = span / (sorted.length - 1)
      const positions = new Map(sorted.map((l, i) => [l.id, (axis === 'h' ? first.x : first.y) + step * i]))
      patchSelected((l) => (axis === 'h' ? { x: positions.get(l.id) ?? l.x } : { y: positions.get(l.id) ?? l.y }))
    },
    [selectedLayers, patchSelected],
  )

  const addLayer = useCallback(
    (layer: Omit<TemplateLayer, 'id' | 'zIndex'>) => {
      setLayers((prev) => {
        const created: TemplateLayer = { ...layer, id: uid('lyr'), zIndex: Math.max(0, ...prev.map((p) => p.zIndex)) + 1 }
        setSelection([created.id])
        return [...prev, created]
      })
    },
    [setLayers],
  )

  void historyTick
  return {
    layers,
    setLayers,
    selection,
    select,
    setSelection,
    selectedLayers,
    guides,
    clearGuides,
    canUndo: historyRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    undo,
    redo,
    snapshot,
    patchSelected,
    moveSelected,
    duplicateSelected,
    deleteSelected,
    copySelected,
    paste,
    groupSelected,
    ungroupSelected,
    reorder,
    align,
    distribute,
    addLayer,
  }
}
