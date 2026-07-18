import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useUiStore } from '../state/uiStore'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)

  return (
    <div className="toasts" role="region" aria-label="Notificações" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind]
          return (
            <motion.div
              key={toast.id}
              className={`toast ${toast.kind}`}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              layout
            >
              <Icon className="toast-icon" size={17} aria-hidden="true" />
              <div>
                <div className="toast-title">{toast.title}</div>
                {toast.message && <div className="toast-message">{toast.message}</div>}
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar notificação"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
