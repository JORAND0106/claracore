import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../apiBase'
import { contabGet, contabSend } from './contabilidadApi'
import { compressImageForSoporte } from './contabilidadImageCompress'
import { FieldLabel, TX_FIELD_HINTS } from './ContabilidadFieldLabel'
import SoportePreviewModal from './SoportePreviewModal'
import { fmtCOP } from './contabilidadUi'

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo: 'ingreso',
  valor_bruto: '',
  retencion_fuente_tasa: '0',
  retencion_fuente_valor: '0',
  iva_tasa: '0.19',
  iva_valor: '0',
  categoria_id: '',
  centro_costo_tipo: 'empresa',
  contrato_id: '',
  fuente_ingreso: 'licenciamiento',
  notas: '',
}

export default function ContabilidadTransacciones({ t, token, esDeveloper }) {
  const [items, setItems] = useState([])
  const [categorias, setCategorias] = useState([])
  const [contratos, setContratos] = useState([])
  const [ordenesPendientes, setOrdenesPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)

  const cerrarPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({ open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null })
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const abrirPreview = async (tx) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true,
      loading: true,
      error: '',
      nombre: tx.soporte_nombre_archivo || 'Soporte',
      mime: tx.soporte_mime_type || '',
      blobUrl: null,
    })
    try {
      const r = await fetch(`${API_BASE}/contabilidad/transacciones/${tx.id}/soporte`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('No se pudo cargar el soporte')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreview((p) => ({
        ...p,
        loading: false,
        blobUrl: url,
        mime: tx.soporte_mime_type || blob.type || '',
      }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error al cargar' }))
    }
  }

  const descargarPreview = () => {
    if (!preview.blobUrl || !preview.nombre) return
    const a = document.createElement('a')
    a.href = preview.blobUrl
    a.download = preview.nombre
    a.click()
  }

  const catsIngreso = useMemo(() => categorias.filter((c) => c.tipo === 'ingreso'), [categorias])
  const catsEgreso = useMemo(() => categorias.filter((c) => c.tipo === 'egreso'), [categorias])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tx, cat, cont, ord] = await Promise.all([
        contabGet('/transacciones', token, { estado: 'activa', limit: 500, tipo: filtroTipo || undefined }),
        contabGet('/categorias', token),
        contabGet('/contratos', token),
        contabGet('/ordenes-pago/pendientes', token),
      ])
      setItems(tx.items || [])
      setCategorias(cat.items || [])
      setContratos(cont.items || [])
      setOrdenesPendientes(ord.items || [])
    } catch (e) {
      setError(e.message || 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [token, filtroTipo])

  useEffect(() => { cargar() }, [cargar])

  const abrirNueva = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, categoria_id: catsIngreso[0]?.id || '' })
    setShowForm(true)
  }

  const abrirEditar = (tx) => {
    setEditId(tx.id)
    setForm({
      fecha: tx.fecha,
      tipo: tx.tipo,
      valor_bruto: String(tx.valor_bruto ?? ''),
      retencion_fuente_tasa: String(tx.retencion_fuente_tasa ?? 0),
      retencion_fuente_valor: String(tx.retencion_fuente_valor ?? 0),
      iva_tasa: String(tx.iva_tasa ?? 0),
      iva_valor: String(tx.iva_valor ?? 0),
      categoria_id: String(tx.categoria_id ?? ''),
      centro_costo_tipo: tx.centro_costo_tipo || 'empresa',
      contrato_id: tx.contrato_id ? String(tx.contrato_id) : '',
      fuente_ingreso: tx.fuente_ingreso || 'licenciamiento',
      notas: tx.notas || '',
    })
    setShowForm(true)
  }

  const payloadFromForm = () => ({
    fecha: form.fecha,
    tipo: form.tipo,
    valor_bruto: Number(form.valor_bruto) || 0,
    retencion_fuente_tasa: Number(form.retencion_fuente_tasa) || 0,
    retencion_fuente_valor: Number(form.retencion_fuente_valor) || 0,
    iva_tasa: Number(form.iva_tasa) || 0,
    iva_valor: Number(form.iva_valor) || 0,
    categoria_id: Number(form.categoria_id),
    centro_costo_tipo: form.centro_costo_tipo,
    contrato_id: form.centro_costo_tipo === 'contrato' ? Number(form.contrato_id) : null,
    fuente_ingreso: form.tipo === 'ingreso' ? form.fuente_ingreso : null,
    notas: form.notas || null,
  })

  const guardar = async () => {
    setBusy(true)
    setError('')
    try {
      if (editId) {
        await contabSend(`/transacciones/${editId}`, token, { method: 'PATCH', body: payloadFromForm() })
      } else {
        await contabSend('/transacciones', token, { body: payloadFromForm() })
      }
      setShowForm(false)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const anular = async (id) => {
    if (!window.confirm('¿Anular esta transacción?')) return
    setBusy(true)
    try {
      await contabSend(`/transacciones/${id}/anular`, token, { method: 'POST' })
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const desdeOrden = async (ordenId) => {
    setBusy(true)
    try {
      await contabSend(`/transacciones/desde-orden/${ordenId}`, token, { body: {} })
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const subirSoporte = async (txId, file) => {
    if (!file) return
    setBusy(true)
    try {
      const prepared = await compressImageForSoporte(file)
      const fd = new FormData()
      fd.append('archivo', prepared)
      await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const Field = ({ name, label, children }) => (
    <label>
      <span style={lbl}>
        <FieldLabel label={label} hint={TX_FIELD_HINTS[name]} t={t} />
      </span>
      {children}
    </label>
  )

  const inp = { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', color: t.text, fontSize: 'var(--cc-sm)', width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 4, display: 'block' }
  const btn = (primary) => ({
    background: primary ? t.primary : 'transparent',
    color: primary ? '#fff' : t.primary,
    border: primary ? 'none' : `1.5px solid ${t.primary}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  })

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button type="button" style={btn(true)} onClick={abrirNueva}>+ Nueva transacción</button>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        <button type="button" style={btn(false)} onClick={cargar}>↻ Actualizar</button>
      </div>

      {ordenesPendientes.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 8 }}>Órdenes facturadas sin vincular ({ordenesPendientes.length})</div>
          {ordenesPendientes.slice(0, 5).map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)' }}>
              <span style={{ color: t.text }}>
                Corte #{o.numero_corte} · {fmtCOP(o.subtotal)} + IVA {fmtCOP(o.iva_valor)}
                {o.contrato?.numero ? ` · ${o.contrato.numero}` : ''}
              </span>
              <button type="button" style={btn(true)} disabled={busy} onClick={() => desdeOrden(o.id)}>Crear ingreso</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#EF4444', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>}

      {showForm && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.primary}44`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: t.primary }}>{editId ? 'Editar transacción' : 'Nueva transacción'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <Field name="fecha" label="Fecha"><input type="date" style={inp} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field>
            <Field name="tipo" label="Tipo">
              <select style={inp} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, categoria_id: '' })}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </Field>
            <Field name="valor_bruto" label="Valor bruto"><input type="number" min="0" step="0.01" style={inp} value={form.valor_bruto} onChange={(e) => setForm({ ...form, valor_bruto: e.target.value })} /></Field>
            <Field name="retencion_fuente_valor" label="Retención valor"><input type="number" min="0" step="0.01" style={inp} value={form.retencion_fuente_valor} onChange={(e) => setForm({ ...form, retencion_fuente_valor: e.target.value })} /></Field>
            <Field name="iva_tasa" label="IVA tasa"><input type="number" min="0" step="0.0001" style={inp} value={form.iva_tasa} onChange={(e) => setForm({ ...form, iva_tasa: e.target.value })} /></Field>
            <Field name="iva_valor" label="IVA valor"><input type="number" min="0" step="0.01" style={inp} value={form.iva_valor} onChange={(e) => setForm({ ...form, iva_valor: e.target.value })} /></Field>
            <Field name="categoria" label="Categoría">
              <select style={inp} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">—</option>
                {(form.tipo === 'ingreso' ? catsIngreso : catsEgreso).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            <Field name="centro_costo_tipo" label="Centro de costo">
              <select style={inp} value={form.centro_costo_tipo} onChange={(e) => setForm({ ...form, centro_costo_tipo: e.target.value })}>
                <option value="empresa">Empresa general</option>
                <option value="contrato">Contrato</option>
              </select>
            </Field>
            {form.centro_costo_tipo === 'contrato' && (
              <Field name="contrato" label="Contrato">
                <select style={inp} value={form.contrato_id} onChange={(e) => setForm({ ...form, contrato_id: e.target.value })}>
                  <option value="">—</option>
                  {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
                </select>
              </Field>
            )}
            {form.tipo === 'ingreso' && (
              <Field name="fuente_ingreso" label="Fuente ingreso">
                <select style={inp} value={form.fuente_ingreso} onChange={(e) => setForm({ ...form, fuente_ingreso: e.target.value })}>
                  <option value="licenciamiento">Licenciamiento</option>
                  <option value="servicios">Servicios</option>
                </select>
              </Field>
            )}
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span style={lbl}><FieldLabel label="Notas" hint={TX_FIELD_HINTS.notas} t={t} /></span>
            <textarea style={{ ...inp, minHeight: 60 }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={btn(true)} disabled={busy} onClick={guardar}>{editId ? 'Guardar' : 'Crear'}</button>
            <button type="button" style={btn(false)} onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ background: t.primary + '18', color: t.text }}>
                {['Fecha', 'Tipo', 'Bruto', 'IVA', 'Neto', 'Categoría', 'Centro', 'Origen', 'Soporte', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: '8px' }}>{tx.fecha}</td>
                  <td style={{ padding: '8px', color: tx.tipo === 'ingreso' ? '#10B981' : '#EF4444', fontWeight: 600 }}>{tx.tipo}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.valor_bruto)}</td>
                  <td style={{ padding: '8px' }}>{fmtCOP(tx.iva_valor)}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{fmtCOP(tx.valor_neto)}</td>
                  <td style={{ padding: '8px' }}>{tx.categoria?.nombre || '—'}</td>
                  <td style={{ padding: '8px' }}>{tx.contrato?.numero || (tx.centro_costo_tipo === 'empresa' ? 'Empresa' : '—')}</td>
                  <td style={{ padding: '8px' }}>{tx.origen}</td>
                  <td style={{ padding: '8px' }}>
                    {tx.soporte_nombre_archivo ? (
                      <button
                        type="button"
                        title="Ver soporte"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.primary, padding: 0 }}
                        onClick={() => abrirPreview(tx)}
                      >📎</button>
                    ) : (
                      <label style={{ cursor: 'pointer', color: t.textMuted }}>
                        📤<input type="file" accept=".pdf,image/*" hidden onChange={(e) => subirSoporte(tx.id, e.target.files?.[0])} />
                      </label>
                    )}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', marginRight: 4 }} onClick={() => abrirEditar(tx)}>✎</button>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', color: '#EF4444', borderColor: '#EF4444' }} onClick={() => anular(tx.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Sin transacciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <SoportePreviewModal
        t={t}
        open={preview.open}
        loading={preview.loading}
        error={preview.error}
        nombre={preview.nombre}
        mime={preview.mime}
        blobUrl={preview.blobUrl}
        onClose={cerrarPreview}
        onDownload={descargarPreview}
      />
    </div>
  )
}
