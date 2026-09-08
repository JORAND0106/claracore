import { useCallback, useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { tFrom, isDarkMode, isRestMode } from '../../theme/adminPanelTheme'
import CorteSsBlock from './CorteSsBlock'
import SubcontratistaFormSheet, { EMPTY_SUBCONTRATISTA_FORM } from './SubcontratistaFormSheet'
import { uploadDocumento, uploadPoliza } from './subcontratistasApi'
import { fmtMoneda, nivelPolizaBadge, periodoFromCorte } from './subcontratistasDocsHelpers'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Sección completa de Subcontratistas (AdminPanel).
 * Props: { call, user, perms, theme, token }
 */
export default function SeccionSubcontratistas({ call, user, perms, theme, token }) {
  const contratoId = user?.contrato_id
  const tTok = tFrom(theme)
  const S = subUi(theme, tTok)
  const sheetUi = subcontratistasSheetStyles(tTok)
  const sheetCssVars = subcontratistasSheetCssVars(tTok)
  const col = {
    textPrimary: tTok.text,
    textSecondary: tTok.textMuted,
    textMuted: tTok.textMuted,
    textTable: tTok.text,
  }
  const tdStyle = S.td

  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [showCrear, setShowCrear] = useState(false)
  const [crearForm, setCrearForm] = useState({ ...EMPTY_SUBCONTRATISTA_FORM })
  const [stagedPolizas, setStagedPolizas] = useState([])
  const [stagedDocs, setStagedDocs] = useState([])
  const [creating, setCreating] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [tabDetalle, setTabDetalle] = useState('datos')
  const [editando, setEditando] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [cortes, setCortes] = useState([])
  const [cortesLoading, setCortesLoading] = useState(false)
  const [genCorteEstado, setGenCorteEstado] = useState(null)
  const [showCrearCorte, setShowCrearCorte] = useState(false)
  const [corteForm, setCorteForm] = useState({ tipo_periodo: 'quincenal', consecutivo: 1, fecha_inicio: '', fecha_fin: '' })
  const [creatingCorte, setCreatingCorte] = useState(false)
  const [corteDetalle, setCorteDetalle] = useState(null)
  const [editCorteForm, setEditCorteForm] = useState({})
  const [savingCorte, setSavingCorte] = useState(false)
  const [preciosSub, setPreciosSub] = useState([])
  const [preciosLoading, setPreciosLoading] = useState(false)
  const [showAgregarItem, setShowAgregarItem] = useState(false)
  const [listadoPrecios, setListadoPrecios] = useState([])
  const [busqCapitulo, setBusqCapitulo] = useState('')
  const [busqTexto, setBusqTexto] = useState('')
  const [itemSel, setItemSel] = useState(null)
  const [precioSubForm, setPrecioSubForm] = useState('')
  const [creatingPrecio, setCreatingPrecio] = useState(false)
  const [precioEdit, setPrecioEdit] = useState(null)
  const [editPrecioVal, setEditPrecioVal] = useState('')
  const [savingPrecio, setSavingPrecio] = useState(false)
  const [calFiOpen, setCalFiOpen] = useState(false)
  const [calFfOpen, setCalFfOpen] = useState(false)
  const [calEditFf, setCalEditFf] = useState(false)

  const labelStyle = { fontSize: 'var(--cc-caption)', color: col.textSecondary, marginBottom: 4 }
  const inputStyle = S.input
  const selectStyle = {
    ...S.input,
    cursor: 'pointer',
  }
  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(5,12,18,0.92)',
    backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const modalStyle = (w) => ({
    width: `min(${w}px,96vw)`,
    maxHeight: '92vh',
    background: isDarkMode(theme) ? '#0b1920' : tTok.bg,
    borderRadius: 14,
    border: `1px solid ${tTok.border}`,
    boxShadow: isRestMode(theme) ? '0 32px 56px rgba(42,35,24,0.2)' : '0 40px 100px rgba(0,0,0,0.7)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...sheetCssVars,
    fontSize: 'var(--cc-sm)',
    color: 'var(--cc-text)',
    fontFamily: 'inherit',
  })
  const modalTitle = {
    fontSize: 'var(--cc-h2)',
    fontWeight: 700,
    color: col.textPrimary,
    fontFamily: 'inherit',
  }
  const modalHeadBgS = isDarkMode(theme) ? '#081318' : (isRestMode(theme) ? tTok.headerBg : '#E0F2FE')
  const modalHead = {
    padding: '12px 20px 10px',
    borderBottom: `1px solid ${isDarkMode(theme) ? 'rgba(0,175,197,0.12)' : tTok.border}`,
    background: modalHeadBgS,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  }
  const modalScroll = {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 20px',
    scrollbarWidth: 'thin',
    scrollbarColor: isDarkMode(theme) ? '#1e3a44 transparent' : `${tTok.border}44`,
    background: isDarkMode(theme) ? 'transparent' : (isRestMode(theme) ? tTok.bgCard : '#F8FAFC'),
    WebkitOverflowScrolling: 'touch',
  }
  const modalFoot = {
    padding: '10px 20px',
    borderTop: `1px solid ${isDarkMode(theme) ? 'rgba(0,175,197,0.1)' : tTok.border}`,
    background: modalHeadBgS,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    flexShrink: 0,
  }
  const secTitle = {
    fontSize: 'var(--cc-caption)', color: tTok.primary, fontWeight: 700,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  }
  const fmt = fmtMoneda

  const cargar = useCallback(async () => {
    if (!contratoId) return
    setLoading(true)
    try {
      setSubs(await call('GET', `/subcontratistas/${contratoId}`))
      // Emite notificaciones SISTEMA deduplicadas de pólizas por vencer/vencidas
      try {
        await call('GET', `/subcontratistas/${contratoId}/alertas-polizas?emitir=true`)
      } catch { /* tablas nuevas o sin permiso: no bloquear listado */ }
    }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [contratoId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [cargar])

  const cargarCortes = async (sid) => {
    setCortesLoading(true)
    try { setCortes(await call('GET', `/subcontratistas/${sid}/cortes`) || []) }
    catch { /* ignore */ } finally { setCortesLoading(false) }
  }

  const cargarGenCorteEstado = async (sid) => {
    try {
      const est = await call('GET', `/subcontratistas/${sid}/generacion-corte-estado`)
      setGenCorteEstado(est)
    } catch {
      setGenCorteEstado(null)
    }
  }

  const cargarPreciosSub = async (sid) => {
    setPreciosLoading(true)
    try { setPreciosSub(await call('GET', `/subcontratistas/${sid}/precios`) || []) }
    catch { /* ignore */ } finally { setPreciosLoading(false) }
  }

  const cargarListado = async () => {
    if (listadoPrecios.length > 0) return
    try { setListadoPrecios(await call('GET', `/listado-precios/${contratoId}`) || []) }
    catch { /* ignore */ }
  }

  const abrirDetalle = (sub) => {
    setDetalle(sub)
    setTabDetalle('datos')
    setEditando(false)
    setEditForm({ ...sub })
    setGenCorteEstado(null)
    cargarCortes(sub.id)
    cargarPreciosSub(sub.id)
  }

  useEffect(() => {
    if (detalle && tabDetalle === 'cortes') {
      cargarGenCorteEstado(detalle.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabDetalle, detalle?.id])

  const crearSub = async () => {
    if (!crearForm.razon_social.trim()) {
      setMsg({ type: 'error', text: 'La razón social es obligatoria.' })
      return
    }
    setCreating(true)
    try {
      const nuevo = await call('POST', `/subcontratistas/${contratoId}`, crearForm)
      const newId = nuevo?.id
      let uploadErrors = 0
      if (newId && token) {
        for (const p of stagedPolizas) {
          if (!p.fecha_vencimiento) continue
          try {
            await uploadPoliza(newId, {
              tipo: p.tipo,
              tipo_otro_texto: p.tipo_otro_texto,
              fecha_vencimiento: p.fecha_vencimiento,
              valor_asegurado: p.valor_asegurado,
              notas: p.notas,
              archivo: p.archivo || undefined,
            }, token)
          } catch { uploadErrors += 1 }
        }
        for (const d of stagedDocs) {
          if (!d.archivo || d.tipo === 'seguridad_social') continue
          try {
            await uploadDocumento(newId, {
              tipo: d.tipo,
              archivo: d.archivo,
              version_label: d.version_label,
              periodo: d.periodo,
              notas: d.notas,
              marcar_vigente: true,
            }, token)
          } catch { uploadErrors += 1 }
        }
      } else if ((stagedPolizas.length || stagedDocs.length) && !token) {
        setMsg({
          type: 'error',
          text: 'Subcontratista creado, pero falta token para subir archivos. Cárguelos desde el detalle.',
        })
      }
      if (uploadErrors) {
        setMsg({ type: 'error', text: `Subcontratista creado. ${uploadErrors} archivo(s) no se pudieron subir.` })
      } else {
        setMsg({ type: 'success', text: 'Subcontratista creado.' })
      }
      setShowCrear(false)
      setCrearForm({ ...EMPTY_SUBCONTRATISTA_FORM })
      setStagedPolizas([])
      setStagedDocs([])
      cargar()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setCreating(false)
    }
  }

  const guardarEdicion = async () => {
    setSaving(true)
    try {
      await call('PUT', `/subcontratistas/${detalle.id}`, editForm)
      setMsg({ type: 'success', text: 'Datos actualizados.' })
      setEditando(false)
      setDetalle({ ...detalle, ...editForm })
      cargar()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async () => {
    setToggling(true)
    try {
      const res = await call('PATCH', `/subcontratistas/${detalle.id}/toggle-activo`)
      setDetalle((d) => ({ ...d, activo: res.activo }))
      cargar()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setToggling(false)
    }
  }

  const cargarProximoConsecutivo = async (sid) => {
    try {
      const res = await call('GET', `/subcontratistas/${sid}/proximo-consecutivo`)
      const ultimo = cortes.length > 0 ? cortes[cortes.length - 1] : null
      setCorteForm((f) => ({
        ...f,
        consecutivo: res.proximo,
        fecha_inicio: ultimo ? ultimo.fecha_fin : '',
        fecha_fin: '',
      }))
    } catch { /* ignore */ }
  }

  const crearCorte = async () => {
    if (!corteForm.fecha_inicio || !corteForm.fecha_fin) {
      setMsg({ type: 'error', text: 'Complete las fechas.' })
      return
    }
    setCreatingCorte(true)
    try {
      await call('POST', `/subcontratistas/${detalle.id}/cortes`, corteForm)
      setMsg({ type: 'success', text: 'Corte creado.' })
      setShowCrearCorte(false)
      cargarCortes(detalle.id)
      cargarGenCorteEstado(detalle.id)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setCreatingCorte(false)
    }
  }

  const guardarCorteEdit = async () => {
    setSavingCorte(true)
    try {
      await call('PUT', `/subcontratistas/cortes/${corteDetalle.id}`, { fecha_fin: editCorteForm.fecha_fin })
      setMsg({ type: 'success', text: 'Corte actualizado y siguiente recalculado.' })
      setCorteDetalle(null)
      cargarCortes(detalle.id)
      cargarGenCorteEstado(detalle.id)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSavingCorte(false)
    }
  }

  const agregarPrecio = async () => {
    if (!itemSel || !precioSubForm) {
      setMsg({ type: 'error', text: 'Selecciona un ítem y define el precio.' })
      return
    }
    setCreatingPrecio(true)
    try {
      await call('POST', `/subcontratistas/${detalle.id}/precios`, {
        listado_precio_id: itemSel.id,
        precio_unitario_sub: parseFloat(precioSubForm) || 0,
      })
      setMsg({ type: 'success', text: 'Ítem agregado.' })
      setShowAgregarItem(false)
      setItemSel(null)
      setBusqTexto('')
      setBusqCapitulo('')
      setPrecioSubForm('')
      cargarPreciosSub(detalle.id)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setCreatingPrecio(false)
    }
  }

  const guardarPrecioEdit = async () => {
    setSavingPrecio(true)
    try {
      await call('PUT', `/subcontratistas/precios/${precioEdit.id}`, {
        precio_unitario_sub: parseFloat(editPrecioVal) || 0,
      })
      setMsg({ type: 'success', text: 'Precio actualizado.' })
      setPrecioEdit(null)
      cargarPreciosSub(detalle.id)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSavingPrecio(false)
    }
  }

  const CalPicker = ({ value, onChange, isOpen, onToggle }) => {
    const [vd, setVd] = useState(() => (value ? new Date(`${value}T12:00:00`) : new Date()))
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const y = vd.getFullYear()
    const m = vd.getMonth()
    const fd = new Date(y, m, 1).getDay()
    const dim = new Date(y, m + 1, 0).getDate()
    const dias = [...Array(fd).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
    const iso = (d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const disp = (v) => (v
      ? `${parseInt(v.split('-')[2], 10)} ${MESES[parseInt(v.split('-')[1], 10) - 1]}, ${v.split('-')[0]}`
      : 'Seleccionar fecha')
    return (
      <div style={{ position: 'relative' }}>
        <div
          onClick={onToggle}
          style={{ ...inputStyle, cursor: 'pointer', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span>📅</span>
          <span style={{ fontSize: 13, color: value ? col.textPrimary : col.textMuted }}>{disp(value)}</span>
        </div>
        {isOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 10010,
            background: isDarkMode(theme) ? '#0b1920' : tTok.bgCard,
            border: `1px solid ${isDarkMode(theme) ? 'rgba(0,175,197,0.3)' : tTok.border}`,
            borderRadius: 10, padding: 14,
            boxShadow: isRestMode(theme) ? '0 16px 40px rgba(42,35,24,0.2)' : '0 20px 50px rgba(0,0,0,0.5)',
            minWidth: 260,
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button type="button" style={{ ...S.btn('ghost', true), padding: '4px 10px' }} onClick={() => setVd(new Date(y, m - 1, 1))}>◄</button>
              <span style={{ fontSize: 14, fontWeight: 700, color: col.textPrimary }}>
                {MESES[m]} <span style={{ color: tTok.primary }}>{y}</span>
              </span>
              <button type="button" style={{ ...S.btn('ghost', true), padding: '4px 10px' }} onClick={() => setVd(new Date(y, m + 1, 1))}>►</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 6 }}>
              {['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'].map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 'var(--cc-caption)', color: col.textMuted, fontWeight: 700, padding: '2px 0' }}>{d}</div>
              ))}
              {dias.map((d, i) => {
                if (!d) return <div key={i} />
                const hoy = new Date().toISOString().slice(0, 10)
                const diso = iso(d)
                const isSel = diso === value
                const isHoy = diso === hoy
                return (
                  <div
                    key={i}
                    onClick={() => { onChange(diso); onToggle() }}
                    style={{
                      textAlign: 'center', padding: '5px 2px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      fontWeight: isSel ? 700 : 400,
                      background: isSel ? '#00afc5' : isHoy ? 'rgba(0,175,197,0.15)' : 'transparent',
                      color: isSel ? '#081318' : col.textPrimary,
                      border: isHoy && !isSel ? '1px solid rgba(0,175,197,0.4)' : '1px solid transparent',
                    }}
                  >
                    {d}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(0,175,197,0.1)', paddingTop: 8 }}>
              <button type="button" style={{ ...S.btn('ghost', true), fontSize: 10 }} onClick={() => { onChange(new Date().toISOString().slice(0, 10)); onToggle() }}>↖ hoy</button>
              <button type="button" style={{ ...S.btn('danger', true), fontSize: 10 }} onClick={() => { onChange(''); onToggle() }}>— borrar</button>
              <button type="button" style={{ ...S.btn('ghost', true), fontSize: 10 }} onClick={onToggle}>✕ cerrar</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const cmpNat = (a, b) => {
    const n = (s) => parseFloat((s || '').match(/^(\d+(\.\d+)?)/)?.[1] ?? '9999')
    const na = n(a)
    const nb = n(b)
    return na !== nb ? na - nb : (a || '').localeCompare(b || '', 'es')
  }
  const subsFiltrados = subs.filter((s) => !filtro
    || (s.razon_social || '').toLowerCase().includes(filtro.toLowerCase())
    || (s.nit || '').includes(filtro)
    || (s.nombre_contacto || '').toLowerCase().includes(filtro.toLowerCase()))
  const capsUnicos = [...new Set(listadoPrecios.map((i) => i.capitulo).filter(Boolean))].sort(cmpNat)
  const itemsBusq = listadoPrecios.filter((i) => {
    if (busqCapitulo && i.capitulo !== busqCapitulo) return false
    if (busqTexto && !(`${i.descripcion || ''} ${i.item_numero || ''}`).toLowerCase().includes(busqTexto.toLowerCase())) return false
    return true
  })

  const ssPeriodoPendiente = (() => {
    const chk = genCorteEstado?.pendiente?.checklist || genCorteEstado?.checklist
    return chk?.periodo_seguridad_social
      || (genCorteEstado?.pendiente?.fecha_inicio_pendiente || '').slice(0, 7)
      || ''
  })()

  const faltantesLabels = (() => {
    const chk = genCorteEstado?.pendiente?.checklist || genCorteEstado?.checklist
    return chk?.faltantes_labels || []
  })()

  if (!contratoId) return <div style={S.empty}>No hay contrato activo en tu sesión.</div>

  return (
    <div>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <span onClick={() => setMsg(null)} style={{ float: 'right', cursor: 'pointer', opacity: 0.6 }}>✕</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {perms?.crear && (
          <button
            type="button"
            style={S.btn('primary', true)}
            onClick={() => {
              setShowCrear(true)
              setCrearForm({ ...EMPTY_SUBCONTRATISTA_FORM })
              setStagedPolizas([])
              setStagedDocs([])
            }}
          >
            + Crear Subcontratista
          </button>
        )}
        <input
          style={{ ...S.input, padding: '10px 12px', fontSize: 16, flex: '1 1 180px', maxWidth: 300, minHeight: 44 }}
          placeholder="Buscar razón social, NIT, contacto…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        {subs.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: col.textMuted }}>
            {subs.length.toLocaleString('es-CO')} subcontratistas
          </span>
        )}
      </div>

      {loading ? (
        <div style={S.empty}><span style={{ color: '#00afc5' }}>Cargando...</span></div>
      ) : subs.length === 0 ? (
        <div style={S.empty}>
          No hay subcontratistas registrados.
          <br />
          <span style={{ fontSize: 12, color: col.textMuted }}>Usa &quot;Crear Subcontratista&quot; para agregar uno.</span>
        </div>
      ) : (
        <div className="cc-admin-table-scroll">
          <table style={{ ...S.table, minWidth: 640 }}>
            <thead>
              <tr>
                {['Razón Social', 'Nombre de Contacto', 'NIT', 'Pólizas', 'Estado'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subsFiltrados.map((sub) => {
                const badge = nivelPolizaBadge(sub.poliza_alerta)
                return (
                  <tr
                    key={sub.id}
                    onClick={() => abrirDetalle(sub)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,175,197,0.05)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, color: col.textPrimary }}>{sub.razon_social}</td>
                    <td style={tdStyle}>{sub.nombre_contacto || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: col.textSecondary }}>{sub.nit || '—'}</td>
                    <td style={tdStyle}>
                      {badge.show ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 20,
                          fontSize: 'var(--cc-caption)',
                          fontWeight: 600,
                          background: badge.background,
                          color: badge.color,
                        }}
                        >
                          {badge.label}
                        </span>
                      ) : (
                        <span style={{ color: col.textMuted, fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={S.badge(sub.activo ? 'aprobado' : 'rechazado')}>
                        {sub.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL CREAR — Excel ancho (no cierra con clic fuera) */}
      {showCrear && (
        <div className="cc-admin-modal-overlay-fs" style={overlayStyle}>
          <div className="cc-admin-modal-fs" style={modalStyle(1100)}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={modalTitle}>Crear Subcontratista</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, marginTop: 2 }}>
                  Datos, pólizas y documentos contractuales
                </div>
              </div>
              <button type="button" style={{ ...S.closeBtn, minWidth: 44, minHeight: 44 }} onClick={() => setShowCrear(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <SubcontratistaFormSheet
                theme={theme}
                token={token}
                mode="create"
                form={crearForm}
                onChange={setCrearForm}
                canEdit={!!perms?.crear}
                stagedPolizas={stagedPolizas}
                onStagedPolizas={setStagedPolizas}
                stagedDocs={stagedDocs}
                onStagedDocs={setStagedDocs}
                onMsg={setMsg}
              />
            </div>
            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setShowCrear(false)}>Cancelar</button>
              <button type="button" style={S.btn('primary')} onClick={crearSub} disabled={creating}>
                {creating ? 'Creando...' : 'Crear Subcontratista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETALLE — no cierra con clic fuera */}
      {detalle && (
        <div className="cc-admin-modal-overlay-fs" style={overlayStyle}>
          <div className="cc-admin-modal-fs" style={modalStyle(1100)}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Subcontratista</div>
                  <div style={modalTitle}>{detalle.razon_social}</div>
                </div>
                <span style={S.badge(detalle.activo ? 'aprobado' : 'rechazado')}>{detalle.activo ? 'Activo' : 'Inactivo'}</span>
                {(() => {
                  const b = nivelPolizaBadge(detalle.poliza_alerta)
                  if (!b.show) return null
                  return (
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                      fontSize: 'var(--cc-caption)', fontWeight: 600,
                      background: b.background, color: b.color,
                    }}
                    >
                      {b.label}
                    </span>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {perms?.editar && (
                  <button
                    type="button"
                    style={{ ...S.btn(detalle.activo ? 'danger' : 'success', true), minHeight: 44 }}
                    onClick={toggleActivo}
                    disabled={toggling}
                  >
                    {toggling ? '...' : (detalle.activo ? 'Desactivar' : 'Activar')}
                  </button>
                )}
                <button type="button" style={{ ...S.closeBtn, minWidth: 44, minHeight: 44 }} onClick={() => setDetalle(null)}>✕</button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${tTok.border}`,
              background: isDarkMode(theme) ? '#081318' : (isRestMode(theme) ? tTok.headerBg : '#E0F2FE'),
              flexShrink: 0,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              flexWrap: 'nowrap',
            }}
            >
              {[['datos', 'Datos'], ['cortes', 'Cortes'], ['precios', 'Precios']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTabDetalle(id)}
                  style={{
                    padding: '10px 20px', minHeight: 44, border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 13, fontWeight: tabDetalle === id ? 700 : 400,
                    color: tabDetalle === id ? tTok.primary : col.textSecondary,
                    borderBottom: tabDetalle === id ? `2px solid ${tTok.primary}` : '2px solid transparent',
                    transition: 'all 0.15s', whiteSpace: 'nowrap', flex: '0 0 auto',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={modalScroll}>
              {tabDetalle === 'datos' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    {perms?.editar && !editando && (
                      <button type="button" style={S.btn('ghost', true)} onClick={() => { setEditando(true); setEditForm({ ...detalle }) }}>
                        Editar datos
                      </button>
                    )}
                    {editando && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" style={S.btn('ghost', true)} onClick={() => setEditando(false)}>Cancelar</button>
                        <button type="button" style={S.btn('primary', true)} onClick={guardarEdicion} disabled={saving}>
                          {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    )}
                  </div>
                  <SubcontratistaFormSheet
                    theme={theme}
                    token={token}
                    mode="edit"
                    form={editando ? editForm : detalle}
                    onChange={setEditForm}
                    canEdit={!!perms?.editar && editando}
                    canEditDocs={!!(perms?.editar || perms?.crear)}
                    readOnlyHint={!editando}
                    subId={detalle.id}
                    onMsg={setMsg}
                  />
                </div>
              )}

              {tabDetalle === 'cortes' && (
                <div>
                  {genCorteEstado?.bloqueado && (
                    <div style={{ ...S.alert('warn'), marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Generación automática de corte bloqueada</div>
                      <div style={{ fontSize: 'var(--cc-caption)', marginBottom: 8 }}>
                        Falta documentación
                        {faltantesLabels.length ? `: ${faltantesLabels.join(', ')}` : ''}
                        {ssPeriodoPendiente ? ` · Período SS: ${ssPeriodoPendiente}` : ''}
                        {genCorteEstado?.pendiente?.fecha_inicio_pendiente
                          ? ` · Corte pendiente desde ${genCorteEstado.pendiente.fecha_inicio_pendiente}`
                          : ''}
                      </div>
                      <div style={{ fontSize: 'var(--cc-caption)', color: col.textMuted }}>
                        Complete Contrato/Propuesta en Datos. El pago de Seguridad Social se adjunta abriendo el corte correspondiente.
                      </div>
                      {(faltantesLabels.includes('Pago de Seguridad Social')
                        || faltantesLabels.includes('Pago Seguridad Social')
                        || (genCorteEstado?.pendiente?.checklist?.faltantes || []).includes('seguridad_social')) && (
                        <button
                          type="button"
                          style={{ ...S.btn('primary', true), marginTop: 8 }}
                          onClick={() => {
                            const ultimo = cortes.length ? cortes[cortes.length - 1] : null
                            const fi = genCorteEstado?.pendiente?.fecha_inicio_pendiente || ''
                            const ff = genCorteEstado?.pendiente?.fecha_fin_pendiente || ''
                            // Abrir último corte real si existe; si no, modal de período pendiente (SS sin corte_id)
                            const target = ultimo && !fi
                              ? ultimo
                              : {
                                  id: null,
                                  consecutivo: 'pendiente',
                                  tipo_periodo: ultimo?.tipo_periodo || 'quincenal',
                                  fecha_inicio: fi || ultimo?.fecha_fin || '',
                                  fecha_fin: ff || '',
                                }
                            setCorteDetalle(target)
                            setEditCorteForm({ fecha_fin: target.fecha_fin || '' })
                            setCalEditFf(false)
                          }}
                        >
                          Abrir corte / cargar planilla SS {ssPeriodoPendiente ? `(${ssPeriodoPendiente})` : ''}
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={secTitle}>Períodos de Facturación</div>
                    {perms?.crear && (
                      <button
                        type="button"
                        style={S.btn('primary', true)}
                        onClick={() => {
                          setShowCrearCorte(true)
                          cargarProximoConsecutivo(detalle.id)
                          setCalFiOpen(false)
                          setCalFfOpen(false)
                        }}
                      >
                        + Nuevo Corte
                      </button>
                    )}
                  </div>
                  {cortesLoading ? (
                    <div style={{ color: col.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando...</div>
                  ) : cortes.length === 0 ? (
                    <div style={S.empty}>No hay cortes registrados.</div>
                  ) : (
                    <div style={{ ...sheetUi.sheetWrap, maxHeight: 'min(420px, 48vh)' }}>
                      <table style={sheetUi.sheetTable}>
                        <thead>
                          <tr>
                            {['N° Corte', 'Tipo', 'Fecha Inicio', 'Fecha Fin'].map((h) => (
                              <th key={h} style={sheetUi.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cortes.map((c) => (
                            <tr
                              key={c.id}
                              onClick={() => {
                                setCorteDetalle(c)
                                setEditCorteForm({ fecha_fin: c.fecha_fin })
                                setCalEditFf(false)
                              }}
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = `${tTok.primary}12` }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <td style={{ ...sheetUi.td, fontWeight: 700, color: tTok.primary }}>#{c.consecutivo}</td>
                              <td style={sheetUi.td}>{c.tipo_periodo === 'quincenal' ? 'Quincenal' : 'Mensual'}</td>
                              <td style={sheetUi.td}>{c.fecha_inicio}</td>
                              <td style={sheetUi.td}>{c.fecha_fin}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tabDetalle === 'precios' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={secTitle}>Ítems de Cobro</div>
                    {perms?.crear && (
                      <button
                        type="button"
                        style={S.btn('primary', true)}
                        onClick={() => {
                          setShowAgregarItem(true)
                          setItemSel(null)
                          setBusqTexto('')
                          setBusqCapitulo('')
                          setPrecioSubForm('')
                          cargarListado()
                        }}
                      >
                        + Agregar Ítem
                      </button>
                    )}
                  </div>
                  {preciosLoading ? (
                    <div style={{ color: '#4a7a87', fontSize: 13 }}>Cargando...</div>
                  ) : preciosSub.length === 0 ? (
                    <div style={S.empty}>No hay ítems asignados.</div>
                  ) : (
                    <table style={S.table}>
                      <thead>
                        <tr>
                          {['Capítulo', 'Ítem', 'Descripción', 'Vlr. Referencia', 'Vlr. Subcontratista'].map((h) => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preciosSub.map((p) => (
                          <tr
                            key={p.id}
                            onClick={() => { setPrecioEdit(p); setEditPrecioVal(String(p.precio_unitario_sub)) }}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,175,197,0.05)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ ...tdStyle, fontSize: 12, color: col.textMuted }}>{p.capitulo || '—'}</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: col.textSecondary, fontSize: 12 }}>{p.item_numero || '—'}</td>
                            <td style={tdStyle}>{p.descripcion}</td>
                            <td style={{ ...tdStyle, fontSize: 12, color: col.textMuted, textAlign: 'right' }}>{fmt(p.precio_unitario_ref)}</td>
                            <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 700, textAlign: 'right' }}>{fmt(p.precio_unitario_sub)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR CORTE */}
      {showCrearCorte && (
        <div style={{ ...overlayStyle, zIndex: 10002 }}>
          <div style={{ ...modalStyle(540), minHeight: 'min(620px,88vh)' }}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={modalTitle}>Crear Nuevo Corte</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, marginTop: 2 }}>{detalle?.razon_social}</div>
              </div>
              <button type="button" style={S.closeBtn} onClick={() => setShowCrearCorte(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={labelStyle}>Tipo de Período *</div>
                  <select style={selectStyle} value={corteForm.tipo_periodo} onChange={(e) => setCorteForm((f) => ({ ...f, tipo_periodo: e.target.value }))}>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>N° Consecutivo (auto)</div>
                  <input style={{ ...inputStyle, opacity: 0.6 }} value={corteForm.consecutivo} disabled />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <div style={labelStyle}>Fecha Inicio *</div>
                  <CalPicker
                    value={corteForm.fecha_inicio}
                    onChange={(v) => setCorteForm((f) => ({ ...f, fecha_inicio: v }))}
                    isOpen={calFiOpen}
                    onToggle={() => { setCalFiOpen((o) => !o); setCalFfOpen(false) }}
                  />
                </div>
                <div>
                  <div style={labelStyle}>Fecha Fin *</div>
                  <CalPicker
                    value={corteForm.fecha_fin}
                    onChange={(v) => setCorteForm((f) => ({ ...f, fecha_fin: v }))}
                    isOpen={calFfOpen}
                    onToggle={() => { setCalFfOpen((o) => !o); setCalFiOpen(false) }}
                  />
                </div>
              </div>
              {corteForm.fecha_inicio && corteForm.fecha_fin && (
                <div style={{
                  background: 'rgba(0,175,197,0.06)', border: '1px solid rgba(0,175,197,0.2)',
                  borderRadius: 8, padding: '10px 14px', fontSize: 12, color: col.textSecondary,
                }}
                >
                  Corte #{corteForm.consecutivo} · {corteForm.tipo_periodo} · del <strong>{corteForm.fecha_inicio}</strong> al <strong>{corteForm.fecha_fin}</strong>
                </div>
              )}
            </div>
            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setShowCrearCorte(false)}>Cancelar</button>
              <button type="button" style={S.btn('primary')} onClick={crearCorte} disabled={creatingCorte}>
                {creatingCorte ? 'Creando...' : 'Crear Corte'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETALLE CORTE + SS del período */}
      {corteDetalle && (
        <div style={{ ...overlayStyle, zIndex: 10002 }}>
          <div style={modalStyle(640)}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={modalTitle}>
                  {corteDetalle.id != null ? `Corte #${corteDetalle.consecutivo}` : 'Corte pendiente'}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, marginTop: 2 }}>
                  {detalle?.razon_social} · {corteDetalle.tipo_periodo}
                  {periodoFromCorte(corteDetalle) ? ` · SS ${periodoFromCorte(corteDetalle)}` : ''}
                </div>
              </div>
              <button type="button" style={S.closeBtn} onClick={() => setCorteDetalle(null)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{ ...sheetUi.sheetWrap, maxHeight: 'none', marginBottom: 14 }}>
                <table style={sheetUi.sheetTable}>
                  <thead>
                    <tr>
                      <th style={sheetUi.th}>Campo</th>
                      <th style={sheetUi.th}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...sheetUi.td, fontWeight: 700, color: col.textMuted }}>Fecha Inicio</td>
                      <td style={sheetUi.td}>{corteDetalle.fecha_inicio || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ ...sheetUi.td, fontWeight: 700, color: col.textMuted }}>
                        Fecha Fin {perms?.editar && corteDetalle.id != null ? '(editable)' : ''}
                      </td>
                      <td style={sheetUi.td}>
                        {perms?.editar && corteDetalle.id != null ? (
                          <CalPicker
                            value={editCorteForm.fecha_fin}
                            onChange={(v) => setEditCorteForm((f) => ({ ...f, fecha_fin: v }))}
                            isOpen={calEditFf}
                            onToggle={() => setCalEditFf((o) => !o)}
                          />
                        ) : (
                          corteDetalle.fecha_fin || '—'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {perms?.editar && corteDetalle.id != null && (
                <div style={{ fontSize: 'var(--cc-caption)', color: '#f59e0b', marginBottom: 8 }}>
                  Al cambiar la fecha fin, el corte siguiente se recalculará automáticamente.
                </div>
              )}
              {detalle?.id && (corteDetalle.id != null || periodoFromCorte(corteDetalle)) && (
                <CorteSsBlock
                  theme={theme}
                  token={token}
                  subId={detalle.id}
                  corte={corteDetalle}
                  canEdit={!!(perms?.editar || perms?.crear)}
                  onMsg={setMsg}
                  onUploaded={() => {
                    cargarGenCorteEstado(detalle.id)
                    cargarCortes(detalle.id)
                  }}
                />
              )}
              {corteDetalle.id == null && (
                <div style={{ ...S.alert('warn'), marginTop: 8, fontSize: 'var(--cc-caption)' }}>
                  Corte aún no generado. Puede adjuntar la planilla SS del período pendiente arriba;
                  al completar Contrato/Propuesta, la generación automática creará el corte sin romper la secuencia.
                </div>
              )}
            </div>
            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setCorteDetalle(null)}>Cerrar</button>
              {perms?.editar && corteDetalle.id != null && (
                <button type="button" style={S.btn('primary')} onClick={guardarCorteEdit} disabled={savingCorte}>
                  {savingCorte ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AGREGAR ÍTEM */}
      {showAgregarItem && (
        <div style={{ ...overlayStyle, zIndex: 10002 }}>
          <div style={modalStyle(660)}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={modalTitle}>Agregar Ítem de Cobro</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, marginTop: 2 }}>Subcontratista: {detalle?.razon_social}</div>
              </div>
              <button type="button" style={S.closeBtn} onClick={() => setShowAgregarItem(false)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={labelStyle}>Capítulo</div>
                  <select
                    style={selectStyle}
                    value={busqCapitulo}
                    onChange={(e) => { setBusqCapitulo(e.target.value); setBusqTexto(''); setItemSel(null) }}
                  >
                    <option value="">Todos los capítulos</option>
                    {capsUnicos.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Buscar ítem o descripción</div>
                  <input
                    style={inputStyle}
                    value={busqTexto}
                    onChange={(e) => { setBusqTexto(e.target.value); setItemSel(null) }}
                    placeholder="Escribe para buscar..."
                  />
                </div>
              </div>
              {(busqTexto || busqCapitulo) && !itemSel && (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(0,175,197,0.2)', borderRadius: 8, marginBottom: 14 }}>
                  {itemsBusq.length === 0 ? (
                    <div style={{ padding: 14, textAlign: 'center', color: col.textMuted, fontSize: 13 }}>Sin resultados</div>
                  ) : itemsBusq.slice(0, 30).map((i) => (
                    <div
                      key={i.id}
                      onClick={() => { setItemSel(i); setBusqTexto(i.descripcion) }}
                      style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(0,175,197,0.08)', fontSize: 12 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,175,197,0.07)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ color: '#00afc5', fontWeight: 600, marginRight: 8 }}>{i.item_numero}</span>
                      <span style={{ color: col.textTable }}>{i.descripcion}</span>
                      <span style={{ color: col.textMuted, marginLeft: 8, fontSize: 11 }}>[{i.unidad}]</span>
                    </div>
                  ))}
                </div>
              )}
              {itemSel && (
                <div style={{ background: 'rgba(0,175,197,0.06)', border: '1px solid rgba(0,175,197,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 9, color: '#00afc5', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Ítem seleccionado</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['Ítem', itemSel.item_numero], ['Unidad', itemSel.unidad], ['Descripción', itemSel.descripcion], ['Vlr. Unitario Referencia', fmt(itemSel.precio_unitario)]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 9, color: '#4a7a87', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: col.textPrimary }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={labelStyle}>Valor Unitario Subcontratista *</div>
                <input
                  style={inputStyle}
                  type="number"
                  value={precioSubForm}
                  onChange={(e) => setPrecioSubForm(e.target.value)}
                  placeholder="Precio acordado con el subcontratista"
                />
              </div>
            </div>
            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setShowAgregarItem(false)}>Cancelar</button>
              <button type="button" style={S.btn('primary')} onClick={agregarPrecio} disabled={creatingPrecio}>
                {creatingPrecio ? 'Agregando...' : 'Agregar Ítem'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETALLE PRECIO */}
      {precioEdit && (
        <div style={{ ...overlayStyle, zIndex: 10002 }}>
          <div style={modalStyle(500)}>
            <CcModalBrandHeader theme={theme} />
            <div style={modalHead}>
              <div>
                <div style={modalTitle}>
                  {precioEdit.item_numero} — {(precioEdit.descripcion || '').substring(0, 38)}{(precioEdit.descripcion || '').length > 38 ? '...' : ''}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: col.textSecondary, marginTop: 2 }}>{detalle?.razon_social}</div>
              </div>
              <button type="button" style={S.closeBtn} onClick={() => setPrecioEdit(null)}>✕</button>
            </div>
            <div style={modalScroll}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[['Capítulo', precioEdit.capitulo], ['Competencia', precioEdit.competencia || '—'], ['Ítem', precioEdit.item_numero], ['Unidad', precioEdit.unidad]].map(([l, v]) => (
                  <div key={l} style={{ background: 'rgba(0,175,197,0.04)', border: '1px solid rgba(0,175,197,0.1)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 9, color: '#4a7a87', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: col.textPrimary }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={labelStyle}>Vlr. Unitario Referencia (Contrato)</div>
                  <div style={{ ...inputStyle, opacity: 0.55, pointerEvents: 'none', color: col.textSecondary }}>{fmt(precioEdit.precio_unitario_ref)}</div>
                </div>
                <div>
                  <div style={labelStyle}>Vlr. Unitario Subcontratista {perms?.editar ? '*' : ''}</div>
                  {perms?.editar ? (
                    <input style={inputStyle} type="number" value={editPrecioVal} onChange={(e) => setEditPrecioVal(e.target.value)} />
                  ) : (
                    <div style={{ ...inputStyle, opacity: 0.7, pointerEvents: 'none', color: '#22c55e', fontWeight: 700 }}>{fmt(precioEdit.precio_unitario_sub)}</div>
                  )}
                </div>
              </div>
            </div>
            <div style={modalFoot}>
              <button type="button" style={S.btn('ghost')} onClick={() => setPrecioEdit(null)}>Cerrar</button>
              {perms?.editar && (
                <button type="button" style={S.btn('primary')} onClick={guardarPrecioEdit} disabled={savingPrecio}>
                  {savingPrecio ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
