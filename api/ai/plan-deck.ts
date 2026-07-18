import { readEnv } from '../_lib/env'
import {
  handleError,
  requireBody,
  requirePost,
  requireString,
  optionalString,
  validateAttachments,
  type ApiRequest,
  type ApiResponse,
  type IncomingAttachment,
} from '../_lib/http'
import { DECK_PLAN_SCHEMA, SINGLE_SLIDE_SCHEMA } from '../_lib/deckSchema'
import { getOpenAi } from '../_lib/openaiClient'

// Planejamento com reasoning "high" pode passar de 2min (medido: ~130s para
// 6 slides) — sem isto a função cai no timeout padrão da Vercel (bem menor)
// e a IA real nunca chega a responder, mesmo estando configurada corretamente.
export const config = { maxDuration: 60 }

const PLANNER_SYSTEM = `Você é o planejador de apresentações do Slide Hub (SquadHub).
Você CONVERSA com o usuário e produz planos específicos e acionáveis a partir do briefing real.

REGRA MESTRA — O BRIEFING É A FONTE PRINCIPAL:
- O ASSUNTO da apresentação vem do briefing, palavra por palavra do que o usuário descreveu.
- O tipo de reunião (checkpoint/kickoff/town-hall/proposta) influencia apenas FORMATO, tom e ênfase — NUNCA substitui o assunto. É PROIBIDO devolver uma estrutura padrão do tipo de reunião (ex.: "resultados, pessoas e prioridades") quando o briefing descreve outro assunto.
- Exemplo: se o briefing pede "apresentar a demo deste produto para o time", os slides devem tratar do produto, do problema que resolve, do fluxo demonstrado, dos benefícios e dos próximos passos de adoção — mesmo num Town-Hall.
- Cada slide deve citar conteúdo ESPECÍFICO do briefing. Proibidas frases corporativas genéricas ("sinergia", "alavancar resultados", "um time informado decide melhor") sem base no texto do usuário.

COMPORTAMENTO CONVERSACIONAL:
- assistantMessage é a sua fala no chat: curta (2-5 frases), natural, em ${'pt-BR'} salvo configuração contrária. Diga o que entendeu, o que inferiu e o que ainda falta — sem repetir o plano inteiro (ele aparece num card próprio).
- Use TODO o histórico da conversa: aproveite informações já fornecidas, respeite decisões anteriores e NUNCA pergunte de novo algo já respondido.
- Quando faltar informação CRÍTICA (assunto indefinido, sem conteúdo aproveitável), converse antes de gerar: devolva slides=[], até 3 perguntas objetivas em clarifyingQuestions e explique em assistantMessage por que precisa delas. Não faça perguntas desnecessárias — se dá para inferir com segurança, infira e registre em insights.inferred.
- A configuração enviada (tipo, público interno/externo, objetivo, tom) é um PONTO DE PARTIDA. Quando o briefing deixar claro outro cenário (ex.: "kickoff interno com meu time" apesar do padrão externo de kickoff), devolva nos campos do plano (meetingType, audienceScope, audienceSegment, objective) a SUA leitura final, registre a mudança em insights.inferred e mencione-a em assistantMessage.
- Comandos de ajuste em linguagem natural ("deixe mais executivo", "reduza para 5 slides", "foque no cliente X") alteram o plano diretamente; preserve tudo que o usuário não pediu para mudar.

Regras invioláveis:
- NUNCA copie a frase do usuário como título; títulos são naturais e editoriais.
- NUNCA invente números, cases, clientes ou resultados. Quando faltar um dado não essencial, use "[a confirmar]" e registre em assumptions/missingInformation.
- Em insights.statedFacts, liste APENAS o que o usuário informou diretamente; em insights.inferred, o que você deduziu (explique a inferência); em insights.intent, o que o usuário quer que aconteça; em insights.audienceInterpretation, como você leu o público.
- Quando faltar informação CRÍTICA, devolva slides=[] e até 3 perguntas objetivas em clarifyingQuestions.
- Não repita a mesma mensagem em vários slides; construa progressão narrativa (cada slide avança a história).
- Diferencie objetivo (por que o slide existe), keyMessage (a mensagem principal) e visualDirection (como mostrar).
- Respeite a quantidade de slides, público, objetivo, tom, idioma e anexos descritos.
- Use os anexos: associe attachmentIds aos slides adequados e registre todos em attachmentsUsed (nunca ignore um em silêncio).
- productionPrompt de cada slide deve ser autossuficiente para regenerar aquele slide isoladamente (conteúdo exato, direção visual, marca, anexos, negative prompt).
- masterPrompt deve consolidar: contexto, reunião, público, objetivo, tom, idioma, quantidade, proporção, identidade visual, marca e regras de logo (o logo oficial é aplicado pelo sistema como camada exata — proibido pedir para gerar/desenhar logos), anexos e regras de cada um, narrativa, sequência completa, conteúdo por slide, hierarquia tipográfica, composição, elementos obrigatórios e proibidos, regras de consistência, preservação de textos/números, áreas seguras, variações e negative prompt.`

function attachmentContext(attachments: IncomingAttachment[]): string {
  if (attachments.length === 0) return 'Sem anexos.'
  return attachments
    .map(
      (a) =>
        `- ${a.id} — ${a.name} (${a.role}) — ${a.description || 'sem descrição'} — uso: ${a.usage || 'não especificado'}${a.mustAppearExactly ? ' — DEVE aparecer exatamente como enviado (camada determinística)' : ''}${a.referenceOnly ? ' — apenas referência visual' : ''}${a.textContent ? `\n  Conteúdo textual:\n  ${a.textContent.slice(0, 4000)}` : ''}`,
    )
    .join('\n')
}

type ContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }

interface HistoryItem {
  role: 'user' | 'assistant'
  text: string
}

/** Histórico do chat (sem planos/anexos): a IA não pode ignorar a conversa. */
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

/** Validação leve do plano (além do strict schema) — chaves essenciais. */
function validatePlanShape(parsed: unknown, mode: string): string | null {
  if (typeof parsed !== 'object' || parsed === null) return 'resposta não é um objeto'
  const p = parsed as Record<string, unknown>
  if (mode === 'single-slide') {
    if (typeof p.title !== 'string' || typeof p.productionPrompt !== 'string') return 'slide sem title/productionPrompt'
    return null
  }
  if (typeof p.title !== 'string') return 'plano sem title'
  if (!Array.isArray(p.slides)) return 'plano sem slides[]'
  if (typeof p.insights !== 'object' || p.insights === null) return 'plano sem insights'
  if (typeof p.masterPrompt !== 'string') return 'plano sem masterPrompt'
  return null
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    requirePost(req)
    const body = requireBody(req)
    const env = readEnv()
    const client = getOpenAi(env)
    const startedAt = Date.now()

    const brief = requireString(body, 'brief', 24_000)
    const mode = optionalString(body, 'mode', 32) ?? 'full'
    const history = parseHistory(body.history)
    const config = body.config as Record<string, unknown> | undefined
    const style = body.style as Record<string, unknown> | null | undefined
    const attachments = validateAttachments(body.attachments)

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

    const parts: ContentPart[] = [
      {
        type: 'input_text',
        text: `Briefing do usuário:\n${brief}\n\nConfiguração:\n${configText}\n\n${styleText}\n\nAnexos:\n${attachmentContext(attachments)}`,
      },
    ]
    for (const a of attachments) {
      if (a.imageDataUrl) {
        parts.push({ type: 'input_text', text: `Imagem do anexo ${a.id} (${a.name}):` })
        parts.push({ type: 'input_image', image_url: a.imageDataUrl, detail: 'auto' })
      }
    }

    if (mode === 'single-slide') {
      const plan = body.plan as Record<string, unknown> | undefined
      const slideId = requireString(body, 'slideId', 64)
      const instructions = optionalString(body, 'instructions', 4000)
      parts.push({
        type: 'input_text',
        text: `Replaneje SOMENTE o slide de id "${slideId}" do plano a seguir, sem alterar os demais. ${instructions ? `Instruções: ${instructions}` : ''}\nPlano atual:\n${JSON.stringify(plan).slice(0, 20_000)}`,
      })
    }

    // Mensagens anteriores entram como turnos reais da conversa — a IA
    // enxerga o que já foi dito e não repete perguntas respondidas.
    const historyMessages = history.map((m) => ({ role: m.role, content: m.text }))

    const callModel = (extraInstruction?: string) =>
      client.responses.create({
        model: env.textModel,
        reasoning: { effort: 'high' },
        instructions: extraInstruction ? `${PLANNER_SYSTEM}\n\n${extraInstruction}` : PLANNER_SYSTEM,
        input: [...historyMessages, { role: 'user' as const, content: parts }],
        text: {
          format: {
            type: 'json_schema',
            name: mode === 'single-slide' ? 'planned_slide' : 'deck_plan',
            strict: true,
            schema: (mode === 'single-slide' ? SINGLE_SLIDE_SCHEMA : DECK_PLAN_SCHEMA) as Record<string, unknown>,
          },
        },
      })

    // 1 retry CONTROLADO quando o JSON vier inválido — nunca fallback genérico.
    let response = await callModel()
    let retried = false
    let parsed: unknown
    let invalidReason: string | null = null
    try {
      parsed = JSON.parse(response.output_text)
      invalidReason = validatePlanShape(parsed, mode)
    } catch {
      invalidReason = 'JSON inválido'
    }
    if (invalidReason) {
      console.warn(`[plan-deck] resposta inválida (${invalidReason}) — refazendo 1x`)
      retried = true
      response = await callModel(
        `A resposta anterior foi inválida (${invalidReason}). Responda ESTRITAMENTE no schema JSON pedido, sem texto fora do JSON.`,
      )
      try {
        parsed = JSON.parse(response.output_text)
        invalidReason = validatePlanShape(parsed, mode)
      } catch {
        invalidReason = 'JSON inválido'
      }
      if (invalidReason) {
        res.status(502).json({ error: `O modelo retornou uma resposta inválida (${invalidReason}). Tente novamente.` })
        return
      }
    }

    // Log útil, sem segredos nem conteúdo completo.
    const usage = response.usage
    console.log(
      `[plan-deck] ok model=${env.textModel} id=${response.id} mode=${mode} durMs=${Date.now() - startedAt} tokens_in=${usage?.input_tokens ?? '?'} tokens_out=${usage?.output_tokens ?? '?'}${retried ? ' (retry)' : ''}`,
    )

    res.status(200).json({
      plan: parsed,
      meta: {
        provider: 'openai',
        model: env.textModel,
        requestId: response.id,
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        schemaValid: true,
        retried,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    handleError(res, error, 'plan-deck')
  }
}
