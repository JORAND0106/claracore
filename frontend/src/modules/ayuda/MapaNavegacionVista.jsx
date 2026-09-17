import { useMemo, useState } from 'react'
import {
  MAPA_SUBTEMA_CAPACITACION_RC,
} from './mapaNavegacionCatalogo'
import CapacitacionReporteCantidadesWalkthrough from './CapacitacionReporteCantidadesWalkthrough'

/** @deprecated usar MAPA_SUBTEMA_CAPACITACION_RC */
export const MAPA_MODULO_CAPACITACION_RC = MAPA_SUBTEMA_CAPACITACION_RC

/**
 * Vista del mapa interactivo: 7 íconos de módulo; al clic se expanden
 * tarjetas de temas. Clic en tarjeta abre el video (o la capacitación RC).
 * Misma fuente para ícono de inicio y pestaña Mapa de Clara.
 */
export default function MapaNavegacionVista({
  t,
  grupos = [],
  compact = false,
  cargando = false,
  error = '',
  fuente = '',
}) {
  const [moduloActivoId, setModuloActivoId] = useState(null)
  const [videoTema, setVideoTema] = useState(null)
  const [capRcOpen, setCapRcOpen] = useState(false)

  const totalTemas = useMemo(
    () => grupos.reduce((acc, g) => acc + (g.modulos?.length || 0), 0),
    [grupos],
  )
  const moduloActivo = useMemo(
    () => grupos.find((g) => g.id === moduloActivoId) || null,
    [grupos, moduloActivoId],
  )

  function toggleModulo(id) {
    setModuloActivoId((prev) => (prev === id ? null : id))
  }

  function abrirCapacitacion(tema) {
    if (!tema) return
    if (tema.id === MAPA_SUBTEMA_CAPACITACION_RC) {
      setCapRcOpen(true)
      return
    }
    setVideoTema(tema)
  }

  if (cargando) {
    return (
      <div style={{ padding: compact ? 12 : 20, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
        Cargando mapa de funcionalidades…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        margin: compact ? 8 : 0,
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard,
        color: t.text,
        fontSize: 'var(--cc-sm)',
      }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 12 : 18,
      minHeight: 0,
    }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: compact ? 'var(--cc-md)' : 'var(--cc-h2)',
          fontWeight: 800,
          color: t.text,
          lineHeight: 1.25,
        }}>
          Mapa de funcionalidades ClaraCore
        </div>
        <p style={{
          margin: 0,
          fontSize: 'var(--cc-sm)',
          color: t.textMuted,
          lineHeight: 1.45,
          maxWidth: compact ? '100%' : 720,
        }}>
          {grupos.length} módulos · {totalTemas} temas de capacitación.
          Elija un módulo y pulse una tarjeta para abrir su video.
          Solo consulta: no abre pantallas ni cambia datos.
        </p>
        {fuente ? (
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            Fuente: {fuente}
          </div>
        ) : null}
      </header>

      <div
        role="tablist"
        aria-label="Módulos del mapa"
        style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(auto-fill, minmax(88px, 1fr))'
            : 'repeat(auto-fill, minmax(104px, 1fr))',
          gap: compact ? 8 : 10,
        }}
      >
        {grupos.map((grupo) => {
          const activo = moduloActivoId === grupo.id
          const nTemas = (grupo.modulos || []).length
          return (
            <button
              key={grupo.id}
              type="button"
              role="tab"
              aria-selected={activo}
              aria-expanded={activo}
              aria-controls={`mapa-temas-${grupo.id}`}
              id={`mapa-mod-${grupo.id}`}
              onClick={() => toggleModulo(grupo.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: compact ? '12px 8px' : '14px 10px',
                minHeight: compact ? 88 : 100,
                borderRadius: 14,
                border: `1.5px solid ${activo ? t.primary : t.border}`,
                background: activo ? `${t.primary}14` : t.bgCard,
                color: t.text,
                cursor: 'pointer',
                boxShadow: activo ? `0 0 0 2px ${t.primary}33` : 'none',
                transition: 'border-color 160ms ease, background 160ms ease, box-shadow 160ms ease',
              }}
            >
              <span aria-hidden style={{ fontSize: compact ? 28 : 32, lineHeight: 1 }}>
                {grupo.icono}
              </span>
              <span style={{
                fontWeight: 800,
                fontSize: 'var(--cc-caption)',
                textAlign: 'center',
                lineHeight: 1.25,
                color: activo ? t.primary : t.text,
              }}>
                {grupo.label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: t.textMuted }}>
                {nTemas} {nTemas === 1 ? 'tema' : 'temas'}
              </span>
            </button>
          )
        })}
      </div>

      {moduloActivo ? (
        <section
          id={`mapa-temas-${moduloActivo.id}`}
          role="tabpanel"
          aria-labelledby={`mapa-mod-${moduloActivo.id}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            background: t.bgCard,
            overflow: 'hidden',
            padding: compact ? 10 : 14,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span aria-hidden style={{ fontSize: 'var(--cc-lg)' }}>{moduloActivo.icono}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.text }}>
                {moduloActivo.label}
              </div>
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                Pulse una tarjeta para abrir su capacitación
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleModulo(moduloActivo.id)}
              aria-label={`Cerrar ${moduloActivo.label}`}
              style={{
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: t.textMuted,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: compact
              ? '1fr'
              : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: compact ? 8 : 10,
          }}>
            {(moduloActivo.modulos || []).map((mod) => {
              const esCapRc = mod.id === MAPA_SUBTEMA_CAPACITACION_RC
              const desc = mod.descripcion || mod.resumen || (
                esCapRc
                  ? 'Capacitación interactiva del asistente de creación.'
                  : 'Video de capacitación pendiente.'
              )
              const disponible = esCapRc || !!mod.videoUrl
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => abrirCapacitacion(mod)}
                  aria-label={`${mod.nombre}. Abrir capacitación`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 8,
                    textAlign: 'left',
                    padding: compact ? '12px' : '14px',
                    minHeight: compact ? 120 : 136,
                    borderRadius: 12,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.text,
                    cursor: 'pointer',
                    transition: 'border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
                    boxShadow: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = t.primary
                    e.currentTarget.style.boxShadow = `0 4px 14px ${t.primary}22`
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = t.border
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <span aria-hidden style={{ fontSize: 28, lineHeight: 1 }}>
                    {mod.icono || moduloActivo.icono}
                  </span>
                  <span style={{
                    fontWeight: 800,
                    fontSize: 'var(--cc-sm)',
                    lineHeight: 1.3,
                    color: t.text,
                  }}>
                    {mod.nombre}
                  </span>
                  <span style={{
                    fontSize: 'var(--cc-caption)',
                    color: t.textMuted,
                    lineHeight: 1.4,
                    flex: 1,
                  }}>
                    {desc}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: disponible ? t.primary : t.textMuted,
                  }}>
                    {esCapRc
                      ? '▶ Abrir capacitación interactiva'
                      : (mod.videoUrl ? '▶ Abrir video' : 'Video pendiente')}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        <div style={{
          border: `1px dashed ${t.border}`,
          borderRadius: 12,
          padding: compact ? '14px 12px' : '18px 16px',
          fontSize: 'var(--cc-sm)',
          color: t.textMuted,
          background: t.bgCard,
          textAlign: 'center',
        }}>
          Pulse un módulo para ver sus temas de capacitación.
        </div>
      )}

      {videoTema && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Capacitación: ${videoTema.nombre}`}
          onClick={() => setVideoTema(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100100,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(880px, 96vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 14,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderBottom: `1px solid ${t.border}`,
            }}>
              <span aria-hidden style={{ fontSize: 22 }}>{videoTema.icono}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.text }}>
                  {videoTema.nombre}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
                  {videoTema.descripcion || videoTema.resumen || 'Capacitación del mapa de funcionalidades'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVideoTema(null)}
                aria-label="Cerrar video"
                style={{
                  border: `1px solid ${t.border}`,
                  background: 'transparent',
                  color: t.textMuted,
                  borderRadius: 8,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 14, background: t.bg }}>
              {videoTema.videoUrl ? (
                <video
                  key={videoTema.videoUrl}
                  src={videoTema.videoUrl}
                  controls
                  autoPlay
                  preload="metadata"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '70vh',
                    borderRadius: 10,
                    background: '#000',
                  }}
                >
                  Su navegador no reproduce este video.
                </video>
              ) : (
                <div style={{
                  border: `1px dashed ${t.border}`,
                  borderRadius: 10,
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: t.textMuted,
                  fontSize: 'var(--cc-sm)',
                  lineHeight: 1.5,
                  background: t.bgCard,
                }}>
                  Video de capacitación pendiente.
                  <br />
                  Este tema ya está listo para alojarlo cuando esté publicado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CapacitacionReporteCantidadesWalkthrough
        t={t}
        open={capRcOpen}
        onClose={() => setCapRcOpen(false)}
      />
    </div>
  )
}
