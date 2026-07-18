import type { SlideStatus } from '../types'
import { STATUS_META } from '../utils/slideStatus'

export function StatusBadge({ status, compact = false }: { status: SlideStatus; compact?: boolean }) {
  const meta = STATUS_META[status]
  return (
    <span className={`badge ${meta.className}`}>
      <span className="dot" aria-hidden="true" />
      {compact ? meta.label.split(' ')[0] : meta.label}
    </span>
  )
}
