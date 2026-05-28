import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, GripVertical, Zap } from 'lucide-react'
import { fetchAutoSchedulePrereqs, previewAutoSchedule, applyAutoSchedule } from './progObraApi'
import { fmtCOP } from './progObraFormat'
import { fmtDateHistorial } from './progObraVersiones'

const ESTRATEGIAS = [
  { id: 'equitativa', title: '1. EQUITATIVA', desc: 'Todos los sectores reciben el mismo tiempo. Ideal para proyectos con actividades similares.' },
  { id: 'costo', title: '2. POR INCIDENCIA EN COSTO', desc: 'Los sectores de mayor valor reciben más tiempo. Más tiempo = más trabajo = más costo.' },
  { id: 'personalizado', title: '3. PERSONALIZADO', desc: 'Tú defines el orden de ejecución de los sectores. El sistema calcula los tiempos automáticamente.' },
]

function costBar(costo, max) {
  const pct = max > 0 ? Math.min(100, (costo / max) * 100) : 0
  return pct
}

export default function ProgObraAutoScheduleWizard({
  open,
  onClose,
  onSuccess,
  t,
  API,
  cid,
  token,
  versionId,
  btnStyle,
  inputStyle,
  defaultFechaInicio,
  defaultFechaFin,
}) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prereqs, setPrereqs] = useState(null)
  const [estrategia, setEstrategia] = useState('equitativa')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [pkOrder, setPkOrder] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!open || !versionId) return
    setStep(1)
    setError('')
    setPreview(null)
    setEstrategia('equitativa')
    setFechaInicio(defaultFechaInicio || '')
    setFechaFin(defaultFechaFin || '')
    fetchAutoSchedulePrereqs(API, cid, token, versionId)
      .then(setPrereqs)
      .catch((e) => setError(e?.message || 'Error al verificar prerequisitos'))
  }, [open, versionId, API, cid, token, defaultFechaInicio, defaultFechaFin])

  useEffect(() => {
    if (preview?.pk_resumen?.length) {
      setPkOrder(preview.pk_resumen.map((p) => p.pk_id))
    }
  }, [preview?.pk_resumen])

  const maxCosto = useMemo(() => Math.max(...(preview?.pk_resumen || []).map((p) => p.costo || 0), 1), [preview])

  const ganttByPk = useMemo(() => {
    const map = {}
    for (const p of preview?.propuesta || []) {
      const pk = p.pk_id
      if (!map[pk]) map[pk] = { pk, ini: p.fecha_inicio, fin: p.fecha_fin }
      else if (p.fecha_fin > map[pk].fin) map[pk].fin = p.fecha_fin
    }
    return Object.values(map)
  }, [preview])

  const onDragStart = (i) => setDragIdx(i)
  const onDragOver = (e, i) => {
    e.preventDefault()
    if (dragIdx == null || dragIdx === i) return
    setPkOrder((order) => {
      const next = [...order]
      const [item] = next.splice(dragIdx, 1)
      next.splice(i, 0, item)
      return next
    })
    setDragIdx(i)
  }

  const loadPreview = async (opts = {}) => {
    const { finalPreview = false, orderOnly = false } = opts
    if (!fechaInicio || !fechaFin) {
      setError('Indique fecha inicio y fin del contrato')
      return
    }
    setBusy(true)
    setError('')
    try {
      const strat = finalPreview ? estrategia : orderOnly ? 'equitativa' : estrategia
      const body = {
        version_id: versionId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        estrategia: strat,
      }
      if (finalPreview && estrategia === 'personalizado' && pkOrder.length) {
        body.pk_order = pkOrder
        body.pk_parallel_groups = pkOrder.map((pk) => [pk])
      }
      const p = await previewAutoSchedule(API, cid, token, body)
      if (orderOnly) {
        setPkOrder((p.pk_resumen || []).map((x) => x.pk_id))
        setPreview(p)
        setStep(2)
      } else {
        setPreview(p)
        setStep(3)
      }
    } catch (e) {
      setError(e?.message || 'Error al generar propuesta')
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async () => {
    if (!preview?.propuesta?.length) return
    setBusy(true)
    try {
      await applyAutoSchedule(API, cid, token, versionId, preview.propuesta)
      onSuccess?.(preview)
      onClose()
    } catch (e) {
      setError(e?.message || 'Error al aplicar programación')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 10060,
    background: 'rgba(15,23,42,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90vh',
    overflow: 'auto',
    background: t.bgCard,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    padding: 20,
    color: t.text,
  }

  if (prereqs && !prereqs.ok) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={card} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 12 }}>⚡ Programación automática — requisitos pendientes</div>
          <ul style={{ fontSize: 12, lineHeight: 1.6, paddingLeft: 18, marginBottom: 16 }}>
            {(prereqs.mensajes || []).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" style={btnStyle(true, false)} onClick={onClose}>Entendido</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={() => !busy && onClose()}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: t.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} /> PROGRAMACIÓN AUTOMÁTICA — Paso {step}/3
          </div>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '8px 10px', marginBottom: 12, borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontSize: 12 }}>{error}</div>
        )}

        {step === 1 && (
          <>
            <label style={{ fontSize: 11, color: t.textMuted }}>Fecha inicio del contrato</label>
            <input type="date" style={{ ...inputStyle, marginBottom: 10 }} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            <label style={{ fontSize: 11, color: t.textMuted }}>Fecha fin del contrato</label>
            <input type="date" style={{ ...inputStyle, marginBottom: 12 }} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>¿Cómo deseas distribuir el tiempo?</div>
            {ESTRATEGIAS.map((e) => (
              <label
                key={e.id}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  marginBottom: 8,
                  borderRadius: 8,
                  border: `1px solid ${estrategia === e.id ? t.primary : t.border}`,
                  background: estrategia === e.id ? `${t.primary}10` : t.bg,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <input type="radio" name="est" checked={estrategia === e.id} onChange={() => setEstrategia(e.id)} />{' '}
                <strong>{e.title}</strong>
                <div style={{ color: t.textMuted, marginTop: 4, marginLeft: 20 }}>{e.desc}</div>
              </label>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={onClose}>Cancelar</button>
              <button
                type="button"
                style={btnStyle(true, busy)}
                disabled={busy}
                onClick={() =>
                  void loadPreview(
                    estrategia === 'personalizado' ? { orderOnly: true } : { finalPreview: true },
                  )
                }
              >
                {estrategia === 'personalizado' ? 'Siguiente →' : 'Generar preview →'}
              </button>
            </div>
          </>
        )}

        {step === 2 && estrategia === 'personalizado' && (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>Orden de ejecución — arrastra para reordenar</div>
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 8, marginBottom: 12 }}>
              {pkOrder.map((pk, i) => {
                const meta = (preview?.pk_resumen || []).find((p) => p.pk_id === pk) || {}
                return (
                  <div
                    key={pk}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={(e) => onDragOver(e, i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      marginBottom: 4,
                      borderRadius: 6,
                      background: t.bg,
                      border: `1px solid ${t.border}`,
                      cursor: 'grab',
                      fontSize: 12,
                    }}
                  >
                    <GripVertical size={14} color={t.textMuted} />
                    <span style={{ fontWeight: 700, minWidth: 72 }}>PK {pk}</span>
                    <span style={{ minWidth: 100 }}>{fmtCOP(meta.costo)}</span>
                    <div style={{ flex: 1, height: 8, background: t.border, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${costBar(meta.costo, maxCosto)}%`, height: '100%', background: t.primary }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={() => setStep(1)}>← Volver</button>
              <button type="button" style={btnStyle(true, busy)} disabled={busy} onClick={() => void loadPreview({ finalPreview: true })}>Generar preview →</button>
            </div>
          </>
        )}

        {step === 3 && preview && (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>PROPUESTA GENERADA</div>
            <div style={{ fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
              Fecha inicio: <strong>{fmtDateHistorial(preview.fecha_inicio)}</strong>
              {' · '}
              Fecha fin calculada: <strong>{fmtDateHistorial(preview.fecha_fin_calculada)}</strong>
              {' · '}
              Días hábiles: <strong>{preview.dias_habiles_disponibles}</strong>
              <div style={{ marginTop: 4, color: preview.dentro_plazo ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {preview.dentro_plazo ? '✅ Dentro del plazo contractual' : '⚠ Fuera del plazo contractual'}
              </div>
            </div>
            <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 11, border: `1px solid ${t.border}`, borderRadius: 6, padding: 8, marginBottom: 12 }}>
              {ganttByPk.map((g) => (
                <div key={g.pk} style={{ marginBottom: 6 }}>
                  PK {g.pk} — {fmtDateHistorial(g.ini)} → {fmtDateHistorial(g.fin)}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginBottom: 12, lineHeight: 1.5 }}>
              ⚠ Esta programación fue generada automáticamente. Verifica las fechas antes de enviar a validación.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" style={btnStyle(false, busy)} disabled={busy} onClick={() => setStep(estrategia === 'personalizado' ? 2 : 1)}>← Volver</button>
              <button type="button" style={btnStyle(true, busy)} disabled={busy} onClick={() => void handleApply()}>Aplicar programación</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
