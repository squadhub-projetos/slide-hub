import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  PanelLeftClose,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { AttachmentArea } from '../../components/attachments/AttachmentArea'
import { StylePicker } from '../../components/StylePicker'
import { filesFromClipboard } from '../../utils/clipboard'
import { getAiProvider } from '../../services/ai'
import { buildMasterPrompt } from '../../services/ai/mockPlanner'
import { toAttachmentsForAi } from '../../services/attachments/attachmentService'
import { resolveSnippetReferences } from '../../services/library/snippetResolver'
import { useAttachmentStore } from '../../state/attachmentStore'
import { useSnippetStore } from '../../state/snippetStore'
import { useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import { useUiStore } from '../../state/uiStore'
import type {
  AudienceScope,
  ChatMessage,
  DeckPlan,
  DeckProject,
  ImageQualityPreset,
  OfficialAssetSuggestion,
  PlannerConfig,
  SnippetMatch,
  VariationCount,
  WebAssetPolicy,
} from '../../types'
import { uid } from '../../utils/id'
import { PlanCard } from './PlanCard'
import { ThinkingIndicator } from './ThinkingIndicator'
import {
  CUSTOM_OBJECTIVE,
  getMeetingMeta,
  MEETING_TYPES,
  segmentsForScope,
  TONES,
} from './plannerOptions'

/** Estado aberto/fechado do painel de parâmetros — persistido por sessão. */
const PARAMS_SESSION_KEY = 'slidehub:planner-params'

/* ------------------------------------------------------------------ */
/* Campos de configuração compartilhados                               */
/* ------------------------------------------------------------------ */

function AudienceFields({ project, idPrefix }: { project: DeckProject; idPrefix: string }) {
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  const config = project.plannerConfig
  const segments = segmentsForScope(config.audienceScope)

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-scope`}>Apresentação</label>
        <select
          id={`${idPrefix}-scope`}
          className="field-control"
          value={config.audienceScope}
          onChange={(e) => patchConfig({ audienceScope: e.target.value as AudienceScope })}
        >
          <option value="internal">Interna</option>
          <option value="external">Externa</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-segment`}>
          {config.audienceScope === 'internal' ? 'Público interno' : 'Perfil da audiência'}
        </label>
        <select
          id={`${idPrefix}-segment`}
          className="field-control"
          value={config.audienceSegment}
          onChange={(e) => patchConfig({ audienceSegment: e.target.value })}
        >
          {segments.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
    </>
  )
}

