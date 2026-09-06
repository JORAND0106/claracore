import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Autocompletar de N° de cotización filtrado por proveedor.
 * Requiere proveedor seleccionado; sugiere solo cotizaciones de ese proveedor.
 * Al elegir (o al salir con coincidencia exacta) dispara onPick para autocargar.
 */
export default function CatalogoCotizacionAutocomplete({
  api,
  value,
  onChange,
  onPick,
  proveedorId,
  razonSocial,
  nit,
  disabled,
  inputStyle,
  t,
  placeholder = 'Número asignado por el proveedor',
}) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const lastPicked = useRef('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const hasProveedor = !!(proveedorId || String(razonSocial || '').trim())

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 220),
    })
  }, [])

  const search = useCallback((q) => {
    if (!api) return Promise.resolve([])
    if (!(proveedorId || String(razonSocial || '').trim())) {
      setOptions([])
      return Promise.resolve([])
    }
    setLoading(true)
    return api.suggestCotizaciones({
      q: q || '',
      proveedor_id: proveedorId || undefined,
      razon_social: razonSocial || '',
      nit: nit || '',
      limit: 40,
    }).then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      setOptions(list)
      return list
    }).catch(() => {
      setOptions([])
      return []
    }).finally(() => setLoading(false))
  }, [api, proveedorId, razonSocial, nit])

  useEffect(() => {
    if (open && hasProveedor) search(value)
    if (open && !hasProveedor) setOptions([])
  }, [open, search, value, hasProveedor])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return undefined
    }
    updateMenuPos()
    const onScroll = () => updateMenuPos()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, options.length, updateMenuPos])

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
    if (!v || !api || !hasProveedor) return
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

  const showMenu = open && !disabled && hasProveedor && menuPos
  const showEmpty = showMenu && !loading && options.length === 0 && !(value || '').trim()
  const showList = showMenu && options.length > 0

  return (
    <div ref={rootRef} style={{ position: 'relative', overflow: 'visible' }}>
      <input
        ref={inputRef}
        style={{ ...inputStyle, textTransform: 'uppercase' }}
        placeholder={hasProveedor ? placeholder : 'Seleccione primero el proveedor'}
        value={value || ''}
        disabled={disabled}
        onChange={onInput}
        onFocus={() => {
          setOpen(true)
          updateMenuPos()
        }}
        onBlur={() => {
          setTimeout(() => {
            tryExactMatch(value)
            setOpen(false)
          }, 180)
        }}
        autoComplete="off"
      />
      {!hasProveedor && (
        <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>
          Elija el proveedor para ver cotizaciones existentes.
        </div>
      )}
      {(showList || showEmpty || (showMenu && loading)) && menuPos && (
        <div
          style={{
            position: 'fixed',
            zIndex: 100060,
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            maxHeight: 240,
            overflow: 'auto',
            boxShadow: t.shadow || '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {loading && options.length === 0 && (
            <div style={{ padding: '8px 10px', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
              Buscando cotizaciones…
            </div>
          )}
          {showEmpty && (
            <div style={{ padding: '8px 10px', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
              Sin cotizaciones previas para este proveedor. Digite un número nuevo.
            </div>
          )}
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
