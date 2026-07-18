import { ChevronDown, FileCode2, Loader2, Play, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AttachmentArea } from '../../components/attachments/AttachmentArea'
import { Modal } from '../../components/Modal'
import { StylePicker } from '../../components/StylePicker'
import { getAiProvider } from '../../services/ai'
import { toAttachmentsForAi } from '../../services/attachments/attachmentService'
import { useAttachmentStore } from '../../state/attachmentStore'
import { AI_MODE } from '../../services/ai'
import { useProjectStore } from '../../state/projectStore'
import { useStyleStore } from '../../state/styleStore'
import { useUiStore } from '../../state/uiStore'
import type { DeckProject, ImageQualityPreset, RenderStrategy, VariationCount } from '../../types'
import { RENDER_STRATEGY_LABELS } from '../../types/generation'
import { sanitizeFileName } from '../../utils/filename'

/** Estimativa QUALITATIVA de custo (sem inventar valores monetários). */
function costEstimate(strategy: RenderStrategy, variations: number, quality: ImageQualityPreset): { label: string; warn: boolean } {
  if (strategy === 'structured') return { label: 'baixo (sem modelo de imagem)', warn: false }
  if (quality === '4k' || variations === 3) return { label: 'alto', warn: true }
  if (variations === 2 || quality === 'high') return { label: 'médio', warn: false }
  return { label: 'baixo', warn: false }
}

/**
 * Ajustes que já foram decididos no planner (ou têm padrão sensato) não
 * voltam como formulário — moram aqui, recolhidos.
 */
