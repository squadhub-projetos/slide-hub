import { AnimatePresence, motion } from 'framer-motion'
import { Command, CornerDownLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useUiStore } from '../state/uiStore'

interface PaletteAction {
  id: string
  label: string
  hint?: string
  run: () => void
}

/** Command palette (Ctrl/Cmd+K) com busca e navegação por teclado. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const setTab = useUiStore((s) => s.setTab)
  const toast = useUiStore((s) => s.toast)

  const actions = useMemo<PaletteAction[]>(() => {
    const go = (tab: 'planner' | 'generator' | 'styles', message?: string) => () => {
      setTab(tab)
      if (message) toast('info', message)
    }
    return [
      { id: 'new-project', label: 'Novo projeto', run: () => { useProjectStore.getState().newProject(); setTab('generator') } },
      { id: 'plan', label: 'Planejar apresentação', run: go('planner') },
      { id: 'generate', label: 'Gerar slide atual', hint: 'abre a aba Gerar Slides', run: go('generator') },
      { id: 'choose-template', label: 'Escolher template', hint: 'Biblioteca → Templates', run: go('styles') },
      { id: 'apply-snippet', label: 'Aplicar snippet', hint: 'Biblioteca → Snippets', run: go('styles') },
      { id: 'insert-asset', label: 'Inserir ativo', hint: 'Biblioteca → Ativos', run: go('styles') },
      { id: 'create-template', label: 'Criar template', run: go('styles') },
      { id: 'create-snippet', label: 'Criar snippet', run: go('styles') },
      { id: 'open-library', label: 'Abrir biblioteca', run: go('styles') },
      { id: 'export-pptx', label: 'Exportar PPTX', hint: 'na tela de conclusão', run: go('generator') },
      { id: 'export-zip', label: 'Exportar ZIP', hint: 'na tela de conclusão', run: go('generator') },
      { id: 'sync', label: 'Sincronizar com a nuvem', run: () => window.dispatchEvent(new CustomEvent('slidehub:open-sync')) },
      { id: 'settings', label: 'Abrir configurações', hint: 'menu do topo', run: () => toast('info', 'Configurações', 'Use o menu (seta) no canto superior direito.') },
    ]
  }, [setTab, toast])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => `${a.label} ${a.hint ?? ''}`.toLowerCase().includes(q))
  }, [actions, query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((v) => !v)
        setQuery('')
        setIndex(0)
      } else if (open && event.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpen = () => {
      setOpen(true)
      setQuery('')
      setIndex(0)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('slidehub:open-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('slidehub:open-palette', onOpen)
    }
  }, [open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  useEffect(() => setIndex(0), [query])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="palette-input">
              <Command size={15} aria-hidden="true" />
              <input
                ref={inputRef}
                placeholder="O que você quer fazer?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setIndex((i) => Math.min(i + 1, filtered.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setIndex((i) => Math.max(i - 1, 0))
                  } else if (e.key === 'Enter' && filtered[index]) {
                    filtered[index].run()
                    setOpen(false)
                  }
                }}
                aria-label="Buscar ação"
              />
              <kbd>Esc</kbd>
            </div>
            <ul className="palette-list" role="listbox">
              {filtered.length === 0 && <li className="palette-empty">Nenhuma ação encontrada.</li>}
              {filtered.map((action, i) => (
                <li key={action.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    className={`palette-item ${i === index ? 'on' : ''}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => {
                      action.run()
                      setOpen(false)
                    }}
                  >
                    <span>{action.label}</span>
                    {action.hint && <small>{action.hint}</small>}
                    {i === index && <CornerDownLeft size={13} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
