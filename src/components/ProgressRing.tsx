import { formatSeconds } from '../utils/time'

interface ProgressRingProps {
  /** 1 = cheio, 0 = vazio. */
  progress: number
  remaining: number
  size?: number
  caption?: string
}

/** Anel de contagem regressiva da aprovação automática. */
export function ProgressRing({ progress, remaining, size = 92, caption = 'auto-aprova' }: ProgressRingProps) {
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)
  const urgent = remaining <= 10
  const color = urgent ? 'var(--warning)' : 'var(--cyan)'

  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`Aprovação automática em ${formatSeconds(remaining)}`}
    >
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">
        <span className="ring-time" style={{ color: urgent ? 'var(--warning)' : undefined }}>
          {formatSeconds(remaining)}
        </span>
        <span className="ring-caption">{caption}</span>
      </div>
    </div>
  )
}
