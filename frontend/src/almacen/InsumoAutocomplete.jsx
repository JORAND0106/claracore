import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlmacenFieldLabel, fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

const IMPUESTO_PRESETS = [
  { nombre: 'IVA', tipo: 'porcentaje', valor: 19 },
  { nombre: 'INC', tipo: 'porcentaje', valor: 8 },
  { nombre: 'ICUI', tipo: 'porcentaje', valor: 0 },
]

function computeTotal(costoBase, impuestos) {
  const base = Number(costoBase) || 0
  let total = base
  for (const imp of impuestos || []) {
    const v = Number(imp.valor) || 0
    if (imp.tipo === 'valor') total += v
    else total += base * (v / 100)
  }
  return Math.round(total * 100) / 100
}

export default function InsumoAutocomplete({ value, onChange, disabled }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState({
    codigo: '',
    descripcion: '',
    unidad: 'UND',
    costo_base: '',
    impuestos: [],
  })
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  const totalPreview = useMemo(
    () => computeTotal(newForm.costo_base, newForm.impuestos),
    [newForm.costo_base, newForm.impuestos],
  )

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
      valor_compra_referencia: opt.valor_compra_referencia,
      costo_base: opt.costo_base,
      impuestos: opt.impuestos,
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

  const addImpuesto = (preset) => {
    setNewForm((f) => ({
      ...f,
      impuestos: [...f.impuestos, { ...preset, id: Date.now() + Math.random() }],
    }))
  }

  const updateImpuesto = (idx, patch) => {
    setNewForm((f) => ({
      ...f,
      impuestos: f.impuestos.map((imp, i) => (i === idx ? { ...imp, ...patch } : imp)),
    }))
  }

  const removeImpuesto = (idx) => {
    setNewForm((f) => ({
      ...f,
      impuestos: f.impuestos.filter((_, i) => i !== idx),
    }))
  }

  const crearNuevo = async () => {
    if (!newForm.codigo.trim() || !newForm.descripcion.trim()) return
    if (newForm.costo_base === '' || Number(newForm.costo_base) < 0) {
      window.alert('Indique el costo base del insumo.')
      return
    }
    setBusy(true)
    try {
      const created = await api.createInsumo({
        codigo: newForm.codigo.trim(),
        descripcion: newForm.descripcion.trim(),
        unidad: newForm.unidad || 'UND',
        costo_base: Number(newForm.costo_base),
        impuestos: newForm.impuestos.map(({ nombre, tipo, valor }) => ({ nombre, tipo, valor: Number(valor) || 0 })),
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
        ayuda="Busque en el listado de precios o en insumos registrados. Si no existe, créelo aquí con costo e impuestos."
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
          Valor unitario (costo + impuestos): {fmtMoney(value.valor_compra_referencia)}
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
            <input style={ui.input} placeholder="Código *" value={newForm.codigo} onChange={(e) => setNewForm((f) => ({ ...f, codigo: e.target.value }))} />
            <input style={ui.input} placeholder="Unidad" value={newForm.unidad} onChange={(e) => setNewForm((f) => ({ ...f, unidad: e.target.value }))} />
            <input style={{ ...ui.input, gridColumn: '1 / -1' }} placeholder="Descripción *" value={newForm.descripcion} onChange={(e) => setNewForm((f) => ({ ...f, descripcion: e.target.value }))} />
            <input style={ui.input} type="number" min="0" step="any" placeholder="Costo base *" value={newForm.costo_base} onChange={(e) => setNewForm((f) => ({ ...f, costo_base: e.target.value }))} />
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--cc-sm)', fontWeight: 600 }}>
              Total: {fmtMoney(totalPreview)}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, marginBottom: 6 }}>Impuestos</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {IMPUESTO_PRESETS.map((p) => (
                <button key={p.nombre} type="button" style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }} onClick={() => addImpuesto(p)}>
                  + {p.nombre}
                </button>
              ))}
              <button type="button" style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }} onClick={() => addImpuesto({ nombre: 'Otro', tipo: 'porcentaje', valor: 0 })}>
                + Otro
              </button>
            </div>
            {newForm.impuestos.length === 0 ? (
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin impuestos adicionales (total = costo base).</div>
            ) : (
              newForm.impuestos.map((imp, idx) => (
                <div key={imp.id ?? idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 32px', gap: 6, marginBottom: 6 }}>
                  <input style={ui.input} placeholder="Nombre" value={imp.nombre} onChange={(e) => updateImpuesto(idx, { nombre: e.target.value })} />
                  <select style={ui.input} value={imp.tipo} onChange={(e) => updateImpuesto(idx, { tipo: e.target.value })}>
                    <option value="porcentaje">%</option>
                    <option value="valor">$ fijo</option>
                  </select>
                  <input style={ui.input} type="number" min="0" step="any" value={imp.valor} onChange={(e) => updateImpuesto(idx, { valor: e.target.value })} />
                  <button type="button" style={{ ...ui.btnSecondary, padding: 0 }} onClick={() => removeImpuesto(idx)} title="Quitar">✕</button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={ui.btnPrimary} disabled={busy} onClick={crearNuevo}>Guardar y seleccionar</button>
            <button type="button" style={ui.btnSecondary} onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
