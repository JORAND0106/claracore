/**
 * Ícono SVG original — búho amigable a color.
 * Colores fijos (no dependen del tema) para nitidez en Claro/Oscuro/Auto/Descansar.
 */
export default function BlocNotasOwlIcon({ size = 22, title }) {
  const s = Number(size) || 22
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      {/* cuerpo */}
      <ellipse cx="32" cy="38" rx="20" ry="18" fill="#7C5C3B" />
      <ellipse cx="32" cy="40" rx="14" ry="12" fill="#C4A484" />
      {/* cabeza */}
      <circle cx="32" cy="24" r="16" fill="#8B6914" />
      {/* orejas */}
      <path d="M16 18 L12 6 L24 14 Z" fill="#8B6914" />
      <path d="M48 18 L52 6 L40 14 Z" fill="#8B6914" />
      <path d="M17 16 L14 9 L22 14 Z" fill="#E8C547" />
      <path d="M47 16 L50 9 L42 14 Z" fill="#E8C547" />
      {/* ojos */}
      <circle cx="25" cy="24" r="7" fill="#FFF8E7" />
      <circle cx="39" cy="24" r="7" fill="#FFF8E7" />
      <circle cx="25" cy="24" r="3.5" fill="#1E3A5F" />
      <circle cx="39" cy="24" r="3.5" fill="#1E3A5F" />
      <circle cx="23.8" cy="22.8" r="1.2" fill="#FFFFFF" />
      <circle cx="37.8" cy="22.8" r="1.2" fill="#FFFFFF" />
      {/* pico */}
      <path d="M32 27 L28 32 L36 32 Z" fill="#F4A261" />
      {/* pecho plumas */}
      <path d="M26 40 Q32 36 38 40" fill="none" stroke="#A67C52" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M27 45 Q32 41 37 45" fill="none" stroke="#A67C52" strokeWidth="1.4" strokeLinecap="round" />
      {/* patitas */}
      <path d="M26 54 L24 60 M26 54 L28 60 M26 54 L26 60" stroke="#E76F51" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 54 L36 60 M38 54 L40 60 M38 54 L38 60" stroke="#E76F51" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
