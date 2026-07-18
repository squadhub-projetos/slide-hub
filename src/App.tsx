import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Background } from './components/Background'
import { CommandPalette } from './components/CommandPalette'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { initSyncEngine } from './services/cloud/syncEngine'
import { runMigrations } from './services/storage/migrations'
import { useAiStatusStore } from './state/aiStatusStore'
import { useAttachmentStore } from './state/attachmentStore'
import { useLibraryStore } from './state/libraryStore'
import { useProjectStore } from './state/projectStore'
import { useSnippetStore } from './state/snippetStore'
import { useStyleStore } from './state/styleStore'
import { useTemplateStore } from './state/templateStore'
import { useUiStore } from './state/uiStore'
import './components/components.css'
import './features/planner/planner.css'
import './features/generator/generator.css'
import './features/styles/styles.css'

// Code splitting: cada área carrega sob demanda (o editor de templates,
// exportadores e a máscara já são lazy dentro das suas áreas).
const PlannerView = lazy(() => import('./features/planner/PlannerView').then((m) => ({ default: m.PlannerView })))
const GeneratorView = lazy(() => import('./features/generator/GeneratorView').then((m) => ({ default: m.GeneratorView })))
const LibraryView = lazy(() => import('./features/library/LibraryView').then((m) => ({ default: m.LibraryView })))

const VIEWS = {
  planner: PlannerView,
  generator: GeneratorView,
  styles: LibraryView,
} as const

function ViewFallback() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <div className="skeleton" style={{ width: 'min(880px, 80%)', height: 320, borderRadius: 18 }} />
    </div>
  )
}

function App() {
  const tab = useUiStore((s) => s.tab)
  const uiHydrated = useUiStore((s) => s.hydrated)
  const projectHydrated = useProjectStore((s) => s.hydrated)
  const stylesHydrated = useStyleStore((s) => s.hydrated)
  const hydrated = uiHydrated && projectHydrated && stylesHydrated
  const bootRef = useRef(false)

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    void (async () => {
      // Migração de schema antes de qualquer hidratação — projetos e
      // estilos criados em versões anteriores continuam abrindo.
      await runMigrations()
      await Promise.all([
        useUiStore.getState().hydrate(),
        useStyleStore.getState().hydrate(),
        useProjectStore.getState().hydrate(),
        useAttachmentStore.getState().hydrate(),
        useTemplateStore.getState().hydrate(),
        useSnippetStore.getState().hydrate(),
        useLibraryStore.getState().hydrate(),
      ])
      void useAiStatusStore.getState().check()
      void initSyncEngine()
      const ui = useUiStore.getState()
      const project = useProjectStore.getState().project
      if (project && project.phase === 'working') {
        ui.toast('info', 'Sessão restaurada', `“${project.name}” foi recuperado de onde você parou.`)
      } else if (!ui.prefs.onboarded) {
        ui.toast('info', 'Bem-vindo ao Slide Hub', 'Comece planejando com IA na aba Planejar ou vá direto em Gerar Slides.')
        ui.markOnboarded()
      }
    })()
  }, [])

  const View = VIEWS[tab]

  return (
    <MotionConfig reducedMotion="user">
      <Background />
      <TopBar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {hydrated && (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<ViewFallback />}>
                <View />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <Toasts />
      <ConfirmDialog />
      <CommandPalette />
    </MotionConfig>
  )
}

export default App
