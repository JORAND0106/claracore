import { useCallback, useEffect, useRef, useState } from 'react'

function contactsIncomplete(v) {
  if (!v) return true
  return !(
    String(v.nit || '').trim()
    && String(v.contacto_email || '').trim()
    && String(v.contacto_nombre || '').trim()
    && String(v.contacto_telefono || '').trim()
  )
}

function pickPayload(p) {
  return {
    proveedor_id: p.id,
    razon_social: p.razon_social || '',
    nit: p.nit || '',
    contacto_email: p.contacto_email || '',
    contacto_nombre: p.contacto_nombre || '',
    contacto_telefono: p.contacto_telefono || '',
  }
}

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
  const enrichKeyRef = useRef('')

  useEffect(() => {
    setQuery(value?.razon_social || '')
  }, [value?.razon_social, value?.proveedor_id])

  const search = useCallback((q) => {
    if (!api) return
    api.searchProveedores(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  useEffect(() => {
    if (open) search(query)
  }, [open, search, query])

  // Si ya hay razón social (o id) pero faltan contactos, completar el bloque desde el directorio.
  useEffect(() => {
    if (!api || disabled || !onChange) return
    const razon = String(value?.razon_social || '').trim()
    const pid = value?.proveedor_id
    if (!razon && !pid) return
    if (!contactsIncomplete(value)) return
    const key = `${pid || ''}|${razon.toLowerCase()}|${String(value?.nit || '').trim()}`
    if (enrichKeyRef.current === key) return
    enrichKeyRef.current = key
    let cancelled = false
    api.searchProveedores(String(value?.nit || razon).trim(), 25)
      .then((rows) => {
        if (cancelled || !Array.isArray(rows) || !rows.length) return
        const nameKey = razon.toLowerCase()
        const nitKey = String(value?.nit || '').trim()
        const match = rows.find((p) => String(p.id) === String(pid))
          || rows.find((p) => nitKey && String(p.nit || '').trim() === nitKey)
          || rows.find((p) => nameKey && String(p.razon_social || '').trim().toLowerCase() === nameKey)
          || null
        if (!match) return
        onChange(pickPayload(match))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [
    api,
    disabled,
    onChange,
    value?.proveedor_id,
    value?.razon_social,
    value?.nit,
    value?.contacto_email,
    value?.contacto_nombre,
    value?.contacto_telefono,
  ])

  const pick = (p) => {
    onChange?.(pickPayload(p))
    setQuery(p.razon_social || '')
    setOpen(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    enrichKeyRef.current = ''
    onChange?.({
      proveedor_id: '',
      razon_social: v,
      nit: '',
      contacto_email: '',
      contacto_nombre: '',
      contacto_telefono: '',
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
