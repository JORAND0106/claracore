import { useCallback, useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function ProveedorSelector({
  value,
  onChange,
  insumoId,
  valorUnitario,
  onValorUnitarioChange,
  disabled,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [historial, setHistorial] = useState([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ razon_social: '', nit: '' })
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  const search = useCallback((q) => {
    api.searchProveedores(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  useEffect(() => {
    if (value?.razon_social) setQuery(value.razon_social)
  }, [value?.razon_social])

  useEffect(() => {
    if (insumoId) {
      api.listPreciosInsumoProveedor(insumoId).then(setHistorial).catch(() => setHistorial([]))
    } else {
      setHistorial([])
    }
  }, [api, insumoId])

  const pick = (prov, precio) => {
    onChange?.({
      proveedor_id: prov.id,
      razon_social: prov.razon_social,
      nit: prov.nit,
    })
    setQuery(prov.razon_social)
    if (precio != null && onValorUnitarioChange) onValorUnitarioChange(String(precio))
    setOpen(false)
    setCreating(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    onChange?.({ proveedor_id: null, razon_social: v, nit: value?.nit || '' })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  const crearNuevo = async () => {
    if (!newForm.razon_social.trim() || !newForm.nit.trim()) return
    setBusy(true)
    try {
      const created = await api.createProveedor({
        razon_social: newForm.razon_social.trim(),
        nit: newForm.nit.trim(),
      })
      pick(created, valorUnitario ? Number(valorUnitario) : null)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showCreate = open && query.trim() && !options.some((o) => o.razon_social?.toLowerCase() === query.trim().toLowerCase())

  return (
    <div>
      <AlmacenFieldLabel
        icon="🏢"
        label="Proveedor"
        ayuda="Busque proveedores ya registrados o cree uno nuevo con razón social y NIT."
      />
      <input
        style={ui.input}
        value={query}
        onChange={onInput}
        onFocus={() => { setOpen(true); search(query) }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        disabled={disabled}
        placeholder="Razón social o NIT…"
      />
      {value?.nit && (
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>NIT: {value.nit}</div>
      )}

      {historial.length > 0 && !disabled && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 4 }}>Precios anteriores para este insumo</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {historial.slice(0, 5).map((h) => (
              <button
                key={`${h.proveedor_id}-${h.created_at}`}
                type="button"
                style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }}
                onClick={() => pick({ id: h.proveedor_id, razon_social: h.razon_social, nit: h.nit }, h.precio_venta)}
              >
                {h.razon_social?.slice(0, 20)} · {fmtMoney(h.precio_venta)}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && !disabled && (
        <div style={{
          marginTop: 4,
          border: `1px solid ${ui.textMuted}44`,
          borderRadius: 8,
          background: '#fff',
          maxHeight: 160,
          overflowY: 'auto',
        }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
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
              }}
            >
              <div style={{ fontWeight: 600 }}>{o.razon_social}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>NIT {o.nit}</div>
            </button>
          ))}
          {showCreate && !creating && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setCreating(true)
                setNewForm((f) => ({ ...f, razon_social: query.trim() }))
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                background: `${ui.accentSoft}`,
                color: ui.accent,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
            >
              + Crear proveedor «{query.trim()}»
            </button>
          )}
        </div>
      )}

      {creating && (
        <div style={{ marginTop: 8, padding: 10, border: `1px dashed ${ui.textMuted}66`, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>Nuevo proveedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={{ ...ui.input, gridColumn: '1 / -1' }} placeholder="Razón social" value={newForm.razon_social} onChange={(e) => setNewForm((f) => ({ ...f, razon_social: e.target.value }))} />
            <input style={ui.input} placeholder="NIT" value={newForm.nit} onChange={(e) => setNewForm((f) => ({ ...f, nit: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={ui.btnPrimary} disabled={busy} onClick={crearNuevo}>Guardar proveedor</button>
            <button type="button" style={ui.btnSecondary} onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
