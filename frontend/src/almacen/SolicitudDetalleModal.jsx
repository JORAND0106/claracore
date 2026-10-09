import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { btnSuccessStyle } from '../theme/adminPanelTheme'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import OcGeneradaMensajeModal from './OcGeneradaMensajeModal'
import OcProveedoresModal from './OcProveedoresModal'
import SolicitudOcsPdfButton from './SolicitudOcsPdfButton'
import { ordenesDeRespuestaAprobar } from './ocGeneradaMensaje'
import { estadoProveedoresSolicitud, gruposProveedorPendientes } from './ocProveedoresSeleccion'
import SolicitudLineaMapaModal from './SolicitudLineaMapaModal'
import SolicitudLineaRevisionModal from './SolicitudLineaRevisionModal'
import SolicitudMaterialesExcelTable from './SolicitudMaterialesExcelTable'
import InsumoSearchTable from './InsumoSearchTable'
import SolicitudTrazabilidadPanel from './SolicitudTrazabilidadPanel'
import SolicitudBuzon from './SolicitudBuzon'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import { puedeEnviarSolicitudAlmacen, solicitudAlmacenEditable, solicitudTituloEditable } from './almacenPermisos'
import { resumenAccionBloque } from './solicitudTramoSeleccion'
import {
  estadoValidacionItem,
  motivoAprobacionNoDisponible,
  motivoEnvioNoDisponible,
  puedeAbrirRevisionLinea,
  resumenProveedoresSolicitud,
  totalesCompraSolicitud,
  solicitudOrdenesCompra,
  solicitudPuedeReabrirOc,
  solicitudPuedeRechazarCompleta,
  solicitudPuedeValidar,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  ESTADO_SOLICITUD_LABEL,
  almacenFormModalDialogStyle,
  fmtMoney,
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
  onEdit,
  onReabrirOc,
  onMensajesLeidos,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [sol, setSol] = useState(() => (initialSeed ? { ...initialSeed, items: initialSeed.items || [] } : null))
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectorOc, setSelectorOc] = useState(false)
  const [selIds, setSelIds] = useState(() => new Set())
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
  const [ocProgreso, setOcProgreso] = useState('')

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
    border: '#e2e8f0',
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
  const editable = Boolean(permisos?.editar && solicitudAlmacenEditable(sol))
  const puedeEditarTitulo = solicitudTituloEditable(permisos)
  const puedeValidar = solicitudPuedeValidar(sol, permisos)
  const puedeGenerarOc = Boolean(permisos?.puedeGenerarOc) && puedeValidar
  const motivoAprobacion = motivoAprobacionNoDisponible(sol, permisos)
  const puedeEnviar = puedeEnviarSolicitudAlmacen(permisos, sol)
  const motivoEnvio = motivoEnvioNoDisponible(sol, permisos)
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

  const ejecutarAprobar = async (itemIds) => {
    if (!sol) return
    if (!itemIds?.length) {
      setError('Seleccione al menos un proveedor.')
      return
    }
    setBusy(true)
    setOcProgreso(tieneOc ? 'Generando las órdenes pendientes…' : 'Generando orden de compra…')
    setError('')
    try {
      const r = await api.aprobarSolicitud(sol.id, {
        aprobar_todos_pendientes: true,
        item_ids: itemIds,
      })
      setSelectorOc(false)
      onUpdated?.(r)
      const ocs = ordenesDeRespuestaAprobar(r)
      setSol(r)
      if (ocs.length) {
        setAvisoOc({
          sol: r,
          ocs,
          envios: Array.isArray(r.envios_oc) ? r.envios_oc : [],
        })
        setExpedienteOcId(ocs[0].id)
      } else {
        onClose?.()
      }
    } catch (e) {
      setError(e.message)
    } finally {
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
      onClick={() => !busy && !revisionItem && !mapaItem && !avisoOc && !expedienteOcId && !selectorOc && !mensajesAbiertos && onClose?.()}
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
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginBottom: 2 }}>
                {sol?.consecutivo ? `#${sol.consecutivo}` : ''}
                {sol?.oc_parcial || (sol?.estado === 'enviada' && tieneOc)
                  ? ' · OC parcial'
                  : (sol?.estado ? ` · ${ESTADO_SOLICITUD_LABEL[sol.estado]}` : '')}
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
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                    Pendientes: {resumenValidacion.pendiente}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#065f46' }}>
                    Aprobados: {resumenValidacion.aprobado}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef2f2', color: '#991b1b' }}>
                    Rechazados: {resumenValidacion.rechazado}
                  </span>
                </div>
              )}

              {sol.motivo_rechazo && (
                <div style={{
                  fontSize: 'var(--cc-xs)',
                  color: '#991b1b',
                  marginBottom: 10,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, #dc2626 8%, var(--cc-almacen-bg-card, #fff))',
                  border: '1px solid color-mix(in srgb, #dc2626 20%, transparent)',
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
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: p.estado === 'con_oc' ? '#ecfdf5' : '#fffbeb',
                        color: p.estado === 'con_oc' ? '#065f46' : '#92400e',
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
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: '#ecfdf5',
                      color: '#065f46',
                      fontSize: 'var(--cc-xs)',
                      fontWeight: 600,
                    }}
                    >
                      {solicitudOrdenesCompra(sol).length > 1
                        ? `✓ ${solicitudOrdenesCompra(sol).length} OCs generadas (una por proveedor)`
                        : `✓ OC #${solicitudOrdenesCompra(sol)[0]?.numero_oc} generada`}
                    </span>
                  )}
                  {puedeReabrir && (
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, padding: '6px 12px', fontSize: 'var(--cc-sm)' }}
                      disabled={busy}
                      onClick={() => onReabrirOc?.(sol)}
                      title="Agregar insumos adicionales. Si el proveedor es distinto, se genera otra OC."
                      data-testid="reabrir-oc-header"
                    >
                      🔓 Reabrir OC
                    </button>
                  )}
                </div>
              )}

              {/* Garantiza visibilidad aunque el bloque OC no se renderice por flags parciales. */}
              {puedeReabrir && !(tieneOc || (sol.estado === 'aprobada' && sol.orden_compra?.id)) && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    disabled={busy}
                    onClick={() => onReabrirOc?.(sol)}
                    data-testid="reabrir-oc-fallback"
                  >
                    🔓 Reabrir OC
                  </button>
                </div>
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
                  📦 Materiales solicitados ({items.length})
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
                  <div
                    data-testid="solicitud-resumen-proveedores"
                    style={{
                      marginBottom: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: 'var(--cc-xs)',
                      lineHeight: 1.45,
                      color: ui.text,
                    }}
                  >
                    {resumenProveedores.ocs_previstas > 0
                      ? `Se ${tieneOc ? 'relacionan' : 'generarían'} ${resumenProveedores.ocs_previstas} orden${resumenProveedores.ocs_previstas === 1 ? '' : 'es'} de compra: ${resumenProveedores.proveedores.join(', ')}.`
                      : 'Todavía no hay proveedor en las líneas: falta asignar el insumo.'}
                    {resumenProveedores.lineas_sin_insumo > 0 && (
                      <span style={{ color: '#92400e', fontWeight: 700 }}>
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
                    </div>
                  )}
                <SolicitudMaterialesExcelTable
                  items={items}
                  sol={sol}
                  puedeValidar={puedeValidar}
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
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
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
                {puedeReabrir && (
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    disabled={busy}
                    onClick={() => onReabrirOc?.(sol)}
                    title="Agregar insumos adicionales a la misma Orden de Compra"
                  >
                    🔓 Reabrir OC
                  </button>
                )}
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
              {motivoEnvio && (
                <div
                  data-testid="motivo-envio-no-disponible"
                  style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}
                >
                  Solicitar aprobación no está disponible: {motivoEnvio}
                </div>
              )}
              {motivoAprobacion && (
                <div
                  data-testid="motivo-aprobacion-no-disponible"
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    color: '#92400e',
                    fontSize: 'var(--cc-sm)',
                    lineHeight: 1.45,
                  }}
                >
                  Aprobar ítem, rechazar ítem y generar la OC no están disponibles: {motivoAprobacion}
                </div>
              )}

              {puedeRechazarCompleta && (
                <>
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                      Motivo rechazo de la solicitud (si aplica)
                    </label>
                    <input
                      style={{ ...ui.input, marginTop: 4 }}
                      value={motivo}
                      disabled={busy}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{ ...ui.btnPrimary, background: '#dc2626' }}
                      disabled={busy}
                      onClick={rechazar}
                    >
                      ✕ Rechazar solicitud completa
                    </button>
                  </div>
                </>
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

      {selectorOc && (
        <OcProveedoresModal
          grupos={gruposOc.grupos}
          sinInsumoCount={gruposOc.sinInsumoCount}
          verEconomicos={verEconomicos}
          busy={busy}
          onCancel={() => !busy && setSelectorOc(false)}
          onConfirm={(ids) => { void ejecutarAprobar(ids) }}
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
