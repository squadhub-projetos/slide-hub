/** Fundo vivo e discreto: gradientes radiais, grid técnico, ruído e luzes lentas. */
export function Background() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-glow a" />
      <div className="backdrop-glow b" />
    </div>
  )
}
