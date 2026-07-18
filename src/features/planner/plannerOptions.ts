import type { AudienceScope, MeetingType, SlideLayout } from '../../types'

export const LAYOUT_LABELS: Record<SlideLayout, string> = {
  cover: 'Capa',
  textImage: 'Texto + imagem',
  bigNumber: 'Dado em destaque',
  comparison: 'Comparação',
  process: 'Processo',
  timeline: 'Linha do tempo',
  conclusion: 'Conclusão',
  cta: 'Chamada para ação',
}

export interface MeetingTypeMeta {
  id: MeetingType
  label: string
  hint: string
  placeholder: string
  /** Sugestões curtas do que informar, mostradas ao selecionar o atalho. */
  promptHints: string[]
  objectives: string[]
}

export const MEETING_TYPES: MeetingTypeMeta[] = [
  {
    id: 'checkpoint',
    label: 'Checkpoint',
    hint: 'Prestação de contas de um período de projeto',
    placeholder:
      'Descreva o que aconteceu desde o último checkpoint: entregas, indicadores, avanços, bloqueios, decisões pendentes e próximos passos.',
    promptHints: [
      'Cliente e período analisado',
      'Entregas realizadas e andamento',
      'Indicadores do período',
      'Problemas, riscos e bloqueios',
      'Decisões necessárias',
      'Próximos passos',
    ],
    objectives: [
      'Prestar contas do período',
      'Demonstrar evolução',
      'Revisar indicadores',
      'Resolver bloqueios',
      'Solicitar decisões',
      'Alinhar próximos passos',
    ],
  },
  {
    id: 'kickoff',
    label: 'Kickoff',
    hint: 'Abertura de projeto com cliente e time',
    placeholder:
      'Descreva o cliente, o projeto, o problema, o escopo contratado, os envolvidos, as entregas, o cronograma e os combinados iniciais.',
    promptHints: [
      'Contexto do cliente e problema',
      'Escopo e entregáveis',
      'Pessoas envolvidas e responsabilidades',
      'Cronograma e marcos',
      'Ferramentas e governança',
      'Próximos passos',
    ],
    objectives: [
      'Alinhar escopo e expectativas',
      'Apresentar plano de trabalho',
      'Definir responsabilidades',
      'Confirmar cronograma',
      'Explicar governança',
      'Engajar os participantes',
    ],
  },
  {
    id: 'townhall',
    label: 'Town-Hall',
    hint: 'Reunião geral do time',
    placeholder:
      'Descreva os assuntos da reunião geral: resultados, anúncios, destaques, pessoas, aprendizados, cultura e prioridades do próximo período.',
    promptHints: [
      'Anúncios e resultados',
      'Novos integrantes e conquistas',
      'Aprendizados e cultura',
      'Mudanças e prioridades',
      'Reconhecimentos',
      'Próximos ciclos',
    ],
    objectives: [
      'Informar o time',
      'Apresentar resultados',
      'Reforçar cultura',
      'Comunicar mudanças',
      'Reconhecer pessoas e conquistas',
      'Alinhar prioridades',
    ],
  },
  {
    id: 'proposal',
    label: 'Proposta',
    hint: 'Proposta comercial para um prospect',
    placeholder:
      'Descreva o prospect, o problema, a solução proposta, escopo, benefícios, condições comerciais, preço e próximo passo esperado.',
    promptHints: [
      'Prospect e problema',
      'Cenário atual e solução',
      'Diferenciais e escopo',
      'Preço e opções comerciais',
      'Prova de valor e cronograma',
      'Chamada para ação',
    ],
    objectives: [
      'Apresentar a solução',
      'Demonstrar valor',
      'Justificar o investimento',
      'Comparar opções',
      'Aprovar a proposta',
      'Avançar para o fechamento',
    ],
  },
]

export const CUSTOM_OBJECTIVE = 'custom'

export function getMeetingMeta(id: MeetingType): MeetingTypeMeta {
  return MEETING_TYPES.find((m) => m.id === id) ?? MEETING_TYPES[0]
}

export interface AudienceSegmentMeta {
  id: string
  label: string
  /** Efeito no plano/prompt — vocabulário, profundidade, foco. */
  effect: string
}

export const INTERNAL_SEGMENTS: AudienceSegmentMeta[] = [
  {
    id: 'Time de Tecnologia',
    label: 'Time de Tecnologia',
    effect:
      'Aprofunde arquitetura, integrações, dados, riscos técnicos e decisões de engenharia; vocabulário técnico é bem-vindo.',
  },
  {
    id: 'Time de Projetos',
    label: 'Time de Projetos',
    effect:
      'Foque em escopo, andamento, responsabilidades, bloqueios e cronograma; indicadores de execução em destaque.',
  },
  {
    id: 'Comercial',
    label: 'Comercial',
    effect:
      'Foque em oportunidade, valor, objeções, conversão e próximos passos; exemplos orientados a cliente e receita.',
  },
  {
    id: 'Marketing',
    label: 'Marketing',
    effect:
      'Foque em campanha, posicionamento, alcance, audiência e criação; métricas de engajamento e narrativa de marca.',
  },
  {
    id: 'Geral',
    label: 'Geral',
    effect: 'Linguagem acessível, visão transversal, menos jargão e mais contexto explicado.',
  },
]

export const EXTERNAL_SEGMENTS: AudienceSegmentMeta[] = [
  {
    id: 'Gestão Operacional',
    label: 'Gestão Operacional',
    effect:
      'Mais contexto, processos, responsáveis, execução, detalhes, riscos e próximos passos operacionais.',
  },
  {
    id: 'Liderança Executiva',
    label: 'Liderança Executiva',
    effect:
      'Síntese máxima: impacto, riscos, decisões, retorno e prioridades. Pouco texto por slide, foco no que precisa ser aprovado.',
  },
  {
    id: 'Público Institucional',
    label: 'Público Institucional',
    effect:
      'Linguagem acessível, visão panorâmica, conceitos explicados, menos detalhes técnicos, narrativa clara.',
  },
  {
    id: 'Foco em Resultados',
    label: 'Foco em Resultados',
    effect:
      'KPIs, entregas, ganhos, comparações, evidências, impacto financeiro/operacional e próximos resultados esperados.',
  },
]

export function segmentsForScope(scope: AudienceScope): AudienceSegmentMeta[] {
  return scope === 'internal' ? INTERNAL_SEGMENTS : EXTERNAL_SEGMENTS
}

export function segmentEffect(scope: AudienceScope, segmentId: string): string {
  return segmentsForScope(scope).find((s) => s.id === segmentId)?.effect ?? ''
}

export const TONES = ['Confiante', 'Inspirador', 'Técnico', 'Direto', 'Consultivo', 'Provocador']
