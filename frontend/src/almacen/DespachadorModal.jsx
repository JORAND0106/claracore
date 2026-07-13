import { useCallback, useEffect, useRef, useState } from 'react'
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
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'
import { validateAbscisaRango } from './almacenAbscisa'

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
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
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
    if (!f) return
    setRemision(f)
    setOcrMsg('')
    if (tipo !== 'recibo') return
    setOcrBusy(true)
    try {
      const r = await api.ocrRemisionEntrada(f)
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
    if (tipo === 'recibo' && !remision) faltantes.push('Archivo de remisión del proveedor')
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
    background: 'rgba(15, 23, 42, 0.55)',
    zIndex: 9000,
    display: 'flex',
    alignItems: compact ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: compact ? 0 : 16,
  }

  const modal = {
    ...ui.card,
    width: '100%',
    maxWidth: compact ? '100%' : 640,
    maxHeight: compact ? '96dvh' : '92vh',
    overflow: 'auto',
    boxShadow: compact ? '0 -12px 40px rgba(0,0,0,0.25)' : '0 24px 64px rgba(0,0,0,0.35)',
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

  return (
    <div
      style={overlay}
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="despachador-title"
    >
      <div style={modal} className={compact ? 'cc-almacen-modal-sheet' : ''}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div id="despachador-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>
              🚚 Despachador
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
              Registro de llegada de material a obra contra orden de compra.
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '4px 10px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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

        <AlmacenFieldLabel
          icon="🔢"
          label="Número de documento"
          ayuda={tipo === 'disposicion'
            ? 'Consecutivo autogenerado de 5 dígitos al guardar.'
            : 'Número de remisión del proveedor. Puede autodiligenciarse con OCR al adjuntar el documento.'}
        />
        {tipo === 'disposicion' ? (
          <input
            style={{ ...ui.input, marginBottom: 12, background: `${ui.accentSoft}` }}
            value={proximoDisposicion ? `Autogenerado al guardar (${proximoDisposicion})` : 'Autogenerado al guardar'}
            readOnly
            disabled
          />
        ) : (
          <input
            style={{ ...ui.input, marginBottom: 12 }}
            value={numeroDoc}
            onChange={(e) => {
              numeroDocRef.current = e.target.value
              setNumeroDoc(e.target.value)
            }}
            placeholder="Número de remisión…"
          />
        )}

        <AlmacenFieldLabel icon="📅" label="Fecha" />
        <input
          style={{ ...ui.input, marginBottom: 12 }}
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />

        <div style={{ marginBottom: 12 }}>
          <AlmacenFieldLabel
            icon="🗺️"
            label="PK-ID — ubicación de descargue"
            ayuda="Seleccione primero el sector en el mapa. Las órdenes de compra se filtrarán por este PK-ID."
          />
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
          />
          <UbicacionSolicitudFields
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
        </div>

        <div style={{ marginBottom: 12 }}>
          <AlmacenFieldLabel
            icon="📄"
            label="Orden de compra"
            ayuda="Solo órdenes aprobadas con saldo para el PK-ID seleccionado. Si no hay OC vigente, puede registrar igualmente con proveedor e insumo."
          />
          {!(pkLabel || pkId)?.trim() && (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 8 }}>
              Seleccione un PK-ID para ver las órdenes de compra del sector.
            </div>
          )}
          {loadingOc && (
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 8 }}>Buscando OC…</div>
          )}
          {!loadingOc && (pkLabel || pkId)?.trim() && ocs.length === 0 && (
            <div style={{
              padding: 10,
              borderRadius: 8,
              background: '#eff6ff',
              color: '#1e40af',
              fontSize: 'var(--cc-sm)',
              marginBottom: 8,
            }}
            >
              {pkContext?.oc_consumida
                ? 'La Orden de Compra de este sector ya se consumió. Puede registrar la disposición seleccionando proveedor e insumo manualmente.'
                : 'No hay Orden de Compra vigente con saldo para este sector. Puede registrar la disposición seleccionando proveedor e insumo manualmente.'}
            </div>
          )}
          {ocs.map((oc) => {
            const active = ocSel?.orden_compra_item_id === oc.orden_compra_item_id
            return (
              <button
                key={oc.orden_compra_item_id}
                type="button"
                onClick={() => onOcSelect(oc)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 10,
                  marginBottom: 6,
                  borderRadius: 8,
                  border: active ? `2px solid ${ui.accent}` : `1px solid ${ui.textMuted}33`,
                  background: active ? `${ui.accentSoft}` : 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--cc-sm)',
                  color: ui.text,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  OC #
                  {oc.numero_oc}
                  {' · '}
                  {oc.material_descripcion}
                </div>
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
                  {oc.proveedor_nombre && `${oc.proveedor_nombre} · `}
                  Saldo: {fmtCant(oc.saldo_cantidad)} {oc.unidad}
                  {' · '}
                  {fmtMoney(oc.saldo_valor)}
                </div>
              </button>
            )
          })}
        </div>

        <ProveedorSelector
          value={proveedor}
          onChange={onProveedorChange}
          insumoId={insumo?.insumo_id}
          allowCreate={false}
          disabled={!!ocSel?.proveedor_id}
        />

        <div style={{ marginTop: 12 }}>
          <InsumoPorProveedorSelect
            proveedorId={proveedor?.proveedor_id}
            value={insumo}
            onChange={onInsumoChange}
            disabled={!proveedor?.proveedor_id || !!ocSel?.insumo_id}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <AlmacenFieldLabel icon="📦" label="Cantidad recibida" />
          <input
            style={{
              ...ui.input,
              marginBottom: superaSaldo ? 4 : ocSel ? 4 : 12,
              borderColor: superaSaldo ? '#dc2626' : undefined,
            }}
            type="number"
            min="0"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            disabled={!puedeCantidad}
          />
          {ocSel && (
            <div style={{
              fontSize: 'var(--cc-xs)',
              color: superaSaldo ? '#dc2626' : ui.textMuted,
              marginBottom: 12,
            }}
            >
              Saldo OC actual: {fmtCant(ocSel.saldo_cantidad)} {ocSel.unidad}
              {' · '}
              {fmtMoney(ocSel.saldo_valor)}
              {Number.isFinite(cantNum) && cantNum > 0 && (
                <>
                  {' → '}
                  Restante: <strong>{fmtCant(saldoRestCant)} {ocSel.unidad}</strong>
                  {' · '}
                  <strong>{fmtMoney(saldoRestVal)}</strong>
                </>
              )}
            </div>
          )}
          {superaSaldo && (
            <div style={{ color: '#dc2626', fontSize: 'var(--cc-xs)', marginBottom: 12 }}>
              ⚠ Supera el saldo disponible en la OC.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <PlacaTransportadorFields
            placa={placa}
            transportador={transportador}
            setPlaca={setPlaca}
            setTransportador={setTransportador}
            onClearMsg={() => setTransportadorMsg('')}
          />
        </div>
        {transportadorMsg && (
          <div style={{ fontSize: 'var(--cc-xs)', color: '#16a34a', marginBottom: 12 }}>
            {transportadorMsg}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <AlmacenFieldLabel icon="🧑‍💼" label="Usuario" ayuda="Tomado de la sesión activa en ClaraCore." />
          <input
            style={{ ...ui.input, background: `${ui.accentSoft}` }}
            value={sessionUser?.label || '—'}
            readOnly
            disabled
          />
        </div>

        {tipo === 'recibo' && (
          <>
            <AlmacenFieldLabel
              icon="📷"
              label="Remisión del proveedor"
              ayuda="Adjunte foto o PDF; el OCR puede autocompletar número y fecha."
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', flexDirection: compact ? 'column' : 'row' }}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
              <button type="button" style={{ ...ui.btnPrimary, width: compact ? '100%' : undefined }} disabled={ocrBusy} onClick={() => camRef.current?.click()}>
                📷 {compact ? 'Tomar foto de remisión' : 'Tomar foto'}
              </button>
              <button type="button" style={{ ...ui.btnSecondary, width: compact ? '100%' : undefined }} disabled={ocrBusy} onClick={() => fileRef.current?.click()}>
                📁 Cargar archivo
              </button>
              {remision && <span style={{ fontSize: 'var(--cc-sm)', alignSelf: 'center' }}>{remision.name}</span>}
              {ocrBusy && <span style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>Analizando OCR…</span>}
            </div>
            {ocrMsg && (
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 12 }}>{ocrMsg}</div>
            )}
          </>
        )}

        <div className={compact ? 'cc-almacen-form-actions' : undefined} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...ui.btnPrimary, flex: compact ? 1 : undefined }} disabled={busy || ocrBusy} onClick={guardar}>
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
