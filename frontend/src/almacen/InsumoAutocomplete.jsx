import { useCallback, useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function InsumoAutocomplete({ value, onChange, disabled }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({ codigo: '', descripcion: '', unidad: 'UND', valor_compra_referencia: '', capitulo: '', item_numero: '' })
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  const search = useCallback((q) => {
    api.searchInsumos(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  useEffect(() => {
    if (value?.label) setQuery(value.label)
  }, [value?.label])

  useEffect(() => {
    if (open) search(query)
  }, [open, search, query])

  const pick = (opt) => {
    onChange?.({
      insumo_id: opt.id || null,
      listado_precio_id: opt.listado_precio_id || null,
      label: opt.label,
      codigo: opt.codigo,
      descripcion: opt.descripcion,
      unidad: opt.unidad,
      capitulo: opt.capitulo,
      item_numero: opt.item_numero || opt.codigo,
      valor_compra_referencia: opt.valor_compra_referencia,
      origen: opt.origen,
    })
    setQuery(opt.label)
    setOpen(false)
    setCreating(false)
  }

  const onInput = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  const crearNuevo = async () => {
    if (!newForm.codigo.trim() || !newForm.descripcion.trim()) return
    setBusy(true)
    try {
      const created = await api.createInsumo({
        codigo: newForm.codigo.trim(),
        descripcion: newForm.descripcion.trim(),
        unidad: newForm.unidad || 'UND',
        valor_compra_referencia: Number(newForm.valor_compra_referencia) || 0,
        capitulo: newForm.capitulo.trim() || undefined,
        item_numero: newForm.item_numero.trim() || newForm.codigo.trim(),
      })
      pick(created)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showCreate = open && query.trim() && !options.some((o) => o.label?.toLowerCase() === query.trim().toLowerCase())

  return (
    <div>
      <AlmacenFieldLabel
        icon="📦"
        label="Insumo"
        ayuda="Busque en el listado de precios o en insumos ya registrados. Si no existe, puede crear uno nuevo."
      />
      <input
        style={ui.input}
        value={query}
        onChange={onInput}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        disabled={disabled}
        placeholder="Código o descripción…"
      />
      {value?.valor_compra_referencia != null && value.valor_compra_referencia > 0 && (
        <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
          Valor compra ref.: {fmtMoney(value.valor_compra_referencia)}
        </div>
      )}

      {open && !disabled && (
        <div style={{
          marginTop: 4,
          border: `1px solid ${ui.textMuted}44`,
          borderRadius: 8,
          background: '#fff',
          maxHeight: 200,
          overflowY: 'auto',
          zIndex: 20,
          position: 'relative',
        }}
        >
          {options.map((o) => (
            <button
              key={`${o.origen}-${o.id || o.listado_precio_id}`}
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
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                {o.unidad} · {fmtMoney(o.valor_compra_referencia)}
                {o.origen === 'listado_precios' ? ' · Listado admin' : ''}
              </div>
            </button>
          ))}
          {showCreate && !creating && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setCreating(true)
                setNewForm((f) => ({ ...f, descripcion: query.trim() }))
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
              + Crear insumo «{query.trim()}»
            </button>
          )}
        </div>
      )}

      {creating && (
        <div style={{ marginTop: 8, padding: 10, border: `1px dashed ${ui.textMuted}66`, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>Nuevo insumo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={ui.input} placeholder="Código" value={newForm.codigo} onChange={(e) => setNewForm((f) => ({ ...f, codigo: e.target.value }))} />
            <input style={ui.input} placeholder="Unidad" value={newForm.unidad} onChange={(e) => setNewForm((f) => ({ ...f, unidad: e.target.value }))} />
            <input style={{ ...ui.input, gridColumn: '1 / -1' }} placeholder="Descripción" value={newForm.descripcion} onChange={(e) => setNewForm((f) => ({ ...f, descripcion: e.target.value }))} />
            <input style={ui.input} placeholder="Capítulo presupuesto" value={newForm.capitulo} onChange={(e) => setNewForm((f) => ({ ...f, capitulo: e.target.value }))} />
            <input style={ui.input} placeholder="Ítem presupuesto" value={newForm.item_numero} onChange={(e) => setNewForm((f) => ({ ...f, item_numero: e.target.value }))} />
            <input style={ui.input} type="number" placeholder="Valor compra ref." value={newForm.valor_compra_referencia} onChange={(e) => setNewForm((f) => ({ ...f, valor_compra_referencia: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={ui.btnPrimary} disabled={busy} onClick={crearNuevo}>Guardar insumo</button>
            <button type="button" style={ui.btnSecondary} onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
