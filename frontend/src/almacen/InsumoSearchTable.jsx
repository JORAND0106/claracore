import { useCallback, useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function InsumoSearchTable({ value, onChange, disabled }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [catalogoVacio, setCatalogoVacio] = useState(null)
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    api.searchInsumosCatalog(q, 30, 0)
      .then((r) => {
        setRows(r.items || [])
        if (r.catalogo_vacio != null) setCatalogoVacio(!!r.catalogo_vacio)
      })
      .catch(() => {
        setRows([])
        setCatalogoVacio(null)
      })
      .finally(() => setLoading(false))
  }, [api, q])

  useEffect(() => {
    if (value?.label) setQ(value.label)
  }, [value?.label])

  // Cargar catálogo solo al abrir el buscador (evita round-trip al montar cada línea).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load, open, q])

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

  const sinCoincidencias = open && !loading && !catalogoVacio && q.trim().length >= 1 && rows.length === 0

  return (
    <div style={{ position: 'relative' }}>
      <AlmacenFieldLabel
        icon="📦"
        label="Insumo"
        compact
        ayuda="Solo insumos del catálogo administrativo. Si está vacío, cargue insumos en Panel admin → Catálogo de insumos."
      />
      <input
        style={{ ...ui.input, padding: '6px 8px', fontSize: 'var(--cc-sm)' }}
        placeholder={catalogoVacio ? 'Catálogo vacío — no hay insumos disponibles' : 'Código, descripción o proveedor…'}
        value={q}
        disabled={disabled || catalogoVacio}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
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
          }}
        >
          Cambiar insumo
        </button>
      )}

      {open && !disabled && !catalogoVacio && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 2,
          zIndex: 25,
          maxHeight: 140,
          overflowY: 'auto',
          background: '#fff',
          border: `1px solid ${ui.textMuted}44`,
          borderRadius: 6,
          boxShadow: '0 4px 12px #0002',
        }}
        >
          {loading ? (
            <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Buscando…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
              {q.trim() ? 'Sin coincidencias en el catálogo' : 'Escriba para buscar en el catálogo'}
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
                  borderBottom: '1px solid #eee',
                  background: 'transparent',
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
        </div>
      )}

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
          No hay coincidencias en el catálogo. Solicite al administrador que registre el insumo en
          {' '}
          <strong>Catálogo de insumos</strong>.
        </div>
      )}
    </div>
  )
}
