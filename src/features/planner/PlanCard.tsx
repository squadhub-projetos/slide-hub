import { Reorder } from 'framer-motion'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BadgeCheck,
  ChevronDown,
  Copy,
  FlaskConical,
  GripVertical,
  Lightbulb,
  PencilLine,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { DeckPlan, PlannedSlide } from '../../types'
import { useUiStore } from '../../state/uiStore'
import { uid } from '../../utils/id'
import { LAYOUT_LABELS } from './plannerOptions'
import { SlidePlanEditorModal } from './SlidePlanEditorModal'

/**
 * Prova visível de origem do plano: modelo/duração/tokens quando veio da
 * IA real, ou aviso explícito de simulação — nunca some da tela e nunca
 * finge que uma heurística local é uma resposta de IA.
 */
function ProvenanceBadge({ plan }: { plan: DeckPlan }) {
  const p = plan.provenance
  if (!p) return null
  if (p.provider === 'mock') {
    return (
      <span className="badge badge-warning" data-tip="Nenhuma chamada de IA real foi feita para este plano">
        <FlaskConical size={11} aria-hidden="true" /> Simulação local
      </span>
    )
  }
  const seconds = (p.durationMs / 1000).toFixed(1)
  const tokens = p.inputTokens || p.outputTokens ? ` · ~${(p.inputTokens ?? 0) + (p.outputTokens ?? 0)} tokens` : ''
  return (
    <span
      className="badge badge-success"
      data-tip={`Modelo ${p.model} · requestId ${p.requestId ?? '—'}${p.retried ? ' · refeito 1x por schema inválido' : ''}`}
    >
      <BadgeCheck size={11} aria-hidden="true" /> IA real · {p.model} · {seconds}s{tokens}
    </span>
  )
}

function normalizeOrders(slides: PlannedSlide[]): PlannedSlide[] {
  return slides.map((s, i) => ({ ...s, order: i + 1 }))
}

function blankPlannedSlide(order: number): PlannedSlide {
  return {
    id: uid('ps'),
    order,
    title: 'Novo slide',
    subtitle: '',
    objective: 'Definir o objetivo deste slide',
    keyMessage: '',
    content: [],
    evidence: [],
    speakerIntent: '',
    layout: 'textImage',
    visualDirection: '',
    brandInstructions: '',
    attachmentIds: [],
    productionPrompt: '',
    negativePrompt: '',
    editedManually: true,
  }
}

interface InsightsSectionProps {
  plan: DeckPlan
}

