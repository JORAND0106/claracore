/**
 * Capacitación interactiva nativa — asistente de creación de Reporte de Cantidades.
 * Mock visual temático (no modifica el modal real). Accesible desde el Mapa de Funcionalidades.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader, {
  CC_MODAL_FAVICON_SRC,
  claraCoreBrandTextColor,
} from '../../components/CcModalBrandHeader'
import {
  CAPACITACION_RC_DEMO as DEMO,
  CAPACITACION_RC_PASOS,
  CAPACITACION_RC_TABS,
  capacitacionRcEsIntro,
  capacitacionRcPasoPorIndice,
  capacitacionRcTabActivo,
  capacitacionRcTotalPasos,
} from './capacitacionReporteCantidadesScript'
import './capacitacionReporteCantidades.css'

const ACCENT = '#4dc4cc'

function demoVal(fill, key, placeholder = '') {
  return fill?.[key] ? DEMO[key] : placeholder
}

function MockField({ hot, label, children, t }) {
  return (
    <div className={`cc-cap-rc-field${hot ? ' is-hot' : ''}`} data-hot={hot || undefined}>
      <label className="cc-cap-rc-label" style={{ color: t.textMuted }}>{label}</label>
      {children}
    </div>
  )
}

function MockInput({ value, placeholder, t, as = 'input' }) {
  const style = {
    background: t.inputBg || t.bg,
    color: t.text,
    border: `1px solid ${t.inputBorder || t.border}`,
  }
  if (as === 'textarea') {
    return (
      <textarea
        className="cc-cap-rc-textarea"
        readOnly
        tabIndex={-1}
        value={value}
        placeholder={placeholder}
        style={style}
        aria-hidden
      />
    )
  }
  return (
    <input
      className="cc-cap-rc-input"
      readOnly
      tabIndex={-1}
      value={value}
      placeholder={placeholder}
      style={style}
      aria-hidden
    />
  )
}

function WizardMock({ t, paso }) {
  const tab = capacitacionRcTabActivo(paso)
  const hot = paso?.highlight || ''
  const fill = paso?.fillDemo || {}
  const zoom = Number(paso?.zoom) > 0 ? Number(paso.zoom) : 1

  return (
    <div className="cc-cap-rc-mock-wrap">
      <div
        className="cc-cap-rc-mock"
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          transform: `scale(${zoom})`,
        }}
        aria-hidden
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md, 15px)', color: t.text }}>
              🏗️ Nuevo Reporte de Cantidades
              <span style={{ marginLeft: 10, color: t.primary, fontWeight: 900 }}>#42</span>
            </div>
            <div style={{ fontSize: 'var(--cc-caption, 12px)', color: t.textMuted, marginTop: 2 }}>
              Capacitación · vista de demostración (no guarda datos)
            </div>
          </div>
        </div>

        <div
          className={`cc-cap-rc-tabs${hot === 'tabs' ? ' is-hot' : ''}`}
          style={{
            borderBottom: `1px solid ${t.border}`,
            padding: '0 10px',
            background: hot === 'tabs'
              ? `color-mix(in srgb, ${ACCENT} 12%, transparent)`
              : 'transparent',
            outline: hot === 'tabs' ? `2px solid ${ACCENT}` : 'none',
            outlineOffset: -2,
          }}
        >
          {CAPACITACION_RC_TABS.map((tb, i) => (
            <button
              key={tb.id}
              type="button"
              tabIndex={-1}
              className="cc-cap-rc-tab"
              style={{
                borderBottom: tab === i ? `2px solid ${t.primary}` : '2px solid transparent',
                fontWeight: tab === i ? 700 : 400,
                color: tab === i ? t.primary : i > tab ? t.border : t.textMuted,
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="cc-cap-rc-mock-body" style={{ background: t.bgCard }}>
          {tab === 0 && (
            <>
              <MockField hot={hot === 'descripcion'} label="DESCRIPCIÓN ACTIVIDAD *" t={t}>
                <MockInput
                  as="textarea"
                  t={t}
                  value={demoVal(fill, 'descripcion')}
                  placeholder="Nombre descriptivo del reporte..."
                />
              </MockField>
              <MockField hot={hot === 'subcontratista'} label="SUBCONTRATISTA *" t={t}>
                <MockInput
                  t={t}
                  value={demoVal(fill, 'subcontratista')}
                  placeholder="Buscar subcontratista..."
                />
              </MockField>
              <MockField hot={hot === 'inspector'} label="INSPECTOR *" t={t}>
                <MockInput
                  t={t}
                  value={demoVal(fill, 'inspector')}
                  placeholder="Buscar validador nivel 1..."
                />
              </MockField>
              <MockField hot={hot === 'capitulo'} label="CAPÍTULO *" t={t}>
                <MockInput
                  t={t}
                  value={demoVal(fill, 'capitulo')}
                  placeholder="Buscar capítulo..."
                />
                {fill.capitulo ? (
                  <div style={{ fontSize: 'var(--cc-label, 11px)', color: '#10B981' }}>
                    ✅ {DEMO.capitulo}
                  </div>
                ) : null}
              </MockField>
            </>
          )}

          {tab === 1 && (
            <MockField hot={hot === 'plantilla'} label="PLANTILLA DEL CAPÍTULO" t={t}>
              <div style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                background: t.bg,
              }}>
                {['Excavación — ítems estándar', 'Relleno compactado', '+ Crear Plantilla'].map((name, i) => {
                  const sel = fill.plantilla && i === 0
                  return (
                    <div
                      key={name}
                      style={{
                        padding: '10px 12px',
                        borderTop: i ? `1px solid ${t.border}` : 'none',
                        fontSize: 'var(--cc-sm, 13px)',
                        color: sel ? t.primary : t.text,
                        fontWeight: sel ? 700 : 500,
                        background: sel ? `${t.primary}14` : 'transparent',
                      }}
                    >
                      {sel ? '✓ ' : ''}{name}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 'var(--cc-caption, 12px)', color: t.textMuted, marginTop: 4 }}>
                Paso opcional: puede continuar sin plantilla.
              </div>
            </MockField>
          )}

          {tab === 2 && (
            <>
              <MockField hot={hot === 'loc-tipo'} label="TIPO DE LOCALIZACIÓN *" t={t}>
                <div className="cc-cap-rc-chip-row">
                  {[
                    { id: 'unica', label: 'Una sola' },
                    { id: 'multiple', label: 'Varias' },
                  ].map((opt) => {
                    const on = fill.locTipo && opt.id === 'unica'
                    return (
                      <span
                        key={opt.id}
                        className="cc-cap-rc-chip"
                        style={{
                          borderColor: on ? t.primary : t.border,
                          background: on ? `${t.primary}18` : t.bg,
                          color: on ? t.primary : t.text,
                        }}
                      >
                        {opt.label}
                      </span>
                    )
                  })}
                </div>
              </MockField>
              <MockField hot={hot === 'loc-pk'} label="PK EN EL PLANO *" t={t}>
                <MockInput t={t} value={demoVal(fill, 'pkId')} placeholder="PK-ID..." />
                <div
                  className="cc-cap-rc-map-stub"
                  style={{
                    marginTop: 8,
                    background: t.bg,
                    borderColor: t.border,
                    color: t.textMuted,
                  }}
                >
                  🗺️ Plano del contrato · clic para elegir PK
                </div>
              </MockField>
              <MockField hot={hot === 'loc-abscisas'} label="ABSCISAS Y NODOS" t={t}>
                <div className="cc-cap-rc-grid2">
                  <MockInput t={t} value={demoVal(fill, 'margen')} placeholder="Margen / costado" />
                  <MockInput t={t} value={demoVal(fill, 'absIni')} placeholder="Abs. inicial" />
                  <MockInput t={t} value={demoVal(fill, 'absFin')} placeholder="Abs. final" />
                  <MockInput t={t} value={demoVal(fill, 'nodoIni')} placeholder="Nodo inicial" />
                  <MockInput t={t} value={demoVal(fill, 'nodoFin')} placeholder="Nodo final" />
                </div>
              </MockField>
            </>
          )}

          {tab === 3 && (
            <>
              <MockField hot={hot === 'reg-agregar'} label="REGISTROS DEL REPORTE" t={t}>
                <div style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: 10,
                  background: t.bg,
                  fontSize: 'var(--cc-sm, 13px)',
                  color: t.text,
                }}>
                  {fill.registro ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span><strong>#1</strong> {DEMO.registroNombre}</span>
                      <span style={{ color: t.textMuted }}>Cant. —</span>
                    </div>
                  ) : (
                    <span style={{ color: t.textMuted }}>Sin registros aún</span>
                  )}
                </div>
                <div className="cc-cap-rc-footer-bar">
                  <span
                    className={`cc-cap-rc-btn${hot === 'reg-agregar' ? ' is-hot' : ''}`}
                    style={{ background: t.primary, color: '#fff' }}
                  >
                    + Agregar actividad
                  </span>
                </div>
              </MockField>
              <MockField hot={hot === 'reg-dimensiones'} label="DIMENSIONES" t={t}>
                <div className="cc-cap-rc-grid2">
                  <MockInput t={t} value={demoVal(fill, 'longitud')} placeholder="Longitud" />
                  <MockInput t={t} value={demoVal(fill, 'ancho')} placeholder="Ancho" />
                  <MockInput t={t} value={demoVal(fill, 'espesor')} placeholder="Espesor" />
                  <MockInput t={t} value={fill.dimensiones ? '12.00 m³' : ''} placeholder="Cantidad" />
                </div>
              </MockField>
              <MockField hot={hot === 'reg-foto'} label="OBSERVACIÓN · FOTO · GRÁFICOS" t={t}>
                <MockInput
                  as="textarea"
                  t={t}
                  value={demoVal(fill, 'observacion')}
                  placeholder="Observación de campo..."
                />
                <div className="cc-cap-rc-chip-row" style={{ marginTop: 8 }}>
                  <span
                    className="cc-cap-rc-chip"
                    style={{
                      borderColor: fill.foto ? '#10B981' : t.border,
                      background: fill.foto ? 'rgba(16,185,129,0.12)' : t.bg,
                      color: fill.foto ? '#059669' : t.textMuted,
                    }}
                  >
                    {fill.foto ? '📷 Foto cargada' : '📷 Foto de obra'}
                  </span>
                  <span
                    className="cc-cap-rc-chip"
                    style={{ borderColor: t.border, background: t.bg, color: t.textMuted }}
                  >
                    📈 Gráficos del lote
                  </span>
                </div>
              </MockField>
            </>
          )}

          {tab === 4 && (
            <MockField hot={hot === 'topo-tabla'} label="PUNTOS TOPOGRÁFICOS DE PORTADA" t={t}>
              <div style={{
                overflowX: 'auto',
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                background: t.bg,
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--cc-caption, 12px)',
                  color: t.text,
                }}>
                  <thead>
                    <tr style={{ color: t.textMuted, textAlign: 'left' }}>
                      {['Punto', 'Norte', 'Este', 'Cota', 'Descripción'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '8px 10px' }}>{fill.topo ? DEMO.topoPunto : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{fill.topo ? DEMO.norte : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{fill.topo ? DEMO.este : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{fill.topo ? DEMO.cota : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{fill.topo ? DEMO.topoDesc : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="cc-cap-rc-chip-row" style={{ marginTop: 8 }}>
                <span className="cc-cap-rc-chip" style={{ borderColor: t.border, background: t.bg, color: t.textMuted }}>
                  ⬆ Importar CSV
                </span>
              </div>
            </MockField>
          )}

          <div className="cc-cap-rc-footer-bar">
            {tab < 4 ? (
              <span
                className={`cc-cap-rc-btn${fill.siguiente || hot === 'tabs' ? ' is-hot' : ''}`}
                style={{
                  background: fill.siguiente || tab > 0 ? t.primary : t.border,
                  color: fill.siguiente || tab > 0 ? '#fff' : t.textMuted,
                  opacity: fill.siguiente || tab > 0 ? 1 : 0.7,
                }}
              >
                Siguiente →
              </span>
            ) : (
              <span
                className={`cc-cap-rc-btn${hot === 'enviar' ? ' is-hot' : ''}`}
                style={{
                  background: fill.enviado || hot === 'enviar' ? '#16a34a' : t.primary,
                  color: '#fff',
                }}
              >
                {fill.enviado ? '✓ Enviado · fuera de Borrador' : '✅ Guardar y Enviar'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function IntroStage({ t, paso }) {
  const showWord = paso?.id === 'lockup' || paso?.id === 'hold'
  const showLine = paso?.id === 'hold'
  const brandColor = claraCoreBrandTextColor(t)

  return (
    <div className="cc-cap-rc-intro" style={{ color: t.text }}>
      <div className="cc-cap-rc-intro-lockup">
        <img
          key={paso?.id}
          className="cc-cap-rc-intro-logo"
          src={CC_MODAL_FAVICON_SRC}
          alt=""
          width={72}
          height={72}
          draggable={false}
        />
        {showWord ? (
          <span className="cc-cap-rc-intro-word" style={{ color: brandColor }}>
            ClaraCore
          </span>
        ) : null}
      </div>
      {showLine ? (
        <>
          <div className="cc-cap-rc-intro-line" />
          <div className="cc-cap-rc-intro-sub" style={{ color: t.primary || ACCENT }}>
            Capacitación
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * @param {{ t: object, open: boolean, onClose: () => void, autoPlay?: boolean }} props
 */
