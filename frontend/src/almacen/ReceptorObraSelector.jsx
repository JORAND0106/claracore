import { useCallback, useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function ReceptorObraSelector({ value, onChange, disabled }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  const search = useCallback((q) => {
    api.searchUsuariosReceptorObra(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  useEffect(() => {
    if (value?.label) setQuery(value.label)
  }, [value?.label])

  useEffect(() => {
    search('')
  }, [search])

  const pick = (u) => {
    onChange?.({ id: u.id, label: u.label })
    setQuery(u.label)
    setOpen(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    if (value?.id && v === value.label) return
    onChange?.(null)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  const onBlur = () => {
    setTimeout(() => {
      setOpen(false)
      if (!value?.id && query.trim()) {
        const exact = options.find(
          (o) => o.label?.toLowerCase() === query.trim().toLowerCase(),
        )
        if (exact) pick(exact)
      }
    }, 180)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={ui.input}
        value={query}
        disabled={disabled}
        placeholder="Buscar usuario operativo o contratista…"
        onChange={onInput}
        onFocus={() => { setOpen(true); search(query) }}
        onBlur={onBlur}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute',
          zIndex: 20,
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: ui.card?.background || '#fff',
          border: `1px solid ${ui.border || '#e2e8f0'}`,
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 220,
          overflow: 'auto',
        }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 'none',
                background: value?.id === o.id ? ui.accentSoft : 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
            >
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              {o.rol_nombre && (
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{o.rol_nombre}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
