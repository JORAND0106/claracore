import { useState, useEffect, useRef } from 'react'
import AdminPanel from './AdminPanel'

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

// ─── MÓDULO PRESUPUESTO ───────────────────────────────────────────────────────
function ModuloPresupuesto({ t, usuario, token, s }) {
  const API = 'https://claracore-backend.azurewebsites.net'
  const contratoId = usuario?.contrato_id

  const [registros, setRegistros] = useState([])
  const [filtros, setFiltros] = useState({ capitulos: [], items: [], tramos: [], calzadas: [] })
  const [sel, setSel] = useState({ capitulo: '', item: '', tramo: '', calzada: '' })
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [editando, setEditando] = useState(null) // { id, campo, valor }
  const [editValues, setEditValues] = useState({})
  const [modalImport, setModalImport] = useState(null) // { rows, fileName }
  const [modoImport, setModoImport] = useState('replace')
  const [confirmReplace, setConfirmReplace] = useState(false)

  const fmt = (n) => n != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n) : '-'
  const fmtN = (n) => n != null ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-'

  // Cargar filtros y registros al montar
  useEffect(() => { if (contratoId) { cargarFiltros(); cargarRegistros({capitulo:'',item:'',tramo:'',calzada:''}) } }, [contratoId])

  async function cargarFiltros(params = {}) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${API}/presupuesto/${contratoId}/filtros${qs ? '?' + qs : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setFiltros(await res.json())
  }

  async function cargarRegistros(params = sel) {
    if (!contratoId) return
    setLoading(true)
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString()
    const res = await fetch(`${API}/presupuesto/${contratoId}${qs ? '?' + qs : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setRegistros(await res.json())
    setLoading(false)
  }

  async function cambiarFiltro(campo, valor) {
    const nuevoSel = { ...sel, [campo]: valor }
    // Cascada: al cambiar capitulo resetear item/tramo/calzada
    if (campo === 'capitulo') { nuevoSel.item = ''; nuevoSel.tramo = ''; nuevoSel.calzada = '' }
    if (campo === 'item') { nuevoSel.tramo = ''; nuevoSel.calzada = '' }
    setSel(nuevoSel)
    await cargarFiltros(Object.fromEntries(Object.entries(nuevoSel).filter(([,v]) => v)))
    await cargarRegistros(nuevoSel)
  }

  // Leer CSV y mostrar modal de confirmación
  async function handleImportCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const raw = await file.text()
    const text = raw.replace(/^\uFEFF/, '') // quitar BOM si existe
    const firstLine = text.split(/\r?\n/)[0]
    const sep = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ','
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())

    const MAP = {
      'pk_id': 'pk_id', 'capitulo': 'capitulo', 'competencia': 'competencia',
      'item': 'item', 'descripción': 'descripcion', 'descripcion': 'descripcion',
      'und': 'und', 'calzada': 'calzada', 'tramo': 'tramo',
      'abs. inicio': 'abs_inicio', 'abs. final': 'abs_final',
      'vlr unitario': 'vlr_unitario', 'no. inicio': 'no_inicio', 'no. final': 'no_final',
      'area/long/nod': 'area_long_nod', 'ancho': 'ancho', 'espesor': 'espesor',
      'cant.total': 'cant_total', 'costo directo': 'costo_directo',
      'tipo de ejecución': 'tipo_ejecucion', 'tipo de entidad': 'tipo_entidad',
      'id_pol': 'id_pol', 'observación': 'observacion', 'observacion': 'observacion',
      'enthandle': 'ent_handle', 'txthandle': 'txt_handle',
      'layerent': 'layer_ent', 'layertxt': 'layer_txt',
      'colorhex': 'color_hex', 'guid': 'guid',
      'x_label (este)': 'x_label', 'y_label (norte)': 'y_label',
      'revisado (true/false)': 'revisado', 'observación externa': 'observacion_externa',
    }
    const NUMS = new Set(['vlr_unitario','no_inicio','no_final','area_long_nod','ancho','espesor','cant_total','costo_directo','x_label','y_label'])

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(sep).map(v => v.replace(/^"|"$/g, '').trim())
      const obj = {}
      headers.forEach((h, idx) => {
        const key = MAP[h.toLowerCase()]
        if (!key) return
        const v = vals[idx] || ''
        if (NUMS.has(key)) { const n = parseFloat(v.replace(/[,$]/g, '')); obj[key] = isNaN(n) ? null : n }
        else obj[key] = v || null
      })
      if (obj.pk_id || obj.item) rows.push(obj)
    }
    setModalImport({ rows, fileName: file.name })
    setModoImport('replace')
    setConfirmReplace(false)
    e.target.value = ''
  }

  async function ejecutarImport() {
    if (!modalImport) return
    if (modoImport === 'replace' && !confirmReplace) { setConfirmReplace(true); return }
    const { rows } = modalImport
    setModalImport(null); setImporting(true); setImportProgreso(0)
    const BATCH = 500
    const total = Math.ceil(rows.length / BATCH)
    let ok = true; let msj = ''
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const isFirst = i === 0
      const mode = isFirst ? modoImport : 'append'
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
    if (ok) { await cargarFiltros(); await cargarRegistros({capitulo:'',item:'',tramo:'',calzada:''}) }
    setTimeout(() => setImportMsg(''), 5000)
  }

  // Selección múltiple
  function toggleSel(id) {
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodos() {
    setSeleccionados(prev => prev.size === registros.length ? new Set() : new Set(registros.map(r => r.id)))
  }

  // Edición inline
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
      const NUMS = ['area_long_nod','ancho','espesor','vlr_unitario']
      body[k] = NUMS.includes(k) ? parseFloat(v) : v
    })
    const res = await fetch(`${API}/presupuesto/item/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (res.ok) {
      setEditando(null)
      await cargarRegistros()
    }
  }

  const REVISADO_OPTS = ['Pendiente', 'Verificar Campo', 'Verificado']
  const estadoColor = (r) => r === 'Verificado' ? '#16A34A' : r === 'Verificar Campo' ? '#D97706' : '#6B7280'

  const thStyle = { padding: '8px 10px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', color: t.textMuted, borderBottom: `1px solid ${t.border}`, textAlign: 'left', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '7px 10px', fontSize: '12px', borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle' }

  return (
    <div>
      {/* Modal importar */}
      {modalImport && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'28px', width:'420px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'16px', fontWeight:'700', color:t.primary, marginBottom:'8px' }}>📂 Importar Presupuesto</div>
            <div style={{ fontSize:'13px', color:t.textMuted, marginBottom:'20px' }}>{modalImport.fileName} — <strong style={{color:t.text}}>{modalImport.rows.length} registros</strong></div>
            <div style={{ fontSize:'13px', fontWeight:'600', color:t.text, marginBottom:'10px' }}>¿Cómo desea cargar los datos?</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'20px' }}>
              {[['replace','🔄 Reemplazar todo','Elimina los registros actuales y carga los nuevos'],['append','➕ Agregar','Agrega los nuevos registros sin eliminar los existentes']].map(([v,l,d]) => (
                <label key={v} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px', border:`2px solid ${modoImport===v?t.primary:t.border}`, borderRadius:'8px', cursor:'pointer', background:modoImport===v?t.primary+'11':'transparent' }}>
                  <input type="radio" name="modo" value={v} checked={modoImport===v} onChange={() => { setModoImport(v); setConfirmReplace(false) }} style={{ marginTop:'2px' }} />
                  <div><div style={{ fontSize:'13px', fontWeight:'600', color:t.text }}>{l}</div><div style={{ fontSize:'11px', color:t.textMuted }}>{d}</div></div>
                </label>
              ))}
            </div>
            {modoImport === 'replace' && confirmReplace && (
              <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:'8px', padding:'12px', marginBottom:'16px', fontSize:'12px', color:'#DC2626' }}>
                ⚠️ <strong>Esta acción no se puede deshacer.</strong> Se eliminarán todos los registros actuales del presupuesto. ¿Confirma?
              </div>
            )}
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => { setModalImport(null); setConfirmReplace(false) }} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'9px 18px', fontSize:'13px', color:t.textMuted, cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarImport} style={{ background: modoImport==='replace'&&confirmReplace ? '#DC2626' : t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
                {modoImport==='replace' && !confirmReplace ? 'Continuar →' : modoImport==='replace' ? '⚠️ Sí, reemplazar' : '➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <label style={{ background: t.primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.7 : 1 }}>
          {importing ? `Importando ${importProgreso}%...` : '📂 Importar CSV'}
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} disabled={importing} />
        </label>
        {importing && (
          <div style={{ flex:1, maxWidth:'200px', height:'6px', background:t.border, borderRadius:'3px', overflow:'hidden' }}>
            <div style={{ width:`${importProgreso}%`, height:'100%', background:t.primary, borderRadius:'3px', transition:'width 0.3s' }} />
          </div>
        )}
        {importMsg && <span style={{ fontSize: '13px', color: importMsg.startsWith('✅') ? '#16A34A' : importMsg.startsWith('❌') ? '#DC2626' : t.textMuted }}>{importMsg}</span>}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: t.textMuted }}>{registros.length} registros · {seleccionados.size} seleccionados</span>
      </div>

      {/* Filtros en cascada */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          ['capitulo', 'Capítulo', filtros.capitulos],
          ['item', 'Ítem', filtros.items],
          ['tramo', 'Tramo', filtros.tramos],
          ['calzada', 'Calzada', filtros.calzadas],
        ].map(([campo, label, opciones]) => (
          <div key={campo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', color: t.textMuted, letterSpacing: '0.5px' }}>{label}</label>
            <select value={sel[campo]} onChange={e => cambiarFiltro(campo, e.target.value)}
              style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '7px 12px', color: t.text, fontSize: '13px', minWidth: '160px', cursor: 'pointer' }}>
              <option value="">— Todos —</option>
              {opciones.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {(sel.capitulo||sel.item||sel.tramo||sel.calzada) && (
          <button onClick={() => { setSel({capitulo:'',item:'',tramo:'',calzada:''}); cargarFiltros(); cargarRegistros({capitulo:'',item:'',tramo:'',calzada:''}) }}
            style={{ alignSelf: 'flex-end', background: 'transparent', border: `1px solid ${t.border}`, borderRadius: '6px', padding: '7px 12px', fontSize: '12px', color: t.textMuted, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: '12px', overflow: 'auto', boxShadow: t.shadow }}>
        {loading ? (
          <div style={s.emptyState}>Cargando...</div>
        ) : registros.length === 0 ? (
          <div style={s.emptyState}>📂 {sel.capitulo ? 'Sin registros para los filtros seleccionados' : 'Importa un CSV o selecciona un capítulo'}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead style={{ background: t.bg }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={seleccionados.size === registros.length && registros.length > 0} onChange={toggleTodos} /></th>
                <th style={thStyle}>PK_ID</th>
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
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {registros.map(r => {
                const isEdit = editando === r.id
                return (
                  <tr key={r.id} style={{ background: seleccionados.has(r.id) ? (t.primary + '18') : 'transparent' }}
                    onClick={() => !isEdit && toggleSel(r.id)}>
                    <td style={tdStyle} onClick={e => e.stopPropagation()}><input type="checkbox" checked={seleccionados.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: t.primary }}>{r.pk_id || r.id_pol || '-'}</td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.capitulo} onChange={e => setEditValues({...editValues,capitulo:e.target.value})}
                        style={{ width: '120px', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : r.capitulo}
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.item} onChange={e => setEditValues({...editValues,item:e.target.value})}
                        style={{ width: '80px', background: t.inputBg, border: `1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : r.item}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: '220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.descripcion}</td>
                    <td style={tdStyle}>{r.und}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>{fmtN(r.no_inicio)}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>{fmtN(r.no_final)}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.area_long_nod} onChange={e => setEditValues({...editValues,area_long_nod:e.target.value})}
                        style={{ width:'80px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmtN(r.area_long_nod)}
                    </td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.ancho} onChange={e => setEditValues({...editValues,ancho:e.target.value})}
                        style={{ width:'70px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmtN(r.ancho)}
                    </td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.espesor} onChange={e => setEditValues({...editValues,espesor:e.target.value})}
                        style={{ width:'70px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmtN(r.espesor)}
                    </td>
                    <td style={{ ...tdStyle, textAlign:'right', fontWeight:'600' }}>{fmtN(r.cant_total)}</td>
                    <td style={{ ...tdStyle, textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.vlr_unitario} onChange={e => setEditValues({...editValues,vlr_unitario:e.target.value})}
                        style={{ width:'90px', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'12px' }} onClick={e=>e.stopPropagation()} />
                        : fmt(r.vlr_unitario)}
                    </td>
                    <td style={{ ...tdStyle, textAlign:'right', fontWeight:'700', color: t.primary }}>{fmt(r.costo_directo)}</td>
                    <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                      {isEdit ? (
                        <select value={editValues.revisado} onChange={e => setEditValues({...editValues,revisado:e.target.value})}
                          style={{ background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'3px 6px', color:t.text, fontSize:'11px' }}>
                          {REVISADO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize:'11px', fontWeight:'600', color: estadoColor(r.revisado), background: estadoColor(r.revisado)+'22', borderRadius:'4px', padding:'2px 8px' }}>
                          {r.revisado || 'Pendiente'}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                      {isEdit ? (
                        <div style={{ display:'flex', gap:'4px' }}>
                          <button onClick={() => guardarEdicion(r.id)} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'4px', padding:'4px 10px', fontSize:'11px', cursor:'pointer' }}>✓</button>
                          <button onClick={() => setEditando(null)} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'4px 8px', fontSize:'11px', cursor:'pointer', color:t.textMuted }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => iniciarEdicion(r)} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'4px 8px', fontSize:'11px', cursor:'pointer', color:t.textMuted }}>✏️</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── MÓDULO COBRO ─────────────────────────────────────────────────────────────
function ModuloCobro({ t, usuario, token, s }) {
  const API = 'https://claracore-backend.azurewebsites.net'
  const contratoId = usuario?.contrato_id

  const [registros, setRegistros] = useState([])
  const [filtros, setFiltros] = useState({ capitulos:[], items:[], actas:[], calzadas:[] })
  const [sel, setSel] = useState({ capitulo:'', item:'', acta:'', calzada:'' })
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [modalImport, setModalImport] = useState(null)
  const [modoImport, setModoImport] = useState('append')
  const [confirmReplace, setConfirmReplace] = useState(false)

  const fmt = (n) => n != null ? new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(n) : '$0'

  useEffect(() => { if (contratoId) cargarFiltros() }, [contratoId])

  async function cargarFiltros(params = {}) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${API}/cobro/${contratoId}/filtros${qs?'?'+qs:''}`, { headers: { Authorization:`Bearer ${token}` } })
    if (res.ok) setFiltros(await res.json())
  }

  async function cargarRegistros(params = sel) {
    setLoading(true)
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString()
    const res = await fetch(`${API}/cobro/${contratoId}${qs?'?'+qs:''}`, { headers: { Authorization:`Bearer ${token}` } })
    if (res.ok) setRegistros(await res.json())
    setLoading(false)
  }

  async function cambiarFiltro(campo, valor) {
    const nuevoSel = { ...sel, [campo]: valor }
    if (campo === 'capitulo') { nuevoSel.item=''; nuevoSel.calzada='' }
    setSel(nuevoSel)
    await cargarFiltros(Object.fromEntries(Object.entries(nuevoSel).filter(([,v]) => v)))
    await cargarRegistros(nuevoSel)
  }

  async function handleImportCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    const sep = (text.split('\n')[0].match(/;/g)||[]).length > (text.split('\n')[0].match(/,/g)||[]).length ? ';' : ','
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g,'').trim().toUpperCase())
    const MAP = {
      'ACTA RPO':'acta','ACTA':'acta','SEMANA':'semana','FECHA':'fecha',
      'CAPITULO':'capitulo','COMPETENCIA':'competencia',
      'ABS INCIAL':'abs_inicial','ABS INICIAL':'abs_inicial','ABS FINAL':'abs_final',
      'CIV':'civ','ITEM':'item','DESCRIPCION':'descripcion','DESCRIPCIÓN':'descripcion',
      'UND':'und','LONGITUD':'longitud','ANCHO':'ancho','ESPESOR':'espesor',
      'CANTIDAD':'cantidad','VALOR UNITARIO':'valor_unitario','COSTO DIRECTO':'costo_directo',
      'CALZADA':'calzada','TRAMO INICIO':'tramo_inicio','TRAMO FINAL':'tramo_final','PK_ID':'pk_id'
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
    setModoImport('append')
    setConfirmReplace(false)
    e.target.value = ''
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
      const res = await fetch(`${API}/cobro/${contratoId}/bulk?mode=${mode}`, {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify(batch)
      })
      if (!res.ok) { const d = await res.json(); msj = `❌ Error: ${d.detail}`; ok = false; break }
      setImportProgreso(Math.round(((i + BATCH) / rows.length) * 100))
    }
    if (ok) msj = `✅ ${rows.length} registros ${modoImport === 'replace' ? 'cargados' : 'agregados'}`
    setImportMsg(msj); setImporting(false); setImportProgreso(0)
    if (ok) { await cargarFiltros() }
    setTimeout(() => setImportMsg(''), 5000)
  }

  const thStyle = { padding:'8px 10px', fontSize:'11px', fontWeight:'700', letterSpacing:'0.5px', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'7px 10px', fontSize:'12px', borderBottom:`1px solid ${t.border}` }

  return (
    <div>
      {/* Modal importar */}
      {modalImport && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px', padding:'28px', width:'420px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'16px', fontWeight:'700', color:t.primary, marginBottom:'8px' }}>📂 Importar Cobro</div>
            <div style={{ fontSize:'13px', color:t.textMuted, marginBottom:'20px' }}>{modalImport.fileName} — <strong style={{color:t.text}}>{modalImport.rows.length} registros</strong></div>
            <div style={{ fontSize:'13px', fontWeight:'600', color:t.text, marginBottom:'10px' }}>¿Cómo desea cargar los datos?</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'20px' }}>
              {[['append','➕ Agregar acta','Agrega los registros sin eliminar los existentes (recomendado para nuevas actas)'],['replace','🔄 Reemplazar todo','Elimina todos los registros actuales y carga los nuevos']].map(([v,l,d]) => (
                <label key={v} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'12px', border:`2px solid ${modoImport===v?t.primary:t.border}`, borderRadius:'8px', cursor:'pointer', background:modoImport===v?t.primary+'11':'transparent' }}>
                  <input type="radio" name="modoCobro" value={v} checked={modoImport===v} onChange={() => { setModoImport(v); setConfirmReplace(false) }} style={{ marginTop:'2px' }} />
                  <div><div style={{ fontSize:'13px', fontWeight:'600', color:t.text }}>{l}</div><div style={{ fontSize:'11px', color:t.textMuted }}>{d}</div></div>
                </label>
              ))}
            </div>
            {modoImport === 'replace' && confirmReplace && (
              <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:'8px', padding:'12px', marginBottom:'16px', fontSize:'12px', color:'#DC2626' }}>
                ⚠️ <strong>Esta acción no se puede deshacer.</strong> Se eliminarán todos los registros de cobro. ¿Confirma?
              </div>
            )}
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => { setModalImport(null); setConfirmReplace(false) }} style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'9px 18px', fontSize:'13px', color:t.textMuted, cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarImport} style={{ background: modoImport==='replace'&&confirmReplace ? '#DC2626' : t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
                {modoImport==='replace' && !confirmReplace ? 'Continuar →' : modoImport==='replace' ? '⚠️ Sí, reemplazar' : '➕ Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', gap:'12px', alignItems:'center', marginBottom:'16px', flexWrap:'wrap' }}>
        <label style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'8px', padding:'9px 18px', fontSize:'13px', fontWeight:'600', cursor:importing?'wait':'pointer', opacity:importing?0.7:1 }}>
          {importing ? `Importando ${importProgreso}%...` : '📂 Importar CSV'}
          <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV} disabled={importing} />
        </label>
        {importing && (
          <div style={{ flex:1, maxWidth:'200px', height:'6px', background:t.border, borderRadius:'3px', overflow:'hidden' }}>
            <div style={{ width:`${importProgreso}%`, height:'100%', background:t.primary, borderRadius:'3px', transition:'width 0.3s' }} />
          </div>
        )}
        {importMsg && <span style={{ fontSize:'13px', color:importMsg.startsWith('✅')?'#16A34A':importMsg.startsWith('❌')?'#DC2626':t.textMuted }}>{importMsg}</span>}
        <span style={{ marginLeft:'auto', fontSize:'12px', color:t.textMuted }}>{registros.length} registros mostrados</span>
      </div>

      {/* Filtros en cascada */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap' }}>
        {[['capitulo','Capítulo',filtros.capitulos],['item','Ítem',filtros.items],['acta','Acta',filtros.actas],['calzada','Calzada',filtros.calzadas]].map(([campo,label,opciones]) => (
          <div key={campo} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            <label style={{ fontSize:'11px', fontWeight:'600', color:t.textMuted, letterSpacing:'0.5px' }}>{label}</label>
            <select value={sel[campo]} onChange={e => cambiarFiltro(campo, e.target.value)}
              style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'6px', padding:'7px 12px', color:t.text, fontSize:'13px', minWidth:'130px', cursor:'pointer' }}>
              <option value="">— Todos —</option>
              {opciones.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {(sel.capitulo||sel.item||sel.acta||sel.calzada) && (
          <button onClick={() => { setSel({capitulo:'',item:'',acta:'',calzada:''}); cargarFiltros(); setRegistros([]) }}
            style={{ alignSelf:'flex-end', background:'transparent', border:`1px solid ${t.border}`, borderRadius:'6px', padding:'7px 12px', fontSize:'12px', color:t.textMuted, cursor:'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'12px', overflow:'auto', boxShadow:t.shadow }}>
        {loading ? <div style={s.emptyState}>Cargando...</div> : registros.length === 0 ? (
          <div style={s.emptyState}>📂 {filtros.actas.length ? 'Selecciona un filtro para ver registros' : 'Importa un CSV de cobro para comenzar'}</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ background:t.bg }}>
              <tr>
                {['Acta','PK_ID','Capítulo','Ítem','Descripción','Und','Cantidad','Vlr Unit.','Costo Directo','Calzada','Tramo Ini'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((r,i) => (
                <tr key={r.id || i}>
                  <td style={{ ...tdStyle, fontWeight:'700', color:t.primary }}>{r.acta}</td>
                  <td style={{ ...tdStyle, fontWeight:'600' }}>{r.pk_id}</td>
                  <td style={tdStyle}>{r.capitulo}</td>
                  <td style={tdStyle}>{r.item}</td>
                  <td style={{ ...tdStyle, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.descripcion}</td>
                  <td style={tdStyle}>{r.und}</td>
                  <td style={{ ...tdStyle, textAlign:'right' }}>{r.cantidad}</td>
                  <td style={{ ...tdStyle, textAlign:'right' }}>{fmt(r.valor_unitario)}</td>
                  <td style={{ ...tdStyle, textAlign:'right', fontWeight:'700', color:t.primary }}>{fmt(r.costo_directo)}</td>
                  <td style={tdStyle}>{r.calzada}</td>
                  <td style={tdStyle}>{r.tramo_inicio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ t, activeTheme, themeMode, onTheme, usuario, setUsuario, onLogout, topOffset = 0 }) {
  const [moduloActivo, setModuloActivo] = useState('dashboard')
  const [tabInferior, setTabInferior] = useState('gantt')
  const [analisis, setAnalisis] = useState('financiero')
  const [showModalContrato, setShowModalContrato] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [nuevoContrato, setNuevoContrato] = useState({ numero: '', objeto: '', contratista: '', nit: '' })
  const [csvData, setCsvData] = useState(null)
  const [csvNombre, setCsvNombre] = useState('')
  const [savingContrato, setSavingContrato] = useState(false)
  const [errorContrato, setErrorContrato] = useState('')
  const [kpiPpto, setKpiPpto] = useState(null)
  const [kpiCobro, setKpiCobro] = useState(null)

  const API_URL = 'https://claracore-backend.azurewebsites.net'
  const contratoIdDash = usuario?.contrato_id

  useEffect(() => {
    if (!contratoIdDash) return
    const tok = getToken()
    fetch(`${API_URL}/presupuesto/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiPpto(d) })
    fetch(`${API_URL}/cobro/${contratoIdDash}/resumen`, { headers: { Authorization:`Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null).then(d => { if(d) setKpiCobro(d) })
  }, [contratoIdDash])

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

      <div style={s.body}>
        <div style={s.topBar}>
          {usuario?._contratos?.length > 1 ? (
            <select
              value={usuario.contrato_id || ''}
              onChange={async (e) => {
                const cid = parseInt(e.target.value)
                const contrato = usuario._contratos.find(c => c.id === cid)
                if (!contrato) return
                const u = { ...usuario, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista || usuario.logo_contratista, logo_interventoria: contrato.logo_interventoria || usuario.logo_interventoria }
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

        {/* ── Tabs de módulo ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `2px solid ${t.border}`, paddingBottom: '0' }}>
          {[['dashboard','🏠 Dashboard'],['presupuesto','📋 Presupuesto'],['cobro','💰 Cobro']].map(([key,label]) => (
            <button key={key} onClick={() => setModuloActivo(key)} style={{
              background: 'transparent', border: 'none', borderBottom: moduloActivo === key ? `3px solid ${t.primary}` : '3px solid transparent',
              color: moduloActivo === key ? t.primary : t.textMuted, fontWeight: moduloActivo === key ? '700' : '400',
              fontSize: '14px', padding: '8px 20px', cursor: 'pointer', marginBottom: '-2px', transition: 'all 0.2s'
            }}>{label}</button>
          ))}
        </div>
        {/* ── MÓDULO DASHBOARD ── */}
        {moduloActivo === 'dashboard' && <>
        <div style={s.panelsGrid}>
          {(() => {
            const fmtD = (n) => n != null ? new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(n) : '—'
            return [
              ['📋 PRESUPUESTO', kpiPpto ? fmtD(kpiPpto.costo_total) : '—', kpiPpto ? `${kpiPpto.total_registros} registros` : 'Sin datos'],
              ['💰 COBRO', kpiCobro ? fmtD(kpiCobro.total_cobrado) : '—', kpiCobro ? `${kpiCobro.consumo_pct}% consumo · ${kpiCobro.actas?.length || 0} actas` : 'Sin datos'],
              ['🏪 ALMACÉN', '$0', 'Próximamente'],
            ].map(([label, value, sub]) => (
              <div key={label} style={s.card}>
                <div style={s.cardLabel}>{label}</div>
                <div style={s.cardValue}>{value}</div>
                <div style={s.cardSub}>{sub}</div>
              </div>
            ))
          })()}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[['financiero', 'Presupuesto vs Cobro — Análisis Financiero'],
            ['pedidos', 'Presupuesto vs Almacén — Análisis de Pedidos'],
            ['consumo', 'Cobro vs Almacén — Análisis de Consumo']].map(([key, label]) => (
            <button key={key} style={s.analisisBtn(key)} onClick={() => setAnalisis(key)}>{label}</button>
          ))}
        </div>

        <div style={s.table}>
          <div style={s.tableHeader}>
            <span>Ítem / Descripción</span><span>Presupuesto</span><span>Cobrado</span><span>Delta</span><span>Estado</span>
          </div>
          <div style={s.emptyState}>📂 Importa un archivo Excel para ver el análisis comparativo</div>
        </div>

        <div style={s.bottomPanel}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button style={s.tab('gantt')} onClick={() => setTabInferior('gantt')}>📅 Programación / Gantt</button>
            <button style={s.tab('mapa')} onClick={() => setTabInferior('mapa')}>🗺️ Plano Semáforo</button>
          </div>
          <div style={s.emptyState}>
            {tabInferior === 'gantt' ? '📅 Diagrama Gantt — próximamente' : '🗺️ Plano Semáforo — próximamente'}
          </div>
        </div>
        </>}

        {/* ── MÓDULO PRESUPUESTO ── */}
        {moduloActivo === 'presupuesto' && <ModuloPresupuesto t={t} usuario={usuario} token={getToken()} s={s} />}

        {/* ── MÓDULO COBRO ── */}
        {moduloActivo === 'cobro' && <ModuloCobro t={t} usuario={usuario} token={getToken()} s={s} />}

      </div>

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
        setUsuario(uConContratos); setModal(null)
      }
    } catch {
      setUsuario(u); setModal(null)
    }
  }

  async function handleSeleccionarContrato(contratoId) {
    const contrato = pendingContratos.find(c => c.id === parseInt(contratoId))
    const u = { ...pendingUser, contrato_id: contrato.id, contrato_numero: contrato.numero, logo_contratista: contrato.logo_contratista || pendingUser.logo_contratista, logo_interventoria: contrato.logo_interventoria || pendingUser.logo_interventoria }
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
