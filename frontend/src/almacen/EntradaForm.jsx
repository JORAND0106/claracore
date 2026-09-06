import { useEffect, useMemo, useRef, useState } from 'react'
import OcSolicitudUbicacionModal from './OcSolicitudUbicacionModal'
import {
  AlmacenFieldLabel,
  almacenLinkButtonStyle,
  fmtCant,
  formatNumeroOcDisplay,
  formatOcOpcionEntrada,
  formatOcRecepcionLabel,
  todayDateInputColombia,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'
import { fmtSoporteBytes, prepareRemisionSoporte, REMISION_SOPORTE_MAX_BYTES } from './almacenRemisionSoporte'

function sortKeyInsumoCodigo(codigo) {
  const raw = String(codigo || '').trim()
  if (!raw) return [1, '']
  return [0, raw.toLowerCase()]
}

function codigoInsumoOcItem(it) {
  return it?.insumo_codigo
    || it?.almacen_solicitud_item?.insumo_codigo
    || ''
}

/** Popup de nueva entrada en formato hoja de cálculo. */
export default function EntradaForm({
  onSaved,
  onCancel,
  onDirtyChange,
  permisos,
  token,
  contratoId,
  theme,
  embedded = false,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const [ocs, setOcs] = useState([])
  const [ocId, setOcId] = useState('')
  const [ocDetail, setOcDetail] = useState(null)
  const [fecha, setFecha] = useState(todayDateInputColombia())
  const [numeroRemision, setNumeroRemision] = useState('')
  const [obs, setObs] = useState('')
  const [lineas, setLineas] = useState({})
  const [remision, setRemision] = useState(null)
  const [remisionBytes, setRemisionBytes] = useState(0)
  const [soporteBusy, setSoporteBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [ubicacionOpen, setUbicacionOpen] = useState(false)
  const [ubicacionItemId, setUbicacionItemId] = useState(null)
  const [ubicacionInsumoCodigo, setUbicacionInsumoCodigo] = useState(null)

  const abrirUbicacion = (ocItem) => {
    const sid = ocItem?.solicitud_item_id
    if (!sid) return
    setUbicacionItemId(Number(sid))
    setUbicacionInsumoCodigo(codigoInsumoOcItem(ocItem) || null)
    setUbicacionOpen(true)
  }

  const lineasPendientes = useMemo(() => {
    const rows = (ocDetail?.items || []).filter((it) => {
      const pend = Number(it.cantidad) - Number(it.cantidad_recibida || 0)
      return pend > 0 && it.solicitud_item_id
    })
    return [...rows].sort((a, b) => {
      const ka = sortKeyInsumoCodigo(codigoInsumoOcItem(a))
      const kb = sortKeyInsumoCodigo(codigoInsumoOcItem(b))
      if (ka[0] !== kb[0]) return ka[0] - kb[0]
      if (ka[1] < kb[1]) return -1
      if (ka[1] > kb[1]) return 1
      return Number(a.id || 0) - Number(b.id || 0)
    })
  }, [ocDetail])

  const unicaLineaPendiente = lineasPendientes.length === 1 ? lineasPendientes[0] : null

  useEffect(() => {
    onDirtyChange?.(Boolean(
      ocId
      || numeroRemision.trim()
      || remision
      || obs.trim(),
    ))
  }, [ocId, numeroRemision, remision, obs, onDirtyChange])

  useEffect(() => {
    api.listOrdenesCompra().then((rows) => {
      setOcs(rows.filter((o) => o.estado !== 'anulada' && o.tiene_saldo_recepcion))
    }).catch(() => {})
  }, [api])

  useEffect(() => {
    if (!ocId) { setOcDetail(null); return }
    api.getOrdenCompra(ocId).then((oc) => {
      setOcDetail(oc)
      const init = {}
      for (const it of oc.items || []) {
        const pend = Number(it.cantidad) - Number(it.cantidad_recibida || 0)
        if (pend > 0) {
          init[it.id] = { cantidad_recibida: pend, lote: '', fecha_vencimiento: '' }
        }
      }
      setLineas(init)
    }).catch((e) => setError(e.message))
  }, [api, ocId])

  const setLinea = (id, field, val) => {
    setLineas((p) => ({ ...p, [id]: { ...p[id], [field]: val } }))
  }

  const clearFieldError = (field) => {
    if (!fieldErrors[field]) return
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSoporteBusy(true)
    setError('')
    try {
      const { file, bytes } = await prepareRemisionSoporte(f)
      setRemision(file)
      setRemisionBytes(bytes)
      clearFieldError('remision')
    } catch (err) {
      setRemision(null)
      setRemisionBytes(0)
      setFieldErrors((prev) => ({ ...prev, remision: err.message }))
    } finally {
      setSoporteBusy(false)
    }
  }

  const validarFormulario = () => {
    const next = {}
    if (!ocId) next.oc = 'Seleccione una orden de compra.'
    const items = Object.entries(lineas)
      .filter(([, v]) => Number(v.cantidad_recibida) > 0)
    if (ocId && !items.length) {
      next.cantidad = 'Indique al menos una cantidad recibida.'
    }
    if (!numeroRemision.trim()) {
      next.numeroRemision = 'Indique el número de remisión del proveedor.'
    }
    if (!remision) {
      next.remision = 'Adjunte el soporte fotográfico o PDF de la remisión (máx. 300 KB).'
    } else if (remisionBytes > REMISION_SOPORTE_MAX_BYTES) {
      next.remision = 'El soporte no puede superar 300 KB.'
    }
    return next
  }

  const guardar = async () => {
    setError('')
    const errores = validarFormulario()
    if (Object.keys(errores).length > 0) {
      setFieldErrors(errores)
      return
    }
    setFieldErrors({})

    const items = Object.entries(lineas)
      .filter(([, v]) => Number(v.cantidad_recibida) > 0)
      .map(([ociId, v]) => ({
        orden_compra_item_id: Number(ociId),
        cantidad_recibida: Number(v.cantidad_recibida),
        lote: v.lote || null,
        fecha_vencimiento: v.fecha_vencimiento || null,
      }))

    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('tipo', 'recibo')
      fd.append('orden_compra_id', ocId)
      fd.append('fecha_entrada', fecha)
      fd.append('numero_documento', numeroRemision.trim().toUpperCase())
      fd.append('observaciones', obs)
      fd.append('items_json', JSON.stringify(items))
      fd.append('remision', remision)
      const r = await api.createEntrada(fd)
      onSaved?.(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!permisos?.crear) {
    return (
      <div style={{ ...ui.card, color: ui.textMuted, textAlign: 'center' }}>
        No tiene permiso para registrar entradas.
      </div>
    )
  }

  const inputErrorStyle = (field) => (
    fieldErrors[field] ? { borderColor: '#dc2626' } : undefined
  )

  const rootStyle = embedded
    ? { color: ui.text }
    : ui.card

  const thStyle = {
    ...ui.th,
    fontSize: 'var(--cc-xs)',
    padding: '6px 8px',
    whiteSpace: 'nowrap',
    background: ui.accentSoft || `${ui.accent}18`,
    borderBottom: `1px solid ${ui.textMuted}33`,
  }
  const tdStyle = {
    ...ui.td,
    fontSize: 'var(--cc-xs)',
    padding: '6px 8px',
    verticalAlign: 'middle',
    borderBottom: `1px solid ${ui.textMuted}22`,
  }
  const cellInput = {
    ...ui.input,
    margin: 0,
    padding: '4px 6px',
    fontSize: 'var(--cc-xs)',
    minHeight: 32,
    width: '100%',
  }

  return (
    <div style={rootStyle} className={embedded ? 'cc-almacen-form-root cc-almacen-form-root--embedded' : undefined}>
      {!embedded && (
        <>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, marginBottom: 12 }}>
            📥 Registrar entrada de material
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 16 }}>
            El ingreso requiere una Orden de Compra aprobada, número de remisión y soporte adjunto (máx. 300 KB).
          </div>
        </>
      )}

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'minmax(280px, 1.4fr) minmax(160px, 0.6fr)',
        gap: 10,
        marginBottom: 10,
        alignItems: 'end',
      }}
      >
        <div>
          <AlmacenFieldLabel
            icon="📄"
            label="Orden de compra"
            ayuda="Órdenes de compra aprobadas con material pendiente por recibir. Una OC corresponde a un solo proveedor."
          />
          <select
            style={{ ...ui.input, marginBottom: 0, ...inputErrorStyle('oc') }}
            value={ocId}
            onChange={(e) => {
              setOcId(e.target.value)
              clearFieldError('oc')
            }}
          >
            <option value="">Seleccione OC…</option>
            {ocs.map((o) => (
              <option key={o.id} value={o.id}>{formatOcOpcionEntrada(o)}</option>
            ))}
          </select>
        </div>
        <div>
          <AlmacenFieldLabel icon="📅" label="Fecha de entrada" />
          <input
            style={{ ...ui.input, marginBottom: 0 }}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={!ocId}
          />
        </div>
      </div>
      {fieldErrors.oc && (
        <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 10 }}>{fieldErrors.oc}</div>
      )}

      {ocDetail && (
        <>
          <div style={{
            fontSize: 'var(--cc-xs)',
            color: ui.textMuted,
            marginBottom: 10,
            padding: '8px 10px',
            borderRadius: 6,
            border: `1px solid ${ui.textMuted}33`,
            background: `${ui.textMuted}0d`,
          }}
          >
            {ocDetail.proveedor_nombre && (
              <span style={{ marginRight: 8 }}>
                Proveedor: <strong style={{ color: ui.text }}>{ocDetail.proveedor_nombre}</strong>
                {' · '}
              </span>
            )}
            {ocDetail.solicitud_id && unicaLineaPendiente && (
              <span style={{ marginRight: 8 }}>
                Destino:{' '}
                <button
                  type="button"
                  style={almacenLinkButtonStyle(ui)}
                  title="Ver ubicación y mapa de esta línea"
                  onClick={() => abrirUbicacion(unicaLineaPendiente)}
                >
                  OC {formatNumeroOcDisplay(ocDetail.numero_oc)}
                  {codigoInsumoOcItem(unicaLineaPendiente)
                    ? ` · ${codigoInsumoOcItem(unicaLineaPendiente)}`
                    : ''}
                </button>
                {' · '}
              </span>
            )}
            {ocDetail.solicitud_id && !unicaLineaPendiente && lineasPendientes.length > 1 && (
              <span style={{ marginRight: 8 }}>
                OC {formatNumeroOcDisplay(ocDetail.numero_oc)}
                {' · Use «Destino» en cada fila · '}
              </span>
            )}
            {!ocDetail.solicitud_id && ocDetail.numero_oc && (
              <span style={{ marginRight: 8 }}>
                OC {formatNumeroOcDisplay(ocDetail.numero_oc)}
                {' · '}
              </span>
            )}
            Recepción: <strong style={{ color: ui.text }}>{formatOcRecepcionLabel(ocDetail)}</strong>
            {Number(ocDetail.saldo_cantidad_pendiente) > 0.0001 && (
              <>
                {' · '}
                Falta por recibir:{' '}
                <strong style={{ color: ui.text }}>
                  {fmtCant(ocDetail.saldo_cantidad_pendiente)}
                  {ocDetail.saldo_unidad ? ` ${ocDetail.saldo_unidad}` : ''}
                </strong>
              </>
            )}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
            Cantidades recibidas
          </div>
          {fieldErrors.cantidad && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 8 }}>{fieldErrors.cantidad}</div>
          )}

          <div
            className="cc-almacen-table-scroll"
            style={{
              marginBottom: 12,
              borderRadius: 6,
              border: `1px solid ${ui.textMuted}33`,
              overflow: 'auto',
            }}
          >
            <table
              className="cc-almacen-entrada-excel"
              style={{ width: '100%', borderCollapse: 'collapse', minWidth: compact ? 640 : 860 }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 110 }}>Insumo</th>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}>Descripción</th>
                  <th style={{ ...thStyle, textAlign: 'right', minWidth: 88 }}>Pendiente</th>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 96 }}>Cant. recibida</th>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 90 }}>Lote</th>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 110 }}>Vencimiento</th>
                  <th style={{ ...thStyle, textAlign: 'center', minWidth: 72 }}>Destino</th>
                </tr>
              </thead>
              <tbody>
                {lineasPendientes.map((it, idx) => {
                  const pend = Number(it.cantidad) - Number(it.cantidad_recibida || 0)
                  const ln = lineas[it.id] || {}
                  const codigo = codigoInsumoOcItem(it) || '—'
                  return (
                    <tr
                      key={it.id}
                      style={{ background: idx % 2 === 0 ? 'transparent' : `${ui.textMuted}08` }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {codigo}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{it.material_descripcion}</div>
                        {it.proveedor_nombre && (
                          <div style={{ color: ui.textMuted, marginTop: 2 }}>{it.proveedor_nombre}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtCant(pend)} {it.unidad}
                      </td>
                      <td style={tdStyle}>
                        <input
                          style={{ ...cellInput, ...inputErrorStyle('cantidad') }}
                          type="number"
                          min="0"
                          max={pend}
                          step="any"
                          value={ln.cantidad_recibida ?? ''}
                          onChange={(e) => setLinea(it.id, 'cantidad_recibida', e.target.value)}
                          aria-label={`Cantidad recibida ${codigo}`}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          style={cellInput}
                          value={ln.lote || ''}
                          onChange={(e) => setLinea(it.id, 'lote', e.target.value)}
                          placeholder="Opcional"
                          aria-label={`Lote ${codigo}`}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          style={cellInput}
                          type="date"
                          value={ln.fecha_vencimiento || ''}
                          onChange={(e) => setLinea(it.id, 'fecha_vencimiento', e.target.value)}
                          aria-label={`Vencimiento ${codigo}`}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {ocDetail.solicitud_id ? (
                          <button
                            type="button"
                            style={{ ...almacenLinkButtonStyle(ui), fontSize: 'var(--cc-xs)', fontWeight: 600 }}
                            title="Ver dónde se solicitó este material"
                            onClick={() => abrirUbicacion(it)}
                          >
                            📍 Destino
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {!lineasPendientes.length && (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: ui.textMuted }}>
                      No hay líneas pendientes de recepción en esta OC.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
            gap: 10,
            marginBottom: 10,
            alignItems: 'start',
          }}
          >
            <div>
              <AlmacenFieldLabel
                icon="🔢"
                label="Número de remisión del proveedor"
                ayuda="Número impreso en la remisión. Es distinto del lote del material."
              />
              <input
                style={{
                  ...ui.input,
                  marginBottom: fieldErrors.numeroRemision ? 4 : 0,
                  ...inputErrorStyle('numeroRemision'),
                  textTransform: 'uppercase',
                }}
                value={numeroRemision}
                placeholder="Ej. REM-123456"
                onChange={(e) => {
                  setNumeroRemision(e.target.value.toUpperCase())
                  clearFieldError('numeroRemision')
                }}
              />
              {fieldErrors.numeroRemision && (
                <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 4 }}>{fieldErrors.numeroRemision}</div>
              )}
            </div>
            <div>
              <AlmacenFieldLabel
                icon="📷"
                label="Soporte de remisión (obligatorio)"
                ayuda={`Foto o PDF de la remisión. Tamaño máximo ${fmtSoporteBytes(REMISION_SOPORTE_MAX_BYTES)}.`}
              />
              <div style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                flexDirection: compact ? 'column' : 'row',
              }}
              >
                <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
                <button type="button" style={{ ...ui.btnSecondary, width: compact ? '100%' : undefined }} disabled={soporteBusy} onClick={() => fileRef.current?.click()}>
                  📁 Cargar archivo
                </button>
                <button type="button" style={{ ...ui.btnSecondary, width: compact ? '100%' : undefined }} disabled={soporteBusy} onClick={() => camRef.current?.click()}>
                  📷 Tomar foto
                </button>
              </div>
              {remision && (
                <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 6 }}>
                  {remision.name} · {fmtSoporteBytes(remisionBytes)}
                </div>
              )}
              {soporteBusy && (
                <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 6 }}>Preparando soporte…</div>
              )}
              {fieldErrors.remision && (
                <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 4 }}>{fieldErrors.remision}</div>
              )}
            </div>
          </div>

          <AlmacenFieldLabel icon="📝" label="Observaciones" />
          <textarea
            style={{ ...ui.input, minHeight: 50, marginBottom: embedded ? 8 : 16 }}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </>
      )}

      <div
        className={embedded ? 'cc-almacen-form-actions cc-almacen-form-actions--embedded' : undefined}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <button
          type="button"
          style={{ ...ui.btnPrimary, flex: embedded && compact ? 1 : undefined }}
          disabled={busy || soporteBusy || !ocId}
          onClick={guardar}
        >
          {busy ? 'Registrando…' : 'Registrar entrada'}
        </button>
        <button
          type="button"
          style={{ ...ui.btnSecondary, flex: embedded && compact ? 1 : undefined }}
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>

      {ubicacionOpen && ocDetail?.solicitud_id && ubicacionItemId && (
        <OcSolicitudUbicacionModal
          solicitudId={ocDetail.solicitud_id}
          solicitudItemId={ubicacionItemId}
          numeroOc={ocDetail.numero_oc}
          insumoCodigo={ubicacionInsumoCodigo}
          contratoId={contratoId}
          token={token}
          theme={theme}
          onClose={() => {
            setUbicacionOpen(false)
            setUbicacionItemId(null)
            setUbicacionInsumoCodigo(null)
          }}
        />
      )}
    </div>
  )
}
