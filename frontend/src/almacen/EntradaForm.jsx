import { useEffect, useRef, useState } from 'react'
import { AlmacenFieldLabel, fmtCant, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function EntradaForm({ onSaved, onCancel, permisos }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const [ocs, setOcs] = useState([])
  const [ocId, setOcId] = useState('')
  const [ocDetail, setOcDetail] = useState(null)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [lineas, setLineas] = useState({})
  const [remision, setRemision] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listOrdenesCompra().then((rows) => {
      setOcs(rows.filter((o) => o.estado !== 'anulada' && o.estado !== 'completa'))
    }).catch(() => {})
  }, [api])

  useEffect(() => {
    if (!ocId) { setOcDetail(null); return }
    api.getOrdenCompra(ocId).then((oc) => {
      setOcDetail(oc)
      const init = {}
      for (const it of oc.items || []) {
        const pend = Number(it.cantidad) - Number(it.cantidad_recibida || 0)
        if (pend > 0) {
          init[it.id] = { cantidad_recibida: pend, lote: '', fecha_vencimiento: '' }
        }
      }
      setLineas(init)
    }).catch((e) => setError(e.message))
  }, [api, ocId])

  const setLinea = (id, field, val) => {
    setLineas((p) => ({ ...p, [id]: { ...p[id], [field]: val } }))
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (f) setRemision(f)
  }

  const guardar = async () => {
    if (!ocId) { setError('Seleccione una orden de compra.'); return }
    const items = Object.entries(lineas)
      .filter(([, v]) => Number(v.cantidad_recibida) > 0)
      .map(([ociId, v]) => ({
        orden_compra_item_id: Number(ociId),
        cantidad_recibida: Number(v.cantidad_recibida),
        lote: v.lote || null,
        fecha_vencimiento: v.fecha_vencimiento || null,
      }))
    if (!items.length) { setError('Indique al menos una cantidad recibida.'); return }

    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('orden_compra_id', ocId)
      fd.append('fecha_entrada', fecha)
      fd.append('observaciones', obs)
      fd.append('items_json', JSON.stringify(items))
      if (remision) fd.append('remision', remision)
      const r = await api.createEntrada(fd)
      onSaved?.(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!permisos?.crear) {
    return (
      <div style={{ ...ui.card, color: ui.textMuted, textAlign: 'center' }}>
        No tiene permiso para registrar entradas.
      </div>
    )
  }

  return (
    <div style={ui.card}>
      <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, marginBottom: 12 }}>
        📥 Registrar entrada de material
      </div>
      <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 16 }}>
        El ingreso requiere una Orden de Compra aprobada. Adjunte la remisión del proveedor.
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <AlmacenFieldLabel
        icon="📄"
        label="Orden de compra"
        ayuda="Solo se pueden registrar entradas contra órdenes de compra aprobadas."
      />
      <select style={{ ...ui.input, marginBottom: 16 }} value={ocId} onChange={(e) => setOcId(e.target.value)}>
        <option value="">Seleccione OC…</option>
        {ocs.map((o) => (
          <option key={o.id} value={o.id}>OC #{o.numero_oc} — {o.estado}</option>
        ))}
      </select>

      {ocDetail && (
        <>
          <AlmacenFieldLabel icon="📅" label="Fecha de entrada" />
          <input style={{ ...ui.input, marginBottom: 12 }} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>Cantidades recibidas</div>
          {(ocDetail.items || []).map((it) => {
            const pend = Number(it.cantidad) - Number(it.cantidad_recibida || 0)
            if (pend <= 0) return null
            const ln = lineas[it.id] || {}
            return (
              <div key={it.id} style={{ marginBottom: 12, padding: 10, border: `1px solid ${ui.textMuted}33`, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>{it.material_descripcion}</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted }}>
                  Pendiente: {fmtCant(pend)} {it.unidad}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <AlmacenFieldLabel icon="🔢" label="Cant. recibida" />
                    <input
                      style={ui.input}
                      type="number"
                      min="0"
                      max={pend}
                      step="any"
                      value={ln.cantidad_recibida ?? ''}
                      onChange={(e) => setLinea(it.id, 'cantidad_recibida', e.target.value)}
                    />
                  </div>
                  <div>
                    <AlmacenFieldLabel icon="🏷️" label="Lote" ayuda="Opcional. Para cemento, aditivos, etc." />
                    <input style={ui.input} value={ln.lote || ''} onChange={(e) => setLinea(it.id, 'lote', e.target.value)} />
                  </div>
                  <div>
                    <AlmacenFieldLabel icon="⏳" label="Vencimiento" ayuda="Fecha de vencimiento del lote, si aplica." />
                    <input style={ui.input} type="date" value={ln.fecha_vencimiento || ''} onChange={(e) => setLinea(it.id, 'fecha_vencimiento', e.target.value)} />
                  </div>
                </div>
              </div>
            )
          })}

          <AlmacenFieldLabel
            icon="📷"
            label="Remisión del proveedor"
            ayuda="Foto o PDF de la remisión. Puede cargar archivo o tomar foto con la cámara."
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
            <button type="button" style={ui.btnSecondary} onClick={() => fileRef.current?.click()}>📁 Cargar archivo</button>
            <button type="button" style={ui.btnSecondary} onClick={() => camRef.current?.click()}>📷 Tomar foto</button>
            {remision && <span style={{ fontSize: 'var(--cc-sm)', alignSelf: 'center' }}>{remision.name}</span>}
          </div>

          <AlmacenFieldLabel icon="📝" label="Observaciones" />
          <textarea style={{ ...ui.input, minHeight: 50, marginBottom: 16 }} value={obs} onChange={(e) => setObs(e.target.value)} />
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={ui.btnPrimary} disabled={busy || !ocId} onClick={guardar}>
          {busy ? 'Registrando…' : 'Registrar entrada'}
        </button>
        <button type="button" style={ui.btnSecondary} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
