import { useEffect, useMemo, useState } from 'react'
import { pptoSheetStyles } from './pptoSheetStyles'
import {
  DECISION_MANTENER,
  DECISION_SALDAR,
  cantidadesTrasDecisiones,
  fmtCantPpto,
  liberacionesAlSaldar,
  participantesDesdeDecisiones,
  proporcionesIguales,
  sumProporciones,
  validarProporciones,
} from './pptoSubRedistribucion'

function sheetInp(sheet, t, active) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${active ? (t.primary || sheet.primary) : sheet.border}`,
    borderRadius: 4,
    background: sheet.inputBg,
    color: sheet.text,
    fontSize: 'var(--cc-input)',
    padding: '6px 8px',
    minHeight: 32,
    fontFamily: 'inherit',
  }
}

/**
 * Popup tipo hoja de cálculo: Mantener/Saldar + proporciones al compartir
 * cantidades de presupuesto entre varios subcontratistas.
 */
export default function PptoSubRedistribucionModal({
  open,
  theme,
  preview,
  onCancel,
  onConfirm,
  aplicando = false,
}) {
  const t = theme || {}
  const sheet = pptoSheetStyles(t)
  const existentes = preview?.subs_existentes || []
  const nuevoId = Number(preview?.nuevo_subcontratista_id) || 0

  const [decisiones, setDecisiones] = useState({})
  const [props, setProps] = useState({})
  const [error, setError] = useState('')
  const [confirmarLiberacion, setConfirmarLiberacion] = useState(false)

  const existIds = useMemo(
    () => existentes.map((p) => Number(p.id)).filter((n) => n > 0),
    [existentes],
  )

  const { participantes: partIds, saldados: saldadoIds } = useMemo(
    () => participantesDesdeDecisiones(existIds, nuevoId, decisiones),
    [existIds, nuevoId, decisiones],
  )

  const labelsById = useMemo(() => {
    const m = {}
    for (const p of existentes) m[Number(p.id)] = p.label
    if (preview?.nuevo_subcontratista_id) {
      m[Number(preview.nuevo_subcontratista_id)] = preview.nuevo_subcontratista_label
    }
    for (const p of preview?.participantes || []) m[Number(p.id)] = p.label
    return m
  }, [existentes, preview])

  useEffect(() => {
    if (!open || !preview) return
    const defDec = preview.decisiones_default || {}
    const nextDec = {}
    for (const id of existIds) {
      const raw = defDec[id] ?? defDec[String(id)]
      nextDec[id] = raw === DECISION_SALDAR ? DECISION_SALDAR : DECISION_MANTENER
    }
    setDecisiones(nextDec)
    setConfirmarLiberacion(false)
    setError('')
  }, [open, preview, existIds])

  useEffect(() => {
    if (!open) return
    const equal = proporcionesIguales(partIds)
    setProps((prev) => {
      const next = {}
      for (const id of partIds) {
        if (prev[id] != null && prev[id] !== '' && partIds.length === Object.keys(prev).length) {
          next[id] = prev[id]
        } else {
          next[id] = equal[id] ?? 0
        }
      }
      // Si solo queda el nuevo (todos saldados), proporción 1.
      if (partIds.length === 1) next[partIds[0]] = 1
      return next
    })
  }, [open, partIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !preview) return null

  const filas = preview.filas_redistribuir || []
  const bloqueadas = preview.filas_bloqueadas || []
  const simples = preview.filas_simples || []
  const advertencias = preview.advertencias || []
  const liberaciones = liberacionesAlSaldar(filas, decisiones)
  const suma = sumProporciones(props)
  const errProp = validarProporciones(props, partIds)

  const setProp = (id, val) => {
    setProps((prev) => ({ ...prev, [id]: val }))
    setError('')
  }

  const setDecision = (id, val) => {
    setDecisiones((prev) => ({ ...prev, [id]: val }))
    setConfirmarLiberacion(false)
    setError('')
  }

  const handleConfirm = async () => {
    const err = validarProporciones(props, partIds)
    if (err) {
      setError(err)
      return
    }
    if (liberaciones.length > 0 && !confirmarLiberacion) {
      setError(
        'Hay cantidades asignadas que no se reconocen como ejecutadas (Nivel 2). '
        + 'Marque la confirmación para saldar y liberarlas como saldo.',
      )
      return
    }
    const payloadProps = {}
    for (const id of partIds) payloadProps[String(id)] = Number(props[id])
    const payloadDec = {}
    for (const id of existIds) {
      payloadDec[String(id)] = decisiones[id] || DECISION_MANTENER
    }
    await onConfirm?.({
      proporciones: payloadProps,
      decisiones: payloadDec,
      confirmar_saldar_no_reconocidas: liberaciones.length > 0 ? confirmarLiberacion : false,
      preview,
    })
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    zIndex: 10060,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    background: t.bgCard || '#fff',
    color: t.text || '#0f172a',
    borderRadius: 8,
    border: `1px solid ${t.border || '#e2e8f0'}`,
    width: 'min(1180px, 96vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  }

  const colsMostrar = [
    ...saldadoIds.map((id) => ({ id, tipo: 'saldado' })),
    ...partIds.map((id) => ({ id, tipo: 'part' })),
  ]

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Redistribuir cantidades">
      <div style={card}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border || '#e2e8f0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}
        >
          <div>
            <div style={{
              fontSize: 'var(--cc-caption)',
              fontWeight: 800,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: t.primary || '#0077B6',
              marginBottom: 4,
            }}
            >
              Redistribución de cantidades
            </div>
            <div style={{ fontSize: 'var(--cc-body)', color: t.textMuted || '#64748b', lineHeight: 1.4 }}>
              Nuevo subcontratista:{' '}
              <strong style={{ color: t.text }}>{preview.nuevo_subcontratista_label || '—'}</strong>
              . Lo reconocido como ejecutado (objeto de cobro Nivel 2 o cortes enviados) queda fijo.
              Elija Mantener o Saldar por cada subcontratista existente; el saldo se reparte entre
              los participantes (proporciones en decimal, suma 1.00).
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={aplicando}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: t.textMuted,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {advertencias.length > 0 && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background: t.warningBg || '#fff7ed',
              border: `1px solid ${t.warningBorder || '#fdba74'}`,
              color: t.warningText || '#9a3412',
              fontSize: 'var(--cc-caption)',
            }}
            >
              {advertencias.map((a) => (
                <div key={a} style={{ marginBottom: 4 }}>{a}</div>
              ))}
            </div>
          )}

          {existentes.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                color: t.primary,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.04,
              }}
              >
                Subcontratistas existentes — Mantener o Saldar
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {existentes.map((p) => {
                  const id = Number(p.id)
                  const dec = decisiones[id] || DECISION_MANTENER
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: `1px solid ${t.border || '#e2e8f0'}`,
                        background: dec === DECISION_SALDAR ? (t.warningBg || '#fff7ed') : (t.bgMuted || '#f8fafc'),
                      }}
                    >
                      <span style={{ fontWeight: 700, minWidth: 160 }}>{p.label}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-body)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`dec-${id}`}
                          checked={dec === DECISION_MANTENER}
                          onChange={() => setDecision(id, DECISION_MANTENER)}
                        />
                        Mantener
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-body)', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`dec-${id}`}
                          checked={dec === DECISION_SALDAR}
                          onChange={() => setDecision(id, DECISION_SALDAR)}
                        />
                        Saldar
                      </label>
                      {dec === DECISION_SALDAR && (
                        <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                          Queda en lo reconocido como ejecutado; no entra en la proporción.
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 'var(--cc-caption)',
              fontWeight: 700,
              color: t.primary,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.04,
            }}
            >
              Proporciones del saldo (participantes)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              {partIds.map((id) => (
                <label key={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                  <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 600 }}>
                    {labelsById[id] || `#${id}`}
                    {id === nuevoId ? ' (nuevo)' : ''}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={props[id] ?? ''}
                    onChange={(e) => setProp(Number(id), e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={partIds.length === 1}
                    style={{
                      ...sheetInp(sheet, t, true),
                      width: 110,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                </label>
              ))}
              <div style={{
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                color: Math.abs(suma - 1) < 1e-6 ? (t.success || '#15803d') : (t.danger || '#b91c1c'),
                paddingBottom: 8,
              }}
              >
                Suma: {Number.isFinite(suma) ? suma.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          <div style={sheet.sheetWrap}>
            <table style={{ ...sheet.sheetTable, minWidth: 780 }}>
              <thead>
                <tr>
                  {[
                    'PK / Ítem',
                    'Presupuestado',
                    'Ejecutado reconocido',
                    'Saldo',
                    ...colsMostrar.map((c) => (
                      `${labelsById[c.id] || `#${c.id}`}${c.tipo === 'saldado' ? ' (saldado)' : ' (nueva)'}`
                    )),
                  ].map((h) => (
                    <th key={h} style={sheet.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const { cantidades } = cantidadesTrasDecisiones(f, props, decisiones, nuevoId)
                  return (
                    <tr key={f.presupuesto_id}>
                      <td style={sheet.td}>
                        <div style={{ fontWeight: 700 }}>{f.pk_id || f.presupuesto_id}</div>
                        <div style={{ color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                          {f.item || '—'}{f.tramo ? ` · ${f.tramo}` : ''}
                        </div>
                      </td>
                      <td style={{ ...sheet.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCantPpto(f.presupuestado)}
                      </td>
                      <td style={sheet.td}>
                        {(f.participantes || []).map((sid) => {
                          const info = (f.ejecutados || {})[sid] || (f.ejecutados || {})[String(sid)] || {}
                          return (
                            <div key={sid} style={{ fontSize: 'var(--cc-caption)', fontVariantNumeric: 'tabular-nums' }}>
                              {info.label || `#${sid}`}: {fmtCantPpto(info.ejecutado)}
                            </div>
                          )
                        })}
                      </td>
                      <td style={{ ...sheet.td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCantPpto(f.saldo)}
                      </td>
                      {colsMostrar.map((c) => (
                        <td
                          key={c.id}
                          style={{
                            ...sheet.td,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            color: c.tipo === 'saldado' ? (t.warningText || '#9a3412') : undefined,
                            fontWeight: c.tipo === 'saldado' ? 700 : undefined,
                          }}
                        >
                          {fmtCantPpto(cantidades[c.id])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {!filas.length && (
                  <tr>
                    <td style={sheet.td} colSpan={4 + colsMostrar.length}>
                      No hay filas para redistribuir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {liberaciones.length > 0 && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background: t.dangerBg || '#fef2f2',
              border: `1px solid ${t.dangerBorder || '#fecaca'}`,
              color: t.danger || '#b91c1c',
              fontSize: 'var(--cc-caption)',
            }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Al saldar se liberarán cantidades no reconocidas como ejecutadas (sin Nivel 2 objeto de cobro):
              </div>
              {liberaciones.slice(0, 12).map((L) => (
                <div key={`${L.presupuesto_id}-${L.subcontratista_id}`}>
                  {L.label}: {fmtCantPpto(L.cantidad_no_reconocida)}
                  {' · '}{L.item || '—'}{L.tramo ? ` · ${L.tramo}` : ''}
                </div>
              ))}
              {liberaciones.length > 12 && (
                <div>… y {liberaciones.length - 12} más</div>
              )}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                cursor: 'pointer',
                fontWeight: 700,
                color: t.text,
              }}
              >
                <input
                  type="checkbox"
                  checked={confirmarLiberacion}
                  onChange={(e) => {
                    setConfirmarLiberacion(e.target.checked)
                    setError('')
                  }}
                />
                Confirmo saldar y liberar esas cantidades como saldo
              </label>
            </div>
          )}

          {(simples.length > 0 || bloqueadas.length > 0) && (
            <div style={{ marginTop: 12, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
              {simples.length > 0 && (
                <div>
                  {simples.length} registro(s) sin asignación previa se asignarán completos al nuevo subcontratista.
                </div>
              )}
              {bloqueadas.length > 0 && (
                <div style={{ color: t.danger || '#b91c1c', marginTop: 4 }}>
                  {bloqueadas.length} registro(s) con saldo 0 se omitirán (no se asigna el nuevo subcontratista).
                </div>
              )}
            </div>
          )}

          {(error || errProp) && (
            <div style={{ marginTop: 10, color: t.danger || '#b91c1c', fontSize: 'var(--cc-caption)', fontWeight: 600 }}>
              {error || errProp}
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${t.border || '#e2e8f0'}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={aplicando}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: `1px solid ${t.border || '#cbd5e1'}`,
              background: t.bgCard || '#fff',
              color: t.text,
              cursor: 'pointer',
              fontSize: 'var(--cc-body)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={aplicando || !!errProp || (liberaciones.length > 0 && !confirmarLiberacion)}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              background: (errProp || (liberaciones.length > 0 && !confirmarLiberacion))
                ? (t.textMuted || '#94a3b8')
                : (t.primary || '#0077B6'),
              color: '#fff',
              cursor: (errProp || (liberaciones.length > 0 && !confirmarLiberacion)) ? 'not-allowed' : 'pointer',
              fontSize: 'var(--cc-body)',
              fontWeight: 700,
            }}
          >
            {aplicando ? 'Aplicando…' : 'Confirmar redistribución'}
          </button>
        </div>
      </div>
    </div>
  )
}
