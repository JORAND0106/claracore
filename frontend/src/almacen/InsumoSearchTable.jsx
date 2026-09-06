import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Buscador predictivo de insumos del catálogo.
 * - Dropdown en portal (no queda recortado por overflow de tablas/modales).
 * - ``suggestFrom`` siembra la búsqueda con el texto del material solicitado.
 */
export default function InsumoSearchTable({
  value,
  onChange,
  disabled,
  hideLabel = false,
  inputStyle,
  suggestFrom = '',
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [catalogoVacio, setCatalogoVacio] = useState(null)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [seedApplied, setSeedApplied] = useState(false)
  const blurTimer = useRef(null)
  const inputWrapRef = useRef(null)
  const inputRef = useRef(null)

  const effectiveQuery = (() => {
    const typed = q.trim()
    if (typed) return typed
    if (!value?.label && suggestFrom?.trim() && open) return suggestFrom.trim()
    return typed
  })()

  const load = useCallback(() => {
    setLoading(true)
    setErrorMsg('')
    api.searchInsumosCatalog(effectiveQuery, 40, 0)
      .then((r) => {
        setRows(r.items || [])
        if (r.catalogo_vacio != null) setCatalogoVacio(!!r.catalogo_vacio)
      })
      .catch((e) => {
        setRows([])
        setCatalogoVacio(null)
        setErrorMsg(e?.message || 'No se pudo cargar el catálogo de insumos.')
      })
      .finally(() => setLoading(false))
  }, [api, effectiveQuery])

  useEffect(() => {
    if (value?.label) {
      setQ(value.label)
      setSeedApplied(true)
    }
  }, [value?.label])

  useEffect(() => {
    if (!open) return
    if (!seedApplied && !value?.label && suggestFrom?.trim() && !q.trim()) {
      setQ(suggestFrom.trim())
      setSeedApplied(true)
    }
  }, [open, seedApplied, suggestFrom, value?.label, q])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(load, 180)
    return () => clearTimeout(t)
  }, [load, open, effectiveQuery])

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current || inputWrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 280),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return undefined
    }
    updateMenuPos()
    const onScroll = () => updateMenuPos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updateMenuPos, rows.length, loading])

  const pick = (row) => {
    const tienePrecio = row.tiene_precio_compra === true
    onChange?.({
      insumo_id: row.insumo_id || row.id || null,
      listado_precio_id: null,
      label: row.label || `${row.codigo} — ${row.descripcion}`,
      codigo: row.codigo,
      descripcion: row.descripcion,
      unidad: row.unidad,
      valor_compra_referencia: tienePrecio ? (row.costo_total ?? row.valor_compra_referencia) : null,
      tiene_precio_compra: tienePrecio,
      proveedor_nombre: row.proveedor_nombre,
    })
    setQ(row.label || `${row.codigo} — ${row.descripcion}`)
    setOpen(false)
  }

  const sinCoincidencias = open && !loading && !catalogoVacio && effectiveQuery.length >= 1 && rows.length === 0 && !errorMsg

  const dropdown = open && !disabled && !catalogoVacio && menuPos && typeof document !== 'undefined'
    ? createPortal(
      <div
        data-testid="insumo-search-dropdown"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          zIndex: 100080,
          maxHeight: 260,
          overflowY: 'auto',
          background: ui.card?.background || 'var(--cc-almacen-bg-card, #fff)',
          color: ui.text,
          border: `1px solid ${ui.textMuted}44`,
          borderRadius: 6,
          boxShadow: '0 8px 24px #0003',
        }}
      >
        {loading ? (
          <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Buscando…</div>
        ) : errorMsg ? (
          <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: '#991b1b' }}>{errorMsg}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            {effectiveQuery ? 'Sin coincidencias relevantes en el catálogo' : 'Escriba para buscar en el catálogo'}
          </div>
        ) : rows.map((r) => {
          const key = `ai-${r.insumo_id || r.id}`
          return (
            <button
              key={key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                border: 'none',
                borderBottom: `1px solid ${ui.textMuted}22`,
                background: 'transparent',
                color: ui.text,
                cursor: 'pointer',
                fontSize: 'var(--cc-xs)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.codigo} — {r.descripcion}</div>
              <div style={{ color: ui.textMuted, marginTop: 1 }}>
                {[r.proveedor_nombre !== '—' ? r.proveedor_nombre : null, r.unidad].filter(Boolean).join(' · ')}
                {r.tiene_precio_compra === false && (
                  <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· sin precio en catálogo</span>
                )}
              </div>
            </button>
          )
        })}
      </div>,
      document.body,
    )
    : null

  return (
    <div ref={inputWrapRef} style={{ position: 'relative', minWidth: 0, width: '100%' }}>
      {!hideLabel && (
        <AlmacenFieldLabel
          icon="📦"
          label="Insumo"
          compact
          ayuda="Solo insumos del catálogo administrativo. Si está vacío, cargue insumos en Panel admin → Catálogo de insumos."
        />
      )}
      <input
        ref={inputRef}
        style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)', width: '100%', boxSizing: 'border-box', ...(inputStyle || {}) }}
        placeholder={catalogoVacio ? 'Catálogo vacío — no hay insumos disponibles' : 'Código, descripción o proveedor…'}
        value={q}
        disabled={disabled || catalogoVacio}
        title={q || 'Insumo del catálogo'}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setSeedApplied(true)
          if (!e.target.value.trim()) onChange?.(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          clearTimeout(blurTimer.current)
          blurTimer.current = setTimeout(() => setOpen(false), 160)
        }}
      />

      {catalogoVacio && (
        <div style={{
          marginTop: 4,
          padding: '8px 10px',
          borderRadius: 6,
          background: '#78350f18',
          border: '1px solid #78350f55',
          fontSize: 'var(--cc-xs)',
        }}
        >
          No hay insumos en el catálogo. El administrador debe cargarlos en
          {' '}
          <strong>Panel administrativo → Catálogo de insumos</strong>
          {' '}
          (manual o importación CSV) antes de poder solicitarlos aquí.
        </div>
      )}

      {value?.label && !open && (
        <button
          type="button"
          style={{
            ...ui.btnSecondary,
            marginTop: 4,
            padding: '2px 8px',
            fontSize: 'var(--cc-xs)',
          }}
          disabled={disabled}
          onClick={() => {
            onChange?.(null)
            setQ('')
            setSeedApplied(false)
          }}
        >
          Cambiar insumo
        </button>
      )}

      {dropdown}

      {sinCoincidencias && (
        <div style={{
          marginTop: 4,
          padding: '6px 8px',
          borderRadius: 6,
          background: '#78350f18',
          fontSize: 'var(--cc-xs)',
          color: ui.text,
        }}
        >
          No hay coincidencias relevantes. Ajuste la búsqueda o solicite al administrador que registre el insumo en
          {' '}
          <strong>Catálogo de insumos</strong>.
        </div>
      )}
    </div>
  )
}
