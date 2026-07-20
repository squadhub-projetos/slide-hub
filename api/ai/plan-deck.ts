import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  optionalString,
  validateAttachments,
  HttpError,
  type ApiRequest,
  type ApiResponse,
  type IncomingAttachment,
} from '../_lib/http'
import { DECK_PLAN_SCHEMA, PLAN_LIGHT_SCHEMA, SINGLE_SLIDE_SCHEMA } from '../_lib/deckSchema'
import {
  readAiCatalog,
  resolveStageSelection,
  stageTimeoutMs,
  type AiStage,
  type ExecutionMode,
} from '../_lib/aiConfig'
import { getTextProvider } from '../_lib/textProviders'

// O modo Qualidade (plano monolítico com raciocínio alto) ainda pode ser
// longo; planejamento leve e produção por slide ficam muito abaixo disso.
export const config = { maxDuration: 60 }

/* ------------------------------------------------------------------ */
/* Prompts por etapa                                                   */
/* ------------------------------------------------------------------ */

const CORE_RULES = `REGRA MESTRA — O BRIEFING É A FONTE PRINCIPAL:
- O ASSUNTO vem do briefing do usuário; o tipo de reunião influencia só FORMATO/tom, nunca substitui o assunto.
- Proibidas frases corporativas genéricas sem base no texto do usuário.
- NUNCA invente números, cases, clientes ou resultados; use "[a confirmar]" quando faltar dado não essencial.
- Anexos são ARQUIVOS reais aplicados pelo sistema (fotos/logos nunca são redesenhados); vincule-os via assetIds/attachmentIds aos slides certos.
- Use TODO o histórico da conversa; nunca pergunte de novo o que já foi respondido.`

/** Planejamento LEVE: estrutura e narrativa — sem texto final por slide. */
const PLAN_LIGHT_SYSTEM = `Você é o planejador do Slide Hub (SquadHub). Gere a ESTRUTURA da apresentação — curta e específica. O texto final de cada slide será produzido depois, em outra etapa.

${CORE_RULES}

SAÍDA (enxuta):
- assistantMessage: 2-4 frases naturais no chat (o que entendeu/inferiu/falta).
- narrative: 2-4 frases descrevendo a progressão (slide a slide, em alto nível).
- slides: para cada um, layout + título editorial + message (1 frase) + contentHints (2-4 direções curtas) + requiresImage + assetIds dos anexos que pertencem àquele slide.
- Quando faltar informação CRÍTICA: slides=[], até 3 clarifyingQuestions e explique em assistantMessage.
- A configuração é ponto de partida; se o briefing indicar outro cenário (ex.: "kickoff interno"), devolva a SUA leitura em meetingType/audienceScope e registre em inferred.

VARIEDADE VISUAL (obrigatória):
- Nunca repita o mesmo layout em slides consecutivos (exceto quando o conteúdo exigir).
- 'cover' apenas no primeiro slide; 'conclusion' ou 'cta' no último.
- 'process' SOMENTE para sequência/etapas reais; 'comparison' para contraste real; 'bigNumber' para dado que existe; 'timeline' para cronologia.
- requiresImage=true somente quando a imagem agrega (foto anexada, produto, cena) — não para slides de lista/conceito.`

/** Produção de UM slide: texto final específico a partir do plano. */
const SLIDE_PRODUCTION_SYSTEM = `Você produz UM slide de uma apresentação já planejada (Slide Hub/SquadHub).

${CORE_RULES}

REGRAS DO SLIDE:
- Cumpra o papel do slide dentro da narrativa; não repita o conteúdo dos slides adjacentes.
- title: editorial e natural (pode refinar o título indicado, mantendo a intenção).
- content: 2-4 itens curtos e ESPECÍFICOS (frases completas curtas, não palavras soltas).
- keyMessage ≠ objective ≠ visualDirection (mensagem, porquê e como mostrar).
- productionPrompt: 50-90 palavras, autossuficiente para gerar o visual deste slide (conteúdo exato, direção, marca; logos são camada do sistema — nunca pedir para desenhar).
- speakerIntent: 1 frase.
- Idioma conforme a configuração.`

const PLANNER_SYSTEM = `Você é o planejador de apresentações do Slide Hub (SquadHub).
Você CONVERSA com o usuário e produz planos específicos e acionáveis a partir do briefing real.

${CORE_RULES}

COMPORTAMENTO CONVERSACIONAL:
- assistantMessage é a sua fala no chat: curta (2-5 frases). Diga o que entendeu, inferiu e o que falta — sem repetir o plano.
- Quando faltar informação CRÍTICA: slides=[], até 3 clarifyingQuestions, explicação em assistantMessage.
- A configuração é ponto de partida; devolva a SUA leitura final nos campos do plano e registre mudanças em insights.inferred.

Regras do plano completo:
- Progressão narrativa sem repetição; objetivo ≠ keyMessage ≠ visualDirection.
- attachmentsUsed registra todos os anexos utilizados.
- productionPrompt autossuficiente por slide; masterPrompt consolida contexto/narrativa/identidade (logo é camada do sistema).
- Varie os layouts entre slides consecutivos; capa só na abertura; conclusão/cta no fechamento.`

