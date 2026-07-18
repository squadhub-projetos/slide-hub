export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="11" fill="rgba(34,211,238,0.06)" stroke="rgba(148,163,184,0.2)" />
      <rect x="10" y="15" width="22" height="14" rx="2.5" fill="none" stroke="url(#logo-g)" strokeWidth="2.4" />
      <rect x="17" y="21" width="22" height="14" rx="2.5" fill="#070b16" stroke="#e2e8f0" strokeWidth="2.4" />
      <circle cx="39" cy="21" r="3.4" fill="url(#logo-g)" />
    </svg>
  )
}
