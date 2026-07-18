import { AlertTriangle, Check, GitCompare, History, Info, PenLine, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { ProgressRing } from '../../components/ProgressRing'
import { StatusBadge } from '../../components/StatusBadge'
import { useApprovalTimer } from '../../hooks/useApprovalTimer'
import { currentVersionOf, isRoundComplete, useProjectStore } from '../../state/projectStore'
import { useTemplateStore } from '../../state/templateStore'
import { useUiStore } from '../../state/uiStore'
import type { RenderStrategy, Slide, SlideVersion } from '../../types'
import { RENDER_STRATEGY_LABELS } from '../../types/generation'
import { shortHash } from '../../utils/hash'
import { relativeTime } from '../../utils/time'
import { versionBaseSrc as versionSrc } from '../../services/rendering/composeSlide'

const FILE_SOURCE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  renderer: 'Renderer estruturado',
  mock: 'Simulação',
}

/** Seletores de estratégia e template do slide (aplicados na próxima geração). */
function StrategyControls({ slide }: { slide: Slide }) {
  const project = useProjectStore((s) => s.project)
  const patchSlide = useProjectStore((s) => s.patchSlide)
  const regenerateSlide = useProjectStore((s) => s.regenerateSlide)
  const overrides = useTemplateStore((s) => s.overrides)
  const userTemplates = useTemplateStore((s) => s.userTemplates)
  // Recalcula a lista estável quando overrides/userTemplates mudam.
  const templates = useMemo(() => {
    void overrides
    void userTemplates
    return useTemplateStore.getState().all()
  }, [overrides, userTemplates])
  if (!project) return null
  const strategy = slide.plan.renderStrategy ?? project.plannerConfig.defaultStrategy
  const templateChoice = slide.plan.templateId === null ? 'none' : (slide.plan.templateId ?? 'auto')
  const styleTemplates = templates.filter((t) => t.styleId === project.styleId || !t.styleId)

  const updatePlan = (patch: Partial<Slide['plan']>) =>
    patchSlide(slide.id, { plan: { ...slide.plan, ...patch } })

  return (
    <div className="review-block">
      <h4>Estratégia de renderização</h4>
      <select
        className="field-control"
        value={strategy}
        aria-label="Estratégia de renderização"
        onChange={(e) => updatePlan({ renderStrategy: e.target.value as RenderStrategy })}
      >
        {(Object.keys(RENDER_STRATEGY_LABELS) as RenderStrategy[]).map((s) => (
          <option key={s} value={s}>{RENDER_STRATEGY_LABELS[s]}</option>
        ))}
      </select>
      {strategy !== 'ai-generated' && (
        <select
          className="field-control"
          style={{ marginTop: 8 }}
          value={templateChoice}
          aria-label="Template do slide"
          onChange={(e) =>
            updatePlan({ templateId: e.target.value === 'none' ? null : e.target.value === 'auto' ? undefined : e.target.value })
          }
        >
          <option value="auto">Template automático</option>
          <option value="none">Sem template</option>
          {styleTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 8, width: '100%' }}
        onClick={() => regenerateSlide(slide.id)}
      >
        <RefreshCw size={13} aria-hidden="true" /> Regenerar com esta configuração
      </button>
    </div>
  )
}

interface ReviewPanelProps {
  slide: Slide
  isLast: boolean
  composerOpen: boolean
  externallyPaused: boolean
  onToggleComposer: () => void
}

export function ReviewPanel({ slide, isLast, composerOpen, externallyPaused, onToggleComposer }: ReviewPanelProps) {
  const approveSlide = useProjectStore((s) => s.approveSlide)
  const prefs = useUiStore((s) => s.prefs)
  const toast = useUiStore((s) => s.toast)

  const [compareOpen, setCompareOpen] = useState(false)
  const [detailsOf, setDetailsOf] = useState<SlideVersion | null>(null)

  const roundReady = isRoundComplete(slide)
  const reviewable = (slide.status === 'awaiting' || slide.status === 'revised') && roundReady
  const approved = slide.status === 'approvedManual' || slide.status === 'approvedAuto'
  const current = currentVersionOf(slide)

  const timer = useApprovalTimer({
    duration: prefs.approvalSeconds,
    active: reviewable && current !== null,
    paused: composerOpen || compareOpen || externallyPaused || detailsOf !== null,
    resetKey: `${slide.id}:${slide.currentVersionId}`,
    onExpire: () => {
      approveSlide(slide.id, 'auto')
      toast('info', 'Aprovado automaticamente', `“${slide.plan.title}” avançou após o tempo de revisão.`)
    },
  })

  const approve = () => {
    approveSlide(slide.id, 'manual')
    toast('success', isLast ? 'Apresentação finalizada' : 'Slide aprovado', undefined)
  }

  const versions = [...slide.versions].reverse()

  return (
    <aside className="panel review-panel" aria-label="Revisão do slide">
      <div className="review-block">
        <h4>Status</h4>
        <StatusBadge status={slide.status} />
      </div>

      <div className="review-block">
        <h4>Objetivo do slide</h4>
        <p>{slide.plan.objective}</p>
      </div>

      {slide.plan.keyMessage && (
        <div className="review-block">
          <h4>Mensagem principal</h4>
          <p>{slide.plan.keyMessage}</p>
        </div>
      )}

      <div className="review-block">
        <h4>Direção visual</h4>
        <p>{slide.plan.visualDirection}</p>
      </div>

      <StrategyControls slide={slide} />

      {current?.unchangedFromSource && (
        <div className="unchanged-banner" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <strong>A edição não produziu uma alteração visual detectável.</strong>
            <p>
              O arquivo retornado tem o mesmo hash da imagem de origem. Tente novamente reforçando a
              instrução, mude para edição do slide inteiro ou aumente a intensidade da alteração.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleComposer}>
              Ajustar e tentar novamente
            </button>
          </div>
        </div>
      )}

      {reviewable && (
        <div className="review-timer">
          <ProgressRing progress={timer.progress} remaining={timer.remaining} />
          <div className="review-timer-copy">
            <strong>Aprovação automática</strong>
            {timer.running ? (
              'Sem ação até o fim da contagem, a variação selecionada é aprovada e a geração avança.'
            ) : (
              <span className="review-timer-paused">Contador pausado</span>
            )}
          </div>
        </div>
      )}

      {reviewable && (
        <div className="review-cta">
          <button type="button" className="btn btn-primary" onClick={approve}>
            <Check size={16} aria-hidden="true" />
            {isLast ? 'Confirmar e finalizar' : 'Confirmar e avançar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onToggleComposer}
            aria-expanded={composerOpen}
          >
            <PenLine size={15} aria-hidden="true" />
            Solicitar alterações
          </button>
        </div>
      )}

      {approved && (
        <div className="review-cta">
          <button type="button" className="btn btn-ghost" onClick={onToggleComposer}>
            <PenLine size={15} aria-hidden="true" />
            Revisar este slide
          </button>
        </div>
      )}

      {current && (
        <div className="review-block">
          <h4>Versão atual</h4>
          <dl className="version-meta">
            <div><dt>Provider</dt><dd>{current.generation?.provider ?? current.fileSource ?? '—'}</dd></div>
            <div><dt>Modelo</dt><dd>{current.model}</dd></div>
            <div><dt>Estratégia</dt><dd>{RENDER_STRATEGY_LABELS[current.strategy ?? 'structured']}</dd></div>
            <div><dt>Arquivo</dt><dd>{FILE_SOURCE_LABELS[current.fileSource ?? 'renderer']}</dd></div>
            <div><dt>Qualidade</dt><dd>{current.quality}</dd></div>
            <div><dt>Resolução</dt><dd>{current.resolution}</dd></div>
            <div><dt>Hash</dt><dd className="mono">{shortHash(current.generation?.outputHash)}</dd></div>
            <div><dt>Origem</dt><dd>{originLabel(current)}</dd></div>
          </dl>
        </div>
      )}

      {slide.versions.length > 1 && (
        <div className="review-block">
          <h4>
            <History size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true" />
            Versões ({slide.versions.length})
          </h4>
          <div className="version-list">
            {versions.slice(0, 8).map((version) => (
              <VersionRow
                key={version.id}
                slide={slide}
                version={version}
                onDetails={() => setDetailsOf(version)}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10, width: '100%' }}
            onClick={() => setCompareOpen(true)}
          >
            <GitCompare size={14} aria-hidden="true" /> Comparar versões
          </button>
        </div>
      )}

      <CompareModal slide={slide} open={compareOpen} onClose={() => setCompareOpen(false)} />
      <VersionDetailsModal slide={slide} version={detailsOf} onClose={() => setDetailsOf(null)} />
    </aside>
  )
}

function originLabel(version: SlideVersion): string {
  const map: Record<SlideVersion['origin'], string> = {
    generation: 'Geração',
    revision: 'Revisão',
    'mask-edit': 'Edição por máscara',
    duplicate: 'Duplicação',
    migrated: 'Versão migrada',
  }
  return `${map[version.origin]}${version.variationIndex > 1 || version.groupId ? ` · variação ${version.variationIndex}` : ''}`
}

function VersionRow({
  slide,
  version,
  onDetails,
}: {
  slide: Slide
  version: SlideVersion
  onDetails: () => void
}) {
  const selectVersion = useProjectStore((s) => s.selectVersion)
  const toast = useUiStore((s) => s.toast)
  const isCurrent = version.id === slide.currentVersionId
  const src = versionSrc(version)
  return (
    <div className={`version-item ${isCurrent ? 'current' : ''}`}>
      <span className="thumb">{src && <img src={src} alt="" />}</span>
      <span className="info">
        <span>
          {version.label}
          {version.exportedAt && <span className="badge badge-success" style={{ marginLeft: 6 }}>Exportada</span>}
        </span>
        <small>
          {version.revisionNote ?? originLabel(version)} · {relativeTime(version.createdAt)}
        </small>
      </span>
      <button type="button" className="btn-icon" data-tip="Detalhes" aria-label={`Detalhes de ${version.label}`} onClick={onDetails}>
        <Info size={13} />
      </button>
      {!isCurrent && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            selectVersion(slide.id, version.id)
            toast('info', 'Versão selecionada', `${version.label} voltou a ser a versão atual.`)
          }}
        >
          Usar
        </button>
      )}
    </div>
  )
}

