import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actions?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={26} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  )
}
