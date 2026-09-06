import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Autocompletar de N° de cotización filtrado por proveedor.
 * Sugiere números ya registrados para ese proveedor.
 * Al elegir (o al salir con coincidencia exacta) dispara onPick para autocargar.
 */
export default function CatalogoCotizacionAutocomplete({
  api,
  value,
  onChange,
  onPick,
  proveedorId,
  razonSocial,
  disabled,
  inputStyle,
  t,
  placeholder = 'Número asignado por el proveedor',
}) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const lastPicked = useRef('')

  const search = useCallback((q) => {
    if (!api) return Promise.resolve([])
    return api.suggestCotizaciones({
      q: q || '',
      proveedor_id: proveedorId || undefined,
      razon_social: razonSocial || '',
      limit: 20,
    }).then((rows) => {
      setOptions(rows || [])
      return rows || []
    }).catch(() => {
      setOptions([])
      return []
    })
  }, [api, proveedorId, razonSocial])

  useEffect(() => {
    if (open) search(value)
  }, [open, search, value])

  const pick = (item, { force = false } = {}) => {
    const numero = String(item.numero || '').toUpperCase()
    if (!force && lastPicked.current === numero && String(value || '').toUpperCase() === numero) {
      onChange?.(numero)
      setOpen(false)
      return
    }
    lastPicked.current = numero
    onChange?.(numero)
    onPick?.(item)
    setOpen(false)
  }

  const tryExactMatch = async (raw) => {
    const v = String(raw || '').trim().toUpperCase()
    if (!v || !api) return
    const rows = options.length
      ? options
      : await search(v)
    const exact = (rows || []).find((o) => String(o.numero || '').toUpperCase() === v)
    if (exact) pick(exact)
  }

  const onInput = (e) => {
    const v = String(e.target.value || '').toUpperCase()
    if (v !== lastPicked.current) lastPicked.current = ''
    onChange?.(v)
    setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={{ ...inputStyle, textTransform: 'uppercase' }}
        placeholder={placeholder}
        value={value || ''}
        disabled={disabled}
        onChange={onInput}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            tryExactMatch(value)
            setOpen(false)
          }, 180)
        }}
        autoComplete="off"
      />
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
          {options.map((item) => (
            <button
              key={item.numero}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item, { force: true })}
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
              <strong>{item.numero}</strong>
              <span style={{ color: t.textMuted, marginLeft: 8 }}>
                {item.usos > 1 ? `${item.usos} usos` : '1 uso'}
                {item.fecha ? ` · ${String(item.fecha).slice(0, 10)}` : ''}
                {item.has_pdf ? ' · PDF' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