const FAST_MODE_INSTRUCTION = `MODO RÁPIDO — SAÍDA ENXUTA: masterPrompt ≤150 palavras; productionPrompt 50-90 palavras; content com 2-4 itens curtos; sem parágrafos longos.`

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

function attachmentContext(attachments: IncomingAttachment[], withText = true): string {
  if (attachments.length === 0) return 'Sem anexos.'
  return attachments
    .map(
      (a) =>
        `- ${a.id} — ${a.name} (${a.role}) — ${a.description || 'sem descrição'} — uso: ${a.usage || 'não especificado'}${a.mustAppearExactly ? ' — DEVE aparecer exatamente como enviado' : ''}${withText && a.textContent ? `\n  Conteúdo textual:\n  ${a.textContent.slice(0, 4000)}` : ''}`,
    )
    .join('\n')
}

interface HistoryItem {
  role: 'user' | 'assistant'
  text: string
}

function parseHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: typeof m.text === 'string' ? m.text.slice(0, 4000) : '',
    }))
    .filter((m) => m.text.length > 0)
    .slice(-24)
}

/* ------------------------------------------------------------------ */
/* Normalização resiliente (o 502 de ~96s nasceu aqui)                 */
/* ------------------------------------------------------------------ */

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Campo opcional ausente NUNCA derruba um plano utilizável: insights sem
 * vir do modelo são derivados da narrativa; arrays ausentes viram vazios.
 * Devolve null apenas quando o plano é realmente inutilizável (sem
 * título ou sem slides) — e só ISSO justifica o retry curto.
 */
function normalizeFullPlan(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = { ...(parsed as Record<string, unknown>) }
  if (!str(p.title)) return null
  if (!Array.isArray(p.slides)) return null

  const insightsRaw = (typeof p.insights === 'object' && p.insights !== null ? p.insights : {}) as Record<string, unknown>
  const narrative = str(p.narrativeLogic) || str(p.executiveSummary) || str(p.centralMessage)
  p.subtitle = str(p.subtitle)
  p.assistantMessage = str(p.assistantMessage)
  p.centralMessage = str(p.centralMessage, str(p.title))
  p.executiveSummary = str(p.executiveSummary, narrative)
  p.narrativeLogic = str(p.narrativeLogic, narrative)
  p.insights = {
    understanding: str(insightsRaw.understanding, narrative),
    centralMessage: str(insightsRaw.centralMessage, str(p.centralMessage)),
    keyInsights: strArr(insightsRaw.keyInsights),
    decisionsToProvoke: strArr(insightsRaw.decisionsToProvoke),
    inferred: strArr(insightsRaw.inferred),
    assumptions: strArr(insightsRaw.assumptions),
    missingInformation: strArr(insightsRaw.missingInformation),
    communicationRisks: strArr(insightsRaw.communicationRisks),
    narrativeSuggestion: str(insightsRaw.narrativeSuggestion, narrative),
    statedFacts: strArr(insightsRaw.statedFacts),
    audienceInterpretation: str(insightsRaw.audienceInterpretation),
    intent: str(insightsRaw.intent),
  }
  p.recommendedSlideCount = typeof p.recommendedSlideCount === 'number' ? p.recommendedSlideCount : (p.slides as unknown[]).length
  p.attachmentsUsed = Array.isArray(p.attachmentsUsed) ? p.attachmentsUsed : []
  p.masterPrompt = str(p.masterPrompt)
  p.clarifyingQuestions = strArr(p.clarifyingQuestions)
  p.slides = (p.slides as unknown[]).map((s, i) => normalizeSlide(s, i)).filter((s): s is Record<string, unknown> => s !== null)
  if ((p.slides as unknown[]).length === 0 && (p.clarifyingQuestions as string[]).length === 0) return null
  return p
}

