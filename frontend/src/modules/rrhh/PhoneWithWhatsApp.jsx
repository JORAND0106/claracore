import { useMemo, useState } from 'react'

/** Teléfono + botón WhatsApp (se activa con dígitos). */
export default function PhoneWithWhatsApp({
  value = '',
  onChange,
  disabled = false,
  inputStyle,
  placeholder = 'Número de teléfono',
}) {
  const [hover, setHover] = useState(false)
  const telClean = useMemo(
    () => String(value || '').replace(/[^0-9]/g, ''),
    [value],
  )

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, width: '100%' }}>
      <input
        style={{ ...inputStyle, flex: '1 1 auto', minWidth: 0 }}
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value.replace(/[^0-9+\-\s]/g, ''))}
      />
      {telClean ? (
        <a
          href={`https://wa.me/${telClean}`}
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            flex: '0 0 auto',
            background: '#25D366',
            borderRadius: 8,
            padding: '6px 10px',
            color: '#fff',
            fontSize: 'var(--cc-sm)',
            lineHeight: 1.3,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
            opacity: hover ? 0.92 : 1,
          }}
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  )
}
