import type {
  BrandLogoRules,
  DesignStyle,
  StyleComposition,
  StyleGradient,
  StyleIcons,
  StyleImagery,
  StyleTextRules,
  StyleTexture,
  StyleTypography,
} from '../types'
import { GAUSTEC_BRAND_ID, GET_CHURCH_BRAND_ID, SQUADHUB_BRAND_ID } from './brands'

const SEEDED_AT = '2026-07-01T09:00:00.000Z'

export function defaultLogoRules(overrides: Partial<BrandLogoRules> = {}): BrandLogoRules {
  return {
    coBranding: 'client-only',
    placement: 'top-left',
    widthPct: 12,
    safeAreaPct: 4,
    variant: 'auto',
    watermark: false,
    required: true,
    ...overrides,
  }
}

export function defaultTypography(overrides: Partial<StyleTypography> = {}): StyleTypography {
  return {
    heading: 'Segoe UI',
    body: 'Segoe UI',
    numbers: 'Segoe UI',
    headingWeight: 700,
    uppercaseTitles: false,
    letterSpacing: 0,
    maxLevels: 3,
    scale: 100,
    alignment: 'left',
    ...overrides,
  }
}

export function defaultGradient(overrides: Partial<StyleGradient> = {}): StyleGradient {
  return {
    kind: 'radial',
    direction: 135,
    intensity: 50,
    colorCount: 2,
    opacity: 60,
    focus: 'corner',
    solidFallback: '#0b1120',
    ...overrides,
  }
}

export function defaultComposition(overrides: Partial<StyleComposition> = {}): StyleComposition {
  return {
    visualLanguages: ['corporate', 'technical'],
    dominantLanguage: 'corporate',
    shapes: ['straight', 'technical'],
    cornerRadius: 10,
    lineWeight: 1.5,
    fillLevel: 35,
    glow: 30,
    shadow: 30,
    transparency: 25,
    creativity: 'balanced',
    structuralPrecision: 'technical',
    ...overrides,
  }
}

export function defaultIcons(overrides: Partial<StyleIcons> = {}): StyleIcons {
  return {
    mode: 'linear',
    frequency: 'medium',
    size: 'medium',
    color: '#22d3ee',
    allowGenerated: false,
    preferLibrary: true,
    ...overrides,
  }
}

export function defaultImagery(overrides: Partial<StyleImagery> = {}): StyleImagery {
  return {
    treatments: ['shape-integrated'],
    direction: 'Abstrações geométricas com função informativa',
    ...overrides,
  }
}

export function defaultTexture(overrides: Partial<StyleTexture> = {}): StyleTexture {
  return { kind: 'grain', intensity: 20, ...overrides }
}

export function defaultTextRules(overrides: Partial<StyleTextRules> = {}): StyleTextRules {
  return {
    positivePrompt: '',
    requiredElements: '',
    forbiddenElements: '',
    negativePrompt:
      'texto ilegível, erros de ortografia, logos redesenhados, marcas distorcidas, watermark aleatório, excesso de elementos decorativos',
    usageExamples: '',
    whenNotToUse: '',
    maxTextRules: 'No máximo um título, um apoio e cinco itens por slide.',
    chartRules: 'Gráficos limpos, sem efeito 3D, com um único dado em destaque.',
    photoRules: 'Fotografias apenas quando houver anexo ou pedido explícito.',
    logoRules: 'O logo oficial é aplicado pelo sistema como camada exata — nunca gerar ou redesenhar logos.',
    ...overrides,
  }
}

/**
 * Estilos oficiais do sistema: fixados no início da biblioteca, não podem
 * ser excluídos nem editados diretamente (o usuário duplica para editar).
 */