function normalizeSlide(parsed: unknown, index: number): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const s = { ...(parsed as Record<string, unknown>) }
  if (!str(s.title)) return null
  const layouts = ['cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta']
  s.id = str(s.id, `slide-${index + 1}`)
  s.order = typeof s.order === 'number' ? s.order : index + 1
  s.subtitle = str(s.subtitle)
  s.objective = str(s.objective, str(s.keyMessage, str(s.title)))
  s.keyMessage = str(s.keyMessage, str(s.title))
  s.content = strArr(s.content)
  s.evidence = strArr(s.evidence)
  s.speakerIntent = str(s.speakerIntent)
  s.layout = layouts.includes(str(s.layout)) ? s.layout : 'textImage'
  s.visualDirection = str(s.visualDirection)
  s.brandInstructions = str(s.brandInstructions)
  s.attachmentIds = strArr(s.attachmentIds)
  s.productionPrompt = str(s.productionPrompt, `${str(s.title)}: ${str(s.keyMessage)}`)
  s.negativePrompt = str(s.negativePrompt)
  return s
}

function normalizeLightPlan(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = { ...(parsed as Record<string, unknown>) }
  if (!str(p.title) && strArr(p.clarifyingQuestions).length === 0) return null
  p.assistantMessage = str(p.assistantMessage)
  p.subtitle = str(p.subtitle)
  p.centralMessage = str(p.centralMessage, str(p.title))
  p.narrative = str(p.narrative)
  p.understanding = str(p.understanding, str(p.narrative))
  p.inferred = strArr(p.inferred)
  p.missingInformation = strArr(p.missingInformation)
  p.clarifyingQuestions = strArr(p.clarifyingQuestions)
  const layouts = ['cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta']
  p.slides = (Array.isArray(p.slides) ? p.slides : [])
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null && Boolean(str((s as Record<string, unknown>).title)))
    .map((s, i) => ({
      order: typeof s.order === 'number' ? s.order : i + 1,
      layout: layouts.includes(str(s.layout)) ? s.layout : 'textImage',
      title: str(s.title),
      message: str(s.message, str(s.title)),
      contentHints: strArr(s.contentHints),
      requiresImage: s.requiresImage === true,
      assetIds: strArr(s.assetIds),
    }))
  return p
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const catalog = readAiCatalog()
    const startedAt = Date.now()

    const brief = requireString(body, 'brief', 24_000)
    const mode = optionalString(body, 'mode', 32) ?? 'full'
    if (!['full', 'single-slide', 'plan-light', 'slide-production'].includes(mode)) {
      throw new HttpError(400, `Operação desconhecida: ${mode}.`)
    }
    const stage: AiStage =
      mode === 'single-slide' ? 'revision' : mode === 'slide-production' ? 'slide-production' : 'planning'
    const history = parseHistory(body.history)
    const config = body.config as Record<string, unknown> | undefined
    const style = body.style as Record<string, unknown> | null | undefined
    const attachments = validateAttachments(body.attachments)

    const requestedMode = optionalString(body, 'executionMode', 16)
    const executionMode: ExecutionMode =
      requestedMode === 'fast' || requestedMode === 'balanced' || requestedMode === 'quality' || requestedMode === 'custom'
        ? requestedMode
        : catalog.executionMode
    const selection = resolveStageSelection(
      catalog,
      stage,
      optionalString(body, 'provider', 16),
      optionalString(body, 'model', 80),
    )
    const timeoutMs = stageTimeoutMs(catalog, stage)
    const provider = getTextProvider(selection.provider, timeoutMs)

    const configText = config ? JSON.stringify(config).slice(0, 4000) : '{}'
    const styleText = style
      ? `Estilo: ${JSON.stringify({
          name: style.name,
          theme: style.theme,
          palette: style.palette,
          visualDirection: style.visualDirection,
          compositionRules: style.compositionRules,
          aiInstructions: style.aiInstructions,
          textRules: style.textRules,
          logoRules: style.logoRules,
          brandId: style.brandId,
        }).slice(0, 6000)}`
      : 'Sem estilo selecionado — use direção sóbria corporativa.'

    const userParts: { text?: string; imageDataUrl?: string }[] = []
    let system: string
    let schema: Record<string, unknown>
    let schemaName: string
    let normalize: (parsed: unknown) => Record<string, unknown> | null

    if (mode === 'slide-production') {
      // Produção de UM slide: contexto compacto, sem histórico completo
      // e sem reenviar imagens (elas já orientaram o planejamento).
      const deckSummary = requireString(body, 'deckSummary', 4000)
      const slideStub = body.slideStub as Record<string, unknown> | undefined
      if (!slideStub) throw new HttpError(400, 'slideStub obrigatório para produção de slide.')
      const adjacent = optionalString(body, 'adjacentSummaries', 2000) ?? ''
      system = SLIDE_PRODUCTION_SYSTEM
      schema = SINGLE_SLIDE_SCHEMA as Record<string, unknown>
      schemaName = 'planned_slide'
      normalize = (parsed) => normalizeSlide(parsed, Number(slideStub.order ?? 1) - 1)
      userParts.push({
        text: `Apresentação:\n${deckSummary}\n\n${styleText}\n\nSlide a produzir:\n${JSON.stringify(slideStub).slice(0, 3000)}\n\nSlides adjacentes (não repetir):\n${adjacent}\n\nAnexos relevantes:\n${attachmentContext(attachments, false)}`,
      })
    } else {
      system =
        mode === 'plan-light'
          ? PLAN_LIGHT_SYSTEM
          : executionMode === 'fast' || executionMode === 'balanced'
            ? `${PLANNER_SYSTEM}\n\n${FAST_MODE_INSTRUCTION}`
            : PLANNER_SYSTEM
      schema = (mode === 'plan-light' ? PLAN_LIGHT_SCHEMA : mode === 'single-slide' ? SINGLE_SLIDE_SCHEMA : DECK_PLAN_SCHEMA) as Record<string, unknown>
      schemaName = mode === 'plan-light' ? 'plan_light' : mode === 'single-slide' ? 'planned_slide' : 'deck_plan'
      normalize = mode === 'plan-light' ? normalizeLightPlan : mode === 'single-slide' ? (parsed) => normalizeSlide(parsed, 0) : normalizeFullPlan

      userParts.push({
        text: `Briefing do usuário:\n${brief}\n\nConfiguração:\n${configText}\n\n${styleText}\n\nAnexos:\n${attachmentContext(attachments)}`,
      })
      for (const a of attachments) {
        if (a.imageDataUrl) {
          userParts.push({ text: `Imagem do anexo ${a.id} (${a.name}):` })
          userParts.push({ imageDataUrl: a.imageDataUrl })
        }
      }
      if (mode === 'single-slide') {
        const plan = body.plan as Record<string, unknown> | undefined
        const slideId = requireString(body, 'slideId', 64)
        const instructions = optionalString(body, 'instructions', 4000)
        userParts.push({
          text: `Replaneje SOMENTE o slide de id "${slideId}" do plano a seguir, sem alterar os demais. ${instructions ? `Instruções: ${instructions}` : ''}\nPlano atual:\n${JSON.stringify(plan).slice(0, 20_000)}`,
        })
      }
    }

    const promptChars =
      system.length +
      history.reduce((sum, h) => sum + h.text.length, 0) +
      userParts.reduce((sum, p) => sum + (p.text?.length ?? 0), 0)

    const callModel = (extraInstruction?: string) =>
      provider.generateStructured({
        model: selection.model,
        mode: executionMode,
        system,
        history: mode === 'slide-production' ? [] : history,
        userParts,
        schemaName,
        schema,
        timeoutMs,
        extraInstruction,
      })

    // Ordem de reparo: parse (no provider) → normalização local com
    // defaults → UMA tentativa curta de reparo por IA → erro claro.
    // Nunca duas chamadas longas para rejeitar um campo opcional.
    const callStartedAt = Date.now()
    let result = await callModel()
    let retried = false
    let normalized = normalize(result.parsed)
    if (!normalized) {
      console.warn(`[plan-deck] resposta inutilizável após normalização (${mode}) — 1 reparo curto`)
      retried = true
      result = await callModel(
        'A resposta anterior veio sem os campos essenciais (título/slides). Responda ESTRITAMENTE no schema pedido, sem texto fora do JSON.',
      )
      normalized = normalize(result.parsed)
      if (!normalized) {
        res.status(502).json({ error: 'O modelo não retornou um plano utilizável (sem título ou slides). Tente novamente ou troque o modelo.' })
        return
      }
    }
    const modelMs = Date.now() - callStartedAt

    console.log(
      `[plan-deck] ok stage=${stage} provider=${selection.provider} model=${selection.model} mode=${executionMode} id=${result.requestId ?? '-'} op=${mode} durMs=${Date.now() - startedAt} modelMs=${modelMs} tokens_in=${result.inputTokens ?? '?'} tokens_out=${result.outputTokens ?? '?'} promptChars=${promptChars} attachments=${attachments.length}${retried ? ' (retry)' : ''}`,
    )

    res.status(200).json({
      plan: normalized,
      meta: {
        provider: selection.provider,
        model: selection.model,
        stage,
        executionMode,
        requestId: result.requestId,
        durationMs: Date.now() - startedAt,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        schemaValid: !retried,
        retried,
        createdAt: new Date().toISOString(),
        stages: {
          validationMs: callStartedAt - startedAt,
          modelMs,
          totalMs: Date.now() - startedAt,
        },
        promptChars,
        historyCount: history.length,
        attachmentsCount: attachments.length,
      },
    })
  } catch (error) {
    handleError(res, error, 'plan-deck')
  }
}
