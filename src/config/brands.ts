import type { BrandDefinition } from '../types/brands'
import squadhubLogo from '../assets/brands/squadhub/logo.svg'
import gaustecLogo from '../assets/brands/gaustec/logo.png'
import getChurchLogo from '../assets/brands/get-church/logo.png'

export const SQUADHUB_BRAND_ID = 'brand-squadhub'
export const GAUSTEC_BRAND_ID = 'brand-gaustec'
export const GET_CHURCH_BRAND_ID = 'brand-get-church'

/**
 * Registro global e tipado de marcas. Fonte única de verdade dos logos
 * oficiais — nenhum outro arquivo deve replicar esses ativos.
 */
export const BRANDS: Record<string, BrandDefinition> = {
  [SQUADHUB_BRAND_ID]: {
    id: SQUADHUB_BRAND_ID,
    name: 'SquadHub',
    clientName: 'SquadHub',
    description: 'Marca interna — gestão e tecnologia. Símbolo azul elétrico com wordmark.',
    logoAsset: squadhubLogo,
    logoOnDark: true,
    brandColors: ['#009ADC', '#0B1220', '#FFFFFF'],
    defaultStyleIds: ['style-squadhub-tech-dark', 'style-squadhub-tech-light'],
    logoPlacement: 'top-left',
    logoVariant: 'auto',
    safeAreaPct: 4,
    usageRules: [
      'Aplicar o arquivo oficial como camada exata, sem redesenhar',
      'Manter proporção original e margem de segurança',
      'Sobre fundo claro, usar a variante com wordmark escuro',
    ],
    forbiddenUsages: [
      'Nunca pedir para a IA reproduzir o logo',
      'Nunca distorcer, rotacionar ou alterar as letras do wordmark',
      'Não aplicar automaticamente em estilos de clientes sem co-branding explícito',
    ],
  },
  [GAUSTEC_BRAND_ID]: {
    id: GAUSTEC_BRAND_ID,
    name: 'Gaustec',
    clientName: 'Gaustec',
    description: 'Cliente — tecnologia magnética e engenharia. Verde institucional e amarelo-areia.',
    logoAsset: gaustecLogo,
    logoOnDark: false,
    brandColors: ['#146C43', '#D3C376', '#6D6E71', '#FFFFFF'],
    defaultStyleIds: ['style-gaustec-engineering'],
    logoPlacement: 'top-left',
    logoVariant: 'color',
    safeAreaPct: 4,
    usageRules: [
      'Usar o PNG oficial sem alteração de cor ou proporção',
      'Preferir fundos claros — o logo foi desenhado para fundo branco',
    ],
    forbiddenUsages: [
      'Não redesenhar o símbolo ou o wordmark',
      'Não aplicar sobre fundos escuros sem área de respiro clara',
    ],
  },
  [GET_CHURCH_BRAND_ID]: {
    id: GET_CHURCH_BRAND_ID,
    name: 'Get Church',
    clientName: 'Get Church',
    description: 'Cliente — música, cultura e igreja. Símbolo orgânico dourado sobre petróleo profundo.',
    logoAsset: getChurchLogo,
    logoOnDark: true,
    brandColors: ['#C79A56', '#0B1E23', '#F4EDE1'],
    defaultStyleIds: ['style-get-church-signature'],
    logoPlacement: 'top-left',
    logoVariant: 'color',
    safeAreaPct: 4,
    usageRules: [
      'Usar o PNG oficial sem alteração; o arquivo já traz o fundo arredondado próprio',
      'Manter margem de segurança generosa ao redor do símbolo',
    ],
    forbiddenUsages: ['Não recolorir o dourado', 'Não recortar o símbolo fora do fundo original'],
  },
}

export function getBrand(brandId: string | null | undefined): BrandDefinition | null {
  return brandId ? (BRANDS[brandId] ?? null) : null
}

export const ALL_BRANDS: BrandDefinition[] = Object.values(BRANDS)
