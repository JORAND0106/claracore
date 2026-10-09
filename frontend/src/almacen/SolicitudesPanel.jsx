import { useCallback, useEffect, useMemo, useState } from 'react'
import SolicitudFormModal from './SolicitudFormModal'
import SolicitudDetalleModal from './SolicitudDetalleModal'
import SolicitudesFiltrosModal from './SolicitudesFiltrosModal'
import SolicitudOcsPdfButton from './SolicitudOcsPdfButton'
import AgruparSolicitudesModal from './AgruparSolicitudesModal'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  solicitudPuedeReabrirOc,
  solicitudPuedeValidar,
  solicitudOrdenesCompra,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
import {
  countSolicitudesFiltrosActivos,
  EMPTY_SOLICITUDES_FILTROS,
  filterSolicitudesLista,
} from './solicitudesFiltros'
import {
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  fmtFechaAlmacenCorta,
  fmtMoney,
  formatEstadoOcMovimiento,
  puedeAnularSolicitud,
  textoAprobacionSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { puedeCrearSolicitudAlmacen, puedeEliminarSolicitudDesarrollador } from './almacenPermisos'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'

export default function SolicitudesPanel({
  permisos, t, token, contratoId, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const verEconomicos = permisos?.verEconomicos === true
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [reabrirOc, setReabrirOc] = useState(false)
  const [detalleId, setDetalleId] = useState(null)
  const [detalleTab, setDetalleTab] = useState('portada')
  const [anularTarget, setAnularTarget] = useState(null)
  const [anularBusy, setAnularBusy] = useState(false)
  const [eliminarDevTarget, setEliminarDevTarget] = useState(null)
  const [eliminarDevBusy, setEliminarDevBusy] = useState(false)
  const [filtros, setFiltros] = useState(() => ({ ...EMPTY_SOLICITUDES_FILTROS }))
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [agrupar, setAgrupar] = useState(null)
  const [agruparBusy, setAgruparBusy] = useState(false)
  const [agruparError, setAgruparError] = useState('')
  const [agruparResumen, setAgruparResumen] = useState('')

  const PAGE_SIZE = 80
  const puedeEliminarDev = puedeEliminarSolicitudDesarrollador(permisos)

  const listaFiltrada = useMemo(
    () => filterSolicitudesLista(lista, filtros),
    [lista, filtros],
  )
  const filtrosActivos = countSolicitudesFiltrosActivos(filtros)

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    return api.listSolicitudes(undefined, { resumen: true, limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        setLista(page.items || [])
        setHasMore(Boolean(page.has_more))
        setTotalCount(Number(page.total) || (page.items || []).length)
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        onDataLoaded?.()
      })
  }, [api, onDataLoaded])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    api.listSolicitudes(undefined, { resumen: true, limit: PAGE_SIZE, offset: lista.length })
      .then((page) => {
        const next = page.items || []
        setLista((prev) => {
          const seen = new Set(prev.map((s) => s.id))
          return [...prev, ...next.filter((s) => !seen.has(s.id))]
        })
        setHasMore(Boolean(page.has_more))
        setTotalCount(Number(page.total) || 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMore(false))
  }, [api, hasMore, lista.length, loadingMore])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (refreshSignal > 0) {
      if (!creating && !editId && !detalleId) reload()
      else onDataLoaded?.()
    }
  }, [refreshSignal, creating, editId, detalleId, reload, onDataLoaded])

  const abrirDetalle = (s, tab = 'portada') => {
    setDetalleTab(tab)
    setDetalleId(s.id)
  }

  const ejecutarAnular = async () => {
    if (!anularTarget) return
    setAnularBusy(true)
    try {
      await api.anularSolicitud(anularTarget.id)
      setAnularTarget(null)
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setAnularBusy(false)
    }
  }

  const ejecutarEliminarDev = async () => {
    if (!eliminarDevTarget) return
    setEliminarDevBusy(true)
    try {
      await api.eliminarSolicitudDesarrollador(eliminarDevTarget.id)
      setEliminarDevTarget(null)
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setEliminarDevBusy(false)
    }
  }

  const abrirAgrupar = async () => {
    setAgruparBusy(true)
    setAgruparError('')
    setAgruparResumen('')
    try {
      const vista = await api.vistaPreviaAgruparSolicitudes()
      setAgrupar(vista)
    } catch (e) {
      setError(e.message)
    } finally {
      setAgruparBusy(false)
    }
  }

  const confirmarAgrupar = async (body) => {
    setAgruparBusy(true)
    setAgruparError('')
    try {
      const r = await api.agruparSolicitudes(body)
      setAgrupar(r)
      setAgruparResumen(r?.resumen || 'Listo.')
      reload()
    } catch (e) {
      setAgruparError(e.message)
    } finally {
      setAgruparBusy(false)
    }
  }

  const formModalOpen = creating || editId

  const cerrarFormModal = () => {
    setEditId(null)
    setCreating(false)
    setReabrirOc(false)
  }

  const abrirReabrirOc = (s) => {
    setDetalleId(null)
    setCreating(false)
    setReabrirOc(true)
    setEditId(s.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📋 Solicitudes de materiales</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y trazabilidad por línea.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {permisos?.editar && (
            <button
              type="button"
              style={ui.btnSecondary}
              data-testid="agrupar-solicitudes"
              disabled={agruparBusy}
              onClick={abrirAgrupar}
              title="Reúne las solicitudes sin OC por proveedor"
            >
              Agrupar
            </button>
          )}
          <button
            type="button"
            style={ui.btnSecondary}
            onClick={() => setFiltrosOpen(true)}
            title="Filtrar solicitudes"
          >
            🔎 Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </button>
          {(permisos?.puedeNuevaSolicitud ?? puedeCrearSolicitudAlmacen(permisos)) && (
            <button type="button" style={ui.btnPrimary} onClick={() => { setReabrirOc(false); setCreating(true) }}>
              + Nueva solicitud
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: ui.textMuted }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          No hay solicitudes registradas.
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          Ninguna solicitud coincide con los filtros.
          {' '}
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '4px 10px', fontSize: 'var(--cc-caption)' }}
            onClick={() => setFiltros({ ...EMPTY_SOLICITUDES_FILTROS })}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
          <table
            className="cc-almacen-responsive-table"
            style={{ ...ui.sheetTable, minWidth: 1180, tableLayout: 'fixed' }}
          >
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 44 }}>#</th>
                <th style={{ ...ui.th, width: '24%' }}>Título</th>
                <th style={{ ...ui.th, width: 96 }}>Estado</th>
                <th style={{ ...ui.th, width: '12%' }}>Solicitante</th>
                <th style={{ ...ui.th, width: '12%' }}>Aprobación</th>
                <th style={{ ...ui.th, textAlign: 'right', width: 56 }}>Ítems</th>
                {verEconomicos && (
                  <th style={{ ...ui.th, textAlign: 'right', width: 120 }}>Valor</th>
                )}
                <th style={{ ...ui.th, width: 96 }}>Fecha</th>
                <th style={{ ...ui.th, width: 56 }}>OC</th>
                <th style={{ ...ui.th, width: 92 }} title="Entrada vs cantidad de la OC">Entrada</th>
                <th style={{ ...ui.th, width: 92 }} title="Salida vs cantidad recibida en entrada">Salida</th>
                <th style={{ ...ui.th, width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((s) => {
                const nItems = s.items_count != null ? s.items_count : (s.items || []).length
                const sinInsumo = Number(s.lineas_sin_insumo) > 0
                const vacia = nItems === 0
                const fondo = sinInsumo ? '#e7e5e4' : 'transparent'
                const fondoHover = sinInsumo ? '#d6d3d1' : ui.accentSoft
                const cellEllipsis = {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }
                return (
                <tr
                  key={s.id}
                  data-testid={sinInsumo ? 'solicitud-sin-insumo' : undefined}
                  data-lineas-sin-insumo={sinInsumo ? String(s.lineas_sin_insumo) : undefined}
                  style={{
                    cursor: 'pointer',
                    background: fondo,
                    boxShadow: sinInsumo ? 'inset 4px 0 0 #57534e' : undefined,
                  }}
                  onClick={() => abrirDetalle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = fondoHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = fondo }}
                >
                  <td style={ui.tdNum} data-label="#">{s.consecutivo}</td>
                  <td
                    style={{ ...ui.td, fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.35 }}
                    data-label="Título"
                    title={s.titulo?.trim() || `Solicitud #${s.consecutivo}`}
                  >
                    {Number(s.mensajes_no_leidos) > 0 && (
                      <span
                        data-testid="solicitud-lista-no-leidos"
                        title={`${s.mensajes_no_leidos} mensaje(s) sin leer`}
                        style={{
                          marginLeft: 6,
                          background: '#dc2626',
                          color: '#fff',
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        {s.mensajes_no_leidos}
                      </span>
                    )}
                    {s.titulo?.trim() || `Solicitud #${s.consecutivo}`}
                    {vacia && (
                      <span
                        data-testid="solicitud-vacia"
                        title="Esta solicitud quedó sin líneas al agrupar y se conserva"
                        style={{
                          marginLeft: 6,
                          background: '#f5f5f4',
                          color: '#44403c',
                          border: '1px solid #a8a29e',
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        Vacía
                      </span>
                    )}
                    {sinInsumo && (
                      <span
                        title={`${s.lineas_sin_insumo} línea(s) sin insumo asignado`}
                        style={{
                          marginLeft: 6,
                          background: '#57534e',
                          color: '#fff',
                          borderRadius: 10,
                          padding: '0 6px',
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                        }}
                      >
                        Sin insumo · {s.lineas_sin_insumo}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      color: ESTADO_SOLICITUD_COLOR[s.estado],
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                    data-label="Estado"
                  >
                    {s.oc_parcial || (s.estado === 'enviada' && solicitudTieneOrdenCompra(s))
                      ? 'OC parcial'
                      : ESTADO_SOLICITUD_LABEL[s.estado]}
                  </td>
                  <td
                    style={{ ...ui.td, ...cellEllipsis }}
                    data-label="Solicitante"
                    title={s.solicitante_nombre || undefined}
                  >
                    {s.solicitante_nombre || '—'}
                  </td>
                  <td
                    style={{ ...ui.td, ...cellEllipsis }}
                    data-label="Aprobación"
                    title={textoAprobacionSolicitud(s) || undefined}
                  >
                    {textoAprobacionSolicitud(s)}
                  </td>
                  <td style={ui.tdNum} data-label="Ítems">{nItems}</td>
                  {verEconomicos && (
                    <td
                      style={{ ...ui.tdNum, whiteSpace: 'nowrap' }}
                      data-label="Valor"
                      data-testid="solicitud-lista-valor"
                    >
                      {s.valor_solicitud == null ? '—' : fmtMoney(s.valor_solicitud)}
                    </td>
                  )}
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="Fecha">
                    {fmtFechaAlmacenCorta(s.created_at)}
                  </td>
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="OC" onClick={(e) => e.stopPropagation()}>
                    {(s.estado === 'aprobada' || solicitudTieneOrdenCompra(s)) && permisos?.exportar
                      && solicitudOrdenesCompra(s).length > 0 ? (
                        <SolicitudOcsPdfButton
                          solicitudId={s.id}
                          ordenes={solicitudOrdenesCompra(s)}
                          compact
                          puedeExportar
                        />
                      ) : '—'}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      fontWeight: s.estado_entrada ? 700 : 400,
                      whiteSpace: 'nowrap',
                      color: s.estado_entrada === 'total'
                        ? '#15803d'
                        : s.estado_entrada === 'parcial'
                          ? '#b45309'
                          : ui.textMuted,
                    }}
                    data-label="Entrada"
                    data-testid="solicitud-estado-entrada"
                  >
                    {formatEstadoOcMovimiento(s.estado_entrada)}
                  </td>
                  <td
                    style={{
                      ...ui.td,
                      fontWeight: s.estado_salida ? 700 : 400,
                      whiteSpace: 'nowrap',
                      color: s.estado_salida === 'total'
                        ? '#15803d'
                        : s.estado_salida === 'parcial'
                          ? '#b45309'
                          : ui.textMuted,
                    }}
                    data-label="Salida"
                    data-testid="solicitud-estado-salida"
                  >
                    {formatEstadoOcMovimiento(s.estado_salida)}
                  </td>
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="Acciones" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
                      <AlmacenTrazabilidadButton
                        token={token}
                        theme={t}
                        ui={ui}
                        compact
                        entidadTipo="solicitud"
                        entidadId={s.id}
                        titulo={`Almacén · Solicitud #${s.consecutivo}${s.titulo?.trim() ? ` · ${s.titulo.trim()}` : ''}`}
                      />
                      {solicitudPuedeValidar(s, permisos) && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '4px 8px', fontSize: 'var(--cc-caption)', minHeight: 0 }}
                          onClick={() => abrirDetalle(s, 'portada')}
                        >
                          Revisar
                        </button>
                      )}
                      {solicitudPuedeReabrirOc(s, permisos) && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '4px 8px', fontSize: 'var(--cc-caption)', minHeight: 0 }}
                          title="Agregar insumos adicionales. Si el proveedor es distinto, se genera otra OC."
                          data-testid="reabrir-oc-grid"
                          onClick={() => abrirReabrirOc(s)}
                        >
                          Reabrir OC
                        </button>
                      )}
                      {puedeEliminarDev && (
                        <button
                          type="button"
                          style={{
                            ...ui.btnSecondary,
                            padding: '4px 8px',
                            fontSize: 'var(--cc-caption)',
                            minHeight: 0,
                            color: '#7c2d12',
                            borderColor: '#7c2d1266',
                          }}
                          title="Eliminación permanente (solo Desarrollador)"
                          onClick={() => setEliminarDevTarget(s)}
                        >
                          Eliminar
                        </button>
                      )}
                      {puedeAnularSolicitud(s, permisos) && (
                        <button
                          type="button"
                          style={{
                            ...ui.btnSecondary,
                            padding: '4px 8px',
                            fontSize: 'var(--cc-caption)',
                            minHeight: 0,
                            color: '#dc2626',
                            borderColor: '#dc262666',
                          }}
                          onClick={() => setAnularTarget(s)}
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && !filtrosActivos && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            type="button"
            style={ui.btnSecondary}
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? 'Cargando…' : `Cargar más (${lista.length} de ${totalCount || '…'})`}
          </button>
        </div>
      )}

      {!loading && !hasMore && totalCount > PAGE_SIZE && !filtrosActivos && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Mostrando {lista.length} de {totalCount} solicitudes
        </div>
      )}

      {agrupar && (
        <AgruparSolicitudesModal
          vista={agrupar}
          verEconomicos={verEconomicos}
          busy={agruparBusy}
          error={agruparError}
          resumen={agruparResumen}
          onCancel={() => {
            setAgrupar(null)
            setAgruparError('')
            setAgruparResumen('')
          }}
          onConfirm={confirmarAgrupar}
        />
      )}

      {filtrosOpen && (
        <SolicitudesFiltrosModal
          theme={t}
          filtros={filtros}
          onClose={() => setFiltrosOpen(false)}
          onApply={(next) => {
            setFiltros({ ...EMPTY_SOLICITUDES_FILTROS, ...next })
            setFiltrosOpen(false)
          }}
        />
      )}

      {formModalOpen && (
        <SolicitudFormModal
          solicitudId={editId}
          permisos={permisos}
          t={t}
          token={token}
          contratoId={contratoId}
          modoReabrirOc={reabrirOc}
          onClose={cerrarFormModal}
          onSaved={(result) => {
            if (reabrirOc) {
              cerrarFormModal()
              reload()
              return
            }
            if (result?.estado === 'borrador' && result?.id) {
              setCreating(false)
              setEditId(result.id)
              reload()
              return
            }
            cerrarFormModal()
            reload()
          }}
        />
      )}

      {detalleId && (
        <SolicitudDetalleModal
          solicitudId={detalleId}
          initialSeed={lista.find((s) => String(s.id) === String(detalleId)) || null}
          initialTab={detalleTab}
          permisos={permisos}
          token={token}
          t={t}
          contratoId={contratoId}
          onMensajesLeidos={(n) => {
            setLista((prev) => prev.map((s) => (
              String(s.id) === String(detalleId) ? { ...s, mensajes_no_leidos: n } : s
            )))
          }}
          onClose={() => setDetalleId(null)}
          onUpdated={() => {
            setDetalleId(null)
            reload()
          }}
          onEdit={(sol) => {
            setDetalleId(null)
            setReabrirOc(false)
            setEditId(sol?.id || detalleId)
            setCreating(false)
          }}
          onReabrirOc={(sol) => abrirReabrirOc(sol || { id: detalleId })}
        />
      )}

      {anularTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Anular solicitud"
          confirmar="Anular"
          cancelar="Cancelar"
          procesando={anularBusy}
          onCancel={() => !anularBusy && setAnularTarget(null)}
          onConfirm={ejecutarAnular}
        >
          {anularTarget.estado === 'borrador'
            ? `¿Eliminar la solicitud #${anularTarget.consecutivo} en borrador? Esta acción no se puede deshacer.`
            : `¿Anular la solicitud #${anularTarget.consecutivo} enviada? Quedará marcada como rechazada.`}
        </CcConfirmModal>
      )}

      {eliminarDevTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Eliminar solicitud (Desarrollador)"
          confirmar="Eliminar permanentemente"
          cancelar="Cancelar"
          procesando={eliminarDevBusy}
          onCancel={() => !eliminarDevBusy && setEliminarDevTarget(null)}
          onConfirm={ejecutarEliminarDev}
        >
          {`¿Eliminar permanentemente la solicitud #${eliminarDevTarget.consecutivo} y todos sus datos asociados (OC, entradas, salidas)? Esta acción es irreversible y solo está disponible para Desarrollador.`}
        </CcConfirmModal>
      )}
    </div>
  )
}
