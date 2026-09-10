import { useMemo, useState } from 'react'

function WhatsAppIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.95.52 3.85 1.5 5.52L2 22l4.8-1.56a9.9 9.9 0 0 0 5.24 1.48h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.76 14.16c-.24.68-1.4 1.25-1.93 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.16-4.93-4.35-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09.99-2.38.26-.29.57-.36.76-.36h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.38-.43.51-.14.14-.29.29-.12.56.17.28.75 1.23 1.61 1.99 1.11.98 2.04 1.28 2.33 1.42.28.14.45.12.61-.07.17-.19.71-.82.9-1.1.19-.28.38-.23.64-.14.26.1 1.66.78 1.95.92.28.14.47.21.54.33.07.12.07.68-.17 1.36z"
      />
    </svg>
  )
}

/** Teléfono + botón de ícono (sin texto de marca). */
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
          title="Abrir chat"
          aria-label="Abrir chat de mensajería"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            flex: '0 0 auto',
            width: 34,
            height: 34,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#25D366',
            borderRadius: 8,
            color: '#fff',
            textDecoration: 'none',
            opacity: hover ? 0.92 : 1,
          }}
        >
          <WhatsAppIcon />
        </a>
      ) : null}
    </div>
  )
}
