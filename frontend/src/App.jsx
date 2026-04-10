import { useState, useEffect, useRef, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import AdminPanel from './AdminPanel'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const API = 'https://claracore-backend.azurewebsites.net'

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
  }
}

function getAutoTheme() {
  const hour = new Date().getHours()
  return (hour >= 7 && hour < 19) ? 'light' : 'dark'
}

function capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
}

function getToken() {
  return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
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
      <div style={{ position: 'absolute', top: '20px', right: '24px', display: 'flex', gap: '6px', background: activeTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)', border: `1px solid ${t.border}`, borderRadius: '20px', padding: '4px', backdropFilter: 'blur(8px)' }}>
        {['light', 'auto', 'dark'].map((mode, i) => (
          <button key={mode} onClick={() => onTheme(mode)} style={{ background: themeMode === mode ? t.primary : 'transparent', color: themeMode === mode ? '#fff' : t.textMuted, border: 'none', borderRadius: '16px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
            {['☀️ Claro', '⚡ Auto', '🌙 Oscuro'][i]}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ marginBottom: '16px', animation: 'fadeDown 0.6s ease' }}>
          <img src="/CLARA.CORE.png" alt="ClaraCore" style={{ height: '80px', filter: activeTheme === 'dark' ? 'brightness(0) invert(1)' : 'none' }} />
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

// ─── EMOJI PICKER ─────────────────────────────────────────────────────────────
const EMOJIS = [
  // Caras útiles
  '😀','😊','😅','🤔','😬','😤','😮','🥴','😎','🤝',
  // Manos / gestos
  '👍','👎','👌','✌️','🤞','👏','🙌','🙏','💪','👷',
  // Estado / semáforo
  '✅','❌','⚠️','🔴','🟠','🟡','🟢','🔵','⛔','🚫',
  // Símbolos útiles construcción
  '📌','📍','🔧','🔨','⛏️','🏗️','🚧','🏢','📐','📏',
  // Documentos / datos
  '📝','📋','📊','📈','📉','📁','🗂️','📎','📌','🔗',
  // Alertas / marcadores
  '❗','❓','💡','🔔','📢','🚨','🆘','🆗','🆕','🆙',
  // Tiempo / proceso
  '⏳','⏰','📅','🕐','🔄','▶️','⏸️','⏹️','🔁','🔃',
  // Dinero / métricas
  '💰','💵','💲','📦','🎯','🏆','✨','🌟','💎','🔑',
  // Flechas / símbolos
  '➡️','⬅️','⬆️','⬇️','↩️','↪️','🔼','🔽','➕','➖',
  // Comunicación
  '💬','✉️','📨','📩','📤','📥','🗣️','👀','🤫','💭',
]

function EmojiPicker({ onSelect, t }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        title="Insertar emoji"
        style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'4px 8px', fontSize:'14px', cursor:'pointer', color:t.textMuted, lineHeight:1 }}>
        🙂
      </button>
      {open && (
        <div style={{ position:'absolute', bottom:'calc(100% + 6px)', right:0, zIndex:9999, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'8px', boxShadow:'0 8px 32px rgba(0,0,0,0.25)', display:'grid', gridTemplateColumns:'repeat(10, 1fr)', gap:'2px', width:'340px', maxHeight:'280px', overflowY:'auto' }}>
          {EMOJIS.map(em => (
            <button key={em} type="button" onClick={() => { onSelect(em); setOpen(false) }}
              style={{ background:'transparent', border:'none', borderRadius:'4px', padding:'4px', fontSize:'16px', cursor:'pointer', lineHeight:1 }}
              onMouseEnter={e => e.currentTarget.style.background=t.bg}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              {em}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PresupuestoTooltip({ active, payload, t, color, fmt }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const fmtQ = n => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '—'
  return (
    <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px 14px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}>
      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text, marginBottom:'6px', maxWidth:'280px', wordBreak:'break-word' }}>{d.label}</div>
      <div style={{ fontSize:'13px', fontWeight:'700', color, marginBottom:'4px' }}>{fmt(d.costo)}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
        <div style={{ fontSize:'11px', color:t.textMuted }}>{d.count} registro{d.count !== 1 ? 's' : ''}</div>
        {d.cantTotal != null   && <div style={{ fontSize:'11px', color:t.textMuted }}>Cant. Total: <span style={{color:t.text,fontWeight:'600'}}>{fmtQ(d.cantTotal)}</span></div>}
        {d.und != null         && <div style={{ fontSize:'11px', color:t.textMuted }}>Und: <span style={{color:t.text,fontWeight:'600'}}>{d.und}</span></div>}
        {d.vlrUnit != null     && <div style={{ fontSize:'11px', color:t.textMuted }}>Vlr. Unit.: <span style={{color:t.text,fontWeight:'600'}}>{fmt(d.vlrUnit)}</span></div>}
      </div>
    </div>
  )
}

// ─── MÓDULO PRESUPUESTO ───────────────────────────────────────────────────────
function ModuloPresupuesto({ t, usuario, token, s, navRegistroId = null, onNavRegistroConsumed }) {
  const API = 'https://claracore-backend.azurewebsites.net'
  const contratoId = usuario?.contrato_id

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [filaZoom, setFilaZoom] = useState(null) // id de la fila con zoom activo
  const [editando, setEditando] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [modalImport, setModalImport] = useState(null)
  const [modoImport, setModoImport] = useState('replace')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [drill, setDrill] = useState([])        // [{campo, valor}, …] – ruta activa
  const [hoveredBar, setHoveredBar] = useState(null)
  // ── Estado edición y validación ────────────────────────────────────────────
  const [listadoPrecios, setListadoPrecios] = useState([])
  const [editCapitulo, setEditCapitulo] = useState('')
  const [editItem, setEditItem] = useState('')
  const [editDims, setEditDims] = useState({})      // {[id]: {ancho, espesor}}
  const [modalConfirm, setModalConfirm] = useState(false)
  const [bulkEstado, setBulkEstado] = useState('')
  const [busquedaTipo, setBusquedaTipo] = useState('')   // 'nodo' | 'abscisa' | 'idpol'
  const [busquedaV1,   setBusquedaV1]   = useState('')   // nodo_ini | abs_ini | idpol
  const [busquedaV2,   setBusquedaV2]   = useState('')   // nodo_fin | abs_fin (no se usa en idpol)
  const [filtroEstado, setFiltroEstado] = useState('')   // filtro permanente de estado de revisión
  const [guardandoBulk, setGuardandoBulk] = useState(false)
  const [itemBusqueda, setItemBusqueda] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [itemNavIdx, setItemNavIdx] = useState(-1)
  const itemDropRef = useRef(null)
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 50
  const [modalDetallePpto, setModalDetallePpto] = useState(null)
  const [modalDetallePptoEditable, setModalDetallePptoEditable] = useState(false)
  const [popupDims, setPopupDims] = useState({ ancho: '', espesor: '' })
  const [popupCap,  setPopupCap]  = useState('')
  const [popupItem, setPopupItem] = useState('')
  const [popupItemBusq, setPopupItemBusq] = useState('')
  const [popupItemOpen, setPopupItemOpen] = useState(false)
  const [popupGuardando, setPopupGuardando] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  // ── Revisor de Tramos ─────────────────────────────────────────────────────
  const [modalModoCapitulo, setModalModoCapitulo] = useState(null) // nombre del capítulo pendiente
  const [modoCapSeleccion,  setModoCapSeleccion]  = useState('')   // '' | 'todos' | 'tramos'
  const [busquedaTramo,     setBusquedaTramo]     = useState('')
  const [selTramoTab,       setSelTramoTab]       = useState({ ini: new Set(), fin: new Set(), tramo: new Set() })
  const [filtroEstrella,    setFiltroEstrella]    = useState('')  // '' | 'vacia' | 'roja' | 'amarilla' | 'verde'
  const [filtroEstrellaTipo, setFiltroEstrellaTipo] = useState('tramo') // 'ini' | 'fin' | 'tramo'
  const [tramoSelec,        setTramoSelec]        = useState(null) // {no_inicio, no_final, label}
  const [tabTramo,          setTabTramo]          = useState(0)    // 0=INFO 1=NODO INI 2=NODO FIN 3=TRAMO
  // ── Agregar cantidad / Revisor tramos extras ─────────────────────────────
  const [comentariosTramo,   setComentariosTramo]   = useState({})
  const [modoSeleccionClon,  setModoSeleccionClon]  = useState(false)
  const [clonBase,           setClonBase]           = useState(null)
  const [modalAgregarCant,   setModalAgregarCant]   = useState(false)
  const [nuevaCant,          setNuevaCant]          = useState({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
  const [guardandoNuevaCant, setGuardandoNuevaCant] = useState(false)
  // ── Comentarios ──────────────────────────────────────────────────────────
  const [modalComentario,  setModalComentario]  = useState(null) // {tipo, obligatorio, resolve}
  const [textoComentario,  setTextoComentario]  = useState('')
  const [destinatarioComentario, setDestinatarioComentario] = useState('')
  const [usuariosDestinatarios,  setUsuariosDestinatarios]  = useState([])
  const [comentariosPorId, setComentariosPorId] = useState({})
  const [modalHilo,           setModalHilo]           = useState(null) // {registroId, tipo, data}
  const [hiloLoading,         setHiloLoading]         = useState(false)
  const [respuestaTexto,      setRespuestaTexto]      = useState('')
  const [nuevoComentTexto,    setNuevoComentTexto]    = useState('')
  
  // ── Enlace DWG ──────────────────────────────────────────────────────────── 
  const [dwgEnlazado, setDwgEnlazado] = useState(false)
  useEffect(() => {
    if (!contratoId) return
    const check = async () => {
      try {
        const tok = getToken()
        if (!tok) return
        const r = await fetch(`${API}/cad-queue/${contratoId}/estado`, {
          headers: { Authorization: `Bearer ${tok}` }
        })
        if (r.ok) { const d = await r.json(); setDwgEnlazado(d.enlazado) }
      } catch {}
    }
    check()
    const iv = setInterval(check, 5000)
    return () => clearInterval(iv)
  }, [contratoId])

    // ── Constantes drill-down ──────────────────────────────────────────────────
  const NIVELES = ['capitulo', 'item', 'pk_id']
  const NOM     = { capitulo:'Capítulo', item:'Ítem', pk_id:'PK_ID' }
  const PALETA_BARRAS = [
    '#0077B6','#00B4C6','#00A896','#028090','#05668D',
    '#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B',
    '#44BBA4','#E94F37','#393E41','#F5A623','#7B2D8B',
  ]

  const fmt  = (n) => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '-'
  const fmtN = (n) => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '-'
  const fmtM = (n) => {
    if (n == null) return ''
    if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`
    if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`
    if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`
    return `$${Math.round(n)}`
  }

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => { if (contratoId) cargarCapitulos() }, [contratoId])
  
useEffect(() => {
    if (!navRegistroId || !contratoId) return
    const tok = getToken()
    fetch(`${API}/presupuesto/item/${navRegistroId}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(registro => {
        if (registro) {
          setModalDetallePpto(registro)
          setModalDetallePptoEditable(true)
          setPopupDims({ ancho: registro.ancho ?? '', espesor: registro.espesor ?? '' })
          setPopupCap(registro.capitulo || '')
          setPopupItem(registro.item || '')
          setPopupItemBusq(registro.item ? `${registro.item} · ${registro.descripcion || ''}` : '')
          setPopupMsg('')
        }
      })
      .catch(() => {})
    if (onNavRegistroConsumed) onNavRegistroConsumed()
  }, [navRegistroId])

    useEffect(() => {
    if (!contratoId) return
    fetch(`${API}/notificaciones/usuarios-destinatarios`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuariosDestinatarios).catch(() => {})
  }, [contratoId])

    useEffect(() => {
    if (!contratoId) return
    const pkidDrill = drill.find(d => d.campo === 'pk_id')
    if (pkidDrill) { setPptoPkidColores({}); return }
    const params = new URLSearchParams()
    const capDrill = drill.find(d => d.campo === 'capitulo')
    const itemDrill = drill.find(d => d.campo === 'item')
    if (itemDrill) params.set('item', itemDrill.valor)
    else if (capDrill) params.set('capitulo', capDrill.valor)
    fetch(`${API}/presupuesto/${contratoId}/pkid-colores?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : {}).then(setPptoPkidColores).catch(() => {})
  }, [contratoId, drill])

  useEffect(() => {
    if (!contratoId) return
    fetch(`${API}/listado-precios/${contratoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setListadoPrecios).catch(() => {})
  }, [contratoId])

  const esDeveloper  = usuario?.cargo_nombre?.toLowerCase() === 'desarrollador'
  const _permPpto    = (usuario?.permisos || []).find(p => p.funcion_nombre?.toLowerCase() === 'editar registros presupuesto')
  const puedeEditar  = esDeveloper || (_permPpto?.editar   ?? false)
  const puedeValidar = esDeveloper || (_permPpto?.validar  ?? false)
  const puedeEliminar = esDeveloper || (_permPpto?.eliminar ?? false)
  const esSellado = (r) => r?.sellado === true
  const [verPapelera, setVerPapelera] = useState(false)
  const _pptoCacheRef   = useRef(null)   // { data, ts, papelera } – solo para papelera
  const _pptoCachePorCap = useRef({})    // { [capitulo]: { data, ts } }
  const PPTO_CACHE_TTL  = 5 * 60 * 1000  // 5 min (papelera)
  const CAP_CACHE_TTL   = 10 * 60 * 1000 // 10 min por capítulo
  const [capitulosResumen,  setCapitulosResumen]  = useState([])
  const [loadingCapitulos,  setLoadingCapitulos]  = useState(false)
  const [itemsResumen,      setItemsResumen]      = useState([])
  const [capActivo,         setCapActivo]         = useState(null)  

async function cargarRegistros(modoPapelera, forzar = false) {
    if (!contratoId) return
    const esPapelera = modoPapelera !== undefined ? modoPapelera : verPapelera
    // Servir desde caché si es válido
    const cached = _pptoCacheRef.current
    if (!forzar && cached && cached.papelera === esPapelera &&
        (Date.now() - cached.ts) < PPTO_CACHE_TTL) {
      setRegistros(cached.data)
      setPagina(1)
      return
    }
    setLoading(true)
    const params = esPapelera ? '?papelera=true' : ''
    const res = await fetch(`${API}/presupuesto/${contratoId}${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      _pptoCacheRef.current = { data, ts: Date.now(), papelera: esPapelera }
      setRegistros(data)
    }
    setLoading(false)
    setPagina(1)
  }

  // ── Carga lazy por capítulo ────────────────────────────────────────────────
  async function cargarCapitulos() {
    if (!contratoId) return
    setLoadingCapitulos(true)
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/capitulos-lista`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setCapitulosResumen(await res.json())
    } catch {}
    setLoadingCapitulos(false)
  }
  
  async function cargarCapituloData(capitulo, item = null) {
    if (!contratoId) return
    const cacheKey = item ? `${capitulo}||${item}` : capitulo
    const cached = _pptoCachePorCap.current[cacheKey]
    if (cached && (Date.now() - cached.ts) < CAP_CACHE_TTL) {
      setRegistros(prev => {
        const yaIds = new Set(prev.map(r => r.id))
        const nuevos = cached.data.filter(r => !yaIds.has(r.id))
        return nuevos.length > 0 ? [...prev, ...nuevos] : prev
      })
      return
    }
    setLoading(true)
    try {
      let url = `${API}/presupuesto/${contratoId}?capitulo=${encodeURIComponent(capitulo)}`
      if (item) url += `&item=${encodeURIComponent(item)}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        _pptoCachePorCap.current[cacheKey] = { data, ts: Date.now() }
        setRegistros(prev => {
          const yaIds = new Set(prev.map(r => r.id))
          const nuevos = data.filter(r => !yaIds.has(r.id))
          return nuevos.length > 0 ? [...prev, ...nuevos] : prev
        })
      }
    } catch {}
    setLoading(false)
  }

  async function recargarCapActual(limpiarTodo = false) {
    if (limpiarTodo) {
      _pptoCachePorCap.current = {}
      _pptoCacheRef.current = null
      setRegistros([])
      setDrill([])
      await cargarCapitulos()
      return
    }
    const capActual = drill.find(d => d.campo === 'capitulo')?.valor
    if (capActual) {
      delete _pptoCachePorCap.current[capActual]
      setRegistros(prev => prev.filter(r => r.capitulo !== capActual))
      await cargarCapituloData(capActual)
    }
    await cargarCapitulos()
  }

  // ── Inserción de bloque de validación vía ClaraLink ───────────────────────
  async function lanzarClaraLinkEstado(ids, nuevoEstado) {
    const ESTADOS_BLOQUE = ['Aprobado', 'Pendiente', 'Rechazado']
    if (!ESTADOS_BLOQUE.includes(nuevoEstado)) return
    const targets = ids
      .map(id => registros.find(r => r.id === id))
      .filter(r => r?.x_label != null && r?.y_label != null && r?.layer_txt)
    for (const r of targets) {
      const params = new URLSearchParams({
        bloque:      nuevoEstado,
        x:           String(r.x_label),
        y:           String(r.y_label),
        layer:       r.layer_txt,
        registro_id: String(r.id),
        api_token:   token,
      })
      if (r.rev_block_handle) params.set('handle_borrar', r.rev_block_handle)
      const a = document.createElement('a')
      a.href = `claralink://insertar?${params}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Pausa entre registros para que ClaraLink procese uno a uno
      if (targets.length > 1) await new Promise(res => setTimeout(res, 900))
    }
  }

  // ── Drill-down computado ───────────────────────────────────────────────────
  const [pptoPkidColores,    setPptoPkidColores]    = useState({})
  const [pptoPkidFoco,    setPptoPkidFoco]    = useState(null)
  const [pkidsSeleccionados, setPkidsSeleccionados] = useState([])
  const mapPptoRef      = useRef(null)
  const mapPptoInstance = useRef(null)
  const [mapPptoListo,   setMapPptoListo]   = useState(false)
  const [primerNivel, setPrimerNivel] = useState('capitulo')
  const nivelesOrden = [primerNivel, ...NIVELES.filter(n => n !== primerNivel)]
  const nivelActual  = nivelesOrden[drill.length] || null
  const nivelIdx     = NIVELES.indexOf(nivelActual ?? primerNivel)
  const colorActual  = PALETA_BARRAS[Math.max(0, Math.min(nivelIdx, PALETA_BARRAS.length - 1))]

  // ── Comentarios: pedir, crear, cargar resumen ────────────────────────────
  function pedirComentario(tipo, obligatorio) {
    return new Promise(resolve => {
      setTextoComentario('')
      setDestinatarioComentario('')
      setModalComentario({ tipo, obligatorio, resolve })
    })
  }

  async function crearComentarios(ids, tipo, mensaje, destinatarioId = null) {
    if (!mensaje.trim()) return
    await fetch(`${API}/presupuesto/${contratoId}/comentarios/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ presupuesto_ids: ids, tipo, mensaje: mensaje.trim(), usuario_nombre: usuario?.nombre || 'Usuario' })
    })
    // Enviar notificación si hay destinatario
    if (destinatarioId) {
      const TITULOS = { dims:'📐 Cambio de Dimensiones', item_capitulo:'🔄 Cambio de Ítem/Capítulo', validacion:'🔍 Cambio de Estado' }
      await fetch(`${API}/notificaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          destinatario_id: parseInt(destinatarioId),
          asunto: TITULOS[tipo] || 'Comentario en presupuesto',
          mensaje: mensaje.trim(),
          tipo: 'MENSAJE_DIRECTO',
          modulo: 'PRESUPUESTO',
          contrato_id: contratoId,
          entidad_tipo: 'presupuesto',
          entidad_id: ids[0]?.toString(),
        })
      }).catch(() => {})
    }
  }

  async function cargarComentariosResumen(ids) {
    if (!ids || ids.length === 0) return
    const res = await fetch(`${API}/presupuesto/${contratoId}/comentarios-resumen?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setComentariosPorId(prev => ({ ...prev, ...data }))
    }
  }

  async function abrirHilo(registroId, tipo) {
    setHiloLoading(true)
    setRespuestaTexto('')
    setModalHilo({ registroId, tipo, data: [] })
    const res = await fetch(`${API}/presupuesto/${registroId}/comentarios?tipo=${tipo}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setModalHilo({ registroId, tipo, data })
    }
    setHiloLoading(false)
  }

  async function responderEnHilo(parentId) {
    if (!respuestaTexto.trim()) return
    await fetch(`${API}/comentarios/${parentId}/respuesta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensaje: respuestaTexto.trim(), usuario_nombre: usuario?.nombre || 'Usuario' })
    })
    setRespuestaTexto('')
    if (modalHilo) await abrirHilo(modalHilo.registroId, modalHilo.tipo)
  }

  const registrosFiltrados = useMemo(() => {
    // Función auxiliar: convierte "1+450.32" → 1450.32
    const parseAbs = s => {
      if (!s) return null
      return parseFloat(String(s).replace('+', ''))
    }
    return registros.filter(r => {
      // Filtro de drill existente
      if (!drill.every(({campo, valor}) => r[campo] === valor)) return false

      if (pkidsSeleccionados.length > 0) {
        if (!pkidsSeleccionados.includes(r.pk_id)) return false
      }
      if (busquedaTipo === 'tramo') {
        const v1 = busquedaV1.trim().toLowerCase()
        const v2 = busquedaV2.trim().toLowerCase()
        if (v1 && !(r.no_inicio || '').toLowerCase().includes(v1)) return false
        if (v2 && !(r.no_final  || '').toLowerCase().includes(v2)) return false
      } else
      // Filtro buscador mixto
      if (busquedaTipo === 'nodo') {
        const v1 = busquedaV1.trim().toLowerCase()
        const v2 = busquedaV2.trim().toLowerCase()
        if (v1 && !(r.no_inicio || '').toLowerCase().includes(v1)) return false
        if (v2 && !(r.no_final  || '').toLowerCase().includes(v2)) return false
      } else if (busquedaTipo === 'abscisa') {
        // Ambos campos filtran abs_inicio como rango (desde / hasta)
        const ini = parseAbs(r.abs_inicio)
        const v1 = busquedaV1.trim() !== '' ? parseFloat(busquedaV1) : null
        const v2 = busquedaV2.trim() !== '' ? parseFloat(busquedaV2) : null
        if (v1 !== null || v2 !== null) {
          if (ini === null) return false
          if (v1 !== null && ini < v1) return false
          if (v2 !== null && ini > v2) return false
        }
      } else if (busquedaTipo === 'registro') {
        const v1 = busquedaV1.trim().toLowerCase()
        if (v1 && !(r.registro || '').toLowerCase().includes(v1)) return false
      } else if (busquedaTipo === 'idpol') {
        const v1 = busquedaV1.trim().toLowerCase()
        if (v1 && !(r.id_pol || r.pk_id || '').toLowerCase().includes(v1)) return false
      }
      // Filtro permanente de estado
      if (filtroEstado) {
        const estadoReal = r.revisado || 'No Revisado'
        if (estadoReal !== filtroEstado) return false
      }
      return true
    })
  }, [registros, drill, busquedaTipo, busquedaV1, busquedaV2, filtroEstado, pkidsSeleccionados])

  const chartData = useMemo(() => {
    if (drill.length === 1 && nivelActual === 'item' && itemsResumen.length > 0) {
      return itemsResumen.map(c => ({
        name: c.item,
        label: `${c.item} · ${(c.descripcion||'').slice(0,38)}`,
        costo: c.costo_total,
        count: c.total_registros,
        cantTotal: c.cant_total, und: c.und, vlrUnit: c.vlr_unitario,
      })).sort((a,b) => a.name.localeCompare(b.name,'es',{numeric:true}))
    }
    if (drill.length === 0 && primerNivel === 'capitulo') {
      return capitulosResumen.map(c => ({
        name: c.capitulo,
        label: c.capitulo.length > 48 ? c.capitulo.slice(0, 48) + '…' : c.capitulo,
        costo: c.costo_total,
        count: c.total_registros,
        cantTotal: null, und: null, vlrUnit: null,
      })).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    }
    if (!nivelActual || registros.length === 0) return []
    const agg = {}
    registrosFiltrados.forEach(r => {
      const key = r[nivelActual] ?? '(sin valor)'
      if (!agg[key]) {
        let label = key
        if (nivelActual === 'item') {
          const desc = (r.descripcion ?? '').slice(0, 38)
          label = `${r.item ?? ''} · ${desc}${(r.descripcion ?? '').length > 38 ? '…' : ''}`
        } else if (key.length > 48) {
          label = key.slice(0, 48) + '…'
        }
        agg[key] = { name: key, label, costo: 0, count: 0, cantTotal: 0, und: r.und ?? null, vlrUnit: r.vlr_unitario ?? null }
      }
      agg[key].costo     += r.costo_directo ?? 0
      agg[key].cantTotal += r.cant_total ?? 0
      agg[key].count++
    })
    return Object.values(agg).sort((a, b) => a.name.localeCompare(b.name, 'es', {numeric: true}))
  }, [registrosFiltrados, nivelActual, drill, primerNivel, capitulosResumen])

  const costoTotal = useMemo(() => {
    if (drill.length === 0 && primerNivel === 'capitulo')
      return capitulosResumen.reduce((s, c) => s + (c.costo_total ?? 0), 0)
    return registrosFiltrados.reduce((s, r) => s + (r.costo_directo ?? 0), 0)
  }, [registrosFiltrados, drill, primerNivel, capitulosResumen])

  const totalPaginas = Math.ceil(registrosFiltrados.length / POR_PAGINA)
  const registrosOrdenados = useMemo(() =>
    [...registrosFiltrados].sort((a, b) => {
      const va = String(a.id_pol || a.pk_id || '')
      const vb = String(b.id_pol || b.pk_id || '')
      return vb.localeCompare(va, 'es', { numeric: true })
    })
  , [registrosFiltrados])
  const registrosPagina = useMemo(() =>
    registrosOrdenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  , [registrosOrdenados, pagina])

  async function cargarItemsCapitulo(capitulo) {
    if (!contratoId) return
    setItemsResumen([])
    setCapActivo(capitulo)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/items-lista?capitulo=${encodeURIComponent(capitulo)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) setItemsResumen(await res.json())
    } catch {}
  }

  async function handleBarClick(barData) {
    if (!nivelActual || !barData?.name) return
    if (nivelActual === 'capitulo') {
      setModoCapSeleccion('')
      setTramoSelec(null)
      setTabTramo(0)
      setModalModoCapitulo(barData.name)
      return
    }
    if (nivelActual === 'item' && capActivo) {
      await cargarCapituloData(capActivo, barData.name)
      setDrill(prev => [...prev, { campo: nivelActual, valor: barData.name }])
      return
    }
    setDrill(prev => [...prev, { campo: nivelActual, valor: barData.name }])
  }
  function irA(idx) {
    setDrill(prev => prev.slice(0, idx))
    // Los registros de capítulos cargados permanecen en memoria para re-uso
  }

  // ── Import CSV ─────────────────────────────────────────────────────────────
  async function handleImportCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const raw  = await file.text()
    const text = raw.replace(/^\uFEFF/, '')

    // Parser CSV robusto — respeta campos entre comillas con separador interno
    function parseCSVLine(line, sep) {
      const result = []; let cur = ''; let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === sep && !inQuote) { result.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      result.push(cur.trim())
      return result
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const firstLine = lines[0]
    const sep = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ','
    const headers = parseCSVLine(firstLine, sep).map(h => h.replace(/^"|"$/g,'').trim().toUpperCase())

    const MAP = {
      'PK_ID':'pk_id',
      'CAPITULO':'capitulo','CAPÍTULO':'capitulo','COMPETENCIA':'competencia',
      'ITEM':'item','ÍTEM':'item',
      'DESCRIPCION':'descripcion','DESCRIPCIÓN':'descripcion',
      'UND':'und',
      'CALZADA':'calzada','TRAMO':'tramo',
      'ABS. INICIO':'abs_inicio','ABS. FINAL':'abs_final',
      'ABS INICIO':'abs_inicio','ABS FINAL':'abs_final',
      'VLR UNITARIO':'vlr_unitario','VLR. UNITARIO':'vlr_unitario','VALOR UNITARIO':'valor_unitario',
      'NO. INICIO':'no_inicio','NO. FINAL':'no_final',
      'NO INICIO':'no_inicio','NO FINAL':'no_final',
      'AREA/LONG/NOD':'area_long_nod','ÁREA/LONG/NOD':'area_long_nod',
      'AREA/LONG':'area_long_nod','ÁREA/LONG':'area_long_nod',
      'ANCHO':'ancho','ESPESOR':'espesor',
      'CANT.TOTAL':'cant_total','CANT. TOTAL':'cant_total','CANTIDAD':'cant_total',
      'COSTO DIRECTO':'costo_directo',
      'TIPO DE EJECUCIÓN':'tipo_ejecucion','TIPO DE EJECUCION':'tipo_ejecucion',
      'TIPO DE ENTIDAD':'tipo_entidad',
      'ID_POL':'id_pol','ID POL':'id_pol',
      'OBSERVACIÓN':'observacion','OBSERVACION':'observacion',
      'ENTHANDLE':'ent_handle','ENT_HANDLE':'ent_handle',
      'TXTHANDLE':'txt_handle','TXT_HANDLE':'txt_handle',
      'LAYERENT':'layer_ent','LAYER_ENT':'layer_ent',
      'LAYERTXT':'layer_txt','LAYER_TXT':'layer_txt',
      'COLORHEX':'color_hex','COLOR_HEX':'color_hex',
      'GUID':'guid',
      'X_LABEL (ESTE)':'x_label','X_LABEL':'x_label',
      'Y_LABEL (NORTE)':'y_label','Y_LABEL':'y_label',
      'REVISADO (TRUE/FALSE)':'revisado','REVISADO':'revisado',
      'OBSERVACIÓN EXTERNA':'observacion_externa','OBSERVACION EXTERNA':'observacion_externa',
      'REV_BLOCK_HANDLE':'rev_block_handle',
    }
    const NUMS = new Set(['vlr_unitario','valor_unitario','area_long_nod','ancho','espesor','cant_total','costo_directo','x_label','y_label'])
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i], sep).map(v => v.replace(/^"|"$/g,'').trim())
      const obj = {}
      headers.forEach((h, idx) => {
        const key = MAP[h]; if (!key) return
        const v = vals[idx] || ''
        if (NUMS.has(key)) { const n = parseFloat(v.replace(/[,$]/g,'')); obj[key] = isNaN(n) ? null : n }
        else obj[key] = v || null
      })
      if (obj.pk_id || obj.item) rows.push(obj)
    }
    setModalImport({ rows, fileName: file.name })
    setModoImport('append'); setConfirmReplace(false); e.target.value = ''
  }

  async function ejecutarImport() {
    if (!modalImport) return
    if (modoImport === 'replace' && !confirmReplace) { setConfirmReplace(true); return }
    const { rows } = modalImport
    setModalImport(null); setImporting(true); setImportProgreso(0)
    const BATCH = 500
    let ok = true; let msj = ''
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const mode = i === 0 ? modoImport : 'append'
      const res = await fetch(`${API}/presupuesto/${contratoId}/bulk?mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(batch)
      })
      if (!res.ok) { const d = await res.json(); msj = `❌ Error: ${d.detail}`; ok = false; break }
      setImportProgreso(Math.round(((i + BATCH) / rows.length) * 100))
    }
    if (ok) msj = `✅ ${rows.length} registros ${modoImport === 'replace' ? 'cargados' : 'agregados'}`
    setImportMsg(msj); setImporting(false); setImportProgreso(0)
    if (ok) { await recargarCapActual(true) }
    setTimeout(() => setImportMsg(''), 5000)
  }

  // ── Listado de precios: derivados ──────────────────────────────────────────
  const capitulosListado = useMemo(() => [...new Set(listadoPrecios.map(p => p.capitulo).filter(Boolean))].sort((a, b) => {
    const numA = parseFloat(a); const numB = parseFloat(b)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.localeCompare(b, 'es', { numeric: true })
  }), [listadoPrecios])
  const itemsListado = useMemo(() => listadoPrecios.filter(p => !editCapitulo || p.capitulo === editCapitulo), [listadoPrecios, editCapitulo])
  const precioSeleccionado = useMemo(() => listadoPrecios.find(p => p.item_numero === editItem) || null, [listadoPrecios, editItem])
  const hayModificaciones = seleccionados.size > 0 && (
    editCapitulo !== '' || editItem !== '' ||
    [...seleccionados].some(id => editDims[id])
  ) && ![...seleccionados].some(id => esSellado(registros.find(r => r.id === id)))

  async function ejecutarRecalcular() {
    const ids = [...seleccionados]
    const tieneDims  = ids.some(id => editDims[id])
    const tieneItem  = !!(editCapitulo || editItem)
    const tipoComent = tieneItem ? 'item_capitulo' : 'dims'

    // Pedir comentario (obligatorio)
    const comentario = await pedirComentario(tipoComent, true)
    if (comentario === null) return  // canceló

    const dims = ids.filter(id => editDims[id]).map(id => ({
      id,
      ancho:   editDims[id].ancho   !== '' ? parseFloat(editDims[id].ancho)   : null,
      espesor: editDims[id].espesor !== '' ? parseFloat(editDims[id].espesor) : null,
    }))
    const body = { ids, dims: dims.length > 0 ? dims : null }
    if (editCapitulo)   body.capitulo    = editCapitulo
    if (editItem)       { body.item = editItem; body.descripcion = precioSeleccionado?.descripcion ?? null }
    if (precioSeleccionado) body.vlr_unitario = precioSeleccionado.precio_unitario
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-recalcular`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioComentario)
      // Patch local — actualizar registros en memoria sin recargar
      setRegistros(prev => prev.map(r => {
        if (!ids.includes(r.id)) return r
        const dim = dims.find(d => d.id === r.id)
        const ancho   = dim?.ancho   ?? r.ancho   ?? 1
        const espesor = dim?.espesor ?? r.espesor ?? 1
        const area    = r.area_long_nod ?? 0
        const vlr     = precioSeleccionado?.precio_unitario ?? r.vlr_unitario ?? 0
        const cant    = (ancho > 0 || espesor > 0) ? Math.round(area * ancho * espesor * 10000) / 10000 : area
        const costo   = Math.round(cant * vlr)
        return {
          ...r,
          ...(editCapitulo && { capitulo: editCapitulo }),
          ...(editItem && { item: editItem, descripcion: precioSeleccionado?.descripcion ?? r.descripcion }),
          ...(dim && { ancho, espesor }),
          cant_total:    cant,
          costo_directo: costo,
          vlr_unitario:  vlr,
        }
      }))
      setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
    }
  }

async function ejecutarBulkEstadoDirecto(estado) {
    if (!estado || seleccionados.size === 0) return
    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
    const comentario = await pedirComentario('validacion', obligatorio)
    if (comentario === null) return
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [...seleccionados], revisado: estado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios([...seleccionados], 'validacion', comentario, destinatarioComentario)
      const idsSelec = [...seleccionados]
      setBulkEstado(''); setSeleccionados(new Set())
      lanzarClaraLinkEstado(idsSelec, estado)
      setRegistros(prev => prev.map(r => idsSelec.includes(r.id) ? { ...r, revisado: estado } : r))
    }
  }

  async function ejecutarBulkEstado() {
    if (!bulkEstado || seleccionados.size === 0) return
    const obligatorio = bulkEstado === 'Pendiente' || bulkEstado === 'Rechazado'
    const comentario = await pedirComentario('validacion', obligatorio)
    if (comentario === null) return
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [...seleccionados], revisado: bulkEstado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios([...seleccionados], 'validacion', comentario, destinatarioComentario)
      const idsSelec = [...seleccionados]
      const estadoAplicado = bulkEstado
      setBulkEstado(''); setSeleccionados(new Set())
      lanzarClaraLinkEstado(idsSelec, estadoAplicado)
      setRegistros(prev => prev.map(r => idsSelec.includes(r.id) ? { ...r, revisado: estadoAplicado } : r))
    }
  }

  // ── Edición inline ─────────────────────────────────────────────────────────
  function iniciarEdicion(registro) {
    setEditando(registro.id)
    setEditValues({
      area_long_nod: registro.area_long_nod ?? '',
      ancho: registro.ancho ?? '',
      espesor: registro.espesor ?? '',
      vlr_unitario: registro.vlr_unitario ?? '',
      capitulo: registro.capitulo ?? '',
      item: registro.item ?? '',
      revisado: registro.revisado ?? '',
    })
  }

  async function guardarEdicion(id) {
    const body = {}
    Object.entries(editValues).forEach(([k, v]) => {
      if (v === '' || v == null) return
      body[k] = ['area_long_nod','ancho','espesor','vlr_unitario','cant_total'].includes(k) ? parseFloat(v) : v
    })
    // Calcular cant_total si vienen dimensiones
    const area = parseFloat(editValues.area_long_nod) || 0
    const ancho = parseFloat(editValues.ancho) || 0
    const esp = parseFloat(editValues.espesor) || 0
    if (area > 0) {
      body.cant_total = (ancho > 0 || esp > 0)
        ? Math.round(area * ancho * esp * 10000) / 10000
        : area
    }
    const res = await fetch(`${API}/presupuesto/item/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (res.ok) { setEditando(null); await recargarCapActual() }
  }

  // ── Selección ──────────────────────────────────────────────────────────────
  function toggleSel(id) {
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodos() {
    const idsPagina = new Set(registrosPagina.map(r => r.id))
    const todosPaginaSeleccionados = registrosPagina.every(r => seleccionados.has(r.id))
    if (todosPaginaSeleccionados) {
      setSeleccionados(prev => { const n = new Set(prev); idsPagina.forEach(id => n.delete(id)); return n })
    } else {
      setSeleccionados(prev => { const n = new Set(prev); idsPagina.forEach(id => n.add(id)); return n })
    }
  }
  useEffect(() => setPagina(1), [registrosFiltrados.length])
  useEffect(() => {
    const ids = registrosPagina?.map(r => r.id)
    if (ids?.length) cargarComentariosResumen(ids)
  }, [pagina, registrosFiltrados.length])

  // Cargar comentarios de validación al entrar a un tramo (solo registros con estado)
  useEffect(() => {
    if (!tramoSelec || !modalModoCapitulo || !contratoId) return
    const capRegs = registros.filter(r => r.capitulo === modalModoCapitulo)
    const idsConEstado = capRegs
      .filter(r => r.revisado && r.revisado !== 'No Revisado')
      .map(r => r.id)
    if (!idsConEstado.length) return
    fetch(`${API}/presupuesto/${contratoId}/comentarios-validacion?ids=${idsConEstado.join(',')}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.ok ? r.json() : {}).then(data => setComentariosTramo(prev => ({ ...prev, ...data }))).catch(() => {})
  }, [tramoSelec, modalModoCapitulo])

  // ── Estilos ────────────────────────────────────────────────────────────────
  const REVISADO_OPTS = ['No Revisado', 'Rechazado', 'Pendiente', 'Aprobado']
  const estadoColor = (r) => r === 'Aprobado' ? '#16A34A' : r === 'Pendiente' ? '#D97706' : r === 'Rechazado' ? '#EF4444' : '#3B82F6'
  const SEMAFORO = [
    { valor: 'No Revisado', color: '#3B82F6', label: '🔵' },
    { valor: 'Rechazado', color: '#EF4444', label: '🔴' },
    { valor: 'Pendiente', color: '#D97706', label: '🟡' },
    { valor: 'Aprobado',  color: '#16A34A', label: '🟢' },
  ]

async function highlightEnDwg(registro) {
  if (!registro?.id) return
  const esTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const contratoId = registro.contrato_id
  const token = getToken()
  if (esTablet || !window.__claralink_disponible) {
    // vía cad_queue
    await fetch(`${API}/cad-queue/${contratoId}/highlight-registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ presupuesto_id: registro.id })
    }).catch(() => {})
  } else {
    // vía ClaraLink (mismo esquema que zoomEnDwg)
    const url = `claralink://highlight?handle=${registro.ent_handle}&txt=${registro.txt_handle || ''}&x=${registro.x_label || 0}&y=${registro.y_label || 0}`
    window.location.href = url
  }
}

  function zoomEnDwg(registro) {
    if (!registro.x_label || !registro.y_label) return
    setFilaZoom(registro.id)
    const esClaraLinkDisponible = !(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    if (esClaraLinkDisponible) {
      const uri = `claralink://zoom?x=${registro.x_label}&y=${registro.y_label}&radio=20&handle=${registro.ent_handle || ''}&txt=${registro.txt_handle || ''}`
      window.location.href = uri
    } else {
      if (!registro.pk_id) return
      const tok = getToken()
      fetch(`${API}/cad-queue/${contratoId}/zoom-pkid?pk_id=${encodeURIComponent(registro.pk_id)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` }
      }).catch(() => {})
    }
  }

  async function cambiarEstadoDirecto(id, nuevoEstado) {
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentario = await pedirComentario('validacion', obligatorio)
    if (comentario === null) return
    const token = getToken()
    await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [id], revisado: nuevoEstado })
    })
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioComentario)
    lanzarClaraLinkEstado([id], nuevoEstado)
    setRegistros(prev => prev.map(r => r.id === id ? { ...r, revisado: nuevoEstado } : r))
  }

