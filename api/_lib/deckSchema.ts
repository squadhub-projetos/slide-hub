/** JSON Schemas dos Structured Outputs (Responses API, strict mode). */

const PLANNED_SLIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'order', 'title', 'subtitle', 'objective', 'keyMessage', 'content', 'evidence',
    'speakerIntent', 'layout', 'visualDirection', 'brandInstructions', 'attachmentIds',
    'productionPrompt', 'negativePrompt',
  ],
  properties: {
    id: { type: 'string' },
    order: { type: 'integer' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    objective: { type: 'string' },
    keyMessage: { type: 'string' },
    content: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' } },
    speakerIntent: { type: 'string' },
    layout: {
      type: 'string',
      enum: ['cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta'],
    },
    visualDirection: { type: 'string' },
    brandInstructions: { type: 'string' },
    attachmentIds: { type: 'array', items: { type: 'string' } },
    productionPrompt: { type: 'string' },
    negativePrompt: { type: 'string' },
  },
} as const

export const DECK_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'assistantMessage',
    'title', 'subtitle', 'meetingType', 'audienceScope', 'audienceSegment', 'objective',
    'executiveSummary', 'centralMessage', 'narrativeLogic', 'insights', 'recommendedSlideCount',
    'attachmentsUsed', 'slides', 'masterPrompt', 'clarifyingQuestions',
  ],
  properties: {
    /**
     * Resposta conversacional exibida no chat — o modelo fala com o usuário
     * (o que entendeu, o que inferiu, o que falta) em vez de o frontend
     * exibir uma frase fixa. Curta; nunca repete o plano inteiro.
     */
    assistantMessage: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    meetingType: { type: 'string', enum: ['checkpoint', 'kickoff', 'townhall', 'proposal'] },
    audienceScope: { type: 'string', enum: ['internal', 'external'] },
    audienceSegment: { type: 'string' },
    objective: { type: 'string' },
    executiveSummary: { type: 'string' },
    centralMessage: { type: 'string' },
    narrativeLogic: { type: 'string' },
    insights: {
      type: 'object',
      additionalProperties: false,
      required: [
        'understanding', 'centralMessage', 'keyInsights', 'decisionsToProvoke', 'inferred',
        'assumptions', 'missingInformation', 'communicationRisks', 'narrativeSuggestion',
        'statedFacts', 'audienceInterpretation', 'intent',
      ],
      properties: {
        understanding: { type: 'string' },
        centralMessage: { type: 'string' },
        keyInsights: { type: 'array', items: { type: 'string' } },
        decisionsToProvoke: { type: 'array', items: { type: 'string' } },
        inferred: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        missingInformation: { type: 'array', items: { type: 'string' } },
        communicationRisks: { type: 'array', items: { type: 'string' } },
        narrativeSuggestion: { type: 'string' },
        /** O que o usuário informou DIRETAMENTE no briefing (sem inferência). */
        statedFacts: { type: 'array', items: { type: 'string' } },
        audienceInterpretation: { type: 'string' },
        intent: { type: 'string' },
      },
    },
    recommendedSlideCount: { type: 'integer' },
    attachmentsUsed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['attachmentId', 'usage'],
        properties: { attachmentId: { type: 'string' }, usage: { type: 'string' } },
      },
    },
    slides: { type: 'array', items: PLANNED_SLIDE_SCHEMA },
    masterPrompt: { type: 'string' },
    clarifyingQuestions: { type: 'array', items: { type: 'string' } },
  },
} as const

export const SINGLE_SLIDE_SCHEMA = PLANNED_SLIDE_SCHEMA

/**
 * Planejamento LEVE: decide título, mensagem, narrativa e o papel de cada
 * slide — SEM texto final, sem productionPrompt, sem masterPrompt. A
 * produção de cada slide acontece depois, em chamadas paralelas curtas.
 */
export const PLAN_LIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'assistantMessage', 'title', 'subtitle', 'centralMessage', 'narrative',
    'meetingType', 'audienceScope', 'audienceSegment', 'objective',
    'understanding', 'inferred', 'missingInformation',
    'slides', 'clarifyingQuestions',
  ],
  properties: {
    assistantMessage: { type: 'string' },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    centralMessage: { type: 'string' },
    narrative: { type: 'string' },
    meetingType: { type: 'string', enum: ['checkpoint', 'kickoff', 'townhall', 'proposal'] },
    audienceScope: { type: 'string', enum: ['internal', 'external'] },
    audienceSegment: { type: 'string' },
    objective: { type: 'string' },
    understanding: { type: 'string' },
    inferred: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'layout', 'title', 'message', 'contentHints', 'requiresImage', 'assetIds'],
        properties: {
          order: { type: 'integer' },
          layout: {
            type: 'string',
            enum: ['cover', 'textImage', 'bigNumber', 'comparison', 'process', 'timeline', 'conclusion', 'cta'],
          },
          title: { type: 'string' },
          message: { type: 'string' },
          /** 2-4 direções curtas do que este slide deve cobrir. */
          contentHints: { type: 'array', items: { type: 'string' } },
          requiresImage: { type: 'boolean' },
          assetIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    clarifyingQuestions: { type: 'array', items: { type: 'string' } },
  },
} as const

export const ASSET_SUGGESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['brandName', 'imageUrl', 'sourceDomain', 'sourceUrl', 'note'],
        properties: {
          brandName: { type: 'string' },
          imageUrl: { type: 'string' },
          sourceDomain: { type: 'string' },
          sourceUrl: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const
