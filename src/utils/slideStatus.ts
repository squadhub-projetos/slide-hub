import type { SlideStatus } from '../types'

export const STATUS_META: Record<SlideStatus, { label: string; className: string }> = {
  pending: { label: 'Não iniciado', className: 'badge-neutral' },
  generating: { label: 'Gerando…', className: 'badge-cyan' },
  awaiting: { label: 'Aguardando aprovação', className: 'badge-warning' },
  revised: { label: 'Revisado', className: 'badge-violet' },
  approvedManual: { label: 'Aprovado', className: 'badge-success' },
  approvedAuto: { label: 'Aprovado automaticamente', className: 'badge-success' },
  error: { label: 'Erro', className: 'badge-danger' },
}

export function statusLabel(status: SlideStatus): string {
  return STATUS_META[status].label
}
