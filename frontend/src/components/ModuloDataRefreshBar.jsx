import { useEffect, useState } from 'react'

/** Indicador «Hace X min» / «Al día» — mismo criterio que Dashboard. */
export function ModuloEdadBadge({
  updatedAt,
  theme,
  busy = false,
  onRefresh,
  fontSize,
}) {
  const t = theme || {}
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (updatedAt == null) return undefined
    const iv = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(iv)
  }, [updatedAt])

  if (updatedAt == null) return null

  const elapsedMin = Math.floor((now - updatedAt) / 60000)
  const infoColor = t.primary || '#0077B6'
  const fs = fontSize || 'var(--cc-xs)'

  return (
    <span style={{
      fontSize: fs,
      color: elapsedMin < 2 ? '#0f766e' : t.textMuted,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      padding: '3px 8px',
      borderRadius: 999,
      background: elapsedMin < 2 ? '#0f766e14' : t.bg || t.bgCard,
      border: `1px solid ${elapsedMin < 2 ? '#0f766e33' : t.border}`,
    }}
    >
      {elapsedMin < 2 ? (
        '● Al día'
      ) : elapsedMin <= 5 ? (
        `Hace ${elapsedMin} min`
      ) : (
        <>
          {`Hace ${elapsedMin} min · `}
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              color: infoColor,
              fontSize: 'inherit',
              fontWeight: 800,
              cursor: busy ? 'wait' : 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            ¿Refrescar?
          </button>
        </>
      )}
    </span>
  )
}

/** Botón Actualizar + badge de edad de datos (Dashboard). */
export default function ModuloDataRefreshBar({
  theme,
  label = 'Actualizar',
  updatedAt,
  busy = false,
  onRefresh,
  fontSize,
}) {
  const t = theme || {}
  const primary = t.primary || '#0077B6'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      padding: '4px 6px',
      borderRadius: 10,
      background: `${t.bgCard || '#fff'}cc`,
      border: `1px solid ${t.border || '#e2e8f0'}`,
    }}
    >
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        title={`Actualizar ${label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: busy ? t.bg : `${primary}12`,
          border: `1px solid ${primary}44`,
          borderRadius: 8,
          padding: '5px 12px',
          color: busy ? t.textMuted : primary,
          fontSize: fontSize || 'var(--cc-xs)',
          fontWeight: 800,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <i
          className="ti ti-refresh"
          style={{
            fontSize: '1.05rem',
            lineHeight: 1,
            animation: busy ? 'dashRefreshSpin 0.85s linear infinite' : 'none',
          }}
          aria-hidden
        />
        Actualizar
      </button>
      <ModuloEdadBadge
        updatedAt={updatedAt}
        theme={t}
        busy={busy}
        onRefresh={onRefresh}
        fontSize={fontSize}
      />
    </div>
  )
}
