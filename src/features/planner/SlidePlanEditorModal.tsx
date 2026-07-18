import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { TemplateThumb } from '../library/TemplatesView'
import { buildSlideProductionPrompt } from '../../services/ai/mockPlanner'
import { useAttachmentStore } from '../../state/attachmentStore'
import { useProjectStore } from '../../state/projectStore'
import { useSnippetStore } from '../../state/snippetStore'
import { useStyleStore } from '../../state/styleStore'
import { useTemplateStore } from '../../state/templateStore'
import type { PlannedSlide, RenderStrategy, SlideLayout } from '../../types'
import { RENDER_STRATEGY_LABELS } from '../../types/generation'
import { ROLE_LABELS } from '../../services/attachments/attachmentLabels'
import { LAYOUT_LABELS } from './plannerOptions'

interface SlidePlanEditorModalProps {
  open: boolean
  slide: PlannedSlide | null
  onClose: () => void
  onSave: (slide: PlannedSlide) => void
}

/** Edição pontual de um único slide do plano — os demais não são tocados. */
export function SlidePlanEditorModal({ open, slide, onClose, onSave }: SlidePlanEditorModalProps) {
  const project = useProjectStore((s) => s.project)
  const getById = useStyleStore((s) => s.getById)
  const getDefault = useStyleStore((s) => s.getDefault)
  const attachments = useAttachmentStore((s) => s.attachments).filter((a) => a.ownerId === project?.id)
  const [draft, setDraft] = useState<PlannedSlide | null>(slide)

  useEffect(() => {
    if (open) setDraft(slide)
  }, [open, slide])

  if (!draft) return null
  const patch = (p: Partial<PlannedSlide>) => setDraft((d) => (d ? { ...d, ...p } : d))

  const recalcPrompt = () => {
    if (!project) return
    const style = getById(project.plannerConfig.styleId) ?? getDefault()
    const { productionPrompt: _p, negativePrompt: _n, ...rest } = draft
    patch({
      productionPrompt: buildSlideProductionPrompt(rest, project.plannerConfig, style, [], project.name),
    })
  }

  const lines = (value: string[]) => value.join('\n')
  const fromLines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean)

  return (
    <Modal
      open={open}
      title={`Editar slide ${String(draft.order).padStart(2, '0')} — ${draft.title || 'sem título'}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave({ ...draft, editedManually: true })
              onClose()
            }}
          >
            Salvar slide
          </button>
        </>
      }
    >
      <div className="plan-slide-editor">
        <div className="row">
          <div className="field">
            <label htmlFor="pse-title">Título</label>
            <input id="pse-title" className="field-control" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pse-subtitle">Subtítulo</label>
            <input id="pse-subtitle" className="field-control" value={draft.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="pse-objective">Objetivo</label>
            <input id="pse-objective" className="field-control" value={draft.objective} onChange={(e) => patch({ objective: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pse-layout">Layout</label>
            <select id="pse-layout" className="field-control" value={draft.layout} onChange={(e) => patch({ layout: e.target.value as SlideLayout })}>
              {Object.entries(LAYOUT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pse-key">Mensagem principal</label>
          <input id="pse-key" className="field-control" value={draft.keyMessage} onChange={(e) => patch({ keyMessage: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pse-content">Conteúdo (um item por linha)</label>
          <textarea id="pse-content" className="field-control" rows={4} value={lines(draft.content)} onChange={(e) => patch({ content: fromLines(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="pse-evidence">Dados e evidências (um por linha — nunca inventados)</label>
          <textarea id="pse-evidence" className="field-control" rows={2} value={lines(draft.evidence)} onChange={(e) => patch({ evidence: fromLines(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="pse-visual">Direção visual</label>
          <textarea id="pse-visual" className="field-control" rows={2} value={draft.visualDirection} onChange={(e) => patch({ visualDirection: e.target.value })} />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="pse-strategy">Estratégia de renderização</label>
            <select
              id="pse-strategy"
              className="field-control"
              value={draft.renderStrategy ?? 'default'}
              onChange={(e) => patch({ renderStrategy: e.target.value === 'default' ? undefined : (e.target.value as RenderStrategy) })}
            >
              <option value="default">Padrão do projeto</option>
              {(Object.keys(RENDER_STRATEGY_LABELS) as RenderStrategy[]).map((s) => (
                <option key={s} value={s}>{RENDER_STRATEGY_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pse-snippets">Snippets aplicados</label>
            <SnippetPicker slide={draft} onChange={(snippetIds) => patch({ snippetIds })} />
          </div>
        </div>

        <TemplatePicker slide={draft} onChange={(templateId) => patch({ templateId })} />

        {attachments.length > 0 && (
          <div className="field">
            <label>Anexos vinculados</label>
            <div className="att-slide-links">
              {attachments.map((a) => (
                <label key={a.id} className="att-flag">
                  <input
                    type="checkbox"
                    checked={draft.attachmentIds.includes(a.id)}
                    onChange={(e) =>
                      patch({
                        attachmentIds: e.target.checked
                          ? [...draft.attachmentIds, a.id]
                          : draft.attachmentIds.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name || a.fileName} <small className="text-muted">({ROLE_LABELS[a.role]})</small>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="pse-prompt">
            Prompt de produção deste slide
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={recalcPrompt}>
              <RefreshCw size={12} aria-hidden="true" /> Recalcular a partir dos campos
            </button>
          </label>
          <textarea id="pse-prompt" className="field-control mono-area" rows={6} value={draft.productionPrompt} onChange={(e) => patch({ productionPrompt: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pse-negative">Negative prompt</label>
          <textarea id="pse-negative" className="field-control mono-area" rows={2} value={draft.negativePrompt} onChange={(e) => patch({ negativePrompt: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}

/** Escolha de template com miniaturas reais (Automático / Escolher / Sem). */
function TemplatePicker({ slide, onChange }: { slide: PlannedSlide; onChange: (templateId: string | null | undefined) => void }) {
  const project = useProjectStore((s) => s.project)
  const overrides = useTemplateStore((s) => s.overrides)
  const userTemplates = useTemplateStore((s) => s.userTemplates)
  const templates = useMemo(() => {
    void overrides
    void userTemplates
    return useTemplateStore.getState().all()
  }, [overrides, userTemplates])
  const styleTemplates = templates.filter((t) => t.styleId === (project?.plannerConfig.styleId ?? project?.styleId))
  const pool = styleTemplates.length > 0 ? styleTemplates : templates
  const choice = slide.templateId === null ? 'none' : (slide.templateId ?? 'auto')

  return (
    <div className="field">
      <label>Template do slide</label>
      <div className="tpl-picker-modes" role="radiogroup" aria-label="Modo de template">
        {[
          { id: 'auto', label: 'Template automático' },
          { id: 'choose', label: 'Escolher template' },
          { id: 'none', label: 'Sem template' },
        ].map((mode) => {
          const active = mode.id === 'choose' ? choice !== 'auto' && choice !== 'none' : choice === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`revision-chip ${active ? 'on' : ''}`}
              onClick={() => {
                if (mode.id === 'auto') onChange(undefined)
                else if (mode.id === 'none') onChange(null)
                else onChange(pool[0]?.id)
              }}
            >
              {mode.label}
            </button>
          )
        })}
      </div>
      {choice !== 'auto' && choice !== 'none' && (
        <div className="tpl-picker-strip" role="listbox" aria-label="Templates disponíveis">
          {pool.map((template) => (
            <button
              key={template.id}
              type="button"
              role="option"
              aria-selected={choice === template.id}
              className={`tpl-picker-item ${choice === template.id ? 'on' : ''}`}
              onClick={() => onChange(template.id)}
              title={template.name}
            >
              <TemplateThumb template={template} />
              <span>{template.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Snippets aplicados ao slide (multi-seleção). */
function SnippetPicker({ slide, onChange }: { slide: PlannedSlide; onChange: (snippetIds: string[]) => void }) {
  const userSnippets = useSnippetStore((s) => s.userSnippets)
  const snippetOverrides = useSnippetStore((s) => s.overrides)
  const snippets = useMemo(() => {
    void userSnippets
    void snippetOverrides
    return useSnippetStore.getState().all()
  }, [userSnippets, snippetOverrides])
  const selected = slide.snippetIds ?? []
  return (
    <div className="snippet-picker">
      {snippets.slice(0, 12).map((snippet) => (
        <label key={snippet.id} className={`revision-chip ${selected.includes(snippet.id) ? 'on' : ''}`} title={snippet.description}>
          <input
            type="checkbox"
            className="visually-hidden"
            checked={selected.includes(snippet.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, snippet.id] : selected.filter((id) => id !== snippet.id))
            }
          />
          {snippet.name}
        </label>
      ))}
    </div>
  )
}
