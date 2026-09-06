import { useCallback, useEffect, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import ProveedorSelector from './ProveedorSelector'
import PlacaTransportadorFields from './PlacaTransportadorFields'
import InsumoPorProveedorSelect from './InsumoPorProveedorSelect'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import {
  AlmacenFieldLabel,
  fmtCant,
  fmtMoney,
  formatNombrePropio,
  formatPlacaVehiculo,
  getAlmacenSessionUser,
  todayDateInputColombia,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'
import { validateAbscisaRango } from './almacenAbscisa'
import { fmtSoporteBytes, prepareRemisionSoporte, REMISION_SOPORTE_MAX_BYTES } from './almacenRemisionSoporte'

export default function DespachadorModal({
  onClose,
  onSaved,
  permisos,
  token,
  contratoId,
  theme,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const sessionUser = getAlmacenSessionUser()
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const numeroDocRef = useRef('')

  const [tipo, setTipo] = useState('recibo')
  const [numeroDoc, setNumeroDoc] = useState('')
  const [proximoDisposicion, setProximoDisposicion] = useState('')
  const [fecha, setFecha] = useState(todayDateInputColombia())
  const [proveedor, setProveedor] = useState(null)
  const [insumo, setInsumo] = useState(null)
  const [pkContext, setPkContext] = useState(null)
  const [ocs, setOcs] = useState([])
  const [ocSel, setOcSel] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [tramo, setTramo] = useState('')
  const [costado, setCostado] = useState('')
  const [abscisaInicial, setAbscisaInicial] = useState('')
  const [abscisaFinal, setAbscisaFinal] = useState('')
  const [placa, setPlaca] = useState('')
  const [transportador, setTransportador] = useState('')
  const [transportadorMsg, setTransportadorMsg] = useState('')
  const [remision, setRemision] = useState(null)
  const [remisionBytes, setRemisionBytes] = useState(0)
  const [soporteBusy, setSoporteBusy] = useState(false)
  const [ocrMsg, setOcrMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadingOc, setLoadingOc] = useState(false)

  const loadProximoDisposicion = useCallback(() => {
    api.getProximoNumeroDisposicion()
      .then((r) => setProximoDisposicion(r?.proximo || ''))
      .catch(() => setProximoDisposicion(''))
  }, [api])

  useEffect(() => {
    loadProximoDisposicion()
  }, [loadProximoDisposicion])

  useEffect(() => {
    if (tipo === 'disposicion') {
      setNumeroDoc('')
      numeroDocRef.current = ''
      loadProximoDisposicion()
    }
  }, [tipo, loadProximoDisposicion])

  const loadOcs = useCallback(() => {
    const pk = (pkLabel || pkId || '').trim()
    if (!pk) {
      setPkContext(null)
      setOcs([])
      setOcSel(null)
      return
    }
    setLoadingOc(true)
    api.buscarOrdenesCompraPorPk(pk)
      .then((ctx) => {
        setPkContext(ctx)
        setOcs(ctx?.ocs_vigentes || [])
        setOcSel(null)
      })
      .catch((e) => {
        setPkContext(null)
        setOcs([])
        setOcSel(null)
        setError(e.message)
      })
      .finally(() => setLoadingOc(false))
  }, [api, pkId, pkLabel])

  useEffect(() => { loadOcs() }, [loadOcs])

  const onPkSelect = (sel) => {
    const label = sel.pk_label || sel.pk_id || ''
    setPkId(label)
    setPkLabel(label)
    setTramo(sel.tramo || '')
    setOcSel(null)
    setOcs([])
    setPkContext(null)
    setError('')
  }

  const onOcSelect = (oc) => {
    setOcSel(oc)
    setError('')
    if (oc.proveedor_id) {
      setProveedor({
        proveedor_id: oc.proveedor_id,
        razon_social: oc.proveedor_nombre,
        nit: oc.proveedor_nit || '',
      })
    } else if (oc.proveedor_nombre) {
      setProveedor({
        proveedor_id: null,
        razon_social: oc.proveedor_nombre,
        nit: oc.proveedor_nit || '',
      })
    }
    if (oc.insumo_id) {
      setInsumo({
        insumo_id: oc.insumo_id,
        label: oc.material_descripcion,
        unidad: oc.unidad,
      })
    }
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSoporteBusy(true)
    setError('')
    let preparedFile = null
    try {
      const { file, bytes } = await prepareRemisionSoporte(f)
      preparedFile = file
      setRemision(file)
      setRemisionBytes(bytes)
    } catch (err) {
      setRemision(null)
      setRemisionBytes(0)
      setError(err.message)
      return
    } finally {
      setSoporteBusy(false)
    }
    setOcrMsg('')
    if (tipo !== 'recibo' || !preparedFile) return
    setOcrBusy(true)
    try {
      const r = await api.ocrRemisionEntrada(preparedFile)
      const campos = r.campos || {}
      if (campos.numero_documento) {
        const sugerido = String(campos.numero_documento).trim()
        setNumeroDoc((prev) => {
          const actual = (prev || numeroDocRef.current || '').trim()
          if (actual) return prev
          numeroDocRef.current = sugerido
          return sugerido
        })
      }
      if (campos.fecha_entrada) setFecha(campos.fecha_entrada)
      setOcrMsg(r.ocr?.mensaje || 'OCR completado. Revise los campos.')
    } catch (err) {
      setOcrMsg(err.message || 'No se pudo analizar el documento.')
    } finally {
      setOcrBusy(false)
    }
  }

  const cantNum = Number(cantidad)
  const superaSaldo = ocSel && cantNum > 0 && cantNum > Number(ocSel.saldo_cantidad || 0) + 0.0001
  const saldoRestCant = ocSel
    ? Math.max(0, Number(ocSel.saldo_cantidad || 0) - (Number.isFinite(cantNum) ? cantNum : 0))
    : null
  const saldoRestVal = ocSel
    ? Math.max(0, Number(ocSel.saldo_valor || 0) - (Number.isFinite(cantNum) ? cantNum * Number(ocSel.valor_unitario || 0) : 0))
    : null

  const puedeSinOc = Boolean(
    pkContext?.sin_oc_gestionada || pkContext?.oc_consumida,
  )
  const puedeCantidad = Boolean(
    (pkLabel || pkId)?.trim() && proveedor?.proveedor_id && insumo?.insumo_id,
  )

  const onProveedorChange = (p) => {
    setProveedor(p)
    setError('')
  }

  const onInsumoChange = (row) => {
    setInsumo(row)
    setError('')
  }

  const placaFmt = formatPlacaVehiculo(placa)
  const transportadorFmt = formatNombrePropio(transportador)

  const validarFormulario = () => {
    const faltantes = []
    if (!fecha?.trim()) faltantes.push('Fecha')
    if (!(pkLabel || pkId)?.trim()) faltantes.push('PK-ID de ubicación de descargue')
    if (!tramo?.trim()) faltantes.push('Tramo')
    if (!costado?.trim()) faltantes.push('Costado')
    if (!String(abscisaInicial ?? '').trim()) faltantes.push('Abscisa inicial')
    if (!String(abscisaFinal ?? '').trim()) faltantes.push('Abscisa final')
    const absCheck = validateAbscisaRango(abscisaInicial, abscisaFinal)
    if (!absCheck.ok) faltantes.push(absCheck.message)
    if (!ocSel && !puedeSinOc) faltantes.push('Orden de compra vigente (o sector sin OC gestionada/consumida)')
    if (!proveedor?.proveedor_id) faltantes.push('Proveedor inscrito en el directorio')
    if (!insumo?.insumo_id) faltantes.push('Insumo recibido')
    if (!cantNum || cantNum <= 0) faltantes.push('Cantidad recibida')
    if (superaSaldo) faltantes.push('Cantidad recibida (no puede superar el saldo de la OC)')
    if (!/^[A-Z]{3}-\d{3}$/.test(placaFmt)) faltantes.push('Placa (formato AAA-000)')
    if (!transportadorFmt.trim()) faltantes.push('Transportador')
    if (tipo === 'recibo' && !(numeroDocRef.current || numeroDoc).trim()) {
      faltantes.push('Número de remisión del proveedor')
    }
    if (tipo === 'recibo' && !remision) faltantes.push('Archivo de remisión del proveedor (máx. 300 KB)')
    if (tipo === 'recibo' && remision && remisionBytes > REMISION_SOPORTE_MAX_BYTES) {
      faltantes.push('Archivo de remisión (no puede superar 300 KB)')
    }
    return faltantes
  }

  const guardar = async () => {
    setError('')
    const faltantes = validarFormulario()
    if (faltantes.length > 0) {
      setError(
        `Complete los siguientes campos antes de guardar:\n${faltantes.map((f) => `• ${f}`).join('\n')}`,
      )
      return
    }

    setBusy(true)
    try {
      const remisionNumero = (numeroDocRef.current || numeroDoc).trim()
      const fd = new FormData()
      fd.append('tipo', tipo)
      if (tipo === 'recibo') {
        fd.append('numero_documento', remisionNumero)
      }
      if (ocSel?.orden_compra_id) {
        fd.append('orden_compra_id', String(ocSel.orden_compra_id))
      }
      fd.append('fecha_entrada', fecha)
      fd.append('proveedor_id', String(proveedor.proveedor_id))
      fd.append('insumo_id', String(insumo.insumo_id))
      fd.append('pk_id', pkId || pkLabel)
      fd.append('tramo', tramo.trim())
      fd.append('costado', costado.trim())
      fd.append('abscisa_inicial', String(abscisaInicial).trim())
      fd.append('abscisa_final', String(abscisaFinal).trim())
      fd.append('placa', placaFmt)
      fd.append('transportador', transportadorFmt)

      const itemLine = { cantidad_recibida: cantNum }
      if (ocSel?.orden_compra_item_id) {
        itemLine.orden_compra_item_id = ocSel.orden_compra_item_id
      }
      fd.append('items_json', JSON.stringify([itemLine]))

      if (tipo === 'recibo' && remision) fd.append('remision', remision)

      const r = await api.createEntrada(fd)
      if (r?.transportador_registrado) {
        setTransportadorMsg('Transportador registrado.')
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      onSaved?.(r)
      const tienePdfPos = r?.tiene_pdf_disposicion && r?.id
      if (tienePdfPos && !compact) {
        try {
          await api.printDisposicionPdf(r.id)
        } catch (printErr) {
          try {
            await api.openDisposicionPdf(r.id)
          } catch (openErr) {
            setError(`Entrada guardada. No se pudo abrir el PDF: ${openErr.message || printErr.message}`)
            return
          }
        }
      } else if (r?.id && (tipo === 'disposicion' || tipo === 'recibo') && !tienePdfPos) {
        setError('La entrada se guardó, pero el PDF POS no está disponible.')
        return
      }
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!permisos?.crear) return null

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: compact ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: compact ? 0 : 16,
  }

  const modal = {
    ...ui.card,
    width: '100%',
    maxWidth: compact ? '100%' : 1180,
    maxHeight: compact ? '96dvh' : '92vh',
    overflow: 'auto',
    boxShadow: compact ? 'var(--cc-almacen-shadow-sheet)' : 'var(--cc-almacen-shadow-modal)',
    borderRadius: compact ? '16px 16px 0 0' : ui.card.borderRadius,
    paddingBottom: compact ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : ui.card.padding,
  }

  const toggleBtn = (active) => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    border: active ? `2px solid ${ui.accent}` : `1px solid ${ui.textMuted}44`,
    background: active ? `${ui.accentSoft}` : 'transparent',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontSize: 'var(--cc-sm)',
    color: ui.text,
  })

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
    <div
      style={overlay}
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="despachador-title"
    >
      <div
        style={modal}
        className={`cc-almacen-form-root${compact ? ' cc-almacen-modal-sheet' : ''}`}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div id="despachador-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>
              🚚 Despachador
            </div>
            {!compact && (
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
                Registro de llegada de material a obra contra orden de compra.
              </div>
            )}
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '4px 10px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" style={toggleBtn(tipo === 'disposicion')} onClick={() => setTipo('disposicion')}>
            Disposición
          </button>
          <button type="button" style={toggleBtn(tipo === 'recibo')} onClick={() => setTipo('recibo')}>
            Recibo de materiales
          </button>
        </div>

        {error && (
          <div style={{
            color: '#991b1b',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 12,
            fontSize: 'var(--cc-sm)',
            whiteSpace: 'pre-wrap',
          }}
          >
            {error}
          </div>
        )}

        {/* Documento — Excel */}
        <div style={sectionLabel}>Documento</div>
        <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll">
          <table
            className="cc-almacen-despachador-excel"
            style={{
              ...ui.sheetTable,
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: compact ? 520 : 720,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Tipo</th>
                <th style={th}>N.º documento</th>
                <th style={th}>Fecha</th>
                <th style={th}>Usuario</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>
                  <strong>{tipo === 'disposicion' ? 'Disposición' : 'Recibo'}</strong>
                </td>
                <td style={td}>
                  {tipo === 'disposicion' ? (
                    <input
                      style={{ ...cellInput, background: `${ui.accentSoft}` }}
                      value={proximoDisposicion ? `Autogenerado (${proximoDisposicion})` : 'Autogenerado al guardar'}
                      readOnly
                      disabled
                    />
                  ) : (
                    <input
                      style={cellInput}
                      value={numeroDoc}
                      onChange={(e) => {
                        numeroDocRef.current = e.target.value
                        setNumeroDoc(e.target.value)
                      }}
                      placeholder="Número de remisión…"
                      aria-label="Número de remisión"
                    />
                  )}
                </td>
                <td style={td}>
                  <input
                    style={cellInput}
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    aria-label="Fecha"
                  />
                </td>
                <td style={td}>
                  <input
                    style={{ ...cellInput, background: `${ui.accentSoft}` }}
                    value={sessionUser?.label || '—'}
                    readOnly
                    disabled
                    aria-label="Usuario"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Ubicación */}
        <div style={sectionLabel}>Ubicación de descargue</div>
        <div style={{ marginBottom: 8 }}>
          <AlmacenPkMapaSelector
            t={theme}
            token={token}
            contratoId={contratoId}
            pkIdSeleccionado=""
            pkLabel={pkLabel}
            onSeleccionar={onPkSelect}
            onLimpiar={() => {
              setPkId('')
              setPkLabel('')
              setTramo('')
              setOcSel(null)
              setOcs([])
              setPkContext(null)
              setProveedor(null)
              setInsumo(null)
            }}
            compact
            initialBasemap="satelite"
            showBasemapToggle
          />
        </div>
        <div style={{ marginBottom: 12 }}>
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
              if (patch.abscisa_inicial != null) setAbscisaInicial(patch.abscisa_inicial)
              if (patch.abscisa_final != null) setAbscisaFinal(patch.abscisa_final)
            }}
          />
          {!(pkLabel || pkId)?.trim() && (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 6 }}>
              Seleccione un PK-ID en el mapa para ver órdenes de compra del sector.
            </div>
          )}
        </div>

        {/* Órdenes de compra — Excel */}
        <div style={sectionLabel}>Orden de compra</div>
        <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll">
          <table
            className="cc-almacen-despachador-excel"
            style={{
              ...ui.sheetTable,
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: compact ? 560 : 780,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...th, width: 44 }} />
                <th style={th}>OC</th>
                <th style={th}>Material</th>
                <th style={th}>Proveedor</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {loadingOc && (
                <tr>
                  <td colSpan={6} style={{ ...td, color: ui.textMuted, textAlign: 'center' }}>
                    Buscando OC…
                  </td>
                </tr>
              )}
              {!loadingOc && (pkLabel || pkId)?.trim() && ocs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, color: '#1e40af', background: '#eff6ff' }}>
                    {pkContext?.oc_consumida
                      ? 'La Orden de Compra de este sector ya se consumió. Puede registrar con proveedor e insumo manualmente.'
                      : 'No hay OC vigente con saldo para este sector. Puede registrar con proveedor e insumo manualmente.'}
                  </td>
                </tr>
              )}
              {!loadingOc && !(pkLabel || pkId)?.trim() && (
                <tr>
                  <td colSpan={6} style={{ ...td, color: ui.textMuted, textAlign: 'center' }}>
                    Seleccione un PK-ID para listar órdenes de compra.
                  </td>
                </tr>
              )}
              {ocs.map((oc) => {
                const active = ocSel?.orden_compra_item_id === oc.orden_compra_item_id
                return (
                  <tr
                    key={oc.orden_compra_item_id}
                    onClick={() => onOcSelect(oc)}
                    style={{
                      cursor: 'pointer',
                      background: active ? `${ui.accentSoft}` : 'transparent',
                    }}
                  >
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="radio"
                        name="oc-sel"
                        checked={active}
                        onChange={() => onOcSelect(oc)}
                        aria-label={`Seleccionar OC ${oc.numero_oc}`}
                      />
                    </td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>#{oc.numero_oc}</td>
                    <td style={td}>{oc.material_descripcion}</td>
                    <td style={td}>{oc.proveedor_nombre || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtCant(oc.saldo_cantidad)} {oc.unidad}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtMoney(oc.saldo_valor)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Material — Excel */}
        <div style={sectionLabel}>Material recibido</div>
        <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll">
          <table
            className="cc-almacen-despachador-excel"
            style={{
              ...ui.sheetTable,
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: compact ? 520 : 700,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Proveedor</th>
                <th style={th}>Insumo</th>
                <th style={{ ...th, width: compact ? 110 : 140 }}>Cantidad</th>
                <th style={th}>Saldo OC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, minWidth: 160 }}>
                  <ProveedorSelector
                    value={proveedor}
                    onChange={onProveedorChange}
                    insumoId={insumo?.insumo_id}
                    allowCreate={false}
                    disabled={!!ocSel?.proveedor_id}
                  />
                </td>
                <td style={{ ...td, minWidth: 160 }}>
                  <InsumoPorProveedorSelect
                    proveedorId={proveedor?.proveedor_id}
                    value={insumo}
                    onChange={onInsumoChange}
                    disabled={!proveedor?.proveedor_id || !!ocSel?.insumo_id}
                  />
                </td>
                <td style={td}>
                  <input
                    style={{
                      ...cellInput,
                      borderColor: superaSaldo ? '#dc2626' : undefined,
                    }}
                    type="number"
                    min="0"
                    step="any"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    disabled={!puedeCantidad}
                    aria-label="Cantidad recibida"
                  />
                  {superaSaldo && (
                    <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginTop: 4 }}>
                      ⚠ Supera saldo OC
                    </div>
                  )}
                </td>
                <td style={{ ...td, fontSize: 'var(--cc-xs)', color: superaSaldo ? '#dc2626' : ui.textMuted }}>
                  {ocSel ? (
                    <>
                      {fmtCant(ocSel.saldo_cantidad)} {ocSel.unidad}
                      {' · '}
                      {fmtMoney(ocSel.saldo_valor)}
                      {Number.isFinite(cantNum) && cantNum > 0 && (
                        <>
                          <br />
                          Restante: <strong style={{ color: ui.text }}>{fmtCant(saldoRestCant)} {ocSel.unidad}</strong>
                          {' · '}
                          <strong style={{ color: ui.text }}>{fmtMoney(saldoRestVal)}</strong>
                        </>
                      )}
                    </>
                  ) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Transporte — Excel */}
        <div style={sectionLabel}>Transporte</div>
        <div style={{ ...ui.sheetWrap, marginBottom: 12 }} className="cc-almacen-table-scroll">
          <table
            className="cc-almacen-despachador-excel"
            style={{
              ...ui.sheetTable,
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: compact ? 420 : 520,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Placa</th>
                <th style={th}>Transportador</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td} colSpan={2}>
                  <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 8 }}>
                    <PlacaTransportadorFields
                      placa={placa}
                      transportador={transportador}
                      setPlaca={setPlaca}
                      setTransportador={setTransportador}
                      onClearMsg={() => setTransportadorMsg('')}
                    />
                  </div>
                  {transportadorMsg && (
                    <div style={{ fontSize: 'var(--cc-xs)', color: '#16a34a', marginTop: 6 }}>
                      {transportadorMsg}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {tipo === 'recibo' && (
          <>
            <div style={sectionLabel}>Remisión del proveedor</div>
            <div style={{
              ...ui.sheetWrap,
              marginBottom: 12,
              padding: 10,
            }}
            >
              <AlmacenFieldLabel
                icon="📷"
                label="Soporte (obligatorio)"
                ayuda="Adjunte foto o PDF; máximo 300 KB. El OCR puede autocompletar número y fecha."
              />
              <div style={{
                display: 'flex',
                gap: 8,
                marginTop: 6,
                flexWrap: 'wrap',
                flexDirection: compact ? 'column' : 'row',
              }}
              >
                <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
                <button type="button" style={{ ...ui.btnPrimary, width: compact ? '100%' : undefined }} disabled={ocrBusy || soporteBusy} onClick={() => camRef.current?.click()}>
                  📷 {compact ? 'Tomar foto de remisión' : 'Tomar foto'}
                </button>
                <button type="button" style={{ ...ui.btnSecondary, width: compact ? '100%' : undefined }} disabled={ocrBusy || soporteBusy} onClick={() => fileRef.current?.click()}>
                  📁 Cargar archivo
                </button>
                {remision && (
                  <span style={{ fontSize: 'var(--cc-sm)', alignSelf: 'center' }}>
                    {remision.name} · {fmtSoporteBytes(remisionBytes)}
                  </span>
                )}
                {(ocrBusy || soporteBusy) && (
                  <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                    {soporteBusy ? 'Preparando soporte…' : 'Analizando OCR…'}
                  </span>
                )}
              </div>
              {ocrMsg && (
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 8 }}>{ocrMsg}</div>
              )}
            </div>
          </>
        )}

        <div className={compact ? 'cc-almacen-form-actions' : undefined} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...ui.btnPrimary, flex: compact ? 1 : undefined }} disabled={busy || ocrBusy || soporteBusy} onClick={guardar}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" style={{ ...ui.btnSecondary, flex: compact ? 1 : undefined }} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
