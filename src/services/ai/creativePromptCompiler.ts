import type {
  AttachmentForAi,
  DesignStyle,
  PlannedSlide,
  PlannerConfig,
  ReferenceInfluence,
  SlideTemplate,
  TextOverlayElement,
  TextOverlaySpec,
} from '../../types'

/**
 * Compilador de prompts visuais do modo Criativo por IA.
 *
 * Templates NUNCA são enviados como slots a preencher: cada referência é
 * traduzida para uma descrição de LINGUAGEM VISUAL (composição, ritmo,
 * densidade, formas) e a IA cria uma composição nova. Os textos exatos e
 * o logo continuam sendo camadas determinísticas da aplicação, com o
 * layout dos textos decidido por arquétipo (nunca o slot do template).
 *
 * Tudo aqui é determinístico e local — zero chamadas de modelo, zero
 * latência adicionada à preparação dos prompts.
 */

/* ------------------------------------------------------------------ */
/* Arquétipos de composição                                            */
/* ------------------------------------------------------------------ */

export interface CompositionArchetype {
  id: string
  composition: string
  variation: string
}

const ARCHETYPES: Record<string, CompositionArchetype> = {
  'immersive-cover': {
    id: 'immersive-cover',
    composition:
      'Abertura imersiva: um único ponto focal luminoso dominando o quadro, título em grande escala com muito respiro, profundidade em camadas (fundo → brilho → elemento principal). Nada de grades de itens.',
    variation: 'hero',
  },
  hero: {
    id: 'hero',
    composition:
      'Composição hero assimétrica: elemento visual dominante deslocado do centro (~60/40), área limpa generosa para o título, diagonal sutil guiando o olhar.',
    variation: 'immersive-cover',
  },
  cycle: {
    id: 'cycle',
    composition:
      'Ciclo contínuo: anel/circuito luminoso com segmentos claramente distintos e sentido de rotação perceptível, conexão de retorno destacada, centro respirando (vazio ou com marca discreta).',
    variation: 'radial',
  },
  radial: {
    id: 'radial',
    composition:
      'Composição radial: núcleo central forte com elementos orbitando em pesos diferentes — não equidistantes, com hierarquia clara entre eles.',
    variation: 'cycle',
  },
  journey: {
    id: 'journey',
    composition:
      'Jornada diagonal: percurso do canto inferior esquerdo (estado inicial, mais denso/caótico) ao superior direito (estado final, mais limpo/luminoso), com marcos conectados por um traço de energia.',
    variation: 'timeline',
  },
  timeline: {
    id: 'timeline',
    composition:
      'Linha do tempo com ritmo irregular: marcos de tamanhos diferentes conforme a importância, não um trilho uniforme de círculos idênticos.',
    variation: 'journey',
  },
  'split-story': {
    id: 'split-story',
    composition:
      'História dividida: duas metades em tensão visual (antes/depois, problema/solução) com tratamento de luz oposto e um elemento atravessando a divisa para conectar as partes.',
    variation: 'before-after',
  },
  'before-after': {
    id: 'before-after',
    composition:
      'Transformação: o mesmo motivo visual aparece duas vezes — degradado/instável de um lado, resolvido/estável do outro — com seta ou fluxo de energia entre eles.',
    variation: 'split-story',
  },
  'modular-cards': {
    id: 'modular-cards',
    composition:
      'Blocos modulares com pesos DIFERENTES: um bloco âncora maior e blocos satélites menores, alinhados a um grid invisível mas sem simetria mecânica. Cantos e superfícies na linguagem do estilo (vidro/transparência quando o estilo pedir).',
    variation: 'editorial',
  },
  editorial: {
    id: 'editorial',
    composition:
      'Página editorial: coluna tipográfica forte de um lado, campo visual do outro, alinhamentos precisos, generosa área de respiro, um único elemento gráfico de destaque.',
    variation: 'modular-cards',
  },
  'visual-metaphor': {
    id: 'visual-metaphor',
    composition:
      'Metáfora visual dominante: uma única imagem-conceito ocupa o palco (sistema, circuito, organismo, constelação) e o texto reage a ela — sem grade de tópicos.',
    variation: 'editorial',
  },
  'data-focus': {
    id: 'data-focus',
    composition:
      'Dado em destaque: o número/indicador é o herói em escala tipográfica máxima, contexto ao redor em hierarquia mínima, um elemento gráfico reforçando a direção do dado.',
    variation: 'editorial',
  },
  comparison: {
    id: 'comparison',
    composition:
      'Contraste estruturado: dois campos com identidades visuais distintas (cor, densidade, luz) e um eixo central que força a leitura comparativa.',
    variation: 'split-story',
  },
  conclusion: {
    id: 'conclusion',
    composition:
      'Fechamento: os motivos visuais do deck convergem para um ponto de chegada estável; menos elementos, mais peso, sensação de conclusão.',
    variation: 'call-to-action',
  },
  'call-to-action': {
    id: 'call-to-action',
    composition:
      'Chamada para ação: a pergunta/convite é o centro luminoso do slide; elementos de apoio orbitam discretamente; um vetor visual aponta para o próximo passo.',
    variation: 'conclusion',
  },
}

