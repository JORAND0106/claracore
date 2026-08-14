import { useMemo, useRef, useState, useEffect } from 'react'
import { pptoFiltrarOpcionesTramo } from './pptoTramoBusqueda'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  label: 'var(--cc-label)',
  padSm: 'var(--cc-space-2)',
}

/**
 * Autocomplete de tramos (mismo patrón visual que el buscador del Revisor de Tramos).
 * Sugerencias: `Nodo Inicio · Nodo Fin · Tramo`
 */
export default function PptoTramoAutocomplete({
  t,
  opciones = [],
  value = null,
  onSelect,
  label = 'TRAMO',
  placeholder = 'Buscar nodo inicio, nodo fin o tramo…',
  maxSuggestions = 40,
}) {
  const [texto, setTexto] = useState(value?.label || '')
  const [abierto, setAbierto] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    setTexto(value?.label || '')
  }, [value?.key, value?.label])

  useEffect(() => {
    if (!abierto) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [abierto])

  const filtradas = useMemo(
    () => pptoFiltrarOpcionesTramo(opciones, texto).slice(0, maxSuggestions),
    [opciones, texto, maxSuggestions],
  )

  return (
    <div style={{ flex: '1 1 280px' }} ref={wrapRef}>
      <div style={{ fontSize: cc.caption, fontWeight: 700, color: t.textMuted, marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: cc.label,
            pointerEvents: 'none',
          }}
        >
          🔍
        </span>
        <input
          value={texto}
          onChange={(e) => {
            const v = e.target.value
            setTexto(v)
            setAbierto(true)
            if (value && v !== value.label) onSelect?.(null)
          }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: t.inputBg,
            border: `1.5px solid ${value || texto ? t.primary : t.border}`,
            borderRadius: 10,
            padding: `${cc.padSm} 12px ${cc.padSm} 32px`,
            color: t.text,
            fontSize: cc.sm,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {value && (
          <button
            type="button"
            title="Limpiar"
            onClick={() => {
              setTexto('')
              onSelect?.(null)
              setAbierto(false)
            }}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: t.textMuted,
              cursor: 'pointer',
              fontSize: cc.sm,
              padding: 4,
            }}
          >
            ✕
          </button>
        )}
        {abierto && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 20,
              marginTop: 4,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              maxHeight: 240,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            {filtradas.length === 0 ? (
              <div style={{ padding: '12px 14px', color: t.textMuted, fontSize: cc.sm, fontStyle: 'italic' }}>
                Sin coincidencias
              </div>
            ) : (
              filtradas.map((op) => {
                const activo = value?.key === op.key
                return (
                  <div
                    key={op.key}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect?.(op)
                      setTexto(op.label)
                      setAbierto(false)
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${t.border}`,
                      background: activo ? t.primary + '14' : t.bg,
                      color: t.text,
                      fontSize: cc.sm,
                      fontWeight: activo ? 700 : 600,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = t.primary + '0D'
                      e.currentTarget.style.borderLeft = `3px solid ${t.primary}`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = activo ? t.primary + '14' : t.bg
                      e.currentTarget.style.borderLeft = 'none'
                    }}
                  >
                    {op.label}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
