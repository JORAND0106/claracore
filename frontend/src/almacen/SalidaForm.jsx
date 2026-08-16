import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import ReceptorObraSelector from './ReceptorObraSelector'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import { validateAbscisaRango, ABSCISA_RANGO_ERROR } from './almacenAbscisa'
import {
  AlmacenFieldLabel,
  fmtCant,
  formatNumeroOcDisplay,
  formatSalidaNumero,
  getAlmacenSessionUser,
  useAlmacenApi,
  useAlmacenTheme,
  datetimeLocalColombiaToIsoUtc,
  nowDatetimeLocalColombia,
} from './almacenShared'

const DRAFT_KEY_PREFIX = 'cc_almacen_salida_draft_'

function draftStorageKey(contratoId) {
  return `${DRAFT_KEY_PREFIX}${contratoId || 'x'}`
}

function readDraft(contratoId) {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(contratoId))
    if (!raw) return null
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

function writeDraft(contratoId, payload) {
  try {
    sessionStorage.setItem(draftStorageKey(contratoId), JSON.stringify(payload))
  } catch { /* quota / private mode */ }
}

function clearDraft(contratoId) {
  try {
    sessionStorage.removeItem(draftStorageKey(contratoId))
  } catch { /* ignore */ }
}

export default function SalidaForm({
  permisos,
  token,
  contratoId,
  theme,
  embedded = false,
  onSaved,
  onCancel,
  onDirtyChange,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const sessionUser = getAlmacenSessionUser()
  const restoredRef = useRef(false)
  const initialDraft = useMemo(() => readDraft(contratoId), [contratoId])

  const [receptor, setReceptor] = useState(() => initialDraft?.receptor || null)
  const [fechaHora, setFechaHora] = useState(
    () => initialDraft?.fechaHora || nowDatetimeLocalColombia(),
  )
  const [pkId, setPkId] = useState(() => initialDraft?.pkId || '')
  const [pkLabel, setPkLabel] = useState(() => initialDraft?.pkLabel || '')
  const [pkIdId, setPkIdId] = useState(() => initialDraft?.pkIdId ?? null)
  const [tramo, setTramo] = useState(() => initialDraft?.tramo || '')
  const [costado, setCostado] = useState(() => initialDraft?.costado || '')
  const [abscisaInicial, setAbscisaInicial] = useState(() => initialDraft?.abscisaInicial || '')
  const [abscisaFinal, setAbscisaFinal] = useState(() => initialDraft?.abscisaFinal || '')
  const [entradasDisp, setEntradasDisp] = useState([])
  const [entradaSel, setEntradaSel] = useState(null)
  const [entradaItemIdDraft] = useState(() => initialDraft?.entradaItemId ?? null)
  const [cantidad, setCantidad] = useState(() => initialDraft?.cantidad || '')
  const [observaciones, setObservaciones] = useState(() => initialDraft?.observaciones || '')
  const [loadingEntradas, setLoadingEntradas] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const dirty = Boolean(
    receptor || pkId || entradaSel || cantidad.trim() || observaciones.trim(),
  )

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  // Persistir borrador ante cambio de pestaña / remount (token refresh, focus).
  useEffect(() => {
    if (!dirty && !pkId) {
      clearDraft(contratoId)
      return undefined
    }
    writeDraft(contratoId, {
      receptor,
      fechaHora,
      pkId,
      pkLabel,
      pkIdId,
      tramo,
      costado,
      abscisaInicial,
      abscisaFinal,
      entradaItemId: entradaSel?.entrada_item_id ?? entradaItemIdDraft,
      cantidad,
      observaciones,
    })
    return undefined
  }, [
    dirty, contratoId, receptor, fechaHora, pkId, pkLabel, pkIdId, tramo, costado,
    abscisaInicial, abscisaFinal, entradaSel, entradaItemIdDraft, cantidad, observaciones,
  ])

  const loadEntradas = useCallback((pk, { preferEntradaItemId = null } = {}) => {
    const pkNorm = (pk || '').trim()
    if (!pkNorm) {
      setEntradasDisp([])
      setEntradaSel(null)
      return
    }
    setLoadingEntradas(true)
    api.listEntradasDisponiblesPorPk(pkNorm)
      .then((rows) => {
        setEntradasDisp(rows)
        if (preferEntradaItemId != null) {
          const match = rows.find((r) => String(r.entrada_item_id) === String(preferEntradaItemId))
          setEntradaSel(match || null)
          if (!match) setCantidad('')
        } else {
          setEntradaSel(null)
          setCantidad('')
        }
      })
      .catch((e) => {
        setEntradasDisp([])
        setEntradaSel(null)
        setError(e.message)
      })
      .finally(() => setLoadingEntradas(false))
  }, [api])

  // Restaurar entradas tras remount si había PK en el borrador.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!pkId) return
    loadEntradas(pkId, { preferEntradaItemId: entradaItemIdDraft })
  }, [pkId, entradaItemIdDraft, loadEntradas])

  const onPkSeleccionar = (sel) => {
    setError('')
    setPkId(sel.pk_id || sel.pk_label || '')
    setPkLabel(sel.pk_label || sel.pk_id || '')
    setPkIdId(sel.pk_id_id ?? null)
    setTramo(sel.tramo || '')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setEntradaSel(null)
    setCantidad('')
    loadEntradas(sel.pk_id || sel.pk_label)
  }

  const onPkLimpiar = () => {
    setPkId('')
    setPkLabel('')
    setPkIdId(null)
    setTramo('')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setEntradasDisp([])
    setEntradaSel(null)
    setCantidad('')
    clearDraft(contratoId)
  }

  const cantidadNum = parseFloat(String(cantidad).replace(',', '.'))
  const disponible = entradaSel ? Number(entradaSel.cantidad_disponible || 0) : 0
  const saldoTrasEsta = Number.isFinite(cantidadNum) && cantidadNum > 0
    ? Math.max(0, disponible - cantidadNum)
    : disponible
  const cantidadInvalida = entradaSel && cantidad.trim() && (
    !Number.isFinite(cantidadNum) || cantidadNum <= 0 || cantidadNum > disponible + 1e-9
  )

  const alertaProximidad = useMemo(() => {
    if (!entradaSel) return null
    if (entradaSel.alerta_proximidad_consumo) {
      return 'Esta entrada tiene poco material disponible. Considere gestionar una nueva OC antes de agotarse.'
    }
    if (cantidad.trim() && Number.isFinite(cantidadNum) && cantidadNum > 0) {
      const restante = disponible - cantidadNum
      const recibida = Number(entradaSel.cantidad_recibida || 0)
      if (recibida > 0 && restante <= recibida * 0.2) {
        return 'Con esta salida el saldo disponible quedará muy bajo. Anticipe una nueva orden de compra.'
      }
    }
    return null
  }, [entradaSel, cantidad, cantidadNum, disponible])

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const inputErrorStyle = (key) => (fieldErrors[key] ? { borderColor: '#dc2626' } : {})

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const errs = {}
    if (!receptor?.id) errs.receptor = 'Seleccione quién recibe en obra.'
    if (!pkId.trim()) errs.pk = 'Seleccione la ubicación en el mapa PK-ID.'
    if (!entradaSel) errs.entrada = 'Seleccione la entrada de material.'
    if (!cantidad.trim() || !Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      errs.cantidad = 'Indique una cantidad válida.'
    } else if (cantidadNum > disponible + 1e-9) {
      errs.cantidad = `No puede superar el saldo disponible (${fmtCant(disponible)}).`
    }
    if (
      String(abscisaInicial ?? '').trim() !== ''
      && String(abscisaFinal ?? '').trim() !== ''
      && !validateAbscisaRango(abscisaInicial, abscisaFinal).ok
    ) {
      errs.abscisas = ABSCISA_RANGO_ERROR
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      const body = {
        receptor_usuario_id: receptor.id,
        fecha_hora_salida: datetimeLocalColombiaToIsoUtc(fechaHora),
        pk_id: pkId.trim(),
        pk_id_id: pkIdId,
        tramo: tramo || null,
        costado: costado || null,
        abscisa_inicial: abscisaInicial || null,
        abscisa_final: abscisaFinal || null,
        entrada_item_id: entradaSel.entrada_item_id,
        cantidad_salida: cantidadNum,
        observaciones: observaciones.trim() || null,
      }
      const saved = await api.createSalida(body)
      clearDraft(contratoId)
      onSaved?.(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const btnRow = {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    marginTop: embedded ? 12 : 16,
  }

  return (
    <form onSubmit={submit}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>}

      <AlmacenFieldLabel
        icon="👤"
        label="Quién recibe en obra"
        ayuda="Solo usuarios con rol operativo, contratista o contratista gerencial del contrato."
      />
      <ReceptorObraSelector
        value={receptor}
        onChange={(v) => { setReceptor(v); clearFieldError('receptor') }}
        disabled={busy}
      />
      {fieldErrors.receptor && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.receptor}</div>
      )}

      <AlmacenFieldLabel icon="🕐" label="Fecha y hora de salida" />
      <input
        type="datetime-local"
        style={{ ...ui.input, marginBottom: 12, ...inputErrorStyle('fecha') }}
        value={fechaHora}
        disabled={busy}
        onChange={(e) => setFechaHora(e.target.value)}
      />

      <AlmacenFieldLabel
        icon="📍"
        label="Ubicación (PK-ID)"
        ayuda="Seleccione el punto en el mapa. Al elegir PK-ID se cargan las entradas con saldo disponible."
      />
      <AlmacenPkMapaSelector
        t={theme}
        token={token}
        contratoId={contratoId}
        pkIdSeleccionado={pkIdId || pkId}
        pkLabel={pkLabel}
        onSeleccionar={onPkSeleccionar}
        onLimpiar={onPkLimpiar}
        compact={embedded}
      />
      {fieldErrors.pk && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.pk}</div>
      )}

      {pkId && (
        <UbicacionSolicitudFields
          variant="excel"
          pkId={pkLabel || pkId}
          tramo={tramo}
          costado={costado}
          abscisaInicial={abscisaInicial}
          abscisaFinal={abscisaFinal}
          abscisasEditable
          onChange={(patch) => {
            if (patch.costado != null) setCostado(patch.costado)
            if (patch.abscisa_inicial != null) {
              setAbscisaInicial(patch.abscisa_inicial)
              clearFieldError('abscisas')
            }
            if (patch.abscisa_final != null) {
              setAbscisaFinal(patch.abscisa_final)
              clearFieldError('abscisas')
            }
          }}
          disabled={busy}
        />
      )}
      {fieldErrors.abscisas && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.abscisas}</div>
      )}

      {pkId && (
        <>
          <AlmacenFieldLabel
            icon="📥"
            label="Entrada de material"
            ayuda="Seleccione la entrada registrada en este PK-ID con cantidad disponible."
          />
          {loadingEntradas ? (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>Cargando entradas…</div>
          ) : entradasDisp.length === 0 ? (
            <div style={{ ...ui.card, fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
              No hay entradas con saldo disponible para este PK-ID.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {entradasDisp.map((op) => {
                const sel = entradaSel?.entrada_item_id === op.entrada_item_id
                const cod = op.insumo_codigo ? `${op.insumo_codigo} · ` : ''
                const ppto = [op.presupuesto_capitulo, op.presupuesto_item].filter(Boolean).join(' · ')
                const dispOp = Number(op.cantidad_disponible || 0)
                return (
                  <div
                    key={op.entrada_item_id}
                    role="button"
                    tabIndex={busy ? -1 : 0}
                    aria-pressed={sel}
                    onClick={() => {
                      if (busy) return
                      if (sel) return
                      setEntradaSel(op)
                      setCantidad('')
                      if (op.tramo) setTramo(op.tramo)
                      if (op.costado) setCostado(op.costado)
                      if (op.abscisa_inicial) setAbscisaInicial(op.abscisa_inicial)
                      if (op.abscisa_final) setAbscisaFinal(op.abscisa_final)
                      clearFieldError('entrada')
                      clearFieldError('cantidad')
                    }}
                    onKeyDown={(e) => {
                      if (busy || sel) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.currentTarget.click()
                      }
                    }}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      borderRadius: 8,
                      border: sel ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
                      background: sel ? ui.accentSoft : ui.card?.background,
                      cursor: busy ? 'default' : (sel ? 'default' : 'pointer'),
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
                      Entrada {formatSalidaNumero(op)}
                      {op.numero_oc != null && ` · OC ${formatNumeroOcDisplay(op.numero_oc)}`}
                    </div>
                    <div style={{ fontSize: 'var(--cc-sm)', marginTop: 4 }}>
                      {cod}{op.material_descripcion}
                    </div>
                    {ppto && (
                      <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                        Ítem presupuesto: {ppto}
                      </div>
                    )}
                    <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
                      Recibido en esta entrada:{' '}
                      <strong>{fmtCant(op.cantidad_recibida_entrada ?? op.cantidad_recibida)} {op.unidad}</strong>
                      {' · '}Disponible para salida:{' '}
                      <strong style={{ color: ui.text }}>{fmtCant(op.cantidad_disponible)} {op.unidad}</strong>
                      {op.cantidad_oc_autorizada != null && (
                        <span>{' · '}OC autoriza {fmtCant(op.cantidad_oc_autorizada)} {op.unidad}</span>
                      )}
                    </div>
                    {op.alerta_proximidad_consumo && !sel && (
                      <div style={{ fontSize: 'var(--cc-xs)', color: '#b45309', marginTop: 6, fontWeight: 600 }}>
                        ⚠ Saldo bajo — considere nueva OC
                      </div>
                    )}

                    {sel && (
                      <div
                        style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${ui.border}` }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <label
                          htmlFor={`salida-cantidad-${op.entrada_item_id}`}
                          style={{
                            display: 'block',
                            fontSize: 'var(--cc-sm)',
                            fontWeight: 700,
                            marginBottom: 6,
                            color: ui.text,
                          }}
                        >
                          Cantidad a despachar <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 200px) 1fr',
                          gap: 12,
                          alignItems: 'start',
                        }}
                        >
                          <div>
                            <input
                              id={`salida-cantidad-${op.entrada_item_id}`}
                              type="text"
                              inputMode="decimal"
                              style={{
                                ...ui.input,
                                marginBottom: 4,
                                ...inputErrorStyle('cantidad'),
                              }}
                              value={cantidad}
                              disabled={busy}
                              placeholder={`Máx. ${fmtCant(dispOp)}`}
                              onChange={(e) => {
                                setCantidad(e.target.value)
                                clearFieldError('cantidad')
                              }}
                            />
                            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                              {op.unidad || 'UND'}
                            </div>
                          </div>
                          <div style={{ fontSize: 'var(--cc-xs)', lineHeight: 1.55, color: ui.text }}>
                            {Number(op.cantidad_despachada || 0) > 0 && (
                              <div>
                                Ya despachado:{' '}
                                <strong>{fmtCant(op.cantidad_despachada)} {op.unidad || ''}</strong>
                              </div>
                            )}
                            {cantidad.trim() && Number.isFinite(cantidadNum) && cantidadNum > 0 && !cantidadInvalida && (
                              <div style={{ fontWeight: 600 }}>
                                Tras esta salida quedará disponible:{' '}
                                <strong style={{ color: 'var(--cc-color-positive, #059669)' }}>
                                  {fmtCant(saldoTrasEsta)} {op.unidad || ''}
                                </strong>
                              </div>
                            )}
                            {(!cantidad.trim() || !Number.isFinite(cantidadNum) || cantidadNum <= 0) && (
                              <div style={{ color: ui.textMuted }}>
                                Indique cuánto sale en este despacho. El saldo disponible se actualizará al confirmar.
                              </div>
                            )}
                          </div>
                        </div>
                        {fieldErrors.cantidad && (
                          <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                            {fieldErrors.cantidad}
                          </div>
                        )}
                        {cantidadInvalida && !fieldErrors.cantidad && (
                          <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                            La cantidad a despachar ({fmtCant(cantidadNum)} {op.unidad}) supera el disponible
                            para salida ({fmtCant(disponible)} {op.unidad}).
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {fieldErrors.entrada && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.entrada}</div>
          )}
        </>
      )}

      {entradaSel && alertaProximidad && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 'var(--cc-sm)',
          color: '#92400e',
          marginBottom: 12,
        }}
        >
          ⚠ {alertaProximidad}
        </div>
      )}

      <AlmacenFieldLabel icon="🚚" label="Quién despacha" ayuda="Usuario de la sesión activa." />
      <input
        style={{ ...ui.input, marginBottom: 12, background: ui.accentSoft }}
        value={sessionUser?.label || '—'}
        readOnly
        disabled
      />

      <AlmacenFieldLabel icon="📝" label="Observaciones (opcional)" />
      <textarea
        style={{ ...ui.input, minHeight: 72, resize: 'vertical', marginBottom: 12 }}
        value={observaciones}
        disabled={busy}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder="Notas adicionales sobre la entrega…"
      />

      <div style={btnRow}>
        <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="submit"
          style={ui.btnPrimary}
          disabled={busy || cantidadInvalida}
        >
          {busy ? 'Registrando…' : 'Registrar salida'}
        </button>
      </div>
    </form>
  )
}