const LAYOUT_TO_ARCHETYPE: Record<string, string> = {
  cover: 'immersive-cover',
  textImage: 'editorial',
  bigNumber: 'data-focus',
  comparison: 'comparison',
  process: 'cycle',
  timeline: 'journey',
  conclusion: 'conclusion',
  cta: 'call-to-action',
}

/** Palavras da direção visual que sugerem arquétipos específicos. */
const DIRECTION_HINTS: [RegExp, string][] = [
  [/ciclo|circular|anel|loop|retorno/i, 'cycle'],
  [/jornada|percurso|evolu|transform/i, 'journey'],
  [/metáfora|sistema|circuito|constela|organismo/i, 'visual-metaphor'],
  [/antes.*depois|caos.*ordem|problema.*solu/i, 'before-after'],
  [/coluna|editorial|tipográf/i, 'editorial'],
  [/cards?|blocos|modular/i, 'modular-cards'],
  [/radial|orbita|núcleo/i, 'radial'],
]

/**
 * Escolha determinística do arquétipo: layout define a família; a
 * direção visual só refina os slides de MIOLO (capa e fechamento nunca
 * perdem sua identidade por uma palavra como "ciclo" no texto).
 * Anti-repetição garantida — slides consecutivos nunca usam o mesmo.
 */
export function pickArchetype(plan: PlannedSlide, previousArchetype: string | null): CompositionArchetype {
  let id = LAYOUT_TO_ARCHETYPE[plan.layout] ?? 'editorial'
  const rolePinned = plan.layout === 'cover' || plan.layout === 'cta' || plan.layout === 'conclusion'
  if (!rolePinned) {
    const directionText = `${plan.visualDirection} ${plan.keyMessage}`
    for (const [pattern, hinted] of DIRECTION_HINTS) {
      if (pattern.test(directionText)) {
        id = hinted
        break
      }
    }
  }
  if (id === previousArchetype) id = ARCHETYPES[id]?.variation ?? 'editorial'
  return ARCHETYPES[id] ?? ARCHETYPES.editorial
}

/* ------------------------------------------------------------------ */
/* Perfis visuais de referência                                        */
/* ------------------------------------------------------------------ */

export interface VisualReferenceProfile {
  id: string
  name: string
  visualSummary: string
  compositionDNA: string
  forbiddenPatterns: string
}

const profileCache = new Map<string, VisualReferenceProfile>()

/**
 * Traduz um template em LINGUAGEM VISUAL — nunca em slots. Usa a
 * "Referência para a IA" editada quando existe; caso contrário deriva
 * deterministicamente das camadas. Cacheado por id+updatedAt (nada de
 * reanalisar a biblioteca a cada geração).
 */
export function describeReference(template: SlideTemplate): VisualReferenceProfile {
  const cacheKey = `${template.id}:${template.updatedAt}`
  const cached = profileCache.get(cacheKey)
  if (cached) return cached

  const layers = template.layers.filter((l) => l.visible)
  const counts = {
    cards: layers.filter((l) => l.type === 'shape' && (l.shape?.radius ?? 0) > 0).length,
    texts: layers.filter((l) => l.type === 'text-placeholder').length,
    images: layers.filter((l) => l.type === 'image-placeholder' || l.type === 'ai-region').length,
    lines: layers.filter((l) => l.type === 'line' || l.type === 'arrow').length,
    icons: layers.filter((l) => l.type === 'icon-placeholder').length,
  }
  const density = layers.length > 14 ? 'alta' : layers.length > 8 ? 'média' : 'baixa'
  const custom = template.aiReference

  const auto = [
    `Composição de referência "${template.name}" (${template.kind}): densidade ${density}`,
    counts.cards > 0 ? `${counts.cards} bloco(s) modulares de peso semelhante` : 'sem blocos modulares',
    counts.images > 0 ? 'campo visual dedicado a imagem/arte' : 'composição puramente tipográfica e geométrica',
    counts.lines > 0 ? 'conectores/fluxo entre elementos' : '',
    counts.icons > 0 ? 'ícones de apoio discretos' : '',
  ]
    .filter(Boolean)
    .join('; ')

  const profile: VisualReferenceProfile = {
    id: template.id,
    name: template.name,
    visualSummary: custom?.description?.trim() || auto,
    compositionDNA:
      custom?.principles?.trim() ||
      `Hierarquia com título dominante, margens amplas, espaçamento consistente e ${
        counts.cards > 1 ? 'modularidade entre blocos equivalentes' : 'um único foco visual por vez'
      }.`,
    forbiddenPatterns:
      custom?.avoid?.trim() ||
      'Não copiar coordenadas nem dimensões literalmente; não reproduzir a mesma quantidade de blocos por obrigação; não deixar áreas vazias sem função.',
  }
  profileCache.set(cacheKey, profile)
  return profile
}

