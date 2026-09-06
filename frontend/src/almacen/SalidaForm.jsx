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
  useAlmacenCompact,
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

function newLinea(seed = null) {
  return {
    key: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entradaItemId: seed?.entradaItemId ?? seed?.entrada_item_id ?? '',
    cantidad: seed?.cantidad != null ? String(seed.cantidad) : '',
  }
}

function parseCantidad(raw) {
  const n = parseFloat(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/**
 * Formulario de salidas: encabezado + grilla Excel multi-fila.
 */
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
  const compact = useAlmacenCompact()
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
  const [lineas, setLineas] = useState(() => {
    if (Array.isArray(initialDraft?.lineas) && initialDraft.lineas.length) {
      return initialDraft.lineas.map((ln) => newLinea(ln))
    }
    if (initialDraft?.entradaItemId) {
      return [newLinea({
        entradaItemId: initialDraft.entradaItemId,
        cantidad: initialDraft.cantidad || '',
      })]
    }
    return [newLinea()]
  })
  const [observaciones, setObservaciones] = useState(() => initialDraft?.observaciones || '')
  const [loadingEntradas, setLoadingEntradas] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const dirty = Boolean(
    receptor
    || pkId
    || observaciones.trim()
    || lineas.some((ln) => ln.entradaItemId || String(ln.cantidad || '').trim()),
  )

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

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
      lineas: lineas.map((ln) => ({
        entradaItemId: ln.entradaItemId || '',
        cantidad: ln.cantidad || '',
      })),
      observaciones,
    })
    return undefined
  }, [
    dirty, contratoId, receptor, fechaHora, pkId, pkLabel, pkIdId, tramo, costado,
    abscisaInicial, abscisaFinal, lineas, observaciones,
  ])

  const entradasById = useMemo(() => {
    const map = new Map()
    for (const op of entradasDisp) {
      map.set(String(op.entrada_item_id), op)
    }
    return map
  }, [entradasDisp])

  const loadEntradas = useCallback((pk) => {
    const pkNorm = (pk || '').trim()
    if (!pkNorm) {
      setEntradasDisp([])
      return
    }
    setLoadingEntradas(true)
    api.listEntradasDisponiblesPorPk(pkNorm)
      .then((rows) => {
        setEntradasDisp(rows)
        setLineas((prev) => {
          if (!prev.length) return [newLinea()]
          // Conservar selecciones válidas; si hay una sola entrada y la fila está vacía, autoasignar.
          return prev.map((ln, idx) => {
            if (ln.entradaItemId && rows.some((r) => String(r.entrada_item_id) === String(ln.entradaItemId))) {
              return ln
            }
            if (!ln.entradaItemId && idx === 0 && rows.length === 1) {
              const op = rows[0]
              return {
                ...ln,
                entradaItemId: String(op.entrada_item_id),
              }
            }
            if (ln.entradaItemId && !rows.some((r) => String(r.entrada_item_id) === String(ln.entradaItemId))) {
              return { ...ln, entradaItemId: '', cantidad: '' }
            }
            return ln
          })
        })
        if (rows[0]) {
          const op = rows[0]
          if (op.tramo) setTramo((t) => t || op.tramo)
          if (op.costado) setCostado((c) => c || op.costado)
          if (op.abscisa_inicial) setAbscisaInicial((a) => a || op.abscisa_inicial)
          if (op.abscisa_final) setAbscisaFinal((a) => a || op.abscisa_final)
        }
      })
      .catch((e) => {
        setEntradasDisp([])
        setError(e.message)
      })
      .finally(() => setLoadingEntradas(false))
  }, [api])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (!pkId) return
    loadEntradas(pkId)
  }, [pkId, loadEntradas])

  const onPkSeleccionar = (sel) => {
    setError('')
    setPkId(sel.pk_id || sel.pk_label || '')
    setPkLabel(sel.pk_label || sel.pk_id || '')
    setPkIdId(sel.pk_id_id ?? null)
    setTramo(sel.tramo || '')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setLineas([newLinea()])
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
    setLineas([newLinea()])
    clearDraft(contratoId)
  }

  const setLineaField = (key, patch) => {
    setLineas((prev) => prev.map((ln) => (ln.key === key ? { ...ln, ...patch } : ln)))
  }

  const addLinea = () => {
    setLineas((prev) => [...prev, newLinea()])
  }

  const removeLinea = (key) => {
    setLineas((prev) => (prev.length <= 1 ? [newLinea()] : prev.filter((ln) => ln.key !== key)))
  }

  const lineasValidas = useMemo(() => (
    lineas.map((ln, idx) => {
      const op = ln.entradaItemId ? entradasById.get(String(ln.entradaItemId)) : null
      const cant = parseCantidad(ln.cantidad)
      const disp = op ? Number(op.cantidad_disponible || 0) : 0
      const excess = op && String(ln.cantidad || '').trim()
        && (!Number.isFinite(cant) || cant <= 0 || cant > disp + 1e-9)
      return {
        ...ln,
        idx,
        op,
        cant,
        disp,
        excess,
        ok: Boolean(op && Number.isFinite(cant) && cant > 0 && !excess),
      }
    })
  ), [lineas, entradasById])

  const alertasProximidad = useMemo(() => {
    const msgs = []
    for (const ln of lineasValidas) {
      if (!ln.op) continue
      if (ln.op.alerta_proximidad_consumo) {
        msgs.push(`${formatEntradaNumero(ln.op)}: poco material disponible. Considere gestionar una nueva OC.`)
      } else if (ln.ok) {
        const restante = ln.disp - ln.cant
        const recibida = Number(ln.op.cantidad_recibida || 0)
        if (recibida > 0 && restante <= recibida * 0.2) {
          msgs.push(`${formatEntradaNumero(ln.op)}: el saldo quedará muy bajo tras esta salida.`)
        }
      }
    }
    return [...new Set(msgs)]
  }, [lineasValidas])

  const puedeRegistrar = lineasValidas.some((ln) => ln.ok)
    && lineasValidas.every((ln) => {
      if (!ln.entradaItemId && !String(ln.cantidad || '').trim()) return true
      return ln.ok
    })

  const entradasUsadas = useMemo(() => (
    new Set(lineas.filter((ln) => ln.entradaItemId).map((ln) => String(ln.entradaItemId)))
  ), [lineas])

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
    if (
      String(abscisaInicial ?? '').trim() !== ''
      && String(abscisaFinal ?? '').trim() !== ''
      && !validateAbscisaRango(abscisaInicial, abscisaFinal).ok
    ) {
      errs.abscisas = ABSCISA_RANGO_ERROR
    }

    const items = []
    const rowErrs = {}
    for (const ln of lineasValidas) {
      const empty = !ln.entradaItemId && !String(ln.cantidad || '').trim()
      if (empty) continue
      if (!ln.op) {
        rowErrs[ln.key] = 'Seleccione la entrada de material.'
        continue
      }
      if (!Number.isFinite(ln.cant) || ln.cant <= 0) {
        rowErrs[ln.key] = 'Indique una cantidad válida.'
        continue
      }
      if (ln.excess) {
        rowErrs[ln.key] = mensajeExcesoCantidadDespachar(
          ln.cant,
          ln.disp,
          ln.op.unidad || '',
        )
        continue
      }
      items.push({
        entrada_item_id: Number(ln.op.entrada_item_id),
        cantidad_salida: ln.cant,
      })
    }
    if (!items.length) {
      errs.lineas = 'Agregue al menos una línea con entrada y cantidad.'
    }
    if (Object.keys(rowErrs).length) errs.rows = rowErrs

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
        items,
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

  const th = {
    ...ui.th,
    fontSize: 'var(--cc-xs)',
    padding: '6px 8px',
    whiteSpace: 'nowrap',
  }
  const td = {
    ...ui.td,
    fontSize: 'var(--cc-xs)',
    padding: '6px 8px',
    verticalAlign: 'middle',
  }
  const cellInput = {
    ...ui.input,
    margin: 0,
    padding: '6px 8px',
    fontSize: 'var(--cc-xs)',
    minHeight: compact ? 40 : 32,
    width: '100%',
  }
  const sectionLabel = {
    fontSize: 'var(--cc-xs)',
    fontWeight: 800,
    color: ui.accent,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
    marginTop: 4,
  }

  return (
    <form onSubmit={submit} className={embedded ? 'cc-almacen-form-root cc-almacen-form-root--embedded' : undefined}>
      {error && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 'var(--cc-sm)' }}>{error}</div>}

      <div style={sectionLabel}>Encabezado</div>
      <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll">
        <table
          className="cc-almacen-salida-excel"
          style={{
            ...ui.sheetTable,
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: compact ? 520 : 720,
          }}
        >
          <thead>
            <tr>
              <th style={th}>Quién recibe</th>
              <th style={{ ...th, width: compact ? 150 : 180 }}>Fecha y hora</th>
              <th style={{ ...th, width: compact ? 140 : 180 }}>Quién despacha</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>
                <ReceptorObraSelector
                  value={receptor}
                  onChange={(v) => { setReceptor(v); clearFieldError('receptor') }}
                  disabled={busy}
                />
                {fieldErrors.receptor && (
                  <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 4 }}>{fieldErrors.receptor}</div>
                )}
              </td>
              <td style={td}>
                <input
                  type="datetime-local"
                  style={{ ...cellInput, ...inputErrorStyle('fecha') }}
                  value={fechaHora}
                  disabled={busy}
                  onChange={(e) => setFechaHora(e.target.value)}
                  aria-label="Fecha y hora de salida"
                />
              </td>
              <td style={td}>
                <input
                  style={{ ...cellInput, background: ui.accentSoft }}
                  value={sessionUser?.label || '—'}
                  readOnly
                  disabled
                  aria-label="Quién despacha"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={sectionLabel}>Ubicación</div>
      <AlmacenFieldLabel
        icon="📍"
        label="PK-ID"
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
        initialBasemap="satelite"
        showBasemapToggle
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
          <div style={{ ...sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>Líneas a despachar</span>
            <button
              type="button"
              style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-xs)', textTransform: 'none', letterSpacing: 0 }}
              disabled={busy || loadingEntradas || !entradasDisp.length}
              onClick={addLinea}
              data-testid="salida-add-linea"
            >
              + Agregar fila
            </button>
          </div>

          {loadingEntradas ? (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>Cargando entradas…</div>
          ) : entradasDisp.length === 0 ? (
            <div style={{ ...ui.card, fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
              No hay entradas con saldo disponible para este PK-ID.
            </div>
          ) : (
            <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll" data-testid="salida-lineas-table">
              <table
                className="cc-almacen-salida-excel"
                style={{
                  ...ui.sheetTable,
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: compact ? 640 : 900,
                }}
              >
                <thead>
                  <tr>
                    <th style={{ ...th, width: 36 }}>#</th>
                    <th style={th}>Entrada / Insumo</th>
                    <th style={{ ...th, width: 88 }}>Disponible</th>
                    <th style={{ ...th, width: 110 }}>Cant. a despachar</th>
                    <th style={{ ...th, width: 100 }}>Saldo después</th>
                    <th style={{ ...th, width: 52 }} />
                  </tr>
                </thead>
                <tbody>
                  {lineasValidas.map((ln) => {
                    const und = ln.op?.unidad || ''
                    const saldoTxt = ln.ok
                      ? `${fmtCant(Math.max(0, ln.disp - ln.cant))}${und ? ` ${und}` : ''}`
                      : '—'
                    const rowErr = fieldErrors.rows?.[ln.key]
                    return (
                      <tr key={ln.key} data-testid={`salida-linea-${ln.idx}`}>
                        <td style={{ ...td, fontWeight: 700, textAlign: 'center' }}>{ln.idx + 1}</td>
                        <td style={td}>
                          <select
                            style={{ ...cellInput, ...(rowErr && !ln.op ? { borderColor: '#dc2626' } : {}) }}
                            value={ln.entradaItemId || ''}
                            disabled={busy}
                            aria-label={`Entrada línea ${ln.idx + 1}`}
                            onChange={(e) => {
                              const id = e.target.value
                              const op = id ? entradasById.get(String(id)) : null
                              setLineaField(ln.key, { entradaItemId: id, cantidad: '' })
                              if (op?.tramo) setTramo(op.tramo)
                              if (op?.costado) setCostado(op.costado)
                              if (op?.abscisa_inicial) setAbscisaInicial(op.abscisa_inicial)
                              if (op?.abscisa_final) setAbscisaFinal(op.abscisa_final)
                              clearFieldError('lineas')
                              setFieldErrors((prev) => {
                                if (!prev.rows?.[ln.key]) return prev
                                const rows = { ...prev.rows }
                                delete rows[ln.key]
                                const next = { ...prev }
                                if (Object.keys(rows).length) next.rows = rows
                                else delete next.rows
                                return next
                              })
                            }}
                          >
                            <option value="">Seleccione entrada…</option>
                            {entradasDisp.map((op) => {
                              const used = entradasUsadas.has(String(op.entrada_item_id))
                                && String(op.entrada_item_id) !== String(ln.entradaItemId)
                              const { codigo, descripcion } = splitInsumoCodigoDescripcion(
                                op.insumo_codigo,
                                op.material_descripcion,
                              )
                              const label = [
                                formatEntradaNumero(op),
                                op.numero_oc != null ? `OC ${formatNumeroOcDisplay(op.numero_oc)}` : null,
                                codigo || null,
                                descripcion || null,
                                `Disp. ${fmtCant(op.cantidad_disponible)}${op.unidad ? ` ${op.unidad}` : ''}`,
                              ].filter(Boolean).join(' · ')
                              return (
                                <option
                                  key={op.entrada_item_id}
                                  value={op.entrada_item_id}
                                  disabled={used}
                                >
                                  {used ? `(en otra fila) ${label}` : label}
                                </option>
                              )
                            })}
                          </select>
                          {ln.op?.alerta_proximidad_consumo && (
                            <div style={{ color: '#92400e', fontSize: 'var(--cc-xs)', marginTop: 4 }}>⚠ Poco saldo</div>
                          )}
                        </td>
                        <td style={{
                          ...td,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: ln.disp > 0 ? 'var(--cc-color-positive, #059669)' : ui.textMuted,
                          whiteSpace: 'nowrap',
                        }}
                        >
                          {ln.op ? `${fmtCant(ln.disp)}${und ? ` ${und}` : ''}` : '—'}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              style={{
                                ...cellInput,
                                fontWeight: 600,
                                ...(ln.excess || rowErr ? { borderColor: '#dc2626' } : {}),
                              }}
                              value={ln.cantidad}
                              disabled={busy || !ln.op}
                              placeholder="0"
                              aria-label={`Cantidad línea ${ln.idx + 1}`}
                              data-testid={`salida-cantidad-${ln.idx}`}
                              onChange={(e) => {
                                setLineaField(ln.key, { cantidad: e.target.value })
                                clearFieldError('lineas')
                                setFieldErrors((prev) => {
                                  if (!prev.rows?.[ln.key]) return prev
                                  const rows = { ...prev.rows }
                                  delete rows[ln.key]
                                  const next = { ...prev }
                                  if (Object.keys(rows).length) next.rows = rows
                                  else delete next.rows
                                  return next
                                })
                              }}
                            />
                            {und ? (
                              <span style={{ color: ui.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{und}</span>
                            ) : null}
                          </div>
                          {(rowErr || (ln.excess && ln.op)) && (
                            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 4 }}>
                              {rowErr || mensajeExcesoCantidadDespachar(ln.cant, ln.disp, und)}
                            </div>
                          )}
                        </td>
                        <td style={{
                          ...td,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: ln.ok ? 'var(--cc-color-positive, #059669)' : ui.textMuted,
                          whiteSpace: 'nowrap',
                        }}
                        >
                          {saldoTxt}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button
                            type="button"
                            style={{
                              ...ui.btnSecondary,
                              padding: '4px 8px',
                              fontSize: 'var(--cc-xs)',
                              minHeight: 0,
                            }}
                            disabled={busy || lineas.length <= 1}
                            onClick={() => removeLinea(ln.key)}
                            aria-label={`Eliminar fila ${ln.idx + 1}`}
                            title="Eliminar fila"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {fieldErrors.lineas && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.lineas}</div>
          )}
        </>
      )}

      {alertasProximidad.length > 0 && (
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
          {alertasProximidad.map((m) => (
            <div key={m}>⚠ {m}</div>
          ))}
        </div>
      )}

      <AlmacenFieldLabel icon="📝" label="Observaciones (opcional)" />
      <textarea
        style={{ ...ui.input, minHeight: 64, resize: 'vertical', marginBottom: 12 }}
        value={observaciones}
        disabled={busy}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder="Notas adicionales sobre la entrega…"
      />

      <div
        className={embedded ? 'cc-almacen-form-actions cc-almacen-form-actions--embedded' : undefined}
        style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: embedded ? 8 : 12 }}
      >
        <button type="button" style={{ ...ui.btnSecondary, flex: embedded && compact ? 1 : undefined }} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="submit"
          style={{ ...ui.btnPrimary, flex: embedded && compact ? 1 : undefined }}
          disabled={busy || !puedeRegistrar}
        >
          {busy
            ? 'Registrando…'
            : (lineasValidas.filter((l) => l.ok).length > 1
              ? `Registrar ${lineasValidas.filter((l) => l.ok).length} salidas`
              : 'Registrar salida')}
        </button>
      </div>
    </form>
  )
}
