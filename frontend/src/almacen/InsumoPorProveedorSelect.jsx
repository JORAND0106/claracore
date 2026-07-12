import { useCallback, useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function InsumoPorProveedorSelect({
  proveedorId,
  value,
  onChange,
  disabled,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  const load = useCallback(() => {
    if (!proveedorId) {
      setRows([])
      return
    }
    setLoading(true)
    api.listInsumosPorProveedor(proveedorId, q)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [api, proveedorId, q])

  useEffect(() => {
    if (value?.label) setQ(value.label)
  }, [value?.label])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 200)
    return () => clearTimeout(timer.current)
  }, [load])

  const pick = (row) => {
    onChange?.({
      insumo_id: row.insumo_id || row.id,
      label: row.label || `${row.codigo} — ${row.descripcion}`,
      unidad: row.unidad,
      codigo: row.codigo,
      descripcion: row.descripcion,
    })
    setQ(row.label || row.descripcion || '')
    setOpen(false)
  }

  if (!proveedorId) {
    return (
      <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
        Seleccione primero un proveedor inscrito.
      </div>
    )
  }

  return (
    <div>
      <AlmacenFieldLabel
        icon="🧱"
        label="Insumo recibido"
        ayuda="Insumos del catálogo asociados a este proveedor."
      />
      <input
        style={ui.input}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          onChange?.(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Buscar insumo…"
      />
      {loading && (
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>Cargando…</div>
      )}
      {open && !disabled && rows.length > 0 && (
        <div style={{
          marginTop: 4,
          border: `1px solid ${ui.textMuted}44`,
          borderRadius: 8,
          maxHeight: 160,
          overflowY: 'auto',
          background: ui.card?.background || '#fff',
        }}
        >
          {rows.map((row) => (
            <button
              key={row.insumo_id || row.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(row)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderBottom: '1px solid #eee',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
                color: ui.text,
              }}
            >
              <div style={{ fontWeight: 600 }}>{row.label || row.descripcion}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{row.unidad}</div>
            </button>
          ))}
        </div>
      )}
      {open && !loading && !disabled && rows.length === 0 && q.trim() && (
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
          Sin insumos asociados a este proveedor.
        </div>
      )}
    </div>
  )
}
