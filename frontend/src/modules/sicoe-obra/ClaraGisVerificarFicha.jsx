/**
 * Vista "Verificar" ClaraGIS: ítems → registros → ficha de lectura.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { listaFotosRegistro } from './sicoeFotosHelpers'
import { listaGraficosRegistro } from './sicoeGraficosHelpers'
import {
  sicoeCorteNumeroDeRegistro,
  sicoeNombreSubcontratistaRegistro,
} from './sicoeRegistroSubcontratista'
import { agruparRegistrosPorItem, pastelDeEstadoValidacion } from './sicoeReporteItemsTablaHelpers'
import { fmtCantidadConDimensiones } from './sicoeCantidadDimensiones'
import { formatearCantidadTotal } from './sicoeCantidadRedondeo'
import {
  buildSlidesMediaVerificar,
  compararCantidadConDibujo,
  fmtAbscisaCostado,
  fmtCantidadVerificar,
  fmtCostoDirectoVerificar,
  indiceRegistroPorId,
  indiceSiguientePendiente,
  lineaItemVerificar,
  puedeMostrarBotonesValidacion,
  semaforoNivelesRegistro,
  textoSelladoRegistro,
} from './claraGisVerificarHelpers'

function IconBtn({ title, onClick, children, disabled, accent, size = 44 }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e?.stopPropagation?.()
        onClick?.(e)
      }}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 12,
        border: '1px solid transparent',
        background: accent || 'transparent',
        color: accent ? '#fff' : 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: size >= 52 ? 28 : 18,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function PanelSecundario({ t, titulo, onClose, children }) {
  return (
    <div
      role="dialog"
      aria-label={titulo}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        background: t.card || t.bg || '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', flex: 1 }}>{titulo}</div>
        <IconBtn title="Cerrar" onClick={onClose} size={40}>✕</IconBtn>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 'var(--cc-md)', lineHeight: 1.45 }}>
        {children}
      </div>
    </div>
  )
}

function SemaforoMini({ reg, nivelesActivos, encabezadosNivel, t }) {
  const dots = semaforoNivelesRegistro(reg, nivelesActivos, encabezadosNivel)
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title={dots.map((d) => `${d.label}:${d.estado}`).join(' · ')}>
      {dots.map((d) => (
        <span
          key={d.nivel}
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: d.color,
            boxShadow: `0 0 0 1px ${t.border || '#334155'}`,
          }}
        />
      ))}
    </span>
  )
}

export default function ClaraGisVerificarFicha({
  t,
  registros = [],
  reporte,
  registroId = null,
  onRegistroChange,
  onCambiarModo,
  estadoMiNivel,
  puedeValidarRapido,
  onAprobar,
  onPedirComentario,
  ejecutando = false,
  nivelesActivos = [1, 2, 3],
  encabezadosNivel = {},
  nivelesContrato = null,
}) {
  const regsAll = Array.isArray(registros) ? registros : []
  const filasItem = useMemo(() => agruparRegistrosPorItem(regsAll), [regsAll])

  const [nivelNav, setNivelNav] = useState('items') // items | regs | ficha
  const [itemKey, setItemKey] = useState(null)
  const [idx, setIdx] = useState(0)
  const [slideIdx, setSlideIdx] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const [lightboxZoom, setLightboxZoom] = useState(1)
  const [itemDetalle, setItemDetalle] = useState(false)
  const [panel, setPanel] = useState(null)
  const [tipNivel, setTipNivel] = useState(null)
  const touchX = useRef(null)

  const regsItem = useMemo(() => {
    const fila = filasItem.find((f) => f.itemNum === itemKey)
    return fila?.regs || []
  }, [filasItem, itemKey])

  // Deep-link / foco desde plano: abrir ficha del registro.
  useEffect(() => {
    if (registroId == null || !regsAll.length) return
    const reg = regsAll.find((r) => String(r.id) === String(registroId))
    if (!reg) return
    const key = String(reg.item_numero || '').trim()
    if (!key) return
    setItemKey(key)
    const i = indiceRegistroPorId(
      (filasItem.find((f) => f.itemNum === key)?.regs) || [],
      registroId,
    )
    setIdx(i)
    setNivelNav('ficha')
  }, [registroId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSlideIdx(0)
    setPanel(null)
    setItemDetalle(false)
    setTipNivel(null)
  }, [idx, nivelNav])

  const reg = nivelNav === 'ficha' ? (regsItem[idx] || null) : null
  const total = regsItem.length

  const irA = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= total) return
    setIdx(nextIdx)
    const r = regsItem[nextIdx]
    if (r?.id != null) onRegistroChange?.(r.id)
  }

  const abrirItem = (key) => {
    setItemKey(key)
    setNivelNav('regs')
    setIdx(0)
  }

  const abrirRegistro = (r, i) => {
    setIdx(i)
    setNivelNav('ficha')
    if (r?.id != null) onRegistroChange?.(r.id)
  }

  const volver = () => {
    if (nivelNav === 'ficha') {
      setNivelNav('regs')
      return
    }
    if (nivelNav === 'regs') {
      setNivelNav('items')
      setItemKey(null)
    }
  }

  const slides = useMemo(() => {
    if (!reg) return []
    return buildSlidesMediaVerificar(listaFotosRegistro(reg), listaGraficosRegistro(reg))
  }, [reg])

  const slide = slides[slideIdx] || null

  const comparacion = useMemo(
    () => (reg ? compararCantidadConDibujo(reg, reporte?.dibujo_geojson || reporte?.perimetro_geojson) : null),
    [reg, reporte?.dibujo_geojson, reporte?.perimetro_geojson],
  )

  const semaforo = useMemo(
    () => (reg ? semaforoNivelesRegistro(reg, nivelesActivos, encabezadosNivel) : []),
    [reg, nivelesActivos, encabezadosNivel],
  )

  const puedeDecidir = !!(reg && puedeMostrarBotonesValidacion(reg, {
    puedeValidarRapido,
    estadoMiNivel,
  }))
  const estadoYo = reg && typeof estadoMiNivel === 'function' ? estadoMiNivel(reg) : 'No Revisado'
  const selladoTip = textoSelladoRegistro(reg, nivelesContrato)
  const subNombre = sicoeNombreSubcontratistaRegistro({ registro: reg, reporte }) || 'Sin subcontratista'
  const corteNum = sicoeCorteNumeroDeRegistro({ registro: reg, reporte })
  const abscisaTxt = fmtAbscisaCostado(reg)

  const trasDecision = () => {
    const next = indiceSiguientePendiente(regsItem, idx, {
      estadoMiNivel,
      puedeValidar: puedeValidarRapido,
      omitirIds: reg?.id != null ? [reg.id] : [],
    })
    if (next >= 0 && next !== idx) irA(next)
  }

  const aprobar = () => {
    if (!reg || !puedeDecidir) return
    onAprobar?.([reg.id])
    setTimeout(trasDecision, 80)
  }

  const rechazar = () => {
    if (!reg || !puedeDecidir) return
    onPedirComentario?.('Rechazado', [reg.id])
  }

  const textMain = t.text || '#e2e8f0'
  const muted = t.textMuted || '#94a3b8'
  const border = t.border || '#334155'
  const cardBg = t.card || t.bgSecondary || '#111827'

  const fmtNum = (v) => {
    try {
      return formatearCantidadTotal(v, { locale: true, empty: '—' })
    } catch {
      return String(v ?? '—')
    }
  }
  const fmtPesos = (v) => fmtCostoDirectoVerificar(v)

  // ── Nivel 1: ítems ──
  if (nivelNav === 'items') {
    return (
      <div className="cc-claragis-verificar" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: textMain }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 10px', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', flex: 1 }}>Ítems del reporte</div>
          <IconBtn title="Editar (formulario completo)" onClick={() => onCambiarModo?.('editar')} size={42}>✏️</IconBtn>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!filasItem.length ? (
            <div style={{ padding: 16, color: muted }}>No hay registros con ítem.</div>
          ) : filasItem.map((fila) => (
            <button
              key={fila.itemNum}
              type="button"
              onClick={() => abrirItem(fila.itemNum)}
              style={{
                textAlign: 'left',
                background: cardBg,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: textMain,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-md)', marginBottom: 4 }}>
                {fila.itemNum}
              </div>
              <div style={{
                fontSize: 'var(--cc-sm)',
                color: muted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 8,
              }}>
                {fila.descripcion}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 'var(--cc-sm)', fontWeight: 700 }}>
                <span>Cant {fmtNum(fila.sumCant)} {fila.unidad}</span>
                <span style={{ color: '#16a34a' }}>{fmtPesos(fila.sumCd)}</span>
                <span style={{ color: muted, fontWeight: 600 }}>{fila.regs.length} reg.</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Nivel 2: registros del ítem ──
  if (nivelNav === 'regs') {
    const fila = filasItem.find((f) => f.itemNum === itemKey)
    return (
      <div className="cc-claragis-verificar" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: textMain }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px 10px', flexShrink: 0 }}>
          <IconBtn title="Volver a ítems" onClick={volver} size={40}>←</IconBtn>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {itemKey}
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fila?.descripcion || ''}
            </div>
          </div>
          <IconBtn title="Editar (formulario completo)" onClick={() => onCambiarModo?.('editar')} size={42}>✏️</IconBtn>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr style={{ color: muted, textAlign: 'left' }}>
                <th style={{ padding: '6px 4px', fontWeight: 700 }}>#</th>
                <th style={{ padding: '6px 4px', fontWeight: 700 }}>Cantidad</th>
                <th style={{ padding: '6px 4px', fontWeight: 700 }}>CD</th>
                <th style={{ padding: '6px 4px', fontWeight: 700 }}>Val.</th>
              </tr>
            </thead>
            <tbody>
              {regsItem.map((r, i) => {
                const pastel = pastelDeEstadoValidacion(estadoMiNivel?.(r) || 'No Revisado')
                return (
                  <tr
                    key={r.id}
                    onClick={() => abrirRegistro(r, i)}
                    style={{
                      cursor: 'pointer',
                      background: pastel.bg !== 'transparent' ? pastel.bg : 'transparent',
                      borderBottom: `1px solid ${border}`,
                      height: 36,
                    }}
                  >
                    <td style={{ padding: '4px 4px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {r.numero_registro ?? '—'}
                    </td>
                    <td style={{
                      padding: '4px 4px',
                      fontFamily: 'ui-monospace, Consolas, monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 140,
                    }}>
                      {fmtCantidadConDimensiones(r)}
                    </td>
                    <td style={{
                      padding: '4px 4px',
                      fontWeight: 700,
                      color: '#16a34a',
                      whiteSpace: 'nowrap',
                    }}>
                      {fmtPesos(r.costo_directo)}
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <SemaforoMini
                        reg={r}
                        nivelesActivos={nivelesActivos}
                        encabezadosNivel={encabezadosNivel}
                        t={t}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── Nivel 3: ficha ──
  if (!reg) {
    return (
      <div style={{ padding: 16, color: muted }}>
        Registro no encontrado.
        <div style={{ marginTop: 8 }}>
          <IconBtn title="Volver" onClick={volver} size={40}>←</IconBtn>
        </div>
      </div>
    )
  }

  return (
    <div
      className="cc-claragis-verificar"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        color: textMain,
        fontSize: 'var(--cc-md)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 2px 10px',
        flexShrink: 0,
      }}>
        <IconBtn title="Volver a registros" onClick={volver} size={40}>←</IconBtn>
        <IconBtn title="Registro anterior" onClick={() => irA(idx - 1)} disabled={idx <= 0} size={40}>◀</IconBtn>
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-lg)', minWidth: 64, textAlign: 'center' }}>
          {idx + 1}/{total}
        </div>
        <IconBtn title="Registro siguiente" onClick={() => irA(idx + 1)} disabled={idx >= total - 1} size={40}>▶</IconBtn>
        <div style={{ flex: 1 }} />
        <IconBtn title="Editar (formulario completo)" onClick={() => onCambiarModo?.('editar')} size={42}>✏️</IconBtn>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingBottom: puedeDecidir ? 72 : 8 }}>
        {/* Slider foto + gráfico */}
        <div
          onTouchStart={(e) => { touchX.current = e.touches?.[0]?.clientX ?? null }}
          onTouchEnd={(e) => {
            const x0 = touchX.current
            const x1 = e.changedTouches?.[0]?.clientX
            touchX.current = null
            if (x0 == null || x1 == null || slides.length < 2) return
            const dx = x1 - x0
            if (Math.abs(dx) < 40) return
            setSlideIdx((i) => (dx < 0
              ? (i + 1) % slides.length
              : (i - 1 + slides.length) % slides.length))
          }}
          onClick={() => { if (slide?.url) { setLightboxZoom(1); setLightbox(slide.url) } }}
          role={slide?.url ? 'button' : undefined}
          tabIndex={slide?.url ? 0 : undefined}
          title={slide?.url ? 'Ampliar' : undefined}
          style={{
            width: '100%',
            aspectRatio: slide?.url ? '4 / 3' : '16 / 7',
            borderRadius: 12,
            background: slide?.url ? '#0b1220' : '#1e293b',
            border: `1px solid ${border}`,
            overflow: 'hidden',
            position: 'relative',
            cursor: slide?.url ? 'zoom-in' : 'default',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {slide?.url ? (
            <img src={slide.url} alt={slide.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ color: muted, fontSize: 36, opacity: 0.7 }}>📷</div>
          )}
          {slide && (
            <span style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'rgba(15,23,42,0.8)',
              color: '#fff',
              borderRadius: 8,
              padding: '2px 8px',
              fontSize: 'var(--cc-caption)',
              fontWeight: 700,
            }}>
              {slide.label}
            </span>
          )}
          {slides.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: 8,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <IconBtn title="Anterior" size={36} onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)}>‹</IconBtn>
              <span style={{
                background: 'rgba(15,23,42,0.75)',
                color: '#fff',
                borderRadius: 999,
                padding: '2px 10px',
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
              }}>
                {slideIdx + 1}/{slides.length}
              </span>
              <IconBtn title="Siguiente" size={36} onClick={() => setSlideIdx((i) => (i + 1) % slides.length)}>›</IconBtn>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setItemDetalle((v) => !v)}
          title="Ver detalle del ítem"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            color: textMain,
            fontWeight: 700,
            fontSize: 'var(--cc-lg)',
            lineHeight: 1.35,
            padding: '0 2px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lineaItemVerificar(reg)}
        </button>
        {itemDetalle && (
          <div style={{
            margin: '0 0 12px',
            padding: 12,
            borderRadius: 10,
            background: cardBg,
            border: `1px solid ${border}`,
            fontSize: 'var(--cc-md)',
            lineHeight: 1.45,
          }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{reg.item_numero}</div>
            <div style={{ marginBottom: 8 }}>{reg.item_descripcion || '—'}</div>
            <div style={{ color: muted }}>
              Capítulo: {reg.capitulo || reporte?.capitulo || '—'}
              {' · '}Unidad: {reg.unidad || '—'}
              {' · '}V.U.: {fmtCostoDirectoVerificar(reg.vlr_unitario)}
            </div>
          </div>
        )}

        <div style={{
          fontSize: 'calc(var(--cc-lg) * 1.55)',
          fontWeight: 800,
          lineHeight: 1.25,
          padding: '4px 2px 6px',
          wordBreak: 'break-word',
        }}>
          {fmtCantidadVerificar(reg)}
        </div>

        <div style={{
          fontSize: 'calc(var(--cc-lg) * 1.35)',
          fontWeight: 800,
          color: '#16a34a',
          padding: '0 2px 8px',
        }}>
          {fmtCostoDirectoVerificar(reg.costo_directo)}
        </div>

        {abscisaTxt && (
          <div style={{
            padding: '0 2px 6px',
            fontSize: 'var(--cc-md)',
            fontWeight: 600,
            color: muted,
            lineHeight: 1.4,
          }}>
            {abscisaTxt}
          </div>
        )}

        {String(reg.observacion || '').trim() ? (
          <div style={{
            padding: '0 2px 12px',
            fontSize: 'var(--cc-md)',
            lineHeight: 1.45,
            color: textMain,
            whiteSpace: 'pre-wrap',
          }}>
            {String(reg.observacion).trim()}
          </div>
        ) : null}

        {comparacion && (
          <div style={{
            padding: '0 2px 12px',
            fontSize: 'var(--cc-md)',
            fontWeight: 700,
            color: comparacion.ok ? '#16a34a' : '#d97706',
          }}>
            {comparacion.texto}
          </div>
        )}

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          padding: '4px 2px 14px',
        }}>
          {semaforo.map((s) => (
            <button
              key={s.nivel}
              type="button"
              title={`${s.encabezado}: ${s.estado}${s.usuario ? ` · ${s.usuario}` : ''}${s.fecha ? ` · ${s.fecha}` : ''}`}
              onClick={() => setTipNivel(tipNivel === s.nivel ? null : s.nivel)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                color: textMain,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 'var(--cc-md)',
                padding: 0,
              }}
            >
              <span>{s.label}</span>
              <span style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: s.color,
                boxShadow: `0 0 0 2px ${border}`,
              }} />
            </button>
          ))}
          {tipNivel != null && (() => {
            const s = semaforo.find((x) => x.nivel === tipNivel)
            if (!s) return null
            return (
              <div style={{
                width: '100%',
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                background: cardBg,
                border: `1px solid ${border}`,
                fontSize: 'var(--cc-sm)',
                color: muted,
              }}>
                <strong style={{ color: textMain }}>{s.encabezado}</strong>
                {' · '}{s.estado}
                {s.usuario ? ` · ${s.usuario}` : ''}
                {s.fecha ? ` · ${s.fecha}` : ''}
              </div>
            )
          })()}
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '10px 0 8px',
          borderTop: `1px solid ${border}`,
        }}>
          <IconBtn title={selladoTip} size={40}>🔒</IconBtn>
          <IconBtn title="Reversión de sellado" size={40} onClick={() => setPanel('reversion')}>♻️</IconBtn>
          <IconBtn title={`Subcontratista: ${subNombre}`} size={40}>👷</IconBtn>
          <IconBtn title={corteNum != null ? `Corte: ${corteNum}` : 'Sin corte'} size={40}>✂️</IconBtn>
          <IconBtn title="Observación" size={40} onClick={() => setPanel('obs')}>📝</IconBtn>
          <IconBtn title="Adjuntos / enlace soporte" size={40} onClick={() => setPanel('adjuntos')}>📎</IconBtn>
          <IconBtn title="Galería de gráficos" size={40} onClick={() => setPanel('graficos')}>🖼️</IconBtn>
        </div>
      </div>

      {puedeDecidir && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
          padding: '10px 8px 6px',
          background: `linear-gradient(180deg, transparent, ${cardBg} 28%)`,
          borderTop: `1px solid ${border}`,
        }}>
          <IconBtn
            title={estadoYo === 'Aprobado' ? 'Ya aprobado' : 'Aprobar'}
            accent="#16a34a"
            size={56}
            disabled={ejecutando || estadoYo === 'Aprobado'}
            onClick={aprobar}
          >
            ✓
          </IconBtn>
          <IconBtn
            title="Rechazar"
            accent="#dc2626"
            size={56}
            disabled={ejecutando}
            onClick={rechazar}
          >
            ✗
          </IconBtn>
        </div>
      )}

      {panel === 'obs' && (
        <PanelSecundario t={t} titulo="Observación" onClose={() => setPanel(null)}>
          {String(reg.observacion || '').trim() || 'Sin observación.'}
        </PanelSecundario>
      )}
      {panel === 'adjuntos' && (
        <PanelSecundario t={t} titulo="Adjuntos" onClose={() => setPanel(null)}>
          {(() => {
            let urls = []
            try {
              const raw = reg.enlace_soporte || reporte?.enlace_soporte
              if (Array.isArray(raw)) urls = raw
              else if (typeof raw === 'string' && raw.trim()) {
                const j = JSON.parse(raw)
                urls = Array.isArray(j) ? j : (raw.startsWith('http') ? [raw] : [])
              }
            } catch {
              const s = String(reg.enlace_soporte || '').trim()
              if (s.startsWith('http')) urls = [s]
            }
            urls = urls.filter(Boolean)
            if (!urls.length) return 'Sin adjuntos.'
            return (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {urls.map((u) => (
                  <li key={u} style={{ marginBottom: 8 }}>
                    <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: t.primary }}>{u}</a>
                  </li>
                ))}
              </ul>
            )
          })()}
        </PanelSecundario>
      )}
      {panel === 'graficos' && (
        <PanelSecundario t={t} titulo="Gráficos" onClose={() => setPanel(null)}>
          {!listaGraficosRegistro(reg).length ? 'Sin gráficos.' : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {listaGraficosRegistro(reg).map((g, i) => (
                <button
                  key={`${g.url}-${i}`}
                  type="button"
                  onClick={() => { setLightboxZoom(1); setLightbox(g.url) }}
                  style={{
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    padding: 0,
                    background: '#0b1220',
                    cursor: 'zoom-in',
                  }}
                >
                  <img src={g.url} alt={`Gráfico ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </PanelSecundario>
      )}
      {panel === 'reversion' && (
        <PanelSecundario t={t} titulo="Reversión de sellado" onClose={() => setPanel(null)}>
          <p style={{ marginTop: 0 }}>{selladoTip}</p>
          <p style={{ color: muted }}>
            Para solicitar o completar la reversión use el modo Editar (✏️), con el flujo completo de doble llave.
          </p>
          <button
            type="button"
            onClick={() => onCambiarModo?.('editar')}
            style={{
              marginTop: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: t.primary,
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Ir a Editar
          </button>
        </PanelSecundario>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-label="Vista ampliada"
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}
        >
          <img
            src={lightbox}
            alt="Ampliada"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8,
              transform: `scale(${lightboxZoom})`,
              transition: 'transform 0.15s ease',
            }}
          />
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
            <button
              type="button"
              title="Acercar"
              onClick={(e) => { e.stopPropagation(); setLightboxZoom((z) => Math.min(3, z + 0.25)) }}
              style={{
                width: 48, height: 48, borderRadius: 12, border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 22, cursor: 'pointer',
              }}
            >
              +
            </button>
            <button
              type="button"
              title="Alejar"
              onClick={(e) => { e.stopPropagation(); setLightboxZoom((z) => Math.max(1, z - 0.25)) }}
              style={{
                width: 48, height: 48, borderRadius: 12, border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 22, cursor: 'pointer',
              }}
            >
              −
            </button>
            <button
              type="button"
              title="Cerrar"
              onClick={() => setLightbox(null)}
              style={{
                width: 48, height: 48, borderRadius: 12, border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 22, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
