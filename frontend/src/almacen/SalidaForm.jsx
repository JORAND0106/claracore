import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import ReceptorObraSelector from './ReceptorObraSelector'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import { validateAbscisaRango, ABSCISA_RANGO_ERROR } from './almacenAbscisa'
import {
  AlmacenFieldLabel,
  fmtCant,
  formatEntradaNumero,
  formatNumeroOcDisplay,
  getAlmacenSessionUser,
  useAlmacenApi,
  useAlmacenTheme,
  datetimeLocalColombiaToIsoUtc,
  nowDatetimeLocalColombia,
} from './almacenShared'
import {
  mensajeExcesoCantidadDespachar,
  splitInsumoCodigoDescripcion,
} from './salidaFormHelpers'

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
        let next = null
        if (preferEntradaItemId != null) {
          next = rows.find((r) => String(r.entrada_item_id) === String(preferEntradaItemId)) || null
        }
        // Auto-seleccionar para que "Cantidad a despachar" quede visible de inmediato
        // (una sola entrada, o la primera si hay varias y no hay borrador).
        if (!next && rows.length >= 1) next = rows[0]
        if (next) {
          const restored = preferEntradaItemId != null
            && String(next.entrada_item_id) === String(preferEntradaItemId)
          setEntradaSel(next)
          if (!restored) setCantidad('')
          if (next.tramo) setTramo(next.tramo)
          if (next.costado) setCostado(next.costado)
          if (next.abscisa_inicial) setAbscisaInicial(next.abscisa_inicial)
          if (next.abscisa_final) setAbscisaFinal(next.abscisa_final)
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
  const cantidadInvalida = entradaSel && cantidad.trim() && (
    !Number.isFinite(cantidadNum) || cantidadNum <= 0 || cantidadNum > disponible + 1e-9
  )
  const puedeRegistrar = Boolean(
    entradaSel
    && cantidad.trim()
    && Number.isFinite(cantidadNum)
    && cantidadNum > 0
    && !cantidadInvalida,
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
      errs.cantidad = mensajeExcesoCantidadDespachar(
        cantidadNum,
        disponible,
        entradaSel?.unidad || '',
      )
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

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 12,
        alignItems: 'flex-start',
      }}
      >
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
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
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>{fieldErrors.receptor}</div>
          )}
        </div>
        <div style={{ flex: '0 1 280px', minWidth: 220, maxWidth: 320 }}>
          <AlmacenFieldLabel icon="🕐" label="Fecha y hora de salida" />
          <input
            type="datetime-local"
            style={{ ...ui.input, width: '100%', boxSizing: 'border-box', ...inputErrorStyle('fecha') }}
            value={fechaHora}
            disabled={busy}
            onChange={(e) => setFechaHora(e.target.value)}
          />
        </div>
      </div>
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
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...ui.sheetWrap, marginTop: 0 }} className="cc-almacen-table-scroll" data-testid="entrada-material-table">
                <table style={{ ...ui.sheetTable, minWidth: 640, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    {[90, 72, 110, 200, 96, 96, 100].map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {[
                        { key: 'ent', abbr: 'ENTRADA', tip: 'Número de entrada' },
                        { key: 'oc', abbr: 'OC', tip: 'Orden de compra asociada' },
                        { key: 'cod', abbr: 'CÓDIGO', tip: 'Código del insumo' },
                        { key: 'desc', abbr: 'DESCRIPCIÓN', tip: 'Descripción del insumo' },
                        { key: 'rec', abbr: 'RECIBIDO', tip: 'Cantidad recibida en esta entrada' },
                        { key: 'disp', abbr: 'DISPONIBLE', tip: 'Disponible para salida' },
                        { key: 'oca', abbr: 'OC AUTORIZA', tip: 'Cantidad autorizada en la OC' },
                      ].map((c) => (
                        <th
                          key={c.key}
                          title={c.tip}
                          style={{
                            ...ui.th,
                            fontSize: 'var(--cc-xs)',
                            padding: '6px 8px',
                            height: 32,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.abbr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entradasDisp.map((op) => {
                      const sel = entradaSel?.entrada_item_id === op.entrada_item_id
                      const { codigo, descripcion } = splitInsumoCodigoDescripcion(
                        op.insumo_codigo,
                        op.material_descripcion,
                      )
                      const und = op.unidad || ''
                      const tdBase = {
                        ...ui.td,
                        padding: '4px 6px',
                        height: 36,
                        verticalAlign: 'middle',
                        cursor: busy ? 'default' : 'pointer',
                        background: sel ? ui.accentSoft : 'transparent',
                      }
                      const tdNum = {
                        ...ui.tdNum,
                        padding: '4px 6px',
                        height: 36,
                        cursor: busy ? 'default' : 'pointer',
                        background: sel ? ui.accentSoft : 'transparent',
                      }
                      const selectRow = () => {
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
                      }
                      return (
                        <tr
                          key={op.entrada_item_id}
                          data-testid={`entrada-row-${op.entrada_item_id}`}
                          aria-selected={sel}
                          onClick={selectRow}
                          onKeyDown={(e) => {
                            if (busy || sel) return
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              selectRow()
                            }
                          }}
                          tabIndex={busy ? -1 : 0}
                          style={{ outline: 'none' }}
                        >
                          <td style={{ ...tdBase, fontWeight: 700 }} title={formatEntradaNumero(op)}>
                            {formatEntradaNumero(op)}
                            {op.alerta_proximidad_consumo ? ' ⚠' : ''}
                          </td>
                          <td style={tdBase}>
                            {op.numero_oc != null ? formatNumeroOcDisplay(op.numero_oc) : '—'}
                          </td>
                          <td style={{ ...tdBase, fontFamily: 'ui-monospace, Consolas, monospace' }}>
                            {codigo || '—'}
                          </td>
                          <td style={tdBase} title={descripcion || undefined}>
                            {descripcion || '—'}
                          </td>
                          <td style={tdNum}>
                            {fmtCant(op.cantidad_recibida_entrada ?? op.cantidad_recibida)}
                            {und ? ` ${und}` : ''}
                          </td>
                          <td style={{
                            ...tdNum,
                            color: Number(op.cantidad_disponible) > 0
                              ? 'var(--cc-color-positive, #059669)'
                              : '#dc2626',
                          }}
                          >
                            {fmtCant(op.cantidad_disponible)}
                            {und ? ` ${und}` : ''}
                          </td>
                          <td style={tdNum}>
                            {op.cantidad_oc_autorizada != null
                              ? `${fmtCant(op.cantidad_oc_autorizada)}${und ? ` ${und}` : ''}`
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {entradaSel && (() => {
                const dispOp = Number(entradaSel.cantidad_disponible || 0)
                const und = entradaSel.unidad || 'UND'
                const cantOk = cantidad.trim()
                  && Number.isFinite(cantidadNum)
                  && cantidadNum > 0
                  && cantidadNum <= dispOp + 1e-9
                const saldoTxt = cantOk
                  ? `${fmtCant(Math.max(0, dispOp - cantidadNum))} ${und}`
                  : '—'
                return (
                  <div
                    data-testid="cantidad-despachar-block"
                    style={{ marginTop: 10 }}
                  >
                    <label
                      htmlFor={`salida-cantidad-${entradaSel.entrada_item_id}`}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 280 }}>
                      <input
                        id={`salida-cantidad-${entradaSel.entrada_item_id}`}
                        data-testid="cantidad-despachar-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        style={{
                          ...ui.input,
                          marginBottom: 0,
                          flex: 1,
                          fontSize: 'var(--cc-md, 1rem)',
                          fontWeight: 600,
                          ...inputErrorStyle('cantidad'),
                          ...(cantidadInvalida ? { borderColor: '#dc2626' } : {}),
                        }}
                        value={cantidad}
                        disabled={busy}
                        placeholder="Ej. 100"
                        onChange={(e) => {
                          setCantidad(e.target.value)
                          clearFieldError('cantidad')
                        }}
                      />
                      <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: ui.textMuted }}>
                        {und}
                      </span>
                    </div>
                    <div
                      data-testid="saldo-despues-salida"
                      style={{
                        marginTop: 10,
                        fontSize: 'var(--cc-sm)',
                        fontWeight: 600,
                        color: cantOk
                          ? 'var(--cc-color-positive, #059669)'
                          : (cantidadInvalida ? '#dc2626' : ui.text),
                        lineHeight: 1.4,
                      }}
                    >
                      Saldo después de esta salida:{' '}
                      <strong>{saldoTxt}</strong>
                    </div>
                    {fieldErrors.cantidad && (
                      <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                        {fieldErrors.cantidad}
                      </div>
                    )}
                    {cantidadInvalida && !fieldErrors.cantidad && (
                      <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                        {mensajeExcesoCantidadDespachar(cantidadNum, dispOp, und)}
                      </div>
                    )}
                  </div>
                )
              })()}
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
          disabled={busy || !puedeRegistrar}
        >
          {busy ? 'Registrando…' : 'Registrar salida'}
        </button>
      </div>
    </form>
  )
}