async function darDeBaja(id) {
    if (!dwgEnlazado) {
      alert('⚠️ Para dar de baja un registro necesitas tener el DWG enlazado.')
      return
    }
    const comentario = await pedirComentario('validacion', true) // obligatorio
    if (comentario === null) return
    const res = await fetch(`${API}/presupuesto/item/${id}/dar-baja`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      await crearComentarios([id], 'validacion', `[BAJA] ${comentario}`, destinatarioComentario)
      await recargarCapActual()
    } else alert('Error al dar de baja el registro')
  }

async function restaurar(id) {
    if (!window.confirm('¿Restaurar este registro? Volverá a aparecer en la grilla y se reactivará en el DWG.')) return
    const res = await fetch(`${API}/presupuesto/item/${id}/restaurar`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      await recargarCapActual()
    } else alert('Error al restaurar el registro')
  }

  const thStyle = { padding:'8px 10px', fontSize:'11px', fontWeight:'700', letterSpacing:'0.5px', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'7px 10px', fontSize:'12px', borderBottom:`1px solid ${t.border}`, verticalAlign:'middle' }
  const bcBtn   = (active) => ({
    background: active ? t.primary : 'transparent',
    color: active ? '#fff' : t.textMuted,
    border: `1px solid ${active ? t.primary : t.border}`,
    borderRadius: '20px', padding: '4px 12px', fontSize: '12px',
    fontWeight: active ? '600' : '400', cursor: 'pointer', transition: 'all 0.15s',
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Modal Revisor de Tramos ─────────────────────────────────────────── */}
      {modalModoCapitulo && (() => {
        const capRegs = registros.filter(r => r.capitulo === modalModoCapitulo)

        // Tramos únicos: no_inicio !== no_final
        const tramosUnicos = []
        const vistos = new Set()
        capRegs.forEach(r => {
          if (!r.no_inicio || !r.no_final) return
          if (r.no_inicio === r.no_final) return
          const key = `${r.no_inicio}||${r.no_final}`
          if (!vistos.has(key)) {
            vistos.add(key)
            tramosUnicos.push({ no_inicio: r.no_inicio, no_final: r.no_final, label: `${r.no_inicio} → ${r.no_final}` })
          }
        })

        // Calcular estrellas por tramo
        const calcEstrella = (regs) => {
          if (!regs.length) return 'vacia'
          const estados = regs.map(r => r.revisado || 'No Revisado')
          if (estados.some(e => e === 'No Revisado')) return 'vacia'
          if (estados.some(e => e === 'Rechazado')) return 'roja'
          if (estados.some(e => e === 'Pendiente' || e === 'Verificar Campo')) return 'amarilla'
          return 'verde'
        }
        const colorEstrella = (e) => e === 'verde' ? '#16A34A' : e === 'amarilla' ? '#D97706' : e === 'roja' ? '#EF4444' : t.border
        const iconEstrella  = (e) => e === 'vacia' ? '☆' : '★'

        // Registros del tramo seleccionado
        const regsNodoIni = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_inicio && r.no_final === tramoSelec.no_inicio) : []
        const regsNodoFin = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_final  && r.no_final === tramoSelec.no_final)  : []
        const regsTramo   = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_inicio && r.no_final === tramoSelec.no_final)   : []

        const estIni   = tramoSelec ? calcEstrella(regsNodoIni) : 'vacia'
        const estFin   = tramoSelec ? calcEstrella(regsNodoFin) : 'vacia'
        const estTramo = tramoSelec ? calcEstrella(regsTramo)   : 'vacia'

        const TAB_LABELS = ['📋 Info Tramo', '🔵 Nodo Inicio', '🔴 Nodo Fin', '📏 Tramo']

        // Renderiza filas de ítems con semáforo
        const FilaItem = ({ r }) => {
          const est = r.revisado || 'No Revisado'
          const clr = estadoColor(est)
          return (
            <div onClick={() => { zoomEnDwg(r); highlightEnDwg(r) }}
              style={{ display:'flex', gap:'8px', alignItems:'center', padding:'8px 10px',
                borderRadius:'8px', cursor:'pointer', background:t.bg, marginBottom:'6px',
                border:`1px solid ${t.border}` }}>
              <div style={{ flex:2, fontSize:'11px', color:t.text, fontWeight:'600' }}>{r.item}</div>
              <div style={{ flex:3, fontSize:'11px', color:t.textMuted }}>{r.descripcion}</div>
              <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                {[r.area_long_nod, r.ancho, r.espesor].filter(Boolean).join(' × ')}
              </div>
              <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:3}) : '—'}
              </div>
              <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                {r.vlr_unitario != null ? `$${Number(r.vlr_unitario).toLocaleString('es-CO')}` : '—'}
              </div>
              <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                {r.costo_directo != null ? `$${Number(r.costo_directo).toLocaleString('es-CO')}` : '—'}
              </div>
              <div style={{ display:'flex', gap:'4px' }}>
                {[{valor:'Rechazado',label:'🔴'},{valor:'Pendiente',label:'🟡'},{valor:'Aprobado',label:'🟢'}].map(op => (
                  <button key={op.valor}
                    title={op.valor}
                    onClick={async (e) => { e.stopPropagation(); if (puedeValidar && !esSellado(r)) await cambiarEstadoDirecto(r.id, op.valor) }}
                    style={{ background: est === op.valor ? clr : t.bgCard,
                      border:`1.5px solid ${est === op.valor ? clr : t.border}`,
                      borderRadius:'50%', width:'22px', height:'22px', fontSize:'11px',
                      cursor: puedeValidar && !esSellado(r) ? 'pointer' : 'default',
                      display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
          )
        }

        const TabVacia = ({ msg }) => (
          <div style={{ padding:'30px', textAlign:'center', color:t.textMuted, fontSize:'13px', fontStyle:'italic' }}>{msg}</div>
        )

        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:3500,display:'flex',alignItems:'center',justifyContent:'center' }}
            onClick={(e) => { if (modalComentario) return; setModalModoCapitulo(null); setTramoSelec(null); setModoSeleccionClon(false); setClonBase(null) }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px',
              padding:'24px', width: tramoSelec ? '820px' : '440px', maxWidth:'96vw',
              maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
              transition:'width .25s' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:'800', color:t.primary }}>
                    {tramoSelec ? `🔎 ${tramoSelec.label}` : '📂 Abrir capítulo'}
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>{modalModoCapitulo}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  {puedeEditar && (
                    <button onClick={() => { setModoSeleccionClon(true); setClonBase(null) }}
                      style={{ background:t.primary+'22', color:t.primary, border:`1px solid ${t.primary}`, borderRadius:'8px', padding:'5px 12px', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                      ＋ Agregar cantidad
                    </button>
                  )}
                  <button onClick={() => { setModalModoCapitulo(null); setTramoSelec(null); setModoSeleccionClon(false); setClonBase(null) }}
                    style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
                </div>
              </div>

              {/* Si no hay tramo seleccionado → mostrar dropdown */}
              {!tramoSelec && (<>
                <div style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, marginBottom:'6px', letterSpacing:'0.5px' }}>
                    ¿CÓMO QUIERES REVISAR ESTE CAPÍTULO?
                  </div>
                  <select value={modoCapSeleccion}
                    onChange={async e => {
                      const val = e.target.value
                      setModoCapSeleccion(val)
                      if (val === 'tramos' && modalModoCapitulo) {
                        await cargarCapituloData(modalModoCapitulo)
                        const capIds = registros.filter(r => r.capitulo === modalModoCapitulo).map(r => r.id)
                        if (capIds.length) {
                          const res = await fetch(`${API}/presupuesto/${contratoId}/comentarios-validacion?ids=${capIds.join(',')}`, {
                            headers: { Authorization: `Bearer ${token}` }
                          })
                          if (res.ok) setComentariosTramo(await res.json())
                        }
                      }
                    }}
                    style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`,
                      borderRadius:'9px', padding:'10px 14px', color:t.text, fontSize:'13px', cursor:'pointer' }}>
                    <option value=''>— Selecciona una opción —</option>
                    <option value='todos'>Ver por ítem</option>
                    <option value='tramos'>Revisar por tramo</option>
                  </select>
                </div>

                {/* Botón Todos */}
                {modoCapSeleccion === 'todos' && (
                  <button onClick={async () => {
                    const cap = modalModoCapitulo
                    setModalModoCapitulo(null)
                    await cargarItemsCapitulo(cap)
                    setDrill([{ campo: 'capitulo', valor: cap }])
                  }}
                    style={{ width:'100%', background:t.primary, color:'#fff', border:'none',
                      borderRadius:'9px', padding:'11px', fontSize:'13px', fontWeight:'700', cursor:'pointer', marginBottom:'8px' }}>
                    Ver ítems →
                  </button>
                )}

                {/* Lista de tramos */}
                {modoCapSeleccion === 'tramos' && (
                  <div>
                    {/* Header con contador */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                      <div style={{ fontSize:'12px', fontWeight:'800', color:t.text, letterSpacing:'0.3px' }}>
                        TRAMOS DISPONIBLES
                        <span style={{ marginLeft:'8px', background:t.primary+'22', color:t.primary, borderRadius:'20px', padding:'2px 10px', fontSize:'11px', fontWeight:'700' }}>
                          {tramosUnicos.length}
                        </span>
                      </div>
                      {filtroEstrella && (
                        <button onClick={() => setFiltroEstrella('')}
                          style={{ background:'transparent', border:'none', fontSize:'11px', color:t.textMuted, cursor:'pointer', textDecoration:'underline' }}>
                          ✕ Limpiar filtro
                        </button>
                      )}
                    </div>

                    {/* Buscador */}
                    <div style={{ position:'relative', marginBottom:'10px' }}>
                      <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'13px', pointerEvents:'none' }}>🔍</span>
                      <input
                        value={busquedaTramo}
                        onChange={e => setBusquedaTramo(e.target.value)}
                        placeholder="Buscar por nodo inicio o fin..."
                        style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${busquedaTramo ? t.primary : t.border}`,
                          borderRadius:'10px', padding:'9px 12px 9px 32px', color:t.text, fontSize:'12px',
                          boxSizing:'border-box', outline:'none', transition:'border-color .15s' }}
                      />
                    </div>

                    {/* Filtros de estado */}
                    <div style={{ background:t.bg, borderRadius:'10px', padding:'10px 12px', marginBottom:'10px' }}>
                      <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'8px' }}>
                        FILTRAR POR ESTADO DE REVISIÓN
                      </div>
                      {/* Selector de qué revisar */}
                      <div style={{ display:'flex', gap:'4px', marginBottom:'8px' }}>
                        {[['ini','Nodo Ini'],['fin','Nodo Fin'],['tramo','Tramo']].map(([k,l]) => (
                          <button key={k} onClick={() => setFiltroEstrellaTipo(k)}
                            style={{ flex:1, padding:'5px', fontSize:'10px', fontWeight:'700', cursor:'pointer', borderRadius:'7px',
                              background: filtroEstrellaTipo === k ? t.primary : t.bgCard,
                              color: filtroEstrellaTipo === k ? '#fff' : t.textMuted,
                              border: `1.5px solid ${filtroEstrellaTipo === k ? t.primary : t.border}`,
                              transition:'all .15s' }}>
                            {l}
                          </button>
                        ))}
                      </div>
                      {/* Botones de estado */}
                      <div style={{ display:'flex', gap:'4px' }}>
                        {[
                          { key:'vacia',    label:'⬜ Sin revisar', bg:'#F1F5F9', color:'#64748B' },
                          { key:'roja',     label:'🔴 Rechazado',  bg:'#FEE2E2', color:'#EF4444' },
                          { key:'amarilla', label:'🟡 Pendiente',  bg:'#FEF9C3', color:'#D97706' },
                          { key:'verde',    label:'🟢 Aprobado',   bg:'#DCFCE7', color:'#16A34A' },
                        ].map(({ key, label, bg, color }) => (
                          <button key={key} onClick={() => setFiltroEstrella(prev => prev === key ? '' : key)}
                            style={{ flex:1, padding:'5px 4px', fontSize:'10px', fontWeight:'700', cursor:'pointer', borderRadius:'7px',
                              background: filtroEstrella === key ? bg : t.bgCard,
                              color: filtroEstrella === key ? color : t.textMuted,
                              border: `1.5px solid ${filtroEstrella === key ? color : t.border}`,
                              transition:'all .15s' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tramosUnicos.length === 0 && (
                      <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'12px', fontStyle:'italic' }}>
                        No hay tramos definidos en este capítulo
                      </div>
                    )}

                    {/* Lista filtrada */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px', maxHeight:'260px', overflowY:'auto' }}>
                      {tramosUnicos.filter(tr => {
                        const busq = busquedaTramo.trim().toLowerCase()
                        if (busq && !tr.no_inicio?.toLowerCase().includes(busq) && !tr.no_final?.toLowerCase().includes(busq)) return false
                        if (!filtroEstrella) return true
                        const rIni = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_inicio)
                        const rFin = capRegs.filter(r => r.no_inicio === tr.no_final  && r.no_final === tr.no_final)
                        const rTr  = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_final)
                        const eMap = { ini: calcEstrella(rIni), fin: calcEstrella(rFin), tramo: calcEstrella(rTr) }
                        return eMap[filtroEstrellaTipo] === filtroEstrella
                      }).map((tr, i) => {
                        const rIni = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_inicio)
                        const rFin = capRegs.filter(r => r.no_inicio === tr.no_final  && r.no_final === tr.no_final)
                        const rTr  = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_final)
                        const eI = calcEstrella(rIni), eF = calcEstrella(rFin), eT = calcEstrella(rTr)
                        return (
                          <div key={i} onClick={() => { setTramoSelec(tr); setTabTramo(0); setBusquedaTramo('') }}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                              padding:'10px 14px', borderRadius:'10px', cursor:'pointer',
                              background:t.bg, border:`1.5px solid ${t.border}`, transition:'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = t.primary; e.currentTarget.style.background = t.primary+'0D' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.bg }}>
                            <div style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>{tr.label}</div>
                            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                              {[
                                { e: eI, label: 'NI' },
                                { e: eF, label: 'NF' },
                                { e: eT, label: 'TR' },
                              ].map(({ e, label }, idx) => (
                                <div key={idx} style={{ textAlign:'center' }}>
                                  <div style={{ fontSize:'14px', color:colorEstrella(e), lineHeight:1 }}>{iconEstrella(e)}</div>
                                  <div style={{ fontSize:'8px', color:t.textMuted, fontWeight:'700', letterSpacing:'0.3px' }}>{label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>)}

              {/* Panel de 4 pestañas cuando hay tramo seleccionado */}
              {tramoSelec && (<>
                {/* Banner modo selección clon */}
                {modoSeleccionClon && (
                  <div style={{ background:t.primary+'20', border:`1px solid ${t.primary}`, borderRadius:'8px', padding:'8px 12px', marginBottom:'10px', fontSize:'12px', color:t.primary, fontWeight:'700', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>🎯 Haz clic en un registro para clonar su posición</span>
                    <button onClick={() => setModoSeleccionClon(false)} style={{ background:'transparent', border:'none', cursor:'pointer', color:t.primary, fontWeight:'800', fontSize:'13px' }}>Cancelar</button>
                  </div>
                )}
                {/* Botón volver */}
                <button onClick={() => { setTramoSelec(null); cargarRegistros(verPapelera, true) }}
                  style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'7px',
                    padding:'5px 12px', fontSize:'11px', cursor:'pointer', color:t.textMuted, marginBottom:'14px' }}>
                  ← Volver a tramos
                </button>

                {/* Estrellas resumen */}
                <div style={{ display:'flex', gap:'16px', alignItems:'center', background:t.bg,
                  borderRadius:'10px', padding:'10px 16px', marginBottom:'14px' }}>
                  {[{e:estIni,l:'Nodo Inicio',sub:tramoSelec?.no_inicio},{e:estFin,l:'Nodo Fin',sub:tramoSelec?.no_final},{e:estTramo,l:'Tramo',sub:''}].map(({e,l,sub}, idx) => (
                    <div key={idx} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'22px', color:colorEstrella(e) }}>{iconEstrella(e)}</div>
                      <div style={{ fontSize:'9px', color:t.textMuted, fontWeight:'700', letterSpacing:'0.4px' }}>{l.toUpperCase()}</div>
                      {sub && <div style={{ fontSize:'10px', color:t.primary, fontWeight:'800', marginTop:'2px' }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                  {TAB_LABELS.map((label, idx) => (
                    <button key={idx} onClick={() => setTabTramo(idx)}
                      style={{ padding:'8px 16px', fontSize:'11px', fontWeight:'700', cursor:'pointer',
                        background: tabTramo === idx ? t.primary : t.bg,
                        border: `1.5px solid ${tabTramo === idx ? t.primary : t.border}`,
                        color: tabTramo === idx ? '#fff' : t.textMuted,
                        borderRadius:'20px', transition:'all .15s' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* TAB 0: INFO TRAMO */}
                {tabTramo === 0 && (() => {
                  const r = regsTramo[0] || regsNodoIni[0] || regsNodoFin[0] || {}
                  const F = ({label, val}) => (
                    <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', flex:1 }}>
                      <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
                      <div style={{ fontSize:'12px', color:t.text, fontWeight:'600' }}>{val || '—'}</div>
                    </div>
                  )
                  return (
                    <div>
                      <div style={{ textAlign:'center', fontSize:'18px', fontWeight:'800', color:t.primary, marginBottom:'16px', padding:'12px', background:t.bg, borderRadius:'10px' }}>
                        {tramoSelec.label}
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="CAPÍTULO" val={modalModoCapitulo} />
                        <F label="COMPETENCIA" val={r.competencia} />
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="TRAMO" val={r.tramo} />
                        <F label="CALZADA" val={r.calzada} />
                        <F label="PK_ID" val={r.pk_id} />
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="ABS. INICIO" val={r.abs_inicio} />
                        <F label="ABS. FINAL" val={r.abs_final} />
                      </div>
                      <div style={{ display:'flex', gap:'8px' }}>
                        <F label="NODO INICIO" val={tramoSelec.no_inicio} />
                        <F label="NODO FIN" val={tramoSelec.no_final} />
                      </div>
                    </div>
                  )
                })()}

                {/* Helper local para tabs de tramo */}
                {[
                  { tab: 1, regs: regsNodoIni, key: 'ini', msg: 'NODO EXISTENTE SIN REPORTE DE CANTIDADES' },
                  { tab: 2, regs: regsNodoFin, key: 'fin', msg: 'NODO EXISTENTE SIN REPORTE DE CANTIDADES' },
                  { tab: 3, regs: regsTramo,   key: 'tramo', msg: 'SIN CANTIDADES REPORTADAS PARA ESTE TRAMO' },
                ].filter(t => t.tab === tabTramo).map(({ regs, key, msg }) => {
                  const selTab = selTramoTab[key]
                  const todosSelec = regs.length > 0 && regs.every(r => selTab.has(r.id))
                  const algunoSelec = regs.some(r => selTab.has(r.id))
                  const toggleTab = () => {
                    setSelTramoTab(prev => {
                      const n = new Set(prev[key])
                      if (todosSelec) regs.forEach(r => n.delete(r.id))
                      else regs.forEach(r => n.add(r.id))
                      return { ...prev, [key]: n }
                    })
                  }
                  const validarTab = async (estado) => {
                    const ids = [...selTab]
                    if (!ids.length) return
                    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
                    const comentario = await pedirComentario('validacion', obligatorio)
                    if (comentario === null) return
                    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ ids, revisado: estado })
                    })
                    if (res.ok) {
                      if (comentario.trim()) await crearComentarios(ids, 'validacion', comentario, destinatarioComentario)
                      lanzarClaraLinkEstado(ids, estado)
                      setRegistros(prev => prev.map(r => ids.includes(r.id) ? { ...r, revisado: estado } : r))
                      setSelTramoTab(prev => ({ ...prev, [key]: new Set() }))
                    }
                  }
                  return (
                    <div key={key}>
                      {regs.length > 0 && puedeValidar && (
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'6px 10px', background:t.bg, borderRadius:'8px' }}>
                          <input type="checkbox" checked={todosSelec} onChange={toggleTab}
                            style={{ width:'14px', height:'14px', cursor:'pointer' }} />
                          <span style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted }}>
                            {todosSelec ? 'Deseleccionar todos' : `Seleccionar todos (${regs.length})`}
                          </span>
                          {algunoSelec && (
                            <div style={{ marginLeft:'auto', display:'flex', gap:'4px' }}>
                              {SEMAFORO.map(s => (
                                <button key={s.valor} onClick={() => validarTab(s.valor)}
                                  style={{ background:t.bgCard, border:`1.5px solid ${s.color}`, borderRadius:'6px', padding:'3px 8px', fontSize:'11px', cursor:'pointer', color:s.color, fontWeight:'700' }}>
                                  {s.label} {s.valor}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display:'flex', gap:'8px', fontSize:'10px', fontWeight:'700', color:t.textMuted, padding:'0 10px', marginBottom:'6px', letterSpacing:'0.4px' }}>
                        <span style={{width:'80px',flexShrink:0}}>ÍTEM</span><span style={{flex:3}}>DESCRIPCIÓN</span>
                        <span style={{minWidth:'120px',textAlign:'right',whiteSpace:'nowrap'}}>DIMS</span><span style={{flex:1,textAlign:'right'}}>CANT.</span>
                        <span style={{flex:1,textAlign:'right'}}>V. UNIT.</span><span style={{flex:1,textAlign:'right'}}>C. DIRECTO</span>
                        <span style={{flex:0.8}}></span>
                      </div>
                      {regs.length === 0
                        ? <TabVacia msg={msg} />
                        : regs.map(r => (
                            <div key={r.id}
                              style={{ borderRadius:'8px', marginBottom:'6px',
                                border:`1px solid ${modoSeleccionClon ? t.primary : selTab.has(r.id) ? t.primary : t.border}`,
                                background: modoSeleccionClon ? t.primary+'10' : selTab.has(r.id) ? t.primary+'18' : t.bg }}>
                              <div onClick={() => {
                                  if (modoSeleccionClon) {
                                    setClonBase(r)
                                    setModoSeleccionClon(false)
                                    setNuevaCant({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
                                    setModalAgregarCant(true)
                                  } else {
                                    zoomEnDwg(r); highlightEnDwg(r)
                                  }
                                }}
                                style={{ display:'flex', gap:'8px', alignItems:'center', padding:'8px 10px', cursor:'pointer' }}>
                                <input type="checkbox" checked={selTab.has(r.id)}
                                  onClick={e => e.stopPropagation()}
                                  onChange={() => setSelTramoTab(prev => {
                                    const n = new Set(prev[key])
                                    selTab.has(r.id) ? n.delete(r.id) : n.add(r.id)
                                    return { ...prev, [key]: n }
                                  })}
                                  style={{ width:'13px', height:'13px', cursor:'pointer', flexShrink:0 }} />
                                <div style={{ width:'80px', flexShrink:0, fontSize:'11px', color:t.text, fontWeight:'600' }}>{r.item}</div>
                                <div style={{ flex:3, fontSize:'11px', color:t.textMuted }}>{r.descripcion}</div>
                                {/* Dims — editable cuando puedeEditar */}
                                <div style={{ minWidth:'120px', fontSize:'11px', color:t.textMuted, textAlign:'right', whiteSpace:'nowrap' }}>
                                  {puedeEditar && editDims[r.id] !== undefined ? (
                                    <div style={{ display:'flex', flexDirection:'column', gap:'2px', alignItems:'flex-end' }} onClick={e => e.stopPropagation()}>
                                      <input type="number" placeholder="ancho" value={editDims[r.id].ancho ?? ''}
                                        onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], ancho: e.target.value } }))}
                                        style={{ width:'52px', fontSize:'10px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 4px', color:t.text, textAlign:'right' }} />
                                      <input type="number" placeholder="esp" value={editDims[r.id].espesor ?? ''}
                                        onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], espesor: e.target.value } }))}
                                        style={{ width:'52px', fontSize:'10px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 4px', color:t.text, textAlign:'right' }} />
                                    </div>
                                  ) : (
                                    <span onClick={puedeEditar ? (e) => { e.stopPropagation(); setEditDims(p => ({ ...p, [r.id]: { ancho: r.ancho ?? '', espesor: r.espesor ?? '' } })) } : undefined}
                                      title={puedeEditar ? 'Clic para editar dims' : undefined}
                                      style={{ cursor: puedeEditar ? 'pointer' : 'default', textDecoration: puedeEditar ? 'underline dotted' : 'none', whiteSpace:'nowrap' }}>
                                      {[r.area_long_nod, r.ancho, r.espesor].filter(v => v != null && v !== '').join(' × ') || '—'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                                  {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:3}) : '—'}
                                </div>
                                <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                                  {r.vlr_unitario != null ? `$${Number(r.vlr_unitario).toLocaleString('es-CO')}` : '—'}
                                </div>
                                <div style={{ flex:1, fontSize:'11px', color:t.textMuted, textAlign:'right' }}>
                                  {r.costo_directo != null ? `$${Number(r.costo_directo).toLocaleString('es-CO')}` : '—'}
                                </div>
                                <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                                  {/* Botón guardar dims */}
                                  {puedeEditar && editDims[r.id] !== undefined && (
                                    <button onClick={async (e) => {
                                      e.stopPropagation()
                                      const d = editDims[r.id]
                                      const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({
                                          ancho:   d.ancho   !== '' ? Number(d.ancho)   : null,
                                          espesor: d.espesor !== '' ? Number(d.espesor) : null,
                                        })
                                      })
                                      if (res.ok) {
                                        const updated = await res.json()
                                        setRegistros(prev => prev.map(x => x.id === r.id ? updated : x))
                                        setEditDims(p => { const n = {...p}; delete n[r.id]; return n })
                                      }
                                    }}
                                    style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'3px 8px', fontSize:'11px', cursor:'pointer', fontWeight:'700', flexShrink:0 }}>
                                      ✓
                                    </button>
                                  )}
                                  {[{valor:'Rechazado',label:'🔴'},{valor:'Pendiente',label:'🟡'},{valor:'Aprobado',label:'🟢'}].map(op => {
                                    const est = r.revisado || 'No Revisado'
                                    const clr = estadoColor(est)
                                    return (
                                      <button key={op.valor} title={op.valor}
                                        onClick={async (e) => { e.stopPropagation(); if (puedeValidar && !esSellado(r)) await cambiarEstadoDirecto(r.id, op.valor) }}
                                        style={{ background: est === op.valor ? clr : t.bgCard,
                                          border:`1.5px solid ${est === op.valor ? clr : t.border}`,
                                          borderRadius:'50%', width:'22px', height:'22px', fontSize:'11px',
                                          cursor: puedeValidar && !esSellado(r) ? 'pointer' : 'default',
                                          display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                                        {op.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                              {/* Comentario de validación — clic para ver hilo */}
                              {comentariosTramo[r.id] && (
                                <div onClick={() => abrirHilo(r.id, 'validacion')}
                                  style={{ padding:'4px 10px 7px 36px', fontSize:'10px', color:t.textMuted,
                                    cursor:'pointer', borderTop:`1px solid ${t.border}`,
                                    background:t.bg+'80', borderRadius:'0 0 8px 8px' }}>
                                  <span style={{ fontStyle:'italic' }}>
                                    💬 {comentariosTramo[r.id].mensaje.length > 80
                                      ? comentariosTramo[r.id].mensaje.slice(0, 80) + '…'
                                      : comentariosTramo[r.id].mensaje}
                                  </span>
                                  <span style={{ marginLeft:'8px', color:t.primary, fontWeight:'600' }}>
                                    — {comentariosTramo[r.id].usuario_nombre}
                                  </span>
                                  {comentariosTramo[r.id].created_at && (
                                    <span style={{ marginLeft:'6px', color:t.textMuted, fontSize:'9px' }}>
                                      {(() => { try { return new Date(comentariosTramo[r.id].created_at).toLocaleDateString('es-CO',{dateStyle:'short'}) } catch { return '' } })()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                      }
                    </div>
                  )
                })}
              </>)}
            </div>
          </div>
        )
      })()}

      {/* Modal agregar cantidad */}
      {modalAgregarCant && clonBase && (() => {
        const preciosFilt = listadoPrecios.filter(p =>
          !nuevaCant.itemBusq ||
          p.item_numero?.toLowerCase().includes(nuevaCant.itemBusq.toLowerCase()) ||
          p.descripcion?.toLowerCase().includes(nuevaCant.itemBusq.toLowerCase())
        ).slice(0, 20)
        const _area  = parseFloat(nuevaCant.area_long_nod) || 0
        const _ancho = parseFloat(nuevaCant.ancho)         || 0
        const _esp   = parseFloat(nuevaCant.espesor)       || 0
        const _vlr   = parseFloat(nuevaCant.itemSel?.precio_unitario) || 0
        const _cant  = (_ancho || _esp) ? _area * _ancho * _esp : _area
        const _costo = Math.round(_cant * _vlr)
        const puedeGuardar = nuevaCant.itemSel && _area > 0
        const InpLabel = ({label, val, onChange, type='number'}) => (
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
            <input type={type} value={val} onChange={onChange}
              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'7px', padding:'7px 10px', color:t.text, fontSize:'12px' }} />
          </div>
        )
        return (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', zIndex:4000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => { setModalAgregarCant(false) }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'14px', padding:'22px', width:'480px', maxWidth:'96vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.55)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={{ fontSize:'13px', fontWeight:'800', color:t.primary }}>＋ Agregar cantidad</div>
                <button onClick={() => setModalAgregarCant(false)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>

              {/* Referencia clon */}
              <div style={{ background:t.bg, borderRadius:'8px', padding:'8px 12px', marginBottom:'14px', fontSize:'11px', color:t.textMuted }}>
                <span style={{ fontWeight:'700', color:t.text }}>Posición clonada: </span>
                {clonBase.no_inicio} → {clonBase.no_final}
                {clonBase.tramo ? ` · ${clonBase.tramo}` : ''}
              </div>

              {/* Búsqueda ítem */}
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'4px' }}>ÍTEM DEL LISTADO DE PRECIOS</div>
                <input value={nuevaCant.itemBusq}
                  onChange={e => setNuevaCant(p => ({ ...p, itemBusq: e.target.value, itemSel: null }))}
                  placeholder="Buscar por número o descripción..."
                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${nuevaCant.itemSel ? t.primary : t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'12px' }} />
                {nuevaCant.itemBusq && !nuevaCant.itemSel && (
                  <div style={{ border:`1px solid ${t.border}`, borderRadius:'8px', marginTop:'4px', maxHeight:'160px', overflowY:'auto', background:t.bgCard }}>
                    {preciosFilt.length === 0
                      ? <div style={{ padding:'10px 12px', fontSize:'11px', color:t.textMuted }}>Sin resultados</div>
                      : preciosFilt.map(p => (
                        <div key={p.item_numero} onClick={() => setNuevaCant(prev => ({ ...prev, itemSel: p, itemBusq: `${p.item_numero} — ${p.descripcion}` }))}
                          style={{ padding:'8px 12px', fontSize:'11px', cursor:'pointer', borderBottom:`1px solid ${t.border}` }}
                          onMouseEnter={e => e.currentTarget.style.background = t.primary+'15'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontWeight:'700', color:t.text }}>{p.item_numero}</span>
                          <span style={{ color:t.textMuted, marginLeft:'8px' }}>{p.descripcion}</span>
                          <span style={{ color:t.primary, marginLeft:'8px', fontSize:'10px' }}>{p.unidad} · ${Number(p.precio_unitario || 0).toLocaleString('es-CO')}</span>
                        </div>
                      ))
                    }
                  </div>
                )}
                {nuevaCant.itemSel && (
                  <div style={{ marginTop:'6px', fontSize:'11px', color:t.primary, fontWeight:'600' }}>
                    ✓ {nuevaCant.itemSel.und || nuevaCant.itemSel.unidad} · ${Number(nuevaCant.itemSel.precio_unitario || 0).toLocaleString('es-CO')}
                  </div>
                )}
              </div>

              {/* Dims */}
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                <InpLabel label="LONGITUD / ÁREA" val={nuevaCant.area_long_nod} onChange={e => setNuevaCant(p => ({ ...p, area_long_nod: e.target.value }))} />
                <InpLabel label="ANCHO" val={nuevaCant.ancho} onChange={e => setNuevaCant(p => ({ ...p, ancho: e.target.value }))} />
                <InpLabel label="ESPESOR" val={nuevaCant.espesor} onChange={e => setNuevaCant(p => ({ ...p, espesor: e.target.value }))} />
              </div>

              {/* Totales calculados */}
              {_area > 0 && nuevaCant.itemSel && (
                <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>CANT. CALCULADA</div>
                    <div style={{ fontSize:'14px', fontWeight:'800', color:t.text, marginTop:'2px' }}>{_cant.toLocaleString('es-CO', {maximumFractionDigits:3})}</div>
                  </div>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>COSTO DIRECTO</div>
                    <div style={{ fontSize:'14px', fontWeight:'800', color:t.primary, marginTop:'2px' }}>${_costo.toLocaleString('es-CO')}</div>
                  </div>
                </div>
              )}

              <button disabled={!puedeGuardar || guardandoNuevaCant}
                onClick={async () => {
                  if (!puedeGuardar) return
                  setGuardandoNuevaCant(true)
                  try {
                    const p = nuevaCant.itemSel
                    const body = {
                      item:          p.item_numero,
                      descripcion:   p.descripcion,
                      und:           p.und || p.unidad,
                      vlr_unitario:  p.precio_unitario,
                      area_long_nod: _area || null,
                      ancho:         _ancho || null,
                      espesor:       _esp || null,
                      capitulo:      clonBase.capitulo,
                      competencia:   clonBase.competencia,
                      calzada:       clonBase.calzada,
                      tramo:         clonBase.tramo,
                      abs_inicio:    clonBase.abs_inicio,
                      abs_final:     clonBase.abs_final,
                      no_inicio:     clonBase.no_inicio,
                      no_final:      clonBase.no_final,
                      tipo_ejecucion: clonBase.tipo_ejecucion,
                      tipo_entidad:  clonBase.tipo_entidad,
                      id_pol_base:   clonBase.id_pol,
                      layer_ent:     clonBase.layer_ent,
                      layer_txt:     clonBase.layer_txt,
                      x_label:       clonBase.x_label,
                      y_label:       clonBase.y_label,
                    }
                    const res = await fetch(`${API}/presupuesto/${contratoId}/agregar-cantidad`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify(body)
                    })
                    if (res.ok) {
                      const newRow = await res.json()
                      setRegistros(prev => [...prev, newRow])
                      setModalAgregarCant(false)
                      setClonBase(null)
                      setNuevaCant({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
                    } else {
                      alert('Error al agregar cantidad')
                    }
                  } finally {
                    setGuardandoNuevaCant(false)
                  }
                }}
                style={{ width:'100%', background: puedeGuardar ? t.primary : t.border, color:'#fff', border:'none', borderRadius:'9px', padding:'11px', fontSize:'13px', fontWeight:'700', cursor: puedeGuardar ? 'pointer' : 'default', opacity: guardandoNuevaCant ? 0.7 : 1 }}>
                {guardandoNuevaCant ? 'Guardando...' : '＋ Agregar cantidad'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modal detalle registro presupuesto */}
      {modalDetallePpto && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'520px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px' }}>
              <div style={{ fontSize:'14px',fontWeight:'800',color:t.primary }}>📋 Detalle del Registro</div>
              <button onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }} style={{ background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:t.textMuted }}>✕</button>
            </div>
            {(() => {
              const r = modalDetallePpto
              const F = ({label, val, flex=1}) => (
                <div style={{ flex, minWidth:0 }}>
                  <div style={{ fontSize:'9px',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>{label}</div>
                  <div style={{ fontSize:'12px',color:t.text,fontWeight:'500',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{val ?? '—'}</div>
                </div>
              )
              const Row = ({children}) => (
                <div style={{ display:'flex',gap:'12px',background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>{children}</div>
              )
              const BigF = ({label, val}) => (
                <div style={{ background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>
                  <div style={{ fontSize:'9px',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px',marginBottom:'3px' }}>{label}</div>
                  <div style={{ fontSize:'12px',color:t.text,lineHeight:1.5 }}>{val ?? '—'}</div>
                </div>
              )
              return (
                <>
                  <Row><F label="ID_POL" val={r.id_pol||r.pk_id}/><F label="CAPÍTULO" val={r.capitulo}/><F label="ÍTEM" val={r.item} flex={0.5}/></Row>
                  <BigF label="DESCRIPCIÓN" val={r.descripcion}/>
                  <Row><F label="UNIDAD" val={r.und} flex={0.5}/><F label="REVISADO" val={r.revisado||'No Revisado'}/><F label="TIPO" val={r.tipo}/></Row>
                  <Row><F label="NODO INICIO" val={r.no_inicio}/><F label="NODO FINAL" val={r.no_final}/></Row>
                  <Row><F label="ABS. INICIO" val={r.abs_inicio}/><F label="ABS. FINAL" val={r.abs_final}/></Row>
                  <Row>
                    <F label="ÁREA/LONG" val={fmtN(r.area_long_nod)} flex={0.6}/>
                    <F label="ANCHO" val={fmtN(r.ancho)} flex={0.6}/>
                    <F label="ESPESOR" val={fmtN(r.espesor)} flex={0.6}/>
                    <F label="CANT. TOTAL" val={fmtN(r.cant_total)} flex={0.6}/>
                  </Row>
                  <Row>
                    <F label="VLR. UNITARIO" val={fmt(r.vlr_unitario)}/>
                    <F label="COSTO DIRECTO" val={fmt(r.costo_directo)}/>
                  </Row>
                  <Row><F label="TRAMO" val={r.tramo}/><F label="CALZADA" val={r.calzada}/><F label="PK" val={r.pk_id} flex={0.5}/></Row>
                  {/* Acciones desde buzón */}
                  {modalDetallePptoEditable && (puedeEditar || puedeEliminar) && !esSellado(r) && (
                    <div style={{ borderTop:`1px solid ${t.border}`, marginTop:'12px', paddingTop:'12px' }}>

                      {/* ── Editar dimensiones ── */}
                      {puedeEditar && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', marginBottom:'10px' }}>
                          <div style={{ fontSize:'10px', fontWeight:'700', color:'#F59E0B', letterSpacing:'0.5px', marginBottom:'8px' }}>📐 EDITAR DIMENSIONES</div>
                          <div style={{ display:'flex', gap:'10px', marginBottom:'8px' }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:'9px', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ANCHO</div>
                              <input type="number" value={popupDims.ancho}
                                onChange={e => setPopupDims(d => ({...d, ancho: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'12px', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:'9px', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ESPESOR</div>
                              <input type="number" value={popupDims.espesor}
                                onChange={e => setPopupDims(d => ({...d, espesor: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'12px', boxSizing:'border-box' }} />
                            </div>
                          </div>
                          <button disabled={popupGuardando} onClick={async () => {
                            setPopupGuardando(true); setPopupMsg('')
                            const area = parseFloat(r.area_long_nod) || 0
                            const ancho = parseFloat(popupDims.ancho) || 0
                            const esp   = parseFloat(popupDims.espesor) || 0
                            const cant  = (ancho > 0 || esp > 0) ? Math.round(area * ancho * esp * 10000) / 10000 : area
                            const costo = Math.round(cant * (r.vlr_unitario || 0))
                            const body  = { ancho: ancho || null, espesor: esp || null, cant_total: cant, costo_directo: costo }
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const updated = await fetch(`${API}/presupuesto/item/${r.id}`, { headers:{ Authorization:`Bearer ${token}` } })
                              if (updated.ok) { const d = await updated.json(); setModalDetallePpto(d) }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                              setPopupMsg('✅ Dimensiones actualizadas')
                            } else setPopupMsg('❌ Error al guardar')
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#F59E0B', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity: popupGuardando ? 0.6 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Recalcular y guardar'}
                          </button>
                        </div>
                      )}

                      {/* ── Cambiar capítulo / ítem ── */}
                      {puedeEditar && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', marginBottom:'10px' }}>
                          <div style={{ fontSize:'10px', fontWeight:'700', color:'#0077B6', letterSpacing:'0.5px', marginBottom:'8px' }}>🔄 CAMBIAR CAPÍTULO / ÍTEM</div>
                          <div style={{ marginBottom:'8px' }}>
                            <div style={{ fontSize:'9px', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>CAPÍTULO</div>
                            <select value={popupCap}
                              onChange={e => { setPopupCap(e.target.value); setPopupItem(''); setPopupItemBusq('') }}
                              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'12px', boxSizing:'border-box' }}>
                              <option value="">— Selecciona capítulo —</option>
                              {capitulosListado.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div style={{ marginBottom:'8px', position:'relative' }}>
                            <div style={{ fontSize:'9px', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ÍTEM</div>
                            <input value={popupItemBusq} disabled={!popupCap}
                              onChange={e => { setPopupItemBusq(e.target.value); setPopupItemOpen(true); setPopupItem('') }}
                              placeholder={popupCap ? 'Buscar ítem...' : 'Primero selecciona capítulo'}
                              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${popupItem ? t.primary : t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'12px', boxSizing:'border-box' }} />
                            {popupItemOpen && popupCap && (
                              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'6px', maxHeight:'160px', overflowY:'auto', zIndex:100, boxShadow:'0 4px 16px rgba(0,0,0,0.2)' }}>
                                {listadoPrecios
                                  .filter(p => p.capitulo === popupCap && (!popupItemBusq || `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(popupItemBusq.toLowerCase())))
                                  .slice(0, 20)
                                  .map(p => (
                                    <div key={p.item_numero} onClick={() => { setPopupItem(p.item_numero); setPopupItemBusq(`${p.item_numero} · ${p.descripcion}`); setPopupItemOpen(false) }}
                                      style={{ padding:'6px 10px', fontSize:'11px', cursor:'pointer', borderBottom:`1px solid ${t.border}44` }}
                                      onMouseEnter={e => e.currentTarget.style.background=t.bg}
                                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                      <strong>{p.item_numero}</strong> — {p.descripcion}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          <button disabled={popupGuardando || (!popupCap && !popupItem)} onClick={async () => {
                            setPopupGuardando(true); setPopupMsg('')
                            const precio = listadoPrecios.find(p => p.item_numero === popupItem)
                            const vlr    = precio?.valor_unitario || precio?.vlr_unitario || r.vlr_unitario || 0
                            const cant   = r.cant_total || 0
                            const body   = {
                              ...(popupCap  && { capitulo: popupCap }),
                              ...(popupItem && { item: popupItem, descripcion: precio?.descripcion || r.descripcion, und: precio?.und || r.und }),
                              vlr_unitario:  vlr,
                              costo_directo: Math.round(cant * vlr)
                            }
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const updated = await fetch(`${API}/presupuesto/item/${r.id}`, { headers:{ Authorization:`Bearer ${token}` } })
                              if (updated.ok) { const d = await updated.json(); setModalDetallePpto(d) }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                              setPopupMsg('✅ Capítulo/ítem actualizado')
                            } else setPopupMsg('❌ Error al guardar')
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#0077B6', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity: (popupGuardando || (!popupCap && !popupItem)) ? 0.5 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Actualizar y recalcular'}
                          </button>
                        </div>
                      )}

                      {/* ── Dar de baja — solo si DWG enlazado ── */}
                      {puedeEliminar && dwgEnlazado && (
                        <button onClick={async () => {
                          if (!window.confirm('¿Dar de baja este registro?')) return
                          setModalDetallePpto(null); setModalDetallePptoEditable(false)
                          await darDeBaja(r.id)
                        }}
                          style={{ background:'#EF444418', border:'1px solid #EF444444', borderRadius:'8px', padding:'8px 16px', fontSize:'12px', fontWeight:'700', color:'#EF4444', cursor:'pointer' }}>
                          🗑️ Dar de baja
                        </button>
                      )}

                      {/* Mensaje de resultado */}
                      {popupMsg && (
                        <div style={{ marginTop:'8px', fontSize:'12px', color: popupMsg.startsWith('✅') ? '#16A34A' : '#EF4444', fontWeight:'600' }}>
                          {popupMsg}
                        </div>
                      )}
                    </div>
                  )}
                    {r.revisado === 'Verificado' && r.validado_por && (
                    <div style={{ borderTop:`1px solid ${t.border}`, marginTop:'8px', paddingTop:'8px', display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#16A34A22', border:'1px solid #16A34A44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', flexShrink:0 }}>✅</div>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:'700', color:'#16A34A', letterSpacing:'0.5px' }}>VERIFICADO POR</div>
                        <div style={{ fontSize:'12px', color:t.text, fontWeight:'600' }}>{r.validado_por}</div>
                        {r.validado_en && <div style={{ fontSize:'10px', color:t.textMuted }}>
                          {new Date(r.validado_en).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' })}
                        </div>}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
      {/* ── Modal comentario ── */}
      {modalComentario && (() => {
        const TITULOS = { dims:'📐 Comentario — Cambio de Dimensiones', item_capitulo:'🔄 Comentario — Cambio de Ítem/Capítulo', validacion:'🔍 Comentario — Cambio de Estado' }
        const COLORES = { dims:'#F59E0B', item_capitulo:'#0077B6', validacion:'#10B981' }
        const color   = COLORES[modalComentario.tipo] || t.primary
        const valido  = !modalComentario.obligatorio || textoComentario.trim().length > 0
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:6000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'28px',width:'460px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ fontSize:'15px',fontWeight:'700',color,marginBottom:'6px' }}>{TITULOS[modalComentario.tipo]}</div>
              <div style={{ fontSize:'12px',color:t.textMuted,marginBottom:'16px' }}>
                {modalComentario.obligatorio ? '⚠️ El comentario es obligatorio para este estado.' : 'Opcional — explica el motivo del cambio.'}
              </div>
              {/* Selector de destinatario */}
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'11px',fontWeight:'700',color:t.textMuted,marginBottom:'6px',letterSpacing:'0.5px' }}>
                  NOTIFICAR A (opcional)
                </div>
                <select value={destinatarioComentario} onChange={e => setDestinatarioComentario(e.target.value)}
                  style={{ width:'100%',background:t.inputBg,border:`1.5px solid ${t.border}`,borderRadius:'8px',padding:'8px 12px',color:destinatarioComentario ? t.text : t.textMuted,fontSize:'13px',cursor:'pointer' }}>
                  <option value="">— Sin notificación —</option>
                  {usuariosDestinatarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} · {u.cargo}</option>
                  ))}
                </select>
              </div>
              <div style={{ position:'relative' }}>
                <textarea id="textarea-comentario" autoFocus value={textoComentario} onChange={e => setTextoComentario(e.target.value)}
                  placeholder="Escribe aquí el motivo o comentario..."
                  style={{ width:'100%',minHeight:'100px',background:t.inputBg,border:`1.5px solid ${color}66`,borderRadius:'8px',padding:'10px',color:t.text,fontSize:'13px',resize:'vertical',boxSizing:'border-box' }} />
                <div style={{ position:'absolute', bottom:'8px', right:'8px' }}>
                  <EmojiPicker t={t} onSelect={em => setTextoComentario(prev => prev + em)} />
                </div>
              </div>
              {modalComentario.obligatorio && !textoComentario.trim() && (
                <div style={{ fontSize:'11px',color:'#EF4444',marginTop:'4px' }}>* Este campo es obligatorio</div>
              )}
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'18px' }}>
                <button onClick={() => { modalComentario.resolve(null); setModalComentario(null) }}
                  style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'13px',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
                <button onClick={() => { if (!valido) return; modalComentario.resolve(textoComentario); setModalComentario(null) }}
                  disabled={!valido}
                  style={{ background:valido?color:'#999',color:'#fff',border:'none',borderRadius:'8px',padding:'9px 22px',fontSize:'13px',fontWeight:'700',cursor:valido?'pointer':'not-allowed' }}>
                  {modalComentario.obligatorio ? '✓ Confirmar' : '✓ Continuar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal hilo de comentarios ── */}
      {modalHilo && (() => {
        const TITULOS = { dims:'📐 Dimensiones', item_capitulo:'🔄 Ítem / Capítulo', validacion:'🔍 Validación' }
        const COLORES = { dims:'#F59E0B', item_capitulo:'#0077B6', validacion:'#10B981' }
        const color   = COLORES[modalHilo.tipo] || t.primary
        const fmtFecha = iso => { try { return new Date(iso).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) } catch { return iso } }
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'24px',width:'520px',maxWidth:'95vw',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px' }}>
                <div style={{ fontSize:'15px',fontWeight:'700',color }}>💬 {TITULOS[modalHilo.tipo]}</div>
                <button onClick={() => { setModalHilo(null); setNuevoComentTexto('') }} style={{ background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:t.textMuted }}>✕</button>
              </div>
              <div style={{ overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:'12px',paddingRight:'4px',minHeight:0 }}>
                {hiloLoading ? <div style={{ textAlign:'center',padding:'30px',color:t.textMuted }}>Cargando...</div>
                : modalHilo.data.length === 0 ? <div style={{ textAlign:'center',padding:'20px',color:t.textMuted,fontSize:'13px' }}>Sin comentarios aún</div>
                : modalHilo.data.map(c => (
                  <div key={c.id} style={{ background:t.bg,borderRadius:'10px',padding:'12px',border:`1px solid ${color}33` }}>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'6px' }}>
                      <span style={{ fontSize:'12px',fontWeight:'700',color }}>{c.usuario_nombre}</span>
                      <span style={{ fontSize:'10px',color:t.textMuted }}>{fmtFecha(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:'13px',color:t.text,lineHeight:1.5 }}>{c.mensaje}</div>
                    {(c.respuestas||[]).length > 0 && (
                      <div style={{ marginTop:'10px',paddingLeft:'12px',borderLeft:`2px solid ${color}44`,display:'flex',flexDirection:'column',gap:'8px' }}>
                        {c.respuestas.map(r => (
                          <div key={r.id}>
                            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'3px' }}>
                              <span style={{ fontSize:'11px',fontWeight:'700',color:t.textMuted }}>{r.usuario_nombre}</span>
                              <span style={{ fontSize:'10px',color:t.textMuted }}>{fmtFecha(r.created_at)}</span>
                            </div>
                            <div style={{ fontSize:'12px',color:t.text }}>{r.mensaje}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop:'10px',display:'flex',gap:'6px',alignItems:'center' }}>
                      <EmojiPicker t={t} onSelect={em => setRespuestaTexto(prev => prev + em)} />
                      <input value={respuestaTexto} onChange={e=>setRespuestaTexto(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); responderEnHilo(c.id) } }}
                        placeholder="Responder..." style={{ flex:1,background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'6px',padding:'5px 10px',fontSize:'12px',color:t.text }} />
                      <button onClick={()=>responderEnHilo(c.id)} disabled={!respuestaTexto.trim()}
                        style={{ background:respuestaTexto.trim()?color:'#999',color:'#fff',border:'none',borderRadius:'6px',padding:'5px 12px',fontSize:'12px',cursor:respuestaTexto.trim()?'pointer':'default' }}>↩</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Campo nuevo comentario top-level */}
              <div style={{ marginTop:'12px', borderTop:`1px solid ${t.border}`, paddingTop:'12px', display:'flex', gap:'6px', alignItems:'center' }}>
                <input value={nuevoComentTexto} onChange={e => setNuevoComentTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-nuevo-coment')?.click() } }}
                  placeholder="Nuevo comentario de validación..."
                  style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'7px', padding:'7px 10px', fontSize:'12px', color:t.text }} />
                <button id="btn-nuevo-coment" disabled={!nuevoComentTexto.trim()}
                  onClick={async () => {
                    if (!nuevoComentTexto.trim()) return
                    await fetch(`${API}/presupuesto/${contratoId}/comentarios/bulk`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                      body: JSON.stringify({
                        presupuesto_ids: [modalHilo.registroId],
                        tipo: modalHilo.tipo,
                        mensaje: nuevoComentTexto.trim(),
                        usuario_nombre: usuario?.nombre || 'Usuario',
                      })
                    })
                    const msg = nuevoComentTexto.trim()
                    setNuevoComentTexto('')
                    await abrirHilo(modalHilo.registroId, modalHilo.tipo)
                    // Actualizar resumen en popup de tramos
                    setComentariosTramo(prev => ({
                      ...prev,
                      [modalHilo.registroId]: { mensaje: msg, usuario_nombre: usuario?.nombre || 'Usuario', created_at: new Date().toISOString() }
                    }))
                  }}
                  style={{ background: nuevoComentTexto.trim() ? color : '#999', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'12px', cursor: nuevoComentTexto.trim() ? 'pointer' : 'default', fontWeight:'700', flexShrink:0 }}>
                  ↩
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {/* ── Modal confirmar recálculo ── */}
      {modalConfirm && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.55)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'28px',width:'440px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'16px',fontWeight:'700',color:t.primary,marginBottom:'16px' }}>🔄 Confirmar Recálculo</div>
            <div style={{ fontSize:'13px',color:t.textMuted,marginBottom:'14px' }}>
              Se actualizarán <strong style={{color:t.text}}>{seleccionados.size} registro(s)</strong> con los siguientes cambios:
            </div>
            <div style={{ background:t.bg,borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'13px',display:'flex',flexDirection:'column',gap:'6px' }}>
              {editCapitulo && <span>📁 <strong>Capítulo:</strong> {editCapitulo}</span>}
              {editItem && <span>📌 <strong>Ítem:</strong> {editItem} · {precioSeleccionado?.descripcion || ''}</span>}
              {precioSeleccionado && <span>💲 <strong>Vlr. Unitario:</strong> {fmt(precioSeleccionado.precio_unitario)}</span>}
              {[...seleccionados].some(id => editDims[id]) && (
                <span>📐 <strong>Dimensiones</strong> modificadas en {[...seleccionados].filter(id => editDims[id]).length} fila(s)</span>
              )}
              <span style={{color:t.textMuted,fontSize:'12px',marginTop:'4px'}}>
                Cant.Total = Área × Ancho × Espesor &nbsp;→&nbsp; Costo Directo = Cant.Total × Vlr.Unit
              </span>
            </div>
            <div style={{ background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#92400E',marginBottom:'20px' }}>
              ⚠️ Esta acción modifica los datos en la base de datos y <strong>no se puede deshacer.</strong>
            </div>
            <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
              <button onClick={() => setModalConfirm(false)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'13px',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarRecalcular} disabled={guardandoBulk} style={{ background:t.primary,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 22px',fontSize:'13px',fontWeight:'700',cursor:guardandoBulk?'wait':'pointer',opacity:guardandoBulk?0.7:1 }}>
                {guardandoBulk ? 'Guardando...' : '✓ Confirmar y guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal importar ── */}
      {modalImport && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'28px',width:'420px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'16px',fontWeight:'700',color:t.primary,marginBottom:'8px' }}>📂 Importar Presupuesto</div>
            <div style={{ fontSize:'13px',color:t.textMuted,marginBottom:'20px' }}>{modalImport.fileName} — <strong style={{color:t.text}}>{modalImport.rows.length} registros</strong></div>
            <div style={{ fontSize:'13px',fontWeight:'600',color:t.text,marginBottom:'10px' }}>¿Cómo desea cargar los datos?</div>
            <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'20px' }}>
              {[['replace','🔄 Reemplazar todo','Elimina los registros actuales y carga los nuevos'],['append','➕ Agregar','Agrega los nuevos registros sin eliminar los existentes']].map(([v,l,d]) => (
                <label key={v} style={{ display:'flex',alignItems:'flex-start',gap:'10px',padding:'12px',border:`2px solid ${modoImport===v?t.primary:t.border}`,borderRadius:'8px',cursor:'pointer',background:modoImport===v?t.primary+'11':'transparent' }}>
                  <input type="radio" name="modo" value={v} checked={modoImport===v} onChange={() => { setModoImport(v); setConfirmReplace(false) }} style={{ marginTop:'2px' }} />
                  <div><div style={{ fontSize:'13px',fontWeight:'600',color:t.text }}>{l}</div><div style={{ fontSize:'11px',color:t.textMuted }}>{d}</div></div>
                </label>
              ))}
            </div>
            {modoImport === 'replace' && confirmReplace && (
              <div style={{ background:'#FEE2E2',border:'1px solid #FCA5A5',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'12px',color:'#DC2626' }}>
                ⚠️ <strong>Esta acción no se puede deshacer.</strong> Se eliminarán todos los registros actuales. ¿Confirma?
              </div>
            )}
            <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
              <button onClick={() => { setModalImport(null); setConfirmReplace(false) }} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'13px',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarImport} style={{ background:modoImport==='replace'&&confirmReplace?'#DC2626':t.primary,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'13px',fontWeight:'600',cursor:'pointer' }}>
                {modoImport==='replace'&&!confirmReplace?'Continuar →':modoImport==='replace'?'⚠️ Sí, reemplazar':'➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display:'flex',gap:'12px',alignItems:'center',marginBottom:'16px',flexWrap:'wrap' }}>
        {esDeveloper && (
          <label style={{ background:colorActual,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 18px',fontSize:'13px',fontWeight:'600',cursor:importing?'wait':'pointer',opacity:importing?0.7:1 }}>
            {importing ? `Importando ${importProgreso}%...` : '📂 Importar CSV'}
            <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV} disabled={importing} />
          </label>
        )}
        {importing && (
          <div style={{ flex:1,maxWidth:'200px',height:'6px',background:t.border,borderRadius:'3px',overflow:'hidden' }}>
            <div style={{ width:`${importProgreso}%`,height:'100%',background:t.primary,borderRadius:'3px',transition:'width 0.3s' }} />
          </div>
        )}
        {importMsg && <span style={{ fontSize:'13px',color:importMsg.startsWith('✅')?'#16A34A':importMsg.startsWith('❌')?'#DC2626':t.textMuted }}>{importMsg}</span>}
        <span style={{ marginLeft:'auto',fontSize:'12px',color:t.textMuted }}>
        <button onClick={() => recargarCapActual(drill.length === 0)}
          style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'7px 14px', color:t.textMuted, fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
          🔄 Actualizar
        </button>
          {drill.length === 0 && !verPapelera
            ? `${capitulosResumen.length} capítulos`
            : `${registros.length} total · ${registrosFiltrados.length} filtrados`} · {seleccionados.size} seleccionados
      {totalPaginas > 1 && (
        <span style={{ marginLeft: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina === 1}
            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor: pagina===1?'default':'pointer', color: pagina===1?t.textMuted:t.text }}>‹</button>
          <span style={{ fontSize:'11px', color:t.textMuted }}>Pág. {pagina} / {totalPaginas}</span>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p+1))} disabled={pagina === totalPaginas}
            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor: pagina===totalPaginas?'default':'pointer', color: pagina===totalPaginas?t.textMuted:t.text }}>›</button>
        </span>
      )}
        </span>
      </div>

      {/* ── Panel drill-down ── */}
      {(loading || loadingCapitulos) ? (
        <div style={s.emptyState}>{loadingCapitulos ? '⏳ Cargando presupuesto...' : '⏳ Cargando capítulo...'}</div>
      ) : (verPapelera ? registros.length === 0 : (capitulosResumen.length === 0 && registros.length === 0)) ? (
        <div style={s.emptyState}>📂 Importa un CSV para comenzar</div>
      ) : (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',padding:'20px',marginBottom:'16px',boxShadow:t.shadow }}>

          {/* Breadcrumb */}
          <div style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'16px',flexWrap:'wrap' }}>
            <button onClick={() => irA(0)} style={bcBtn(drill.length === 0)}>📊 Todo el presupuesto</button>
            {drill.map(({campo, valor}, idx) => (
              <span key={idx} style={{ display:'flex',alignItems:'center',gap:'6px' }}>
                <span style={{ color:t.textMuted,fontSize:'13px' }}>›</span>
                <button onClick={() => irA(idx + 1)} style={bcBtn(idx === drill.length - 1)}>
                  {NOM[campo]}: {valor.length > 28 ? valor.slice(0, 28) + '…' : valor}
                </button>
              </span>
            ))}
          </div>

          {/* Selector de nivel */}
          <div style={{ marginBottom:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'10px' }}>
              <span style={{ fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>AGRUPAR POR:</span>
              {NIVELES.map(n => {
                const activo = primerNivel === n
                return (
                  <button key={n} onClick={() => { setPrimerNivel(n); setDrill([]); setSeleccionados(new Set()) }}
                    style={{
                      background: activo ? colorActual : t.bg,
                      color: activo ? '#fff' : t.text,
                      border: `1.5px solid ${activo ? colorActual : t.border}`,
                      borderRadius:'20px', padding:'4px 14px', fontSize:'12px',
                      fontWeight: activo ? '700' : '400',
                      cursor: 'pointer',
                      transition:'all 0.15s'
                    }}>
                    {NOM[n]}
                  </button>
                )
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
              <span style={{ fontSize:'12px', color:t.textMuted }}>
                {drill.length === 0 && primerNivel === 'capitulo'
                  ? `${capitulosResumen.reduce((s,c) => s+(c.total_registros??0),0)} registros`
                  : `${registrosFiltrados.length} registros`}
                {drill.some(d => d.campo === 'item') && (() => {
                  const cantSum = registrosFiltrados.reduce((s,r) => s + (r.cant_total||0), 0)
                  const und = registrosFiltrados[0]?.und || ''
                  return <> · <strong style={{color:'#0077B6'}}>{cantSum.toFixed(2)} {und}</strong></>
                })()}
                {' · '}<strong style={{color:colorActual}}>{fmt(costoTotal)}</strong>
              </span>
            {nivelActual && (
                <span style={{ fontSize:'11px', color:t.textMuted, fontStyle:'italic' }}>
                  {nivelActual === 'item' ? '🎛️ Click en un instrumento para filtrar' : '👆 Click en una barra para filtrar por ese valor'}
                </span>
              )}
            </div>
          </div>


          {/* Gráfico */}
          {nivelActual ? (
            nivelActual === 'pk_id' ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {/* Botones PK_ID en fila con scroll */}
                {pkidsSeleccionados.length > 0 && (
                    <div style={{ marginBottom:'6px', display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'11px', color:t.textMuted }}>
                        {pkidsSeleccionados.length} PK_ID{pkidsSeleccionados.length > 1 ? 's' : ''} seleccionado{pkidsSeleccionados.length > 1 ? 's' : ''}
                      </span>
                      <button onClick={() => setPkidsSeleccionados([])}
                        style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'20px', padding:'2px 10px', color:'#EF4444', fontSize:'10px', fontWeight:'700', cursor:'pointer' }}>
                        ✕ Limpiar selección
                      </button>
                    </div>
                  )}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', maxHeight:'120px', overflowY:'auto', padding:'4px 2px' }}>
                  {chartData.map((d, i) => {
                    const color = PALETA_BARRAS[i % PALETA_BARRAS.length]
                    const activo = pptoPkidFoco === d.name
                    return (
                      <button key={d.name} onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          setPkidsSeleccionados(prev =>
                            prev.includes(d.name) ? prev.filter(p => p !== d.name) : [...prev, d.name]
                          )
                        } else {
                          setPkidsSeleccionados(prev =>
                            prev.length === 1 && prev[0] === d.name ? [] : [d.name]
                          )
                        }                      
                      }}
                      title={`${d.name}\n${fmt(d.costo)}\n${d.count} registros`}
                      style={{ background: pkidsSeleccionados.includes(d.name) ? color : color+'22', border:`2px solid ${color}`, borderRadius:'6px', padding:'5px 4px', fontSize:'11px', fontWeight:'600', color: pkidsSeleccionados.includes(d.name) ? '#fff' : color, cursor:'pointer', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background=color; e.currentTarget.style.color='#fff' }}
                      onMouseLeave={e => { if (!pkidsSeleccionados.includes(d.name)) { e.currentTarget.style.background=color+'22'; e.currentTarget.style.color=color } }}>
                      {d.name}
                    </button>
                    )
                  })}
                </div>
                {/* Mini-mapa presupuesto */}
                {/* Mini-mapa presupuesto */}
                <MiniMapaPresupuesto
                  t={t}
                  colores={pptoPkidColores}
                  pkidsActivos={chartData.map(d => d.name)}
                  pkidsResaltados={pkidsSeleccionados}
                  onPkidClick={(pkid, ctrlKey) => {
                    if (ctrlKey) {
                      setPkidsSeleccionados(prev =>
                        prev.includes(pkid) ? prev.filter(p => p !== pkid) : [...prev, pkid]
                      )
                    } else {
                      setPkidsSeleccionados([pkid])
                    }
                  }}
                />
              </div>
            ) : nivelActual === 'item' ? (() => {
              // ── Velocímetros para ítems (igual que ModuloPresupuesto) ──
              const costoMax = Math.max(...chartData.map(d => d.costo), 1)
              const gSize = chartData.length > 20 ? 117 : chartData.length > 10 ? 130 : 144
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:'8px', padding:'4px 2px' }}>
                  {chartData.map((d, i) => {
                    const pct   = Math.round((d.costo / costoMax) * 100)
                    const clamp = Math.min(Math.max(pct, 0), 100)
                    const color = PALETA_BARRAS[i % PALETA_BARRAS.length]
                    const cx = gSize/2, cy = gSize*0.57, r = gSize*0.37, sw = gSize*0.076
                    const START=-135, SPAN=270, fillEnd = START+(clamp/100)*SPAN
                    const toRad = a => (a*Math.PI)/180
                    const pt = angle => ({ x: cx+r*Math.cos(toRad(angle)), y: cy+r*Math.sin(toRad(angle)) })
                    const arcD = (a1,a2) => { const s=pt(a1),e=pt(a2); const large=(a2-a1)>180?1:0; return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}` }
                    const nTip = { x: cx+(r-sw-4)*Math.cos(toRad(fillEnd)), y: cy+(r-sw-4)*Math.sin(toRad(fillEnd)) }
                    return (
                      <div key={d.name} onClick={() => handleBarClick(d)}
                        title={`${d.name}\n${fmt(d.costo)}\n${d.count} registros`}
                        style={{ cursor:'pointer',background:t.bgCard,border:`1.5px solid ${color}55`,borderRadius:'12px',padding:'8px 6px 10px',display:'flex',flexDirection:'column',alignItems:'center',transition:'all 0.2s',boxShadow:`0 2px 12px ${color}1A` }}
                        onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.borderColor=color; e.currentTarget.style.boxShadow=`0 8px 24px ${color}44` }}
                        onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.borderColor=`${color}55`; e.currentTarget.style.boxShadow=`0 2px 12px ${color}1A` }}>
                        <div style={{ fontSize:'9px',color:t.textMuted,textAlign:'center',lineHeight:1.3,marginBottom:'3px',width:'100%',padding:'0 2px',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' }}>
                          {d.label||d.name}
                        </div>
                        <svg width={gSize} height={gSize*0.66} viewBox={`0 0 ${gSize} ${gSize*0.66}`} style={{overflow:'visible'}}>
                          {clamp>0 && <path d={arcD(START,fillEnd)} fill="none" stroke={color} strokeWidth={sw+6} strokeLinecap="round" opacity={0.1}/>}
                          <path d={arcD(START,START+SPAN)} fill="none" stroke={t.border} strokeWidth={sw} strokeLinecap="round"/>
                          {clamp>0 && <path d={arcD(START,fillEnd)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"/>}
                          {[0,25,50,75,100].map(tp => {
                            const a=START+(tp/100)*SPAN
                            const p1={x:cx+(r-sw/2-2)*Math.cos(toRad(a)),y:cy+(r-sw/2-2)*Math.sin(toRad(a))}
                            const p2={x:cx+(r-sw-5)*Math.cos(toRad(a)),y:cy+(r-sw-5)*Math.sin(toRad(a))}
                            return <line key={tp} x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)} x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke={t.textMuted} strokeWidth={1.2} opacity={0.4}/>
                          })}
                          <line x1={cx} y1={cy} x2={nTip.x.toFixed(2)} y2={nTip.y.toFixed(2)} stroke={color} strokeWidth={gSize*0.016} strokeLinecap="round"/>
                          <circle cx={cx} cy={cy} r={gSize*0.048} fill={color}/>
                          <circle cx={cx} cy={cy} r={gSize*0.022} fill={t.bgCard}/>
                        </svg>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',padding:'0 3px',marginTop:'2px' }}>
                          <span style={{ fontSize:'10px',fontWeight:'700',color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%' }}>{d.name}</span>
                          <span style={{ fontSize:'13px',fontWeight:'800',color }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize:'9px',color:t.textMuted,marginTop:'2px' }}>{fmtM(d.costo)}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })() : nivelActual === 'capitulo' ? (() => {
              // ── Barras verticales para capítulos ──
              const maxVal = Math.max(...chartData.map(d => d.costo), 1)
              const BAR_W=60, GAP=30, PAD_L=12, PAD_R=12, H=220, PAD_T=14, PAD_B=72
              const colW = BAR_W + GAP
              const totalW = Math.max(PAD_L + chartData.length * colW + PAD_R, 600)
              const scaleH = v => PAD_T + (1-v/maxVal)*(H-PAD_T-PAD_B)
              return (
                <div style={{ overflowX:'auto', width:'100%' }}>
                  <svg width={totalW} height={H} style={{ overflow:'visible', display:'block', minWidth:'100%' }}>
                    {[0,25,50,75,100].map(pct => {
                      const y = PAD_T+(1-pct/100)*(H-PAD_T-PAD_B)
                      return <line key={pct} x1={PAD_L} x2={totalW-PAD_R} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                    })}
                    {chartData.map((d,i) => {
                      const color = PALETA_BARRAS[i%PALETA_BARRAS.length]
                      const x = PAD_L + i * colW
                      const y = scaleH(d.costo)
                      const h = H-PAD_B-y
                      const nom = String(d.name).length>18 ? String(d.name).slice(0,18)+'…' : String(d.name)
                      return (
                        <g key={d.name} onClick={() => handleBarClick(d)} style={{ cursor:'pointer' }}>
                          <rect x={x} y={y} width={BAR_W} height={Math.max(h,2)} fill={color} rx="3" opacity="0.85"
                            onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-cobro-cap-${i}`); if(tip) tip.style.display='block' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-cobro-cap-${i}`); if(tip) tip.style.display='none' }}
                          />
                          <text x={x+BAR_W/2} y={H-PAD_B+14} textAnchor="end" fontSize="9" fill={t.textMuted}
                            transform={`rotate(-35,${x+BAR_W/2},${H-PAD_B+14})`}>{nom}</text>
                          <g id={`tip-cobro-cap-${i}`} style={{display:'none',pointerEvents:'none'}}>
                            <rect x={Math.min(x-10,totalW-PAD_R-180)} y={Math.max(y-46,4)} width="175" height="40" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                            <text x={Math.min(x-10,totalW-PAD_R-180)+10} y={Math.max(y-46,4)+16} fontSize="10" fontWeight="700" fill={t.text}>
                              {String(d.name).length>24?String(d.name).slice(0,24)+'…':String(d.name)}
                            </text>
                            <text x={Math.min(x-10,totalW-PAD_R-180)+10} y={Math.max(y-46,4)+32} fontSize="10" fill={t.textMuted}>
                              <tspan fontWeight="700" fill={color}>{fmt(d.costo)}</tspan>
                              <tspan> · {d.count} reg.</tspan>
                            </text>
                          </g>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              )
            })() : (
              // ── Barras horizontales para acta/calzada ──
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length*40+20)}>
                <BarChart data={chartData} layout="vertical" margin={{ left:8,right:80,top:4,bottom:4 }} style={{ cursor:'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.border} />
                  <XAxis type="number" tickFormatter={fmtM} tick={{ fontSize:10,fill:t.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={220} tick={{ fontSize:11,fill:t.text }} tickLine={false} axisLine={false} />
                  <Tooltip content={(props) => <PresupuestoTooltip {...props} t={t} color={colorActual} fmt={fmt} />} cursor={{ fill:colorActual+'18' }} />
                  <Bar dataKey="costo" radius={[0,5,5,0]} onClick={handleBarClick} onMouseEnter={(_,i) => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}>
                    {chartData.map((_,i) => {
                      const color = PALETA_BARRAS[i%PALETA_BARRAS.length]
                      return <Cell key={i} fill={hoveredBar===null||hoveredBar===i?color:color+'66'} stroke={hoveredBar===i?color:'none'} strokeWidth={2}/>
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <div style={{ textAlign:'center',padding:'24px 0',fontSize:'13px',color:t.textMuted }}>
              {NIVELES.some(n => !drill.some(d => d.campo === n))
                ? '☝️ Selecciona un nivel de agrupación para ver el gráfico'
                : 'Nivel máximo de detalle — vea la tabla a continuación.'}
            </div>
          )}
        </div>
      )}

      {/* ── Barra Editar / Validar ── */}
      {/* ── Indicador DWG ─────────────────────────────────────────── */}
<div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', flexWrap:'wrap' }}>
        {puedeEliminar && (
          <button onClick={async () => { const v = !verPapelera; setVerPapelera(v); if (v) { _pptoCacheRef.current = null; cargarRegistros(true) } else { setRegistros([]); setDrill([]); await cargarCapitulos() } }}
            style={{ background: verPapelera ? '#EF444422' : t.bgCard, border:`1px solid ${verPapelera ? '#EF4444' : t.border}`, borderRadius:'8px', padding:'6px 14px', color: verPapelera ? '#EF4444' : t.textMuted, fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
            🗑️ {verPapelera ? 'Ver activos' : 'Papelera'}
          </button>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 14px',
          background: dwgEnlazado ? '#16A34A18' : '#EF444418',
          border: `1px solid ${dwgEnlazado ? '#16A34A44' : '#EF444444'}`,
          borderRadius:'8px', fontSize:'11px', color: dwgEnlazado ? '#16A34A' : '#EF4444',
          fontWeight:'600' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%',
            background: dwgEnlazado ? '#16A34A' : '#EF4444',
            boxShadow: dwgEnlazado ? '0 0 6px #16A34A' : 'none' }} />
          {dwgEnlazado ? '🔗 DWG Enlazado — Semáforo y edición activos' : '⛓️ Sin DWG — Semáforo y edición deshabilitados'}
        </div>
      </div>
      {(puedeEditar || puedeValidar) && registros.length > 0 && (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',boxShadow:t.shadow,display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center' }}>
          {/* Filtro de estado — siempre visible */}
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            style={{ background:t.inputBg, border:`1.5px solid ${filtroEstado ? estadoColor(filtroEstado) : t.border}`, borderRadius:'7px', padding:'5px 10px', color: filtroEstado ? estadoColor(filtroEstado) : t.textMuted, fontSize:'12px', cursor:'pointer', fontWeight: filtroEstado ? '700' : '400' }}>
            <option value="">🎨 Estado…</option>
            {SEMAFORO.map(s => <option key={s.valor} value={s.valor}>{s.label} {s.valor}</option>)}
          </select>
          {seleccionados.size === 0 ? (
            <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
              <select value={busquedaTipo} onChange={e => { setBusquedaTipo(e.target.value); setBusquedaV1(''); setBusquedaV2('') }}
                style={{ background:t.inputBg, border:`1.5px solid ${busquedaTipo?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:busquedaTipo?t.text:t.textMuted, fontSize:'12px', cursor:'pointer' }}>
                <option value="">🔍 Buscar por…</option>
                <option value="nodo">🔵 Nodo</option>
                <option value="tramo">🛣️ Tramo</option>
                <option value="abscisa">📍 Abscisa</option>
                <option value="idpol">🆔 ID Pol</option>
              </select>
              {busquedaTipo === 'tramo' && (<>
                <input value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="Nodo Inicio del tramo…"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'160px' }} />
                <input value={busquedaV2} onChange={e => setBusquedaV2(e.target.value)} placeholder="Nodo Fin del tramo…"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV2?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'160px' }} />
              </>)}
              {busquedaTipo === 'nodo' && (<>
                <input value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="Nodo Inicial…"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'130px' }} />
                <input value={busquedaV2} onChange={e => setBusquedaV2(e.target.value)} placeholder="Nodo Final…"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV2?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'130px' }} />
              </>)}
              {busquedaTipo === 'abscisa' && (<>
                <input type="number" value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="Abs. desde (ej: 1125.32)"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'170px' }} />
                <input type="number" value={busquedaV2} onChange={e => setBusquedaV2(e.target.value)} placeholder="Abs. hasta (ej: 1265.23)"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV2?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'170px' }} />
              </>)}
              {busquedaTipo === 'idpol' && (
                <input value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="ID Pol…"
                  style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?t.primary:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'180px' }} />
              )}
              {(busquedaV1 || busquedaV2) && (
                <button onClick={() => { setBusquedaTipo(''); setBusquedaV1(''); setBusquedaV2(''); setFiltroEstado('') }}
                  style={{ background:'#EF444422', border:'1px solid #EF444466', borderRadius:'7px', padding:'5px 10px', color:'#EF4444', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
                  ✕ Limpiar
                </button>
              )}
            </div>
          ) : (
            <>
              <span style={{ fontSize:'12px',fontWeight:'700',color:t.primary,background:t.primary+'18',borderRadius:'20px',padding:'3px 10px',whiteSpace:'nowrap' }}>
                {seleccionados.size} sel.
              </span>

              {puedeEditar && (<>
                {/* Capítulo */}
                <select value={editCapitulo}
                  onChange={e => { setEditCapitulo(e.target.value); setEditItem(''); setItemBusqueda(''); setItemDropOpen(false) }}
                  style={{ background:t.inputBg,border:`1.5px solid ${editCapitulo?t.primary:t.border}`,borderRadius:'7px',padding:'5px 10px',color:editCapitulo?t.text:t.textMuted,fontSize:'12px',cursor:'pointer',maxWidth:'180px' }}>
                  <option value="">Capítulo…</option>
                  {capitulosListado.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Buscador predictivo de ítem */}
                <div style={{ position:'relative' }}>
                  <input
                    value={itemBusqueda}
                    onChange={e => { setItemBusqueda(e.target.value); setItemDropOpen(true); setItemNavIdx(-1); if (!e.target.value) setEditItem('') }}
                    onFocus={() => setItemDropOpen(true)}
                    onBlur={() => setTimeout(() => { setItemDropOpen(false); setItemNavIdx(-1) }, 180)}
                    onKeyDown={e => {
                      const filtrados = itemsListado.filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase())).slice(0, 30)
                      if (e.key === 'ArrowDown') { e.preventDefault(); setItemNavIdx(i => { const n = Math.min(i + 1, filtrados.length - 1); setTimeout(() => { const el = itemDropRef.current?.children[n]; el?.scrollIntoView({ block:'nearest' }) }, 0); return n }) }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setItemNavIdx(i => { const n = Math.max(i - 1, 0); setTimeout(() => { const el = itemDropRef.current?.children[n]; el?.scrollIntoView({ block:'nearest' }) }, 0); return n }) }
                      else if (e.key === 'Enter' && itemNavIdx >= 0 && filtrados[itemNavIdx]) {
                        const p = filtrados[itemNavIdx]
                        setEditItem(p.item_numero); setItemBusqueda(`${p.item_numero} · ${p.descripcion}`); setItemDropOpen(false); setItemNavIdx(-1)
                      }
                      else if (e.key === 'Escape') { setItemDropOpen(false); setItemNavIdx(-1) }
                    }}
                    placeholder={editCapitulo ? 'Buscar ítem…' : 'Primero selecciona capítulo'}
                    disabled={!editCapitulo}
                    style={{ background:t.inputBg,border:`1.5px solid ${editItem?t.primary:t.border}`,borderRadius:'7px',padding:'5px 10px',color:t.text,fontSize:'12px',width:'280px',opacity:editCapitulo?1:0.45,cursor:editCapitulo?'text':'not-allowed' }}
                  />
                  {itemDropOpen && editCapitulo && itemBusqueda.length > 0 && (
                    <div ref={itemDropRef} style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'8px',boxShadow:'0 8px 24px rgba(0,0,0,0.2)',maxHeight:'220px',overflowY:'auto',marginTop:'3px' }}>
                      {itemsListado
                        .filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase()))
                        .slice(0, 80)
                        .map((p, idx) => (
                          <div key={p.id}
                            onMouseDown={() => { setEditItem(p.item_numero); setItemBusqueda(`${p.item_numero} · ${p.descripcion}`); setItemDropOpen(false); setItemNavIdx(-1) }}
                            onMouseEnter={() => setItemNavIdx(idx)}
                            style={{ padding:'8px 12px', fontSize:'12px', cursor:'pointer', borderBottom:`1px solid ${t.border}`, color: idx === itemNavIdx ? '#fff' : t.text, background: idx === itemNavIdx ? t.primary : 'transparent', transition:'background 0.1s' }}>
                            <strong>{p.item_numero}</strong> · {p.descripcion}
                          </div>
                        ))}
                      {itemsListado.filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase())).length === 0 && (
                        <div style={{ padding:'10px 12px',fontSize:'12px',color:t.textMuted }}>Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Vlr unit badge */}
                {precioSeleccionado && (
                  <span style={{ fontSize:'12px',fontWeight:'700',color:t.primary,background:t.primary+'18',borderRadius:'7px',padding:'5px 10px',whiteSpace:'nowrap' }}>
                    {fmt(precioSeleccionado.precio_unitario)}
                  </span>
                )}

                <button onClick={() => hayModificaciones && setModalConfirm(true)}
                  disabled={!hayModificaciones}
                  style={{ background:hayModificaciones?t.primary:t.border,color:hayModificaciones?'#fff':t.textMuted,border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'12px',fontWeight:'700',cursor:hayModificaciones?'pointer':'not-allowed',whiteSpace:'nowrap' }}>
                  🔄 Recalcular
                </button>
              </>)}

              {puedeEliminar && !verPapelera && dwgEnlazado && seleccionados.size > 1 && (
                <button onClick={async () => {
                  const comentario = await pedirComentario('validacion', true)
                  if (comentario === null) return
                  for (const id of [...seleccionados]) {
                    const res = await fetch(`${API}/presupuesto/item/${id}/dar-baja`, {
                      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) await crearComentarios([id], 'validacion', `[BAJA MASIVA] ${comentario}`)
                  }
                  setSeleccionados(new Set())
                  await recargarCapActual()
                }}
                style={{ background:'#EF444415', border:'1px solid #EF444466', borderRadius:'7px', padding:'6px 14px', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                  🗑️ Dar de baja ({seleccionados.size})
                </button>
              )}

              {puedeValidar && (<>
                <select value={bulkEstado} onChange={e => setBulkEstado(e.target.value)}
                  style={{ background:t.inputBg, border:`1.5px solid ${bulkEstado ? estadoColor(bulkEstado) : t.border}`, borderRadius:'7px', padding:'5px 10px', color:bulkEstado ? estadoColor(bulkEstado) : t.textMuted, fontSize:'12px', cursor:'pointer', fontWeight: bulkEstado ? '700' : '400' }}>
                  <option value="">Estado…</option>
                  {SEMAFORO.map(s => <option key={s.valor} value={s.valor}>{s.label} {s.valor}</option>)}
                </select>
                <button onClick={ejecutarBulkEstado}
                  disabled={!bulkEstado || guardandoBulk}
                  style={{ background:bulkEstado?'#16A34A':t.border,color:bulkEstado?'#fff':t.textMuted,border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'12px',fontWeight:'700',cursor:bulkEstado?'pointer':'not-allowed',whiteSpace:'nowrap' }}>
                  ✓ Aplicar
                </button>
              </>)}
            </>
          )}
        </div>
      )}

      {/* ── Tabla ── */}
      {(drill.length > 0 || busquedaTipo || filtroEstado || pkidsSeleccionados.length > 0) && registrosFiltrados.length > 0 && (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',overflow:'auto',boxShadow:t.shadow }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12px' }}>
            <thead style={{ background:t.bg }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={seleccionados.size === registrosFiltrados.length && registrosFiltrados.length > 0} onChange={toggleTodos} /></th>
                <th style={thStyle}>ID_POL</th>
                <th style={thStyle}>Capítulo</th>
                <th style={thStyle}>Competencia</th>
                <th style={thStyle}>Ítem</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Und</th>
                <th style={thStyle}>No.Ini</th>
                <th style={thStyle}>No.Fin</th>
                <th style={thStyle}>Área/Long</th>
                <th style={thStyle}>Ancho</th>
                <th style={thStyle}>Espesor</th>
                <th style={thStyle}>Cant.Total</th>
                <th style={thStyle}>Vlr Unit.</th>
                <th style={thStyle}>Costo Directo</th>
                <th style={thStyle}>Revisado</th>
                <th style={thStyle}>💬</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {registrosPagina.map(r => {
                const isEdit = editando === r.id
                return (
                  <tr key={r.id} data-id={r.id} style={{ background: filaZoom===r.id ? '#F59E0B22' : seleccionados.has(r.id) ? (t.primary+'18') : 'transparent', cursor: r.x_label ? 'crosshair' : 'default', outline: filaZoom===r.id ? '2px solid #F59E0B88' : 'none', transition:'background 0.3s, outline 0.3s' }}
                    onClick={() => { if (!isEdit) { zoomEnDwg(r); highlightEnDwg(r); if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && r.pk_id) { const td = document.getElementById(`zoom-feedback-${r.id}`); if(td){td.style.opacity='1'; setTimeout(()=>{td.style.opacity='0'},2000)} } } }}>
                    <td style={{...tdStyle, whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <input type="checkbox" checked={seleccionados.has(r.id)} onChange={() => toggleSel(r.id)} />
                        <span id={`zoom-feedback-${r.id}`} style={{ fontSize:'10px', color:'#10B981', opacity:'0', transition:'opacity 0.3s', pointerEvents:'none' }}>🎯</span>
                        <button onClick={() => setModalDetallePpto(r)}
                          title="Ver detalle"
                          style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'13px', padding:'0', lineHeight:1, display:'flex', alignItems:'center' }}
                          onMouseEnter={e => e.currentTarget.style.color=t.primary}
                          onMouseLeave={e => e.currentTarget.style.color=t.textMuted}>
                          ℹ️
                        </button>
                      </div>
                    </td>
                    <td style={{ ...tdStyle,fontWeight:'600',color:t.primary }}>{r.id_pol||r.pk_id||'-'}</td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.capitulo} onChange={e=>setEditValues({...editValues,capitulo:e.target.value})}
                        style={{ width:'120px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : r.capitulo}
                    </td>
                    <td style={{ ...tdStyle, fontSize:'11px', color:t.textMuted }}>{r.competencia||'—'}</td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.item} onChange={e=>setEditValues({...editValues,item:e.target.value})}
                        style={{ width:'80px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : r.item}
                    </td>
                    <td style={{ ...tdStyle,maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.descripcion}</td>
                    <td style={tdStyle}>{r.und}</td>
                    <td style={{ ...tdStyle }}>{r.no_inicio || '-'}</td>
                    <td style={{ ...tdStyle }}>{r.no_final || '-'}</td>
                    <td style={{ ...tdStyle,textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.area_long_nod} onChange={e=>setEditValues({...editValues,area_long_nod:e.target.value})}
                        style={{ width:'80px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmtN(r.area_long_nod)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditar && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.ancho ?? (r.ancho ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { espesor: r.espesor, ...prev[r.id], ancho: v } })) }}
                            style={{ width:'70px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} />
                        : fmtN(r.ancho)}                
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditar && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.espesor ?? (r.espesor ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ancho: r.ancho, ...prev[r.id], espesor: v } })) }}
                            style={{ width:'70px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} />
                        : fmtN(r.espesor)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right',fontWeight:'600' }}>{fmtN(r.cant_total)}</td>
                    <td style={{ ...tdStyle,textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.vlr_unitario} onChange={e=>setEditValues({...editValues,vlr_unitario:e.target.value})}
                        style={{ width:'90px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmt(r.vlr_unitario)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right',fontWeight:'700',color:t.primary }}>{fmt(r.costo_directo)}</td>
                    <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', justifyContent:'center' }}>
                        {SEMAFORO.map(s => {
                          const activo = (r.revisado || 'No Revisado') === s.valor
                          return (
                            <div
                              key={s.valor}
                              title={s.valor}
                              onClick={() => puedeValidar && !activo && !esSellado(r) && cambiarEstadoDirecto(r.id, s.valor)}
                              style={{
                                width: activo ? '18px' : '12px',
                                height: activo ? '18px' : '12px',
                                borderRadius: '50%',
                                background: activo ? s.color : s.color + '33',
                                border: `2px solid ${activo ? s.color : s.color + '66'}`,
                                cursor: puedeValidar && !activo ? 'pointer' : 'default',
                                opacity: 1,
                                transition: 'all 0.2s',
                                boxShadow: activo ? `0 0 8px ${s.color}88` : 'none',
                              }}
                            />
                          )
                        })}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, minWidth:'80px' }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'4px', alignItems:'center', justifyContent:'center' }}>
                        {[
                          { tipo:'dims',          icono:'📐', color:'#F59E0B', label:'Dims' },
                          { tipo:'item_capitulo', icono:'🔄', color:'#0077B6', label:'Ítem/Cap' },
                          { tipo:'validacion',    icono:'🔍', color:'#10B981', label:'Validación' },
                        ].map(({ tipo, icono, color, label }) => {
                          const c = comentariosPorId[r.id]?.[tipo]
                          if (!c || c.count === 0) return null
                          const tieneRespuestas = c.replies
                          return (
                            <div key={tipo} style={{ position:'relative' }}
                              title={`${label}: ${c.count} comentario(s)`}
                              onClick={() => abrirHilo(r.id, tipo)}>
                              <div style={{
                                background: color + '22', border:`1px solid ${color}66`,
                                borderRadius:'6px', padding:'2px 5px', fontSize:'11px',
                                cursor:'pointer', color, transition:'all 0.15s',
                                fontWeight: tieneRespuestas ? '700' : '400',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.background = color + '44' }}
                                onMouseLeave={e => { e.currentTarget.style.background = color + '22' }}>
                                {icono}
                              </div>
                              {tieneRespuestas && (
                                <div style={{ position:'absolute', top:'-3px', right:'-3px', width:'7px', height:'7px', borderRadius:'50%', background:color, border:`1.5px solid ${t.bgCard}` }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    {puedeEliminar && !verPapelera && dwgEnlazado && (
                      <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                        {seleccionados.has(r.id) && (
                          <button onClick={() => !esSellado(r) && darDeBaja(r.id)}
                            title="Dar de baja"
                            disabled={esSellado(r)}
                            style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px', color:'#EF4444', fontSize:'11px', cursor:'pointer' }}>
                            🗑️
                          </button>
                        )}
                      </td>
                    )}
                    {puedeEliminar && verPapelera && (
                      <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                        {seleccionados.has(r.id) && (
                          <button onClick={() => restaurar(r.id)}
                            title="Restaurar registro"
                            style={{ background:'#10B98115', border:'1px solid #10B98144', borderRadius:'6px', padding:'3px 8px', color:'#10B981', fontSize:'11px', cursor:'pointer' }}>
                            🔄 Restaurar
                          </button>
                        )}
                      </td>
                    )}

                    {puedeEditar && (
                      <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                        {isEdit ? (
                          <div style={{ display:'flex',gap:'4px' }}>
                            <button onClick={() => guardarEdicion(r.id)} style={{ background:t.primary,color:'#fff',border:'none',borderRadius:'4px',padding:'4px 10px',fontSize:'11px',cursor:'pointer' }}>✓</button>
                            <button onClick={() => setEditando(null)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'4px',padding:'4px 8px',fontSize:'11px',cursor:'pointer',color:t.textMuted }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => iniciarEdicion(r)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'4px',padding:'4px 8px',fontSize:'11px',cursor:'pointer',color:t.textMuted }}>✏️</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── MÓDULO SICOE ─────────────────────────────────────────────────────────────
function ModuloCobro({ t, usuario, token, s }) {
  const API = 'https://claracore-backend.azurewebsites.net'
  const esDeveloper = usuario?.cargo_nombre?.toLowerCase() === 'desarrollador'
  const contratoId = usuario?.contrato_id
  const [registros,      setRegistros]      = useState([])
  const [loading,        setLoading]        = useState(false)
  const [importing,      setImporting]      = useState(false)
  const [importMsg,      setImportMsg]      = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [modalImport,    setModalImport]    = useState(null)
  const [modoImport,     setModoImport]     = useState('append')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [drill,          setDrill]          = useState([])
  const [hoveredBar,     setHoveredBar]     = useState(null)
  const [primerNivel,    setPrimerNivel]    = useState('capitulo')
  const [busquedaTipo,   setBusquedaTipo]   = useState('')
  const [busquedaV1,     setBusquedaV1]     = useState('')
  const [busquedaV2,     setBusquedaV2]     = useState('')
  const [pagina,         setPagina]         = useState(1)
  const POR_PAGINA = 50
  const [modalDetalle,   setModalDetalle]   = useState(null)

  const NIVELES = ['capitulo', 'item', 'pk_id', 'acta', 'calzada']
  const NOM     = { capitulo:'Capítulo', item:'Ítem', pk_id:'PK_ID', acta:'Acta', calzada:'Calzada' }
  const PALETA  = ['#0077B6','#00B4C6','#00A896','#028090','#05668D','#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B','#44BBA4','#E94F37','#393E41','#F5A623','#7B2D8B']

  const fmt  = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '-'
  const fmtM = n => { if(n==null) return ''; if(n>=1e9) return `$${(n/1e9).toFixed(1)}B`; if(n>=1e6) return `$${(n/1e6).toFixed(1)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(0)}K`; return `$${Math.round(n)}` }
  const fmtN = n => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '-'

  const nivelesOrden = [primerNivel, ...NIVELES.filter(n => n !== primerNivel)]
  const nivelActual  = nivelesOrden[drill.length] || null
  const nivelIdx     = NIVELES.indexOf(nivelActual ?? primerNivel)
  const colorActual  = PALETA[Math.max(0, Math.min(nivelIdx, PALETA.length - 1))]

  const [chartLoading, setChartLoading] = useState(false)
  const [chartDataRemoto, setChartDataRemoto] = useState([])
  const [tieneDatos, setTieneDatos] = useState(null) // null=cargando, true=hay datos, false=sin datos

  useEffect(() => { if (contratoId) { cargarChart(primerNivel) } }, [contratoId])
  useEffect(() => {
    if (!contratoId || !nivelActual) return
    // Extraer el filtro del drill anterior (el capitulo seleccionado)
    const capDrill = drill.find(d => d.campo === 'capitulo')
    cargarChart(nivelActual, drill, capDrill?.valor || null)
  }, [nivelActual, drill.length])

  async function cargarChart(nivel, drillActual = [], capituloFiltro = null) {
    if (!contratoId || !nivel) return
    setChartLoading(true)
    const params = new URLSearchParams({ nivel })
    if (capituloFiltro) params.set('capitulo', capituloFiltro)
    drillActual.forEach(d => params.set(d.campo, d.valor))
    try {
      const res = await fetch(`${API}/cobro/${contratoId}/chart?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setChartDataRemoto(data)
        setTieneDatos(data.length > 0)
      } else {
        setTieneDatos(false)
      }
    } catch {
      setTieneDatos(false)
    }
    setChartLoading(false)
  }

async function cargarRegistros() {
    if (!contratoId) return
    setLoading(true)
    const res = await fetch(`${API}/cobro/${contratoId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setRegistros(await res.json())
    setLoading(false)
  }

  async function cargarRegistrosFiltrados(drillActual) {
    if (!contratoId) return
    setLoading(true)
    const params = new URLSearchParams()
    drillActual.forEach(d => params.set(d.campo, d.valor))
    const res = await fetch(`${API}/cobro/${contratoId}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) setRegistros(await res.json())
    setLoading(false)
  }

  const registrosFiltrados = useMemo(() => {
    const parseAbs = s => s ? parseFloat(String(s).replace('+', '')) : null
    return registros.filter(r => {
      // NO aplica filtro drill — el backend ya filtra por drill en cargarRegistrosFiltrados
      if (busquedaTipo === 'nodo') {
        const v1 = busquedaV1.trim().toLowerCase()
        const v2 = busquedaV2.trim().toLowerCase()
        if (v1 && !(r.tramo_inicio || '').toLowerCase().includes(v1)) return false
        if (v2 && !(r.tramo_final  || '').toLowerCase().includes(v2)) return false
      } else if (busquedaTipo === 'abscisa') {
        const ini = parseAbs(r.abs_inicial)
        const v1 = busquedaV1.trim() !== '' ? parseFloat(busquedaV1) : null
        const v2 = busquedaV2.trim() !== '' ? parseFloat(busquedaV2) : null
        if (v1 !== null || v2 !== null) {
          if (ini === null) return false
          if (v1 !== null && ini < v1) return false
          if (v2 !== null && ini > v2) return false
        }
      } else if (busquedaTipo === 'idpol') {
        const v1 = busquedaV1.trim().toLowerCase()
        if (v1 && !(r.pk_id || '').toLowerCase().includes(v1)) return false
      }
      return true
    })
  }, [registros, drill, busquedaTipo, busquedaV1, busquedaV2])

  const totalPaginasCobro = Math.ceil(registrosFiltrados.length / POR_PAGINA)
  const registrosPagina = useMemo(() =>
    registrosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  , [registrosFiltrados, pagina])

  const chartData = useMemo(() => {
    return chartDataRemoto.map(r => ({
      name: r[nivelActual] ?? '(sin valor)',
      label: nivelActual === 'item'
        ? `${r.item ?? ''} · ${(r.descripcion ?? '').slice(0,38)}${(r.descripcion ?? '').length > 38 ? '…' : ''}`
        : String(r[nivelActual] ?? '').slice(0,48),
      costo: r.costo ?? 0,
      count: r.count ?? 0,
      cantTotal: 0,
      und: null,
      vlrUnit: null
    }))
  }, [chartDataRemoto, nivelActual])

  const costoTotal = useMemo(() =>
    registrosFiltrados.reduce((s,r) => s + (r.costo_directo ?? 0), 0)
  , [registrosFiltrados])

  useEffect(() => setPagina(1), [registrosFiltrados.length])

  function handleBarClick(barData) {
    if (!nivelActual || !barData?.name) return
    const nuevoDrill = [...drill, { campo: nivelActual, valor: barData.name }]
    setDrill(nuevoDrill)
    cargarRegistrosFiltrados(nuevoDrill)
  }
  function irA(idx) {
    setDrill(prev => prev.slice(0, idx))
    if (idx === 0) setRegistros([])
  }

  const bcBtn = active => ({
    background: active ? colorActual : 'transparent', color: active ? '#fff' : colorActual,
    border: `1px solid ${active ? colorActual : colorActual+'66'}`,
    borderRadius:'20px', padding:'4px 12px', fontSize:'12px',
    fontWeight: active ? '600' : '400', cursor:'pointer', transition:'all 0.15s',
  })

  // ── Import CSV ──────────────────────────────────────────────────────────────
  async function handleImportCSV(e) {
    const file = e.target.files[0]; if (!file) return
    // Intentar Latin-1 primero; si hay caracteres de reemplazo, quedarse con UTF-8
    const rawLatin  = await file.arrayBuffer()
    const decodedLatin = new TextDecoder('iso-8859-1').decode(rawLatin)
    const decodedUTF8  = new TextDecoder('utf-8').decode(rawLatin)
    // Si UTF-8 tiene caracteres de reemplazo (�) usar Latin-1, si no usar UTF-8
    const raw = decodedUTF8.includes('\uFFFD') ? decodedLatin : decodedUTF8
    const text = raw.replace(/^\uFEFF/, '')
    const firstLine = text.split(/\r?\n/)[0]
    const sep = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ','
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g,'').trim().toUpperCase())
    const MAP = {
      'ACTA RPO':'acta','ACTA':'acta','SEMANA':'semana','FECHA':'fecha',
      'CAPITULO':'capitulo','COMPETENCIA':'competencia',
      'ABS INCIAL':'abs_inicial','ABS INICIAL':'abs_inicial','ABS FINAL':'abs_final',
      'CIV':'civ','ITEM':'item','DESCRIPCION':'descripcion','DESCRIPCIÓN':'descripcion',
      'UND':'und','LONGITUD':'longitud','ANCHO':'ancho','ESPESOR':'espesor',
      'CANTIDAD':'cantidad','VALOR UNITARIO':'valor_unitario','COSTO DIRECTO':'costo_directo',
      'CALZADA':'calzada','TRAMO INICIO':'tramo_inicio','TRAMO FINAL':'tramo_final','PK_ID':'pk_id',
      'REGISTRO':'registro','TRAMO':'tramo','OBSERVACIONES':'observaciones','OBSERVACIÓN':'observaciones'
    }
    const NUMS = new Set(['acta','longitud','ancho','espesor','cantidad','valor_unitario','costo_directo'])
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep).map(v => v.replace(/^"|"$/g,'').trim())
      const obj = {}
      headers.forEach((h, idx) => {
        const key = MAP[h]; if (!key) return
        const v = vals[idx] || ''
        if (NUMS.has(key)) { const n = parseFloat(v.replace(/[,$]/g,'')); obj[key] = isNaN(n) ? null : n }
        else obj[key] = v || null
      })
      if (obj.pk_id || obj.item) rows.push(obj)
    }
    setModalImport({ rows, fileName: file.name })
    setModoImport('append'); setConfirmReplace(false); e.target.value = ''
  }

  async function ejecutarImport() {
    if (!modalImport) return
    if (modoImport === 'replace' && !confirmReplace) { setConfirmReplace(true); return }
    const { rows } = modalImport
    setModalImport(null); setImporting(true); setImportProgreso(0)
    let ok = true; let msj = ''
    // Si es replace, primero limpiamos en una request separada
    if (modoImport === 'replace') {
      setImportMsg('🗑️ Limpiando registros anteriores...')
      const clearRes = await fetch(`${API}/cobro/${contratoId}/clear`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      })
      if (!clearRes.ok) {
        setImportMsg('❌ Error al limpiar registros anteriores')
        setImporting(false); setImportProgreso(0); return
      }
    }
    // Luego insertamos en batches pequeños
    const BATCH = 1000
    const PARALELO = 2  // Supabase free tier no aguanta más
    const chunks = []
    for (let i = 0; i < rows.length; i += BATCH) chunks.push(rows.slice(i, i + BATCH))

    for (let i = 0; i < chunks.length; i += PARALELO) {
      const grupo = chunks.slice(i, i + PARALELO)
      const resultados = await Promise.all(grupo.map(batch =>
        fetch(`${API}/cobro/${contratoId}/bulk`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(batch)
        })
      ))
      const fallido = resultados.find(r => !r.ok)
      if (fallido) {
        const d = await fallido.json().catch(() => ({}))
        msj = `❌ Error en grupo ${Math.floor(i/PARALELO)+1}: ${d.detail || 'Error desconocido'}`
        ok = false; break
      }
      setImportProgreso(Math.round(((i + PARALELO) * BATCH / rows.length) * 100))
    }
    if (ok) msj = `✅ ${rows.length} registros ${modoImport === 'replace' ? 'cargados' : 'agregados'}`
    setImportMsg(msj); setImporting(false); setImportProgreso(0)
    if (ok) { setDrill([]); setRegistros([]) }
    setTimeout(() => setImportMsg(''), 8000)
  }

  const thStyle = { padding:'8px 10px', fontSize:'11px', fontWeight:'700', letterSpacing:'0.5px', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'7px 10px', fontSize:'12px', borderBottom:`1px solid ${t.border}` }

  return (
    <div>
      {/* ── Modal importar ── */}
      {modalImport && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'28px',width:'420px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'16px',fontWeight:'700',color:t.primary,marginBottom:'8px' }}>📂 Importar SICOE</div>
            <div style={{ fontSize:'13px',color:t.textMuted,marginBottom:'20px' }}>{modalImport.fileName} — <strong style={{color:t.text}}>{modalImport.rows.length} registros</strong></div>
            <div style={{ fontSize:'13px',fontWeight:'600',color:t.text,marginBottom:'10px' }}>¿Cómo desea cargar los datos?</div>
            <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'20px' }}>
              {[['append','➕ Agregar acta','Agrega los registros sin eliminar los existentes'],['replace','🔄 Reemplazar todo','Elimina todos los registros y carga los nuevos']].map(([v,l,d]) => (
                <label key={v} style={{ display:'flex',alignItems:'flex-start',gap:'10px',padding:'12px',border:`2px solid ${modoImport===v?colorActual:t.border}`,borderRadius:'8px',cursor:'pointer',background:modoImport===v?colorActual+'11':'transparent' }}>
                  <input type="radio" name="modoSicoe" value={v} checked={modoImport===v} onChange={() => { setModoImport(v); setConfirmReplace(false) }} style={{ marginTop:'2px' }} />
                  <div><div style={{ fontSize:'13px',fontWeight:'600',color:t.text }}>{l}</div><div style={{ fontSize:'11px',color:t.textMuted }}>{d}</div></div>
                </label>
              ))}
            </div>
            {modoImport === 'replace' && confirmReplace && (
              <div style={{ background:'#FEE2E2',border:'1px solid #FCA5A5',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'12px',color:'#DC2626' }}>
                ⚠️ <strong>Esta acción no se puede deshacer.</strong> ¿Confirma?
              </div>
            )}
            <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
              <button onClick={() => { setModalImport(null); setConfirmReplace(false) }} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'13px',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarImport} style={{ background:modoImport==='replace'&&confirmReplace?'#DC2626':colorActual,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'13px',fontWeight:'600',cursor:'pointer' }}>
                {modoImport==='replace'&&!confirmReplace?'Continuar →':modoImport==='replace'?'⚠️ Sí, reemplazar':'➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex',gap:'12px',alignItems:'center',marginBottom:'16px',flexWrap:'wrap' }}>
        {esDeveloper && (
          <label style={{ background:t.primary,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 18px',fontSize:'13px',fontWeight:'600',cursor:importing?'wait':'pointer',opacity:importing?0.7:1 }}>
            {importing ? `Importando ${importProgreso}%...` : '📂 Importar CSV'}
            <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV} disabled={importing} />
          </label>
        )}
        {importing && (
          <div style={{ flex:1,maxWidth:'200px',height:'6px',background:t.border,borderRadius:'3px',overflow:'hidden' }}>
            <div style={{ width:`${importProgreso}%`,height:'100%',background:colorActual,borderRadius:'3px',transition:'width 0.3s' }} />
          </div>
        )}
        {importMsg && <span style={{ fontSize:'13px',color:importMsg.startsWith('✅')?'#16A34A':importMsg.startsWith('❌')?'#DC2626':t.textMuted }}>{importMsg}</span>}
        <span style={{ marginLeft:'auto',fontSize:'12px',color:t.textMuted }}>
          {registros.length > 0 ? `${registros.length} total · ${registrosFiltrados.length} filtrados` : `${chartData.reduce((s,d)=>s+(d.count??0),0)} registros`}
          {totalPaginasCobro > 1 && (
            <span style={{ marginLeft:'16px', display:'inline-flex', alignItems:'center', gap:'6px' }}>
              <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina===1}
                style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor:pagina===1?'default':'pointer', color:pagina===1?t.textMuted:t.text }}>‹</button>
              <span style={{ fontSize:'11px', color:t.textMuted }}>Pág. {pagina} / {totalPaginasCobro}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginasCobro, p+1))} disabled={pagina===totalPaginasCobro}
                style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor:pagina===totalPaginasCobro?'default':'pointer', color:pagina===totalPaginasCobro?t.textMuted:t.text }}>›</button>
            </span>
          )}
        </span>
      </div>

      {/* ── Barra de búsqueda cobro ── */}
      {registros.length > 0 && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'10px 14px', marginBottom:'10px', boxShadow:t.shadow, display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center' }}>
          <select value={busquedaTipo} onChange={e => { setBusquedaTipo(e.target.value); setBusquedaV1(''); setBusquedaV2('') }}
            style={{ background:t.inputBg, border:`1.5px solid ${busquedaTipo?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:busquedaTipo?t.text:t.textMuted, fontSize:'12px', cursor:'pointer' }}>
            <option value="">🔍 Buscar por…</option>
            <option value="nodo">🔵 Tramo (Ini/Fin)</option>
            <option value="abscisa">📍 Abscisa</option>
            <option value="registro">🆔 Registro</option>
          </select>
          {busquedaTipo === 'nodo' && (<>
            <input value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="Tramo Inicio…"
              style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'140px' }} />
            <input value={busquedaV2} onChange={e => setBusquedaV2(e.target.value)} placeholder="Tramo Final…"
              style={{ background:t.inputBg, border:`1.5px solid ${busquedaV2?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'140px' }} />
          </>)}
          {busquedaTipo === 'abscisa' && (<>
            <input type="number" value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="Abs. desde (ej: 1000)"
              style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'170px' }} />
            <input type="number" value={busquedaV2} onChange={e => setBusquedaV2(e.target.value)} placeholder="Abs. hasta (ej: 1200)"
              style={{ background:t.inputBg, border:`1.5px solid ${busquedaV2?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'170px' }} />
          </>)}
          {busquedaTipo === 'idpol' && (
            <input value={busquedaV1} onChange={e => setBusquedaV1(e.target.value)} placeholder="PK_ID…"
              style={{ background:t.inputBg, border:`1.5px solid ${busquedaV1?colorActual:t.border}`, borderRadius:'7px', padding:'5px 10px', color:t.text, fontSize:'12px', width:'180px' }} />
          )}
          {(busquedaV1 || busquedaV2) && (
            <button onClick={() => { setBusquedaTipo(''); setBusquedaV1(''); setBusquedaV2('') }}
              style={{ background:'#EF444422', border:'1px solid #EF444466', borderRadius:'7px', padding:'5px 10px', color:'#EF4444', fontSize:'11px', fontWeight:'700', cursor:'pointer' }}>
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {/* Panel drill-down */}
      {chartLoading || tieneDatos === null ? (
        <div style={s.emptyState}>⏳ Cargando datos...</div>
      ) : tieneDatos === false && drill.length === 0 ? (
        <div style={s.emptyState}>📂 Importa un CSV para comenzar</div>
      ) : (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',padding:'20px',marginBottom:'16px',boxShadow:t.shadow }}>

          {/* Breadcrumb */}
          <div style={{ display:'flex',alignItems:'center',gap:'6px',marginBottom:'16px',flexWrap:'wrap' }}>
            <button onClick={() => irA(0)} style={bcBtn(drill.length === 0)}>📊 Todo el SICOE</button>
            {drill.map(({campo, valor}, idx) => (
              <span key={idx} style={{ display:'flex',alignItems:'center',gap:'6px' }}>
                <span style={{ color:t.textMuted,fontSize:'13px' }}>›</span>
                <button onClick={() => irA(idx + 1)} style={bcBtn(idx === drill.length - 1)}>
                  {NOM[campo]}: {String(valor).length > 28 ? String(valor).slice(0,28)+'…' : valor}
                </button>
              </span>
            ))}
          </div>

          {/* Selector nivel */}
          <div style={{ marginBottom:'14px' }}>
            <div style={{ display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'10px' }}>
              <span style={{ fontSize:'11px',fontWeight:'700',color:t.textMuted,letterSpacing:'0.5px' }}>AGRUPAR POR:</span>
              {NIVELES.map(n => {
                const activo = primerNivel === n
                return (
                  <button key={n} onClick={() => { setPrimerNivel(n); setDrill([]) }}
                    style={{ background:activo?colorActual:t.bg, color:activo?'#fff':t.text, border:`1.5px solid ${activo?colorActual:t.border}`, borderRadius:'20px', padding:'4px 14px', fontSize:'12px', fontWeight:activo?'700':'400', cursor:'pointer', transition:'all 0.15s' }}>
                    {NOM[n]}
                  </button>
                )
              })}
            </div>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px' }}>
              <span style={{ fontSize:'12px',color:t.textMuted }}>
                {registrosFiltrados.length} registros · <strong style={{color:colorActual}}>{fmt(costoTotal)}</strong>
              </span>
              {nivelActual && <span style={{ fontSize:'11px',color:t.textMuted,fontStyle:'italic' }}>👆 Click en una barra para filtrar</span>}
            </div>
          </div>

          {/* Gráfico */}
          {nivelActual ? (
            nivelActual === 'pk_id' ? (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(15, 1fr)',gap:'6px',maxHeight:'320px',overflowY:'auto',padding:'4px 2px' }}>
                {chartData.map((d, i) => {
                  const color = PALETA[i % PALETA.length]
                  return (
                    <button key={d.name} onClick={() => handleBarClick(d)}
                      title={`${d.name}\n${fmt(d.costo)}\n${d.count} registros`}
                      style={{ background:color+'22',border:`1.5px solid ${color}`,borderRadius:'6px',padding:'5px 4px',fontSize:'11px',fontWeight:'600',color,cursor:'pointer',textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background=color; e.currentTarget.style.color='#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background=color+'22'; e.currentTarget.style.color=color }}>
                      {d.name}
                    </button>
                  )
                })}
              </div>
            ) : nivelActual === 'item' ? (() => {
              const costoMax = Math.max(...chartData.map(d => d.costo), 1)
              const gSize = chartData.length > 20 ? 117 : chartData.length > 10 ? 130 : 144
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:'8px', padding:'4px 2px' }}>
                  {chartData.map((d, i) => {
                    const pct   = Math.round((d.costo / costoMax) * 100)
                    const clamp = Math.min(Math.max(pct, 0), 100)
                    const color = PALETA[i % PALETA.length]
                    const cx = gSize/2, cy = gSize*0.57, r = gSize*0.37, sw = gSize*0.076
                    const START=-135, SPAN=270, fillEnd = START+(clamp/100)*SPAN
                    const toRad = a => (a*Math.PI)/180
                    const pt = angle => ({ x: cx+r*Math.cos(toRad(angle)), y: cy+r*Math.sin(toRad(angle)) })
                    const arcD = (a1,a2) => { const s=pt(a1),e=pt(a2); const large=(a2-a1)>180?1:0; return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}` }
                    const nTip = { x: cx+(r-sw-4)*Math.cos(toRad(fillEnd)), y: cy+(r-sw-4)*Math.sin(toRad(fillEnd)) }
                    return (
                      <div key={d.name} onClick={() => handleBarClick(d)}
                        title={`${d.name}\n${fmt(d.costo)}\n${d.count} registros`}
                        style={{ cursor:'pointer',background:t.bgCard,border:`1.5px solid ${color}55`,borderRadius:'12px',padding:'8px 6px 10px',display:'flex',flexDirection:'column',alignItems:'center',transition:'all 0.2s',boxShadow:`0 2px 12px ${color}1A` }}
                        onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.borderColor=color; e.currentTarget.style.boxShadow=`0 8px 24px ${color}44` }}
                        onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.borderColor=`${color}55`; e.currentTarget.style.boxShadow=`0 2px 12px ${color}1A` }}>
                        <div style={{ fontSize:'9px',color:t.textMuted,textAlign:'center',lineHeight:1.3,marginBottom:'3px',width:'100%',padding:'0 2px',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' }}>{d.label||d.name}</div>
                        <svg width={gSize} height={gSize*0.66} viewBox={`0 0 ${gSize} ${gSize*0.66}`} style={{overflow:'visible'}}>
                          {clamp>0 && <path d={arcD(START,fillEnd)} fill="none" stroke={color} strokeWidth={sw+6} strokeLinecap="round" opacity={0.1}/>}
                          <path d={arcD(START,START+SPAN)} fill="none" stroke={t.border} strokeWidth={sw} strokeLinecap="round"/>
                          {clamp>0 && <path d={arcD(START,fillEnd)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"/>}
                          {[0,25,50,75,100].map(tp => {
                            const a=START+(tp/100)*SPAN; const p1={x:cx+(r-sw/2-2)*Math.cos(toRad(a)),y:cy+(r-sw/2-2)*Math.sin(toRad(a))}; const p2={x:cx+(r-sw-5)*Math.cos(toRad(a)),y:cy+(r-sw-5)*Math.sin(toRad(a))}
                            return <line key={tp} x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)} x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke={t.textMuted} strokeWidth={1.2} opacity={0.4}/>
                          })}
                          <line x1={cx} y1={cy} x2={nTip.x.toFixed(2)} y2={nTip.y.toFixed(2)} stroke={color} strokeWidth={gSize*0.016} strokeLinecap="round"/>
                          <circle cx={cx} cy={cy} r={gSize*0.048} fill={color}/><circle cx={cx} cy={cy} r={gSize*0.022} fill={t.bgCard}/>
                        </svg>
                        <div style={{ display:'flex',justifyContent:'space-between',width:'100%',padding:'0 3px',marginTop:'2px' }}>
                          <span style={{ fontSize:'10px',fontWeight:'700',color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%' }}>{d.name}</span>
                          <span style={{ fontSize:'13px',fontWeight:'800',color }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize:'9px',color:t.textMuted,marginTop:'2px' }}>{fmtM(d.costo)}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })() : nivelActual === 'capitulo' ? (() => {
              const maxVal = Math.max(...chartData.map(d => d.costo), 1)
              const BAR_W=60, GAP=30, PAD_L=12, PAD_R=12, H=220, PAD_T=14, PAD_B=72
              const colW = BAR_W + GAP
              const totalW = Math.max(PAD_L + chartData.length * colW + PAD_R, 600)
              const scaleH = v => PAD_T + (1-v/maxVal)*(H-PAD_T-PAD_B)
              return (
                <div style={{ overflowX:'auto', width:'100%' }}>
                  <svg width={totalW} height={H} style={{ overflow:'visible', display:'block', minWidth:'100%' }}>
                    {[0,25,50,75,100].map(pct => {
                      const y = PAD_T+(1-pct/100)*(H-PAD_T-PAD_B)
                      return <line key={pct} x1={PAD_L} x2={totalW-PAD_R} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                    })}
                    {chartData.map((d,i) => {
                      const color = PALETA[i%PALETA.length]
                      const x = PAD_L + i * colW
                      const y = scaleH(d.costo)
                      const h = H-PAD_B-y
                      const nom = String(d.name).length>18 ? String(d.name).slice(0,18)+'…' : String(d.name)
                      return (
                        <g key={d.name} onClick={() => handleBarClick(d)} style={{ cursor:'pointer' }}>
                          <rect x={x} y={y} width={BAR_W} height={Math.max(h,2)} fill={color} rx="3" opacity="0.85"
                            onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-scobro-${i}`); if(tip) tip.style.display='block' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-scobro-${i}`); if(tip) tip.style.display='none' }}/>
                          <text x={x+BAR_W/2} y={H-PAD_B+14} textAnchor="end" fontSize="9" fill={t.textMuted}
                            transform={`rotate(-35,${x+BAR_W/2},${H-PAD_B+14})`}>{nom}</text>
                          <g id={`tip-scobro-${i}`} style={{display:'none',pointerEvents:'none'}}>
                            <rect x={Math.min(x-10,totalW-PAD_R-190)} y={Math.max(y-50,0)} width="185" height="42" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                            <text x={Math.min(x-10,totalW-PAD_R-190)+10} y={Math.max(y-50,0)+16} fontSize="10" fontWeight="700" fill={t.text}>{String(d.name).length>24?String(d.name).slice(0,24)+'…':String(d.name)}</text>
                            <text x={Math.min(x-10,totalW-PAD_R-190)+10} y={Math.max(y-50,0)+32} fontSize="10" fill={t.textMuted}>
                              <tspan fontWeight="700" fill={color}>{fmt(d.costo)}</tspan><tspan> · {d.count} reg.</tspan>
                            </text>
                          </g>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              )
            })() : (
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length*40+20)}>
                <BarChart data={chartData} layout="vertical" margin={{ left:8,right:80,top:4,bottom:4 }} style={{ cursor:'pointer' }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.border} />
                  <XAxis type="number" tickFormatter={fmtM} tick={{ fontSize:10,fill:t.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={220} tick={{ fontSize:11,fill:t.text }} tickLine={false} axisLine={false} />
                  <Tooltip content={(props) => <PresupuestoTooltip {...props} t={t} color={colorActual} fmt={fmt} />} cursor={{ fill:colorActual+'18' }} />
                  <Bar dataKey="costo" radius={[0,5,5,0]} onClick={handleBarClick} onMouseEnter={(_,i) => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}>
                    {chartData.map((_,i) => {
                      const color = PALETA[i%PALETA.length]
                      return <Cell key={i} fill={hoveredBar===null||hoveredBar===i?color:color+'66'} stroke={hoveredBar===i?color:'none'} strokeWidth={2}/>
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <div style={{ textAlign:'center',padding:'24px 0',fontSize:'13px',color:t.textMuted }}>
              {NIVELES.some(n => !drill.some(d => d.campo === n))
                ? '☝️ Selecciona un nivel de agrupación para ver el gráfico'
                : 'Nivel máximo de detalle — vea la tabla a continuación.'}
            </div>
          )}
        </div>
      )}
      {/* Modal detalle registro */}
      {modalDetalle && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={() => setModalDetalle(null)}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'520px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px' }}>
              <div style={{ fontSize:'14px',fontWeight:'800',color:t.primary }}>📋 Detalle del Registro</div>
              <button onClick={() => setModalDetalle(null)} style={{ background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:t.textMuted }}>✕</button>
            </div>
            {/* Contenido compacto */}
            {(() => {
              const F = ({label, val, flex=1}) => (
                <div style={{ flex, minWidth:0 }}>
                  <div style={{ fontSize:'9px',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>{label}</div>
                  <div style={{ fontSize:'12px',color:t.text,fontWeight:'500',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{val ?? '—'}</div>
                </div>
              )
              const Row = ({children}) => (
                <div style={{ display:'flex',gap:'12px',background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>{children}</div>
              )
              const BigF = ({label, val}) => (
                <div style={{ background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>
                  <div style={{ fontSize:'9px',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px',marginBottom:'3px' }}>{label}</div>
                  <div style={{ fontSize:'12px',color:t.text,lineHeight:1.5 }}>{val ?? '—'}</div>
                </div>
              )
              return (
                <>
                  <Row><F label="REGISTRO" val={modalDetalle.registro}/><F label="ACTA" val={modalDetalle.acta} flex={0.5}/><F label="SEMANA" val={modalDetalle.semana} flex={0.5}/></Row>
                  <Row><F label="CAPÍTULO" val={modalDetalle.capitulo}/><F label="COMPETENCIA" val={modalDetalle.competencia}/></Row>
                  <Row><F label="ÍTEM" val={modalDetalle.item} flex={0.5}/><F label="UNIDAD" val={modalDetalle.und} flex={0.5}/><F label="FECHA" val={modalDetalle.fecha}/></Row>
                  <BigF label="DESCRIPCIÓN" val={modalDetalle.descripcion}/>
                  <Row><F label="CIV" val={modalDetalle.civ}/><F label="PK_ID" val={modalDetalle.pk_id}/><F label="TRAMO" val={modalDetalle.tramo}/></Row>
                  <Row><F label="ABS. INICIAL" val={modalDetalle.abs_inicial}/><F label="ABS. FINAL" val={modalDetalle.abs_final}/><F label="CALZADA" val={modalDetalle.calzada}/></Row>
                  <Row><F label="TRAMO INICIO" val={modalDetalle.tramo_inicio}/><F label="TRAMO FINAL" val={modalDetalle.tramo_final}/></Row>
                  <Row>
                    <F label="LONGITUD" val={fmtN(modalDetalle.longitud)} flex={0.5}/>
                    <F label="ANCHO" val={fmtN(modalDetalle.ancho)} flex={0.5}/>
                    <F label="ESPESOR" val={fmtN(modalDetalle.espesor)} flex={0.5}/>
                    <F label="CANTIDAD" val={fmtN(modalDetalle.cantidad)} flex={0.5}/>
                  </Row>
                  <Row>
                    <F label="VLR. UNITARIO" val={fmt(modalDetalle.valor_unitario)}/>
                    <F label="COSTO DIRECTO" val={fmt(modalDetalle.costo_directo)}/>
                  </Row>
                  {modalDetalle.observaciones && <BigF label="OBSERVACIONES" val={modalDetalle.observaciones}/>}
                </>
              )
            })()}
          </div>
        </div>
      )}
      {/* Tabla — visible con drill activo o búsqueda activa */}
      {drill.length > 0 && loading && (
        <div style={s.emptyState}>⏳ Cargando registros...</div>
      )}
      {(drill.length > 0 || busquedaTipo) && !loading && registrosFiltrados.length === 0 && registros.length === 0 && drill.length > 0 && (
        <div style={s.emptyState}>Sin registros para este filtro</div>
      )}
      {(drill.length > 0 || busquedaTipo) && registrosFiltrados.length > 0 && (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',overflow:'auto',boxShadow:t.shadow }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12px' }}>
            <thead style={{ background:t.bg }}>
              <tr>
                {['Acta','PK_ID','Capítulo','Ítem','Descripción','Und','Cantidad','Vlr Unit.','Costo Directo','Calzada','Tramo Ini','Tramo Fin'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registrosPagina.map((r,i) => (
                <tr key={r.id || i}
                  onClick={() => setModalDetalle(r)}
                  style={{ background:'transparent', cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t.primary+'18'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...tdStyle,fontWeight:'700',color:colorActual }}>{r.acta}</td>
                  <td style={{ ...tdStyle,fontWeight:'600' }}>{r.pk_id}</td>
                  <td style={tdStyle}>{r.capitulo}</td>
                  <td style={tdStyle}>{r.item}</td>
                  <td style={{ ...tdStyle,maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.descripcion}</td>
                  <td style={tdStyle}>{r.und}</td>
                  <td style={{ ...tdStyle,textAlign:'right' }}>{fmtN(r.cantidad)}</td>
                  <td style={{ ...tdStyle,textAlign:'right' }}>{fmt(r.valor_unitario)}</td>
                  <td style={{ ...tdStyle,textAlign:'right',fontWeight:'700',color:colorActual }}>{fmt(r.costo_directo)}</td>
                  <td style={tdStyle}>{r.calzada}</td>
                  <td style={tdStyle}>{r.tramo_inicio}</td>
                  <td style={tdStyle}>{r.tramo_final}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── HOJA REGIS// ─── MAPA PORTADA ─────────────────────────────────────────────────────────────
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
      style: 'mapbox://styles/mapbox/streets-v12',
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
  const rol     = (usuario?.rol || '').toLowerCase()
  const cargo   = (usuario?.cargo_nombre || usuario?.cargo || '').toLowerCase()
  const modulos = usuario?.permisos_modulos || []

  const modRpt  = modulos.find(m =>
    (m.modulo_nombre || m.nombre || '').toLowerCase().includes('reporte de cantidades')
  )
  const puedeValidar = !!(modRpt?.puede_validar ?? modRpt?.validar)
  const puedeEditar  = !!(modRpt?.puede_editar  ?? modRpt?.editar)

  const esContratista   = rol === 'contratista'
  const esInterventoria = rol === 'interventoría' || rol === 'interventoria'
  const esSubRol        = rol === 'subcontratista'

  let nivelValidacion = null

  if (esContratista && puedeValidar &&
      (cargo.includes('inspector') || cargo.includes('topógrafo') || cargo.includes('topografo'))) {
    nivelValidacion = 1
  } else if (esContratista && puedeEditar && puedeValidar && cargo.includes('residente')) {
    nivelValidacion = 2
  } else if (esInterventoria && puedeValidar) {
    nivelValidacion = 3
  }

  const esApoyoTecnico  = esInterventoria && !puedeValidar &&
                          (cargo.includes('apoyo') || cargo.includes('técnico') || cargo.includes('tecnico'))
  const esSubcontratista = esSubRol || cargo.includes('subcontratista')

  const verValoresEconomicos = !(nivelValidacion === 1 || esApoyoTecnico)

  const rolOrigen = esInterventoria ? 'interventoria'
                  : esSubRol        ? 'subcontratista'
                  : 'contratista'

  return { nivelValidacion, esApoyoTecnico, esSubcontratista, verValoresEconomicos, rolOrigen }
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

const COLOR_ESTADO = { Aprobado: '#16a34a', Pendiente: '#d97706', Rechazado: '#dc2626', 'No Objeto de Cobro': '#dc2626' }

function PopupComentarioValidacion({ t, usuario, registro, contrato_id, API_URL, hdrs,
                                     estadoValidando, nivelValidacion, obligatorio,
                                     onConfirmar, onCancelar }) {
  const [usuarios,      setUsuarios]      = useState([])
  const [destinatarios, setDestinatarios] = useState([])
  const [etiqueta,      setEtiqueta]      = useState('')
  const [asunto,        setAsunto]        = useState('')
  const [mensaje,       setMensaje]       = useState('')
  const [enlaceInput,   setEnlaceInput]   = useState('')
  const [enlaces,       setEnlaces]       = useState([])
  const [error,         setError]         = useState('')

  const esObligatorio = obligatorio || estadoValidando === 'Pendiente' || estadoValidando === 'Rechazado' || estadoValidando === 'No Objeto de Cobro'
  const colorEstado   = COLOR_ESTADO[estadoValidando] || t.primary

  useEffect(() => {
    fetch(`${API_URL}/admin/usuarios-contrato/${contrato_id}`, { headers: hdrs })
      .then(r => r.json())
      .then(d => setUsuarios(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const toggleDestinatario = u => {
    setDestinatarios(prev =>
      prev.find(d => d.id === u.id) ? prev.filter(d => d.id !== u.id) : [...prev, u]
    )
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
      if (!destinatarios.length) { setError('Selecciona al menos un destinatario.'); return false }
      if (!etiqueta)             { setError('Selecciona una etiqueta de observación.'); return false }
      if (!asunto.trim())        { setError('El asunto es obligatorio.'); return false }
      if (!mensaje.trim())       { setError('El mensaje es obligatorio.'); return false }
    }
    setError('')
    return true
  }

  const confirmar = () => {
    if (!validar()) return
    onConfirmar({ destinatarios, etiqueta, asunto, mensaje, enlaces })
  }

  const confirmarSinComentario = () => {
    onConfirmar(null)
  }

  const iS = {
    width: '100%', background: t.inputBg, border: `1.5px solid ${t.inputBorder}`,
    borderRadius: '10px', padding: '10px 13px', color: t.text, fontSize: '13px',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000,
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
              Comentario de validación
            </div>
            <div style={{ fontSize: '11px', color: colorEstado, fontWeight: '600', marginTop: '2px' }}>
              Estado: {estadoValidando} · Nivel {nivelValidacion}
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
              PARA {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
            </div>
            <div style={{ maxHeight: '140px', overflowY: 'auto', border: `1.5px solid ${t.inputBorder}`,
                          borderRadius: '10px', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {usuarios.length === 0 && (
                <div style={{ fontSize: '12px', color: t.textMuted, padding: '4px' }}>Cargando usuarios…</div>
              )}
              {usuarios.map(u => {
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

          {/* Etiqueta */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
              ETIQUETA {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
            </div>
            <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)} style={iS}>
              <option value=''>— Selecciona una etiqueta —</option>
              {ETIQUETAS_VALIDACION.map(et => (
                <option key={et} value={et}>{et}</option>
              ))}
            </select>
          </div>

          {/* Asunto */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.8px', marginBottom: '6px' }}>
              ASUNTO {esObligatorio && <span style={{ color: '#dc2626' }}>*</span>}
            </div>
            <input value={asunto} onChange={e => setAsunto(e.target.value)} style={iS}
                   placeholder='Resumen breve del comentario' />
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
          {!esObligatorio && (
            <button onClick={confirmarSinComentario}
              style={{ padding: '10px 18px', background: `${colorEstado}22`, border: `1.5px solid ${colorEstado}55`,
                       borderRadius: '10px', color: colorEstado, fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              Confirmar sin comentario
            </button>
          )}
          <button onClick={confirmar}
            style={{ padding: '10px 18px', background: colorEstado, border: 'none',
                     borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            Confirmar con comentario
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── HOJA REGISTRO ────────────────────────────────────────────────────────────
function HojaRegistro({ t, usuario, API_URL, contrato_id, reporte, registro, puedeEditar, seleccionado, onToggleSeleccion, onItemAsignado, hdrs }) {
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
  const API = API_URL
  const nivelInfo = determinarNivelValidacion(usuario)

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
          alert('⚠️ No existe un Acta RPO vigente para la fecha de hoy.\n\nCrea el Acta RPO en el módulo administrativo antes de asignar ítems.')
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

      onItemAsignado()
    } catch(e) {
      alert(`No se pudieron guardar los cambios: ${e.message}`)
    }
    setGuardando(false)
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
    const sufijo = nivel === 1 ? 'validar-nivel1' : nivel === 2 ? 'validar-nivel2' : 'validar-nivel3'
    const body = { estado: estadoValidando }
    if (comentarioData) body.comentario_data = comentarioData
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
            {puedeEditar && (
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
          <div style={{ fontSize:'11px', color:t.textMuted }}>
            {(() => { try { const ts=registro.created_at; if (!ts) return ''; const n=/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?'':d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) } catch{return ''} })()}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:'5px', background: reporte.acta_rpo_numero ? `${t.primary}15` : '#EF444415', border:`1px solid ${reporte.acta_rpo_numero ? t.primary+'33' : '#EF444433'}`, borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color: reporte.acta_rpo_numero ? t.primary : '#EF4444' }}>
            📋 {reporte.acta_rpo_numero ? `RPO #${reporte.acta_rpo_numero}` : 'Sin Acta RPO'}
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:'5px', background:`${t.textMuted}15`, border:`1px solid ${t.border}`, borderRadius:'20px', padding:'3px 12px', fontSize:'11px', fontWeight:'700', color:t.textMuted }}>
            📄 {reporte.corte_numero ? `Corte #${reporte.corte_numero}` : 'Sin Corte'}
          </span>
          {puedeEditar ? (
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

      {/* ─ Sección: Asignación de Ítem ─ */}
      {puedeEditar && (
        <div style={{ background:t.bg, borderRadius:'10px', padding:'16px', marginBottom:'16px', border:`1px solid ${C.borde}` }}>
          <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>🔖 Asignación de Ítem</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'12px' }}>
            {/* Capítulo */}
            <div>
              <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Capítulo</div>
              <select value={capituloHoja} onChange={e => { setCapituloHoja(e.target.value); setCompetencia(''); setItemSel(null); setItemBusqueda('') }}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
                <option value="">— Selecciona —</option>
                {listaCapitulos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Competencia */}
            <div>
              <div style={{ fontSize:'10px', fontWeight:'700', color:C.label, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Competencia</div>
              <select value={competencia} onChange={e => { setCompetencia(e.target.value); setItemSel(null); setItemBusqueda('') }}
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
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
                style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px', boxSizing:'border-box' }}
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
              <CampoRO label="Vlr. Unitario"  valor={fmtD(itemSel.precio_unitario)} color='#10B981' />
            </div>
          )}
        </div>
      )}

      {/* ─ Sección: Dimensiones y Cantidades ─ */}
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontSize:'11px', fontWeight:'800', color:'#F59E0B', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>📏 Dimensiones y Cantidades</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:'10px' }}>
          {puedeEditar ? (
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
          {puedeEditar ? (
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
                  {puedeEditar && (
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
                <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, cursor:'pointer', gap:'6px', borderBottom:`1px solid ${t.border}` }}>
                  {uploadingFoto
                    ? <span style={{ color:t.textMuted, fontSize:'12px' }}>⏳ Subiendo...</span>
                    : <>
                        <span style={{ fontSize:'28px' }}>📷</span>
                        <span style={{ fontSize:'11px', color:t.textMuted }}>Nueva foto</span>
                        <span style={{ fontSize:'11px', color:t.primary, fontWeight:'600' }}>Toca para cargar</span>
                      </>
                  }
                  <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingFoto}
                    onChange={e => { const f = e.target.files[0]; if (f) subirFoto(f) }} />
                </label>
                <button onClick={() => setModalGaleriaHoja(true)}
                  style={{ padding:'8px', background:'transparent', border:'none', color:t.primary, fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>
                  🖼️ Usar foto de la galería
                </button>
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
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'160px', background:t.bg, cursor:'pointer', gap:'8px' }}>
                {uploadingGraf
                  ? <span style={{ color:t.textMuted, fontSize:'12px' }}>⏳ Subiendo...</span>
                  : <>
                      <span style={{ fontSize:'32px' }}>📐</span>
                      <span style={{ fontSize:'12px', color:t.textMuted }}>Gráfico del reporte</span>
                      <span style={{ fontSize:'11px', color:t.primary, fontWeight:'600' }}>Toca para cargar</span>
                    </>
                }
                <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploadingGraf}
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
      {nivelInfo.nivelValidacion && (() => {
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
            onItemAsignado()
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
          obligatorio={estadoValidando !== 'Aprobado'}
          onConfirmar={confirmarValidacion}
          onCancelar={() => setMostrarPopupValidacion(false)}
        />
      )}

      {/* ─ Acciones finales ─ */}
      {puedeEditar && (
        <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:'12px', borderTop:`1px solid ${C.borde}` }}>
          <button onClick={guardarCambios} disabled={guardando} style={{
            background: t.primary, color:'#fff', border:'none',
            borderRadius:'8px', padding:'8px 22px', fontSize:'12px', fontWeight:'700',
            cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1
          }}>{guardando ? 'Guardando...' : '💾 Guardar Cambios'}</button>
        </div>
      )}
    </div>
  )
}

// ─── CARPETA REPORTE ──────────────────────────────────────────────────────────
function CarpetaReporte({ t, usuario, API_URL, contrato_id, reporte: repoProp, onClose, onActualizar }) {
  const [reporte, setReporte]                     = useState(repoProp)
  const [registros, setRegistros]                 = useState(repoProp.registros || [])
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
  const [registroExpandido, setRegistroExpandido] = useState(null)
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
  const [comentariosData, setComentariosData]      = useState([])
  const [loadingComentarios, setLoadingComentarios] = useState(false)
  const [popupMasivo, setPopupMasivo]              = useState(null)   // { estado } o null
  const [msgMasivo, setMsgMasivo]                  = useState('')
  const [ejecutandoMasivo, setEjecutandoMasivo]    = useState(false)

  const perm        = (usuario?.permisos || []).find(p => p.funcion_nombre === 'Reporte de Cantidades')
  const puedeEditar = perm?.editar
  const hdrs        = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
  const nivelInfo   = determinarNivelValidacion(usuario)

  // Para subcontratistas: solo registros con objeto_pago_sub y subcontratista coincidente
  const subIdEnCarpeta   = usuario?.subcontratista_id ?? usuario?.sub_id ?? null
  const registrosVisibles = nivelInfo.esSubcontratista
    ? registros.filter(r => r.nivel2_objeto_pago_sub === true &&
        (subIdEnCarpeta === null || r.subcontratista_id === subIdEnCarpeta))
    : registros

  // Ítems asignados únicos — cada uno genera un tab
  const itemsAsignados = [...new Set(registrosVisibles.filter(r => r.item_numero).map(r => r.item_numero))]
  const regsSinAsignar = registrosVisibles.filter(r => !r.item_numero)

  const recargar = async () => {
    try {
      const res  = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}`, { headers: hdrs })
      const data = await res.json()
      setReporte(data)
      setRegistros(data.registros || [])
    } catch(e) {}
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

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:'1100px', background:C.carpetaFondo, borderRadius:'16px', border:`2px solid ${C.carpetaHeader}`, boxShadow:'0 24px 80px rgba(0,0,0,0.6)', minHeight:'80vh', display:'flex', flexDirection:'column' }}>

        {/* ─ Header tipo carpeta ─ */}
        <div style={{ background:`linear-gradient(135deg, ${t.primary}, ${t.primary}BB)`, borderRadius:'14px 14px 0 0', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <span style={{ fontSize:'28px' }}>📁</span>
            <div>
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
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'50%', width:'34px', height:'34px', fontSize:'18px', cursor:'pointer', fontWeight:'900', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* ─ Tab bar horizontal ─ */}
        <div style={{ display:'flex', gap:'4px', padding:'12px 16px 0', background:'#0F1923', borderBottom:`1px solid ${C.borde}`, overflowX:'auto' }}>
          {[
            { key: 'portada',      label: '📋 Portada' },
            { key: 'sin_asignar',  label: `📄 Sin Asignar Ítem${regsSinAsignar.length > 0 ? ` (${regsSinAsignar.length})` : ''}` },
            ...itemsAsignados.map(it => ({ key: it, label: `🔖 ${it}` }))
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

              {/* GRUPO 1 — Seguimiento Contractual (primero) */}
              <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                <div style={{ fontSize:'11px', fontWeight:'800', color:t.primary, letterSpacing:'1px', textTransform:'uppercase', marginBottom:'12px' }}>📑 Seguimiento Contractual</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                  <CampoInfo label="Acta RPO" valor={reporte.acta_rpo_numero ? `RPO #${reporte.acta_rpo_numero}` : null} />
                  <CampoInfo label="Corte"    valor={reporte.corte_numero    ? `Corte #${reporte.corte_numero}` : null} />
                  <CampoInfo label="Semana"   valor={reporte.semana_numero   ? `Semana ${reporte.semana_numero}${reporte.semana_periodo ? ' · ' + reporte.semana_periodo : ''}` : null} />
                </div>
              </div>

              {/* PANEL — Validación Masiva (solo nivel 2 y 3) */}
              {(nivelInfo.nivelValidacion === 2 || nivelInfo.nivelValidacion === 3) && (() => {
                const nv        = nivelInfo.nivelValidacion
                const campoEst  = nv === 2 ? 'nivel2_estado' : 'nivel3_estado'
                const conteo    = { 'No Revisado': 0, 'Aprobado': 0, 'Pendiente': 0, 'Rechazado': 0 }
                registros.forEach(r => {
                  const est = r[campoEst] || 'No Revisado'
                  if (conteo[est] !== undefined) conteo[est]++
                  else conteo['No Revisado']++
                })
                const todosSeleccionados = registros.length > 0 && registros.every(r => seleccionados.includes(r.id))

                const ejecutarMasivo = async (estado, comentarioData) => {
                  setPopupMasivo(null)
                  setEjecutandoMasivo(true)
                  setMsgMasivo('')
                  const sufijo   = nv === 2 ? 'validar-masivo-nivel2' : 'validar-masivo-nivel3'
                  const body     = { estado, ids_registros: registros.map(r => r.id) }
                  if (comentarioData) body.comentario_data = comentarioData
                  try {
                    const res  = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${reporte.id}/${sufijo}`, {
                      method: 'PUT', headers: hdrs, body: JSON.stringify(body)
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
                    setMsgMasivo(`✅ ${data.actualizados} actualizado(s), ${data.omitidos} omitido(s) por no cumplir el nivel anterior.`)
                    recargar()
                  } catch(e) {
                    setMsgMasivo(`❌ ${e.message}`)
                  }
                  setEjecutandoMasivo(false)
                }

                const BTNS_MASIVOS = [
                  { estado:'Aprobado',  icon:'✅', color:'#16a34a' },
                  { estado:'Pendiente', icon:'🟡', color:'#d97706' },
                  { estado:'Rechazado', icon:'🔴', color:'#dc2626' },
                ]
                const COLOR_CNT = { 'No Revisado':'#3B82F6', 'Aprobado':'#10B981', 'Pendiente':'#F59E0B', 'Rechazado':'#EF4444' }

                return (
                  <div style={{ background:t.bgCard, borderRadius:'10px', padding:'16px', border:`1px solid ${t.border}` }}>
                    <div style={{ fontSize:'11px', fontWeight:'800', color:'#7c3aed', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'14px' }}>
                      ⚡ Validación Masiva · Nivel {nv}
                    </div>

                    {/* Conteo de estados */}
                    <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'14px' }}>
                      {Object.entries(conteo).map(([est, cnt]) => (
                        <div key={est} style={{ display:'flex', alignItems:'center', gap:'6px', background:t.bg,
                                                border:`1px solid ${t.border}`, borderRadius:'20px', padding:'4px 12px' }}>
                          <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: COLOR_CNT[est], flexShrink:0 }} />
                          <span style={{ fontSize:'11px', fontWeight:'700', color:t.text }}>{cnt}</span>
                          <span style={{ fontSize:'10px', color:t.textMuted }}>{est}</span>
                        </div>
                      ))}
                    </div>

                    {/* Checkbox seleccionar todos */}
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px' }}>
                      <input type="checkbox" id="sel-todos-masivo"
                        checked={todosSeleccionados}
                        onChange={() => {
                          if (todosSeleccionados) setSeleccionados([])
                          else setSeleccionados(registros.map(r => r.id))
                        }}
                        style={{ width:'16px', height:'16px', accentColor:'#7c3aed', cursor:'pointer' }} />
                      <label htmlFor="sel-todos-masivo"
                        style={{ fontSize:'12px', fontWeight:'600', color:t.text, cursor:'pointer' }}>
                        Seleccionar todos los registros del reporte ({registros.length})
                      </label>
                    </div>

                    {/* Botones de acción masiva */}
                    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                      {BTNS_MASIVOS.map(({ estado, icon, color }) => (
                        <button key={estado}
                          disabled={ejecutandoMasivo}
                          onClick={() => {
                            if (estado === 'Aprobado') {
                              ejecutarMasivo(estado, null)
                            } else {
                              setPopupMasivo({ estado })
                            }
                          }}
                          style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:'700',
                                   cursor: ejecutandoMasivo ? 'not-allowed' : 'pointer',
                                   opacity: ejecutandoMasivo ? 0.6 : 1,
                                   background:`${color}18`, color, border:`1.5px solid ${color}55` }}>
                          {icon} {estado} todos
                        </button>
                      ))}
                    </div>

                    {/* Mensaje resultado */}
                    {msgMasivo && (
                      <div style={{ marginTop:'12px', fontSize:'12px', color:t.text, background:t.bg,
                                    borderRadius:'8px', padding:'10px 14px', border:`1px solid ${t.border}` }}>
                        {msgMasivo}
                      </div>
                    )}

                    {/* Popup comentario para acciones masivas */}
                    {popupMasivo && (
                      <PopupComentarioValidacion
                        t={t} usuario={usuario} registro={registros[0] || {}}
                        contrato_id={contrato_id} API_URL={API_URL} hdrs={hdrs}
                        estadoValidando={popupMasivo.estado}
                        nivelValidacion={nv}
                        obligatorio={true}
                        onConfirmar={comentarioData => ejecutarMasivo(popupMasivo.estado, comentarioData)}
                        onCancelar={() => setPopupMasivo(null)}
                      />
                    )}
                  </div>
                )
              })()}

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
                {/* Subcontratista | Inspector | Capítulo */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
                  {modoEdicion ? (
                    <>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Subcontratista</div>
                        <select value={editSubId} onChange={e => setEditSubId(e.target.value)} style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
                          <option value="">— Sin subcontratista —</option>
                          {listaSubs.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Inspector</div>
                        <select value={editInspId} onChange={e => setEditInspId(e.target.value)} style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
                          <option value="">— Sin inspector —</option>
                          {listaInsp.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.7px', textTransform:'uppercase', marginBottom:'2px' }}>Capítulo</div>
                        <select value={editCapitulo} onChange={e => setEditCapitulo(e.target.value)} style={{ width:'100%', background:t.bg, border:`1px solid ${t.primary}55`, borderRadius:'6px', padding:'7px 10px', color:t.text, fontSize:'13px' }}>
                          <option value="">— Selecciona —</option>
                          {listaCaps.map(c => <option key={c.capitulo} value={c.capitulo}>{c.capitulo}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <CampoInfo label="Subcontratista" valor={reporte.subcontratista_nombre} />
                      <CampoInfo label="Inspector"       valor={reporte.inspector_nombre} />
                      <CampoInfo label="Capítulo"        valor={reporte.capitulo} />
                    </>
                  )}
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
              {regsSinAsignar.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:t.textMuted }}>
                  ✅ Todos los registros tienen ítem asignado
                </div>
              ) : regsSinAsignar.map(reg => (
                <HojaRegistro
                  key={reg.id} t={t} usuario={usuario} API_URL={API_URL}
                  contrato_id={contrato_id} reporte={reporte} registro={reg}
                  puedeEditar={puedeEditar}
                  seleccionado={seleccionados.includes(reg.id)}
                  onToggleSeleccion={() => toggleSeleccion(reg.id)}
                  onItemAsignado={recargar}
                  hdrs={hdrs}
                />
              ))}
            </div>
          )}

          {/* ── TABS POR ÍTEM ── */}
          {itemsAsignados.map(itemNum => tabActiva === itemNum && (
            <div key={itemNum} style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {registrosVisibles.filter(r => r.item_numero === itemNum).map(reg => {
                const expandido = registroExpandido === reg.id
                const fechaReg = (() => { try { const ts=reg.created_at; if (!ts) return ''; const n=/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?'':d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) } catch{return ''} })()
                const colorNivel = st => st === 'Aprobado' ? '#10B981' : st === 'Pendiente' ? '#F59E0B' : st === 'Rechazado' ? '#EF4444' : st === 'No Objeto de Cobro' ? '#374151' : '#3B82F6'
                const nivelesInfo = [
                  { emoji:'👷',  label:'N1', estado: reg.nivel1_estado || 'No Revisado' },
                  { emoji:'🏗️', label:'N2', estado: reg.nivel2_estado || 'No Revisado' },
                  { emoji:'🏛️', label:'N3', estado: reg.nivel3_estado || 'No Revisado' },
                  { emoji:'🔨', label:'Sub', estado: reg.sub_estado || 'No Revisado' },
                ]
                return (
                  <div key={reg.id}>
                    <div
                      onClick={() => setRegistroExpandido(expandido ? null : reg.id)}
                      style={{ display:'flex', alignItems:'center', gap:'10px', background:'#D9770626', border:`1px solid ${expandido ? '#D97706' : '#D9770644'}`, borderLeft:'3px solid #D97706', borderRadius: expandido ? '10px 10px 0 0' : '10px', padding:'10px 16px', cursor:'pointer', transition:'border 0.15s' }}
                    >
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
                        {nivelesInfo.map(({ emoji, label, estado }) => (
                          <div key={label} title={`${label}: ${estado}`}
                            style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                            <span style={{ fontSize:'13px', lineHeight:1 }}>{emoji}</span>
                            <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: colorNivel(estado), flexShrink:0 }} />
                          </div>
                        ))}
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
                                 fontSize:'15px', color:t.textMuted, flexShrink:0, lineHeight:1 }}
                        title="Ver comentarios">
                        💬
                      </button>
                      <span style={{ color:t.textMuted, fontSize:'12px', flexShrink:0 }}>{expandido ? '▲' : '▼'}</span>
                    </div>
                    {expandido && (
                      <div style={{ border:`1px solid ${t.primary+'66'}`, borderTop:'none', borderRadius:'0 0 10px 10px', overflow:'hidden' }}>
                        <HojaRegistro
                          key={reg.id} t={t} usuario={usuario} API_URL={API_URL}
                          contrato_id={contrato_id} reporte={reporte} registro={reg}
                          puedeEditar={puedeEditar}
                          seleccionado={seleccionados.includes(reg.id)}
                          onToggleSeleccion={() => toggleSeleccion(reg.id)}
                          onItemAsignado={recargar}
                          hdrs={hdrs}
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
      {modalComentarios && (
        <div style={{ position:'fixed', inset:0, zIndex:10200, background:'rgba(0,0,0,0.6)',
                      display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModalComentarios(null)}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'20px',
                        width:'560px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column',
                        boxShadow:'0 24px 80px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:'18px 24px', borderBottom:`1px solid ${t.border}`,
                          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'14px', fontWeight:'800', color:t.text }}>
                  💬 Comentarios · Registro #{modalComentarios.reg.numero_registro}
                </div>
                <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>
                  {loadingComentarios ? 'Cargando…' : `${comentariosData.length} comentario(s)`}
                </div>
              </div>
              <button onClick={() => setModalComentarios(null)}
                style={{ background:'none', border:'none', fontSize:'18px', color:t.textMuted, cursor:'pointer' }}>✕</button>
            </div>
            {/* Body */}
            <div style={{ overflowY:'auto', flex:1, padding:'16px 24px',
                          display:'flex', flexDirection:'column', gap:'14px' }}>
              {loadingComentarios && (
                <div style={{ textAlign:'center', color:t.textMuted, fontSize:'13px', padding:'24px 0' }}>
                  ⏳ Cargando comentarios…
                </div>
              )}
              {!loadingComentarios && comentariosData.length === 0 && (
                <div style={{ textAlign:'center', color:t.textMuted, fontSize:'13px', padding:'24px 0', fontStyle:'italic' }}>
                  No hay comentarios para este registro.
                </div>
              )}
              {!loadingComentarios && comentariosData.map((c, i) => {
                const fechaCom = (() => { try { const ts=c.created_at; if (!ts) return ''; const n=/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:ts+'Z'; const d=new Date(n); return isNaN(d)?'':d.toLocaleString('es-CO',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) } catch{return ''} })()
                const enlacesList = Array.isArray(c.enlaces) ? c.enlaces : []
                return (
                  <div key={c.id || i} style={{ background:t.bg, borderRadius:'12px', padding:'14px 16px',
                                                border:`1px solid ${t.border}` }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px', marginBottom:'8px' }}>
                      <div>
                        <span style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>
                          {c.autor?.nombre || c.autor_id || 'Usuario'}
                        </span>
                        {c.etiqueta && (
                          <span style={{ marginLeft:'8px', fontSize:'10px', fontWeight:'700', color:'#7c3aed',
                                         background:'#7c3aed15', border:'1px solid #7c3aed33',
                                         borderRadius:'10px', padding:'2px 8px' }}>
                            {c.etiqueta}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize:'10px', color:t.textMuted, whiteSpace:'nowrap', flexShrink:0 }}>{fechaCom}</span>
                    </div>
                    {c.asunto && (
                      <div style={{ fontSize:'12px', fontWeight:'700', color:t.text, marginBottom:'4px' }}>
                        {c.asunto}
                      </div>
                    )}
                    {c.mensaje && (
                      <div style={{ fontSize:'12px', color:t.text, lineHeight:'1.5', marginBottom: enlacesList.length ? '8px' : 0 }}>
                        {c.mensaje}
                      </div>
                    )}
                    {enlacesList.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                        {enlacesList.map((url, j) => (
                          <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:'11px', color:'#3B82F6', textDecoration:'underline',
                                     overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            🔗 {url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
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

// ─── MÓDULO SICOE OBRA ────────────────────────────────────────────────────────
function ModuloSicoeObra({ t, usuario, token, s }) {
  const API_URL = import.meta.env.VITE_API_URL || 'https://claracore-backend.azurewebsites.net'
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
  })
  const [filtrosAvanzados, setFiltrosAvanzados] = useState(false)
  const [filtroSubcList, setFiltroSubcList] = useState([])
  const [filtroCapList, setFiltroCapList] = useState([])
  const [filtroItemList, setFiltroItemList] = useState([])
  const [filtroTramoList, setFiltroTramoList] = useState([])
  const [filtroCostadoList, setFiltroCostadoList] = useState([])
  const [analisis, setAnalisis] = useState(null)
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false)
  const [panelExpandido, setPanelExpandido] = useState(false)
  const [busquedaRealizada, setBusquedaRealizada] = useState(false)
  const [sugerenciasItem, setSugerenciasItem] = useState([])
  const [mostrarSugsItem, setMostrarSugsItem] = useState(false)
  const [modalNuevoReporte, setModalNuevoReporte]   = useState(false)
  const [reporteEditando, setReporteEditando]         = useState(null)
  const [modalCarpeta, setModalCarpeta]               = useState(false)
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null)

  const ESTADOS = ['Borrador','Sin Asignar Ítem','No Revisados','Aprobados','Pendientes','Rechazados','No Objeto de Cobro','En Papelera']
  const ESTADO_COLORS = {
    'Borrador': '#6B7280',
    'Sin Asignar Ítem': '#F59E0B',
    'No Revisados': '#0077B6',
    'Aprobados': '#10B981',
    'Pendientes': '#3B82F6',
    'Rechazados': '#EF4444',
    'No Objeto de Cobro': '#8B5CF6',
    'En Papelera': '#374151',
  }

  const perm = (usuario?.permisos || []).find(p => p.funcion_nombre === 'Reporte de Cantidades')
  const puedeCrear  = perm?.crear
  const puedeEditar = perm?.editar
  const nivelInfo   = determinarNivelValidacion(usuario)
  const esSub       = nivelInfo.esSubcontratista
  // subcontratista_id del usuario para filtrar (puede venir como campo directo o en el objeto)
  const subIdUsuario = usuario?.subcontratista_id ?? usuario?.sub_id ?? null

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
    ]).then(([subc, caps, tc]) => {
      setFiltroSubcList(Array.isArray(subc) ? subc : [])
      setFiltroCapList(Array.isArray(caps) ? caps : [])
      setFiltroTramoList(Array.isArray(tc?.tramos) ? tc.tramos : [])
      setFiltroCostadoList(Array.isArray(tc?.costados) ? tc.costados : [])
    })
  }, [contrato_id])

  const buscarReportes = async (nuevosFiltros, nuevoOffset = 0) => {
    setCargando(true)
    try {
      const params = new URLSearchParams()
      const ef = { ...nuevosFiltros }
      if (esSub && subIdUsuario && !ef.subcontratista_id) ef.subcontratista_id = subIdUsuario
      Object.entries(ef).forEach(([k, v]) => { if (v !== '' && v != null) params.append(k, v) })
      params.append('offset', nuevoOffset)
      params.append('limit', 50)
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/buscar?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const data = await res.json()
      const lista = Array.isArray(data.reportes) ? data.reportes : []
      if (nuevoOffset === 0) {
        setReportes(lista)
      } else {
        setReportes(prev => [...prev, ...lista])
      }
      setHayMas(!!data.hay_mas)
      setOffsetActual(nuevoOffset + 50)
      setBusquedaRealizada(true)
      // Auto-abrir cuando búsqueda por N° Registro devuelve resultado único
      if (nuevosFiltros.numero_registro && lista.length === 1) {
        const rep = lista[0]
        const r2 = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${rep.id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
        const detalle = await r2.json()
        setReporteSeleccionado(detalle)
        setModalCarpeta(true)
      }
    } catch(e) {}
    setCargando(false)
  }

  const fmtPesos = v => '$' + Math.round(v || 0).toLocaleString('es-CO')

  const cargarAnalisis = async (nuevosFiltros) => {
    const hayFiltros = Object.values(nuevosFiltros).some(v => v !== '')
    if (!hayFiltros) { setAnalisis(null); return }
    setCargandoAnalisis(true)
    try {
      const params = new URLSearchParams()
      const ef = { ...nuevosFiltros }
      if (esSub && subIdUsuario && !ef.subcontratista_id) ef.subcontratista_id = subIdUsuario
      const camposAnalisis = ['acta_rpo','semana','subcontratista_id','capitulo','item','tramo','costado','abs_inicio','abs_final','estado']
      camposAnalisis.forEach(k => { if (ef[k] !== '' && ef[k] != null) params.append(k, ef[k]) })
      const res = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/analisis?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      })
      const data = await res.json()
      setAnalisis(data)
    } catch(e) { setAnalisis(null) }
    setCargandoAnalisis(false)
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
  const filtrosVacios = { numero_reporte:'', numero_registro:'', semana:'', acta_rpo:'', subcontratista_id:'', capitulo:'', item:'', tramo:'', costado:'', pk_id:'', abs_inicio:'', abs_final:'', estado:'' }
  const limpiarFiltros = () => {
    setFiltros(filtrosVacios)
    setFiltroItemList([])
    setSugerenciasItem([])
    setMostrarSugsItem(false)
    setAnalisis(null)
    setPanelExpandido(false)
    fetch(`${API_URL}/sicoe-obra/${contrato_id}/filtros/capitulos`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(caps => setFiltroCapList(Array.isArray(caps) ? caps : [])).catch(() => {})
    buscarReportes(filtrosVacios, 0)
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
        ) : analisis && analisis.grupos.length > 0 ? (
          <>
            <div onClick={() => setPanelExpandido(v => !v)} style={{ padding:'10px 16px', borderBottom: panelExpandido ? `1px solid ${t.border}` : 'none', display:'flex', alignItems:'center', gap:'8px', background:'#1E293B', cursor:'pointer', userSelect:'none' }}>
              <span style={{ fontSize:'13px', fontWeight:'800', color:'#F1F5F9' }}>📊 {analisis.encabezado}</span>
              <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94A3B8' }}>
                {analisis.total_registros.toLocaleString()} regs · {fmtPesos(analisis.total_costo_directo)}
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
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>✅</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>⏳</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>❌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.grupos.map(g => (
                      <tr key={g.label} style={{ borderBottom:`1px solid ${t.border}22` }}>
                        <td style={{ padding:'6px 16px', color:t.primary, fontWeight:'700', whiteSpace:'nowrap' }}>{g.label}</td>
                        <td style={{ padding:'6px 16px', color:t.text, fontSize:'11px', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.descripcion}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.text }}>{(g.cantidad_total||0).toLocaleString('es-CO',{maximumFractionDigits:2})}</td>
                        <td style={{ padding:'6px 16px', color:t.textMuted, fontSize:'11px' }}>{g.unidad}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.text }}>{fmtPesos(g.costo_directo)}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#10B981', fontWeight:'600' }}>{g.aprobados || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#3B82F6', fontWeight:'600' }}>{g.pendientes || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#EF4444', fontWeight:'600' }}>{g.rechazados || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td colSpan={4} style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{analisis.total_aprobados || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{analisis.total_pendientes || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{analisis.total_rechazados || '—'}</td>
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
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>
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
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.text }}>{(g.cantidad_total||0).toLocaleString('es-CO',{maximumFractionDigits:2})}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.text }}>{fmtPesos(g.costo_directo)}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.textMuted }}>{g.total_registros}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#10B981', fontWeight:'600' }}>{g.aprobados || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#3B82F6', fontWeight:'600' }}>{g.pendientes || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#EF4444', fontWeight:'600' }}>{g.rechazados || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td colSpan={3} style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.text }}>{analisis.total_registros}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{analisis.total_aprobados || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{analisis.total_pendientes || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{analisis.total_rechazados || '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                // ── Tabla por capítulos (acta_semana + general) ────────────
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ color:t.textMuted, fontSize:'11px', fontWeight:'700', letterSpacing:'0.4px' }}>
                      <th style={{ padding:'6px 16px', textAlign:'left',  borderBottom:`1px solid ${t.border}` }}>CAPÍTULO</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>COSTO DIRECTO</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>REGS.</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>✅ APOB.</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>⏳ PEND.</th>
                      <th style={{ padding:'6px 16px', textAlign:'right', borderBottom:`1px solid ${t.border}` }}>❌ RECH.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.grupos.map(g => (
                      <tr key={g.label} style={{ borderBottom:`1px solid ${t.border}22` }}>
                        <td style={{ padding:'6px 16px', color:t.text, fontWeight:'600' }}>{g.label}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.text }}>{fmtPesos(g.costo_directo)}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:t.textMuted }}>{g.total_registros}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#10B981', fontWeight:'600' }}>{g.aprobados || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#3B82F6', fontWeight:'600' }}>{g.pendientes || '—'}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', color:'#EF4444', fontWeight:'600' }}>{g.rechazados || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight:'800', borderTop:`2px solid ${t.border}`, background:t.bg }}>
                      <td style={{ padding:'7px 16px', color:t.text }}>TOTAL</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.primary, fontSize:'13px' }}>{fmtPesos(analisis.total_costo_directo)}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:t.text }}>{analisis.total_registros}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#10B981' }}>{analisis.total_aprobados || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#3B82F6' }}>{analisis.total_pendientes || '—'}</td>
                      <td style={{ padding:'7px 16px', textAlign:'right', color:'#EF4444' }}>{analisis.total_rechazados || '—'}</td>
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

      {/* ── Barra de filtros ── */}
      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'12px 16px', marginBottom:'16px', position:'sticky', top:0, zIndex:10 }}>
        {/* Fila 1 — Búsqueda principal */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center' }}>
          <input placeholder="N° Reporte" type="number" value={filtros.numero_reporte} onChange={e => setF('numero_reporte', e.target.value)}
            style={{ ...inpStyle, width:'100px' }} />
          <input placeholder="N° Registro" type="number" value={filtros.numero_registro} onChange={e => setF('numero_registro', e.target.value)}
            style={{ ...inpStyle, width:'100px' }} />
          <input placeholder="Semana" type="number" value={filtros.semana}
            onChange={e => setF('semana', e.target.value)}
            onBlur={e => actualizarFiltrosDisponibles({ ...filtros, semana: e.target.value })}
            style={{ ...inpStyle, width:'80px' }} />
          <input placeholder="Acta RPO" type="number" value={filtros.acta_rpo}
            onChange={e => setF('acta_rpo', e.target.value)}
            onBlur={e => actualizarFiltrosDisponibles({ ...filtros, acta_rpo: e.target.value })}
            style={{ ...inpStyle, width:'90px' }} />
          <select value={filtros.subcontratista_id} onChange={e => {
            const v = e.target.value
            setF('subcontratista_id', v)
            actualizarFiltrosDisponibles({ ...filtros, subcontratista_id: v })
          }} style={selStyle}>
            <option value="">Subcontratista…</option>
            {filtroSubcList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select value={filtros.estado} onChange={e => setF('estado', e.target.value)} style={selStyle}>
            <option value="">Estado…</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px', alignItems:'center' }}>
            <button onClick={() => setFiltrosAvanzados(v => !v)}
              style={{ ...selStyle, background:'transparent', cursor:'pointer', whiteSpace:'nowrap', color:t.textMuted }}>
              Filtros avanzados {filtrosAvanzados ? '▲' : '▼'}
            </button>
            <button onClick={limpiarFiltros}
              style={{ background:'#EF4444', color:'#fff', border:'none', borderRadius:'7px', padding:'5px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
              Limpiar
            </button>
            <button onClick={() => { buscarReportes(filtros, 0); cargarAnalisis(filtros) }}
              style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'7px', padding:'5px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
              Buscar
            </button>
          </div>
        </div>
        {/* Fila 2 — Filtros avanzados (colapsable) */}
        {filtrosAvanzados && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', marginTop:'8px', paddingTop:'8px', borderTop:`1px solid ${t.border}` }}>
            <select value={filtros.capitulo} onChange={e => {
              const v = e.target.value
              setF('capitulo', v)
              actualizarFiltrosDisponibles({ ...filtros, capitulo: v })
            }} style={selStyle}>
              <option value="">Capítulo…</option>
              {filtroCapList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ position:'relative' }}>
              <input
                placeholder="Ítem…"
                value={filtros.item}
                onChange={e => { setF('item', e.target.value); buscarItems(e.target.value) }}
                onFocus={() => { if (sugerenciasItem.length > 0) setMostrarSugsItem(true) }}
                onBlur={() => setTimeout(() => setMostrarSugsItem(false), 150)}
                style={{ ...inpStyle, width:'200px' }}
              />
              {mostrarSugsItem && sugerenciasItem.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, zIndex:50, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', minWidth:'320px', maxHeight:'240px', overflowY:'auto', boxShadow:'0 4px 16px #0004', marginTop:'2px' }}>
                  {sugerenciasItem.map(s => (
                    <div key={s.item_numero}
                      onMouseDown={() => { setF('item', s.item_numero); setSugerenciasItem([]); setMostrarSugsItem(false) }}
                      style={{ padding:'7px 12px', cursor:'pointer', fontSize:'12px', borderBottom:`1px solid ${t.border}22`, display:'flex', gap:'8px', alignItems:'baseline' }}>
                      <span style={{ color:t.primary, fontWeight:'700', whiteSpace:'nowrap' }}>{s.item_numero}</span>
                      <span style={{ color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.item_descripcion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select value={filtros.tramo} onChange={e => setF('tramo', e.target.value)} style={selStyle}>
              <option value="">Tramo…</option>
              {filtroTramoList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filtros.costado} onChange={e => setF('costado', e.target.value)} style={selStyle}>
              <option value="">Costado…</option>
              {filtroCostadoList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <input placeholder="Abs. Inicio" type="number" value={filtros.abs_inicio} onChange={e => setF('abs_inicio', e.target.value)}
              style={{ ...inpStyle, width:'100px' }} />
            <input placeholder="Abs. Final" type="number" value={filtros.abs_final} onChange={e => setF('abs_final', e.target.value)}
              style={{ ...inpStyle, width:'100px' }} />
            <input placeholder="PK ID" value={filtros.pk_id} onChange={e => setF('pk_id', e.target.value)}
              style={{ ...inpStyle, width:'80px' }} />
          </div>
        )}
      </div>

      {/* ── Grid reportes ── */}
      <div style={{ background:t.bgCard, borderRadius:'12px', border:`1px solid ${t.border}` }}>
        {/* Header grid — sticky */}
        <div style={{ display:'grid', gridTemplateColumns:'80px 80px 100px 1fr 160px 120px 120px', gap:'8px',
          padding:'10px 16px', borderBottom:`1px solid ${t.border}`,
          fontSize:'11px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px',
          position:'sticky', top:0, zIndex:9, background:t.bgCard, borderRadius:'12px 12px 0 0' }}>
          <div>N° REP.</div><div>SEMANA</div><div>ACTA RPO</div>
          <div>DESCRIPCIÓN</div><div>SUBCONTRATISTA</div><div>CAPÍTULO</div><div>ESTADO</div>
        </div>

        {/* Filas */}
        {cargando && reportes.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:t.textMuted }}>Cargando reportes...</div>
        ) : !busquedaRealizada ? (
          <div style={{ padding:'48px', textAlign:'center', color:t.textMuted, fontSize:'14px' }}>
            🔍 Usa los filtros y presiona <strong>Buscar</strong> para ver los reportes
          </div>
        ) : reportes.length === 0 ? (
          <div style={{ padding:'40px', textAlign:'center', color:t.textMuted }}>
            Sin resultados para los filtros aplicados.
          </div>
        ) : reportes.map(rep => (
          <div key={rep.id} style={{ display:'grid', gridTemplateColumns:'80px 80px 100px 1fr 160px 120px 120px',
            gap:'8px', padding:'10px 16px', borderBottom:`1px solid ${t.border}`,
            fontSize:'13px', color:t.text, cursor:'pointer',
            transition:'background 0.15s' }}
            onClick={async () => {
              if (!esSub && rep.estado === 'Borrador') {
                const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${rep.id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
                const data = await r.json()
                setReporteEditando(data)
                setModalNuevoReporte(true)
              } else if (esSub || puedeEditar) {
                const r = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes/${rep.id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
                const data = await r.json()
                setReporteSeleccionado(data)
                setModalCarpeta(true)
              }
            }}
            onMouseEnter={e => e.currentTarget.style.background = t.bg}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ fontWeight:'700', color:t.primary }}>#{rep.numero_reporte}</div>
            <div style={{ color:t.textMuted, fontSize:'12px' }}>
              {rep.semana_numero != null ? `Sem. ${rep.semana_numero}` : '—'}
            </div>
            <div style={{ color:t.textMuted, fontSize:'12px' }}>
              {rep.acta_rpo != null ? `RPO ${rep.acta_rpo}` : '—'}
            </div>
            <div style={{ fontWeight:'600' }}>{rep.descripcion_actividad}</div>
            <div style={{ fontSize:'12px' }}>{rep.subcontratista_nombre || '—'}</div>
            <div style={{ fontSize:'11px', color:t.textMuted }}>{rep.capitulo || '—'}</div>
            <div>
              <span style={{
                background: (ESTADO_COLORS[rep.estado] || '#6B7280') + '22',
                color: ESTADO_COLORS[rep.estado] || '#6B7280',
                border: `1px solid ${ESTADO_COLORS[rep.estado] || '#6B7280'}44`,
                borderRadius:'12px', padding:'2px 10px', fontSize:'11px', fontWeight:'600'
              }}>{rep.estado}</span>
            </div>
          </div>
        ))}

        {/* Footer: cargar más / spinner / fin */}
        {reportes.length > 0 && (
          <div style={{ padding:'12px 16px', textAlign:'center', borderTop:`1px solid ${t.border}` }}>
            {cargando ? (
              <span style={{ fontSize:'12px', color:t.textMuted }}>Cargando...</span>
            ) : hayMas ? (
              <button onClick={() => buscarReportes(filtros, offsetActual)}
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
                <input type="number" min="1" max="52" value={semCantInicial} onChange={e => setSemCantInicial(parseInt(e.target.value))}
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
          reporte={reporteSeleccionado}
          onClose={() => { setModalCarpeta(false); setReporteSeleccionado(null) }}
          onActualizar={() => { setModalCarpeta(false); setReporteSeleccionado(null); buscarReportes(filtros, 0) }}
        />
      )}

      {/* ── Modal Nuevo Reporte ── */}
      {modalNuevoReporte && (
        <ModalNuevoReporte
          t={t} usuario={usuario} token={getToken()}
          API_URL={API_URL} contrato_id={contrato_id}
          reporteInicial={reporteEditando}
          onClose={() => { setModalNuevoReporte(false); setReporteEditando(null) }}
          onGuardado={() => { setModalNuevoReporte(false); setReporteEditando(null); buscarReportes(filtros, 0) }}
        />
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
  const mapaPkRef = useRef(null)
  const mapaPkInstance = useRef(null)

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

  const [numeroReporte, setNumeroReporte] = useState(null)
  const [borradorId, setBorradorId] = useState(reporteInicial?.id || null)

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
    if (!pkSeleccionado) e.pk = 'Requerido'
    if (!margen) e.margen = 'Requerido'
    if (absInicio === '') e.absInicio = 'Requerido'
    if (absFinal === '') e.absFinal = 'Requerido'
    if (!nodoIni.trim()) e.nodoIni = 'Requerido'
    if (!nodoFin.trim()) e.nodoFin = 'Requerido'
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
      if (!idParaGuardar) {
        const bRes = await fetch(`${API_URL}/sicoe-obra/${contrato_id}/reportes`, {
          method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descripcion_actividad: descripcion || 'Borrador',
            capitulo: capituloSel || 'Sin asignar',
            estado: 'Borrador'
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
                    LOCALIZACIÓN (PK_ID) *
                  </label>
                  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    <div style={{ ...inpStyle(errores.pk), flex:1, display:'flex', alignItems:'center', minHeight:'38px', cursor:'default' }}>
                      {pkSeleccionado
                        ? <span style={{ fontWeight:'800', color:t.primary, fontSize:'14px' }}>{pkSeleccionado.pk_id}</span>
                        : <span style={{ color:t.textMuted, fontStyle:'italic', fontSize:'12px' }}>Selecciona el punto tocando el mapa →</span>
                      }
                    </div>
                    <button onClick={() => setModalMapaPk(true)} type="button" title="Seleccionar PK_ID en el mapa" style={{
                      background: t.primary, color:'#fff', border:'none', borderRadius:'8px',
                      padding:'0 14px', cursor:'pointer', fontSize:'16px', flexShrink:0, height:'38px'
                    }}>🗺️</button>
                  </div>
                  {pkSeleccionado && (
                    <div style={{ marginTop:'6px', padding:'8px 12px', background:t.bg,
                      borderRadius:'6px', fontSize:'11px', color:t.textMuted }}>
                      📍 CIV: {pkSeleccionado.civ} · {pkSeleccionado.tramo} · {pkSeleccionado.infraestructura} · {pkSeleccionado.calzada}
                    </div>
                  )}
                  {errores.pk && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.pk}</span>}
                </div>

                {/* Margen */}
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    MARGEN *
                  </label>
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
                </div>
              </div>

              {/* Abscisado + Nodos en una sola fila */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px' }}>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    ABS. INICIAL *
                  </label>
                  <input type='number' step='0.01' value={absInicio}
                    onChange={e => setAbsInicio(e.target.value)}
                    placeholder='0.00' style={inpStyle(errores.absInicio)} />
                  {errores.absInicio && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.absInicio}</span>}
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    ABS. FINAL *
                  </label>
                  <input type='number' step='0.01' value={absFinal}
                    onChange={e => setAbsFinal(e.target.value)}
                    placeholder='0.00' style={inpStyle(errores.absFinal)} />
                  {errores.absFinal && <span style={{ color:'#EF4444', fontSize:'11px' }}>{errores.absFinal}</span>}
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    NODO INICIAL *
                  </label>
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
                </div>
                <div>
                  <label style={{ fontSize:'12px', fontWeight:'600', color:t.textMuted, display:'block', marginBottom:'4px' }}>
                    NODO FINAL *
                  </label>
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

      {/* ── Modal Mapa PK_ID ── */}
      {modalMapaPk && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:t.bgCard, borderRadius:'16px', width:'100%', maxWidth:'700px',
            height:'500px', display:'flex', flexDirection:'column', overflow:'visible' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.border}`,
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:'700', color:t.text }}>🗺️ Seleccionar PK_ID en el mapa</div>
              <div style={{ fontSize:'12px', color:t.textMuted }}>Haz click en un polígono para seleccionarlo</div>
              <button onClick={() => {
                setModalMapaPk(false)
                if (mapaPkInstance.current) { mapaPkInstance.current.remove(); mapaPkInstance.current = null }
              }} style={{ background:'transparent', border:'none', fontSize:'20px', cursor:'pointer', color:t.textMuted }}>✕</button>
            </div>
            <div style={{ flex:1, position:'relative' }}>
              <div ref={el => {
                if (!el || mapaPkInstance.current) return
                mapaPkRef.current = el
                const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
                const map = new mapboxgl.Map({
                  container: el,
                  style: 'mapbox://styles/mapbox/dark-v11',
                  center: [-74.031242, 4.760271],
                  zoom: 15,
                  accessToken: MAPBOX_TOKEN
                })
                mapaPkInstance.current = map
                map.on('load', () => {
                  fetch('/pOLIGONOS_1551t_Project_Feat.json')
                    .then(r => r.json())
                    .then(geojson => {
                      map.addSource('pkids', { type:'geojson', data: geojson })
                      map.addLayer({ id:'pkids-fill', type:'fill', source:'pkids',
                        paint: { 'fill-color':'#0077B6', 'fill-opacity':0.3 } })
                      map.addLayer({ id:'pkids-outline', type:'line', source:'pkids',
                        paint: { 'line-color':'#00A896', 'line-width':1.5 } })
                      map.addLayer({ id:'pkids-hover', type:'fill', source:'pkids',
                        paint: { 'fill-color':'#F59E0B', 'fill-opacity':0.6 },
                        filter: ['==', 'Layer', ''] })
                      map.on('click', 'pkids-fill', (e) => {
                        const feat = e.features[0]; if (!feat) return
                        const pkIdVal = String(feat.properties.Layer || feat.properties.PK_ID || feat.properties.pk_id || '').trim()
                        const found = pkIds.find(p => String(p.pk_id).trim() === pkIdVal)
                        if (found) {
                          selPkId(found)
                          setCoordLat(e.lngLat.lat)
                          setCoordLng(e.lngLat.lng)
                        } else {
                          setPkBusqueda(pkIdVal)
                          setPkSeleccionado(null)
                        }
                        setModalMapaPk(false)
                        if (mapaPkInstance.current) { mapaPkInstance.current.remove(); mapaPkInstance.current = null }
                      })
                      map.on('mouseenter', 'pkids-fill', (e) => {
                        map.getCanvas().style.cursor = 'pointer'
                        map.setFilter('pkids-hover', ['==', 'Layer', String(e.features[0]?.properties?.Layer || '')])
                      })
                      map.on('mouseleave', 'pkids-fill', () => {
                        map.getCanvas().style.cursor = ''
                        map.setFilter('pkids-hover', ['==', 'Layer', ''])
                      })
                    })
                })
              }} style={{ width:'100%', height:'100%' }} />
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
  const API = 'https://claracore-backend.azurewebsites.net'
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
      zoom: 12
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
              { padding: 40 }
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
// ─── MINI MAPA PRESUPUESTO ────────────────────────────────────────────────────
function MiniMapaPresupuesto({ t, colores, pkidsActivos, pkidsResaltados = [], onPkidClick }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const [listo, setListo] = useState(false)

  const getColor = (pkid, activo, pct) => {
    if (!activo) return '#334155'
    if (pkidsResaltados.length > 0) {
      return pkidsResaltados.includes(pkid) ? '#FF6B00' : '#0077B633'
    }
    return pct > 75 ? '#0077B6' : pct > 50 ? '#00B4C6' : pct > 25 ? '#00A896' : '#028090'
  }

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-74.05, 4.72], zoom: 11, interactive: true, bearing: 90
    })
    mapInst.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.on('load', () => {
      fetch('/pOLIGONOS_1551t_Project_Feat.json').then(r => r.json()).then(geojson => {
        const features = geojson.features
          .filter(f => f.properties.Layer !== 'dibujo externo')
          .map(f => {
            const pkid = String(f.properties.Layer).trim()
            const activo = pkidsActivos.includes(pkid)
            const d = colores[pkid] || {}
            const pct = d.pct || 0
            return { ...f, properties: { ...f.properties, pk_id: pkid, activo: activo ? 1 : 0, color: getColor(pkid, activo, pct) } }
          })
        const data = { ...geojson, features }
        map.addSource('ppto-pols', { type: 'geojson', data })
        map.addLayer({ id: 'ppto-fill', type: 'fill', source: 'ppto-pols',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'activo'], 1], 0.85, 0.1] }
        })
        map.addLayer({ id: 'ppto-labels', type: 'symbol', source: 'ppto-pols',
          layout: {
            'text-field': ['get', 'pk_id'],
            'text-size': 9,
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1 }
        })
        map.on('mouseenter', 'ppto-fill', (e) => {
          if (e.features[0].properties.activo) map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'ppto-fill', () => { map.getCanvas().style.cursor = '' })
        map.on('click', 'ppto-fill', (e) => {
          const props = e.features[0].properties
          if (props.activo) onPkidClick(props.pk_id, e.originalEvent.ctrlKey || e.originalEvent.metaKey)
        })
        const coords = features.filter(f => f.properties.activo).flatMap(f => {
          const g = f.geometry
          if (g.type === 'Polygon') return g.coordinates[0]
          if (g.type === 'MultiPolygon') return g.coordinates.flat(2)
          return []
        })
        if (coords.length > 0) {
          const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)],[Math.max(...lngs), Math.max(...lats)]], { padding: 20, duration: 0 })
        }
        setListo(true)
      })
    })
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; setListo(false) } }
  }, [])

  // Actualizar colores sin hacer zoom
  useEffect(() => {
    const map = mapInst.current
    if (!map || !listo || !map.getSource('ppto-pols')) return
    const src = map.getSource('ppto-pols')
    const raw = src._data
    if (!raw?.features) return
    src.setData({
      ...raw,
      features: raw.features.map(f => {
        const pkid = f.properties.pk_id || String(f.properties.Layer).trim()
        const activo = pkidsActivos.includes(pkid)
        const d = colores[pkid] || {}
        const pct = d.pct || 0
        return { ...f, properties: { ...f.properties, pk_id: pkid, activo: activo ? 1 : 0, color: getColor(pkid, activo, pct) } }
      })
    })
  }, [colores, pkidsActivos, pkidsResaltados, listo])

  return (
    <div style={{ position:'relative', width:'100%', height:'320px', borderRadius:'8px', overflow:'hidden', border:`1px solid ${t.border}` }}>
      <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
      {!listo && (
        <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:t.textMuted }}>
          ⏳ Cargando mapa...
        </div>
      )}
      <div style={{ position:'absolute', bottom:'8px', left:'8px', background:t.bgCard+'DD', borderRadius:'6px', padding:'5px 8px', fontSize:'9px', color:t.textMuted }}>
        🔵 Activo · 🟠 Seleccionado · Ctrl+click para multi-selección
      </div>
    </div>
  )
}
// ─── MINI MAPA SEMÁFORO (dashboard) ──────────────────────────────────────────
function MiniMapaSemaforo({ t, colores, height = 220, onPkidClick = null }) {
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
      center: [-74.05, 4.72], zoom: 11, interactive: true, bearing: 90,
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
            map.fitBounds([[Math.min(...lngs), Math.min(...lats)],[Math.max(...lngs), Math.max(...lats)]], { padding: 20, duration: 0 })
          }
          setListo(true)
        })
    })
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; setListo(false) } }
  }, [])

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
  const API = 'https://claracore-backend.azurewebsites.net'
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

  const esDev = usuario?.cargo_nombre === 'Desarrollador'
  const h = { Authorization: `Bearer ${token}` }

  const cargarCount = async () => {
    const r = await fetch(`${API}/notificaciones/no-leidas-count`, { headers: h }).catch(() => null)
    if (r?.ok) { const d = await r.json(); setNoLeidas(d.count || 0) }
  }

  const cargarRecibidos = async () => {
    const r = await fetch(`${API}/notificaciones/recibidas`, { headers: h }).catch(() => null)
    if (r?.ok) setRecibidos(await r.json())
  }

  const cargarEnviados = async () => {
    const r = await fetch(`${API}/notificaciones/enviadas`, { headers: h }).catch(() => null)
    if (r?.ok) setEnviados(await r.json())
  }

  const cargarDestinatarios = async () => {
    const r = await fetch(`${API}/notificaciones/usuarios-destinatarios`, { headers: h }).catch(() => null)
    if (r?.ok) setDestinatarios(await r.json())
  }

  useEffect(() => {
    cargarCount()
    const iv = setInterval(cargarCount, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!abierto) return
    cargarRecibidos(); cargarEnviados(); cargarDestinatarios()
  }, [abierto])

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
    const body = { ...nuevo, destinatario_id: nuevo.tipo === 'BROADCAST' ? null : parseInt(nuevo.destinatario_id) || null }
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ t, activeTheme, themeMode, onTheme, usuario, setUsuario, onLogout, topOffset = 0, fontSize = 'normal', onFontSize }) {
  const [moduloActivo, setModuloActivo] = useState('dashboard')
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
  const [dashCapPag, setDashCapPag] = useState(0)
  const [panelFoco, setPanelFoco] = useState(null)
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
  const API_URL = 'https://claracore-backend.azurewebsites.net'
  const contratoIdDash = usuario?.contrato_id

  useEffect(() => {
    if (!contratoIdDash) return
    const tok = getToken()
    fetch(`${API_URL}/presupuesto/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiPpto(d) })
    fetch(`${API_URL}/cobro/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => { console.log('cobro resumen status:', r.status); return r.ok ? r.json() : null })
      .then(d => { console.log('cobro resumen data:', d); if(d) setKpiCobro(d) })
  }, [contratoIdDash])

// ── Auto-refresh dashboard cada 30 segundos ───────────────────────────────
  const dashDrillRef = useRef([])
  useEffect(() => { dashDrillRef.current = dashDrill }, [dashDrill])

  useEffect(() => {
    if (!contratoIdDash) return
    const recargar = () => {
      const tok = getToken()
      fetch(`${API_URL}/presupuesto/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiPpto(d) }).catch(() => {})
      fetch(`${API_URL}/cobro/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiCobro(d) }).catch(() => {})
      if (dashDrillRef.current.length > 0 && !popupCapitulo) refrescarDashDrillSilencioso(dashDrillRef.current)
      fetch(`${API_URL}/cad-queue/${contratoIdDash}/estado`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null).then(d => { if(d) setDwgEnlazadoDash(d.enlazado) }).catch(() => {})
      const params2 = new URLSearchParams()
      if (dashDrillRef.current[0]) params2.set('capitulo', dashDrillRef.current[0].valor)
      if (dashDrillRef.current[1]) params2.set('item', dashDrillRef.current[1].valor)
      fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-colores-drill?${params2}`, {
        headers: { Authorization: `Bearer ${tok}` }
      }).then(r => r.ok ? r.json() : {}).then(setMiniMapaColores).catch(() => {})
    }
    recargar()
    const iv = setInterval(recargar, 30000)
    return () => clearInterval(iv)
  }, [contratoIdDash])

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
        fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) { dashTablaCache.current[cacheKey] = { data, ts: Date.now() }; setDashTabla(data) } })
          .catch(() => {})
        return
      }
      setDashTablaLoad(true); setDashTabla(null)
      const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
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
      fetch(`${API_URL}/cobro/${contratoIdDash}/drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
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
    const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
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
      fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) { dashTablaCache.current[cacheKey] = { data, ts: Date.now() } } })
        .catch(() => {})
    } else if (drill.length === 1) {
      const cacheKey = drill[0]?.valor || '__todos__'
      fetch(`${API_URL}/cobro/${contratoIdDash}/drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
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
    const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-detalle?${params}`, {
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

  function handleNavegar(notif) {
    if (!notif?.modulo) return
    const modMap = { PRESUPUESTO:'presupuesto', COBRO:'cobro', AUTH:'dashboard' }
    setModuloActivo(modMap[notif.modulo] || 'dashboard')
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
    fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-colores-drill?${params}`, {
      headers: { Authorization: `Bearer ${tok}` }
    }).then(r => r.ok ? r.json() : {}).then(setMiniMapaColores).catch(() => {})
  }, [contratoIdDash, dashDrill])

  async function cargarAnalisis(nivel) {
    if (!contratoIdDash) return
    setAnalisisLoading(true); setAnalisisData(null); setAnalisisPag(0)
    const tok = getToken()
    try {
      const url = nivel === 'capitulo'
        ? `${API_URL}/cobro/${contratoIdDash}/drill`
        : `${API_URL}/cobro/${contratoIdDash}/analisis-items`
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
    fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-colores-drill?${params}`, {
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
    const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-detalle?${params}`, {
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
    fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-colores-liquidacion?${params}`, {
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
    const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-detalle?${params}`, {
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
  const esDeveloper = usuario?.cargo_nombre === 'Desarrollador'
  // Funciones que habilitan ver el panel admin
  const ADMIN_FUNCIONES = ["contratos", "listado de precios"]
  const tienePermisoAdmin = (usuario?.permisos || []).some(p =>
    p.ver && ADMIN_FUNCIONES.includes(p.funcion_nombre?.toLowerCase())
  )
  const canAdmin = esDeveloper || usuario?.cargo_nombre === 'Administrador' || tienePermisoAdmin
  const tienePermisoSicoeObra = esDeveloper || (usuario?.permisos || []).some(p => p.funcion_nombre === 'Reporte de Cantidades' && p.ver)

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
          <img src="/CLARA.CORE.png" alt="ClaraCore" style={{ height: '40px', filter: activeTheme === 'dark' ? 'brightness(0) invert(1)' : 'none' }} />
          {usuario?.logo_contratista && (usuario?.rol_nombre === 'Contratista' || !['Interventoría'].includes(usuario?.rol_nombre)) && (
            <img src={usuario.logo_contratista} alt="Contratista" style={{ height: '52px', borderRadius: '6px', background: '#fff', padding: '3px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
          )}
          {usuario?.logo_interventoria && (usuario?.rol_nombre === 'Interventoría' || !['Contratista'].includes(usuario?.rol_nombre)) && (
            <img src={usuario.logo_interventoria} alt="Interventoría" style={{ height: '52px', borderRadius: '6px', background: '#fff', padding: '3px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={s.themeSelector}>
            {['light', 'auto', 'dark'].map((mode, i) => (
              <button key={mode} style={s.themeBtn(mode)} onClick={() => onTheme(mode)}>
                {['☀️ Claro', '⚡ Auto', '🌙 Oscuro'][i]}
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
            <span style={{ fontSize: '13px', color: t.textMuted }}>
              👤 {usuario?.nombre}
              {usuario?.cargo_nombre && <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.7 }}>· {usuario.cargo_nombre}</span>}
            </span>
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
            ['dashboard',    '🏠', 'Dashboard',      true],
            ['presupuesto',  '📋', 'Presupuesto',    true],
            ['cobro',        '💰', 'SICOE',          true],
            ['sicoe_obra',   '🏗️', 'SICOE Obra',    tienePermisoSicoeObra],
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



{/* ── MÓDULO DASHBOARD ── */}
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
                <button key={key} onClick={() => setDashTab(key)} style={{ background:dashTab===key?t.primary:'transparent', color:dashTab===key?'#fff':t.textMuted, border:'none', borderRadius:'8px', padding:'8px 22px', fontSize:'13px', fontWeight:'700', cursor:'pointer', transition:'all 0.15s', letterSpacing:'0.2px' }}>{label}</button>
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
                    <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'1.5px', marginBottom:'4px' }}>{k.icon} {k.label}</div>
                    <div style={{ fontSize:'18px', fontWeight:'800', color:k.color, lineHeight:1, marginBottom:'3px' }}>{k.value}</div>
                    <div style={{ fontSize:'10px', color:t.textMuted }}>{k.sub}</div>
                  </div>
                ))
              })()}
            </div>

            {/* ── Barra de consumo global ── */}
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'14px 20px', marginBottom:'20px', boxShadow:t.shadow }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'12px', fontWeight:'700', color:t.text }}>Avance financiero del contrato</span>
                <span style={{ fontSize:'12px', fontWeight:'700', color:alerta }}>{pct}% ejecutado</span>
              </div>
              <div style={{ height:'10px', background:t.border, borderRadius:'5px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, #0077B6, ${alerta})`, borderRadius:'5px', transition:'width 0.8s ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px', fontSize:'11px', color:t.textMuted }}>
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
                    <div style={{ fontSize:'13px', fontWeight:'700', color:t.text }}>💰 Cobro por Acta</div>
                    <button onClick={() => setPanelFoco(p => p === 'cobro-acta' ? null : 'cobro-acta')}
                      style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'14px', padding:'0' }}
                      title="Expandir panel">
                      {panelFoco === 'cobro-acta' ? '⊠' : '⤢'}
                    </button>
                  </div>
                    <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>Acumulado por número de acta</div>
                  </div>
                  <div style={{ fontSize:'16px', fontWeight:'800', color:t.primary }}>{fmtD(cobro)}</div>
                </div>
                {porActa.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin datos de cobro</div>
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
                      <div style={{ fontSize:'13px', fontWeight:'700', color:t.text }}>📋 Presupuesto por Capítulo</div>
                      <button onClick={() => setPanelFoco(p => p === 'ppto-capitulo' ? null : 'ppto-capitulo')}
                        style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'14px', padding:'0' }}
                        title="Expandir panel">
                        {panelFoco === 'ppto-capitulo' ? '⊠' : '⤢'}
                      </button>
                    </div>
                    <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>Top 15 capítulos por valor</div>
                  </div>
                  <div style={{ fontSize:'16px', fontWeight:'800', color:'#0077B6' }}>{fmtD(ppto)}</div>
                </div>
                {porCapPpto.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin datos de presupuesto</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px', maxHeight:'200px', overflowY:'auto' }}>
                    {porCapPpto.map((cap, i) => {
                      const pct = Math.round(cap.costo / maxCapCosto * 100)
                      const color = ['#0077B6','#00B4C6','#00A896','#028090','#05668D','#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B','#44BBA4','#E94F37','#393E41','#F5A623','#7B2D8B'][i % 15]
                      return (
                        <div key={cap.capitulo} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ fontSize:'10px', color:t.textMuted, width:'140px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={cap.capitulo}>
                            {cap.capitulo}
                          </div>
                          <div style={{ flex:1, height:'14px', background:t.border, borderRadius:'7px', overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:'7px', transition:'width 0.6s ease' }}/>
                          </div>
                          <div style={{ fontSize:'10px', fontWeight:'700', color, width:'52px', textAlign:'right', flexShrink:0 }}>{fmtM(cap.costo)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 🟢 Panel Presupuesto vs Cobro — barras verticales por capítulo */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'20px', boxShadow:t.shadow, gridColumn:'1 / -1' }}>
                <div style={{ marginBottom:'14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ fontSize:'13px', fontWeight:'700', color:t.text }}>📊 Presupuesto vs Cobro</div>
                    <button onClick={() => setPanelFoco(p => p === 'ppto-cobro' ? null : 'ppto-cobro')}
                      style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'14px', padding:'0' }}
                      title="Expandir panel">
                      {panelFoco === 'ppto-cobro' ? '⊠' : '⤢'}
                    </button>
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>Por capítulo — hover para ver detalle</div>
                </div>
                {(() => {
                  const comp = kpiCobro?.comparativo_capitulos || []
                  if (comp.length === 0) return (
                    <div style={{ textAlign:'center', padding:'40px', color:t.textMuted, fontSize:'13px' }}>Sin datos</div>
                  )
                  const maxVal = Math.max(...comp.map(c => Math.max(c.presupuesto||0, c.cobrado||0)), 1)
                  const CAP_PAG = 10
                  const compSlice = comp.slice(dashCapPag * CAP_PAG, (dashCapPag + 1) * CAP_PAG)
                  const BAR_W = 28, GAP = 10, PAD_L = 8, PAD_R = 8, H = 260, PAD_T = 14, PAD_B = 32
                  const totalW = PAD_L + compSlice.length * (BAR_W*2 + GAP + 12) + PAD_R
                  const scaleH = (v) => PAD_T + (1 - v/maxVal) * (H - PAD_T - PAD_B)

                  return (
                    <div style={{ overflowX:'auto', overflowY:'visible', width:'100%' }}>
                      <svg width={Math.max(totalW, 400)} height={H} viewBox={`0 0 ${Math.max(totalW, 400)} ${H}`} style={{ overflow:'visible', display:'block', minWidth:'100%' }}>
                        {/* Líneas de referencia */}
                        {[0,25,50,75,100].map(pct => {
                          const y = PAD_T + (1-pct/100)*(H-PAD_T-PAD_B)
                          return <line key={pct} x1={PAD_L} x2={totalW-PAD_R} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                        })}
                        {compSlice.map((cap, i) => {
                          const x = PAD_L + i * (BAR_W*2 + GAP + 8)
                          const yP = scaleH(cap.presupuesto||0)
                          const yC = scaleH(cap.cobrado||0)
                          const hP = H - PAD_B - yP
                          const hC = H - PAD_B - yC
                          const sobrecosto = (cap.cobrado||0) > (cap.presupuesto||0)
                          const colorC = sobrecosto ? '#DC2626' : '#00A896'
                          const isSelected = dashDrill[0]?.valor === cap.capitulo
                          const nomCorto = (cap.capitulo||'').length > 10 ? (cap.capitulo||'').slice(0,10)+'…' : (cap.capitulo||'')
                          return (
                            <g key={i}>
                              {/* Barra Presupuesto */}
                              <rect x={x} y={yP} width={BAR_W} height={Math.max(hP,2)} fill="#0077B6" rx="2" opacity={isSelected?1:0.85} style={{cursor:'pointer'}} onClick={() => { setDashDrill([{campo:'capitulo', valor:cap.capitulo}]); setPopupCapitulo(true) }}/>
                              {/* Barra Cobro */}
                              <rect x={x+BAR_W+2} y={yC} width={BAR_W} height={Math.max(hC,2)} fill={colorC} rx="2" opacity={isSelected?1:0.85} style={{cursor:'pointer'}} onClick={() => { setDashDrill([{campo:'capitulo', valor:cap.capitulo}]); setPopupCapitulo(true) }}/>
                              {/* Etiqueta eje X */}
                              <text x={x+BAR_W} y={H-8} textAnchor="middle" fontSize="9" fill={t.textMuted}>{nomCorto}</text>
                              {/* Área hover invisible con tooltip */}
                              <g>
                                <rect x={x-2} y={PAD_T} width={BAR_W*2+6} height={H-PAD_T-PAD_B} fill="transparent"
                                  style={{cursor:'pointer'}}
                                  onClick={() => { setDashDrill([{campo:'capitulo', valor:cap.capitulo}]); setPopupCapitulo(true) }}
                                  onMouseEnter={e => {
                                    const tip = document.getElementById(`tip-vs-${i}`)
                                    if(tip) tip.style.display='block'
                                  }}
                                  onMouseLeave={e => {
                                    const tip = document.getElementById(`tip-vs-${i}`)
                                    if(tip) tip.style.display='none'
                                  }}
                                />
                                  onMouseLeave={e => {
                                    const tip = document.getElementById(`tip-vs-${i}`)
                                    if(tip) tip.style.display='none'
                                  }}
                                <g id={`tip-vs-${i}`} style={{display:'none', pointerEvents:'none'}}>
                                  <rect x={Math.min(x-10, totalW-220)} y={Math.min(yP,yC)-68} width="215" height="62" rx="6"
                                    fill={t.bgCard} stroke={t.border} strokeWidth="1"
                                    style={{filter:'drop-shadow(0 2px 8px rgba(0,0,0,0.3))'}}/>
                                  <text x={Math.min(x-10,totalW-220)+10} y={Math.min(yP,yC)-50} fontSize="10" fontWeight="700" fill={t.text}>
                                    {(cap.capitulo||'').length > 28 ? (cap.capitulo||'').slice(0,28)+'…' : (cap.capitulo||'')}
                                  </text>
                                  <rect x={Math.min(x-10,totalW-220)+10} y={Math.min(yP,yC)-40} width="8" height="8" rx="1" fill="#0077B6"/>
                                  <text x={Math.min(x-10,totalW-220)+22} y={Math.min(yP,yC)-33} fontSize="10" fill={t.textMuted}>
                                    Ppto: <tspan fontWeight="700" fill="#0077B6">{fmtD(cap.presupuesto)}</tspan>
                                  </text>
                                  <rect x={Math.min(x-10,totalW-220)+10} y={Math.min(yP,yC)-24} width="8" height="8" rx="1" fill={colorC}/>
                                  <text x={Math.min(x-10,totalW-220)+22} y={Math.min(yP,yC)-17} fontSize="10" fill={t.textMuted}>
                                    Cobro: <tspan fontWeight="700" fill={colorC}>{fmtD(cap.cobrado)}</tspan>
                                  </text>
                                </g>
                              </g>
                            </g>
                          )
                        })}
                      </svg>
                      {/* Leyenda */}
                      <div style={{ display:'flex', gap:'16px', marginTop:'8px', justifyContent:'center' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#0077B6' }}/> Presupuesto
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#00A896' }}/> Cobro
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:t.textMuted }}>
                          <div style={{ width:'12px', height:'12px', borderRadius:'2px', background:'#DC2626' }}/> Sobrecosto
                        </div>
                      </div>
                      {/* Paginador capítulos */}
                      {comp.length > CAP_PAG && (
                        <div style={{ display:'flex', gap:'6px', justifyContent:'center', marginTop:'10px', alignItems:'center' }}>
                          <button onClick={() => setDashCapPag(p => Math.max(0,p-1))} disabled={dashCapPag===0}
                            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor: dashCapPag===0?'default':'pointer', color: dashCapPag===0?t.textMuted:t.text }}>‹</button>
                          {Array.from({length: Math.ceil(comp.length/CAP_PAG)}, (_,i) => (
                            <button key={i} onClick={() => setDashCapPag(i)}
                              style={{ background: dashCapPag===i ? t.primary : 'transparent', color: dashCapPag===i ? '#fff' : t.textMuted, border:`1px solid ${dashCapPag===i ? t.primary : t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer' }}>
                              {i+1}
                            </button>
                          ))}
                          <button onClick={() => setDashCapPag(p => Math.min(Math.ceil(comp.length/CAP_PAG)-1, p+1))} disabled={dashCapPag===Math.ceil(comp.length/CAP_PAG)-1}
                            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer', color:t.text }}>›</button>
                          <span style={{ fontSize:'10px', color:t.textMuted }}>{dashCapPag*CAP_PAG+1}–{Math.min((dashCapPag+1)*CAP_PAG, comp.length)} de {comp.length}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              {/* ── Drill → ahora vive en el popup ── */}
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
                            const res = await fetch(`${API}/cobro/${usuario.contrato_id}/exportar-capitulo?capitulo=${cap}`, {
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
                      bearing={90}
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
                    <MiniMapaSemaforo t={t} colores={liqMapaColores} height={260} bearing={90} onPkidClick={liqSeleccion ? abrirLiqMapaPopup : null} />
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
                                  <tr key={i}>
                                    <td style={{...tdS, fontWeight:'600', color:t.primary}}>{r.id_pol || '—'}</td>
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
                                  <tr key={i}>
                                    <td style={{...tdS, fontWeight:'600', color:'#00A896'}}>{r.registro || '—'}</td>
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
        {moduloActivo === 'presupuesto' && <ModuloPresupuesto t={t} usuario={usuario} token={getToken()} s={s} navRegistroId={navRegistroId} onNavRegistroConsumed={() => setNavRegistroId(null)} />}

{/* ── MÓDULO SICOE ── */}
        {moduloActivo === 'cobro' && <ModuloCobro t={t} usuario={usuario} token={getToken()} s={s} />}

        {moduloActivo === 'sicoe_obra' && <ModuloSicoeObra t={t} usuario={usuario} token={getToken()} s={s} />}

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
  const [themeMode, setThemeMode] = useState('auto')
  const [activeTheme, setActiveTheme] = useState(getAutoTheme())
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
        const changed =
          fresh.cargo_id    !== prev.cargo_id   ||
          fresh.rol_id      !== prev.rol_id     ||
          fresh.estado      !== prev.estado     ||
          fresh.contrato_id !== prev.contrato_id ||
          permisosChanged
        if (changed) {
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
          const msgs = []
          if (fresh.cargo_id    !== prev.cargo_id)    msgs.push('cargo')
          if (fresh.contrato_id !== prev.contrato_id) msgs.push('contrato')
          if (fresh.estado      !== prev.estado)      msgs.push('estado')
          if (permisosChanged)                         msgs.push('permisos')
          setBannerMsg(`⚡ Tu ${msgs.join(', ')} fue actualizado por el administrador.`)
        }
      } catch { /* silencioso */ }
    }, 15000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
    const ping = () => fetch('https://claracore-backend.azurewebsites.net/').catch(() => {})
    ping()
    const iv = setInterval(ping, 8 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

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

  function handleLogout() {
    localStorage.removeItem('cc_token'); localStorage.removeItem('cc_usuario')
    sessionStorage.removeItem('cc_token'); sessionStorage.removeItem('cc_usuario')
    setUsuario(null)
  }

  if (usuario) return (
    <>
    {hayNuevaVersion && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, background: '#0f2038', borderBottom: '2px solid #00afc5', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#e0f4f7', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
          <span>⚡ {bannerMsg}</span>
          <button onClick={() => setBannerMsg(null)} style={{ background: 'transparent', border: 'none', color: '#8acdd8', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
        </div>
      )}
      <Dashboard t={t} activeTheme={activeTheme} themeMode={themeMode}
        onTheme={handleTheme} usuario={usuario} setUsuario={setUsuario} onLogout={handleLogout}
        topOffset={bannerMsg ? 44 : 0}
        fontSize={fontSize} onFontSize={cambiarFuente}
      />
    </>
  )

  return (
    <>
      <LandingPage t={t} activeTheme={activeTheme} themeMode={themeMode}
        onTheme={handleTheme}
        onLogin={() => setModal('login')}
        onRegistro={() => setModal('registro')}
        onOlvide={() => setModal('olvide')} />
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
