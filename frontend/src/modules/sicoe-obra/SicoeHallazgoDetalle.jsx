/**
 * Ventana comparativa de un hallazgo de Auditoría (estilo ejecutivo Microsoft).
 * Dos paneles alineados (reporte más antiguo a la izquierda), plano, fotos y justificación.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fmtAbscisaK,
  fmtValorCop,
  justificacionesParaTipo,
  parseAbsNum,
} from './sicoeAuditoriaTraslapos'
import { fetchAuditoriaHallazgoDetalle, justificarAuditoriaHallazgo } from './sicoeAuditoriaHallazgosApi'
import { FranjaCoberturaHallazgo } from './SicoeHallazgoFranja'
import { SicoeHallazgoComparativaMapa } from './SicoeHallazgoComparativaMapa'

const TIPO_LABEL = {
  traslapo: 'Traslapo',
  vacio: 'Vacío',
  no_auditable: 'No auditable',
  ubicacion_inconsistente: 'Ubicación inconsistente',
  costado_inconsistente: 'Costado inconsistente',
  cantidad_mayor_area: 'Cantidad > área',
}

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  justificado: 'Justificado',
  corregido: 'Corregido',
}

function txt(v) {
  return String(v ?? '').trim()
}

function fmtFecha(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function tipoColor(tipo) {
  if (tipo === 'traslapo') return '#dc2626'
  if (tipo === 'vacio') return '#d97706'
  if (
    tipo === 'ubicacion_inconsistente'
    || tipo === 'costado_inconsistente'
    || tipo === 'cantidad_mayor_area'
  ) {
    return '#ea580c'
  }
  return '#ca8a04'
}

const CMP_ROWS = [
  { key: 'numero_registro', label: 'Registro', render: (r) => (r?.numero_registro != null ? `Reg. ${r.numero_registro}` : (r?.id != null ? `ID ${r.id}` : '—')) },
  { key: 'item_numero', label: 'Ítem' },
  { key: 'tramo', label: 'Tramo' },
  { key: 'infraestructura', label: 'Infraestructura' },
  { key: 'costado', label: 'Costado' },
  {
    key: 'ubicacion_reg',
    label: 'Abscisas / PK-ID',
    render: (r) => {
      const a0 = parseAbsNum(r?.abs_inicio)
      const a1 = parseAbsNum(r?.abs_final)
      if (a0 != null && a1 != null) return `${fmtAbscisaK(a0)} → ${fmtAbscisaK(a1)}`
      if (r?.pk_id_id != null && String(r.pk_id_id).trim()) return `PK ${r.pk_id_id}`
      return '—'
    },
  },
  {
    key: 'cantidad_total',
    label: 'Cantidad',
    render: (r) => (r?.cantidad_total == null || r?.cantidad_total === ''
      ? '—'
      : Number(r.cantidad_total).toLocaleString('es-CO')),
  },
  {
    key: 'valor',
    label: 'Valor',
    render: (r) => (r?.valor == null || r?.valor === '' ? '—' : fmtValorCop(r.valor)),
  },
]

function IconBtn({ title, onClick, disabled, children, t }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: t.inputBg || t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        color: disabled ? t.textMuted : t.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function valorCampo(row, r) {
  if (row.render) return row.render(r)
  return txt(r?.[row.key]) || '—'
}

function valoresCoinciden(a, b) {
  const na = txt(a).toLowerCase()
  const nb = txt(b).toLowerCase()
  if (!na || !nb || na === '—' || nb === '—') return false
  return na === nb
}

/** Agrupa registros por reporte; el más antiguo a la izquierda. */
function panelesDesdeRegs(regs) {
  const byRep = new Map()
  for (const r of regs || []) {
    const key = r?.reporte_id != null ? String(r.reporte_id) : `reg-${r?.id}`
    if (!byRep.has(key)) byRep.set(key, [])
    byRep.get(key).push(r)
  }
  const paneles = [...byRep.entries()].map(([key, list]) => {
    const primary = list[0] || {}
    const fechas = list.map((x) => x?.fecha).filter(Boolean).map((f) => new Date(f).getTime()).filter(Number.isFinite)
    const minTs = fechas.length ? Math.min(...fechas) : Infinity
    return {
      key,
      reporte_id: primary.reporte_id,
      numero_reporte: primary.numero_reporte,
      fecha: primary.fecha,
      usuario_nombre: primary.usuario_nombre,
      regs: list,
      sortTs: minTs,
    }
  })
  paneles.sort((a, b) => a.sortTs - b.sortTs || String(a.numero_reporte || '').localeCompare(String(b.numero_reporte || '')))
  // Máximo 2 paneles para la vista comparativa L/R
  if (paneles.length <= 2) return paneles
  return [paneles[0], paneles[paneles.length - 1]]
}

