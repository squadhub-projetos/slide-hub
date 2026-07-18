import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Cloud, CloudOff, Command, Plus, Sparkles, Timer, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { projectRepository } from '../services/storage/repositories'
import { aiModeLabel, useAiStatusStore } from '../state/aiStatusStore'
import { useProjectStore } from '../state/projectStore'
import { useSyncStore } from '../state/syncStore'
import { useUiStore, type Tab } from '../state/uiStore'
import { SYNC_STATUS_LABELS } from '../types/sync'
import { relativeTime } from '../utils/time'
import { AiDiagnosticsPanel } from './ai/AiDiagnosticsPanel'
import { Logo } from './Logo'
import { SyncPanel } from './sync/SyncPanel'
import { Tooltip } from './Tooltip'

const TABS: { id: Tab; label: string }[] = [
  { id: 'planner', label: 'Planejar' },
  { id: 'generator', label: 'Gerar Slides' },
  { id: 'styles', label: 'Estilos' },
]

const PHASE_LABEL = {
  setup: { label: 'Configuração', className: 'badge-neutral' },
  working: { label: 'Em produção', className: 'badge-cyan' },
  complete: { label: 'Concluído', className: 'badge-success' },
} as const

const TIMER_OPTIONS = [
  { seconds: 90, label: '90 segundos (padrão)' },
  { seconds: 30, label: '30 segundos' },
  { seconds: 10, label: '10 segundos (testes)' },
]

const AI_MODE_HINTS: Record<string, string> = {
  ready: 'A IA está configurada e pronta para chamadas reais.',
  'missing-key': 'OPENAI_API_KEY ausente no servidor — configure para usar IA real.',
  unreachable: 'Não foi possível confirmar a configuração do servidor de IA.',
  checking: 'Verificando a configuração do provedor de IA…',
}

/** Indicador do modo de IA: IA real / Simulação / Configuração incompleta / API indisponível. Clique abre o diagnóstico. */
function AiModeChip({ onOpen }: { onOpen: () => void }) {
  const readiness = useAiStatusStore((s) => s.readiness)
  const { label, tone } = aiModeLabel(readiness)
  const cls = tone === 'ok' ? 'badge-success' : tone === 'warn' ? 'badge-warning' : 'badge-danger'
  const hint = label === 'Simulação' ? 'Modo simulação: nenhuma chamada real é feita à IA. Clique para ver o diagnóstico.' : `${AI_MODE_HINTS[readiness]} Clique para ver o diagnóstico.`
  return (
    <Tooltip label={hint} side="bottom">
      <button type="button" className={`badge ${cls} sync-chip`} onClick={onOpen}>
        <Sparkles size={10} aria-hidden="true" /> {label}
      </button>
    </Tooltip>
  )
}

/** Estado de sincronização com a nuvem — abre o painel de sync. */
function SyncChip({ onOpen }: { onOpen: () => void }) {
  const overall = useSyncStore((s) => s.overall)
  const pending = useSyncStore((s) => s.pendingCount)
  const online = useSyncStore((s) => s.online)
  const cls =
    overall === 'synced' ? 'badge-success'
    : overall === 'error' || overall === 'conflict' ? 'badge-danger'
    : overall === 'syncing' || overall === 'pending' ? 'badge-warning'
    : 'badge-neutral'
  return (
    <Tooltip label="Ver detalhes da sincronização com a nuvem" side="bottom">
      <button type="button" className={`badge ${cls} sync-chip`} onClick={onOpen} aria-label="Sincronização com a nuvem">
        {online ? <Cloud size={10} aria-hidden="true" /> : <CloudOff size={10} aria-hidden="true" />}
        {SYNC_STATUS_LABELS[overall]}
        {pending > 0 ? ` (${pending})` : ''}
      </button>
    </Tooltip>
  )
}