export default function CapacitacionReporteCantidadesWalkthrough({
  t,
  open,
  onClose,
  autoPlay = true,
}) {
  const total = capacitacionRcTotalPasos()
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)

  const paso = useMemo(() => capacitacionRcPasoPorIndice(idx), [idx])
  const progress = ((idx + 1) / total) * 100

  useEffect(() => {
    if (!open) return undefined
    setIdx(0)
    setPlaying(autoPlay)
    return undefined
  }, [open, autoPlay])

  useEffect(() => {
    if (!open || !playing) return undefined
    const ms = Math.max(800, Number(paso?.durMs) || 3000)
    const timer = window.setTimeout(() => {
      setIdx((i) => {
        if (i >= total - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, ms)
    return () => window.clearTimeout(timer)
  }, [open, playing, idx, paso?.durMs, total])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowRight') {
        setPlaying(false)
        setIdx((i) => Math.min(total - 1, i + 1))
      }
      if (e.key === 'ArrowLeft') {
        setPlaying(false)
        setIdx((i) => Math.max(0, i - 1))
      }
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, total])

  const goPrev = useCallback(() => {
    setPlaying(false)
    setIdx((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setPlaying(false)
    setIdx((i) => Math.min(total - 1, i + 1))
  }, [total])

  const replay = useCallback(() => {
    setIdx(0)
    setPlaying(true)
  }, [])

  if (!open) return null

  const intro = capacitacionRcEsIntro(paso)
  const btnGhost = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    color: t.text,
  }
  const btnPrimary = {
    background: t.primary,
    border: `1px solid ${t.primary}`,
    color: '#fff',
  }

  return (
    <div
      className="cc-cap-rc-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Capacitación interactiva: Reporte de Cantidades"
      style={{ ['--cc-cap-accent']: ACCENT }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className="cc-cap-rc-shell"
        style={{ background: t.bgCard, border: `1px solid ${t.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 14px',
          borderBottom: `1px solid ${t.border}`,
          background: t.headerBg || t.bgCard,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm, 13px)', color: t.text }}>
              Capacitación · Reporte de Cantidades
            </div>
            <div style={{ fontSize: 'var(--cc-caption, 12px)', color: t.textMuted }}>
              Paso {idx + 1} de {total}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar capacitación"
            style={{
              ...btnGhost,
              borderRadius: 8,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            ✕
          </button>
        </div>

        <div className="cc-cap-rc-stage" style={{ background: t.bg }}>
          {intro ? <IntroStage t={t} paso={paso} /> : <WizardMock t={t} paso={paso} />}
        </div>

        <div
          className="cc-cap-rc-coach"
          style={{
            borderTopColor: t.border,
            background: t.headerBg || t.bgCard,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-sm, 13px)', color: t.primary }}>
              {paso?.titulo}
            </div>
            <p style={{
              margin: '4px 0 0',
              fontSize: 'var(--cc-sm, 13px)',
              color: t.text,
              lineHeight: 1.45,
            }}>
              {paso?.narracion}
            </p>
          </div>

          <div className="cc-cap-rc-coach-progress">
            <div className="cc-cap-rc-coach-bar" style={{ background: t.border }} aria-hidden>
              <span style={{ width: `${progress}%`, background: ACCENT }} />
            </div>
            <span style={{ fontSize: 'var(--cc-caption, 12px)', color: t.textMuted, flexShrink: 0 }}>
              {Math.round(progress)}%
            </span>
          </div>

          <div className="cc-cap-rc-coach-actions">
            <button type="button" onClick={goPrev} disabled={idx === 0} style={{
              ...btnGhost,
              opacity: idx === 0 ? 0.45 : 1,
              cursor: idx === 0 ? 'default' : 'pointer',
            }}>
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              style={playing ? btnGhost : btnPrimary}
            >
              {playing ? 'Pausar' : idx >= total - 1 ? 'Reanudar' : 'Reproducir'}
            </button>
            <button type="button" onClick={goNext} disabled={idx >= total - 1} style={{
              ...btnGhost,
              opacity: idx >= total - 1 ? 0.45 : 1,
              cursor: idx >= total - 1 ? 'default' : 'pointer',
            }}>
              Siguiente →
            </button>
            <button type="button" onClick={replay} style={btnGhost}>
              ↺ Reiniciar
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={btnPrimary}>
              {idx >= total - 1 ? 'Listo' : 'Cerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Botón de acceso desde el mapa de funcionalidades. */
export function CapacitacionReporteCantidadesLaunchButton({ t, onClick, compact = false }) {
  return (
    <button
      type="button"
      className="cc-cap-rc-launch"
      onClick={onClick}
      style={{
        ['--cc-cap-accent']: ACCENT,
        background: `color-mix(in srgb, ${t.primary} 14%, ${t.bgCard})`,
        borderColor: t.primary,
        color: t.primary,
        alignSelf: compact ? 'stretch' : 'flex-start',
        width: compact ? '100%' : undefined,
      }}
    >
      <span aria-hidden>🎬</span>
      Iniciar capacitación interactiva
    </button>
  )
}

export { CAPACITACION_RC_PASOS }