function VersionDetailsModal({
  slide,
  version,
  onClose,
}: {
  slide: Slide
  version: SlideVersion | null
  onClose: () => void
}) {
  const renameVersion = useProjectStore((s) => s.renameVersion)
  const deleteVersion = useProjectStore((s) => s.deleteVersion)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const [label, setLabel] = useState(version?.label ?? '')

  useEffect(() => setLabel(version?.label ?? ''), [version])
  if (!version) return null
  const isCurrent = version.id === slide.currentVersionId
  const src = versionSrc(version)

  return (
    <Modal open title={`Detalhes — ${version.label}`} onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {src && (
          <div className="compare-col">
            <div className="frame"><img src={src} alt={version.label} /></div>
          </div>
        )}
        <div className="field">
          <label htmlFor="ver-label">Nome da versão</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="ver-label" className="field-control" value={label} onChange={(e) => setLabel(e.target.value)} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => renameVersion(slide.id, version.id, label.trim() || version.label)}
            >
              Renomear
            </button>
          </div>
        </div>
        <dl className="version-meta wide">
          <div><dt>Provider</dt><dd>{version.generation?.provider ?? version.fileSource ?? '—'}</dd></div>
          <div><dt>Modelo</dt><dd>{version.model}</dd></div>
          <div><dt>Estratégia</dt><dd>{RENDER_STRATEGY_LABELS[version.strategy ?? 'structured']}</dd></div>
          <div><dt>Tipo</dt><dd>{version.generation?.source === 'edit' ? 'Edição' : 'Geração'}</dd></div>
          <div><dt>Origem do arquivo</dt><dd>{FILE_SOURCE_LABELS[version.fileSource ?? 'renderer']}</dd></div>
          <div><dt>Tempo de execução</dt><dd>{version.generation ? `${(version.generation.durationMs / 1000).toFixed(1)}s` : '—'}</dd></div>
          <div><dt>Qualidade</dt><dd>{version.quality}</dd></div>
          <div><dt>Resolução</dt><dd>{version.resolution}</dd></div>
          <div><dt>Hash</dt><dd className="mono">{shortHash(version.generation?.outputHash)}</dd></div>
          <div><dt>Hash de origem</dt><dd className="mono">{shortHash(version.generation?.sourceImageHash)}</dd></div>
          <div><dt>Template</dt><dd>{version.templateId ?? 'Nenhum'}</dd></div>
          <div><dt>Snippets</dt><dd>{version.snippetIds?.length ? version.snippetIds.join(', ') : 'Nenhum'}</dd></div>
          <div><dt>Storage</dt><dd className="mono">{version.generation?.storagePath ?? '—'}</dd></div>
          <div><dt>Variação</dt><dd>{version.variationIndex}</dd></div>
          <div><dt>Origem</dt><dd>{originLabel(version)}</dd></div>
          <div><dt>Máscara</dt><dd>{version.maskUsed ? 'Sim (edição localizada)' : 'Não'}</dd></div>
          <div><dt>Estilo</dt><dd>{version.styleId ?? '—'}</dd></div>
          <div><dt>Criada</dt><dd>{new Date(version.createdAt).toLocaleString('pt-BR')}</dd></div>
          <div><dt>Anexos</dt><dd>{version.attachmentIds.length > 0 ? version.attachmentIds.join(', ') : 'Nenhum'}</dd></div>
          <div><dt>Exportada</dt><dd>{version.exportedAt ? new Date(version.exportedAt).toLocaleString('pt-BR') : 'Não'}</dd></div>
        </dl>
        {version.revisionNote && (
          <div className="field">
            <label>Instrução da revisão</label>
            <p className="text-soft" style={{ fontSize: 13 }}>{version.revisionNote}</p>
          </div>
        )}
        <div className="field">
          <label>Prompt usado</label>
          <pre className="plan-prompt" style={{ margin: 0, maxHeight: 140 }}>{version.prompt || '—'}</pre>
        </div>
        {version.negativePrompt && (
          <div className="field">
            <label>Negative prompt</label>
            <pre className="plan-prompt" style={{ margin: 0, maxHeight: 80 }}>{version.negativePrompt}</pre>
          </div>
        )}
        {!isCurrent && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() =>
              requestConfirm({
                title: `Excluir ${version.label}?`,
                message: 'A versão será removida do histórico. A versão selecionada não pode ser excluída.',
                confirmLabel: 'Excluir versão',
                danger: true,
                onConfirm: () => {
                  deleteVersion(slide.id, version.id)
                  onClose()
                },
              })
            }
          >
            Excluir esta versão
          </button>
        )}
      </div>
    </Modal>
  )
}

