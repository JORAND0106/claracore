import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import {
  calcularBuscarObjetivo,
  labelAreaLongNodo,
  numDim,
  puedeDespejarDimension,
} from './pptoBuscarObjetivo.js'
import {
  formatObjetivoCopDisplay,
  parseObjetivoCopNumber,
} from './pptoBuscarObjetivoFormat.js'

const DIM_OPTIONS = [
  { key: 'area_long_nod', labelFromTipo: true },
  { key: 'ancho', label: 'Ancho' },
  { key: 'espesor', label: 'Espesor' },
]

const MODAL_WIDTH = 780

function fmtDim(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  // Hasta 12 decimales: el comodín de Buscar objetivo guarda precisión completa.
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 12,
  }).format(Number(n))
}

function fmtCant(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 12,
  }).format(Number(n))
}

function thStyle(t, align = 'left') {
  return {
    textAlign: align,
    padding: '7px 10px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 700,
    color: t.textMuted,
    borderBottom: `1px solid ${t.border}`,
    background: t.bg,
    whiteSpace: 'nowrap',
  }
}

function tdStyle(t, align = 'left', opts = {}) {
  return {
    textAlign: align,
    padding: '7px 10px',
    fontSize: 'var(--cc-label)',
    color: opts.muted ? t.textMuted : t.text,
    borderBottom: `1px solid ${t.border}`,
    fontWeight: opts.bold ? 700 : 400,
    whiteSpace: opts.nowrap ? 'nowrap' : undefined,
  }
}

