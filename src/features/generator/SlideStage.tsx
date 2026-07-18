import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Brush, Check, ChevronLeft, ChevronRight, Maximize2, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BrandLogoOverlay } from '../../components/brand/BrandLogoOverlay'
import { StatusBadge } from '../../components/StatusBadge'
import { versionBaseSrc as versionSrc } from '../../services/rendering/composeSlide'
import { useAiStatusStore } from '../../state/aiStatusStore'
import { activeRoundVersions, isRoundComplete, useProjectStore } from '../../state/projectStore'
import type { DesignStyle, Slide } from '../../types'
import { GENERATION_STAGE_LABELS, RENDER_STRATEGY_LABELS } from '../../types/generation'

/**
 * Overlay de processamento com ETAPAS REAIS do pipeline (aiStatusStore) —
 * o texto só muda quando a etapa muda de verdade; sem progresso por timeout.
 */
function ProcessingOverlay({ slideId, isRevision, requested, ready }: { slideId: string; isRevision: boolean; requested: number; ready: number }) {
  const stage = useAiStatusStore((s) => s.stages[slideId] ?? 'preparing')
  return (
    <div className="stage-processing" role="status" aria-live="polite">
      <div className="stage-processing-scan" aria-hidden="true" />
      <div className="stage-processing-core" aria-hidden="true" />
      <div style={{ textAlign: 'center' }}>
        <div className="stage-processing-title">{isRevision ? 'Revisando o slide' : 'Gerando o slide'}</div>
        <div className="stage-processing-sub">
          {requested > 1 ? `Variações ${Math.min(ready + 1, requested)} de ${requested} · ` : ''}
          {GENERATION_STAGE_LABELS[stage] || 'Processando…'}
        </div>
      </div>
      <div className="stage-skeleton-lines" aria-hidden="true">
        <div className="skeleton" style={{ width: '82%' }} />
        <div className="skeleton" style={{ width: '64%' }} />
        <div className="skeleton" style={{ width: '48%' }} />
      </div>
    </div>
  )
}

const FILE_SOURCE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  renderer: 'Renderer estruturado',
  mock: 'Simulação',
}

/**
 * Seletor de variações — exatamente uma fica ativa por slide. O estado
 * "Selecionada" precisa ser inequívoco (selo + texto + borda), nunca
 * implícito pela posição no carrossel. "Confirmar e avançar" usa
 * currentVersionId, ou seja, exatamente a variação marcada aqui.
 */
