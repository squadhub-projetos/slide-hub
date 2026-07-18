import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resolveLogoLayers, type LogoLayer } from '../../services/brands/brandAssets'
import type { DesignStyle } from '../../types'

/**
 * Camada exata dos logos oficiais sobre o preview 16:9 — mesma matemática
 * usada no achatamento de exportação. Os logos nunca fazem parte da arte
 * gerada; são compostos aqui, sem distorção.
 */
export function BrandLogoOverlay({ style }: { style: DesignStyle | null }) {
  const [layers, setLayers] = useState<LogoLayer[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    if (!style) {
      setLayers([])
      return
    }
    resolveLogoLayers(style)
      .then((resolved) => {
        if (!cancelled) setLayers(resolved)
      })
      .catch(() => {
        if (!cancelled) {
          setLayers([])
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [style])

  if (!style) return null

  return (
    <div className="logo-overlay" aria-hidden="true">
      {layers.map((layer) => (
        <img
          key={layer.brandId}
          src={layer.dataUrl}
          alt=""
          draggable={false}
          style={{
            left: `${layer.x * 100}%`,
            top: `${layer.y * 100}%`,
            width: `${layer.width * 100}%`,
          }}
        />
      ))}
      {failed && style.logoRules.required && (
        <span className="logo-overlay-warning">
          <AlertTriangle size={11} /> Logo oficial indisponível
        </span>
      )}
    </div>
  )
}
