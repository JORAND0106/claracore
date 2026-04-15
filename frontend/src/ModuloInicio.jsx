import { useState, useEffect } from 'react'

// ─── Datos de novedades — edita este array para publicar nuevas entradas ───────
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
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

// ─── Tarjeta de novedad ────────────────────────────────────────────────────────
function TarjetaNovedad({ novedad, t, delay = 0 }) {
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
        borderRadius: '14px',
        padding: '20px 24px',
        transition: 'all 0.3s ease',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        boxShadow: hover ? `0 8px 32px ${novedad.color}22` : 'none',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Acento lateral */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
        background: novedad.color, borderRadius: '14px 0 0 14px',
        transition: 'width 0.3s',
        ...(hover ? { width: '4px' } : {}),
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {/* Ícono */}
        <div style={{
          fontSize: '24px', lineHeight: 1,
          background: novedad.color + '18',
          borderRadius: '10px', padding: '10px',
          flexShrink: 0,
        }}>
          {novedad.icono}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.6px',
              textTransform: 'uppercase', padding: '2px 8px', borderRadius: '20px',
              background: tipo.bg, color: tipo.color,
            }}>
              {tipo.label}
            </span>
            <span style={{ fontSize: '11px', color: t.textMuted }}>
              {fmtFecha(novedad.fecha)}
            </span>
          </div>

          {/* Título */}
          <div style={{
            fontSize: '15px', fontWeight: '700', color: t.text,
            marginBottom: '6px', lineHeight: 1.3,
          }}>
            {novedad.titulo}
          </div>

          {/* Resumen */}
          <div style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.6 }}>
            {novedad.resumen}
          </div>

          {/* Autor */}
          <div style={{ marginTop: '10px', fontSize: '11px', color: t.textMuted, opacity: 0.7 }}>
            — {novedad.autor}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icono, valor, label, color, t, delay = 0 }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '16px 20px',
      textAlign: 'center',
      transition: 'all 0.4s ease',
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      opacity: visible ? 1 : 0,
    }}>
      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{icono}</div>
      <div style={{ fontSize: '22px', fontWeight: '800', color, marginBottom: '2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ModuloInicio({ t, usuario }) {
  const [saludoVisible, setSaludoVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSaludoVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '8px 0 48px' }}>

      {/* ── Saludo ── */}
      <div style={{
        marginBottom: '32px',
        transition: 'all 0.5s ease',
        transform: saludoVisible ? 'translateY(0)' : 'translateY(-12px)',
        opacity: saludoVisible ? 1 : 0,
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${t.primary}18 0%, ${t.bgCard} 100%)`,
          border: `1px solid ${t.border}`,
          borderRadius: '16px',
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
        }}>
          <div style={{ fontSize: '48px', lineHeight: 1 }}>👋</div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: t.text, marginBottom: '4px' }}>
              {saludo}, {usuario?.nombre}
            </div>
            <div style={{ fontSize: '13px', color: t.textMuted }}>
              Bienvenido a <strong style={{ color: t.primary }}>ClaraCore</strong> — plataforma de gestión de obra y control de cantidades.
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats rápidas ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '36px',
      }}>
        <StatCard icono="📋" valor={NOVEDADES.length} label="Novedades" color={t.primary} t={t} delay={150} />
        <StatCard icono="🏗️" valor="SICOE" label="Módulo activo" color="#10B981" t={t} delay={200} />
        <StatCard icono="🔐" valor="Seguro" label="Sesión activa" color="#8B5CF6" t={t} delay={250} />
        <StatCard icono="☁️" valor="Online" label="Servidor" color="#F59E0B" t={t} delay={300} />
      </div>

      {/* ── Novedades ── */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          marginBottom: '20px',
        }}>
          <div style={{
            width: '3px', height: '20px', background: t.primary,
            borderRadius: '2px',
          }} />
          <div style={{ fontSize: '14px', fontWeight: '800', color: t.text, letterSpacing: '0.3px' }}>
            📢 Novedades y actualizaciones
          </div>
          <div style={{
            marginLeft: 'auto', fontSize: '11px', color: t.textMuted,
            background: t.bg, border: `1px solid ${t.border}`,
            borderRadius: '20px', padding: '3px 10px',
          }}>
            {NOVEDADES.length} entradas
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {NOVEDADES.map((nov, i) => (
            <TarjetaNovedad
              key={nov.id}
              novedad={nov}
              t={t}
              delay={350 + i * 80}
            />
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: '40px', textAlign: 'center',
        fontSize: '11px', color: t.textMuted, opacity: 0.5,
      }}>
        ClaraCore © {new Date().getFullYear()} — Plataforma de gestión de obra
      </div>

    </div>
  )
}