function ObjectiveFields({ project, idPrefix }: { project: DeckProject; idPrefix: string }) {
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  const config = project.plannerConfig
  const meta = getMeetingMeta(config.meetingType)
  const isCustom = config.objective === CUSTOM_OBJECTIVE || !meta.objectives.includes(config.objective)

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-objective`}>Objetivo</label>
        <select
          id={`${idPrefix}-objective`}
          className="field-control"
          value={isCustom ? CUSTOM_OBJECTIVE : config.objective}
          onChange={(e) => patchConfig({ objective: e.target.value })}
        >
          {meta.objectives.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={CUSTOM_OBJECTIVE}>Objetivo personalizado…</option>
        </select>
      </div>
      {isCustom && (
        <div className="field">
          <label htmlFor={`${idPrefix}-custom-objective`}>Descreva o objetivo</label>
          <input
            id={`${idPrefix}-custom-objective`}
            className="field-control"
            placeholder="O que precisa acontecer no final?"
            value={config.customObjective}
            onChange={(e) => patchConfig({ objective: CUSTOM_OBJECTIVE, customObjective: e.target.value })}
          />
        </div>
      )}
    </>
  )
}

function StyleField({ project, idPrefix }: { project: DeckProject; idPrefix: string }) {
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  const styles = useStyleStore((s) => s.styles)
  return (
    <div className="field">
      <label htmlFor={`${idPrefix}-style`}>Estilo visual</label>
      <StylePicker
        id={`${idPrefix}-style`}
        styles={styles}
        value={project.plannerConfig.styleId}
        onChange={(styleId) => patchConfig({ styleId })}
      />
    </div>
  )
}

function SlideCountField({ project, idPrefix }: { project: DeckProject; idPrefix: string }) {
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  return (
    <div className="field">
      <label htmlFor={`${idPrefix}-count`}>Slides</label>
      <input
        id={`${idPrefix}-count`}
        type="number"
        min={3}
        max={16}
        className="field-control"
        value={project.plannerConfig.slideCount}
        onChange={(e) => patchConfig({ slideCount: Math.max(3, Math.min(16, Number(e.target.value) || 6)) })}
      />
    </div>
  )
}

/**
 * Configurações secundárias fora do fluxo principal — inicia fechada.
 * O essencial (tipo, slides, estilo, anexos) fica sempre visível.
 */
function AdvancedOptions({ project, idPrefix }: { project: DeckProject; idPrefix: string }) {
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  const config = project.plannerConfig
  const [open, setOpen] = useState(false)

  return (
    <div className="adv-options">
      <button
        type="button"
        className="adv-toggle"
        aria-expanded={open}
        aria-controls={`${idPrefix}-adv`}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={13} aria-hidden="true" />
        Opções avançadas
        <ChevronDown size={14} className={`adv-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="adv-body" id={`${idPrefix}-adv`}>
          <div className="adv-group">
            <h5>Público e objetivo</h5>
            <div className="adv-grid">
              <AudienceFields project={project} idPrefix={idPrefix} />
              <ObjectiveFields project={project} idPrefix={idPrefix} />
              <div className="field">
                <label htmlFor={`${idPrefix}-tone`}>Tom</label>
                <select
                  id={`${idPrefix}-tone`}
                  className="field-control"
                  value={config.tone}
                  onChange={(e) => patchConfig({ tone: e.target.value })}
                >
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-lang`}>Idioma</label>
                <select
                  id={`${idPrefix}-lang`}
                  className="field-control"
                  value={config.language}
                  onChange={(e) => patchConfig({ language: e.target.value as PlannerConfig['language'] })}
                >
                  <option value="pt-BR">Português</option>
                  <option value="en-US">Inglês</option>
                </select>
              </div>
            </div>
          </div>
          <div className="adv-group">
            <h5>Produção</h5>
            <div className="adv-grid">
              <div className="field">
                <label htmlFor={`${idPrefix}-variations`}>Variações por slide</label>
                <select
                  id={`${idPrefix}-variations`}
                  className="field-control"
                  value={config.variationsPerSlide}
                  onChange={(e) => patchConfig({ variationsPerSlide: Number(e.target.value) as VariationCount })}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-quality`}>Qualidade de imagem</label>
                <select
                  id={`${idPrefix}-quality`}
                  className="field-control"
                  value={config.imageQuality}
                  onChange={(e) => patchConfig({ imageQuality: e.target.value as ImageQualityPreset })}
                >
                  <option value="draft">Rascunho (mais rápida)</option>
                  <option value="high">Alta (padrão)</option>
                  <option value="4k">4K (mais tempo e custo)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-web`}>Ativos externos</label>
                <select
                  id={`${idPrefix}-web`}
                  className="field-control"
                  value={config.webAssetPolicy}
                  onChange={(e) => patchConfig({ webAssetPolicy: e.target.value as WebAssetPolicy })}
                >
                  <option value="attachments-only">Somente anexos</option>
                  <option value="suggest-official">Sugerir ativos oficiais</option>
                  <option value="no-external">Sem marcas externas</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Resumo compacto exibido quando o painel de parâmetros está recolhido. */
function ParamsSummary({ project, onExpand }: { project: DeckProject; onExpand: () => void }) {
  const styles = useStyleStore((s) => s.styles)
  const config = project.plannerConfig
  const styleName = styles.find((s) => s.id === config.styleId)?.name ?? 'Estilo padrão'
  return (
    <div className="params-summary" aria-label="Resumo da configuração">
      <span>{getMeetingMeta(config.meetingType).label}</span>
      <i aria-hidden="true" />
      <span>{config.audienceScope === 'internal' ? 'Interna' : 'Externa'}</span>
      <i aria-hidden="true" />
      <span>{config.slideCount} slides</span>
      <i aria-hidden="true" />
      <span className="params-summary-style">{styleName}</span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onExpand}
        aria-expanded={false}
        aria-label="Expandir painel de parâmetros"
      >
        <Settings2 size={13} aria-hidden="true" /> Ajustar
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sugestões de ativos oficiais                                        */
/* ------------------------------------------------------------------ */

function OfficialAssetsPanel({
  suggestions,
  onUse,
  onIgnore,
}: {
  suggestions: OfficialAssetSuggestion[]
  onUse: (s: OfficialAssetSuggestion) => void
  onIgnore: (s: OfficialAssetSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div className="official-assets" role="region" aria-label="Ativos oficiais sugeridos">
      <h4>Ativos oficiais sugeridos</h4>
      <p className="text-muted">Nenhum ativo é usado sem a sua confirmação.</p>
      {suggestions.map((s) => (
        <div key={s.id} className="official-asset">
          <img src={s.imageUrl} alt={`Logo sugerido de ${s.brandName}`} />
          <div className="official-asset-info">
            <strong>{s.brandName}</strong>
            <small>
              <ExternalLink size={10} aria-hidden="true" /> {s.sourceDomain}
            </small>
            {s.note && <small className="text-muted">{s.note}</small>}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onUse(s)}>
            <Check size={13} aria-hidden="true" /> Usar
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onIgnore(s)}>
            <X size={13} aria-hidden="true" /> Ignorar
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* PlannerView                                                         */
/* ------------------------------------------------------------------ */

export function PlannerView() {
  const project = useProjectStore((s) => s.project)
  const newProject = useProjectStore((s) => s.newProject)
  const patchConfig = useProjectStore((s) => s.patchPlannerConfig)
  const patchProject = useProjectStore((s) => s.patchProject)
  const appendMessage = useProjectStore((s) => s.appendMessage)
  const applyPlan = useProjectStore((s) => s.applyPlan)
  const getById = useStyleStore((s) => s.getById)
  const getDefault = useStyleStore((s) => s.getDefault)
  const addFiles = useAttachmentStore((s) => s.addFiles)
  const setTab = useUiStore((s) => s.setTab)
  const toast = useUiStore((s) => s.toast)

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [replanning, setReplanning] = useState<string | null>(null)
  // O chat é o protagonista: o painel inicia recolhido e o estado
  // escolhido pelo usuário persiste durante a sessão.
  const [paramsOpen, setParamsOpenState] = useState(
    () => sessionStorage.getItem(PARAMS_SESSION_KEY) === 'open',
  )
  const [suggestions, setSuggestions] = useState<OfficialAssetSuggestion[]>([])
  const [snippetMatches, setSnippetMatches] = useState<Record<string, SnippetMatch[]>>({})
  const threadRef = useRef<HTMLDivElement>(null)
  const heroInputRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const setParamsOpen = (open: boolean) => {
    setParamsOpenState(open)
    sessionStorage.setItem(PARAMS_SESSION_KEY, open ? 'open' : 'closed')
  }

  useEffect(() => {
    if (!project) newProject()
  }, [project, newProject])

  const messages = project?.plannerMessages ?? []
  const hasConversation = messages.length > 0

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  if (!project) return null
  const config = project.plannerConfig
  const meta = getMeetingMeta(config.meetingType)

  const styleFor = () => getById(config.styleId) ?? getDefault()

  const attachmentsForPlanning = async () => {
    const owned = useAttachmentStore.getState().byOwner(project.id)
    return toAttachmentsForAi(owned.filter((a) => a.role !== 'do-not-use'))
  }

  const rebuildMaster = (plan: DeckPlan): DeckPlan => {
    const owned = useAttachmentStore.getState().byOwner(project.id)
    const light = owned.map((a) => ({
      id: a.id,
      name: a.name || a.fileName,
      mimeType: a.mimeType,
      role: a.role,
      description: a.description,
      usage: a.usage,
      mustAppearExactly: a.mustAppearExactly,
      referenceOnly: a.referenceOnly,
      allowCrop: a.allowCrop,
    }))
    const { masterPrompt: _m, ...base } = plan
    return { ...plan, masterPrompt: buildMasterPrompt(base, config, styleFor(), light) }
  }

  /**
   * A IA pode sobrescrever inferências da configuração quando o briefing
   * deixa claro outro cenário ("kickoff interno com meu time"). O plano
   * devolve a leitura final — sincronizamos e avisamos o usuário.
   */
  const syncConfigFromPlan = (plan: DeckPlan) => {
    if (plan.slides.length === 0) return
    const current = useProjectStore.getState().project?.plannerConfig
    if (!current) return
    const changes: Partial<PlannerConfig> = {}
    const notes: string[] = []
    if (plan.meetingType && plan.meetingType !== current.meetingType) {
      changes.meetingType = plan.meetingType
      notes.push(`tipo: ${getMeetingMeta(plan.meetingType).label}`)
    }
    if (plan.audienceScope && plan.audienceScope !== current.audienceScope) {
      changes.audienceScope = plan.audienceScope
      notes.push(plan.audienceScope === 'internal' ? 'apresentação interna' : 'apresentação externa')
    }
    if (plan.audienceSegment && plan.audienceSegment !== current.audienceSegment) {
      changes.audienceSegment = plan.audienceSegment
    }
    if (Object.keys(changes).length === 0) return
    patchConfig(changes)
    if (notes.length > 0) {
      toast('info', 'A IA ajustou a configuração', `A partir do briefing: ${notes.join(' · ')}.`)
    }
  }

  const send = async (brief: string) => {
    const text = brief.trim()
    if (!text || thinking) return
    // Histórico ANTES da mensagem nova — o texto atual vai como brief.
    const history = messages.map((m) => ({ role: m.role, text: m.text }))
    appendMessage({ id: uid('msg'), role: 'user', text, createdAt: new Date().toISOString() })
    setInput('')
    setThinking(true)
    try {
      const attachments = await attachmentsForPlanning()
      const plan = await getAiProvider().planDeck({ brief: text, config, style: styleFor(), attachments, history })
      const isQuestions = plan.slides.length === 0 && (plan.clarifyingQuestions?.length ?? 0) > 0
      const messageId = uid('msg')
      useProjectStore.getState().appendMessage({
        id: messageId,
        role: 'assistant',
        // A fala vem da própria IA; o texto fixo é só último recurso
        // (planos antigos/respostas sem o campo).
        text:
          plan.assistantMessage?.trim() ||
          (isQuestions
            ? 'Antes de montar o plano, preciso de algumas respostas objetivas:'
            : `Plano estruturado para “${plan.title}”. Revise a leitura da IA e a sequência antes de gerar.`),
        plan,
        createdAt: new Date().toISOString(),
      })
      syncConfigFromPlan(plan)
      // Interpreta snippets citados no briefing (@snippet ou linguagem natural)
      if (!isQuestions) {
        const matches = resolveSnippetReferences(text, useSnippetStore.getState().all())
        if (matches.length > 0) setSnippetMatches((m) => ({ ...m, [messageId]: matches }))
      }
      if (!isQuestions && config.webAssetPolicy === 'suggest-official') {
        void getAiProvider()
          .searchOfficialAssets(text, [])
          .then(setSuggestions)
          .catch(() => setSuggestions([]))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro inesperado'
      useProjectStore.getState().appendMessage({
        id: uid('msg'),
        role: 'assistant',
        text: `Não consegui montar o plano agora (${message}). Tente novamente em instantes.`,
        createdAt: new Date().toISOString(),
      })
      // O erro real (chave ausente, timeout, 429, schema inválido…) vai
      // para o toast tal como recebido — nunca substituído por um texto genérico.
      toast('error', 'Falha ao planejar', message)
    } finally {
      setThinking(false)
    }
  }

  const updateMessagePlan = (messageId: string, plan: DeckPlan) => {
    const rebuilt = rebuildMaster(plan)
    patchProject({
      plannerMessages: useProjectStore
        .getState()
        .project!.plannerMessages.map((m) => (m.id === messageId ? { ...m, plan: rebuilt } : m)),
    })
  }

  const replanSlide = async (messageId: string, plan: DeckPlan, slideId: string) => {
    setReplanning(slideId)
    try {
      const next = await getAiProvider().replanSlide({
        brief: [...messages].reverse().find((m) => m.role === 'user')?.text ?? '',
        config,
        style: styleFor(),
        plan,
        slideId,
      })
      updateMessagePlan(messageId, {
        ...plan,
        slides: plan.slides.map((s) => (s.id === slideId ? { ...next, id: slideId, order: s.order } : s)),
      })
      toast('success', 'Slide replanejado', 'Somente o slide selecionado foi atualizado.')
    } catch (error) {
      toast('error', 'Falha ao replanejar', error instanceof Error ? error.message : 'Tente novamente.')
    } finally {
      setReplanning(null)
    }
  }

  const regenerate = (message: ChatMessage) => {
    const index = messages.findIndex((m) => m.id === message.id)
    const lastUser = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')
    if (lastUser) void send(lastUser.text)
  }

  const sendToGenerator = (plan: DeckPlan) => {
    applyPlan(rebuildMaster(plan))
    setTab('generator')
    toast('success', 'Plano enviado', 'Revise a confirmação e gere a apresentação.')
  }

  const acceptSuggestion = async (s: OfficialAssetSuggestion) => {
    try {
      const response = await fetch(s.imageUrl)
      if (!response.ok) throw new Error('download falhou')
      const blob = await response.blob()
      const file = new File([blob], `${s.brandName.toLowerCase().replace(/\s+/g, '-')}-logo.png`, {
        type: blob.type || 'image/png',
      })
      const [added] = await addFiles([file], project.id, 'web')
      if (added) {
        useAttachmentStore.getState().update(added.id, {
          role: 'logo',
          mustAppearExactly: true,
          allowTransform: false,
          sourceUrl: s.sourceUrl,
          description: `Logo oficial de ${s.brandName} (origem: ${s.sourceDomain})`,
        })
        toast('success', 'Ativo adicionado', `${s.brandName} entrou nos anexos como logo oficial.`)
      }
      setSuggestions((list) => list.filter((item) => item.id !== s.id))
    } catch {
      toast('error', 'Não foi possível baixar o ativo', 'Anexe o arquivo manualmente.')
    }
  }

  const onPaste = (event: ClipboardEvent) => {
    const files = filesFromClipboard(event)
    if (files.length > 0) {
      event.preventDefault()
      void addFiles(files, project.id, 'paste')
    }
  }

  const submitOnCtrlEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void send(input)
    }
  }

  /* ------------------------------------------------ estado inicial */

  if (!hasConversation) {
    return (
      <div className="planner-hero-wrap">
        <motion.section
          className="planner-hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Planejar apresentação"
        >
          <h1>
            O que vamos <span className="gradient-text">apresentar</span>?
          </h1>
          <p className="planner-hero-sub">
            Descreva com as suas palavras — a IA entende o contexto, conversa quando falta algo
            e estrutura a narrativa e os slides.
          </p>

          <div className="meeting-shortcuts" role="group" aria-label="Tipo de apresentação">
            {MEETING_TYPES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`meeting-shortcut ${config.meetingType === m.id ? 'selected' : ''}`}
                aria-pressed={config.meetingType === m.id}
                onClick={() => {
                  patchConfig({ meetingType: m.id })
                  heroInputRef.current?.focus()
                }}
              >
                <strong>{m.label}</strong>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>

          <div className="planner-hero-input">
            <textarea
              ref={heroInputRef}
              className="field-control"
              placeholder={meta.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={submitOnCtrlEnter}
              onPaste={onPaste}
              aria-label="Briefing da apresentação"
            />
            <AttachmentArea
              ownerId={project.id}
              compact
              emptyHint="Anexe logos, fotos, gráficos, screenshots ou documentos — e descreva como cada um deve ser usado."
            />
            <div className="planner-hero-send">
              <span className="text-muted" style={{ fontSize: 12 }}>
                Enter quebra linha · Ctrl+Enter envia
              </span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={input.trim() === '' || thinking}
                onClick={() => void send(input)}
              >
                <Sparkles size={15} aria-hidden="true" />
                {thinking ? 'Estruturando…' : 'Continuar'}
              </button>
            </div>
          </div>

          <div className="planner-hero-essentials">
            <SlideCountField project={project} idPrefix="hero" />
            <StyleField project={project} idPrefix="hero" />
          </div>
          <AdvancedOptions project={project} idPrefix="hero" />
        </motion.section>
      </div>
    )
  }

  /* ------------------------------------------------ workspace */

  return (
    <div className={`planner-workspace ${paramsOpen ? '' : 'params-closed'}`}>
      {paramsOpen && (
        <aside className="panel planner-params" aria-label="Parâmetros do plano">
          <div className="planner-params-head">
            <h2>Parâmetros</h2>
            <button
              type="button"
              className="btn-icon"
              data-tip="Recolher painel"
              aria-label="Recolher painel de parâmetros"
              onClick={() => setParamsOpen(false)}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
          <div className="field">
            <label htmlFor="ws-meeting">Tipo de reunião</label>
            <select
              id="ws-meeting"
              className="field-control"
              value={config.meetingType}
              onChange={(e) => patchConfig({ meetingType: e.target.value as typeof config.meetingType })}
            >
              {MEETING_TYPES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <SlideCountField project={project} idPrefix="ws" />
          <StyleField project={project} idPrefix="ws" />
          <div className="field">
            <label>Anexos do projeto</label>
            <AttachmentArea
              ownerId={project.id}
              compact
              slideOptions={project.slides.map((s, i) => ({ id: s.id, title: `${i + 1}. ${s.plan.title}` }))}
            />
          </div>
          <AdvancedOptions project={project} idPrefix="ws" />
        </aside>
      )}

      <section className="panel planner-chat" aria-label="Chat de planejamento">
        {!paramsOpen && <ParamsSummary project={project} onExpand={() => setParamsOpen(true)} />}
        <div className="planner-thread" ref={threadRef}>
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                className={`msg ${message.role}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="msg-avatar" aria-hidden="true">
                  {message.role === 'assistant' ? <Sparkles size={14} /> : 'Eu'}
                </div>
                <div className="msg-body">
                  <div className="msg-bubble">{message.text}</div>
                  {message.plan && message.plan.slides.length === 0 && message.plan.clarifyingQuestions && (
                    <ul className="clarifying-questions">
                      {message.plan.clarifyingQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
                  {message.plan && message.plan.slides.length > 0 && (
                    <>
                      <PlanCard
                        plan={message.plan}
                        busy={thinking}
                        replanningSlideId={replanning}
                        onUpdatePlan={(plan) => updateMessagePlan(message.id, plan)}
                        onReplanSlide={(slideId) => void replanSlide(message.id, message.plan!, slideId)}
                        onRegenerate={() => regenerate(message)}
                        onSendToGenerator={() => sendToGenerator(message.plan!)}
                      />
                      {(snippetMatches[message.id]?.length ?? 0) > 0 && (
                        <div className="snippet-matches" role="region" aria-label="Snippets interpretados">
                          <strong>Snippets interpretados no briefing:</strong>
                          {snippetMatches[message.id].map((match) => (
                            <span key={match.snippet.id} className="snippet-match">
                              <span className="badge badge-cyan">{match.snippet.name}</span>
                              <small className="text-muted">“{match.matchedText.slice(0, 40)}”{match.explicit ? ' (explícito)' : ''}</small>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  const plan = message.plan!
                                  updateMessagePlan(message.id, {
                                    ...plan,
                                    slides: plan.slides.map((s) =>
                                      s.layout === 'cover'
                                        ? s
                                        : { ...s, snippetIds: [...new Set([...(s.snippetIds ?? []), match.snippet.id])] },
                                    ),
                                  })
                                  setSnippetMatches((m) => ({ ...m, [message.id]: m[message.id].filter((x) => x.snippet.id !== match.snippet.id) }))
                                  toast('success', 'Snippet aplicado', `“${match.snippet.name}” foi aplicado aos slides do plano.`)
                                }}
                              >
                                Aplicar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() =>
                                  setSnippetMatches((m) => ({ ...m, [message.id]: m[message.id].filter((x) => x.snippet.id !== match.snippet.id) }))
                                }
                              >
                                Ignorar
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {thinking && <ThinkingIndicator />}

          <OfficialAssetsPanel
            suggestions={suggestions}
            onUse={(s) => void acceptSuggestion(s)}
            onIgnore={(s) => setSuggestions((list) => list.filter((item) => item.id !== s.id))}
          />
        </div>

        <div className="planner-composer">
          <textarea
            ref={composerRef}
            className="field-control"
            placeholder="Responda, complemente o briefing ou peça ajustes no plano…"
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            onPaste={onPaste}
            aria-label="Mensagem para a IA"
          />
          <button
            type="button"
            className="composer-send"
            onClick={() => void send(input)}
            disabled={input.trim() === '' || thinking}
            aria-label="Enviar mensagem"
            data-tip="Enviar (Enter)"
          >
            <ArrowUp size={19} />
          </button>
        </div>
      </section>
    </div>
  )
}