function InsightsSection({ plan }: InsightsSectionProps) {
  const [openSection, setOpenSection] = useState(true)
  const i = plan.insights
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="insight-block">
        <h5>{title}</h5>
        <ul>
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    )

  return (
    <section className="plan-insights" aria-label="Leitura da IA">
      <button
        type="button"
        className="plan-insights-head"
        onClick={() => setOpenSection((v) => !v)}
        aria-expanded={openSection}
      >
        <Lightbulb size={15} aria-hidden="true" />
        <strong>Leitura da IA</strong>
        <span className="text-muted">o que foi entendido, inferido e o que falta</span>
        <ChevronDown size={15} style={{ marginLeft: 'auto', transform: openSection ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} aria-hidden="true" />
      </button>
      {openSection && (
        <div className="plan-insights-body">
          {i.understanding && (
            <div className="insight-block">
              <h5>O que a IA entendeu</h5>
              <p>{i.understanding}</p>
            </div>
          )}
          {i.intent && (
            <div className="insight-block">
              <h5>Intenção identificada</h5>
              <p>{i.intent}</p>
            </div>
          )}
          {i.audienceInterpretation && (
            <div className="insight-block">
              <h5>Leitura do público</h5>
              <p>{i.audienceInterpretation}</p>
            </div>
          )}
          {i.centralMessage && (
            <div className="insight-block">
              <h5>Mensagem central</h5>
              <p>{i.centralMessage}</p>
            </div>
          )}
          {list('O que você informou diretamente', i.statedFacts ?? [])}
          {list('Principais insights', i.keyInsights)}
          {list('Decisões que a apresentação deve provocar', i.decisionsToProvoke)}
          {list('O que a IA inferiu (sem estar explícito)', i.inferred)}
          {list('Suposições adotadas', i.assumptions)}
          {list('Dados que estão faltando', i.missingInformation)}
          {list('Riscos de comunicação', i.communicationRisks)}
          {i.narrativeSuggestion && (
            <div className="insight-block">
              <h5>Sugestão de narrativa</h5>
              <p>{i.narrativeSuggestion}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

interface PlanCardProps {
  plan: DeckPlan
  busy: boolean
  replanningSlideId: string | null
  onUpdatePlan: (plan: DeckPlan) => void
  onReplanSlide: (slideId: string) => void
  onRegenerate: () => void
  onSendToGenerator: () => void
}

export function PlanCard({
  plan,
  busy,
  replanningSlideId,
  onUpdatePlan,
  onReplanSlide,
  onRegenerate,
  onSendToGenerator,
}: PlanCardProps) {
  const toast = useUiStore((s) => s.toast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const [promptVisible, setPromptVisible] = useState(false)
  const [editing, setEditing] = useState<PlannedSlide | null>(null)

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(plan.masterPrompt)
      toast('success', 'Prompt copiado', 'O prompt consolidado está na área de transferência.')
    } catch {
      toast('error', 'Não foi possível copiar', 'Copie manualmente pelo bloco do prompt.')
      setPromptVisible(true)
    }
  }

  const updateSlides = (slides: PlannedSlide[]) => {
    onUpdatePlan({ ...plan, slides: normalizeOrders(slides), recommendedSlideCount: slides.length })
  }

  const saveSlide = (next: PlannedSlide) => {
    updateSlides(plan.slides.map((s) => (s.id === next.id ? next : s)))
    toast('success', 'Slide atualizado', 'Somente este slide foi alterado; o prompt consolidado foi atualizado.')
  }

  const insertAt = (index: number) => {
    const slides = [...plan.slides]
    slides.splice(index, 0, blankPlannedSlide(index + 1))
    updateSlides(slides)
  }

  const duplicateSlide = (slide: PlannedSlide) => {
    const index = plan.slides.findIndex((s) => s.id === slide.id)
    const slides = [...plan.slides]
    slides.splice(index + 1, 0, { ...slide, id: uid('ps'), editedManually: true })
    updateSlides(slides)
  }

  const deleteSlide = (slide: PlannedSlide) => {
    requestConfirm({
      title: `Remover o slide ${String(slide.order).padStart(2, '0')} do plano?`,
      message: `“${slide.title}” será removido da sequência planejada. A numeração será atualizada.`,
      confirmLabel: 'Remover do plano',
      danger: true,
      onConfirm: () => updateSlides(plan.slides.filter((s) => s.id !== slide.id)),
    })
  }

  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <div className="plan-kicker-row">
          <div className="plan-kicker">Plano da apresentação</div>
          <ProvenanceBadge plan={plan} />
        </div>
        <h3>{plan.title}</h3>
        {plan.subtitle && <p className="plan-subtitle">{plan.subtitle}</p>}
        {plan.executiveSummary && <p>{plan.executiveSummary}</p>}
      </div>

      <InsightsSection plan={plan} />

      <Reorder.Group
        as="div"
        axis="y"
        values={plan.slides}
        onReorder={(slides: PlannedSlide[]) => updateSlides(slides)}
        className="plan-slides"
        aria-label="Sequência de slides planejada"
      >
        {plan.slides.map((slide) => (
          <Reorder.Item
            as="div"
            key={slide.id}
            value={slide}
            className="plan-slide"
            whileDrag={{ scale: 1.01, zIndex: 5, boxShadow: '0 14px 34px -10px rgba(0,0,0,.7)' }}
          >
            <span className="plan-slide-grip" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            <span className="plan-slide-n">{String(slide.order).padStart(2, '0')}</span>
            <div className="plan-slide-body">
              <div className="plan-slide-title">
                {slide.title}
                {slide.editedManually && <span className="badge badge-violet" style={{ marginLeft: 8 }}>Editado</span>}
              </div>
              <div className="plan-slide-meta">
                {slide.objective}
                {slide.keyMessage ? ` · ${slide.keyMessage}` : ''}
              </div>
            </div>
            <span className="plan-layout-tag">{LAYOUT_LABELS[slide.layout] ?? slide.layout}</span>
            <div className="plan-slide-actions">
              <button
                type="button"
                className="btn-icon plan-pencil"
                data-tip="Editar este slide"
                aria-label={`Editar slide ${slide.order}`}
                onClick={() => setEditing(slide)}
              >
                <PencilLine size={14} />
              </button>
              <button
                type="button"
                className="btn-icon"
                data-tip="Replanejar com IA (somente este)"
                aria-label={`Replanejar slide ${slide.order}`}
                disabled={replanningSlideId !== null}
                onClick={() => onReplanSlide(slide.id)}
              >
                <Sparkles size={14} className={replanningSlideId === slide.id ? 'spin' : undefined} />
              </button>
              <button type="button" className="btn-icon" data-tip="Duplicar" aria-label={`Duplicar slide ${slide.order}`} onClick={() => duplicateSlide(slide)}>
                <Copy size={14} />
              </button>
              <button type="button" className="btn-icon" data-tip="Inserir antes" aria-label={`Inserir slide antes do ${slide.order}`} onClick={() => insertAt(slide.order - 1)}>
                <ArrowUpToLine size={14} />
              </button>
              <button type="button" className="btn-icon" data-tip="Inserir depois" aria-label={`Inserir slide depois do ${slide.order}`} onClick={() => insertAt(slide.order)}>
                <ArrowDownToLine size={14} />
              </button>
              <button type="button" className="btn-icon" data-tip="Excluir" aria-label={`Excluir slide ${slide.order}`} onClick={() => deleteSlide(slide)}>
                <Trash2 size={14} />
              </button>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {promptVisible && <pre className="plan-prompt">{plan.masterPrompt}</pre>}

      <div className="plan-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyPrompt()}>
          <Copy size={14} aria-hidden="true" /> Copiar prompt
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setPromptVisible((v) => !v)}
          aria-expanded={promptVisible}
        >
          {promptVisible ? 'Ocultar prompt' : 'Ver prompt consolidado'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRegenerate} disabled={busy}>
          <RefreshCw size={14} aria-hidden="true" /> Regenerar plano
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={onSendToGenerator}
          disabled={busy || plan.slides.length === 0}
        >
          <Send size={14} aria-hidden="true" /> Enviar para Gerar Slides
        </button>
      </div>

      <SlidePlanEditorModal open={editing !== null} slide={editing} onClose={() => setEditing(null)} onSave={saveSlide} />
    </div>
  )
}
