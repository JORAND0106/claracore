import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Paperclip } from 'lucide-react'
import { API_BASE } from '../apiBase'
import { contabGet, contabSend } from './contabilidadApi'
import { prepareSoporteConPeso } from './contabilidadImageCompress'
import { FieldLabel, TX_FIELD_HINTS } from './ContabilidadFieldLabel'
import SoportePreviewModal from './SoportePreviewModal'
import { fmtBytes, fmtCOP, labelPesoSoporte } from './contabilidadUi'
import { useContabilidadViewport } from './useContabilidadViewport'

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
  const { isMobile, isTablet } = useContabilidadViewport()
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
  const [soportePendiente, setSoportePendiente] = useState(null)
  const [soporteInlineInfo, setSoporteInlineInfo] = useState('')
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)
  const formRef = useRef(null)
  const cameraRef = useRef(null)
  const fileRef = useRef(null)

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

  const scrollToForm = () => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const abrirNueva = (tipoPreferido) => {
    const tipo = tipoPreferido || (isMobile ? 'egreso' : 'ingreso')
    const cats = tipo === 'egreso' ? catsEgreso : catsIngreso
    setEditId(null)
    setSoportePendiente(null)
    setForm({
      ...EMPTY_FORM,
      tipo,
      categoria_id: cats[0]?.id || '',
      iva_tasa: tipo === 'egreso' ? '0.19' : '0.19',
    })
    setShowForm(true)
    scrollToForm()
  }

  const abrirEditar = (tx) => {
    setEditId(tx.id)
    setSoportePendiente(null)
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
    scrollToForm()
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

  const onSoporteFile = async (file) => {
    if (!file) return
    try {
      const prepared = await prepareSoporteConPeso(file)
      setSoportePendiente(prepared)
    } catch {
      setSoportePendiente({
        file,
        originalBytes: file.size,
        compressedBytes: file.size,
        wasCompressed: false,
      })
    }
  }

  const guardar = async () => {
    setBusy(true)
    setError('')
    try {
      let txId = editId
      if (editId) {
        await contabSend(`/transacciones/${editId}`, token, { method: 'PATCH', body: payloadFromForm() })
      } else {
        const created = await contabSend('/transacciones', token, { body: payloadFromForm() })
        txId = created?.id
      }
      if (!editId && txId && soportePendiente?.file) {
        const fd = new FormData()
        fd.append('archivo', soportePendiente.file)
        await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      }
      setShowForm(false)
      setSoportePendiente(null)
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
    setSoporteInlineInfo('')
    try {
      const prepared = await prepareSoporteConPeso(file)
      setSoporteInlineInfo(labelPesoSoporte(prepared))
      const fd = new FormData()
      fd.append('archivo', prepared.file)
      await contabSend(`/transacciones/${txId}/soporte`, token, { method: 'POST', formData: fd })
      await cargar()
      setSoporteInlineInfo('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const Field = ({ name, label, children }) => (
    <label style={{ display: 'block' }}>
      <span style={lbl}>
        <FieldLabel label={label} hint={TX_FIELD_HINTS[name]} t={t} />
      </span>
      {children}
    </label>
  )

  const touchPad = isMobile ? '12px 14px' : '8px 10px'
  const touchMin = isMobile ? 44 : undefined
  const inp = {
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: touchPad,
    color: t.text,
    fontSize: isMobile ? '16px' : 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: touchMin,
  }
  const lbl = { fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 4, display: 'block' }
  const btn = (primary) => ({
    background: primary ? t.primary : 'transparent',
    color: primary ? '#fff' : t.primary,
    border: primary ? 'none' : `1.5px solid ${t.primary}`,
    borderRadius: 10,
    padding: isMobile ? '12px 16px' : '8px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 'var(--cc-sm)',
    minHeight: touchMin,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  })

  const formGridCols = isMobile
    ? '1fr'
    : isTablet
      ? 'repeat(2, minmax(0, 1fr))'
      : 'repeat(auto-fill, minmax(180px, 1fr))'

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center',
        position: isMobile ? 'sticky' : 'static',
        top: isMobile ? 0 : undefined,
        zIndex: isMobile ? 5 : undefined,
        background: isMobile ? t.bg : undefined,
        paddingTop: isMobile ? 4 : 0,
        paddingBottom: isMobile ? 8 : 0,
      }}>
        {isMobile ? (
          <>
            <button type="button" style={{ ...btn(true), flex: '1 1 160px' }} onClick={() => abrirNueva('egreso')}>
              + Egreso rápido
            </button>
            <button type="button" style={{ ...btn(false), flex: '0 0 auto' }} onClick={() => abrirNueva('ingreso')}>
              Ingreso
            </button>
          </>
        ) : (
          <button type="button" style={btn(true)} onClick={() => abrirNueva()}>+ Nueva transacción</button>
        )}
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ ...inp, width: isMobile ? '100%' : 'auto', flex: isMobile ? '1 1 100%' : undefined }}>
          <option value="">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        {!isMobile && (
          <button type="button" style={btn(false)} onClick={cargar}>↻ Actualizar</button>
        )}
      </div>

      {!isMobile && ordenesPendientes.length > 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 8 }}>Órdenes facturadas sin vincular ({ordenesPendientes.length})</div>
          {ordenesPendientes.slice(0, 5).map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)', flexWrap: 'wrap' }}>
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
        <div
          ref={formRef}
          style={{
            background: t.bgCard,
            border: `1px solid ${t.primary}44`,
            borderRadius: 12,
            padding: isMobile ? 14 : 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 12, color: t.primary }}>
            {editId ? 'Editar transacción' : (isMobile && form.tipo === 'egreso' ? 'Registrar egreso' : 'Nueva transacción')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: formGridCols, gap: 12 }}>
            <Field name="fecha" label="Fecha">
              <input type="date" style={inp} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field name="tipo" label="Tipo">
              <select
                style={inp}
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value
                  const cats = tipo === 'egreso' ? catsEgreso : catsIngreso
                  setForm({ ...form, tipo, categoria_id: cats[0]?.id || '' })
                }}
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </Field>
            <Field name="valor_bruto" label="Valor bruto">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                style={inp}
                value={form.valor_bruto}
                onChange={(e) => setForm({ ...form, valor_bruto: e.target.value })}
                autoFocus={isMobile && !editId}
              />
            </Field>
            {(!isMobile || form.tipo === 'ingreso') && (
              <Field name="retencion_fuente_valor" label="Retención valor">
                <input type="number" inputMode="decimal" min="0" step="0.01" style={inp} value={form.retencion_fuente_valor} onChange={(e) => setForm({ ...form, retencion_fuente_valor: e.target.value })} />
              </Field>
            )}
            <Field name="iva_tasa" label="IVA tasa">
              <input type="number" inputMode="decimal" min="0" step="0.0001" style={inp} value={form.iva_tasa} onChange={(e) => setForm({ ...form, iva_tasa: e.target.value })} />
            </Field>
            <Field name="iva_valor" label="IVA valor">
              <input type="number" inputMode="decimal" min="0" step="0.01" style={inp} value={form.iva_valor} onChange={(e) => setForm({ ...form, iva_valor: e.target.value })} />
            </Field>
            <Field name="categoria" label="Categoría">
              <select style={inp} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">—</option>
                {(form.tipo === 'ingreso' ? catsIngreso : catsEgreso).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </Field>
            {!isMobile && (
              <Field name="centro_costo_tipo" label="Centro de costo">
                <select style={inp} value={form.centro_costo_tipo} onChange={(e) => setForm({ ...form, centro_costo_tipo: e.target.value })}>
                  <option value="empresa">Empresa general</option>
                  <option value="contrato">Contrato</option>
                </select>
              </Field>
            )}
            {!isMobile && form.centro_costo_tipo === 'contrato' && (
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

          {(!isMobile || form.tipo === 'ingreso') && (
            <label style={{ display: 'block', marginTop: 12 }}>
              <span style={lbl}><FieldLabel label="Notas" hint={TX_FIELD_HINTS.notas} t={t} /></span>
              <textarea style={{ ...inp, minHeight: 60 }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </label>
          )}

          {!editId && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: t.textMuted, marginBottom: 8 }}>
                Soporte / recibo
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {isMobile && (
                  <button
                    type="button"
                    style={{ ...btn(true), flex: '1 1 140px' }}
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera size={18} strokeWidth={2.2} /> Tomar foto
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...btn(false), flex: isMobile ? '1 1 140px' : undefined }}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={16} strokeWidth={2.2} /> {isMobile ? 'Galería / PDF' : 'Adjuntar archivo'}
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  onSoporteFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={(e) => {
                  onSoporteFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {soportePendiente?.file && (
                <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600 }}>
                  ✓ {soportePendiente.file.name || 'Archivo listo'}
                  {' · '}
                  {labelPesoSoporte(soportePendiente)}
                  {' · se subirá al guardar'}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...btn(true), flex: isMobile ? '1 1 120px' : undefined }} disabled={busy} onClick={guardar}>
              {busy ? 'Guardando…' : (editId ? 'Guardar' : 'Crear')}
            </button>
            <button
              type="button"
              style={{ ...btn(false), flex: isMobile ? '1 1 100px' : undefined }}
              onClick={() => { setShowForm(false); setSoportePendiente(null) }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted }}>Cargando…</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {soporteInlineInfo && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600 }}>
              Comprimiendo / subiendo… {soporteInlineInfo}
            </div>
          )}
          {items.map((tx) => (
            <div
              key={tx.id}
              style={{
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ color: tx.tipo === 'ingreso' ? '#10B981' : '#EF4444', fontWeight: 700, textTransform: 'capitalize' }}>
                  {tx.tipo}
                </span>
                <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>{tx.fecha}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t.text, marginBottom: 4 }}>
                {fmtCOP(tx.valor_neto)}
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 10 }}>
                {tx.categoria?.nombre || '—'} · Bruto {fmtCOP(tx.valor_bruto)}
                {tx.iva_valor ? ` · IVA ${fmtCOP(tx.iva_valor)}` : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {tx.soporte_nombre_archivo ? (
                  <button type="button" style={btn(false)} onClick={() => abrirPreview(tx)}>
                    📎 Ver soporte
                    {tx.soporte_tamano_bytes ? (
                      <span style={{ marginLeft: 6, fontWeight: 500, color: t.textMuted }}>
                        ({fmtBytes(tx.soporte_tamano_bytes)})
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <>
                    <button type="button" style={btn(true)} onClick={() => {
                      const el = document.getElementById(`cam-tx-${tx.id}`)
                      el?.click()
                    }}>
                      <Camera size={16} /> Foto
                    </button>
                    <label style={{ ...btn(false), cursor: 'pointer' }}>
                      📤 Archivo
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        hidden
                        onChange={(e) => subirSoporte(tx.id, e.target.files?.[0])}
                      />
                    </label>
                    <input
                      id={`cam-tx-${tx.id}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        subirSoporte(tx.id, e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                  </>
                )}
                <button type="button" style={btn(false)} onClick={() => abrirEditar(tx)}>✎</button>
                <button type="button" style={{ ...btn(false), color: '#EF4444', borderColor: '#EF4444' }} onClick={() => anular(tx.id)}>✕</button>
              </div>
            </div>
          ))}
          {!items.length && (
            <div style={{ padding: 28, textAlign: 'center', color: t.textMuted }}>
              Sin transacciones. Use «Egreso rápido» para registrar el primer recibo.
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {soporteInlineInfo && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.primary, fontWeight: 600, marginBottom: 8 }}>
              Comprimiendo / subiendo… {soporteInlineInfo}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', minWidth: isTablet ? 720 : undefined }}>
            <thead>
              <tr style={{ background: t.primary + '18', color: t.text }}>
                {['Fecha', 'Tipo', 'Bruto', 'IVA', 'Neto', 'Categoría', 'Centro', 'Origen', 'Soporte', ''].map((h) => (
                  <th key={h || 'acciones'} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
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
                        title={`Ver soporte${tx.soporte_tamano_bytes ? ` (${fmtBytes(tx.soporte_tamano_bytes)})` : ''}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: t.primary,
                          padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'inherit',
                        }}
                        onClick={() => abrirPreview(tx)}
                      >
                        <span>📎</span>
                        {tx.soporte_tamano_bytes ? (
                          <span style={{ color: t.textMuted, fontWeight: 500, fontSize: 'var(--cc-xs)' }}>
                            {fmtBytes(tx.soporte_tamano_bytes)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <label style={{ cursor: 'pointer', color: t.textMuted }}>
                        📤<input type="file" accept=".pdf,image/*" hidden onChange={(e) => subirSoporte(tx.id, e.target.files?.[0])} />
                      </label>
                    )}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', marginRight: 4, minHeight: undefined }} onClick={() => abrirEditar(tx)}>✎</button>
                    <button type="button" style={{ ...btn(false), padding: '4px 8px', color: '#EF4444', borderColor: '#EF4444', minHeight: undefined }} onClick={() => anular(tx.id)}>✕</button>
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
