import { useEffect, useMemo, useRef, useState } from 'react'
import { MUNICIPIOS_COLOMBIA } from '../../data/municipiosColombia.js'

/**
 * Autocompletar sobre municipios de Colombia (Municipio, Departamento).
 */
export default function MunicipioAutocomplete({
  value = '',
  onChange,
  disabled = false,
  style,
  placeholder = 'Buscar municipio…',
  maxSuggestions = 12,
}) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    setQ(value || '')
  }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const suggestions = useMemo(() => {
    const needle = String(q || '').trim().toLowerCase()
    if (needle.length < 2) return []
    const out = []
    for (const m of MUNICIPIOS_COLOMBIA) {
      if (m.toLowerCase().includes(needle)) {
        out.push(m)
        if (out.length >= maxSuggestions) break
      }
    }
    return out
  }, [q, maxSuggestions])

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        style={style}
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value
          setQ(v)
          onChange?.(v)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 2,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'var(--cc-bg-card, #fff)',
            border: '1px solid var(--cc-border, #e2e8f0)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ(s)
                onChange?.(s)
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                padding: '7px 10px',
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