export const SYSTEM_STYLES: DesignStyle[] = [
  {
    id: 'style-squadhub-tech-dark',
    brandId: SQUADHUB_BRAND_ID,
    name: 'SquadHub Tech Dark',
    client: 'SquadHub',
    description:
      'Estilo principal interno: fundo azul quase preto, tipografia branca de alto contraste, destaques em azul e ciano, linhas técnicas e HUD discreto.',
    theme: 'dark',
    palette: {
      background: '#040A16',
      surface: '#0A1526',
      primary: '#0B63C4',
      secondary: '#123B66',
      accent: '#22C9EE',
      text: '#F2F6FC',
      muted: '#8CA2BF',
    },
    typography: defaultTypography({ heading: 'Segoe UI', body: 'Segoe UI', numbers: 'Segoe UI', headingWeight: 700 }),
    contrast: 'high',
    gradient: defaultGradient({ kind: 'radial', intensity: 60, focus: 'corner', solidFallback: '#040A16' }),
    composition: defaultComposition({
      visualLanguages: ['futuristic', 'technical', 'corporate'],
      dominantLanguage: 'technical',
      shapes: ['technical', 'straight', 'outlined'],
      cornerRadius: 8,
      lineWeight: 1.2,
      glow: 45,
      fillLevel: 25,
      structuralPrecision: 'technical',
      creativity: 'balanced',
    }),
    icons: defaultIcons({ mode: 'linear', color: '#22C9EE' }),
    imagery: defaultImagery({
      treatments: ['shape-integrated', 'diagram', 'software-screen'],
      direction: 'Geometrias futuristas, círculos técnicos tipo HUD, grids discretos — nunca fotos de banco genéricas',
    }),
    texture: defaultTexture({ kind: 'tech-lines', intensity: 25 }),
    density: 'balanced',
    visualDirection:
      'Tecnológico e corporativo: títulos grandes e pesados em branco, palavras e números-chave em azul/ciano, brilho apenas onde tem função, muito respiro.',
    compositionRules:
      'Hierarquia visual forte; um ponto focal por slide; sem excesso de cards; sem transformar tudo em caixa com borda neon; pouco arredondamento.',
    keywords: ['squadhub', 'interno', 'tech', 'dark', 'cultura', 'processos', 'onboarding'],
    aiInstructions:
      'Fundo azul-marinho quase preto. Tipografia sans-serif branca de alto contraste com títulos grandes. Destaque palavras e números importantes em azul #0B63C4 ou ciano #22C9EE. Linhas técnicas finas, círculos tipo HUD e grids discretos. Evite roxo, evite estética genérica de IA, evite excesso de brilho. Espaço vazio é parte do design.',
    textRules: defaultTextRules({
      requiredElements: 'Área reservada para o logo oficial da SquadHub no canto definido pelas regras de logo.',
      forbiddenElements: 'Excesso de roxo; caixas com borda neon em todos os elementos; estética genérica de IA; mascotes.',
      negativePrompt:
        'roxo dominante, neon excessivo, bordas brilhantes em tudo, texto ilegível, logos redesenhados, estética genérica de IA, cartoon',
      usageExamples: 'Apresentações internas, cultura, processos, resultados, tecnologia, onboarding e reuniões comerciais.',
    }),
    logoRules: defaultLogoRules({ coBranding: 'squadhub-only', placement: 'top-left', widthPct: 13 }),
    webAssetPolicy: 'attachments-only',
    brandAssetIds: [],
    isSystem: true,
    favorite: true,
    isDefault: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'style-squadhub-tech-light',
    brandId: SQUADHUB_BRAND_ID,
    name: 'SquadHub Tech Light',
    client: 'SquadHub',
    description:
      'Tradução clara da mesma identidade: fundo gelo, texto azul-marinho profundo, os mesmos elementos técnicos com grids quase imperceptíveis.',
    theme: 'light',
    palette: {
      background: '#F4F7FB',
      surface: '#FFFFFF',
      primary: '#0B63C4',
      secondary: '#DCE8F5',
      accent: '#0891B2',
      text: '#0B2242',
      muted: '#5B7395',
    },
    typography: defaultTypography({ heading: 'Segoe UI', body: 'Segoe UI', headingWeight: 700 }),
    contrast: 'high',
    gradient: defaultGradient({ kind: 'diffuse', intensity: 25, opacity: 40, focus: 'top', solidFallback: '#F4F7FB' }),
    composition: defaultComposition({
      visualLanguages: ['technical', 'corporate', 'minimalist'],
      dominantLanguage: 'corporate',
      shapes: ['technical', 'straight'],
      cornerRadius: 8,
      lineWeight: 1.2,
      glow: 10,
      shadow: 15,
      fillLevel: 20,
      structuralPrecision: 'technical',
    }),
    icons: defaultIcons({ mode: 'linear', color: '#0B63C4' }),
    imagery: defaultImagery({
      treatments: ['shape-integrated', 'diagram'],
      direction: 'Mesmas geometrias técnicas do modo escuro traduzidas para o claro; sombras muito discretas',
    }),
    texture: defaultTexture({ kind: 'grid', intensity: 10 }),
    density: 'clean',
    visualDirection:
      'Corporativo premium em salas claras e projetores: fundo gelo, texto azul-marinho, destaques em azul e ciano, linhas finas e diagramas tecnológicos.',
    compositionRules:
      'Alta legibilidade; títulos grandes; sem grandes blocos cinza genéricos; sem aparência de dashboard; sem estética infantil.',
    keywords: ['squadhub', 'light', 'projetor', 'cliente', 'comercial'],
    aiInstructions:
      'Fundo branco-gelo ou cinza azulado muito claro. Texto em azul-marinho profundo #0B2242. Destaques em azul #0B63C4 e ciano #0891B2. Mesmo vocabulário geométrico do SquadHub Tech Dark: círculos técnicos, linhas finas, grids quase imperceptíveis. Sombras sutis. Nada de blocos cinza genéricos nem visual de dashboard.',
    textRules: defaultTextRules({
      requiredElements: 'Área reservada para o logo oficial da SquadHub (variante escura do wordmark).',
      forbiddenElements: 'Blocos cinza genéricos; aparência de dashboard; estética infantil.',
      negativePrompt:
        'fundo escuro, blocos cinza, dashboard, cores saturadas demais, texto ilegível, logos redesenhados, clipart',
      usageExamples: 'Apresentações externas em ambientes claros, propostas impressas, projeção em salas iluminadas.',
    }),
    logoRules: defaultLogoRules({ coBranding: 'squadhub-only', placement: 'top-left', widthPct: 13 }),
    webAssetPolicy: 'attachments-only',
    brandAssetIds: [],
    isSystem: true,
    favorite: false,
    isDefault: false,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'style-gaustec-engineering',
    brandId: GAUSTEC_BRAND_ID,
    name: 'Gaustec Engineering',
    client: 'Gaustec',
    description:
      'Engenharia e tecnologia magnética: fundo off-white, verde institucional, amarelo-areia como acento e grafite nos textos. Preciso e industrial.',
    theme: 'light',
    palette: {
      background: '#FAFAF7',
      surface: '#FFFFFF',
      primary: '#146C43',
      secondary: '#0E4D30',
      accent: '#C9B565',
      text: '#3F4245',
      muted: '#83878B',
    },
    typography: defaultTypography({ heading: 'Trebuchet MS', body: 'Segoe UI', headingWeight: 700 }),
    contrast: 'medium',
    gradient: defaultGradient({ kind: 'none', intensity: 0, opacity: 0, solidFallback: '#FAFAF7' }),
    composition: defaultComposition({
      visualLanguages: ['technical', 'diagrammatic', 'solid-shapes'],
      dominantLanguage: 'technical',
      shapes: ['solid', 'straight', 'angular'],
      cornerRadius: 4,
      lineWeight: 1.6,
      glow: 0,
      shadow: 12,
      fillLevel: 55,
      transparency: 5,
      structuralPrecision: 'technical',
      creativity: 'conservative',
    }),
    icons: defaultIcons({ mode: 'technical', color: '#146C43' }),
    imagery: defaultImagery({
      treatments: ['framed-photo', 'diagram', 'background-removed'],
      direction:
        'Diagramas técnicos, linhas de fluxo, gráficos e recortes de máquinas/equipamentos; curvas pontuais inspiradas no símbolo da marca',
    }),
    texture: defaultTexture({ kind: 'none', intensity: 0 }),
    density: 'informative',
    visualDirection:
      'Visual profissional, técnico e limpo, de indústria e engenharia: composição precisa, formas sólidas bem definidas, pouco brilho.',
    compositionRules:
      'Sem estética neon; sem fundo escuro como padrão; sem excesso de elementos patrióticos; verde como cor institucional dominante, amarelo apenas como destaque.',
    keywords: ['gaustec', 'engenharia', 'indústria', 'pcp', 'produção', 'checkpoint', 'kickoff'],
    aiInstructions:
      'Fundo branco ou off-white. Verde institucional #146C43 como cor principal, amarelo-areia #C9B565 apenas em destaques pontuais, textos em grafite. Diagramas técnicos, linhas de fluxo e formas sólidas de engenharia. Sem neon, sem gradientes chamativos, sem fundo escuro.',
    textRules: defaultTextRules({
      requiredElements: 'Área reservada para o logo oficial da Gaustec sobre fundo claro.',
      forbiddenElements: 'Estética neon; fundos escuros; bandeiras ou apelos patrióticos; brilhos decorativos.',
      negativePrompt:
        'neon, fundo escuro, roxo, brilhos decorativos, bandeira do Brasil, logos redesenhados, texto ilegível, cartoon',
      usageExamples: 'Checkpoints, kickoffs, indicadores, PCP, estoque, produção, processos e apresentações executivas.',
    }),
    logoRules: defaultLogoRules({ coBranding: 'client-only', placement: 'top-left', widthPct: 14 }),
    webAssetPolicy: 'attachments-only',
    brandAssetIds: [],
    isSystem: true,
    favorite: false,
    isDefault: false,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'style-get-church-signature',
    brandId: GET_CHURCH_BRAND_ID,
    name: 'Get Church Signature',
    client: 'Get Church',
    description:
      'Sofisticado e humano: petróleo profundo, detalhes dourados, marfim nos textos e formas orgânicas inspiradas em galhos e crescimento.',
    theme: 'dark',
    palette: {
      background: '#0A1D22',
      surface: '#12292F',
      primary: '#1D4A50',
      secondary: '#31646B',
      accent: '#C79A56',
      text: '#F4EDE1',
      muted: '#9DB3B0',
    },
    typography: defaultTypography({ heading: 'Georgia', body: 'Segoe UI', numbers: 'Georgia', headingWeight: 600 }),
    contrast: 'medium',
    gradient: defaultGradient({ kind: 'diffuse', intensity: 40, opacity: 55, focus: 'top', solidFallback: '#0A1D22' }),
    composition: defaultComposition({
      visualLanguages: ['organic', 'editorial', 'cinematic'],
      dominantLanguage: 'organic',
      shapes: ['organic', 'rounded', 'asymmetric'],
      cornerRadius: 18,
      lineWeight: 1.2,
      glow: 20,
      shadow: 35,
      fillLevel: 30,
      structuralPrecision: 'organic',
      creativity: 'creative',
    }),
    icons: defaultIcons({ mode: 'linear', frequency: 'low', color: '#C79A56' }),
    imagery: defaultImagery({
      treatments: ['full-bleed', 'texture', 'shape-integrated'],
      direction:
        'Formas orgânicas de raízes, galhos, folhas e conexão; iluminação suave; textura leve e elegante — nunca símbolos religiosos genéricos',
    }),
    texture: defaultTexture({ kind: 'grain', intensity: 30 }),
    density: 'clean',
    visualDirection:
      'Criativo, humano e premium: serifada de destaque com sans-serif de corpo, dourado usado com parcimônia sobre petróleo profundo.',
    compositionRules:
      'Equilíbrio entre serifada e sans-serif; evitar estética de convite de casamento; evitar excesso de ornamentos dourados.',
    keywords: ['get church', 'música', 'cultura', 'igreja', 'lançamento', 'criativo'],
    aiInstructions:
      'Fundo azul-petróleo muito escuro #0A1D22 com textura sutil. Detalhes e destaques em dourado #C79A56, textos em marfim #F4EDE1. Formas orgânicas inspiradas em galhos, folhas e crescimento, com iluminação suave. Título em serifada elegante, corpo em sans-serif. Sem símbolos religiosos genéricos, sem estética de convite de casamento, sem excesso de dourado.',
    textRules: defaultTextRules({
      requiredElements: 'Área reservada para o logo oficial da Get Church.',
      forbiddenElements: 'Cruzes e símbolos religiosos genéricos não solicitados; ornamentos dourados em excesso; estética de convite de casamento.',
      negativePrompt:
        'convite de casamento, ornamentos excessivos, símbolos religiosos genéricos, dourado saturado em toda a tela, texto ilegível, logos redesenhados',
      usageExamples: 'Música, cultura, igreja, lançamentos, processos criativos e gestão de produção.',
    }),
    logoRules: defaultLogoRules({ coBranding: 'client-only', placement: 'top-left', widthPct: 7 }),
    webAssetPolicy: 'attachments-only',
    brandAssetIds: [],
    isSystem: true,
    favorite: false,
    isDefault: false,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
]

export const SYSTEM_STYLE_IDS = new Set(SYSTEM_STYLES.map((s) => s.id))
