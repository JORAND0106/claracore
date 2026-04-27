import { useState, useEffect, useMemo } from 'react'
import { API_BASE } from './apiBase'
import { getClaraTypeScaleInline } from './typographyScale'
const API_ANTHROPIC = `${API_BASE}/frase-del-dia`

function buildfs(fontSize) {
  const s = getClaraTypeScaleInline(fontSize)
  return {
    base: s.body,
    titulo: s.h1,
    stat: s.h1,
    card: s.md,
    badge: s.caption,
    autor: s.label,
    h2: s.h2,
    sm: s.sm,
    novedadTitulo: s.title,
    novedadIcon: s.lg,
    lg: s.lg,
  }
}

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

// ─── Tarjeta de novedad (detalle) ──────────────────────────────────────────────
function TarjetaNovedad({ novedad, t, fs, delay = 0, sinEntrada = false }) {
  const [visible, setVisible] = useState(sinEntrada)
  const [hover, setHover]     = useState(false)
  const tipo = TIPO_LABEL[novedad.tipo] || TIPO_LABEL['aviso']

  useEffect(() => {
    if (sinEntrada) return
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay, sinEntrada])

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
        transform: sinEntrada || visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: sinEntrada || visible ? 1 : 0,
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
          fontSize: fs.novedadIcon, lineHeight: 1,
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
          <div style={{ fontSize: fs.novedadTitulo, fontWeight: '800', color: t.text, marginBottom: '6px', lineHeight: 1.3 }}>
            {novedad.titulo}
          </div>
          <div style={{ fontSize: fs.base, color: t.text, lineHeight: 1.55 }}>
            {novedad.resumen}
          </div>
          {novedad.imagen_url ? (
            <div
              style={{ marginTop: '12px' }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: fs.badge,
                  fontWeight: '700',
                  color: t.textMuted,
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: fs.lg, lineHeight: 1 }} aria-hidden>🖼️</span>
                <span>Esta novedad incluye una imagen</span>
                <span
                  style={{
                    background: `${t.primary}16`,
                    color: t.primary,
                    border: `1px solid ${t.primary}44`,
                    borderRadius: '8px',
                    padding: '2px 8px',
                    fontWeight: '800',
                    letterSpacing: '0.2px',
                  }}
                >
                  + imagen
                </span>
              </div>
              <a
                href={novedad.imagen_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir imagen a tamaño completo en otra pestaña"
                style={{
                  display: 'block',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: `1px solid ${t.border}`,
                  cursor: 'pointer',
                }}
              >
                <img
                  src={novedad.imagen_url}
                  alt="Imagen de la novedad. Clic para abrir en otra pestaña."
                  style={{
                    width: '100%',
                    maxHeight: 'min(50vh, 360px)',
                    objectFit: 'cover',
                    display: 'block',
                    verticalAlign: 'middle',
                  }}
                />
              </a>
              <div style={{ fontSize: fs.badge, color: t.primary, marginTop: '8px', lineHeight: 1.4 }}>
                Clic en la imagen para abrirla en otra pestaña y ver el detalle.
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: '6px', fontSize: fs.autor, color: t.textMuted, opacity: 0.6 }}>
            — {novedad.autor}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bandeja a ancho completo; plegable; filas estilo correo (leída = tono suave). */
function BandejaNovedadesInicio({ novedades, setNovedades, t, fs, novedadesCargando, token, puedePublicarNovedades }) {
  const [abierta, setAbierta] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const sinLeer = novedades.filter((n) => !n.leida).length

  const marcarLeidaRemoto = (nov) => {
    if (!nov?.id || nov.leida) return
    if (!token) return
    fetch(`${API_BASE}/inicio/novedades/${nov.id}/leida`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
    setNovedades((prev) =>
      prev.map((p) => (p.id === nov.id ? { ...p, leida: true } : p))
    )
  }

  const abrirDetalle = (nov) => {
    setDetalle(nov)
    marcarLeidaRemoto(nov)
  }

  return (
    <div
      style={{
        width: '100%',
        alignSelf: 'stretch',
        border: `1px solid ${t.border}`,
        borderRadius: '12px',
        background: t.bgCard,
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '10px 12px',
          border: 'none',
          background: abierta ? t.bg : 'transparent',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '18px' }}>📥</span>
          <span style={{ fontSize: fs.base, fontWeight: '800', color: t.text }}>Novedades</span>
          {novedadesCargando ? (
            <span style={{ fontSize: fs.autor, color: t.textMuted }}>…</span>
          ) : (
            <span
              style={{
                fontSize: fs.autor,
                fontWeight: '700',
                color: sinLeer > 0 ? t.primary : t.textMuted,
                background: sinLeer > 0 ? `${t.primary}18` : t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: '10px',
                padding: '1px 8px',
              }}
            >
              {novedades.length}{sinLeer > 0 ? ` · ${sinLeer} sin leer` : ''}
            </span>
          )}
        </span>
        <span style={{ color: t.textMuted, fontSize: fs.sm }}>{abierta ? '▼' : '▶'}</span>
      </button>
      {abierta && (
        <div
          style={{
            borderTop: `1px solid ${t.border}`,
            maxHeight: 'min(50vh, 360px)',
            overflowY: 'auto',
            fontSize: fs.autor,
          }}
        >
          {novedadesCargando ? (
            <div style={{ padding: '12px', color: t.textMuted }}>Cargando…</div>
          ) : novedades.length === 0 ? (
            <div style={{ padding: '12px', color: t.textMuted, lineHeight: 1.5 }}>
              {puedePublicarNovedades
                ? 'Aún no hay novedades. Publícalas desde Admin → Página de inicio.'
                : 'No hay novedades por ahora.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: t.bg, color: t.textMuted, fontSize: fs.autor, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Fecha</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Enviada por</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Título</th>
                </tr>
              </thead>
              <tbody>
                {novedades.map((nov) => {
                  const leida = !!nov.leida
                  return (
                    <tr
                      key={nov.id}
                      onClick={() => abrirDetalle(nov)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: `1px solid ${t.border}`,
                        background: leida ? t.bg : t.bgCard,
                        opacity: leida ? 0.72 : 1,
                        color: leida ? t.textMuted : t.text,
                        fontWeight: leida ? '500' : '700',
                      }}
                    >
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', verticalAlign: 'top', width: '1%' }}>
                        {nov.fecha ? String(nov.fecha).slice(0, 10) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'top', maxWidth: '200px' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nov.autor || ''}>
                          {nov.autor || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                        <span style={{ marginRight: '6px' }}>{nov.icono || '📢'}</span>
                        {nov.titulo}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {detalle && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDetalle(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 'min(1040px, 96vw)', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <TarjetaNovedad novedad={detalle} t={t} fs={fs} delay={0} sinEntrada />
            <div style={{ textAlign: 'right', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: fs.base,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
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
      borderRadius: '10px', padding: '12px 16px', textAlign: 'center', minWidth: 0,
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
  const FRASES_FALLBACK = [
    { frase: 'El avance de hoy construye el resultado de mañana.', autor: 'ClaraCore', tipo: 'motivadora' },
    { frase: 'La disciplina diaria convierte grandes obras en realidad.', autor: 'ClaraCore', tipo: 'reflexiva' },
    { frase: 'La calidad no se improvisa: se decide en cada detalle.', autor: 'ClaraCore', tipo: 'reflexiva' },
    { frase: 'Mantente firme: cada paso bien hecho cuenta.', autor: 'ClaraCore', tipo: 'motivadora' },
    { frase: 'La constancia convierte lo difícil en posible.', autor: 'ClaraCore', tipo: 'motivadora' },
    { frase: 'Donde otros ven obstáculos, un equipo firme ve oportunidades de mejora.', autor: 'ClaraCore', tipo: 'reflexiva' },
    { frase: 'La excelencia no es un acto, es un hábito diario.', autor: 'ClaraCore', tipo: 'motivadora' },
    { frase: 'Tu trabajo de hoy es la confianza de muchos mañana.', autor: 'ClaraCore', tipo: 'reflexiva' },
    { frase: 'No te rindas: la obra más sólida se levanta bloque a bloque.', autor: 'ClaraCore', tipo: 'motivadora' },
    { frase: 'Hazlo bien, aunque nadie mire; eso también construye carácter.', autor: 'ClaraCore', tipo: 'reflexiva' },
    { frase: 'Todo tiene su tiempo, y todo lo que se quiere debajo del cielo tiene su hora.', autor: 'Eclesiastés 3:1', tipo: 'bíblica' },
    { frase: 'Todo lo puedo en Cristo que me fortalece.', autor: 'Filipenses 4:13', tipo: 'bíblica' },
    { frase: 'Porque yo sé los planes que tengo para ustedes, planes de bienestar y no de calamidad.', autor: 'Jeremías 29:11', tipo: 'bíblica' },
    { frase: 'Encomienda al Señor tus obras, y tus pensamientos serán afirmados.', autor: 'Proverbios 16:3', tipo: 'bíblica' },
    { frase: 'Esfuérzate y sé valiente; no temas ni desmayes.', autor: 'Josué 1:9', tipo: 'bíblica' },
    { frase: 'Los que esperan en el Señor tendrán nuevas fuerzas; levantarán alas como las águilas.', autor: 'Isaías 40:31', tipo: 'bíblica' },
    { frase: 'Fiel es Dios, que no dejará que sean probados más de lo que pueden resistir.', autor: '1 Corintios 10:13', tipo: 'bíblica' },
    { frase: 'El corazón del hombre piensa su camino, mas el Señor endereza sus pasos.', autor: 'Proverbios 16:9', tipo: 'bíblica' },
  ]
  const fallbackLocal = (fraseActual = null) => {
    const pool = FRASES_FALLBACK.filter(f => !fraseActual || f.frase !== fraseActual.frase)
    const source = pool.length > 0 ? pool : FRASES_FALLBACK
    const idx = Math.floor(Math.random() * source.length)
    return source[idx]
  }
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
      if (!res.ok) throw new Error(`frase-del-dia status ${res.status}`)
      const data = await res.json()
      const parsedApi =
        (data && typeof data === 'object' && data.frase) ? data : null
      const parsed = parsedApi || fallbackLocal(frase)
      setFrase(parsed)
      setEstado('visible')
      setTimeout(() => setVisible(true), 100)
      localStorage.setItem(storageKey, JSON.stringify({ aceptado: true, fecha: hoyISO(), frase: parsed }))
    } catch {
      const parsed = fallbackLocal(frase)
      setFrase(parsed)
      setEstado('visible')
      setTimeout(() => setVisible(true), 100)
      localStorage.setItem(storageKey, JSON.stringify({ aceptado: true, fecha: hoyISO(), frase: parsed }))
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
export default function ModuloInicio({ t, usuario, fontSize = 'normal', puedePublicarNovedades = false, token = null }) {
  const [saludoVisible, setSaludoVisible] = useState(false)
  const [novedades, setNovedades] = useState([])
  const [novedadesCargando, setNovedadesCargando] = useState(true)
  const fs = useMemo(() => buildfs(fontSize), [fontSize])

  useEffect(() => {
    const timer = setTimeout(() => setSaludoVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    setNovedadesCargando(true)
    const getTok = () => localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token') || ''
    const headers = getTok() ? { Authorization: `Bearer ${getTok()}` } : {}
    fetch(`${API_BASE}/inicio/novedades`, { headers })
      .then((r) => (r.status === 401 ? [] : r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return
        const arr = Array.isArray(data) ? data : []
        setNovedades((prev) => {
          const prevMap = new Map((prev || []).map((n) => [n.id, !!n.leida]))
          return arr.map((n) => ({
            ...n,
            leida: !!(n.leida || prevMap.get(n.id)),
          }))
        })
      })
      .catch(() => {
        if (!cancelled) setNovedades([])
      })
      .finally(() => {
        if (!cancelled) setNovedadesCargando(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const hora   = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div style={{ width: '100%', maxWidth: '1540px', margin: '0 auto', padding: '8px 0 48px', boxSizing: 'border-box' }}>

      {/* ── Saludo + indicadores (misma fila) ── */}
      <div style={{
        display: 'flex', flexFlow: 'row wrap', alignItems: 'stretch', gap: '12px',
        marginBottom: '20px',
        transition: 'all 0.5s ease',
        transform: saludoVisible ? 'translateY(0)' : 'translateY(-12px)',
        opacity: saludoVisible ? 1 : 0,
      }}>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex' }}>
          <div style={{
            flex: 1,
            background: `linear-gradient(135deg, ${t.primary}18 0%, ${t.bgCard} 100%)`,
            border: `1px solid ${t.border}`, borderRadius: '14px',
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', minHeight: 0,
          }}>
            <div style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0 }}>👋</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: fs.titulo, fontWeight: '800', color: t.text, marginBottom: '3px' }}>
                {saludo}, {usuario?.nombre}
              </div>
              <div style={{ fontSize: fs.base, color: t.textMuted, lineHeight: 1.45 }}>
                Bienvenido a <strong style={{ color: t.primary }}>ClaraCore</strong> — plataforma de gestión de obra y control de cantidades.
              </div>
            </div>
          </div>
        </div>
        <div style={{
          display: 'grid',
          /* Ancho del bloque de 3 tarjetas ampliado (+15% +15% frente a 300px) → ≈397px */
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '10px', flex: '0 1 397px', minWidth: 'min(100%, 291px)', alignContent: 'stretch',
        }}>
          <StatCard icono="🏗️" valor="SICOE" label="Módulo activo" color="#10B981" t={t} fs={fs} delay={150} />
          <StatCard icono="🔐" valor="Seguro" label="Sesión activa" color="#8B5CF6" t={t} fs={fs} delay={200} />
          <StatCard icono="☁️" valor="Online" label="Servidor" color="#F59E0B" t={t} fs={fs} delay={250} />
        </div>
      </div>

      {/* ── Frase del día (ancho completo) ── */}
      <div style={{ marginBottom: '20px' }}>
        <FraseDelDia t={t} fs={fs} usuario={usuario} />
      </div>

      {/* ── Buzón de novedades (ancho de la sección, debajo de indicadores) ── */}
      <div style={{ marginBottom: '20px' }}>
        <BandejaNovedadesInicio
          novedades={novedades}
          setNovedades={setNovedades}
          t={t}
          fs={fs}
          novedadesCargando={novedadesCargando}
          token={token}
          puedePublicarNovedades={puedePublicarNovedades}
        />
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '36px', textAlign: 'center', fontSize: fs.autor, color: t.textMuted, opacity: 0.5 }}>
        ClaraCore © {new Date().getFullYear()} — Plataforma de gestión de obra
      </div>

    </div>
  )
}
