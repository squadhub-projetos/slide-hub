import type {
  AttachmentForAi,
  DeckInsights,
  DeckPlan,
  DesignStyle,
  PlanDeckRequest,
  PlannedSlide,
  PlannerConfig,
  SlideLayout,
} from '../../types'
import { getMeetingMeta, segmentEffect } from '../../features/planner/plannerOptions'
import { getBrand } from '../../config/brands'
import { uid } from '../../utils/id'

/* ------------------------------------------------------------------ */
/* Extração de fatos do briefing — nada de inventar números ou nomes.  */
/* ------------------------------------------------------------------ */

export interface BriefFacts {
  sentences: string[]
  numbers: { value: string; context: string }[]
  entities: string[]
  clientGuess: string | null
  topic: string
}

const STOP_ENTITIES = new Set([
  'A', 'O', 'Os', 'As', 'Um', 'Uma', 'Para', 'Com', 'Sem', 'De', 'Do', 'Da', 'Em', 'No', 'Na',
  'Que', 'Nos', 'Nas', 'Ao', 'Aos', 'Este', 'Esta', 'Esse', 'Essa', 'Depois', 'Antes', 'Durante',
  'Descreva', 'Preciso', 'Quero', 'Cliente', 'Projeto', 'Apresentação', 'Reunião', 'Foco', 'Dia',
])

// Aberturas de intenção em 1ª pessoa ("vou apresentar", "quero mostrar"…)
// precisam ser removidas ANTES do corte por palavras — senão o "tópico"
// extraído vira a própria frase de intenção ("vou apresentar a demo"),
// e não o assunto real que vem depois dela.
const INTRO_VERB_PREFIX =
  /^(vou|vamos|pretendo|planejo|preciso|precisamos|queremos)\s+(apresentar|mostrar|falar sobre|demonstrar|explicar|contar sobre|fazer)\s+/i
const INTENT_PREFIX =
  /^(quero|queria|gostaria de|preciso(?: de)?|crie|criar|monte|montar|faça|fazer|gere|gerar|apresentação (?:de|sobre|para)|deck (?:de|sobre|para)|slides (?:de|sobre|para)|um|uma|o|a)\s+/i
const TRAILING_STOP =
  /\s+(de|da|do|das|dos|para|pra|com|em|no|na|nos|nas|e|que|a|o|as|os|um|uma|sobre|interessada|interessado)$/i

/**
 * @param namedEntities Nomes próprios já detectados no briefing (marca,
 *   produto, cliente). Quando um deles não aparece no recorte ingênuo de
 *   palavras, ele PREVALECE — um nome capitalizado citado pelo usuário
 *   quase sempre é o assunto real, mais confiável que as primeiras N
 *   palavras após remover verbos de abertura.
 */
function extractTopic(brief: string, namedEntities: string[] = []): string {
  let cleaned = brief.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'a apresentação'
  cleaned = cleaned.replace(INTRO_VERB_PREFIX, '')
  for (let i = 0; i < 6; i++) {
    const next = cleaned.replace(INTENT_PREFIX, '')
    if (next === cleaned) break
    cleaned = next
  }
  cleaned = cleaned.split(/[.:;!?\n]/)[0].split(',')[0].trim()
  let words = cleaned.split(' ').slice(0, 6).join(' ')
  for (let i = 0; i < 4; i++) {
    const next = words.replace(TRAILING_STOP, '')
    if (next === words) break
    words = next
  }
  const topic = words || 'a apresentação'
  const namedEntity = namedEntities.find((e) => e.length > 2)
  if (namedEntity && !topic.toLowerCase().includes(namedEntity.toLowerCase())) {
    return namedEntity
  }
  return topic
}

export function extractBriefFacts(brief: string): BriefFacts {
  const text = brief.replace(/\s+/g, ' ').trim()
  const sentences = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)

  const numbers: BriefFacts['numbers'] = []
  const numberRegex = /(R\$\s?[\d.,]+\s?(?:mil|milhões|M|K|bi)?|[\d.,]+\s?(?:%|x|pts|p\.p\.|dias|semanas|meses|horas|mil|milhões)|\b\d{4}\b|\b\d+[\d.,]*\b)/g
  for (const sentence of sentences) {
    for (const match of sentence.matchAll(numberRegex)) {
      const value = match[1].trim()
      if (/^\d{1,2}$/.test(value) && !/%|x|dias|semanas|meses/.test(value)) continue
      const start = Math.max(0, (match.index ?? 0) - 48)
      const context = sentence.slice(start, (match.index ?? 0) + value.length + 48).trim()
      if (numbers.length < 8) numbers.push({ value, context })
    }
  }

  const entityRegex = /\b([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+){0,2}|[A-Z]{2,}[a-zA-Z]*)\b/g
  const entityCount = new Map<string, number>()
  for (const match of text.matchAll(entityRegex)) {
    const entity = match[1].trim()
    if (STOP_ENTITIES.has(entity) || entity.length < 3) continue
    // Ignora palavras capitalizadas só por iniciarem frase ("Entregamos…").
    const index = match.index ?? 0
    if (index === 0) continue
    const before = text.slice(Math.max(0, index - 2), index)
    if (/[.!?;]\s?$/.test(before)) continue
    entityCount.set(entity, (entityCount.get(entity) ?? 0) + 1)
  }
  const entities = [...entityCount.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 6)

  const clientMatch = text.match(/(?:cliente|prospect|para a|para o|da empresa)\s+([A-ZÀ-Ü][\wà-ü]+(?:\s+[A-ZÀ-Ü][\wà-ü]+)?)/)
  const clientGuess = clientMatch?.[1] ?? entities.find((e) => e !== 'SquadHub') ?? null

  return { sentences, numbers, entities, clientGuess, topic: extractTopic(brief, entities) }
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function attachmentLines(attachments: AttachmentForAi[], ids?: string[]): string {
  const relevant = ids ? attachments.filter((a) => ids.includes(a.id)) : attachments
  if (relevant.length === 0) return 'Nenhum anexo disponível.'
  return relevant
    .map((a) => {
      const rules: string[] = [a.role]
      if (a.mustAppearExactly) rules.push('deve aparecer exatamente como enviado — compor como camada, não redesenhar')
      if (a.referenceOnly) rules.push('usar somente como referência visual')
      if (!a.allowCrop) rules.push('não recortar')
      return `- ${a.id} — ${a.name}${a.description ? ` — ${a.description}` : ''} — ${rules.join('; ')}${a.usage ? ` — uso: ${a.usage}` : ''}`
    })
    .join('\n')
}

