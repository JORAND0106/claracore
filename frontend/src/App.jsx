import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import AdminPanel from './AdminPanel'
import ModuloInformes from './ModuloInformes'
import ModuloInicio from './ModuloInicio'
import PerfilUsuarioModal from './PerfilUsuarioModal'
import PoliticasConfidencialidadModal from './PoliticasConfidencialidadModal'
import TrazabilidadRegistroModal from './TrazabilidadRegistroModal'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import ModuloPresupuesto from './modules/presupuesto/ModuloPresupuesto'
import EmojiPicker from './EmojiPicker'
import ExcelJS from 'exceljs'
import { API_BASE, logApiFailure } from './apiBase'

const _VITE_MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN
if (_VITE_MAPBOX) mapboxgl.accessToken = _VITE_MAPBOX

const API = API_BASE
/** Contratos donde el plano de filtros no usa GPS de reportes: solo agregación por PK (sin nodos naranja ni coords de reporte). .env: VITE_SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS=12,34 */
const SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS = new Set(
  String(import.meta.env.VITE_SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS || '')
    .split(/[,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => parseInt(s, 10))
    .filter(n => !Number.isNaN(n))
)
const POLITICAS_TEXTO_VERSION = '1.0'
const TEST_MODE = String(import.meta.env.VITE_TEST_MODE || '').toLowerCase() === 'true'

const themes = {
  light: {
    bg: '#F0F9FF', bgCard: '#FFFFFF', border: '#BAE6FD', text: '#0F2942',
    textMuted: '#4A7FA5', primary: '#0077B6', primaryLight: '#00B4C6',
    shadow: '0 2px 12px rgba(0,119,182,0.10)', headerBg: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.5)', inputBg: '#F8FAFC', inputBorder: '#BAE6FD',
    landingBg: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 50%, #BAE6FD 100%)',
  },
  dark: {
    bg: '#0A1628', bgCard: '#0F2038', border: '#1E3A5F', text: '#E0F2FE',
    textMuted: '#7FB3D3', primary: '#00B4C6', primaryLight: '#00D4E8',
    shadow: '0 2px 12px rgba(0,0,0,0.40)', headerBg: '#0F2038',
    overlay: 'rgba(0,0,0,0.75)', inputBg: '#0A1628', inputBorder: '#1E3A5F',
    landingBg: 'linear-gradient(135deg, #0A1628 0%, #0D1F3C 50%, #0F2038 100%)',
  },
  /** Tono papel/beige: menos contraste que blanco puro, pensado para lectura prolongada */
  rest: {
    bg: '#E8E0D5', bgCard: '#F2EDE4', border: '#C9B8A4', text: '#2A2318',
    textMuted: '#5C5346', primary: '#0E7490', primaryLight: '#14B8A6',
    shadow: '0 2px 12px rgba(42,35,24,0.08)', headerBg: '#EDE6DC',
    overlay: 'rgba(42,35,24,0.45)', inputBg: '#FAF6EF', inputBorder: '#C9B8A4',
    landingBg: 'linear-gradient(145deg, #EDE6DC 0%, #E5DDD0 45%, #D9CEC0 100%)',
  },
}

function getAutoTheme() {
  const hour = new Date().getHours()
  return (hour >= 7 && hour < 19) ? 'light' : 'dark'
}

/** Solo el modo oscuro “puro” usa mapa/estilos dark; claro, auto-día y descansar vista usan capa clara */
function themeIsDarkChrome(activeTheme) {
  return activeTheme === 'dark'
}

const THEME_MODE_STORAGE_KEY = 'claracore_theme_mode'
const THEME_MODES = ['light', 'auto', 'dark', 'rest']

function loadStoredThemeMode() {
  try {
    const m = localStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (m && THEME_MODES.includes(m)) return m
  } catch { /* ignore */ }
  return 'auto'
}

function capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
}

function getToken() {
  return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
}

function TestModeBadge() {
  if (!TEST_MODE) return null
  return (
    <div style={{
      position: 'fixed',
      top: 12,
      right: 12,
      zIndex: 100000,
      background: '#F59E0B',
      color: '#111827',
      border: '1px solid #D97706',
      borderRadius: '999px',
      padding: '6px 12px',
      fontSize: '11px',
      fontWeight: '800',
      letterSpacing: '0.4px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
    }}>
      ENTORNO LOCAL DE PRUEBA
    </div>
  )
}

// ─── MODAL BASE ───────────────────────────────────────────────────────────────
function Modal({ t, onClose, children, width = '460px' }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: t.overlay, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: t.bgCard, border: `1px solid ${t.border}`,
        borderRadius: '20px', padding: '40px', width, maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        animation: 'modalIn 0.25s ease'
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ─── INPUT HELPER ─────────────────────────────────────────────────────────────
function Field({ label, t, ...props }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <input style={{
        width: '100%', background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
        borderRadius: '10px', padding: '11px 14px', color: t.text, fontSize: '14px',
        outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s'
      }} {...props} />
    </div>
  )
}

function SelectField({ label, t, children, ...props }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <select style={{
        width: '100%', background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
        borderRadius: '10px', padding: '11px 14px', color: t.text, fontSize: '14px',
        outline: 'none', boxSizing: 'border-box', cursor: 'pointer'
      }} {...props}>
        {children}
      </select>
    </div>
  )
}

// ─── MODAL LOGIN ──────────────────────────────────────────────────────────────
function ModalLogin({ t, onClose, onLoginOk, onForgot }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mantener, setMantener] = useState(true)

  async function handleLogin() {
    if (!email || !password) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Credenciales incorrectas'); return }
      const storage = mantener ? localStorage : sessionStorage
      storage.setItem('cc_token', data.access_token)
      storage.setItem('cc_usuario', JSON.stringify(data.usuario))
      onLoginOk(data.usuario, data.access_token)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal t={t} onClose={onClose} width="420px">
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔐</div>
        <h2 style={{ color: t.primary, margin: 0, fontSize: '22px', fontWeight: '800' }}>Iniciar Sesión</h2>
        <p style={{ color: t.textMuted, margin: '8px 0 0', fontSize: '13px' }}>Accede a tu cuenta ClaraCore</p>
      </div>
      <Field label="CORREO ELECTRÓNICO" t={t} type="email" placeholder="tu@correo.com"
        value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="CONTRASEÑA" t={t} type="password" placeholder="••••••••"
        value={password} onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleLogin()} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input type="checkbox" id="mantener" checked={mantener} onChange={e => setMantener(e.target.checked)}
          style={{ width: '16px', height: '16px', accentColor: t.primary, cursor: 'pointer' }} />
        <label htmlFor="mantener" style={{ fontSize: '13px', color: t.textMuted, cursor: 'pointer' }}>
          Mantener sesión iniciada
        </label>
      </div>
      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
      <button onClick={handleLogin} disabled={loading} style={{
        width: '100%', background: t.primary, color: '#fff', border: 'none',
        borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: '700',
        cursor: loading ? 'wait' : 'pointer', marginBottom: '16px', opacity: loading ? 0.7 : 1
      }}>{loading ? 'Ingresando...' : 'Ingresar'}</button>
      <div style={{ textAlign: 'center' }}>
        <button onClick={onForgot} style={{ background: 'none', border: 'none', color: t.primary, fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>
    </Modal>
  )
}

// ─── MODAL CREAR CUENTA ───────────────────────────────────────────────────────
function ModalCrearCuenta({ t, onClose }) {
  const [form, setForm] = useState({ nombres: '', apellidos: '', email: '', cargo_id: '', contrato_id: '', password: '', confirmar: '' })
  const [cargos, setCargos] = useState([])
  const [contratos, setContratos] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API}/cargos`).then(r => r.json()).then(setCargos).catch(() => setCargos([]))
    fetch(`${API}/contratos`).then(r => r.json()).then(setContratos).catch(() => setContratos([]))
  }, [])

  // El cargo seleccionado determina si contrato es obligatorio
  const cargoSeleccionado = cargos.find(c => c.id === parseInt(form.cargo_id))
  const esDeveloper = cargoSeleccionado?.nombre === 'Desarrollador'
  const contratoObligatorio = !esDeveloper

  function set(key) {
    return e => {
      let val = e.target.value
      if (key === 'nombres' || key === 'apellidos') val = capitalize(val)
      setForm(f => ({ ...f, [key]: val }))
    }
  }

  async function handleRegistro() {
    if (!form.nombres || !form.apellidos || !form.email || !form.cargo_id || !form.password) {
      setError('Completa todos los campos obligatorios'); return
    }
    if (contratoObligatorio && !form.contrato_id) {
      setError('Debes seleccionar el contrato al que perteneces'); return
    }
    if (form.password !== form.confirmar) {
      setError('Las contraseñas no coinciden'); return
    }
    if (form.password.length < 8) {
      setError('La contraseña debe tener mínimo 8 caracteres'); return
    }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/usuarios/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombres,
          apellidos: form.apellidos,
          email: form.email,
          cargo_id: parseInt(form.cargo_id),
          contrato_id: form.contrato_id ? parseInt(form.contrato_id) : null,
          password: form.password
        })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Error al registrar'); return }
      setSuccess(true)
    } catch {
      setError('No se pudo conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <Modal t={t} onClose={onClose} width="420px">
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: t.primary, margin: '0 0 12px', fontSize: '22px' }}>¡Registro exitoso!</h2>
        <p style={{ color: t.textMuted, fontSize: '14px', lineHeight: '1.6' }}>
          Tu solicitud fue enviada. Un administrador asignará tu rol y activará tu cuenta.
        </p>
        <button onClick={onClose} style={{ marginTop: '24px', background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 32px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
          Entendido
        </button>
      </div>
    </Modal>
  )

  return (
    <Modal t={t} onClose={onClose} width="480px">
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>👤</div>
        <h2 style={{ color: t.primary, margin: 0, fontSize: '22px', fontWeight: '800' }}>Crear Cuenta</h2>
        <p style={{ color: t.textMuted, margin: '8px 0 0', fontSize: '13px' }}>Tu cuenta quedará pendiente de aprobación</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="NOMBRES *" t={t} placeholder="Juan Carlos" value={form.nombres} onChange={set('nombres')} />
        <Field label="APELLIDOS *" t={t} placeholder="Rodríguez Pérez" value={form.apellidos} onChange={set('apellidos')} />
      </div>

      <Field label="CORREO ELECTRÓNICO *" t={t} type="email" placeholder="tu@correo.com" value={form.email} onChange={set('email')} />

      <SelectField label="CARGO *" t={t} value={form.cargo_id} onChange={set('cargo_id')}>
        <option value="">-- Selecciona tu cargo --</option>
        {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </SelectField>

      {/* Contrato: obligatorio para todos excepto Desarrollador */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
          CONTRATO {contratoObligatorio ? '*' : '(opcional)'}
        </label>
        <select
          value={form.contrato_id}
          onChange={set('contrato_id')}
          style={{
            width: '100%', background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
            borderRadius: '10px', padding: '11px 14px',
            color: form.contrato_id ? t.text : t.textMuted,
            fontSize: '14px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer'
          }}
        >
          <option value="">-- Selecciona tu contrato --</option>
          {contratos.map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}
        </select>
        {contratoObligatorio && (
          <p style={{ fontSize: '11px', color: t.textMuted, margin: '5px 0 0' }}>
            El administrador asignará tu rol al aprobar tu cuenta.
          </p>
        )}
      </div>

      <Field label="CONTRASEÑA *" t={t} type="password" placeholder="Mínimo 8 caracteres" value={form.password} onChange={set('password')} />
      <Field label="CONFIRMAR CONTRASEÑA *" t={t} type="password" placeholder="Repite la contraseña" value={form.confirmar} onChange={set('confirmar')} />

      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: '10px', padding: '12px', color: t.textMuted, fontSize: '14px', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={handleRegistro} disabled={loading} style={{ flex: 2, background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Registrando...' : 'Crear Cuenta'}
        </button>
      </div>
    </Modal>
  )
}

// ─── MODAL OLVIDÉ CONTRASEÑA ──────────────────────────────────────────────────
function ModalOlvide({ t, onClose }) {
  const [email, setEmail] = useState('')
  const [paso, setPaso] = useState('email') // 'email' | 'enviado' | 'cambiar'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tempPass, setTempPass] = useState('')
  const [nuevaPass, setNuevaPass] = useState('')
  const [confirmarPass, setConfirmarPass] = useState('')

  async function handleSolicitar() {
    if (!email) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/solicitar-reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Error'); return }
      setPaso('enviado')
    } catch { setError('No se pudo conectar con el servidor') }
    finally { setLoading(false) }
  }

  async function handleVerificarAutorizacion() {
    if (!email) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/reset-autorizado?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (data.autorizado) { setPaso('cambiar') }
      else { setError('Aún no has sido autorizado por el administrador.') }
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }

  async function handleCambiar() {
    if (!tempPass || !nuevaPass || !confirmarPass) { setError('Completa todos los campos'); return }
    if (nuevaPass !== confirmarPass) { setError('Las contraseñas no coinciden'); return }
    if (nuevaPass.length < 8) { setError('Mínimo 8 caracteres'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/cambiar-password-temporal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, contrasena_temporal: tempPass, nueva_password: nuevaPass })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Error'); return }
      setPaso('listo')
    } catch { setError('No se pudo conectar') }
    finally { setLoading(false) }
  }

  if (paso === 'listo') return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: t.primary, margin: '0 0 12px', fontSize: '20px' }}>¡Contraseña actualizada!</h2>
        <p style={{ color: t.textMuted, fontSize: '14px' }}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <button onClick={onClose} style={{ marginTop: '24px', background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 32px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>Ingresar</button>
      </div>
    </Modal>
  )

  if (paso === 'enviado') return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>⏳</div>
        <h2 style={{ color: t.primary, margin: '0 0 8px', fontSize: '20px' }}>Solicitud enviada</h2>
        <p style={{ color: t.textMuted, fontSize: '13px', lineHeight: '1.6' }}>
          El administrador recibirá tu solicitud y te asignará una contraseña temporal. Cuando te lo indique, regresa aquí.
        </p>
      </div>
      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
      <button onClick={handleVerificarAutorizacion} disabled={loading} style={{ width: '100%', background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}>
        {loading ? 'Verificando...' : '🔍 Ya me autorizaron, continuar'}
      </button>
      <button onClick={onClose} style={{ width: '100%', background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: '10px', padding: '12px', color: t.textMuted, fontSize: '14px', cursor: 'pointer' }}>Cerrar</button>
    </Modal>
  )

  if (paso === 'cambiar') return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔐</div>
        <h2 style={{ color: t.primary, margin: 0, fontSize: '20px', fontWeight: '800' }}>Nueva Contraseña</h2>
        <p style={{ color: t.textMuted, margin: '8px 0 0', fontSize: '13px' }}>Ingresa la contraseña temporal que te dio el administrador</p>
      </div>
      <Field label="CONTRASEÑA TEMPORAL" t={t} type="password" placeholder="La que te dio el admin" value={tempPass} onChange={e => setTempPass(e.target.value)} />
      <Field label="NUEVA CONTRASEÑA" t={t} type="password" placeholder="Mínimo 8 caracteres" value={nuevaPass} onChange={e => setNuevaPass(e.target.value)} />
      <Field label="CONFIRMAR NUEVA CONTRASEÑA" t={t} type="password" placeholder="Repite la contraseña" value={confirmarPass} onChange={e => setConfirmarPass(e.target.value)} />
      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
      <button onClick={handleCambiar} disabled={loading} style={{ width: '100%', background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
        {loading ? 'Guardando...' : 'Guardar Nueva Contraseña'}
      </button>
    </Modal>
  )

  return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔑</div>
        <h2 style={{ color: t.primary, margin: 0, fontSize: '22px', fontWeight: '800' }}>Olvidé mi Contraseña</h2>
        <p style={{ color: t.textMuted, margin: '8px 0 0', fontSize: '13px' }}>El administrador te asignará una contraseña temporal</p>
      </div>
      <Field label="CORREO ELECTRÓNICO" t={t} type="email" placeholder="tu@correo.com"
        value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSolicitar()} />
      {error && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: '10px', padding: '12px', color: t.textMuted, fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSolicitar} disabled={loading || !email} style={{ flex: 2, background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: (!email || loading) ? 'not-allowed' : 'pointer', opacity: (!email || loading) ? 0.6 : 1 }}>
          {loading ? 'Enviando...' : 'Solicitar Reset'}
        </button>
      </div>
    </Modal>
  )
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ t, activeTheme, themeMode, onTheme, onLogin, onRegistro, onOlvide }) {
  return (
    <div style={{ minHeight: '100vh', width: '100%', background: t.landingBg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: '20px', right: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '6px', background: themeIsDarkChrome(activeTheme) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)', border: `1px solid ${t.border}`, borderRadius: '20px', padding: '4px', backdropFilter: 'blur(8px)', maxWidth: 'min(420px, 96vw)' }}>
        {['light', 'auto', 'dark', 'rest'].map((mode, i) => (
          <button key={mode} onClick={() => onTheme(mode)} style={{ background: themeMode === mode ? t.primary : 'transparent', color: themeMode === mode ? '#fff' : t.textMuted, border: 'none', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}>
            {['☀️ Claro', '⚡ Auto', '🌙 Oscuro', '🌿 Descansar'][i]}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ marginBottom: '16px', animation: 'fadeDown 0.6s ease' }}>
          <img
            src="/CLARA.CORE.png"
            alt="ClaraCore"
            className="cc-brand-logo cc-brand-logo--landing"
            style={{ filter: themeIsDarkChrome(activeTheme) ? 'brightness(0) invert(1)' : 'none' }}
          />
        </div>
        <p style={{ color: t.textMuted, fontSize: '16px', margin: '0 0 56px', letterSpacing: '0.5px', animation: 'fadeDown 0.7s ease', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
          Gestión inteligente de contratos de construcción
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '340px', animation: 'fadeUp 0.7s ease' }}>
          <button onClick={onLogin} style={{ background: t.primary, color: '#fff', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', boxShadow: `0 8px 24px rgba(0,119,182,0.35)`, transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '0.3px' }}
            onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = `0 12px 32px rgba(0,119,182,0.45)` }}
            onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = `0 8px 24px rgba(0,119,182,0.35)` }}>
            Iniciar Sesión
          </button>
          <button onClick={onRegistro} style={{ background: 'transparent', color: t.primary, border: `2px solid ${t.primary}`, borderRadius: '12px', padding: '14px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.target.style.background = t.primary; e.target.style.color = '#fff' }}
            onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = t.primary }}>
            Crear Cuenta
          </button>
          <button onClick={onOlvide} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '14px', cursor: 'pointer', padding: '8px', textDecoration: 'underline', transition: 'color 0.15s' }}
            onMouseEnter={e => e.target.style.color = t.primary}
            onMouseLeave={e => e.target.style.color = t.textMuted}>
            Olvidé mi contraseña
          </button>
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '20px', color: t.textMuted, fontSize: '12px', opacity: 0.7 }}>
        ClaraCore © {new Date().getFullYear()} — Gestión de construcción
      </div>
      <style>{`
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  )
}


// ─── MAPA PORTADA (localización en consulta/edición de reporte) ───────────────
// Estilo outdoors: relieve y curvas de nivel; clic sigue actualizando coordenadas vía map.on('click').
function MapaPortada({ lat, lng, modoEdicion, onCoordsChange, t }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markerRef    = useRef(null)
  const modoRef      = useRef(modoEdicion)
  useEffect(() => { modoRef.current = modoEdicion }, [modoEdicion])

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const hasCoords = lat != null && lat !== '' && !isNaN(parseFloat(lat))
    const cLat = hasCoords ? parseFloat(lat) : 4.71
    const cLng = hasCoords ? parseFloat(lng) : -74.07
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [cLng, cLat],
      zoom: hasCoords ? 15 : 11
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map
    if (hasCoords) {
      markerRef.current = new mapboxgl.Marker({ color: '#0077B6' })
        .setLngLat([cLng, cLat]).addTo(map)
    }
    map.on('click', e => {
      if (!modoRef.current) return
      const nLat = e.lngLat.lat.toFixed(7)
      const nLng = e.lngLat.lng.toFixed(7)
      if (markerRef.current) {
        markerRef.current.setLngLat([parseFloat(nLng), parseFloat(nLat)])
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#0077B6' })
          .setLngLat([parseFloat(nLng), parseFloat(nLat)]).addTo(mapRef.current)
      }
      onCoordsChange(nLat, nLng)
    })
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const la = parseFloat(lat), lo = parseFloat(lng)
    if (isNaN(la) || isNaN(lo)) return
    if (markerRef.current) {
      markerRef.current.setLngLat([lo, la])
    } else {
      markerRef.current = new mapboxgl.Marker({ color: '#0077B6' })
        .setLngLat([lo, la]).addTo(mapRef.current)
    }
    mapRef.current.flyTo({ center: [lo, la], zoom: 15, duration: 800 })
  }, [lat, lng])

  const hasCoords = lat != null && lat !== '' && !isNaN(parseFloat(lat))
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', minHeight:'340px', borderRadius:'10px', overflow:'hidden', border:`1px solid ${t.border}` }}>
      <div ref={containerRef} style={{ width:'100%', height:'100%', minHeight:'340px' }} />
      {!hasCoords && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:`${t.bgCard}EE`, gap:'8px', pointerEvents:'none' }}>
          <span style={{ fontSize:'36px' }}>📍</span>
          <span style={{ fontSize:'12px', color:t.textMuted, textAlign:'center', padding:'0 20px' }}>
            {modoEdicion ? 'Haz clic en el mapa para fijar las coordenadas' : 'Sin coordenadas geográficas'}
          </span>
        </div>
      )}
      {modoEdicion && hasCoords && (
        <div style={{ position:'absolute', bottom:'36px', left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.75)', color:'#fff', borderRadius:'20px', padding:'5px 14px', fontSize:'11px', fontWeight:'600', whiteSpace:'nowrap', pointerEvents:'none' }}>
          🖱️ Clic en el mapa para actualizar la ubicación
        </div>
      )}
    </div>
  )
}

// ─── HELPER: NIVEL DE VALIDACIÓN ─────────────────────────────────────────────
function determinarNivelValidacion(usuario) {
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  const rol     = norm(usuario?.rol_nombre || usuario?.rol || '')
  const cargo   = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const permisos = usuario?.permisos || []
  const permRpt  = permisos.find(p =>
    (p.funcion_nombre || '').toLowerCase().includes('reporte de cantidades')
  )
  const puedeValidar = !!(permRpt?.validar)
  const puedeEditar  = !!(permRpt?.editar)

  const esContratista   = rol === 'contratista' || rol === 'operativo contratista'
  const esInterventoria = rol === 'interventoria' || rol === 'operativo interventoria'
  const esSubRol        = rol === 'subcontratista'

  const esOperativoContratista   = rol === 'operativo contratista'
  const esOperativoInterventoria = rol === 'operativo interventoria'
  const esApoyoTecnico           = esInterventoria && !puedeValidar &&
                                   (cargo.includes('apoyo') || cargo.includes('técnico') || cargo.includes('tecnico'))
  const esSubcontratista         = esSubRol || cargo.includes('subcontratista')
  const esSoloComentarista       = esOperativoInterventoria  // puede ver y comentar, no valida ni edita

  // Operativos y apoyo técnico no ven valores económicos.
  const verValoresEconomicos = !(esOperativoContratista || esOperativoInterventoria || esApoyoTecnico)

  let nivelValidacion = null
  const esDev = cargo.includes('desarrollador')

  if (esDev) {
    nivelValidacion = 1  // Dev ve nivel Inspector por defecto para capacitación
  } else if (esContratista && puedeValidar &&
      (cargo.includes('inspector') || cargo.includes('topógrafo') || cargo.includes('topografo'))) {
    nivelValidacion = 1
  } else if (esContratista && puedeValidar &&
      (cargo.includes('residente') || cargo.includes('director de obra'))) {
    nivelValidacion = 2
  } else if (esInterventoria && !esOperativoInterventoria && puedeValidar &&
      (cargo.includes('residente') || cargo.includes('director'))) {
    nivelValidacion = 3
  } else if (esApoyoTecnico) {
    // Apoyo técnico de interventoría opera como visor/comentarista de nivel 3.
    nivelValidacion = 3
  }

  const rolOrigen = esInterventoria ? 'interventoria'
                  : esSubRol        ? 'subcontratista'
                  : 'contratista'

  /** Residente de Costos u Obra: depura antes de que Interventoría vea el registro. */
  const puedePrevalidarAntesInterv = esContratista && puedeValidar &&
    (cargo.includes('residente de costos') || cargo.includes('residente de obra'))

  return {
    nivelValidacion, puedeEditar, puedeValidar, esApoyoTecnico, esSubcontratista, esSoloComentarista,
    verValoresEconomicos, rolOrigen, esInterventoria, puedePrevalidarAntesInterv,
  }
}

// ─── POPUP COMENTARIO VALIDACIÓN ─────────────────────────────────────────────
const ETIQUETAS_VALIDACION = [
  '01. Ensayos de Laboratorio',
  '02. Certificados de Calidad',
  '03. Información y/o Entrega Topografía',
  '04. Entrega en obra',
  '05. Informe o Concepto Especialista',
  '06. Incluida dentro del precio',
  '07. Reportado en actas anteriores',
  '08. Pendiente por aprobación de precio',
  '09. Actividad sin concluir',
  '10. Precio no corresponde con la actividad',
  '11. Actualizar información',
  '12. Reproceso',
  '13. Actividad no ejecutada',
  '14. Relacionada con Balance de Obra',
]

const COLOR_ESTADO = { Aprobado: '#16a34a', Pendiente: '#d97706', Rechazado: '#dc2626', 'No Objeto de Cobro': '#dc2626', Mensaje: '#10B981', Comentario: '#0077B6' }

function PopupComentarioValidacion({ t, usuario, registro, contrato_id, API_URL, hdrs,
                                     estadoValidando, nivelValidacion, obligatorio,
                                     modoConversacion = false, zIndexOverlay = 2000,
                                     onConfirmar, onCancelar }) {
  const [usuarios,      setUsuarios]      = useState([])
  const [destinatarios, setDestinatarios] = useState([])
  const [busquedaDest,  setBusquedaDest]  = useState('')
  const [etiqueta,      setEtiqueta]      = useState('')
  const [asunto,        setAsunto]        = useState('')
  const [mensaje,       setMensaje]       = useState('')
  const [enlaceInput,   setEnlaceInput]   = useState('')
  const [enlaces,       setEnlaces]       = useState([])
  const [error,         setError]         = useState('')

  const esObligatorio = modoConversacion
    ? !!obligatorio
    : (obligatorio || estadoValidando === 'Pendiente' || estadoValidando === 'Rechazado' || estadoValidando === 'No Objeto de Cobro')
  const colorEstado   = COLOR_ESTADO[estadoValidando] || t.primary
  const usuariosFiltrados = (() => {
    const q = busquedaDest.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter(u => {
      const nombre = `${u.nombre || ''} ${u.apellidos || ''}`.trim().toLowerCase()
      const cargo = `${u.cargo_nombre || u.cargo || ''}`.toLowerCase()
      return nombre.includes(q) || cargo.includes(q) || `${nombre} ${cargo}`.includes(q)
    })
  })()

  useEffect(() => {
    fetch(`${API_URL}/actas/${contrato_id}/usuarios-contrato`, { headers: hdrs })
      .then(r => r.json())
      .then(d => {
        const lista = Array.isArray(d) ? d : []
        const ordenada = lista.slice().sort((a, b) => {
          const na = `${a?.nombre || ''} ${a?.apellidos || ''}`.trim()
          const nb = `${b?.nombre || ''} ${b?.apellidos || ''}`.trim()
          return na.localeCompare(nb, 'es', { sensitivity: 'base' })
        })
        setUsuarios(ordenada)
      })
      .catch(() => {})
  }, [])

  const toggleDestinatario = u => {
    setDestinatarios(prev =>
      prev.find(d => d.id === u.id) ? prev.filter(d => d.id !== u.id) : [...prev, u]
    )
  }

  const iS = {
    width: '100%', background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
    borderRadius: '10px', padding: '10px 13px', color: t.text, fontSize: '13px',
    outline: 'none', boxSizing: 'border-box',
  }

  const agregarEnlace = () => {
    const url = enlaceInput.trim()
    if (!url) return
    try { new URL(url) } catch { setError('URL no válida'); return }
    setEnlaces(prev => [...prev, url])
    setEnlaceInput('')
    setError('')
  }

  const validar = () => {
    if (esObligatorio) {
      if (!destinatarios.length) { setError('Indica al menos un destinatario (para quién va el mensaje).'); return false }
      if (!modoConversacion && !etiqueta) { setError('Selecciona una etiqueta de observación.'); return false }
      if (!mensaje.trim())       { setError('El cuerpo del mensaje es obligatorio.'); return false }
    }
    setError('')
    return true
  }

  const confirmar = () => {
    if (!validar()) return
    onConfirmar({
      destinatarios,
      etiqueta: modoConversacion ? null : etiqueta,
      asunto: asunto.trim() || null,
      mensaje,
      enlaces,
    })
  }

  const confirmarSinComentario = () => {
    onConfirmar(null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: zIndexOverlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancelar}>
      <div style={{
        background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '20px',
        width: '520px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${t.border}`,
                      display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: colorEstado, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: t.text }}>
              {modoConversacion ? 'Nueva conversación' : 'Comentario de validación'}
            </div>
            <div style={{ fontSize: '11px', color: colorEstado, fontWeight: '600', marginTop: '2px' }}>
              {modoConversacion
                ? `Registro #${registro?.numero_registro ?? '—'} · Nivel ${nivelValidacion}`
                : `Estado: ${estadoValidando} · Nivel ${nivelValidacion}`}
            </div>
          </div>
          <button onClick={onCancelar} style={{ marginLeft: 'auto', background: 'none', border: 'none',
            fontSize: '18px', color: t.textMuted, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Destinatarios */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '8px' }}>
              PARA (destinatario) {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
            </div>
            <input
              type="search"
              value={busquedaDest}
              onChange={e => setBusquedaDest(e.target.value)}
              placeholder="Buscar por nombre o cargo…"
              style={{ ...iS, marginBottom: '8px' }}
              autoComplete="off"
            />
            <div style={{ maxHeight: '140px', overflowY: 'auto', border: `1.5px solid ${t.inputBorder}`,
                          borderRadius: '10px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {usuarios.length === 0 && (
                <div style={{ fontSize: '12px', color: t.textMuted, padding: '4px' }}>Cargando usuarios…</div>
              )}
              {usuarios.length > 0 && usuariosFiltrados.length === 0 && (
                <div style={{ fontSize: '12px', color: t.textMuted, padding: '4px' }}>Ningún usuario coincide con la búsqueda.</div>
              )}
              {usuariosFiltrados.map(u => {
                const sel = !!destinatarios.find(d => d.id === u.id)
                return (
                  <div key={u.id} onClick={() => toggleDestinatario(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
                             borderRadius: '8px', cursor: 'pointer', background: sel ? `${colorEstado}18` : 'transparent',
                             border: sel ? `1px solid ${colorEstado}55` : '1px solid transparent' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                                  border: `2px solid ${sel ? colorEstado : t.inputBorder}`,
                                  background: sel ? colorEstado : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel && <span style={{ color: '#fff', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: t.text,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.nombre} {u.apellidos || ''}
                      </div>
                      <div style={{ fontSize: '10px', color: t.textMuted }}>{u.cargo_nombre || u.cargo || ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Etiqueta (no aplica en conversación nueva desde el módulo de comentarios) */}
          {!modoConversacion && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
                ETIQUETA {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
              </div>
              <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)} style={iS}>
                <option value=''>— Selecciona una etiqueta —</option>
                {[...ETIQUETAS_VALIDACION]
                  .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
                  .map(et => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </div>
          )}

          {/* Asunto (opcional) */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
              ASUNTO <span style={{ fontWeight: '400', textTransform: 'none' }}>(opcional)</span>
            </div>
            <input value={asunto} onChange={e => setAsunto(e.target.value)} style={iS}
                   placeholder='Opcional — asunto o referencia breve' />
          </div>

          {/* Mensaje */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
              MENSAJE {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
            </div>
            <textarea value={mensaje} onChange={e => setMensaje(e.target.value)}
                      rows={4} style={{ ...iS, resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder='Detalle del comentario…' />
          </div>

          {/* Enlaces */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
              ENLACES <span style={{ fontWeight: '400', textTransform: 'none' }}>(opcional)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={enlaceInput} onChange={e => setEnlaceInput(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && agregarEnlace()}
                     style={{ ...iS, flex: 1 }} placeholder='https://…' />
              <button onClick={agregarEnlace}
                style={{ padding: '10px 14px', background: t.primary, color: '#fff', border: 'none',
                         borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Agregar
              </button>
            </div>
            {enlaces.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {enlaces.map((url, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px',
                                        fontSize: '11px', color: t.primary }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                    <button onClick={() => setEnlaces(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer',
                               fontSize: '13px', lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ fontSize: '12px', color: '#dc2626', background: '#dc262612',
                          borderRadius: '8px', padding: '8px 12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${t.border}`,
                      display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancelar}
            style={{ padding: '10px 18px', background: 'none', border: `1.5px solid ${t.border}`,
                     borderRadius: '10px', color: t.textMuted, fontSize: '13px', cursor: 'pointer' }}>
            Cancelar
          </button>
          {!esObligatorio && !modoConversacion && (
            <button onClick={confirmarSinComentario}
              style={{ padding: '10px 18px', background: `${colorEstado}22`, border: `1.5px solid ${colorEstado}55`,
                       borderRadius: '10px', color: colorEstado, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              Confirmar sin comentario
            </button>
          )}
          <button onClick={confirmar}
            style={{ padding: '10px 18px', background: colorEstado, border: 'none',
                     borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            {modoConversacion ? 'Enviar mensaje' : 'Confirmar con comentario'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── HOJA REGISTRO ────────────────────────────────────────────────────────────
function HojaRegistro({ t, usuario, API_URL, contrato_id, reporte, registro, puedeEditar, seleccionado, onToggleSeleccion, onItemAsignado, hdrs, actasList = [],
  mostrarSeleccionValidacion = false, seleccionadoValidacion = false, onToggleSeleccionValidacion,
  esDeveloper = false, onDevEliminarRegistro = null, devEliminando = false }) {
  const [competencia,    setCompetencia]    = useState(registro.competencia    || '')
  const [itemBusqueda,   setItemBusqueda]   = useState(registro.item_numero || '')
  const [itemsLista,     setItemsLista]     = useState([])
  const [itemSel,        setItemSel]        = useState(registro.item_numero ? { item_numero: registro.item_numero, descripcion: registro.item_descripcion, unidad: registro.unidad, precio_unitario: registro.vlr_unitario, id: null } : null)
  const [mostrarLista,   setMostrarLista]   = useState(false)
  const [longitud,       setLongitud]       = useState(registro.longitud   ?? '')
  const [ancho,          setAncho]          = useState(registro.ancho      ?? '')
  const [espesor,        setEspesor]        = useState(registro.espesor    ?? '')
  const [cantidad,       setCantidad]       = useState(registro.cantidad   ?? '')
  const [guardando,      setGuardando]      = useState(false)
  const [asignando,      setAsignando]      = useState(false)
  const [buscando,       setBuscando]       = useState(false)
  const [competencias,   setCompetencias]   = useState([])
  const [itemListadoId,  setItemListadoId]  = useState(null)
  const [capituloHoja,   setCapituloHoja]   = useState(registro.capitulo || reporte.capitulo || '')
  const [listaCapitulos, setListaCapitulos] = useState([])
  const [todosLosItems,  setTodosLosItems]  = useState([])
  const [fotoLocal,      setFotoLocal]      = useState(registro.foto_url || null)
  const [uploadingFoto,  setUploadingFoto]  = useState(false)
  const [observacion,    setObservacion]    = useState(registro.observacion || '')
  const [subcontratistaSel, setSubcontratistaSel] = useState(registro.subcontratista_id || reporte.subcontratista_id || '')
  const [listaSubs,      setListaSubs]      = useState([])
  const [editandoSub,    setEditandoSub]    = useState(false)
  const [uploadingGraf,    setUploadingGraf]    = useState(false)
  const [modalGaleriaHoja, setModalGaleriaHoja] = useState(false)
  const graficoReporte = reporte.registros?.find(r => r.grafico_url) || null
  const [grafLocal,      setGrafLocal]      = useState(registro.grafico_url || graficoReporte?.grafico_url || null)
  const [mostrarPopupValidacion, setMostrarPopupValidacion] = useState(false)
  const [estadoValidando,        setEstadoValidando]        = useState('')
  const [toastMsg,               setToastMsg]               = useState(null)
  const [listaCortes,            setListaCortes]            = useState([])
  const [corteSel,               setCorteSel]               = useState('')
  const [guardandoCorte,         setGuardandoCorte]         = useState(false)
  const API = API_URL
  const nivelInfo = determinarNivelValidacion(usuario)
  const esNivel3Aprobado = registro?.nivel3_estado === 'Aprobado'
  const editableCampos = puedeEditar && !esNivel3Aprobado
  const soloCorteNivel3 = puedeEditar && esNivel3Aprobado

  useEffect(() => {
    setCorteSel(registro.corte_id != null ? String(registro.corte_id) : '')
  }, [registro.id, registro.corte_id])

  useEffect(() => {
    if (!soloCorteNivel3 || !reporte.subcontratista_id) {
      setListaCortes([])
      return
    }
    fetch(`${API}/subcontratistas/${reporte.subcontratista_id}/cortes`, { headers: hdrs })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setListaCortes(d); else setListaCortes([]) })
      .catch(() => setListaCortes([]))
  }, [soloCorteNivel3, reporte.subcontratista_id, API])

  // Paso 1: cargar capítulos al montar desde el listado completo (fuente confiable)
  // Si ya hay capítulo preseleccionado, también carga sus ítems de inmediato
  useEffect(() => {
    const sortCaps = caps => [...caps].sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)?.[1] || '9999')
      const nb = parseInt(b.match(/^(\d+)/)?.[1] || '9999')
      return na - nb
    })
    fetch(`${API}/listado-precios/${contrato_id}`, { headers: hdrs })
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d)) return
        const caps = [...new Set(d.map(i => i.capitulo).filter(Boolean))]
        setListaCapitulos(sortCaps(caps))
      })
      .catch(() => {})

    if (capituloHoja) {
      fetch(`${API}/sicoe-obra/${contrato_id}/listado-precios-busqueda?capitulo=${encodeURIComponent(capituloHoja)}&q=`, { headers: hdrs })
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setTodosLosItems(d) })
        .catch(() => {})
    }
  }, [])

  // Paso 2: cuando el usuario cambia de capítulo, cargar los ítems de ese capítulo
  useEffect(() => {
    if (!capituloHoja) { setTodosLosItems([]); setCompetencias([]); setItemsLista([]); return }
    fetch(`${API}/sicoe-obra/${contrato_id}/listado-precios-busqueda?capitulo=${encodeURIComponent(capituloHoja)}&q=`, { headers: hdrs })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTodosLosItems(d) })
      .catch(() => {})
  }, [capituloHoja])

  // Subir foto
  const subirFoto = async (file) => {
    setUploadingFoto(true)
    try {
      const numRes = await fetch(`${API}/sicoe-obra/${contrato_id}/next-foto`, { method:'POST', headers: hdrs }).then(r => r.json())
      const fd = new FormData(); fd.append('file', file); fd.append('numero', numRes.numero); fd.append('descripcion', '')
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/upload-foto`, { method:'POST', headers:{ Authorization: hdrs.Authorization }, body: fd }).then(r => r.json())
      await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}`, {
        method:'PUT', headers: hdrs,
        body: JSON.stringify({ reporte_id: registro.reporte_id, numero_registro: registro.numero_registro, foto_url: res.url, foto_numero: res.numero })
      })
      setFotoLocal(res.url)
    } catch(e) { alert('Error subiendo foto') }
    setUploadingFoto(false)
  }

  // Subir gráfico
  const subirGrafico = async (file) => {
    setUploadingGraf(true)
    try {
      const numRes = await fetch(`${API}/sicoe-obra/${contrato_id}/next-grafico`, { method:'POST', headers: hdrs }).then(r => r.json())
      const fd = new FormData(); fd.append('file', file); fd.append('numero', numRes.numero); fd.append('descripcion', '')
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/upload-grafico`, { method:'POST', headers:{ Authorization: hdrs.Authorization }, body: fd }).then(r => r.json())
      await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}`, {
        method:'PUT', headers: hdrs,
        body: JSON.stringify({ reporte_id: registro.reporte_id, numero_registro: registro.numero_registro, grafico_url: res.url, grafico_numero: res.numero })
      })
      setGrafLocal(res.url)
    } catch(e) { alert('Error subiendo gráfico') }
    setUploadingGraf(false)
  }

  const calcCantTotal = (l, a, e, c) => {
    const isEmpty = v => v === '' || v === null || v === undefined
    if (isEmpty(l) && isEmpty(a) && isEmpty(e) && isEmpty(c)) return 0
    const lv = !isEmpty(l) ? parseFloat(l) : 1
    const av = !isEmpty(a) ? parseFloat(a) : 1
    const ev = !isEmpty(e) ? parseFloat(e) : 1
    const cv = !isEmpty(c) ? parseFloat(c) : 1
    if (isNaN(lv) || isNaN(av) || isNaN(ev) || isNaN(cv)) return 0
    return Math.round(lv * av * ev * cv * 100) / 100
  }

  const cantTotal   = calcCantTotal(longitud, ancho, espesor, cantidad)
  const vlrUnitario = itemSel?.precio_unitario ?? registro.vlr_unitario ?? 0
  const costoDirecto = Math.round(cantTotal * vlrUnitario * 100) / 100

  const tieneCoordenadas = (reporte.puntos || []).length > 0

  // Derivar competencias y lista de ítems cuando cambian los ítems del capítulo o la competencia seleccionada
  useEffect(() => {
    if (!todosLosItems.length) return
    const comps = [...new Set(todosLosItems.map(i => i.competencia).filter(Boolean))].sort()
    setCompetencias(comps)
    const porComp = competencia ? todosLosItems.filter(i => i.competencia === competencia) : todosLosItems
    setItemsLista(porComp.slice(0, 50))
    setMostrarLista(false)
  }, [competencia, todosLosItems])

  // Filtrar ítems por texto client-side
  useEffect(() => {
    if (itemSel && itemBusqueda === itemSel.item_numero) return
    const porComp = competencia ? todosLosItems.filter(i => i.competencia === competencia) : todosLosItems
    if (!itemBusqueda) { setItemsLista(porComp.slice(0, 50)); setMostrarLista(false); return }
    const filtrados = porComp.filter(i =>
      `${i.item_numero} ${i.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase())
    ).slice(0, 50)
    setItemsLista(filtrados)
    setMostrarLista(filtrados.length > 0)
  }, [itemBusqueda, todosLosItems, competencia])

  useEffect(() => {
    if (!editandoSub || listaSubs.length > 0) return
    fetch(`${API}/sicoe-obra/${contrato_id}/subcontratistas-activos`, { headers: hdrs })
      .then(r => r.json()).then(d => setListaSubs(Array.isArray(d) ? d : [])).catch(() => {})
  }, [editandoSub])


  const seleccionarItem = (item) => {
    setItemSel(item)
    setItemListadoId(item.id)
    setItemBusqueda(item.item_numero)
    setItemsLista([])
    setMostrarLista(false)
  }

  const guardarCambios = async () => {
    const idItem = itemListadoId
    if (idItem && !tieneCoordenadas) {
      alert('Se requieren coordenadas topográficas. Diligéncialas en la Portada primero.')
      return
    }
    setGuardando(true)
    try {
      // 1. Guardar dimensiones + observacion
      const dimRes = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({
          reporte_id:      registro.reporte_id,
          numero_registro: registro.numero_registro,
          longitud:        longitud !== '' ? parseFloat(longitud) : null,
          ancho:           ancho    !== '' ? parseFloat(ancho)    : null,
          espesor:         espesor  !== '' ? parseFloat(espesor)  : null,
          cantidad:        cantidad !== '' ? parseFloat(cantidad) : null,
          cantidad_total:  cantTotal,
          observacion:     observacion || null,
        })
      })
      if (!dimRes.ok) throw new Error(`Error guardando dimensiones: ${dimRes.status}`)

      // 2. Si hay ítem nuevo seleccionado, verificar acta RPO y asignar
      if (idItem) {
        const actaRes = await fetch(`${API}/sicoe-obra/${contrato_id}/acta-rpo-vigente`, { headers: hdrs })
        const actaData = await actaRes.json()
        if (!actaData || !actaData.id) {
          alert('⚠️ No existe un Acta RPO vigente para la fecha de hoy.\n\nRegistra el periodo Acta RPO en el sistema (gestión de actas / administración del contrato) antes de asignar ítems.')
          setGuardando(false)
          return
        }
        const asigRes = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/asignar-item`, {
          method: 'PUT', headers: hdrs,
          body: JSON.stringify({ item_listado_id: idItem, competencia: competencia || null })
        })
        if (!asigRes.ok) {
          const err = await asigRes.json().catch(() => ({}))
          throw new Error(err.detail || `Error asignando ítem: ${asigRes.status}`)
        }
      }

      setToastMsg(itemSel ? `Ítem ${itemSel.item_numero} asignado correctamente` : 'Cambios guardados')
      setTimeout(() => { setToastMsg(null); onItemAsignado() }, 200)
    } catch(e) {
      alert(`No se pudieron guardar los cambios: ${e.message}`)
    }
    setGuardando(false)
  }

  const guardarCorte = async () => {
    setGuardandoCorte(true)
    try {
      const cid = corteSel === '' ? null : parseInt(corteSel, 10)
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}`, {
        method: 'PUT',
        headers: hdrs,
        body: JSON.stringify({
          reporte_id: registro.reporte_id,
          numero_registro: registro.numero_registro,
          corte_id: Number.isNaN(cid) ? null : cid,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const detail = err?.detail
        throw new Error(typeof detail === 'string' ? detail : `Error ${res.status}`)
      }
      setToastMsg('Corte actualizado')
      setTimeout(() => { setToastMsg(null); onItemAsignado() }, 200)
    } catch (e) {
      alert(e?.message || String(e))
    }
    setGuardandoCorte(false)
  }

  const ejecutarValidacion = (estado) => {
    const esAprobado = estado === 'Aprobado'
    setEstadoValidando(estado)
    // Aprobado sin obligatorio puede confirmarse directo, pero abrimos popup para dar opción
    setMostrarPopupValidacion(true)
  }

  const confirmarValidacion = async (comentarioData) => {
    setMostrarPopupValidacion(false)
    const nivel = nivelInfo.nivelValidacion
    if (!nivel) return
    // Perfil solo-comentar: registra comentario completo sin cambiar estado.
    if (!nivelInfo.puedeValidar) {
      if (!comentarioData) return
      const body = {
        ...comentarioData,
        rol_origen: nivelInfo.rolOrigen,
        tipo: 'validacion',
        nivel_validacion: nivel,
      }
      try {
        const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/comentarios`, {
          method: 'POST', headers: hdrs, body: JSON.stringify(body)
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const detail = err?.detail
          let msg = `Error ${res.status}`
          if (typeof detail === 'string') msg = detail
          else if (Array.isArray(detail)) msg = detail.map(x => x?.msg || JSON.stringify(x)).join(', ')
          else if (detail && typeof detail === 'object') msg = JSON.stringify(detail)
          else if (err?.message) msg = String(err.message)
          throw new Error(msg)
        }
        onItemAsignado()
      } catch (e) {
        const msg = e?.message || String(e)
        alert(`No se pudo guardar el comentario: ${msg}`)
      }
      return
    }
    const sufijo = nivel === 1 ? 'validar-nivel1' : nivel === 2 ? 'validar-nivel2' : 'validar-nivel3'
    const body = { estado: estadoValidando }
    if (comentarioData) body.comentario_data = { ...comentarioData, rol_origen: nivelInfo.rolOrigen }
    if (nivel === 2 && registro.nivel2_objeto_pago_sub !== undefined) {
      body.objeto_pago_sub = registro.nivel2_objeto_pago_sub
    }
    try {
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/${sufijo}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      onItemAsignado()
    } catch(e) {
      alert(`No se pudo aplicar la validación: ${e.message}`)
    }
  }

  const actualizarObjetoPagoSub = async (valor) => {
    try {
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/validar-nivel2`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ estado: registro.nivel2_estado || 'Pendiente', objeto_pago_sub: valor })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      onItemAsignado()
    } catch(e) {
      alert(`Error actualizando objeto de pago: ${e.message}`)
    }
  }

  const solicitarReversion = async () => {
    const motivo = prompt('Motivo de la solicitud de reversión:')
    if (motivo === null) return
    try {
      const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/solicitar-reversion`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ comentario_data: { mensaje: motivo, tipo: 'solicitud_reversion' } })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      onItemAsignado()
    } catch(e) {
      alert(`Error al solicitar reversión: ${e.message}`)
    }
  }

  const C = { borde: t.border, label: t.textMuted }
  const fmtD = v => v != null ? new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(v) : '—'

  const CampoRO = ({ label, valor, color }) => (
    <div>
      <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
      <div style={{ fontSize:'13px', color: color || t.text, fontWeight:'600', background:t.bgCard, borderRadius:'6px', padding:'6px 10px', border:`1px solid ${C.borde}` }}>
        {valor ?? <span style={{ color:C.label, fontStyle:'italic' }}>—</span>}
      </div>
    </div>
  )

  const CampoEdit = ({ label, value, onChange, placeholder }) => (
    <div>
      <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''}
        style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
    </div>
  )

  return (
    <div style={{
      background: t.bgCard, borderRadius:'12px', border:`2px solid ${seleccionado ? '#8B5CF6' : C.borde}`,
      padding:'20px', position:'relative', transition:'border 0.15s'
    }}>
      {/* ─ Header de la hoja ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            {mostrarSeleccionValidacion && (
              <input type="checkbox" checked={!!seleccionadoValidacion} onChange={onToggleSeleccionValidacion}
                title="Seleccionar para validación masiva"
                style={{ width:'16px', height:'16px', cursor:'pointer', accentColor:'#0d9488' }} />
            )}
            {editableCampos && (
              <input type="checkbox" checked={seleccionado} onChange={onToggleSeleccion}
                style={{ width:'16px', height:'16px', cursor:'pointer', accentColor:'#8B5CF6' }} />
            )}
            <span style={{ fontSize:'15px', fontWeight:'800', color:t.primary }}>📄 Registro #{registro.numero_registro}</span>
            {registro.item_numero && (
              <span style={{ background:`${t.primary}22`, color:t.primary, border:`1px solid ${t.primary}44`, borderRadius:'12px', padding:'2px 10px', fontSize:'11px', fontWeight:'700' }}>
                {registro.item_numero}
              </span>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'11px', color:t.textMuted }}>
            {(() => { try { const ts=registro.created_at; if (!ts) return ''; const n=/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?'':d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) } catch{return ''} })()}
            {esDeveloper && typeof onDevEliminarRegistro === 'function' && (
              <button type="button" disabled={devEliminando} onClick={() => onDevEliminarRegistro(registro.id)}
                title="Solo desarrollador: elimina este registro en base de datos"
                style={{
                  background:'transparent', border:'1px solid #F87171', color:'#F87171', borderRadius:'6px',
                  padding:'2px 8px', fontSize:'10px', fontWeight:'700', cursor: devEliminando ? 'not-allowed' : 'pointer', opacity: devEliminando ? 0.5 : 1,
                }}>
                🗑️ Dev
              </button>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {(() => {
            const actaNum = reporte.acta_rpo_numero ?? actasList.find(a => a.id === registro.acta_rpo_id)?.numero_rpo ?? null
            const corteNum = reporte.corte_numero ?? listaCortes.find(c => c.id === registro.corte_id)?.consecutivo ?? registro.corte_id ?? null
            return (<>
              <span style={{ display:'flex', alignItems:'center', gap:'5px', background: actaNum ? `${t.primary}15` : '#EF444415', border:`1px solid ${actaNum ? t.primary+'33' : '#EF444433'}`, borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color: actaNum ? t.primary : '#EF4444' }}>
                📋 {actaNum ? `RPO #${actaNum}` : 'Sin Acta RPO'}
              </span>
              {soloCorteNivel3 && reporte.subcontratista_id ? (
                <span style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', background:`${t.textMuted}12`, border:`1px solid ${t.border}`, borderRadius:'20px', padding:'4px 10px', fontSize:'11px', fontWeight:'700', color:t.textMuted }}>
                  <span style={{ marginRight:'4px' }}>📄 Corte subcontratista</span>
                  <select value={corteSel} onChange={e => setCorteSel(e.target.value)}
                    style={{ background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'4px 8px', color:t.text, fontSize:'11px', maxWidth:'220px' }}>
                    <option value="">— Sin corte —</option>
                    {listaCortes.map(c => (
                      <option key={c.id} value={String(c.id)}>Corte #{c.consecutivo ?? c.id}</option>
                    ))}
                  </select>
                  <button type="button" onClick={guardarCorte} disabled={guardandoCorte}
                    style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:'700', cursor: guardandoCorte ? 'not-allowed' : 'pointer', opacity: guardandoCorte ? 0.7 : 1 }}>
                    {guardandoCorte ? '...' : 'Guardar'}
                  </button>
                </span>
              ) : (
                <span style={{ display:'flex', alignItems:'center', gap:'5px', background:`${t.textMuted}15`, border:`1px solid ${t.border}`, borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color:t.textMuted }}>
                  📄 {corteNum != null ? `Corte #${corteNum}` : 'Sin Corte'}
                  {soloCorteNivel3 && !reporte.subcontratista_id && (
                    <span style={{ fontWeight:'600', fontSize:'10px', marginLeft:'6px', color:'#d97706' }}>(defina subcontratista en la portada)</span>
                  )}
                </span>
              )}
            </>)
          })()}
          {editableCampos ? (
            editandoSub ? (
              <span style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <select value={subcontratistaSel} onChange={e => setSubcontratistaSel(e.target.value)}
                  style={{ background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'3px 8px', color:t.text, fontSize:'11px' }}>
                  <option value="">— Sin subcontratista —</option>
                  {listaSubs.map(s => <option key={s.id} value={s.id}>{s.razon_social}</option>)}
                </select>
                <button onClick={async () => {
                  try {
                    await fetch(`${API}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`, {
                      method:'PUT', headers:hdrs,
                      body: JSON.stringify({ ...reporte, subcontratista_id: subcontratistaSel ? parseInt(subcontratistaSel) : null })
                    })
                    onItemAsignado()
                  } catch(e) { alert(`Error al guardar: ${e.message}`) }
                  setEditandoSub(false)
                }} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'3px 10px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                  Guardar
                </button>
                <button onClick={() => setEditandoSub(false)}
                  style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'3px 8px', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>
                  ✕
                </button>
              </span>
            ) : (
              <span onClick={() => setEditandoSub(true)} style={{ display:'flex', alignItems:'center', gap:'5px', background:'#8B5CF615', border:'1px solid #8B5CF633', borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color:'#8B5CF6', cursor:'pointer' }}>
                🏢 {reporte.subcontratista_nombre || 'Sin subcontratista'} ✏️
              </span>
            )
          ) : (
            <span style={{ display:'flex', alignItems:'center', gap:'5px', background:'#8B5CF615', border:'1px solid #8B5CF633', borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color:'#8B5CF6' }}>
              🏢 {reporte.subcontratista_nombre || 'Sin subcontratista'}
            </span>
          )}
        </div>
      </div>

      {esNivel3Aprobado && (
        <div style={{ marginBottom:'12px', background:'#0d948818', border:'1px solid #0d948855', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:t.text }}>
          Aprobado por Interventoría (Nivel 3): el registro está bloqueado; solo puede ajustarse el corte de subcontratista.
        </div>
      )}

      {/* ─ Sección: Asignación de Ítem ─ */}
      {(editableCampos || nivelInfo.nivelValidacion) && (
        <div style={{ background:t.bg, borderRadius:'10px', padding:'16px', marginBottom:'16px', border:`1px solid ${C.borde}` }}>
          <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>🔖 Asignación de Ítem</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'12px' }}>
            {/* Capítulo */}
            <div>
              <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Capítulo</div>
              <select value={capituloHoja} onChange={e => { setCapituloHoja(e.target.value); setCompetencia(''); setItemSel(null); setItemBusqueda('') }}
                disabled={!editableCampos}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px', opacity: editableCampos ? 1 : 0.65 }}>
                <option value="">— Selecciona —</option>
                {listaCapitulos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Competencia */}
            <div>
              <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Competencia</div>
              <select value={competencia} onChange={e => { setCompetencia(e.target.value); setItemSel(null); setItemBusqueda('') }}
                disabled={!editableCampos}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px', opacity: editableCampos ? 1 : 0.65 }}>
                <option value="">— Todas —</option>
                {competencias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Búsqueda de ítem */}
            <div style={{ position:'relative' }}>
              <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>
                Ítem {buscando ? '⏳' : ''}
              </div>
              <input
                value={itemBusqueda}
                onChange={e => { setItemBusqueda(e.target.value); setItemSel(null); setItemListadoId(null) }}
                onFocus={() => itemsLista.length > 0 && setMostrarLista(true)}
                placeholder="Buscar por número o descripción..."
                disabled={!editableCampos}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box', opacity: editableCampos ? 1 : 0.65 }}
              />
              {mostrarLista && itemsLista.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:100, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', maxHeight:'200px', overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                  {itemsLista.map(item => (
                    <div key={item.id} onClick={() => seleccionarItem(item)}
                      style={{ padding:'8px 12px', cursor:'pointer', borderBottom:`1px solid ${t.border}`, transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = t.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.primary }}>{item.item_numero}</div>
                      <div style={{ fontSize:'11px', color:t.text }}>{item.descripcion}</div>
                      <div style={{ fontSize:'11px', color:t.textMuted }}>{item.und} · {fmtD(item.precio_unitario)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Ítem seleccionado — info auto */}
          {itemSel && (
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'10px', marginTop:'12px' }}>
              <CampoRO label="Descripción"    valor={itemSel.descripcion} />
              <CampoRO label="Unidad"         valor={itemSel.unidad || null} />
              {nivelInfo.verValoresEconomicos && <CampoRO label="Vlr. Unitario"  valor={fmtD(itemSel.precio_unitario)} color='#10B981' />}
            </div>
          )}
        </div>
      )}

      {/* ─ Sección: Dimensiones y Cantidades ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:'#F59E0B', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>📏 Dimensiones y Cantidades</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:'10px' }}>
          {editableCampos ? (
            <>
              {[
                ['Longitud', longitud, setLongitud, 'm'],
                ['Ancho',    ancho,    setAncho,    'm'],
                ['Espesor',  espesor,  setEspesor,  'm'],
                ['Cantidad', cantidad, setCantidad, 'und'],
              ].map(([label, val, setter, ph]) => (
                <div key={label}>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
                  <input
                    value={val}
                    onChange={e => setter(e.target.value)}
                    placeholder={ph}
                    type="number"
                    step="any"
                    style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <CampoRO label="Longitud"  valor={registro.longitud} />
              <CampoRO label="Ancho"     valor={registro.ancho} />
              <CampoRO label="Espesor"   valor={registro.espesor} />
              <CampoRO label="Cantidad"  valor={registro.cantidad} />
            </>
          )}
          <CampoRO label="Cantidad Total"  valor={cantTotal.toFixed(2)} color={t.primary} />
          {nivelInfo.verValoresEconomicos && (
            <CampoRO label="Vlr. Unitario"   valor={vlrUnitario ? fmtD(vlrUnitario) : null} />
          )}
          {nivelInfo.verValoresEconomicos && (
            <CampoRO label="Costo Directo"   valor={costoDirecto ? fmtD(costoDirecto) : null} color='#10B981' />
          )}
        </div>
        <div style={{ marginTop:'10px' }}>
          {editableCampos ? (
            <div>
              <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Observación</div>
              <textarea
                value={observacion}
                onChange={e => setObservacion(e.target.value)}
                rows={2}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box', resize:'vertical' }}
              />
            </div>
          ) : (
            <CampoRO label="Observación" valor={observacion || null} />
          )}
        </div>
      </div>

      {/* ─ Sección: Abscisado y Nodos ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:'#F59E0B', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>📍 Abscisado y Nodos</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px' }}>
          <CampoRO label="Abs. Inicio"  valor={registro.abs_inicio} />
          <CampoRO label="Abs. Final"   valor={registro.abs_final} />
          <CampoRO label="Nodo Inicio"  valor={registro.no_inicio} />
          <CampoRO label="Nodo Final"   valor={registro.no_final} />
        </div>
      </div>    

      {/* ─ Sección: Coordenadas Topográficas ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:'#F59E0B', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'8px' }}>📐 Coordenadas Topográficas</div>
        {!tieneCoordenadas ? (
          <div style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'8px', padding:'12px 16px', color:'#EF4444', fontSize:'12px', fontWeight:'600' }}>
            ⚠️ Sin coordenadas topográficas. El topógrafo debe diligenciarlas en la Portada antes de asignar el ítem.
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:t.bg }}>
                  {['Punto','Norte','Este','Cota','Descripción'].map(h => (
                    <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:t.textMuted, fontWeight:'700', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(reporte.puntos || []).map((p, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.borde}` }}>
                    <td style={{ padding:'6px 10px', color:t.text, fontWeight:'700' }}>{p.punto || '—'}</td>
                    <td style={{ padding:'6px 10px', color:t.text }}>{p.norte ?? '—'}</td>
                    <td style={{ padding:'6px 10px', color:t.text }}>{p.este  ?? '—'}</td>
                    <td style={{ padding:'6px 10px', color:t.text }}>{p.cota  ?? '—'}</td>
                    <td style={{ padding:'6px 10px', color:t.textMuted }}>{p.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─ Sección: Registros Fotográficos ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>📷 Registros Fotográficos</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          {/* Foto de obra */}
          <div style={{ borderRadius:'8px', overflow:'hidden', border:`1px solid ${C.borde}` }}>
            {fotoLocal ? (
              <>
                <img src={fotoLocal} alt="Foto" style={{ width:'100%', maxHeight:'220px', objectFit:'cover', display:'block' }} />
                <div style={{ padding:'6px 10px', fontSize:'11px', color:t.textMuted, background:t.bg, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>📷 Foto #{registro.foto_numero ? String(registro.foto_numero).padStart(4,'0') : '—'}</span>
                  {editableCampos && (
                    <div style={{ display:'flex', gap:'8px' }}>
                      <label style={{ cursor:'pointer', color:t.primary, fontSize:'11px', fontWeight:'600' }}>
                        Cambiar
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f = e.target.files[0]; if (f) subirFoto(f) }} />
                      </label>
                      <button onClick={() => setModalGaleriaHoja(true)}
                        style={{ cursor:'pointer', color:t.primary, fontSize:'11px', fontWeight:'600', background:'none', border:'none', padding:0 }}>
                        📷 Galería
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', background:t.bg, borderRadius:'8px', overflow:'hidden', height:'160px' }}>
                <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:'6px', borderBottom:`1px solid ${t.border}`, cursor: editableCampos ? 'pointer' : 'default', opacity: editableCampos ? 1 : 0.65 }}>
                  {uploadingFoto
                    ? <span style={{ color:t.textMuted, fontSize:'12px' }}>⏳ Subiendo...</span>
                    : <>
                        <span style={{ fontSize:'28px' }}>📷</span>
                        <span style={{ fontSize:'11px', color:t.textMuted }}>Nueva foto</span>
                        <span style={{ fontSize:'11px', color:t.primary, fontWeight:'600' }}>Toca para cargar</span>
                      </>
                  }
                  <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingFoto || !editableCampos}
                    onChange={e => { const f = e.target.files[0]; if (f) subirFoto(f) }} />
                </label>
                {editableCampos && (
                <button onClick={() => setModalGaleriaHoja(true)}
                  style={{ padding:'8px', background:'transparent', border:'none', color:t.primary, fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>
                  🖼️ Usar foto de la galería
                </button>
                )}
              </div>
            )}
          </div>
          {/* Gráfico del reporte */}
          <div style={{ borderRadius:'8px', overflow:'hidden', border:`1px solid ${C.borde}` }}>
            {grafLocal ? (
              <>
                <img src={grafLocal} alt="Gráfico" style={{ width:'100%', maxHeight:'220px', objectFit:'cover', display:'block' }} />
                <div style={{ padding:'6px 10px', fontSize:'11px', color:t.textMuted, background:t.bg }}>
                  📐 Gráfico (compartido del reporte)
                </div>
              </>
            ) : (
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'160px', background:t.bg, cursor: editableCampos ? 'pointer' : 'default', gap:'8px', opacity: editableCampos ? 1 : 0.65 }}>
                {uploadingGraf
                  ? <span style={{ color:t.textMuted, fontSize:'12px' }}>⏳ Subiendo...</span>
                  : <>
                      <span style={{ fontSize:'32px' }}>📐</span>
                      <span style={{ fontSize:'12px', color:t.textMuted }}>Gráfico del reporte</span>
                      <span style={{ fontSize:'11px', color:t.primary, fontWeight:'600' }}>Toca para cargar</span>
                    </>
                }
                <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingGraf || !editableCampos}
                  onChange={e => { const f = e.target.files[0]; if (f) subirGrafico(f) }} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* ─ Modal galería foto ─ */}
      {modalGaleriaHoja && (
        <div style={{ position:'fixed', inset:0, zIndex:10500, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModalGaleriaHoja(false)}>
          <div style={{ background:t.bgCard, borderRadius:'16px', padding:'24px', width:'560px', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <span style={{ fontWeight:'800', color:t.text, fontSize:'15px' }}>🖼️ Galería de Fotos</span>
              <button onClick={() => setModalGaleriaHoja(false)} style={{ background:'none', border:'none', color:t.textMuted, fontSize:'18px', cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <GaleriaFotos
                contrato_id={contrato_id} API_URL={API} hdrs={hdrs}
                tipo="foto" fechaDesde="" fechaHasta=""
                onSelect={async (url, numero) => {
                  try {
                    await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}`, {
                      method:'PUT', headers: hdrs,
                      body: JSON.stringify({ reporte_id: registro.reporte_id, numero_registro: registro.numero_registro, foto_url: url, foto_numero: numero })
                    })
                    setFotoLocal(url)
                  } catch(e) { alert('Error asignando foto de galería') }
                  setModalGaleriaHoja(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─ Sección: Validación ─ */}
      {nivelInfo.nivelValidacion && nivelInfo.puedeValidar && (() => {
        const nv  = nivelInfo.nivelValidacion
        const bloqueado = !!registro.bloqueado
        const estadoActual = nv === 1 ? registro.nivel1_estado
                           : nv === 2 ? registro.nivel2_estado
                           : registro.nivel3_estado
        const BTNS = [
          { estado: 'Aprobado',  icon: '✅', color: '#16a34a' },
          { estado: 'Pendiente', icon: '🟡', color: '#d97706' },
          { estado: 'Rechazado', icon: '🔴', color: '#dc2626' },
          ...(nv === 2 ? [{ estado: 'No Objeto de Cobro', icon: '🚫', color: '#374151' }] : []),
        ]
        return (
          <div style={{ marginBottom:'16px', background:t.bg, borderRadius:'10px', padding:'16px', border:`1px solid ${C.borde}` }}>
            <div style={{ fontSize:'11px', fontWeight:'800', color:t.textMuted, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>
              🚦 Validación · Nivel {nv}
              {bloqueado && <span style={{ marginLeft:'8px', background:'#dc262615', color:'#dc2626', border:'1px solid #dc262633', borderRadius:'12px', padding:'2px 10px', fontSize:'10px' }}>🔒 Bloqueado</span>}
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {BTNS.map(({ estado, icon, color }) => {
                const activo = estadoActual === estado || (estado === 'No Objeto de Cobro' && estadoActual === 'Rechazado' && registro.nivel2_objeto_pago_sub === false)
                return (
                  <button key={estado} disabled={bloqueado}
                    onClick={() => ejecutarValidacion(estado)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
                      cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? 0.5 : 1,
                      background: activo ? `${color}22` : 'transparent',
                      color, border: activo ? `2.5px solid ${color}` : `1.5px solid ${color}55`,
                      transition: 'all 0.15s',
                    }}>
                    {icon} {estado}
                  </button>
                )
              })}
              {nv === 3 && bloqueado && (
                <button onClick={solicitarReversion}
                  style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:'700',
                           cursor:'pointer', background:'#7c3aed15', color:'#7c3aed',
                           border:'1.5px solid #7c3aed55' }}>
                  ↩️ Solicitar Reversión
                </button>
              )}
            </div>
            {nv === 2 && (
              <div style={{ marginTop:'12px', display:'flex', alignItems:'center', gap:'8px' }}>
                <input type="checkbox" id={`obj-pago-sub-${registro.id}`}
                  checked={!!registro.nivel2_objeto_pago_sub}
                  disabled={bloqueado}
                  onChange={e => actualizarObjetoPagoSub(e.target.checked)}
                  style={{ width:'16px', height:'16px', accentColor:'#8B5CF6', cursor: bloqueado ? 'not-allowed' : 'pointer' }} />
                <label htmlFor={`obj-pago-sub-${registro.id}`}
                  style={{ fontSize:'12px', fontWeight:'600', color:t.text, cursor: bloqueado ? 'not-allowed' : 'pointer' }}>
                  Objeto de pago al subcontratista
                </label>
              </div>
            )}
          </div>
        )
      })()}

      {/* ─ Sección: Solo comentar (sin validar) ─ */}
      {nivelInfo.nivelValidacion && !nivelInfo.puedeValidar && (nivelInfo.esSoloComentarista || nivelInfo.esApoyoTecnico) && (
        <div style={{ marginBottom:'16px', background:t.bg, borderRadius:'10px', padding:'16px', border:`1px solid ${C.borde}` }}>
          <div style={{ fontSize:'11px', fontWeight:'800', color:t.textMuted, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
            💬 Comentarios de validación · Nivel {nivelInfo.nivelValidacion}
          </div>
          <div style={{ fontSize:'12px', color:t.textMuted, marginBottom:'10px' }}>
            Este cargo no valida estados. Solo puede registrar comentarios dirigidos.
          </div>
          <button
            onClick={() => { setEstadoValidando('Comentario'); setMostrarPopupValidacion(true) }}
            style={{
              padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:'700',
              cursor:'pointer', background:`${t.primary}22`, color:t.primary, border:`1.5px solid ${t.primary}66`,
            }}
          >
            ✉️ Nuevo comentario
          </button>
        </div>
      )}

      {/* ─ Sección: Validación Sub ─ */}
      {nivelInfo.esSubcontratista && (() => {
        const bloqueado   = !!registro.bloqueado
        const estadoActual = registro.sub_estado || 'No Revisado'
        const COLOR_SUB   = { Aprobado:'#16a34a', Pendiente:'#d97706', Rechazado:'#dc2626', 'No Revisado':'#3B82F6' }
        const BTNS_SUB    = [
          { estado:'Aprobado',  icon:'✅', color:'#16a34a' },
          { estado:'Pendiente', icon:'🟡', color:'#d97706' },
          { estado:'Rechazado', icon:'🔴', color:'#dc2626' },
        ]
        const ejecutarValidacionSub = async (estado) => {
          try {
            const res = await fetch(`${API}/sicoe-obra/${contrato_id}/registros/${registro.id}/validar-sub`, {
              method: 'PUT', headers: hdrs, body: JSON.stringify({ estado })
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err.detail || `Error ${res.status}`)
            }
            setToastMsg(`✅ Registro ${estadoValidando.toLowerCase()} correctamente`)
            setTimeout(() => { setToastMsg(null); onItemAsignado() }, 2500)
          } catch(e) {
            alert(`No se pudo aplicar la validación: ${e.message}`)
          }
        }
        return (
          <div style={{ marginBottom:'16px', background:t.bg, borderRadius:'10px', padding:'16px', border:`1px solid ${C.borde}` }}>
            <div style={{ fontSize:'11px', fontWeight:'800', color:'#8B5CF6', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
              🔨 Mi Validación
              {bloqueado && !registro.nivel2_objeto_pago_sub && (
                <span style={{ marginLeft:'8px', background:'#dc262615', color:'#dc2626', border:'1px solid #dc262633', borderRadius:'12px', padding:'2px 8px', fontSize:'10px' }}>No objeto de pago</span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
              <span style={{ fontSize:'12px', color:t.textMuted }}>Estado actual:</span>
              <span style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:'700', color: COLOR_SUB[estadoActual] || '#3B82F6' }}>
                <span style={{ width:'10px', height:'10px', borderRadius:'50%', background: COLOR_SUB[estadoActual] || '#3B82F6' }} />
                {estadoActual}
              </span>
            </div>
            {registro.nivel2_objeto_pago_sub ? (
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                {BTNS_SUB.map(({ estado, icon, color }) => {
                  const activo = estadoActual === estado
                  return (
                    <button key={estado}
                      onClick={() => ejecutarValidacionSub(estado)}
                      style={{
                        padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:'700',
                        cursor:'pointer', background: activo ? `${color}22` : 'transparent',
                        color, border: activo ? `2.5px solid ${color}` : `1.5px solid ${color}55`,
                      }}>
                      {icon} {estado}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize:'12px', color:t.textMuted, fontStyle:'italic' }}>
                Este registro no está marcado como objeto de pago al subcontratista.
              </div>
            )}
          </div>
        )
      })()}

      {/* ─ Popup validación ─ */}
      {mostrarPopupValidacion && (
        <PopupComentarioValidacion
          t={t} usuario={usuario} registro={registro}
          contrato_id={contrato_id} API_URL={API} hdrs={hdrs}
          estadoValidando={estadoValidando}
          nivelValidacion={nivelInfo.nivelValidacion}
          obligatorio={!nivelInfo.puedeValidar || estadoValidando !== 'Aprobado'}
          onConfirmar={confirmarValidacion}
          onCancelar={() => setMostrarPopupValidacion(false)}
        />
      )}

      {/* ─ Acciones finales ─ */}
      {puedeEditar && (editableCampos || toastMsg) && (
        <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:'12px', borderTop:`1px solid ${C.borde}` }}>
          {toastMsg && (
            <div style={{
              position:'fixed', top:'50%', left:'50%',
              transform:'translateX(-50%) translateY(-50%)',
              background:'#0F6E56', color:'#E1F5EE', borderRadius:'16px',
              padding:'28px 40px', display:'flex', alignItems:'center', gap:'20px',
              zIndex:9999, minWidth:'420px', pointerEvents:'none',
              animation:'fadeUp 0.3s ease'
            }}>
              <svg width="40" height="40" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="#9FE1CB" strokeWidth="1.5"/>
                <path d="M6 10l3 3 5-5" stroke="#9FE1CB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <p style={{margin:0, fontSize:'22px', fontWeight:'700', color:'#E1F5EE'}}>Cambios guardados</p>
                <p style={{margin:0, fontSize:'16px', color:'#9FE1CB', marginTop:'4px'}}>{toastMsg}</p>
              </div>
            </div>
          )}
          <style>{`@keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(12px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>
          {editableCampos && (
          <button onClick={guardarCambios} disabled={guardando} style={{
            background: t.primary, color:'#fff', border:'none',
            borderRadius:'8px', padding:'8px 22px', fontSize:'12px', fontWeight:'700',
            cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1
          }}>{guardando ? 'Guardando...' : '💾 Guardar Cambios'}</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CARPETA REPORTE ──────────────────────────────────────────────────────────
function CarpetaReporte({ t, usuario, API_URL, contrato_id, reporte: repoProp, onClose, onActualizar, actasList = [], capasFiltroValidacion = null }) {
  const filtroValidacion = capasFiltroValidacion && capasFiltroValidacion[0] ? capasFiltroValidacion[0] : null
  const [reporte, setReporte]                     = useState(repoProp)
  const [registros, setRegistros]                 = useState(repoProp.registros || [])

  // Mapa cargo_id → campo de nivel en so_registros (debe coincidir con backend CARGO_ID_NIVEL_MAP)
  const CARGO_NIVEL_CAMPO = {
    54: 'nivel1_estado',
    44: 'nivel2_estado',
    45: 'nivel2_estado',
    51: 'nivel2_estado',
    56: 'nivel2_estado',
    50: 'nivel3_estado',
    58: 'nivel3_estado',
  }
  const CARGO_NIVEL_PREREQ = {
    'nivel2_estado': 'nivel1_estado',
    'nivel3_estado': 'nivel2_estado',
  }

  // Determinar si hay un filtro de validación activo para este usuario
  const camponivelActivo = filtroValidacion
    ? CARGO_NIVEL_CAMPO[filtroValidacion.cargo_id] || null
    : null
  const estadoFiltroActivo = filtroValidacion?.estado || null
  const prereqCampo = camponivelActivo ? CARGO_NIVEL_PREREQ[camponivelActivo] : null

  // Nivel 2/3: mismo criterio que backend — no cantidades en reporte Borrador / sin ítem asignado, ni registro sin item_numero
  const NIVEL_REQUIERE_REPORTE_PUBLICADO = { nivel2_estado: true, nivel3_estado: true }
  const reporteExcluidoValidacionAvanzada = ['Borrador', 'Sin Asignar Ítem'].includes(reporte?.estado)
  const registrosDominioValidacion = (() => {
    if (!camponivelActivo || !NIVEL_REQUIERE_REPORTE_PUBLICADO[camponivelActivo]) return registros
    if (reporteExcluidoValidacionAvanzada) return []
    return registros.filter(r => String(r.item_numero || '').trim())
  })()

  // Estado: mostrar solo pendientes o todos
  const [soloMisPendientes, setSoloMisPendientes] = useState(
    !!(camponivelActivo && estadoFiltroActivo)
  )
  // Mantiene visibles los registros ya cargados al entrar a la carpeta,
  // aunque cambien de estado durante esta misma sesión de validación.
  const [registrosAnclados, setRegistrosAnclados] = useState(new Set())

  // Función que determina si un registro cumple el filtro de validación activo
  const registroCumpleFiltro = (reg) => {
    if (!camponivelActivo || !estadoFiltroActivo) return true
    // Verificar prerrequisito
    if (prereqCampo && reg[prereqCampo] !== 'Aprobado') return false
    // Verificar estado del nivel
    const estadoActual = reg[camponivelActivo] || 'No Revisado'
    if (estadoFiltroActivo === 'No Revisado') {
      return estadoActual === 'No Revisado' || estadoActual === null
    }
    return estadoActual === estadoFiltroActivo
  }

  useEffect(() => {
    setRegistrosAnclados(new Set())
  }, [camponivelActivo, estadoFiltroActivo])

  useEffect(() => {
    if (!camponivelActivo || !estadoFiltroActivo || !soloMisPendientes) return
    setRegistrosAnclados(prev => {
      const next = new Set(prev)
      registrosDominioValidacion.filter(registroCumpleFiltro).forEach(r => next.add(r.id))
      return next
    })
  }, [registrosDominioValidacion, camponivelActivo, estadoFiltroActivo, soloMisPendientes])

  // Con filtro de validación activo: nivel 2/3 solo ven filas con nivel previo Aprobado.
  // "Ver todos" = todas las que ya pasaron el prerrequisito (cualquier estado en el nivel actual).
  const registrosMostrados = (!camponivelActivo || !estadoFiltroActivo)
    ? registros
    : soloMisPendientes
      ? registrosDominioValidacion.filter(r => registroCumpleFiltro(r) || registrosAnclados.has(r.id))
      : registrosDominioValidacion.filter(r => !prereqCampo || r[prereqCampo] === 'Aprobado')

  // Conteo de pendientes para mostrar en el badge del toggle
  const cantPendientes = registrosDominioValidacion.filter(registroCumpleFiltro).length

  const [tabActiva, setTabActiva]                 = useState('portada')
  const [guardandoEnlace, setGuardandoEnlace]     = useState(false)
  const parseEnlaces = (raw) => { if (!raw) return []; try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [raw] } catch { return raw ? [raw] : [] } }
  const [enlaces, setEnlaces]                      = useState(() => parseEnlaces(repoProp.enlace_soporte))
  const [enlaceInput, setEnlaceInput]              = useState('')
  const [editPkId, setEditPkId]                   = useState(repoProp.pk_id_id || '')
  const [editCivLocal, setEditCivLocal]            = useState(repoProp.civ || '')
  const [editTramoLocal, setEditTramoLocal]        = useState(repoProp.tramo || '')
  const [editCalzadaLocal, setEditCalzadaLocal]    = useState(repoProp.calzada || '')
  const [editInfraLocal, setEditInfraLocal]        = useState(repoProp.infraestructura || '')
  const [listaPkIds, setListaPkIds]               = useState([])
  const [seleccionados, setSeleccionados]         = useState([])
  const [seleccionadosValidacion, setSeleccionadosValidacion] = useState([])
  const [portadaResumenEstado, setPortadaResumenEstado]       = useState(null)
  const [registroExpandido, setRegistroExpandido] = useState(null)

  useEffect(() => {
    if (!repoProp?._autoRegistro) return
    const id = Number(repoProp._autoRegistro)
    setRegistroExpandido(id)
    const reg = (repoProp.registros || []).find(r => r.id === id)
    const tabTarget = reg?.item_numero || 'sin_asignar'
    setTabActiva(tabTarget)
    setTimeout(() => {
      const el = document.getElementById(`registro-${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }, [repoProp?._autoRegistro])
  const [modalMover, setModalMover]               = useState(false)
  const [reportesDisponibles, setReportesDisponibles] = useState([])
  const [reporteDestino, setReporteDestino]       = useState('')
  const [moviendoReg, setMoviendoReg]             = useState(false)
  const [creandoReg, setCreandoReg]               = useState(false)
  const [puntosEdit, setPuntosEdit]               = useState((repoProp.puntos || []).map(p => ({...p})))
  const [editandoTopo, setEditandoTopo]            = useState(false)
  const [guardandoTopo, setGuardandoTopo]          = useState(false)
  const [modoEdicion, setModoEdicion]              = useState(false)
  const [guardandoEdicion, setGuardandoEdicion]    = useState(false)
  const [editDesc, setEditDesc]                    = useState(repoProp.descripcion_actividad || '')
  const [editAbsInicio, setEditAbsInicio]          = useState(repoProp.abs_inicio ?? '')
  const [editAbsFinal, setEditAbsFinal]            = useState(repoProp.abs_final ?? '')
  const [editNodoIni, setEditNodoIni]              = useState(repoProp.nodo_ini || '')
  const [editNodoFin, setEditNodoFin]              = useState(repoProp.nodo_fin || '')
  const [editSubId, setEditSubId]                  = useState(repoProp.subcontratista_id || '')
  const [editInspId, setEditInspId]                = useState(repoProp.inspector_id || '')
  const [editCapitulo, setEditCapitulo]            = useState(repoProp.capitulo || '')
  const [editLat, setEditLat]                      = useState(repoProp.coord_lat ?? '')
  const [editLng, setEditLng]                      = useState(repoProp.coord_lng ?? '')
  const [listaSubs, setListaSubs]                  = useState([])
  const [listaInsp, setListaInsp]                  = useState([])
  const [listaCaps, setListaCaps]                  = useState([])
  const [listasLoaded, setListasLoaded]            = useState(false)
  const [modalComentarios, setModalComentarios]    = useState(null)   // { reg } o null
  const [popupNuevoComentObra, setPopupNuevoComentObra] = useState(null) // { reg } — crear conversación desde el modal
  const [modalTrazabilidadSicoe, setModalTrazabilidadSicoe] = useState(null) // { reg }
  const [comentariosData, setComentariosData]      = useState([])
  const [loadingComentarios, setLoadingComentarios] = useState(false)
  const [popupMasivo, setPopupMasivo]              = useState(null)   // { estado } o null
  const [msgMasivo, setMsgMasivo]                  = useState('')
  const [ejecutandoMasivo, setEjecutandoMasivo]    = useState(false)
  const [devEliminando, setDevEliminando]          = useState(false)

  // Sincronizar cuando el padre reemplaza el resumen de grilla por el detalle completo (apertura optimista)
  useEffect(() => {
    if (!repoProp?.id) return
    setReporte((prev) => ({ ...prev, ...repoProp }))
    if (Array.isArray(repoProp.registros)) setRegistros(repoProp.registros)
    if (Array.isArray(repoProp.puntos)) setPuntosEdit(repoProp.puntos.map((p) => ({ ...p })))
  }, [repoProp])

  const perm        = (usuario?.permisos || []).find(p => p.funcion_nombre === 'Reporte de Cantidades')
  const puedeEditar = perm?.editar
  const esDeveloper = (usuario?.cargo_nombre || '').toLowerCase() === 'desarrollador'
  const hdrs        = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
  const nivelInfo   = determinarNivelValidacion(usuario)

  const subIdEnCarpeta   = usuario?.subcontratista_id ?? usuario?.sub_id ?? null
  const registrosVisibles = nivelInfo.esSubcontratista
    ? registrosMostrados.filter(r => r.nivel2_objeto_pago_sub === true &&
        (subIdEnCarpeta === null || r.subcontratista_id === subIdEnCarpeta))
    : registrosMostrados

  // Ítems asignados únicos — cada uno genera un tab
  const itemsAsignados = [...new Set(registrosVisibles.filter(r => r.item_numero).map(r => r.item_numero))]
  const regsSinAsignar = registrosVisibles.filter(r => !r.item_numero)

  useEffect(() => {
    setSeleccionadosValidacion([])
    setMsgMasivo('')
  }, [tabActiva])

  const campoEstadoResumen = nivelInfo.nivelValidacion === 1 ? 'nivel1_estado'
    : nivelInfo.nivelValidacion === 2 ? 'nivel2_estado'
    : nivelInfo.nivelValidacion === 3 ? 'nivel3_estado'
    : null

  const normalizarEstadoParaConteo = (r) => {
    if (!campoEstadoResumen) return 'No Revisado'
    let est = r[campoEstadoResumen] || 'No Revisado'
    if (est === 'No Objeto de Cobro') est = 'Rechazado'
    if (!['Aprobado', 'Pendiente', 'Rechazado', 'No Revisado'].includes(est)) return 'No Revisado'
    return est
  }

  const conteoPortadaResumen = (() => {
    const conteo = { Aprobado: 0, Pendiente: 0, Rechazado: 0, 'No Revisado': 0 }
    if (!campoEstadoResumen) return conteo
    registrosVisibles.forEach(r => {
      const est = normalizarEstadoParaConteo(r)
      conteo[est]++
    })
    return conteo
  })()

  const registrosPortadaResumenFiltrados = (() => {
    if (!portadaResumenEstado || !campoEstadoResumen) return []
    return registrosVisibles.filter(r => normalizarEstadoParaConteo(r) === portadaResumenEstado)
  })()

  const irARegistroDesdePortada = (reg) => {
    setPortadaResumenEstado(null)
    setTabActiva(reg.item_numero || 'sin_asignar')
    setRegistroExpandido(reg.id)
    setTimeout(() => {
      document.getElementById(`registro-${reg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 350)
  }

  const nvMasivo = nivelInfo.nivelValidacion
  const puedeMasivaNivel = (nvMasivo === 2 || nvMasivo === 3) && nivelInfo.puedeValidar
  const registroParaPopupMasivo = registrosVisibles.find(r => r.id === seleccionadosValidacion[0]) || registros[0] || {}

  const recargar = async () => {
    try {
      let url = `${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`
      if (capasFiltroValidacion && capasFiltroValidacion.length > 0) {
        const payload = capasFiltroValidacion.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado }))
        url += `?${new URLSearchParams({ validacion_capas: JSON.stringify(payload) })}`
      }
      const res  = await fetch(url, { headers: hdrs })
      const data = await res.json()
      setReporte(data)
      setRegistros(data.registros || [])
    } catch(e) {}
  }

  const devEliminarRegistro = async (registroId) => {
    const reg = registros.find(r => r.id === registroId)
    const num = reg?.numero_registro ?? registroId
    if (!window.confirm(`[DEV] ¿Eliminar permanentemente el registro #${num}? Esta acción no se puede deshacer.`)) return
    setDevEliminando(true)
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${registroId}/dev`, { method: 'DELETE', headers: hdrs })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const d = err?.detail
        throw new Error(typeof d === 'string' ? d : `Error ${res.status}`)
      }
      await recargar()
    } catch (e) {
      alert(e?.message || String(e))
    }
    setDevEliminando(false)
  }

  const devEliminarReporteCompleto = async () => {
    if (!window.confirm(`[DEV] ¿Eliminar permanentemente el reporte #${reporte.numero_reporte} y TODOS sus registros, puntos topográficos y comentarios? No se puede deshacer.`)) return
    setDevEliminando(true)
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}/dev`, { method: 'DELETE', headers: hdrs })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const d = err?.detail
        throw new Error(typeof d === 'string' ? d : `Error ${res.status}`)
      }
      onActualizar()
    } catch (e) {
      alert(e?.message || String(e))
    }
    setDevEliminando(false)
  }

  const guardarTopografia = async () => {
    const puntosValidos = puntosEdit.filter(p => String(p.norte).trim() || String(p.este).trim())
    if (puntosValidos.length === 0) {
      alert('Debes ingresar al menos un punto con Norte o Este para guardar.')
      return
    }
    setGuardandoTopo(true)
    try {
      const delRes = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}/puntos-topograficos`, {
        method: 'DELETE', headers: hdrs
      })
      if (!delRes.ok) throw new Error(`Error eliminando puntos: ${delRes.status}`)
      const postRes = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/puntos-topograficos`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ reporte_id: reporte.id, puntos: puntosValidos })
      })
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({}))
        throw new Error(err.detail || `Error guardando puntos: ${postRes.status}`)
      }
      await recargar()
      setEditandoTopo(false)
    } catch(e) {
      alert(`No se pudo guardar la topografía: ${e.message}`)
    }
    setGuardandoTopo(false)
  }

  const onPkChange = (pkId) => {
    setEditPkId(pkId)
    const pk = listaPkIds.find(p => p.id === parseInt(pkId))
    if (pk) {
      setEditCivLocal(pk.civ || '')
      setEditTramoLocal(pk.tramo || '')
      setEditCalzadaLocal(pk.calzada || '')
      setEditInfraLocal(pk.infraestructura || '')
    }
  }

  const activarEdicion = async () => {
    if (!listasLoaded) {
      try {
        const [subs, insp, caps, pks] = await Promise.all([
          fetch(`${API_URL}/sicoe-obra/${contrato_id}/subcontratistas-activos`, { headers: hdrs }).then(r => r.json()),
          fetch(`${API_URL}/sicoe-obra/${contrato_id}/inspectores`, { headers: hdrs }).then(r => r.json()),
          fetch(`${API_URL}/sicoe-obra/${contrato_id}/capitulos`, { headers: hdrs }).then(r => r.json()),
          fetch(`${API_URL}/sicoe-obra/${contrato_id}/pk-ids`, { headers: hdrs }).then(r => r.json()),
        ])
        setListaSubs(Array.isArray(subs) ? subs : [])
        setListaInsp(Array.isArray(insp) ? insp : [])
        setListaCaps(Array.isArray(caps) ? caps : [])
        setListaPkIds(Array.isArray(pks) ? pks : [])
        setListasLoaded(true)
      } catch(e) {}
    }
    setModoEdicion(true)
  }

  const guardarEdicion = async () => {
    setGuardandoEdicion(true)
    try {
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({
          ...reporte,
          descripcion_actividad: editDesc,
          subcontratista_id: editSubId ? parseInt(editSubId) : null,
          inspector_id:      editInspId ? parseInt(editInspId) : null,
          capitulo:          editCapitulo || reporte.capitulo,
          pk_id_id:          editPkId ? parseInt(editPkId) : (reporte.pk_id_id || null),
          civ:               editCivLocal || reporte.civ || null,
          tramo:             editTramoLocal || reporte.tramo || null,
          calzada:           editCalzadaLocal || reporte.calzada || null,
          infraestructura:   editInfraLocal || reporte.infraestructura || null,
          abs_inicio: editAbsInicio !== '' ? parseFloat(editAbsInicio) : null,
          abs_final:  editAbsFinal  !== '' ? parseFloat(editAbsFinal)  : null,
          nodo_ini:   editNodoIni || null,
          nodo_fin:   editNodoFin || null,
          coord_lat:  editLat !== '' ? parseFloat(editLat) : null,
          coord_lng:  editLng !== '' ? parseFloat(editLng) : null,
        })
      })
      await recargar()
      setModoEdicion(false)
    } catch(e) {}
    setGuardandoEdicion(false)
  }

  const agregarEnlace = async () => {
    if (!enlaceInput) return
    try { new URL(enlaceInput) } catch { return }
    setGuardandoEnlace(true)
    try {
      const nuevos = [...enlaces, enlaceInput]
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...reporte, enlace_soporte: JSON.stringify(nuevos) })
      })
      setEnlaces(nuevos)
      setEnlaceInput('')
      setReporte(r => ({ ...r, enlace_soporte: JSON.stringify(nuevos) }))
    } catch(e) {}
    setGuardandoEnlace(false)
  }

  const eliminarEnlace = async (idx) => {
    const nuevos = enlaces.filter((_, i) => i !== idx)
    try {
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ ...reporte, enlace_soporte: JSON.stringify(nuevos) })
      })
      setEnlaces(nuevos)
      setReporte(r => ({ ...r, enlace_soporte: JSON.stringify(nuevos) }))
    } catch(e) {}
  }

  const crearNuevoRegistro = async () => {
    setCreandoReg(true)
    try {
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}/nuevo-registro`, { method: 'POST', headers: hdrs })
      await recargar()
      setTabActiva('sin_asignar')
    } catch(e) {}
    setCreandoReg(false)
  }

  const cargarReportesParaMover = async () => {
    try {
      const res  = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes`, { headers: hdrs })
      const data = await res.json()
      setReportesDisponibles((data || []).filter(r => r.id !== reporte.id && r.estado !== 'Borrador'))
    } catch(e) {}
  }

  const ejecutarMover = async () => {
    if (!reporteDestino || seleccionados.length === 0) return
    setMoviendoReg(true)
    try {
      await Promise.all(seleccionados.map(rid =>
        fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${rid}/mover-a/${reporteDestino}`, { method: 'PUT', headers: hdrs })
      ))
      setSeleccionados([])
      setModalMover(false)
      setReporteDestino('')
      await recargar()
    } catch(e) {}
    setMoviendoReg(false)
  }

  const toggleSeleccion = (rid) => {
    setSeleccionados(prev => prev.includes(rid) ? prev.filter(x => x !== rid) : [...prev, rid])
  }

  const toggleSeleccionValidacion = (rid) => {
    setSeleccionadosValidacion(prev => prev.includes(rid) ? prev.filter(x => x !== rid) : [...prev, rid])
  }

  const ejecutarMasivoSeleccion = async (estado, comentarioData) => {
    const nv = nivelInfo.nivelValidacion
    if (nv !== 2 && nv !== 3) return
    if (seleccionadosValidacion.length === 0) {
      alert('Selecciona al menos un registro en este ítem.')
      return
    }
    setPopupMasivo(null)
    setEjecutandoMasivo(true)
    setMsgMasivo('')
    const sufijo = nv === 2 ? 'validar-masivo-nivel2' : 'validar-masivo-nivel3'
    const body = { estado, ids_registros: [...seleccionadosValidacion] }
    if (comentarioData) body.comentario_data = comentarioData
    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}/${sufijo}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setMsgMasivo(`✅ ${data.actualizados} actualizado(s), ${data.omitidos} omitido(s) por no cumplir el nivel anterior.`)
      setSeleccionadosValidacion([])
      recargar()
    } catch (e) {
      setMsgMasivo(`❌ ${e.message}`)
    }
    setEjecutandoMasivo(false)
  }

  // ─ Colores del tema de la carpeta ─
  const C = {
    carpetaFondo:  t.bg,
    carpetaHeader: t.primary,
    tabActivo:     t.primary,
    tabInactivo:   t.bgCard,
    hoja:          t.bg,
    borde:         t.border,
  }

  // ─ Campo de info del reporte (para portada y hojas) ─
  const CampoInfo = ({ label, valor, full = false }) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
      <div style={{ fontSize:'13px', color:t.text, fontWeight:'600', background:t.bgCard, borderRadius:'6px', padding:'6px 10px', border:`1px solid ${C.borde}` }}>
        {valor || <span style={{ color:t.textMuted, fontStyle:'italic' }}>—</span>}
      </div>
    </div>
  )

  const renderBarraValidacionMasiva = (regsTab) => {
    if (!puedeMasivaNivel) return null
    const idsElegibles = regsTab.filter(r => {
      if (nvMasivo === 2) return (r.nivel1_estado || 'No Revisado') === 'Aprobado'
      if (nvMasivo === 3) return (r.nivel2_estado || 'No Revisado') === 'Aprobado'
      return false
    }).map(r => r.id)
    if (idsElegibles.length === 0) return null

    const todosSelVal = idsElegibles.length > 0 && idsElegibles.every(id => seleccionadosValidacion.includes(id))
    const BTNS_MASIVOS = [
      { estado:'Aprobado',  icon:'✅', color:'#16a34a' },
      { estado:'Pendiente', icon:'🟡', color:'#d97706' },
      { estado:'Rechazado', icon:'🔴', color:'#dc2626' },
    ]

    return (
      <div style={{ background:t.bgCard, borderRadius:'10px', padding:'14px', border:`1px solid ${t.border}`, marginBottom:'12px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:'#0d9488', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'10px' }}>
          ⚡ Validación masiva · Nivel {nvMasivo} · {seleccionadosValidacion.length} seleccionado(s)
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'10px' }}>
          <input type="checkbox" id={`sel-todos-val-${String(tabActiva)}`}
            checked={todosSelVal}
            onChange={() => {
              if (todosSelVal) setSeleccionadosValidacion(prev => prev.filter(id => !idsElegibles.includes(id)))
              else setSeleccionadosValidacion(prev => [...new Set([...prev, ...idsElegibles])])
            }}
            style={{ width:'16px', height:'16px', accentColor:'#0d9488', cursor:'pointer' }} />
          <label htmlFor={`sel-todos-val-${String(tabActiva)}`} style={{ fontSize:'12px', fontWeight:'600', color:t.text, cursor:'pointer' }}>
            Seleccionar todos los elegibles en esta vista ({idsElegibles.length})
          </label>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {BTNS_MASIVOS.map(({ estado, icon, color }) => (
            <button key={estado} type="button"
              disabled={ejecutandoMasivo}
              onClick={() => {
                if (estado === 'Aprobado') ejecutarMasivoSeleccion(estado, null)
                else setPopupMasivo({ estado })
              }}
              style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:'700',
                       cursor: ejecutandoMasivo ? 'not-allowed' : 'pointer',
                       opacity: ejecutandoMasivo ? 0.6 : 1,
                       background:`${color}18`, color, border:`1.5px solid ${color}55` }}>
              {icon} {estado}
            </button>
          ))}
        </div>
        {msgMasivo && (
          <div style={{ marginTop:'10px', fontSize:'12px', color:t.text, background:t.bg,
                        borderRadius:'8px', padding:'10px 14px', border:`1px solid ${t.border}` }}>
            {msgMasivo}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:'1100px', background:C.carpetaFondo, borderRadius:'16px', border:`2px solid ${C.carpetaHeader}`, boxShadow:'0 24px 80px rgba(0,0,0,0.6)', minHeight:'80vh', display:'flex', flexDirection:'column' }}>

        {/* ─ Header tipo carpeta ─ */}
        <div style={{ background:`linear-gradient(135deg, ${t.primary}, ${t.primary}BB)`, borderRadius:'14px 14px 0 0', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <span style={{ fontSize:'28px' }}>📁</span>
            <div>
              {reporte._cargandoDetalle && (
                <div style={{ fontSize:'11px', fontWeight:'700', color:'#fff', marginBottom:6, padding:'6px 10px', background:'rgba(0,0,0,0.2)', borderRadius:8, display:'inline-block' }}>
                  ⏳ Cargando registros, validaciones y plano…
                </div>
              )}
              <div style={{ fontSize:'18px', fontWeight:'900', color:'#fff' }}>
                {reporte.descripcion_actividad || `Reporte #${reporte.numero_reporte}`}
              </div>
              <div style={{ fontSize:'12px', color:'#ffffff99', fontWeight:'600' }}>
                Reporte #{reporte.numero_reporte} · {reporte.capitulo} · {reporte.subcontratista_nombre || '—'}
              </div>
              {(() => {
                const pF = ts => { if (!ts) return null; try { const n = /Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?null:d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) } catch{return null} }
                const fc = pF(reporte.created_at), fm = pF(reporte.updated_at)
                return (
                  <div style={{ marginTop:'4px', display:'flex', gap:'16px', flexWrap:'wrap' }}>
                    {fc && <span style={{ fontSize:'13px', color:'#ffffffCC' }}>📅 {fc}{reporte.nombre_creador ? ` · ${reporte.nombre_creador}` : ''}</span>}
                    {fm && reporte.nombre_modificador && <span style={{ fontSize:'13px', color:'#ffffffAA' }}>✏️ {fm} · {reporte.nombre_modificador}</span>}
                  </div>
                )
              })()}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
            {esDeveloper && (
              <button type="button" disabled={devEliminando} onClick={devEliminarReporteCompleto}
                title="Solo cargo Desarrollador: borra el reporte completo en base de datos"
                style={{
                  background:'#B91C1C', color:'#fff', border:'none', borderRadius:'8px', padding:'6px 12px',
                  fontSize:'11px', fontWeight:'700', cursor: devEliminando ? 'not-allowed' : 'pointer', opacity: devEliminando ? 0.65 : 1,
                  whiteSpace:'nowrap',
                }}>
                🗑️ Dev: borrar reporte
              </button>
            )}
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'50%', width:'34px', height:'34px', fontSize:'18px', cursor:'pointer', fontWeight:'900', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        {/* ─ Botón volver al panel ─ */}
        {filtroValidacion && (
          <div style={{ padding:'6px 16px', background:'#0F1923', borderBottom:`1px solid ${C.borde}` }}>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.borde}`, borderRadius:'6px', padding:'4px 12px', fontSize:'11px', color:'#94A3B8', cursor:'pointer' }}>
              ← Volver al panel
            </button>
          </div>
        )}
        {/* ─ Tab bar horizontal ─ */}
        <div style={{ display:'flex', gap:'4px', padding:'12px 16px 0', background:'#0F1923', borderBottom:`1px solid ${C.borde}`, overflowX:'auto' }}>
          {[
            { key: 'portada',      label: '📋 Portada' },
            { key: 'sin_asignar',  label: `📄 Sin Asignar Ítem${regsSinAsignar.length > 0 ? ` (${regsSinAsignar.length})` : ''}` },
            ...itemsAsignados.map(it => {
              const tienePendiente = camponivelActivo && registrosDominioValidacion.some(r =>
                r.item_numero === it &&
                (!prereqCampo || r[prereqCampo] === 'Aprobado') &&
                (r[camponivelActivo] === 'No Revisado' || r[camponivelActivo] == null)
              )
              return { key: it, label: `${tienePendiente ? '🔴' : '🔖'} ${it}` }
            })
          ].map(tab => (
            <button key={tab.key} onClick={() => setTabActiva(tab.key)} style={{
              background:    tabActiva === tab.key ? C.tabActivo : 'transparent',
              color:         tabActiva === tab.key ? '#fff' : t.textMuted,
              border:        `1px solid ${tabActiva === tab.key ? C.tabActivo : C.borde}`,
              borderBottom:  tabActiva === tab.key ? `1px solid ${C.tabActivo}` : '1px solid transparent',
              borderRadius:  '8px 8px 0 0', padding:'8px 16px', fontSize:'12px',
              fontWeight:    tabActiva === tab.key ? '700' : '400',
              cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s'
            }}>{tab.label}</button>
          ))}

          {/* Botones de acción */}
          <div style={{ marginLeft:'auto', display:'flex', gap:'8px', paddingBottom:'8px' }}>
            {puedeEditar && seleccionados.length > 0 && (
              <button onClick={() => { cargarReportesParaMover(); setModalMover(true) }} style={{
                background:'#8B5CF6', color:'#fff', border:'none', borderRadius:'8px',
                padding:'6px 14px', fontSize:'12px', fontWeight:'700', cursor:'pointer'
              }}>↗ Mover ({seleccionados.length})</button>
            )}
            {puedeEditar && (
              <button onClick={crearNuevoRegistro} disabled={creandoReg} style={{
                background: t.primary, color:'#fff', border:'none', borderRadius:'8px',
                padding:'6px 14px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity: creandoReg ? 0.6 : 1
              }}>{creandoReg ? '...' : '+ Nuevo Registro'}</button>
            )}
          </div>
        </div>

        {/* ─ Contenido del tab ─ */}
        <div style={{ flex:1, padding:'24px', overflowY:'auto' }}>

          {/* ── TAB PORTADA ── */}
          {tabActiva === 'portada' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

              {/* PANEL — Resumen por estado (N1/N2/N3 según rol) */}
              {campoEstadoResumen && (
                <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                  <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>
                    📊 Resumen del reporte · Nivel {nivelInfo.nivelValidacion}
                  </div>
                  <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom: portadaResumenEstado ? '14px' : 0 }}>
                    {[
                      { key:'Aprobado', label:'Aprobados' },
                      { key:'Pendiente', label:'Pendientes' },
                      { key:'Rechazado', label:'Rechazados' },
                      { key:'No Revisado', label:'No revisado' },
                    ].map(({ key, label }) => {
                      const cnt = conteoPortadaResumen[key] ?? 0
                      const COLOR_CNT = { 'No Revisado':'#3B82F6', 'Aprobado':'#10B981', 'Pendiente':'#F59E0B', 'Rechazado':'#EF4444' }
                      const activo = portadaResumenEstado === key
                      const puedeClic = cnt > 0
                      return (
                        <button key={key} type="button"
                          disabled={!puedeClic}
                          onClick={() => setPortadaResumenEstado(activo ? null : key)}
                          style={{
                            display:'flex', alignItems:'center', gap:'6px', background: activo ? `${COLOR_CNT[key]}22` : t.bg,
                            border:`1px solid ${activo ? COLOR_CNT[key] : t.border}`, borderRadius:'20px', padding:'6px 14px',
                            cursor: puedeClic ? 'pointer' : 'default', opacity: puedeClic ? 1 : 0.55,
                          }}>
                          <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: COLOR_CNT[key], flexShrink:0 }} />
                          <span style={{ fontSize:'12px', fontWeight:'800', color:t.text }}>{cnt}</span>
                          <span style={{ fontSize:'11px', color:t.textMuted }}>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                  {portadaResumenEstado && (
                    <div style={{ borderTop:`1px solid ${t.border}`, paddingTop:'14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                        <span style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>
                          Registros {portadaResumenEstado === 'No Revisado' ? 'sin revisar' : portadaResumenEstado.toLowerCase()} ({registrosPortadaResumenFiltrados.length})
                        </span>
                        <button type="button" onClick={() => setPortadaResumenEstado(null)}
                          style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'4px 10px', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>
                          Cerrar lista
                        </button>
                      </div>
                      {registrosPortadaResumenFiltrados.length === 0 ? (
                        <div style={{ fontSize:'12px', color:t.textMuted }}>No hay registros en este estado.</div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'260px', overflowY:'auto' }}>
                          {registrosPortadaResumenFiltrados.map(reg => (
                            <button key={reg.id} type="button"
                              onClick={() => irARegistroDesdePortada(reg)}
                              style={{
                                background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px 12px',
                                textAlign:'left', cursor:'pointer', display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center',
                              }}>
                              <span style={{ fontWeight:'800', color:'#D97706', fontSize:'12px' }}>Registro #{reg.numero_registro}</span>
                              <span style={{ fontSize:'11px', color:t.textMuted }}>{reg.item_numero || 'Sin ítem'}</span>
                              <span style={{ fontSize:'11px', color:t.text, flex:'1 1 200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {reg.observacion || '—'}
                              </span>
                              <span style={{ fontSize:'11px', color:t.primary, fontWeight:'700' }}>Ir al registro →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* GRUPO 2 — Identificación del Reporte */}
              <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px' }}>
                  <div>
                    <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase' }}>📋 Identificación del Reporte</div>
                  </div>
                  {puedeEditar && (
                    <div style={{ display:'flex', gap:'8px' }}>
                      {modoEdicion ? (
                        <>
                          <button onClick={() => setModoEdicion(false)} style={{ background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted, borderRadius:'6px', padding:'5px 12px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>Cancelar</button>
                          <button onClick={guardarEdicion} disabled={guardandoEdicion} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'5px 14px', fontSize:'11px', fontWeight:'700', cursor:'pointer', opacity:guardandoEdicion?0.6:1 }}>{guardandoEdicion?'Guardando...':'💾 Guardar'}</button>
                        </>
                      ) : (
                        <button onClick={activarEdicion} style={{ background:'transparent', border:`1px solid ${t.primary}`, color:t.primary, borderRadius:'6px', padding:'5px 14px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>✏️ Editar</button>
                      )}
                    </div>
                  )}
                </div>
                {/* Nombre full width */}
                <div style={{ marginBottom:'10px' }}>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Nombre del Reporte</div>
                  {modoEdicion
                    ? <input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'8px 12px', color:t.text, fontSize:'13px', fontWeight:'600', boxSizing:'border-box' }} />
                    : <div style={{ fontSize:'14px', color:t.text, fontWeight:'700', background:t.bg, borderRadius:'6px', padding:'8px 12px', border:`1px solid ${t.border}` }}>{reporte.descripcion_actividad || <span style={{ color:t.textMuted, fontStyle:'italic' }}>—</span>}</div>
                  }
                </div>
              </div>

              {/* GRUPO 3 — Localización */}
              <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>📍 Localización</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', alignItems:'start' }}>

                  {/* Columna izquierda — campos */}
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {/* PK_ID */}
                    <div>
                      <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>PK_ID</div>
                      {modoEdicion ? (
                        <select value={editPkId} onChange={e => onPkChange(e.target.value)}
                          style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
                          <option value="">— Selecciona PK_ID —</option>
                          {listaPkIds.map(pk => (
                            <option key={pk.id} value={pk.id}>{pk.pk_id} · {pk.civ} · {pk.tramo}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ background:t.bg, borderRadius:'6px', padding:'6px 10px', border:`1px solid ${t.border}`, fontSize:'13px', fontWeight:'700', color:t.text }}>
                          {reporte.pk_id_valor || reporte.pk_id_id || '—'}
                        </div>
                      )}
                    </div>

                    {/* CIV | Tramo */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      <CampoInfo label="CIV"   valor={modoEdicion ? (editCivLocal || reporte.civ) : reporte.civ} />
                      <CampoInfo label="Tramo" valor={modoEdicion ? (editTramoLocal || reporte.tramo) : reporte.tramo} />
                    </div>

                    {/* Costado | Infraestructura */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      <CampoInfo label="Costado"        valor={modoEdicion ? (editCalzadaLocal || reporte.calzada) : reporte.calzada} />
                      <CampoInfo label="Infraestructura" valor={modoEdicion ? (editInfraLocal || reporte.infraestructura) : reporte.infraestructura} />
                    </div>

                    {/* Latitud | Longitud */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      {modoEdicion ? (
                        <>
                          <div>
                            <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Latitud</div>
                            <input type="number" step="0.0000001" value={editLat} onChange={e => setEditLat(e.target.value)} placeholder="4.710989"
                              style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Longitud</div>
                            <input type="number" step="0.0000001" value={editLng} onChange={e => setEditLng(e.target.value)} placeholder="-74.072092"
                              style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
                          </div>
                        </>
                      ) : (
                        <>
                          <CampoInfo label="Latitud"  valor={reporte.coord_lat} />
                          <CampoInfo label="Longitud" valor={reporte.coord_lng} />
                        </>
                      )}
                    </div>

                    {/* Abscisado | Nodos */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      {modoEdicion ? (
                        <>
                          {[['Abs. Inicio', editAbsInicio, setEditAbsInicio, 'number'],
                            ['Abs. Final',  editAbsFinal,  setEditAbsFinal,  'number']
                          ].map(([label, val, setter, type]) => (
                            <div key={label}>
                              <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
                              <input type={type} value={val} onChange={e => setter(e.target.value)}
                                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <CampoInfo label="Abs. Inicio" valor={reporte.abs_inicio} />
                          <CampoInfo label="Abs. Final"  valor={reporte.abs_final} />
                        </>
                      )}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      {modoEdicion ? (
                        <>
                          {[['Nodo Inicial', editNodoIni, setEditNodoIni, 'text'],
                            ['Nodo Final',   editNodoFin, setEditNodoFin, 'text']
                          ].map(([label, val, setter, type]) => (
                            <div key={label}>
                              <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>{label}</div>
                              <input type={type} value={val} onChange={e => setter(e.target.value)}
                                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'6px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <CampoInfo label="Nodo Inicial" valor={reporte.nodo_ini} />
                          <CampoInfo label="Nodo Final"   valor={reporte.nodo_fin} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Columna derecha — Mapa */}
                  <MapaPortada
                    lat={modoEdicion ? editLat : reporte.coord_lat}
                    lng={modoEdicion ? editLng : reporte.coord_lng}
                    modoEdicion={modoEdicion}
                    onCoordsChange={(la, lo) => { setEditLat(la); setEditLng(lo) }}
                    t={t}
                  />
                </div>
              </div>

              {/* GRUPO 4 — Coordenadas Topográficas (siempre visible) */}
              <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                  <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase' }}>📐 Coordenadas Topográficas</div>
                  {puedeEditar && !editandoTopo && (
                    <button onClick={() => { setPuntosEdit((reporte.puntos||[]).map(p=>({...p}))); setEditandoTopo(true) }}
                      style={{ background:'transparent', border:`1px solid ${t.primary}`, color:t.primary, borderRadius:'6px', padding:'5px 14px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                      ✏️ Editar Topografía
                    </button>
                  )}
                  {editandoTopo && (
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button onClick={() => setEditandoTopo(false)} style={{ background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted, borderRadius:'6px', padding:'5px 12px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>Cancelar</button>
                      <button onClick={guardarTopografia} disabled={guardandoTopo} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'5px 14px', fontSize:'11px', fontWeight:'700', cursor:'pointer', opacity:guardandoTopo?0.6:1 }}>
                        {guardandoTopo ? 'Guardando...' : '💾 Guardar Topografía'}
                      </button>
                    </div>
                  )}
                </div>

                {editandoTopo ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    <div style={{ fontSize:'12px', color:t.textMuted }}>Registra las coordenadas levantadas en campo. Puedes importar desde CSV (Punto, Norte, Este, Cota, Descripción).</div>
                    <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 28px', gap:'8px', fontSize:'10px', fontWeight:'700', color:t.textMuted, padding:'0 4px', letterSpacing:'0.5px', textTransform:'uppercase' }}>
                      <div>Punto</div><div>Norte</div><div>Este</div><div>Cota</div><div>Descripción</div><div></div>
                    </div>
                    {puntosEdit.map((p, idx) => (
                      <div key={idx} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 28px', gap:'8px', alignItems:'center' }}>
                        {['punto','norte','este','cota','descripcion'].map(campo => (
                          <input key={campo} value={p[campo] ?? ''} onChange={e => {
                            const arr = [...puntosEdit]; arr[idx] = {...arr[idx], [campo]: e.target.value}; setPuntosEdit(arr)
                          }}
                          type={['norte','este','cota'].includes(campo) ? 'number' : 'text'}
                          step='0.000001'
                          placeholder={campo.charAt(0).toUpperCase()+campo.slice(1)}
                          style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'12px', width:'100%', boxSizing:'border-box' }} />
                        ))}
                        <button onClick={() => setPuntosEdit(prev => prev.filter((_,i) => i!==idx))}
                          style={{ background:'transparent', border:'none', color:'#EF4444', cursor:'pointer', fontSize:'16px', padding:0 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button onClick={() => setPuntosEdit(prev => [...prev, {punto:'',norte:'',este:'',cota:'',descripcion:''}])}
                        style={{ background:'transparent', border:`1px dashed ${t.border}`, color:t.textMuted, borderRadius:'8px', padding:'7px 16px', fontSize:'12px', cursor:'pointer' }}>
                        + Agregar punto
                      </button>
                      <label style={{ background:'transparent', border:`1px dashed ${t.border}`, color:t.textMuted, borderRadius:'8px', padding:'7px 16px', fontSize:'12px', cursor:'pointer' }}>
                        📂 Importar CSV
                        <input type='file' accept='.csv' style={{ display:'none' }} onChange={e => {
                          const file = e.target.files[0]; if (!file) return
                          const reader = new FileReader()
                          reader.onload = ev => {
                            const lines = ev.target.result.split('\n').filter(l => l.trim())
                            const rows = lines.slice(1).map(l => {
                              const cols = l.split(',')
                              return { punto:cols[0]||'', norte:cols[1]||'', este:cols[2]||'', cota:cols[3]||'', descripcion:cols[4]||'' }
                            })
                            if (rows.length) setPuntosEdit(rows)
                          }
                          reader.readAsText(file)
                        }} />
                      </label>
                    </div>
                  </div>
                ) : (reporte.puntos || []).length === 0 ? (
                  <div style={{ background:'#EF444415', border:'1px solid #EF444433', borderRadius:'8px', padding:'12px 16px', color:'#EF4444', fontSize:'12px', fontWeight:'600', textAlign:'center' }}>
                    ⚠️ Sin coordenadas registradas. Haz clic en "Editar Topografía" para ingresarlas — obligatorio para asignar ítems.
                  </div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <thead>
                        <tr style={{ background:t.bg }}>
                          {['Punto','Norte','Este','Cota','Descripción'].map(h => (
                            <th key={h} style={{ padding:'7px 12px', textAlign:'left', color:t.textMuted, fontWeight:'700', fontSize:'10px', letterSpacing:'0.5px', textTransform:'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.puntos.map((p, i) => (
                          <tr key={i} style={{ borderBottom:`1px solid ${t.border}` }}>
                            <td style={{ padding:'7px 12px', color:t.text, fontWeight:'700' }}>{p.punto || '—'}</td>
                            <td style={{ padding:'7px 12px', color:t.text }}>{p.norte ?? '—'}</td>
                            <td style={{ padding:'7px 12px', color:t.text }}>{p.este  ?? '—'}</td>
                            <td style={{ padding:'7px 12px', color:t.text }}>{p.cota  ?? '—'}</td>
                            <td style={{ padding:'7px 12px', color:t.textMuted }}>{p.descripcion || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* GRUPO 5 — Biblioteca de Soportes */}
              <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'4px' }}>🔗 Biblioteca de Soportes</div>
                <div style={{ fontSize:'11px', color:t.textMuted, marginBottom:'12px' }}>Agrega los enlaces a tus repositorios externos (Drive, SharePoint, OneDrive, etc.)</div>

                {/* Input para nuevo enlace */}
                <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px' }}>
                  <input
                    value={enlaceInput}
                    onChange={e => setEnlaceInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') agregarEnlace() }}
                    placeholder="https://drive.google.com/..."
                    style={{ flex:1, background:t.bg, border:`1px solid ${(() => {
                      if (!enlaceInput) return t.border
                      try { new URL(enlaceInput); return '#10B981' } catch { return '#EF4444' }
                    })()}`, borderRadius:'8px', padding:'9px 14px', color:t.text, fontSize:'13px' }}
                  />
                  <button
                    onClick={agregarEnlace}
                    disabled={guardandoEnlace || !enlaceInput || (() => { try { new URL(enlaceInput); return false } catch { return true } })()} 
                    style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'9px 18px', fontSize:'12px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap',
                      opacity: guardandoEnlace || !enlaceInput || (() => { try { new URL(enlaceInput); return false } catch { return true } })() ? 0.5 : 1 }}>
                    {guardandoEnlace ? '...' : '+ Agregar'}
                  </button>
                </div>
                {enlaceInput && (() => { try { new URL(enlaceInput); return false } catch { return true } })() && (
                  <div style={{ fontSize:'11px', color:'#EF4444', marginBottom:'8px' }}>⚠️ Ingresa una URL válida (debe comenzar con https://)</div>
                )}

                {/* Soportes desde registros */}
                {(() => {
                  const enlacesRegs = registros.flatMap(r => {
                    const raw = r.enlace_soporte
                    if (!raw) return []
                    try {
                      const parsed = JSON.parse(raw)
                      const urls = Array.isArray(parsed) ? parsed : [raw]
                      return urls.map(url => ({ url, numero: r.numero_registro }))
                    } catch { return raw ? [{ url: raw, numero: r.numero_registro }] : [] }
                  })
                  if (enlacesRegs.length === 0) return null
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'12px' }}>
                      <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase' }}>Desde registros</div>
                      {enlacesRegs.map((item, idx) => (
                        <div key={idx} style={{ display:'flex', alignItems:'center', gap:'8px', background:t.bg, borderRadius:'8px', padding:'8px 12px', border:`1px solid ${t.border}` }}>
                          <span style={{ fontSize:'14px' }}>📎</span>
                          <a href={item.url} target="_blank" rel="noreferrer"
                            style={{ flex:1, color:t.primary, fontSize:'12px', fontWeight:'600', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                            title={item.url}>{item.url}</a>
                          <span style={{ fontSize:'11px', color:t.textMuted, whiteSpace:'nowrap', flexShrink:0 }}>Reg. #{item.numero}</span>
                          <a href={item.url} target="_blank" rel="noreferrer"
                            style={{ padding:'4px 10px', background:`${t.primary}22`, color:t.primary, borderRadius:'6px', fontSize:'11px', fontWeight:'700', textDecoration:'none', whiteSpace:'nowrap', border:`1px solid ${t.primary}33` }}>
                            ↗ Abrir
                          </a>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {/* Lista de enlaces guardados */}
                {enlaces.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'16px', color:t.textMuted, fontSize:'12px', fontStyle:'italic', border:`1px dashed ${t.border}`, borderRadius:'8px' }}>
                    Sin soportes agregados aún
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {enlaces.map((url, idx) => (
                      <div key={idx} style={{ display:'flex', alignItems:'center', gap:'8px', background:t.bg, borderRadius:'8px', padding:'8px 12px', border:`1px solid ${t.border}` }}>
                        <span style={{ fontSize:'14px' }}>🔗</span>
                        <a href={url} target="_blank" rel="noreferrer"
                          style={{ flex:1, color:t.primary, fontSize:'12px', fontWeight:'600', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={url}>{url}</a>
                        <a href={url} target="_blank" rel="noreferrer"
                          style={{ padding:'4px 10px', background:`${t.primary}22`, color:t.primary, borderRadius:'6px', fontSize:'11px', fontWeight:'700', textDecoration:'none', whiteSpace:'nowrap', border:`1px solid ${t.primary}33` }}>
                          ↗ Abrir
                        </a>
                        <button onClick={() => eliminarEnlace(idx)}
                          style={{ background:'transparent', border:'none', color:'#EF4444', cursor:'pointer', fontSize:'16px', padding:'0 4px', flexShrink:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── TAB SIN ASIGNAR ÍTEM ── */}
          {tabActiva === 'sin_asignar' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
              {renderBarraValidacionMasiva(regsSinAsignar)}
              {regsSinAsignar.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>
                  ✅ Todos los registros tienen ítem asignado
                </div>
              ) : regsSinAsignar.map(reg => {
                const puedeMarcarVal = puedeMasivaNivel && (
                  (nvMasivo === 2 && (reg.nivel1_estado || 'No Revisado') === 'Aprobado') ||
                  (nvMasivo === 3 && (reg.nivel2_estado || 'No Revisado') === 'Aprobado')
                )
                return (
                <HojaRegistro
                  key={reg.id} t={t} usuario={usuario} API_URL={API_URL}
                  contrato_id={contrato_id} reporte={reporte} registro={reg}
                  puedeEditar={puedeEditar} actasList={actasList}
                  seleccionado={seleccionados.includes(reg.id)}
                  onToggleSeleccion={() => toggleSeleccion(reg.id)}
                  mostrarSeleccionValidacion={puedeMarcarVal}
                  seleccionadoValidacion={seleccionadosValidacion.includes(reg.id)}
                  onToggleSeleccionValidacion={() => toggleSeleccionValidacion(reg.id)}
                  onItemAsignado={recargar}
                  hdrs={hdrs}
                  esDeveloper={esDeveloper}
                  onDevEliminarRegistro={devEliminarRegistro}
                  devEliminando={devEliminando}
                />
                )
              })}
            </div>
          )}

          {/* ── TABS POR ÍTEM ── */}
          {itemsAsignados.map(itemNum => tabActiva === itemNum && (
            <div key={itemNum} style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {renderBarraValidacionMasiva(registrosVisibles.filter(r => r.item_numero === itemNum))}
              {registrosVisibles.filter(r => r.item_numero === itemNum).map(reg => {
                const expandido = registroExpandido === reg.id
                const puedeMarcarVal = puedeMasivaNivel && (
                  (nvMasivo === 2 && (reg.nivel1_estado || 'No Revisado') === 'Aprobado') ||
                  (nvMasivo === 3 && (reg.nivel2_estado || 'No Revisado') === 'Aprobado')
                )
                const fechaReg = (() => { try { const ts=reg.created_at; if (!ts) return ''; const n=/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?'':d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) } catch{return ''} })()
                const colorNivel = st => st === 'Aprobado' ? '#10B981' : st === 'Pendiente' ? '#F59E0B' : st === 'Rechazado' ? '#EF4444' : st === 'No Objeto de Cobro' ? '#374151' : '#3B82F6'
                const nivelesInfo = [
                  { emoji:'👷',  label:'N1', estado: reg.nivel1_estado || 'No Revisado' },
                  { emoji:'🏗️', label:'N2', estado: reg.nivel2_estado || 'No Revisado' },
                  { emoji:'🏛️', label:'N3', estado: reg.nivel3_estado || 'No Revisado' },
                  { emoji:'🔨', label:'Sub', estado: reg.sub_estado || 'No Revisado' },
                ]
                return (
                  <div key={reg.id} id={`registro-${reg.id}`}>
                    <div
                      onClick={() => setRegistroExpandido(expandido ? null : reg.id)}
                      style={{ display:'flex', alignItems:'center', gap:'10px', background:'#D9770626', border:`1px solid ${expandido ? '#D97706' : '#D9770644'}`, borderLeft:'3px solid #D97706', borderRadius: expandido ? '10px 10px 0 0' : '10px', padding:'10px 16px', cursor:'pointer', transition:'border 0.15s' }}
                    >
                      {puedeMarcarVal && (
                        <input type="checkbox" checked={seleccionadosValidacion.includes(reg.id)}
                          title="Seleccionar para validación masiva"
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSeleccionValidacion(reg.id)}
                          style={{ width:'15px', height:'15px', accentColor:'#0d9488', flexShrink:0 }} />
                      )}
                      {puedeEditar && (
                        <input type="checkbox" checked={seleccionados.includes(reg.id)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSeleccion(reg.id)}
                          style={{ width:'15px', height:'15px', accentColor:'#8B5CF6', flexShrink:0 }} />
                      )}
                      <span style={{ fontWeight:'800', color:'#D97706', fontSize:'13px', flexShrink:0 }}>
                        📄 Registro #{reg.numero_registro}
                      </span>
                      <span style={{ color:t.textMuted, fontSize:'12px', fontStyle: reg.observacion ? 'normal' : 'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'300px', flex:1 }}>
                        {reg.observacion || 'Sin observación'}
                      </span>
                      <span style={{ color:t.textMuted, fontSize:'11px', flexShrink:0 }}>{fechaReg}</span>
                      {/* Íconos de validación */}
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                        {nivelesInfo.map(({ emoji, label, estado }) => {
                          const esMiNivel = nivelInfo.nivelValidacion === 1 && label === 'N1'
                            || nivelInfo.nivelValidacion === 2 && label === 'N2'
                            || nivelInfo.nivelValidacion === 3 && label === 'N3'
                          const sinRevisar = estado === 'No Revisado'
                          return (
                            <div key={label} title={`${label}: ${estado}`}
                              style={{ display:'flex', alignItems:'center', gap:'3px',
                                background: esMiNivel && sinRevisar ? '#3B82F620' : 'transparent',
                                border: esMiNivel && sinRevisar ? '1px solid #3B82F6' : '1px solid transparent',
                                borderRadius:'10px', padding:'1px 5px' }}>
                              <span style={{ fontSize:'13px', lineHeight:1 }}>{emoji}</span>
                              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: colorNivel(estado), flexShrink:0 }} />
                              {esMiNivel && sinRevisar && <span style={{ fontSize:'9px', fontWeight:'800', color:'#3B82F6' }}>SIN REV.</span>}
                            </div>
                          )
                        })}
                      </div>
                      {/* Burbuja de comentarios */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const rolOrigen = determinarNivelValidacion(usuario).rolOrigen
                          setModalComentarios({ reg, rolOrigen })
                          setComentariosData([])
                          setLoadingComentarios(true)
                          fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${reg.id}/comentarios?rol_solicitante=${rolOrigen}`, { headers: hdrs })
                            .then(r => r.json())
                            .then(d => { setComentariosData(Array.isArray(d) ? d : []); setLoadingComentarios(false) })
                            .catch(() => setLoadingComentarios(false))
                        }}
                        style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 4px',
                                 fontSize:'15px', color: reg.num_comentarios > 0 ? '#10B981' : t.textMuted, flexShrink:0, lineHeight:1, position:'relative' }}
                        title={`Ver comentarios${reg.num_comentarios > 0 ? ` (${reg.num_comentarios})` : ''}`}>
                        💬{reg.num_comentarios > 0 && <span style={{ fontSize:'9px', fontWeight:'800', color:'#10B981', marginLeft:'1px' }}>{reg.num_comentarios}</span>}
                      </button>
                      <button
                        type="button"
                        title="Trazabilidad y auditoría (SICOE obra)"
                        onClick={e => {
                          e.stopPropagation()
                          setModalTrazabilidadSicoe(reg)
                        }}
                        style={{
                          background: 'none',
                          border: `1px solid ${t.border}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: '13px',
                          color: t.primary,
                          flexShrink: 0,
                          lineHeight: 1,
                        }}
                      >📜</button>
                      {reg.enlace_soporte && (() => { try { const p = JSON.parse(reg.enlace_soporte); return Array.isArray(p) ? p.length > 0 : !!reg.enlace_soporte } catch { return !!reg.enlace_soporte } })() && (
                        <span title="Tiene soportes adjuntos" style={{ fontSize:'13px', flexShrink:0 }}>📎</span>
                      )}
                      <span style={{ color:t.textMuted, fontSize:'12px', flexShrink:0 }}>{expandido ? '▲' : '▼'}</span>
                    </div>
                    {expandido && (
                      <div style={{ border:`1px solid ${t.primary+'66'}`, borderTop:'none', borderRadius:'0 0 10px 10px', overflow:'hidden' }}>
                        <HojaRegistro
                          key={reg.id} t={t} usuario={usuario} API_URL={API_URL}
                          contrato_id={contrato_id} reporte={reporte} registro={reg}
                          puedeEditar={puedeEditar} actasList={actasList}
                          seleccionado={seleccionados.includes(reg.id)}
                          onToggleSeleccion={() => toggleSeleccion(reg.id)}
                          mostrarSeleccionValidacion={puedeMarcarVal}
                          seleccionadoValidacion={seleccionadosValidacion.includes(reg.id)}
                          onToggleSeleccionValidacion={() => toggleSeleccionValidacion(reg.id)}
                          onItemAsignado={recargar}
                          hdrs={hdrs}
                          esDeveloper={esDeveloper}
                          onDevEliminarRegistro={devEliminarRegistro}
                          devEliminando={devEliminando}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ─ Modal Comentarios ─ */}
      {modalComentarios && (() => {
        const color = '#10B981'
        const fmtFecha = iso => { try { return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(iso)?iso:iso+'Z').toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) } catch { return iso } }
        const rolOrigen = modalComentarios.rolOrigen
        return (
          <div style={{ position:'fixed', inset:0, zIndex:10200, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setModalComentarios(null)}>
            <div style={{ background:t.bgCard, border:`1.5px solid ${color}44`, borderRadius:'16px', padding:'24px', width:'560px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={{ fontSize:'15px', fontWeight:'700', color }}>
                  💬 Comentarios · Registro #{modalComentarios.reg.numero_registro}
                </div>
                <button onClick={() => setModalComentarios(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>
              <div style={{ overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:'12px', paddingRight:'4px', minHeight:0 }}>
                {loadingComentarios
                  ? <div style={{ textAlign:'center', padding:'30px', color:t.textMuted }}>Cargando...</div>
                  : comentariosData.length === 0
                  ? <div style={{ textAlign:'center', padding:'28px 16px' }}>
                      <div style={{ fontSize:'13px', color:t.textMuted, marginBottom:'16px' }}>
                        Aún no hay comentarios en este registro.
                      </div>
                      <button
                        type="button"
                        disabled={!nivelInfo.nivelValidacion}
                        onClick={() => { if (nivelInfo.nivelValidacion) setPopupNuevoComentObra({ reg: modalComentarios.reg }) }}
                        style={{
                          background: color, color:'#fff', border:'none', borderRadius:'10px', padding:'10px 20px',
                          fontSize:'13px', fontWeight:'700', cursor: nivelInfo.nivelValidacion ? 'pointer' : 'not-allowed',
                          opacity: nivelInfo.nivelValidacion ? 1 : 0.5,
                        }}
                      >Crear comentario</button>
                      {!nivelInfo.nivelValidacion && (
                        <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'10px' }}>Tu perfil no tiene un nivel de validación asignado para iniciar comentarios.</div>
                      )}
                    </div>
                  : comentariosData.map(c => (
                    <div key={c.id} style={{ background:t.bg, borderRadius:'10px', padding:'12px', border:`1px solid ${color}33` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                        <span style={{ fontSize:'12px', fontWeight:'700', color }}>{c.autor?.nombre || 'Usuario'}</span>
                        <span style={{ fontSize:'10px', color:t.textMuted }}>{fmtFecha(c.created_at)}</span>
                      </div>
                      {c.etiqueta && <span style={{ fontSize:'10px', background:`${color}22`, color, borderRadius:'10px', padding:'2px 8px', marginBottom:'6px', display:'inline-block' }}>{c.etiqueta}</span>}
                      {c.asunto && <div style={{ fontSize:'12px', fontWeight:'700', color:t.text, marginBottom:'3px' }}>{c.asunto}</div>}
                      <div style={{ fontSize:'13px', color:t.text, lineHeight:1.5 }}>{c.mensaje}</div>
                      {(c.enlaces||[]).length > 0 && (
                        <div style={{ marginTop:'6px', display:'flex', flexDirection:'column', gap:'3px' }}>
                          {c.enlaces.map((url,i) => <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize:'11px', color:color }}>🔗 {url}</a>)}
                        </div>
                      )}
                      {/* Respuestas anidadas */}
                      {(c.respuestas||[]).length > 0 && (
                        <div style={{ marginTop:'10px', paddingLeft:'12px', borderLeft:`2px solid ${color}44`, display:'flex', flexDirection:'column', gap:'8px' }}>
                          {c.respuestas.map(r => (
                            <div key={r.id}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                                <span style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted }}>{r.autor?.nombre || 'Usuario'}</span>
                                <span style={{ fontSize:'10px', color:t.textMuted }}>{fmtFecha(r.created_at)}</span>
                              </div>
                              <div style={{ fontSize:'12px', color:t.text }}>{r.mensaje}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Responder */}
                      <div style={{ marginTop:'10px', display:'flex', gap:'6px', alignItems:'center' }}>
                        <input
                          placeholder="Responder..."
                          onKeyDown={async e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const msg = e.target.value.trim()
                              e.target.value = ''
                              await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${modalComentarios.reg.id}/comentarios/${c.id}/respuesta`, {
                                method:'POST', headers:{...hdrs,'Content-Type':'application/json'},
                                body: JSON.stringify({ mensaje: msg, rol_origen: rolOrigen })
                              })
                              setLoadingComentarios(true)
                              const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${modalComentarios.reg.id}/comentarios?rol_solicitante=${rolOrigen}`, { headers: hdrs })
                              if (res.ok) setComentariosData(await res.json())
                              setLoadingComentarios(false)
                            }
                          }}
                          style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:t.text }}
                        />
                        <span style={{ fontSize:'10px', color:t.textMuted }}>↵ Enter</span>
                      </div>
                    </div>
                  ))
                }
              </div>
              {comentariosData.length > 0 && !loadingComentarios && (
                <div style={{ marginTop:'12px', borderTop:`1px solid ${t.border}`, paddingTop:'12px', flexShrink:0 }}>
                  <button
                    type="button"
                    disabled={!nivelInfo.nivelValidacion}
                    onClick={() => { if (nivelInfo.nivelValidacion) setPopupNuevoComentObra({ reg: modalComentarios.reg }) }}
                    style={{
                      width:'100%',
                      background: nivelInfo.nivelValidacion ? `${color}18` : t.bg,
                      color: nivelInfo.nivelValidacion ? color : t.textMuted,
                      border: `1.5px solid ${nivelInfo.nivelValidacion ? color + '55' : t.border}`,
                      borderRadius:'10px', padding:'10px 14px', fontSize:'12px', fontWeight:'700',
                      cursor: nivelInfo.nivelValidacion ? 'pointer' : 'not-allowed',
                    }}
                  >＋ Nueva conversación</button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {popupNuevoComentObra && nivelInfo.nivelValidacion && (
        <PopupComentarioValidacion
          t={t} usuario={usuario} registro={popupNuevoComentObra.reg}
          contrato_id={contrato_id} API_URL={API_URL} hdrs={hdrs}
          estadoValidando="Mensaje"
          nivelValidacion={nivelInfo.nivelValidacion}
          obligatorio={true}
          modoConversacion={true}
          zIndexOverlay={10400}
          onConfirmar={async (comentarioData) => {
            if (!comentarioData) return
            const reg = popupNuevoComentObra.reg
            const nv = nivelInfo.nivelValidacion
            const body = {
              ...comentarioData,
              rol_origen: nivelInfo.rolOrigen,
              tipo: 'validacion',
              nivel_validacion: nv,
            }
            try {
              const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/${reg.id}/comentarios`, {
                method: 'POST', headers: hdrs, body: JSON.stringify(body),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                const detail = err?.detail
                let msg = `Error ${res.status}`
                if (typeof detail === 'string') msg = detail
                else if (Array.isArray(detail)) msg = detail.map(x => x?.msg || JSON.stringify(x)).join(', ')
                else if (detail && typeof detail === 'object') msg = JSON.stringify(detail)
                throw new Error(msg)
              }
              setPopupNuevoComentObra(null)
              await recargar()
              if (modalComentarios?.reg?.id === reg.id) {
                setLoadingComentarios(true)
                const rolOrigen = modalComentarios.rolOrigen
                const rList = await fetch(
                  `${API_URL}/sicoe-obra/${contrato_id}/registros/${reg.id}/comentarios?rol_solicitante=${rolOrigen}`,
                  { headers: hdrs },
                )
                if (rList.ok) setComentariosData(await rList.json())
                setLoadingComentarios(false)
              }
            } catch (e) {
              alert(e?.message || String(e))
            }
          }}
          onCancelar={() => setPopupNuevoComentObra(null)}
        />
      )}

      {modalTrazabilidadSicoe && (
        <TrazabilidadRegistroModal
          apiBase={API_URL}
          token={getToken()}
          entidadTipo="registro"
          entidadId={modalTrazabilidadSicoe.id}
          titulo={`SICOE obra · Registro #${modalTrazabilidadSicoe.numero_registro ?? modalTrazabilidadSicoe.id} · id ${modalTrazabilidadSicoe.id}`}
          theme={t}
          onClose={() => setModalTrazabilidadSicoe(null)}
        />
      )}

      {popupMasivo && puedeMasivaNivel && (
        <PopupComentarioValidacion
          t={t} usuario={usuario} registro={registroParaPopupMasivo}
          contrato_id={contrato_id} API_URL={API_URL} hdrs={hdrs}
          estadoValidando={popupMasivo.estado}
          nivelValidacion={nvMasivo}
          obligatorio={true}
          onConfirmar={comentarioData => ejecutarMasivoSeleccion(popupMasivo.estado, comentarioData)}
          onCancelar={() => setPopupMasivo(null)}
        />
      )}

      {/* ─ Modal Mover Registros ─ */}
      {modalMover && (
        <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setModalMover(false)}>
          <div style={{ background:t.bgCard, borderRadius:'16px', padding:'28px', width:'420px', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'16px', fontWeight:'800', color:t.text, marginBottom:'16px' }}>↗ Mover {seleccionados.length} registro(s) a otro reporte</div>
            <div style={{ fontSize:'12px', color:t.textMuted, marginBottom:'8px' }}>Reporte destino:</div>
            <select value={reporteDestino} onChange={e => setReporteDestino(e.target.value)} style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px', color:t.text, fontSize:'13px', marginBottom:'20px' }}>
              <option value="">— Selecciona reporte —</option>
              {reportesDisponibles.map(r => (
                <option key={r.id} value={r.id}>#{r.numero_reporte} — {r.descripcion_actividad || '(sin nombre)'}</option>
              ))}
            </select>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setModalMover(false)} style={{ flex:1, background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px', color:t.textMuted, cursor:'pointer', fontWeight:'600' }}>Cancelar</button>
              <button onClick={ejecutarMover} disabled={!reporteDestino || moviendoReg} style={{ flex:1, background:'#8B5CF6', color:'#fff', border:'none', borderRadius:'8px', padding:'10px', fontWeight:'700', cursor:'pointer', opacity: !reporteDestino || moviendoReg ? 0.6 : 1 }}>{moviendoReg ? 'Moviendo...' : 'Confirmar Mover'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SICOE OBRA: celda con barra tipo Excel (escala relativa al máximo de la columna) ─
function SicoePanelDataBarCell({ value, max, color, text, textColor, trackBg = 'rgba(148,163,184,0.06)' }) {
  const v = Math.max(0, Number(value) || 0)
  const m = Math.max(0, Number(max) || 0)
  const pct = m > 0 ? Math.min(100, (v / m) * 100) : (v > 0 ? 100 : 0)
  return (
    <div style={{ position:'relative', minWidth: 72, padding:'6px 16px', textAlign:'right' }}>
      <div
        aria-hidden
        style={{
          position:'absolute', left: 8, right: 16, top: '50%', transform: 'translateY(-50%)',
          height: 13, borderRadius: 3, background: trackBg, overflow: 'hidden',
        }}
      >
        {/* Relleno muy tenue: solo guía visual, no tapar el texto */}
        <div style={{ height: '100%', width: `${pct}%`, background: color, opacity: 0.14 }} />
      </div>
      <span style={{ position:'relative', zIndex: 1, color: textColor || color, fontWeight: 600 }}>{text}</span>
    </div>
  )
}

// ─── MÓDULO SICOE OBRA ────────────────────────────────────────────────────────
function ModuloSicoeObra({ t, usuario, token, s, navReporteId = null, navRegistroNumero = null, onNavReporteConsumed }) {
  const API_URL = API_BASE
  const contrato_id = usuario?.contrato_id

  const [reportes, setReportes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [hayMas, setHayMas] = useState(false)
  const [offsetActual, setOffsetActual] = useState(0)
  const [filtros, setFiltros] = useState({
    numero_reporte: '', numero_registro: '',
    semana: '', acta_rpo: '',
    subcontratista_id: '', capitulo: '', item: '',
    tramo: '', costado: '', pk_id: '',
    abs_inicio: '', abs_final: '', estado: '',
    cargo: '', estado_registro: '',
  })
  const [filtrosAvanzados, setFiltrosAvanzados] = useState(false)
  const [filtroSubcList, setFiltroSubcList] = useState([])
  const [filtroCapList, setFiltroCapList] = useState([])
  const [filtroItemList, setFiltroItemList] = useState([])
  const [filtroTramoList, setFiltroTramoList] = useState([])
  const [filtroCostadoList, setFiltroCostadoList] = useState([])
  const [filtroActaList, setFiltroActaList] = useState([])
  const [analisis, setAnalisis] = useState(null)
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false)
  const [panelExpandido, setPanelExpandido] = useState(false)
  const [busquedaRealizada, setBusquedaRealizada] = useState(false)
  const [busquedaAmplia, setBusquedaAmplia] = useState(false)
  const [sugerenciasItem, setSugerenciasItem] = useState([])
  const [mostrarSugsItem, setMostrarSugsItem] = useState(false)
  const [mostrarSugsActa, setMostrarSugsActa] = useState(false)
  const [modalNuevoReporte, setModalNuevoReporte]   = useState(false)
  const [reporteEditando, setReporteEditando]         = useState(null)
  const [modalCarpeta, setModalCarpeta]               = useState(false)
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null)

  /** Evita que una respuesta antigua de red sobrescriba grilla/panel (p. ej. tras «Volver»). */
  const sicoeBusquedaSeqRef = useRef(0)
  const sicoeAnalisisSeqRef = useRef(0)
  /** Refinamiento en servidor tras una búsqueda base (observación / nodo inicio o final). */
  const [sicoeFiltroObs, setSicoeFiltroObs] = useState('')
  const [sicoeFiltroNodo, setSicoeFiltroNodo] = useState('')
  const sicoeFiltroObsRef = useRef('')
  const sicoeFiltroNodoRef = useRef('')
  useEffect(() => { sicoeFiltroObsRef.current = sicoeFiltroObs }, [sicoeFiltroObs])
  useEffect(() => { sicoeFiltroNodoRef.current = sicoeFiltroNodo }, [sicoeFiltroNodo])
  const hadSicoeRefineRef = useRef(false)

  /** Panel de filtros SICOE (todo el bloque) colapsable. */
  const [sicoeFiltrosPanelOpen, setSicoeFiltrosPanelOpen] = useState(true)
  /** Maestro PK + plano del contrato para el selector visual (sin mostrar código interno). */
  const [sicoePkList, setSicoePkList] = useState([])
  const [sicoePlanoGeojson, setSicoePlanoGeojson] = useState(null)
  const [sicoeContratoCentro, setSicoeContratoCentro] = useState(null)
  const sicoeFiltroMapaRef = useRef(null)
  const sicoeFiltroMapaInst = useRef(null)
  const sicoeFiltroMarkersRef = useRef([])
  const sicoeMapFiltroApplyPkRef = useRef(() => {})
  const sicoeMapaOpenReporteRef = useRef(() => {})
  const buscarReportesSicoeRef = useRef(null)
  const cargarAnalisisSicoeRef = useRef(null)
  const sicoeFiltroPkSelRef = useRef('')

  useEffect(() => {
    if (!contrato_id) return
    const hdrs = { Authorization: `Bearer ${getToken()}` }
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/pk-ids`, { headers: hdrs })
      .then(r => r.json())
      .then(d => setSicoePkList(Array.isArray(d) ? d : []))
      .catch(() => setSicoePkList([]))
    fetch(`${API_URL}/contratos`, { headers: hdrs })
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        const c = Array.isArray(list) ? list.find(x => x.id === contrato_id) : null
        setSicoePlanoGeojson(c?.plano_geojson || null)
        setSicoeContratoCentro(
          c?.centro_lat != null && c?.centro_lng != null
            ? { lat: c.centro_lat, lng: c.centro_lng }
            : null,
        )
      })
      .catch(() => {
        setSicoePlanoGeojson(null)
        setSicoeContratoCentro(null)
      })
  }, [contrato_id])

  useEffect(() => {
    if (!navReporteId) return
    const repRow = (reportes || []).find((x) => x.id === navReporteId)
    setReporteSeleccionado(
      repRow
        ? { ...repRow, _cargandoDetalle: true, registros: [], puntos: [], _autoRegistro: navRegistroNumero }
        : { id: navReporteId, _cargandoDetalle: true, registros: [], puntos: [], _autoRegistro: navRegistroNumero }
    )
    setModalCarpeta(true)
    let u = `${API_URL}/sicoe-obra/${contrato_id}/reportes/${navReporteId}`
    if (capasValidacion.length > 0) {
      u += `?${new URLSearchParams({ validacion_capas: JSON.stringify(capasValidacion.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado }))) })}`
    }
    fetch(u, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data?.id) { setReporteSeleccionado({ ...data, _cargandoDetalle: false, _autoRegistro: navRegistroNumero }) }
      })
      .catch(() => {})
    onNavReporteConsumed?.()
  }, [navReporteId])

  const ESTADOS = ['Borrador', 'Sin Asignar Ítem', 'No Revisados', 'No Objeto de Cobro', 'En Papelera']
  const ESTADO_COLORS = {
    'Borrador': '#6B7280',
    'Sin Asignar Ítem': '#F59E0B',
    'No Revisados': '#0077B6',
    'No Objeto de Cobro': '#8B5CF6',
    'En Papelera': '#374151',
  }

  const perm = (usuario?.permisos || []).find(p => p.funcion_nombre === 'Reporte de Cantidades')
  const puedeVer    = perm?.ver || nivelInfo.nivelValidacion !== null
  const puedeCrear  = perm?.crear
  const puedeEditar = perm?.editar
  const puedeExportar = perm?.exportar
  const nivelInfo   = determinarNivelValidacion(usuario)
  const esSub       = nivelInfo.esSubcontratista
  // subcontratista_id del usuario para filtrar (puede venir como campo directo o en el objeto)
  const subIdUsuario = usuario?.subcontratista_id ?? usuario?.sub_id ?? null

  /** Sin filtros de grilla ni capa de validación → no se consulta el backend (grilla vacía). */
  const tieneParametrosBusquedaSicoe = (f, capas) => {
    const ef = { ...f }
    if (esSub && subIdUsuario && !ef.subcontratista_id) ef.subcontratista_id = subIdUsuario
    const tieneCapa =
      capas.length > 0 &&
      capas[0].cargo_id != null && capas[0].cargo_id !== '' &&
      String(capas[0].estado || '').trim() !== ''
    // Cualquier campo de la barra (incl. solo abscisa) cuenta: AND entre columnas al pulsar Buscar
    const tieneGrid = Object.values(ef).some(v => v !== '' && v != null)
    return tieneCapa || tieneGrid
  }

  const [semanaVigente,     setSemanaVigente]     = useState(null)
  const [semanaProxima,     setSemanaProxima]      = useState(null)
  const [alertaSemana,      setAlertaSemana]       = useState(false)
  const [modalSemana,       setModalSemana]        = useState(false)
  const [modalIniciarSem,   setModalIniciarSem]    = useState(false)
  const [nSemanas,          setNSemanas]           = useState(4)
  const [semFechaInicio,    setSemFechaInicio]     = useState('')
  const [semDiaCorte,       setSemDiaCorte]        = useState(4) // 4 = viernes
  const [semCantInicial,    setSemCantInicial]     = useState(8)
  const [creandoSemanas,    setCreandoSemanas]     = useState(false)
  const [extendiendo,       setExtendiendo]        = useState(false)

  const hdrsJSON = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }

  const cargarSemanaVigente = async () => {
    try {
      const res  = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/semana-vigente`, { headers: { Authorization: `Bearer ${getToken()}` } })
      const data = await res.json()
      setSemanaVigente(data.vigente || null)
      setSemanaProxima(data.proxima || null)
      if (data.vigente) {
        const hoy    = new Date()
        const fin    = new Date(data.vigente.fecha_fin + 'T23:59:59')
        const diffMs = fin - hoy
        const diffDias = diffMs / (1000 * 60 * 60 * 24)
        setAlertaSemana(!data.proxima && diffDias <= 2)
      } else {
        setAlertaSemana(false)
      }
    } catch(e) {}
  }

  const crearSemanasIniciales = async () => {
    if (!semFechaInicio) return
    setCreandoSemanas(true)
    try {
      const semanas = []
      let fechaBase = new Date(semFechaInicio + 'T00:00:00')
      for (let i = 0; i < semCantInicial; i++) {
        const fIni = new Date(fechaBase)
        fIni.setDate(fechaBase.getDate() + i * 7)
        const fFin = new Date(fIni)
        fFin.setDate(fIni.getDate() + 6)
        semanas.push({
          numero_semana: i + 1,
          fecha_inicio:  fIni.toISOString().slice(0, 10),
          fecha_fin:     fFin.toISOString().slice(0, 10),
          dia_corte:     parseInt(semDiaCorte),
          estado:        'activa',
        })
      }
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/semanas`, {
        method: 'POST', headers: hdrsJSON, body: JSON.stringify(semanas)
      })
      setModalIniciarSem(false)
      cargarSemanaVigente()
    } catch(e) {}
    setCreandoSemanas(false)
  }

  const extenderSemanas = async () => {
    setExtendiendo(true)
    try {
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/semanas/extender?n_semanas=${nSemanas}`, {
        method: 'POST', headers: hdrsJSON
      })
      setModalSemana(false)
      setAlertaSemana(false)
      cargarSemanaVigente()
    } catch(e) {}
    setExtendiendo(false)
  }

  useEffect(() => { if (contrato_id) cargarSemanaVigente() }, [contrato_id])

  useEffect(() => {
    if (!contrato_id) return
    const hdrs = { Authorization: `Bearer ${getToken()}` }
    Promise.all([
      fetch(`${API_URL}/sicoe-obra/${contrato_id}/subcontratistas-activos`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/capitulos`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/tramoscostados`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
      fetch(`${API_URL}/actas/${contrato_id}/lista`, { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]).then(([subc, caps, tc, actas]) => {
      setFiltroSubcList(Array.isArray(subc) ? subc : [])
      setFiltroCapList(Array.isArray(caps) ? caps : [])
      setFiltroTramoList(Array.isArray(tc?.tramos) ? tc.tramos : [])
      setFiltroCostadoList(Array.isArray(tc?.costados) ? tc.costados : [])
      setFiltroActaList(Array.isArray(actas) ? actas.filter(a => a.numero_rpo != null).map(a => ({ id: a.id, numero_rpo: a.numero_rpo })) : [])
    })
  }, [contrato_id])

  // Auto-buscar al montar con el filtro de validación del cargo del usuario
  useEffect(() => {
    if (!contrato_id) return
    const CARGO_ID_NIVEL = {54:1, 44:2, 45:2, 51:2, 56:2, 50:3, 58:3}
    if (cargoIdUsuario && CARGO_ID_NIVEL[cargoIdUsuario]) {
      // Usuario con nivel de validación → busca pre-filtrado por su cargo
      const capasIniciales = [{
        cargo_id: cargoIdUsuario,
        cargo_nombre: cargoNombreUsuario,
        estado: 'No Revisado'
      }]
      buscarReportes(filtros, 0, capasIniciales)
      cargarAnalisis(filtros, capasIniciales)
    }
    // Sin filtros en la grilla → no se carga datos (incl. editores: deben pulsar Buscar con criterios)
  }, [contrato_id])

  const urlReporteDetalle = (repId, capas) => {
    let u = `${API_URL}/sicoe-obra/${contrato_id}/reportes/${repId}`
    if (capas && capas.length > 0) {
      const payload = capas.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado }))
      u += `?${new URLSearchParams({ validacion_capas: JSON.stringify(payload) })}`
    }
    return u
  }

  const buscarReportes = async (nuevosFiltros, nuevoOffset = 0, capas = []) => {
    if (!tieneParametrosBusquedaSicoe(nuevosFiltros, capas)) {
      if (nuevoOffset === 0) {
        setReportes([])
        setHayMas(false)
        setOffsetActual(0)
        setBusquedaRealizada(true)
      }
      setBusquedaAmplia(false)
      setCargando(false)
      return
    }
    const seq = ++sicoeBusquedaSeqRef.current
    setCargando(true)
    const esBusquedaAmplia = capas.length > 0 &&
      Object.values(nuevosFiltros).every(v => v === '' || v == null)
    if (esBusquedaAmplia) setBusquedaAmplia(true)
    else setBusquedaAmplia(false)
    try {
      const params = new URLSearchParams()
      const ef = { ...nuevosFiltros }
      if (esSub && subIdUsuario && !ef.subcontratista_id) ef.subcontratista_id = subIdUsuario
      Object.entries(ef).forEach(([k, v]) => { if (v !== '' && v != null) params.append(k, v) })
      if (capas.length > 0) {
        const payload = capas.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado }))
        params.append('validacion_capas', JSON.stringify(payload))
        params.append('cargo_id', capas[0].cargo_id)
        params.append('estado_validacion', capas[0].estado)
      }
      const oObs = sicoeFiltroObsRef.current?.trim()
      const oNod = sicoeFiltroNodoRef.current?.trim()
      if (oObs) params.append('q_observacion', oObs)
      if (oNod) params.append('q_nodo', oNod)
      const baseParams = new URLSearchParams(params)
      const PAGE_SIZE = 50
      const fetchPage = async (offset) => {
        const p = new URLSearchParams(baseParams)
        p.set('offset', String(offset))
        p.set('limit', String(PAGE_SIZE))
        const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/buscar?${p}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })
        return res.json()
      }

      const data = await fetchPage(nuevoOffset)
      if (seq !== sicoeBusquedaSeqRef.current) return
      const lista = Array.isArray(data.reportes) ? data.reportes : []
      // Antes: con validación se traían TODAS las páginas en serie (N×50 request) y bloqueaba la UI 10–60+ s.
      // El análisis KPI sigue yendo a /sicoe-obra/.../analisis (mismo criterio). La grilla pagina con «Cargar 50 más».
      if (seq !== sicoeBusquedaSeqRef.current) return
      if (nuevoOffset === 0) {
        setReportes(lista)
      } else {
        setReportes((prev) => [...prev, ...lista])
      }
      setHayMas(!!data.hay_mas)
      setOffsetActual(nuevoOffset + PAGE_SIZE)
      if (seq !== sicoeBusquedaSeqRef.current) return
      setBusquedaRealizada(true)
      // Auto-abrir cuando búsqueda por N° Registro devuelve resultado único
      if (nuevosFiltros.numero_registro && lista.length === 1) {
        const rep = lista[0]
        setReporteSeleccionado({ ...rep, _cargandoDetalle: true, registros: [], puntos: [] })
        setModalCarpeta(true)
        const r2 = await fetch(urlReporteDetalle(rep.id, capas), { headers: { Authorization: `Bearer ${getToken()}` } })
        const detalle = await r2.json()
        if (seq !== sicoeBusquedaSeqRef.current) return
        if (detalle?.id) setReporteSeleccionado({ ...detalle, _cargandoDetalle: false })
      }
    } catch(e) {}
    finally {
      if (seq === sicoeBusquedaSeqRef.current) setCargando(false)
    }
  }

  const fmtPesos = v => '$' + Math.round(v || 0).toLocaleString('es-CO')

  const verEco = nivelInfo.verValoresEconomicos

  const sicoePanelMax = useMemo(() => {
    if (!analisis?.grupos?.length) return null
    const mode = analisis.modo
    const groups = analisis.grupos
    const max = {}
    const bump = (k, v) => {
      const n = Math.abs(Number(v) || 0)
      max[k] = Math.max(max[k] || 0, n)
    }
    if (mode === 'capitulo_items') {
      for (const g of groups) {
        bump('cant', g.cantidad_total)
        if (verEco) {
          bump('cd', g.costo_directo)
          bump('ap', g.aprobados)
          bump('pe', g.pendientes)
          bump('re', g.rechazados)
        } else {
          bump('ap', g.aprobados_count)
          bump('pe', g.pendientes_count)
          bump('re', g.rechazados_count)
        }
      }
    } else if (mode === 'item_detalle') {
      for (const g of groups) {
        bump('cant', g.cantidad_total)
        bump('regs', g.total_registros)
        if (verEco) {
          bump('cd', g.costo_directo)
          bump('ap', g.aprobados)
          bump('pe', g.pendientes)
          bump('re', g.rechazados)
        } else {
          bump('ap', g.aprobados_count)
          bump('pe', g.pendientes_count)
          bump('re', g.rechazados_count)
        }
      }
    } else {
      for (const g of groups) {
        bump('regs', g.total_registros)
        if (verEco) {
          bump('cd', g.costo_directo)
          bump('sinv', g.no_revisados_costo)
          bump('ap', g.aprobados)
          bump('pe', g.pendientes)
          bump('re', g.rechazados)
        } else {
          bump('sinv', g.no_revisados)
        }
      }
    }
    return max
  }, [analisis, verEco])

  const mx = sicoePanelMax || {}

  const cargarAnalisis = async (nuevosFiltros, capas = []) => {
    const seq = ++sicoeAnalisisSeqRef.current
    if (!tieneParametrosBusquedaSicoe(nuevosFiltros, capas)) {
      if (seq === sicoeAnalisisSeqRef.current) setAnalisis(null)
      return
    }
    setCargandoAnalisis(true)
    try {
      const params = new URLSearchParams()
      const ef = { ...nuevosFiltros }
      if (esSub && subIdUsuario && !ef.subcontratista_id) ef.subcontratista_id = subIdUsuario
      const camposAnalisis = ['acta_rpo','semana','subcontratista_id','capitulo','item','tramo','costado','abs_inicio','abs_final','estado','numero_reporte','numero_registro','pk_id']
      camposAnalisis.forEach(k => {
        const v = ef[k]
        if (v === '' || v == null) return
        if (k === 'abs_inicio' || k === 'abs_final') {
          const n = Number(v)
          if (Number.isFinite(n)) params.append(k, String(n))
          return
        }
        params.append(k, v)
      })
      if (capas.length > 0) {
        const payload = capas.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado }))
        params.append('validacion_capas', JSON.stringify(payload))
        params.append('cargo_id', capas[0].cargo_id)
        params.append('estado_validacion', capas[0].estado)
      }
      const oObsA = sicoeFiltroObsRef.current?.trim()
      const oNodA = sicoeFiltroNodoRef.current?.trim()
      if (oObsA) params.append('q_observacion', oObsA)
      if (oNodA) params.append('q_nodo', oNodA)
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/analisis?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (seq === sicoeAnalisisSeqRef.current) setAnalisis(null)
        return
      }
      if (seq !== sicoeAnalisisSeqRef.current) return
      if (data && Array.isArray(data.grupos)) setAnalisis(data)
      else setAnalisis(null)
    } catch(e) {
      if (seq === sicoeAnalisisSeqRef.current) setAnalisis(null)
    } finally {
      if (seq === sicoeAnalisisSeqRef.current) setCargandoAnalisis(false)
    }
  }

  const actualizarFiltrosDisponibles = async (filtrosActivos) => {
    const hdrs = { Authorization: `Bearer ${getToken()}` }
    const params = new URLSearchParams()
    if (filtrosActivos.acta_rpo)          params.append('acta_rpo', filtrosActivos.acta_rpo)
    if (filtrosActivos.semana)            params.append('semana', filtrosActivos.semana)
    if (filtrosActivos.subcontratista_id) params.append('subcontratista_id', filtrosActivos.subcontratista_id)
    try {
      const caps = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/capitulos?${params}`, { headers: hdrs }).then(r => r.json())
      setFiltroCapList(Array.isArray(caps) ? caps : [])
    } catch(e) {}
    if (filtrosActivos.capitulo) {
      params.append('capitulo', filtrosActivos.capitulo)
      try {
        const items = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/items?${params}`, { headers: hdrs }).then(r => r.json())
        setFiltroItemList(Array.isArray(items) ? items : [])
      } catch(e) {}
    } else {
      setFiltroItemList([])
    }
  }

  const hayFiltrosActivos = Object.values(filtros).some(v => v !== '')
  const cargoIdUsuario     = usuario?.cargo_id || null
  const cargoNombreUsuario = usuario?.cargo_nombre || usuario?.cargo || ''

  const defaultCapasValidacion = useMemo(() => {
    const CARGO_ID_NIVEL = { 54: 1, 44: 2, 45: 2, 51: 2, 56: 2, 50: 3, 58: 3 }
    if (!cargoIdUsuario || !CARGO_ID_NIVEL[cargoIdUsuario]) return []
    return [{ cargo_id: cargoIdUsuario, cargo_nombre: cargoNombreUsuario, estado: 'No Revisado' }]
  }, [cargoIdUsuario, cargoNombreUsuario])

  const [capasValidacion, setCapasValidacion] = useState(() => {
    const CARGO_ID_NIVEL = { 54: 1, 44: 2, 45: 2, 51: 2, 56: 2, 50: 3, 58: 3 }
    if (!cargoIdUsuario || !CARGO_ID_NIVEL[cargoIdUsuario]) return []
    return [{ cargo_id: cargoIdUsuario, cargo_nombre: cargoNombreUsuario, estado: 'No Revisado' }]
  })
  const [capaTemp, setCapaTemp] = useState({ cargo_id: '', cargo_nombre: '', estado: '' })

  const filtrosSicoeRef = useRef(filtros)
  filtrosSicoeRef.current = filtros
  sicoeFiltroPkSelRef.current = filtros.pk_id
  const capasSicoeRef = useRef(capasValidacion)
  capasSicoeRef.current = capasValidacion

  buscarReportesSicoeRef.current = buscarReportes
  cargarAnalisisSicoeRef.current = cargarAnalisis
  sicoeMapFiltroApplyPkRef.current = (pkIdInt) => {
    const nf = { ...filtrosSicoeRef.current, pk_id: String(pkIdInt) }
    setFiltros(nf)
    buscarReportesSicoeRef.current?.(nf, 0, capasSicoeRef.current)
    cargarAnalisisSicoeRef.current?.(nf, capasSicoeRef.current)
  }
  sicoeMapaOpenReporteRef.current = async (rid) => {
    const rep = (reportes || []).find((x) => x.id === rid)
    setReporteSeleccionado(
      rep
        ? { ...rep, _cargandoDetalle: true, registros: [], puntos: [] }
        : { id: rid, _cargandoDetalle: true, registros: [], puntos: [] }
    )
    setModalCarpeta(true)
    try {
      const u = urlReporteDetalle(rid, capasSicoeRef.current)
      const r = await fetch(u, { headers: { Authorization: `Bearer ${getToken()}` } })
      const data = await r.json()
      if (data?.id) setReporteSeleccionado({ ...data, _cargandoDetalle: false })
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!contrato_id) return
    if (!tieneParametrosBusquedaSicoe(filtrosSicoeRef.current, capasSicoeRef.current)) return
    const hasR = !!(sicoeFiltroObs?.trim() || sicoeFiltroNodo?.trim())
    if (!hasR) {
      if (!hadSicoeRefineRef.current) return
      hadSicoeRefineRef.current = false
    } else {
      hadSicoeRefineRef.current = true
    }
    const t = setTimeout(() => {
      buscarReportes(filtrosSicoeRef.current, 0, capasSicoeRef.current)
      cargarAnalisis(filtrosSicoeRef.current, capasSicoeRef.current)
    }, 400)
    return () => clearTimeout(t)
  }, [sicoeFiltroObs, sicoeFiltroNodo, contrato_id])

  /** Vuelve un nivel en el panel (ítem → capítulo → vista general) sin limpiar el resto de filtros. */
  const volverPanelAnterior = async () => {
    const itemT = String(filtros.item || '').trim()
    const capT = String(filtros.capitulo || '').trim()
    const modo = analisis?.modo

    let nf = { ...filtros }
    if (itemT) {
      nf = { ...nf, item: '' }
    } else if (capT) {
      nf = { ...nf, capitulo: '', item: '' }
    } else if (modo === 'item_detalle') {
      nf = { ...nf, item: '' }
    } else if (modo === 'capitulo_items') {
      nf = { ...nf, capitulo: '', item: '' }
    } else {
      return
    }
    setFiltros(nf)
    await buscarReportes(nf, 0, capasValidacion)
    await cargarAnalisis(nf, capasValidacion)
  }
  const puedeVolverPanel = !!(
    String(filtros.item || '').trim() ||
    String(filtros.capitulo || '').trim() ||
    analisis?.modo === 'item_detalle' ||
    analisis?.modo === 'capitulo_items'
  )

  const [cargosValidacionList, setCargosValidacionList] = useState([])
  useEffect(() => {
    if (!contrato_id) return
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/cargos-validacion`,
      { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => setCargosValidacionList(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [contrato_id])

  useEffect(() => {
    if (!Array.isArray(cargosValidacionList) || cargosValidacionList.length === 0) return
    setCapasValidacion(prev => prev.map((c) => {
      const nombreActual = String(c?.cargo_nombre || '').trim()
      const pareceId = /^\d+$/.test(nombreActual) || /^cargo\s+\d+$/i.test(nombreActual)
      if (nombreActual && !pareceId) return c
      const match = cargosValidacionList.find(x => String(x.id) === String(c?.cargo_id))
      return match?.nombre ? { ...c, cargo_nombre: match.nombre } : c
    }))
  }, [cargosValidacionList])

  const CARGO_ID_NIVEL_VALIDO = {54:1, 44:2, 45:2, 51:2, 56:2, 50:3, 58:3}
  const cargosDisponiblesEnFiltro = useMemo(() => {
    if (nivelInfo.esApoyoTecnico) {
      // Para apoyo técnico de interventoría solo se habilita el cargo "Residente de Interventoría".
      return cargosValidacionList.filter(c =>
        String(c?.nombre || '').toLowerCase().includes('residente') &&
        String(c?.nombre || '').toLowerCase().includes('intervent')
      )
    }
    if (!cargoIdUsuario || !CARGO_ID_NIVEL_VALIDO[cargoIdUsuario]) {
      return cargosValidacionList  // Dev/Admin: ve todos
    }
    return cargosValidacionList.filter(c => c.id === cargoIdUsuario)
  }, [cargosValidacionList, cargoIdUsuario, nivelInfo.esApoyoTecnico])
  const filtrosVacios = { numero_reporte:'', numero_registro:'', semana:'', acta_rpo:'', subcontratista_id:'', capitulo:'', item:'', tramo:'', costado:'', pk_id:'', abs_inicio:'', abs_final:'', estado:'' }
  /** Abscisas y nodos en cabecera de reporte (grilla SICOE). */
  const fmtSicoeRangoCabecera = (a, b) => {
    const pa = a != null && String(a).trim() !== '' ? String(a).trim() : '—'
    const pb = b != null && String(b).trim() !== '' ? String(b).trim() : '—'
    if (pa === '—' && pb === '—') return '—'
    return `${pa} → ${pb}`
  }
  // Varias capas: AND en backend (/reportes/buscar); no refinar de nuevo con agregados por reporte
  const reportesMostrados = reportes

  const sicoePuntosPlano = useMemo(() => {
    const ignorarGpsReportes = contrato_id != null && SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS.has(Number(contrato_id))
    const defLng = sicoeContratoCentro?.lng ?? -74.0817
    const defLat = sicoeContratoCentro?.lat ?? 4.6097
    const center = [defLng, defLat]
    const metaFromPk = (pk) => {
      const e = [pk.civ, pk.tramo, pk.infraestructura].filter(Boolean).join(' · ')
      return e || 'Ubicación en obra'
    }
    const pts = []
    if (!busquedaRealizada || reportesMostrados.length === 0) return pts
    const byPk = new Map()
    const pkMeta = new Map(sicoePkList.map(p => [p.id, p]))
    for (const rep of reportesMostrados) {
      const pid = rep.pk_id_id
      const la = rep.coord_lat
      const lo = rep.coord_lng
      const hasCoord = !ignorarGpsReportes && la != null && lo != null && !Number.isNaN(+la) && !Number.isNaN(+lo)
      if (pid == null) {
        if (hasCoord) {
          const lab = (rep.descripcion_actividad || '').trim().slice(0, 52) || `Reporte #${rep.numero_reporte ?? rep.id}`
          pts.push({
            pk_id_id: null,
            reporte_id: rep.id,
            soloReporte: true,
            etiqueta: lab,
            lat: +la,
            lng: +lo,
            reportes_count: 1,
            aproximado: false,
          })
        }
        continue
      }
      if (!byPk.has(pid)) byPk.set(pid, { reps: [], lat: null, lng: null })
      const g = byPk.get(pid)
      g.reps.push(rep)
      if (hasCoord && g.lat == null) {
        g.lat = +la
        g.lng = +lo
      }
    }
    let i = 0
    for (const [pid, g] of byPk) {
      const meta = pkMeta.get(pid) || {}
      const etiqueta = metaFromPk(meta)
      let lat = g.lat
      let lng = g.lng
      const tiene = lat != null && lng != null
      if (!tiene) {
        const o = (i++) * 0.00015
        lng = center[0] + Math.cos(i * 2.4) * o * 100
        lat = center[1] + Math.sin(i * 2.4) * o * 100
      }
      pts.push({
        pk_id_id: pid,
        reporte_id: null,
        soloReporte: false,
        etiqueta,
        lat,
        lng,
        reportes_count: g.reps.length,
        aproximado: !tiene,
      })
    }
    return pts
  }, [busquedaRealizada, reportesMostrados, sicoePkList, sicoeContratoCentro, contrato_id])

  const sicoeTienePlanoGeojson = useMemo(() => {
    const g = sicoePlanoGeojson
    if (!g || typeof g !== 'object') return false
    if (g.type === 'FeatureCollection' && Array.isArray(g.features)) return g.features.length > 0
    return Array.isArray(g.features) && g.features.length > 0
  }, [sicoePlanoGeojson])

  useLayoutEffect(() => {
    if (!filtrosAvanzados || !contrato_id) return
    const container = sicoeFiltroMapaRef.current
    if (!container) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) return

    const mapEl = document.createElement('div')
    mapEl.style.width = '100%'
    mapEl.style.height = '260px'
    container.innerHTML = ''
    container.appendChild(mapEl)

    mapboxgl.accessToken = token
    const center0 = sicoeContratoCentro?.lng != null && sicoeContratoCentro?.lat != null
      ? [sicoeContratoCentro.lng, sicoeContratoCentro.lat]
      : [-74.0817, 4.6097]
    const map = new mapboxgl.Map({
      container: mapEl,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: center0,
      zoom: 11,
      bearing: 270,
    })
    sicoeFiltroMapaInst.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    const puntos = sicoePuntosPlano
    const pkList = sicoePkList
    const geo = sicoeTienePlanoGeojson ? sicoePlanoGeojson : null

    const marcar = () => {
      sicoeFiltroMarkersRef.current.forEach(m => { try { m.remove() } catch { /* ignore */ } })
      sicoeFiltroMarkersRef.current = []
      puntos.forEach(pt => {
        const el = document.createElement('div')
        el.style.width = '14px'
        el.style.height = '14px'
        el.style.borderRadius = '50%'
        const selPk = String(sicoeFiltroPkSelRef.current || '')
        if (pt.soloReporte) {
          el.style.background = '#f97316'
        } else {
          el.style.background = selPk === String(pt.pk_id_id) ? '#0077B6' : '#94a3b8'
        }
        el.style.border = '2px solid #fff'
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)'
        el.style.cursor = 'pointer'
        el.title = pt.etiqueta + (pt.aproximado ? ' (aprox.)' : '')
        const m = new mapboxgl.Marker({ element: el }).setLngLat([pt.lng, pt.lat]).addTo(map)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          if (pt.soloReporte && pt.reporte_id) {
            sicoeMapaOpenReporteRef.current(pt.reporte_id)
          } else if (pt.pk_id_id != null) {
            sicoeMapFiltroApplyPkRef.current(pt.pk_id_id)
          }
        })
        sicoeFiltroMarkersRef.current.push(m)
      })
    }

    map.on('load', () => {
      if (geo?.features?.length) {
        const pkIdsFiltrados = new Set(puntos.filter(p => p.pk_id_id != null).map(p => String(p.pk_id_id)))
        const enriched = {
          ...geo,
          features: geo.features.map(f => {
            const lay = String(f.properties?.Layer ?? f.properties?.PK_ID ?? f.properties?.pk_id ?? '').trim()
            const matchPk = pkList.find(p => String(p.pk_id).trim() === lay)
            const inFilter = !!(matchPk && pkIdsFiltrados.has(String(matchPk.id)))
            return {
              ...f,
              properties: {
                ...f.properties,
                _sicoe_opacity: inFilter ? 0.5 : 0.12,
              },
            }
          }),
        }
        map.addSource('sicoe-filtro-plano', { type: 'geojson', data: enriched })
        map.addLayer({
          id: 'sicoe-filtro-plano-fill',
          type: 'fill',
          source: 'sicoe-filtro-plano',
          paint: {
            'fill-color': '#0077B6',
            'fill-opacity': ['get', '_sicoe_opacity'],
          },
        })
        map.addLayer({
          id: 'sicoe-filtro-plano-line',
          type: 'line',
          source: 'sicoe-filtro-plano',
          paint: { 'line-color': '#00A896', 'line-width': 1.2 },
        })
        map.on('click', 'sicoe-filtro-plano-fill', (e) => {
          const feat = e.features?.[0]
          if (!feat) return
          const pkIdVal = String(feat.properties?.Layer ?? feat.properties?.PK_ID ?? feat.properties?.pk_id ?? '').trim()
          const found = pkList.find(p => String(p.pk_id).trim() === pkIdVal)
          if (found?.id) sicoeMapFiltroApplyPkRef.current(found.id)
        })
        map.on('mouseenter', 'sicoe-filtro-plano-fill', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'sicoe-filtro-plano-fill', () => { map.getCanvas().style.cursor = '' })
      }
      marcar()
      if (puntos.length > 0) {
        try {
          const lngs = puntos.map(p => p.lng)
          const lats = puntos.map(p => p.lat)
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0, maxZoom: 15, bearing: 270, pitch: 0 })
        } catch { /* ignore */ }
      } else if (geo?.features?.length) {
        const coords = geo.features.flatMap(f => {
          const geom = f.geometry
          if (!geom) return []
          if (geom.type === 'Polygon') return geom.coordinates[0]
          if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2)
          return []
        })
        if (coords.length > 0) {
          const lngs = coords.map(c => c[0])
          const lats = coords.map(c => c[1])
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 24, duration: 0, bearing: 270, pitch: 0 })
        }
      }
    })

    return () => {
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      sicoeFiltroMapaInst.current = null
      sicoeFiltroMarkersRef.current.forEach(m => { try { m.remove() } catch { /* ignore */ } })
      sicoeFiltroMarkersRef.current = []
    }
  }, [
    filtrosAvanzados,
    contrato_id,
    sicoePlanoGeojson,
    sicoeTienePlanoGeojson,
    sicoePuntosPlano,
    sicoePkList,
    t.bg,
    sicoeContratoCentro,
    filtros.pk_id,
  ])

  const limpiarFiltros = () => {
    hadSicoeRefineRef.current = false
    setSicoeFiltroObs('')
    setSicoeFiltroNodo('')
    setCapasValidacion(defaultCapasValidacion)
    setCapaTemp({ cargo_id: '', cargo_nombre: '', estado: '' })
    setFiltros(filtrosVacios)
    setReportes([])
    setAnalisis(null)
    setFiltroItemList([])
    setSugerenciasItem([])
    setMostrarSugsItem(false)
    setPanelExpandido(false)
    setBusquedaRealizada(false)
    setHayMas(false)
    setOffsetActual(0)
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/capitulos`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(caps => setFiltroCapList(Array.isArray(caps) ? caps : [])).catch(() => {})
  }

  // ── Exportar registros (popup con campos seleccionables) ─────────────────
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportCargandoCampos, setExportCargandoCampos] = useState(false)
  const [exportCampos, setExportCampos] = useState([])
  const [exportFiltroCampo, setExportFiltroCampo] = useState('')
  const [exportSeleccionCampos, setExportSeleccionCampos] = useState([])
  const [exportError, setExportError] = useState(null)
  const [exportando, setExportando] = useState(false)
  const [exportMetaContrato, setExportMetaContrato] = useState(null)

  const CAMPOS_OCULTOS_EXPORT = new Set([
    'id',
    'contrato_id',
    'reporte_id',
    'acta_rpo_id',
    'semana_id',
    'subcontratista_id',
    'reporte',
  ])
  const CAMPOS_VIRTUALES_EXPORT = ['reporte_numero', 'acta_rpo_numero', 'semana_numero', 'pk_id_valor', 'subcontratista_nombre']
  const LABELS_EXPORT = {
    reporte_numero: 'Reporte',
    acta_rpo_numero: 'Acta RPO',
    semana_numero: 'Semana',
    pk_id_valor: 'PK_ID',
    subcontratista_nombre: 'Subcontratista',
    vlr_unitario: 'Valor unitario',
    cantidad_total: 'Cantidad total',
    item_numero: 'Item',
    item_descripcion: 'Descripcion',
    nivel1_estado: 'Estado nivel 1',
    nivel2_estado: 'Estado nivel 2',
    nivel3_estado: 'Estado nivel 3',
    sub_estado: 'Estado sub',
  }
  const prettyCampo = (c) => LABELS_EXPORT[c] || String(c || '').replace(/_/g, ' ').replace(/\bid\b/gi, 'ID').toUpperCase()

  const abrirPopupExportRegistros = async () => {
    if (!contrato_id) return
    setExportModalOpen(true)
    setExportError(null)
    setExportCargandoCampos(true)
    setExportCampos([])
    setExportSeleccionCampos([])
    setExportFiltroCampo('')

    try {
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/campos`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const campos = await res.json()
      const camposRaw = Array.isArray(campos) ? campos : []
      const camposVisibles = camposRaw.filter(c => {
        const k = String(c || '').toLowerCase()
        if (CAMPOS_OCULTOS_EXPORT.has(k)) return false
        if (k.endsWith('_id')) return false
        // Ocultar todo lo relacionado a subcontratista/campos sub,
        // dejando solamente el campo de negocio "subcontratista" (virtual).
        if (k.includes('subcontrat')) return false
        if (k.includes('_sub') || k.startsWith('sub_')) return false
        return true
      })
      const camposOk = [...new Set([...CAMPOS_VIRTUALES_EXPORT, ...camposVisibles])]
      setExportCampos(camposOk)

      // Metadatos de contrato para encabezado del Excel
      try {
        const rc = await fetch(`${API_URL}/contratos`, { headers: { Authorization: `Bearer ${getToken()}` } })
        const contratos = await rc.json()
        const c = (Array.isArray(contratos) ? contratos : []).find(x => x.id === contrato_id)
        setExportMetaContrato(c || null)
      } catch {
        setExportMetaContrato(null)
      }

      const DEFAULT = [
        'reporte_numero',
        'acta_rpo_numero',
        'semana_numero',
        'numero_registro',
        'capitulo',
        'item_numero',
        'item_descripcion',
        'unidad',
        'vlr_unitario',
        'longitud',
        'ancho',
        'espesor',
        'cantidad_total',
        'costo_directo',
        'pk_id_valor',
        'tramo',
        'margen',
        'nivel1_estado',
        'nivel2_estado',
        'nivel3_estado',
      ]
      const defaultsOk = DEFAULT.filter(c => camposOk.includes(c))
      setExportSeleccionCampos(defaultsOk.length > 0 ? defaultsOk : camposOk.slice(0, 20))
    } catch (e) {
      setExportError(e?.message || 'Error consultando campos')
    } finally {
      setExportCargandoCampos(false)
    }
  }

  const camposVista = exportFiltroCampo.trim()
    ? exportCampos.filter(c => String(c).toLowerCase().includes(exportFiltroCampo.trim().toLowerCase()))
    : exportCampos

  const descargarExcelRegistros = async () => {
    if (!exportSeleccionCampos || exportSeleccionCampos.length === 0) return
    if (!contrato_id) return
    setExportError(null)
    setExportando(true)
    try {
      const fNorm = { ...filtros }
      Object.keys(fNorm).forEach(k => { if (fNorm[k] === '' || fNorm[k] === undefined) fNorm[k] = null })
      const capa0 = capasValidacion?.[0] || null
      const camposRequest = exportSeleccionCampos.filter(c => !CAMPOS_VIRTUALES_EXPORT.includes(c))
      const payload = {
        numero_reporte: fNorm.numero_reporte ?? null,
        numero_registro: fNorm.numero_registro ?? null,
        semana: fNorm.semana ?? null,
        acta_rpo: fNorm.acta_rpo ?? null,
        subcontratista_id: fNorm.subcontratista_id ?? null,
        capitulo: fNorm.capitulo ?? null,
        item: fNorm.item ?? null,
        tramo: fNorm.tramo ?? null,
        costado: fNorm.costado ?? null,
        pk_id: fNorm.pk_id ?? null,
        abs_inicio: fNorm.abs_inicio ?? null,
        abs_final: fNorm.abs_final ?? null,
        estado: fNorm.estado ?? null,
        cargo_id: capa0?.cargo_id ?? null,
        estado_validacion: capa0?.estado ?? null,
        validacion_capas:
          capasValidacion && capasValidacion.length > 0
            ? JSON.stringify(capasValidacion.map((c) => ({ cargo_id: c.cargo_id, estado: c.estado })))
            : null,
        q_observacion: (sicoeFiltroObsRef.current && String(sicoeFiltroObsRef.current).trim()) || null,
        q_nodo: (sicoeFiltroNodoRef.current && String(sicoeFiltroNodoRef.current).trim()) || null,
        campos: camposRequest,
      }
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros/exportar`, {
        method: 'POST',
        headers: { ...hdrsJSON, Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error ${res.status} exportando registros`)
      }
      const registros = await res.json()
      const registrosOk = Array.isArray(registros) ? registros : []
      const headers = exportSeleccionCampos.map(c => prettyCampo(c))
      const bodyRows = registrosOk.map(r => exportSeleccionCampos.map(c => r?.[c] ?? ''))
      const hoy = new Date()
      const fechaTxt = hoy.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
      const horaTxt = hoy.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      const meta = exportMetaContrato || {}
      const totalCols = Math.max(headers.length, 6)
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('SICOE Obra - Registros', {
        views: [{ showGridLines: false }],
      })

      ws.addRow(['CLARACORE - SICOE OBRA - EXPORTACION DE REGISTROS'])
      ws.addRow([`Contrato: ${meta.numero || ''}`, '', '', '', '', `Generado: ${fechaTxt} ${horaTxt}`])
      ws.addRow([`Contratista: ${meta.contratista || ''}`])
      ws.addRow([`Interventoria: ${meta.interventoria || ''}`])
      ws.addRow([`Objeto: ${meta.objeto || ''}`])
      ws.addRow([])
      ws.addRow(headers)
      bodyRows.forEach(r => ws.addRow(r))

      ws.mergeCells(1, 1, 1, totalCols)
      ws.mergeCells(3, 1, 3, totalCols)
      ws.mergeCells(4, 1, 4, totalCols)
      ws.mergeCells(5, 1, 5, totalCols)

      for (let c = 1; c <= totalCols; c += 1) {
        ws.getColumn(c).width = c === 1 ? 24 : 18
      }
      ws.getRow(1).height = 28
      ws.getRow(2).height = 22
      ws.getRow(3).height = 20
      ws.getRow(4).height = 20
      ws.getRow(5).height = 20
      ws.getRow(7).height = 22

      const pastelTitle = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDDEFF8' },
      }
      const pastelMeta = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEF7FB' },
      }
      const pastelHeader = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5F4FA' },
      }

      ws.getCell('A1').fill = pastelTitle
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2942' } }
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }

      ws.getCell('A2').fill = pastelMeta
      ws.getCell('F2').fill = pastelMeta
      ws.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
      ws.getCell('F2').font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }

      ;['A3', 'A4', 'A5'].forEach(addr => {
        ws.getCell(addr).fill = pastelMeta
        ws.getCell(addr).font = { bold: true, size: 11, color: { argb: 'FF1F4E70' } }
      })

      ws.getRow(7).eachCell(cell => {
        cell.fill = pastelHeader
        cell.font = { bold: true, size: 11, color: { argb: 'FF0F2942' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      })

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sicoe_obra_registros_${contrato_id ?? 'NA'}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportModalOpen(false)
    } catch (e) {
      setExportError(e?.message || 'Error exportando Excel')
    } finally {
      setExportando(false)
    }
  }

  const toggleCampo = (c) => {
    setExportSeleccionCampos(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const setF = (k, v) => setFiltros(prev => ({ ...prev, [k]: v }))

  const buscarItems = async (texto) => {
    if (!texto || texto.length < 1) { setSugerenciasItem([]); return }
    try {
      const params = new URLSearchParams({ q: texto })
      if (filtros.capitulo)         params.append('capitulo', filtros.capitulo)
      if (filtros.acta_rpo)         params.append('acta_rpo', filtros.acta_rpo)
      if (filtros.semana)           params.append('semana', filtros.semana)
      if (filtros.subcontratista_id) params.append('subcontratista_id', filtros.subcontratista_id)
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/items?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setSugerenciasItem(list)
      setMostrarSugsItem(list.length > 0)
    } catch(e) { setSugerenciasItem([]) }
  }

  const inpStyle = { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: '7px', padding: '5px 9px', color: t.text, fontSize: '12px', outline: 'none' }
  const selStyle = { ...inpStyle, cursor: 'pointer' }
  const sicoePuedeRefinar = busquedaRealizada && tieneParametrosBusquedaSicoe(filtros, capasValidacion)
  const filtroLbl = { fontSize: '9px', fontWeight: '800', color: t.textMuted, letterSpacing: '0.45px', textTransform: 'uppercase', marginBottom: '2px' }
  const filtroCard = {
    padding: '8px 10px',
    borderRadius: '8px',
    border: `1px solid ${t.border}`,
    background: t.inputBg || t.bg,
    minWidth: 0,
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <div>
          <h2 style={{ margin:0, color:t.text, fontSize:'20px', fontWeight:'800' }}>🏗️ SICOE Obra</h2>
          <p style={{ margin:0, color:t.textMuted, fontSize:'13px' }}>Reporte de cantidades de campo</p>
        </div>
        {puedeCrear && (
          <button onClick={() => setModalNuevoReporte(true)} style={{
            background: t.primary, color:'#fff', border:'none', borderRadius:'8px',
            padding:'10px 20px', fontWeight:'700', fontSize:'13px', cursor:'pointer'
          }}>+ Nuevo Reporte</button>
        )}
      </div>

      {/* ── Banner semana sin configurar ── */}
      {!semanaVigente && !alertaSemana && puedeEditar && (
        <div style={{ background:'#0077B615', border:'1px solid #0077B644', borderRadius:'10px', padding:'12px 16px', marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <span style={{ fontWeight:'700', color:'#0077B6', fontSize:'13px' }}>📅 Sin semanas configuradas</span>
            <span style={{ color:t.textMuted, fontSize:'12px', marginLeft:'10px' }}>Configura el calendario semanal del contrato para activar el seguimiento.</span>
          </div>
          <button onClick={() => setModalIniciarSem(true)} style={{ background:'#0077B6', color:'#fff', border:'none', borderRadius:'8px', padding:'7px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
            Configurar semanas
          </button>
        </div>
      )}

      {/* ── Banner alerta semana por vencer ── */}
      {alertaSemana && semanaVigente && (
        <div style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'10px', padding:'12px 16px', marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
          <div>
            <span style={{ fontWeight:'700', color:'#EF4444', fontSize:'13px' }}>⚠️ Semana {semanaVigente.numero_semana} vence el {semanaVigente.fecha_fin}</span>
            <span style={{ color:t.textMuted, fontSize:'12px', marginLeft:'10px' }}>No hay semana siguiente configurada. Extiende el contrato.</span>
          </div>
          <button onClick={() => setModalSemana(true)} style={{ background:'#EF4444', color:'#fff', border:'none', borderRadius:'8px', padding:'7px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
            Extender semanas
          </button>
        </div>
      )}

      {/* ── Indicador semana activa ── */}
      {semanaVigente && !alertaSemana && (
        <div style={{ background:'#10B98115', border:'1px solid #10B98133', borderRadius:'10px', padding:'8px 16px', marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'12px', color:'#10B981', fontWeight:'600' }}>
            📅 Semana {semanaVigente.numero_semana} activa · {semanaVigente.fecha_inicio} → {semanaVigente.fecha_fin}
            {semanaProxima && <span style={{ color:t.textMuted, fontWeight:'400', marginLeft:'12px' }}>· Próxima: Sem. {semanaProxima.numero_semana}</span>}
          </span>
          {puedeEditar && (
            <button onClick={() => setModalSemana(true)} style={{ background:'transparent', border:`1px solid #10B98133`, color:'#10B981', borderRadius:'6px', padding:'4px 12px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>
              + Extender
            </button>
          )}
        </div>
      )}

      {/* ── Panel de análisis ── */}
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', marginBottom:'16px', overflow:'hidden' }}>
        {cargandoAnalisis ? (
          <div style={{ padding:'14px 16px', textAlign:'center', color:t.textMuted, fontSize:'13px' }}>Calculando análisis...</div>
        ) : analisis && analisis.modo && Array.isArray(analisis.grupos) ? (
          <>
            <div
              onClick={(e) => {
                if (e.target.closest('button[data-sicoe-volver-panel]')) return
                setPanelExpandido(v => !v)
              }}
              style={{ padding:'10px 16px', borderBottom: panelExpandido ? `1px solid ${t.border}` : 'none', display:'flex', alignItems:'center', gap:'10px', background:'#1E293B', cursor:'pointer', userSelect:'none' }}>
              {puedeVolverPanel && (
                <button
                  type="button"
                  data-sicoe-volver-panel
                  onClick={(e) => { e.stopPropagation(); void volverPanelAnterior() }}
                  style={{
                    background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.22)', borderRadius:'6px',
                    padding:'4px 10px', fontSize:'11px', fontWeight:'700', color:'#F1F5F9', cursor:'pointer', flexShrink:0,
                  }}
                >
                  ← Volver
                </button>
              )}
              <span style={{ fontSize:'13px', fontWeight:'800', color:'#F1F5F9', flex:1, minWidth:0 }}>📊 {analisis.encabezado}</span>
              <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94A3B8', flexShrink:0 }}>
                {analisis.total_registros.toLocaleString()} regs{nivelInfo.verValoresEconomicos ? ` · ${fmtPesos(analisis.total_costo_directo)}` : ''}
              </span>
              <span style={{ fontSize:'12px', color:'#94A3B8' }}>{panelExpandido ? '▲' : '▼'}</span>
            </div>
            {panelExpandido && <div style={{ overflowX:'auto' }}>
              {analisis.modo === 'capitulo_items' ? (
                // ── Tabla por ítems ────────────────────────────────────────
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ color:t.textMuted, fontSize:'11px', fontWeight:'700', letterSpacing:'0.4px' }}>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>ÍTEM</th>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>DESCRIPCIÓN</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>CANTIDAD</th>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>UND</th>
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>}
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>✅</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>⏳</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>❌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.grupos.map(g => (
                      <tr
                        key={g.label}
                        onClick={(e) => {
                          e.stopPropagation()
                          const newF = { ...filtros, item: g.label }
                          setFiltros(newF)
                          buscarReportes(newF, 0, capasValidacion)
                          cargarAnalisis(newF, capasValidacion)
                        }}
                        style={{ borderBottom:`1px solid ${t.border}22`, cursor:'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = t.bg + '88' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding:'6px 16px', color:t.primary, fontWeight:'700', whiteSpace:'nowrap' }}>{g.label}</td>
                        <td style={{ padding:'6px 16px', color:t.text, fontSize:'11px', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.descripcion}</td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          <SicoePanelDataBarCell value={g.cantidad_total} max={mx.cant ?? 0} color="#64748B" textColor={t.text} text={(g.cantidad_total||0).toLocaleString('es-CO',{maximumFractionDigits:2})} />
                        </td>
                        <td style={{ padding:'6px 16px', color:t.textMuted, fontSize:'11px' }}>{g.unidad}</td>
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.costo_directo} max={mx.cd ?? 0} color={t.primary} textColor={t.text} text={fmtPesos(g.costo_directo)} />
                          </td>
                        )}
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.aprobados} max={mx.ap ?? 0} color="#10B981" text={fmtPesos(g.aprobados ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.aprobados_count} max={mx.ap ?? 0} color="#10B981" text={String(g.aprobados_count ?? '—')} />
                          )}
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.pendientes} max={mx.pe ?? 0} color="#3B82F6" text={fmtPesos(g.pendientes ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.pendientes_count} max={mx.pe ?? 0} color="#3B82F6" text={String(g.pendientes_count ?? '—')} />
                          )}
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.rechazados} max={mx.re ?? 0} color="#EF4444" text={fmtPesos(g.rechazados ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.rechazados_count} max={mx.re ?? 0} color="#EF4444" text={String(g.rechazados_count ?? '—')} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td colSpan={4} style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>}
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{fmtPesos(analisis.total_aprobados ?? 0)}</td>}
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{fmtPesos(analisis.total_pendientes ?? 0)}</td>}
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{fmtPesos(analisis.total_rechazados ?? 0)}</td>}
                    </tr>
                  </tfoot>
                </table>
              ) : analisis.modo === 'item_detalle' ? (
                // ── Tabla por acta + capítulo ──────────────────────────────
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ color:t.textMuted, fontSize:'11px', fontWeight:'700', letterSpacing:'0.4px' }}>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>ACTA RPO</th>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>CAPÍTULO</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>CANTIDAD</th>
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>}
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>REGS.</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>✅</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>⏳</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>❌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.grupos.map(g => (
                      <tr key={`${g.label}-${g.capitulo}`} style={{ borderBottom:`1px solid ${t.border}22` }}>
                        <td style={{ padding:'6px 16px', color:t.primary, fontWeight:'700', whiteSpace:'nowrap' }}>{g.label}</td>
                        <td style={{ padding:'6px 16px', color:t.text, fontSize:'11px' }}>{g.capitulo}</td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          <SicoePanelDataBarCell value={g.cantidad_total} max={mx.cant ?? 0} color="#64748B" textColor={t.text} text={(g.cantidad_total||0).toLocaleString('es-CO',{maximumFractionDigits:2})} />
                        </td>
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.costo_directo} max={mx.cd ?? 0} color={t.primary} textColor={t.text} text={fmtPesos(g.costo_directo)} />
                          </td>
                        )}
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          <SicoePanelDataBarCell value={g.total_registros} max={mx.regs ?? 0} color="#94A3B8" textColor={t.textMuted} text={String(g.total_registros)} />
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.aprobados} max={mx.ap ?? 0} color="#10B981" text={fmtPesos(g.aprobados ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.aprobados_count} max={mx.ap ?? 0} color="#10B981" text={`${g.aprobados_count ?? 0} regs`} />
                          )}
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.pendientes} max={mx.pe ?? 0} color="#3B82F6" text={fmtPesos(g.pendientes ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.pendientes_count} max={mx.pe ?? 0} color="#3B82F6" text={`${g.pendientes_count ?? 0} regs`} />
                          )}
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.rechazados} max={mx.re ?? 0} color="#EF4444" text={fmtPesos(g.rechazados ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.rechazados_count} max={mx.re ?? 0} color="#EF4444" text={`${g.rechazados_count ?? 0} regs`} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td colSpan={3} style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>}
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.text }}>{analisis.total_registros}</td>
                      {nivelInfo.verValoresEconomicos ? (
                        <>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{fmtPesos(analisis.total_aprobados ?? 0)}</td>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{fmtPesos(analisis.total_pendientes ?? 0)}</td>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{fmtPesos(analisis.total_rechazados ?? 0)}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{analisis.total_aprobados_count ?? '—'}</td>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{analisis.total_pendientes_count ?? '—'}</td>
                          <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{analisis.total_rechazados_count ?? '—'}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              ) : (
                // ── Tabla por capítulos (acta_semana + general) ────────────
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ color:t.textMuted, fontSize:'11px', fontWeight:'700', letterSpacing:'0.4px' }}>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>CAPÍTULO</th>
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>}
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>REGS.</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>🔵 SIN REV.</th>
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>✅ APOB.</th>}
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>⏳ PEND.</th>}
                      {nivelInfo.verValoresEconomicos && <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>❌ RECH.</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.grupos.map(g => (
                      <tr key={g.label} onClick={() => {
                        const newF = { ...filtros, capitulo: g.label, item: '' }
                        setFiltros(newF)
                        buscarReportes(newF, 0, capasValidacion)
                        cargarAnalisis(newF, capasValidacion)
                      }} style={{ borderBottom:`1px solid ${t.border}22`, cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = t.bg + '88'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding:'6px 16px', color:t.text, fontWeight:'600' }}>{g.label}</td>
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.costo_directo} max={mx.cd ?? 0} color={t.primary} textColor={t.text} text={fmtPesos(g.costo_directo)} />
                          </td>
                        )}
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          <SicoePanelDataBarCell value={g.total_registros} max={mx.regs ?? 0} color="#94A3B8" textColor={t.textMuted} text={String(g.total_registros)} />
                        </td>
                        <td style={{ padding:0, verticalAlign:'middle' }}>
                          {nivelInfo.verValoresEconomicos ? (
                            <SicoePanelDataBarCell value={g.no_revisados_costo} max={mx.sinv ?? 0} color="#3B82F6" text={fmtPesos(g.no_revisados_costo ?? 0)} />
                          ) : (
                            <SicoePanelDataBarCell value={g.no_revisados} max={mx.sinv ?? 0} color="#3B82F6" text={String(g.no_revisados ?? '—')} />
                          )}
                        </td>
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.aprobados} max={mx.ap ?? 0} color="#10B981" text={fmtPesos(g.aprobados ?? 0)} />
                          </td>
                        )}
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.pendientes} max={mx.pe ?? 0} color="#3B82F6" text={fmtPesos(g.pendientes ?? 0)} />
                          </td>
                        )}
                        {nivelInfo.verValoresEconomicos && (
                          <td style={{ padding:0, verticalAlign:'middle' }}>
                            <SicoePanelDataBarCell value={g.rechazados} max={mx.re ?? 0} color="#EF4444" text={fmtPesos(g.rechazados ?? 0)} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>}
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.text }}>{analisis.total_registros}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>
                        {nivelInfo.verValoresEconomicos ? fmtPesos(analisis.total_no_revisados_costo ?? 0) : (analisis.total_no_revisados ?? '—')}
                      </td>
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{fmtPesos(analisis.total_aprobados ?? 0)}</td>}
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{fmtPesos(analisis.total_pendientes ?? 0)}</td>}
                      {nivelInfo.verValoresEconomicos && <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{fmtPesos(analisis.total_rechazados ?? 0)}</td>}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>}
          </>
        ) : (
          <div style={{ padding:'14px 16px', textAlign:'center', color:t.textMuted, fontSize:'13px' }}>
            Aplica un filtro y presiona <strong>Buscar</strong> para ver el análisis
          </div>
        )}
      </div>

      {/* ── Barra de filtros: 1–2 y 3–4 en columna; con Avanzados, sección 5 a la derecha (2 columnas) ── */}
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'8px', marginBottom:'8px' }}>
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'8px' }}>
            <button type="button" onClick={() => setSicoeFiltrosPanelOpen(v => !v)}
              style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'5px 12px', cursor:'pointer', fontSize:'12px', fontWeight:'800', color:t.text }}>
              {sicoeFiltrosPanelOpen ? 'Ocultar filtros ▲' : 'Mostrar filtros ▼'}
            </button>
            {!sicoeFiltrosPanelOpen && (hayFiltrosActivos || capasValidacion.length > 0) && (
              <span style={{ fontSize:'11px', color:t.textMuted }}>Hay criterios activos</span>
            )}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center' }}>
            <button type="button" onClick={() => setFiltrosAvanzados(v => !v)}
              style={{ ...selStyle, background:'transparent', cursor:'pointer', whiteSpace:'nowrap', color:t.textMuted, padding:'4px 8px', fontSize:'11px' }}>
              Avanzados {filtrosAvanzados ? '▲' : '▼'}
            </button>
            <button type="button" onClick={limpiarFiltros}
              style={{ background:'#EF4444', color:'#fff', border:'none', borderRadius:'6px', padding:'4px 12px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
              Limpiar
            </button>
            {puedeExportar && busquedaRealizada && (
              <button
                type="button"
                onClick={abrirPopupExportRegistros}
                disabled={!reportesMostrados || reportesMostrados.length === 0}
                style={{
                  background:'transparent',
                  border:`1px solid ${t.border}`,
                  color:t.textMuted,
                  borderRadius:'6px',
                  padding:'4px 12px',
                  fontSize:'11px',
                  fontWeight:'700',
                  cursor:(!reportesMostrados || reportesMostrados.length === 0) ? 'not-allowed' : 'pointer',
                  opacity:(!reportesMostrados || reportesMostrados.length === 0) ? 0.6 : 1,
                  whiteSpace:'nowrap',
                }}
              >
                ⬇ Excel
              </button>
            )}
            <button type="button" onClick={() => {
              const hayFiltros = Object.values(filtros).some(v => v !== '') || capasValidacion.length > 0
              if (!hayFiltros && nivelInfo.nivelValidacion) return
              buscarReportes(filtros, 0, capasValidacion); cargarAnalisis(filtros, capasValidacion)
            }}
              style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'4px 14px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
              Buscar
            </button>
          </div>
        </div>

        {sicoeFiltrosPanelOpen && (
        <>
        <div style={{
          display: 'grid',
          gridTemplateColumns: filtrosAvanzados
            ? 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))'
            : 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '8px',
          alignItems: 'stretch',
        }}>
          {/* Izquierda: 1–2 y 3–4 apilados con Avanzados; sin Avanzados, display:contents para que 1–2 y 3–4 sigan siendo celdas del grid */}
          <div style={{
            display: filtrosAvanzados ? 'flex' : 'contents',
            flexDirection: 'column',
            gap: '8px',
            minWidth: 0,
          }}>
          {/* Bloque 1–2: identificación + actor */}
          <div style={{ ...filtroCard, borderLeft: '3px solid #0077B6' }}>
            <div style={{ ...filtroLbl, marginBottom: '6px', color: '#0077B6' }}>1 · Identificación</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'flex-end' }}>
              <div>
                <div style={filtroLbl}>N° Rep.</div>
                <input placeholder="—" type="number" value={filtros.numero_reporte} onChange={e => setF('numero_reporte', e.target.value)}
                  style={{ ...inpStyle, width:'76px', padding:'4px 6px' }} />
              </div>
              <div>
                <div style={filtroLbl}>N° Reg.</div>
                <input placeholder="—" type="number" value={filtros.numero_registro} onChange={e => setF('numero_registro', e.target.value)}
                  style={{ ...inpStyle, width:'76px', padding:'4px 6px' }} />
              </div>
              <div>
                <div style={filtroLbl}>Sem.</div>
                <input placeholder="—" type="number" value={filtros.semana}
                  onChange={e => setF('semana', e.target.value)}
                  onBlur={e => actualizarFiltrosDisponibles({ ...filtros, semana: e.target.value })}
                  style={{ ...inpStyle, width:'64px', padding:'4px 6px' }} />
              </div>
              <div style={{ position:'relative' }}>
                <div style={filtroLbl}>Acta RPO</div>
                <input placeholder="—" type="number" value={filtros.acta_rpo}
                  onChange={e => { setF('acta_rpo', e.target.value); setMostrarSugsActa(true) }}
                  onFocus={() => { if (filtroActaList.length > 0) setMostrarSugsActa(true) }}
                  onBlur={() => setTimeout(() => setMostrarSugsActa(false), 150)}
                  style={{ ...inpStyle, width:'72px', padding:'4px 6px' }} />
                {mostrarSugsActa && filtroActaList.filter(a => !filtros.acta_rpo || String(a.numero_rpo).startsWith(String(filtros.acta_rpo))).length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, zIndex:50, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', minWidth:'120px', maxHeight:'200px', overflowY:'auto', boxShadow:'0 4px 16px #0004', marginTop:'2px' }}>
                    {filtroActaList.filter(a => !filtros.acta_rpo || String(a.numero_rpo).startsWith(String(filtros.acta_rpo))).map(a => (
                      <div key={a.numero_rpo}
                        onMouseDown={() => {
                          setF('acta_rpo', String(a.numero_rpo))
                          setMostrarSugsActa(false)
                          actualizarFiltrosDisponibles({ ...filtros, acta_rpo: String(a.numero_rpo) })
                        }}
                        style={{ padding:'7px 12px', cursor:'pointer', fontSize:'12px', borderBottom:`1px solid ${t.border}22`, color:t.primary, fontWeight:'600' }}>
                        RPO {a.numero_rpo}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop:'8px', paddingTop:'8px', borderTop:`1px dashed ${t.border}` }}>
              <div style={{ ...filtroLbl, marginBottom:'6px', color:'#0E7490' }}>2 · Actor / estado reporte</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'flex-end' }}>
                <div style={{ flex:'1 1 140px', minWidth:0 }}>
                  <div style={filtroLbl}>Subcontratista</div>
                  <select value={filtros.subcontratista_id} onChange={e => {
                    const v = e.target.value
                    const nf = { ...filtros, subcontratista_id: v }
                    setFiltros(nf)
                    actualizarFiltrosDisponibles(nf)
                    buscarReportes(nf, 0, capasValidacion)
                    cargarAnalisis(nf, capasValidacion)
                  }} style={{ ...selStyle, width:'100%', padding:'4px 6px', fontSize:'11px', minWidth:0 }}>
                    <option value="">—</option>
                    {filtroSubcList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                {(puedeEditar || !nivelInfo.nivelValidacion) && (
                  <div style={{ flex:'1 1 120px', minWidth:0 }}>
                    <div style={filtroLbl}>Estado</div>
                    <select value={filtros.estado} onChange={e => {
                      const nf = { ...filtros, estado: e.target.value }
                      setFiltros(nf)
                      buscarReportes(nf, 0, capasValidacion)
                      cargarAnalisis(nf, capasValidacion)
                    }} style={{ ...selStyle, width:'100%', padding:'4px 6px', fontSize:'11px', minWidth:0 }}>
                      <option value="">—</option>
                      {(puedeEditar
                        ? ['Borrador', 'Sin Asignar Ítem', 'No Revisados', 'No Objeto de Cobro', 'En Papelera']
                        : ['Borrador', 'Sin Asignar Ítem', 'No Revisados', 'No Objeto de Cobro', 'En Papelera']
                      ).map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Columna 2: validación + refinar */}
          <div style={{ ...filtroCard, borderLeft: '3px solid #00afc5', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div>
              <div style={{ ...filtroLbl, marginBottom:'6px', color:'#00afc5' }}>3 · Validación por cargo</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center' }}>
                <select value={capaTemp.cargo_id}
                  onChange={e => {
                    const sel = cargosDisponiblesEnFiltro.find(c => c.id === parseInt(e.target.value))
                    setCapaTemp(p => ({ ...p,
                      cargo_id: sel ? sel.id : '',
                      cargo_nombre: sel ? sel.nombre : ''
                    }))
                  }} style={{ ...selStyle, flex:'1 1 120px', minWidth:'100px', padding:'4px 6px', fontSize:'11px' }}>
                  <option value="">Cargo…</option>
                  {cargosDisponiblesEnFiltro.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <select value={capaTemp.estado} onChange={e => setCapaTemp(p => ({ ...p, estado: e.target.value }))} style={{ ...selStyle, flex:'1 1 100px', minWidth:'88px', padding:'4px 6px', fontSize:'11px' }}>
                  <option value="">Estado…</option>
                  {['Aprobado','Pendiente','Rechazado','No Revisado'].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <button type="button" disabled={!capaTemp.cargo_id || !capaTemp.estado}
                  onClick={() => {
                    setCapasValidacion(p => [...p, capaTemp])
                    setCapaTemp({ cargo_id: '', cargo_nombre: '', estado: '' })
                  }}
                  style={{ background:(!capaTemp.cargo_id || !capaTemp.estado) ? t.border : t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:'700', cursor:(!capaTemp.cargo_id || !capaTemp.estado) ? 'not-allowed' : 'pointer', flexShrink:0 }}>
                  ＋
                </button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginTop:'6px' }}>
                {capasValidacion.map((c, i) => (
                  <span key={i} style={{ background:'rgba(0,175,197,0.12)', border:'1px solid rgba(0,175,197,0.3)', borderRadius:'4px', padding:'2px 6px', fontSize:'10px', color:'#00afc5', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                    {c.cargo_nombre}: {c.estado}
                    <span role="button" tabIndex={0} onClick={() => setCapasValidacion(p => p.filter((_,j) => j !== i))} onKeyDown={e => { if (e.key === 'Enter') setCapasValidacion(p => p.filter((_,j) => j !== i)) }} style={{ cursor:'pointer', color:'#ef4444', fontWeight:'700' }}>×</span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{
              paddingTop:'8px',
              borderTop:`1px dashed ${t.border}`,
              opacity: sicoePuedeRefinar ? 1 : 0.55,
              pointerEvents: sicoePuedeRefinar ? 'auto' : 'none',
            }}>
              <div style={{ ...filtroLbl, marginBottom:'4px', color:'#F59E0B' }}>4 · Refinar registros</div>
              <div style={{ fontSize:'10px', color:t.textMuted, marginBottom:'6px', lineHeight:1.35 }}>
                {sicoePuedeRefinar
                  ? 'Panel y grilla se actualizan al escribir (~0,4 s).'
                  : 'Activo tras una búsqueda con criterios.'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:'6px', alignItems:'end' }}>
                <div style={{ minWidth:0 }}>
                  <div style={filtroLbl}>Observación</div>
                  <input
                    placeholder="Texto…"
                    value={sicoeFiltroObs}
                    onChange={e => setSicoeFiltroObs(e.target.value)}
                    style={{ ...inpStyle, width:'100%', boxSizing:'border-box', padding:'4px 8px', fontSize:'11px' }}
                  />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={filtroLbl}>Nodo ini./fin.</div>
                  <input
                    placeholder="Texto…"
                    value={sicoeFiltroNodo}
                    onChange={e => setSicoeFiltroNodo(e.target.value)}
                    style={{ ...inpStyle, width:'100%', boxSizing:'border-box', padding:'4px 8px', fontSize:'11px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          </div>

          {/* Derecha (solo Avanzados): ubicación técnica + plano PK */}
          {filtrosAvanzados && (
          <div style={{
            ...filtroCard,
            borderLeft:'3px solid #64748B',
            minWidth:0,
            alignSelf:'stretch',
            display:'flex',
            flexDirection:'column',
            height:'100%',
          }}>
            <div style={{ ...filtroLbl, marginBottom:'6px', color:'#64748B' }}>5 · Ubicación técnica</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'flex-end' }}>
            <select value={filtros.capitulo} onChange={e => {
              const v = e.target.value
              const nf = { ...filtros, capitulo: v }
              setFiltros(nf)
              actualizarFiltrosDisponibles(nf)
              buscarReportes(nf, 0, capasValidacion)
              cargarAnalisis(nf, capasValidacion)
            }} style={{ ...selStyle, padding:'4px 6px', fontSize:'11px', flex:'1 1 120px', minWidth:'100px' }}>
              <option value="">Capítulo…</option>
              {filtroCapList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ position:'relative', flex:'1 1 140px', minWidth:'100px' }}>
              <input
                placeholder="Ítem…"
                value={filtros.item}
                onChange={e => { setF('item', e.target.value); buscarItems(e.target.value) }}
                onFocus={() => { if (sugerenciasItem.length > 0) setMostrarSugsItem(true) }}
                onBlur={() => setTimeout(() => setMostrarSugsItem(false), 150)}
                style={{ ...inpStyle, width:'100%', padding:'4px 6px', fontSize:'11px', boxSizing:'border-box' }}
              />
              {mostrarSugsItem && sugerenciasItem.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, zIndex:50, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', minWidth:'320px', maxHeight:'240px', overflowY:'auto', boxShadow:'0 4px 16px #0004', marginTop:'2px' }}>
                  {sugerenciasItem.map(s => (
                    <div key={s.item_numero}
                      onMouseDown={() => {
                        const nf = { ...filtros, item: s.item_numero }
                        setFiltros(nf)
                        setSugerenciasItem([])
                        setMostrarSugsItem(false)
                        buscarReportes(nf, 0, capasValidacion)
                        cargarAnalisis(nf, capasValidacion)
                      }}
                      style={{ padding:'7px 12px', cursor:'pointer', fontSize:'12px', borderBottom:`1px solid ${t.border}22`, display:'flex', gap:'8px', alignItems:'baseline' }}>
                      <span style={{ color:t.primary, fontWeight:'700', whiteSpace:'nowrap' }}>{s.item_numero}</span>
                      <span style={{ color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.item_descripcion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select value={filtros.tramo} onChange={e => setF('tramo', e.target.value)} style={{ ...selStyle, padding:'4px 6px', fontSize:'11px', flex:'1 1 100px', minWidth:'88px' }}>
              <option value="">Tramo…</option>
              {filtroTramoList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtros.costado} onChange={e => setF('costado', e.target.value)} style={{ ...selStyle, padding:'4px 6px', fontSize:'11px', flex:'1 1 100px', minWidth:'88px' }}>
              <option value="">Calzada…</option>
              {filtroCostadoList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <input placeholder="Abs. ini." type="number" value={filtros.abs_inicio} onChange={e => setF('abs_inicio', e.target.value)}
              style={{ ...inpStyle, width:'72px', padding:'4px 6px', fontSize:'11px' }} />
            <input placeholder="Abs. fin." type="number" value={filtros.abs_final} onChange={e => setF('abs_final', e.target.value)}
              style={{ ...inpStyle, width:'72px', padding:'4px 6px', fontSize:'11px' }} />
            </div>
            <div style={{ width:'100%', marginTop:'10px', paddingTop:'10px', borderTop:`1px dashed ${t.border}`, flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
              <div style={{ ...filtroLbl, marginBottom:'6px', color:'#0d9488' }}>Plano de ubicación (PK)</div>
              <div style={{ fontSize:'10px', color:t.textMuted, marginBottom:'8px', lineHeight:1.4 }}>
                {!busquedaRealizada
                  ? 'Pulsa Buscar con criterios para ver en el mapa solo los puntos de la grilla actual (reportes con coordenadas o PK).'
                  : (reportesMostrados.length === 0
                    ? 'Sin resultados: no hay puntos que mostrar con los filtros actuales.'
                    : (SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS.has(Number(contrato_id))
                      ? 'Solo resultados filtrados por PK (coordenadas de reporte omitidas en este contrato). Gris/azul = PK; clic aplica filtro por ubicación.'
                      : 'Solo resultados filtrados. Naranja = reporte con GPS sin PK asignado; gris/azul = PK. Clic abre el reporte o aplica filtro por ubicación.'))}
              </div>
              <div style={{ width: '100%', flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
              {import.meta.env.VITE_MAPBOX_TOKEN ? (
                <div ref={sicoeFiltroMapaRef} style={{ width:'100%', flex:1, minHeight:'260px', borderRadius:'8px', overflow:'hidden', border:`1px solid ${t.border}`, background:t.bg }} />
              ) : (
                <div style={{ fontSize:'11px', color:t.textMuted, padding:'8px', border:`1px dashed ${t.border}`, borderRadius:'8px' }}>
                  Configura VITE_MAPBOX_TOKEN para ver el mapa.
                </div>
              )}
              {busquedaRealizada && sicoePuntosPlano.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'8px', maxHeight:'120px', overflowY:'auto' }}>
                {sicoePuntosPlano.map(pt => (
                  <button
                    key={pt.soloReporte ? `r-${pt.reporte_id}` : `pk-${pt.pk_id_id}`}
                    type="button"
                    onClick={() => {
                      if (pt.soloReporte && pt.reporte_id) sicoeMapaOpenReporteRef.current(pt.reporte_id)
                      else if (pt.pk_id_id != null) sicoeMapFiltroApplyPkRef.current(pt.pk_id_id)
                    }}
                    style={{
                      fontSize:'10px',
                      padding:'4px 8px',
                      borderRadius:'6px',
                      border:`1px solid ${
                        pt.soloReporte ? '#fb923c' : (String(filtros.pk_id) === String(pt.pk_id_id) ? t.primary : t.border)
                      }`,
                      background: pt.soloReporte
                        ? 'rgba(249,115,22,0.12)'
                        : (String(filtros.pk_id) === String(pt.pk_id_id) ? 'rgba(0,119,182,0.15)' : t.inputBg || t.bg),
                      color:t.text,
                      cursor:'pointer',
                      fontWeight: (pt.soloReporte || String(filtros.pk_id) === String(pt.pk_id_id)) ? '700' : '500',
                    }}
                  >
                    {pt.etiqueta}
                    {pt.reportes_count ? ` (${pt.reportes_count})` : ''}
                    {pt.aproximado ? ' · ~' : ''}
                  </button>
                ))}
              </div>
              )}
              </div>
              {filtros.pk_id ? (
                <button type="button" onClick={() => {
                  const nf = { ...filtros, pk_id: '' }
                  setFiltros(nf)
                  buscarReportes(nf, 0, capasValidacion)
                  cargarAnalisis(nf, capasValidacion)
                }} style={{ marginTop:'8px', fontSize:'11px', color:'#ef4444', background:'transparent', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  Quitar filtro de ubicación PK
                </button>
              ) : null}
            </div>
          </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── Grid reportes ── */}
      <div style={{ background:t.bgCard, borderRadius:'12px', border:`1px solid ${t.border}` }}>
        {/* Header grid — sticky */}
        <div style={{
          display:'grid',
          gridTemplateColumns: nivelInfo.verValoresEconomicos
            ? '68px 88px 86px 118px 132px minmax(200px,1.4fr) 108px 100px 70px'
            : '68px 88px 86px 118px 132px minmax(200px,1.4fr) 100px 70px',
          gap:'8px',
          padding:'10px 16px', borderBottom:`1px solid ${t.border}`,
          fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px',
          position:'sticky', top:0, zIndex:9, background:t.bgCard, borderRadius:'12px 12px 0 0' }}>
          <div>N° REP.</div>
          <div>TRAMO</div>
          <div>COSTADO</div>
          <div>ABCISA</div>
          <div>NODO</div>
          <div>DESCRIPCIÓN</div>
          {nivelInfo.verValoresEconomicos && <div style={{ textAlign:'right' }}>COSTO DIRECTO</div>}
          <div>CAPÍTULO</div>
          <div style={{ textAlign:'right' }}>REGS.</div>
        </div>

        {/* Filas */}
        {cargando && reportes.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:t.textMuted }}>
            {busquedaAmplia
              ? <span>⏳ <strong>Búsqueda amplia detectada</strong> — esto puede tomar unos segundos.<br/>
                  <span style={{fontSize:'12px'}}>Combina filtros adicionales para resultados más rápidos.</span>
                </span>
              : 'Cargando reportes...'
            }
          </div>
        ) : !busquedaRealizada ? (
          <div style={{ padding:'48px', textAlign:'center', color:t.textMuted, fontSize:'14px' }}>
            🔍 Usa los filtros y presiona <strong>Buscar</strong> para ver los reportes
          </div>
        ) : reportes.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:t.textMuted }}>
            Sin resultados para los filtros aplicados.
          </div>
        ) : reportesMostrados.map(rep => (
          <div key={rep.id} style={{
            display:'grid',
            gridTemplateColumns: nivelInfo.verValoresEconomicos
              ? '68px 88px 86px 118px 132px minmax(200px,1.4fr) 108px 100px 70px'
              : '68px 88px 86px 118px 132px minmax(200px,1.4fr) 100px 70px',
            gap:'8px', padding:'10px 16px', borderBottom:`1px solid ${t.border}`,
            fontSize:'13px', color:t.text, cursor:'pointer',
            transition:'background 0.15s' }}
            onClick={() => {
              if (!esSub && rep.estado === 'Borrador') {
                ;(async () => {
                  const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${rep.id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
                  const data = await r.json()
                  setReporteEditando(data)
                  setModalNuevoReporte(true)
                })()
              } else if (esSub || puedeVer) {
                setReporteSeleccionado({ ...rep, _cargandoDetalle: true, registros: [], puntos: [] })
                setModalCarpeta(true)
                ;(async () => {
                  try {
                    const r = await fetch(urlReporteDetalle(rep.id, capasValidacion), { headers: { Authorization: `Bearer ${getToken()}` } })
                    const data = await r.json()
                    if (data?.id) setReporteSeleccionado({ ...data, _cargandoDetalle: false })
                  } catch {
                    setModalCarpeta(false)
                    setReporteSeleccionado(null)
                  }
                })()
              }
            }}
            onMouseEnter={e => e.currentTarget.style.background = t.bg}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight:'700', color:t.primary }}>#{rep.numero_reporte}</div>
            <div style={{ color:t.text, fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={rep.tramo || ''}>
              {rep.tramo || '—'}
            </div>
            <div style={{ color:t.text, fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={rep.calzada || rep.margen || ''}>
              {rep.calzada || rep.margen || '—'}
            </div>
            <div style={{ color:t.textMuted, fontSize:'11px', lineHeight:1.3 }} title={`${rep.abs_inicio ?? ''} → ${rep.abs_final ?? ''}`}>
              {fmtSicoeRangoCabecera(rep.abs_inicio, rep.abs_final)}
            </div>
            <div style={{ color:t.textMuted, fontSize:'11px', lineHeight:1.3 }} title={`${rep.nodo_ini ?? ''} → ${rep.nodo_fin ?? ''}`}>
              {fmtSicoeRangoCabecera(rep.nodo_ini, rep.nodo_fin)}
            </div>
            <div style={{ fontWeight:'600', minWidth:0, overflow:'hidden', textOverflow:'ellipsis' }}>{rep.descripcion_actividad || '—'}</div>
            {nivelInfo.verValoresEconomicos && (
              <div style={{ fontSize:'12px', textAlign:'right', fontWeight:'600', color:t.text }}>
                {rep.costo_directo_validacion != null ? fmtPesos(rep.costo_directo_validacion) : '—'}
              </div>
            )}
            <div style={{ fontSize:'11px', color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={rep.capitulo || ''}>{rep.capitulo || '—'}</div>
            <div style={{ fontSize:'12px', color:t.textMuted, textAlign:'right', fontWeight:'600' }}>
              {rep.num_registros != null ? rep.num_registros : '—'}
            </div>
          </div>
        ))}

        {/* Footer: cargar más / spinner / fin */}
        {reportes.length > 0 && (
          <div style={{ padding:'12px 16px', textAlign:'center', borderTop:`1px solid ${t.border}` }}>
            {cargando ? (
              <span style={{ fontSize:'12px', color:t.textMuted }}>Cargando...</span>
            ) : hayMas ? (
              <button onClick={() => buscarReportes(filtros, offsetActual, capasValidacion)}
                style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'7px 20px', fontSize:'12px', color:t.textMuted, cursor:'pointer', fontWeight:'600' }}>
                ⬇ Cargar 50 reportes más
              </button>
            ) : (
              <span style={{ fontSize:'11px', color:t.textMuted }}>— Todos los reportes cargados —</span>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Configurar Semanas Iniciales ── */}
      {modalIniciarSem && (
        <div style={{ position:'fixed', inset:0, zIndex:9500, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModalIniciarSem(false)}>
          <div style={{ background:t.bgCard, borderRadius:'16px', padding:'28px', width:'440px', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'16px', fontWeight:'800', color:t.text, marginBottom:'20px' }}>📅 Configurar Semanas del Contrato</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div>
                <div style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, marginBottom:'4px' }}>FECHA DE INICIO DE LA SEMANA 1</div>
                <input type="date" value={semFechaInicio} onChange={e => setSemFechaInicio(e.target.value)}
                  style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'9px 12px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, marginBottom:'4px' }}>DÍA DE CORTE SEMANAL</div>
                <select value={semDiaCorte} onChange={e => setSemDiaCorte(e.target.value)}
                  style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'9px 12px', color:t.text, fontSize:'13px' }}>
                  {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, marginBottom:'4px' }}>CANTIDAD DE SEMANAS INICIALES</div>
                <input type="number" min="1" max="520" value={semCantInicial} onChange={e => setSemCantInicial(parseInt(e.target.value))}
                  style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'9px 12px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
                <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'4px' }}>Podrás extender más semanas cuando sea necesario.</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button onClick={() => setModalIniciarSem(false)} style={{ flex:1, background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px', color:t.textMuted, cursor:'pointer', fontWeight:'600' }}>Cancelar</button>
              <button onClick={crearSemanasIniciales} disabled={!semFechaInicio || creandoSemanas} style={{ flex:1, background:t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'10px', fontWeight:'700', cursor:'pointer', opacity: !semFechaInicio || creandoSemanas ? 0.6 : 1 }}>
                {creandoSemanas ? 'Creando...' : `Crear ${semCantInicial} semanas`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Extender Semanas ── */}
      {modalSemana && (
        <div style={{ position:'fixed', inset:0, zIndex:9500, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModalSemana(false)}>
          <div style={{ background:t.bgCard, borderRadius:'16px', padding:'28px', width:'380px', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'16px', fontWeight:'800', color:t.text, marginBottom:'8px' }}>📅 Extender Semanas</div>
            {semanaVigente && (
              <div style={{ fontSize:'12px', color:t.textMuted, marginBottom:'20px' }}>
                Última semana configurada: <strong style={{ color:t.text }}>Sem. {semanaVigente.numero_semana}</strong> · vence {semanaVigente.fecha_fin}
              </div>
            )}
            <div>
              <div style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, marginBottom:'6px' }}>¿CUÁNTAS SEMANAS ADICIONALES?</div>
              <input type="number" min="1" max="52" value={nSemanas} onChange={e => setNSemanas(parseInt(e.target.value))}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px 12px', color:t.text, fontSize:'24px', fontWeight:'800', textAlign:'center', boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'6px', textAlign:'center' }}>
                Se crearán con el mismo día de corte, continuando consecutivamente.
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
              <button onClick={() => setModalSemana(false)} style={{ flex:1, background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px', color:t.textMuted, cursor:'pointer', fontWeight:'600' }}>Cancelar</button>
              <button onClick={extenderSemanas} disabled={extendiendo || nSemanas < 1} style={{ flex:1, background:t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'10px', fontWeight:'700', cursor:'pointer', opacity: extendiendo ? 0.6 : 1 }}>
                {extendiendo ? 'Creando...' : `Agregar ${nSemanas} semanas`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Carpeta Reporte ── */}
      {modalCarpeta && reporteSeleccionado && (
        <CarpetaReporte
          t={t} usuario={usuario} API_URL={API_URL} contrato_id={contrato_id}
          reporte={reporteSeleccionado} actasList={filtroActaList}
          capasFiltroValidacion={capasValidacion.length > 0 ? capasValidacion : null}
          onClose={() => { setModalCarpeta(false); setReporteSeleccionado(null) }}
          onActualizar={() => { setModalCarpeta(false); setReporteSeleccionado(null); buscarReportes(filtros, 0, capasValidacion) }}
        />
      )}

      {/* ── Modal Nuevo Reporte ── */}
      {modalNuevoReporte && (
        <ModalNuevoReporte
          t={t} usuario={usuario} token={getToken()}
          API_URL={API_URL} contrato_id={contrato_id}
          reporteInicial={reporteEditando}
          onClose={() => { setModalNuevoReporte(false); setReporteEditando(null) }}
          onGuardado={() => { setModalNuevoReporte(false); setReporteEditando(null); buscarReportes(filtros, 0, capasValidacion) }}
        />
      )}

      {/* ── Modal Exportar Registros ── */}
      {exportModalOpen && (
        <div
          style={{
            position:'fixed', inset:0, zIndex:10000,
            background:'rgba(0,0,0,0.65)',
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'16px',
          }}
          onClick={() => setExportModalOpen(false)}
        >
          <div
            style={{
              width:'100%', maxWidth:'920px',
              background:t.bgCard, borderRadius:'16px',
              border:`1px solid ${t.border}`,
              boxShadow:'0 28px 90px rgba(0,0,0,0.55)',
              overflow:'hidden',
              display:'flex', flexDirection:'column',
              maxHeight:'88vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                padding:'16px 20px',
                borderBottom:`1px solid ${t.border}`,
                background:'#0F1923',
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                gap:'12px',
                flexShrink:0,
              }}
            >
              <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                <div style={{ fontSize:'14px', fontWeight:'900', color:'#fff' }}>⬇ Exportar registros a Excel</div>
                <div style={{ fontSize:'12px', color:'#94A3B8' }}>Elige los campos de so_registros que quieres descargar.</div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                style={{ background:'transparent', border:'none', color:t.textMuted, cursor:'pointer', fontSize:'20px' }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div style={{ padding:'16px 20px', overflowY:'auto' }}>
              {exportCargandoCampos ? (
                <div style={{ textAlign:'center', color:t.textMuted, padding:'28px 0' }}>Consultando campos...</div>
              ) : (
                <>
                  <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', marginBottom:'12px' }}>
                    <input
                      placeholder="Buscar campo..."
                      value={exportFiltroCampo}
                      onChange={e => setExportFiltroCampo(e.target.value)}
                      style={{ flex:'1 1 260px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 12px', color:t.text, outline:'none', fontSize:'13px' }}
                    />
                    <button
                      onClick={() => setExportSeleccionCampos(exportCampos)}
                      disabled={!exportCampos.length || exportando}
                      style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 14px', color:t.textMuted, cursor:(!exportCampos.length || exportando) ? 'not-allowed' : 'pointer', fontWeight:'700' }}
                    >
                      Seleccionar todo
                    </button>
                    <button
                      onClick={() => setExportSeleccionCampos([])}
                      disabled={exportando}
                      style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 14px', color:t.textMuted, cursor:exportando ? 'not-allowed' : 'pointer', fontWeight:'700' }}
                    >
                      Limpiar
                    </button>
                  </div>

                  {exportError && (
                    <div style={{ marginBottom:'12px', background:'#EF444415', border:'1px solid #EF444440', padding:'12px 14px', borderRadius:'12px', color:t.text }}>
                      {exportError}
                    </div>
                  )}

                  <div style={{ border:`1px solid ${t.border}`, borderRadius:'12px', overflow:'hidden' }}>
                    <div style={{ padding:'10px 14px', background:'#0B1220', borderBottom:`1px solid ${t.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px' }}>
                      <div style={{ fontSize:'12px', fontWeight:'800', color:t.textMuted }}>
                        {exportSeleccionCampos.length} campo(s) seleccionados
                      </div>
                      <div style={{ fontSize:'11px', color:'#94A3B8' }}>
                        Tip: puedes seleccionar pocos campos para acelerar.
                      </div>
                    </div>
                    <div style={{ maxHeight:'360px', overflowY:'auto', padding:'10px 14px' }}>
                      {camposVista.length === 0 ? (
                        <div style={{ color:t.textMuted, textAlign:'center', padding:'18px 0' }}>Sin campos para mostrar</div>
                      ) : (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:'8px 12px' }}>
                          {camposVista.map(c => (
                            <label
                              key={c}
                              style={{ display:'flex', gap:'10px', alignItems:'center', padding:'6px 8px', border:`1px solid ${t.border}`, borderRadius:'10px', background:'transparent' }}
                            >
                              <input
                                type="checkbox"
                                checked={exportSeleccionCampos.includes(c)}
                                onChange={() => toggleCampo(c)}
                              />
                              <span style={{ fontSize:'12px', color:t.textMuted, fontWeight:'700', lineHeight:1.2 }}>
                                {prettyCampo(c)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div
              style={{
                padding:'14px 20px',
                borderTop:`1px solid ${t.border}`,
                background:'#0F1923',
                display:'flex',
                justifyContent:'flex-end',
                gap:'10px',
                flexShrink:0,
              }}
            >
              <button
                onClick={() => setExportModalOpen(false)}
                disabled={exportando}
                style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 16px', color:t.textMuted, cursor:exportando ? 'not-allowed' : 'pointer', fontWeight:'800' }}
              >
                Cancelar
              </button>
              <button
                onClick={descargarExcelRegistros}
                disabled={exportando || exportCargandoCampos || exportSeleccionCampos.length === 0}
                style={{ background:t.primary, border:'none', borderRadius:'10px', padding:'10px 16px', color:'#fff', cursor:(exportando || exportCargandoCampos || exportSeleccionCampos.length === 0) ? 'not-allowed' : 'pointer', opacity:(exportando || exportCargandoCampos || exportSeleccionCampos.length === 0) ? 0.65 : 1, fontWeight:'900' }}
              >
                {exportando ? 'Generando...' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GaleriaFotos({ contrato_id, API_URL, hdrs, tipo, fechaDesde, fechaHasta, onSelect }) {
  const [fotos, setFotos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ tipo })
    if (fechaDesde) params.append('desde', fechaDesde)
    if (fechaHasta) params.append('hasta', fechaHasta)
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/galeria?${params}`, { headers: hdrs })
      .then(r => r.json())
      .then(d => { setFotos(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [fechaDesde, fechaHasta])

  if (loading) return <div style={{ textAlign:'center', padding:'20px', color:'#6B7280' }}>Cargando galería...</div>
  if (fotos.length === 0) return <div style={{ textAlign:'center', padding:'20px', color:'#6B7280' }}>No hay imágenes en este rango de fechas.</div>

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px' }}>
      {fotos.map((f, i) => (
        <div key={i} onClick={() => onSelect(f.url, f.numero)}
          style={{ cursor:'pointer', borderRadius:'8px', overflow:'hidden', border:'2px solid transparent',
            transition:'border 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#0077B6'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
          <img src={f.url} style={{ width:'100%', height:'100px', objectFit:'cover' }} />
          <div style={{ padding:'4px 6px', fontSize:'11px', color:'#6B7280', background:'#1E293B' }}>
            #{String(f.numero).padStart(4,'0')} — {f.descripcion || ''}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── MODAL NUEVO REPORTE ──────────────────────────────────────────────────────
function ModalNuevoReporte({ t, usuario, token, API_URL, contrato_id, onClose, onGuardado, reporteInicial }) {
  const [tabActivo, setTabActivo] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})

  // Datos TAB 1
  const [descripcion, setDescripcion] = useState('')
  const [subcontratistas, setSubcontratistas] = useState([])
  const [subBusqueda, setSubBusqueda] = useState('')
  const [subSeleccionado, setSubSeleccionado] = useState(null)
  const [subDropOpen, setSubDropOpen] = useState(false)
  const [inspectores, setInspectores] = useState([])
  const [inspBusqueda, setInspBusqueda] = useState('')
  const [inspSeleccionado, setInspSeleccionado] = useState(null)
  const [inspDropOpen, setInspDropOpen] = useState(false)
  const [capDropOpen, setCapDropOpen] = useState(false)
  const [capBusqueda, setCapBusqueda] = useState('')
  const [capitulos, setCapitulos] = useState([])
  const [capituloSel, setCapituloSel] = useState('')
  const [pkIds, setPkIds] = useState([])
  const [pkBusqueda, setPkBusqueda] = useState('')
  const [pkSeleccionado, setPkSeleccionado] = useState(null)
  const [pkDropOpen, setPkDropOpen] = useState(false)
  const [margen, setMargen] = useState('')
  const [absInicio, setAbsInicio] = useState('')
  const [absFinal, setAbsFinal] = useState('')
  const [nodos, setNodos] = useState([])
  const [nodoIni, setNodoIni] = useState('')
  const [nodoFin, setNodoFin] = useState('')
  const [nodoIniSugg, setNodoIniSugg] = useState([])
  const [nodoFinSugg, setNodoFinSugg] = useState([])
  const [nodoIniWarn, setNodoIniWarn] = useState(false)
  const [nodoFinWarn, setNodoFinWarn] = useState(false)
  const [coordLat, setCoordLat] = useState(null)
  const [coordLng, setCoordLng] = useState(null)
  const [modalMapaPk, setModalMapaPk] = useState(false)
  const mapaPkContainerRef = useRef(null)
  const mapaPkInstance = useRef(null)
  const modalPkHandlersRef = useRef({})
  const [planoGeojsonContrato, setPlanoGeojsonContrato] = useState(null)

  // Datos TAB 2 - Plantillas
  const [plantillas, setPlantillas] = useState([])
  const [plantillaSel, setPlantillaSel] = useState(null)
  const [modalCrearPlantilla, setModalCrearPlantilla] = useState(false)
  const [nuevaPlantillaNombre, setNuevaPlantillaNombre] = useState('')
  const [nuevaPlantillaItems, setNuevaPlantillaItems] = useState([{nombre:'', descripcion:''}])

  // Datos TAB 3 - Registros
  const [registros, setRegistros] = useState([])
  const [modalRegistro, setModalRegistro] = useState(null)
  const [reporteGraficoUrl, setReporteGraficoUrl] = useState(null)
  const [reporteGraficoNumero, setReporteGraficoNumero] = useState(null)
  const [modalGaleria, setModalGaleria] = useState(false)
  const [modalGaleriaGrafico, setModalGaleriaGrafico] = useState(false)
  const [galeriaFechaDesde, setGaleriaFechaDesde] = useState('')
  const [galeriaFechaHasta, setGaleriaFechaHasta] = useState('')
  const [galeriaGraficoFechaDesde, setGaleriaGraficoFechaDesde] = useState('')
  const [galeriaGraficoFechaHasta, setGaleriaGraficoFechaHasta] = useState('') // índice del registro abierto

  // Datos TAB 4 - Puntos topográficos
  const [puntos, setPuntos] = useState([{punto:'', norte:'', este:'', cota:'', descripcion:''}])

  const hdrs = { Authorization: `Bearer ${getToken()}` }
  const modoEdicion = !!reporteInicial

  const tienePlanoMapa = useMemo(() => {
    const g = planoGeojsonContrato
    if (!g || typeof g !== 'object') return false
    if (g.type === 'FeatureCollection' && Array.isArray(g.features)) return g.features.length > 0
    if (g.type === 'Feature' && g.geometry) return true
    if (Array.isArray(g.features) && g.features.length > 0) return true
    return false
  }, [planoGeojsonContrato])

  const [numeroReporte, setNumeroReporte] = useState(null)
  const [borradorId, setBorradorId] = useState(reporteInicial?.id || null)

  useEffect(() => {
    if (!contrato_id) return
    fetch(`${API_URL}/contratos`, { headers: hdrs })
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        const c = Array.isArray(list) ? list.find(x => x.id === contrato_id) : null
        setPlanoGeojsonContrato(c?.plano_geojson || null)
      })
      .catch(() => setPlanoGeojsonContrato(null))
  }, [contrato_id])

  useEffect(() => {
    if (!reporteInicial) {
      fetch(`${API_URL}/sicoe-obra/${contrato_id}/next-reporte`, { headers: hdrs })
        .then(r => r.json()).then(d => setNumeroReporte(d.siguiente))
      fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes`, {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion_actividad: 'Borrador',
          capitulo: 'Sin asignar',
          estado: 'Borrador'
        })
      }).then(r => r.json()).then(d => { if (d.id) setBorradorId(d.id) })
    } else {
      setNumeroReporte(reporteInicial.numero_reporte)
    }
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/subcontratistas-activos`, { headers: hdrs })
      .then(r => r.json()).then(d => setSubcontratistas(Array.isArray(d) ? d : []))
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/inspectores`, { headers: hdrs })
      .then(r => r.json()).then(d => setInspectores(Array.isArray(d) ? d : []))
    fetch(`${API_URL}/listado-precios/${contrato_id}`, { headers: hdrs })
      .then(r => r.json()).then(d => {
        if (Array.isArray(d)) {
          const caps = [...new Set(d.map(r => r.capitulo).filter(Boolean))]
          const sorted = caps.sort((a, b) => {
            const na = parseInt(a.match(/^(\d+)/)?.[1] || '9999')
            const nb = parseInt(b.match(/^(\d+)/)?.[1] || '9999')
            return na - nb
          })
          setCapitulos(sorted.map(c => ({ capitulo: c })))
        }
      })
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/pk-ids`, { headers: hdrs })
      .then(r => r.json()).then(d => setPkIds(Array.isArray(d) ? d : []))
// Precargar borrador si existe
    if (reporteInicial) {
      setDescripcion(reporteInicial.descripcion_actividad !== 'Borrador' ? reporteInicial.descripcion_actividad : '')
      setCapituloSel(reporteInicial.capitulo !== 'Sin asignar' ? reporteInicial.capitulo : '')
      setMargen(reporteInicial.margen || '')
      setAbsInicio(reporteInicial.abs_inicio ?? '')
      setAbsFinal(reporteInicial.abs_final ?? '')
      setNodoIni(reporteInicial.nodo_ini || '')
      setNodoFin(reporteInicial.nodo_fin || '')
      if (reporteInicial.subcontratista_id) {
        setSubSeleccionado({ id: reporteInicial.subcontratista_id, nombre: reporteInicial.subcontratista_nombre || '' })
      }
      if (reporteInicial.inspector_id) {
        fetch(`${API_URL}/usuarios/${reporteInicial.inspector_id}`, { headers: hdrs })
          .then(r => r.json()).then(u => {
            if (u.id) setInspSeleccionado({ id: u.id, nombre: `${u.nombre} ${u.apellidos}`.trim() })
          }).catch(() => {})
      }
      if (reporteInicial.registros?.length) setRegistros(reporteInicial.registros.map(r => ({
        nombre: r.nombre || '', descripcion: r.descripcion || '',
        longitud: r.longitud || '', ancho: r.ancho || '',
        espesor: r.espesor || '', cantidad: r.cantidad || '',
        cantidad_total: r.cantidad_total, unidad: r.unidad || '',
        observacion: r.descripcion || '',
        foto_url: r.foto_url, foto_numero: r.foto_numero, _fotoOk: !!r.foto_url,
        grafico_url: r.grafico_url, grafico_numero: r.grafico_numero, _grafOk: !!r.grafico_url
      })))
      if (reporteInicial.puntos?.length) setPuntos(reporteInicial.puntos.map(p => ({
        punto: p.punto || '', norte: p.norte || '', este: p.este || '',
        cota: p.cota || '', descripcion: p.descripcion || ''
      })))
    }
  }, [])

  useEffect(() => {
    if (reporteInicial?.pk_id_id && pkIds.length > 0 && !pkSeleccionado) {
      const pk = pkIds.find(p => p.id === reporteInicial.pk_id_id)
      if (pk) selPkId(pk)
    }
  }, [pkIds])

  useEffect(() => {
    if (!capituloSel) { setNodos([]); return }
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/nodos?capitulo=${encodeURIComponent(capituloSel)}`, { headers: hdrs })
      .then(r => r.json()).then(d => setNodos(Array.isArray(d) ? d : []))
    // Cargar plantillas del capítulo
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/plantillas?capitulo=${encodeURIComponent(capituloSel)}`, { headers: hdrs })
      .then(r => r.json()).then(d => setPlantillas(Array.isArray(d) ? d : []))
  }, [capituloSel])

  const selPkId = (pk) => {
    setPkSeleccionado(pk)
    setPkBusqueda(pk.pk_id)
    setPkDropOpen(false)
    setCoordLat(null); setCoordLng(null)
  }

  const pkFiltrados = pkIds.filter(p =>
    p.pk_id.toLowerCase().includes(pkBusqueda.toLowerCase()) ||
    (p.ubicacion||'').toLowerCase().includes(pkBusqueda.toLowerCase())
  ).slice(0, 20)

  modalPkHandlersRef.current = {
    pkIds,
    selPkId,
    setCoordLat,
    setCoordLng,
    setPkBusqueda,
    setPkSeleccionado,
    setModalMapaPk,
  }

  useLayoutEffect(() => {
    if (!modalMapaPk || !tienePlanoMapa) return
    const geojson = planoGeojsonContrato
    if (!geojson?.features?.length) return
    const container = mapaPkContainerRef.current
    if (!container) return

    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (token) mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-74.031242, 4.760271],
      zoom: 12,
      fadeDuration: 0,
      bearing: 270,
    })
    mapaPkInstance.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    const onLoad = () => {
      map.addSource('pkids', { type: 'geojson', data: geojson })
      map.addLayer({
        id: 'pkids-fill', type: 'fill', source: 'pkids',
        paint: { 'fill-color': '#0077B6', 'fill-opacity': 0.35 },
      })
      map.addLayer({
        id: 'pkids-outline', type: 'line', source: 'pkids',
        paint: { 'line-color': '#00A896', 'line-width': 1.5 },
      })
      map.addLayer({
        id: 'pkids-hover', type: 'fill', source: 'pkids',
        paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.6 },
        filter: ['==', 'Layer', ''],
      })
      const coords = geojson.features.flatMap(f => {
        const geom = f.geometry
        if (!geom) return []
        if (geom.type === 'Polygon') return geom.coordinates[0]
        if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2)
        return []
      })
      if (coords.length > 0) {
        const lngs = coords.map(c => c[0])
        const lats = coords.map(c => c[1])
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 40, duration: 0, bearing: 270, pitch: 0 },
        )
      }
      map.on('click', 'pkids-fill', (e) => {
        const feat = e.features[0]
        if (!feat) return
        const h = modalPkHandlersRef.current
        const pkIdVal = String(feat.properties.Layer || feat.properties.PK_ID || feat.properties.pk_id || '').trim()
        const found = h.pkIds.find(p => String(p.pk_id).trim() === pkIdVal)
        if (found) {
          h.selPkId(found)
          h.setCoordLat(e.lngLat.lat)
          h.setCoordLng(e.lngLat.lng)
        } else {
          h.setPkBusqueda(pkIdVal)
          h.setPkSeleccionado(null)
        }
        h.setModalMapaPk(false)
      })
      map.on('mouseenter', 'pkids-fill', (ev) => {
        map.getCanvas().style.cursor = 'pointer'
        map.setFilter('pkids-hover', ['==', 'Layer', String(ev.features[0]?.properties?.Layer || '')])
      })
      map.on('mouseleave', 'pkids-fill', () => {
        map.getCanvas().style.cursor = ''
        map.setFilter('pkids-hover', ['==', 'Layer', ''])
      })
    }

    map.once('load', onLoad)

    return () => {
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      mapaPkInstance.current = null
    }
  }, [modalMapaPk, tienePlanoMapa, planoGeojsonContrato])

  const subFiltrados = subcontratistas.filter(s =>
    s.nombre.toLowerCase().includes(subBusqueda.toLowerCase())
  )
  const inspFiltrados = inspectores.filter(i =>
    i.nombre.toLowerCase().includes(inspBusqueda.toLowerCase())
  )

  const validarTab1 = () => {
    const e = {}
    if (!descripcion.trim()) e.descripcion = 'Requerido'
    if (!subSeleccionado) e.sub = 'Requerido'
    if (!inspSeleccionado) e.insp = 'Requerido'
    if (!capituloSel) e.capitulo = 'Requerido'
    if (!modoEdicion) {
      if (!pkSeleccionado) e.pk = 'Requerido'
      if (!margen) e.margen = 'Requerido'
      if (absInicio === '') e.absInicio = 'Requerido'
      if (absFinal === '') e.absFinal = 'Requerido'
      if (!nodoIni.trim()) e.nodoIni = 'Requerido'
      if (!nodoFin.trim()) e.nodoFin = 'Requerido'
    }
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const aplicarPlantilla = (plantilla) => {
    setPlantillaSel(plantilla)
    if (plantilla?.items?.length) {
      setRegistros(plantilla.items.map(item => ({
        nombre: item.nombre,
        descripcion: '',
        longitud: '', ancho: '', espesor: '', cantidad: '',
        cantidad_total: null,
        unidad: '',
        observacion: '',
        foto_url: null, foto_numero: null, foto_descripcion: '',
        grafico_url: null, grafico_numero: null, grafico_descripcion: '',
        _fotoOk: false, _grafOk: false
      })))
    }
  }

  const calcTotal = (reg) => {
    const vals = [reg.longitud, reg.ancho, reg.espesor, reg.cantidad]
      .map(v => parseFloat(v)).filter(v => !isNaN(v) && v !== 0)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a * b, 1)
  }

  const agregarRegistro = () => {
    setRegistros(prev => [...prev, {
      nombre: '', descripcion: '', longitud: '', ancho: '', espesor: '', cantidad: '',
      cantidad_total: null, unidad: '', observacion: '',
      foto_url: null, foto_numero: null, foto_descripcion: '',
      grafico_url: null, grafico_numero: null, grafico_descripcion: '',
      _fotoOk: false, _grafOk: false
    }])
  }

  const agregarPunto = () => setPuntos(prev => [...prev, {punto:'', norte:'', este:'', cota:'', descripcion:''}])

  const guardarReporte = async () => {
    if (!validarTab1()) { setTabActivo(0); return }
    if (registros.length === 0) { alert('Debe tener al menos un registro en el TAB 3'); setTabActivo(2); return }
    setGuardando(true)
    try {
      // Usar variable local para evitar problemas de closure con el estado asíncrono
      let idParaGuardar = borradorId
      // Guardar localización si el reporte ya existía como borrador
      if (borradorId && pkSeleccionado) {
          await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${idParaGuardar}/localizacion`, {
              method: 'PATCH', headers: { ...hdrs, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  pk_id_id: pkSeleccionado?.id || null,
                  civ: pkSeleccionado?.civ || null,
                  tramo: pkSeleccionado?.tramo || null,
                  infraestructura: pkSeleccionado?.infraestructura || null,
                  calzada: pkSeleccionado?.calzada || null,
                  ubicacion: pkSeleccionado?.ubicacion || null,
                  coord_lat: coordLat || null,
                  coord_lng: coordLng || null,
                  margen: margen || null,
                  abs_inicio: parseFloat(absInicio) || null,
                  abs_final: parseFloat(absFinal) || null,
                  nodo_ini: nodoIni || null,
                  nodo_fin: nodoFin || null,
              })
          })
      }            
      if (!idParaGuardar) {
        const bRes = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes`, {
          method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descripcion_actividad: descripcion || 'Borrador',
            capitulo: capituloSel || 'Sin asignar',
            estado: 'Borrador',
            pk_id_id: pkSeleccionado?.id || null,
            civ: pkSeleccionado?.civ || null,
            tramo: pkSeleccionado?.tramo || null,
            infraestructura: pkSeleccionado?.infraestructura || null,
            calzada: pkSeleccionado?.calzada || null,
            ubicacion: pkSeleccionado?.ubicacion || null,
            coord_lat: coordLat || null,
            coord_lng: coordLng || null,
            margen: margen || null,
            abs_inicio: parseFloat(absInicio) || null,
            abs_final: parseFloat(absFinal) || null,
            nodo_ini: nodoIni || null,
            nodo_fin: nodoFin || null,
        })
        })
        const bData = await bRes.json()
        if (!bData.id) throw new Error('No se pudo crear el borrador')
        idParaGuardar = bData.id
        setBorradorId(bData.id)
      }
      const body = {
        descripcion_actividad: descripcion,
        subcontratista_id: subSeleccionado?.id || null,
        inspector_id: inspSeleccionado?.id || null,
        capitulo: capituloSel,
        pk_id_id: pkSeleccionado?.id || null,
        civ: pkSeleccionado?.civ || null,
        tramo: pkSeleccionado?.tramo || null,
        infraestructura: pkSeleccionado?.infraestructura || null,
        calzada: pkSeleccionado?.calzada || null,
        ubicacion: pkSeleccionado?.ubicacion || null,
        coord_lat: coordLat, coord_lng: coordLng,
        margen, abs_inicio: parseFloat(absInicio), abs_final: parseFloat(absFinal),
        nodo_ini: nodoIni, nodo_fin: nodoFin,
      }
      // Actualizar el borrador y cambiar estado en un solo PUT
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${idParaGuardar}`, {
        method: 'PUT', headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, estado: 'Sin Asignar Ítem' })
      })
      // Eliminar registros anteriores y reinsertar los actuales
      await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${idParaGuardar}/registros`, {
        method: 'DELETE', headers: hdrs
      })
      for (const reg of registros) {
        const numR = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/next-registro`, { method: 'POST', headers: hdrs })
          .then(x => x.json())
        await fetch(`${API_URL}/sicoe-obra/${contrato_id}/registros`, {
          method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reporte_id: idParaGuardar, numero_registro: numR.numero,
            nombre: reg.nombre, descripcion: reg.observacion,
            longitud: parseFloat(reg.longitud)||null, ancho: parseFloat(reg.ancho)||null,
            espesor: parseFloat(reg.espesor)||null, cantidad: parseFloat(reg.cantidad)||null,
            cantidad_total: reg.cantidad_total,
            unidad: reg.unidad, observacion: reg.observacion,
            foto_url: reg.foto_url, foto_numero: reg.foto_numero, foto_descripcion: reg.foto_descripcion,
            grafico_url: reg.grafico_url, grafico_numero: reg.grafico_numero, grafico_descripcion: reg.grafico_descripcion,
          })
        })
      }
      // Guardar puntos topográficos
      const puntosValidos = puntos.filter(p => p.norte || p.este)
      if (puntosValidos.length > 0) {
        await fetch(`${API_URL}/sicoe-obra/${contrato_id}/puntos-topograficos`, {
          method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reporte_id: idParaGuardar, puntos: puntosValidos })
        })
      }
      onGuardado()
    } catch(e) {
      alert('Error guardando reporte: ' + e.message)
    }
    setGuardando(false)
  }

  const inpStyle = (err) => ({
    width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
    background: t.bg, color: t.text, boxSizing: 'border-box',
    border: `1px solid ${err ? '#EF4444' : t.border}`, outline: 'none'
  })

  const TABS = ['📋 Info General', '📄 Plantilla', '📝 Registros', '📍 Topografía']

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'780px',
        maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 25px 60px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:`1px solid ${t.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:'800', fontSize:'16px', color:t.text }}>
              🏗️ Nuevo Reporte de Cantidades
              {numeroReporte && <span style={{ marginLeft:'12px', color:t.primary, fontSize:'28px', fontWeight:'900', letterSpacing:'-1px' }}>#{numeroReporte}</span>}
            </div>
            <div style={{ fontSize:'12px', color:t.textMuted }}>Todos los campos son obligatorios</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none',
            fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${t.border}`, padding:'0 24px' }}>
          {TABS.map((tab, i) => (
            <button key={i} onClick={() => i <= tabActivo && setTabActivo(i)} style={{
              background:'transparent', border:'none', borderBottom: tabActivo===i ? `2px solid ${t.primary}` : '2px solid transparent',
              padding:'12px 16px', fontSize:'13px', fontWeight: tabActivo===i ? '700' : '400',
              color: tabActivo===i ? t.primary : i > tabActivo ? t.border : t.textMuted,
              cursor: i <= tabActivo ? 'pointer' : 'default'
            }}>{tab}</button>
          ))}
        </div>

        {/* Contenido */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>

          {/* ── TAB 0: Info General ── */}
          {tabActivo === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

              {/* Descripción */}
              <div>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                  DESCRIPCIÓN ACTIVIDAD *
                </label>
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  rows={2} placeholder="Nombre descriptivo del reporte..."
                  style={{ ...inpStyle(errores.descripcion), resize:'vertical' }} />
                {errores.descripcion && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.descripcion}</span>}
              </div>

              {/* Subcontratista */}
              <div style={{ position:'relative' }}>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                  SUBCONTRATISTA *
                </label>
                <input value={subSeleccionado ? subSeleccionado.nombre : subBusqueda}
                  onChange={e => { setSubBusqueda(e.target.value); setSubSeleccionado(null); setSubDropOpen(true) }}
                  onFocus={() => setSubDropOpen(true)}
                  placeholder="Buscar subcontratista..." style={inpStyle(errores.sub)} />
                {subDropOpen && subFiltrados.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:t.bgCard,
                    border:`1px solid ${t.border}`, borderRadius:'8px', zIndex:10, maxHeight:'160px', overflowY:'auto' }}>
                    {subFiltrados.map(s => (
                      <div key={s.id} onClick={() => { setSubSeleccionado(s); setSubBusqueda(''); setSubDropOpen(false) }}
                        style={{ padding:'8px 12px', cursor:'pointer', fontSize:'13px', color:t.text,
                          borderBottom:`1px solid ${t.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = t.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {s.nombre}
                      </div>
                    ))}
                  </div>
                )}
                {errores.sub && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.sub}</span>}
              </div>

              {/* Inspector */}
              <div style={{ position:'relative' }}>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                  INSPECTOR *
                </label>
                <input value={inspSeleccionado ? inspSeleccionado.nombre : inspBusqueda}
                  onChange={e => { setInspBusqueda(e.target.value); setInspSeleccionado(null); setInspDropOpen(true) }}
                  onFocus={() => setInspDropOpen(true)}
                  placeholder="Buscar inspector de obra..." style={inpStyle(errores.insp)} />
                {inspDropOpen && inspFiltrados.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:t.bgCard,
                    border:`1px solid ${t.border}`, borderRadius:'8px', zIndex:10, maxHeight:'160px', overflowY:'auto' }}>
                    {inspFiltrados.map(i => (
                      <div key={i.id} onClick={() => { setInspSeleccionado(i); setInspBusqueda(''); setInspDropOpen(false) }}
                        style={{ padding:'8px 12px', cursor:'pointer', fontSize:'13px', color:t.text,
                          borderBottom:`1px solid ${t.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = t.bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {i.nombre}
                      </div>
                    ))}
                  </div>
                )}
                {errores.insp && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.insp}</span>}
              </div>

              {/* Capítulo */}
              <div style={{ position:'relative' }}>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                  CAPÍTULO *
                </label>
                <input
                  value={capituloSel || capBusqueda}
                  onChange={e => { setCapBusqueda(e.target.value); setCapituloSel(''); setCapDropOpen(true) }}
                  onFocus={() => setCapDropOpen(true)}
                  onBlur={() => setTimeout(() => setCapDropOpen(false), 200)}
                  placeholder="Buscar capítulo..."
                  style={inpStyle(errores.capitulo)} />
                {capDropOpen && (
                  <div style={{ position:'fixed', top:'auto', left:'auto', background:t.bgCard,
                    border:`1px solid ${t.border}`, borderRadius:'8px', zIndex:9999,
                    maxHeight:'300px', overflowY:'auto', width:'500px', boxShadow:'0 8px 24px rgba(0,0,0,0.3)' }}>
                    {capitulos
                      .filter(c => !capBusqueda || c.capitulo.toLowerCase().includes(capBusqueda.toLowerCase()))
                      .map(c => (
                        <div key={c.capitulo}
                          onMouseDown={() => { setCapituloSel(c.capitulo); setCapBusqueda(''); setCapDropOpen(false) }}
                          style={{ padding:'8px 12px', cursor:'pointer', fontSize:'13px',
                            color: capituloSel === c.capitulo ? t.primary : t.text,
                            fontWeight: capituloSel === c.capitulo ? '700' : '400',
                            borderBottom:`1px solid ${t.border}`,
                            background: capituloSel === c.capitulo ? t.primary+'11' : 'transparent' }}
                          onMouseEnter={e => e.currentTarget.style.background = t.bg}
                          onMouseLeave={e => e.currentTarget.style.background = capituloSel === c.capitulo ? t.primary+'11' : 'transparent'}>
                          {c.capitulo}
                        </div>
                      ))}
                    {capitulos.filter(c => !capBusqueda || c.capitulo.toLowerCase().includes(capBusqueda.toLowerCase())).length === 0 && (
                      <div style={{ padding:'12px', color:t.textMuted, fontSize:'13px', textAlign:'center' }}>
                        No se encontró el capítulo
                      </div>
                    )}
                  </div>
                )}
                {capituloSel && (
                  <div style={{ fontSize:'11px', color:'#10B981', marginTop:'4px' }}>✅ {capituloSel}</div>
                )}
                {errores.capitulo && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.capitulo}</span>}
              </div>

              {/* Localización + Margen en fila */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 180px', gap:'12px', alignItems:'start' }}>
                {/* PK_ID */}
                <div style={{ position:'relative' }}>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    LOCALIZACIÓN (PK_ID){!modoEdicion && ' *'}
                  </label>
                  {modoEdicion ? (
                    <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'12px', color:t.textMuted }}>
                      📍 CIV: {reporteInicial.civ || '—'} · {reporteInicial.tramo || '—'} · {reporteInicial.infraestructura || '—'} · {reporteInicial.calzada || '—'}
                    </div>
                  ) : (
                    <>
                      {tienePlanoMapa ? (
                        <div style={{ display:'flex', gap:'6px', alignItems:'stretch' }}>
                          <input
                            readOnly
                            disabled
                            tabIndex={-1}
                            value={pkSeleccionado?.pk_id ?? ''}
                            placeholder="Pulsa el mapa y elige un polígono →"
                            style={{
                              ...inpStyle(errores.pk),
                              flex: 1,
                              minHeight: '38px',
                              cursor: 'not-allowed',
                              opacity: 0.92,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setModalMapaPk(true)}
                            title="Seleccionar PK_ID en el mapa"
                            style={{
                              background: t.primary,
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '0 14px',
                              cursor: 'pointer',
                              fontSize: '16px',
                              flexShrink: 0,
                              height: '38px',
                            }}
                          >
                            🗺️
                          </button>
                        </div>
                      ) : (
                        <div style={{ position:'relative' }}>
                          <div style={{ display:'flex', gap:'6px', alignItems:'stretch' }}>
                            <input
                              readOnly
                              disabled
                              tabIndex={-1}
                              value={pkSeleccionado?.pk_id ?? ''}
                              placeholder="Elige un PK con la lista →"
                              style={{
                                ...inpStyle(errores.pk),
                                flex: 1,
                                minHeight: '38px',
                                cursor: 'not-allowed',
                                opacity: 0.92,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setPkDropOpen(o => !o)}
                              title="Lista de PK del contrato"
                              style={{
                                background: t.bgCard,
                                color: t.primary,
                                border: `1px solid ${t.border}`,
                                borderRadius: '8px',
                                padding: '0 12px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                flexShrink: 0,
                                height: '38px',
                              }}
                            >
                              📋
                            </button>
                          </div>
                          {pkDropOpen && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '8px',
                                background: t.bgCard,
                                border: `1px solid ${t.border}`,
                                borderRadius: '8px',
                                zIndex: 25,
                                padding: '10px',
                                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                              }}
                            >
                              <input
                                value={pkBusqueda}
                                onChange={e => {
                                  setPkBusqueda(e.target.value)
                                  setPkSeleccionado(null)
                                }}
                                placeholder="Filtrar por código o ubicación..."
                                style={{ ...inpStyle(false), marginBottom: '8px', fontSize: '12px' }}
                                autoFocus
                              />
                              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {pkFiltrados.length === 0 ? (
                                  <div style={{ fontSize: '12px', color: t.textMuted, padding: '8px' }}>
                                    Sin coincidencias
                                  </div>
                                ) : (
                                  pkFiltrados.map(p => (
                                    <div
                                      key={p.id}
                                      onMouseDown={() => {
                                        selPkId(p)
                                        setPkDropOpen(false)
                                      }}
                                      style={{
                                        padding: '8px 10px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        color: t.text,
                                        borderBottom: `1px solid ${t.border}`,
                                      }}
                                    >
                                      <span style={{ fontWeight: '700' }}>{p.pk_id}</span>
                                      <span style={{ fontSize: '11px', color: t.textMuted, marginLeft: '8px' }}>
                                        {p.ubicacion || ''}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: t.textMuted, marginTop: '6px' }}>
                            Sin plano GeoJSON no hay mapa; usa 📋 o pide cargar el plano en Contratos.
                          </div>
                        </div>
                      )}
                      {pkSeleccionado && (
                        <div style={{ marginTop:'6px', padding:'8px 12px', background:t.bg,
                          borderRadius:'6px', fontSize:'11px', color:t.textMuted }}>
                          📍 CIV: {pkSeleccionado.civ} · {pkSeleccionado.tramo} · {pkSeleccionado.infraestructura} · {pkSeleccionado.calzada}
                        </div>
                      )}
                      {errores.pk && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.pk}</span>}
                    </>
                  )}
                </div>

                {/* Margen */}
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    MARGEN{!modoEdicion && ' *'}
                  </label>
                  {modoEdicion ? (
                    <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'13px', color:t.textMuted }}>{margen || '—'}</div>
                  ) : (
                    <>
                      <select value={margen.startsWith('Otro:') ? 'Otro' : margen}
                        onChange={e => setMargen(e.target.value === 'Otro' ? 'Otro: ' : e.target.value)}
                        style={inpStyle(errores.margen)}>
                        <option value=''>-- Seleccionar --</option>
                        {['Izquierda','Central','Derecha','Única','Otro'].map(m =>
                          <option key={m} value={m}>{m}</option>)}
                      </select>
                      {margen.startsWith('Otro:') && (
                        <input value={margen.replace('Otro: ','')}
                          onChange={e => setMargen('Otro: ' + e.target.value)}
                          placeholder='Especificar...'
                          style={{ ...inpStyle(false), marginTop:'6px' }} />
                      )}
                      {errores.margen && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.margen}</span>}
                    </>
                  )}
                </div>
              </div>

              {/* Abscisado + Nodos en una sola fila */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    ABS. INICIAL{!modoEdicion && ' *'}
                  </label>
                  {modoEdicion
                    ? <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'13px', color:t.textMuted }}>{absInicio !== '' ? absInicio : '—'}</div>
                    : <><input type='number' step='0.01' value={absInicio} onChange={e => setAbsInicio(e.target.value)} placeholder='0.00' style={inpStyle(errores.absInicio)} />
                       {errores.absInicio && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.absInicio}</span>}</>
                  }
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    ABS. FINAL{!modoEdicion && ' *'}
                  </label>
                  {modoEdicion
                    ? <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'13px', color:t.textMuted }}>{absFinal !== '' ? absFinal : '—'}</div>
                    : <><input type='number' step='0.01' value={absFinal} onChange={e => setAbsFinal(e.target.value)} placeholder='0.00' style={inpStyle(errores.absFinal)} />
                       {errores.absFinal && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.absFinal}</span>}</>
                  }
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    NODO INICIAL{!modoEdicion && ' *'}
                  </label>
                  {modoEdicion
                    ? <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'13px', color:t.textMuted }}>{nodoIni || '—'}</div>
                    : <>
                        <input value={nodoIni}
                          onChange={e => {
                            setNodoIni(e.target.value); setNodoIniWarn(false)
                            if (e.target.value.length > 1)
                              setNodoIniSugg(nodos.filter(n => n.toLowerCase().includes(e.target.value.toLowerCase())).slice(0,8))
                            else setNodoIniSugg([])
                          }}
                          onBlur={() => {
                            if (nodoIni && !nodos.includes(nodoIni)) setNodoIniWarn(true)
                            setTimeout(() => setNodoIniSugg([]), 200)
                          }}
                          placeholder='Nodo inicial...' style={inpStyle(errores.nodoIni)} />
                        {nodoIniSugg.length > 0 && (
                          <div style={{ position:'absolute', background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'6px', zIndex:10 }}>
                            {nodoIniSugg.map(n => (
                              <div key={n} onClick={() => { setNodoIni(n); setNodoIniSugg([]); setNodoIniWarn(false) }}
                                style={{ padding:'6px 10px', cursor:'pointer', fontSize:'12px', color:t.text }}>{n}</div>
                            ))}
                          </div>
                        )}
                        {nodoIniWarn && <span style={{ color:'#F59E0B', fontSize:'11px' }}>⚠️ No existe en presupuesto</span>}
                        {errores.nodoIni && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.nodoIni}</span>}
                      </>
                  }
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    NODO FINAL{!modoEdicion && ' *'}
                  </label>
                  {modoEdicion
                    ? <div style={{ padding:'8px 12px', borderRadius:'8px', border:`1px solid ${t.border}`, background:t.bg, fontSize:'13px', color:t.textMuted }}>{nodoFin || '—'}</div>
                    : <>
                        <input value={nodoFin}
                          onChange={e => {
                            setNodoFin(e.target.value); setNodoFinWarn(false)
                            if (e.target.value.length > 1)
                              setNodoFinSugg(nodos.filter(n => n.toLowerCase().includes(e.target.value.toLowerCase())).slice(0,8))
                            else setNodoFinSugg([])
                          }}
                          onBlur={() => {
                            if (nodoFin && !nodos.includes(nodoFin)) setNodoFinWarn(true)
                            setTimeout(() => setNodoFinSugg([]), 200)
                          }}
                          placeholder='Nodo final...' style={inpStyle(errores.nodoFin)} />
                        {nodoFinSugg.length > 0 && (
                          <div style={{ position:'absolute', background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'6px', zIndex:10 }}>
                            {nodoFinSugg.map(n => (
                              <div key={n} onClick={() => { setNodoFin(n); setNodoFinSugg([]); setNodoFinWarn(false) }}
                                style={{ padding:'6px 10px', cursor:'pointer', fontSize:'12px', color:t.text }}>{n}</div>
                            ))}
                          </div>
                        )}
                        {nodoFinWarn && <span style={{ color:'#F59E0B', fontSize:'11px' }}>⚠️ No existe en presupuesto</span>}
                        {errores.nodoFin && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.nodoFin}</span>}
                      </>
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 1: Plantilla ── */}
          {tabActivo === 1 && (
            <div>
              {!capituloSel && (
                <div style={{ padding:'30px', textAlign:'center', color:t.textMuted }}>
                  Selecciona un capítulo en el TAB 1 para ver las plantillas disponibles.
                </div>
              )}
              {capituloSel && (
                <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:'13px', color:t.textMuted }}>
                      Plantillas para: <strong style={{ color:t.text }}>{capituloSel}</strong>
                    </div>
                    <button onClick={() => setModalCrearPlantilla(true)} style={{
                      background:'transparent', border:`1px solid ${t.primary}`, color:t.primary,
                      borderRadius:'6px', padding:'6px 14px', fontSize:'12px', cursor:'pointer', fontWeight:'600'
                    }}>+ Crear Plantilla</button>
                  </div>
                  {plantillas.length === 0 ? (
                    <div style={{ padding:'30px', textAlign:'center', color:t.textMuted, background:t.bg, borderRadius:'8px' }}>
                      No hay plantillas para este capítulo. Puedes continuar sin plantilla o crear una.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                      {plantillas.map(p => (
                        <div key={p.id} onClick={() => aplicarPlantilla(p)}
                          style={{ padding:'14px', borderRadius:'10px', cursor:'pointer',
                            border: `2px solid ${plantillaSel?.id === p.id ? t.primary : t.border}`,
                            background: plantillaSel?.id === p.id ? t.primary+'11' : t.bg }}>
                          <div style={{ fontWeight:'700', color:t.text, marginBottom:'6px' }}>{p.nombre}</div>
                          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                            {(p.items||[]).map((item, i) => (
                              <span key={i} style={{ background:t.border, color:t.textMuted,
                                borderRadius:'4px', padding:'2px 8px', fontSize:'11px' }}>{item.nombre}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {plantillaSel && (
                    <div style={{ padding:'10px 14px', background:'#10B98122', border:'1px solid #10B981',
                      borderRadius:'8px', fontSize:'12px', color:'#10B981' }}>
                      ✅ Plantilla "{plantillaSel.nombre}" aplicada — {registros.length} actividades cargadas en TAB 3
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: Registros ── */}
          {tabActivo === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {registros.length === 0 && (
                <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, background:t.bg, borderRadius:'8px' }}>
                  No hay actividades. Agrega una o aplica una plantilla en el TAB anterior.
                </div>
              )}
              {/* Grid header */}
              {registros.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'60px 1fr 100px 40px',
                  gap:'8px', fontSize:'11px', fontWeight:'700', color:t.textMuted,
                  padding:'0 8px', letterSpacing:'0.5px' }}>
                  <div>N° REG.</div><div>NOMBRE / DESCRIPCIÓN</div><div>CANT. TOTAL</div><div>📸</div>
                </div>
              )}
              {registros.map((reg, idx) => (
                <div key={idx} onClick={() => setModalRegistro(idx)}
                  style={{ display:'grid', gridTemplateColumns:'60px 1fr 100px 40px',
                    gap:'8px', padding:'10px 8px', borderRadius:'8px', cursor:'pointer',
                    border:`1px solid ${t.border}`, background:t.bg,
                    alignItems:'center' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = t.primary}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
                  <div style={{ fontWeight:'700', color:t.primary, fontSize:'13px' }}>#{idx+1}</div>
                  <div>
                    <div style={{ fontWeight:'600', fontSize:'13px', color:t.text }}>
                      {reg.nombre || <span style={{ color:t.textMuted, fontStyle:'italic' }}>Sin nombre</span>}
                    </div>
                    <div style={{ fontSize:'11px', color:t.textMuted }}>
                      {reg.observacion || <span style={{ fontStyle:'italic' }}>Click para diligenciar...</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight:'700', color: reg.cantidad_total ? '#10B981' : t.textMuted, fontSize:'13px' }}>
                    {reg.cantidad_total != null ? Number(reg.cantidad_total).toFixed(2) : '—'}
                  </div>
                  <div style={{ fontSize:'16px' }}>{reg._fotoOk ? '✅' : '⬜'}</div>
                </div>
              ))}
              <button onClick={agregarRegistro} style={{
                background:'transparent', border:`1px dashed ${t.border}`, color:t.textMuted,
                borderRadius:'8px', padding:'10px', fontSize:'13px', cursor:'pointer', width:'100%'
              }}>+ Agregar actividad</button>

              {/* Gráfico único del reporte */}
              <div style={{ marginTop:'8px', padding:'16px', background:t.bg, borderRadius:'12px', border:`1px solid ${t.border}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                  <label style={{ fontSize:'12px', fontWeight:'700', color:t.textMuted }}>
                    📐 GRÁFICO DEL REPORTE
                    {reporteGraficoNumero && <span style={{ color:t.primary, marginLeft:'8px' }}>#{String(reporteGraficoNumero).padStart(4,'0')}</span>}
                  </label>
                  <span style={{ fontSize:'11px', color:'#F59E0B' }}>Opcional — obligatorio en validación</span>
                </div>
                <div style={{ fontSize:'11px', color:t.textMuted, marginBottom:'8px' }}>
                  💡 Un solo gráfico aplica para todas las actividades de este reporte.
                </div>
                {reporteGraficoUrl && (
                  <img src={reporteGraficoUrl} style={{ width:'100%', borderRadius:'8px', marginBottom:'8px', maxHeight:'200px', objectFit:'cover' }} />
                )}
                <button onClick={() => setModalGaleriaGrafico(true)} style={{
                  background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted,
                  borderRadius:'6px', padding:'5px 12px', fontSize:'11px', cursor:'pointer', marginBottom:'6px'
                }}>🖼️ Usar gráfico de galería</button>
                <input type='file' accept='image/*' onChange={async e => {
                  const file = e.target.files[0]; if (!file) return
                  const fd = new FormData(); fd.append('file', file)
                  try {
                    const numR = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/next-grafico`, { method:'POST', headers: hdrs }).then(x=>x.json())
                    fd.append('numero', numR.numero)
                    fd.append('descripcion', `Grafico-Reporte-${numR.numero}`)
                    const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/upload-grafico`, { method:'POST', headers: hdrs, body: fd })
                    const data = await r.json()
                    setReporteGraficoUrl(data.url)
                    setReporteGraficoNumero(numR.numero)
                  } catch(e) { alert('Error subiendo gráfico') }
                }} style={{ width:'100%', fontSize:'12px' }} />
                {reporteGraficoUrl && <div style={{ color:'#10B981', fontSize:'12px', marginTop:'4px' }}>✅ Gráfico #{String(reporteGraficoNumero).padStart(4,'0')} cargado</div>}
              </div>
            </div>
          )}

          {/* ── TAB 3: Topografía ── */}
          {tabActivo === 3 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ fontSize:'13px', color:t.textMuted }}>
                Registra las coordenadas levantadas en campo. Opcional — puedes importar desde CSV.
              </div>
              {/* Header grid */}
              <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 28px',
                gap:'8px', fontSize:'11px', fontWeight:'700', color:t.textMuted,
                padding:'0 8px', letterSpacing:'0.5px' }}>
                <div>PUNTO</div><div>NORTE</div><div>ESTE</div><div>COTA</div><div>DESCRIPCIÓN</div>
              </div>
              {puntos.map((p, idx) => (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 28px', gap:'8px', alignItems:'center' }}>
                  {['punto','norte','este','cota','descripcion'].map(campo => (
                    <input key={campo} value={p[campo]}
                      onChange={e => {
                        const arr = [...puntos]; arr[idx] = {...arr[idx], [campo]: e.target.value}; setPuntos(arr)
                      }}
                      type={['norte','este','cota'].includes(campo) ? 'number' : 'text'}
                      step='0.000001'
                      placeholder={campo.charAt(0).toUpperCase()+campo.slice(1)}
                      style={inpStyle(false)} />
                  ))}
                  <button onClick={() => setPuntos(prev => prev.filter((_,i) => i!==idx))}
                    style={{ background:'transparent', border:'none', color:'#EF4444', cursor:'pointer', fontSize:'16px', padding:0 }}>✕</button>
                </div>
              ))}
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={agregarPunto} style={{
                  background:'transparent', border:`1px dashed ${t.border}`, color:t.textMuted,
                  borderRadius:'8px', padding:'8px 16px', fontSize:'12px', cursor:'pointer'
                }}>+ Agregar punto</button>
                <label style={{
                  background:'transparent', border:`1px dashed ${t.border}`, color:t.textMuted,
                  borderRadius:'8px', padding:'8px 16px', fontSize:'12px', cursor:'pointer'
                }}>
                  📂 Importar CSV
                  <input type='file' accept='.csv' style={{ display:'none' }} onChange={e => {
                    const file = e.target.files[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      const lines = ev.target.result.split('\n').filter(l => l.trim())
                      const rows = lines.slice(1).map(l => {
                        const cols = l.split(',')
                        return { punto:cols[0]||'', norte:cols[1]||'', este:cols[2]||'', cota:cols[3]||'', descripcion:cols[4]||'' }
                      })
                      if (rows.length) setPuntos(rows)
                    }
                    reader.readAsText(file)
                  }} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:`1px solid ${t.border}`,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={async () => {
            if (borradorId) {
              if (window.confirm('¿Deseas eliminar este borrador?')) {
                await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${borradorId}`, {
                  method:'DELETE', headers: hdrs
                })
              } else return
            }
            onClose()
          }} style={{
            background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted,
            borderRadius:'8px', padding:'8px 20px', cursor:'pointer', fontSize:'13px'
          }}>🗑️ Cancelar / Eliminar borrador</button>
          <div style={{ display:'flex', gap:'8px' }}>
            {tabActivo < 3 && (
              <button onClick={() => {
                if (tabActivo === 0 && !validarTab1()) return
                if (tabActivo === 2 && registros.length === 0) { alert('Debe tener al menos un registro'); return }
                setTabActivo(tabActivo + 1)
              }} style={{
                background:t.primary, color:'#fff', border:'none', borderRadius:'8px',
                padding:'8px 24px', cursor:'pointer', fontWeight:'700', fontSize:'13px'
              }}>Siguiente →</button>
            )}
            {tabActivo === 3 && (
              <button onClick={guardarReporte} disabled={guardando} style={{
                background: guardando ? t.border : '#10B981', color:'#fff', border:'none',
                borderRadius:'8px', padding:'8px 24px', cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight:'700', fontSize:'13px'
              }}>{guardando ? 'Guardando...' : '✅ Guardar y Enviar'}</button>
            )}
          </div>
        </div>
      </div>

{/* ── Modal Detalle Registro ── */}
      {modalRegistro !== null && registros[modalRegistro] && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'620px',
            maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:'700', color:t.text }}>📝 Registro #{String(modalRegistro + 1).padStart(3,'0')}</div>
                {registros[modalRegistro].nombre && (
                  <div style={{ fontSize:'12px', color:t.primary, fontWeight:'600', marginTop:'2px' }}>
                    📋 {registros[modalRegistro].nombre}
                  </div>
                )}
              </div>
              <button onClick={() => setModalRegistro(null)} style={{
                background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
              {/* Dimensiones + Unidad en una sola fila */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:'10px' }}>
                {[['longitud','Longitud'],['ancho','Ancho'],['espesor','Espesor'],['cantidad','Cantidad (x N)']].map(([campo, label]) => (
                  <div key={campo}>
                    <label style={{ fontSize:'11px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>{label}</label>
                    <input type='number' step='0.01' value={registros[modalRegistro][campo] || ''}
                      onChange={e => {
                        const a=[...registros]
                        a[modalRegistro]={...a[modalRegistro], [campo]: e.target.value}
                        const vals = ['longitud','ancho','espesor','cantidad']
                          .map(c => parseFloat(a[modalRegistro][c])).filter(v => !isNaN(v) && v !== 0)
                        a[modalRegistro].cantidad_total = vals.length ? vals.reduce((x,y)=>x*y,1) : null
                        setRegistros(a)
                      }}
                      placeholder='0'
                      style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', fontSize:'13px', background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none', boxSizing:'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:'11px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>Unidad</label>
                  <select value={registros[modalRegistro].unidad || ''}
                    onChange={e => { const a=[...registros]; a[modalRegistro]={...a[modalRegistro], unidad:e.target.value}; setRegistros(a) }}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', fontSize:'13px', background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none', boxSizing:'border-box' }}>
                    <option value=''>--</option>
                    {['m','m²','m³','ml','und','kg','ton','gl','vje','día','mes','Otro'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  {registros[modalRegistro].unidad === 'Otro' && (
                    <input value={registros[modalRegistro].unidadOtro || ''}
                      onChange={e => { const a=[...registros]; a[modalRegistro]={...a[modalRegistro], unidadOtro:e.target.value}; setRegistros(a) }}
                      placeholder="Especificar unidad..."
                      style={{ width:'100%', padding:'6px 10px', borderRadius:'6px', fontSize:'12px', background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none', marginTop:'4px' }} />
                  )}
                </div>
              </div>
              {/* Cantidad total */}
              <div style={{ padding:'10px 14px', background:t.bg, borderRadius:'8px', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'13px', color:t.textMuted, fontWeight:'600' }}>CANTIDAD TOTAL</span>
                <span style={{ fontSize:'16px', fontWeight:'800', color:'#10B981' }}>
                  {registros[modalRegistro].cantidad_total != null ? Number(registros[modalRegistro].cantidad_total).toFixed(4) : '—'}
                </span>
              </div>
              {/* Observación */}
              <div>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>OBSERVACIÓN *</label>
                <textarea value={registros[modalRegistro].observacion || ''}
                  onChange={e => { const a=[...registros]; a[modalRegistro]={...a[modalRegistro], observacion:e.target.value}; setRegistros(a) }}
                  rows={3} placeholder="Descripción detallada de la actividad..."
                  style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', fontSize:'13px', background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none', boxSizing:'border-box', resize:'vertical' }} />
              </div>
              {/* Foto obra - ancho completo */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted }}>
                    📸 FOTO OBRA * 
                    {registros[modalRegistro].foto_numero && (
                      <span style={{ color:t.primary, marginLeft:'8px' }}>#{String(registros[modalRegistro].foto_numero).padStart(4,'0')}</span>
                    )}
                  </label>
                </div>
                {registros[modalRegistro].foto_url && (
                  <img src={registros[modalRegistro].foto_url} style={{ width:'100%', borderRadius:'8px', marginBottom:'8px', maxHeight:'220px', objectFit:'cover' }} />
                )}
                <button onClick={() => setModalGaleria(true)} style={{
                  background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted,
                  borderRadius:'6px', padding:'5px 12px', fontSize:'11px', cursor:'pointer', marginBottom:'6px'
                }}>🖼️ Usar foto de galería</button>                
                <input type='file' accept='image/*' onChange={async e => {
                  const file = e.target.files[0]; if (!file) return
                  const fd = new FormData(); fd.append('file', file)
                  try {
                    const numR = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/next-foto`, { method:'POST', headers: hdrs }).then(x=>x.json())
                    fd.append('numero', numR.numero)
                    fd.append('descripcion', registros[modalRegistro].observacion || `Foto-${numR.numero}`)
                    const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/upload-foto`, { method:'POST', headers: hdrs, body: fd })
                    const data = await r.json()
                    const a=[...registros]; a[modalRegistro]={...a[modalRegistro], foto_url: data.url, foto_numero: numR.numero, _fotoOk: true}; setRegistros(a)
                  } catch(e) { alert('Error subiendo foto') }
                }} style={{ width:'100%', fontSize:'12px' }} />
                {!registros[modalRegistro]._fotoOk && (
                  <div style={{ color:'#F59E0B', fontSize:'11px', marginTop:'4px' }}>⚠️ La foto es obligatoria para guardar el registro</div>
                )}
                {registros[modalRegistro]._fotoOk && (
                  <div style={{ color:'#10B981', fontSize:'12px', marginTop:'4px' }}>✅ Foto #{String(registros[modalRegistro].foto_numero).padStart(4,'0')} cargada</div>
                )}
              </div>
            </div>
            {/* Footer */}
            <div style={{ padding:'14px 20px', borderTop:`1px solid ${t.border}`, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => {
                const reg = registros[modalRegistro]
                const dims = ['longitud','ancho','espesor','cantidad']
                  .map(c => parseFloat(reg[c])).filter(v => !isNaN(v) && v > 0)
                if (dims.length === 0) {
                  alert('Debe diligenciar al menos un campo de dimensiones (Longitud, Ancho, Espesor o Cantidad)')
                  return
                }
                const unidadFinal = reg.unidad === 'Otro' ? reg.unidadOtro : reg.unidad
                if (!unidadFinal || !unidadFinal.trim()) {
                  alert('La unidad es obligatoria')
                  return
                }
                if (!reg.observacion || !reg.observacion.trim()) {
                  alert('La observación es obligatoria')
                  return
                }
                if (!reg._fotoOk) {
                  alert('La foto de obra es obligatoria')
                  return
                }
                setModalRegistro(null)
              }} style={{
                background:t.primary, color:'#fff', border:'none', borderRadius:'8px',
                padding:'8px 24px', cursor:'pointer', fontWeight:'700', fontSize:'13px'
              }}>✅ Guardar Registro</button>
            </div>
          </div>
        </div>
      )}

{/* ── Modal Galería Fotos ── */}
      {modalGaleria && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:3000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'700px',
            maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:'700', color:t.text }}>🖼️ Galería de Fotos</div>
              <button onClick={() => setModalGaleria(false)} style={{
                background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            <div style={{ padding:'16px', borderBottom:`1px solid ${t.border}`, display:'flex', gap:'8px', alignItems:'center' }}>
              <label style={{ fontSize:'12px', color:t.textMuted }}>Desde:</label>
              <input type='date' onChange={e => setGaleriaFechaDesde(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:'6px', fontSize:'12px', background:t.bg, color:t.text, border:`1px solid ${t.border}` }} />
              <label style={{ fontSize:'12px', color:t.textMuted }}>Hasta:</label>
              <input type='date' onChange={e => setGaleriaFechaHasta(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:'6px', fontSize:'12px', background:t.bg, color:t.text, border:`1px solid ${t.border}` }} />
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
              <GaleriaFotos
                contrato_id={contrato_id} API_URL={API_URL} hdrs={hdrs}
                tipo="foto"
                fechaDesde={galeriaFechaDesde} fechaHasta={galeriaFechaHasta}
                onSelect={(url, numero) => {
                  const a=[...registros]
                  a[modalRegistro]={...a[modalRegistro], foto_url: url, foto_numero: numero, _fotoOk: true}
                  setRegistros(a)
                  setModalGaleria(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Galería Gráficos ── */}
      {modalGaleriaGrafico && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:3000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'700px',
            maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:'700', color:t.text }}>📐 Galería de Gráficos</div>
              <button onClick={() => setModalGaleriaGrafico(false)} style={{
                background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            <div style={{ padding:'16px', borderBottom:`1px solid ${t.border}`, display:'flex', gap:'8px', alignItems:'center' }}>
              <label style={{ fontSize:'12px', color:t.textMuted }}>Desde:</label>
              <input type='date' onChange={e => setGaleriaGraficoFechaDesde(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:'6px', fontSize:'12px', background:t.bg, color:t.text, border:`1px solid ${t.border}` }} />
              <label style={{ fontSize:'12px', color:t.textMuted }}>Hasta:</label>
              <input type='date' onChange={e => setGaleriaGraficoFechaHasta(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:'6px', fontSize:'12px', background:t.bg, color:t.text, border:`1px solid ${t.border}` }} />
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
              <GaleriaFotos
                contrato_id={contrato_id} API_URL={API_URL} hdrs={hdrs}
                tipo="grafico"
                fechaDesde={galeriaGraficoFechaDesde} fechaHasta={galeriaGraficoFechaHasta}
                onSelect={(url, numero) => {
                  setReporteGraficoUrl(url)
                  setReporteGraficoNumero(numero)
                  setModalGaleriaGrafico(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

{/* ── Modal Crear Plantilla ── */}
      {modalCrearPlantilla && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'560px',
            maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:'700', color:t.text }}>📄 Nueva Plantilla — {capituloSel}</div>
              <button onClick={() => setModalCrearPlantilla(false)} style={{
                background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
              <div>
                <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                  NOMBRE DE LA PLANTILLA *
                </label>
                <input value={nuevaPlantillaNombre} onChange={e => setNuevaPlantillaNombre(e.target.value)}
                  placeholder="Ej: Tubería alcantarillado..." style={{
                    width:'100%', padding:'8px 12px', borderRadius:'8px', fontSize:'13px',
                    background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none', boxSizing:'border-box'
                  }} />
              </div>
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted }}>ACTIVIDADES *</label>
                  <button onClick={() => setNuevaPlantillaItems(prev => [...prev, {nombre:'', descripcion:''}])}
                    style={{ background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted,
                      borderRadius:'6px', padding:'4px 10px', fontSize:'12px', cursor:'pointer' }}>+ Agregar</button>
                </div>
                {nuevaPlantillaItems.map((item, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 28px', gap:'8px', marginBottom:'8px' }}>
                    <input value={item.nombre}
                      onChange={e => { const a=[...nuevaPlantillaItems]; a[idx]={...a[idx],nombre:e.target.value}; setNuevaPlantillaItems(a) }}
                      placeholder="Nombre actividad..." style={{
                        padding:'7px 10px', borderRadius:'6px', fontSize:'12px',
                        background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none'
                      }} />
                    <input value={item.descripcion}
                      onChange={e => { const a=[...nuevaPlantillaItems]; a[idx]={...a[idx],descripcion:e.target.value}; setNuevaPlantillaItems(a) }}
                      placeholder="Descripción..." style={{
                        padding:'7px 10px', borderRadius:'6px', fontSize:'12px',
                        background:t.bg, color:t.text, border:`1px solid ${t.border}`, outline:'none'
                      }} />
                    <button onClick={() => setNuevaPlantillaItems(prev => prev.filter((_,i) => i!==idx))}
                      style={{ background:'transparent', border:'none', color:'#EF4444', cursor:'pointer', fontSize:'16px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding:'16px 20px', borderTop:`1px solid ${t.border}`, display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button onClick={() => setModalCrearPlantilla(false)} style={{
                background:'transparent', border:`1px solid ${t.border}`, color:t.textMuted,
                borderRadius:'8px', padding:'8px 20px', cursor:'pointer', fontSize:'13px' }}>Cancelar</button>
              <button onClick={async () => {
                if (!nuevaPlantillaNombre.trim()) { alert('Nombre requerido'); return }
                const items = nuevaPlantillaItems.filter(i => i.nombre.trim())
                if (items.length === 0) { alert('Agrega al menos una actividad'); return }
                try {
                  const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/plantillas`, {
                    method:'POST', headers:{...hdrs,'Content-Type':'application/json'},
                    body: JSON.stringify({ nombre: nuevaPlantillaNombre, capitulo: capituloSel, items })
                  })
                  if (r.ok) {
                    const nueva = await r.json()
                    setPlantillas(prev => [...prev, {...nueva, items}])
                    setNuevaPlantillaNombre('')
                    setNuevaPlantillaItems([{nombre:'', descripcion:''}])
                    setModalCrearPlantilla(false)
                  }
                } catch(e) { alert('Error guardando plantilla') }
              }} style={{
                background:t.primary, color:'#fff', border:'none', borderRadius:'8px',
                padding:'8px 20px', cursor:'pointer', fontWeight:'700', fontSize:'13px'
              }}>Guardar Plantilla</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Mapa PK_ID (solo si el contrato tiene GeoJSON de plano) ── */}
      {modalMapaPk && tienePlanoMapa && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'700px',
            height:'500px', display:'flex', flexDirection:'column', overflow:'visible' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:'700', color:t.text }}>🗺️ Seleccionar PK_ID en el mapa</div>
              <div style={{ fontSize:'12px', color:t.textMuted }}>Haz click en un polígono para seleccionarlo</div>
              <button
                type="button"
                onClick={() => setModalMapaPk(false)}
                style={{ background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex:1, position:'relative', minHeight:0 }}>
              <div ref={mapaPkContainerRef} style={{ width:'100%', height:'100%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MÓDULO PLANO SEMÁFORO ────────────────────────────────────────────────────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
function ModuloPlanoSemaforo({ t, usuario, token }) {
  const API = API_BASE
  const contratoId = usuario?.contrato_id
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [colores, setColores] = useState({})
  const [loading, setLoading] = useState(true)
  const [seleccionado, setSeleccionado] = useState(null)

  const getColor = (pct, sobrecosto) => {
    if (sobrecosto) return '#DC2626'
    if (pct >= 100) return '#DC2626'
    if (pct >= 90)  return '#EF4444'
    if (pct >= 70)  return '#F59E0B'
    return '#10B981'
  }

  useEffect(() => {
    if (!contratoId || !token) return
    fetch(`${API}/cobro/${contratoId}/pkid-colores`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : {}).then(data => {
      setColores(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [contratoId])

  useEffect(() => {
    if (loading) return
    if (!mapRef.current || mapInstance.current) return

    // mapboxgl viene del import

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-74.05, 4.72],
      zoom: 12,
      bearing: 270,
    })
    mapInstance.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      fetch('/pOLIGONOS_1551t_Project_Feat.json')
        .then(r => r.json())
        .then(geojson => {
          // Enriquecer GeoJSON con colores
          const enriched = {
            ...geojson,
            features: geojson.features
              .filter(f => f.properties.Layer !== 'dibujo externo')
              .map(f => {
                const pkid = String(f.properties.Layer).trim()
                const data = colores[pkid] || {}
                const pct = data.pct || 0
                const sobrecosto = data.sobrecosto || false
                return {
                  ...f,
                  properties: {
                    ...f.properties,
                    pk_id: pkid,
                    pct,
                    cobrado: data.cobrado || 0,
                    presupuesto: data.presupuesto || 0,
                    sobrecosto,
                    color: getColor(pct, sobrecosto)
                  }
                }
              })
          }

          map.addSource('poligonos', { type: 'geojson', data: enriched })

          map.addLayer({
            id: 'poligonos-fill',
            type: 'fill',
            source: 'poligonos',
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.75
            }
          })

          map.addLayer({
            id: 'poligonos-outline',
            type: 'line',
            source: 'poligonos',
            paint: {
              'line-color': '#ffffff',
              'line-width': 1,
              'line-opacity': 0.4
            }
          })

          // Hover
          map.on('mouseenter', 'poligonos-fill', () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'poligonos-fill', () => { map.getCanvas().style.cursor = '' })

          // Click
          map.on('click', 'poligonos-fill', (e) => {
            const props = e.features[0].properties
            setSeleccionado(props)
          })

          // Fit bounds al GeoJSON
          const coords = enriched.features.flatMap(f => {
            const geom = f.geometry
            if (geom.type === 'Polygon') return geom.coordinates[0]
            if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2)
            return []
          })
          if (coords.length > 0) {
            const lngs = coords.map(c => c[0])
            const lats = coords.map(c => c[1])
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 40, bearing: 270, pitch: 0 }
            )
          }
        })
    })

    return () => { map.remove(); mapInstance.current = null }
  }, [loading])

  const fmt = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'

  return (
    <div style={{ position:'relative', height:'calc(100vh - 140px)', borderRadius:'12px', overflow:'hidden', border:`1px solid ${t.border}` }}>

      {/* Mapa */}
      <div ref={mapRef} style={{ width:'100%', height:'100%' }} />

      {/* Loading */}
      {loading && (
        <div style={{ position:'absolute',top:0,left:0,right:0,bottom:0,background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',color:t.textMuted }}>
          ⏳ Cargando plano...
        </div>
      )}

      {/* Leyenda */}
      <div style={{ position:'absolute',bottom:'24px',left:'16px',background:t.bgCard+'EE',border:`1px solid ${t.border}`,borderRadius:'10px',padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize:'10px',fontWeight:'700',color:t.textMuted,marginBottom:'8px',letterSpacing:'0.5px' }}>AVANCE COBRO</div>
        {[['#10B981','< 70%'],['#F59E0B','70% – 90%'],['#EF4444','90% – 100%'],['#DC2626','> 100% Sobrecosto']].map(([c,l]) => (
          <div key={l} style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px' }}>
            <div style={{ width:'14px',height:'14px',borderRadius:'3px',background:c,flexShrink:0 }}/>
            <span style={{ fontSize:'11px',color:t.text }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Panel detalle al hacer click */}
      {seleccionado && (
        <div style={{ position:'absolute',top:'16px',right:'60px',background:t.bgCard+'EE',border:`1px solid ${t.border}`,borderRadius:'10px',padding:'14px 16px',boxShadow:'0 4px 16px rgba(0,0,0,0.3)',minWidth:'220px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px' }}>
            <div style={{ fontSize:'13px',fontWeight:'700',color:t.primary }}>PK_ID: {seleccionado.pk_id}</div>
            <button onClick={() => setSeleccionado(null)} style={{ background:'transparent',border:'none',cursor:'pointer',color:t.textMuted,fontSize:'16px' }}>✕</button>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
            {[
              ['% Cobro',      `${seleccionado.pct}%`],
              ['Cobrado',      fmt(seleccionado.cobrado)],
              ['Presupuesto',  fmt(seleccionado.presupuesto)],
              ['Estado',       seleccionado.sobrecosto ? '🔴 Sobrecosto' : seleccionado.pct >= 90 ? '🟡 Crítico' : seleccionado.pct >= 70 ? '🟠 Alerta' : '🟢 Normal'],
            ].map(([label, val]) => (
              <div key={label} style={{ display:'flex',justifyContent:'space-between',gap:'12px' }}>
                <span style={{ fontSize:'11px',color:t.textMuted }}>{label}</span>
                <span style={{ fontSize:'11px',fontWeight:'700',color:t.text }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:'10px',padding:'4px 0',borderTop:`1px solid ${t.border}`,fontSize:'10px',color:t.textMuted,textAlign:'center' }}>
            Click en otro polígono para ver su detalle
          </div>
        </div>
      )}
    </div>
  )
}
// ─── MINI MAPA SEMÁFORO (dashboard) ──────────────────────────────────────────
function MiniMapaSemaforo({ t, colores, height = 220, onPkidClick = null, bearing = 270 }) {
  const mapRef        = useRef(null)
  const mapInstance   = useRef(null)
  const onClickRef    = useRef(onPkidClick)
  const [listo, setListo] = useState(false)
  const [modo, setModo]   = useState('ambos')

  // Mantener ref actualizada sin re-inicializar el mapa
  useEffect(() => { onClickRef.current = onPkidClick }, [onPkidClick])

  const getColorCobro = (pct) => {
    if (pct >= 100) return '#DC2626'
    if (pct >= 90)  return '#EF4444'
    if (pct >= 70)  return '#F59E0B'
    return '#10B981'
  }

  const buildFeatures = (geojson) =>
    geojson.features
      .filter(f => f.properties.Layer !== 'dibujo externo')
      .map(f => {
        const pkid = String(f.properties.Layer).trim()
        const d    = colores[pkid] || {}
        return {
          ...f,
          properties: {
            ...f.properties,
            pk_id:       pkid,
            pct:         d.pct || 0,
            tiene_cobro: d.cobrado > 0 ? 1 : 0,
            tiene_ppto:  d.presupuesto > 0 ? 1 : 0,
            color_cobro: d.cobrado != null ? getColorCobro(d.pct || 0) : '#334155',
            color_ppto:  d.presupuesto > 0 ? '#0077B6' : '#334155',
          }
        }
      })

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-74.05, 4.72], zoom: 11, interactive: true, bearing,
    })
    mapInstance.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.on('load', () => {
      fetch('/pOLIGONOS_1551t_Project_Feat.json')
        .then(r => r.json())
        .then(geojson => {
          const features = buildFeatures(geojson)
          const data = { ...geojson, features }
          map.addSource('mini-pols', { type: 'geojson', data })
          map.addLayer({ id: 'mini-fill-ppto', type: 'fill', source: 'mini-pols',
            paint: { 'fill-color': ['get', 'color_ppto'], 'fill-opacity': ['case', ['==', ['get', 'tiene_ppto'], 1], 0.7, 0.1] }
          })
          map.addLayer({ id: 'mini-fill-cobro', type: 'fill', source: 'mini-pols',
            paint: { 'fill-color': ['get', 'color_cobro'], 'fill-opacity': ['case', ['==', ['get', 'tiene_cobro'], 1], 0.7, 0.1] }
          })
          map.addLayer({ id: 'mini-labels', type: 'symbol', source: 'mini-pols',
            layout: {
              'text-field': ['get', 'pk_id'],
              'text-size': 9,
              'text-anchor': 'center',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
            },
            paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1 }
          })
          // Click handlers
          map.on('click', 'mini-fill-cobro', (e) => {
            const pkid = e.features[0]?.properties?.pk_id
            if (pkid && onClickRef.current) onClickRef.current(pkid)
          })
          map.on('click', 'mini-fill-ppto', (e) => {
            const pkid = e.features[0]?.properties?.pk_id
            if (pkid && onClickRef.current) onClickRef.current(pkid)
          })
          map.on('mouseenter', 'mini-fill-cobro', () => { if (onClickRef.current) map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'mini-fill-cobro', () => { map.getCanvas().style.cursor = '' })
          map.on('mouseenter', 'mini-fill-ppto',  () => { if (onClickRef.current) map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'mini-fill-ppto',  () => { map.getCanvas().style.cursor = '' })
          const coords = features.flatMap(f => {
            const g = f.geometry
            if (g.type === 'Polygon') return g.coordinates[0]
            if (g.type === 'MultiPolygon') return g.coordinates.flat(2)
            return []
          })
          if (coords.length > 0) {
            const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
            map.fitBounds([[Math.min(...lngs), Math.min(...lats)],[Math.max(...lngs), Math.max(...lats)]], { padding: 20, duration: 0, bearing, pitch: 0 })
          }
          setListo(true)
        })
    })
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; setListo(false) } }
  }, [bearing])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !listo) return
    const src = map.getSource('mini-pols')
    if (src) {
      const raw = src._data
      if (raw && raw.features) src.setData({ ...raw, features: buildFeatures(raw) })
    }
    if (map.getLayer('mini-fill-ppto') && map.getLayer('mini-fill-cobro')) {
      if (modo === 'presupuesto') {
        map.setPaintProperty('mini-fill-ppto', 'fill-opacity', ['case', ['==', ['get', 'tiene_ppto'], 1], 0.85, 0.08])
        map.setPaintProperty('mini-fill-cobro', 'fill-opacity', 0)
      } else if (modo === 'cobro') {
        map.setPaintProperty('mini-fill-ppto', 'fill-opacity', 0)
        map.setPaintProperty('mini-fill-cobro', 'fill-opacity', ['case', ['==', ['get', 'tiene_cobro'], 1], 0.85, 0.08])
      } else {
        map.setPaintProperty('mini-fill-ppto', 'fill-opacity', ['case', ['==', ['get', 'tiene_ppto'], 1], 0.45, 0.05])
        map.setPaintProperty('mini-fill-cobro', 'fill-opacity', ['case', ['==', ['get', 'tiene_cobro'], 1], 0.55, 0.05])
      }
    }
  }, [colores, listo, modo])

  const btnModo = (key, label, color) => (
    <button key={key} onClick={() => setModo(key)} style={{
      background: modo === key ? color : 'transparent',
      color: modo === key ? '#fff' : t.textMuted,
      border: `1.5px solid ${modo === key ? color : t.border}`,
      borderRadius: '20px', padding: '2px 10px', fontSize: '10px',
      fontWeight: modo === key ? '700' : '400', cursor: 'pointer',
      transition: 'all 0.15s'
    }}>{label}</button>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
        {btnModo('presupuesto', '📋 Presupuesto', '#0077B6')}
        {btnModo('cobro',       '💰 Cobro',       '#00A896')}
        {btnModo('ambos',       '⚡ Ambos',        '#7C3AED')}
      </div>
      <div style={{ position:'relative', width:'100%', height:`${height}px`, borderRadius:'8px', overflow:'hidden' }}>
        <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
        {!listo && (
          <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:t.textMuted }}>
            ⏳ Cargando mapa...
          </div>
        )}
        {onClickRef.current && (
          <div style={{ position:'absolute', top:'8px', left:'8px', background:t.bgCard+'DD', borderRadius:'6px', padding:'4px 8px', fontSize:'9px', color:t.primary, fontWeight:'700' }}>
            👆 Click en polígono para ver detalle
          </div>
        )}
        <div style={{ position:'absolute', bottom:'8px', left:'8px', background:t.bgCard+'DD', borderRadius:'6px', padding:'5px 8px', fontSize:'9px', display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {modo !== 'presupuesto' && [['#10B981','<70%'],['#F59E0B','70-90%'],['#EF4444','90-100%'],['#DC2626','>100%']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:'3px', color:t.textMuted }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:c }}/>{l}
            </div>
          ))}
          {modo !== 'cobro' && (
            <div style={{ display:'flex', alignItems:'center', gap:'3px', color:t.textMuted }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:'#0077B6' }}/>Ppto
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── BUZÓN DE NOTIFICACIONES ──────────────────────────────────────────────────
function BuzonNotificaciones({ t, usuario, token, onNavegar }) {
  const API = API_BASE
  const contratoCtx = usuario?.contrato_id
  const qContrato = contratoCtx != null && contratoCtx !== '' ? `?contrato_id=${contratoCtx}` : ''
  const [abierto,       setAbierto]       = useState(false)
  const [tab,           setTab]           = useState('recibidos')
  const [recibidos,     setRecibidos]     = useState([])
  const [enviados,      setEnviados]      = useState([])
  const [noLeidas,      setNoLeidas]      = useState(0)
  const [hiloActivo,    setHiloActivo]    = useState(null)
  const [hilo,          setHilo]          = useState([])
  const [hiloLoading,   setHiloLoading]   = useState(false)
  const [mostrarNuevo,  setMostrarNuevo]  = useState(false)
  const [destinatarios, setDestinatarios] = useState([])
  const [nuevo, setNuevo] = useState({ destinatario_id: '', asunto: '', mensaje: '', tipo: 'MENSAJE_DIRECTO' })
  const [enviando, setEnviando] = useState(false)
  const [respondiendo, setRespondiendo] = useState(false)
  const [respuesta,    setRespuesta]    = useState('')

  const esDev = usuario?.cargo_nombre?.trim().toLowerCase() === 'desarrollador'
  const h = { Authorization: `Bearer ${token}` }

  const cargarCount = async () => {
    const r = await fetch(`${API}/notificaciones/no-leidas-count${qContrato}`, { headers: h }).catch(() => null)
    if (r?.ok) { const d = await r.json(); setNoLeidas(d.count || 0) }
  }

  const cargarRecibidos = async () => {
    const r = await fetch(`${API}/notificaciones/recibidas${qContrato}`, { headers: h }).catch(() => null)
    if (r?.ok) setRecibidos(await r.json())
  }

  const cargarEnviados = async () => {
    const r = await fetch(`${API}/notificaciones/enviadas${qContrato}`, { headers: h }).catch(() => null)
    if (r?.ok) setEnviados(await r.json())
  }

  const cargarDestinatarios = async () => {
    const r = await fetch(`${API}/notificaciones/usuarios-destinatarios`, { headers: h }).catch(() => null)
    if (r?.ok) {
      const data = await r.json()
      const ordenados = (Array.isArray(data) ? data : []).slice().sort((a, b) => {
        const na = `${a?.nombre || ''}`.trim()
        const nb = `${b?.nombre || ''}`.trim()
        return na.localeCompare(nb, 'es', { sensitivity: 'base' })
      })
      setDestinatarios(ordenados)
    }
  }

  useEffect(() => {
    cargarCount()
    const iv = setInterval(cargarCount, 60000)
    return () => clearInterval(iv)
  }, [contratoCtx])

  useEffect(() => {
    if (!abierto) return
    cargarRecibidos(); cargarEnviados(); cargarDestinatarios()
  }, [abierto, contratoCtx])

  async function abrirHilo(notif) {
    setHiloActivo(notif); setHiloLoading(true); setHilo([])
    const r = await fetch(`${API}/notificaciones/${notif.id}/hilo`, { headers: h }).catch(() => null)
    if (r?.ok) { const d = await r.json(); setHilo(d.hilo || []) }
    setHiloLoading(false)
    cargarCount(); cargarRecibidos()
  }

  async function enviarNuevo() {
    if (!nuevo.asunto || !nuevo.mensaje) return
    setEnviando(true)
    const body = {
      ...nuevo,
      destinatario_id: nuevo.tipo === 'BROADCAST' ? null : parseInt(nuevo.destinatario_id) || null,
      contrato_id: contratoCtx != null && contratoCtx !== '' ? parseInt(contratoCtx, 10) : null,
    }
    await fetch(`${API}/notificaciones`, { method:'POST', headers:{...h,'Content-Type':'application/json'}, body: JSON.stringify(body) })
    setNuevo({ destinatario_id:'', asunto:'', mensaje:'', tipo:'MENSAJE_DIRECTO' })
    setMostrarNuevo(false); setEnviando(false)
    cargarEnviados()
  }

  async function responder() {
    if (!respuesta.trim() || !hiloActivo || respondiendo) return
    setRespondiendo(true)
    const padre = hilo[0]
    await fetch(`${API}/notificaciones`, {
      method:'POST', headers:{...h,'Content-Type':'application/json'},
      body: JSON.stringify({
        destinatario_id: padre.remitente_id === usuario.id ? padre.destinatario_id : padre.remitente_id,
        asunto: `Re: ${padre.asunto}`,
        mensaje: respuesta.trim(),
        tipo: 'MENSAJE_DIRECTO',
        padre_id: padre.id,
        modulo: padre.modulo,
        contrato_id: padre.contrato_id,
        entidad_tipo: padre.entidad_tipo,
        entidad_id: padre.entidad_id,
      })
    })
    setRespuesta('')
    setRespondiendo(false)
    abrirHilo(hiloActivo)
    cargarEnviados()
  }

  const fmtFecha = iso => { try { return new Date(iso).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) } catch { return iso } }
  const TIPO_COLOR = { MENSAJE_DIRECTO:'#0077B6', BROADCAST:'#7C3AED', SISTEMA:'#10B981', SOPORTE:'#F59E0B' }
  const TIPO_LABEL = { MENSAJE_DIRECTO:'Mensaje', BROADCAST:'Broadcast', SISTEMA:'Sistema', SOPORTE:'Soporte' }

  const btnTab = (key, label) => (
    <button key={key} onClick={() => setTab(key)} style={{
      background: tab===key ? t.primary : 'transparent',
      color: tab===key ? '#fff' : t.textMuted,
      border: `1px solid ${tab===key ? t.primary : t.border}`,
      borderRadius:'20px', padding:'4px 14px', fontSize:'12px',
      fontWeight: tab===key ? '700' : '400', cursor:'pointer'
    }}>{label}</button>
  )

  const ItemNotif = ({ n, esRecibido }) => {
    const noLeida = esRecibido && !n.leido
    return (
      <div onClick={() => abrirHilo(n)}
        style={{ padding:'10px 14px', borderRadius:'8px', cursor:'pointer', marginBottom:'6px',
          background: noLeida ? t.primary+'11' : t.bg,
          border: `1px solid ${noLeida ? t.primary+'44' : t.border}`,
          transition:'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = t.primary+'18'}
        onMouseLeave={e => e.currentTarget.style.background = noLeida ? t.primary+'11' : t.bg}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'4px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            {noLeida && <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:t.primary, flexShrink:0 }}/>}
            <span style={{ fontSize:'12px', fontWeight:'700', color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'220px' }}>{n.asunto}</span>
          </div>
          <span style={{ fontSize:'10px', color:t.textMuted, flexShrink:0, marginLeft:'8px' }}>{fmtFecha(n.created_at)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'11px', color:t.textMuted }}>
            {esRecibido ? `De: ${n.remitente_nombre}` : `Para: ${destinatarios.find(d=>d.id===n.destinatario_id)?.nombre || (n.destinatario_id ? `#${n.destinatario_id}` : 'Todos')}`}
          </span>
          <span style={{ fontSize:'10px', background: TIPO_COLOR[n.tipo]+'22', color: TIPO_COLOR[n.tipo], border:`1px solid ${TIPO_COLOR[n.tipo]}44`, borderRadius:'20px', padding:'1px 8px' }}>
            {TIPO_LABEL[n.tipo]}
          </span>
        </div>
        {n.mensaje && <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.mensaje}</div>}
      </div>
    )
  }

  return (
    <>
      {/* Campana */}
      <div style={{ position:'relative' }}>
        <button onClick={() => setAbierto(o => !o)} style={{
          background: abierto ? t.primary+'22' : 'transparent',
          border: `1px solid ${abierto ? t.primary : t.border}`,
          borderRadius:'8px', padding:'6px 12px', cursor:'pointer',
          color: abierto ? t.primary : t.textMuted, fontSize:'18px', lineHeight:1,
          display:'flex', alignItems:'center', gap:'4px'
        }}>
          🔔
          {noLeidas > 0 && (
            <span style={{ background:'#EF4444', color:'#fff', borderRadius:'20px', fontSize:'10px', fontWeight:'700', padding:'1px 6px', minWidth:'16px', textAlign:'center' }}>
              {noLeidas > 99 ? '99+' : noLeidas}
            </span>
          )}
        </button>
      </div>

      {/* Panel buzón */}
      {abierto && (
        <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'400px', background:t.bgCard, borderLeft:`1px solid ${t.border}`, zIndex:9998, display:'flex', flexDirection:'column', boxShadow:'-4px 0 24px rgba(0,0,0,0.2)' }}>
          {/* Header del buzón */}
          <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:'15px', fontWeight:'700', color:t.text }}>🔔 Notificaciones</div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => setMostrarNuevo(true)} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'5px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                ✉️ Nuevo
              </button>
              <button onClick={() => setAbierto(false)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.border}`, display:'flex', gap:'8px' }}>
            {btnTab('recibidos', `📥 Recibidos${noLeidas > 0 ? ` (${noLeidas})` : ''}`)}
            {btnTab('enviados', '📤 Enviados')}
          </div>

          {/* Lista */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
            {tab === 'recibidos' && (
              recibidos.length === 0
                ? <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin notificaciones</div>
                : recibidos.map(n => <ItemNotif key={n.id} n={n} esRecibido={true} />)
            )}
            {tab === 'enviados' && (
              enviados.length === 0
                ? <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin mensajes enviados</div>
                : enviados.map(n => <ItemNotif key={n.id} n={n} esRecibido={false} />)
            )}
          </div>

          {/* Soporte al desarrollador */}
          {!esDev && (
            <div style={{ padding:'12px 16px', borderTop:`1px solid ${t.border}` }}>
              <button onClick={() => { setNuevo({ destinatario_id:'', asunto:'', mensaje:'', tipo:'SOPORTE' }); setMostrarNuevo(true) }}
                style={{ width:'100%', background:'#F59E0B22', border:'1px solid #F59E0B66', borderRadius:'8px', padding:'8px', color:'#F59E0B', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                🐛 Reportar bug / Solicitar al Desarrollador
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal hilo */}
      {hiloActivo && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setHiloActivo(null)}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'540px', maxWidth:'95vw', maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
              <div>
                <div style={{ fontSize:'15px', fontWeight:'700', color:t.text }}>{hilo[0]?.asunto}</div>
                <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>
                  {hilo.length} mensaje{hilo.length !== 1 ? 's' : ''} en este hilo
                </div>
              </div>
              <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                {hilo[0]?.modulo && (
                  <button onClick={() => { onNavegar(hilo[0]); setHiloActivo(null); setAbierto(false) }}
                    style={{ background:t.primary+'22', border:`1px solid ${t.primary}44`, borderRadius:'8px', padding:'5px 12px', color:t.primary, fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                    🔍 Rastrear registro
                  </button>
                )}
                <button onClick={() => setHiloActivo(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'10px', marginBottom:'14px' }}>
              {hiloLoading ? (
                <div style={{ textAlign:'center', padding:'30px', color:t.textMuted }}>⏳ Cargando...</div>
              ) : hilo.map((m, i) => {
                const esMio = m.remitente_id === usuario?.id
                const color = TIPO_COLOR[m.tipo] || t.primary
                return (
                  <div key={m.id} style={{ background: esMio ? t.primary+'11' : t.bg, border:`1px solid ${esMio ? t.primary+'33' : t.border}`, borderRadius:'10px', padding:'12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                      <span style={{ fontSize:'12px', fontWeight:'700', color: esMio ? t.primary : t.text }}>{esMio ? 'Tú' : m.remitente_nombre}</span>
                      <span style={{ fontSize:'10px', color:t.textMuted }}>{fmtFecha(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize:'13px', color:t.text, lineHeight:1.6 }}>{m.mensaje}</div>
                  </div>
                )
              })}
            </div>
            {/* Responder */}
            <div style={{ borderTop:`1px solid ${t.border}`, paddingTop:'12px' }}>
              <div style={{ position:'relative' }}>
                <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)}
                  placeholder="Escribe tu respuesta..."
                  style={{ width:'100%', minHeight:'72px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 10px', color:t.text, fontSize:'13px', resize:'vertical', boxSizing:'border-box' }} />
                <div style={{ position:'absolute', bottom:'8px', right:'8px' }}>
                  <EmojiPicker t={t} onSelect={em => setRespuesta(prev => prev + em)} />
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'8px' }}>
                <button onClick={responder} disabled={!respuesta.trim()}
                  style={{ background: respuesta.trim() && !respondiendo ? t.primary : t.border, color: respuesta.trim() && !respondiendo ? '#fff' : t.textMuted, border:'none', borderRadius:'8px', padding:'8px 20px', fontSize:'13px', fontWeight:'700', cursor: respuesta.trim() && !respondiendo ? 'pointer' : 'not-allowed', opacity: respondiendo ? 0.7 : 1 }}>
                  {respondiendo ? 'Enviando...' : '↩ Responder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo mensaje */}
      {mostrarNuevo && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setMostrarNuevo(false)}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'28px', width:'480px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div style={{ fontSize:'15px', fontWeight:'700', color:t.text }}>✉️ Nuevo Mensaje</div>
              <button onClick={() => setMostrarNuevo(false)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            {esDev && (
              <div style={{ marginBottom:'14px' }}>
                <label style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', display:'block', marginBottom:'6px' }}>TIPO</label>
                <select value={nuevo.tipo} onChange={e => setNuevo({...nuevo, tipo: e.target.value, destinatario_id: e.target.value === 'BROADCAST' ? '' : nuevo.destinatario_id})}
                  style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'13px' }}>
                  <option value="MENSAJE_DIRECTO">💬 Mensaje Directo</option>
                  <option value="BROADCAST">📢 Broadcast — Todos los usuarios</option>
                </select>
              </div>
            )}
            {nuevo.tipo !== 'BROADCAST' && (
              <div style={{ marginBottom:'14px' }}>
                <label style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', display:'block', marginBottom:'6px' }}>PARA</label>
                <select value={nuevo.destinatario_id} onChange={e => setNuevo({...nuevo, destinatario_id: e.target.value})}
                  style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'13px' }}>
                  <option value="">— Selecciona destinatario —</option>
                  {nuevo.tipo === 'SOPORTE'
                    ? destinatarios.filter(d => d.cargo?.toLowerCase() === 'desarrollador').map(d => <option key={d.id} value={d.id}>{d.nombre} · {d.cargo}</option>)
                    : destinatarios.map(d => <option key={d.id} value={d.id}>{d.nombre} · {d.cargo}</option>)
                  }
                </select>
              </div>
            )}
            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', display:'block', marginBottom:'6px' }}>ASUNTO</label>
              <input value={nuevo.asunto} onChange={e => setNuevo({...nuevo, asunto: e.target.value})}
                placeholder="Asunto del mensaje..."
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', display:'block', marginBottom:'6px' }}>MENSAJE</label>
              <div style={{ position:'relative' }}>
                <textarea value={nuevo.mensaje} onChange={e => setNuevo({...nuevo, mensaje: e.target.value})}
                  placeholder="Escribe tu mensaje..."
                  style={{ width:'100%', minHeight:'100px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'13px', resize:'vertical', boxSizing:'border-box' }} />
                <div style={{ position:'absolute', bottom:'8px', right:'8px' }}>
                  <EmojiPicker t={t} onSelect={em => setNuevo(n => ({...n, mensaje: n.mensaje + em}))} />
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => setMostrarNuevo(false)} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 18px', fontSize:'13px', color:t.textMuted, cursor:'pointer' }}>Cancelar</button>
              <button onClick={enviarNuevo} disabled={enviando || !nuevo.asunto || !nuevo.mensaje || (nuevo.tipo !== 'BROADCAST' && !nuevo.destinatario_id)}
                style={{ background: t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'8px 22px', fontSize:'13px', fontWeight:'700', cursor:'pointer', opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Enviando...' : '📨 Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Ordena filas comparativo por prefijo numérico del capítulo (1, 2, … 10, 11), no alfabético. */
function sortComparativoCapitulos(rows) {
  if (!Array.isArray(rows)) return []
  const parseNum = (s) => {
    const m = String(s || '').trim().match(/^(\d+)/)
    return m ? parseInt(m[1], 10) : 999999
  }
  return [...rows].sort((a, b) => {
    const na = parseNum(a.capitulo)
    const nb = parseNum(b.capitulo)
    if (na !== nb) return na - nb
    return String(a.capitulo || '').localeCompare(String(b.capitulo || ''), undefined, { numeric: true, sensitivity: 'base' })
  })
}

/** Tipografía del tab Resumen (alineada al botón A pequeño / mediano / grande del header). */
const DASH_UI = {
  pequena: {
    title: 12, sub: 10, body: 10, table: 9, rowLabel: 9, legend: 10, chartLabel: 9, chartAxis: 8, chartTip: 9, barH: 8, rowGap: 5, padLabelW: 128,
    kpiLabel: 9, kpiValue: 17, kpiSub: 9, tab: 12,
  },
  normal: {
    title: 13, sub: 11, body: 11, table: 10, rowLabel: 10, legend: 11, chartLabel: 10, chartAxis: 9, chartTip: 10, barH: 9, rowGap: 6, padLabelW: 168,
    kpiLabel: 10, kpiValue: 18, kpiSub: 10, tab: 13,
  },
  grande: {
    title: 15, sub: 13, body: 13, table: 12, rowLabel: 11, legend: 12, chartLabel: 12, chartAxis: 10, chartTip: 11, barH: 11, rowGap: 7, padLabelW: 215,
    kpiLabel: 11, kpiValue: 20, kpiSub: 12, tab: 14,
  },
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ t, activeTheme, themeMode, onTheme, usuario, setUsuario, onLogout, topOffset = 0, fontSize = 'normal', onFontSize, onOpenPerfil }) {
  const [moduloActivo, setModuloActivo] = useState('inicio')
  const [dashCarpetaReporte, setDashCarpetaReporte] = useState(null)
  const [dashRegistroNumero, setDashRegistroNumero] = useState(null)
  const [dashDetallePpto, setDashDetallePpto] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [tabInferior, setTabInferior] = useState('gantt')
  const [analisis, setAnalisis] = useState('financiero')
  const [dashTab, setDashTab] = useState('resumen')
  const [analisisNivel, setAnalisisNivel] = useState('capitulo')
  const [analisisDir, setAnalisisDir] = useState('todos')
  const [analisisRangoMin, setAnalisisRangoMin] = useState('')
  const [analisisRangoMax, setAnalisisRangoMax] = useState('')
  const [analisisData, setAnalisisData] = useState(null)
  const [analisisLoading, setAnalisisLoading] = useState(false)
  const [analisisSortCol, setAnalisisSortCol] = useState('delta_costo')
  const [analisisSortDir, setAnalisisSortDir] = useState('desc')
  const [analisisPag, setAnalisisPag] = useState(0)
  const [analisisSeleccion, setAnalisisSeleccion] = useState(null)   // {capitulo, item} | null
  const [analisisMapaColores, setAnalisisMapaColores] = useState({})
  const [analisisMapaPopup, setAnalisisMapaPopup] = useState(null)
  const [analisisMapaPopupLoading, setAnalisisMapaPopupLoading] = useState(false)
  // ── Liquidación ──
  const [liqData,          setLiqData]          = useState(null)
  const [liqLoading,       setLiqLoading]       = useState(true)
  const [liqNivel,         setLiqNivel]         = useState('item')
  const [liqDir,           setLiqDir]           = useState('todos')
  const [liqSortCol,       setLiqSortCol]       = useState('delta_costo')
  const [liqSortDir,       setLiqSortDir]       = useState('desc')
  const [liqPag,           setLiqPag]           = useState(0)
  const [liqSeleccion,     setLiqSeleccion]     = useState(null)
  const [liqMapaColores,   setLiqMapaColores]   = useState({})
  const [liqMapaPopup,     setLiqMapaPopup]     = useState(null)
  const [liqMapaPopupLoad, setLiqMapaPopupLoad] = useState(false)
  const [showModalContrato, setShowModalContrato] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [nuevoContrato, setNuevoContrato] = useState({ numero: '', objeto: '', contratista: '', nit: '' })
  const [csvData, setCsvData] = useState(null)
  const [csvNombre, setCsvNombre] = useState('')
  const [savingContrato, setSavingContrato] = useState(false)
  const [errorContrato, setErrorContrato] = useState('')
  const [kpiPpto,    setKpiPpto]    = useState(null)
  const [kpiCobro,   setKpiCobro]   = useState(null)
  const [dashDrill,    setDashDrill]    = useState([])
  const [dashData,     setDashData]     = useState(null)
  const [dashLoading,  setDashLoading]  = useState(false)
  const [dashTabla,    setDashTabla]    = useState(null)
  const [dashTablaLoad,setDashTablaLoad]= useState(false)
  const [dashDrillPag, setDashDrillPag] = useState(0)
  const [panelFoco, setPanelFoco] = useState(null)
  const [matrizValidacion, setMatrizValidacion] = useState(null)
  /** true al inicio para evitar un destello "Sin acta" antes del primer fetch */
  const [matrizValidacionLoad, setMatrizValidacionLoad] = useState(true)
  /** vigente = servidor usa acta del período actual; all = todo el contrato; número = acta explícita */
  const [actaFiltroMatriz, setActaFiltroMatriz] = useState('vigente')
  /** Actas del contrato (misma fuente que módulo actas): RPO + nombre asignado para el dropdown de la matriz */
  const [actasListaMatriz, setActasListaMatriz] = useState([])
  const dashDrillCache = useRef({})   // caché ítems: { 'capitulo': { data, ts } }
  const dashTablaCache = useRef({})   // caché tabla: { 'cap|item': { data, ts } }
  const CACHE_TTL = 5 * 60 * 1000    // 5 minutos en ms
  const [popupCapitulo, setPopupCapitulo] = useState(false)
  const [notifNavegar, setNotifNavegar] = useState(null)
  const colsGrid = '1fr 1fr'
  const [miniMapaColores, setMiniMapaColores] = useState({})
  const [popupPkid,      setPopupPkid]      = useState(null)  // {pkid, data}
  const [popupLoading,   setPopupLoading]   = useState(false)
  const [zoomingPkid,    setZoomingPkid]    = useState(false)
  const [dwgEnlazadoDash, setDwgEnlazadoDash] = useState(false)
  const miniMapaRef = useRef(null)
  const API_URL = API_BASE
  const contratoIdDash = usuario?.contrato_id
  const du = DASH_UI[fontSize] || DASH_UI.normal

  useEffect(() => {
    if (!contratoIdDash) return
    const tok = getToken()
    fetch(`${API_URL}/presupuesto/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiPpto(d) })
    fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if(d) setKpiCobro(d) })
    fetch(`${API_URL}/actas/${contratoIdDash}/lista`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : [])
      .then(rows => setActasListaMatriz(Array.isArray(rows) ? rows : []))
      .catch(() => setActasListaMatriz([]))
  }, [contratoIdDash])

// ── Auto-refresh dashboard (menos frecuente → menos carga en Azure y menos 502 por saturación) ──
  const dashDrillRef = useRef([])
  useEffect(() => { dashDrillRef.current = dashDrill }, [dashDrill])

  useEffect(() => {
    if (!contratoIdDash) return
    const recargar = () => {
      const tok = getToken()
      fetch(`${API_URL}/presupuesto/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiPpto(d) }).catch(() => {})
      fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-resumen`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiCobro(d) }).catch(() => {})
      if (dashDrillRef.current.length > 0 && !popupCapitulo) refrescarDashDrillSilencioso(dashDrillRef.current)
      fetch(`${API_URL}/cad-queue/${contratoIdDash}/estado`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setDwgEnlazadoDash(d.enlazado) }).catch(() => {})
      const params2 = new URLSearchParams()
      if (dashDrillRef.current[0]) params2.set('capitulo', dashDrillRef.current[0].valor)
      if (dashDrillRef.current[1]) params2.set('item', dashDrillRef.current[1].valor)
      fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-colores?${params2}`, {
        headers: { Authorization: `Bearer ${tok}` }
      }).then(r => r.ok ? r.json() : {}).then(setMiniMapaColores).catch(() => {})
    }
    recargar()
    const iv = setInterval(recargar, 75000)
    return () => clearInterval(iv)
  }, [contratoIdDash])

  useLayoutEffect(() => {
    setActaFiltroMatriz('vigente')
  }, [contratoIdDash])

  useEffect(() => {
    if (!contratoIdDash) {
      setMatrizValidacionLoad(false)
      return
    }
    const ac = new AbortController()
    setMatrizValidacionLoad(true)
    const pm = new URLSearchParams()
    if (actaFiltroMatriz === 'all') {
      pm.set('todo_contrato', '1')
    } else if (actaFiltroMatriz !== 'vigente' && actaFiltroMatriz != null && actaFiltroMatriz !== '') {
      const na = parseInt(String(actaFiltroMatriz), 10)
      if (!Number.isNaN(na)) pm.set('acta_rpo', String(na))
    }
    const url = `${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-matriz-validacion?${pm}`
    fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: ac.signal,
    })
      .then(async r => {
        if (!r.ok) {
          const errTxt = await r.text().catch(() => '')
          console.warn('[dashboard-matriz-validacion]', r.status, errTxt?.slice(0, 200))
          return
        }
        const j = await r.json().catch(() => null)
        if (j && typeof j === 'object') setMatrizValidacion(j)
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        console.warn(err)
        setMatrizValidacion(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setMatrizValidacionLoad(false)
      })
    return () => ac.abort()
  }, [contratoIdDash, actaFiltroMatriz])

  async function cargarDashDrill(drill) {
    if (!contratoIdDash) return
    const tok = getToken()
    const params = new URLSearchParams()
    drill.forEach(d => params.set(d.campo, d.valor))

    // ── Nivel 2: tabla pkid-tabla ──
    if (drill.length >= 2) {
      const cacheKey = `${drill[0]?.valor}|${drill[1]?.valor}`
      const cached = dashTablaCache.current[cacheKey]
      const ahora = Date.now()
      if (cached && (ahora - cached.ts) < CACHE_TTL) {
        setDashTabla(cached.data)             // instantáneo desde caché
        setDashTablaLoad(false)
        // refresco silencioso en background
        fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) { dashTablaCache.current[cacheKey] = { data, ts: Date.now() }; setDashTabla(data) } })
          .catch(() => {})
        return
      }
      setDashTablaLoad(true); setDashTabla(null)
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
      if (res.ok) {
        const data = await res.json()
        dashTablaCache.current[cacheKey] = { data, ts: Date.now() }
        setDashTabla(data)
      }
      setDashTablaLoad(false)
      return
    }

    // ── Nivel 1: ítems del capítulo ──
    setDashTabla(null)
    const cacheKey = drill[0]?.valor || '__todos__'
    const cached = dashDrillCache.current[cacheKey]
    const ahora = Date.now()
    if (cached && (ahora - cached.ts) < CACHE_TTL) {
      setDashData(cached.data)               // instantáneo desde caché
      setDashLoading(false)
      // refresco silencioso en background
      fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            const lista = (data.items || data).map(r => ({
              item: r.item || r.nombre, descripcion: r.descripcion || '',
              presupuesto: r.presupuesto || 0, cobrado: r.cobrado || 0,
              cant_ppto: r.cant_ppto || 0, cant_cobro: r.cant_cobro || r.cant_sicoe || 0,
            }))
            dashDrillCache.current[cacheKey] = { data: lista, ts: Date.now() }
            setDashData(lista)
          }
        })
        .catch(() => {})
      return
    }
    setDashLoading(true)
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
    if (res.ok) {
      const data = await res.json()
      const lista = (data.items || data).map(r => ({
        item: r.item || r.nombre, descripcion: r.descripcion || '',
        presupuesto: r.presupuesto || 0, cobrado: r.cobrado || 0,
        cant_ppto: r.cant_ppto || 0, cant_cobro: r.cant_cobro || r.cant_sicoe || 0,
      }))
      dashDrillCache.current[cacheKey] = { data: lista, ts: Date.now() }
      setDashData(lista)
    }
    setDashLoading(false)
  }

async function refrescarDashDrillSilencioso(drill) {
    // Refresco en background — NO toca loading ni borra lo que se ve
    const tok = getToken()
    const params = new URLSearchParams()
    drill.forEach(d => params.set(d.campo, d.valor))
    if (drill.length >= 2) {
      const cacheKey = `${drill[0]?.valor}|${drill[1]?.valor}`
      fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) { dashTablaCache.current[cacheKey] = { data, ts: Date.now() } } })
        .catch(() => {})
    } else if (drill.length === 1) {
      const cacheKey = drill[0]?.valor || '__todos__'
      fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) {
            const lista = (data.items || data).map(r => ({
              item: r.item || r.nombre, descripcion: r.descripcion || '',
              presupuesto: r.presupuesto || 0, cobrado: r.cobrado || 0,
              cant_ppto: r.cant_ppto || 0, cant_cobro: r.cant_cobro || r.cant_sicoe || 0,
            }))
            dashDrillCache.current[cacheKey] = { data: lista, ts: Date.now() }
          }
        })
        .catch(() => {})
    }
  }

  useEffect(() => { if (contratoIdDash) { setDashDrillPag(0); cargarDashDrill(dashDrill) } }, [contratoIdDash, dashDrill])

  async function abrirPopupPkid(pkid) {
    if (dashDrill.length < 2) return
    setPopupLoading(true); setPopupPkid({ pkid, data: null })
    const tok = getToken()
    const params = new URLSearchParams({ pk_id: pkid })
    if (dashDrill[1]) params.set('item', dashDrill[1].valor)
    if (dashDrill[0]) params.set('capitulo', dashDrill[0].valor)
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-detalle?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    })
    const data = res.ok ? await res.json() : null
    setPopupPkid({ pkid, data })
    setPopupLoading(false)
  }

async function enviarZoomPkid(pkid) {
    if (!contratoIdDash || !pkid) return
    setZoomingPkid(true)
    try {
      const tok = getToken()
      await fetch(`${API_URL}/cad-queue/${contratoIdDash}/zoom-pkid?pk_id=${encodeURIComponent(pkid)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` }
      })
    } catch {}
    setTimeout(() => setZoomingPkid(false), 2000)
  }

const [navRegistroId, setNavRegistroId] = useState(null)
const [navRegistroNumero, setNavRegistroNumero] = useState(null)

  async function handleNavegar(notif) {
    if (!notif?.modulo) return
    const modulo = notif.modulo?.toLowerCase()
    if (notif.entidad_id && modulo === 'sicoe_obra' && notif.entidad_tipo === 'registro') {
      // Buscar el reporte que contiene este registro
      try {
        const tok = getToken()
        const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash || usuario?.contrato_id}/registros/${notif.entidad_id}/reporte`, {
          headers: { Authorization: `Bearer ${tok}` }
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.id) {
            setDashCarpetaReporte({ ...data, _autoRegistro: parseInt(notif.entidad_id) })
            setDashRegistroNumero(parseInt(notif.entidad_id))
          }
        }
      } catch {}
      return
    }
    const modMap = { PRESUPUESTO:'presupuesto', COBRO:'sicoe_obra', AUTH:'dashboard' }
    setModuloActivo(modMap[notif.modulo] || modulo || 'dashboard')
    if (notif.entidad_id && notif.modulo === 'PRESUPUESTO') {
      setNavRegistroId(parseInt(notif.entidad_id))
    }
  }
    useEffect(() => {
    if (!contratoIdDash) return
    const tok = getToken()
    const params = new URLSearchParams()
    if (dashDrill[0]) params.set('capitulo', dashDrill[0].valor)
    if (dashDrill[1]) params.set('item', dashDrill[1].valor)
    fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-colores?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    }).then(r => r.ok ? r.json() : {}).then(setMiniMapaColores).catch(() => {})
  }, [contratoIdDash, dashDrill])

  async function cargarAnalisis(nivel) {
    if (!contratoIdDash) return
    setAnalisisLoading(true); setAnalisisData(null); setAnalisisPag(0)
    const tok = getToken()
    try {
      const url = `${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-drill`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } })
      if (res.ok) {
        const data = await res.json()
        setAnalisisData((data.items || data).map(r => ({
          nombre: r.nombre || r.item,
          capitulo: r.capitulo || r.nombre || '',
          descripcion: r.descripcion || '',
          presupuesto: r.presupuesto || 0,
          cobrado: r.cobrado || 0,
          cant_ppto: r.cant_ppto || 0,
          cant_cobro: r.cant_cobro || 0,
        })))
      }
    } catch {}
    setAnalisisLoading(false)
  }

  useEffect(() => {
    if (contratoIdDash && dashTab === 'analisis') cargarAnalisis(analisisNivel)
  }, [contratoIdDash, dashTab, analisisNivel])

  useEffect(() => {
    if (!contratoIdDash || !analisisSeleccion) { setAnalisisMapaColores({}); return }
    const tok = getToken()
    const params = new URLSearchParams()
    if (analisisSeleccion.capitulo) params.set('capitulo', analisisSeleccion.capitulo)
    if (analisisSeleccion.item)     params.set('item', analisisSeleccion.item)
    fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-colores?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    }).then(r => r.ok ? r.json() : {}).then(setAnalisisMapaColores).catch(() => {})
  }, [contratoIdDash, analisisSeleccion])

  async function abrirAnalisisMapaPopup(pkid) {
    if (!analisisSeleccion) return
    setAnalisisMapaPopupLoading(true); setAnalisisMapaPopup({ pkid, data: null })
    const tok = getToken()
    const params = new URLSearchParams({ pk_id: pkid })
    if (analisisSeleccion.capitulo) params.set('capitulo', analisisSeleccion.capitulo)
    if (analisisSeleccion.item)     params.set('item', analisisSeleccion.item)
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-detalle?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    })
    setAnalisisMapaPopup({ pkid, data: res.ok ? await res.json() : null })
    setAnalisisMapaPopupLoading(false)
  }

  async function cargarLiquidacion(nivel = liqNivel) {
    if (!contratoIdDash) return
    setLiqLoading(true); setLiqPag(0)
    try {
      const tok = getToken()
      const res = await fetch(`${API_URL}/presupuesto/${contratoIdDash}/analisis-liquidacion?nivel=${nivel}`, { headers: { Authorization: `Bearer ${tok}` } })
      if (res.ok) {
        const items = (await res.json()).items || []
        setLiqData(items)
      } else if (!liqData) {
        // Si falla y no hay datos previos, reintentar una vez después de 3s
        setTimeout(() => cargarLiquidacion(nivel), 3000)
        return
      }
    } catch {
      if (!liqData) setTimeout(() => cargarLiquidacion(nivel), 3000)
      return
    }
    setLiqLoading(false)
  }

  useEffect(() => {
    if (contratoIdDash && dashTab === 'liquidacion') cargarLiquidacion(liqNivel)
  }, [contratoIdDash, dashTab, liqNivel])

  useEffect(() => {
    if (contratoIdDash && usuario?.contrato_fase === 'LIQUIDACION' && !liqData) cargarLiquidacion('item')
  }, [contratoIdDash, usuario?.contrato_fase, liqData])

  useEffect(() => {
    if (!contratoIdDash || !liqSeleccion) { setLiqMapaColores({}); return }
    const tok = getToken()
    const params = new URLSearchParams()
    if (liqSeleccion.capitulo) params.set('capitulo', liqSeleccion.capitulo)
    if (liqSeleccion.item)     params.set('item', liqSeleccion.item)
    fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-colores?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    }).then(r => r.ok ? r.json() : {}).then(setLiqMapaColores).catch(() => {})
  }, [contratoIdDash, liqSeleccion])

  async function abrirLiqMapaPopup(pkid) {
    if (!liqSeleccion) return
    setLiqMapaPopupLoad(true); setLiqMapaPopup({ pkid, data: null })
    const tok = getToken()
    const params = new URLSearchParams({ pk_id: pkid })
    if (liqSeleccion.capitulo) params.set('capitulo', liqSeleccion.capitulo)
    if (liqSeleccion.item)     params.set('item', liqSeleccion.item)
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/dashboard-pkid-detalle?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    })
    setLiqMapaPopup({ pkid, data: res.ok ? await res.json() : null })
    setLiqMapaPopupLoad(false)
  }

  const liqFiltrado = useMemo(() => {
    if (!liqData) return []
    let data = liqData.filter(r => r.categoria !== 'EJECUCION') // Ejecución es informativo, no se lista
    if (liqDir !== 'todos') data = data.filter(r => r.categoria === liqDir)
    return [...data].sort((a, b) => {
      const va = a[liqSortCol] ?? 0, vb = b[liqSortCol] ?? 0
      if (typeof va === 'string') return liqSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return liqSortDir === 'asc' ? va - vb : vb - va
    })
  }, [liqData, liqDir, liqSortCol, liqSortDir])

  const analisisFiltrado = useMemo(() => {
    if (!analisisData) return []
    let data = analisisData.map(r => {
      const delta_costo = (r.presupuesto || 0) - (r.cobrado || 0)
      const delta_cant  = (r.cant_ppto   || 0) - (r.cant_cobro  || 0)
      const pct = r.presupuesto ? Math.round(r.cobrado / r.presupuesto * 100) : (r.cobrado > 0 ? 999 : 0)
      const estado = r.presupuesto === 0 ? 'SIN_PPTO'
        : r.cobrado > r.presupuesto * 1.05 ? 'SOBRECOBRO'
        : r.cobrado < r.presupuesto * 0.95 ? 'SUBCOBRO' : 'EQUILIBRIO'
      return { ...r, delta_costo, delta_cant, pct, estado }
    })
    if (analisisDir === 'sobrecobro') data = data.filter(r => r.estado === 'SOBRECOBRO')
    else if (analisisDir === 'subcobro') data = data.filter(r => r.estado === 'SUBCOBRO')
    else if (analisisDir === 'equilibrio') data = data.filter(r => r.estado === 'EQUILIBRIO')
    const minM = analisisRangoMin !== '' ? parseFloat(analisisRangoMin) * 1e6 : null
    const maxM = analisisRangoMax !== '' ? parseFloat(analisisRangoMax) * 1e6 : null
    if (minM !== null && !isNaN(minM)) data = data.filter(r => Math.abs(r.delta_costo) >= minM)
    if (maxM !== null && !isNaN(maxM)) data = data.filter(r => Math.abs(r.delta_costo) <= maxM)
    return [...data].sort((a, b) => {
      const va = a[analisisSortCol] ?? 0, vb = b[analisisSortCol] ?? 0
      if (typeof va === 'string') return analisisSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return analisisSortDir === 'asc' ? va - vb : vb - va
    })
  }, [analisisData, analisisDir, analisisRangoMin, analisisRangoMax, analisisSortCol, analisisSortDir])

  // Desarrollador ve todo; otros usuarios ven solo su contrato
  const cargoNombreNorm = (usuario?.cargo_nombre || '').trim().toLowerCase()
  const esDeveloper = cargoNombreNorm === 'desarrollador'
  const esAdminCargo = cargoNombreNorm === 'administrador'
  // Funciones que habilitan ver el panel admin
  const ADMIN_FUNCIONES = ["contratos", "listado de precios"]
  const tienePermisoAdmin = (usuario?.permisos || []).some(p =>
    p.ver && ADMIN_FUNCIONES.includes(p.funcion_nombre?.toLowerCase())
  )
  const canAdmin = esDeveloper || esAdminCargo || tienePermisoAdmin
  /** Misma regla que el backend (logs / novedades): solo estos cargos publican novedades de inicio. */
  const puedePublicarNovedadesInicio = esDeveloper || esAdminCargo
  const tienePermisoSicoeObra = esDeveloper || (usuario?.permisos || []).some(p => p.funcion_nombre === 'Reporte de Cantidades' && p.ver)
  const tienePermisoDashboard   = esDeveloper || (usuario?.permisos || []).some(p => p.funcion_nombre === 'Dashboard' && p.ver)
  const tienePermisoInformesCcd = esDeveloper || esAdminCargo
    || (usuario?.permisos || []).some(p =>
      (p.funcion_nombre || '').toLowerCase() === 'informes ccd' && p.ver
    )
  const tienePermisoPresupuesto = esDeveloper || (usuario?.permisos || []).some(p => {
    const nombre = (p.funcion_nombre || '').toLowerCase()
    return nombre === 'editar registros presupuesto' && p.ver
  })

  const s = {
    app: { fontFamily: "'Segoe UI', sans-serif", background: t.bg, minHeight: '100vh', color: t.text },
    header: { background: t.headerBg, borderBottom: `1px solid ${t.border}`, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: t.shadow, marginTop: topOffset },
    themeSelector: { display: 'flex', gap: '6px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: '20px', padding: '4px' },
    themeBtn: (mode) => ({ background: themeMode === mode ? t.primary : 'transparent', color: themeMode === mode ? '#fff' : t.textMuted, border: 'none', borderRadius: '16px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }),
    body: { padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' },
    topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    btnCrear: { background: t.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
    panelsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' },
    card: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow },
    cardLabel: { fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: t.textMuted, marginBottom: '8px' },
    cardValue: { fontSize: '26px', fontWeight: '700', color: t.primary, lineHeight: 1 },
    cardSub: { fontSize: '12px', color: t.textMuted, marginTop: '6px' },
    analisisBtn: (key) => ({ background: analisis === key ? t.primary : t.bgCard, color: analisis === key ? '#fff' : t.textMuted, border: `1px solid ${analisis === key ? t.primary : t.border}`, borderRadius: '8px', padding: '8px 18px', fontSize: '13px', cursor: 'pointer' }),
    table: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow, marginBottom: '20px' },
    tableHeader: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: t.textMuted, borderBottom: `1px solid ${t.border}`, paddingBottom: '10px', marginBottom: '10px' },
    emptyState: { textAlign: 'center', padding: '40px', color: t.textMuted, fontSize: '14px' },
    bottomPanel: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', padding: '20px', boxShadow: t.shadow },
    tab: (key) => ({ background: tabInferior === key ? t.primary : t.bgCard, color: tabInferior === key ? '#fff' : t.textMuted, border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', cursor: 'pointer' }),
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: t.overlay, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal: { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
    input: { width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: '8px', padding: '10px 14px', color: t.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' },
    label: { fontSize: '12px', fontWeight: '600', color: t.textMuted, letterSpacing: '0.5px', marginBottom: '6px', display: 'block' },
  }

  function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return
    setCsvNombre(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',')
        return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i]?.trim() }), {})
      })
      setCsvData(rows)
    }
    reader.readAsText(file)
  }

  async function handleGuardarContrato() {
    if (!nuevoContrato.numero || !nuevoContrato.contratista) {
      setErrorContrato('Número y contratista son obligatorios'); return
    }
    setSavingContrato(true); setErrorContrato('')
    try {
      const res = await fetch(`${API}/contratos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ...nuevoContrato })
      })
      const data = await res.json()
      if (!res.ok) { setErrorContrato(data.detail || 'Error al crear contrato'); return }
      setNuevoContrato({ numero: '', objeto: '', contratista: '', nit: '' })
      setCsvData(null); setCsvNombre(''); setShowModalContrato(false)
    } catch {
      setErrorContrato('No se pudo conectar con el servidor')
    } finally {
      setSavingContrato(false)
    }
  }

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/CLARA.CORE.png"
            alt="ClaraCore"
            className="cc-brand-logo cc-brand-logo--header"
            style={{ filter: themeIsDarkChrome(activeTheme) ? 'brightness(0) invert(1)' : 'none' }}
          />
          {usuario?.logo_contratista && (usuario?.rol_nombre === 'Contratista' || !['Interventoría'].includes(usuario?.rol_nombre)) && (
            <img src={usuario.logo_contratista} alt="Contratista" style={{ height: '52px', borderRadius: '6px', background: '#fff', padding: '3px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
          )}
          {usuario?.logo_interventoria && (usuario?.rol_nombre === 'Interventoría' || !['Contratista'].includes(usuario?.rol_nombre)) && (
            <img src={usuario.logo_interventoria} alt="Interventoría" style={{ height: '52px', borderRadius: '6px', background: '#fff', padding: '3px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...s.themeSelector, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'min(440px, 96vw)' }}>
            {['light', 'auto', 'dark', 'rest'].map((mode, i) => (
              <button key={mode} style={s.themeBtn(mode)} onClick={() => onTheme(mode)}>
                {['☀️ Claro', '⚡ Auto', '🌙 Oscuro', '🌿 Descansar'][i]}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:'2px', alignItems:'center', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'20px', padding:'4px 6px' }}>
            {[['pequena','A',11],['normal','A',14],['grande','A',17]].map(([key, lbl, sz]) => (
              <button key={key} onClick={() => onFontSize && onFontSize(key)}
                style={{ background: fontSize===key ? t.primary : 'transparent', color: fontSize===key ? '#fff' : t.textMuted, border:'none', borderRadius:'14px', padding:'2px 7px', fontSize:`${sz}px`, cursor:'pointer', fontWeight: fontSize===key ? '700' : '400', lineHeight:1.2, transition:'all 0.2s' }}>
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => onOpenPerfil && onOpenPerfil()}
              title="Editar perfil"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: '999px',
                padding: '4px 12px 4px 4px',
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: t.inputBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                }}
              >
                {usuario?.foto_perfil_url ? (
                  <img src={usuario.foto_perfil_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '👤'
                )}
              </span>
              <span style={{ fontSize: '13px', color: t.textMuted }}>
                <span style={{ color: t.text, fontWeight: '600' }}>{usuario?.nombre}</span>
                {usuario?.cargo_nombre && (
                  <span style={{ display: 'block', fontSize: '11px', opacity: 0.75, marginTop: '1px' }}>{usuario.cargo_nombre}</span>
                )}
              </span>
            </button>
            <BuzonNotificaciones t={t} usuario={usuario} token={getToken()} onNavegar={handleNavegar} />
            {canAdmin && (
              <button onClick={() => setShowAdmin(true)} style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '8px', padding: '6px 14px', color: t.primary, fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                ⚙ Admin
              </button>
            )}
            <button onClick={onLogout} style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '8px', padding: '6px 14px', color: t.textMuted, fontSize: '12px', cursor: 'pointer' }}>
              Salir
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', minHeight:'calc(100vh - 72px)' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: menuAbierto ? '220px' : '52px',
          minHeight: '100%',
          background: t.headerBg,
          borderRight: `1px solid ${t.border}`,
          transition: 'width 0.25s ease',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', flexShrink: 0,
          boxShadow: menuAbierto ? '4px 0 20px rgba(0,0,0,0.12)' : 'none',
          position: 'relative', zIndex: 10,
        }}>
          {/* Botón hamburguesa */}
          <button onClick={() => setMenuAbierto(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px',
            color: t.textMuted, fontSize: '18px', borderBottom: `1px solid ${t.border}`,
            minHeight: '48px', whiteSpace: 'nowrap', width: '100%'
          }}>
            <span style={{ fontSize:'18px', lineHeight:1 }}>☰</span>
            {menuAbierto && <span style={{ fontSize:'12px', fontWeight:'700', letterSpacing:'1px', color:t.textMuted }}>MÓDULOS</span>}
          </button>

          {/* Items del menú */}
          {[
            ['inicio',       '🏠', 'Inicio',         true],
            ['dashboard',    '📊', 'Dashboard',      tienePermisoDashboard],
            ['presupuesto',  '📋', 'Presupuesto',    tienePermisoPresupuesto],
            ['sicoe_obra',   '🏗️', 'SICOE Obra',    tienePermisoSicoeObra],
            ['informes',     '📄', 'Informes',       tienePermisoInformesCcd],
            ['almacen',      '🏪', 'Almacén',        true],
            ['gantt',        '📅', 'Gantt',           true],
            ['semaforo',     '🗺️', 'Plano Semáforo', true],
          ].filter(([,,, visible]) => visible).map(([key, icon, label]) => (
            <button key={key} onClick={() => { setModuloActivo(key); setMenuAbierto(false) }} style={{
              background: moduloActivo === key ? t.primary+'22' : 'none',
              border: 'none',
              borderLeft: moduloActivo === key ? `3px solid ${t.primary}` : '3px solid transparent',
              cursor: 'pointer', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: '12px',
              color: moduloActivo === key ? t.primary : t.textMuted,
              fontWeight: moduloActivo === key ? '700' : '400',
              fontSize: '13px', whiteSpace: 'nowrap', width: '100%',
              transition: 'all 0.15s', textAlign: 'left',
            }}>
              <span style={{ fontSize:'16px', lineHeight:1, flexShrink:0 }}>{icon}</span>
              {menuAbierto && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* ── Contenido principal ── */}
        <div style={{ flex:1, padding:'20px 24px', minWidth:0, overflow:'hidden' }}>
        <div style={s.topBar}>
          {usuario?._contratos?.length > 1 ? (
            <select
              value={usuario.contrato_id || ''}
              onChange={async (e) => {
                const cid = parseInt(e.target.value)
                const contrato = usuario._contratos.find(c => c.id === cid)
                if (!contrato) return
                const u = { ...usuario, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista ?? null, logo_interventoria: contrato.logo_interventoria ?? null, contrato_fase: contrato.fase ?? 'PRESUPUESTO' }
                setUsuario(u)
              }}
              style={{ fontSize: '13px', background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 12px', color: t.primary, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
            >
              {!usuario.contrato_id && (
                <option value="">— Selecciona un contrato —</option>
              )}
              {usuario._contratos.map(c => (
                <option key={c.id} value={c.id}>📋 {c.numero}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: '13px', color: t.textMuted }}>
              📋 Contrato: {usuario?.contrato_numero || (esDeveloper ? 'Todos los contratos' : 'Sin asignar')}
            </span>
          )}
          {/* Crear Contrato se gestiona desde el Panel Admin */}
        </div>



        {moduloActivo === 'inicio' && (
          <ModuloInicio t={t} usuario={usuario} fontSize={fontSize} puedePublicarNovedades={puedePublicarNovedadesInicio} />
        )}
        {moduloActivo === 'dashboard' && (() => {
          const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
          const fmtM = n => { if(!n) return '$0'; if(n>=1e9) return `$${(n/1e9).toFixed(1)}B`; if(n>=1e6) return `$${(n/1e6).toFixed(1)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${Math.round(n)}` }
          const ppto  = kpiPpto?.costo_total  || 0
          const cobro = kpiCobro?.total_cobrado || 0
          const delta = ppto - cobro
          const pct   = ppto ? Math.min(100, Math.round(cobro/ppto*100)) : 0
          const alerta = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981'

          // Datos para gráficos
          const porActa = (kpiCobro?.por_acta || []).sort((a,b) => (a.acta||0)-(b.acta||0))
          const porCapPpto = (kpiPpto?.por_capitulo || []).sort((a,b) => b.costo - a.costo).slice(0,15)
          const maxCapCosto = Math.max(...porCapPpto.map(c => c.costo), 1)

          return <>
            {/* ── Tab bar Dashboard ── */}
            <div style={{ display:'flex', gap:'6px', marginBottom:'20px', background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'6px', width:'fit-content', boxShadow:t.shadow }}>
              {[
                ['resumen',   '📊 Resumen'],
                ['analisis',  '🔍 Análisis de Desviaciones'],
                ...(usuario?.contrato_fase === 'LIQUIDACION' ? [['liquidacion', '⚖️ Análisis de Liquidación']] : []),
              ].map(([key,label]) => (
                <button key={key} onClick={() => setDashTab(key)} style={{ background:dashTab===key?t.primary:'transparent', color:dashTab===key?'#fff':t.textMuted, border:'none', borderRadius:'8px', padding:'8px 22px', fontSize:`${du.tab}px`, fontWeight:'700', cursor:'pointer', transition:'all 0.15s', letterSpacing:'0.2px' }}>{label}</button>
              ))}
            </div>

            {dashTab === 'resumen' && <>
            {/* ── KPIs compactos ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
              {(() => {
                const esLiq = usuario?.contrato_fase === 'LIQUIDACION'
                let kpis
                if (esLiq && liqLoading) {
                  // Cargando datos de liquidación — mostrar skeleton
                  kpis = [
                    { label:'VALOR ACTUAL CONTRATO', value:'...', sub:'Calculando', color:'#0077B6', icon:'📋' },
                    { label:'SICOE ACUMULADO',        value: fmtD(cobro), sub: kpiCobro ? `${kpiCobro.actas?.length||0} actas` : '—', color:'#00A896', icon:'💰' },
                    { label:'SALDO LIQUIDACIÓN',      value:'...', sub:'Calculando', color:'#F59E0B', icon:'📊' },
                    { label:'% EJECUCIÓN',            value:'...', sub:'Calculando', color:'#F59E0B', icon:'⚡' },
                  ]
                } else if (esLiq && liqData?.length > 0) {
                  // Universo completo — sin filtro de categoría
                  const todoLiq = liqData
                  const sumPorCobrar  = todoLiq.filter(r=>r.categoria==='POR_COBRAR').reduce((s,r)=>s+(r.delta_costo||0),0)
                  const sumDevolucion = todoLiq.filter(r=>r.categoria==='DEVOLUCION').reduce((s,r)=>s+Math.abs(r.delta_costo||0),0)
                  const sumSupercobro = todoLiq.filter(r=>r.categoria==='SUPERCOBRO').reduce((s,r)=>s+Math.abs(r.delta_costo||0),0)
                  const cobroLiq    = cobro
                  const valorActual = cobroLiq + sumPorCobrar - sumDevolucion - sumSupercobro
                  const saldoNeto   = valorActual - cobroLiq   // = sumPorCobrar - sumDevolucion - sumSupercobro
                  const pctLiq      = valorActual > 0 ? Math.min(999, Math.round(cobroLiq / valorActual * 100)) : 0
                  const alertaLiq   = pctLiq >= 90 ? '#EF4444' : pctLiq >= 70 ? '#F59E0B' : '#10B981'
                  kpis = [
                    { label:'VALOR ACTUAL CONTRATO',  value: fmtD(valorActual), sub: `${todoLiq.filter(r=>r.categoria!=='EJECUCION').length} ítems en análisis`, color:'#0077B6', icon:'📋' },
                    { label:'SICOE ACUMULADO',         value: fmtD(cobroLiq),    sub: kpiCobro ? `${kpiCobro.actas?.length||0} actas` : '—', color:'#00A896', icon:'💰' },
                    { label: saldoNeto >= 0 ? 'POR COBRAR' : 'POR DEVOLUCIÓN', value: fmtD(Math.abs(saldoNeto)), sub: saldoNeto >= 0 ? '✅ Saldo positivo' : '⚠️ Saldo negativo', color: saldoNeto >= 0 ? '#10B981' : '#EF4444', icon:'📊' },
                    { label:'% EJECUCIÓN',             value: `${pctLiq}%`,      sub: pctLiq >= 90 ? '🔴 Crítico' : pctLiq >= 70 ? '🟡 Alerta' : '🟢 Normal', color: alertaLiq, icon:'⚡' },
                  ]
                } else {
                  kpis = [
                    { label:'PRESUPUESTO TOTAL', value: fmtD(ppto), sub: kpiPpto ? `${kpiPpto.total_registros} ítems` : '—', color:'#0077B6', icon:'📋' },
                    { label:'SICOE ACUMULADO',   value: fmtD(cobro), sub: kpiCobro ? `${kpiCobro.actas?.length||0} actas` : '—', color:'#00A896', icon:'💰' },
                    { label:'SALDO DISPONIBLE',  value: fmtD(delta), sub: delta < 0 ? '⚠️ Sobrecosto' : 'Sin sobrecosto', color: delta < 0 ? '#EF4444' : '#10B981', icon:'📊' },
                    { label:'% CONSUMO',         value: `${pct}%`, sub: pct >= 90 ? '🔴 Crítico' : pct >= 70 ? '🟡 Alerta' : '🟢 Normal', color: alerta, icon:'⚡' },
                  ]
                }
                return kpis.map(k => (
                  <div key={k.label} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 14px', boxShadow:t.shadow, borderLeft:`4px solid ${k.color}` }}>
                    <div style={{ fontSize:`${du.kpiLabel}px`, fontWeight:'700', color:t.textMuted, letterSpacing:'1.5px', marginBottom:'4px' }}>{k.icon} {k.label}</div>
                    <div style={{ fontSize:`${du.kpiValue}px`, fontWeight:'800', color:k.color, lineHeight:1, marginBottom:'3px' }}>{k.value}</div>
                    <div style={{ fontSize:`${du.kpiSub}px`, color:t.textMuted }}>{k.sub}</div>
                  </div>
                ))
              })()}
            </div>

            {/* ── Barra de consumo global ── */}
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'14px 20px', marginBottom:'20px', boxShadow:t.shadow }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:`${du.body}px`, fontWeight:'700', color:t.text }}>Avance financiero del contrato</span>
                <span style={{ fontSize:`${du.body}px`, fontWeight:'700', color:alerta }}>{pct}% ejecutado</span>
              </div>
              <div style={{ height:'10px', background:t.border, borderRadius:'5px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, #0077B6, ${alerta})`, borderRadius:'5px', transition:'width 0.8s ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px', fontSize:`${du.sub}px`, color:t.textMuted }}>
                <span style={{color:alerta,fontWeight:'600'}}>{fmtD(cobro)}</span><span>{fmtD(ppto)}</span>
              </div>
            </div>

            {/* ── Grid 2×2 ── */}                                  
            <div style={{ display:'grid', gridTemplateColumns:colsGrid, gap:'16px', marginBottom:'20px', transition:'grid-template-columns 0.3s ease', minWidth:0 }}>

              {/* 🔴 Panel Cobro por Acta — área/línea */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'20px', boxShadow:t.shadow, ...(panelFoco==='cobro-acta' && {gridColumn:'1 / -1'}) }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ fontSize:`${du.title}px`, fontWeight:'700', color:t.text }}>💰 Obra Aprobada por Acta RPO</div>
                    <button onClick={() => setPanelFoco(p => p === 'cobro-acta' ? null : 'cobro-acta')}
                      style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:`${du.title + 1}px`, padding:'0' }}
                      title="Expandir panel">
                      {panelFoco === 'cobro-acta' ? '⊠' : '⤢'}
                    </button>
                  </div>
                    <div style={{ fontSize:`${du.sub}px`, color:t.textMuted, marginTop:'2px' }}>Aprobado Interventoría · acumulado por Acta RPO</div>
                  </div>
                  <div style={{ fontSize:`${du.kpiValue - 2}px`, fontWeight:'800', color:t.primary }}>{fmtD(cobro)}</div>
                </div>
                {porActa.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin registros aprobados por Interventoría</div>
                ) : (() => {
                  const W = 860, H = 160, PAD = 8
                  const maxVal = Math.max(...porActa.map(a => a.cobrado), 1)
                  const pts = porActa.map((a, i) => ({
                    x: PAD + (i / Math.max(porActa.length-1, 1)) * (W - PAD*2),
                    y: PAD + (1 - a.cobrado/maxVal) * (H - PAD*2),
                    acta: a.acta, val: a.cobrado
                  }))
                  const pathD = pts.map((p,i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
                  const areaD = `${pathD} L${pts[pts.length-1].x.toFixed(1)},${H-PAD} L${pts[0].x.toFixed(1)},${H-PAD} Z`
                  const [hovered, setHovered] = [null, ()=>{}]
                  return (
                    <div style={{ position:'relative' }}>
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'160px', overflow:'visible' }}>
                        <defs>
                          <linearGradient id="cobroGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={t.primary} stopOpacity="0.4"/>
                            <stop offset="100%" stopColor="#00A896" stopOpacity="0.02"/>
                          </linearGradient>
                        </defs>
                        <path d={areaD} fill="url(#cobroGrad)" />
                        <path d={pathD} fill="none" stroke={t.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        {pts.map((p, i) => (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r="10" fill="transparent"
                              onMouseEnter={e => {
                                const tip = e.currentTarget.parentNode.querySelector('.tip-'+i)
                                if(tip) tip.style.display='block'
                              }}
                              onMouseLeave={e => {
                                const tip = e.currentTarget.parentNode.querySelector('.tip-'+i)
                                if(tip) tip.style.display='none'
                              }}
                            />
                            <circle cx={p.x} cy={p.y} r="3.5" fill={t.primary} stroke={t.bgCard} strokeWidth="1.5" style={{pointerEvents:'none'}}/>
                            <g className={'tip-'+i} style={{display:'none', pointerEvents:'none'}}>
                              <rect x={Math.min(p.x-10, W-200)} y={p.y-42} width="195" height="36" rx="6" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                              <text x={Math.min(p.x, W-55)} y={p.y-26} textAnchor="middle" fontSize="10" fill={t.textMuted}>Acta {p.acta}</text>
                              <text x={Math.min(p.x-10, W-120)} y={p.y-12} textAnchor="start" fontSize="10" fontWeight="700" fill={t.primary}>{fmtD(p.val)}</text>
                            </g>
                          </g>
                        ))}
                      </svg>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:'4px', fontSize:'10px', color:t.textMuted }}>
                        {porActa.length > 0 && <span>Acta {porActa[0]?.acta}</span>}
                        {porActa.length > 1 && <span>Acta {porActa[porActa.length-1]?.acta}</span>}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* ⬛ Panel Presupuesto por Capítulo — barras */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'20px', boxShadow:t.shadow, ...(panelFoco==='ppto-capitulo' && {gridColumn:'1 / -1'}) }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ fontSize:`${du.title}px`, fontWeight:'700', color:t.text }}>📋 Presupuesto por Capítulo</div>
                      <button onClick={() => setPanelFoco(p => p === 'ppto-capitulo' ? null : 'ppto-capitulo')}
                        style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:`${du.title + 1}px`, padding:'0' }}
                        title="Expandir panel">
                        {panelFoco === 'ppto-capitulo' ? '⊠' : '⤢'}
                      </button>
                    </div>
                    <div style={{ fontSize:`${du.sub}px`, color:t.textMuted, marginTop:'2px' }}>Top 15 capítulos por valor</div>
                  </div>
                  <div style={{ fontSize:`${du.kpiValue - 2}px`, fontWeight:'800', color:'#0077B6' }}>{fmtD(ppto)}</div>
                </div>
                {porCapPpto.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:`${du.body}px` }}>Sin datos de presupuesto</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'200px', overflowY:'auto' }}>
                    {porCapPpto.map((cap, i) => {
                      const pct = Math.round(cap.costo / maxCapCosto * 100)
                      const color = ['#0077B6','#00B4C6','#00A896','#028090','#05668D','#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B','#44BBA4','#E94F37','#393E41','#F5A623','#7B2D8B'][i % 15]
                      return (
                        <div key={cap.capitulo} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ fontSize:`${du.table}px`, color:t.textMuted, width:'140px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={cap.capitulo}>
                            {cap.capitulo}
                          </div>
                          <div style={{ flex:1, height:'14px', background:t.border, borderRadius:'7px', overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:'7px', transition:'width 0.6s ease' }}/>
                          </div>
                          <div style={{ fontSize:`${du.table}px`, fontWeight:'700', color, width:'52px', textAlign:'right', flexShrink:0 }}>{fmtM(cap.costo)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 🟢 Presupuesto vs Obra + Matriz validación (SICOE / Acta RPO) */}
              <div style={{ gridColumn:'1 / -1', display:'flex', flexDirection: panelFoco==='ppto-cobro' ? 'column' : 'row', flexWrap:'wrap', gap:'16px', alignItems:'stretch' }}>
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'20px', boxShadow:t.shadow, flex: panelFoco==='ppto-cobro' ? '1 1 100%' : '1 1 calc(50% - 8px)', minWidth: panelFoco==='ppto-cobro' ? '100%' : 'min(300px, 100%)', boxSizing:'border-box' }}>
                <div style={{ marginBottom:'14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ fontSize:`${du.title}px`, fontWeight:'700', color:t.text }}>📊 Presupuesto vs Obra Aprobada</div>
                    <button onClick={() => setPanelFoco(p => p === 'ppto-cobro' ? null : 'ppto-cobro')}
                      style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:`${du.title + 1}px`, padding:'0' }}
                      title="Expandir panel">
                      {panelFoco === 'ppto-cobro' ? '⊠' : '⤢'}
                    </button>
                  </div>
                  <div style={{ fontSize:`${du.sub}px`, color:t.textMuted, marginTop:'2px' }}>Por capítulo — barras horizontales · orden numérico · Obra = aprobado Interventoría (N3)</div>
                </div>
                {(() => {
                  const comp = sortComparativoCapitulos(kpiCobro?.comparativo_capitulos || [])
                  if (comp.length === 0) return (
                    <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:`${du.body}px` }}>Sin datos</div>
                  )
                  const maxVal = Math.max(...comp.map(c => Math.max(c.presupuesto||0, c.cobrado||0)), 1)
                  const PAD_R = 12
                  const PAD_TOP = 10
                  const GAP_BARS = 3
                  const BAR_H = du.barH
                  const ROW_INNER = 4 + BAR_H + GAP_BARS + BAR_H
                  const ROW_H = ROW_INNER + du.rowGap
                  const TEXT_START = 26
                  const BAR_START = TEXT_START + du.padLabelW + 8
                  const vbW = Math.max(760, BAR_START + 420)
                  const chartW = vbW - PAD_R - BAR_START
                  const scaleW = (v) => (Math.min(v, maxVal) / maxVal) * chartW
                  const chartBottom = PAD_TOP + comp.length * ROW_H
                  const AXIS_H = 22
                  const vbH = chartBottom + AXIS_H
                  const maxChars = Math.max(12, Math.floor(du.padLabelW / 5.2))

                  return (
                    <div style={{ maxHeight:'min(440px, 58vh)', overflowY:'auto', overflowX:'hidden', width:'100%', paddingRight:'2px' }}>
                      <div style={{ fontSize:`${du.chartAxis}px`, color:t.textMuted, marginBottom:'6px' }}>
                        Escala: {fmtM(0)} — {fmtM(maxVal * 0.25)} — {fmtM(maxVal * 0.5)} — {fmtM(maxVal * 0.75)} — {fmtM(maxVal)}
                      </div>
                      <svg width="100%" height={vbH} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMinYMin meet" style={{ overflow:'visible', display:'block', maxWidth:'100%' }}>
                        {[0, 25, 50, 75, 100].map(pct => {
                          const gx = BAR_START + (pct / 100) * chartW
                          return (
                            <line key={`gx-${pct}`} x1={gx} x2={gx} y1={PAD_TOP} y2={chartBottom} stroke={t.border} strokeWidth="0.5" strokeDasharray="4,4" />
                          )
                        })}
                        {comp.map((cap, i) => {
                          const rowY = PAD_TOP + i * ROW_H
                          const yP = rowY + 4
                          const yC = rowY + 4 + BAR_H + GAP_BARS
                          const wP = Math.max(scaleW(cap.presupuesto || 0), 2)
                          const wC = Math.max(scaleW(cap.cobrado || 0), 2)
                          const sobrecosto = (cap.cobrado || 0) > (cap.presupuesto || 0)
                          const colorC = sobrecosto ? '#DC2626' : '#00A896'
                          const isSelected = dashDrill[0]?.valor === cap.capitulo
                          const rawCap = cap.capitulo || ''
                          const nomCap = rawCap.length > maxChars ? `${rawCap.slice(0, maxChars)}…` : rawCap
                          const tipId = `tip-vs-h-${i}`
                          return (
                            <g key={`${rawCap}-${i}`}>
                              <text
                                x={TEXT_START - 4}
                                y={rowY + ROW_INNER / 2}
                                textAnchor="end"
                                dominantBaseline="middle"
                                fontSize={du.chartLabel}
                                fill={t.primary}
                                fontWeight="700"
                                style={{ userSelect: 'none' }}
                              >
                                {i + 1}
                              </text>
                              <text
                                x={TEXT_START}
                                y={rowY + ROW_INNER / 2}
                                textAnchor="start"
                                dominantBaseline="middle"
                                fontSize={du.chartLabel}
                                fill={t.textMuted}
                                style={{ userSelect: 'none' }}
                              >
                                <title>{rawCap}</title>
                                {nomCap}
                              </text>
                              <rect
                                x={BAR_START}
                                y={yP}
                                width={wP}
                                height={BAR_H}
                                fill="#0077B6"
                                rx="2"
                                opacity={isSelected ? 1 : 0.88}
                                style={{ cursor: 'pointer' }}
                                onClick={() => { setDashDrill([{ campo: 'capitulo', valor: cap.capitulo }]); setPopupCapitulo(true) }}
                              />
                              <rect
                                x={BAR_START}
                                y={yC}
                                width={wC}
                                height={BAR_H}
                                fill={colorC}
                                rx="2"
                                opacity={isSelected ? 1 : 0.88}
                                style={{ cursor: 'pointer' }}
                                onClick={() => { setDashDrill([{ campo: 'capitulo', valor: cap.capitulo }]); setPopupCapitulo(true) }}
                              />
                              <rect
                                x={0}
                                y={rowY}
                                width={vbW}
                                height={ROW_INNER}
                                fill="transparent"
                                style={{ cursor: 'pointer' }}
                                onClick={() => { setDashDrill([{ campo: 'capitulo', valor: cap.capitulo }]); setPopupCapitulo(true) }}
                                onMouseEnter={() => {
                                  const tip = document.getElementById(tipId)
                                  if (tip) tip.style.display = 'block'
                                }}
                                onMouseLeave={() => {
                                  const tip = document.getElementById(tipId)
                                  if (tip) tip.style.display = 'none'
                                }}
                              />
                            </g>
                          )
                        })}
                        {[0, 25, 50, 75, 100].map(pct => {
                          const x = BAR_START + (pct / 100) * chartW
                          const val = maxVal * (pct / 100)
                          return (
                            <text key={`ax-${pct}`} x={x} y={chartBottom + 14} textAnchor="middle" fontSize={du.chartAxis} fill={t.textMuted} style={{ userSelect: 'none' }}>
                              {fmtM(val)}
                            </text>
                          )
                        })}
                        {comp.map((cap, i) => {
                          const rowY = PAD_TOP + i * ROW_H
                          const wP = Math.max(scaleW(cap.presupuesto || 0), 2)
                          const wC = Math.max(scaleW(cap.cobrado || 0), 2)
                          const sobrecosto = (cap.cobrado || 0) > (cap.presupuesto || 0)
                          const colorC = sobrecosto ? '#DC2626' : '#00A896'
                          const tipId = `tip-vs-h-${i}`
                          const tx = Math.min(BAR_START + Math.max(wP, wC) + 8, vbW - 222)
                          return (
                            <g key={`tip-${tipId}`} id={tipId} style={{ display: 'none', pointerEvents: 'none' }}>
                              <rect
                                x={tx}
                                y={Math.max(4, rowY - 4)}
                                width="215"
                                height="56"
                                rx="6"
                                fill={t.bgCard}
                                stroke={t.border}
                                strokeWidth="1"
                                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))' }}
                              />
                              <text x={tx + 10} y={Math.max(14, rowY + 6)} fontSize={du.chartTip} fontWeight="700" fill={t.text}>
                                {(cap.capitulo || '').length > 32 ? `${(cap.capitulo || '').slice(0, 32)}…` : (cap.capitulo || '')}
                              </text>
                              <rect x={tx + 10} y={Math.max(20, rowY + 12)} width="8" height="8" rx="1" fill="#0077B6" />
                              <text x={tx + 22} y={Math.max(28, rowY + 20)} fontSize={du.chartTip} fill={t.textMuted}>
                                Ppto: <tspan fontWeight="700" fill="#0077B6">{fmtD(cap.presupuesto)}</tspan>
                              </text>
                              <rect x={tx + 10} y={Math.max(34, rowY + 26)} width="8" height="8" rx="1" fill={colorC} />
                              <text x={tx + 22} y={Math.max(42, rowY + 34)} fontSize={du.chartTip} fill={t.textMuted}>
                                Obra: <tspan fontWeight="700" fill={colorC}>{fmtD(cap.cobrado)}</tspan>
                              </text>
                            </g>
                          )
                        })}
                      </svg>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', marginTop:'8px', justifyContent:'center' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:`${du.legend}px`, color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#0077B6' }}/> Presupuesto
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:`${du.legend}px`, color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#00A896' }}/> Obra Aprobada
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:`${du.legend}px`, color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#DC2626' }}/> Sobrecosto
                        </div>
                      </div>
                    </div>
                  )
                })()}
              {/* ── Drill → ahora vive en el popup ── */}
              </div>

              <div style={{
                background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'16px', boxShadow:t.shadow,
                flex: panelFoco==='ppto-cobro' ? '1 1 100%' : '1 1 calc(50% - 8px)', minWidth: panelFoco==='ppto-cobro' ? '100%' : 'min(300px, 100%)', boxSizing:'border-box',
                maxHeight: panelFoco==='ppto-cobro' ? 'none' : 'min(92vh, 780px)', overflowY:'auto',
              }}>
                <div style={{ marginBottom:'12px' }}>
                  <div style={{ fontSize:`${du.title}px`, fontWeight:'700', color:t.text }}>Validación por rol · SICOE Obra</div>
                  <div style={{ fontSize:`${du.sub}px`, color:t.textMuted, marginTop:'4px' }}>
                    Por defecto se usa el acta RPO cuyo período incluye hoy. Columnas: Interventoría (N3) · Residente (N2) · Inspector (N1).
                    Los importes en N2 solo cuentan si N1 = Aprobado; los de N3 solo si N1 y N2 = Aprobado. «Pendiente ítem» (sub_estado) no suma en el inspector.
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', marginTop:'10px' }}>
                    <span style={{ fontSize:`${du.sub}px`, color:t.textMuted }}>Acta RPO:</span>
                    <select
                      className={`cc-dashboard-acta-select cc-dashboard-acta-select--${themeIsDarkChrome(activeTheme) ? 'dark' : 'light'}`}
                      value={actaFiltroMatriz}
                      onChange={e => setActaFiltroMatriz(e.target.value)}
                      style={{
                        fontSize:`${du.body}px`,
                        padding:'6px 10px',
                        borderRadius:'6px',
                        border:`1px solid ${t.border}`,
                        background:t.bgCard,
                        color:t.text,
                        maxWidth:'min(420px, 100%)',
                        minHeight:'32px',
                        cursor:'pointer',
                        colorScheme: themeIsDarkChrome(activeTheme) ? 'dark' : 'light',
                      }}
                    >
                      {(() => {
                        const av = matrizValidacion?.acta_vigente
                        const filtro = matrizValidacion?.filtro
                        let labVig = '—'
                        if (matrizValidacionLoad && actaFiltroMatriz === 'vigente') {
                          labVig = 'Cargando acta en período…'
                        } else if (filtro === 'sin_vigente_todo_contrato') {
                          labVig = 'Sin acta RPO en período (todo el contrato)'
                        } else if (av && av.numero_rpo != null) {
                          const nom = (av.asignado_nombre || '').trim()
                          labVig = `Acta RPO ${av.numero_rpo}${nom ? ` · ${nom}` : ''}`
                        } else {
                          labVig = 'Sin acta en período'
                        }
                        return (
                          <option value="vigente" style={{ background:t.bgCard, color:t.text }}>{labVig}</option>
                        )
                      })()}
                      <option value="all" style={{ background:t.bgCard, color:t.text }}>Todo el contrato (histórico)</option>
                      {(() => {
                        const rpoRows = (actasListaMatriz || []).filter(
                          a => a && String(a.tipo_grupo || '').toUpperCase() === 'RPO' && a.numero_rpo != null && a.numero_rpo !== ''
                        )
                        const nums = rpoRows.map(a => Number(a.numero_rpo)).filter(n => !Number.isNaN(n))
                        const sorted = nums.length === rpoRows.length
                          ? [...new Set(nums)].sort((a, b) => b - a)
                          : [...new Set(rpoRows.map(a => a.numero_rpo))].sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }))
                        return sorted.map((n) => {
                          const row = rpoRows.find(r => String(r.numero_rpo) === String(n))
                          const nom = (row?.asignado_nombre || '').trim()
                          const lab = `Acta RPO ${n}${nom ? ` · ${nom}` : ''}`
                          return (
                            <option key={n} value={String(n)} style={{ background:t.bgCard, color:t.text }}>{lab}</option>
                          )
                        })
                      })()}
                    </select>
                    {matrizValidacionLoad && <span style={{ fontSize:`${du.sub}px`, color:t.textMuted }}>Cargando…</span>}
                  </div>
                </div>
                {(() => {
                  /* Filas pastel: en tema oscuro t.text es claro → ilegible; usar texto oscuro sobre fondo claro */
                  const textOnPastel = themeIsDarkChrome(activeTheme) ? '#0f172a' : t.text
                  const filas = [
                    { key: 'aprobado', label: 'APROBADO', bg: '#DCFCE7', dark: false },
                    { key: 'pendiente', label: 'PENDIENTES', bg: '#FEF9C3', dark: false },
                    { key: 'pendiente_item', label: 'PENDIENTES: ITEM PENDIENTE', bg: '#DBEAFE', dark: false },
                    { key: 'no_revisado', label: 'NO REVISADOS', bg: '#E9D5FF', dark: false },
                    { key: 'rechazado', label: 'RECHAZADOS', bg: '#FECACA', dark: false },
                    { key: 'habilitado', label: 'HABILITADO VALIDACIÓN', bg: '#374151', dark: true },
                    { key: 'otras_actas', label: 'PENDIENTES OTRAS ACTAS', bg: '#FEF9C3', dark: false },
                  ]
                  const emptyBloque = () => {
                    const z = () => ({ interventoria: 0, residente: 0, inspector: 0 })
                    return {
                      aprobado: z(), pendiente: z(), pendiente_item: z(), no_revisado: z(),
                      rechazado: z(), habilitado: z(), otras_actas: z(),
                    }
                  }
                  const mergeBloque = (bloque) => {
                    const e = emptyBloque()
                    if (!bloque || typeof bloque !== 'object') return e
                    for (const k of Object.keys(e)) {
                      if (bloque[k] && typeof bloque[k] === 'object') {
                        e[k] = { ...e[k], ...bloque[k] }
                      }
                    }
                    return e
                  }
                  const renderTabla = (titulo, bloque) => {
                    const b = mergeBloque(bloque)
                    return (
                      <div key={titulo} style={{ marginBottom:'18px' }}>
                        <div style={{ fontSize:`${du.sub}px`, fontWeight:'800', color:t.text, marginBottom:'8px', letterSpacing:'0.3px' }}>{titulo}</div>
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:`${du.table}px`, minWidth:'280px' }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign:'left', padding:'6px 4px', borderBottom:`1px solid ${t.border}`, color:t.textMuted, textTransform:'uppercase', fontSize:`${du.table}px` }}>Estado</th>
                                <th style={{ textAlign:'right', padding:'6px 4px', borderBottom:`1px solid ${t.border}`, color:t.textMuted, textTransform:'uppercase', fontSize:`${du.table}px` }}>Interventoría (N3)</th>
                                <th style={{ textAlign:'right', padding:'6px 4px', borderBottom:`1px solid ${t.border}`, color:t.textMuted, textTransform:'uppercase', fontSize:`${du.table}px` }}>Residente (N2)</th>
                                <th style={{ textAlign:'right', padding:'6px 4px', borderBottom:`1px solid ${t.border}`, color:t.textMuted, textTransform:'uppercase', fontSize:`${du.table}px` }}>Inspector (N1)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filas.map(row => {
                                const d = b[row.key] || {}
                                const tc = row.dark ? '#f9fafb' : textOnPastel
                                const tcLabel = row.dark ? '#fff' : textOnPastel
                                return (
                                  <tr key={row.key} style={{ background: row.bg }}>
                                    <td style={{ padding:'6px 4px', fontWeight:'700', color: tcLabel, fontSize:`${du.rowLabel}px` }}>{row.label}</td>
                                    <td style={{ textAlign:'right', padding:'6px 4px', color: tc, fontWeight:'600', fontSize:`${du.table}px` }}>{fmtD(d.interventoria)}</td>
                                    <td style={{ textAlign:'right', padding:'6px 4px', color: tc, fontWeight:'600', fontSize:`${du.table}px` }}>{fmtD(d.residente)}</td>
                                    <td style={{ textAlign:'right', padding:'6px 4px', color: tc, fontWeight:'600', fontSize:`${du.table}px` }}>{fmtD(d.inspector)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  }
                  if (!matrizValidacion && !matrizValidacionLoad) {
                    return <div style={{ fontSize:`${du.body}px`, color:t.textMuted, padding:'12px 0' }}>Sin datos de validación.</div>
                  }
                  return (
                    <>
                      {renderTabla('Obra ejecutada directo sin AIU', matrizValidacion?.obra_ejecutada_directo_sin_aiu)}
                      {renderTabla('Ensayos y sondeos directo sin IVA', matrizValidacion?.ensayos_sondeos_directo_sin_iva)}
                    </>
                  )
                })()}
              </div>
              </div>

            </div>

            {/* ══════════════ POPUP CAPÍTULO ══════════════ */}
            {popupCapitulo && dashDrill.length > 0 && (
              <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.65)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}
                onClick={() => { setPopupCapitulo(false); setDashDrill([]) }}>
                <div style={{ background:t.bgCard, borderRadius:'16px', width:'88vw', maxWidth:'1160px', height:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.55)', border:`1px solid ${t.border}` }}
                  onClick={e => e.stopPropagation()}>

                  {/* Header fijo */}
                  <div style={{ padding:'14px 24px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:t.bgCard }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'15px', fontWeight:'800', color:t.primary }}>📊 {dashDrill[0]?.valor}</span>
                      {dashDrill[1] && (
                        <>
                          <span style={{ fontSize:'13px', color:t.textMuted }}>›</span>
                          <span style={{ fontSize:'13px', fontWeight:'700', color:'#00A896', background:'#00A89618', borderRadius:'20px', padding:'3px 12px' }}>
                            Ítem: {dashDrill[1]?.valor}
                          </span>
                          {(() => {
                            const desc = dashTabla?.descripcion_item
                              || dashDrill[1]?.descripcion
                              || dashData?.find(d => d.item === dashDrill[1]?.valor)?.descripcion
                              || ''
                            return desc ? (
                              <span style={{ fontSize:'11px', color:t.textMuted, fontStyle:'italic', maxWidth:'400px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                — {desc}
                              </span>
                            ) : null
                          })()}
                          <button onClick={() => setDashDrill([dashDrill[0]])}
                            style={{ background:'transparent', border:'none', fontSize:'12px', color:t.textMuted, cursor:'pointer' }}>✕ volver a ítems</button>
                        </>
                      )}
                    </div>                    
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', flexShrink:0 }}>
                      <button
                        id="btn-exportar-xlsx"
                        title="Informe Excel"
                        onClick={async (e) => {
                          const btn = e.currentTarget
                          if (btn.disabled) return
                          btn.disabled = true; const orig = btn.innerHTML
                          btn.style.opacity='0.6'; btn.style.cursor='wait'
                          const tok = getToken()
                          const cap = encodeURIComponent(dashDrill[0]?.valor || '')
                          try {
                            // 1) Iniciar generación en background
                            btn.innerHTML = '⏳ Generando...'
                            const itemQ = dashDrill[1]?.valor
                              ? `&item=${encodeURIComponent(dashDrill[1].valor)}`
                              : ''
                            const res = await fetch(`${API}/sicoe-obra/${usuario.contrato_id}/dashboard-export-capitulo?capitulo=${cap}${itemQ}`, {
                              headers: { Authorization: `Bearer ${tok}` }
                            })
                            if (!res.ok) { alert('Error al iniciar exportación'); return }
                            const { job_id } = await res.json()
                            console.log('JOB_ID:', job_id)
                            // 2) Polling hasta que esté listo
                            let intentos = 0
                            while (intentos < 60) {
                              await new Promise(r => setTimeout(r, 3000))
                              intentos++
                              btn.innerHTML = `⏳ ${intentos * 3}s...`
                              let estado = ''
                              try {
                                const st = await fetch(`${API}/exportar/estado/${job_id}`, {
                                  headers: { Authorization: `Bearer ${tok}` }
                                })
                                if (st.ok) {
                                  const d = await st.json()
                                  estado = d.estado || ''
                                }
                              } catch { continue }
                              if (estado.startsWith('error')) { alert('Error generando Excel: ' + estado); break }
                              if (estado === 'listo') {
                                // 3) Descargar
                                btn.innerHTML = '⬇️ Descargando...'
                                const dl = await fetch(`${API}/exportar/descargar/${job_id}`, {
                                  headers: { Authorization: `Bearer ${tok}` }
                                })
                                const blob = await dl.blob()
                                const a = document.createElement('a')
                                a.href = URL.createObjectURL(blob)
                                a.download = `ClaraCore_${(dashDrill[0]?.valor||'').slice(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`
                                a.click(); URL.revokeObjectURL(a.href)
                                break
                              }
                            }
                          } catch { alert('Error de conexión') }
                          finally { btn.disabled=false; btn.innerHTML=orig; btn.style.opacity='1'; btn.style.cursor='pointer' }
                        }}
                        style={{ background:'transparent', color:'#1E8449', border:'1.5px solid #1E8449', borderRadius:'8px', padding:'5px 10px', fontSize:'16px', cursor:'pointer', lineHeight:1, transition:'all 0.15s' }}
                        onMouseEnter={e=>{ e.currentTarget.style.background='#1E8449'; e.currentTarget.style.color='#fff' }}
                        onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#1E8449' }}>
                        📊
                      </button>
                      <button onClick={() => { setPopupCapitulo(false); setDashDrill([]) }}
                        style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'5px 14px', fontSize:'13px', cursor:'pointer', color:t.textMuted }}>
                        ✕ Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Cuerpo scrolleable */}
                  <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>

                    {/* Mapa sticky */}
                    <div style={{ position:'sticky', top:0, zIndex:10, background:t.bgCard, padding:'14px 24px 10px', borderBottom:`1px solid ${t.border}44`, flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                        <span style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>🗺️ PLANO SEMÁFORO</span>
                        <span style={{ fontSize:'10px', color:t.textMuted }}>{Object.keys(miniMapaColores).length} PK_IDs</span>
                      </div>
                      <MiniMapaSemaforo t={t} colores={miniMapaColores} height={240} onPkidClick={dashDrill.length >= 2 ? abrirPopupPkid : null} />
                    </div>

                    {/* Área drill */}
                    <div style={{ padding:'16px 24px', flex:1 }}>

                      {/* Totales ítem */}
                      {dashDrill[1] && dashTabla && (() => {
                        const filas = dashTabla.rows || dashTabla.filas || []
                        const totalCantSicoe  = filas.reduce((s,f) => s + (f.cant_ppto||0), 0)
                        const totalCostSicoe  = filas.reduce((s,f) => s + (f.costo_ppto||0), 0)
                        const totalCantCobro  = filas.reduce((s,f) => s + (f.cant_sicoe||0), 0)
                        const totalCostCobro  = filas.reduce((s,f) => s + (f.costo_sicoe||0), 0)
                        const totalDeltaCant  = filas.reduce((s,f) => s + (f.delta_cant ?? ((f.cant_ppto||0)-(f.cant_sicoe||0))), 0)
                        const totalDeltaCosto = filas.reduce((s,f) => s + (f.delta_costo ?? ((f.costo_ppto||0)-(f.costo_sicoe||0))), 0)
                        const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                        return (
                          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#0077B6', background:'#0077B618', borderRadius:'20px', padding:'3px 10px' }}>Cant SICOE: {totalCantSicoe.toFixed(2)}</span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#0077B6', background:'#0077B618', borderRadius:'20px', padding:'3px 10px' }}>Costo SICOE: {fmtD(totalCostSicoe)}</span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#00A896', background:'#00A89618', borderRadius:'20px', padding:'3px 10px' }}>Cant Cobro: {totalCantCobro.toFixed(2)}</span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#00A896', background:'#00A89618', borderRadius:'20px', padding:'3px 10px' }}>Costo Cobro: {fmtD(totalCostCobro)}</span>
                            <span style={{ fontSize:'11px', color:t.textMuted }}>|</span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color: totalDeltaCant >= 0 ? '#10B981' : '#EF4444', background: totalDeltaCant >= 0 ? '#10B98118' : '#EF444418', borderRadius:'20px', padding:'3px 10px' }}>
                              Δ Cant: {totalDeltaCant >= 0 ? '+' : ''}{totalDeltaCant.toFixed(2)}
                            </span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color: totalDeltaCosto >= 0 ? '#10B981' : '#EF4444', background: totalDeltaCosto >= 0 ? '#10B98118' : '#EF444418', borderRadius:'20px', padding:'3px 10px' }}>
                              Δ Costo: {totalDeltaCosto >= 0 ? '+' : ''}{fmtD(totalDeltaCosto)}
                            </span>
                          </div>
                        )
                      })()}

                      {/* Nivel 1: ítems */}
                      {dashDrill.length === 1 && (
                        dashLoading ? (
                          <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>⏳ Cargando ítems...</div>
                        ) : dashData?.length > 0 ? (() => {
                          const POR_PAG = 15
                          const totalPags = Math.ceil(dashData.length / POR_PAG)
                          const paginaItems = dashDrillPag || 0
                          const slice = dashData.slice(paginaItems * POR_PAG, (paginaItems + 1) * POR_PAG)
                          const maxV = Math.max(...slice.map(d => Math.max(d.presupuesto||0, d.cobrado||0)), 1)
                          const BAR_W = 26, GAP = 10, PAD_L = 8, PAD_R = 8, H = 240, PAD_T = 14, PAD_B = 32
                          const totalW = PAD_L + slice.length * (BAR_W*2 + GAP + 8) + PAD_R
                          const scaleH = v => PAD_T + (1 - v/maxV) * (H - PAD_T - PAD_B)
                          const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                          return (
                            <div style={{ marginTop:'8px' }}>
                              {totalPags > 1 && (
                                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', flexWrap:'wrap' }}>
                                  <span style={{ fontSize:'10px', color:t.textMuted }}>{paginaItems*POR_PAG+1}–{Math.min((paginaItems+1)*POR_PAG, dashData.length)} de {dashData.length} ítems</span>
                                  <button onClick={() => setDashDrillPag(p => Math.max(0,p-1))} disabled={paginaItems===0}
                                    style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:paginaItems===0?'default':'pointer', color:paginaItems===0?t.textMuted:t.text }}>‹</button>
                                  {Array.from({length: totalPags}, (_,i) => (
                                    <button key={i} onClick={() => setDashDrillPag(i)}
                                      style={{ background:paginaItems===i?t.primary:'transparent', color:paginaItems===i?'#fff':t.textMuted, border:`1px solid ${paginaItems===i?t.primary:t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer' }}>{i+1}</button>
                                  ))}
                                  <button onClick={() => setDashDrillPag(p => Math.min(totalPags-1,p+1))} disabled={paginaItems===totalPags-1}
                                    style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:paginaItems===totalPags-1?'default':'pointer', color:paginaItems===totalPags-1?t.textMuted:t.text }}>›</button>
                                </div>
                              )}
                              <div style={{ width:'100%', overflowX:'auto' }}>
                                <svg width="100%" viewBox={`0 0 ${totalW} ${H}`} style={{ overflow:'visible', display:'block' }}>
                                  {[0,50,100].map(pct => { const y=PAD_T+(1-pct/100)*(H-PAD_T-PAD_B); return <line key={pct} x1={PAD_L} x2={totalW} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/> })}
                                  {slice.map((item, i) => {
                                    const x=PAD_L+i*(BAR_W*2+GAP+8), yP=scaleH(item.presupuesto||0), yC=scaleH(item.cobrado||0)
                                    const hP=H-PAD_B-yP, hC=H-PAD_B-yC
                                    const nomCorto=String(item.item||'').length>6?String(item.item||'').slice(0,6)+'…':String(item.item||'')
                                    return (
                                      <g key={i} onClick={() => setDashDrill([dashDrill[0], {campo:'item', valor:item.item, descripcion:item.descripcion||''}])} style={{cursor:'pointer'}}>
                                        <rect x={x} y={yP} width={BAR_W} height={Math.max(hP,2)} fill="#0077B6" rx="2" opacity="0.85"
                                          onMouseEnter={e=>{e.currentTarget.style.opacity='1';const tip=document.getElementById(`tip-drill-${i}`);if(tip)tip.style.display='block'}}
                                          onMouseLeave={e=>{e.currentTarget.style.opacity='0.85';const tip=document.getElementById(`tip-drill-${i}`);if(tip)tip.style.display='none'}}/>
                                        <rect x={x+BAR_W+2} y={yC} width={BAR_W} height={Math.max(hC,2)} fill="#00A896" rx="2" opacity="0.85"
                                          onMouseEnter={e=>{e.currentTarget.style.opacity='1';const tip=document.getElementById(`tip-drill-${i}`);if(tip)tip.style.display='block'}}
                                          onMouseLeave={e=>{e.currentTarget.style.opacity='0.85';const tip=document.getElementById(`tip-drill-${i}`);if(tip)tip.style.display='none'}}/>
                                        <text x={x+BAR_W} y={H-8} textAnchor="middle" fontSize="9" fill={t.textMuted}>{nomCorto}</text>
                                        <g id={`tip-drill-${i}`} style={{display:'none',pointerEvents:'none'}}>
                                          <rect x={Math.min(x-10,Math.max(totalW,300)-220)} y={H-PAD_B-100} width="215" height="100" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+10} y={H-PAD_B-84} fontSize="10" fontWeight="700" fill={t.text}>{String(item.item||'').length>24?String(item.item||'').slice(0,24)+'…':String(item.item||'')}</text>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+10} y={H-PAD_B-72} fontSize="8" fill={t.textMuted}>{String(item.descripcion||'').length>32?String(item.descripcion||'').slice(0,32)+'…':String(item.descripcion||'')}</text>
                                          <rect x={Math.min(x-10,Math.max(totalW,300)-220)+10} y={H-PAD_B-62} width="8" height="8" rx="1" fill="#0077B6"/>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+22} y={H-PAD_B-55} fontSize="9" fill={t.textMuted}>Ppto: <tspan fontWeight="700" fill="#0077B6">{fmtD(item.presupuesto)}</tspan></text>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+22} y={H-PAD_B-42} fontSize="9" fill={t.textMuted}>Cant: <tspan fontWeight="700" fill="#0077B6">{(item.cant_ppto||0).toFixed(2)}</tspan></text>
                                          <rect x={Math.min(x-10,Math.max(totalW,300)-220)+10} y={H-PAD_B-32} width="8" height="8" rx="1" fill="#00A896"/>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+22} y={H-PAD_B-25} fontSize="9" fill={t.textMuted}>Cobro: <tspan fontWeight="700" fill="#00A896">{fmtD(item.cobrado)}</tspan></text>
                                          <text x={Math.min(x-10,Math.max(totalW,300)-220)+22} y={H-PAD_B-12} fontSize="9" fill={t.textMuted}>Cant: <tspan fontWeight="700" fill="#00A896">{(item.cant_cobro||0).toFixed(2)}</tspan></text>
                                        </g>
                                      </g>
                                    )
                                  })}
                                </svg>
                              </div>
                              <div style={{ display:'flex', gap:'12px', marginTop:'6px', justifyContent:'center' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:t.textMuted }}><div style={{ width:'10px', height:'10px', borderRadius:'2px', background:'#0077B6' }}/> Presupuesto</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:t.textMuted }}><div style={{ width:'10px', height:'10px', borderRadius:'2px', background:'#00A896' }}/> Cobro</div>
                              </div>
                            </div>
                          )
                        })() : <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>Sin ítems</div>
                      )}

                      {/* Nivel 2: tabla PK_ID */}
                      {dashDrill.length >= 2 && (
                        dashTablaLoad ? (
                          <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>⏳ Cargando tabla...</div>
                        ) : dashTabla ? (
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                              <thead>
                                <tr>{['PK_ID','Cant. SICOE','Costo SICOE','Cant. Cobro','Costo Cobro','Δ Cant','Δ Costo'].map(h => (
                                  <th key={h} style={{ padding:'6px 8px', fontSize:'10px', fontWeight:'700', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody>
                                {(dashTabla.rows || dashTabla.filas || []).map((row, i) => {
                                  const dCant  = row.delta_cant  ?? ((row.cant_ppto||0)-(row.cant_sicoe||0))
                                  const dCosto = row.delta_costo ?? ((row.costo_ppto||0)-(row.costo_sicoe||0))
                                  const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                                  return (
                                    <tr key={i} style={{ background: i%2===0?'transparent':t.bg+'88' }}>
                                      <td style={{ padding:'5px 8px', fontWeight:'600', color:t.primary, textAlign:'right' }}>{row.pk_id||row.id_pol||'—'}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:t.text }}>{(row.cant_ppto||0).toFixed(2)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:'#0077B6', fontWeight:'600' }}>{fmtD(row.costo_ppto)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:t.text }}>{(row.cant_sicoe||0).toFixed(2)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:'#00A896', fontWeight:'600' }}>{fmtD(row.costo_sicoe)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:dCant>=0?'#10B981':'#EF4444', fontWeight:'600' }}>{dCant>=0?'+':''}{dCant.toFixed(2)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', color:dCosto>=0?'#10B981':'#EF4444', fontWeight:'600' }}>{dCosto>=0?'+':''}{fmtD(dCosto)}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>Sin datos</div>
                      )}

                    </div>{/* fin área drill */}
                  </div>{/* fin cuerpo scroll */}
                </div>{/* fin popup card */}
              </div>
            )}{/* fin popup capítulo */}

            </>}

            {dashTab === 'analisis' && (() => {
              const fmtD2 = n => n!=null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
              const fmtM2 = n => { if(n==null) return '$0'; const abs=Math.abs(n); const sign=n<0?'-':''; if(abs>=1e9) return `${sign}$${(abs/1e9).toFixed(1)}B`; if(abs>=1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`; if(abs>=1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`; return `${sign}$${Math.round(abs)}` }
              const nSobre = analisisFiltrado.filter(r=>r.estado==='SOBRECOBRO').length
              const nSub   = analisisFiltrado.filter(r=>r.estado==='SUBCOBRO').length
              const nEq    = analisisFiltrado.filter(r=>r.estado==='EQUILIBRIO').length
              const sumSobre = analisisFiltrado.filter(r=>r.estado==='SOBRECOBRO').reduce((s,r)=>s+Math.abs(r.delta_costo),0)
              const sumSub   = analisisFiltrado.filter(r=>r.estado==='SUBCOBRO').reduce((s,r)=>s+r.delta_costo,0)
              const top10 = [...analisisFiltrado].sort((a,b)=>Math.abs(b.delta_costo)-Math.abs(a.delta_costo)).slice(0,10)
              const ANA_PAG = 20
              const totalPagsA = Math.ceil(analisisFiltrado.length / ANA_PAG)
              const sliceA = analisisFiltrado.slice(analisisPag*ANA_PAG, (analisisPag+1)*ANA_PAG)
              function thClick(key) {
                if (analisisSortCol===key) setAnalisisSortDir(d=>d==='asc'?'desc':'asc')
                else { setAnalisisSortCol(key); setAnalisisSortDir('desc') }
              }
              const COLS = [
                {key:'capitulo',    label:'Capítulo',    align:'left'},
                {key:'nombre',      label:'Ítem',        align:'left'},
                {key:'descripcion', label:'Descripción', align:'left'},
                {key:'cant_ppto',   label:'Cant PPTO',   align:'right'},
                {key:'presupuesto', label:'Costo PPTO',  align:'right'},
                {key:'cant_cobro',  label:'Cant Cobro',  align:'right'},
                {key:'cobrado',     label:'Costo Cobro', align:'right'},
                {key:'delta_cant',  label:'Δ Cant',      align:'right'},
                {key:'delta_costo', label:'Δ Costo',     align:'right'},
                {key:'pct',         label:'% Ejec.',     align:'right'},
                {key:'estado',      label:'Estado',      align:'center'},
              ]
              return <>
                {/* ── Filtros ── */}
                <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'12px 16px', marginBottom:'14px', boxShadow:t.shadow }}>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:'2px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'7px', padding:'2px' }}>
                      {[['capitulo','Capítulo'],['item','Ítem']].map(([k,l]) => (
                        <button key={k} onClick={()=>{setAnalisisNivel(k);setAnalisisSeleccion(null)}} style={{ background:analisisNivel===k?t.primary:'transparent', color:analisisNivel===k?'#fff':t.textMuted, border:'none', borderRadius:'5px', padding:'5px 12px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>{l}</button>
                      ))}
                    </div>
                    <select value={analisisDir} onChange={e=>{setAnalisisDir(e.target.value);setAnalisisPag(0)}} style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'11px', cursor:'pointer', outline:'none' }}>
                      <option value="todos">🔵 Todos los registros</option>
                      <option value="sobrecobro">🔴 Sobrecobro — Cobro &gt; PPTO</option>
                      <option value="subcobro">🟡 Subcobro — PPTO &gt; Cobro</option>
                      <option value="equilibrio">🟢 En equilibrio (±5%)</option>
                    </select>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:t.textMuted }}>
                      <span>|Δ| desde</span>
                      <input type="number" min="0" placeholder="0" value={analisisRangoMin} onChange={e=>{setAnalisisRangoMin(e.target.value);setAnalisisPag(0)}} style={{ width:'68px', background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:'6px', padding:'5px 7px', color:t.text, fontSize:'11px', outline:'none' }}/>
                      <span>hasta</span>
                      <input type="number" min="0" placeholder="∞" value={analisisRangoMax} onChange={e=>{setAnalisisRangoMax(e.target.value);setAnalisisPag(0)}} style={{ width:'68px', background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:'6px', padding:'5px 7px', color:t.text, fontSize:'11px', outline:'none' }}/>
                      <span style={{fontSize:'10px'}}>millones COP</span>
                    </div>
                    {(analisisDir!=='todos'||analisisRangoMin||analisisRangoMax) && (
                      <button onClick={()=>{setAnalisisDir('todos');setAnalisisRangoMin('');setAnalisisRangoMax('');setAnalisisPag(0)}} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>✕ Limpiar filtros</button>
                    )}
                    <div style={{ marginLeft:'auto', fontSize:'11px', color:t.textMuted, fontStyle:'italic' }}>
                      {analisisLoading ? '⏳ Cargando datos...' : `${analisisFiltrado.length} registros`}
                    </div>
                  </div>
                </div>

                {/* ── Layout 2 columnas: Mapa + KPI chips ── */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'14px', marginBottom:'14px', alignItems:'start' }}>

                  {/* Mapa semáforo */}
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'12px 14px', boxShadow:t.shadow }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>🗺️ Plano Semáforo</div>
                      {analisisSeleccion ? (
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <span style={{ fontSize:'10px', background:t.primary+'18', color:t.primary, borderRadius:'20px', padding:'2px 10px', fontWeight:'700' }}>
                            {analisisSeleccion.item ? `Ítem: ${analisisSeleccion.item}` : `Cap: ${analisisSeleccion.capitulo?.slice(0,24)}`}
                          </span>
                          <button onClick={()=>setAnalisisSeleccion(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'13px', padding:'0' }}>✕</button>
                        </div>
                      ) : (
                        <span style={{ fontSize:'10px', color:t.textMuted, fontStyle:'italic' }}>← Clic en una fila para ver en el plano</span>
                      )}
                    </div>
                    <MiniMapaSemaforo
                      t={t}
                      colores={analisisMapaColores}
                      height={260}
                      bearing={270}
                      onPkidClick={analisisSeleccion ? abrirAnalisisMapaPopup : null}
                    />
                    <div style={{ fontSize:'10px', color:t.textMuted, marginTop:'6px', textAlign:'center' }}>
                      {Object.keys(analisisMapaColores).length > 0
                        ? `${Object.keys(analisisMapaColores).length} PK_IDs activos — clic en polígono para detalle`
                        : analisisSeleccion ? 'Sin PK_IDs para este registro' : 'Selecciona una fila de la tabla'}
                    </div>
                  </div>

                  {/* KPI chips apilados a la derecha */}
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {[
                      {key:'sobrecobro', label:'SOBRECOBRO', count:nSobre, amount:sumSobre,  color:'#EF4444', icon:'🔴', sub:'Cobro excede el presupuesto'},
                      {key:'subcobro',   label:'SUBCOBRO',   count:nSub,   amount:sumSub,    color:'#F59E0B', icon:'🟡', sub:'Saldo PPTO sin ejecutar'},
                      {key:'equilibrio', label:'EQUILIBRIO', count:nEq,    amount:null,      color:'#10B981', icon:'🟢', sub:'Desviación dentro de ±5%'},
                    ].map(k => (
                      <div key={k.label}
                        onClick={()=>{setAnalisisDir(d=>d===k.key?'todos':k.key);setAnalisisPag(0)}}
                        style={{ background:t.bgCard, border:`1px solid ${analisisDir===k.key?k.color:k.color+'44'}`, borderRadius:'10px', padding:'10px 14px', boxShadow:t.shadow, borderLeft:`4px solid ${k.color}`, cursor:'pointer', transition:'border 0.15s', opacity:analisisDir!=='todos'&&analisisDir!==k.key?0.5:1 }}>
                        <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'1.5px', marginBottom:'3px' }}>{k.icon} {k.label}</div>
                        <div style={{ fontSize:'20px', fontWeight:'800', color:k.color, lineHeight:1, marginBottom:'2px' }}>{k.count} <span style={{fontSize:'11px',fontWeight:'400'}}>registros</span></div>
                        {k.amount!=null && <div style={{ fontSize:'10px', fontWeight:'700', color:k.color }}>{fmtD2(k.amount)}</div>}
                        <div style={{ fontSize:'9px', color:t.textMuted, marginTop:'2px' }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Top 10 desviaciones absolutas ── */}
                {!analisisLoading && top10.length > 0 && (
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'14px 16px', marginBottom:'14px', boxShadow:t.shadow }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:t.text, marginBottom:'10px' }}>
                      ⚡ Top 10 — Mayor Desviación Absoluta de Costo
                      <span style={{ fontSize:'10px', fontWeight:'400', color:t.textMuted, marginLeft:'8px' }}>sobre los registros filtrados</span>
                    </div>
                    {top10.map((r,i) => {
                      const maxAbs = Math.abs(top10[0].delta_costo)||1
                      const pctBar = Math.abs(r.delta_costo)/maxAbs*100
                      const color = r.estado==='SOBRECOBRO'?'#EF4444':r.estado==='SUBCOBRO'?'#F59E0B':'#10B981'
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
                          <div style={{ fontSize:'10px', color:t.textMuted, width:'24px', textAlign:'right', flexShrink:0 }}>#{i+1}</div>
                          <div style={{ fontSize:'10px', color:t.text, width:'150px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.nombre}>{r.nombre}</div>
                          {analisisNivel==='item' && <div style={{ fontSize:'9px', color:t.textMuted, width:'80px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.capitulo}>{r.capitulo}</div>}
                          <div style={{ flex:1, height:'14px', background:t.border, borderRadius:'4px', overflow:'hidden' }}>
                            <div style={{ width:`${pctBar}%`, height:'100%', background:color, borderRadius:'4px', transition:'width 0.5s ease' }}/>
                          </div>
                          <div style={{ fontSize:'10px', fontWeight:'700', color, width:'80px', textAlign:'right', flexShrink:0 }}>{r.delta_costo>0?'+':''}{fmtM2(r.delta_costo)}</div>
                          <div style={{ fontSize:'10px', color:t.textMuted, width:'36px', textAlign:'right', flexShrink:0 }}>{Math.min(r.pct,999)}%</div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── Tabla sortable ── */}
                {analisisLoading ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>⏳ Cargando datos de análisis...</div>
                ) : analisisFiltrado.length===0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin registros para los filtros seleccionados</div>
                ) : (
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', boxShadow:t.shadow, overflow:'hidden' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:`1px solid ${t.border}` }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>📋 Detalle — {analisisFiltrado.length} registros</div>
                      {totalPagsA > 1 && (
                        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                          <button onClick={()=>setAnalisisPag(p=>Math.max(0,p-1))} disabled={analisisPag===0} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 7px', fontSize:'11px', cursor:analisisPag===0?'default':'pointer', color:analisisPag===0?t.textMuted:t.text }}>‹</button>
                          <span style={{ fontSize:'10px', color:t.textMuted }}>{analisisPag+1}/{totalPagsA}</span>
                          <button onClick={()=>setAnalisisPag(p=>Math.min(totalPagsA-1,p+1))} disabled={analisisPag===totalPagsA-1} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 7px', fontSize:'11px', cursor:analisisPag===totalPagsA-1?'default':'pointer', color:analisisPag===totalPagsA-1?t.textMuted:t.text }}>›</button>
                        </div>
                      )}
                    </div>
                    <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'420px' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                        <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                          <tr style={{ background:t.bg }}>
                            {COLS.map(col => (
                              <th key={col.key} onClick={()=>thClick(col.key)} style={{ padding:'8px 10px', fontSize:'10px', fontWeight:'700', color:analisisSortCol===col.key?t.primary:t.textMuted, textAlign:col.align, cursor:'pointer', whiteSpace:'nowrap', userSelect:'none', borderBottom:`2px solid ${t.border}` }}>
                                {col.label}{analisisSortCol===col.key?(analisisSortDir==='asc'?' ↑':' ↓'):''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sliceA.map((r,i) => {
                            const colorD = r.estado==='SOBRECOBRO'?'#EF4444':r.estado==='SUBCOBRO'?'#F59E0B':'#10B981'
                            const badgeBg = r.estado==='SOBRECOBRO'?'#EF444418':r.estado==='SUBCOBRO'?'#F59E0B18':'#10B98118'
                            const selKey = analisisNivel==='item' ? r.nombre : r.nombre
                            const isSelected = analisisSeleccion && (analisisNivel==='item' ? analisisSeleccion.item===r.nombre && analisisSeleccion.capitulo===r.capitulo : analisisSeleccion.capitulo===r.nombre)
                            return (
                              <tr key={i}
                                onClick={()=>setAnalisisSeleccion(analisisNivel==='item' ? {capitulo:r.capitulo, item:r.nombre} : {capitulo:r.nombre, item:null})}
                                style={{ borderBottom:`1px solid ${t.border}44`, background: isSelected ? t.primary+'18' : i%2===0?'transparent':t.bg+'44', cursor:'pointer', outline: isSelected ? `2px solid ${t.primary}44` : 'none', transition:'background 0.1s' }}>
                                <td style={{ padding:'6px 10px', fontSize:'10px', color:t.textMuted, maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.capitulo}>{r.capitulo}</td>
                                <td style={{ padding:'6px 10px', fontWeight:'700', color:isSelected?t.primary:t.primary, whiteSpace:'nowrap' }}>{r.nombre}</td>
                                <td style={{ padding:'6px 10px', fontSize:'10px', color:t.textMuted, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.descripcion}>{r.descripcion || '—'}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.textMuted }}>{(r.cant_ppto||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.text }}>{fmtM2(r.presupuesto)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.textMuted }}>{(r.cant_cobro||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.text }}>{fmtM2(r.cobrado)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:'700', color:r.delta_cant>0?'#10B981':r.delta_cant<0?'#EF4444':t.textMuted }}>{r.delta_cant>0?'+':''}{(r.delta_cant||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:'700', color:colorD }}>{r.delta_costo>0?'+':''}{fmtM2(r.delta_costo)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'4px', justifyContent:'flex-end' }}>
                                    <div style={{ width:'28px', height:'5px', background:t.border, borderRadius:'3px', overflow:'hidden' }}>
                                      <div style={{ width:`${Math.min(100,Math.max(0,r.pct))}%`, height:'100%', background:colorD, borderRadius:'3px' }}/>
                                    </div>
                                    <span style={{ color:colorD, fontWeight:'700', minWidth:'30px' }}>{Math.min(r.pct,999)}%</span>
                                  </div>
                                </td>
                                <td style={{ padding:'6px 10px', textAlign:'center' }}>
                                  <span style={{ background:badgeBg, color:colorD, borderRadius:'20px', padding:'2px 8px', fontSize:'9px', fontWeight:'700' }}>{r.estado}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            })()}

            {dashTab === 'liquidacion' && usuario?.contrato_fase === 'LIQUIDACION' && (() => {
              const fmtD2 = n => n!=null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
              const fmtM2 = n => { if(n==null) return '$0'; const abs=Math.abs(n); const sign=n<0?'-':''; if(abs>=1e9) return `${sign}$${(abs/1e9).toFixed(1)}B`; if(abs>=1e6) return `${sign}$${(abs/1e6).toFixed(1)}M`; if(abs>=1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`; return `${sign}$${Math.round(abs)}` }
              const nSuper  = liqFiltrado.filter(r=>r.categoria==='SUPERCOBRO').length
              const nDev    = liqFiltrado.filter(r=>r.categoria==='DEVOLUCION').length
              const nCobrar = liqFiltrado.filter(r=>r.categoria==='POR_COBRAR').length
              const nEjec   = (liqData||[]).filter(r=>r.categoria==='EJECUCION').length
              const sumSuper  = liqFiltrado.filter(r=>r.categoria==='SUPERCOBRO').reduce((s,r)=>s+Math.abs(r.delta_costo),0)
              const sumDev    = liqFiltrado.filter(r=>r.categoria==='DEVOLUCION').reduce((s,r)=>s+Math.abs(r.delta_costo),0)
              const sumCobrar = liqFiltrado.filter(r=>r.categoria==='POR_COBRAR').reduce((s,r)=>s+r.delta_costo,0)
              const top10liq  = [...liqFiltrado].sort((a,b)=>Math.abs(b.delta_costo)-Math.abs(a.delta_costo)).slice(0,10)
              const LIQ_PAG = 20
              const totalPagsL = Math.ceil(liqFiltrado.length / LIQ_PAG)
              const sliceL = liqFiltrado.slice(liqPag*LIQ_PAG, (liqPag+1)*LIQ_PAG)
              const CAT_COLOR = { SUPERCOBRO:'#EF4444', DEVOLUCION:'#F59E0B', POR_COBRAR:'#10B981', EQUILIBRIO:'#6B7280' }
              function liqThClick(key) {
                if (liqSortCol===key) setLiqSortDir(d=>d==='asc'?'desc':'asc')
                else { setLiqSortCol(key); setLiqSortDir('asc') }
              }
              const LIQ_COLS = [
                {key:'capitulo',     label:'Capítulo',      align:'left'},
                {key:'nombre',       label:'Ítem',          align:'left'},
                {key:'descripcion',  label:'Descripción',   align:'left'},
                {key:'cant_recalc',  label:'Cant Recalc.',  align:'right'},
                {key:'recalculado',  label:'Costo Recalc.', align:'right'},
                {key:'cant_cobro',   label:'Cant Cobro',    align:'right'},
                {key:'cobrado',      label:'Costo Cobro',   align:'right'},
                {key:'delta_cant',   label:'Δ Cant',        align:'right'},
                {key:'delta_costo',  label:'Δ Costo',       align:'right'},
                {key:'pct',          label:'% Ejec.',       align:'right'},
                {key:'categoria',    label:'Categoría',     align:'center'},
              ]
              return <>
                {/* Filtros */}
                <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'12px 16px', marginBottom:'14px', boxShadow:t.shadow }}>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:'2px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'7px', padding:'2px' }}>
                      {[['item','Ítem'],['capitulo','Capítulo']].map(([k,l]) => (
                        <button key={k} onClick={()=>{setLiqNivel(k);setLiqSeleccion(null)}} style={{ background:liqNivel===k?t.primary:'transparent', color:liqNivel===k?'#fff':t.textMuted, border:'none', borderRadius:'5px', padding:'5px 12px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>{l}</button>
                      ))}
                    </div>
                    <select value={liqDir} onChange={e=>{setLiqDir(e.target.value);setLiqPag(0)}} style={{ background:t.inputBg, border:`1px solid ${t.inputBorder}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'11px', cursor:'pointer', outline:'none' }}>
                      <option value="todos">🔵 Todas las categorías</option>
                      <option value="SUPERCOBRO">🔴 Supercobro — excede +$20M</option>
                      <option value="DEVOLUCION">🟡 Por Devolución — excede hasta $20M</option>
                      <option value="POR_COBRAR">🟢 Por Cobrar — recalc mayor al cobro</option>
                    </select>
                    {liqDir !== 'todos' && (
                      <button onClick={()=>{setLiqDir('todos');setLiqPag(0)}} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>✕ Limpiar</button>
                    )}
                    <div style={{ marginLeft:'auto', fontSize:'11px', color:t.textMuted, fontStyle:'italic' }}>
                      {liqLoading ? '⏳ Cargando...' : `${liqFiltrado.length} registros · ${nEjec} ítems de solo ejecución (excluidos)`}
                    </div>
                  </div>
                </div>

                {/* Mapa + KPI chips */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'14px', marginBottom:'14px', alignItems:'start' }}>
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'12px 14px', boxShadow:t.shadow }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>🗺️ Plano — Cobro vs Recalculado</div>
                      {liqSeleccion ? (
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <span style={{ fontSize:'10px', background:t.primary+'18', color:t.primary, borderRadius:'20px', padding:'2px 10px', fontWeight:'700' }}>
                            {liqSeleccion.item ? `Ítem: ${liqSeleccion.item}` : `Cap: ${liqSeleccion.capitulo?.slice(0,24)}`}
                          </span>
                          <button onClick={()=>setLiqSeleccion(null)} style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'13px' }}>✕</button>
                        </div>
                      ) : <span style={{ fontSize:'10px', color:t.textMuted, fontStyle:'italic' }}>← Clic en fila para ver en plano</span>}
                    </div>
                    <MiniMapaSemaforo t={t} colores={liqMapaColores} height={260} bearing={270} onPkidClick={liqSeleccion ? abrirLiqMapaPopup : null} />
                    <div style={{ fontSize:'10px', color:t.textMuted, marginTop:'6px', textAlign:'center' }}>
                      {Object.keys(liqMapaColores).length > 0 ? `${Object.keys(liqMapaColores).length} PK_IDs activos` : liqSeleccion ? 'Sin PK_IDs para este registro' : 'Selecciona una fila'}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {[
                      {key:'SUPERCOBRO', label:'SUPERCOBRO',    count:nSuper,  amount:sumSuper,  color:'#EF4444', icon:'🔴', sub:'Cobro excede recalc en más de $20M'},
                      {key:'DEVOLUCION', label:'POR DEVOLUCIÓN',count:nDev,    amount:sumDev,    color:'#F59E0B', icon:'🟡', sub:'Excede recalc hasta $20M'},
                      {key:'POR_COBRAR', label:'POR COBRAR',    count:nCobrar, amount:sumCobrar, color:'#10B981', icon:'🟢', sub:'Recalculado mayor al cobro'},
                    ].map(k => (
                      <div key={k.key} onClick={()=>{setLiqDir(d=>d===k.key?'todos':k.key);setLiqPag(0)}}
                        style={{ background:t.bgCard, border:`1px solid ${liqDir===k.key?k.color:k.color+'44'}`, borderRadius:'10px', padding:'10px 14px', boxShadow:t.shadow, borderLeft:`4px solid ${k.color}`, cursor:'pointer', opacity:liqDir!=='todos'&&liqDir!==k.key?0.5:1 }}>
                        <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'1.5px', marginBottom:'3px' }}>{k.icon} {k.label}</div>
                        <div style={{ fontSize:'20px', fontWeight:'800', color:k.color, lineHeight:1, marginBottom:'2px' }}>{k.count} <span style={{fontSize:'11px',fontWeight:'400'}}>registros</span></div>
                        <div style={{ fontSize:'10px', fontWeight:'700', color:k.color }}>{fmtD2(k.amount)}</div>
                        <div style={{ fontSize:'9px', color:t.textMuted, marginTop:'2px' }}>{k.sub}</div>
                      </div>
                    ))}
                    <div style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 14px', fontSize:'10px', color:t.textMuted }}>
                      ℹ️ <strong>{nEjec}</strong> ítems de solo ejecución excluidos del análisis
                    </div>
                  </div>
                </div>

                {/* Top 10 */}
                {!liqLoading && top10liq.length > 0 && (
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'14px 16px', marginBottom:'14px', boxShadow:t.shadow }}>
                    <div style={{ fontSize:'12px', fontWeight:'700', color:t.text, marginBottom:'10px' }}>⚡ Top 10 — Mayor Desviación Absoluta</div>
                    {top10liq.map((r,i) => {
                      const maxAbs = Math.abs(top10liq[0].delta_costo)||1
                      const color = CAT_COLOR[r.categoria] || t.textMuted
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
                          <div style={{ fontSize:'10px', color:t.textMuted, width:'24px', textAlign:'right', flexShrink:0 }}>#{i+1}</div>
                          <div style={{ fontSize:'10px', color:t.text, width:'150px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nombre}</div>
                          <div style={{ fontSize:'9px', color:t.textMuted, width:'80px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.capitulo}</div>
                          <div style={{ flex:1, height:'14px', background:t.border, borderRadius:'4px', overflow:'hidden' }}>
                            <div style={{ width:`${Math.abs(r.delta_costo)/maxAbs*100}%`, height:'100%', background:color, borderRadius:'4px' }}/>
                          </div>
                          <div style={{ fontSize:'10px', fontWeight:'700', color, width:'80px', textAlign:'right', flexShrink:0 }}>{fmtM2(r.delta_costo)}</div>
                          <span style={{ fontSize:'9px', background:color+'18', color, borderRadius:'10px', padding:'1px 7px', flexShrink:0 }}>{r.categoria}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Tabla */}
                {liqLoading ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>⏳ Cargando datos de liquidación...</div>
                ) : liqFiltrado.length===0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>Sin registros para los filtros seleccionados</div>
                ) : (
                  <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', boxShadow:t.shadow, overflow:'hidden' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:`1px solid ${t.border}` }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>⚖️ Liquidación — {liqFiltrado.length} registros</div>
                      {totalPagsL > 1 && (
                        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                          <button onClick={()=>setLiqPag(p=>Math.max(0,p-1))} disabled={liqPag===0} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 7px', fontSize:'11px', cursor:liqPag===0?'default':'pointer', color:liqPag===0?t.textMuted:t.text }}>‹</button>
                          <span style={{ fontSize:'10px', color:t.textMuted }}>{liqPag+1}/{totalPagsL}</span>
                          <button onClick={()=>setLiqPag(p=>Math.min(totalPagsL-1,p+1))} disabled={liqPag===totalPagsL-1} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 7px', fontSize:'11px', cursor:liqPag===totalPagsL-1?'default':'pointer', color:liqPag===totalPagsL-1?t.textMuted:t.text }}>›</button>
                        </div>
                      )}
                    </div>
                    <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'420px' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                        <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                          <tr style={{ background:t.bg }}>
                            {LIQ_COLS.map(col => (
                              <th key={col.key} onClick={()=>liqThClick(col.key)} style={{ padding:'8px 10px', fontSize:'10px', fontWeight:'700', color:liqSortCol===col.key?t.primary:t.textMuted, textAlign:col.align, cursor:'pointer', whiteSpace:'nowrap', userSelect:'none', borderBottom:`2px solid ${t.border}` }}>
                                {col.label}{liqSortCol===col.key?(liqSortDir==='asc'?' ↑':' ↓'):''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sliceL.map((r,i) => {
                            const color = CAT_COLOR[r.categoria] || t.textMuted
                            const bgBadge = (CAT_COLOR[r.categoria] || '#6B7280') + '18'
                            const isSelected = liqSeleccion && (liqSeleccion.item ? liqSeleccion.item===r.nombre && liqSeleccion.capitulo===r.capitulo : liqSeleccion.capitulo===r.nombre)
                            return (
                              <tr key={i}
                                onClick={()=>setLiqSeleccion({capitulo:r.capitulo, item:r.nombre})}
                                style={{ borderBottom:`1px solid ${t.border}44`, background:isSelected?t.primary+'18':i%2===0?'transparent':t.bg+'44', cursor:'pointer' }}>
                                <td style={{ padding:'6px 10px', fontSize:'10px', color:t.textMuted, maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.capitulo}</td>
                                <td style={{ padding:'6px 10px', fontWeight:'700', color:t.primary, whiteSpace:'nowrap' }}>{r.nombre}</td>
                                <td style={{ padding:'6px 10px', fontSize:'10px', color:t.textMuted, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.descripcion}>{r.descripcion||'—'}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.textMuted }}>{(r.cant_recalc||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.text }}>{fmtM2(r.recalculado)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.textMuted }}>{(r.cant_cobro||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', color:t.text }}>{fmtM2(r.cobrado)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:'700', color:r.delta_cant>0?'#10B981':r.delta_cant<0?'#EF4444':t.textMuted }}>{r.delta_cant>0?'+':''}{(r.delta_cant||0).toFixed(2)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:'700', color }}>{r.delta_costo>0?'+':''}{fmtM2(r.delta_costo)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'4px', justifyContent:'flex-end' }}>
                                    <div style={{ width:'28px', height:'5px', background:t.border, borderRadius:'3px', overflow:'hidden' }}>
                                      <div style={{ width:`${Math.min(100,Math.max(0,r.pct))}%`, height:'100%', background:color, borderRadius:'3px' }}/>
                                    </div>
                                    <span style={{ color, fontWeight:'700', minWidth:'30px' }}>{Math.min(r.pct,999)}%</span>
                                  </div>
                                </td>
                                <td style={{ padding:'6px 10px', textAlign:'center' }}>
                                  <span style={{ background:bgBadge, color, borderRadius:'20px', padding:'2px 8px', fontSize:'9px', fontWeight:'700' }}>{r.categoria}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            })()}
          </>
        })()}

{/* ── Popup PK_ID Liquidación ── */}
        {liqMapaPopup && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setLiqMapaPopup(null)}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'780px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:t.textMuted }}>{liqSeleccion?.capitulo}</div>
                  <div style={{ fontSize:'12px', fontWeight:'800', color:t.primary, marginTop:'2px' }}>
                    {liqSeleccion?.item} — {liqMapaPopup.data?.ppto?.[0]?.descripcion || liqMapaPopup.data?.cobro?.[0]?.descripcion || ''}
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'3px' }}>PK_ID: <strong style={{ color:t.text }}>{liqMapaPopup.pkid}</strong></div>
                </div>
                <button onClick={() => setLiqMapaPopup(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>
              {liqMapaPopupLoad ? (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>⏳ Cargando...</div>
              ) : liqMapaPopup.data ? (() => {
                const { ppto, cobro, totales } = liqMapaPopup.data
                const fmtD3 = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                const fmtN3 = n => n != null ? Number(n).toFixed(2) : '—'
                const thS = { padding:'6px 10px', fontSize:'10px', fontWeight:'700', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
                const tdS = { padding:'6px 10px', fontSize:'11px', color:t.text, borderBottom:`1px solid ${t.border}` }
                return (
                  <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
                      <div style={{ background:t.bg, borderRadius:'10px', overflow:'hidden' }}>
                        <div style={{ padding:'8px 12px', fontSize:'11px', fontWeight:'700', color:'#0077B6', borderBottom:`1px solid ${t.border}` }}>📋 Recalculado ({ppto?.length||0} registros)</div>
                        {ppto?.length > 0 ? (
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead><tr>{['ID_Pol','Nodo Ini','Nodo Fin','Cant','Costo'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                            <tbody>{ppto.map((p,i)=><tr key={i}><td style={tdS}>{p.id_polilinia}</td><td style={tdS}>{p.nodo_ini}</td><td style={tdS}>{p.nodo_fin}</td><td style={tdS}>{fmtN3(p.cantidad)}</td><td style={tdS}>{fmtD3(p.costo_directo)}</td></tr>)}</tbody>
                          </table>
                        ) : <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'12px' }}>Sin registros recalculados</div>}
                      </div>
                      <div style={{ background:t.bg, borderRadius:'10px', overflow:'hidden' }}>
                        <div style={{ padding:'8px 12px', fontSize:'11px', fontWeight:'700', color:'#00A896', borderBottom:`1px solid ${t.border}` }}>💰 Cobro ({cobro?.length||0} registros)</div>
                        {cobro?.length > 0 ? (
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead><tr>{['Registro','Acta','Tramo Ini','Tramo Fin','Cant','Costo'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                            <tbody>{cobro.map((c,i)=><tr key={i}><td style={{...tdS,color:'#00A896',fontWeight:'700'}}>{c.id}</td><td style={tdS}>{c.acta}</td><td style={tdS}>{c.nodo_ini}</td><td style={tdS}>{c.nodo_fin}</td><td style={tdS}>{fmtN3(c.cantidad)}</td><td style={tdS}>{fmtD3(c.costo_directo)}</td></tr>)}</tbody>
                          </table>
                        ) : <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'12px' }}>Sin registros de cobro</div>}
                      </div>
                    </div>
                    {totales && (
                      <div style={{ borderTop:`2px solid ${t.border}`, paddingTop:'10px', display:'flex', gap:'8px', flexWrap:'nowrap', overflowX:'auto' }}>
                        {[
                          { label:'Cant. Recalc.',  val: fmtN3(totales.cant_ppto),   color:'#0077B6' },
                          { label:'Costo Recalc.',  val: fmtD3(totales.costo_ppto),  color:'#0077B6' },
                          { label:'Cant. Cobro',    val: fmtN3(totales.cant_cobro),  color:'#00A896' },
                          { label:'Costo Cobro',    val: fmtD3(totales.costo_cobro), color:'#00A896' },
                          { label:'Δ Cantidad',     val: `${totales.delta_cant>=0?'+':''}${fmtN3(totales.delta_cant)}`,   color:totales.delta_cant>=0?'#10B981':'#EF4444' },
                          { label:'Δ Costo',        val: `${totales.delta_costo>=0?'+':''}${fmtD3(totales.delta_costo)}`, color:totales.delta_costo>=0?'#10B981':'#EF4444' },
                        ].map(({label,val,color}) => (
                          <div key={label} style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', flex:1, minWidth:'100px' }}>
                            <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.4px', marginBottom:'2px', whiteSpace:'nowrap' }}>{label}</div>
                            <div style={{ fontSize:'12px', fontWeight:'800', color, whiteSpace:'nowrap' }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })() : <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>Sin datos</div>}
            </div>
          </div>
        )}
        {popupPkid && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setPopupPkid(null)}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'780px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:t.textMuted }}>
                    {dashDrill[0]?.valor}
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:'800', color:t.primary, marginTop:'2px' }}>
                    {dashDrill[1]?.valor} — {popupPkid.data?.ppto?.[0]?.descripcion || popupPkid.data?.cobro?.[0]?.descripcion || ''}
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'3px' }}>
                    PK_ID: <strong style={{ color:t.text }}>{popupPkid.pkid}</strong>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  {dwgEnlazadoDash && (
                    <button
                      onClick={() => enviarZoomPkid(popupPkid.pkid)}
                      disabled={zoomingPkid}
                      title="Zoom a este PK_ID en AutoCAD"
                      style={{ background: zoomingPkid ? '#10B981' : t.primary, border:'none', borderRadius:'8px', padding:'6px 14px', color:'#fff', fontSize:'12px', fontWeight:'700', cursor: zoomingPkid ? 'default' : 'pointer', transition:'all 0.3s', opacity: zoomingPkid ? 0.85 : 1 }}>
                      {zoomingPkid ? '✅ Enviado a AutoCAD' : '🎯 Ver en AutoCAD'}
                    </button>
                  )}
                  <button onClick={() => setPopupPkid(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
                </div>
              </div>

              {popupLoading ? (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>⏳ Cargando...</div>
              ) : popupPkid.data ? (() => {
                const { ppto, cobro, totales } = popupPkid.data
                const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                const fmtN = n => n != null ? Number(n).toFixed(2) : '—'
                const thS = { padding:'6px 10px', fontSize:'10px', fontWeight:'700', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
                const tdS = { padding:'6px 10px', fontSize:'11px', color:t.text, borderBottom:`1px solid ${t.border}` }
                return (
                  <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px' }}>
                    {/* Dos columnas */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
                      {/* PRESUPUESTO */}
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:'#0077B6', marginBottom:'8px', padding:'6px 10px', background:'#0077B611', borderRadius:'6px' }}>
                          📋 Presupuesto ({ppto.length} registros)
                        </div>
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead>
                              <tr>{['ID_Pol','Nodo Ini','Nodo Fin','Cant','Costo'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {ppto.length === 0
                                ? <tr><td colSpan={5} style={{...tdS, textAlign:'center', color:t.textMuted}}>Sin registros</td></tr>
                                : ppto.map((r,i) => (
                                  <tr key={i} style={{ cursor:'pointer' }} onClick={() => setDashDetallePpto(r)}>
                                    <td style={{...tdS, fontWeight:'600', color:t.primary, textDecoration:'underline'}}>{r.id_pol || '—'}</td>
                                    <td style={tdS}>{r.no_inicio || '—'}</td>
                                    <td style={tdS}>{r.no_final || '—'}</td>
                                    <td style={{...tdS, textAlign:'right'}}>{fmtN(r.cant_total)}</td>
                                    <td style={{...tdS, textAlign:'right'}}>{fmtD(r.costo_directo)}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {/* COBRO */}
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:'700', color:'#00A896', marginBottom:'8px', padding:'6px 10px', background:'#00A89611', borderRadius:'6px' }}>
                          💰 Cobro ({cobro.length} registros)
                        </div>
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead>
                              <tr>{['Registro','Acta','Tramo Ini','Tramo Fin','Cant','Costo'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {cobro.length === 0
                                ? <tr><td colSpan={5} style={{...tdS, textAlign:'center', color:t.textMuted}}>Sin registros</td></tr>
                                : cobro.map((r,i) => (
                                  <tr key={i} style={{ cursor:'pointer' }} onClick={async () => {
                                    const res = await fetch(`${API_URL}/sicoe-obra/${contratoIdDash}/reportes/${r.reporte_id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
                                    const data = await res.json()
                                    if (data?.id) { setDashCarpetaReporte({ ...data, _autoRegistro: r.registro_id }); setDashRegistroNumero(r.registro_id) }
                                  }}>
                                    <td style={{...tdS, fontWeight:'600', color:'#00A896', textDecoration:'underline'}}>{r.registro || '—'}</td>
                                    <td style={tdS}>{r.acta || '—'}</td>
                                    <td style={tdS}>{r.tramo_inicio || '—'}</td>
                                    <td style={tdS}>{r.tramo_final || '—'}</td>
                                    <td style={{...tdS, textAlign:'right'}}>{fmtN(r.cantidad || r.longitud)}</td>
                                    <td style={{...tdS, textAlign:'right'}}>{fmtD(r.costo_directo)}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* Footer deltas */}
                    <div style={{ borderTop:`2px solid ${t.border}`, paddingTop:'10px', display:'flex', gap:'8px', flexWrap:'nowrap', overflowX:'auto' }}>
                      {[
                        { label:'Cant. Ppto',  val: fmtN(totales.cant_ppto),   color:'#0077B6' },
                        { label:'Costo Ppto',  val: fmtD(totales.costo_ppto),  color:'#0077B6' },
                        { label:'Cant. Cobro', val: fmtN(totales.cant_cobro),  color:'#00A896' },
                        { label:'Costo Cobro', val: fmtD(totales.costo_cobro), color:'#00A896' },
                        { label:'Δ Cantidad',  val: `${totales.delta_cant >= 0?'+':''}${fmtN(totales.delta_cant)}`,   color: totales.delta_cant  >= 0 ? '#10B981' : '#EF4444' },
                        { label:'Δ Costo',     val: `${totales.delta_costo >= 0?'+':''}${fmtD(totales.delta_costo)}`, color: totales.delta_costo >= 0 ? '#10B981' : '#EF4444' },
                      ].map(({label, val, color}) => (
                        <div key={label} style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', flex:1, minWidth:'100px' }}>
                          <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.4px', marginBottom:'2px', whiteSpace:'nowrap' }}>{label}</div>
                          <div style={{ fontSize:'12px', fontWeight:'800', color, whiteSpace:'nowrap' }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })() : (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>Sin datos</div>
              )}
            </div>
          </div>
        )}

{/* ── Popup PK_ID desde tab Análisis ── */}
        {analisisMapaPopup && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setAnalisisMapaPopup(null)}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'780px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:t.textMuted }}>{analisisSeleccion?.capitulo}</div>
                  <div style={{ fontSize:'12px', fontWeight:'800', color:t.primary, marginTop:'2px' }}>
                    {analisisSeleccion?.item && `${analisisSeleccion.item} — `}{analisisMapaPopup.data?.ppto?.[0]?.descripcion || analisisMapaPopup.data?.cobro?.[0]?.descripcion || ''}
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'3px' }}>PK_ID: <strong style={{ color:t.text }}>{analisisMapaPopup.pkid}</strong></div>
                </div>
                <button onClick={() => setAnalisisMapaPopup(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>
              {analisisMapaPopupLoading ? (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>⏳ Cargando...</div>
              ) : analisisMapaPopup.data ? (() => {
                const { ppto, cobro, totales } = analisisMapaPopup.data
                const fmtD3 = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                const fmtN3 = n => n != null ? Number(n).toFixed(2) : '—'
                const thS = { padding:'6px 10px', fontSize:'10px', fontWeight:'700', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
                const tdS = { padding:'6px 10px', fontSize:'11px', color:t.text, borderBottom:`1px solid ${t.border}` }
                return (
                  <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
                      <div style={{ background:t.bg, borderRadius:'10px', overflow:'hidden' }}>
                        <div style={{ padding:'8px 12px', fontSize:'11px', fontWeight:'700', color:'#0077B6', borderBottom:`1px solid ${t.border}`, background:'#0077B608' }}>📋 Presupuesto ({ppto?.length||0} registros)</div>
                        {ppto?.length > 0 ? (
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead><tr>{['ID_Pol','Nodo Ini','Nodo Fin','Cant','Costo'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                            <tbody>{ppto.map((p,i)=><tr key={i}><td style={tdS}>{p.id_polilinia}</td><td style={tdS}>{p.nodo_ini}</td><td style={tdS}>{p.nodo_fin}</td><td style={tdS}>{fmtN3(p.cantidad)}</td><td style={tdS}>{fmtD3(p.costo_directo)}</td></tr>)}</tbody>
                          </table>
                        ) : <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'12px' }}>Sin registros</div>}
                      </div>
                      <div style={{ background:t.bg, borderRadius:'10px', overflow:'hidden' }}>
                        <div style={{ padding:'8px 12px', fontSize:'11px', fontWeight:'700', color:'#00A896', borderBottom:`1px solid ${t.border}`, background:'#00A89608' }}>💰 Cobro ({cobro?.length||0} registros)</div>
                        {cobro?.length > 0 ? (
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead><tr>{['Registro','Acta','Tramo Ini','Tramo Fin','Cant','Costo'].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
                            <tbody>{cobro.map((c,i)=><tr key={i}><td style={{...tdS,color:'#00A896',fontWeight:'700'}}>{c.id}</td><td style={tdS}>{c.acta}</td><td style={tdS}>{c.nodo_ini}</td><td style={tdS}>{c.nodo_fin}</td><td style={tdS}>{fmtN3(c.cantidad)}</td><td style={tdS}>{fmtD3(c.costo_directo)}</td></tr>)}</tbody>
                          </table>
                        ) : <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'12px' }}>Sin registros</div>}
                      </div>
                    </div>
                    {totales && (
                      <div style={{ borderTop:`2px solid ${t.border}`, paddingTop:'10px', display:'flex', gap:'8px', flexWrap:'nowrap', overflowX:'auto' }}>
                        {[
                          { label:'Cant. Ppto',  val: fmtN3(totales.cant_ppto),   color:'#0077B6' },
                          { label:'Costo Ppto',  val: fmtD3(totales.costo_ppto),  color:'#0077B6' },
                          { label:'Cant. Cobro', val: fmtN3(totales.cant_cobro),  color:'#00A896' },
                          { label:'Costo Cobro', val: fmtD3(totales.costo_cobro), color:'#00A896' },
                          { label:'Δ Cantidad',  val: `${totales.delta_cant>=0?'+':''}${fmtN3(totales.delta_cant)}`,   color: totales.delta_cant>=0?'#10B981':'#EF4444' },
                          { label:'Δ Costo',     val: `${totales.delta_costo>=0?'+':''}${fmtD3(totales.delta_costo)}`, color: totales.delta_costo>=0?'#10B981':'#EF4444' },
                        ].map(({label,val,color}) => (
                          <div key={label} style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'5px 10px', flex:1, minWidth:'100px' }}>
                            <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.4px', marginBottom:'2px', whiteSpace:'nowrap' }}>{label}</div>
                            <div style={{ fontSize:'12px', fontWeight:'800', color, whiteSpace:'nowrap' }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })() : <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>Sin datos</div>}
            </div>
          </div>
        )}

        {/* ── MÓDULO PRESUPUESTO ── */}
        {dashDetallePpto && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setDashDetallePpto(null)}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'500px', maxWidth:'96vw', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={{ fontSize:'16px', fontWeight:'700', color:t.primary }}>📋 {dashDetallePpto.id_pol || '—'}</div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  <button onClick={() => {
                    const r = dashDetallePpto
                    const esTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                    if (!esTablet && r.x_label && r.y_label) {
                      window.location.href = `claralink://zoom?x=${r.x_label}&y=${r.y_label}&radio=20&handle=${r.ent_handle||''}`
                    } else if (dwgEnlazadoDash && popupPkid?.pkid) {
                      enviarZoomPkid(popupPkid.pkid)
                    }
                  }} style={{ background:t.primary, border:'none', borderRadius:'8px', padding:'6px 14px', color:'#fff', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                    🎯 Ver en AutoCAD
                  </button>
                  <button onClick={() => setDashDetallePpto(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {[
                  ['Nodo Inicio', dashDetallePpto.no_inicio],
                  ['Nodo Final',  dashDetallePpto.no_final],
                  ['Cantidad',    dashDetallePpto.cant_total],
                  ['Costo Directo', new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(dashDetallePpto.costo_directo || 0)],
                  ['Ítem', dashDetallePpto.item],
                  ['Descripción', dashDetallePpto.descripcion],
                ].map(([label, val]) => val ? (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:'12px', borderBottom:`1px solid ${t.border}`, paddingBottom:'8px' }}>
                    <span style={{ fontSize:'12px', color:t.textMuted, fontWeight:'600' }}>{label}</span>
                    <span style={{ fontSize:'12px', color:t.text, textAlign:'right' }}>{val}</span>
                  </div>
                ) : null)}
              </div>
            </div>
          </div>
        )}
        {dashCarpetaReporte && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <CarpetaReporte
              t={t} usuario={usuario} API_URL={API_URL} contrato_id={contratoIdDash}
              reporte={dashCarpetaReporte}
              actasList={[]}
              onClose={() => { setDashCarpetaReporte(null); setDashRegistroNumero(null) }}
              onActualizar={() => { setDashCarpetaReporte(null); setDashRegistroNumero(null) }}
            />
          </div>
        )}
        {moduloActivo === 'presupuesto' && <ModuloPresupuesto t={t} usuario={usuario} token={getToken()} s={s} navRegistroId={navRegistroId} onNavRegistroConsumed={() => setNavRegistroId(null)} />}


        {moduloActivo === 'sicoe_obra' && <ModuloSicoeObra t={t} usuario={usuario} token={getToken()} s={s} navRegistroNumero={navRegistroNumero} onNavReporteConsumed={() => setNavRegistroNumero(null)} />}

        {moduloActivo === 'informes' && (
          tienePermisoInformesCcd ? (
            <ModuloInformes t={t} usuario={usuario} token={getToken()} s={s} fontSize={fontSize} />
          ) : (
            <div style={{ ...s.card, maxWidth: '560px', margin: '0 auto', textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: t.text, marginBottom: '10px' }}>Informes CCD</div>
              <div style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.5 }}>
                Tu cargo no tiene permiso para este módulo. Un administrador puede habilitarlo en Panel admin → Control de accesos → función «Informes CCD» (acción Ver).
              </div>
            </div>
          )
        )}

        {/* ── Módulos próximamente ── */}
        {['almacen','gantt'].includes(moduloActivo) && (
          <div style={{ textAlign:'center', padding:'80px 20px', color:t.textMuted, fontSize:'15px' }}>
            {moduloActivo === 'almacen' ? '🏪' : '📅'} Módulo próximamente
          </div>
        )}
        {moduloActivo === 'semaforo' && (
          <ModuloPlanoSemaforo t={t} usuario={usuario} token={getToken()} />
        )}

        </div>{/* fin contenido principal */}
      </div>{/* fin layout flex */}

      {/* Modal crear contrato — guarda en Supabase */}
      {showModalContrato && (
        <div style={s.overlay} onClick={() => setShowModalContrato(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: t.primary, marginBottom: '24px' }}>📋 Crear Nuevo Contrato</div>
            <label style={s.label}>NÚMERO DE CONTRATO *</label>
            <input style={s.input} placeholder="Ej: IDU-1551-2017" value={nuevoContrato.numero} onChange={e => setNuevoContrato({ ...nuevoContrato, numero: e.target.value })} />
            <label style={s.label}>OBJETO DEL CONTRATO</label>
            <input style={s.input} placeholder="Descripción del objeto contractual" value={nuevoContrato.objeto} onChange={e => setNuevoContrato({ ...nuevoContrato, objeto: e.target.value })} />
            <label style={s.label}>CONTRATISTA *</label>
            <input style={s.input} placeholder="Razón social" value={nuevoContrato.contratista} onChange={e => setNuevoContrato({ ...nuevoContrato, contratista: e.target.value })} />
            <label style={s.label}>NIT</label>
            <input style={s.input} placeholder="Ej: 900.123.456-7" value={nuevoContrato.nit} onChange={e => setNuevoContrato({ ...nuevoContrato, nit: e.target.value })} />
            <label style={s.label}>LISTADO DE PRECIOS (CSV)</label>
            <label style={{ display: 'block', background: t.bg, border: `2px dashed ${t.border}`, borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', color: t.textMuted, fontSize: '13px', marginBottom: '16px' }}>
              {csvNombre ? `✅ ${csvNombre}` : '📂 Haz clic para cargar CSV'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSV} />
            </label>
            {errorContrato && <div style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>{errorContrato}</div>}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModalContrato(false)} style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '8px', padding: '10px 20px', color: t.textMuted, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleGuardarContrato} disabled={savingContrato} style={{ background: t.primary, border: 'none', borderRadius: '8px', padding: '10px 24px', color: '#fff', fontWeight: '600', cursor: savingContrato ? 'wait' : 'pointer', opacity: savingContrato ? 0.7 : 1 }}>
                {savingContrato ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdmin && (
        <AdminPanel
          user={usuario}
          token={getToken()}
          onClose={() => setShowAdmin(false)}
          activeTheme={activeTheme}
        />
      )}
    </div>
  )
}

const FONT_SIZES = { pequena: '12px', normal: '14px', grande: '16px' }

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [themeMode, setThemeMode] = useState(loadStoredThemeMode)
  const [activeTheme, setActiveTheme] = useState(() => {
    const m = loadStoredThemeMode()
    return m === 'auto' ? getAutoTheme() : m
  })
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('claracore_font_size') || 'normal')
  const [modal, setModal] = useState(null)
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_usuario')) } catch { return null }
  })

  // ── Detección de nueva versión ─────────────────────────────────────────────
  const [hayNuevaVersion, setHayNuevaVersion] = useState(false)
  useEffect(() => {
    let htmlBaseline = null
    // Captura el html inicial como baseline
    fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.text())
      .then(html => { htmlBaseline = html })
      .catch(() => {})
    const intervalo = setInterval(async () => {
      if (!htmlBaseline) return
      try {
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
        const html = await res.text()
        if (html !== htmlBaseline) {
          setHayNuevaVersion(true)
          clearInterval(intervalo)
        }
      } catch { /* silencioso */ }
    }, 2 * 60 * 1000) // cada 2 minutos
    return () => clearInterval(intervalo)
  }, [])

  const t = themes[activeTheme]

  function handleTheme(mode) {
    setThemeMode(mode)
    setActiveTheme(mode === 'auto' ? getAutoTheme() : mode)
    try { localStorage.setItem(THEME_MODE_STORAGE_KEY, mode) } catch { /* ignore */ }
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', FONT_SIZES[fontSize])
  }, [fontSize])

  const cambiarFuente = (tamano) => {
    localStorage.setItem('claracore_font_size', tamano)
    setFontSize(tamano)
  }

  const [pendingUser, setPendingUser] = useState(null)
  const [pendingContratos, setPendingContratos] = useState([])
  const [bannerMsg, setBannerMsg] = useState(null)
  const [perfilModalAbierto, setPerfilModalAbierto] = useState(false)
  const [cumpleModalAbierto, setCumpleModalAbierto] = useState(false)

  function aplicarPerfilServidor(fresh) {
    setUsuario((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        ...fresh,
        contrato_id: prev.contrato_id,
        contrato_numero: prev.contrato_numero,
        _contratos: prev._contratos,
        logo_contratista: prev.logo_contratista,
        logo_interventoria: prev.logo_interventoria,
      }
      const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
      storage.setItem('cc_usuario', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    if (!usuario?.id || !usuario?.fecha_nacimiento) return
    const s = String(usuario.fecha_nacimiento).slice(0, 10)
    const parts = s.split('-')
    if (parts.length < 3) return
    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    if (!month || !day) return
    const now = new Date()
    if (now.getMonth() + 1 !== month || now.getDate() !== day) return
    const year = now.getFullYear()
    const key = `cc_cumple_${usuario.id}_${year}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    setCumpleModalAbierto(true)
  }, [usuario?.id, usuario?.fecha_nacimiento])

  // Sincronizar perfil (p. ej. políticas) al iniciar sesión con caché antigua en localStorage
  useEffect(() => {
    if (!usuario?.id) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/usuarios/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok || cancelled) return
        const fresh = await res.json()
        setUsuario(prev => {
          if (!prev || cancelled) return prev
          const next = {
            ...prev,
            ...fresh,
            contrato_id: prev.contrato_id,
            contrato_numero: prev.contrato_numero,
            _contratos: prev._contratos,
            logo_contratista: prev.logo_contratista,
            logo_interventoria: prev.logo_interventoria,
          }
          const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
          storage.setItem('cc_usuario', JSON.stringify(next))
          return next
        })
      } catch { /* silencioso */ }
    })()
    return () => { cancelled = true }
  }, [usuario?.id])

  // ── Inactividad y renovación de token ───────────────────────────────────
  const usuarioRef = useRef(usuario)
  const lastActivityRef = useRef(Date.now())
  const INACTIVITY_LIMIT = 60 * 60 * 1000      // 60 min → cerrar sesión
  const WARN_BEFORE     = 5  * 60 * 1000        // avisar 5 min antes
  const REFRESH_INTERVAL = 50 * 60 * 1000       // renovar token a los 50 min de actividad

  useEffect(() => { usuarioRef.current = usuario }, [usuario])

  // Rastrear actividad del usuario
  useEffect(() => {
    if (!usuario) return
    const touch = () => { lastActivityRef.current = Date.now() }
    window.addEventListener('mousemove', touch)
    window.addEventListener('keydown', touch)
    window.addEventListener('click', touch)
    window.addEventListener('scroll', touch)
    return () => {
      window.removeEventListener('mousemove', touch)
      window.removeEventListener('keydown', touch)
      window.removeEventListener('click', touch)
      window.removeEventListener('scroll', touch)
    }
  }, [usuario])

  useEffect(() => {
    if (!usuario) return
    const id = setInterval(async () => {
      const token = getToken()
      if (!token) return

      const inactivo = Date.now() - lastActivityRef.current

      // Cerrar sesión por inactividad
      if (inactivo >= INACTIVITY_LIMIT) {
        clearInterval(id)
        const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
        storage.removeItem('cc_token')
        storage.removeItem('cc_usuario')
        setUsuario(null)
        setBannerMsg('🔒 Sesión cerrada por inactividad. Inicia sesión nuevamente.')
        return
      }

      // Advertir 5 min antes
      if (inactivo >= INACTIVITY_LIMIT - WARN_BEFORE) {
        const mins = Math.ceil((INACTIVITY_LIMIT - inactivo) / 60000)
        setBannerMsg(`⚠️ Tu sesión expirará en ${mins} minuto${mins !== 1 ? 's' : ''} por inactividad.`)
      }

      // Renovar token si el usuario ha estado activo (inactivo < 50 min)
      if (inactivo < REFRESH_INTERVAL) {
        try {
          const refreshRes = await fetch(`${API}/auth/refresh`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          })
          if (refreshRes.ok) {
            const { access_token } = await refreshRes.json()
            const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
            storage.setItem('cc_token', access_token)
          } else if (refreshRes.status === 401) {
            // Token ya venció en el servidor
            const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
            storage.removeItem('cc_token')
            storage.removeItem('cc_usuario')
            setUsuario(null)
            setBannerMsg('🔒 Tu sesión expiró. Inicia sesión nuevamente.')
            return
          }
        } catch { /* silencioso */ }
      }

      // Polling de cambios de perfil (cargo, permisos, etc.)
      try {
        const freshToken = getToken()
        const res = await fetch(`${API}/usuarios/me`, {
          headers: { Authorization: `Bearer ${freshToken}` }
        })
        if (!res.ok) return
        const fresh = await res.json()
        const prev = usuarioRef.current
        const permisosChanged =
          JSON.stringify((fresh.permisos || []).map(p => `${p.funcion_id}-${p.ver}-${p.crear}-${p.editar}-${p.eliminar}-${p.validar}-${p.exportar}`).sort()) !==
          JSON.stringify((prev.permisos  || []).map(p => `${p.funcion_id}-${p.ver}-${p.crear}-${p.editar}-${p.eliminar}-${p.validar}-${p.exportar}`).sort())
        const profileChanged =
          fresh.nombre !== prev.nombre ||
          fresh.apellidos !== prev.apellidos ||
          String(fresh.fecha_nacimiento || '') !== String(prev.fecha_nacimiento || '') ||
          String(fresh.foto_perfil_url || '') !== String(prev.foto_perfil_url || '') ||
          String(fresh.firma_imagen_url || '') !== String(prev.firma_imagen_url || '') ||
          fresh.politicas_aceptadas !== prev.politicas_aceptadas
        const adminChanged =
          fresh.cargo_id    !== prev.cargo_id   ||
          fresh.rol_id      !== prev.rol_id     ||
          fresh.estado      !== prev.estado     ||
          fresh.contrato_id !== prev.contrato_id ||
          permisosChanged
        if (adminChanged || profileChanged) {
          const updated = {
            ...prev, ...fresh,
            contrato_id:      prev.contrato_id,
            contrato_numero:  prev.contrato_numero,
            _contratos:       prev._contratos,
            logo_contratista: prev.logo_contratista,
            logo_interventoria: prev.logo_interventoria,
          }
          const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
          storage.setItem('cc_usuario', JSON.stringify(updated))
          setUsuario(updated)
          if (adminChanged) {
            const msgs = []
            if (fresh.cargo_id    !== prev.cargo_id)    msgs.push('cargo')
            if (fresh.contrato_id !== prev.contrato_id) msgs.push('contrato')
            if (fresh.estado      !== prev.estado)      msgs.push('estado')
            if (permisosChanged)                         msgs.push('permisos')
            setBannerMsg(`⚡ Tu ${msgs.join(', ')} fue actualizado por el administrador.`)
          }
        }
      } catch { /* silencioso */ }
    }, 60000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [mantenimiento, setMantenimiento] = useState(null)
  const [cuentaRegresiva, setCuentaRegresiva] = useState(null)
  const [esperandoFinMantenimiento, setEsperandoFinMantenimiento] = useState(false)
  const [apiDegraded, setApiDegraded] = useState(false)
  const apiHealthFailStreakRef = useRef(0)
  const apiHealthWarnedRef = useRef(false)

  useEffect(() => {
    const timeoutMs = 28000
    const intervalMs = 90 * 1000
    const markOk = () => {
      apiHealthFailStreakRef.current = 0
      apiHealthWarnedRef.current = false
      setApiDegraded(false)
    }
    const markFail = (reason, err) => {
      apiHealthFailStreakRef.current += 1
      if (apiHealthFailStreakRef.current < 2) return
      setApiDegraded(true)
      if (!apiHealthWarnedRef.current) {
        apiHealthWarnedRef.current = true
        console.warn(
          '[ClaraCore] Sin respuesta fiable del servidor. En Red (F12), si ves 502 Bad Gateway, Azure no está sirviendo el API (reinicio, falta de memoria o saturación); ' +
            'el mensaje de CORS es consecuencia de eso, no de orígenes mal configurados.',
        )
        logApiFailure(`healthz (${reason})`, err)
      }
    }
    const run = async () => {
      try {
        const opt =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? { signal: AbortSignal.timeout(timeoutMs) }
            : {}
        const r = await fetch(`${API}/healthz`, opt)
        if (r.ok) markOk()
        else markFail(`HTTP ${r.status}`, new Error(`HTTP ${r.status}`))
      } catch (e) {
        markFail('red/timeout', e)
      }
    }
    run()
    const iv = setInterval(run, intervalMs)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    // Con Azure en frío las respuestas pueden tardar minutos; sin cuerpo HTTP el navegador muestra "CORS" aunque el fallo sea timeout.
    const pollMs = mantenimiento?.activo ? 10000 : 40000
    const checkMant = async () => {
      try {
        const opt =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? { signal: AbortSignal.timeout(28000) }
            : {}
        const r = await fetch(`${API}/mantenimiento`, opt)
        if (r.ok) {
          const d = await r.json()
          if (d.activo) {
            setMantenimiento(d)
            setEsperandoFinMantenimiento(false)
            setCuentaRegresiva(prev => {
              const serverValue = Number.isFinite(d.segundos_restantes) ? d.segundos_restantes : null
              if (serverValue === null) return prev ?? 20
              if (prev === null) return serverValue
              return Math.min(prev, serverValue)
            })
          } else {
            if (mantenimiento?.activo || esperandoFinMantenimiento) {
              window.location.reload()
              return
            }
            setMantenimiento(null)
            setCuentaRegresiva(null)
          }
        }
      } catch { /* silencioso: red, timeout o instancia Azure aún arrancando */ }
    }
    checkMant()
    const iv = setInterval(checkMant, pollMs)
    return () => clearInterval(iv)
  }, [mantenimiento?.activo, esperandoFinMantenimiento])

  useEffect(() => {
    if (cuentaRegresiva === null) return
    if (cuentaRegresiva <= 0) {
      setCuentaRegresiva(0)
      setEsperandoFinMantenimiento(true)
      return
    }
    const t = setTimeout(() => setCuentaRegresiva(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [cuentaRegresiva])

  async function handleLoginOk(u, token) {
    try {
      const res = await fetch(`${API}/admin/usuario-contratos/${u.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        const contratos = res.ok ? await res.json() : []
      const uConContratos = { ...u, _contratos: contratos }
      const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
      storage.setItem('cc_usuario', JSON.stringify(uConContratos))
if (contratos.length > 1) {
        setPendingUser({ ...uConContratos, _token: token })
        setPendingContratos(contratos)
        setModal('selector_contrato')
      } else {
        if (contratos.length === 1) {
          const c = contratos[0]
          const uWithLogos = {
            ...uConContratos,
            contrato_id:        uConContratos.contrato_id        ?? c.id,
            contrato_numero:    uConContratos.contrato_numero    ?? c.numero,
            logo_contratista:   uConContratos.logo_contratista   ?? c.logo_contratista   ?? null,
            logo_interventoria: uConContratos.logo_interventoria ?? c.logo_interventoria ?? null,
            contrato_fase:      c.fase ?? 'PRESUPUESTO',
          }
          const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
          storage.setItem('cc_usuario', JSON.stringify(uWithLogos))
          setUsuario(uWithLogos)
        } else {
          setUsuario(uConContratos)
        }
        setModal(null)
      }
    } catch {
      setUsuario(u); setModal(null)
    }
  }

  async function handleSeleccionarContrato(contratoId) {
    const contrato = pendingContratos.find(c => c.id === parseInt(contratoId))
    const u = { ...pendingUser, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista ?? null, logo_interventoria: contrato.logo_interventoria ?? null, contrato_fase: contrato.fase ?? 'PRESUPUESTO' }
    delete u._token
    // Guardar contrato principal en BD
    try {
      const token = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
      await fetch(`${API}/admin/usuarios/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contrato_id: contrato.id })
      })
    } catch { /* silencioso */ }
    const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
    storage.setItem('cc_usuario', JSON.stringify(u))
    setUsuario(u); setModal(null)
    setPendingUser(null); setPendingContratos([])
  }

  async function handleLogout() {
    const token = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
    if (token) {
      try {
        await fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      } catch { /* silencioso */ }
    }
    localStorage.removeItem('cc_token'); localStorage.removeItem('cc_usuario')
    sessionStorage.removeItem('cc_token'); sessionStorage.removeItem('cc_usuario')
    setUsuario(null)
  }

  if (usuario) {
    if (usuario.politicas_aceptadas !== true) {
      return (
        <PoliticasConfidencialidadModal
          t={{ ...themes[activeTheme], textSecondary: themes[activeTheme].textMuted }}
          apiBase={API}
          token={getToken()}
          version={POLITICAS_TEXTO_VERSION}
          onAccepted={(data) => {
            setUsuario((prev) => {
              if (!prev) return prev
              const next = {
                ...prev,
                politicas_aceptadas: true,
                politicas_fecha: data.politicas_fecha,
                politicas_version: data.politicas_version,
                politicas_ip: data.politicas_ip,
              }
              const storage = localStorage.getItem('cc_token') ? localStorage : sessionStorage
              storage.setItem('cc_usuario', JSON.stringify(next))
              return next
            })
          }}
          onReject={handleLogout}
        />
      )
    }
    const _esPrivilegiado = ['Desarrollador', 'Administrador'].includes(usuario.cargo_nombre)
    const maintenanceBannerHeight = mantenimiento?.activo ? 74 : 0
    const updateBannerHeight = hayNuevaVersion ? 74 : 0
    const apiBannerHeight = apiDegraded ? 52 : 0
    const infoBannerHeight = bannerMsg ? 44 : 0
    const totalTopOffset = maintenanceBannerHeight + updateBannerHeight + apiBannerHeight + infoBannerHeight
    if (!_esPrivilegiado && (!usuario.permisos || usuario.permisos.length === 0)) return (
      <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '48px' }}>🔒</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color: t.text }}>Sin acceso</div>
        <div style={{ fontSize: '14px', color: t.textMuted, textAlign: 'center', maxWidth: '340px', lineHeight: 1.6 }}>
          Tu cargo no tiene permisos asignados. Contacta al administrador.
        </div>
        <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>
          {usuario.nombre} {usuario.apellidos} · {usuario.email}
        </div>
        <button onClick={handleLogout} style={{ marginTop: '12px', background: t.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          Cerrar sesión
        </button>
      </div>
    )
    return (
    <>
    <TestModeBadge />
    {mantenimiento?.activo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          background: '#DC2626', color: '#fff',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 4px 20px rgba(220,38,38,0.5)', fontFamily: 'inherit'
        }}>
          <span style={{ fontSize: '20px' }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '800', fontSize: '14px' }}>Actualización obligatoria del sistema</div>
            <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
              {esperandoFinMantenimiento
                ? 'Terminando actualización del backend... recargaremos automáticamente al finalizar.'
                : `${mantenimiento.mensaje} · Disculpa las molestias.`}
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '8px 18px', textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '28px', fontWeight: '900', lineHeight: 1 }}>{cuentaRegresiva}</div>
            <div style={{ fontSize: '10px', opacity: 0.8 }}>segundos</div>
          </div>
        </div>
      )}
    {apiDegraded && (
        <div style={{
          position: 'fixed',
          top: maintenanceBannerHeight + updateBannerHeight,
          left: 0,
          right: 0,
          zIndex: 99998,
          background: 'linear-gradient(90deg, #B45309, #D97706)',
          color: '#fff',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: '18px' }} aria-hidden>⚠️</span>
          <div style={{ flex: 1, lineHeight: 1.45 }}>
            <strong style={{ display: 'block', marginBottom: '2px' }}>Problema de conexión con el servidor</strong>
            Si en Red (F12) aparece <strong>502 Bad Gateway</strong>, el API en Azure no respondió (caído o saturado); el aviso de CORS es un efecto secundario.
            {' '}
            Espera 1–2 min, recarga o pulsa Reintentar. Más detalle: <code style={{ fontSize: '11px' }}>localStorage claracore_debug_api=1</code> y recarga.
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const opt =
                  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                    ? { signal: AbortSignal.timeout(28000) }
                    : {}
                const r = await fetch(`${API}/healthz`, opt)
                if (r.ok) {
                  apiHealthFailStreakRef.current = 0
                  apiHealthWarnedRef.current = false
                  setApiDegraded(false)
                }
              } catch (e) {
                logApiFailure('healthz (reintento manual)', e)
              }
            }}
            style={{
              flexShrink: 0,
              background: '#fff',
              color: '#B45309',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    {hayNuevaVersion && (
        <div style={{
          position: 'fixed', top: maintenanceBannerHeight, left: 0, right: 0, zIndex: 99999,
          background: 'linear-gradient(90deg, #0077B6, #00B4C6)',
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', boxShadow: '0 2px 16px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <span style={{ fontSize:'18px' }}>🔄</span>
            <div>
              <div style={{ fontSize:'13px', fontWeight:'700', color:'#fff' }}>
                ClaraCore tiene una actualización disponible
              </div>
              <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.85)', marginTop:'2px' }}>
                Ofrecemos disculpas por la interrupción — trabajamos continuamente para mejorar tu experiencia.
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:'10px', flexShrink:0 }}>
            <button
              onClick={() => {
                const ok = window.confirm(
                  '⚠️ Antes de actualizar:\n\n' +
                  '• Si tienes dimensiones editadas sin guardar → cancela, haz clic en "Recalcular" primero.\n' +
                  '• Si tienes estados pendientes de aplicar → cancela, haz clic en "Aplicar" primero.\n\n' +
                  'Los datos ya guardados en la plataforma NO se pierden.\n\n' +
                  '¿Deseas actualizar ahora?'
                )
                if (ok) window.location.reload()
              }}
              style={{
                background: '#fff', color: '#0077B6', border: 'none',
                borderRadius: '8px', padding: '8px 18px', fontSize: '13px',
                fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap'
              }}>
              🔃 Actualizar ahora         
            </button>
            <button
              onClick={() => setHayNuevaVersion(false)}
              style={{
                background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}>
              Después
            </button>
          </div>
        </div>
      )}
      {bannerMsg && (
        <div style={{ position: 'fixed', top: maintenanceBannerHeight + updateBannerHeight + apiBannerHeight, left: 0, right: 0, zIndex: 99999, background: '#0f2038', borderBottom: '2px solid #00afc5', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#e0f4f7', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
          <span>⚡ {bannerMsg}</span>
          <button onClick={() => setBannerMsg(null)} style={{ background: 'transparent', border: 'none', color: '#8acdd8', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
        </div>
      )}
      {perfilModalAbierto && (
        <PerfilUsuarioModal
          t={t}
          apiBase={API}
          token={getToken()}
          usuario={usuario}
          onClose={() => setPerfilModalAbierto(false)}
          onSaved={aplicarPerfilServidor}
        />
      )}
      {cumpleModalAbierto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100001,
            background: 'rgba(15,41,66,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setCumpleModalAbierto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '420px',
              width: '100%',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
              background: 'linear-gradient(145deg, #e0f2fe 0%, #bae6fd 35%, #7dd3fc 70%, #38bdf8 100%)',
              border: '2px solid rgba(0,119,182,0.35)',
            }}
          >
            <div style={{ padding: '28px 26px 22px', textAlign: 'center' }}>
              <div style={{ fontSize: '52px', lineHeight: 1, marginBottom: '8px' }} aria-hidden>🎂</div>
              <div style={{ fontSize: '22px', fontWeight: '900', color: '#0c4a6e', letterSpacing: '0.02em' }}>
                ¡Feliz cumpleaños{usuario?.nombre ? `, ${usuario.nombre}` : ''}!
              </div>
              <div style={{ fontSize: '14px', color: '#075985', marginTop: '12px', lineHeight: 1.55 }}>
                ClaraCore te envía un gran abrazo en este día tan especial. Que sigas construyendo éxitos — en obra y en la vida.
              </div>
              <button
                type="button"
                onClick={() => setCumpleModalAbierto(false)}
                style={{
                  marginTop: '22px',
                  background: '#0077B6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(0,119,182,0.35)',
                }}
              >
                Gracias
              </button>
            </div>
          </div>
        </div>
      )}
      <Dashboard t={t} activeTheme={activeTheme} themeMode={themeMode}
        onTheme={handleTheme} usuario={usuario} setUsuario={setUsuario} onLogout={handleLogout}
        topOffset={totalTopOffset}
        fontSize={fontSize} onFontSize={cambiarFuente}
        onOpenPerfil={() => setPerfilModalAbierto(true)}
      />
    </>
    )
  }

  return (
    <>
      <TestModeBadge />
      {apiDegraded && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99998,
          background: 'linear-gradient(90deg, #B45309, #D97706)', color: '#fff',
          padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: '18px' }} aria-hidden>⚠️</span>
          <div style={{ flex: 1, lineHeight: 1.45 }}>
            <strong style={{ display: 'block' }}>Sin conexión con el servidor ClaraCore</strong>
            En Red (F12), <strong>502</strong> = puerta de enlace sin backend activo (no es CORS). Espera, recarga o prueba Reintentar.
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const opt =
                  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                    ? { signal: AbortSignal.timeout(28000) }
                    : {}
                const r = await fetch(`${API}/healthz`, opt)
                if (r.ok) {
                  apiHealthFailStreakRef.current = 0
                  apiHealthWarnedRef.current = false
                  setApiDegraded(false)
                }
              } catch (e) {
                logApiFailure('healthz (reintento manual)', e)
              }
            }}
            style={{
              flexShrink: 0, background: '#fff', color: '#B45309', border: 'none',
              borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      <div style={{ paddingTop: apiDegraded ? 56 : 0 }}>
      <LandingPage t={t} activeTheme={activeTheme} themeMode={themeMode}
        onTheme={handleTheme}
        onLogin={() => setModal('login')}
        onRegistro={() => setModal('registro')}
        onOlvide={() => setModal('olvide')} />
      </div>
            {modal === 'login' && <ModalLogin t={t} onClose={() => setModal(null)} onLoginOk={handleLoginOk} onForgot={() => setModal('olvide')} />}
      {modal === 'selector_contrato' && (
        <Modal t={t} onClose={() => {}} width="400px">
          <div style={{ fontSize: '18px', fontWeight: '700', color: t.primary, marginBottom: '8px' }}>🏗️ Selecciona el contrato</div>
          <div style={{ fontSize: '13px', color: t.textMuted, marginBottom: '20px' }}>Tienes acceso a múltiples contratos. ¿A cuál deseas ingresar?</div>
          {pendingContratos.map(c => (
            <button key={c.id} onClick={() => handleSeleccionarContrato(c.id)} style={{ display: 'block', width: '100%', background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: '10px', padding: '12px 16px', color: t.text, fontSize: '14px', textAlign: 'left', cursor: 'pointer', marginBottom: '10px', fontWeight: '500' }}>
              📋 {c.numero}
              {c.contratista && <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>{c.contratista}</div>}
            </button>
          ))}
        </Modal>
      )}
      {modal === 'registro' && <ModalCrearCuenta t={t} onClose={() => setModal(null)} />}
      {modal === 'olvide' && <ModalOlvide t={t} onClose={() => setModal(null)} />}
    </>
  )
}
