import type { AttachmentRole, AttachmentScope } from '../../types/attachments'

export const ROLE_LABELS: Record<AttachmentRole, string> = {
  logo: 'Logo',
  photo: 'Foto',
  person: 'Pessoa',
  product: 'Produto',
  software: 'Software',
  chart: 'Gráfico',
  diagram: 'Diagrama',
  screenshot: 'Screenshot',
  'visual-reference': 'Referência visual',
  'required-content': 'Conteúdo obrigatório',
  'support-document': 'Documento de apoio',
  texture: 'Textura',
  'do-not-use': 'Não usar diretamente',
}

export const SCOPE_LABELS: Record<AttachmentScope, string> = {
  deck: 'Apresentação inteira',
  'selected-slides': 'Slides selecionados',
  'planning-only': 'Somente planejamento',
  'visual-reference-only': 'Somente referência visual',
}