function VariationPicker({ slide }: { slide: Slide }) {
  const selectVersion = useProjectStore((s) => s.selectVersion)
  const round = activeRoundVersions(slide)
  const pendingRef = useRef(false)
  if (round.length <= 1 || !isRoundComplete(slide)) return null

  const choose = (versionId: string) => {
    // Trava contra duplo clique/duplo Enter dentro do mesmo ciclo de evento.
    if (pendingRef.current || versionId === slide.currentVersionId) return
    pendingRef.current = true
    selectVersion(slide.id, versionId)
    window.setTimeout(() => {
      pendingRef.current = false
    }, 150)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = event.key === 'ArrowRight' ? (index + 1) % round.length : (index - 1 + round.length) % round.length
    const target = document.getElementById(`variation-${slide.id}-${round[next].id}`)
    target?.focus()
    choose(round[next].id)
  }

  return (
    <div className="variation-picker" role="radiogroup" aria-label="Variações geradas — escolha qual será usada">
      {round.map((version, index) => {
        const src = versionSrc(version)
        const selected = version.id === slide.currentVersionId
        return (
          <button
            key={version.id}
            id={`variation-${slide.id}-${version.id}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            className={`variation-item ${selected ? 'selected' : ''}`}
            tabIndex={selected || round.every((v) => v.id !== slide.currentVersionId) ? 0 : -1}
            onClick={() => choose(version.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            <span className="variation-thumb">
              {src && <img src={src} alt="" width={320} height={180} loading="lazy" decoding="async" draggable={false} />}
              {selected && (
                <span className="variation-check" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="variation-label">
              Variação {version.variationIndex}
              <span className="variation-state">{selected ? ' · Selecionada' : ' · Selecionar'}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface SlideStageProps {
  slide: Slide
  index: number
  total: number
  style: DesignStyle | null
  onOpenMask: () => void
}

/** Preview central 16:9: arte gerada + logos oficiais como camada exata. */
export function SlideStage({ slide, index, total, style, onOpenMask }: SlideStageProps) {
  const setCurrentSlide = useProjectStore((s) => s.setCurrentSlide)
  const retrySlide = useProjectStore((s) => s.retrySlide)
  const [fullscreen, setFullscreen] = useState(false)

  const current = slide.versions.find((v) => v.id === slide.currentVersionId) ?? null
  const src = versionSrc(current)
  const generating = slide.status === 'generating'
  const isRevision = slide.versions.length > 0
  const readyCount = activeRoundVersions(slide).length

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
      if (event.key === 'ArrowRight') setCurrentSlide(index + 1)
      if (event.key === 'ArrowLeft') setCurrentSlide(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, index, setCurrentSlide])

  return (
    <div className="stage-block">
      <div className="stage-frame">
        <AnimatePresence mode="wait">
          {src && !generating && slide.status !== 'error' && (
            <motion.img
              key={slide.currentVersionId}
              src={src}
              alt={`Slide ${index + 1}: ${slide.plan.title}`}
              initial={{ opacity: 0, scale: 1.01 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
        </AnimatePresence>

        {src && !generating && slide.status !== 'error' && <BrandLogoOverlay style={style} />}

        {current && !generating && slide.status !== 'error' && (
          <div className="stage-strategy-badges" aria-label="Estratégia e origem desta versão">
            <span className="badge badge-cyan">
              {RENDER_STRATEGY_LABELS[current.strategy ?? 'structured']}
            </span>
            <span className={`badge ${current.fileSource === 'mock' ? 'badge-warning' : current.fileSource === 'openai' ? 'badge-success' : 'badge-neutral'}`}>
              {FILE_SOURCE_LABELS[current.fileSource ?? 'renderer']}
            </span>
          </div>
        )}

        {generating && (
          <ProcessingOverlay slideId={slide.id} isRevision={isRevision} requested={slide.requestedVariations} ready={readyCount} />
        )}

        {slide.status === 'error' && (
          <div className="stage-error" role="alert">
            <div className="stage-error-icon">
              <AlertTriangle size={24} aria-hidden="true" />
            </div>
            <h4>Falha na geração</h4>
            <p>{slide.error ?? 'Algo interrompeu a geração deste slide.'}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => retrySlide(slide.id)}>
              <RefreshCw size={14} aria-hidden="true" /> Tentar novamente
            </button>
          </div>
        )}

        {!src && !generating && slide.status === 'pending' && (
          <div className="stage-processing">
            <div className="stage-processing-sub">Aguardando a vez deste slide na fila de geração…</div>
          </div>
        )}

        {src && !generating && (
          <div className="stage-tools">
            <button
              type="button"
              className="btn-icon"
              data-tip="Marcar área para editar"
              aria-label="Marcar área para editar"
              onClick={onOpenMask}
            >
              <Brush size={15} />
            </button>
            <button
              type="button"
              className="btn-icon"
              data-tip="Tela cheia (F)"
              aria-label="Ver em tela cheia"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 size={15} />
            </button>
          </div>
        )}
      </div>

      <VariationPicker slide={slide} />

      <div className="stage-caption">
        <button
          type="button"
          className="btn-icon"
          aria-label="Slide anterior"
          data-tip="Anterior (←)"
          disabled={index === 0}
          onClick={() => setCurrentSlide(index - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <h3 title={slide.plan.title}>
          {String(index + 1).padStart(2, '0')} · {slide.plan.title}
        </h3>
        <span className="spacer" />
        <StatusBadge status={slide.status} />
        <button
          type="button"
          className="btn-icon"
          aria-label="Próximo slide"
          data-tip="Próximo (→)"
          disabled={index >= total - 1}
          onClick={() => setCurrentSlide(index + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <AnimatePresence>
        {fullscreen && src && (
          <motion.div
            className="fullscreen-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Slide ${index + 1} em tela cheia`}
          >
            <div className="fullscreen-frame">
              <img src={src} alt={`Slide ${index + 1}: ${slide.plan.title}`} />
              <BrandLogoOverlay style={style} />
            </div>
            <div className="bar">
              <span>
                {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} — {slide.plan.title}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFullscreen(false)}>
                <X size={14} aria-hidden="true" /> Fechar (Esc)
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
