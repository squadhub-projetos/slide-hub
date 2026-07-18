import { CheckCircle2, ChevronDown, FileDown, FolderArchive, Loader2, PencilLine, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useExport } from '../../hooks/useExport'
import { currentVersionOf, useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import type { DeckProject } from '../../types'
import { sanitizeFileName } from '../../utils/filename'
import { formatDuration } from '../../utils/time'
import { versionBaseSrc as versionSrc } from '../../services/rendering/composeSlide'

/**
 * Entrega final: cabeçalho com contexto, preview navegável dos slides,
 * exportação como ação dominante e resumo textual (sem grade de cards).
 */
export function CompletionView({ project }: { project: DeckProject }) {
  const patchProject = useProjectStore((s) => s.patchProject)
  const reopenProject = useProjectStore((s) => s.reopenProject)
  const setCurrentSlide = useProjectStore((s) => s.setCurrentSlide)
  const getById = useStyleStore((s) => s.getById)
  const { state, run } = useExport()
  const [fileName, setFileName] = useState(project.fileName)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)

  const style = getById(project.styleId)
  const duration =
    project.stats.startedAt && project.stats.finishedAt
      ? formatDuration(new Date(project.stats.finishedAt).getTime() - new Date(project.stats.startedAt).getTime())
      : null
  const finishedAt = project.stats.finishedAt
    ? new Date(project.stats.finishedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  const exportAs = (format: 'pptx' | 'zip') => {
    const clean = sanitizeFileName(fileName)
    setFileName(clean)
    patchProject({ fileName: clean })
    void run(format, project.slides, clean)
  }

  const busy = state.status === 'preparing'

  /** Reabre a revisão direto no slide clicado. */
  const reviewSlide = (index: number) => {
    reopenProject()
    setCurrentSlide(index)
  }

  const summaryParts = [
    `${project.slides.length} slides`,
    `${project.stats.manualApprovals + project.stats.autoApprovals} aprovados`,
    `${project.stats.revisions} ${project.stats.revisions === 1 ? 'revisão' : 'revisões'}`,
    duration ? `sessão de ${duration}` : null,
  ].filter(Boolean)

  const zoomSlide = zoomIndex !== null ? project.slides[zoomIndex] : null
  const zoomSrc = zoomSlide ? versionSrc(currentVersionOf(zoomSlide)) : null

  return (
    <section className="panel completion" aria-label="Apresentação concluída">
      <header className="completion-head">
        <span className="completion-check" aria-hidden="true">
          <CheckCircle2 size={22} />
        </span>
        <div className="completion-head-copy">
          <h2>{project.name}</h2>
          <p>
            Sua apresentação está pronta.
            {finishedAt && <> Última versão em {finishedAt}.</>}
            {style && <> Estilo {style.name}.</>}
          </p>
        </div>
      </header>

      <div className="completion-grid" role="list" aria-label="Slides finais">
        {project.slides.map((slide, index) => {
          const src = versionSrc(currentVersionOf(slide))
          return (
            <div className="completion-slide" role="listitem" key={slide.id}>
              <button
                type="button"
                className="completion-slide-thumb"
                aria-label={`Ampliar slide ${index + 1}: ${slide.plan.title}`}
                onClick={() => setZoomIndex(index)}
              >
                {src ? <img src={src} alt="" loading="lazy" width={320} height={180} /> : <span className="completion-slide-empty" />}
                <span className="completion-slide-n">{String(index + 1).padStart(2, '0')}</span>
              </button>
              <button
                type="button"
                className="completion-slide-edit"
                aria-label={`Revisar slide ${index + 1}`}
                data-tip="Voltar à revisão deste slide"
                onClick={() => reviewSlide(index)}
              >
                <PencilLine size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="completion-actions">
        <div className="completion-file">
          <label htmlFor="export-name">Arquivo</label>
          <input
            id="export-name"
            className="field-control"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onBlur={() => setFileName(sanitizeFileName(fileName))}
          />
        </div>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => exportAs('pptx')}>
          {busy && state.format === 'pptx' ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <FileDown size={16} aria-hidden="true" />
          )}
          {busy && state.format === 'pptx'
            ? `Preparando ${Math.round(state.progress * 100)}%`
            : 'Exportar PPTX'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => exportAs('zip')}>
          {busy && state.format === 'zip' ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : (
            <FolderArchive size={15} aria-hidden="true" />
          )}
          {busy && state.format === 'zip'
            ? `Compactando ${Math.round(state.progress * 100)}%`
            : 'Exportar ZIP'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reopenProject}>
          <Undo2 size={14} aria-hidden="true" /> Voltar para a revisão
        </button>
      </div>

      <footer className="completion-summary">
        <span>{summaryParts.join(' · ')}</span>
        <button
          type="button"
          className="completion-details-toggle"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          Detalhes da sessão
          <ChevronDown size={13} className={`adv-chevron ${detailsOpen ? 'open' : ''}`} aria-hidden="true" />
        </button>
      </footer>
      {detailsOpen && (
        <dl className="completion-details">
          <div><dt>Aprovações manuais</dt><dd>{project.stats.manualApprovals}</dd></div>
          <div><dt>Aprovações automáticas</dt><dd>{project.stats.autoApprovals}</dd></div>
          <div><dt>Revisões solicitadas</dt><dd>{project.stats.revisions}</dd></div>
          <div><dt>Duração da sessão</dt><dd>{duration ?? '—'}</dd></div>
          <div><dt>Estilo</dt><dd>{style?.name ?? 'Padrão'}</dd></div>
          <div><dt>Idioma</dt><dd>{project.language}</dd></div>
        </dl>
      )}

      {zoomSlide && zoomSrc && (
        <div
          className="fullscreen-viewer"
          role="dialog"
          aria-label={`Slide ${(zoomIndex ?? 0) + 1} ampliado`}
          onClick={() => setZoomIndex(null)}
        >
          <div className="fullscreen-frame">
            <img src={zoomSrc} alt={zoomSlide.plan.title} />
          </div>
          <div className="bar">
            <span>
              {String((zoomIndex ?? 0) + 1).padStart(2, '0')} · {zoomSlide.plan.title}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                reviewSlide(zoomIndex ?? 0)
              }}
            >
              <PencilLine size={13} aria-hidden="true" /> Revisar este slide
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoomIndex(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
