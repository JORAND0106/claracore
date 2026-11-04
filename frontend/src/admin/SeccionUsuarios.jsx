/**
 * Gestión de Usuarios — listado tipo Excel + ficha corporativa en popup.
 * Conserva el comportamiento previo (endpoints, estados, contratos, empresa, políticas).
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Save,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import CcConfirmModal from '../components/CcConfirmModal'
import { tFrom, buildContratoUiTheme } from '../theme/adminPanelTheme'
import { useClaraViewport } from '../useClaraViewport'
import {
  empresaFromKey,
  empresaKeyFromUsuario,
} from '../utils/empresaUsuario'
import { formatFechaHoraColombia } from '../utils/fechaColombia'
import {
  avatarColorFromName,
  inicialesUsuario,
  usuariosFichaTheme,
  usuariosSheetCssVars,
  usuariosSheetStyles,
  usuariosUi,
} from './usuariosSheetStyles'

const COLS = [
  'Usuario',
  'Estado',
  'Cargo',
  'Rol',
  'Contrato principal',
  'Empresa',
  'Políticas',
  'Acciones',
]

function IconBtn({ title, onClick, disabled, children, tok, active, compact }) {
  const size = compact ? 44 : 36
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        borderRadius: 8,
        border: `1px solid ${active ? (tok.primary || tok.border) : tok.border}`,
        background: active ? `${tok.primary || '#0077B6'}18` : tok.bgCard,
        color: disabled ? tok.textMuted : (active ? (tok.primary || tok.text) : tok.text),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

function FieldRow({ label, children, ficha }) {
  return (
    <tr>
      <td style={ficha.fieldLabel}>{label}</td>
      <td style={ficha.fieldValue}>{children}</td>
    </tr>
  )
}

function SectionBlock({ title, ficha, children, last }) {
  return (
    <section style={{ ...ficha.sectionCard, marginBottom: last ? 0 : 14 }}>
      <div style={ficha.sectionTitle}>
        <span style={ficha.sectionDot} aria-hidden />
        {title}
      </div>
      {children}
    </section>
  )
}

/**
 * @param {{ call: Function, cargos: Array, theme: string|object, userId?: any, focusUsuarioId?: any }} props
 */