/** Seleciona no máximo 3 referências compatíveis com o slide (determinístico). */
export function selectReferences(
  templates: SlideTemplate[],
  styleId: string | null,
  plan: PlannedSlide,
): VisualReferenceProfile[] {
  const pool = templates.filter((t) => t.styleId === styleId)
  const candidates = pool.length > 0 ? pool : templates
  const wantedKinds: Record<string, string[]> = {
    cover: ['cover'],
    textImage: ['textImage', 'cards', 'pillars'],
    bigNumber: ['bigNumber'],
    comparison: ['comparison'],
    process: ['process', 'timeline'],
    timeline: ['timeline', 'process'],
    conclusion: ['conclusion', 'impact'],
    cta: ['cta', 'next', 'impact', 'conclusion'],
  }
  const wanted = wantedKinds[plan.layout] ?? [plan.layout]
  const score = (t: SlideTemplate) => {
    const kindIndex = wanted.indexOf(t.kind)
    return (kindIndex >= 0 ? 100 - kindIndex * 10 : 0) + (t.aiReference?.description ? 5 : 0)
  }
  return [...candidates]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map(describeReference)
}

/* ------------------------------------------------------------------ */
/* Bíblia visual do deck                                               */
/* ------------------------------------------------------------------ */

/** Contexto visual único do deck — herdado por todos os prompts de slide. */
export function buildDeckVisualBible(style: DesignStyle | null, config: PlannerConfig, deckTitle: string): string {
  if (!style) {
    return `Apresentação "${deckTitle}" (${config.language}, 16:9). Direção sóbria corporativa: fundo escuro neutro, um acento frio, tipografia sans-serif, margens amplas, alto contraste. Proibido: clichês corporativos, banco de imagem, logos desenhados.`
  }
  return [
    `Apresentação "${deckTitle}" · ${config.language} · 16:9 · estilo "${style.name}".`,
    `Paleta: fundo ${style.palette.background}, primária ${style.palette.primary}, acento ${style.palette.accent}, texto ${style.palette.text}. Tema ${style.theme}.`,
    `Tipografia: títulos ${style.typography.heading}, corpo ${style.typography.body}; hierarquia forte, títulos curtos.`,
    `Linguagem visual: ${style.visualDirection || style.aiInstructions || 'sofisticada e contemporânea'}.`,
    `Composição: ${style.compositionRules || 'margens generosas, um ponto focal por slide, assimetria intencional'}. Densidade ${style.density}.`,
    `Continuidade: mesma paleta, iluminação e vocabulário de formas em todos os slides; a COMPOSIÇÃO deve variar de slide para slide.`,
    `Logo: aplicado pelo sistema como camada exata — reservar área limpa; NUNCA desenhar/imitar logos.`,
    `Proibido no deck inteiro: aparência corporativa genérica, fotografias de banco, textos longos desenhados pela IA, molduras vazias, repetição do mesmo layout em slides consecutivos.`,
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Overlay de textos por arquétipo                                     */
/* ------------------------------------------------------------------ */

const SAFE = 0.05
/** Área reservada ao logo oficial (canto superior esquerdo). */
const LOGO_AREA = { x: 0, y: 0, width: 0.3, height: 0.14 }

function overlap(a: TextOverlayElement, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Valida e corrige o spec: safe area, colisões, logo, tamanhos mínimos. */
export function validateOverlaySpec(spec: TextOverlaySpec): TextOverlaySpec {
  const elements: TextOverlayElement[] = []
  for (const el of spec.elements) {
    const e = { ...el }
    e.width = Math.min(Math.max(e.width, 0.12), 1 - SAFE * 2)
    e.height = Math.min(Math.max(e.height, 0.04), 0.5)
    e.x = Math.min(Math.max(e.x, SAFE), 1 - SAFE - e.width)
    e.y = Math.min(Math.max(e.y, SAFE), 1 - SAFE - e.height)
    e.size = Math.max(e.size, e.type === 'title' ? 30 : 12)
    // Colisão com a área do logo: empurra para baixo.
    if (overlap(e, LOGO_AREA)) e.y = Math.max(e.y, LOGO_AREA.y + LOGO_AREA.height + 0.02)
    // Colisão com elementos já validados: empurra para baixo do último.
    for (const placed of elements) {
      if (overlap(e, placed)) e.y = Math.min(placed.y + placed.height + 0.015, 1 - SAFE - e.height)
    }
    elements.push(e)
  }
  return { ...spec, elements }
}

/**
 * Layout de textos por arquétipo — decidido pela composição, NUNCA pelos
 * slots do template de referência. Cada arquétipo posiciona diferente.
 */
export function buildOverlaySpec(archetypeId: string, plan: PlannedSlide): TextOverlaySpec {
  const title: TextOverlayElement = {
    id: 'title', type: 'title', text: plan.title,
    x: 0.06, y: 0.66, width: 0.7, height: 0.16,
    alignment: 'left', emphasis: 'strong', colorRole: 'auto', fontRole: 'heading', size: 44, maxLines: 2,
  }
  const subtitle: TextOverlayElement = {
    id: 'subtitle', type: 'subtitle', text: plan.subtitle || plan.keyMessage,
    x: 0.06, y: 0.84, width: 0.56, height: 0.08,
    alignment: 'left', colorRole: 'muted', fontRole: 'body', size: 19, maxLines: 2,
  }
  const spec: TextOverlaySpec = { elements: [title, subtitle], scrim: { y: 0.6, height: 0.4, opacity: 0.78 } }

  switch (archetypeId) {
    case 'immersive-cover':
    case 'hero':
      title.y = 0.38; title.width = 0.62; title.size = 60; title.height = 0.24
      subtitle.y = 0.66; subtitle.width = 0.5
      spec.scrim = { y: 0.3, height: 0.5, opacity: 0.55 }
      break
    case 'cycle':
    case 'radial':
      // Diagrama no centro-direita: textos ocupam a coluna esquerda.
      title.y = 0.16; title.width = 0.42; title.size = 40
      subtitle.x = 0.06; subtitle.y = 0.36; subtitle.width = 0.34
      spec.scrim = undefined
      break
    case 'journey':
    case 'timeline':
      title.y = 0.09; title.width = 0.66
      subtitle.y = 0.24; subtitle.width = 0.5
      spec.scrim = { y: 0.05, height: 0.28, opacity: 0.6 }
      break
    case 'data-focus':
      title.y = 0.72; title.size = 34; title.width = 0.6
      subtitle.y = 0.87
      spec.scrim = { y: 0.68, height: 0.32, opacity: 0.75 }
      break
    case 'comparison':
    case 'split-story':
    case 'before-after':
      title.x = 0.06; title.y = 0.08; title.width = 0.88; title.alignment = 'left'
      subtitle.y = 0.22; subtitle.width = 0.7
      spec.scrim = { y: 0.04, height: 0.26, opacity: 0.62 }
      break
    case 'call-to-action':
    case 'conclusion':
      title.alignment = 'center'; title.x = 0.15; title.y = 0.4; title.width = 0.7; title.size = 48
      subtitle.alignment = 'center'; subtitle.x = 0.2; subtitle.y = 0.6; subtitle.width = 0.6
      spec.scrim = { y: 0.32, height: 0.42, opacity: 0.5 }
      break
    // editorial / modular-cards / visual-metaphor mantêm o padrão inferior-esquerdo
  }
  return validateOverlaySpec(spec)
}

/* ------------------------------------------------------------------ */
/* Brief criativo + prompt final                                       */
/* ------------------------------------------------------------------ */

export interface CreativeSlideBrief {
  slideId: string
  compositionArchetype: string
  prompt: string
  negativePrompt: string
  overlaySpec: TextOverlaySpec
  referenceIds: string[]
  referenceInfluence: ReferenceInfluence
}

const INFLUENCE_TEXT: Record<ReferenceInfluence, string> = {
  light:
    'Influência LEVE: use das referências apenas atmosfera, paleta, tipografia e linguagem de formas. A composição é totalmente sua.',
  moderate:
    'Influência MODERADA: use atmosfera, estrutura conceitual, ritmo, densidade e hierarquia das referências — mas crie uma composição nova, sem copiar coordenadas nem quantidades de blocos.',
  strong:
    'Influência FORTE: aproxime-se do espírito compositivo das referências, mas ainda crie uma versão nova — nunca preencha o layout original nem copie elementos literalmente.',
}

export interface CompileBriefInput {
  plan: PlannedSlide
  slideId: string
  index: number
  total: number
  deckBible: string
  previousArchetype: string | null
  adjacentTitles: { previous?: string; next?: string }
  references: VisualReferenceProfile[]
  influence: ReferenceInfluence
  attachments: AttachmentForAi[]
}

/** Compila o prompt visual rico e secionado de UM slide (local, instantâneo). */
export function compileCreativeBrief(input: CompileBriefInput): CreativeSlideBrief {
  const { plan } = input
  const archetype = pickArchetype(plan, input.previousArchetype)
  const overlaySpec = buildOverlaySpec(archetype.id, plan)
  const relevantAssets = input.attachments.filter((a) => plan.attachmentIds.includes(a.id) && a.imageDataUrl)

  const exactTexts = [
    `Título (aplicado pelo sistema): "${plan.title}"`,
    plan.subtitle ? `Subtítulo: "${plan.subtitle}"` : '',
    plan.content.length > 0 ? `Itens do conteúdo (curtos, aplicados como camada quando necessário): ${plan.content.map((c) => `"${c}"`).join(' · ')}` : '',
  ].filter(Boolean)

  const prompt = [
    `## Contexto da apresentação\n${input.deckBible}`,
    `## Papel narrativo deste slide\nSlide ${input.index + 1} de ${input.total} — ${plan.objective}.${input.adjacentTitles.previous ? ` Vem depois de "${input.adjacentTitles.previous}".` : ''}${input.adjacentTitles.next ? ` Prepara "${input.adjacentTitles.next}".` : ''}`,
    `## Mensagem principal\n${plan.keyMessage}`,
    `## Textos exatos\n${exactTexts.join('\n')}\nO sistema aplica título/subtítulo/logo como camadas nítidas DEPOIS — deixe as áreas indicadas limpas e NÃO desenhe esses textos.`,
    `## Conceito visual\n${plan.visualDirection || 'Traduza a mensagem principal em uma cena visual específica do assunto — nunca decoração genérica.'}`,
    `## Composição (arquétipo: ${archetype.id})\n${archetype.composition}`,
    `## Elementos gráficos\n${plan.content.length > 0 ? `A composição deve dar forma visual a ${plan.content.length} ideia(s) — com pesos e tamanhos DIFERENTES entre si, não uma grade uniforme.` : 'Um único motivo visual dominante.'} Conectores, brilhos e camadas de profundidade na linguagem do estilo.`,
    relevantAssets.length > 0
      ? `## Direção de imagem\nAtivos reais anexados (${relevantAssets.map((a) => a.name).join(', ')}) entram como camada exata do sistema — integre a composição AO REDOR deles, sem recriá-los.`
      : '',
    `## Área reservada para textos\n${overlaySpec.elements.map((e) => `${e.type}: região x=${e.x.toFixed(2)} y=${e.y.toFixed(2)} w=${e.width.toFixed(2)} h=${e.height.toFixed(2)}`).join(' · ')} — manter essas regiões visualmente calmas e de alto contraste com o texto.`,
    input.references.length > 0
      ? `## Relação com as referências\n${INFLUENCE_TEXT[input.influence]}\n${input.references.map((r) => `- ${r.name}: ${r.visualSummary}. DNA: ${r.compositionDNA} Evitar: ${r.forbiddenPatterns}`).join('\n')}`
      : '',
    `## O que deve variar neste slide\nEste slide NÃO pode repetir a composição do anterior${input.previousArchetype ? ` (arquétipo anterior: ${input.previousArchetype})` : ''}. Mantenha a unidade de paleta/luz, mude a estrutura espacial.`,
    `## Restrições negativas\n${plan.negativePrompt || ''} Sem textos longos desenhados; sem logos; sem molduras vazias; sem fotografia de banco; sem grade uniforme de círculos idênticos; sem repetir o layout dos outros slides.`,
    `## Formato\n16:9, margens seguras de 5%, canto superior esquerdo reservado ao logo oficial (não ocupar).`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    slideId: input.slideId,
    compositionArchetype: archetype.id,
    prompt,
    negativePrompt: [
      plan.negativePrompt,
      'texto desenhado, tipografia renderizada pela IA, logos, marcas, molduras vazias, banco de imagem, grade uniforme, layout repetido, aparência corporativa genérica',
    ]
      .filter(Boolean)
      .join(', '),
    overlaySpec,
    referenceIds: input.references.map((r) => r.id),
    referenceInfluence: input.influence,
  }
}