export default function SicoeHallazgoDetalle({
  t,
  hallazgo: hallazgoProp,
  hallazgosLista = null,
  API_URL,
  contratoId,
  token,
  onCerrar,
  onAbrirRegistro,
  onJustificado,
  onSeleccionarHallazgo,
  isNarrow = false,
}) {
  const [detalle, setDetalle] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [justSel, setJustSel] = useState('')
  const [obsJust, setObsJust] = useState('')
  const [msgJust, setMsgJust] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { left, right, label }

  const hid = hallazgoProp?.id
  const lista = Array.isArray(hallazgosLista) && hallazgosLista.length
    ? hallazgosLista
    : (hallazgoProp ? [hallazgoProp] : [])
  const idx = lista.findIndex((h) => String(h?.id) === String(hid))
  const hayPrev = idx > 0
  const hayNext = idx >= 0 && idx < lista.length - 1

  useEffect(() => {
    if (!hid || !contratoId || !token) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    setDetalle(null)
    setHistorial([])
    setJustSel('')
    setObsJust('')
    setMsgJust('')
    void (async () => {
      try {
        const data = await fetchAuditoriaHallazgoDetalle({
          API_URL,
          contratoId,
          token,
          hallazgoId: hid,
        })
        if (cancelled) return
        setDetalle(data?.hallazgo || hallazgoProp)
        setHistorial(Array.isArray(data?.historial) ? data.historial : [])
      } catch (e) {
        if (cancelled) return
        setDetalle(hallazgoProp)
        setError(e?.message || 'No se pudo cargar el detalle completo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [API_URL, contratoId, token, hid]) // eslint-disable-line react-hooks/exhaustive-deps

  const h = detalle || hallazgoProp
  const regs = h?.registros_involucrados || []
  const paneles = useMemo(() => panelesDesdeRegs(regs), [regs])
  const color = tipoColor(h?.tipo)
  const justOpts = justificacionesParaTipo(h?.tipo)
  const puedeJustificar = txt(h?.estado).toLowerCase() === 'pendiente'
  const itemDesc = regs.map((r) => r?.item_descripcion).find((d) => txt(d)) || ''
  const obsGuardada = (h?.payload && typeof h.payload === 'object')
    ? txt(h.payload.observacion)
    : ''

  const left = paneles[0] || null
  const right = paneles[1] || null
  const leftReg = left?.regs?.[0] || null
  const rightReg = right?.regs?.[0] || null

  const onJustificar = async () => {
    if (!justSel) {
      setMsgJust('Seleccione una justificación')
      return
    }
    setMsgJust('')
    setGuardando(true)
    try {
      await justificarAuditoriaHallazgo({
        API_URL,
        contratoId,
        token,
        hallazgoId: h.id,
        justificacion: justSel,
        observacion: obsJust.trim() || undefined,
      })
      setJustSel('')
      setObsJust('')
      onJustificado?.(h.id)
    } catch (e) {
      setMsgJust(e?.message || 'No se pudo justificar')
    } finally {
      setGuardando(false)
    }
  }

  const irPrev = () => {
    if (!hayPrev || !onSeleccionarHallazgo) return
    onSeleccionarHallazgo(lista[idx - 1])
  }
  const irNext = () => {
    if (!hayNext || !onSeleccionarHallazgo) return
    onSeleccionarHallazgo(lista[idx + 1])
  }

  if (!h) return null

  const cellStyle = (match, side) => ({
    padding: '7px 10px',
    color: t.text,
    borderTop: `1px solid ${t.border}`,
    background: match ? `${color}18` : (side === 'left' ? (t.bgCard || t.bg) : (t.inputBg || t.bg)),
    fontWeight: match ? 700 : 500,
    wordBreak: 'break-word',
    fontSize: 'var(--cc-caption)',
  })

  const headerPanel = (panel, accent) => (
    <div
      style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${t.border}`,
        background: t.inputBg || t.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
        {panel?.numero_reporte != null ? `Reporte #${panel.numero_reporte}` : 'Reporte'}
      </div>
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
        {fmtFecha(panel?.fecha)}
        {panel?.usuario_nombre ? ` · ${panel.usuario_nombre}` : ''}
      </div>
    </div>
  )

  const mediaBlock = (reg, side) => {
    const foto = reg?.foto_url
    const graf = reg?.grafico_url
    if (!foto && !graf) {
      return (
        <div style={{ padding: 10, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          Sin foto ni gráfico
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', gap: 8, padding: 10, flexWrap: 'wrap' }}>
        {foto && (
          <button
            type="button"
            title="Ampliar foto"
            aria-label="Ampliar foto"
            onClick={() => setLightbox({
              left: leftReg?.foto_url,
              right: rightReg?.foto_url,
              label: 'Registro fotográfico',
            })}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: 0,
              background: t.bg,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <img src={foto} alt={`Foto ${side}`} style={{ width: 96, height: 72, objectFit: 'cover', display: 'block' }} />
          </button>
        )}
        {graf && (
          <button
            type="button"
            title="Ampliar gráfico"
            aria-label="Ampliar gráfico"
            onClick={() => setLightbox({
              left: leftReg?.grafico_url,
              right: rightReg?.grafico_url,
              label: 'Gráfico',
            })}
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: 0,
              background: t.bg,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <img src={graf} alt={`Gráfico ${side}`} style={{ width: 96, height: 72, objectFit: 'cover', display: 'block' }} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comparativa del hallazgo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 14500,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: isNarrow ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: isNarrow ? 0 : 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar?.()
      }}
    >
      <div
        style={{
          width: isNarrow ? '100%' : 'min(1100px, 96vw)',
          maxHeight: isNarrow ? '100%' : '92vh',
          background: t.bgCard || t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: isNarrow ? 0 : 10,
          boxShadow: '0 16px 48px rgba(15,23,42,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderBottom: `1px solid ${t.border}`,
            background: t.inputBg || t.bg,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  background: color,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 'var(--cc-caption)',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                {TIPO_LABEL[h.tipo] || h.tipo}
              </span>
              <span style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-md)' }}>
                Ítem {h.item_numero || '—'}
              </span>
              <span
                style={{
                  fontSize: 'var(--cc-caption)',
                  color: t.textMuted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontWeight: 700,
                }}
              >
                {ESTADO_LABEL[h.estado] || h.estado}
              </span>
            </div>
            {itemDesc && (
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4 }}>
                {itemDesc}
              </div>
            )}
            <div style={{ fontSize: 'var(--cc-sm)', color: t.text, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>
                <strong style={{ color: t.textMuted, fontWeight: 600 }}>Medida:</strong>{' '}
                {h.medida_m != null ? `${h.medida_m} m` : (h.ubicacion || '—')}
              </span>
              <span>
                <strong style={{ color: t.textMuted, fontWeight: 600 }}>Valor en juego:</strong>{' '}
                {fmtValorCop(h.valor_en_juego)}
              </span>
              {h.ubicacion && h.medida_m != null && (
                <span>
                  <strong style={{ color: t.textMuted, fontWeight: 600 }}>Ubicación:</strong>{' '}
                  {h.ubicacion}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <IconBtn title="Hallazgo anterior" onClick={irPrev} disabled={!hayPrev} t={t}>
              ‹
            </IconBtn>
            <IconBtn title="Hallazgo siguiente" onClick={irNext} disabled={!hayNext} t={t}>
              ›
            </IconBtn>
            <IconBtn title="Cerrar" onClick={onCerrar} t={t}>
              ✕
            </IconBtn>
          </div>
        </div>

        {/* Cuerpo scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando detalle…</div>
          )}
          {error && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{error}</div>
          )}

          {/* Plano superpuesto */}
          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: t.bg,
            }}
          >
            <div style={{ padding: '8px 12px', fontWeight: 800, fontSize: 'var(--cc-sm)', color: t.text, borderBottom: `1px solid ${t.border}` }}>
              Plano · {txt(h.tipo).toLowerCase() === 'vacio' ? 'hueco resaltado' : 'zona pisada resaltada'}
            </div>
            <SicoeHallazgoComparativaMapa t={t} hallazgo={h} left={leftReg} right={rightReg} height={isNarrow ? 180 : 220} />
            <div style={{ padding: '0 12px 10px' }}>
              <FranjaCoberturaHallazgo t={t} hallazgo={h} registros={regs} />
            </div>
          </div>

          {/* Dos paneles */}
          {!regs.length ? (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin registros asociados.</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isNarrow || !right ? '1fr' : '1fr 1fr',
                gap: 10,
                alignItems: 'start',
              }}
            >
              {[left, right].filter(Boolean).map((panel, pi) => {
                const reg = panel.regs[0]
                const other = pi === 0 ? rightReg : leftReg
                const accent = pi === 0 ? '#0ea5e9' : '#8b5cf6'
                return (
                  <div
                    key={panel.key}
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: t.bgCard || t.bg,
                    }}
                  >
                    {headerPanel(panel, accent)}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {CMP_ROWS.map((row) => {
                          const val = valorCampo(row, reg)
                          const otherVal = other ? valorCampo(row, other) : ''
                          const match = other ? valoresCoinciden(val, otherVal) : false
                          return (
                            <tr key={row.key}>
                              <td
                                style={{
                                  ...cellStyle(false, 'label'),
                                  width: '38%',
                                  color: t.textMuted,
                                  fontWeight: 700,
                                  background: t.inputBg || t.bg,
                                }}
                              >
                                {row.label}
                              </td>
                              <td style={cellStyle(match, pi === 0 ? 'left' : 'right')}>
                                {row.key === 'numero_registro' ? (
                                  <button
                                    type="button"
                                    title="Abrir registro"
                                    aria-label="Abrir registro"
                                    onClick={() => onAbrirRegistro?.(reg)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: t.primary,
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      padding: 0,
                                      textDecoration: 'underline',
                                    }}
                                  >
                                    {val}
                                  </button>
                                ) : val}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ borderTop: `1px solid ${t.border}` }}>
                      <div style={{ padding: '6px 10px', fontWeight: 800, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                        Foto y gráfico
                      </div>
                      {mediaBlock(reg, pi === 0 ? 'izq' : 'der')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Justificación */}
          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: 12,
              background: t.inputBg || t.bg,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
              Justificación
            </div>
            {h.estado === 'justificado' ? (
              <div style={{ fontSize: 'var(--cc-sm)', color: t.text }}>
                <div>
                  <strong>{h.justificacion || '—'}</strong>
                </div>
                <div style={{ color: t.textMuted, marginTop: 4 }}>
                  {h.justificado_por_nombre || '—'}
                  {h.justificado_en ? ` · ${fmtFecha(h.justificado_en)}` : ''}
                </div>
                {obsGuardada && (
                  <div style={{ marginTop: 6, color: t.text }}>
                    Observación: {obsGuardada}
                  </div>
                )}
              </div>
            ) : puedeJustificar ? (
              <>
                <select
                  value={justSel}
                  onChange={(e) => setJustSel(e.target.value)}
                  style={{
                    background: t.bgCard || t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  <option value="">Seleccione justificación…</option>
                  {justOpts.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
                <textarea
                  value={obsJust}
                  onChange={(e) => setObsJust(e.target.value)}
                  placeholder="Observación opcional"
                  rows={2}
                  style={{
                    background: t.bgCard || t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 'var(--cc-sm)',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconBtn
                    title={guardando ? 'Guardando…' : 'Guardar justificación'}
                    onClick={onJustificar}
                    disabled={guardando}
                    t={t}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </IconBtn>
                  {msgJust && (
                    <span style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{msgJust}</span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                Estado: {ESTADO_LABEL[h.estado] || h.estado}
              </div>
            )}

            {historial.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>
                  Historial
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {historial.slice(0, 6).map((ev, i) => (
                    <li key={ev.id || `h-${i}`} style={{ fontSize: 'var(--cc-caption)', color: t.text }}>
                      <strong>{fmtFecha(ev.fecha)}</strong>
                      {ev.usuario_nombre ? ` · ${ev.usuario_nombre}` : ''}
                      {ev.justificacion ? ` · ${ev.justificacion}` : ev.tipo ? ` · ${ev.tipo}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.label || 'Comparar imágenes'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 14600,
            background: 'rgba(15,23,42,0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            gap: 12,
          }}
          onClick={() => setLightbox(null)}
        >
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 'var(--cc-sm)' }}>
            {lightbox.label || 'Comparar'}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
              gap: 12,
              width: 'min(960px, 100%)',
              maxHeight: '80vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[lightbox.left, lightbox.right].map((src, i) => (
              <div
                key={`lb-${i}`}
                style={{
                  background: '#0f172a',
                  borderRadius: 8,
                  overflow: 'hidden',
                  minHeight: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {src ? (
                  <img src={src} alt={i === 0 ? 'Izquierda' : 'Derecha'} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 'var(--cc-sm)' }}>Sin imagen</span>
                )}
              </div>
            ))}
          </div>
          <IconBtn title="Cerrar" onClick={() => setLightbox(null)} t={{ ...t, bg: '#1e293b', border: '#334155', text: '#fff', textMuted: '#94a3b8', inputBg: '#1e293b' }}>
            ✕
          </IconBtn>
        </div>
      )}
    </div>
  )
}

// Re-export franja for callers that imported from this file before.
export { FranjaCoberturaHallazgo } from './SicoeHallazgoFranja'