function SaveIndicator() {
  const saveState = useUiStore((s) => s.saveState)
  const lastSavedAt = useUiStore((s) => s.lastSavedAt)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => forceTick((v) => v + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const label =
    saveState === 'saving'
      ? 'Salvando…'
      : lastSavedAt
        ? `Salvo ${relativeTime(new Date(lastSavedAt).toISOString())}`
        : 'Salvamento local'

  return (
    <span className={`topbar-save ${saveState === 'saving' ? 'saving' : ''}`} aria-live="polite">
      <span className="pulse" aria-hidden="true" />
      {label}
    </span>
  )
}

export function TopBar() {
  const tab = useUiStore((s) => s.tab)
  const setTab = useUiStore((s) => s.setTab)
  const prefs = useUiStore((s) => s.prefs)
  const setApprovalSeconds = useUiStore((s) => s.setApprovalSeconds)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const toast = useUiStore((s) => s.toast)
  const project = useProjectStore((s) => s.project)
  const newProject = useProjectStore((s) => s.newProject)
  const [menuOpen, setMenuOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [aiDiagOpen, setAiDiagOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const phase = project ? PHASE_LABEL[project.phase] : null

  const handleNewProject = () => {
    const create = () => {
      newProject()
      setTab('generator')
      toast('info', 'Novo projeto criado', 'Configure a apresentação ou comece pela aba Planejar.')
    }
    if (project && project.slides.some((s) => s.versions.length > 0) && project.phase !== 'complete') {
      requestConfirm({
        title: 'Começar um novo projeto?',
        message: 'O projeto atual ainda está em andamento e será substituído. Essa ação não pode ser desfeita.',
        confirmLabel: 'Substituir projeto',
        danger: true,
        onConfirm: create,
      })
    } else {
      create()
    }
  }

  /** Navegação por setas no padrão tablist. */
  const onTabsKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const index = TABS.findIndex((t) => t.id === tab)
    const next =
      event.key === 'ArrowRight' ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabsRef.current?.querySelectorAll('button')[next]?.focus()
  }

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="brand">
          <Logo />
          <span className="brand-name">
            Slide<span>Hub</span>
          </span>
        </div>

        <div className="topbar-project">
          {project && (
            <>
              <span className="topbar-project-name" title={project.name}>
                {project.name}
              </span>
              {phase && <span className={`badge ${phase.className}`}>{phase.label}</span>}
            </>
          )}
        </div>

        <span className="topbar-spacer" aria-hidden="true" />

        <div className="topbar-status">
          <AiModeChip onOpen={() => setAiDiagOpen(true)} />
          <SyncChip onOpen={() => setSyncOpen(true)} />
          <SaveIndicator />
        </div>

        <div className="topbar-actions">
          <Tooltip label="Command palette (Ctrl+K)" side="bottom">
            <button
              type="button"
              className="btn-icon"
              aria-label="Abrir command palette"
              onClick={() => window.dispatchEvent(new CustomEvent('slidehub:open-palette'))}
            >
              <Command size={15} />
            </button>
          </Tooltip>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleNewProject}>
            <Plus size={15} aria-hidden="true" />
            Novo projeto
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <Tooltip label="Mais ações" side="bottom">
              <button
                type="button"
                className="btn-icon"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Mais ações"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <ChevronDown size={17} style={{ transform: menuOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </button>
            </Tooltip>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="menu-pop"
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <h5>
                    <Timer size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true" />
                    Timer de aprovação (dev)
                  </h5>
                  {TIMER_OPTIONS.map((opt) => (
                    <button
                      key={opt.seconds}
                      type="button"
                      role="menuitemradio"
                      aria-checked={prefs.approvalSeconds === opt.seconds}
                      className="menu-item"
                      onClick={() => {
                        setApprovalSeconds(opt.seconds)
                        setMenuOpen(false)
                      }}
                    >
                      {opt.label}
                      {prefs.approvalSeconds === opt.seconds && <Check size={14} className="check" aria-hidden="true" />}
                    </button>
                  ))}
                  <h5>Dados</h5>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item danger"
                    onClick={() => {
                      setMenuOpen(false)
                      requestConfirm({
                        title: 'Descartar projeto atual?',
                        message: 'Todos os slides e o histórico do planner deste projeto serão removidos do armazenamento local.',
                        confirmLabel: 'Descartar projeto',
                        danger: true,
                        onConfirm: () => {
                          void projectRepository.clear().then(() => {
                            useProjectStore.setState({ project: null })
                            toast('success', 'Projeto descartado')
                          })
                        },
                      })
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Descartar projeto atual
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Segundo nível: seções principais como abas largas integradas ao
          conteúdo (referência: editor do n8n) — sem pílulas. */}
      <nav
        className="topbar-tabs"
        role="tablist"
        aria-label="Áreas do Slide Hub"
        ref={tabsRef}
        onKeyDown={onTabsKeyDown}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={`topbar-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
      <AiDiagnosticsPanel open={aiDiagOpen} onClose={() => setAiDiagOpen(false)} />
    </header>
  )
}
