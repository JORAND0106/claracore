import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import CcModalBrandHeader from './components/CcModalBrandHeader'
import { API_BASE, logApiFailure, apiFetchSignal } from './apiBase'
import { getClaraTypeScaleInline } from './typographyScale'
import { eligeFraseInicio, fraseInicioEsValida } from './data/frasesInicioCuradas.js'
import { eligeSaludoInicio } from './data/saludosInicio.js'
import CieloClimaCanvas from './components/inicio/CieloClimaCanvas.jsx'
import SeguimientoCalendarioPanel from './modules/seguimiento/SeguimientoCalendarioPanel.jsx'

function useInicioMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

const API_FRASE = `${API_BASE}/frase-del-dia`
const SLIDER_INTERVAL_MS = 10000
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const BOGOTA_OFICINA = { nombre: 'Bogotá', lat: 4.711, lon: -74.0721 }

function buildfs(fontSize) {
  const s = getClaraTypeScaleInline(fontSize)
  return {
    base: s.body,
    titulo: s.h1,
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

function wmoEmoji(code) {
  const c = Number(code)
  if (c === 0) return '☀️'
  if (c >= 1 && c <= 2) return '⛅'
  if (c === 3) return '☁️'
  if (c >= 51 && c <= 67) return '🌧️'
  if (c >= 80 && c <= 82) return '🌦️'
  if (c >= 95 && c <= 99) return '⛈️'
  return '🌡️'
}

function fmtFechaHoraColombia(date = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function fmtFechaCorta(iso) {
  if (!iso) return ''
  try {
    return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return String(iso).slice(0, 10)
  }
}

function textoActaVigente(acta) {
  if (acta?.numero_rpo == null) return 'Sin acta vigente'
  const ini = fmtFechaCorta(acta.fecha_inicio)
  const fin = fmtFechaCorta(acta.fecha_fin)
  if (ini && fin) return `RPO #${acta.numero_rpo} · ${ini} → ${fin}`
  if (ini) return `RPO #${acta.numero_rpo} · ${ini}`
  return `RPO #${acta.numero_rpo}`
}

function textoSemanaVigente(semana) {
  if (semana?.numero_semana == null) return 'Sin semana vigente'
  const ini = fmtFechaCorta(semana.fecha_inicio)
  const fin = fmtFechaCorta(semana.fecha_fin)
  if (ini && fin) return `Sem. ${semana.numero_semana} · ${ini} → ${fin}`
  return `Sem. ${semana.numero_semana}`
}

function numeroContratoInterventoria(contrato) {
  if (!contrato) return null
  const n = contrato.numero_interventoria ?? contrato.numero_contrato_interventoria
  const txt = n != null ? String(n).trim() : ''
  return txt || null
}

function textoPieFoto(foto) {
  const cap = (foto?.capitulo || '').trim() || '—'
  const tramo = (foto?.tramo || '').trim() || '—'
  const desc = (foto?.descripcion_corta || foto?.observacion || '').trim() || '—'
  return `${cap} · ${tramo} · ${desc}`
}

function centroideDesdePlano(data) {
  if (!data) return null
  const gj = data.plano_geojson
  const features = gj?.type === 'FeatureCollection'
    ? (gj.features || [])
    : gj?.type === 'Feature'
      ? [gj]
      : []
  const coords = features.flatMap((f) => {
    const g = f.geometry
    if (g?.type === 'Polygon') return g.coordinates[0]
    if (g?.type === 'MultiPolygon') return g.coordinates.flat(2)
    return []
  })
  if (coords.length) {
    return {
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
      lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
    }
  }
  if (data.centro_lat != null && data.centro_lng != null) {
    const lat = Number(data.centro_lat)
    const lng = Number(data.centro_lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

async function etiquetaZonaObra(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&accept-language=es`,
      { headers: { 'Accept-Language': 'es', 'User-Agent': 'ClaraCore/1.0 (inicio clima)' } },
    )
    if (r.ok) {
      const j = await r.json()
      const a = j.address || {}
      const nombre = a.city || a.town || a.municipality || a.village || a.county || a.state_district
      if (nombre) return nombre
    }
  } catch { /* fallback abajo */ }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  }
  return 'Zona de obra'
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
function BandejaNovedadesInicio({
  novedades, setNovedades, t, fs, novedadesCargando, token, puedePublicarNovedades,
  limite = null,
  compact = false,
}) {
  const [abierta, setAbierta] = useState(true)
  const [detalle, setDetalle] = useState(null)
  const visibles = useMemo(() => {
    const arr = Array.isArray(novedades) ? novedades : []
    return limite != null ? arr.slice(0, limite) : arr
  }, [novedades, limite])
  const sinLeer = visibles.filter((n) => !n.leida).length

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
              {visibles.length}{sinLeer > 0 ? ` · ${sinLeer} sin leer` : ''}
              {limite != null ? ' · recientes' : ''}
            </span>
          )}
        </span>
        <span style={{ color: t.textMuted, fontSize: fs.sm }}>{abierta ? '▼' : '▶'}</span>
      </button>
      {abierta && (
        <div
          style={{
            borderTop: `1px solid ${t.border}`,
            maxHeight: compact ? 'min(36vh, 220px)' : 'min(50vh, 360px)',
            overflowY: 'auto',
            fontSize: fs.autor,
          }}
        >
          {novedadesCargando ? (
            <div style={{ padding: '12px', color: t.textMuted }}>Cargando…</div>
          ) : visibles.length === 0 ? (
            <div style={{ padding: '12px', color: t.textMuted, lineHeight: 1.5 }}>
              {puedePublicarNovedades
                ? 'Aún no hay novedades. Publícalas desde Admin → Página de inicio.'
                : 'No hay novedades por ahora.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {!compact && (
                <thead>
                  <tr style={{ background: t.bg, color: t.textMuted, fontSize: fs.autor, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Fecha</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Enviada por</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '700' }}>Título</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {visibles.map((nov) => {
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
                      <td style={{ padding: compact ? '7px 10px' : '8px 10px', whiteSpace: 'nowrap', verticalAlign: 'top', width: '1%' }}>
                        {nov.fecha ? String(nov.fecha).slice(0, 10) : '—'}
                      </td>
                      {!compact && (
                        <td style={{ padding: '8px 10px', verticalAlign: 'top', maxWidth: '200px' }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nov.autor || ''}>
                            {nov.autor || '—'}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: compact ? '7px 10px' : '8px 10px', verticalAlign: 'top' }}>
                        <span style={{ marginRight: '6px' }}>{nov.icono || '📢'}</span>
                        {nov.titulo}
                        {compact && nov.autor ? (
                          <span style={{ display: 'block', fontWeight: 500, color: t.textMuted, marginTop: 2 }}>
                            {nov.autor}
                          </span>
                        ) : null}
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
            <CcModalBrandHeader theme={t} />
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

const OPCIONES_CONTENIDO_DIA = [
  { id: 'biblica', etiqueta: 'Cita bíblica', icono: '📖', color: '#F59E0B', citar: true, otroLabel: 'Otra cita', cargandoLabel: 'Cargando cita…' },
  { id: 'reflexion', etiqueta: 'Reflexión', icono: '💭', color: '#6366F1', citar: false, otroLabel: 'Otra reflexión', cargandoLabel: 'Cargando reflexión…' },
  { id: 'motivadora', etiqueta: 'Frase motivadora', icono: '⚡', color: '#10B981', citar: false, otroLabel: 'Otra frase', cargandoLabel: 'Cargando frase…' },
  { id: 'dato', etiqueta: 'Dato del día', icono: '📊', color: '#0EA5E9', citar: false, otroLabel: 'Otro dato', cargandoLabel: 'Cargando dato…' },
]

const TIPO_CONTENIDO_DIA_DEFAULT = 'biblica'

function normalizaTipoContenidoDia(tipo) {
  const t = String(tipo || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (t === 'biblica') return 'biblica'
  if (t === 'reflexion' || t === 'reflexiva') return 'reflexion'
  if (OPCIONES_CONTENIDO_DIA.some((o) => o.id === t)) return t
  return TIPO_CONTENIDO_DIA_DEFAULT
}

function metaContenidoDia(tipo) {
  const id = normalizaTipoContenidoDia(tipo)
  return OPCIONES_CONTENIDO_DIA.find((o) => o.id === id) || OPCIONES_CONTENIDO_DIA[0]
}

function prefTipoContenidoKey(userId) {
  return `claracore_inicio_tipo_default_${userId || 'guest'}`
}

function cacheFraseDiaKey(userId) {
  return `claracore_frase_dia_${userId || 'guest'}`
}

function leerTipoPredeterminado(userId) {
  try {
    const v = localStorage.getItem(prefTipoContenidoKey(userId))
    if (v) return normalizaTipoContenidoDia(v)
  } catch { /* ignore */ }
  return TIPO_CONTENIDO_DIA_DEFAULT
}

function guardarTipoPredeterminado(userId, tipo) {
  try {
    localStorage.setItem(prefTipoContenidoKey(userId), normalizaTipoContenidoDia(tipo))
  } catch { /* ignore */ }
}

// ─── Barra de clima (Open-Meteo) ───────────────────────────────────────────────
// Diseño v1 de respaldo: frontend/src/components/inicio/BarraClima.v1.reference.jsx
function BarraClima({ t, fs, contratoId, token }) {
  const [clima, setClima] = useState(null)
  const [error, setError] = useState(false)
  const [zonaObra, setZonaObra] = useState(null)
  const [cargandoZona, setCargandoZona] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!contratoId) {
      setZonaObra(null)
      return undefined
    }
    setCargandoZona(true)
    const h = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${API_BASE}/contratos/${contratoId}`, { headers: h })
      .then(async (r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled) return
        const centro = centroideDesdePlano(data)
        if (!centro) {
          setZonaObra({ nombre: 'Zona de obra', lat: null, lng: null })
          return
        }
        const nombre = await etiquetaZonaObra(centro.lat, centro.lng)
        if (!cancelled) {
          setZonaObra({ nombre, lat: centro.lat, lng: centro.lng })
        }
      })
      .catch(() => {
        if (!cancelled) setZonaObra({ nombre: 'Zona de obra', lat: null, lng: null })
      })
      .finally(() => {
        if (!cancelled) setCargandoZona(false)
      })
    return () => { cancelled = true }
  }, [contratoId, token])

  useEffect(() => {
    let cancelled = false
    async function cargar() {
      try {
        const fetchClima = (lat, lon, daily) => {
          const p = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lon),
            current: 'temperature_2m,weather_code',
            timezone: 'America/Bogota',
          })
          if (daily) {
            p.set('daily', 'weather_code,temperature_2m_max')
            p.set('forecast_days', '5')
          }
          return fetch(`${OPEN_METEO}?${p}`).then((r) => (r.ok ? r.json() : null))
        }
        const promesas = [fetchClima(BOGOTA_OFICINA.lat, BOGOTA_OFICINA.lon, false)]
        if (zonaObra?.lat != null && zonaObra?.lng != null) {
          promesas.push(fetchClima(zonaObra.lat, zonaObra.lng, true))
        }
        const resultados = await Promise.all(promesas)
        if (cancelled) return
        const bog = resultados[0]
        const obra = resultados[1] || null
        if (!bog?.current) {
          setError(true)
          return
        }
        setClima({ bogota: bog, obra })
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    if (cargandoZona) return undefined
    cargar()
    const iv = setInterval(cargar, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [zonaObra, cargandoZona])

  const bog = clima?.bogota?.current
  const obra = clima?.obra?.current
  const daily = clima?.obra?.daily
  const nombreObra = zonaObra?.nombre || 'Zona de obra'
  const wmoEscena = obra?.weather_code ?? bog?.weather_code ?? 0

  const panel = {
    background: 'rgba(8,12,24,0.52)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '10px',
    padding: '10px 14px',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  }

  const tarjetaZona = (label, sublabel, code, temp) => (
    <div style={{
      ...panel,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: 0,
      flex: '0 1 auto',
      padding: '8px 12px',
    }}>
      <span style={{ fontSize: '1.25em', lineHeight: 1, flexShrink: 0 }} aria-hidden>{wmoEmoji(code)}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fs.sm, fontWeight: '800', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        {sublabel ? (
          <div style={{ fontSize: fs.badge, opacity: 0.85, fontWeight: '600', lineHeight: 1.2 }}>{sublabel}</div>
        ) : null}
      </div>
      <div style={{ fontSize: fs.sm, fontWeight: '800', lineHeight: 1, flexShrink: 0, marginLeft: '2px' }}>
        {temp != null ? `${Math.round(temp)}°C` : '—'}
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      borderRadius: '14px',
      overflow: 'hidden',
      marginBottom: '14px',
      minHeight: '88px',
      boxShadow: '0 4px 22px rgba(0,0,0,0.18)',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @keyframes ccPulseLive {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
          50% { opacity: 0.85; transform: scale(1.15); box-shadow: 0 0 0 7px rgba(16,185,129,0); }
        }
      `}</style>
      <CieloClimaCanvas wmoCode={wmoEscena} />
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '12px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        minHeight: '88px',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: '0 1 auto', minWidth: 0 }}>
          <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
            <span
              aria-hidden
              style={{
                width: '9px', height: '9px', borderRadius: '50%', background: '#10B981',
                animation: 'ccPulseLive 1.8s ease-in-out infinite', flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: fs.sm, fontWeight: '800', lineHeight: 1.2 }}>Clima en vivo</div>
              <div style={{ fontSize: fs.badge, opacity: 0.88, fontWeight: '600', lineHeight: 1.2 }}>Cielo según obra · Open-Meteo</div>
            </div>
          </div>

          {cargandoZona ? (
            <div style={{ ...panel, fontSize: fs.sm, padding: '8px 12px' }}>Ubicando zona de obra…</div>
          ) : error && !clima ? (
            <div style={{ ...panel, fontSize: fs.sm, padding: '8px 12px' }}>No se pudo cargar el clima.</div>
          ) : (
            <>
              {tarjetaZona(BOGOTA_OFICINA.nombre, 'Oficina', bog?.weather_code, bog?.temperature_2m)}
              {obra
                ? tarjetaZona(nombreObra, 'Obra', obra?.weather_code, obra?.temperature_2m)
                : !cargandoZona && (
                  <div style={{ ...panel, fontSize: fs.autor, opacity: 0.92, padding: '8px 12px' }}>
                    Obra: sin plano para clima local
                  </div>
                )}
            </>
          )}
        </div>

        {!cargandoZona && !error && daily?.time?.length ? (
          <div style={{
            ...panel,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            flex: '1 1 280px',
            marginLeft: 'auto',
            minWidth: 0,
            padding: '8px 12px',
          }}>
            <span style={{ fontWeight: '800', fontSize: fs.sm, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Pronóstico 5 días · {nombreObra}
            </span>
            {daily.time.slice(0, 5).map((dia, i) => (
              <span
                key={dia}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '8px',
                  padding: '3px 8px',
                  whiteSpace: 'nowrap',
                  fontSize: fs.badge,
                  fontWeight: '600',
                  lineHeight: 1.3,
                }}
              >
                {String(dia).slice(5).replace('-', '/')} {wmoEmoji(daily.weather_code?.[i])}{' '}
                {daily.temperature_2m_max?.[i] != null ? `${Math.round(daily.temperature_2m_max[i])}°` : '—'}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Saludo + contenido del día (cita, reflexión, dato, etc.) ─────────────────
function PanelSaludoContenidoDia({ t, fs, usuario, saludoVisible, compact = false }) {
  const userId = usuario?.id || 'guest'
  const [estado, setEstado] = useState('visible')
  const [tipoActivo, setTipoActivo] = useState(() => leerTipoPredeterminado(userId))
  const [tipoPredeterminado, setTipoPredeterminado] = useState(() => leerTipoPredeterminado(userId))
  const [frase, setFrase] = useState(() => eligeFraseInicio(null, leerTipoPredeterminado(userId)))
  const [visible, setVisible] = useState(false)
  const [fechaHora, setFechaHora] = useState(() => fmtFechaHoraColombia())
  const saludo = useMemo(
    () => eligeSaludoInicio(usuario?.nombre),
    [usuario?.id, usuario?.nombre],
  )

  useEffect(() => {
    const tick = () => setFechaHora(fmtFechaHoraColombia())
    tick()
    const iv = setInterval(tick, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const def = leerTipoPredeterminado(userId)
    setTipoPredeterminado(def)
    setTipoActivo(def)
  }, [userId])

  const aplicarFrase = useCallback((parsed, tipo) => {
    const tipoNorm = normalizaTipoContenidoDia(tipo || parsed?.tipo)
    const f = parsed?.frase ? { ...parsed, tipo: tipoNorm } : null
    if (!fraseInicioEsValida(f)) return
    setFrase(f)
    setEstado('visible')
    setVisible(false)
    setTimeout(() => setVisible(true), 80)
    try {
      localStorage.setItem(cacheFraseDiaKey(userId), JSON.stringify({ fecha: hoyISO(), frase: f, tipo: tipoNorm }))
    } catch { /* ignore */ }
  }, [userId])

  const cargarContenidoLocal = useCallback((tipo, excluirFrase = null) => {
    aplicarFrase(eligeFraseInicio(excluirFrase, tipo), tipo)
  }, [aplicarFrase])

  const cargarContenidoInicial = useCallback((tipo) => {
    const tipoNorm = normalizaTipoContenidoDia(tipo)
    try {
      const guardado = JSON.parse(localStorage.getItem(cacheFraseDiaKey(userId)) || 'null')
      if (
        guardado?.frase?.frase
        && guardado?.fecha === hoyISO()
        && normalizaTipoContenidoDia(guardado?.tipo) === tipoNorm
        && fraseInicioEsValida(guardado.frase)
      ) {
        aplicarFrase(guardado.frase, tipoNorm)
        return
      }
    } catch { /* ignore */ }
    cargarContenidoLocal(tipoNorm)
  }, [userId, aplicarFrase, cargarContenidoLocal])

  useEffect(() => {
    cargarContenidoInicial(tipoActivo)
  }, [tipoActivo, cargarContenidoInicial])

  const generarContenido = async (tipo = tipoActivo) => {
    const tipoNorm = normalizaTipoContenidoDia(tipo)
    setEstado('cargando')
    setVisible(false)
    try {
      const tok = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
      const res = await fetch(API_FRASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ tipo: tipoNorm }),
      })
      if (res.ok) {
        const data = await res.json()
        if (fraseInicioEsValida(data)) {
          aplicarFrase({ ...data, tipo: tipoNorm }, tipoNorm)
          return
        }
      }
    } catch { /* local */ }
    cargarContenidoLocal(tipoNorm, frase?.frase)
  }

  const cambiarTipo = (tipo) => {
    const tipoNorm = normalizaTipoContenidoDia(tipo)
    if (tipoNorm === tipoActivo) return
    setTipoActivo(tipoNorm)
  }

  const marcarComoPredeterminado = (tipo) => {
    const tipoNorm = normalizaTipoContenidoDia(tipo)
    guardarTipoPredeterminado(userId, tipoNorm)
    setTipoPredeterminado(tipoNorm)
  }

  const meta = metaContenidoDia(frase?.tipo || tipoActivo)
  const esPredeterminado = tipoActivo === tipoPredeterminado

  return (
    <div style={{
      background: `linear-gradient(135deg, ${t.primary}18 0%, ${t.bgCard} 55%)`,
      border: `1px solid ${t.border}`,
      borderRadius: compact ? '12px' : '14px',
      padding: compact ? '12px 14px' : '16px 18px',
      width: '100%',
      height: compact ? '100%' : undefined,
      boxSizing: 'border-box',
      transition: 'all 0.5s ease',
      transform: saludoVisible ? 'translateY(0)' : 'translateY(-10px)',
      opacity: saludoVisible ? 1 : 0,
    }}>
      <div style={{
        fontSize: compact ? fs.h2 : fs.titulo,
        fontWeight: '800',
        color: t.text,
        marginBottom: compact ? '4px' : '6px',
        lineHeight: 1.25,
      }}>
        {saludo}
      </div>
      <div style={{
        fontSize: fs.sm, color: t.textMuted, marginBottom: compact ? '8px' : '10px',
        textTransform: 'capitalize', lineHeight: 1.4,
      }}>
        {fechaHora}
      </div>

      <div style={{ marginBottom: compact ? '8px' : '12px' }}>
        {!compact && (
          <div style={{ fontSize: fs.badge, fontWeight: '700', color: t.textMuted, marginBottom: '6px', letterSpacing: '0.3px' }}>
            ¿Qué quieres leer hoy?
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '4px' : '6px', alignItems: 'center' }}>
          {OPCIONES_CONTENIDO_DIA.map((op) => {
            const activo = tipoActivo === op.id
            const esDefault = tipoPredeterminado === op.id
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => cambiarTipo(op.id)}
                title={esDefault ? `${op.etiqueta} (predeterminado al abrir Inicio)` : op.etiqueta}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: compact ? 3 : 5,
                  background: activo ? op.color : t.bgCard,
                  color: activo ? '#fff' : t.textMuted,
                  border: `1px solid ${activo ? op.color : t.border}`,
                  borderRadius: 999,
                  padding: compact ? '3px 8px' : '5px 11px',
                  fontSize: fs.badge,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: activo ? `0 2px 8px ${op.color}44` : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span aria-hidden>{op.icono}</span>
                <span>{op.etiqueta}</span>
                {esDefault ? <span aria-label="Predeterminado" style={{ opacity: activo ? 0.95 : 0.75 }}>★</span> : null}
              </button>
            )
          })}
        </div>
        {!compact && (!esPredeterminado ? (
          <button
            type="button"
            onClick={() => marcarComoPredeterminado(tipoActivo)}
            style={{
              marginTop: '8px',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: t.primary,
              fontSize: fs.badge,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            ★ Usar «{metaContenidoDia(tipoActivo).etiqueta}» como predeterminado al abrir Inicio
          </button>
        ) : (
          <div style={{ marginTop: '8px', fontSize: fs.badge, color: t.textMuted, fontWeight: 600 }}>
            ★ «{metaContenidoDia(tipoActivo).etiqueta}» es tu lectura predeterminada
          </div>
        ))}
      </div>

      {estado === 'cargando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ fontSize: fs.lg }}>⏳</div>
          <div style={{ fontSize: fs.base, color: t.textMuted }}>{meta.cargandoLabel || 'Cargando…'}</div>
        </div>
      )}

      {estado === 'visible' && frase && (
        <div style={{
          transition: 'all 0.5s ease',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}>
          <div style={{
            background: meta.color + '12',
            borderLeft: `3px solid ${meta.color}`,
            borderRadius: '0 8px 8px 0',
            padding: '10px 12px',
          }}>
            <div style={{
              fontSize: fs.badge, fontWeight: '700', letterSpacing: '0.5px',
              color: meta.color, marginBottom: '6px', textTransform: 'uppercase',
            }}>
              {meta.icono} {meta.etiqueta}
            </div>
            <div style={{
              fontSize: compact ? fs.base : fs.card,
              fontWeight: meta.citar ? '500' : '600',
              color: t.text,
              lineHeight: 1.5,
              fontStyle: meta.citar ? 'italic' : 'normal',
              marginBottom: frase.autor ? '6px' : 0,
              display: compact ? '-webkit-box' : undefined,
              WebkitLineClamp: compact ? 4 : undefined,
              WebkitBoxOrient: compact ? 'vertical' : undefined,
              overflow: compact ? 'hidden' : undefined,
            }}>
              {meta.citar ? `«${frase.frase}»` : frase.frase}
            </div>
            {frase.autor ? (
              <div style={{ fontSize: fs.autor, color: t.textMuted, fontWeight: '600' }}>— {frase.autor}</div>
            ) : null}
          </div>
          <div style={{ marginTop: '6px', textAlign: 'right' }}>
            <button type="button" onClick={() => generarContenido(tipoActivo)} style={{
              background: 'transparent', border: 'none',
              fontSize: fs.autor, color: t.primary, cursor: 'pointer', fontWeight: '600',
            }}>🔄 {meta.otroLabel || 'Otro'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ficha del contrato ────────────────────────────────────────────────────────
function FichaContrato({ t, fs, contratoId, token }) {
  const [contrato, setContrato] = useState(null)
  const [acta, setActa] = useState(null)
  const [semanaVigente, setSemanaVigente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [objetoExpandido, setObjetoExpandido] = useState(false)

  useEffect(() => {
    setObjetoExpandido(false)
  }, [contratoId])

  useEffect(() => {
    if (!contratoId) {
      setContrato(null)
      setActa(null)
      setSemanaVigente(null)
      setCargando(false)
      return
    }
    let cancelled = false
    setCargando(true)
    const h = token ? { Authorization: `Bearer ${token}` } : {}
    const sig = apiFetchSignal(45000)
    const fetchOpt = sig ? { headers: h, signal: sig } : { headers: h }
    Promise.all([
      fetch(`${API_BASE}/contratos/${contratoId}`, fetchOpt).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/sicoe-obra/${contratoId}/acta-rpo-vigente`, fetchOpt)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE}/sicoe-obra/${contratoId}/semana-vigente`, fetchOpt)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([c, a, sem]) => {
        if (cancelled) return
        setContrato(c)
        setActa(a && typeof a === 'object' ? a : null)
        setSemanaVigente(sem?.vigente && typeof sem.vigente === 'object' ? sem.vigente : null)
      })
      .finally(() => { if (!cancelled) setCargando(false) })
    return () => { cancelled = true }
  }, [contratoId, token])

  const actaTxt = textoActaVigente(acta)
  const semanaTxt = textoSemanaVigente(semanaVigente)
  const numeroInterventoria = numeroContratoInterventoria(contrato)
  const objetoTxt = contrato?.objeto?.trim() || ''
  const objetoLargo = objetoTxt.length > 120

  const campo = (label, valor, ultimo = false) => (
    <div style={{ marginBottom: ultimo ? 0 : '5px' }}>
      <div style={{
        fontSize: fs.badge, fontWeight: '700', color: t.textMuted,
        marginBottom: '1px', letterSpacing: '0.02em', lineHeight: 1.2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: fs.autor, color: t.text, fontWeight: '600',
        lineHeight: 1.25, wordBreak: 'break-word',
      }}>
        {valor || '—'}
      </div>
    </div>
  )

  const columna = (children) => (
    <div style={{ flex: '1 1 0', minWidth: '120px', maxWidth: '100%' }}>
      {children}
    </div>
  )

  return (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: '10px',
      background: t.bgCard,
      padding: '8px 12px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ fontSize: fs.sm, fontWeight: '800', color: t.primary }}>📋 Ficha del contrato</span>
      </div>
      {cargando ? (
        <div style={{ fontSize: fs.autor, color: t.textMuted }}>Cargando datos del contrato…</div>
      ) : !contrato ? (
        <div style={{ fontSize: fs.autor, color: t.textMuted }}>No hay contrato activo.</div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 14px',
            marginBottom: objetoTxt ? '6px' : 0,
          }}>
            {columna(<>
              {campo('Número de contrato', contrato.numero)}
              {campo('Contratista', contrato.contratista, true)}
            </>)}
            {columna(<>
              {numeroInterventoria ? campo('Número contrato interventoría', numeroInterventoria) : null}
              {campo('Interventoría', contrato.interventoria, true)}
            </>)}
            {columna(<>
              {campo('Acta vigente', actaTxt)}
              {campo('# Semana', semanaTxt, true)}
            </>)}
          </div>

          {objetoTxt ? (
            <div style={{
              borderTop: `1px solid ${t.border}`,
              paddingTop: '6px',
            }}>
              <div style={{
                fontSize: fs.badge, fontWeight: '700', color: t.textMuted,
                marginBottom: '1px', lineHeight: 1.2,
              }}>
                Objeto
              </div>
              <div style={{
                fontSize: fs.autor, color: t.text, lineHeight: 1.3,
                ...(objetoExpandido ? {} : {
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }),
              }}>
                {objetoTxt}
              </div>
              {objetoLargo && !objetoExpandido ? (
                <button
                  type="button"
                  onClick={() => setObjetoExpandido(true)}
                  style={{
                    marginTop: '2px', padding: 0, border: 'none', background: 'none',
                    color: t.primary, fontSize: fs.badge, fontWeight: '700',
                    cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  ver más
                </button>
              ) : null}
              {objetoExpandido ? (
                <button
                  type="button"
                  onClick={() => setObjetoExpandido(false)}
                  style={{
                    marginTop: '2px', padding: 0, border: 'none', background: 'none',
                    color: t.primary, fontSize: fs.badge, fontWeight: '700',
                    cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  ver menos
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ─── Slider fotos SICOE (acta RPO vigente) ────────────────────────────────────
const FOTOS_REFRESH_MS = 5 * 60 * 1000 // refresca cada 5 minutos

function SliderFotosActaVigente({ t, fs, contratoId, token }) {
  const [acta, setActa] = useState(null)
  const [fotos, setFotos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorApi, setErrorApi] = useState(false)
  const [errorHttp, setErrorHttp] = useState(null)
  const [sinActaPeriodo, setSinActaPeriodo] = useState(false)
  const [fuenteFotos, setFuenteFotos] = useState('acta_vigente')
  const [indice, setIndice] = useState(0)
  const [fade, setFade] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const timerRef = useRef(null)

  // Refresca las fotos cada 5 minutos silenciosamente
  useEffect(() => {
    if (!contratoId) return
    const iv = setInterval(() => setRefreshKey((k) => k + 1), FOTOS_REFRESH_MS)
    return () => clearInterval(iv)
  }, [contratoId])

  useEffect(() => {
    if (!contratoId) {
      setActa(null)
      setFotos([])
      setCargando(false)
      setErrorApi(false)
      setErrorHttp(null)
      setSinActaPeriodo(false)
      setFuenteFotos('acta_vigente')
      return
    }
    let cancelled = false
    // Solo mostrar spinner en la carga inicial (refreshKey === 0)
    if (refreshKey === 0) {
      setCargando(true)
      setIndice(0)
    }
    setErrorApi(false)
    setErrorHttp(null)
    setSinActaPeriodo(false)
    setFuenteFotos('acta_vigente')
    const h = token ? { Authorization: `Bearer ${token}` } : {}
    const sig = apiFetchSignal(60000)
    const fetchOpt = sig ? { headers: h, signal: sig } : { headers: h }
    fetch(`${API_BASE}/inicio/${contratoId}/fotos-acta-vigente?limit=200`, fetchOpt)
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) {
            setErrorHttp(401)
            setActa(null)
            setFotos([])
          }
          return null
        }
        if (!r.ok) {
          if (!cancelled) setErrorHttp(r.status)
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data) => {
        if (cancelled || !data) return
        setActa(data.acta || null)
        setFotos(Array.isArray(data.fotos) ? data.fotos : [])
        setSinActaPeriodo(!!data.sin_acta_en_periodo && !data.acta)
        setFuenteFotos(data.fuente || 'acta_vigente')
      })
      .catch((err) => {
        if (!cancelled) {
          setActa(null)
          setFotos([])
          const msg = String(err?.message || err || '')
          if (!/^HTTP \d+/.test(msg)) setErrorApi(true)
          logApiFailure(`inicio fotos contrato=${contratoId}`, err)
        }
      })
      .finally(() => {
        if (!cancelled) setCargando(false)
      })
    return () => { cancelled = true }
  }, [contratoId, token, refreshKey])

  const reiniciarTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (fotos.length < 2) return
    timerRef.current = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndice((i) => (i + 1) % fotos.length)
        setFade(true)
      }, 280)
    }, SLIDER_INTERVAL_MS)
  }

  useEffect(() => {
    if (fotos.length < 2) return undefined
    reiniciarTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fotos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const irA = (nuevoIndice) => {
    setFade(false)
    setTimeout(() => {
      setIndice(nuevoIndice)
      setFade(true)
    }, 180)
    reiniciarTimer()
  }

  const irAnterior = () => irA((indice - 1 + fotos.length) % fotos.length)
  const irSiguiente = () => irA((indice + 1) % fotos.length)

  const actual = fotos[indice]

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      minHeight: '280px',
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${t.border}`,
        background: `${t.primary}0c`,
      }}>
        <div style={{ fontSize: fs.badge, fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase', color: t.primary }}>
          📷 Obra en campo · SICOE
        </div>
        <div style={{ fontSize: fs.autor, color: t.textMuted, marginTop: '4px', lineHeight: 1.4 }}>
          {cargando
            ? 'Cargando fotos del acta vigente…'
            : errorHttp === 401
              ? 'Sesión expirada — vuelva a iniciar sesión'
              : errorHttp
                ? `Error del servidor (${errorHttp})`
                : errorApi
                  ? 'Sin conexión al API local (puerto 8000). Ejecute .\\dev-start.ps1'
                  : acta
                    ? `Acta RPO #${acta.numero_rpo ?? acta.id}${acta.fecha_inicio ? ` · ${String(acta.fecha_inicio).slice(0, 10)} → ${String(acta.fecha_fin || '').slice(0, 10)}` : ''}${fuenteFotos === 'contrato_recientes' ? ' · últimas fotos del contrato' : ''}`
                    : sinActaPeriodo
                      ? (fotos.length ? 'Últimas fotos del contrato (sin acta en período)' : 'Hoy no hay acta RPO en período')
                      : 'Buscando acta del contrato…'}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#0f172a', minHeight: 'min(400px, 52vh)' }}>
        {cargando && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: fs.sm }}>
            ⏳
          </div>
        )}
        {!cargando && !actual && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: fs.sm, lineHeight: 1.5 }}>
            {errorHttp === 401
              ? 'Cierre sesión e ingrese de nuevo para cargar el carrusel.'
              : errorHttp
                ? `El API respondió con error ${errorHttp}. Revise la ventana del backend (puerto 8000).`
                : errorApi
                  ? 'No hay backend en :8000. En la raíz del proyecto: .\\dev-start.ps1 (no use db.ps1 ni df.ps1 para probar en su PC).'
                  : acta
                    ? 'No hay registros SICOE con foto_url en este acta. Las imágenes están en Cloudinary pero el carrusel lee la URL guardada en cada registro al subir la foto en SICOE Obra.'
                    : sinActaPeriodo
                      ? 'No hay acta RPO vigente ni fotos recientes con URL en la base de datos de este contrato.'
                      : 'No se pudo resolver el acta del contrato.'}
          </div>
        )}
        {actual && (
          <>
            <img
              key={`${actual.url}-${indice}`}
              src={actual.url}
              alt={actual.observacion || 'Foto de obra'}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 'min(400px, 52vh)',
                maxHeight: 'min(56vh, 520px)',
                objectFit: 'cover',
                display: 'block',
                opacity: fade ? 1 : 0,
                transition: 'opacity 0.35s ease',
              }}
            />
            {fotos.length > 1 && (
              <div style={{
                position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(15,23,42,0.78)', borderRadius: '24px', padding: '5px 10px',
                userSelect: 'none',
              }}>
                <button
                  type="button"
                  onClick={irAnterior}
                  style={{
                    background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                    fontSize: '18px', lineHeight: 1, padding: '0 4px', opacity: 0.85,
                  }}
                  aria-label="Foto anterior"
                >‹</button>
                <span style={{ color: '#fff', fontSize: fs.autor, fontWeight: '700', minWidth: '70px', textAlign: 'center' }}>
                  {indice + 1} / {fotos.length}
                </span>
                <button
                  type="button"
                  onClick={irSiguiente}
                  style={{
                    background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                    fontSize: '18px', lineHeight: 1, padding: '0 4px', opacity: 0.85,
                  }}
                  aria-label="Foto siguiente"
                >›</button>
              </div>
            )}
          </>
        )}
      </div>

      {actual && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ fontSize: fs.sm, color: t.text, lineHeight: 1.5 }}>
            {textoPieFoto(actual)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ModuloInicio({
  t,
  usuario,
  fontSize = 'normal',
  puedePublicarNovedades = false,
  token = null,
  esContador = false,
  onIrSeguimiento,
}) {
  const [saludoVisible, setSaludoVisible] = useState(false)
  const [novedades, setNovedades] = useState([])
  const [novedadesCargando, setNovedadesCargando] = useState(true)
  const isMobile = useInicioMobile()
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
    const sig = apiFetchSignal(30000)
    fetch(`${API_BASE}/inicio/novedades`, {
      headers,
      ...(sig ? { signal: sig } : {}),
    })
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
  }, [usuario?.contrato_id])

  const contratoId = usuario?.contrato_id

  return (
    <div
      className="cc-inicio-root"
      style={{
        width: '100%',
        maxWidth: '1540px',
        margin: '0 auto',
        padding: isMobile ? '4px 0 32px' : '8px 0 48px',
        boxSizing: 'border-box',
      }}
    >

      {!esContador && (
        <>
          {/* ── Zona 1: clima ── */}
          <BarraClima t={t} fs={fs} contratoId={contratoId} token={token} />

          {/* ── Zona 2: saludo compacto | novedades (3 recientes) ── */}
          <div
            className="cc-inicio-saludo-novedades"
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'stretch',
              gap: isMobile ? '14px' : '12px',
              marginBottom: isMobile ? '14px' : '16px',
            }}
          >
            <div style={{
              flex: isMobile ? '1 1 auto' : '1 1 50%',
              width: isMobile ? '100%' : undefined,
              minWidth: 0,
            }}>
              <PanelSaludoContenidoDia
                t={t}
                fs={fs}
                usuario={usuario}
                saludoVisible={saludoVisible}
                compact
              />
            </div>
            <div style={{
              flex: isMobile ? '1 1 auto' : '1 1 50%',
              width: isMobile ? '100%' : undefined,
              minWidth: 0,
            }}>
              <BandejaNovedadesInicio
                novedades={novedades}
                setNovedades={setNovedades}
                t={t}
                fs={fs}
                novedadesCargando={novedadesCargando}
                token={token}
                puedePublicarNovedades={puedePublicarNovedades}
                limite={3}
                compact
              />
            </div>
          </div>

          {/* ── Zona 3: calendario widget | carrete fotos (misma fila, igual ancho) ── */}
          <div
            className="cc-inicio-main-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              alignItems: 'stretch',
              gap: isMobile ? '14px' : '12px',
              marginBottom: isMobile ? '14px' : '16px',
            }}
          >
            <div className="cc-inicio-cal-col" style={{ minWidth: 0, display: 'flex' }}>
              <SeguimientoCalendarioPanel
                t={t}
                usuario={usuario}
                token={token}
                contratoId={contratoId}
                viewportCompact={isMobile}
                showFilters={false}
                widgetMode
              />
            </div>
            <div className="cc-inicio-fotos-col" style={{ minWidth: 0, display: 'flex' }}>
              <SliderFotosActaVigente t={t} fs={fs} contratoId={contratoId} token={token} />
            </div>
          </div>

          {/* ── Zona 4: ficha del contrato ── */}
          <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
            <FichaContrato t={t} fs={fs} contratoId={contratoId} token={token} />
          </div>
        </>
      )}

      {esContador && (
        <div style={{ maxWidth: '640px', margin: '0 auto 24px', padding: isMobile ? '0 4px' : 0 }}>
          <PanelSaludoContenidoDia t={t} fs={fs} usuario={usuario} saludoVisible={saludoVisible} />
          <p style={{
            textAlign: 'center',
            color: t.textMuted,
            fontSize: isMobile ? '16px' : fs.sm,
            marginTop: 16,
            lineHeight: 1.6,
          }}>
            Abre el menú ☰ (arriba a la derecha) y toca <strong>Contabilidad</strong> para gestionar transacciones, cuentas, cierres y reportes.
          </p>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: isMobile ? '24px' : '36px', textAlign: 'center', fontSize: fs.autor, color: t.textMuted, opacity: 0.5 }}>
        ClaraCore © {new Date().getFullYear()} — {esContador ? 'Contabilidad ClaraCore' : 'Plataforma de gestión de obra'}
      </div>

    </div>
  )
}
