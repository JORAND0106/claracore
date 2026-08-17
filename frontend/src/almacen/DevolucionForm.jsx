import { useCallback, useEffect, useState } from 'react'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import ReceptorObraSelector from './ReceptorObraSelector'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import { validateAbscisaRango, ABSCISA_RANGO_ERROR } from './almacenAbscisa'
import {
  cantidadExcedePendiente,
  mensajeExcesoDevolucion,
} from './devolucionFormHelpers'
import {
  AlmacenFieldLabel,
  fmtCant,
  formatNumeroOcDisplay,
  formatSalidaNumero,
  useAlmacenApi,
  useAlmacenTheme,
  datetimeLocalColombiaToIsoUtc,
  nowDatetimeLocalColombia,
} from './almacenShared'

export default function DevolucionForm({
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

  const [receptor, setReceptor] = useState(null)
  const [fechaHora, setFechaHora] = useState(() => nowDatetimeLocalColombia())
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [pkIdId, setPkIdId] = useState(null)
  const [tramo, setTramo] = useState('')
  const [costado, setCostado] = useState('')
  const [abscisaInicial, setAbscisaInicial] = useState('')
  const [abscisaFinal, setAbscisaFinal] = useState('')
  const [salidasDisp, setSalidasDisp] = useState([])
  const [salidaSel, setSalidaSel] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [loadingSalidas, setLoadingSalidas] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const dirty = Boolean(
    receptor || pkId || salidaSel || cantidad.trim() || observaciones.trim(),
  )

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const inputErrorStyle = (key) => (fieldErrors[key] ? { borderColor: '#dc2626' } : {})

  const loadSalidas = useCallback((pk) => {
    const pkNorm = (pk || '').trim()
    if (!pkNorm) {
      setSalidasDisp([])
      setSalidaSel(null)
      return
    }
    setLoadingSalidas(true)
    api.listSalidasDevolviblesPorPk(pkNorm)
      .then((rows) => {
        setSalidasDisp(rows)
        if (rows.length === 1) {
          setSalidaSel(rows[0])
          setCantidad('')
        } else {
          setSalidaSel(null)
          setCantidad('')
        }
      })
      .catch((e) => {
        setSalidasDisp([])
        setSalidaSel(null)
        setError(e.message)
      })
      .finally(() => setLoadingSalidas(false))
  }, [api])

  const onPkSeleccionar = (sel) => {
    setError('')
    setPkId(sel.pk_id || sel.pk_label || '')
    setPkLabel(sel.pk_label || sel.pk_id || '')
    setPkIdId(sel.pk_id_id ?? null)
    setTramo(sel.tramo || '')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setSalidaSel(null)
    setCantidad('')
    loadSalidas(sel.pk_id || sel.pk_label)
  }

  const onPkLimpiar = () => {
    setPkId('')
    setPkLabel('')
    setPkIdId(null)
    setTramo('')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setSalidasDisp([])
    setSalidaSel(null)
    setCantidad('')
  }

  const pendiente = salidaSel ? Number(salidaSel.cantidad_pendiente_devolver || 0) : 0
  const cantidadNum = parseFloat(String(cantidad).replace(',', '.'))
  const cantidadInvalida = salidaSel && cantidad.trim() && (
    !Number.isFinite(cantidadNum) || cantidadNum <= 0 || cantidadNum > pendiente + 1e-9
  )
  const costadoOk = String(costado ?? '').trim() !== ''
  const abscisaIniOk = String(abscisaInicial ?? '').trim() !== ''
  const abscisaFinOk = String(abscisaFinal ?? '').trim() !== ''
  const abscisasRangoOk = !abscisaIniOk || !abscisaFinOk
    || validateAbscisaRango(abscisaInicial, abscisaFinal).ok
  const puedeRegistrar = Boolean(
    salidaSel
    && cantidad.trim()
    && Number.isFinite(cantidadNum)
    && cantidadNum > 0
    && !cantidadInvalida
    && costadoOk
    && abscisaIniOk
    && abscisaFinOk
    && abscisasRangoOk,
  )

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const errs = {}
    if (!receptor?.id) errs.receptor = 'Seleccione quién realiza la devolución.'
    if (!pkId.trim()) errs.pk = 'Seleccione la ubicación en el mapa PK-ID.'
    if (!salidaSel) errs.salida = 'Seleccione la salida de referencia.'
    if (!cantidad.trim() || !Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      errs.cantidad = 'Indique una cantidad válida.'
    } else if (cantidadExcedePendiente(cantidad, pendiente)) {
      errs.cantidad = mensajeExcesoDevolucion(cantidadNum, pendiente, salidaSel?.unidad || '')
    }
    if (!costadoOk) {
      errs.costado = 'Seleccione el costado.'
    }
    if (!abscisaIniOk || !abscisaFinOk) {
      errs.abscisas = 'Indique abscisa inicial (ingreso) y abscisa final (salida).'
    } else if (!validateAbscisaRango(abscisaInicial, abscisaFinal).ok) {
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
        fecha_hora_devolucion: datetimeLocalColombiaToIsoUtc(fechaHora),
        pk_id: pkId.trim(),
        pk_id_id: pkIdId,
        tramo: tramo || null,
        costado: String(costado).trim(),
        abscisa_inicial: String(abscisaInicial).trim(),
        abscisa_final: String(abscisaFinal).trim(),
        salida_id: salidaSel.id,
        cantidad: cantidadNum,
        observaciones: observaciones.trim() || null,
      }
      const saved = await api.createDevolucion(body)
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
            label="Quién devuelve"
            ayuda="Residente u operativo de obra que entrega el material no usado."
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
          <AlmacenFieldLabel icon="🕐" label="Fecha y hora de devolución" />
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
        ayuda="Seleccione el punto en el mapa. Se listan las salidas de ese PK con saldo pendiente de devolver."
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
            if (patch.costado != null) {
              setCostado(patch.costado)
              clearFieldError('costado')
            }
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
      {fieldErrors.costado && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 6 }}>{fieldErrors.costado}</div>
      )}
      {fieldErrors.abscisas && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.abscisas}</div>
      )}

      {pkId && (
        <>
          <AlmacenFieldLabel
            icon="📤"
            label="Salida de referencia"
            ayuda="Seleccione la salida contra la cual se registra la devolución (misma OC/entrada)."
          />
          {loadingSalidas ? (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>Cargando salidas…</div>
          ) : salidasDisp.length === 0 ? (
            <div style={{ ...ui.card, fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
              No hay salidas con saldo pendiente de devolver en este PK-ID.
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={ui.sheetWrap} className="cc-almacen-table-scroll" data-testid="salidas-devolvibles-table">
                <table style={{ ...ui.sheetTable, minWidth: 640, width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    {[90, 72, 160, 90, 90, 100].map((w, i) => (
                      <col key={i} style={{ width: w }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {[
                        { key: 'sal', abbr: 'SALIDA', tip: 'Número de salida' },
                        { key: 'oc', abbr: 'OC', tip: 'Orden de compra' },
                        { key: 'mat', abbr: 'MATERIAL', tip: 'Material despachado' },
                        { key: 'desp', abbr: 'DESPACHADO', tip: 'Cantidad de la salida' },
                        { key: 'dev', abbr: 'YA DEVUELTO', tip: 'Devoluciones previas' },
                        { key: 'pen', abbr: 'PENDIENTE', tip: 'Máximo a devolver ahora' },
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
                    {salidasDisp.map((op) => {
                      const sel = salidaSel?.id === op.id
                      const und = op.unidad || ''
                      const tdBase = {
                        ...ui.td,
                        padding: '4px 6px',
                        height: 36,
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
                      return (
                        <tr
                          key={op.id}
                          aria-selected={sel}
                          onClick={() => {
                            if (busy || sel) return
                            setSalidaSel(op)
                            setCantidad('')
                            clearFieldError('salida')
                            clearFieldError('cantidad')
                          }}
                          tabIndex={busy ? -1 : 0}
                          style={{ outline: 'none' }}
                        >
                          <td style={{ ...tdBase, fontWeight: 700 }}>{formatSalidaNumero(op)}</td>
                          <td style={tdBase}>
                            {op.numero_oc != null ? formatNumeroOcDisplay(op.numero_oc) : '—'}
                          </td>
                          <td style={tdBase} title={op.material_descripcion || undefined}>
                            {op.material_descripcion || '—'}
                          </td>
                          <td style={tdNum}>
                            {fmtCant(op.cantidad_salida)}{und ? ` ${und}` : ''}
                          </td>
                          <td style={tdNum}>
                            {fmtCant(op.cantidad_devuelta || 0)}{und ? ` ${und}` : ''}
                          </td>
                          <td style={{
                            ...tdNum,
                            color: 'var(--cc-color-positive, #059669)',
                          }}
                          >
                            {fmtCant(op.cantidad_pendiente_devolver)}{und ? ` ${und}` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {fieldErrors.salida && (
                <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>{fieldErrors.salida}</div>
              )}
            </div>
          )}
        </>
      )}

      {salidaSel && (
        <div data-testid="cantidad-devolver-block" style={{ marginBottom: 12 }}>
          <label
            htmlFor={`dev-cantidad-${salidaSel.id}`}
            style={{
              display: 'block',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              marginBottom: 6,
              color: ui.text,
            }}
          >
            Cantidad a devolver <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 280 }}>
            <input
              id={`dev-cantidad-${salidaSel.id}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              style={{
                ...ui.input,
                marginBottom: 0,
                flex: 1,
                fontWeight: 600,
                ...inputErrorStyle('cantidad'),
                ...(cantidadInvalida ? { borderColor: '#dc2626' } : {}),
              }}
              value={cantidad}
              disabled={busy}
              placeholder={`Máx. ${fmtCant(pendiente)}`}
              onChange={(e) => {
                setCantidad(e.target.value)
                clearFieldError('cantidad')
              }}
            />
            <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 600, color: ui.textMuted }}>
              {salidaSel.unidad || 'UND'}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
            Pendiente de esta salida:{' '}
            <strong style={{ color: ui.text }}>{fmtCant(pendiente)} {salidaSel.unidad || ''}</strong>
            {' · '}Al confirmar, esa cantidad vuelve a «Disponible para salida» de la entrada/OC.
          </div>
          {fieldErrors.cantidad && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>{fieldErrors.cantidad}</div>
          )}
          {cantidadInvalida && !fieldErrors.cantidad && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 6 }}>
              {mensajeExcesoDevolucion(cantidadNum, pendiente, salidaSel.unidad || '')}
            </div>
          )}
        </div>
      )}

      <AlmacenFieldLabel icon="📝" label="Observaciones (opcional)" />
      <textarea
        style={{ ...ui.input, minHeight: 64, resize: 'vertical', marginBottom: 12 }}
        value={observaciones}
        disabled={busy}
        onChange={(e) => setObservaciones(e.target.value)}
        placeholder="Motivo o notas de la devolución…"
      />

      <div style={btnRow}>
        <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" style={ui.btnPrimary} disabled={busy || !puedeRegistrar}>
          {busy ? 'Registrando…' : 'Registrar devolución'}
        </button>
      </div>
    </form>
  )
}