function AdvancedSetup({
  project,
  fileName,
  onFileName,
}: {
  project: DeckProject
  fileName: string
  onFileName: (value: string) => void
}) {
  const patchPlannerConfig = useProjectStore((s) => s.patchPlannerConfig)
  const patchProject = useProjectStore((s) => s.patchProject)
  const config = project.plannerConfig
  const [open, setOpen] = useState(false)

  return (
    <div className="adv-options">
      <button
        type="button"
        className="adv-toggle"
        aria-expanded={open}
        aria-controls="setup-adv"
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={13} aria-hidden="true" />
        Opções avançadas
        <ChevronDown size={14} className={`adv-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="adv-body" id="setup-adv">
          <div className="adv-group">
            <h5>Produção</h5>
            <div className="adv-grid">
              <div className="field">
                <label htmlFor="setup-variations">Variações por slide</label>
                <select
                  id="setup-variations"
                  className="field-control"
                  value={config.variationsPerSlide}
                  onChange={(e) => patchPlannerConfig({ variationsPerSlide: Number(e.target.value) as VariationCount })}
                >
                  <option value={1}>1 variação</option>
                  <option value={2}>2 variações</option>
                  <option value={3}>3 variações</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="setup-strategy">Estratégia padrão</label>
                <select
                  id="setup-strategy"
                  className="field-control"
                  value={config.defaultStrategy}
                  onChange={(e) => patchPlannerConfig({ defaultStrategy: e.target.value as RenderStrategy })}
                >
                  {(Object.keys(RENDER_STRATEGY_LABELS) as RenderStrategy[]).map((s) => (
                    <option key={s} value={s}>{RENDER_STRATEGY_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="setup-quality">Qualidade de imagem</label>
                <select
                  id="setup-quality"
                  className="field-control"
                  value={config.imageQuality}
                  onChange={(e) => patchPlannerConfig({ imageQuality: e.target.value as ImageQualityPreset })}
                >
                  <option value="draft">Rascunho</option>
                  <option value="high">Alta (padrão)</option>
                  <option value="4k">4K</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="setup-composition">Textos no modo Criativo</label>
                <select
                  id="setup-composition"
                  className="field-control"
                  value={config.aiComposition}
                  onChange={(e) => patchPlannerConfig({ aiComposition: e.target.value as 'overlay' | 'full' })}
                >
                  <option value="overlay">Aplicação aplica textos e logos (padrão)</option>
                  <option value="full">IA gera o slide completo</option>
                </select>
              </div>
            </div>
          </div>
          <div className="adv-group">
            <h5>Arquivo e idioma</h5>
            <div className="adv-grid">
              <div className="field">
                <label htmlFor="setup-file">Nome do arquivo final</label>
                <input
                  id="setup-file"
                  className="field-control"
                  value={fileName}
                  placeholder="apresentacao-squadhub"
                  onChange={(e) => onFileName(e.target.value)}
                  onBlur={() => onFileName(sanitizeFileName(fileName || project.name))}
                />
              </div>
              <div className="field">
                <label htmlFor="setup-lang">Idioma</label>
                <select
                  id="setup-lang"
                  className="field-control"
                  value={project.language}
                  onChange={(e) => {
                    patchProject({ language: e.target.value as DeckProject['language'] })
                    patchPlannerConfig({ language: e.target.value as DeckProject['language'] })
                  }}
                >
                  <option value="pt-BR">Português</option>
                  <option value="en-US">Inglês</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="setup-aspect">Proporção</label>
                <select id="setup-aspect" className="field-control" value="16:9" onChange={() => undefined}>
                  <option value="16:9">16:9 (widescreen)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Pré-geração. Com plano do planner: só confirmação (nome, slides,
 * estilo) — nada de repetir decisões já tomadas na conversa. Sem plano:
 * formulário direto com briefing + essenciais.
 */
export function SetupForm({ project }: { project: DeckProject }) {
  const styles = useStyleStore((s) => s.styles)
  const getById = useStyleStore((s) => s.getById)
  const getDefault = useStyleStore((s) => s.getDefault)
  const toast = useUiStore((s) => s.toast)
  const setTab = useUiStore((s) => s.setTab)

  const hasPlan = project.slides.length > 0
  const config = project.plannerConfig
  const [name, setName] = useState(project.name)
  const [fileName, setFileName] = useState(project.fileName)
  const [prompt, setPrompt] = useState(project.prompt)
  const [slideCount, setSlideCount] = useState(project.slideCount)
  const [styleId, setStyleId] = useState(project.styleId ?? getDefault()?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  const start = async () => {
    if (busy) return
    if (!prompt.trim() && !hasPlan) {
      toast('error', 'Descreva a apresentação', 'Preencha a descrição — ou monte um plano na aba Planejar.')
      return
    }
    setBusy(true)
    const store = useProjectStore.getState()
    try {
      store.patchProject({
        name: name.trim() || 'Nova apresentação',
        fileName: sanitizeFileName(fileName || name),
        prompt,
        styleId: styleId || null,
        language: project.language,
        slideCount,
      })
      store.patchPlannerConfig({ slideCount, styleId: styleId || null })
      if (!hasPlan) {
        const freshConfig = { ...useProjectStore.getState().project!.plannerConfig }
        const style = getById(styleId) ?? getDefault()
        const owned = useAttachmentStore.getState().byOwner(project.id)
        const attachments = await toAttachmentsForAi(owned.filter((a) => a.role !== 'do-not-use'))
        const plan = await getAiProvider().planDeck({ brief: prompt, config: freshConfig, style, attachments })
        if (plan.slides.length === 0) {
          toast(
            'error',
            'Briefing insuficiente',
            plan.clarifyingQuestions?.[0] ?? 'Detalhe melhor o conteúdo — ou use a aba Planejar para responder às perguntas da IA.',
          )
          setBusy(false)
          return
        }
        store.applyPlan(plan)
        // Mantém o nome e o arquivo definidos pelo usuário acima do título sugerido.
        useProjectStore.getState().patchProject({
          name: name.trim() || plan.title,
          fileName: sanitizeFileName(fileName || name || plan.title),
        })
      }
      useProjectStore.getState().startGeneration()
      toast('info', 'Geração iniciada', 'Os slides serão gerados um a um para sua revisão.')
    } catch (error) {
      toast('error', 'Não foi possível iniciar', error instanceof Error ? error.message : 'Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const estimate = costEstimate(config.defaultStrategy, config.variationsPerSlide, config.imageQuality)

  /* --------------------------------------------- com plano: confirmação */

  if (hasPlan) {
    return (
      <section className="panel gen-setup gen-setup-lite" aria-label="Confirmar geração">
        <h2>Gerar apresentação</h2>
        <p>
          Estrutura definida na conversa: <strong>{project.slides.length} slides</strong> · {project.language}
          {' · '}16:9. As decisões do planner serão usadas diretamente.
        </p>

        <div className="gen-setup-lite-grid">
          <div className="field">
            <label htmlFor="setup-name">Nome da apresentação</label>
            <input id="setup-name" className="field-control" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="setup-style">Estilo visual</label>
            <StylePicker id="setup-style" styles={styles} value={styleId || null} onChange={(id) => setStyleId(id ?? '')} />
          </div>
        </div>

        <div className="gen-setup-lite-strip">
          {project.slides.slice(0, 8).map((s, i) => (
            <span key={s.id} className="gen-setup-slide-chip" title={s.plan.title}>
              {String(i + 1).padStart(2, '0')} {s.plan.title}
            </span>
          ))}
          {project.slides.length > 8 && <span className="gen-setup-slide-chip">+{project.slides.length - 8}</span>}
        </div>

        <AdvancedSetup project={project} fileName={fileName} onFileName={setFileName} />

        <div className="gen-setup-foot">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void start()} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {busy ? 'Iniciando…' : 'Gerar apresentação'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPromptOpen(true)}>
            <FileCode2 size={14} aria-hidden="true" /> Ver detalhes técnicos
          </button>
          <span className="note">
            Cada slide abre um período de revisão · custo estimado: <strong>{estimate.label}</strong>
            {AI_MODE === 'mock' && ' (simulação: sem custo real)'}
          </span>
        </div>

        <Modal open={promptOpen} title="Detalhes técnicos da geração" onClose={() => setPromptOpen(false)} width={760}>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Prompt consolidado construído a partir do plano — usado como contexto de produção de todos os slides.
          </p>
          <pre className="plan-prompt" style={{ margin: 0, maxHeight: 420 }}>{project.prompt}</pre>
        </Modal>
      </section>
    )
  }

  /* --------------------------------------------- sem plano: formulário direto */

  return (
    <section className="panel gen-setup" aria-label="Configuração da geração">
      <h2>
        Gerar <span className="gradient-text">slides</span>
      </h2>
      <p>Descreva a apresentação — ou monte um plano completo conversando com a IA na aba Planejar.</p>

      <div className="gen-setup-grid">
        <div className="field wide">
          <label htmlFor="setup-prompt">Descrição da apresentação</label>
          <textarea
            id="setup-prompt"
            className="field-control"
            rows={5}
            value={prompt}
            placeholder="Descreva a apresentação completa: tema, narrativa, sequência e direção visual…"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="setup-name">Nome do projeto</label>
          <input id="setup-name" className="field-control" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="setup-count">Quantidade de slides</label>
          <input
            id="setup-count"
            type="number"
            min={3}
            max={16}
            className="field-control"
            value={slideCount}
            onChange={(e) => setSlideCount(Math.max(3, Math.min(16, Number(e.target.value) || 6)))}
          />
        </div>
        <div className="field wide">
          <label htmlFor="setup-style">Estilo visual</label>
          <StylePicker id="setup-style" styles={styles} value={styleId || null} onChange={(id) => setStyleId(id ?? '')} />
        </div>
        <div className="field wide">
          <label>Anexos do projeto</label>
          <AttachmentArea
            ownerId={project.id}
            compact
            emptyHint="Logos, fotos e referências anexados aqui são considerados na geração."
          />
        </div>
      </div>

      <AdvancedSetup project={project} fileName={fileName} onFileName={setFileName} />

      <div className="gen-setup-foot">
        <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {busy ? 'Estruturando…' : 'Iniciar geração'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setTab('planner')}>
          <Sparkles size={15} aria-hidden="true" />
          Planejar com IA antes
        </button>
        <span className="note">
          Custo estimado: <strong>{estimate.label}</strong>
          {AI_MODE === 'mock' && ' (simulação: sem custo real)'}
        </span>
      </div>
    </section>
  )
}
