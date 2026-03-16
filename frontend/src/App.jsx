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
function ModuloPresupuesto({ t, usuario, token, s }) {
  const API = 'https://claracore-backend.azurewebsites.net'
  const contratoId = usuario?.contrato_id

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [seleccionados, setSeleccionados] = useState(new Set())
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
  // ── Comentarios ──────────────────────────────────────────────────────────
  const [modalComentario,  setModalComentario]  = useState(null) // {tipo, obligatorio, resolve}
  const [textoComentario,  setTextoComentario]  = useState('')
  const [destinatarioComentario, setDestinatarioComentario] = useState('')
  const [usuariosDestinatarios,  setUsuariosDestinatarios]  = useState([])
  const [comentariosPorId, setComentariosPorId] = useState({})
  const [modalHilo,        setModalHilo]        = useState(null) // {registroId, tipo, data}
  const [hiloLoading,      setHiloLoading]      = useState(false)
  const [respuestaTexto,   setRespuestaTexto]   = useState('')
  
  // ── Enlace DWG ──────────────────────────────────────────────────────────── 
  const [dwgEnlazado, setDwgEnlazado] = useState(false)
  useEffect(() => {
    if (!contratoId) return
    const check = async () => {
      try {
        const r = await fetch(`${API}/cad-queue/${contratoId}/estado`, {
          headers: { Authorization: `Bearer ${token}` }
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
  useEffect(() => { if (contratoId) cargarRegistros() }, [contratoId])
  
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
  const [verPapelera, setVerPapelera] = useState(false)  

async function cargarRegistros(modoPapelera) {
    if (!contratoId) return
    setLoading(true)
    const esPapelera = modoPapelera !== undefined ? modoPapelera : verPapelera
    const params = esPapelera ? '?papelera=true' : ''
    const res = await fetch(`${API}/presupuesto/${contratoId}${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setRegistros(await res.json())
    setLoading(false)
    setPagina(1)
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
  }, [registrosFiltrados, nivelActual])

  const costoTotal = useMemo(() =>
    chartData.reduce((s, d) => s + (d.costo ?? 0), 0)
  , [chartData])

  const totalPaginas = Math.ceil(registrosFiltrados.length / POR_PAGINA)
  const registrosPagina = useMemo(() =>
    registrosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  , [registrosFiltrados, pagina])

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
      'PK_ID':'pk_id','PK_ID':'pk_id',
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
      'LAYERENT':'layer_ent','LAYER_ENT':'layer_ent','LAYERENT':'layer_ent',
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
    if (ok) { setDrill([]); await cargarRegistros() }
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
  )

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
      setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
      await cargarRegistros()
    }
  }

  async function ejecutarBulkEstado() {
    if (!bulkEstado || seleccionados.size === 0) return
    const obligatorio = bulkEstado === 'Verificar Campo' || bulkEstado === 'Pendiente'
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
      setBulkEstado(''); setSeleccionados(new Set()); await cargarRegistros()
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
      body[k] = ['area_long_nod','ancho','espesor','vlr_unitario'].includes(k) ? parseFloat(v) : v
    })
    const res = await fetch(`${API}/presupuesto/item/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (res.ok) { setEditando(null); await cargarRegistros() }
  }

  // ── Selección ──────────────────────────────────────────────────────────────
  function toggleSel(id) {
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodos() {
    setSeleccionados(prev => prev.size === registrosFiltrados.length ? new Set() : new Set(registrosFiltrados.map(r => r.id)))
  }
  useEffect(() => setPagina(1), [registrosFiltrados.length])
  useEffect(() => {
    const ids = registrosPagina?.map(r => r.id)
    if (ids?.length) cargarComentariosResumen(ids)
  }, [pagina, registrosFiltrados.length])

  // ── Estilos ────────────────────────────────────────────────────────────────
  const REVISADO_OPTS = ['No Revisado', 'Pendiente', 'Verificar Campo', 'Verificado']
  const estadoColor = (r) => r === 'Verificado' ? '#16A34A' : r === 'Verificar Campo' ? '#D97706' : r === 'Pendiente' ? '#EF4444' : '#3B82F6'
  const SEMAFORO = [
    { valor: 'No Revisado',     color: '#3B82F6', label: '🔵' },
    { valor: 'Pendiente',       color: '#EF4444', label: '🔴' },
    { valor: 'Verificar Campo', color: '#D97706', label: '🟡' },
    { valor: 'Verificado',      color: '#16A34A', label: '🟢' },
  ]
function zoomEnDwg(registro) {
    if (!registro.x_label || !registro.y_label) return
    const uri = `claralink://zoom?x=${registro.x_label}&y=${registro.y_label}&radio=20`
    window.location.href = uri
  }

  async function cambiarEstadoDirecto(id, nuevoEstado) {
    const obligatorio = nuevoEstado === 'Verificar Campo' || nuevoEstado === 'Pendiente'
    const comentario = await pedirComentario('validacion', obligatorio)
    if (comentario === null) return
    const token = getToken()
    await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [id], revisado: nuevoEstado })
    })
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioComentario)
    await cargarRegistros()
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
      await cargarRegistros()
    } else alert('Error al dar de baja el registro')
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
      {/* Modal detalle registro presupuesto */}
      {modalDetallePpto && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={() => setModalDetallePpto(null)}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'520px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px' }}>
              <div style={{ fontSize:'14px',fontWeight:'800',color:t.primary }}>📋 Detalle del Registro</div>
              <button onClick={() => setModalDetallePpto(null)} style={{ background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:t.textMuted }}>✕</button>
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
                  {r.observaciones && <BigF label="OBSERVACIONES" val={r.observaciones}/>}
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
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}>
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
              <textarea autoFocus value={textoComentario} onChange={e => setTextoComentario(e.target.value)}
                placeholder="Escribe aquí el motivo o comentario..."
                style={{ width:'100%',minHeight:'100px',background:t.inputBg,border:`1.5px solid ${color}66`,borderRadius:'8px',padding:'10px',color:t.text,fontSize:'13px',resize:'vertical',boxSizing:'border-box' }} />
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
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'24px',width:'520px',maxWidth:'95vw',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px' }}>
                <div style={{ fontSize:'15px',fontWeight:'700',color }}>💬 {TITULOS[modalHilo.tipo]}</div>
                <button onClick={() => setModalHilo(null)} style={{ background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:t.textMuted }}>✕</button>
              </div>
              <div style={{ overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:'12px',paddingRight:'4px' }}>
                {hiloLoading ? <div style={{ textAlign:'center',padding:'30px',color:t.textMuted }}>Cargando...</div>
                : modalHilo.data.length === 0 ? <div style={{ textAlign:'center',padding:'30px',color:t.textMuted }}>Sin comentarios</div>
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
                    <div style={{ marginTop:'10px',display:'flex',gap:'6px' }}>
                      <input value={respuestaTexto} onChange={e=>setRespuestaTexto(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); responderEnHilo(c.id) } }}
                        placeholder="Responder..." style={{ flex:1,background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'6px',padding:'5px 10px',fontSize:'12px',color:t.text }} />
                      <button onClick={()=>responderEnHilo(c.id)} disabled={!respuestaTexto.trim()}
                        style={{ background:respuestaTexto.trim()?color:'#999',color:'#fff',border:'none',borderRadius:'6px',padding:'5px 12px',fontSize:'12px',cursor:respuestaTexto.trim()?'pointer':'default' }}>↩</button>
                    </div>
                  </div>
                ))}
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
          {registros.length} total · {registrosFiltrados.length} filtrados · {seleccionados.size} seleccionados
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
      {loading ? (
        <div style={s.emptyState}>Cargando registros...</div>
      ) : registros.length === 0 ? (
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
                {registrosFiltrados.length} registros · <strong style={{color:colorActual}}>{fmt(costoTotal)}</strong>
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
              const BAR_W=22, GAP=10, PAD_L=8, PAD_R=8, H=200, PAD_T=14, PAD_B=28
              const totalW = PAD_L + chartData.length*(BAR_W+GAP) + PAD_R
              const scaleH = v => PAD_T + (1-v/maxVal)*(H-PAD_T-PAD_B)
              return (
                <div style={{ overflowX:'auto' }}>
                  <svg width={Math.max(totalW,400)} height={H} style={{ overflow:'visible', display:'block' }}>
                    {[0,25,50,75,100].map(pct => {
                      const y = PAD_T+(1-pct/100)*(H-PAD_T-PAD_B)
                      return <line key={pct} x1={PAD_L} x2={totalW} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                    })}
                    {chartData.map((d,i) => {
                      const color = PALETA_BARRAS[i%PALETA_BARRAS.length]
                      const x = PAD_L+i*(BAR_W+GAP)
                      const y = scaleH(d.costo)
                      const h = H-PAD_B-y
                      const nomCorto = String(d.name).length>10 ? String(d.name).slice(0,10)+'…' : String(d.name)
                      return (
                        <g key={d.name} onClick={() => handleBarClick(d)} style={{ cursor:'pointer' }}>
                          <rect x={x} y={y} width={BAR_W} height={Math.max(h,2)} fill={color} rx="3" opacity="0.85"
                            onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-cobro-cap-${i}`); if(tip) tip.style.display='block' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-cobro-cap-${i}`); if(tip) tip.style.display='none' }}
                          />
                          <text x={x+BAR_W/2} y={H-10} textAnchor="middle" fontSize="7" fill={t.textMuted}>{nomCorto}</text>
                          <g id={`tip-cobro-cap-${i}`} style={{display:'none',pointerEvents:'none'}}>
                            <rect x={Math.min(x-10,totalW-180)} y={y-46} width="175" height="40" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                            <text x={Math.min(x-10,totalW-180)+10} y={y-30} fontSize="10" fontWeight="700" fill={t.text}>
                              {String(d.name).length>24?String(d.name).slice(0,24)+'…':String(d.name)}
                            </text>
                            <text x={Math.min(x-10,totalW-180)+10} y={y-14} fontSize="10" fill={t.textMuted}>
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
          <button onClick={() => { const v = !verPapelera; setVerPapelera(v); cargarRegistros(v) }}
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
                <option value="abscisa">📍 Abscisa</option>
                <option value="idpol">🆔 ID Pol</option>
              </select>
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
                  await cargarRegistros()
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
                  <tr key={r.id} style={{ background:seleccionados.has(r.id)?(t.primary+'18'):'transparent', cursor: r.x_label ? 'crosshair' : 'default' }}
                    onClick={() => { if (!isEdit) zoomEnDwg(r) }}>
                    <td style={{...tdStyle, whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <input type="checkbox" checked={seleccionados.has(r.id)} onChange={() => toggleSel(r.id)} />
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
                      {puedeEditar && seleccionados.has(r.id)
                        ? <input type="number" value={editDims[r.id]?.ancho ?? (r.ancho ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { espesor: r.espesor, ...prev[r.id], ancho: v } })) }}
                            style={{ width:'70px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'12px' }} />
                        : fmtN(r.ancho)}                
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditar && seleccionados.has(r.id)
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
                              onClick={() => puedeValidar && !activo && cambiarEstadoDirecto(r.id, s.valor)}
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
                          <button onClick={() => darDeBaja(r.id)}
                            title="Dar de baja"
                            style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px', color:'#EF4444', fontSize:'11px', cursor:'pointer' }}>
                            🗑️
                          </button>
                        )}
                      </td>
                    )}
                    {!puedeEditar && !puedeValidar && (
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
              const BAR_W=50, GAP=12, PAD_L=8, PAD_R=8, H=220, PAD_T=14, PAD_B=28
              const totalW = PAD_L + chartData.length*(BAR_W+GAP) + PAD_R
              const scaleH = v => PAD_T + (1-v/maxVal)*(H-PAD_T-PAD_B)
              return (
                <div style={{ overflowX:'auto' }}>
                  <svg width={Math.max(totalW,400)} height={H} style={{ overflow:'visible', display:'block' }}>
                    {[0,25,50,75,100].map(pct => {
                      const y = PAD_T+(1-pct/100)*(H-PAD_T-PAD_B)
                      return <line key={pct} x1={PAD_L} x2={Math.max(totalW,400)} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                    })}
                    {chartData.map((d,i) => {
                      const color = PALETA[i%PALETA.length]
                      const x = PAD_L+i*(BAR_W+GAP)
                      const y = scaleH(d.costo)
                      const h = H-PAD_B-y
                      const nomCorto = String(d.name).length>10 ? String(d.name).slice(0,10)+'…' : String(d.name)
                      return (
                        <g key={d.name} onClick={() => handleBarClick(d)} style={{ cursor:'pointer' }}>
                          <rect x={x} y={y} width={BAR_W} height={Math.max(h,2)} fill={color} rx="3" opacity="0.85"
                            onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-scobro-${i}`); if(tip) tip.style.display='block' }}
                            onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-scobro-${i}`); if(tip) tip.style.display='none' }}/>
                          <text x={x+BAR_W/2} y={H-10} textAnchor="middle" fontSize="7" fill={t.textMuted}>{nomCorto}</text>
                          <g id={`tip-scobro-${i}`} style={{display:'none',pointerEvents:'none'}}>
                            <rect x={Math.min(x-10,Math.max(totalW,400)-190)} y={Math.max(y-50,0)} width="185" height="42" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                            <text x={Math.min(x-10,Math.max(totalW,400)-190)+10} y={Math.max(y-50,0)+16} fontSize="10" fontWeight="700" fill={t.text}>{String(d.name).length>24?String(d.name).slice(0,24)+'…':String(d.name)}</text>
                            <text x={Math.min(x-10,Math.max(totalW,400)-190)+10} y={Math.max(y-50,0)+32} fontSize="10" fill={t.textMuted}>
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
        map.addLayer({ id: 'ppto-line', type: 'line', source: 'ppto-pols',
          paint: { 'line-color': '#ffffff', 'line-width': 0.8, 'line-opacity': 0.3 }
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
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const [listo, setListo] = useState(false)
  const [modo, setModo]   = useState('ambos') // 'presupuesto' | 'cobro' | 'ambos'

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

  // Inicializar mapa una sola vez
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
          // Capa presupuesto (azul)
          map.addLayer({ id: 'mini-fill-ppto', type: 'fill', source: 'mini-pols',
            paint: {
              'fill-color': ['get', 'color_ppto'],
              'fill-opacity': ['case', ['==', ['get', 'tiene_ppto'], 1], 0.7, 0.1]
            }
          })
          // Capa cobro (semáforo)
          map.addLayer({ id: 'mini-fill-cobro', type: 'fill', source: 'mini-pols',
            paint: {
              'fill-color': ['get', 'color_cobro'],
              'fill-opacity': ['case', ['==', ['get', 'tiene_cobro'], 1], 0.7, 0.1]
            }
          })
          map.addLayer({ id: 'mini-line', type: 'line', source: 'mini-pols',
            paint: { 'line-color': '#ffffff', 'line-width': 0.8, 'line-opacity': 0.3 }
          })
          // Click en polígono
          map.on('click', 'mini-fill-cobro', (e) => {
            const pkid = e.features[0]?.properties?.pk_id || String(e.features[0]?.properties?.Layer || '').trim()
            if (pkid && onPkidClick) onPkidClick(pkid)
          })
          map.on('click', 'mini-fill-ppto', (e) => {
            const pkid = e.features[0]?.properties?.pk_id || String(e.features[0]?.properties?.Layer || '').trim()
            if (pkid && onPkidClick) onPkidClick(pkid)
          })
          map.on('mouseenter', 'mini-fill-cobro', () => { if (onPkidClick) map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'mini-fill-cobro', () => { map.getCanvas().style.cursor = '' })
          map.on('mouseenter', 'mini-fill-ppto',  () => { if (onPkidClick) map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', 'mini-fill-ppto',  () => { map.getCanvas().style.cursor = '' })
          // Fit bounds
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

  // Actualizar colores cuando cambia colores o modo
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !listo) return
    // Actualizar datos
    const src = map.getSource('mini-pols')
    if (src) {
      const raw = src._data
      if (raw && raw.features) {
        src.setData({ ...raw, features: buildFeatures(raw) })
      }
    }
    // Visibilidad de capas según modo
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
      {/* Toggle de modo */}
      <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
        {btnModo('presupuesto', '📋 Presupuesto', '#0077B6')}
        {btnModo('cobro',       '💰 Cobro',       '#00A896')}
        {btnModo('ambos',       '⚡ Ambos',        '#7C3AED')}
      </div>
      {/* Mapa */}
      <div style={{ position:'relative', width:'100%', height:`${height}px`, borderRadius:'8px', overflow:'hidden' }}>
        <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
        {!listo && (
          <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:t.textMuted }}>
            ⏳ Cargando mapa...
          </div>
        )}
        {/* Leyenda */}
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
              <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)}
                placeholder="Escribe tu respuesta..."
                style={{ width:'100%', minHeight:'72px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 10px', color:t.text, fontSize:'13px', resize:'vertical', boxSizing:'border-box' }} />
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
              <textarea value={nuevo.mensaje} onChange={e => setNuevo({...nuevo, mensaje: e.target.value})}
                placeholder="Escribe tu mensaje..."
                style={{ width:'100%', minHeight:'100px', background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'13px', resize:'vertical', boxSizing:'border-box' }} />
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
function Dashboard({ t, activeTheme, themeMode, onTheme, usuario, setUsuario, onLogout, topOffset = 0 }) {
  const [moduloActivo, setModuloActivo] = useState('dashboard')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [tabInferior, setTabInferior] = useState('gantt')
  const [analisis, setAnalisis] = useState('financiero')
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
  const [notifNavegar, setNotifNavegar] = useState(null)
  const colsGrid = '1fr 1fr'
  const [miniMapaColores, setMiniMapaColores] = useState({})
  const [popupPkid,      setPopupPkid]      = useState(null)  // {pkid, data}
  const [popupLoading,   setPopupLoading]   = useState(false)
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

  async function cargarDashDrill(drill) {
    if (!contratoIdDash) return
    // Si tenemos capitulo+item → cargar tabla detallada en lugar de más gauges
    if (drill.length >= 2) {
      setDashTablaLoad(true); setDashTabla(null)
      const params = new URLSearchParams()
      drill.forEach(d => params.set(d.campo, d.valor))
      const tok = getToken()
      const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/pkid-tabla?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
      if (res.ok) setDashTabla(await res.json())
      setDashTablaLoad(false)
      return
    }
    setDashTabla(null)
    setDashLoading(true)
    const params = new URLSearchParams()
    drill.forEach(d => params.set(d.campo, d.valor))
    const tok = getToken()
    const res = await fetch(`${API_URL}/cobro/${contratoIdDash}/drill?${params}`, { headers: { Authorization:`Bearer ${tok}` } })
    if (res.ok) {
      const data = await res.json()
      const lista = data.items || data
      setDashData(lista.map(r => ({
        item: r.item || r.nombre,
        descripcion: r.descripcion || '',
        presupuesto: r.presupuesto || 0,
        cobrado: r.cobrado || 0,
        cant_ppto: r.cant_ppto || 0,
        cant_cobro: r.cant_cobro || r.cant_sicoe || 0,
      })))
    }
    setDashLoading(false)
  }

  useEffect(() => { if (contratoIdDash) { setDashDrillPag(0); cargarDashDrill(dashDrill) } }, [contratoIdDash, dashDrill])
  
    async function abrirPopupPkid(pkid) {
    if (dashDrill.length < 2) return  // solo en nivel item
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

    function handleNavegar(notif) {
    if (!notif?.modulo) return
    const modMap = { PRESUPUESTO:'presupuesto', COBRO:'cobro', AUTH:'dashboard' }
    const mod = modMap[notif.modulo] || 'dashboard'
    setModuloActivo(mod)
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

  // Desarrollador ve todo; otros usuarios ven solo su contrato
  const esDeveloper = usuario?.cargo_nombre === 'Desarrollador'
  // Funciones que habilitan ver el panel admin
  const ADMIN_FUNCIONES = ["contratos", "listado de precios"]
  const tienePermisoAdmin = (usuario?.permisos || []).some(p =>
    p.ver && ADMIN_FUNCIONES.includes(p.funcion_nombre?.toLowerCase())
  )
  const canAdmin = esDeveloper || usuario?.cargo_nombre === 'Administrador' || tienePermisoAdmin

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
            ['dashboard',    '🏠', 'Dashboard'],
            ['presupuesto',  '📋', 'Presupuesto'],
            ['cobro',        '💰', 'SICOE'],
            ['almacen',      '🏪', 'Almacén'],
            ['gantt',        '📅', 'Gantt'],
            ['semaforo',     '🗺️', 'Plano Semáforo'],
          ].map(([key, icon, label]) => (
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
                const u = { ...usuario, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista ?? null, logo_interventoria: contrato.logo_interventoria ?? null }
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
            {/* ── KPIs compactos ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'20px' }}>
              {[
                { label:'PRESUPUESTO TOTAL', value: fmtD(ppto), sub: kpiPpto ? `${kpiPpto.total_registros} ítems` : '—', color:'#0077B6', icon:'📋' },
                { label:'SICOE ACUMULADO',   value: fmtD(cobro), sub: kpiCobro ? `${kpiCobro.actas?.length||0} actas` : '—', color:'#00A896', icon:'💰' },
                { label:'SALDO DISPONIBLE',  value: fmtD(delta), sub: delta < 0 ? '⚠️ Sobrecosto' : 'Sin sobrecosto', color: delta < 0 ? '#EF4444' : '#10B981', icon:'📊' },
                { label:'% CONSUMO',         value: `${pct}%`, sub: pct >= 90 ? '🔴 Crítico' : pct >= 70 ? '🟡 Alerta' : '🟢 Normal', color: alerta, icon:'⚡' },
              ].map(k => (
                <div key={k.label} style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'10px', padding:'14px 16px', boxShadow:t.shadow, borderLeft:`4px solid ${k.color}` }}>
                  <div style={{ fontSize:'10px', fontWeight:'700', color:t.textMuted, letterSpacing:'1.5px', marginBottom:'6px' }}>{k.icon} {k.label}</div>
                  <div style={{ fontSize:'22px', fontWeight:'800', color:k.color, lineHeight:1, marginBottom:'4px' }}>{k.value}</div>
                  <div style={{ fontSize:'11px', color:t.textMuted }}>{k.sub}</div>
                </div>
              ))}
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
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'20px', boxShadow:t.shadow, ...(panelFoco==='ppto-cobro' && {gridColumn:'1 / -1'}) }}>
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
                  const BAR_W = 18, GAP = 6, PAD_L = 8, PAD_R = 8, H = 180, PAD_T = 10, PAD_B = 24
                  const totalW = PAD_L + comp.length * (BAR_W*2 + GAP + 8) + PAD_R
                  const scaleH = (v) => PAD_T + (1 - v/maxVal) * (H - PAD_T - PAD_B)

                  return (
                    <div style={{ overflowX:'auto', overflowY:'visible' }}>
                      <svg width={Math.max(totalW, 400)} height={H} style={{ overflow:'visible', display:'block' }}>
                        {/* Líneas de referencia */}
                        {[0,25,50,75,100].map(pct => {
                          const y = PAD_T + (1-pct/100)*(H-PAD_T-PAD_B)
                          return <line key={pct} x1={PAD_L} x2={totalW-PAD_R} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                        })}
                        {comp.map((cap, i) => {
                          const x = PAD_L + i * (BAR_W*2 + GAP + 8)
                          const yP = scaleH(cap.presupuesto||0)
                          const yC = scaleH(cap.cobrado||0)
                          const hP = H - PAD_B - yP
                          const hC = H - PAD_B - yC
                          const sobrecosto = (cap.cobrado||0) > (cap.presupuesto||0)
                          const colorC = sobrecosto ? '#DC2626' : '#00A896'
                          const isSelected = dashDrill[0]?.valor === cap.capitulo
                          const nomCorto = (cap.capitulo||'').length > 8 ? (cap.capitulo||'').slice(0,8)+'…' : (cap.capitulo||'')
                          return (
                            <g key={i}>
                              {/* Barra Presupuesto */}
                              <rect x={x} y={yP} width={BAR_W} height={Math.max(hP,2)} fill="#0077B6" rx="2" opacity={isSelected?1:0.85} style={{cursor:'pointer'}} onClick={() => setDashDrill([{campo:'capitulo', valor:cap.capitulo}])}/>
                              {/* Barra Cobro */}
                              <rect x={x+BAR_W+2} y={yC} width={BAR_W} height={Math.max(hC,2)} fill={colorC} rx="2" opacity={isSelected?1:0.85} style={{cursor:'pointer'}} onClick={() => setDashDrill([{campo:'capitulo', valor:cap.capitulo}])}/>
                              {/* Etiqueta eje X */}
                              <text x={x+BAR_W} y={H-6} textAnchor="middle" fontSize="7" fill={t.textMuted}>{nomCorto}</text>
                              {/* Área hover invisible con tooltip */}
                              <g>
                                <rect x={x-2} y={PAD_T} width={BAR_W*2+6} height={H-PAD_T-PAD_B} fill="transparent"
                                  style={{cursor:'pointer'}}
                                  onClick={() => setDashDrill([{campo:'capitulo', valor:cap.capitulo}])}
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
                    </div>
                  )
                })()}
              {/* ── Drill capítulo → ítem → tabla ── */}
                {dashDrill.length > 0 && (
                  <div style={{ marginTop:'16px', borderTop:`1px solid ${t.border}`, paddingTop:'14px', minWidth:0, overflow:'hidden' }}>
                    {/* Breadcrumb */}
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
                      <button onClick={() => setDashDrill([])}
                        style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'20px', padding:'3px 12px', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>
                        ✕ Todos los capítulos
                      </button>
                      <span style={{ fontSize:'11px', color:t.textMuted }}>›</span>
                      <span style={{ fontSize:'11px', fontWeight:'700', color:t.primary, background:t.primary+'18', borderRadius:'20px', padding:'3px 12px' }}>
                        {dashDrill[0]?.valor}
                      </span>
                      {dashDrill[1] && <>
                        <span style={{ fontSize:'11px', color:t.textMuted }}>›</span>
                        <span style={{ fontSize:'11px', fontWeight:'700', color:'#00A896', background:'#00A89618', borderRadius:'20px', padding:'3px 12px' }}>
                          Ítem: {dashDrill[1]?.valor}
                        </span>
                        <button onClick={() => setDashDrill([dashDrill[0]])}
                          style={{ background:'transparent', border:'none', fontSize:'11px', color:t.textMuted, cursor:'pointer' }}>✕</button>
                        {/* Totales inline */}
                        {dashTabla && (() => {
                          const filas = dashTabla.rows || dashTabla.filas || []
                          const totalDeltaCant = filas.reduce((s,f) => s + (f.delta_cant ?? ((f.cant_ppto||0)-(f.cant_sicoe||0))), 0)
                          const totalDeltaCosto = filas.reduce((s,f) => s + (f.delta_costo ?? ((f.costo_ppto||0)-(f.costo_sicoe||0))), 0)
                          const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                          return <>
                            <span style={{ fontSize:'11px', color:t.textMuted }}>|</span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color: totalDeltaCant >= 0 ? '#10B981' : '#EF4444', background: totalDeltaCant >= 0 ? '#10B98118' : '#EF444418', borderRadius:'20px', padding:'3px 10px' }}>
                              Δ Cant: {totalDeltaCant >= 0 ? '+' : ''}{totalDeltaCant.toFixed(2)}
                            </span>
                            <span style={{ fontSize:'11px', fontWeight:'700', color: totalDeltaCosto >= 0 ? '#10B981' : '#EF4444', background: totalDeltaCosto >= 0 ? '#10B98118' : '#EF444418', borderRadius:'20px', padding:'3px 10px' }}>
                              Δ Costo: {totalDeltaCosto >= 0 ? '+' : ''}{fmtD(totalDeltaCosto)}
                            </span>
                          </>
                        })()}
                      </>}
                    </div>

                    {/* Nivel 1: ítems del capítulo */}
                    {dashDrill.length === 1 && (
                      dashLoading ? (
                        <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>⏳ Cargando...</div>
                      ) : dashData?.length > 0 ? (() => {
                          const POR_PAG = 20
                          const totalPags = Math.ceil(dashData.length / POR_PAG)
                          const paginaItems = dashDrillPag || 0
                          const slice = dashData.slice(paginaItems * POR_PAG, (paginaItems + 1) * POR_PAG)
                          const maxV = Math.max(...slice.map(d => Math.max(d.presupuesto||0, d.cobrado||0)), 1)
                          const BAR_W = 18, GAP = 6, PAD_L = 8, PAD_R = 8, H = 160, PAD_T = 10, PAD_B = 28
                          const totalW = PAD_L + slice.length * (BAR_W*2 + GAP + 8) + PAD_R
                          const scaleH = v => PAD_T + (1 - v/maxV) * (H - PAD_T - PAD_B)
                          const fmtD = n => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '—'
                          return (
                            <div style={{ marginTop:'8px' }}>
                              {/* Paginación */}
                              {totalPags > 1 && (
                                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', flexWrap:'wrap' }}>
                                  <span style={{ fontSize:'10px', color:t.textMuted }}>
                                    {paginaItems * POR_PAG + 1}–{Math.min((paginaItems + 1) * POR_PAG, dashData.length)} de {dashData.length} ítems
                                  </span>
                                  <button onClick={() => setDashDrillPag(p => Math.max(0, p-1))} disabled={paginaItems === 0}
                                    style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor: paginaItems===0?'default':'pointer', color: paginaItems===0?t.textMuted:t.text }}>‹</button>
                                  {Array.from({length: totalPags}, (_,i) => (
                                    <button key={i} onClick={() => setDashDrillPag(i)}
                                      style={{ background: paginaItems===i ? t.primary : 'transparent', color: paginaItems===i ? '#fff' : t.textMuted, border:`1px solid ${paginaItems===i ? t.primary : t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer' }}>
                                      {i+1}
                                    </button>
                                  ))}
                                  <button onClick={() => setDashDrillPag(p => Math.min(totalPags-1, p+1))} disabled={paginaItems === totalPags-1}
                                    style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor: paginaItems===totalPags-1?'default':'pointer', color: paginaItems===totalPags-1?t.textMuted:t.text }}>›</button>
                                </div>
                              )}
                              {/* Gráfico */}
                              <div style={{ width:'100%', overflowX:'auto' }}>
                                <svg width={totalW} height={H} style={{ overflow:'visible', display:'block' }}>
                                  {[0,50,100].map(pct => {
                                    const y = PAD_T + (1-pct/100)*(H-PAD_T-PAD_B)
                                    return <line key={pct} x1={PAD_L} x2={totalW} y1={y} y2={y} stroke={t.border} strokeWidth="0.5" strokeDasharray="3,3"/>
                                  })}
                                  {slice.map((item, i) => {
                                    const x = PAD_L + i * (BAR_W*2 + GAP + 8)
                                    const yP = scaleH(item.presupuesto||0)
                                    const yC = scaleH(item.cobrado||0)
                                    const hP = H - PAD_B - yP
                                    const hC = H - PAD_B - yC
                                    const nomCorto = String(item.item||'').length > 6 ? String(item.item||'').slice(0,6)+'…' : String(item.item||'')
                                    return (
                                      <g key={i} onClick={() => setDashDrill([dashDrill[0], {campo:'item', valor: item.item}])} style={{cursor:'pointer'}}>
                                        <rect x={x} y={yP} width={BAR_W} height={Math.max(hP,2)} fill="#0077B6" rx="2" opacity="0.85"
                                          onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-drill-${i}`); if(tip) tip.style.display='block' }}
                                          onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-drill-${i}`); if(tip) tip.style.display='none' }}/>
                                        <rect x={x+BAR_W+2} y={yC} width={BAR_W} height={Math.max(hC,2)} fill="#00A896" rx="2" opacity="0.85"
                                          onMouseEnter={e => { e.currentTarget.style.opacity='1'; const tip=document.getElementById(`tip-drill-${i}`); if(tip) tip.style.display='block' }}
                                          onMouseLeave={e => { e.currentTarget.style.opacity='0.85'; const tip=document.getElementById(`tip-drill-${i}`); if(tip) tip.style.display='none' }}/>
                                        <text x={x+BAR_W} y={H-8} textAnchor="middle" fontSize="7" fill={t.textMuted}>{nomCorto}</text>
                                        <g id={`tip-drill-${i}`} style={{display:'none', pointerEvents:'none'}}>
                                          <rect x={Math.min(x-10, Math.max(totalW,300)-220)} y={H-PAD_B-100} width="215" height="100" rx="5" fill={t.bgCard} stroke={t.border} strokeWidth="1"/>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+10} y={H-PAD_B-84} fontSize="10" fontWeight="700" fill={t.text}>{String(item.item||'').length>24?String(item.item||'').slice(0,24)+'…':String(item.item||'')}</text>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+10} y={H-PAD_B-72} fontSize="8" fill={t.textMuted}>{String(item.descripcion||'').length>32?String(item.descripcion||'').slice(0,32)+'…':String(item.descripcion||'')}</text>
                                        <rect x={Math.min(x-10, Math.max(totalW,300)-220)+10} y={H-PAD_B-62} width="8" height="8" rx="1" fill="#0077B6"/>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+22} y={H-PAD_B-55} fontSize="9" fill={t.textMuted}>Ppto: <tspan fontWeight="700" fill="#0077B6">{fmtD(item.presupuesto)}</tspan></text>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+22} y={H-PAD_B-42} fontSize="9" fill={t.textMuted}>Cant: <tspan fontWeight="700" fill="#0077B6">{(item.cant_ppto||0).toFixed(2)}</tspan></text>
                                        <rect x={Math.min(x-10, Math.max(totalW,300)-220)+10} y={H-PAD_B-32} width="8" height="8" rx="1" fill="#00A896"/>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+22} y={H-PAD_B-25} fontSize="9" fill={t.textMuted}>Cobro: <tspan fontWeight="700" fill="#00A896">{fmtD(item.cobrado)}</tspan></text>
                                        <text x={Math.min(x-10, Math.max(totalW,300)-220)+22} y={H-PAD_B-12} fontSize="9" fill={t.textMuted}>Cant: <tspan fontWeight="700" fill="#00A896">{(item.cant_cobro||0).toFixed(2)}</tspan></text>
                                        </g>
                                      </g>
                                    )
                                  })}
                                </svg>
                              </div>
                              <div style={{ display:'flex', gap:'12px', marginTop:'6px', justifyContent:'center' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:t.textMuted }}>
                                  <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:'#0077B6' }}/> Presupuesto
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:t.textMuted }}>
                                  <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:'#00A896' }}/> Cobro
                                </div>
                              </div>
                            </div>
                          )
                        })() : (
                        <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>Sin ítems</div>
                      )
                    )}

                    {/* Nivel 2: tabla PK_ID */}
                    {dashDrill.length >= 2 && (
                      dashTablaLoad ? (
                        <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>⏳ Cargando tabla...</div>
                      ) : dashTabla ? (
                        <div>
                          <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                            <thead>
                              <tr style={{ background:t.bg }}>
                                {['PK_ID','Cant. SICOE','Costo SICOE','Cant. Cobro','Costo Cobro','Δ Cant','Δ Costo'].map(h => (
                                  <th key={h} style={{ padding:'6px 8px', fontSize:'10px', fontWeight:'700', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(dashTabla.rows || dashTabla.filas || []).map((f, i) => {
                                const deltaC = f.delta_cant ?? ((f.cant_ppto||0) - (f.cant_sicoe||0))
                                const deltaCosto = f.delta_costo ?? ((f.costo_ppto||0) - (f.costo_sicoe||0))
                                return (
                                  <tr key={i} style={{ borderBottom:`1px solid ${t.border}` }}>
                                    <td style={{ padding:'5px 8px', fontWeight:'700', color:t.primary }}>{f.pk_id}</td>
                                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{(f.cant_ppto||0).toFixed(2)}</td>
                                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{fmtD(f.costo_ppto)}</td>
                                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{(f.cant_sicoe||0).toFixed(2)}</td>
                                    <td style={{ padding:'5px 8px', textAlign:'right' }}>{fmtD(f.costo_sicoe)}</td>
                                    <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:'700', color: deltaC > 0 ? '#10B981' : deltaC < 0 ? '#EF4444' : t.textMuted }}>
                                      {deltaC > 0 ? '+' : ''}{deltaC?.toFixed(2)}
                                    </td>
                                    <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:'700', color: deltaCosto > 0 ? '#10B981' : deltaCosto < 0 ? '#EF4444' : t.textMuted }}>
                                      {deltaCosto > 0 ? '+' : ''}{fmtD(deltaCosto)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        </div>
                      ) : (
                        <div style={{ textAlign:'center', padding:'20px', color:t.textMuted, fontSize:'12px' }}>Sin datos</div>
                      )
                    )}
                  </div>
                )} 
              </div>

              {/* 🗺️ Panel Mini Mapa Semáforo */}
              <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', padding:'16px', boxShadow:t.shadow, display:'flex', flexDirection:'column', ...(panelFoco==='semaforo' && {gridColumn:'1 / -1'}) }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'700', color:t.text }}>🗺️ Plano Semáforo</div>
                      <button onClick={() => setPanelFoco(p => p === 'semaforo' ? null : 'semaforo')}
                        style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'14px', padding:'0' }}
                        title="Expandir panel">
                        {panelFoco === 'semaforo' ? '⊠' : '⤢'}
                      </button>
                    </div>
                    <div style={{ fontSize:'10px', color:t.textMuted, marginTop:'1px' }}>
                      {dashDrill.length === 0 ? 'Todo el contrato' : dashDrill.length === 1 ? `Cap: ${dashDrill[0].valor.slice(0,20)}` : `Ítem: ${dashDrill[1].valor}`}
                    </div>
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted }}>
                    {Object.keys(miniMapaColores).length} PK_IDs
                  </div>
                </div>
                <MiniMapaSemaforo
                  t={t}
                  colores={miniMapaColores}
                  height={panelFoco === 'semaforo' ? 420 : 220}
                  onPkidClick={dashDrill.length >= 2 ? abrirPopupPkid : null}
                />
              </div>

            </div>
          </>
        })()}

{/* ── Popup detalle PK_ID ── */}
        {popupPkid && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => setPopupPkid(null)}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'24px', width:'780px', maxWidth:'96vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <div>
                  <div style={{ fontSize:'15px', fontWeight:'800', color:t.primary }}>
                    {dashDrill[1]?.valor} — {popupPkid.pkid}
                  </div>
                  <div style={{ fontSize:'11px', color:t.textMuted, marginTop:'2px' }}>
                    {dashDrill[0]?.valor}
                  </div>
                </div>
                <button onClick={() => setPopupPkid(null)} style={{ background:'transparent', border:'none', fontSize:'18px', cursor:'pointer', color:t.textMuted }}>✕</button>
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
                              <tr>{['Registro','Tramo Ini','Tramo Fin','Cant','Costo'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {cobro.length === 0
                                ? <tr><td colSpan={5} style={{...tdS, textAlign:'center', color:t.textMuted}}>Sin registros</td></tr>
                                : cobro.map((r,i) => (
                                  <tr key={i}>
                                    <td style={{...tdS, fontWeight:'600', color:'#00A896'}}>{r.registro || r.acta || '—'}</td>
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
                    <div style={{ borderTop:`2px solid ${t.border}`, paddingTop:'12px', display:'flex', gap:'16px', flexWrap:'wrap' }}>
                      {[
                        { label:'Cant. Ppto', val: fmtN(totales.cant_ppto), color:'#0077B6' },
                        { label:'Cant. Cobro', val: fmtN(totales.cant_cobro), color:'#00A896' },
                        { label:'Δ Cantidad', val: `${totales.delta_cant >= 0 ? '+' : ''}${fmtN(totales.delta_cant)}`, color: totales.delta_cant >= 0 ? '#10B981' : '#EF4444' },
                        { label:'Costo Ppto', val: fmtD(totales.costo_ppto), color:'#0077B6' },
                        { label:'Costo Cobro', val: fmtD(totales.costo_cobro), color:'#00A896' },
                        { label:'Δ Costo', val: `${totales.delta_costo >= 0 ? '+' : ''}${fmtD(totales.delta_costo)}`, color: totales.delta_costo >= 0 ? '#10B981' : '#EF4444' },
                      ].map(({label, val, color}) => (
                        <div key={label} style={{ background:t.bg, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'8px 14px', minWidth:'120px' }}>
                          <div style={{ fontSize:'9px', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
                          <div style={{ fontSize:'14px', fontWeight:'800', color }}>{val}</div>
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

        {/* ── MÓDULO PRESUPUESTO ── */}
        {moduloActivo === 'presupuesto' && <ModuloPresupuesto t={t} usuario={usuario} token={getToken()} s={s} />}

{/* ── MÓDULO SICOE ── */}
        {moduloActivo === 'cobro' && <ModuloCobro t={t} usuario={usuario} token={getToken()} s={s} />}

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

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [themeMode, setThemeMode] = useState('auto')
  const [activeTheme, setActiveTheme] = useState(getAutoTheme())
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
    const u = { ...pendingUser, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista ?? null, logo_interventoria: contrato.logo_interventoria ?? null }
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
