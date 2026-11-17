/** Logo a color de Caja Menor. Distinto del módulo de Contabilidad. */
export default function CajaMenorLogo({ size = 28, title = 'Caja Menor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <rect x="6" y="22" width="52" height="36" rx="8" fill="#0E7490" />
      <rect x="12" y="28" width="40" height="24" rx="4" fill="#F0F9FF" />
      <circle cx="32" cy="40" r="8" fill="#F59E0B" />
      <circle cx="32" cy="40" r="3.2" fill="#B45309" />
      <rect x="18" y="10" width="28" height="16" rx="3" fill="#059669" />
      <rect x="28" y="10" width="8" height="8" fill="#34D399" />
    </svg>
  )
}
