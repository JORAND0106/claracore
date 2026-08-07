import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../../utils/formatCOP'
import {
  calcularBuscarObjetivo,
  labelAreaLongNodo,
  numDim,
  puedeDespejarDimension,
} from './pptoBuscarObjetivo.js'

const DIM_OPTIONS = [
  { key: 'area_long_nod', labelFromTipo: true },
  { key: 'ancho', label: 'Ancho' },
  { key: 'espesor', label: 'Espesor' },
]

function fmtDim(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(n))
}

function fmtCant(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n))
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
      // Misma fuente que pestaña Resumen / capitulos-lista: Σ costo_directo.
      // NO usar GET /presupuesto/.../resumen (KPI dashboard con VU listado_precios).
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

  const parseObjetivo = () => {
    // Acepta "1250000000", "1.250.000.000" (miles es-CO) o "1250000000,5"
    const cleaned = String(objetivo || '')
      .trim()
      .replace(/\s/g, '')
      .replace(/[^\d,.\-]/g, '')
    if (!cleaned) return NaN
    let n
    if (cleaned.includes(',') && cleaned.includes('.')) {
      n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
    } else if (cleaned.includes(',')) {
      n = parseFloat(cleaned.replace(',', '.'))
    } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      n = parseFloat(cleaned.replace(/\./g, ''))
    } else {
      n = parseFloat(cleaned)
    }
    return Number.isFinite(n) ? Math.round(n) : NaN
  }

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
    const obj = parseObjetivo()
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
    if (!preview || !registro || !pptoEp?.item) return
    setAplicando(true)
    setError('')
    try {
      const body = { [preview.dimension]: preview.dimNueva }
      const res = await fetch(pptoEp.item(registro.id), {
        method: 'PUT',
        headers: { ...authHdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        let detail = txt
        try {
          const j = JSON.parse(txt)
          detail = j?.detail || txt
        } catch { /* ignore */ }
        throw new Error(typeof detail === 'string' ? detail : 'No se pudo aplicar el ajuste')
      }
      const updated = await res.json().catch(() => null)
      await cargarCostoActual()
      setResultadoOk({
        preview,
        updated,
        idPol: registro.id_pol || registro.pk_id,
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
          borderRadius: 16,
          padding: 24,
          width: 520,
          maxWidth: '96vw',
          maxHeight: '92vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 700, color: t.primary }}>
            🎯 Buscar objetivo
          </div>
          <button
            type="button"
            onClick={() => !aplicando && onClose?.()}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: t.textMuted,
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {fase === 'form' && (
          <>
            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                1. Presupuesto actual
              </div>
              <div
                style={{
                  background: t.bg,
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 'var(--cc-md)',
                  fontWeight: 700,
                  color: t.text,
                }}
              >
                {cargandoActual ? 'Cargando…' : costoActual != null ? formatCOP(costoActual) : '—'}
              </div>
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 4 }}>
                Σ costo_directo · Presupuesto de Obra (mismo total de la pestaña Resumen)
              </div>
            </section>

            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                2. Presupuesto objetivo
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                placeholder="Ej. 1250000000"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontSize: 'var(--cc-label)',
                }}
              />
            </section>

            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                3. Registro (Id_Pol)
              </div>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  if (registro) setRegistro(null)
                }}
                placeholder="Buscar por Id_Pol, PK, ítem o tramo…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontSize: 'var(--cc-label)',
                  marginBottom: 8,
                }}
              />
              {buscando && (
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Buscando…</div>
              )}
              {!registro && resultados.length > 0 && (
                <div
                  style={{
                    maxHeight: 160,
                    overflow: 'auto',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                  }}
                >
                  {resultados.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setRegistro(r)
                        setQ(String(r.id_pol || r.pk_id || ''))
                        setResultados([])
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: 'none',
                        borderBottom: `1px solid ${t.border}`,
                        background: t.bgCard,
                        color: t.text,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-sm)',
                      }}
                    >
                      <strong>{r.id_pol || r.pk_id || r.id}</strong>
                      {' · '}
                      {r.capitulo} / {r.item}
                      {r.tramo ? ` · ${r.tramo}` : ''}
                      {' · '}
                      {formatCOP(r.costo_directo)}
                    </button>
                  ))}
                </div>
              )}

              {registro && (
                <div
                  style={{
                    background: t.bg,
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 4,
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8, color: t.text }}>
                    {registro.id_pol || registro.pk_id} · {registro.capitulo} / {registro.item}
                    <button
                      type="button"
                      onClick={() => {
                        setRegistro(null)
                        setQ('')
                      }}
                      style={{
                        float: 'right',
                        background: 'transparent',
                        border: 'none',
                        color: t.primary,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-sm)',
                      }}
                    >
                      Cambiar
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, color: t.text }}>
                    <span>{labelALN}: <strong>{fmtDim(registro.area_long_nod)}</strong></span>
                    <span>Ancho: <strong>{fmtDim(registro.ancho)}</strong></span>
                    <span>Espesor: <strong>{fmtDim(registro.espesor)}</strong></span>
                    <span>Cant.: <strong>{fmtCant(registro.cant_total)}</strong></span>
                    <span>Vlr. unit.: <strong>{formatCOP(registro.vlr_unitario)}</strong></span>
                    <span>Costo dir.: <strong>{formatCOP(registro.costo_directo)}</strong></span>
                  </div>

                  <div style={{ marginTop: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                    ¿Con cuál dimensión se hace el ajuste?
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dimOptions.map((opt) => (
                      <label
                        key={opt.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          opacity: opt.disabled ? 0.55 : 1,
                          cursor: opt.disabled ? 'not-allowed' : 'pointer',
                          color: t.text,
                        }}
                        title={opt.reason || ''}
                      >
                        <input
                          type="radio"
                          name="dim-objetivo"
                          disabled={opt.disabled}
                          checked={dimension === opt.key}
                          onChange={() => setDimension(opt.key)}
                        />
                        <span>
                          {opt.label}
                          {opt.disabled && opt.reason ? (
                            <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                              {opt.reason}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
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
                  padding: '10px 12px',
                  color: '#991B1B',
                  fontSize: 'var(--cc-sm)',
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onClose?.()}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '9px 18px',
                  fontSize: 'var(--cc-label)',
                  color: t.textMuted,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onCalcular}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 22px',
                  fontSize: 'var(--cc-label)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Calcular ajuste
              </button>
            </div>
          </>
        )}

        {fase === 'confirm' && preview && (
          <>
            <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginBottom: 14 }}>
              Se actualizará <strong style={{ color: t.text }}>1 registro</strong> (
              {registro?.id_pol || registro?.pk_id}) ajustando <strong style={{ color: t.text }}>{preview.dimLabel}</strong>.
            </div>
            <div
              style={{
                background: t.bg,
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                fontSize: 'var(--cc-label)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                color: t.text,
              }}
            >
              <span>
                📐 <strong>{preview.dimLabel}:</strong> {fmtDim(preview.dimActual)} →{' '}
                <strong>{fmtDim(preview.dimNueva)}</strong>
              </span>
              <span>
                📏 <strong>Cant. total:</strong> {fmtCant(preview.cantActual)} → {fmtCant(preview.cantNueva)}
              </span>
              <span>
                💲 <strong>Costo del registro:</strong> {formatCOP(preview.cdRegistroActual)} →{' '}
                {formatCOP(preview.cdRegistroNuevo)}
              </span>
              <span>
                📊 <strong>Presupuesto total:</strong> {formatCOP(preview.totalActual)} →{' '}
                <strong>{formatCOP(preview.totalNuevo)}</strong>
                {' '}(objetivo {formatCOP(preview.objetivo)})
              </span>
              <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', marginTop: 4 }}>
                Cant.Total = Área × Ancho × Espesor → Costo Directo = Cant.Total × Vlr.Unit
              </span>
            </div>
            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 'var(--cc-sm)',
                color: '#92400E',
                marginBottom: 20,
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
                  padding: '10px 12px',
                  color: '#991B1B',
                  fontSize: 'var(--cc-sm)',
                  marginBottom: 12,
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
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '9px 18px',
                  fontSize: 'var(--cc-label)',
                  color: t.textMuted,
                  cursor: 'pointer',
                }}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={aplicando}
                onClick={() => void onConfirmar()}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 22px',
                  fontSize: 'var(--cc-label)',
                  fontWeight: 700,
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
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: 8,
                padding: 14,
                marginBottom: 16,
                color: '#065F46',
                fontSize: 'var(--cc-label)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>✓ Ajuste aplicado</div>
              <div>
                Registro <strong>{resultadoOk.idPol}</strong>: {resultadoOk.preview.dimLabel}{' '}
                {fmtDim(resultadoOk.preview.dimActual)} → {fmtDim(resultadoOk.preview.dimNueva)}
              </div>
              <div style={{ marginTop: 6 }}>
                Presupuesto total: {formatCOP(resultadoOk.preview.totalActual)} →{' '}
                <strong>
                  {costoActual != null ? formatCOP(costoActual) : formatCOP(resultadoOk.preview.totalNuevo)}
                </strong>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onClose?.()}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 22px',
                  fontSize: 'var(--cc-label)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
