import { useEffect, useState } from 'react'

/** Indica se a aba do navegador está visível (usado para pausar o timer). */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}