export default function SeccionUsuarios({ call, cargos, theme, userId: _userId, focusUsuarioId = null }) {
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(null)
  const [fichaUid, setFichaUid] = useState(null)
  const [ucContratos, setUcContratos] = useState({})
  const [addingContrato, setAddingContrato] = useState({})
  const [empresasOpts, setEmpresasOpts] = useState({})
  const [verifInactBusy, setVerifInactBusy] = useState(false)
  const [highlightUid, setHighlightUid] = useState(null)
  const [confirmInact, setConfirmInact] = useState(false)
  const [confirmQuitar, setConfirmQuitar] = useState(null) // { uid, cid } — barra inline en la ficha
  const [hoverUid, setHoverUid] = useState(null)

  const { isMobile: vpMobile, isLandscapeMobile } = useClaraViewport()
  const adminCompact = vpMobile || isLandscapeMobile

  const tTok = tFrom(theme)
  const uiTheme = buildContratoUiTheme(theme, tTok)
  const sheetUi = usuariosSheetStyles(tTok)
  const sheetCssVars = usuariosSheetCssVars(tTok)
  const S = usuariosUi(theme, tTok)
  const estadoBadge = S.estadoColor

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [udata, rdata, cdata] = await Promise.all([
        call('GET', '/admin/todos-usuarios'),
        call('GET', '/roles').catch(() => []),
        call('GET', '/admin/contratos-resumen').catch(() => []),
      ])
      setUsuarios(udata)
      setRoles(rdata)
      setContratos(cdata)
      const initEdits = {}
      udata.forEach((u) => {
        initEdits[u.id] = {
          cargo_id: u.cargo_id || '',
          rol_id: u.rol_id || '',
          contrato_id: u.contrato_id || '',
          estado: u.estado || '',
          empresa_key: empresaKeyFromUsuario(u),
          politicas_aceptadas: u.politicas_aceptadas === true,
        }
      })
      setEdits((prev) => {
        const merged = { ...initEdits }
        Object.keys(prev).forEach((uid) => {
          if (merged[uid]) merged[uid] = { ...merged[uid], ...prev[uid] }
        })
        return merged
      })
    } catch (e) {
      if (!silent) setMsg({ type: 'error', text: e.message })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [call])

  useEffect(() => {
    cargar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focusUsuarioId == null || focusUsuarioId === '') return
    const id = String(focusUsuarioId)
    setHighlightUid(id)
    setFichaUid(Number.isFinite(Number(id)) ? Number(id) : id)
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-cc-admin-usuario="${id}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 350)
    const clear = setTimeout(() => setHighlightUid(null), 8000)
    return () => {
      clearTimeout(t)
      clearTimeout(clear)
    }
  }, [focusUsuarioId, usuarios.length])

  const cargarEmpresas = async (uid, contrato_id) => {
    if (!contrato_id) {
      setEmpresasOpts((p) => ({ ...p, [uid]: [] }))
      return
    }
    try {
      const data = await call('GET', `/admin/usuarios/empresas/${contrato_id}`)
      const opts = Array.isArray(data?.opciones) ? data.opciones : (Array.isArray(data) ? data : [])
      setEmpresasOpts((p) => ({ ...p, [uid]: opts }))
    } catch {
      setEmpresasOpts((p) => ({ ...p, [uid]: [] }))
    }
  }

  // Precargar opciones de Empresa por contrato
  useEffect(() => {
    usuarios.forEach((u) => {
      const cid = edits[u.id]?.contrato_id || u.contrato_id
      if (!cid) return
      if (empresasOpts[u.id]) return
      void cargarEmpresas(u.id, cid)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios, edits])

  const cargarUcContratos = async (uid) => {
    try {
      const data = await call('GET', `/admin/usuario-contratos/${uid}`)
      setUcContratos((p) => ({ ...p, [uid]: data }))
    } catch {
      setUcContratos((p) => ({ ...p, [uid]: [] }))
    }
  }

  const abrirFicha = (uid) => {
    setFichaUid(uid)
    cargarUcContratos(uid)
    const u = usuarios.find((x) => x.id === uid)
    if (u) {
      const cid = edits[uid]?.contrato_id || u.contrato_id
      if (cid) cargarEmpresas(uid, cid)
    }
  }

  const cerrarFicha = () => {
    setConfirmQuitar(null)
    setFichaUid(null)
  }

  const setEdit = (uid, field, val) => setEdits((e) => ({ ...e, [uid]: { ...e[uid], [field]: val } }))

  const toOptInt = (v) => {
    if (v === null || v === undefined || v === '') return null
    const s = String(v).trim().toLowerCase()
    if (!s || s === 'none' || s === 'null' || s === 'undefined' || s === 'nan') return null
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }

  const cargoNombreById = (cargoId) => {
    const c = cargos.find((x) => String(x.id) === String(cargoId))
    return (c?.nombre || '').trim()
  }

  const rolNombreById = (rolId) => {
    const r = roles.find((x) => String(x.id) === String(rolId))
    return (r?.nombre || '').trim()
  }

  const contratoNumeroById = (cid) => {
    const c = contratos.find((x) => String(x.id) === String(cid))
    return (c?.numero || '').trim()
  }

  const esCargoSubcontratistaEdit = (uid, u) => {
    const cargoId = edits[uid]?.cargo_id ?? u?.cargo_id
    const nombre = cargoNombreById(cargoId) || (u?.cargo_nombre || '')
    return String(nombre).trim().toLowerCase() === 'subcontratista'
  }

  const labelEmpresa = (uid, u) => {
    const key = edits[uid]?.empresa_key || empresaKeyFromUsuario(u)
    if (!key) return ''
    const opts = empresasOpts[uid] || []
    const hit = opts.find((s) => String(s.key) === String(key))
    return hit?.label || hit?.nombre || key
  }

  const guardar = async (uid, override = null) => {
    setSaving(uid)
    const e = { ...edits[uid], ...(override || {}) }
    const orig = usuarios.find((x) => x.id === uid)
    const emp = empresaFromKey(e.empresa_key)
    const payload = {
      cargo_id: toOptInt(e.cargo_id),
      rol_id: toOptInt(e.rol_id),
      contrato_id: toOptInt(e.contrato_id),
      estado: e.estado || null,
      empresa_tipo: emp.empresa_tipo,
      subcontratista_id: emp.subcontratista_id,
    }
    const cargoNom = cargoNombreById(payload.cargo_id) || (orig?.cargo_nombre || '')
    if (String(cargoNom).trim().toLowerCase() === 'subcontratista' && !payload.subcontratista_id) {
      setMsg({
        type: 'error',
        text: 'El cargo Subcontratista requiere seleccionar una empresa subcontratista del contrato.',
      })
      setSaving(null)
      return
    }
    if (orig && e.politicas_aceptadas !== undefined && e.politicas_aceptadas !== (orig.politicas_aceptadas === true)) {
      payload.politicas_aceptadas = e.politicas_aceptadas
    }
    try {
      await call('PUT', `/admin/usuarios/${uid}`, payload)
      if (override) setEdits((prev) => ({ ...prev, [uid]: { ...prev[uid], ...override } }))
      if (payload.estado === 'rechazado') {
        setMsg({
          type: 'success',
          text: 'Usuario rechazado: queda fuera de la lista (sin acceso, notificaciones ni actualizaciones).',
        })
        cerrarFicha()
      } else {
        setMsg({ type: 'success', text: 'Usuario actualizado.' })
      }
      await cargar(true)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(null)
    }
  }

  const ejecutarVerificarInactividad = async () => {
    setConfirmInact(false)
    setVerifInactBusy(true)
    try {
      const r = await call('POST', '/admin/verificar-inactividad')
      const n = r && typeof r.afectados === 'number' ? r.afectados : 0
      setMsg({
        type: 'success',
        text: n
          ? `Verificación completada: ${n} usuario(s) pasaron a pendiente por inactividad (revisa y reactiva si aplica).`
          : 'Verificación completada: ningún usuario afectado.',
      })
      await cargar(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'No se pudo ejecutar la verificación.' })
    } finally {
      setVerifInactBusy(false)
    }
  }

  const agregarContrato = async (uid) => {
    const cid = addingContrato[uid]
    if (!cid) return
    try {
      await call('POST', '/admin/usuario-contratos', { usuario_id: uid, contrato_id: parseInt(cid, 10) })
      setMsg({ type: 'success', text: 'Contrato asignado.' })
      cargarUcContratos(uid)
      setAddingContrato((p) => ({ ...p, [uid]: '' }))
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const quitarContratoConfirmado = async () => {
    if (!confirmQuitar) return
    const { uid, cid } = confirmQuitar
    setConfirmQuitar(null)
    try {
      await call('DELETE', `/admin/usuario-contratos/${uid}/${cid}`)
      cargarUcContratos(uid)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const onCargoChange = (uid, u, cargoId) => {
    setEdit(uid, 'cargo_id', cargoId)
    const cid = edits[uid]?.contrato_id || u.contrato_id
    if (cid) cargarEmpresas(uid, cid)
  }

  const onContratoChange = (uid, u, contratoId) => {
    setEdit(uid, 'contrato_id', contratoId)
    setEdit(uid, 'empresa_key', '')
    if (contratoId) cargarEmpresas(uid, contratoId)
  }

  const asignarEmpresa = async (uid, empresa_key) => {
    try {
      const emp = empresaFromKey(empresa_key)
      await call('PUT', `/admin/usuarios/${uid}`, {
        empresa_tipo: emp.empresa_tipo,
        subcontratista_id: emp.subcontratista_id,
      })
      setMsg({ type: 'success', text: 'Empresa asignada.' })
      setEdit(uid, 'empresa_key', empresa_key || '')
      await cargar(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const labelEstado = (est) => {
    if (est === 'pendiente') return 'Pendiente'
    if (est === 'aprobado') return 'Aprobado'
    if (est === 'rechazado') return 'Rechazado'
    return est || '—'
  }

  const politicasResumen = (u) => {
    const ok = edits[u.id]?.politicas_aceptadas === true || (edits[u.id]?.politicas_aceptadas === undefined && u.politicas_aceptadas === true)
    const ver = u.politicas_version ? `v${u.politicas_version}` : ''
    const fecha = u.politicas_fecha ? formatFechaHoraColombia(u.politicas_fecha) : ''
    return {
      texto: ok ? 'Sí' : 'Pendiente',
      detalle: [ver, fecha].filter(Boolean).join(' · '),
    }
  }

  const fichaUser = fichaUid != null ? usuarios.find((x) => String(x.id) === String(fichaUid)) : null
  const ficha = usuariosFichaTheme(theme, tTok)

  const fichaSelect = (extra = {}) => ({
    ...ficha.select,
    ...(adminCompact ? { minHeight: 44, fontSize: 16 } : {}),
    ...extra,
  })

  const renderFicha = (u) => {
    if (!u) return null
    const esSub = esCargoSubcontratistaEdit(u.id, u)
    const empresaKey = edits[u.id]?.empresa_key || ''
    const optsEmpresa = (empresasOpts[u.id] || []).filter((s) =>
      esSub ? String(s.tipo || '').toLowerCase() === 'subcontratista' : true
    )
    const keyExp = edits[u.id]?.empresa_key || empresaKeyFromUsuario(u)
    const labelExp = optsEmpresa.find((s) => String(s.key) === String(keyExp))?.label
      || optsEmpresa.find((s) => String(s.key) === String(keyExp))?.nombre
      || keyExp

    const est = edits[u.id]?.estado || u.estado || ''
    const cargoId = edits[u.id]?.cargo_id || u.cargo_id
    const rolId = edits[u.id]?.rol_id || u.rol_id
    const cargoNom = cargoNombreById(cargoId) || u.cargo_nombre || ''
    const rolNom = rolNombreById(rolId) || u.rol_nombre || ''
    const initials = inicialesUsuario(u.nombre, u.apellidos)
    const avatarBg = avatarColorFromName(u.nombre, u.apellidos, ficha.avatarColors)
    const avatarSize = adminCompact ? 56 : 64

    const modalNode = (
      <div
        style={{
          ...ficha.overlay,
          padding: adminCompact ? 0 : 16,
        }}
        role="presentation"
        data-cc-usuario-ficha-overlay="1"
      >
        <div
          className="cc-admin-modal-fs cc-admin-usuario-ficha"
          style={{
            width: adminCompact ? '100%' : 'min(740px, 98vw)',
            maxHeight: adminCompact ? '100dvh' : '94vh',
            height: adminCompact ? '100dvh' : undefined,
            borderRadius: adminCompact ? 0 : 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            ...sheetCssVars,
            fontSize: 'var(--cc-sm)',
            color: ficha.text,
            fontFamily: 'inherit',
            ...ficha.modal,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-usuario-ficha-title"
          onClick={(e) => e.stopPropagation()}
        >
          <CcModalBrandHeader theme={theme} />

          <div style={{ ...ficha.hero, flexShrink: 0 }}>
            <div style={ficha.heroAccent} aria-hidden />
            <div
              style={{
                padding: adminCompact ? '14px 14px 16px' : '16px 18px 18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: adminCompact ? 12 : 16,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  minWidth: avatarSize,
                  borderRadius: 16,
                  background: `linear-gradient(145deg, ${avatarBg}, ${ficha.primaryLight})`,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: adminCompact ? 18 : 22,
                  letterSpacing: '0.04em',
                  boxShadow: `0 8px 20px ${avatarBg}55`,
                  border: '2px solid rgba(255,255,255,0.35)',
                }}
              >
                {initials}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  id="cc-usuario-ficha-title"
                  style={{
                    fontSize: 'var(--cc-h2)',
                    fontWeight: 800,
                    color: ficha.text,
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {u.nombre} {u.apellidos}
                </div>
                <div
                  style={{
                    fontSize: 'var(--cc-sm)',
                    color: ficha.textMuted,
                    wordBreak: 'break-all',
                    marginTop: 4,
                    fontWeight: 500,
                  }}
                >
                  {u.email}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <span style={ficha.pill(est || 'neutral')}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: 'currentColor',
                        flexShrink: 0,
                      }}
                      aria-hidden
                    />
                    {labelEstado(est)}
                  </span>
                  {cargoNom ? (
                    <span style={ficha.pill('primary')} title="Cargo">{cargoNom}</span>
                  ) : null}
                  {rolNom ? (
                    <span style={ficha.pill('neutral')} title="Rol">{rolNom}</span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                style={{
                  ...ficha.closeBtn,
                  width: adminCompact ? 44 : 40,
                  height: adminCompact ? 44 : 40,
                  minWidth: adminCompact ? 44 : 40,
                  minHeight: adminCompact ? 44 : 40,
                }}
                title="Cerrar"
                aria-label="Cerrar"
                onClick={cerrarFicha}
              >
                <X size={18} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: adminCompact
                ? '12px 12px max(16px, env(safe-area-inset-bottom))'
                : '16px 18px 20px',
              WebkitOverflowScrolling: 'touch',
              background: theme === 'dark'
                ? 'rgba(0,0,0,0.12)'
                : theme === 'rest'
                  ? 'rgba(42,35,24,0.03)'
                  : 'rgba(0,119,182,0.03)',
            }}
          >
            <SectionBlock title="Identidad" ficha={ficha}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <tbody>
                  <FieldRow label="Nombre" ficha={ficha}>{u.nombre || '—'}</FieldRow>
                  <FieldRow label="Apellidos" ficha={ficha}>{u.apellidos || '—'}</FieldRow>
                  <FieldRow label="Correo" ficha={ficha}>{u.email || '—'}</FieldRow>
                </tbody>
              </table>
            </SectionBlock>

            <SectionBlock title="Estado y asignación" ficha={ficha}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <tbody>
                  <FieldRow label="Estado" ficha={ficha}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ ...ficha.pill(est || 'neutral'), alignSelf: 'flex-start' }}>
                        {labelEstado(est)}
                      </span>
                      <select
                        style={fichaSelect({ color: estadoBadge[edits[u.id]?.estado] || ficha.text })}
                        value={edits[u.id]?.estado || ''}
                        onChange={(e) => setEdit(u.id, 'estado', e.target.value)}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="rechazado">Rechazado (sale de la lista)</option>
                      </select>
                    </div>
                  </FieldRow>
                  <FieldRow label="Cargo" ficha={ficha}>
                    <select
                      style={fichaSelect()}
                      value={edits[u.id]?.cargo_id || ''}
                      onChange={(e) => onCargoChange(u.id, u, e.target.value)}
                    >
                      <option value="">Sin cargo</option>
                      {cargos.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Rol" ficha={ficha}>
                    <select
                      style={fichaSelect()}
                      value={edits[u.id]?.rol_id || ''}
                      onChange={(e) => setEdit(u.id, 'rol_id', e.target.value)}
                    >
                      <option value="">Sin rol</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.nombre}</option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Contrato principal" ficha={ficha}>
                    <select
                      style={fichaSelect()}
                      value={edits[u.id]?.contrato_id || ''}
                      onChange={(e) => onContratoChange(u.id, u, e.target.value)}
                    >
                      <option value="">Sin contrato</option>
                      {contratos.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero}</option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label={esSub ? 'Empresa *' : 'Empresa'} ficha={ficha}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        style={{ ...fichaSelect(), flex: '1 1 160px' }}
                        value={empresaKey}
                        onChange={(e) => setEdit(u.id, 'empresa_key', e.target.value)}
                        required={esSub}
                      >
                        <option value="">{esSub ? 'Seleccionar…' : 'Sin empresa'}</option>
                        {optsEmpresa.map((s) => (
                          <option key={s.key} value={s.key}>{s.label || s.nombre}</option>
                        ))}
                      </select>
                      <IconBtn
                        title="Asignar empresa"
                        tok={tTok}
                        compact={adminCompact}
                        onClick={() => void asignarEmpresa(u.id, edits[u.id]?.empresa_key)}
                      >
                        <ClipboardList size={16} strokeWidth={2.1} aria-hidden />
                      </IconBtn>
                    </div>
                    {esSub && !empresaKey && (
                      <div style={{ fontSize: 'var(--cc-caption)', color: ficha.warnColor, marginTop: 6, fontWeight: 700 }}>
                        Obligatorio (subcontratista)
                      </div>
                    )}
                    {keyExp ? (
                      <div style={{ fontSize: 'var(--cc-caption)', color: ficha.textMuted, marginTop: 6 }}>
                        Actual: {labelExp}
                      </div>
                    ) : null}
                  </FieldRow>
                  <FieldRow label="Políticas" ficha={ficha}>
                    <select
                      style={fichaSelect()}
                      value={edits[u.id]?.politicas_aceptadas ? 'si' : 'no'}
                      onChange={(e) => setEdit(u.id, 'politicas_aceptadas', e.target.value === 'si')}
                    >
                      <option value="si">Sí</option>
                      <option value="no">Pendiente</option>
                    </select>
                    <div style={{ fontSize: 'var(--cc-caption)', color: ficha.textMuted, marginTop: 6, lineHeight: 1.35 }}>
                      {u.politicas_version ? <>v{u.politicas_version}</> : '—'}
                      {u.politicas_fecha ? (
                        <span style={{ display: 'block' }}>
                          {formatFechaHoraColombia(u.politicas_fecha)}
                        </span>
                      ) : null}
                    </div>
                  </FieldRow>
                </tbody>
              </table>
            </SectionBlock>

            <SectionBlock title="Contratos autorizados" ficha={ficha} last>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {(ucContratos[u.id] || []).map((c) => (
                  <span key={c.id} style={{ ...S.chip, fontWeight: 700 }}>
                    {c.numero}
                    <button
                      type="button"
                      title={`Quitar contrato ${c.numero}`}
                      aria-label={`Quitar contrato ${c.numero}`}
                      onClick={() => setConfirmQuitar({ uid: u.id, cid: c.id, numero: c.numero })}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: ficha.dangerColor,
                        cursor: 'pointer',
                        padding: 2,
                        lineHeight: 1,
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {(ucContratos[u.id] || []).length === 0 && (
                  <span style={{ color: ficha.textMuted, fontSize: 'var(--cc-sm)' }}>Sin contratos asignados</span>
                )}
              </div>
              {confirmQuitar && String(confirmQuitar.uid) === String(u.id) ? (
                <div
                  style={{
                    marginBottom: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${ficha.dangerColor}55`,
                    background: `${ficha.dangerColor}14`,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 'var(--cc-sm)', color: ficha.text, lineHeight: 1.35, fontWeight: 600 }}>
                    ¿Quitar el contrato {confirmQuitar.numero || ''} al usuario?
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <IconBtn
                      title="Cancelar"
                      tok={tTok}
                      compact={adminCompact}
                      onClick={() => setConfirmQuitar(null)}
                    >
                      <X size={16} strokeWidth={2.1} aria-hidden />
                    </IconBtn>
                    <IconBtn
                      title="Quitar contrato"
                      tok={tTok}
                      compact={adminCompact}
                      onClick={() => void quitarContratoConfirmado()}
                    >
                      <XCircle size={16} strokeWidth={2.1} aria-hidden />
                    </IconBtn>
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  style={{
                    ...fichaSelect(),
                    minWidth: adminCompact ? '100%' : 180,
                    flex: adminCompact ? '1 1 100%' : '1 1 180px',
                  }}
                  value={addingContrato[u.id] || ''}
                  onChange={(e) => setAddingContrato((p) => ({ ...p, [u.id]: e.target.value }))}
                >
                  <option value="">+ Agregar contrato...</option>
                  {contratos.map((c) => (
                    <option key={c.id} value={c.id}>{c.numero}</option>
                  ))}
                </select>
                <IconBtn
                  title="Asignar contrato"
                  tok={tTok}
                  compact={adminCompact}
                  onClick={() => void agregarContrato(u.id)}
                >
                  <ClipboardList size={16} strokeWidth={2.1} aria-hidden />
                </IconBtn>
              </div>
            </SectionBlock>
          </div>

          <div style={ficha.foot}>
            <IconBtn
              title="Aprobar usuario"
              tok={tTok}
              compact={adminCompact}
              disabled={saving === u.id}
              onClick={() => void guardar(u.id, { estado: 'aprobado' })}
            >
              <CheckCircle2 size={18} strokeWidth={2.1} aria-hidden />
            </IconBtn>
            <IconBtn
              title="Rechazar usuario (sale de la lista)"
              tok={tTok}
              compact={adminCompact}
              disabled={saving === u.id}
              onClick={() => void guardar(u.id, { estado: 'rechazado' })}
            >
              <XCircle size={18} strokeWidth={2.1} aria-hidden />
            </IconBtn>
            <button
              type="button"
              style={{
                ...S.footBtn('primary'),
                width: adminCompact ? 44 : 40,
                height: adminCompact ? 44 : 40,
                minWidth: adminCompact ? 44 : 40,
                minHeight: adminCompact ? 44 : 40,
                opacity: saving === u.id ? 0.7 : 1,
                borderRadius: 10,
              }}
              title={saving === u.id ? 'Guardando…' : 'Guardar cambios'}
              aria-label={saving === u.id ? 'Guardando…' : 'Guardar cambios'}
              disabled={saving === u.id}
              onClick={() => void guardar(u.id)}
            >
              <Save size={18} strokeWidth={2.1} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    )

    if (typeof document === 'undefined') return modalNode
    return createPortal(modalNode, document.body)
  }

  return (
    <div style={sheetCssVars}>
      {msg && (
        <div style={S.alert(msg.type)}>
          {msg.text}
          <button
            type="button"
            onClick={() => setMsg(null)}
            title="Cerrar mensaje"
            aria-label="Cerrar mensaje"
            style={{
              float: 'right',
              cursor: 'pointer',
              opacity: 0.7,
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              padding: 2,
              lineHeight: 1,
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <IconBtn
          title="Verificar inactividad (7 días). Antes se ejecutaba sola al abrir esta pestaña y podía saturar el servidor. Úsala solo cuando quieras aplicar la política de 7 días."
          tok={tTok}
          compact={adminCompact}
          disabled={verifInactBusy}
          onClick={() => {
            cerrarFicha()
            setConfirmInact(true)
          }}
        >
          <Clock size={18} strokeWidth={2.1} aria-hidden />
        </IconBtn>
        <span style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, maxWidth: 560, lineHeight: 1.35 }}>
          Solo se listan usuarios <strong>pendientes</strong> y <strong>aprobados</strong>.
          Al marcar <strong>Rechazado</strong> el usuario sale de esta vista y deja de existir en el sistema
          (sin acceso, notificaciones ni actualizaciones).
        </span>
      </div>

      {loading ? (
        <div style={S.empty}><div style={{ color: tTok.primary }}>Cargando...</div></div>
      ) : usuarios.length === 0 ? (
        <div style={S.empty}>No hay usuarios pendientes o aprobados.</div>
      ) : (
        <div className="cc-admin-user-sheet" style={sheetUi.sheetWrap}>
          <table style={sheetUi.sheetTable}>
            <thead>
              <tr>
                {COLS.map((h) => (
                  <th key={h} style={sheetUi.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const est = edits[u.id]?.estado || u.estado
                const cargoId = edits[u.id]?.cargo_id || u.cargo_id
                const rolId = edits[u.id]?.rol_id || u.rol_id
                const contratoId = edits[u.id]?.contrato_id || u.contrato_id
                const pol = politicasResumen(u)
                const isFocus = highlightUid != null && String(u.id) === String(highlightUid)
                const isOpen = fichaUid != null && String(u.id) === String(fichaUid)
                const selected = isFocus || isOpen
                const hovered = hoverUid != null && String(u.id) === String(hoverUid)
                return (
                  <tr
                    key={u.id}
                    data-cc-admin-usuario={u.id}
                    onClick={() => abrirFicha(u.id)}
                    onMouseEnter={() => setHoverUid(u.id)}
                    onMouseLeave={() => setHoverUid(null)}
                    style={{
                      cursor: 'pointer',
                      background: selected
                        ? `${tTok.primary}14`
                        : hovered
                          ? `${tTok.primary}10`
                          : 'transparent',
                      outline: isFocus ? `2px solid ${tTok.primary}` : undefined,
                      outlineOffset: isFocus ? -2 : undefined,
                    }}
                  >
                    <td style={sheetUi.td}>
                      <div style={{ color: tTok.text, fontWeight: 600 }}>
                        {u.nombre} {u.apellidos}
                      </div>
                      <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted }}>{u.email}</div>
                    </td>
                    <td style={sheetUi.td}>
                      <span style={S.badge(est)}>{labelEstado(est)}</span>
                    </td>
                    <td style={sheetUi.td}>
                      {cargoNombreById(cargoId) || u.cargo_nombre || '—'}
                    </td>
                    <td style={sheetUi.td}>
                      {rolNombreById(rolId) || u.rol_nombre || '—'}
                    </td>
                    <td style={sheetUi.td}>
                      {contratoNumeroById(contratoId) || u.contrato_numero || '—'}
                    </td>
                    <td style={sheetUi.td}>
                      {labelEmpresa(u.id, u) || '—'}
                    </td>
                    <td style={sheetUi.td}>
                      <div>{pol.texto}</div>
                      {pol.detalle ? (
                        <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginTop: 2 }}>
                          {pol.detalle}
                        </div>
                      ) : null}
                    </td>
                    <td style={sheetUi.td} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <IconBtn
                          title="Abrir ficha del usuario"
                          tok={tTok}
                          compact={adminCompact}
                          active={isOpen}
                          onClick={() => abrirFicha(u.id)}
                        >
                          <UserRound size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                        <IconBtn
                          title="Guardar cambios"
                          tok={tTok}
                          compact={adminCompact}
                          disabled={saving === u.id}
                          onClick={() => void guardar(u.id)}
                        >
                          <Save size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                        <IconBtn
                          title="Gestionar contratos autorizados"
                          tok={tTok}
                          compact={adminCompact}
                          onClick={() => abrirFicha(u.id)}
                        >
                          <ClipboardList size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                        <IconBtn
                          title="Aprobar usuario"
                          tok={tTok}
                          compact={adminCompact}
                          disabled={saving === u.id}
                          onClick={() => void guardar(u.id, { estado: 'aprobado' })}
                        >
                          <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                        <IconBtn
                          title="Rechazar usuario (sale de la lista)"
                          tok={tTok}
                          compact={adminCompact}
                          disabled={saving === u.id}
                          onClick={() => void guardar(u.id, { estado: 'rechazado' })}
                        >
                          <XCircle size={16} strokeWidth={2.1} aria-hidden />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {fichaUser && renderFicha(fichaUser)}

      {confirmInact && (
        <CcConfirmModal
          theme={uiTheme.confirmTheme}
          tipo="warn"
          titulo="Verificar inactividad"
          confirmar="Ejecutar"
          cancelar="Cancelar"
          procesando={verifInactBusy}
          onCancel={() => !verifInactBusy && setConfirmInact(false)}
          onConfirm={() => void ejecutarVerificarInactividad()}
        >
          Esta acción revisa usuarios aprobados (excepto cargos de dirección/admin) con más de 7 días sin un registro LOGIN en el sistema, y los pone en estado pendiente / inactivos.
          {'\n\n'}
          ¿Ejecutar ahora?
        </CcConfirmModal>
      )}
    </div>
  )
}
