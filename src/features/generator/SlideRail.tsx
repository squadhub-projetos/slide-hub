import { Reorder } from 'framer-motion'
import { Copy, ImageIcon, RefreshCw, Trash2 } from 'lucide-react'
import { memo, type KeyboardEvent } from 'react'
import { currentVersionOf, useProjectStore } from '../../state/projectStore'
import { useUiStore } from '../../state/uiStore'
import type { Slide } from '../../types'
import { statusLabel } from '../../utils/slideStatus'
import { versionBaseSrc as versionSrc } from '../../services/rendering/composeSlide'

interface RailItemProps {
  slide: Slide
  index: number
  active: boolean
  onSelect: (index: number) => void
  onDuplicate: (slideId: string) => void
  onRegenerate: (slideId: string) => void
  onDeleteRequest: (slide: Slide, index: number) => void
}

/**
 * Linha memoizada do trilho: só rerenderiza quando SEU slide muda (status,
 * versão atual) ou o índice ativo muda — evita que a lista inteira
 * rerenderize a cada tick de geração de um único slide.
 */
const RailItem = memo(function RailItem({
  slide,
  index,
  active,
  onSelect,
  onDuplicate,
  onRegenerate,
  onDeleteRequest,
}: RailItemProps) {
  const src = versionSrc(currentVersionOf(slide))

  return (
    <Reorder.Item
      as="li"
      value={slide}
      className={`rail-item ${active ? 'active' : ''}`}
      whileDrag={{ scale: 1.03, zIndex: 5 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(index)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(index)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Slide ${index + 1}: ${slide.plan.title} — ${statusLabel(slide.status)}`}
      aria-current={active ? 'true' : undefined}
    >
      <div className="rail-thumb">
        {src ? (
          <img src={src} alt="" width={320} height={180} loading="lazy" decoding="async" draggable={false} />
        ) : slide.status === 'generating' ? (
          <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
        ) : (
          <div className="rail-thumb-placeholder">
            <ImageIcon size={17} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="rail-meta">
        <span className="rail-n">{String(index + 1).padStart(2, '0')}</span>
        <span className="rail-title">{slide.plan.title}</span>
        <span className={`rail-status-dot ${slide.status}`} title={statusLabel(slide.status)} />
      </div>
      <div className="rail-actions">
        <button
          type="button"
          className="btn-icon"
          data-tip="Duplicar"
          aria-label={`Duplicar slide ${index + 1}`}
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate(slide.id)
          }}
        >
          <Copy size={13} />
        </button>
        {slide.versions.length > 0 && (
          <button
            type="button"
            className="btn-icon"
            data-tip="Regenerar"
            aria-label={`Regenerar slide ${index + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              onRegenerate(slide.id)
            }}
          >
            <RefreshCw size={13} />
          </button>
        )}
        <button
          type="button"
          className="btn-icon"
          data-tip="Excluir"
          aria-label={`Excluir slide ${index + 1}`}
          onClick={(e) => {
            e.stopPropagation()
            onDeleteRequest(slide, index)
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </Reorder.Item>
  )
})

/** Trilho lateral: thumbnails numeradas, status, reordenação e ações rápidas. */
export function SlideRail({ slides, currentIndex }: { slides: Slide[]; currentIndex: number }) {
  const setCurrentSlide = useProjectStore((s) => s.setCurrentSlide)
  const patchProject = useProjectStore((s) => s.patchProject)
  const duplicateSlide = useProjectStore((s) => s.duplicateSlide)
  const regenerateSlide = useProjectStore((s) => s.regenerateSlide)
  const deleteSlide = useProjectStore((s) => s.deleteSlide)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const toast = useUiStore((s) => s.toast)

  const onReorder = (next: Slide[]) => {
    const currentId = slides[currentIndex]?.id
    patchProject({
      slides: next,
      currentSlideIndex: Math.max(0, next.findIndex((s) => s.id === currentId)),
    })
  }

  const onDuplicate = (slideId: string) => {
    duplicateSlide(slideId)
    toast('success', 'Slide duplicado')
  }

  const onDeleteRequest = (slide: Slide, index: number) => {
    requestConfirm({
      title: `Excluir o slide ${index + 1}?`,
      message: `“${slide.plan.title}” e todas as suas versões serão removidos. A numeração dos demais slides será atualizada.`,
      confirmLabel: 'Excluir slide',
      danger: true,
      onConfirm: () => {
        deleteSlide(slide.id)
        toast('success', 'Slide excluído')
      },
    })
  }

  return (
    <aside className="panel slide-rail" aria-label="Slides da apresentação">
      <Reorder.Group as="ol" axis="y" values={slides} onReorder={onReorder} className="slide-rail-list">
        {slides.map((slide, index) => (
          <RailItem
            key={slide.id}
            slide={slide}
            index={index}
            active={index === currentIndex}
            onSelect={setCurrentSlide}
            onDuplicate={onDuplicate}
            onRegenerate={regenerateSlide}
            onDeleteRequest={onDeleteRequest}
          />
        ))}
      </Reorder.Group>
      <div className="rail-drag-hint">Arraste para reordenar</div>
    </aside>
  )
}
