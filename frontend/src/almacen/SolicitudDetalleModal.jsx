import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import OcGeneradaMensajeModal from './OcGeneradaMensajeModal'
import OcProveedoresModal from './OcProveedoresModal'
import OcNotificarProveedorModal from './OcNotificarProveedorModal'
import { esDocumentoSistema, ETIQUETA_DOCUMENTO_SISTEMA } from './ocDocumentoSistema'
import { notificarProveedoresPayload } from './ocNotificarProveedor'
import SolicitudOcsPdfButton from './SolicitudOcsPdfButton'
import SolicitudRegenerarPdf from './SolicitudRegenerarPdf'
import { ordenesDeRespuestaAprobar } from './ocGeneradaMensaje'
import { estadoProveedoresSolicitud, gruposProveedorPendientes } from './ocProveedoresSeleccion'
import SolicitudLineaMapaModal from './SolicitudLineaMapaModal'
import SolicitudLineaRevisionModal from './SolicitudLineaRevisionModal'
import SolicitudMaterialesExcelTable from './SolicitudMaterialesExcelTable'
import InsumoSearchTable from './InsumoSearchTable'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import SolicitudBuzon from './SolicitudBuzon'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import { almacenContraste, estiloAvisoAlmacen } from './almacenContraste'
import { motivoAgregarMaterialesAlmacen, puedeEditarSolicitudFormAlmacen, puedeEnviarSolicitudAlmacen, solicitudAlmacenEditable, solicitudTituloEditable } from './almacenPermisos'
import { resumenAccionBloque } from './solicitudTramoSeleccion'
import {
  estadoValidacionItem,
  motivoAprobacionNoDisponible,
  puedeAbrirRevisionLinea,
  resumenProveedoresSolicitud,
  totalesCompraSolicitud,
  textoFilasMismoInsumo,
  textoMaterialesSolicitados,
  solicitudOrdenesCompra,
  MOTIVO_REABRIR_OC_SIN_PANTALLA,
  solicitudPuedeReabrirOc,
  solicitudPuedeRechazarCompleta,
  solicitudPuedeValidar,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  ESTADO_SOLICITUD_LABEL,
  almacenFormModalDialogStyle,
  fmtCant,
  fmtMoneySolicitud as fmtMoney,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Detalle de solicitud — encabezado + grilla Excel + modales de mapa/revisión.
 */
export default function SolicitudDetalleModal({
  solicitudId,
  initialSeed = null,
  initialTab = 'portada',
  permisos,
  token,
  t,
  contratoId,
  onClose,
  onUpdated,
  onOcGenerada,
  onEdit,
  onReabrirOc,
  onMensajesLeidos,
  onAbrirSolicitud,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const contraste = almacenContraste(ui)
  const compact = useAlmacenCompact()
  const [sol, setSol] = useState(() => (initialSeed ? { ...initialSeed, items: initialSeed.items || [] } : null))
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectorOc, setSelectorOc] = useState(false)
  const [notificarOc, setNotificarOc] = useState(null)
  const [selIds, setSelIds] = useState(() => new Set())
  const [rechazoSel, setRechazoSel] = useState(null)
  const [asignar, setAsignar] = useState(null)
  const [insumoSel, setInsumoSel] = useState(null)
  const [costoBloque, setCostoBloque] = useState('')
  const [cobroBloque, setCobroBloque] = useState('')
  const [expedienteOcId, setExpedienteOcId] = useState(null)
  const [avisoOc, setAvisoOc] = useState(null)
  const [mensajesAbiertos, setMensajesAbiertos] = useState(false)
  const [loading, setLoading] = useState(!initialSeed)
  const [loadingSaldos, setLoadingSaldos] = useState(true)
  const [tituloDraft, setTituloDraft] = useState(initialSeed?.titulo || '')
  const [guardandoTitulo, setGuardandoTitulo] = useState(false)
  const [materialesOpen, setMaterialesOpen] = useState(true)
  const [mapaItem, setMapaItem] = useState(null)
  const [revisionItemId, setRevisionItemId] = useState(null)
  const [eliminarCandidatas, setEliminarCandidatas] = useState(null)
  const [eliminarLinea, setEliminarLinea] = useState(null)
  const [eliminarLineaAviso, setEliminarLineaAviso] = useState('')
  const [eliminarLineaBusy, setEliminarLineaBusy] = useState(false)
  const [ocProgreso, setOcProgreso] = useState('')
  const [partidaOc, setPartidaOc] = useState(null)
  const aprobandoRef = useRef(false)
  const [avisoReabrir, setAvisoReabrir] = useState('')

  // El título de la fila queda en un tooltip institucional. Al abrir el popup
  // ese recuadro se queda encima de la grilla y se corta. Se cierra al montar.
  useEffect(() => {
    document.dispatchEvent(new Event('cc-title-tooltip-hide'))
  }, [])

  // initialTab legado (pestaña por ítem) → abrir modal de revisión de esa línea
  useEffect(() => {
    if (!puedeAbrirRevisionLinea(permisos)) return
    if (!initialTab || initialTab === 'portada') return
    const m = String(initialTab).match(/^item-(.+)$/)
    if (m?.[1]) setRevisionItemId(Number(m[1]) || m[1])
  }, [initialTab, permisos])

  const modalTheme = useMemo(() => ({
    primary: ui.accent,
    bgCard: ui.card?.background || '#fff',
    border: ui.borderColor,
    text: ui.text,
    textMuted: ui.textMuted,
  }), [ui])

  const reload = useCallback((opts = {}) => {
    if (!solicitudId) return Promise.resolve()
    const { silent = false, full = false } = opts
    if (!silent) setLoading(true)
    const ligera = !full
    return api.getSolicitud(solicitudId, { ligera })
      .then((data) => {
        setSol(data)
        if (!full) {
          // Segunda pasada: saldos / contexto (no bloquea el popup).
          setLoadingSaldos(true)
          api.getSolicitud(solicitudId, { ligera: false })
            .then((fullData) => setSol(fullData))
            .catch(() => {})
            .finally(() => setLoadingSaldos(false))
        } else {
          setLoadingSaldos(false)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }, [api, solicitudId])

  useEffect(() => { void reload({ silent: Boolean(initialSeed) }) }, [reload]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTituloDraft(sol?.titulo || '')
  }, [sol?.titulo, sol?.id])

  const items = sol?.items || []
  const puedeEscribir = puedeEditarSolicitudFormAlmacen(permisos)
  const editable = Boolean(puedeEscribir && solicitudAlmacenEditable(sol))
  const motivoAgregar = motivoAgregarMaterialesAlmacen(sol, permisos)
  const puedeEditarTitulo = solicitudTituloEditable(permisos)
  const puedeValidar = solicitudPuedeValidar(sol, permisos)
  const puedeGenerarOc = Boolean(permisos?.puedeGenerarOc) && puedeValidar
  const motivoAprobacion = motivoAprobacionNoDisponible(sol, permisos)
  const puedeEnviar = puedeEnviarSolicitudAlmacen(permisos, sol)
  const verEconomicos = permisos?.verEconomicos !== false
  const resumenProveedores = useMemo(
    () => resumenProveedoresSolicitud(items),
    [items],
  )
  const totalesCompra = useMemo(
    () => (verEconomicos ? totalesCompraSolicitud(items) : null),
    [items, verEconomicos],
  )
  const puedeAsignar = Boolean(permisos?.editar)
  const puedeSeleccionar = puedeAsignar || puedeValidar
  const puedeRechazarCompleta = solicitudPuedeRechazarCompleta(sol, permisos)
  const puedeReabrir = solicitudPuedeReabrirOc(sol, permisos)
  const reabrirDisponible = puedeReabrir && typeof onReabrirOc === 'function'
  const puedeRegenerarPdf = Boolean(permisos?.puedeRegenerarPdfOc)
  const tieneOc = solicitudTieneOrdenCompra(sol)
  const esRolRevision = puedeAbrirRevisionLinea(permisos)

  const revisionItem = useMemo(() => {
    if (!esRolRevision || revisionItemId == null) return null
    return items.find((it) => String(it.id) === String(revisionItemId)) || null
  }, [items, revisionItemId, esRolRevision])

  const resumenValidacion = useMemo(() => {
    const counts = { pendiente: 0, aprobado: 0, rechazado: 0 }
    items.forEach((it) => {
      const e = estadoValidacionItem(it, sol) || 'pendiente'
      if (counts[e] != null) counts[e] += 1
    })
    return counts
  }, [items, sol])

  const itemsSinInsumo = useMemo(
    () => (items || []).filter((it) => (
      !it.en_orden_compra
      && !it.es_recurrente
      && !String(it.insumo_id || '').trim()
      && (it.estado_validacion || 'pendiente') !== 'rechazado'
    )),
    [items],
  )

  const mensajeFaltaInsumoOc = useMemo(() => {
    if (!itemsSinInsumo.length) return ''
    const detalle = itemsSinInsumo
      .slice(0, 12)
      .map((it) => {
        const n = it.numero_linea != null ? `#${it.numero_linea}` : (it.id != null ? `id ${it.id}` : '—')
        const mat = String(it.descripcion_solicitada || it.material_descripcion || it.descripcion || '').trim()
          || 'Sin descripción'
        return `• Línea ${n}: ${mat}`
      })
      .join('\n')
    const extra = itemsSinInsumo.length > 12
      ? `\n• (+${itemsSinInsumo.length - 12} más)`
      : ''
    const verbo = tieneOc
      ? 'No se pueden agregar a la Orden de Compra'
      : 'No se puede generar la Orden de Compra'
    return (
      `${verbo}: faltan insumos del catálogo en ${itemsSinInsumo.length} material(es).\n\n` +
      `${detalle}${extra}\n\nAsigne el insumo en la revisión de cada línea antes de aprobar.`
    )
  }, [itemsSinInsumo, tieneOc])

  const enviarAprobacion = async () => {
    if (!sol?.id) return
    setBusy(true)
    setError('')
    try {
      await api.enviarSolicitud(sol.id)
      onUpdated?.()
      await reload({ silent: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const gruposOc = useMemo(
    () => gruposProveedorPendientes(items),
    [items],
  )
  const proveedoresOc = useMemo(
    () => estadoProveedoresSolicitud(items),
    [items],
  )

  const intentarAprobarOc = () => {
    setError('')
    if (!gruposOc.grupos.length) {
      setError(mensajeFaltaInsumoOc || 'No hay proveedores pendientes de generar.')
      return
    }
    setSelectorOc(true)
  }

  const abrirNotificarOc = (itemIds) => {
    const elegidos = gruposOc.grupos.filter((g) => (
      g.lineas.some((linea) => itemIds.includes(linea.id))
    ))
    if (!elegidos.length) {
      setError('Seleccione al menos un proveedor.')
      return
    }
    setSelectorOc(false)
    setNotificarOc({ grupos: elegidos, itemIds })
  }

  const ejecutarAprobar = async (itemIds, notificarProveedores) => {
    if (!sol || aprobandoRef.current) return
    if (!itemIds?.length) {
      setError('Seleccione al menos un proveedor.')
      return
    }
    aprobandoRef.current = true
    setBusy(true)
    setOcProgreso(tieneOc ? 'Generando las órdenes pendientes…' : 'Generando orden de compra…')
    setError('')
    try {
      const r = await api.aprobarSolicitud(sol.id, {
        aprobar_todos_pendientes: true,
        item_ids: itemIds,
        notificar_proveedores: notificarProveedores,
      })
      setSelectorOc(false)
      setNotificarOc(null)
      const ocs = ordenesDeRespuestaAprobar(r)
      const origen = r?.solicitud_origen
      const parcial = Boolean(origen?.id && String(origen.id) !== String(r.id))
      if (parcial && Array.isArray(origen.items)) {
        setSol(origen)
        setPartidaOc({
          consecutivo: r.consecutivo,
          ocs,
        })
      } else {
        setSol(r)
        setPartidaOc(null)
      }
      onOcGenerada?.(r)
      if (ocs.length) {
        setAvisoOc({
          sol: parcial ? r : r,
          ocs,
          envios: Array.isArray(r.envios_oc) ? r.envios_oc : [],
        })
        setExpedienteOcId(ocs[0].id)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      aprobandoRef.current = false
      setBusy(false)
      setOcProgreso('')
    }
  }

  const aprobarTodosItems = async () => {
    if (!sol) return
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarTodosItemsSolicitud(sol.id)
      setSol(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aplicarResultadoBloque = (r, accion) => {
    if (r?.solicitud) setSol(r.solicitud)
    const okIds = new Set((r?.resultados || []).filter((row) => row.ok).map((row) => row.item_id))
    setSelIds((prev) => {
      const next = new Set(prev)
      okIds.forEach((id) => next.delete(id))
      return next
    })
    setError(resumenAccionBloque(r?.resultados, accion))
  }

  const idsDeLineas = (lineas) => (
    (lineas || []).map((it) => it?.id).filter((id) => id != null)
  )

  const abrirAsignar = (lineas) => {
    const ids = idsDeLineas(lineas)
    if (!ids.length) {
      setError('Seleccione al menos una línea.')
      return
    }
    const desc = String(
      (lineas || []).find((it) => String(it?.descripcion_solicitada || '').trim())?.descripcion_solicitada
      || '',
    ).trim()
    setInsumoSel(null)
    setCostoBloque('')
    setCobroBloque('')
    setAsignar({ ids, suggest: desc })
    setError('')
  }

  const ejecutarAsignarBloque = async () => {
    if (!sol || !asignar) return
    if (!insumoSel?.insumo_id) {
      setError('Seleccione el insumo del catálogo.')
      return
    }
    const costo = Number(costoBloque)
    if (verEconomicos && !(costo > 0)) {
      setError('Defina el costo de compra unitario.')
      return
    }
    const body = {
      item_ids: asignar.ids,
      insumo_id: Number(insumoSel.insumo_id),
    }
    if (costo > 0) body.valor_compra_unitario = costo
    const cobro = cobroBloque !== '' && cobroBloque != null ? Number(cobroBloque) : NaN
    if (Number.isFinite(cobro) && cobro > 0) body.vlr_unitario_cobro = cobro
    setBusy(true)
    setError('')
    try {
      const r = await api.mapearItemsBloque(sol.id, body)
      setAsignar(null)
      aplicarResultadoBloque(r, 'Insumo asignado')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aprobarLineas = async (lineas) => {
    if (!sol) return
    const ids = idsDeLineas(lineas)
    if (!ids.length) {
      setError('Seleccione al menos una línea.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarItemsBloque(sol.id, ids)
      aplicarResultadoBloque(r, 'Aprobadas')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pedirRechazoSeleccion = () => {
    const ids = [...selIds]
    if (!ids.length) {
      setError('Seleccione al menos una línea.')
      return
    }
    if (!motivo.trim()) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setRechazoSel({
      ids,
      rechazan: ids.length,
      sinCambio: Math.max(0, items.length - ids.length),
    })
  }

  const confirmarRechazoSeleccion = async () => {
    if (!sol || !rechazoSel) return
    setBusy(true)
    setError('')
    try {
      const r = await api.rechazarLineasSolicitud(sol.id, rechazoSel.ids, motivo.trim())
      setRechazoSel(null)
      setSelIds(new Set())
      setMotivo('')
      setSol(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const rechazar = async () => {
    if (!sol) return
    if (!motivo.trim()) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.rechazarSolicitud(sol.id, motivo)
      onUpdated?.(r)
      onClose?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const tituloDisplay = sol?.titulo?.trim() || `Solicitud #${sol?.consecutivo || '…'}`

  const pedirReabrir = (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (busy) {
      setAvisoReabrir('Espere a que termine la acción en curso. Reabrir agrega insumos nuevos y no cambia la orden ya emitida.')
      return
    }
    if (typeof onReabrirOc !== 'function') {
      setAvisoReabrir(MOTIVO_REABRIR_OC_SIN_PANTALLA)
      return
    }
    if (!sol?.id || !solicitudPuedeReabrirOc(sol, permisos)) {
      setAvisoReabrir('Reabrir no aplica a esta solicitud: solo agrega insumos nuevos cuando ya hay una orden de compra y usted puede crear o editar en Almacén.')
      return
    }
    setAvisoReabrir('Se abrió el formulario para agregar insumos nuevos. Las líneas ya incluidas en la orden no se modifican.')
    onReabrirOc(sol)
  }

  const avisoReabrirNodo = avisoReabrir ? (
    <p
      data-testid="reabrir-oc-aviso"
      style={{ margin: '8px 0 0', flexBasis: '100%', fontSize: 'var(--cc-sm)', color: ui.text, lineHeight: 1.45 }}
    >
      {avisoReabrir}
    </p>
  ) : null

  const guardarTitulo = async () => {
    if (!sol?.id || !puedeEditarTitulo) return
    const next = tituloDraft.trim()
    const prev = (sol.titulo || '').trim()
    if (next === prev) return
    setGuardandoTitulo(true)
    setError('')
    try {
      const r = await api.updateSolicitud(sol.id, { titulo: next })
      setSol(r)
    } catch (e) {
      setError(e.message)
      setTituloDraft(sol.titulo || '')
    } finally {
      setGuardandoTitulo(false)
    }
  }

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100010,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
      onClick={() => !busy && !revisionItem && !mapaItem && !avisoOc && !expedienteOcId && !selectorOc && !mensajesAbiertos && !rechazoSel && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...almacenFormModalDialogStyle({ width: 'min(1622px, 100%)', compact }),
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          padding: compact ? '16px 16px 0' : '20px 20px 0',
          flexShrink: 0,
        }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {(sol?.solicitud_origen?.consecutivo || (sol?.solicitudes_derivadas || []).length > 0) && (
                <div data-testid="solicitud-parentesco" style={{ fontSize: 'var(--cc-sm)', marginBottom: 6 }}>
                  {sol?.solicitud_origen?.id && (
                    <button
                      type="button"
                      style={{ ...ui.btnSecondary, marginRight: 8 }}
                      onClick={() => onAbrirSolicitud?.(sol.solicitud_origen.id)}
                    >
                      Derivada de la solicitud #{sol.solicitud_origen.consecutivo}
                    </button>
                  )}
                  {(sol?.solicitudes_derivadas || []).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      style={{ ...ui.btnSecondary, marginRight: 8 }}
                      onClick={() => onAbrirSolicitud?.(d.id)}
                    >
                      Grupo derivado #{d.consecutivo}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 2 }}>
                {sol?.consecutivo ? `#${sol.consecutivo}` : ''}
                {sol?.oc_parcial || (sol?.estado === 'enviada' && tieneOc)
                  ? ' · Solicitud: OC parcial'
                  : (sol?.estado ? ` · Solicitud: ${ESTADO_SOLICITUD_LABEL[sol.estado]}` : '')}
                {Number(sol?.mensajes_no_leidos) > 0 && (
                  <span
                    data-testid="solicitud-detalle-no-leidos"
                    style={{
                      marginLeft: 8,
                      background: '#dc2626',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '1px 7px',
                      fontWeight: 700,
                    }}
                  >
                    {sol.mensajes_no_leidos} sin leer
                  </span>
                )}
                {tieneOc && (() => {
                  const ocs = solicitudOrdenesCompra(sol)
                  if (ocs.length === 1) return ` · OC #${ocs[0].numero_oc}`
                  if (ocs.length > 1) return ` · ${ocs.length} OCs`
                  return ''
                })()}
              </div>
              {puedeEditarTitulo ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <textarea
                    rows={2}
                    data-testid="solicitud-titulo"
                    style={{ ...ui.input, flex: 1, minWidth: 200, width: '100%', fontWeight: 700, fontSize: 'var(--cc-title)', resize: 'vertical', whiteSpace: 'pre-wrap' }}
                    value={tituloDraft}
                    disabled={busy || guardandoTitulo}
                    placeholder={tituloDisplay}
                    onChange={(e) => setTituloDraft(e.target.value)}
                    onBlur={() => { void guardarTitulo() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void guardarTitulo()
                      }
                    }}
                  />
                  {guardandoTitulo && (
                    <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Guardando…</span>
                  )}
                </div>
              ) : (
                <div
                  data-testid="solicitud-titulo"
                  style={{ fontSize: 'var(--cc-title)', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.35 }}
                >
                  {tituloDisplay}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {permisos?.ver && sol?.id != null && (
                <SolicitudBuzon
                  solicitudId={sol.id}
                  consecutivo={sol.consecutivo}
                  titulo={tituloDisplay}
                  items={items}
                  puedeEnviar={Boolean(permisos?.crear)}
                  noLeidosInicial={Number(sol.mensajes_no_leidos) || 0}
                  onOpenChange={setMensajesAbiertos}
                  onNoLeidos={(n) => {
                    setSol((prev) => (prev ? { ...prev, mensajes_no_leidos: n } : prev))
                    onMensajesLeidos?.(n)
                  }}
                />
              )}
              {sol?.id != null && (
                <AlmacenTrazabilidadButton
                  token={token}
                  theme={t || modalTheme}
                  ui={ui}
                  entidadTipo="solicitud"
                  entidadId={sol.id}
                  titulo={`Almacén · Solicitud #${sol.consecutivo}${tituloDisplay ? ` · ${tituloDisplay}` : ''}`}
                />
              )}
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onClose}>✕</button>
            </div>
          </div>

          <SolicitudTrazabilidadPanel sol={sol} />
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: compact ? '12px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '12px 20px 20px',
        }}
        >
          {loading && !sol && <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando…</div>}
          {loadingSaldos && sol && (
            <div style={{ color: ui.textMuted, marginBottom: 8, fontSize: 'var(--cc-xs)' }}>
              Actualizando saldos y contexto…
            </div>
          )}
          {(sol?.ordenes_compra || []).some((o) => o?.envio_estado === 'pendiente' || o?.envio_estado === 'error') && (
            <div
              data-testid="oc-correo-fallo"
              style={{
                ...estiloAvisoAlmacen(contraste, 'warn'),
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 'var(--cc-sm)',
                lineHeight: 1.45,
              }}
            >
              El correo de la orden de compra no se envió. La orden quedó generada.
              {' '}
              <button
                type="button"
                style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0 }}
                onClick={() => {
                  const oc = (sol.ordenes_compra || []).find((o) => o?.envio_estado === 'pendiente' || o?.envio_estado === 'error')
                  if (oc?.id) setExpedienteOcId(oc.id)
                }}
              >
                Reintentar envío
              </button>
            </div>
          )}
          {partidaOc && (
            <div
              data-testid="oc-parcial-aviso"
              style={{
                ...estiloAvisoAlmacen(contraste, 'ok'),
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 'var(--cc-sm)',
                lineHeight: 1.45,
              }}
            >
              {`Las líneas elegidas quedaron con ${
                (partidaOc.ocs || []).map((o) => (o.numero_oc != null ? `OC #${o.numero_oc}` : 'OC')).join(', ') || 'su orden de compra'
              } en la solicitud #${partidaOc.consecutivo ?? '—'}. Esta solicitud sigue con lo que falta.`}
            </div>
          )}
          {error && (
            <div style={{
              ...estiloAvisoAlmacen(contraste, 'danger'),
              padding: '10px 12px',
              marginBottom: 12,
              fontSize: 'var(--cc-sm)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.45,
            }}
            >
              {error}
            </div>
          )}

          {sol && (
            <>
              {loading && !(sol.items || []).length && (
                <div style={{ color: ui.textMuted, marginBottom: 12, fontSize: 'var(--cc-sm)' }}>
                  Cargando materiales…
                </div>
              )}
              {puedeValidar && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 'var(--cc-xs)' }}>
                  <span style={estiloAvisoAlmacen(contraste, 'warn', { compact: true })}>
                    Pendientes: {resumenValidacion.pendiente}
                  </span>
                  <span style={estiloAvisoAlmacen(contraste, 'ok', { compact: true })}>
                    Aprobados: {resumenValidacion.aprobado}
                  </span>
                  <span style={estiloAvisoAlmacen(contraste, 'danger', { compact: true })}>
                    Rechazados: {resumenValidacion.rechazado}
                  </span>
                </div>
              )}

              {sol.motivo_rechazo && (
                <div style={{
                  ...estiloAvisoAlmacen(contraste, 'danger'),
                  fontSize: 'var(--cc-xs)',
                  marginBottom: 10,
                }}
                >
                  Motivo de rechazo: {sol.motivo_rechazo}
                </div>
              )}

              {proveedoresOc.length > 0 && (
                <div
                  data-testid="oc-proveedores-estado"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 'var(--cc-xs)' }}
                >
                  {proveedoresOc.map((p) => (
                    <span
                      key={p.key}
                      style={{
                        ...estiloAvisoAlmacen(contraste, p.estado === 'con_oc' ? 'ok' : 'warn', { compact: true }),
                      }}
                    >
                      {p.nombre}: {p.estado === 'con_oc' ? 'con OC' : 'pendiente de OC'}
                    </span>
                  ))}
                </div>
              )}

              {(tieneOc || (sol.estado === 'aprobada' && solicitudOrdenesCompra(sol).length > 0 && permisos?.exportar)) && (
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {(sol.estado === 'aprobada' || sol.oc_parcial || sol.estado === 'enviada') && permisos?.exportar && (
                    <SolicitudOcsPdfButton
                      solicitudId={sol.id}
                      ordenes={solicitudOrdenesCompra(sol)}
                      puedeExportar
                    />
                  )}
                  {tieneOc && (
                    <span style={{
                      ...estiloAvisoAlmacen(contraste, 'ok', { compact: true }),
                      padding: '4px 10px',
                      fontSize: 'var(--cc-xs)',
                      fontWeight: 600,
                    }}
                    >
                      {solicitudOrdenesCompra(sol).length > 1
                        ? `✓ ${solicitudOrdenesCompra(sol).length} OCs generadas (una por proveedor)`
                        : `✓ OC #${solicitudOrdenesCompra(sol)[0]?.numero_oc} generada`}
                    </span>
                  )}
                  {solicitudOrdenesCompra(sol).filter(esDocumentoSistema).map((oc) => (
                    <span
                      key={oc.id}
                      data-testid="oc-documento-sistema"
                      style={{
                        ...estiloAvisoAlmacen(contraste, 'warn', { compact: true }),
                        padding: '4px 10px',
                        fontSize: 'var(--cc-xs)',
                        fontWeight: 700,
                      }}
                    >
                      OC #{oc.numero_oc} · {ETIQUETA_DOCUMENTO_SISTEMA}
                    </span>
                  ))}
                  {reabrirDisponible && (
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, padding: '6px 12px', fontSize: 'var(--cc-sm)' }}
                      onClick={pedirReabrir}
                      title="Agregar insumos adicionales. Si el proveedor es distinto, se genera otra OC."
                      data-testid="reabrir-oc-header"
                    >
                      🔓 Reabrir OC
                    </button>
                  )}
                  {avisoReabrirNodo}
                  <SolicitudRegenerarPdf
                    solicitudId={sol.id}
                    ordenes={solicitudOrdenesCompra(sol)}
                    puedeRegenerar={puedeRegenerarPdf}
                    contraste={contraste}
                    onChanged={() => { void reload({ silent: true, full: true }) }}
                  />
                </div>
              )}

              {/* Garantiza visibilidad aunque el bloque OC no se renderice por flags parciales. */}
              {reabrirDisponible && !(tieneOc || (sol.estado === 'aprobada' && sol.orden_compra?.id)) && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    onClick={pedirReabrir}
                    data-testid="reabrir-oc-fallback"
                  >
                    🔓 Reabrir OC
                  </button>
                </div>
              )}
              {puedeReabrir && !reabrirDisponible && (
                <p
                  data-testid="reabrir-oc-no-disponible"
                  style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.45 }}
                >
                  {MOTIVO_REABRIR_OC_SIN_PANTALLA}
                </p>
              )}

              {/* Nivel 1: encabezado expandible → Nivel 2: tabla Excel */}
              <button
                type="button"
                onClick={() => setMaterialesOpen((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 12px',
                  marginBottom: materialesOpen ? 8 : 0,
                  border: `1px solid ${ui.textMuted}33`,
                  borderRadius: 8,
                  background: `${ui.accentSoft}`,
                  cursor: 'pointer',
                  color: ui.text,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
                  📦 {textoMaterialesSolicitados(items)}
                  {esRolRevision && (
                    <span style={{ fontWeight: 500, color: ui.textMuted, marginLeft: 8 }}>
                      — clic en una fila para revisar
                    </span>
                  )}
                </span>
                <span style={{ color: ui.textMuted, flexShrink: 0 }} aria-hidden>
                  {materialesOpen ? '▾' : '▸'}
                </span>
              </button>

              {materialesOpen && (
                <>
                  {textoFilasMismoInsumo(items) && (
                    <p
                      data-testid="materiales-mismo-insumo"
                      style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted, lineHeight: 1.45 }}
                    >
                      {textoFilasMismoInsumo(items)}
                    </p>
                  )}
                  <div
                    data-testid="solicitud-resumen-proveedores"
                    style={{
                      ...estiloAvisoAlmacen(contraste, 'panel'),
                      marginBottom: 8,
                      fontSize: 'var(--cc-xs)',
                      lineHeight: 1.45,
                    }}
                  >
                    {resumenProveedores.ocs_previstas > 0
                      ? `Se ${tieneOc ? 'relacionan' : 'generarían'} ${resumenProveedores.ocs_previstas} orden${resumenProveedores.ocs_previstas === 1 ? '' : 'es'} de compra: ${resumenProveedores.proveedores.join(', ')}.`
                      : 'Todavía no hay proveedor en las líneas: falta asignar el insumo.'}
                    {resumenProveedores.lineas_sin_insumo > 0 && (
                      <span style={{ color: contraste.warnText, fontWeight: 700 }}>
                        {' '}
                        {resumenProveedores.lineas_sin_insumo} línea(s) sin insumo asignado.
                      </span>
                    )}
                  </div>
                  {puedeSeleccionar && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {puedeAsignar && (
                        <button
                          type="button"
                          style={ui.btnSecondary}
                          disabled={busy || selIds.size === 0}
                          onClick={() => abrirAsignar(items.filter((it) => selIds.has(it.id)))}
                        >
                          Asignar insumo a la selección
                        </button>
                      )}
                      {puedeValidar && (
                        <button
                          type="button"
                          style={ui.btnSecondary}
                          disabled={busy || selIds.size === 0}
                          onClick={() => { void aprobarLineas(items.filter((it) => selIds.has(it.id))) }}
                        >
                          Aprobar selección
                        </button>
                      )}
                      {puedeValidar && (
                        <button
                          type="button"
                          data-testid="rechazar-seleccion"
                          style={{ ...ui.btnSecondary, color: '#b91c1c', borderColor: '#b91c1c' }}
                          disabled={busy || selIds.size === 0}
                          onClick={pedirRechazoSeleccion}
                        >
                          Rechazar selección
                        </button>
                      )}
                    </div>
                  )}
                <SolicitudMaterialesExcelTable
                  items={items}
                  sol={sol}
                  puedeValidar={puedeValidar}
                  puedeEliminar={Boolean(permisos?.eliminar)}
                  onEliminarLinea={(lineas) => {
                    const lista = (lineas || []).filter((it) => it?.id != null)
                    if (!lista.length) return
                    setEliminarLineaAviso('')
                    if (lista.length === 1) setEliminarLinea(lista[0])
                    else setEliminarCandidatas(lista)
                  }}
                  destacarSinInsumo={Boolean(permisos?.editar)}
                  puedeSeleccionar={puedeSeleccionar}
                  puedeAsignar={puedeAsignar}
                  seleccion={selIds}
                  onToggleLinea={(id, checked) => {
                    if (id == null) return
                    setSelIds((prev) => {
                      const next = new Set(prev)
                      if (checked) next.add(id)
                      else next.delete(id)
                      return next
                    })
                  }}
                  onAsignarGrupo={(_grupoId, grupoItems) => abrirAsignar(grupoItems)}
                  onAprobarGrupo={(_grupoId, grupoItems) => { void aprobarLineas(grupoItems) }}
                  onRowClick={(it) => {
                    if (it?.id != null) setRevisionItemId(it.id)
                  }}
                  verEconomicos={verEconomicos}
                  token={token}
                  contratoId={contratoId}
                  t={t}
                />
                {verEconomicos && totalesCompra?.alguna && (
                  <div
                    data-testid="solicitud-totales-compra"
                    style={{
                      ...estiloAvisoAlmacen(contraste, 'panel'),
                      marginTop: 8,
                      fontSize: 'var(--cc-sm)',
                    }}
                  >
                    {totalesCompra.grupos.length > 1 && totalesCompra.grupos.map((g) => (
                      <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                        <span>{g.nombre}</span>
                        <strong>{fmtMoney(g.total)}</strong>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 800 }}>
                      <span>{totalesCompra.grupos.length > 1 ? 'Total general' : 'Total de la solicitud'}</span>
                      <span>{fmtMoney(totalesCompra.total)}</span>
                    </div>
                  </div>
                )}
                </>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {editable && (
                  <button type="button" style={ui.btnPrimary} disabled={busy} onClick={() => onEdit?.(sol)}>
                    ✏️ Editar / agregar materiales
                  </button>
                )}
                {!editable && motivoAgregar && (
                  <p
                    data-testid="motivo-agregar-materiales"
                    style={{ margin: 0, flexBasis: '100%', fontSize: 'var(--cc-sm)', color: ui.textMuted }}
                  >
                    {motivoAgregar}
                  </p>
                )}
                {reabrirDisponible && (
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    onClick={pedirReabrir}
                    title="Agregar insumos adicionales a la misma Orden de Compra"
                    data-testid="reabrir-oc-footer"
                  >
                    🔓 Reabrir OC
                  </button>
                )}
                {avisoReabrirNodo}
                {puedeEnviar && (
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    disabled={busy}
                    data-testid="detalle-solicitar-aprobacion"
                    onClick={() => { void enviarAprobacion() }}
                  >
                    Solicitar aprobación
                  </button>
                )}
                {puedeValidar && (
                  <button type="button" style={ui.btnSecondary} disabled={busy} onClick={aprobarTodosItems}>
                    ✓ Aprobar todos los ítems
                  </button>
                )}
                {puedeGenerarOc && (
                  <button
                    type="button"
                    style={btnSuccessStyle(ui.btnPrimary)}
                    disabled={busy}
                    data-testid="detalle-generar-oc"
                    onClick={intentarAprobarOc}
                  >
                    {tieneOc ? '✓ Generar OC pendientes' : '✓ Aprobar y generar OC'}
                  </button>
                )}
              </div>
              {motivoAprobacion && (
                <div
                  data-testid="motivo-aprobacion-no-disponible"
                  style={{
                    ...estiloAvisoAlmacen(contraste, 'warn'),
                    marginTop: 8,
                    fontSize: 'var(--cc-sm)',
                    lineHeight: 1.45,
                  }}
                >
                  Aprobar ítem, rechazar ítem y generar la OC no están disponibles: {motivoAprobacion}
                </div>
              )}

              {puedeValidar && (
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                    Motivo de rechazo, si va a rechazar líneas o la solicitud completa
                  </label>
                  <input
                    style={{ ...ui.input, marginTop: 4 }}
                    value={motivo}
                    disabled={busy}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>
              )}
              {puedeRechazarCompleta && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    data-testid="rechazar-solicitud-completa"
                    style={{ ...ui.btnPrimary, background: '#dc2626' }}
                    disabled={busy}
                    onClick={rechazar}
                  >
                    ✕ Rechazar solicitud completa
                  </button>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {asignar && (
        <div
          className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100045,
            display: 'flex',
            alignItems: compact ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: compact ? 0 : 20,
          }}
          onClick={() => !busy && setAsignar(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="asignar-bloque-titulo"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...almacenFormModalDialogStyle({ width: 'min(640px, 100%)', compact }),
              padding: compact ? 16 : 22,
            }}
          >
            <div id="asignar-bloque-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 6 }}>
              Asignar insumo
            </div>
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', marginBottom: 12 }}>
              El mismo insumo se aplica a {asignar.ids.length} línea(s), con la cotización ganadora. El proveedor se puede cambiar después en cada línea.
            </div>
            <InsumoSearchTable
              value={insumoSel}
              disabled={busy}
              suggestFrom={asignar.suggest}
              onChange={(ins) => {
                setInsumoSel(ins)
                if (ins?.tiene_precio_compra && ins.valor_compra_referencia != null) {
                  setCostoBloque(String(ins.valor_compra_referencia))
                }
              }}
            />
            {verEconomicos && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  Costo unitario
                  <input
                    style={{ ...ui.input, marginTop: 4, width: 140, textAlign: 'right' }}
                    type="number"
                    min="0"
                    step="any"
                    value={costoBloque}
                    disabled={busy}
                    onChange={(e) => setCostoBloque(e.target.value)}
                  />
                </label>
                <label style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  Cobro unitario
                  <input
                    style={{ ...ui.input, marginTop: 4, width: 140, textAlign: 'right' }}
                    type="number"
                    min="0"
                    step="any"
                    value={cobroBloque}
                    disabled={busy}
                    onChange={(e) => setCobroBloque(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => setAsignar(null)}>
                Cancelar
              </button>
              <button type="button" style={btnSuccessStyle(ui.btnPrimary)} disabled={busy} onClick={() => { void ejecutarAsignarBloque() }}>
                {busy ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rechazoSel && (
        <div
          data-testid="rechazar-seleccion-aviso"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100070,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !busy && setRechazoSel(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ ...ui.card, width: 'min(480px, 100%)', padding: 20 }}
          >
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 8 }}>
              Rechazar la selección
            </div>
            <p style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
              Se rechazarán {rechazoSel.rechazan} línea(s). {rechazoSel.sinCambio} quedarán sin cambios.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => setRechazoSel(null)}>
                Cancelar
              </button>
              <button
                type="button"
                data-testid="rechazar-seleccion-confirmar"
                style={{ ...ui.btnSecondary, color: '#b91c1c', borderColor: '#b91c1c' }}
                disabled={busy}
                onClick={() => { void confirmarRechazoSeleccion() }}
              >
                {busy ? 'Rechazando…' : 'Rechazar estas líneas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectorOc && (
        <OcProveedoresModal
          grupos={gruposOc.grupos}
          sinInsumoCount={gruposOc.sinInsumoCount}
          verEconomicos={verEconomicos}
          busy={busy}
          onCancel={() => !busy && setSelectorOc(false)}
          onConfirm={(ids) => abrirNotificarOc(ids)}
        />
      )}

      {notificarOc && (
        <OcNotificarProveedorModal
          proveedores={notificarOc.grupos}
          busy={busy}
          error={error}
          onCancel={() => !busy && setNotificarOc(null)}
          onConfirm={(respuestas) => {
            void ejecutarAprobar(
              notificarOc.itemIds,
              notificarProveedoresPayload(notificarOc.grupos, respuestas),
            )
          }}
        />
      )}

      {expedienteOcId && (
        <ExpedienteCompraModal
          ocId={expedienteOcId}
          token={token}
          verEconomicos={verEconomicos}
          puedeReenviar={Boolean(permisos?.puedeGenerarOc)}
          onClose={() => {
            setExpedienteOcId(null)
            onClose?.()
          }}
        />
      )}

      {avisoOc && (
        <OcGeneradaMensajeModal
          solicitudId={avisoOc.sol?.id || sol?.id}
          sol={avisoOc.sol}
          ocs={avisoOc.ocs}
          envios={avisoOc.envios}
          onEnviado={() => onUpdated?.()}
          onClose={() => setAvisoOc(null)}
        />
      )}

      {eliminarCandidatas && (
        <CcConfirmModal
          theme={t}
          tipo="info"
          titulo="Elija la línea"
          confirmar="Cerrar"
          soloConfirmar
          onConfirm={() => setEliminarCandidatas(null)}
          onCancel={() => setEliminarCandidatas(null)}
        >
          <div style={{ marginBottom: 8 }}>
            Esta fila reúne varios sectores. Se elimina una línea a la vez.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {eliminarCandidatas.map((it) => (
              <button
                key={it.id}
                type="button"
                style={ui.btnSecondary}
                onClick={() => {
                  setEliminarCandidatas(null)
                  setEliminarLineaAviso('')
                  setEliminarLinea(it)
                }}
              >
                {`Línea ${it.numero_linea ?? it.id}${it.tramo ? ` · ${it.tramo}` : ''}${it.pk_id ? ` · ${it.pk_id}` : ''} · ${fmtCant(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''}`}
              </button>
            ))}
          </div>
        </CcConfirmModal>
      )}

      {eliminarLinea && (
        <CcConfirmModal
          theme={t}
          tipo={eliminarLinea.en_orden_compra ? 'warn' : 'danger'}
          titulo={eliminarLinea.en_orden_compra ? 'No se puede eliminar la línea' : 'Eliminar línea'}
          confirmar={eliminarLinea.en_orden_compra ? 'Entendido' : 'Eliminar'}
          cancelar="Cancelar"
          soloConfirmar={Boolean(eliminarLinea.en_orden_compra)}
          procesando={eliminarLineaBusy}
          onCancel={() => {
            if (eliminarLineaBusy) return
            setEliminarLinea(null)
            setEliminarLineaAviso('')
          }}
          onConfirm={async () => {
            if (eliminarLinea.en_orden_compra) {
              setEliminarLinea(null)
              return
            }
            setEliminarLineaBusy(true)
            setEliminarLineaAviso('')
            try {
              await api.eliminarLineaSolicitud(eliminarLinea.id)
              setEliminarLinea(null)
              await reload({ silent: true, full: true })
              onUpdated?.()
            } catch (e) {
              setEliminarLineaAviso(e.message || String(e))
            } finally {
              setEliminarLineaBusy(false)
            }
          }}
        >
          {eliminarLinea.en_orden_compra
            ? 'No se puede eliminar esta línea porque ya está incluida en una orden de compra.'
            : (
              <>
                {`¿Eliminar la línea ${eliminarLinea.numero_linea ?? eliminarLinea.id} de la solicitud?`}
                <div style={{ marginTop: 10, opacity: 0.9 }}>
                  {[eliminarLinea.material_descripcion || eliminarLinea.descripcion_solicitada, eliminarLinea.pk_id]
                    .filter(Boolean)
                    .join(' · ') || 'Esta línea'}
                  {` · ${fmtCant(eliminarLinea.cantidad)}${eliminarLinea.unidad ? ` ${eliminarLinea.unidad}` : ''}`}
                  . Dejará de formar parte de la solicitud y los totales se actualizarán.
                  {verEconomicos && eliminarLinea.valor_compra_unitario
                    ? ` Costo unitario ${fmtMoney(eliminarLinea.valor_compra_unitario)}.`
                    : ''}
                </div>
              </>
            )}
          {eliminarLineaAviso && (
            <div style={{ marginTop: 10, color: contraste.dangerText }}>{eliminarLineaAviso}</div>
          )}
        </CcConfirmModal>
      )}

      {mapaItem && (
        <SolicitudLineaMapaModal
          item={mapaItem}
          token={token}
          contratoId={contratoId}
          t={t}
          onClose={() => setMapaItem(null)}
        />
      )}

      {revisionItem && esRolRevision && (
        <SolicitudLineaRevisionModal
          sol={sol}
          item={revisionItem}
          permisos={permisos}
          token={token}
          contratoId={contratoId}
          t={t}
          onClose={() => setRevisionItemId(null)}
          onSeleccionarSector={(it) => {
            if (it?.id != null) setRevisionItemId(it.id)
          }}
          onUpdated={(r) => {
            setSol(r)
          }}
        />
      )}

      {ocProgreso && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100055,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            padding: 24,
          }}
        >
          <div
            style={{
              background: ui.card?.background || '#fff',
              color: ui.text,
              borderRadius: 12,
              padding: '28px 32px',
              maxWidth: 380,
              textAlign: 'center',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.35)',
              border: `1px solid ${ui.textMuted}33`,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                margin: '0 auto 14px',
                border: `3px solid ${ui.textMuted}33`,
                borderTopColor: ui.accent || '#2563eb',
                borderRadius: '50%',
                animation: 'cc-almacen-spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 6 }}>
              {ocProgreso}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.45 }}>
              Se está creando la Orden de Compra. Espere un momento; no cierre esta ventana.
            </div>
          </div>
          <style>{`@keyframes cc-almacen-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}
