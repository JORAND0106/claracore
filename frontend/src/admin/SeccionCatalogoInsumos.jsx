import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCatalogoInsumosApi, fmtMoney } from './catalogoInsumosApi'
import { esDesarrolladorUsuario } from '../utils/permisosContrato'
import { permisosCatalogoInsumos } from './catalogoInsumosPermisos'
import { isDarkMode, isRestMode } from '../theme/adminPanelTheme'
import { UnidadSelector } from '../utils/unidadesListadoPrecios'

const EMPTY_FORM = {
  proveedor_id: '',
  razon_social: '',
  nit: '',
  codigo: '',
  descripcion: '',
  unidad: '',
  rendimiento: '',
  costo_base: '',
  tipo_impuesto: 'iva',
  impuesto_porcentaje: '19',
  cotizacion_numero: '',
  cotizacion_fecha: '',
  cotizacion_vigencia: '',
  ganadora_pdf: null,
  soportes_pdf: [],
}

function computeTotal(costo, tipo, pct) {
  const base = Number(costo) || 0
  const p = Number(pct) || 0
  if ((tipo === 'iva' || tipo === 'aiu') && p > 0) {
    return Math.round(base * (1 + p / 100) * 100) / 100
  }
  return base
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 'var(--cc-caption)', marginBottom: 4, opacity: 0.85 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 'var(--cc-xs)', opacity: 0.65, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function ImpuestoToggle({ value, onChange, theme, dark }) {
  const activeBg = theme.primary || '#0891b2'
  const base = {
    flex: 1,
    padding: '8px 12px',
    border: `1px solid ${theme.border || '#ccc'}`,
    background: 'transparent',
    color: theme.text || '#111',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 'var(--cc-sm)',
    transition: 'background 0.15s, color 0.15s',
  }
  const left = { ...base, borderRadius: '8px 0 0 8px', borderRight: 'none' }
  const right = { ...base, borderRadius: '0 8px 8px 0' }
  const active = { background: activeBg, color: '#fff', borderColor: activeBg }
  const inactive = dark ? { background: '#0b1920' } : { background: '#f8fafc' }

  return (
    <div style={{ display: 'flex' }} role="group" aria-label="Tipo de impuesto">
      <button
        type="button"
        style={{ ...left, ...(value === 'iva' ? active : inactive) }}
        aria-pressed={value === 'iva'}
        onClick={() => onChange('iva')}
      >
        IVA
      </button>
      <button
        type="button"
        style={{ ...right, ...(value === 'aiu' ? active : inactive) }}
        aria-pressed={value === 'aiu'}
        onClick={() => onChange('aiu')}
      >
        AIU
      </button>
    </div>
  )
}

export default function SeccionCatalogoInsumos({ token, user, perms, theme }) {
  const contratoId = user?.contrato_id
  const api = useMemo(() => (contratoId && token ? createCatalogoInsumosApi(contratoId, token) : null), [contratoId, token])
  const t = theme || {}
  const dark = isDarkMode(theme)
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border || '#ccc'}`,
    background: dark ? '#0b1920' : (isRestMode(theme) ? t.bgCard : '#fff'),
    color: t.text || '#111',
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }
  const btnPrimary = {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: t.primary || '#0891b2',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 'var(--cc-sm)',
  }
  const btnSecondary = {
    ...btnPrimary,
    background: 'transparent',
    color: t.text || '#111',
    border: `1px solid ${t.border || '#ccc'}`,
  }
  const th = { padding: '8px 6px', textAlign: 'left', borderBottom: `1px solid ${t.border}`, fontSize: 'var(--cc-xs)' }
  const td = { padding: '7px 6px', borderBottom: `1px solid ${t.border}33`, fontSize: 'var(--cc-xs)' }

  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [cotMin, setCotMin] = useState(3)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [dupAlert, setDupAlert] = useState(null)
  const [historial, setHistorial] = useState(null)
  const csvRef = useRef(null)
  const [csvPending, setCsvPending] = useState(null)
  const [csvModo, setCsvModo] = useState('agregar')
  const [unidadModoCustom, setUnidadModoCustom] = useState(false)
  const [unidadCustom, setUnidadCustom] = useState('')

  const totalPreview = useMemo(
    () => computeTotal(form.costo_base, form.tipo_impuesto, form.impuesto_porcentaje),
    [form.costo_base, form.tipo_impuesto, form.impuesto_porcentaje],
  )

  const permsEfectivos = useMemo(
    () => (esDesarrolladorUsuario(user) ? permisosCatalogoInsumos(user, user?.contrato_id) : (perms || {})),
    [user, perms],
  )

  const canCrear = permsEfectivos?.crear
  const canEditar = permsEfectivos?.editar
  const canVer = permsEfectivos?.ver

  const load = useCallback(() => {
    if (!api || !canVer) return
    setLoading(true)
    api.listInsumos(q, 100, 0)
      .then((r) => {
        setRows(r.items || [])
        setTotal(r.total || 0)
      })
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [api, q, canVer])

  useEffect(() => {
    const tmr = setTimeout(load, 200)
    return () => clearTimeout(tmr)
  }, [load])

  useEffect(() => {
    if (!api) return
    api.getConfig().then((c) => setCotMin(c.cotizaciones_minimas || 3)).catch(() => {})
  }, [api])

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditId(row.insumo_id || row.id)
    setForm({
      ...EMPTY_FORM,
      proveedor_id: row.proveedor_id || '',
      codigo: row.codigo || '',
      descripcion: row.descripcion || '',
      unidad: row.unidad || '',
      rendimiento: row.rendimiento ?? '',
      costo_base: row.costo ?? row.costo_base ?? '',
      tipo_impuesto: row.tipo_impuesto || 'iva',
      impuesto_porcentaje: row.impuesto_porcentaje ?? '19',
      cotizacion_numero: row.cotizacion_numero || '',
      cotizacion_fecha: row.cotizacion_fecha || '',
      cotizacion_vigencia: row.cotizacion_vigencia || '',
    })
    setUnidadModoCustom(false)
    setUnidadCustom('')
    setDupAlert(null)
    setModalOpen(true)
  }

  const runOcr = async () => {
    if (!form.ganadora_pdf || !api) return
    setOcrBusy(true)
    try {
      const r = await api.ocrCotizacion(form.ganadora_pdf)
      const c = r.campos_catalogo || {}
      setForm((f) => ({
        ...f,
        razon_social: c.razon_social || f.razon_social,
        nit: c.nit || f.nit,
        cotizacion_fecha: c.cotizacion_fecha || f.cotizacion_fecha,
        costo_base: c.costo_base != null ? String(c.costo_base) : f.costo_base,
        tipo_impuesto: c.tipo_impuesto || f.tipo_impuesto,
        impuesto_porcentaje: c.impuesto_porcentaje != null ? String(c.impuesto_porcentaje) : f.impuesto_porcentaje,
      }))
      setMsg({ type: 'success', text: r.mensaje || 'OCR completado. Revise los campos.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setOcrBusy(false)
    }
  }

  const checkDupBeforeSave = async () => {
    if (!api || !form.descripcion.trim()) return null
    const pid = form.proveedor_id ? Number(form.proveedor_id) : null
    if (!pid && !(form.razon_social && form.nit)) return null
    let proveedorId = pid
    if (!proveedorId) return null
    const r = await api.checkDuplicado({
      proveedor_id: proveedorId,
      descripcion: form.descripcion.trim(),
      exclude_insumo_id: editId || undefined,
    })
    return r.hay_duplicado ? r.duplicados[0] : null
  }

  const buildFormData = (forceUpdateId) => {
    const fd = new FormData()
    fd.append('codigo', form.codigo.trim())
    fd.append('descripcion', form.descripcion.trim())
    fd.append('unidad', form.unidad || 'UND')
    fd.append('costo_base', String(form.costo_base))
    if (form.rendimiento !== '') fd.append('rendimiento', String(form.rendimiento))
    fd.append('tipo_impuesto', form.tipo_impuesto)
    fd.append('impuesto_porcentaje', String(form.impuesto_porcentaje || 0))
    if (form.proveedor_id) fd.append('proveedor_id', String(form.proveedor_id))
    else if (form.razon_social && form.nit) {
      fd.append('razon_social', form.razon_social.trim())
      fd.append('nit', form.nit.trim())
    }
    if (form.cotizacion_numero) fd.append('cotizacion_numero', form.cotizacion_numero.trim())
    if (form.cotizacion_fecha) fd.append('cotizacion_fecha', form.cotizacion_fecha)
    if (form.cotizacion_vigencia) fd.append('cotizacion_vigencia', form.cotizacion_vigencia.trim())
    if (forceUpdateId) fd.append('force_update_id', String(forceUpdateId))
    if (form.ganadora_pdf) fd.append('cotizacion_ganadora_pdf', form.ganadora_pdf)
    ;(form.soportes_pdf || []).forEach((f) => fd.append('cotizaciones_soporte', f))
    return fd
  }

  const save = async (forceUpdateId = null) => {
    if (!api) return
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      setMsg({ type: 'error', text: 'Código y descripción son obligatorios.' })
      return
    }
    if (!form.unidad.trim()) {
      setMsg({ type: 'error', text: 'Seleccione la unidad del insumo.' })
      return
    }
    if (form.costo_base === '' || Number(form.costo_base) < 0) {
      setMsg({ type: 'error', text: 'Indique el costo base.' })
      return
    }
    const sopCount = (form.soportes_pdf || []).length
    const needSop = Math.max(0, cotMin - 1)
    if (!editId && sopCount < needSop) {
      const ok = window.confirm(
        `Se recomiendan al menos ${needSop} PDF(s) de cotización de soporte (mínimo ${cotMin} cotizaciones comparativas). ¿Desea guardar de todos modos?`,
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      if (!forceUpdateId && !editId) {
        const dup = await checkDupBeforeSave()
        if (dup) {
          setDupAlert(dup)
          setBusy(false)
          return
        }
      }
      const fd = buildFormData(forceUpdateId)
      if (editId && !forceUpdateId) {
        await api.updateInsumoForm(editId, fd)
      } else {
        await api.createInsumoForm(fd)
      }
      setMsg({ type: 'success', text: forceUpdateId ? 'Precio actualizado (historial conservado).' : 'Insumo guardado.' })
      setModalOpen(false)
      setDupAlert(null)
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const onCsvSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCsvModo('agregar')
    setCsvPending(file)
  }

  const confirmCsvImport = async () => {
    if (!csvPending || !api) return
    if (csvModo === 'reemplazar') {
      const ok = window.confirm(
        '¿Reemplazar todo el catálogo? Los insumos actuales se desactivarán y solo quedarán los del CSV.',
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const r = await api.importCsv(csvPending, csvModo)
      setMsg({
        type: 'success',
        text: `Importación (${csvModo}): ${r.creados} creados, ${r.actualizados} actualizados`
          + (r.desactivados ? `, ${r.desactivados} desactivados` : '')
          + (r.errores?.length ? `, ${r.errores.length} errores` : ''),
      })
      setCsvPending(null)
      load()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const showHistorial = async (row) => {
    if (!api) return
    try {
      const h = await api.getHistorial(row.insumo_id || row.id)
      setHistorial({ row, items: h })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  if (!canVer) {
    return <div style={{ padding: 24, opacity: 0.7 }}>Sin permiso para ver el catálogo de insumos.</div>
  }

  return (
    <div style={{ padding: '16px 20px', color: t.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)' }}>Catálogo de insumos</h2>
          <div style={{ fontSize: 'var(--cc-xs)', opacity: 0.7, marginTop: 4 }}>
            Gestión centralizada del catálogo. Las solicitudes de almacén solo pueden seleccionar insumos existentes.
          </div>
        </div>
        {canCrear && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={btnPrimary} onClick={openNew} title="Crear insumo con cotización ganadora y soportes comparativos">
              + Nuevo insumo
            </button>
            <span
              title="Cree el insumo con la cotización ganadora (OCR opcional) y adjunte las cotizaciones de soporte en PDF (máx. 200 KB c/u). El rendimiento puede completarse después."
              style={{ cursor: 'help', opacity: 0.6, fontSize: 'var(--cc-md)' }}
            >
              ?
            </span>
          </div>
        )}
      </div>

      {msg && (
        <div style={{
          marginBottom: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: msg.type === 'error' ? '#7f1d1d33' : '#14532d33',
          fontSize: 'var(--cc-sm)',
          whiteSpace: 'pre-wrap',
        }}
        >
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          style={{ ...inputStyle, flex: 1, maxWidth: 420 }}
          placeholder="Buscar por código o descripción…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span style={{ fontSize: 'var(--cc-xs)', alignSelf: 'center', opacity: 0.65 }}>{total} insumo(s)</span>
      </div>

      <div style={{ overflow: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Proveedor', 'Código', 'Descripción', 'Und', 'Rend.', 'Costo', 'IVA/AIU', 'Total', ''].map((h) => (
                <th key={h || 'acc'} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={td}>Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ ...td, opacity: 0.65 }}>Sin insumos en el catálogo.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.insumo_id || r.id}>
                <td style={td}>{r.proveedor_nombre || '—'}</td>
                <td style={td}>{r.codigo}</td>
                <td style={td}>{r.descripcion}</td>
                <td style={td}>{r.unidad}</td>
                <td style={td}>{r.rendimiento ?? '—'}</td>
                <td style={td}>{fmtMoney(r.costo)}</td>
                <td style={td}>{r.impuesto_etiqueta || '—'}</td>
                <td style={td}>{fmtMoney(r.costo_total)}</td>
                <td style={td}>
                  <button type="button" style={{ ...btnSecondary, padding: '2px 8px', fontSize: 'var(--cc-xs)' }} onClick={() => showHistorial(r)}>Historial</button>
                  {canEditar && (
                    <button type="button" style={{ ...btnSecondary, padding: '2px 8px', fontSize: 'var(--cc-xs)', marginLeft: 4 }} onClick={() => openEdit(r)}>Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canCrear && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onCsvSelect} />
          <button
            type="button"
            style={{ ...btnSecondary, fontSize: 'var(--cc-xs)', opacity: 0.75, padding: '4px 10px' }}
            disabled={busy}
            onClick={() => api?.downloadPlantillaCsv().catch((e) => setMsg({ type: 'error', text: e.message }))}
          >
            Descargar plantilla CSV
          </button>
          <button
            type="button"
            style={{ ...btnSecondary, fontSize: 'var(--cc-xs)', opacity: 0.75, padding: '4px 10px' }}
            onClick={() => csvRef.current?.click()}
            disabled={busy}
          >
            Importar CSV…
          </button>
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(5,12,18,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !busy && setModalOpen(false)}>
          <div style={{ width: 'min(680px,95vw)', maxHeight: '92vh', overflow: 'auto', background: dark ? '#0b1920' : '#fff', borderRadius: 12, border: `1px solid ${t.border}`, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editId ? 'Editar insumo' : 'Nuevo insumo'}</h3>

            {dupAlert && (
              <div style={{ background: '#78350f33', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 'var(--cc-sm)' }}>
                <strong>Probable cambio de precio:</strong> ya existe «{dupAlert.descripcion}» ({dupAlert.codigo}) con {fmtMoney(dupAlert.costo_total)}.
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button type="button" style={btnPrimary} disabled={busy} onClick={() => save(dupAlert.insumo_id)}>Actualizar precio (conservar historial)</button>
                  <button type="button" style={btnSecondary} onClick={() => setDupAlert(null)}>Corregir datos</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="Proveedor (razón social)">
                <input style={inputStyle} value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value, proveedor_id: '' })} />
              </Field>
              <Field label="NIT proveedor">
                <input style={inputStyle} value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value, proveedor_id: '' })} />
              </Field>
              <Field label="Código *">
                <input style={inputStyle} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </Field>
              <Field label="Unidad *">
                <UnidadSelector
                  value={form.unidad}
                  onChange={(v) => setForm({ ...form, unidad: v })}
                  selectStyle={inputStyle}
                  inputStyle={inputStyle}
                  btnPrimary={btnPrimary}
                  btnSecondary={btnSecondary}
                  modoCustom={unidadModoCustom}
                  setModoCustom={setUnidadModoCustom}
                  uCustom={unidadCustom}
                  setUCustom={setUnidadCustom}
                />
              </Field>
            </div>
            <Field label="Descripción *">
              <input style={inputStyle} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
              <Field label="Rendimiento">
                <input style={inputStyle} value={form.rendimiento} onChange={(e) => setForm({ ...form, rendimiento: e.target.value })} />
              </Field>
              <Field label="Costo base *">
                <input style={inputStyle} type="number" min="0" step="0.01" value={form.costo_base} onChange={(e) => setForm({ ...form, costo_base: e.target.value })} />
              </Field>
              <Field label="Costo total">
                <input style={{ ...inputStyle, opacity: 0.85 }} readOnly value={fmtMoney(totalPreview)} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Field label="Impuesto (IVA / AIU)">
                <ImpuestoToggle
                  value={form.tipo_impuesto}
                  onChange={(v) => setForm({ ...form, tipo_impuesto: v })}
                  theme={t}
                  dark={dark}
                />
              </Field>
              <Field label="% impuesto">
                <input style={inputStyle} type="number" value={form.impuesto_porcentaje} onChange={(e) => setForm({ ...form, impuesto_porcentaje: e.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                padding: 14,
                borderRadius: 10,
                border: `2px solid ${t.primary || '#0891b2'}`,
                background: dark ? 'rgba(8,145,178,0.12)' : 'rgba(8,145,178,0.06)',
              }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 'var(--cc-xs)',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: t.primary || '#0891b2',
                    color: '#fff',
                  }}
                  >
                    Cotización ganadora
                  </span>
                  <span style={{ fontSize: 'var(--cc-xs)', opacity: 0.75 }}>
                    Documento principal — OCR y datos de precio
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px', marginBottom: 10 }}>
                  <Field label="Nº cotización">
                    <input style={inputStyle} value={form.cotizacion_numero} onChange={(e) => setForm({ ...form, cotizacion_numero: e.target.value })} />
                  </Field>
                  <Field label="Fecha cotización">
                    <input style={inputStyle} type="date" value={form.cotizacion_fecha} onChange={(e) => setForm({ ...form, cotizacion_fecha: e.target.value })} />
                  </Field>
                  <Field label="Vigencia (texto del proveedor)">
                    <input style={inputStyle} value={form.cotizacion_vigencia} onChange={(e) => setForm({ ...form, cotizacion_vigencia: e.target.value })} placeholder="Ej. 15 días" />
                  </Field>
                </div>
                <Field label="PDF cotización ganadora (máx. 200 KB)" hint="Adjunte el PDF y use OCR para autocompletar proveedor, costo e impuestos.">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setForm({ ...form, ganadora_pdf: e.target.files?.[0] || null })}
                    />
                    {form.ganadora_pdf && (
                      <span style={{ fontSize: 'var(--cc-xs)', opacity: 0.85 }}>{form.ganadora_pdf.name}</span>
                    )}
                    <button type="button" style={btnSecondary} disabled={!form.ganadora_pdf || ocrBusy} onClick={runOcr}>
                      {ocrBusy ? 'Leyendo…' : 'Ejecutar OCR'}
                    </button>
                  </div>
                </Field>
              </div>

              <div style={{
                padding: 14,
                borderRadius: 10,
                border: `1px dashed ${t.border || '#94a3b8'}`,
                background: dark ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.08)',
              }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 'var(--cc-xs)',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: dark ? '#334155' : '#64748b',
                    color: '#fff',
                  }}
                  >
                    Cotizaciones de soporte
                  </span>
                  <span style={{ fontSize: 'var(--cc-xs)', opacity: 0.75 }}>
                    Comparativas adicionales — solo archivo PDF
                  </span>
                </div>
                <Field label={`PDFs de soporte (máx. 200 KB c/u — mín. ${Math.max(0, cotMin - 1)} recomendadas)`}>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(e) => setForm({ ...form, soportes_pdf: Array.from(e.target.files || []) })}
                  />
                  {(form.soportes_pdf || []).length > 0 && (
                    <ul style={{ fontSize: 'var(--cc-xs)', margin: '6px 0 0', paddingLeft: 18, opacity: 0.9 }}>
                      {form.soportes_pdf.map((f) => (
                        <li key={f.name + f.size}>{f.name}</li>
                      ))}
                    </ul>
                  )}
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="button" style={btnPrimary} disabled={busy || (!canCrear && !editId) || (editId && !canEditar)} onClick={() => save()}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {csvPending && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10004, background: 'rgba(5,12,18,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !busy && setCsvPending(null)}>
          <div style={{ width: 'min(420px,95vw)', background: dark ? '#0b1920' : '#fff', borderRadius: 12, padding: 18, border: `1px solid ${t.border}` }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0 }}>Importar CSV</h4>
            <p style={{ fontSize: 'var(--cc-sm)', opacity: 0.85, margin: '0 0 8px' }}>
              Archivo: <strong>{csvPending.name}</strong>
            </p>
            <p style={{ fontSize: 'var(--cc-xs)', opacity: 0.75, margin: '0 0 12px' }}>
              Columnas obligatorias: codigo, descripcion, unidad, costo (también acepta Costo, Código, etc.).
              {' '}
              <button
                type="button"
                style={{ ...btnSecondary, padding: '2px 6px', fontSize: 'var(--cc-xs)', display: 'inline' }}
                onClick={() => api?.downloadPlantillaCsv().catch(() => {})}
              >
                Descargar plantilla
              </button>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'agregar'} onChange={() => setCsvModo('agregar')} />
                <span><strong>Agregar</strong> — suma los insumos del CSV al catálogo actual.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--cc-sm)', cursor: 'pointer' }}>
                <input type="radio" name="csvModo" checked={csvModo === 'reemplazar'} onChange={() => setCsvModo('reemplazar')} />
                <span><strong>Reemplazar todo</strong> — desactiva el catálogo actual y lo sustituye por el CSV.</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => setCsvPending(null)}>Cancelar</button>
              <button type="button" style={btnPrimary} disabled={busy} onClick={confirmCsvImport}>
                {busy ? 'Importando…' : 'Confirmar importación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(5,12,18,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setHistorial(null)}>
          <div style={{ width: 'min(520px,95vw)', maxHeight: '80vh', overflow: 'auto', background: dark ? '#0b1920' : '#fff', borderRadius: 12, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0 }}>Historial de precios — {historial.row.codigo}</h4>
            {(historial.items || []).length === 0 ? (
              <p style={{ opacity: 0.7 }}>Sin cambios registrados aún.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
                <thead>
                  <tr>
                    {['Fecha', 'Costo base', 'Total', 'Motivo'].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {historial.items.map((h) => (
                    <tr key={h.id}>
                      <td style={td}>{h.created_at ? String(h.created_at).slice(0, 10) : '—'}</td>
                      <td style={td}>{fmtMoney(h.costo_base)}</td>
                      <td style={td}>{fmtMoney(h.valor_compra_referencia)}</td>
                      <td style={td}>{h.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button type="button" style={btnSecondary} onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
