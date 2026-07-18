/** Posições permitidas para logos oficiais sobre o slide. */
export type LogoPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Variantes de cor do logo (a geometria nunca muda). */
export type LogoVariant = 'color' | 'mono-light' | 'mono-dark'

/** Co-branding em estilos de clientes. */
export type CoBrandingMode = 'client-only' | 'client-plus-squadhub' | 'squadhub-only'

/** Regras de aplicação do logo em um estilo. */
export interface BrandLogoRules {
  coBranding: CoBrandingMode
  placement: LogoPlacement
  /** Largura do logo em % da largura do slide. */
  widthPct: number
  /** Margem de segurança em % da largura do slide. */
  safeAreaPct: number
  variant: 'auto' | LogoVariant
  watermark: boolean
  required: boolean
}

export interface BrandDefinition {
  id: string
  name: string
  clientName: string
  description: string
  /** URL resolvida pelo bundler — fonte única de verdade do arquivo oficial. */
  logoAsset: string
  secondaryLogoAsset?: string
  /** Se o arquivo do logo foi desenhado para fundo escuro ou claro. */
  logoOnDark: boolean
  brandColors: string[]
  defaultStyleIds: string[]
  logoPlacement: LogoPlacement
  logoVariant: 'auto' | LogoVariant
  safeAreaPct: number
  usageRules: string[]
  forbiddenUsages: string[]
}

/** Política de uso de ativos externos (logos de terceiros). */
export type WebAssetPolicy = 'attachments-only' | 'suggest-official' | 'no-external'

/** Sugestão de ativo oficial encontrada na internet (sempre requer confirmação). */
export interface OfficialAssetSuggestion {
  id: string
  brandName: string
  imageUrl: string
  sourceDomain: string
  sourceUrl: string
  note?: string
}