export function buildSlideProductionPrompt(
  slide: Omit<PlannedSlide, 'productionPrompt' | 'negativePrompt'>,
  config: PlannerConfig,
  style: DesignStyle | null,
  attachments: AttachmentForAi[],
  deckTitle: string,
): string {
  const brand = getBrand(style?.brandId)
  return [
    `Slide ${slide.order} de "${deckTitle}" — layout ${slide.layout}, proporção ${config.aspect}, idioma ${config.language}.`,
    `Título: "${slide.title}"${slide.subtitle ? ` — subtítulo: "${slide.subtitle}"` : ''}.`,
    `Mensagem-chave: ${slide.keyMessage || slide.objective}.`,
    `Conteúdo (preservar textos e números EXATAMENTE como estão, sem inventar dados):`,
    ...slide.content.map((c) => `  • ${c}`),
    slide.evidence.length > 0 ? `Evidências reais a manter visíveis: ${slide.evidence.join('; ')}` : '',
    `Intenção do apresentador: ${slide.speakerIntent}.`,
    `Direção visual: ${slide.visualDirection}.`,
    style
      ? `Estilo "${style.name}": ${style.aiInstructions} Paleta: fundo ${style.palette.background}, texto ${style.palette.text}, destaque ${style.palette.accent}.`
      : 'Estilo sóbrio corporativo de alto contraste.',
    brand
      ? `Marca: ${brand.name}. ${slide.brandInstructions || ''} Reservar área limpa no ${style?.logoRules.placement ?? 'top-left'} para o logo oficial — o logo é aplicado pelo sistema como camada exata; NÃO desenhar nenhum logo.`
      : 'Reservar área limpa no canto superior esquerdo para logo aplicado pelo sistema.',
    `Referências do slide:\n${attachmentLines(attachments, slide.attachmentIds)}`,
    'Hierarquia tipográfica clara (máx. 3 níveis), composição 16:9 completa sem bordas brancas, ortografia impecável em pt-BR.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildMasterPrompt(
  plan: Omit<DeckPlan, 'masterPrompt'>,
  config: PlannerConfig,
  style: DesignStyle | null,
  attachments: AttachmentForAi[],
): string {
  const meta = getMeetingMeta(config.meetingType)
  const brand = getBrand(style?.brandId)
  const objective = config.objective === 'custom' ? config.customObjective : config.objective
  const slides = plan.slides
    .map(
      (s) =>
        `${String(s.order).padStart(2, '0')}. [${s.layout}] "${s.title}" — objetivo: ${s.objective}. Mensagem: ${s.keyMessage}. Conteúdo: ${s.content.join(' | ')}. Visual: ${s.visualDirection}${s.attachmentIds.length ? ` Anexos: ${s.attachmentIds.join(', ')}.` : ''}`,
    )
    .join('\n')

  return [
    `# Apresentação: ${plan.title}`,
    plan.subtitle ? `Subtítulo: ${plan.subtitle}` : '',
    `Contexto: ${plan.executiveSummary}`,
    `Tipo de reunião: ${meta.label}. Público: ${config.audienceScope === 'internal' ? 'interno' : 'externo'} — ${config.audienceSegment} (${segmentEffect(config.audienceScope, config.audienceSegment)}).`,
    `Objetivo: ${objective}. Tom: ${config.tone}. Idioma: ${config.language}. ${plan.slides.length} slides em ${config.aspect}.`,
    `Mensagem central: ${plan.centralMessage}`,
    `Narrativa: ${plan.narrativeLogic}`,
    '',
    '## Identidade visual',
    style
      ? [
          `Estilo "${style.name}" (${style.theme === 'dark' ? 'escuro' : 'claro'}). ${style.aiInstructions}`,
          `Paleta: fundo ${style.palette.background}; superfície ${style.palette.surface}; primária ${style.palette.primary}; destaque ${style.palette.accent}; texto ${style.palette.text}.`,
          `Tipografia: títulos ${style.typography.heading} (peso ${style.typography.headingWeight}${style.typography.uppercaseTitles ? ', caixa alta' : ''}), corpo ${style.typography.body}, números ${style.typography.numbers}. Máximo ${style.typography.maxLevels} níveis tipográficos.`,
          `Composição: ${style.compositionRules}`,
          style.textRules.requiredElements ? `Elementos obrigatórios: ${style.textRules.requiredElements}` : '',
          style.textRules.forbiddenElements ? `Elementos proibidos: ${style.textRules.forbiddenElements}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : 'Estilo sóbrio, corporativo, alto contraste.',
    brand
      ? `Marca: ${brand.name}. Regras: ${brand.usageRules.join('; ')}. Proibições: ${brand.forbiddenUsages.join('; ')}. O logo oficial é aplicado pelo sistema como camada exata (${style?.logoRules.placement}, ${style?.logoRules.widthPct}% da largura, margem de segurança ${style?.logoRules.safeAreaPct}%). NUNCA gerar, redesenhar ou reinterpretar logos.`
      : '',
    '',
    '## Anexos e referências',
    attachmentLines(attachments),
    '',
    '## Sequência de slides',
    slides,
    '',
    '## Regras de produção',
    '- Preservar TODOS os textos e números exatamente como especificados; nunca inventar dados, cases, clientes ou resultados.',
    '- Manter área segura para logos e margens; nenhum texto encostado nas bordas.',
    '- Consistência entre slides: mesma paleta, mesma tipografia, mesmo vocabulário visual.',
    '- Variações devem mudar composição/ênfase, nunca o conteúdo factual.',
    `- Negative prompt: ${style?.textRules.negativePrompt ?? 'texto ilegível, logos redesenhados, dados inventados, watermark'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* Montagem do plano por tipo de reunião                               */
/* ------------------------------------------------------------------ */

interface SectionDraft {
  title: string
  subtitle?: string
  objective: string
  keyMessage: string
  content: string[]
  evidence?: string[]
  speakerIntent: string
  layout: SlideLayout
  visualDirection: string
}

function firstSentenceAbout(facts: BriefFacts, patterns: RegExp, fallback: string): string {
  return facts.sentences.find((s) => patterns.test(s.toLowerCase())) ?? fallback
}

function sentencesAbout(facts: BriefFacts, patterns: RegExp, max: number): string[] {
  return facts.sentences.filter((s) => patterns.test(s.toLowerCase())).slice(0, max)
}

const PENDING = (label: string) => `${label} — [a confirmar com o time]`

/**
 * Rede de segurança quando o esqueleto do tipo de reunião não tem NADA a
 * ver com o assunto do briefing (ex.: briefing de demo de produto num
 * Town-Hall, cujo esqueleto fixo é "resultados, pessoas e prioridades").
 * Gera slides orientados pelo TÓPICO extraído do briefing em vez de
 * forçar um tema interno que o usuário não descreveu.
 */
function topicDrivenMiddleSections(facts: BriefFacts): SectionDraft[] {
  const topic = facts.topic
  const support = facts.sentences.slice(1, 4)
  return [
    {
      title: `O que é ${topic}`,
      objective: 'Apresentar o assunto central da conversa',
      keyMessage: facts.sentences[0] ?? PENDING(`Descrição de ${topic}`),
      content: facts.sentences.slice(0, 2).length > 0 ? facts.sentences.slice(0, 2) : [PENDING(`O que é ${topic}`)],
      speakerIntent: 'Situar a plateia no assunto antes de aprofundar',
      layout: 'textImage',
      visualDirection: `Composição objetiva sobre ${topic}, sem elementos genéricos de abertura corporativa`,
    },
    {
      title: 'Como funciona na prática',
      objective: 'Mostrar o funcionamento ou o fluxo real',
      keyMessage: support[0] ?? PENDING('Fluxo ou funcionamento a demonstrar'),
      content: support.length > 0 ? support : [PENDING('Etapas ou funcionalidades a mostrar na demonstração')],
      speakerIntent: 'Tornar concreto o que antes era só conceito',
      layout: 'process',
      visualDirection: 'Sequência de etapas ou funcionalidades demonstradas',
    },
    {
      title: 'Por que isso importa para o time',
      objective: 'Conectar o assunto ao benefício prático de quem assiste',
      keyMessage: PENDING(`Ganho concreto de ${topic} para o time`),
      content: [PENDING(`Benefício direto de ${topic} para o dia a dia do time`)],
      speakerIntent: 'Responder "o que eu ganho com isso" antes que a plateia pergunte',
      layout: 'bigNumber',
      visualDirection: 'Destaque para o benefício central, sem inventar números',
    },
    {
      title: 'Próximos passos',
      objective: 'Converter atenção em ação concreta',
      keyMessage: PENDING('Próximo passo esperado após a apresentação'),
      content: [PENDING('Como o time pode começar a usar/adotar isso')],
      speakerIntent: 'Fechar com direção clara em vez de deixar em aberto',
      layout: 'cta',
      visualDirection: 'Chamada única e direta',
    },
  ]
}

/**
 * Distribui as sentenças AINDA NÃO USADAS do briefing pelas seções cujo
 * padrão não casou — o conteúdo real do usuário sempre vence o placeholder.
 * (Correção do plano genérico: a heurística agora prioriza o briefing.)
 */
function fillSectionsFromBrief(sections: SectionDraft[], facts: BriefFacts): SectionDraft[] {
  const used = new Set<string>()
  for (const section of sections) {
    for (const item of section.content) {
      if (!item.includes('[a confirmar')) used.add(item)
    }
  }
  const unused = facts.sentences.filter((s) => !used.has(s))
  let cursor = 0
  return sections.map((section) => {
    const hasReal = section.content.some((c) => !c.includes('[a confirmar'))
    if (hasReal || cursor >= unused.length) return section
    const take = unused.slice(cursor, cursor + Math.min(3, section.content.length || 3))
    cursor += take.length
    if (take.length === 0) return section
    return {
      ...section,
      content: take,
      keyMessage: take[0],
    }
  })
}

function checkpointSections(facts: BriefFacts, client: string): SectionDraft[] {
  const deliveries = sentencesAbout(facts, /entreg|conclu|implanta|lança|finaliza|desenvolv/, 4)
  const blockers = sentencesAbout(facts, /bloque|risco|problema|atras|depend|impedi/, 4)
  const next = sentencesAbout(facts, /próxim|proxim|seguir|planejad|semana|sprint/, 4)
  const decisions = sentencesAbout(facts, /decis|aprova|defini|escolh|valida/, 3)
  return [
    {
      title: `Checkpoint ${client}`,
      subtitle: 'Balanço do período e próximos passos',
      objective: 'Abrir a conversa e situar o período coberto',
      keyMessage: 'Prestação de contas objetiva: o que avançou, o que trava e o que precisamos decidir.',
      content: [firstSentenceAbout(facts, /projeto|período|periodo|contexto/, PENDING('Período coberto pelo checkpoint'))],
      speakerIntent: 'Estabelecer o tom de transparência e organização',
      layout: 'cover',
      visualDirection: 'Capa sóbria com título dominante e identificação do cliente e do período',
    },
    {
      title: 'O que foi entregue no período',
      objective: 'Demonstrar evolução concreta',
      keyMessage: deliveries[0] ?? 'As entregas do período sustentam o cronograma acordado.',
      content: deliveries.length > 0 ? deliveries : [PENDING('Liste as entregas reais do período')],
      speakerIntent: 'Gerar confiança mostrando trabalho concluído',
      layout: 'process',
      visualDirection: 'Entregas em sequência com marcadores de conclusão',
    },
    {
      title: 'Indicadores do período',
      objective: 'Revisar os números que importam',
      keyMessage: facts.numbers[0]
        ? `O destaque do período: ${facts.numbers[0].context}`
        : 'Indicadores acompanhados em conjunto com o cliente.',
      content:
        facts.numbers.length > 0
          ? facts.numbers.slice(0, 3).map((n) => n.context)
          : [PENDING('Traga aqui os indicadores reais do período')],
      evidence: facts.numbers.slice(0, 3).map((n) => n.value),
      speakerIntent: 'Ancorar a conversa em dados reais do projeto',
      layout: facts.numbers.length > 0 ? 'bigNumber' : 'textImage',
      visualDirection: 'Número principal em superdestaque com contexto curto ao lado',
    },
    {
      title: 'Riscos e bloqueios',
      objective: 'Dar visibilidade ao que ameaça o plano',
      keyMessage: blockers[0] ?? 'Nenhum bloqueio crítico reportado — atenção preventiva aos riscos mapeados.',
      content: blockers.length > 0 ? blockers : [PENDING('Riscos e bloqueios do período')],
      speakerIntent: 'Tratar problemas com transparência antes que escalem',
      layout: 'comparison',
      visualDirection: 'Dois painéis: o que está sob controle vs. o que precisa de atenção',
    },
    {
      title: 'Decisões que precisamos de vocês',
      objective: 'Solicitar decisões objetivas',
      keyMessage: decisions[0] ?? 'Decisões pontuais destravam o próximo ciclo.',
      content: decisions.length > 0 ? decisions : [PENDING('Decisões necessárias do cliente')],
      speakerIntent: 'Converter a reunião em decisões registradas',
      layout: 'conclusion',
      visualDirection: 'Cartões numerados, um por decisão, com espaço para responsável',
    },
    {
      title: 'Próximos passos',
      objective: 'Alinhar o próximo ciclo',
      keyMessage: next[0] ?? 'Próximo ciclo com responsáveis e datas definidos.',
      content: next.length > 0 ? next : [PENDING('Próximos passos com datas')],
      speakerIntent: 'Fechar com plano claro e datas',
      layout: 'timeline',
      visualDirection: 'Linha do tempo curta com os marcos do próximo período',
    },
  ]
}

function kickoffSections(facts: BriefFacts, client: string): SectionDraft[] {
  const problem = sentencesAbout(facts, /problema|desafio|dor|dificul|precisa/, 3)
  const scope = sentencesAbout(facts, /escopo|entreg|contrat|inclui|fase/, 4)
  const people = sentencesAbout(facts, /time|equipe|respons|papel|envolvid/, 4)
  const schedule = sentencesAbout(facts, /cronograma|prazo|semana|mês|mes|data|marco/, 4)
  return [
    {
      title: `Kickoff ${client}`,
      subtitle: 'Como vamos trabalhar juntos',
      objective: 'Abrir o projeto com energia e clareza',
      keyMessage: 'Todos saem desta reunião sabendo o que será feito, por quem e quando.',
      content: [firstSentenceAbout(facts, /projeto|objetivo|contexto/, PENDING('Contexto do projeto'))],
      speakerIntent: 'Criar alinhamento e entusiasmo desde o primeiro minuto',
      layout: 'cover',
      visualDirection: 'Capa de abertura com nome do projeto e do cliente em destaque',
    },
    {
      title: 'O problema que vamos resolver',
      objective: 'Alinhar o entendimento do desafio',
      keyMessage: problem[0] ?? 'Entendimento comum do problema é a base do projeto.',
      content: problem.length > 0 ? problem : [PENDING('Problema e contexto do cliente')],
      speakerIntent: 'Mostrar que entendemos profundamente o contexto',
      layout: 'textImage',
      visualDirection: 'Texto dominante com ilustração abstrata do desafio',
    },
    {
      title: 'Escopo e entregáveis',
      objective: 'Confirmar o que está (e não está) contratado',
      keyMessage: scope[0] ?? 'Escopo claro evita surpresas.',
      content: scope.length > 0 ? scope : [PENDING('Escopo contratado e entregáveis')],
      speakerIntent: 'Eliminar ambiguidades de escopo logo no início',
      layout: 'process',
      visualDirection: 'Blocos de entregáveis em sequência lógica',
    },
    {
      title: 'Papéis e responsabilidades',
      objective: 'Definir quem faz o quê',
      keyMessage: people[0] ?? 'Cada frente tem um responsável nomeado.',
      content: people.length > 0 ? people : [PENDING('Pessoas envolvidas e responsabilidades')],
      speakerIntent: 'Garantir accountability dos dois lados',
      layout: 'comparison',
      visualDirection: 'Dois painéis: time SquadHub e time do cliente',
    },
    {
      title: 'Cronograma e marcos',
      objective: 'Confirmar datas e expectativas',
      keyMessage: schedule[0] ?? 'Marcos de entrega dão previsibilidade ao projeto.',
      content: schedule.length > 0 ? schedule : [PENDING('Cronograma com marcos')],
      speakerIntent: 'Dar previsibilidade e combinar cadência',
      layout: 'timeline',
      visualDirection: 'Linha do tempo com fases e marcos principais',
    },
    {
      title: 'Governança e próximos passos',
      objective: 'Explicar rituais, canais e o que acontece agora',
      keyMessage: 'Cadência de comunicação definida e primeiro passo agendado.',
      content: [
        firstSentenceAbout(facts, /governan|ritual|reuni|canal|ferrament/, PENDING('Rituais e canais de comunicação')),
        firstSentenceAbout(facts, /próxim|proxim|começa|inicia/, PENDING('Primeiro passo após o kickoff')),
      ],
      speakerIntent: 'Fechar com todos sabendo o que acontece em seguida',
      layout: 'cta',
      visualDirection: 'Fechamento com chamada clara para o primeiro marco',
    },
  ]
}

function townhallSections(facts: BriefFacts): SectionDraft[] {
  const topic = facts.topic
  const results = sentencesAbout(facts, /resultado|receita|cresc|meta|número|numero/, 4)
  const peopleNews = sentencesAbout(facts, /integrante|contrata|bem-vind|pessoa|time/, 3)
  const culture = sentencesAbout(facts, /cultura|valor|aprendiz|comportamento/, 3)
  const priorities = sentencesAbout(facts, /prioridade|foco|próxim|proxim|ciclo|trimestre/, 4)
  return [
    {
      // Título e conteúdo vêm do briefing — o tipo de reunião define o
      // FORMATO da capa, nunca substitui o assunto real do usuário.
      title: `Town-Hall — ${topic.charAt(0).toUpperCase()}${topic.slice(1)}`,
      subtitle: firstSentenceAbout(facts, /./, ''),
      objective: 'Abrir a reunião geral com o time inteiro',
      keyMessage: firstSentenceAbout(facts, /./, 'Um time informado toma decisões melhores.'),
      content: [firstSentenceAbout(facts, /./, 'Encontro geral do time')],
      speakerIntent: 'Criar senso de comunidade e transparência',
      layout: 'cover',
      visualDirection: 'Capa institucional forte com a marca SquadHub',
    },
    {
      title: 'Resultados do período',
      objective: 'Apresentar os números do ciclo',
      keyMessage: results[0] ?? 'Os resultados do ciclo mostram a direção certa.',
      content: results.length > 0 ? results : [PENDING('Resultados reais do período')],
      evidence: facts.numbers.slice(0, 3).map((n) => n.value),
      speakerIntent: 'Celebrar conquistas com dados reais',
      layout: facts.numbers.length > 0 ? 'bigNumber' : 'textImage',
      visualDirection: 'Número-destaque do ciclo com leitura rápida',
    },
    {
      title: 'Pessoas e conquistas',
      objective: 'Reconhecer quem fez acontecer',
      keyMessage: peopleNews[0] ?? 'Reconhecimento público fortalece a cultura.',
      content: peopleNews.length > 0 ? peopleNews : [PENDING('Novos integrantes e reconhecimentos')],
      speakerIntent: 'Valorizar pessoas na frente do time inteiro',
      layout: 'textImage',
      visualDirection: 'Espaço para foto/recorte de pessoas com destaque humano',
    },
    {
      title: 'Cultura e aprendizados',
      objective: 'Reforçar comportamentos que queremos ver',
      keyMessage: culture[0] ?? 'Cultura se constrói em público, exemplo a exemplo.',
      content: culture.length > 0 ? culture : [PENDING('Aprendizados e reforços de cultura')],
      speakerIntent: 'Conectar o dia a dia aos valores da empresa',
      layout: 'conclusion',
      visualDirection: 'Cartões com os pontos de cultura em destaque',
    },
    {
      title: 'Prioridades do próximo ciclo',
      objective: 'Alinhar onde o time deve focar',
      keyMessage: priorities[0] ?? 'Poucas prioridades, muito foco.',
      content: priorities.length > 0 ? priorities : [PENDING('Prioridades do próximo período')],
      speakerIntent: 'Sair da reunião com foco compartilhado',
      layout: 'timeline',
      visualDirection: 'Sequência das prioridades no tempo',
    },
    {
      title: 'Seguimos juntos',
      objective: 'Encerrar com energia',
      keyMessage: 'O próximo ciclo começa agora, com todos na mesma página.',
      content: ['Espaço para perguntas e conversas abertas'],
      speakerIntent: 'Fechar em tom positivo e abrir para perguntas',
      layout: 'cta',
      visualDirection: 'Encerramento com a marca e chamada para o Q&A',
    },
  ]
}

function proposalSections(facts: BriefFacts, client: string): SectionDraft[] {
  const problem = sentencesAbout(facts, /problema|desafio|dor|custo|perde|dificul/, 3)
  const solution = sentencesAbout(facts, /solução|solucao|propo|automat|implanta|plataforma|sistema/, 4)
  const scope = sentencesAbout(facts, /escopo|entreg|fase|inclui/, 4)
  const price = facts.numbers.find((n) => /r\$|investimento|preço|preco|valor|mensal/.test(n.context.toLowerCase()))
  const proof = sentencesAbout(facts, /case|resultado|referên|referen|prova|piloto/, 3)
  return [
    {
      title: `Proposta para ${client}`,
      subtitle: facts.topic.charAt(0).toUpperCase() + facts.topic.slice(1),
      objective: 'Abrir com posicionamento claro de valor',
      keyMessage: 'Uma proposta direta para um problema que custa caro esperar.',
      content: [firstSentenceAbout(facts, /prospect|cliente|empresa|contexto/, PENDING('Contexto do prospect'))],
      speakerIntent: 'Capturar atenção e estabelecer credibilidade',
      layout: 'cover',
      visualDirection: 'Capa comercial premium com nome do prospect',
    },
    {
      title: 'O cenário de hoje',
      objective: 'Tornar o problema tangível',
      keyMessage: problem[0] ?? 'O custo do cenário atual cresce a cada ciclo.',
      content: problem.length > 0 ? problem : [PENDING('Problema e cenário atual do prospect')],
      speakerIntent: 'Fazer o prospect se reconhecer no problema',
      layout: 'textImage',
      visualDirection: 'Leitura rápida do problema com apoio visual de tendência',
    },
    {
      title: 'A solução proposta',
      objective: 'Apresentar como resolvemos',
      keyMessage: solution[0] ?? 'Uma solução desenhada para o contexto específico do cliente.',
      content: solution.length > 0 ? solution : [PENDING('Descrição da solução proposta')],
      speakerIntent: 'Mostrar caminho concreto, não promessa genérica',
      layout: 'process',
      visualDirection: 'Fluxo da solução em etapas claras',
    },
    {
      title: 'Antes e depois',
      objective: 'Contrastar cenário atual e futuro',
      keyMessage: 'A diferença entre operar no modelo atual e no modelo proposto.',
      content: [
        ...(problem.slice(0, 2).length > 0 ? problem.slice(0, 2) : [PENDING('Situação atual')]),
        ...(solution.slice(0, 2).length > 0 ? solution.slice(0, 2) : [PENDING('Situação com a proposta')]),
      ],
      speakerIntent: 'Visualizar o ganho de forma imediata',
      layout: 'comparison',
      visualDirection: 'Dois painéis com o painel da proposta em destaque',
    },
    {
      title: 'Escopo e investimento',
      objective: 'Justificar o investimento',
      keyMessage: price ? `Investimento: ${price.context}` : 'Investimento proporcional ao valor gerado.',
      content: [
        ...(scope.length > 0 ? scope.slice(0, 2) : [PENDING('Escopo e entregas contratadas')]),
        price ? price.context : PENDING('Condições comerciais e preço'),
      ],
      evidence: price ? [price.value] : [],
      speakerIntent: 'Tratar preço com transparência e contexto de valor',
      layout: price ? 'bigNumber' : 'textImage',
      visualDirection: 'Investimento em destaque com escopo resumido ao lado',
    },
    {
      title: 'Por que a SquadHub',
      objective: 'Apresentar prova de valor',
      keyMessage: proof[0] ?? 'Referências e método próprio sustentam a proposta.',
      content: proof.length > 0 ? proof : [PENDING('Prova de valor: cases e referências reais')],
      speakerIntent: 'Reduzir o risco percebido da decisão',
      layout: 'conclusion',
      visualDirection: 'Cartões com provas de valor reais (nunca inventadas)',
    },
    {
      title: 'Próximo passo',
      objective: 'Converter em avanço concreto',
      keyMessage: firstSentenceAbout(facts, /próxim|proxim|fechamento|assinar|piloto/, 'Definir o próximo passo nesta conversa.'),
      content: [firstSentenceAbout(facts, /próxim|proxim|fechamento|assinar|piloto/, PENDING('Próximo passo esperado'))],
      speakerIntent: 'Sair da reunião com compromisso agendado',
      layout: 'cta',
      visualDirection: 'Chamada única centralizada com botão de ação',
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Plano completo                                                      */
/* ------------------------------------------------------------------ */

function buildInsights(
  facts: BriefFacts,
  config: PlannerConfig,
  sections: SectionDraft[],
  attachments: AttachmentForAi[],
): DeckInsights {
  const meta = getMeetingMeta(config.meetingType)
  const objective = config.objective === 'custom' ? config.customObjective : config.objective
  const pending = sections.flatMap((s) => s.content).filter((c) => c.includes('[a confirmar'))
  const assumptions: string[] = []
  if (!facts.clientGuess) assumptions.push('Nenhum cliente identificado no briefing — tratado como apresentação institucional.')
  if (facts.numbers.length === 0) assumptions.push('Nenhum número foi informado; os slides de indicadores ficaram com espaços marcados, sem dados inventados.')
  if (attachments.length === 0) assumptions.push('Sem anexos: as direções visuais usam apenas o estilo selecionado.')

  // Evita repetir a primeira frase quando ela já é o próprio tópico.
  const firstSentence = facts.sentences[0] ?? ''
  const topicOverlaps = firstSentence.toLowerCase().startsWith(facts.topic.toLowerCase().slice(0, 24))
  return {
    understanding: `[Modo simulação — heurística local, sem IA. Ative a IA real para interpretação completa do briefing.] Briefing para um ${meta.label.toLowerCase()} ${facts.clientGuess ? `envolvendo ${facts.clientGuess}` : 'sem cliente nomeado'}, com foco em ${facts.topic}.${topicOverlaps ? '' : ` ${firstSentence}`}`,
    statedFacts: facts.sentences.slice(0, 4),
    audienceInterpretation: `${config.audienceSegment}: ${segmentEffect(config.audienceScope, config.audienceSegment)}`,
    intent: config.objective === 'custom' ? config.customObjective : config.objective,
    centralMessage: sections[0]?.keyMessage ?? objective,
    keyInsights: [
      ...facts.numbers.slice(0, 2).map((n) => `Dado real do briefing: ${n.context}`),
      ...facts.entities.slice(0, 2).map((e) => `Ator relevante citado: ${e}`),
      `A audiência (${config.audienceSegment}) pede: ${segmentEffect(config.audienceScope, config.audienceSegment)}`,
    ].slice(0, 5),
    decisionsToProvoke: sections
      .filter((s) => /decis|aprova|próxim|proxim|passo/i.test(s.objective))
      .map((s) => s.objective)
      .slice(0, 3),
    inferred: [
      `Tipo de reunião: ${meta.label} (selecionado/deduzido do briefing)`,
      facts.clientGuess ? `Cliente/prospect: ${facts.clientGuess}` : 'Apresentação sem cliente específico',
      `Tom ${config.tone.toLowerCase()} adequado ao público ${config.audienceSegment}`,
    ],
    assumptions,
    missingInformation: pending.slice(0, 6),
    communicationRisks: [
      facts.numbers.length === 0
        ? 'Sem dados concretos, a apresentação pode soar genérica — preencha os indicadores reais.'
        : 'Confirme a fonte dos números antes de apresentar.',
      config.audienceSegment === 'Liderança Executiva'
        ? 'Executivos abandonam slides densos: mantenha uma mensagem por slide.'
        : 'Evite repetir a mesma mensagem em slides diferentes.',
    ],
    narrativeSuggestion: `Estrutura ${meta.label}: contexto → evidências → ${config.meetingType === 'proposal' ? 'proposta e investimento' : 'decisões'} → próximos passos, fechando no objetivo "${objective}".`,
  }
}

/** Monta um DeckPlan completo, específico do tipo de reunião. */
export function buildMockPlan(req: PlanDeckRequest): DeckPlan {
  const facts = extractBriefFacts(req.brief)
  const config = req.config
  const meta = getMeetingMeta(config.meetingType)
  const client = facts.clientGuess ?? 'SquadHub'

  // Briefing crítico demais? Até 3 perguntas objetivas antes do plano.
  if (req.brief.trim().length < 40 || facts.sentences.length === 0) {
    return {
      title: `${meta.label} — briefing incompleto`,
      subtitle: '',
      meetingType: config.meetingType,
      audienceScope: config.audienceScope,
      audienceSegment: config.audienceSegment,
      objective: config.objective === 'custom' ? config.customObjective : config.objective,
      executiveSummary: 'O briefing enviado ainda não traz informação suficiente para um plano de qualidade.',
      centralMessage: '',
      narrativeLogic: '',
      insights: {
        understanding: 'O texto recebido é muito curto para extrair contexto, fatos e objetivos com segurança.',
        centralMessage: '',
        keyInsights: [],
        decisionsToProvoke: [],
        inferred: [],
        assumptions: [],
        missingInformation: meta.promptHints,
        communicationRisks: ['Planejar sem contexto real geraria slides genéricos.'],
        narrativeSuggestion: '',
      },
      recommendedSlideCount: 0,
      attachmentsUsed: [],
      slides: [],
      masterPrompt: '',
      clarifyingQuestions: [
        `Qual é o contexto e o ${config.meetingType === 'proposal' ? 'prospect' : 'cliente/time'} desta apresentação?`,
        `Quais fatos, entregas ou números reais precisam aparecer?`,
        `O que precisa acontecer ao final da reunião para ela ser um sucesso?`,
      ],
    }
  }

  const sectionBuilders: Record<string, SectionDraft[]> = {
    checkpoint: checkpointSections(facts, client),
    kickoff: kickoffSections(facts, client),
    townhall: townhallSections(facts),
    proposal: proposalSections(facts, client),
  }
  // O briefing é a fonte principal: sentenças não usadas preenchem as
  // seções antes de qualquer placeholder genérico.
  let sections = fillSectionsFromBrief(sectionBuilders[config.meetingType], facts)

  // Rede de segurança: se o esqueleto do tipo de reunião ficou quase todo
  // com placeholder (o assunto do briefing não bate com o tema fixo do
  // tipo escolhido — ex.: demo de produto dentro de um Town-Hall), troca
  // o MEIO do plano por slides guiados pelo tópico real. Capa e
  // fechamento (primeiro/último) já carregam o briefing e são mantidos.
  const middleSections = sections.slice(1, -1)
  const genericMiddle = middleSections.filter((s) => s.content.every((c) => c.includes('[a confirmar'))).length
  if (middleSections.length > 0 && genericMiddle >= Math.ceil(middleSections.length / 2)) {
    const fallback = topicDrivenMiddleSections(facts).slice(0, Math.max(middleSections.length, 1))
    sections = [sections[0], ...fallback, sections[sections.length - 1]]
  }

  // Ajusta à quantidade pedida sem perder capa e fechamento.
  const target = Math.min(Math.max(config.slideCount, 3), 16)
  if (sections.length > target) {
    const middle = sections.slice(1, -1).slice(0, target - 2)
    sections = [sections[0], ...middle, sections[sections.length - 1]]
  }

  // Vincula anexos aos slides por papel.
  const imageAtts = req.attachments.filter((a) => a.imageDataUrl)
  const attachmentsUsed: DeckPlan['attachmentsUsed'] = []

  const title = sections[0].title
  const objective = config.objective === 'custom' ? config.customObjective : config.objective

  const slides: PlannedSlide[] = sections.map((section, index) => {
    const linked: string[] = []
    for (const att of imageAtts) {
      const roleTargets: Record<string, RegExp> = {
        chart: /indicador|resultado|investimento|número/i,
        screenshot: /solução|solucao|entreg|escopo/i,
        photo: /pessoa|conquista|time|capa/i,
        person: /pessoa|time|integrante/i,
        product: /solução|solucao|proposta/i,
        software: /solução|solucao|entreg/i,
        'required-content': /./,
        'visual-reference': /capa/i,
      }
      const pattern = roleTargets[att.role]
      if (pattern && pattern.test(section.title + section.objective) && linked.length < 2) {
        linked.push(att.id)
        if (!attachmentsUsed.some((u) => u.attachmentId === att.id)) {
          attachmentsUsed.push({
            attachmentId: att.id,
            usage: `Vinculado ao slide ${index + 1} (${section.title}) pelo papel "${att.role}".`,
          })
        }
      }
    }

    const draft: Omit<PlannedSlide, 'productionPrompt' | 'negativePrompt'> = {
      id: uid('ps'),
      order: index + 1,
      title: section.title,
      subtitle: section.subtitle ?? '',
      objective: section.objective,
      keyMessage: section.keyMessage,
      content: section.content,
      evidence: section.evidence ?? [],
      speakerIntent: section.speakerIntent,
      layout: section.layout,
      visualDirection: section.visualDirection,
      brandInstructions: req.style?.textRules.logoRules ?? '',
      attachmentIds: linked,
    }
    return {
      ...draft,
      productionPrompt: buildSlideProductionPrompt(draft, config, req.style, req.attachments, title),
      negativePrompt: req.style?.textRules.negativePrompt ?? 'texto ilegível, dados inventados, logos redesenhados',
    }
  })

  // Anexos não usados são declarados — nunca ignorados em silêncio.
  for (const att of req.attachments) {
    if (!attachmentsUsed.some((u) => u.attachmentId === att.id)) {
      attachmentsUsed.push({
        attachmentId: att.id,
        usage:
          att.role === 'do-not-use'
            ? 'Marcado para não ser usado diretamente.'
            : 'Considerado no planejamento como referência geral; não vinculado a um slide específico.',
      })
    }
  }

  const insights = buildInsights(facts, config, sections, req.attachments)
  const base: Omit<DeckPlan, 'masterPrompt'> = {
    title,
    subtitle: sections[0].subtitle ?? '',
    meetingType: config.meetingType,
    audienceScope: config.audienceScope,
    audienceSegment: config.audienceSegment,
    objective,
    executiveSummary: insights.understanding,
    centralMessage: insights.centralMessage,
    narrativeLogic: insights.narrativeSuggestion,
    insights,
    recommendedSlideCount: slides.length,
    attachmentsUsed,
    slides,
  }
  return { ...base, masterPrompt: buildMasterPrompt(base, config, req.style, req.attachments) }
}

/** Replaneja um único slide sem tocar nos demais. */
export function replanSingleSlide(
  plan: DeckPlan,
  slideId: string,
  config: PlannerConfig,
  style: DesignStyle | null,
  attachments: AttachmentForAi[],
  instructions?: string,
): PlannedSlide {
  const current = plan.slides.find((s) => s.id === slideId)
  if (!current) throw new Error('Slide não encontrado no plano.')
  const refreshed: Omit<PlannedSlide, 'productionPrompt' | 'negativePrompt'> = {
    ...current,
    keyMessage: instructions
      ? `${current.keyMessage}`
      : current.keyMessage,
    visualDirection: instructions
      ? `${current.visualDirection}. Ajuste solicitado: ${instructions}`
      : current.visualDirection,
  }
  return {
    ...refreshed,
    productionPrompt: buildSlideProductionPrompt(refreshed, config, style, attachments, plan.title),
    negativePrompt: current.negativePrompt,
    editedManually: false,
  }
}
