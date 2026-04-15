import { useState, useEffect } from 'react'

const API_ANTHROPIC = 'https://claracore-backend.azurewebsites.net/frase-del-dia'

// ─── Escala de fuentes — sincronizada con FONT_SIZES de App.jsx ───────────────
const FS = {
  pequena: { base: '11px', titulo: '18px', stat: '18px', card: '12px', badge: '9px', autor: '10px' },
  normal:  { base: '13px', titulo: '22px', stat: '22px', card: '13px', badge: '10px', autor: '11px' },
  grande:  { base: '15px', titulo: '26px', stat: '26px', card: '15px', badge: '11px', autor: '12px' },
}

// ─── Novedades — edita este array para publicar nuevas entradas ───────────────
const NOVEDADES = [
  {
    id: 1,
    tipo: 'actualización',
    titulo: 'Filtros avanzados en SICOE Obra',
    resumen: 'Ahora puedes combinar hasta 13 filtros simultáneos en la grilla de reportes: validación, acta, capítulo, ítem, tramo, costado, abscisas y más.',
    fecha: '2026-04-15',
    autor: 'Equipo ClaraCore',
    icono: '🔍',
    color: '#00B4C6',
  },
  {
    id: 2,
    tipo: 'mejora',
    titulo: 'Panel dinámico con permisos por perfil',
    resumen: 'Los perfiles Operativo Contratista e Interventoría ya no ven valores financieros en el panel de análisis. La información se adapta al rol de cada usuario.',
    fecha: '2026-04-15',
    autor: 'Equipo ClaraCore',
    icono: '🔐',
    color: '#10B981',
  },
  {
    id: 3,
    tipo: 'corrección',
    titulo: 'Abscisado y nodos en hoja de registro',
    resumen: 'Los campos de Abs. Inicio, Abs. Final, Nodo Inicio y Nodo Final ahora se visualizan correctamente en cada hoja de registro de SICOE Obra.',
    fecha: '2026-04-14',
    autor: 'Equipo ClaraCore',
    icono: '📍',
    color: '#F59E0B',
  },
  {
    id: 4,
    tipo: 'actualización',
    titulo: 'Contador de registros en grilla de reportes',
    resumen: 'La columna REGS. en la grilla ahora muestra el número exacto de registros asociados a cada reporte de cantidades.',
    fecha: '2026-04-13',
    autor: 'Equipo ClaraCore',
    icono: '📊',
    color: '#8B5CF6',
  },
]

const TIPO_LABEL = {
  'actualización': { label: 'Actualización', bg: '#00B4C622', color: '#00B4C6' },
  'mejora':        { label: 'Mejora',        bg: '#10B98122', color: '#10B981' },
  'corrección':    { label: 'Corrección',    bg: '#F59E0B22', color: '#F59E0B' },
  'aviso':         { label: 'Aviso',         bg: '#EF444422', color: '#EF4444' },
}

function fmtFecha(iso) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function hoyISO() {
  return new Date().toISOString().split('T')[0]
}

