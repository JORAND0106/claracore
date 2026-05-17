import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { API_BASE, logApiFailure } from './apiBase'
import { getClaraTypeScaleInline } from './typographyScale'
import { eligeFraseInicio, fraseInicioEsValida } from './data/frasesInicioCuradas.js'

const API_FRASE = `${API_BASE}/frase-del-dia`
const SLIDER_INTERVAL_MS = 5000

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

// ─── Frase del día (autores y Biblia) ─────────────────────────────────────────
function FraseDelDia({ t, fs, usuario }) {
  const storageKey = `claracore_frase_v2_${usuario?.id || 'guest'}`
  const [estado, setEstado] = useState('visible')
  const [frase, setFrase] = useState(() => eligeFraseInicio())
  const [visible, setVisible] = useState(false)

  const aplicarFrase = useCallback((parsed) => {
    if (!fraseInicioEsValida(parsed)) return
    setFrase(parsed)
    setEstado('visible')
    setVisible(false)
    setTimeout(() => setVisible(true), 80)
    try {
      localStorage.setItem(storageKey, JSON.stringify({ fecha: hoyISO(), frase: parsed }))
    } catch { /* ignore */ }
  }, [storageKey])

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (guardado?.frase?.frase && guardado?.fecha === hoyISO() && fraseInicioEsValida(guardado.frase)) {
        aplicarFrase(guardado.frase)
        return
      }
    } catch { /* ignore */ }
    aplicarFrase(eligeFraseInicio())
  }, [storageKey, aplicarFrase])

  const generarFrase = async () => {
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
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        if (fraseInicioEsValida(data)) {
          aplicarFrase(data)
          return
        }
      }
    } catch { /* local */ }
    aplicarFrase(eligeFraseInicio(frase?.frase))
  }

  const TIPO_COLOR = { reflexiva: '#8B5CF6', motivadora: '#10B981', 'bíblica': '#F59E0B' }
  const TIPO_ICONO = { reflexiva: '💡', motivadora: '🚀', 'bíblica': '📖' }
  const TIPO_TEXTO = { reflexiva: 'Reflexión del día', motivadora: 'Frase motivadora', 'bíblica': 'Versículo del día' }

  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: '12px', padding: '16px 20px',
    }}>
      {estado === 'cargando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: '20px', display: 'inline-block', animation: 'spin 1.2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: fs.base, color: t.textMuted }}>Cargando frase…</div>
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
                fontSize: fs.card, fontWeight: '400', color: t.text,
                lineHeight: 1.55, fontStyle: 'italic', marginBottom: '8px',
              }}>
                «{frase.frase}»
              </div>
              <div style={{ fontSize: fs.autor, color: t.textMuted, fontWeight: '600' }}>— {frase.autor}</div>
            </div>
          </div>
          <div style={{ marginTop: '10px', textAlign: 'right' }}>
            <button type="button" onClick={generarFrase} style={{
              background: 'transparent', border: 'none',
              fontSize: fs.autor, color: t.primary, cursor: 'pointer', fontWeight: '600',
            }}>🔄 Otra frase</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Slider fotos SICOE (acta RPO vigente) ────────────────────────────────────
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
  const timerRef = useRef(null)

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
    setCargando(true)
    setIndice(0)
    setErrorApi(false)
    setErrorHttp(null)
    setSinActaPeriodo(false)
    setFuenteFotos('acta_vigente')
    const h = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${API_BASE}/inicio/${contratoId}/fotos-acta-vigente`, { headers: h })
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
  }, [contratoId, token])

  useEffect(() => {
    if (fotos.length < 2) return undefined
    timerRef.current = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndice((i) => (i + 1) % fotos.length)
        setFade(true)
      }, 280)
    }, SLIDER_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fotos.length])

  const actual = fotos[indice]

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 'min(520px, 72vh)',
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
                position: 'absolute', top: '10px', right: '10px',
                background: 'rgba(15,23,42,0.75)', color: '#fff',
                fontSize: fs.autor, fontWeight: '700', borderRadius: '20px', padding: '4px 10px',
              }}>
                {indice + 1} / {fotos.length}
              </div>
            )}
          </>
        )}
      </div>

      {actual && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ fontSize: fs.autor, fontWeight: '700', color: t.primary, marginBottom: '6px', lineHeight: 1.35 }}>
            📍 {actual.ubicacion || 'Ubicación no indicada'}
            {actual.numero_registro != null && (
              <span style={{ color: t.textMuted, fontWeight: '500' }}> · Reg. #{actual.numero_registro}</span>
            )}
          </div>
          <div style={{ fontSize: fs.sm, color: t.text, lineHeight: 1.5 }}>
            {actual.observacion
              ? actual.observacion
              : <span style={{ color: t.textMuted, fontStyle: 'italic' }}>Sin observación en el registro.</span>}
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
  }, [usuario?.contrato_id])

  const contratoId = usuario?.contrato_id
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

      {/* ── Frase + novedades (izq) · Carrusel fotos SICOE acta vigente (der) ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        alignItems: 'stretch',
        marginBottom: '20px',
      }}>
        <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FraseDelDia t={t} fs={fs} usuario={usuario} />
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
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <SliderFotosActaVigente t={t} fs={fs} contratoId={contratoId} token={token} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '36px', textAlign: 'center', fontSize: fs.autor, color: t.textMuted, opacity: 0.5 }}>
        ClaraCore © {new Date().getFullYear()} — Plataforma de gestión de obra
      </div>

    </div>
  )
}
