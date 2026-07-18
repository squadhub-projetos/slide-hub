import type { PlannedSlide } from '../../types'

/** Conteúdo de amostra para miniaturas/previews de templates. */
export function samplePlanFor(kind: string): PlannedSlide {
  const contentByKind: Record<string, string[]> = {
    cover: ['Abertura da apresentação'],
    bigNumber: ['42% de evolução no período', 'Meta do ciclo superada', 'R$ 3,2M processados', 'Payback em 8 meses'],
    process: ['Diagnóstico do cenário', 'Desenho da solução', 'Implantação em ondas', 'Operação e evolução', 'Medição contínua'],
    timeline: ['Kickoff e imersão', 'Primeira entrega', 'Expansão para os times', 'Revisão de resultados'],
    comparison: ['Processos manuais e retrabalho', 'Fluxo automatizado de ponta a ponta'],
    risks: ['Dependência de acesso ao ambiente', 'Plano de contingência acordado', 'Prazo apertado na fase 2', 'Reforço de equipe alocado', 'Escopo em validação', 'Workshop de alinhamento'],
    people: ['Ana — Direção', 'Bruno — Produção', 'Carla — Conteúdo', 'Diego — Operação'],
  }
  return {
    id: 'sample',
    order: 1,
    title: 'Título de exemplo do slide',
    subtitle: 'Subtítulo de apoio com a mensagem central',
    objective: 'Demonstrar o layout',
    keyMessage: 'Uma mensagem clara por slide',
    content: contentByKind[kind] ?? ['Primeiro ponto do conteúdo', 'Segundo ponto com mais detalhe', 'Terceiro ponto de apoio', 'Quarto ponto complementar', 'Quinto ponto', 'Sexto ponto'],
    evidence: kind === 'bigNumber' ? ['42%', 'R$ 3,2M', '8 meses', '99,9%'] : [],
    speakerIntent: '',
    layout: 'textImage',
    visualDirection: '',
    brandInstructions: '',
    attachmentIds: [],
    productionPrompt: '',
    negativePrompt: '',
  }
}