// ─── Tarjeta de novedad ────────────────────────────────────────────────────────
function TarjetaNovedad({ novedad, t, fs, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  const [hover, setHover]     = useState(false)
  const tipo = TIPO_LABEL[novedad.tipo] || TIPO_LABEL['aviso']

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.bgCard,
        border: `1px solid ${hover ? novedad.color + '66' : t.border}`,
        borderRadius: '12px',
        padding: '14px 18px',
        transition: 'all 0.3s ease',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        boxShadow: hover ? `0 6px 24px ${novedad.color}22` : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: hover ? '4px' : '3px',
        background: novedad.color, borderRadius: '12px 0 0 12px',
        transition: 'width 0.3s',
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          fontSize: '18px', lineHeight: 1,
          background: novedad.color + '18',
          borderRadius: '8px', padding: '8px', flexShrink: 0,
        }}>
          {novedad.icono}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: fs.badge, fontWeight: '700', letterSpacing: '0.6px',
              textTransform: 'uppercase', padding: '2px 7px', borderRadius: '20px',
              background: tipo.bg, color: tipo.color,
            }}>{tipo.label}</span>
            <span style={{ fontSize: fs.badge, color: t.textMuted }}>{fmtFecha(novedad.fecha)}</span>
          </div>
          <div style={{ fontSize: fs.card, fontWeight: '700', color: t.text, marginBottom: '4px', lineHeight: 1.3 }}>
            {novedad.titulo}
          </div>
          <div style={{ fontSize: fs.base, color: t.textMuted, lineHeight: 1.55 }}>
            {novedad.resumen}
          </div>
          <div style={{ marginTop: '6px', fontSize: fs.autor, color: t.textMuted, opacity: 0.6 }}>
            — {novedad.autor}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icono, valor, label, color, t, fs, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: '10px', padding: '12px 14px', textAlign: 'center',
      transition: 'all 0.4s ease',
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      opacity: visible ? 1 : 0,
    }}>
      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{icono}</div>
      <div style={{ fontSize: fs.stat, fontWeight: '800', color, marginBottom: '1px' }}>{valor}</div>
      <div style={{ fontSize: fs.autor, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

// ─── Frase del día ────────────────────────────────────────────────────────────
function FraseDelDia({ t, fs, usuario }) {
  const storageKey = `claracore_frase_${usuario?.id || 'guest'}`
  const [estado, setEstado]   = useState('idle')
  const [frase, setFrase]     = useState(null)
  const [visible, setVisible] = useState(false)
  
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (guardado?.rechazado) return
      if (guardado?.frase && guardado?.fecha === hoyISO()) {
        setFrase(guardado.frase)
        setEstado('visible')
        setTimeout(() => setVisible(true), 200)
        return
      }
      if (guardado?.aceptado) { generarFrase(); return }
    } catch {}
    setTimeout(() => setEstado('pregunta'), 600)
  }, [])

  const generarFrase = async () => {
    setEstado('cargando')
    const hora  = new Date().getHours()
    const turno = hora < 12 ? 'mañana' : hora < 18 ? 'tarde' : 'noche'
    const dia   = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    try {
      const token = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
      const res = await fetch(API_ANTHROPIC, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre: usuario?.nombre || '', turno, dia })
      })
      const data = await res.json()
      const texto = data.content?.[0]?.text || ''
      const parsed = JSON.parse(texto.replace(/```json|```/g, '').trim())
      setFrase(parsed)
      setEstado('visible')
      setTimeout(() => setVisible(true), 100)
      localStorage.setItem(storageKey, JSON.stringify({ aceptado: true, fecha: hoyISO(), frase: parsed }))
    } catch {
      setEstado('error')
    }
  }

  const aceptar  = () => { localStorage.setItem(storageKey, JSON.stringify({ aceptado: true, fecha: hoyISO() })); generarFrase() }
  const rechazar = () => { localStorage.setItem(storageKey, JSON.stringify({ rechazado: true })); setEstado('idle') }

  const TIPO_COLOR = { reflexiva: '#8B5CF6', motivadora: '#10B981', 'bíblica': '#F59E0B' }
  const TIPO_ICONO = { reflexiva: '💡', motivadora: '🚀', 'bíblica': '📖' }
  const TIPO_TEXTO = { reflexiva: 'Reflexión del día', motivadora: 'Frase motivadora', 'bíblica': 'Versículo del día' }

  if (estado === 'idle') return null

  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: '12px', padding: '16px 20px', marginBottom: '20px',
    }}>
      {estado === 'pregunta' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '24px' }}>✨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: fs.card, fontWeight: '700', color: t.text, marginBottom: '3px' }}>
              ¿Deseas recibir tu frase del día?
            </div>
            <div style={{ fontSize: fs.base, color: t.textMuted }}>
              Una reflexión, frase motivadora o versículo bíblico personalizado para ti.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={aceptar} style={{
              background: t.primary, color: '#fff', border: 'none',
              borderRadius: '8px', padding: '7px 16px',
              fontSize: fs.base, fontWeight: '700', cursor: 'pointer',
            }}>Sí, quiero</button>
            <button onClick={rechazar} style={{
              background: 'transparent', color: t.textMuted,
              border: `1px solid ${t.border}`, borderRadius: '8px',
              padding: '7px 12px', fontSize: fs.base, cursor: 'pointer',
            }}>No, gracias</button>
          </div>
        </div>
      )}

      {estado === 'cargando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: '20px', display: 'inline-block', animation: 'spin 1.2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: fs.base, color: t.textMuted }}>Generando tu frase del día...</div>
        </div>
      )}

      {estado === 'error' && (
        <div style={{ fontSize: fs.base, color: t.textMuted }}>
          No se pudo generar la frase. <span onClick={generarFrase} style={{ color: t.primary, cursor: 'pointer', fontWeight: '700' }}>Reintentar</span>
        </div>
      )}

      {estado === 'visible' && frase && (
        <div style={{ transition: 'all 0.5s ease', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0 }}>
              {TIPO_ICONO[frase.tipo] || '✨'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: fs.badge, fontWeight: '700', letterSpacing: '0.6px',
                textTransform: 'uppercase', color: TIPO_COLOR[frase.tipo] || t.primary, marginBottom: '8px',
              }}>
                {TIPO_TEXTO[frase.tipo] || 'Frase del día'}
              </div>
              <div style={{
                fontSize: fs.titulo, fontWeight: '300', color: t.text,
                lineHeight: 1.5, fontStyle: 'italic', marginBottom: '8px',
              }}>
                "{frase.frase}"
              </div>
              <div style={{ fontSize: fs.autor, color: t.textMuted }}>— {frase.autor}</div>
            </div>
          </div>
          <div style={{ marginTop: '10px', textAlign: 'right' }}>
            <button onClick={generarFrase} style={{
              background: 'transparent', border: 'none',
              fontSize: fs.autor, color: t.textMuted, cursor: 'pointer', opacity: 0.6,
            }}>🔄 Generar otra</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ModuloInicio({ t, usuario, fontSize = 'normal' }) {
  const [saludoVisible, setSaludoVisible] = useState(false)
  const fs = FS[fontSize] || FS.normal

  useEffect(() => {
    const timer = setTimeout(() => setSaludoVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const hora   = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '8px 0 48px' }}>

      {/* ── Saludo ── */}
      <div style={{
        marginBottom: '20px',
        transition: 'all 0.5s ease',
        transform: saludoVisible ? 'translateY(0)' : 'translateY(-12px)',
        opacity: saludoVisible ? 1 : 0,
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${t.primary}18 0%, ${t.bgCard} 100%)`,
          border: `1px solid ${t.border}`, borderRadius: '14px',
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{ fontSize: '36px', lineHeight: 1 }}>👋</div>
          <div>
            <div style={{ fontSize: fs.titulo, fontWeight: '800', color: t.text, marginBottom: '3px' }}>
              {saludo}, {usuario?.nombre}
            </div>
            <div style={{ fontSize: fs.base, color: t.textMuted }}>
              Bienvenido a <strong style={{ color: t.primary }}>ClaraCore</strong> — plataforma de gestión de obra y control de cantidades.
            </div>
          </div>
        </div>
      </div>

      {/* ── Frase del día ── */}
      <FraseDelDia t={t} fs={fs} usuario={usuario} />

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '10px', marginBottom: '28px',
      }}>
        <StatCard icono="📋" valor={NOVEDADES.length} label="Novedades"     color={t.primary} t={t} fs={fs} delay={150} />
        <StatCard icono="🏗️" valor="SICOE"            label="Módulo activo" color="#10B981"   t={t} fs={fs} delay={200} />
        <StatCard icono="🔐" valor="Seguro"            label="Sesión activa" color="#8B5CF6"   t={t} fs={fs} delay={250} />
        <StatCard icono="☁️" valor="Online"            label="Servidor"      color="#F59E0B"   t={t} fs={fs} delay={300} />
      </div>

      {/* ── Novedades ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ width: '3px', height: '18px', background: t.primary, borderRadius: '2px' }} />
          <div style={{ fontSize: fs.card, fontWeight: '800', color: t.text, letterSpacing: '0.3px' }}>
            📢 Novedades y actualizaciones
          </div>
          <div style={{
            marginLeft: 'auto', fontSize: fs.autor, color: t.textMuted,
            background: t.bg, border: `1px solid ${t.border}`,
            borderRadius: '20px', padding: '2px 10px',
          }}>
            {NOVEDADES.length} entradas
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {NOVEDADES.map((nov, i) => (
            <TarjetaNovedad key={nov.id} novedad={nov} t={t} fs={fs} delay={350 + i * 80} />
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '36px', textAlign: 'center', fontSize: fs.autor, color: t.textMuted, opacity: 0.5 }}>
        ClaraCore © {new Date().getFullYear()} — Plataforma de gestión de obra
      </div>

    </div>
  )
}
