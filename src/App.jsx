import { useState, useEffect } from 'react'
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
      onLoginOk(data.usuario)
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
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleEnviar() {
    if (!email) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false); setSent(true)
  }

  if (sent) return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
        <h2 style={{ color: t.primary, margin: '0 0 12px', fontSize: '20px' }}>Correo enviado</h2>
        <p style={{ color: t.textMuted, fontSize: '14px', lineHeight: '1.6' }}>
          Si el correo <strong>{email}</strong> está registrado, recibirás las instrucciones para restablecer tu contraseña.
        </p>
        <button onClick={onClose} style={{ marginTop: '24px', background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 32px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>Aceptar</button>
      </div>
    </Modal>
  )

  return (
    <Modal t={t} onClose={onClose} width="400px">
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔑</div>
        <h2 style={{ color: t.primary, margin: 0, fontSize: '22px', fontWeight: '800' }}>Olvidé mi Contraseña</h2>
        <p style={{ color: t.textMuted, margin: '8px 0 0', fontSize: '13px' }}>Te enviaremos un enlace de restablecimiento</p>
      </div>
      <Field label="CORREO ELECTRÓNICO" t={t} type="email" placeholder="tu@correo.com"
        value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleEnviar()} />
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: `1.5px solid ${t.border}`, borderRadius: '10px', padding: '12px', color: t.textMuted, fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleEnviar} disabled={loading || !email} style={{ flex: 2, background: t.primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: (!email || loading) ? 'not-allowed' : 'pointer', opacity: (!email || loading) ? 0.6 : 1 }}>
          {loading ? 'Enviando...' : 'Enviar Enlace'}
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ t, activeTheme, themeMode, onTheme, usuario, onLogout }) {
  const [tabInferior, setTabInferior] = useState('gantt')
  const [analisis, setAnalisis] = useState('financiero')
  const [showModalContrato, setShowModalContrato] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [nuevoContrato, setNuevoContrato] = useState({ numero: '', objeto: '', contratista: '', nit: '' })
  const [csvData, setCsvData] = useState(null)
  const [csvNombre, setCsvNombre] = useState('')
  const [savingContrato, setSavingContrato] = useState(false)
  const [errorContrato, setErrorContrato] = useState('')

  // Desarrollador ve todo; otros usuarios ven solo su contrato
  const esDeveloper = usuario?.cargo_nombre === 'Desarrollador'
  const canAdmin = esDeveloper || usuario?.cargo_nombre === 'Administrador'

  const s = {
    app: { fontFamily: "'Segoe UI', sans-serif", background: t.bg, minHeight: '100vh', color: t.text },
    header: { background: t.headerBg, borderBottom: `1px solid ${t.border}`, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: t.shadow },
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
        <img src="/CLARA.CORE.png" alt="ClaraCore" style={{ height: '40px', filter: activeTheme === 'dark' ? 'brightness(0) invert(1)' : 'none' }} />
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
          <span style={{ fontSize: '13px', color: t.textMuted }}>
            📋 Contrato: {usuario?.contrato_numero || (esDeveloper ? 'Todos los contratos' : 'Sin asignar')}
          </span>
          {/* Solo Desarrollador puede crear nuevos contratos */}
          {esDeveloper && (
            <button style={s.btnCrear} onClick={() => setShowModalContrato(true)}>＋ Crear Contrato</button>
          )}
        </div>

        <div style={s.panelsGrid}>
          {[['📋 PRESUPUESTO', '$181,927,908', 'Valor inicial del contrato'],
            ['💰 COBRO', '$138,023,945', 'Acumulado facturado'],
            ['🏪 ALMACÉN', '$0', 'Próximamente']].map(([label, value, sub]) => (
            <div key={label} style={s.card}>
              <div style={s.cardLabel}>{label}</div>
              <div style={s.cardValue}>{value}</div>
              <div style={s.cardSub}>{sub}</div>
            </div>
          ))}
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

  function handleLoginOk(u) {
    setUsuario(u); setModal(null)
  }

  function handleLogout() {
    localStorage.removeItem('cc_token'); localStorage.removeItem('cc_usuario')
    sessionStorage.removeItem('cc_token'); sessionStorage.removeItem('cc_usuario')
    setUsuario(null)
  }

  if (usuario) return (
    <Dashboard t={t} activeTheme={activeTheme} themeMode={themeMode}
      onTheme={handleTheme} usuario={usuario} onLogout={handleLogout} />
  )

  return (
    <>
      <LandingPage t={t} activeTheme={activeTheme} themeMode={themeMode}
        onTheme={handleTheme}
        onLogin={() => setModal('login')}
        onRegistro={() => setModal('registro')}
        onOlvide={() => setModal('olvide')} />
      {modal === 'login' && <ModalLogin t={t} onClose={() => setModal(null)} onLoginOk={handleLoginOk} onForgot={() => setModal('olvide')} />}
      {modal === 'registro' && <ModalCrearCuenta t={t} onClose={() => setModal(null)} />}
      {modal === 'olvide' && <ModalOlvide t={t} onClose={() => setModal(null)} />}
    </>
  )
}
