/**
 * Detalle de un hallazgo de Auditoría: comparación de registros, franja de cobertura,
 * justificación e historial.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fmtAbscisaK,
  fmtValorCop,
  justificacionesParaTipo,
  parseAbsNum,
} from './sicoeAuditoriaTraslapos'
import { fetchAuditoriaHallazgoDetalle, justificarAuditoriaHallazgo } from './sicoeAuditoriaHallazgosApi'

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

/** Franja visual de cobertura con solape/hueco resaltado. */
export function FranjaCoberturaHallazgo({ t, hallazgo, registros }) {
  const tipo = txt(hallazgo?.tipo).toLowerCase()
  const hiLo = parseAbsNum(hallazgo?.abs_desde)
  const hiHi = parseAbsNum(hallazgo?.abs_hasta)

  const ranges = useMemo(() => {
    const list = []
    for (const r of registros || []) {
      const a0 = parseAbsNum(r?.abs_inicio)
      const a1 = parseAbsNum(r?.abs_final)
      if (a0 == null || a1 == null) continue
      const lo = Math.min(a0, a1)
      const hi = Math.max(a0, a1)
      list.push({
        lo,
        hi,
        label: r?.numero_registro != null ? `Reg. ${r.numero_registro}` : `ID ${r?.id}`,
        id: r?.id,
      })
    }
    return list
  }, [registros])

  const extent = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const r of ranges) {
      if (r.lo < min) min = r.lo
      if (r.hi > max) max = r.hi
    }
    if (hiLo != null && hiLo < min) min = hiLo
    if (hiHi != null && hiHi > max) max = hiHi
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
    const pad = Math.max((max - min) * 0.08, 1)
    return { min: min - pad, max: max + pad }
  }, [ranges, hiLo, hiHi])

  if (!extent || !ranges.length) {
    return (
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, padding: '8px 0' }}>
        {tipo === 'traslapo' && hallazgo?.pk_id_id
          ? `Traslapo puntual en PK ${hallazgo.pk_id_id} (sin abscisas lineales).`
          : 'Sin abscisas para dibujar la franja de cobertura.'}
      </div>
    )
  }

  const span = extent.max - extent.min
  const highlightColor = tipo === 'vacio' ? '#d97706' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>
        Cobertura
        {hiLo != null && hiHi != null
          ? ` · ${tipo === 'vacio' ? 'Hueco' : 'Solape'}: ${fmtAbscisaK(hiLo)} → ${fmtAbscisaK(hiHi)}`
          : ''}
      </div>
      <div
        style={{
          position: 'relative',
          height: 12 + ranges.length * 22,
          background: t.inputBg || t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Eje base */}
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            top: 10,
            height: 2,
            background: t.border,
          }}
        />
        {hiLo != null && hiHi != null && (
          <div
            title={`${tipo === 'vacio' ? 'Hueco' : 'Solape'} ${fmtAbscisaK(hiLo)}–${fmtAbscisaK(hiHi)}`}
            style={{
              position: 'absolute',
              left: `calc(8px + (100% - 16px) * ${(hiLo - extent.min) / span})`,
              width: `calc((100% - 16px) * ${Math.max(hiHi - hiLo, 0) / span})`,
              top: 0,
              bottom: 0,
              background: `${highlightColor}33`,
              borderLeft: `2px solid ${highlightColor}`,
              borderRight: `2px solid ${highlightColor}`,
              pointerEvents: 'none',
            }}
          />
        )}
        {ranges.map((r, i) => (
          <div
            key={`${r.id}-${i}`}
            title={`${r.label}: ${fmtAbscisaK(r.lo)}–${fmtAbscisaK(r.hi)}`}
            style={{
              position: 'absolute',
              left: `calc(8px + (100% - 16px) * ${(r.lo - extent.min) / span})`,
              width: `calc((100% - 16px) * ${Math.max(r.hi - r.lo, 0) / span})`,
              top: 18 + i * 22,
              height: 14,
              background: i % 2 === 0 ? '#0ea5e9' : '#8b5cf6',
              borderRadius: 4,
              opacity: 0.85,
              minWidth: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
        {ranges.map((r, i) => (
          <span key={`leg-${r.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: i % 2 === 0 ? '#0ea5e9' : '#8b5cf6',
              }}
            />
            {r.label} ({fmtAbscisaK(r.lo)}–{fmtAbscisaK(r.hi)})
          </span>
        ))}
        {hiLo != null && hiHi != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: highlightColor }} />
            {tipo === 'vacio' ? 'Hueco' : 'Solape'}
          </span>
        )}
      </div>
    </div>
  )
}

const CMP_FIELDS = [
  { key: 'numero_reporte', label: 'Reporte' },
  { key: 'fecha', label: 'Fecha', fmt: fmtFecha },
  { key: 'usuario_nombre', label: 'Usuario' },
  { key: 'item_numero', label: 'Ítem' },
  { key: 'tramo', label: 'Tramo' },
  { key: 'infraestructura', label: 'Infraestructura' },
  { key: 'costado', label: 'Costado' },
  {
    key: 'ubicacion_reg',
    label: 'Abscisas / PK',
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
    fmt: (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('es-CO')),
  },
  {
    key: 'valor',
    label: 'Valor',
    fmt: (v) => (v == null || v === '' ? '—' : fmtValorCop(v)),
  },
]

export default function SicoeHallazgoDetalle({
  t,
  hallazgo: hallazgoProp,
  API_URL,
  contratoId,
  token,
  onCerrar,
  onAbrirRegistro,
  onJustificado,
}) {
  const [detalle, setDetalle] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [justSel, setJustSel] = useState('')
  const [msgJust, setMsgJust] = useState('')
  const [guardando, setGuardando] = useState(false)

  const hid = hallazgoProp?.id

  useEffect(() => {
    if (!hid || !contratoId || !token) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    setDetalle(null)
    setHistorial([])
    setJustSel('')
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
        // Fallback: mostrar snapshot de la tabla
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
  const color = tipoColor(h?.tipo)
  const justOpts = justificacionesParaTipo(h?.tipo)
  const puedeJustificar = txt(h?.estado).toLowerCase() === 'pendiente'

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
      })
      setJustSel('')
      onJustificado?.(h.id)
    } catch (e) {
      setMsgJust(e?.message || 'No se pudo justificar')
    } finally {
      setGuardando(false)
    }
  }

  if (!h) return null

  return (
    <div
      style={{
        background: t.bgCard,
        border: `1px solid ${color}66`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, color, fontSize: 'var(--cc-md)' }}>
            {TIPO_LABEL[h.tipo] || h.tipo}
            {h.item_numero ? ` · Ítem ${h.item_numero}` : ''}
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
            {h.ubicacion || '—'}
            {h.medida_m != null ? ` · ${h.medida_m} m` : ''}
            {' · '}
            {fmtValorCop(h.valor_en_juego)}
            {' · '}
            {ESTADO_LABEL[h.estado] || h.estado}
          </div>
          {h.texto && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.text, marginTop: 6 }}>{h.texto}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            color: t.textMuted,
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Cerrar
        </button>
      </div>

      {loading && (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando detalle…</div>
      )}
      {error && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{error}</div>
      )}

      {/* Comparación registros */}
      <div>
        <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
          Registros involucrados
        </div>
        {!regs.length ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Sin registros asociados.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `minmax(110px, 0.7fr) repeat(${regs.length}, minmax(140px, 1fr))`,
              gap: 0,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              fontSize: 'var(--cc-caption)',
            }}
          >
            <div style={{ background: t.inputBg || t.bg, padding: '8px 10px', fontWeight: 800, color: t.textMuted }}>
              Campo
            </div>
            {regs.map((r) => (
              <div
                key={`h-${r.id}`}
                style={{
                  background: t.inputBg || t.bg,
                  padding: '8px 10px',
                  fontWeight: 800,
                  color: t.primary,
                  borderLeft: `1px solid ${t.border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => onAbrirRegistro?.(r)}
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
                  Reg. {r.numero_registro ?? r.id}
                </button>
              </div>
            ))}
            {CMP_FIELDS.map((f) => (
              <div key={f.key} style={{ display: 'contents' }}>
                <div
                  style={{
                    padding: '7px 10px',
                    color: t.textMuted,
                    fontWeight: 700,
                    borderTop: `1px solid ${t.border}`,
                  }}
                >
                  {f.label}
                </div>
                {regs.map((r) => {
                  let val = '—'
                  if (f.render) val = f.render(r)
                  else if (f.fmt) val = f.fmt(r?.[f.key])
                  else val = txt(r?.[f.key]) || '—'
                  return (
                    <div
                      key={`${f.key}-${r.id}`}
                      style={{
                        padding: '7px 10px',
                        color: t.text,
                        borderTop: `1px solid ${t.border}`,
                        borderLeft: `1px solid ${t.border}`,
                        wordBreak: 'break-word',
                      }}
                    >
                      {val}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <FranjaCoberturaHallazgo t={t} hallazgo={h} registros={regs} />

      {/* Estado / justificación */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          background: t.inputBg || t.bg,
          borderRadius: 10,
          border: `1px solid ${t.border}`,
        }}
      >
        <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
          Estado: {ESTADO_LABEL[h.estado] || h.estado}
        </div>
        {h.estado === 'justificado' && (
          <div style={{ fontSize: 'var(--cc-sm)', color: t.text }}>
            Justificación: <strong>{h.justificacion || '—'}</strong>
            {h.justificado_por_nombre ? ` · ${h.justificado_por_nombre}` : ''}
            {h.justificado_en ? ` · ${fmtFecha(h.justificado_en)}` : ''}
          </div>
        )}
        {puedeJustificar && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select
              value={justSel}
              onChange={(e) => setJustSel(e.target.value)}
              style={{
                flex: '1 1 220px',
                background: t.bgCard,
                color: t.text,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 'var(--cc-sm)',
              }}
            >
              <option value="">Justificar hallazgo…</option>
              {justOpts.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={guardando}
              onClick={onJustificar}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 800,
                cursor: guardando ? 'wait' : 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
            >
              {guardando ? 'Guardando…' : 'Guardar justificación'}
            </button>
            {msgJust && (
              <span style={{ color: '#dc2626', fontSize: 'var(--cc-caption)' }}>{msgJust}</span>
            )}
          </div>
        )}
      </div>

      {/* Historial */}
      <div>
        <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
          Historial de alertas y decisiones
        </div>
        {!historial.length ? (
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
            Sin eventos registrados aún para este hallazgo.
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map((ev, i) => (
              <li key={ev.id || `h-${i}`} style={{ fontSize: 'var(--cc-caption)', color: t.text }}>
                <strong>{fmtFecha(ev.fecha)}</strong>
                {ev.usuario_nombre ? ` · ${ev.usuario_nombre}` : ''}
                {ev.justificacion
                  ? ` · Justificó: ${ev.justificacion}`
                  : ev.tipo
                    ? ` · ${ev.tipo}`
                    : ev.accion
                      ? ` · ${ev.accion}`
                      : ''}
                {ev.resultado ? ` (${ev.resultado})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