function InfoTable({ t, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={{ ...tdStyle(t, 'left', { muted: true }), width: '38%' }}>{row.label}</td>
            <td style={tdStyle(t, 'right', { bold: true, nowrap: true })}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CompareTable({ t, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle(t, 'left')}>Concepto</th>
          <th style={thStyle(t, 'right')}>Antes</th>
          <th style={thStyle(t, 'right')}>Después</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={tdStyle(t, 'left', { muted: true })}>{row.label}</td>
            <td style={tdStyle(t, 'right', { nowrap: true })}>{row.before}</td>
            <td style={tdStyle(t, 'right', { bold: true, nowrap: true })}>{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Popup Buscar objetivo: cierra el presupuesto total ajustando una dimensión de un registro.
 */
export default function PptoBuscarObjetivoModal({
  open,
  onClose,
  t,
  contratoId,
  token,
  API,
  pptoEp,
  onApplied,
  /** true si el contrato bloquea Área/Long/Nodo en registros con Id_Pol (CAD). */
  bloqueaAreaCad = true,
}) {
  const [costoActual, setCostoActual] = useState(null)
  const [cargandoActual, setCargandoActual] = useState(false)
  const [objetivo, setObjetivo] = useState('')
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState([])
  const [registro, setRegistro] = useState(null)
  const [dimension, setDimension] = useState('espesor')
  const [error, setError] = useState('')
  const [fase, setFase] = useState('form') // form | confirm | done
  const [preview, setPreview] = useState(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultadoOk, setResultadoOk] = useState(null)

  const authHdrs = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token],
  )

  const reset = useCallback(() => {
    setObjetivo('')
    setQ('')
    setResultados([])
    setRegistro(null)
    setDimension('espesor')
    setError('')
    setFase('form')
    setPreview(null)
    setAplicando(false)
    setResultadoOk(null)
  }, [])

  const cargarCostoActual = useCallback(async () => {
    if (!contratoId || !token) return
    setCargandoActual(true)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/buscar-objetivo/presupuesto-actual`
          + '?tipo_ejecucion=Presupuesto%20de%20Obra',
        { headers: authHdrs },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      const data = await res.json()
      setCostoActual(Math.round(Number(data?.costo_total) || 0))
    } catch (err) {
      setCostoActual(null)
      setError(err?.message || 'No se pudo cargar el presupuesto actual')
    } finally {
      setCargandoActual(false)
    }
  }, [API, contratoId, token, authHdrs])

  useEffect(() => {
    if (!open) {
      reset()
      setCostoActual(null)
      return
    }
    void cargarCostoActual()
  }, [open, reset, cargarCostoActual])

  const buscar = useCallback(async (term) => {
    if (!contratoId || !token) return
    setBuscando(true)
    setError('')
    try {
      const params = new URLSearchParams({
        q: term || '',
        limit: '30',
        tipo_ejecucion: 'Presupuesto de Obra',
      })
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/buscar-objetivo/registros?${params}`,
        { headers: authHdrs },
      )
      if (!res.ok) throw new Error(await res.text().catch(() => `Error ${res.status}`))
      const data = await res.json()
      setResultados(Array.isArray(data?.registros) ? data.registros : [])
    } catch (err) {
      setResultados([])
      setError(err?.message || 'Error al buscar registros')
    } finally {
      setBuscando(false)
    }
  }, [API, contratoId, token, authHdrs])

  useEffect(() => {
    if (!open || fase !== 'form') return undefined
    const tmr = setTimeout(() => {
      if (q.trim().length >= 1) void buscar(q.trim())
      else setResultados([])
    }, 280)
    return () => clearTimeout(tmr)
  }, [q, open, fase, buscar])

  const labelALN = labelAreaLongNodo(registro?.tipo_entidad)
  const areaBloqueadaCad = !!(
    bloqueaAreaCad
    && registro
    && String(registro.id_pol || '').trim()
  )

  const dimOptions = useMemo(() => {
    if (!registro) return []
    const a = numDim(registro.area_long_nod)
    const w = numDim(registro.ancho)
    const e = numDim(registro.espesor)
    return DIM_OPTIONS.map((opt) => {
      const label = opt.labelFromTipo ? labelALN : opt.label
      const solvable = puedeDespejarDimension(opt.key, a, w, e)
      const cadBlock = opt.key === 'area_long_nod' && areaBloqueadaCad
      return {
        key: opt.key,
        label,
        disabled: !solvable.ok || cadBlock,
        reason: cadBlock
          ? 'Área/Long/Nodo enlazado al plano: solo editable desde ClaraLink/DWG. Use Ancho o Espesor.'
          : solvable.reason,
      }
    })
  }, [registro, labelALN, areaBloqueadaCad])

  useEffect(() => {
    if (!registro || !dimOptions.length) return
    const current = dimOptions.find((d) => d.key === dimension && !d.disabled)
    if (current) return
    const first = dimOptions.find((d) => !d.disabled)
    if (first) setDimension(first.key)
  }, [registro, dimOptions, dimension])

  const onCalcular = () => {
    setError('')
    if (costoActual == null) {
      setError('No hay presupuesto actual cargado.')
      return
    }
    if (!registro) {
      setError('Seleccione un registro por Id_Pol.')
      return
    }
    const obj = parseObjetivoCopNumber(objetivo)
    if (!Number.isFinite(obj)) {
      setError('Indique un presupuesto objetivo válido (entero en COP).')
      return
    }
    if (obj === Math.round(costoActual)) {
      setError('El objetivo es igual al presupuesto actual; no hay nada que ajustar.')
      return
    }
    const opt = dimOptions.find((d) => d.key === dimension)
    if (!opt || opt.disabled) {
      setError(opt?.reason || 'Seleccione una dimensión ajustable.')
      return
    }
    const r = calcularBuscarObjetivo({
      presupuestoActual: costoActual,
      presupuestoObjetivo: obj,
      costoDirectoRegistro: registro.costo_directo,
      vlrUnitario: registro.vlr_unitario,
      area: registro.area_long_nod,
      ancho: registro.ancho,
      espesor: registro.espesor,
      dimension,
    })
    if (!r.ok) {
      setError(r.error || 'No se pudo calcular.')
      return
    }
    setPreview({ ...r, objetivo: obj, dimension, dimLabel: opt.label })
    setFase('confirm')
  }

  const onConfirmar = async () => {
    if (!preview || !registro || !contratoId) return
    setAplicando(true)
    setError('')
    try {
      // Endpoint dedicado: guarda dimensión/cant con precisión completa y CD exacto
      // (no pasa por PUT item, que redondea cant a 2 dp).
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/buscar-objetivo/aplicar`,
        {
          method: 'POST',
          headers: { ...authHdrs, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            presupuesto_id: registro.id,
            dimension: preview.dimension,
            presupuesto_objetivo: preview.objetivo,
            tipo_ejecucion: 'Presupuesto de Obra',
          }),
        },
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        let detail = txt
        try {
          const j = JSON.parse(txt)
          detail = j?.detail || txt
        } catch { /* ignore */ }
        throw new Error(typeof detail === 'string' ? detail : 'No se pudo aplicar el ajuste')
      }
      const data = await res.json().catch(() => null)
      const updated = data?.registro || null
      const cierre = data?.ajuste
      await cargarCostoActual()
      setResultadoOk({
        preview: {
          ...preview,
          dimNueva: cierre?.dim_nueva ?? preview.dimNueva,
          cantNueva: cierre?.cant_nueva ?? preview.cantNueva,
          cdRegistroNuevo: cierre?.cd_registro_nuevo ?? preview.cdRegistroNuevo,
          totalNuevo: cierre?.total_nuevo ?? preview.totalNuevo,
        },
        updated,
        idPol: registro.id_pol || registro.pk_id,
        cierreExacto: cierre?.cierre_exacto,
      })
      setFase('done')
      onApplied?.(updated || registro)
    } catch (err) {
      setError(err?.message || 'Error al guardar')
      setFase('form')
    } finally {
      setAplicando(false)
    }
  }

  if (!open) return null

  const btnGhost = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 'var(--cc-label)',
    color: t.textMuted,
    cursor: 'pointer',
  }
  const btnPrimary = {
    background: t.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 'var(--cc-label)',
    fontWeight: 700,
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 2100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !aplicando) onClose?.()
      }}
    >
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: '18px 22px',
          width: MODAL_WIDTH,
          maxWidth: '96vw',
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 700, color: t.primary }}>
            🎯 Buscar objetivo
          </div>
          <button
            type="button"
            onClick={() => !aplicando && onClose?.()}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: t.textMuted,
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {fase === 'form' && (
          <>
            {/* Actual + Objetivo lado a lado → menos altura */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <section>
                <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                  Presupuesto actual
                </div>
                <div
                  style={{
                    background: t.bg,
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    padding: '10px 12px',
                    fontSize: 'var(--cc-md)',
                    fontWeight: 700,
                    color: t.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={costoActual != null ? formatCOP(costoActual) : undefined}
                >
                  {cargandoActual ? 'Cargando…' : costoActual != null ? formatCOP(costoActual) : '—'}
                </div>
              </section>
              <section>
                <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                  Presupuesto objetivo
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={objetivo}
                  onChange={(e) => setObjetivo(formatObjetivoCopDisplay(e.target.value))}
                  placeholder="$ 0"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.text,
                    fontSize: 'var(--cc-md)',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </section>
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 12, marginTop: -6 }}>
              Σ costo_directo · Presupuesto de Obra (mismo total de la pestaña Resumen)
            </div>

            <section style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>
                Registro (Id_Pol)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    if (registro) setRegistro(null)
                  }}
                  placeholder="Buscar por Id_Pol, PK, ítem o tramo…"
                  style={{
                    flex: 1,
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.text,
                    fontSize: 'var(--cc-label)',
                  }}
                />
                {buscando && (
                  <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Buscando…</span>
                )}
              </div>

              {!registro && resultados.length > 0 && (
                <div
                  style={{
                    maxHeight: 120,
                    overflow: 'auto',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle(t)}>Id_Pol</th>
                        <th style={thStyle(t)}>Capítulo / Ítem</th>
                        <th style={thStyle(t)}>Tramo</th>
                        <th style={thStyle(t, 'right')}>Costo dir.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((r) => (
                        <tr
                          key={r.id}
                          onClick={() => {
                            setRegistro(r)
                            setQ(String(r.id_pol || r.pk_id || ''))
                            setResultados([])
                          }}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = t.bg }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={tdStyle(t, 'left', { bold: true, nowrap: true })}>
                            {r.id_pol || r.pk_id || r.id}
                          </td>
                          <td style={tdStyle(t)}>
                            {r.capitulo} / {r.item}
                          </td>
                          <td style={tdStyle(t)}>{r.tramo || '—'}</td>
                          <td style={tdStyle(t, 'right', { nowrap: true })}>
                            {formatCOP(r.costo_directo)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {registro && (
                <div
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: t.bg,
                      borderBottom: `1px solid ${t.border}`,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-label)' }}>
                      {registro.id_pol || registro.pk_id}
                      <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 8 }}>
                        {registro.capitulo} / {registro.item}
                        {registro.tramo ? ` · ${registro.tramo}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRegistro(null)
                        setQ('')
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: t.primary,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-sm)',
                        fontWeight: 600,
                      }}
                    >
                      Cambiar
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 0 }}>
                    <div style={{ borderRight: `1px solid ${t.border}` }}>
                      <InfoTable
                        t={t}
                        rows={[
                          { label: labelALN, value: fmtDim(registro.area_long_nod) },
                          { label: 'Ancho', value: fmtDim(registro.ancho) },
                          { label: 'Espesor', value: fmtDim(registro.espesor) },
                          { label: 'Cantidad', value: fmtCant(registro.cant_total) },
                          { label: 'Vlr. unitario', value: formatCOP(registro.vlr_unitario) },
                          { label: 'Costo directo', value: formatCOP(registro.costo_directo) },
                        ]}
                      />
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
                        Dimensión a ajustar
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {dimOptions.map((opt) => (
                          <label
                            key={opt.key}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              opacity: opt.disabled ? 0.5 : 1,
                              cursor: opt.disabled ? 'not-allowed' : 'pointer',
                              color: t.text,
                              fontSize: 'var(--cc-label)',
                            }}
                            title={opt.reason || ''}
                          >
                            <input
                              type="radio"
                              name="dim-objetivo"
                              disabled={opt.disabled}
                              checked={dimension === opt.key}
                              onChange={() => setDimension(opt.key)}
                              style={{ marginTop: 3 }}
                            />
                            <span>
                              {opt.label}
                              {opt.disabled && opt.reason ? (
                                <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.3 }}>
                                  {opt.reason}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#991B1B',
                  fontSize: 'var(--cc-sm)',
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => onClose?.()} style={btnGhost}>
                Cancelar
              </button>
              <button type="button" onClick={onCalcular} style={btnPrimary}>
                Calcular ajuste
              </button>
            </div>
          </>
        )}

        {fase === 'confirm' && preview && (
          <>
            <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginBottom: 10 }}>
              Se actualizará el registro{' '}
              <strong style={{ color: t.text }}>{registro?.id_pol || registro?.pk_id}</strong>
              {' '}ajustando <strong style={{ color: t.text }}>{preview.dimLabel}</strong>.
            </div>

            <div
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <CompareTable
                t={t}
                rows={[
                  {
                    label: preview.dimLabel,
                    before: fmtDim(preview.dimActual),
                    after: fmtDim(preview.dimNueva),
                  },
                  {
                    label: 'Cant. total',
                    before: fmtCant(preview.cantActual),
                    after: fmtCant(preview.cantNueva),
                  },
                  {
                    label: 'Costo del registro',
                    before: formatCOP(preview.cdRegistroActual),
                    after: formatCOP(preview.cdRegistroNuevo),
                  },
                  {
                    label: 'Presupuesto total',
                    before: formatCOP(preview.totalActual),
                    after: formatCOP(preview.totalNuevo),
                  },
                ]}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                Objetivo: <strong style={{ color: t.text }}>{formatCOP(preview.objetivo)}</strong>
                {' · '}
                Cant. = Área × Ancho × Espesor · CD = Cant. × Vlr.Unit
              </div>
            </div>

            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 'var(--cc-sm)',
                color: '#92400E',
                marginBottom: 14,
              }}
            >
              ⚠️ Esta acción modifica los datos en la base de datos y <strong>no se puede deshacer</strong> desde esta herramienta.
            </div>

            {error && (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#991B1B',
                  fontSize: 'var(--cc-sm)',
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={aplicando}
                onClick={() => {
                  setFase('form')
                  setPreview(null)
                }}
                style={btnGhost}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={aplicando}
                onClick={() => void onConfirmar()}
                style={{
                  ...btnPrimary,
                  cursor: aplicando ? 'wait' : 'pointer',
                  opacity: aplicando ? 0.7 : 1,
                }}
              >
                {aplicando ? 'Guardando…' : '✓ Confirmar y guardar'}
              </button>
            </div>
          </>
        )}

        {fase === 'done' && resultadoOk && (
          <>
            <div
              style={{
                border: '1px solid #A7F3D0',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 14,
                background: '#ECFDF5',
              }}
            >
              <div style={{ padding: '10px 12px', fontWeight: 700, color: '#065F46', fontSize: 'var(--cc-label)' }}>
                ✓ Ajuste aplicado · {resultadoOk.idPol}
                {resultadoOk.cierreExacto === false
                  ? ' (revisar total)'
                  : ' · cierre exacto'}
              </div>
              <div style={{ background: t.bgCard }}>
                <CompareTable
                  t={t}
                  rows={[
                    {
                      label: resultadoOk.preview.dimLabel,
                      before: fmtDim(resultadoOk.preview.dimActual),
                      after: fmtDim(resultadoOk.preview.dimNueva),
                    },
                    {
                      label: 'Presupuesto total',
                      before: formatCOP(resultadoOk.preview.totalActual),
                      after: costoActual != null
                        ? formatCOP(costoActual)
                        : formatCOP(resultadoOk.preview.totalNuevo),
                    },
                  ]}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => onClose?.()} style={btnPrimary}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