function CompareModal({ slide, open, onClose }: { slide: Slide; open: boolean; onClose: () => void }) {
  const selectVersion = useProjectStore((s) => s.selectVersion)
  const toast = useUiStore((s) => s.toast)
  const [leftId, setLeftId] = useState<string>('')
  const [rightId, setRightId] = useState<string>('')

  useEffect(() => {
    if (open && slide.versions.length > 1) {
      setLeftId(slide.versions[slide.versions.length - 2].id)
      setRightId(slide.currentVersionId ?? slide.versions[slide.versions.length - 1].id)
    }
  }, [open, slide])

  const left = slide.versions.find((v) => v.id === leftId)
  const right = slide.versions.find((v) => v.id === rightId)

  const column = (side: 'A' | 'B', id: string, setId: (v: string) => void, version: SlideVersion | undefined) => {
    const src = versionSrc(version)
    return (
      <div className="compare-col">
        <h4>Versão {side}</h4>
        <select
          className="field-control"
          value={id}
          onChange={(e) => setId(e.target.value)}
          aria-label={`Selecionar versão ${side}`}
        >
          {slide.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
              {v.id === slide.currentVersionId ? ' (atual)' : ''}
            </option>
          ))}
        </select>
        <div className="frame">{src && <img src={src} alt={version?.label} />}</div>
        {version && version.id !== slide.currentVersionId && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10, width: '100%' }}
            onClick={() => {
              selectVersion(slide.id, version.id)
              toast('info', 'Versão restaurada', `${version.label} agora é a versão atual.`)
              onClose()
            }}
          >
            Restaurar esta versão
          </button>
        )}
      </div>
    )
  }

  return (
    <Modal open={open} title={`Comparar versões — ${slide.plan.title}`} onClose={onClose} width={880}>
      <div className="compare-grid">
        {column('A', leftId, setLeftId, left)}
        {column('B', rightId, setRightId, right)}
      </div>
    </Modal>
  )
}
