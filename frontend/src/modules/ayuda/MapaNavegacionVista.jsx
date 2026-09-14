import { useMemo, useState } from 'react'
import {
  MAPA_SUBTEMA_CAPACITACION_RC,
} from './mapaNavegacionCatalogo'
import CapacitacionReporteCantidadesWalkthrough, {
  CapacitacionReporteCantidadesLaunchButton,
} from './CapacitacionReporteCantidadesWalkthrough'

/** @deprecated usar MAPA_SUBTEMA_CAPACITACION_RC */
export const MAPA_MODULO_CAPACITACION_RC = MAPA_SUBTEMA_CAPACITACION_RC

/**
 * Vista índice del mapa interactivo (informativa; sin deep links).
 * Misma fuente/estructura para el módulo lateral (ícono inicio) y la pestaña Mapa de Clara.
 */
export default function MapaNavegacionVista({
  t,
  grupos = [],
  compact = false,
  cargando = false,
  error = '',
  fuente = '',
}) {
  const [abiertoId, setAbiertoId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [capRcOpen, setCapRcOpen] = useState(false)

  const totalSubtemas = useMemo(
    () => grupos.reduce((acc, g) => acc + (g.modulos?.length || 0), 0),
    [grupos],
  )
  const totalSecciones = grupos.length

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
          {totalSecciones} secciones · {totalSubtemas} subtemas. Solo consulta:
          no abre pantallas ni cambia datos. Cada subtema es un punto de entrada
          para su capacitación (texto, pantallazos o video) cuando esté lista.
        </p>
        {fuente ? (
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            Fuente: {fuente}
          </div>
        ) : null}
      </header>

      {grupos.map((grupo) => (
        <section key={grupo.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--cc-label)',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: t.primary,
          }}>
            <span aria-hidden style={{ fontSize: 'var(--cc-md)', letterSpacing: 0, textTransform: 'none' }}>
              {grupo.icono || ''}
            </span>
            {grupo.label}
            <span style={{
              marginLeft: 'auto',
              fontSize: 'var(--cc-caption)',
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: 'none',
              color: t.textMuted,
            }}>
              {(grupo.modulos || []).length} subtemas
            </span>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            background: t.bgCard,
          }}>
            {(grupo.modulos || []).map((mod, idx) => {
              const abierto = abiertoId === mod.id
              const esCapRc = mod.id === MAPA_SUBTEMA_CAPACITACION_RC
              return (
                <div
                  key={mod.id}
                  style={{
                    borderTop: idx === 0 ? 'none' : `1px solid ${t.border}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAbiertoId(abierto ? null : mod.id)}
                    aria-expanded={abierto}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: compact ? '10px 12px' : '12px 14px',
                      background: abierto ? `${t.primary}10` : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: t.text,
                      minHeight: 48,
                    }}
                  >
                    <span aria-hidden style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      marginTop: 6,
                      flexShrink: 0,
                      background: abierto ? t.primary : t.border,
                    }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'block',
                        fontWeight: 700,
                        fontSize: 'var(--cc-sm)',
                        lineHeight: 1.35,
                      }}>
                        {mod.nombre}
                      </span>
                      {!abierto && (
                        <span style={{
                          display: 'block',
                          marginTop: 3,
                          fontSize: 'var(--cc-caption)',
                          color: t.textMuted,
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {mod.descripcion
                            || (esCapRc
                              ? 'Capacitación interactiva disponible'
                              : (mod.contenidoPendiente ? 'Capacitación pendiente' : 'Contenido disponible'))}
                        </span>
                      )}
                    </span>
                    <span style={{
                      color: t.textMuted,
                      fontSize: 'var(--cc-sm)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}>
                      {abierto ? '▾' : '▸'}
                    </span>
                  </button>

                  {abierto && (
                    <div style={{
                      padding: compact ? '0 12px 12px 30px' : '0 14px 14px 32px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      <p style={{
                        margin: 0,
                        fontSize: 'var(--cc-sm)',
                        color: t.text,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {mod.descripcion
                          || (esCapRc
                            ? 'Asistente de creación de reportes de cantidades: Info General, Plantilla, Localización, Registros y Topografía.'
                            : 'Aún no hay descripción educativa para este subtema. Se publicará aquí cuando esté lista.')}
                      </p>

                      {esCapRc ? (
                        <CapacitacionReporteCantidadesLaunchButton
                          t={t}
                          compact={compact}
                          onClick={() => setCapRcOpen(true)}
                        />
                      ) : null}

                      {mod.videoUrl ? (
                        <div style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: t.bg,
                        }}>
                          <video
                            src={mod.videoUrl}
                            controls
                            preload="metadata"
                            style={{ display: 'block', width: '100%', maxHeight: 280 }}
                          >
                            Su navegador no reproduce este video.
                          </video>
                        </div>
                      ) : (
                        <div style={{
                          border: `1px dashed ${t.border}`,
                          borderRadius: 10,
                          padding: '10px 12px',
                          fontSize: 'var(--cc-caption)',
                          color: t.textMuted,
                          background: t.bg,
                        }}>
                          Video de capacitación — pendiente (este subtema ya está listo para alojarlo).
                        </div>
                      )}

                      {(mod.imagenes || []).length > 0 ? (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: compact
                            ? '1fr'
                            : 'repeat(auto-fill, minmax(180px, 1fr))',
                          gap: 8,
                        }}>
                          {mod.imagenes.map((img, i) => (
                            <button
                              key={`${mod.id}-img-${i}`}
                              type="button"
                              onClick={() => setLightbox(img)}
                              style={{
                                border: `1px solid ${t.border}`,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: t.bg,
                                padding: 0,
                                cursor: 'zoom-in',
                                textAlign: 'left',
                              }}
                            >
                              <img
                                src={img.url}
                                alt={img.caption || `Pantallazo de ${mod.nombre}`}
                                loading="lazy"
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  height: compact ? 140 : 120,
                                  objectFit: 'cover',
                                }}
                              />
                              {img.caption ? (
                                <div style={{
                                  padding: '6px 8px',
                                  fontSize: 'var(--cc-caption)',
                                  color: t.textMuted,
                                }}>
                                  {img.caption}
                                </div>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pantallazo ampliado"
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100100,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightbox.url}
            alt={lightbox.caption || 'Pantallazo'}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'min(1100px, 96vw)',
              maxHeight: '90vh',
              borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
              objectFit: 'contain',
              background: '#111',
            }}
          />
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
