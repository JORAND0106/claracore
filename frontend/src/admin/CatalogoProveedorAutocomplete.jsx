import { useCallback, useEffect, useRef, useState } from 'react'

export default function CatalogoProveedorAutocomplete({
  api,
  value,
  onChange,
  disabled,
  inputStyle,
  t,
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (value?.razon_social) setQuery(value.razon_social)
  }, [value?.razon_social, value?.proveedor_id])

  const search = useCallback((q) => {
    if (!api) return
    api.searchProveedores(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  useEffect(() => {
    if (open) search(query)
  }, [open, search, query])

  const pick = (p) => {
    onChange?.({
      proveedor_id: p.id,
      razon_social: p.razon_social || '',
      nit: p.nit || '',
      contacto_email: p.contacto_email || '',
      contacto_nombre: p.contacto_nombre || '',
      contacto_telefono: p.contacto_telefono || '',
    })
    setQuery(p.razon_social || '')
    setOpen(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    onChange?.({
      proveedor_id: '',
      razon_social: v,
      nit: value?.nit || '',
      contacto_email: value?.contacto_email || '',
      contacto_nombre: value?.contacto_nombre || '',
      contacto_telefono: value?.contacto_telefono || '',
    })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle}
        placeholder="Buscar proveedor por razón social o NIT…"
        value={query}
        disabled={disabled}
        onChange={onInput}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {value?.proveedor_id && (
        <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
          Proveedor del directorio · NIT {value.nit || '—'}
        </div>
      )}
      {open && !disabled && options.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 10050,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            maxHeight: 220,
            overflow: 'auto',
            boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderBottom: `1px solid ${t.border}44`,
                background: 'transparent',
                color: t.text,
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
            >
              <strong>{p.razon_social}</strong>
              <span style={{ color: t.textMuted, marginLeft: 8 }}>NIT {p.nit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
