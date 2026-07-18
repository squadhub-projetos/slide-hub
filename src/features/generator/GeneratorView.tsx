import { motion } from 'framer-motion'
import { LayoutGrid, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { MaskEditor } from '../../components/canvas-editor/MaskEditor'
import { useSlideGeneration } from '../../hooks/useSlideGeneration'
import { currentVersionOf, isApproved, useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import { useUiStore } from '../../state/uiStore'
import { versionBaseSrc as versionSrc } from '../../services/rendering/composeSlide'
import { CompletionView } from './CompletionView'
import { ReviewPanel } from './ReviewPanel'
import { RevisionComposer } from './RevisionComposer'
import { SetupForm } from './SetupForm'
import { SlideRail } from './SlideRail'
import { SlideStage } from './SlideStage'

function parseResolution(resolution: string): { width: number; height: number } {
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(resolution)
  if (!match) return { width: 1600, height: 900 }
  return { width: Number(match[1]), height: Number(match[2]) }
}

function Workspace() {
  const project = useProjectStore((s) => s.project)!
  const setCurrentSlide = useProjectStore((s) => s.setCurrentSlide)
  const getById = useStyleStore((s) => s.getById)
  const getDefault = useStyleStore((s) => s.getDefault)
  const { revise } = useSlideGeneration()

  const [composerOpen, setComposerOpen] = useState(false)
  const [maskOpen, setMaskOpen] = useState(false)
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null)

  const slides = project.slides
  const index = Math.min(project.currentSlideIndex, slides.length - 1)
  const slide = slides[index]
  const style = getById(project.styleId) ?? getDefault()
  const approvedCount = slides.filter(isApproved).length
  const remainingToApprove = slides.filter((s) => !isApproved(s) && s.id !== slide?.id).length

  // Ao trocar de slide, fecha o composer e descarta a máscara pendente.
  useEffect(() => {
    setComposerOpen(false)
    setMaskDataUrl(null)
    setMaskOpen(false)
  }, [slide?.id])

  // Atalhos de teclado do workspace (ignorados durante digitação).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (event.key === 'ArrowRight') setCurrentSlide(index + 1)
      if (event.key === 'ArrowLeft') setCurrentSlide(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, setCurrentSlide])

  if (!slide) return null

  const current = currentVersionOf(slide)
  const currentSrc = versionSrc(current)
  const dims = current ? parseResolution(current.resolution) : { width: 1600, height: 900 }

  return (
    <>
      <div className="gen-progress" aria-label={`Progresso: ${approvedCount} de ${slides.length} slides aprovados`}>
        <span className="gen-progress-label">Progresso geral</span>
        <div className="gen-progress-track">
          {/* transform (compositor-only) em vez de width (layout) */}
          <motion.div
            className="gen-progress-bar"
            style={{ transformOrigin: 'left' }}
            initial={false}
            animate={{ scaleX: approvedCount / Math.max(slides.length, 1) }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="gen-progress-label mono">
          {approvedCount} / {slides.length} aprovados
        </span>
      </div>

      <div className="gen-workspace">
        <SlideRail slides={slides} currentIndex={index} />

        <section className="stage" aria-label={`Slide ${index + 1} de ${slides.length}`}>
          <SlideStage
            slide={slide}
            index={index}
            total={slides.length}
            style={style}
            onOpenMask={() => currentSrc && setMaskOpen(true)}
          />
          <RevisionComposer
            slide={slide}
            open={composerOpen}
            defaultVariations={1}
            maskDataUrl={maskDataUrl}
            onOpenMask={() => currentSrc && setMaskOpen(true)}
            onClearMask={() => setMaskDataUrl(null)}
            onClose={() => setComposerOpen(false)}
            onSubmit={(instructions, options) => revise(slide.id, instructions, options)}
          />
        </section>

        <ReviewPanel
          slide={slide}
          isLast={remainingToApprove === 0}
          composerOpen={composerOpen}
          externallyPaused={maskOpen}
          onToggleComposer={() => setComposerOpen((v) => !v)}
        />
      </div>

      {currentSrc && (
        <MaskEditor
          open={maskOpen}
          imageSrc={currentSrc}
          imageWidth={dims.width}
          imageHeight={dims.height}
          onCancel={() => setMaskOpen(false)}
          onApply={(mask) => {
            setMaskDataUrl(mask)
            setMaskOpen(false)
            setComposerOpen(true)
          }}
        />
      )}
    </>
  )
}

export function GeneratorView() {
  const project = useProjectStore((s) => s.project)
  const newProject = useProjectStore((s) => s.newProject)
  const setTab = useUiStore((s) => s.setTab)

  if (!project) {
    return (
      <div className="generator" style={{ justifyContent: 'center' }}>
        <div className="panel" style={{ maxWidth: 640, margin: '0 auto' }}>
          <EmptyState
            icon={LayoutGrid}
            title="Nenhum projeto por aqui ainda"
            description="Crie um projeto para gerar slides diretamente, ou comece pela aba Planejar para estruturar a apresentação com IA."
            actions={
              <>
                <button type="button" className="btn btn-primary" onClick={() => newProject()}>
                  Criar projeto
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setTab('planner')}>
                  <Sparkles size={15} aria-hidden="true" /> Planejar com IA
                </button>
              </>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="generator">
      {project.phase === 'setup' && <SetupForm key={project.id} project={project} />}
      {project.phase === 'working' && <Workspace />}
      {project.phase === 'complete' && <CompletionView project={project} />}
    </div>
  )
}
