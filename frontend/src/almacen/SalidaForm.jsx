import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const [receptor, setReceptor] = useState(null)
  const [fechaHora, setFechaHora] = useState(nowDatetimeLocalColombia())
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [pkIdId, setPkIdId] = useState(null)
  const [tramo, setTramo] = useState('')
  const [costado, setCostado] = useState('')
  const [abscisaInicial, setAbscisaInicial] = useState('')
  const [abscisaFinal, setAbscisaFinal] = useState('')
  const [entradasDisp, setEntradasDisp] = useState([])
  const [entradaSel, setEntradaSel] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [observaciones, setObservaciones] = useState('')
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

  const loadEntradas = useCallback((pk) => {
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
        setEntradaSel(null)
        setCantidad('')
      })
      .catch((e) => {
        setEntradasDisp([])
        setEntradaSel(null)
        setError(e.message)
      })
      .finally(() => setLoadingEntradas(false))
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
  }

  const cantidadNum = parseFloat(String(cantidad).replace(',', '.'))
  const recibidoEntrada = entradaSel
    ? Number(entradaSel.cantidad_recibida_entrada ?? entradaSel.cantidad_recibida ?? 0)
    : 0
  const disponible = entradaSel ? Number(entradaSel.cantidad_disponible || 0) : 0
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
      errs.cantidad = `No puede superar la disponible (${fmtCant(disponible)}).`
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
                return (
                  <button
                    key={op.entrada_item_id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEntradaSel(op)
                      setCantidad('')
                      if (op.tramo) setTramo(op.tramo)
                      if (op.costado) setCostado(op.costado)
                      if (op.abscisa_inicial) setAbscisaInicial(op.abscisa_inicial)
                      if (op.abscisa_final) setAbscisaFinal(op.abscisa_final)
                      clearFieldError('entrada')
                      clearFieldError('cantidad')
                    }}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      borderRadius: 8,
                      border: sel ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
                      background: sel ? ui.accentSoft : ui.card?.background,
                      cursor: 'pointer',
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
                    {op.alerta_proximidad_consumo && (
                      <div style={{ fontSize: 'var(--cc-xs)', color: '#b45309', marginTop: 6, fontWeight: 600 }}>
                        ⚠ Saldo bajo — considere nueva OC
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {fieldErrors.entrada && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.entrada}</div>
          )}
        </>
      )}

      {entradaSel && (
        <>
          <AlmacenFieldLabel icon="📦" label="Insumo e ítem (heredados de la entrada)" />
          <div style={{
            ...ui.card,
            padding: 12,
            marginBottom: 12,
            fontSize: 'var(--cc-sm)',
          }}
          >
            <div><strong>{entradaSel.insumo_codigo ? `${entradaSel.insumo_codigo} · ` : ''}{entradaSel.material_descripcion}</strong></div>
            {(entradaSel.presupuesto_capitulo || entradaSel.presupuesto_item) && (
              <div style={{ color: ui.textMuted, marginTop: 4 }}>
                Presupuesto: {[entradaSel.presupuesto_capitulo, entradaSel.presupuesto_item].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          <AlmacenFieldLabel
            icon="🔢"
            label="Cantidad de salida"
            ayuda={`Recibido en esta entrada: ${fmtCant(recibidoEntrada)} ${entradaSel.unidad || ''}. Máximo disponible para salida: ${fmtCant(disponible)}.`.trim()}
          />
          <input
            type="text"
            inputMode="decimal"
            style={{
              ...ui.input,
              marginBottom: fieldErrors.cantidad ? 4 : 8,
              ...inputErrorStyle('cantidad'),
            }}
            value={cantidad}
            disabled={busy}
            placeholder={`Máx. ${fmtCant(disponible)}`}
            onChange={(e) => {
              setCantidad(e.target.value)
              clearFieldError('cantidad')
            }}
          />
          {fieldErrors.cantidad && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 8 }}>{fieldErrors.cantidad}</div>
          )}
          {cantidadInvalida && !fieldErrors.cantidad && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 8 }}>
              La cantidad no puede superar {fmtCant(disponible)} {entradaSel.unidad}.
            </div>
          )}
          {alertaProximidad && (
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
        </>
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
