import { useCallback, useEffect, useMemo, useState } from 'react'
import SolicitudFormModal from './SolicitudFormModal'
import SolicitudDetalleModal from './SolicitudDetalleModal'
import SolicitudesFiltrosModal from './SolicitudesFiltrosModal'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  solicitudPuedeReabrirOc,
  solicitudPuedeValidar,
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
  puedeAnularSolicitud,
  textoAprobacionSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { puedeEliminarSolicitudDesarrollador } from './almacenPermisos'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'

export default function SolicitudesPanel({
  permisos, t, token, contratoId, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📋 Solicitudes de materiales</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y trazabilidad por línea.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            style={ui.btnSecondary}
            onClick={() => setFiltrosOpen(true)}
            title="Filtrar solicitudes"
          >
            🔎 Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </button>
          {permisos?.crear && (
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
          <table className="cc-almacen-responsive-table" style={{ ...ui.sheetTable, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 56 }}>#</th>
                <th style={ui.th}>Título</th>
                <th style={{ ...ui.th, width: 110 }}>Estado</th>
                <th style={ui.th}>Solicitante</th>
                <th style={ui.th}>Aprobación</th>
                <th style={{ ...ui.th, textAlign: 'right', width: 88 }}>Ítems</th>
                <th style={{ ...ui.th, width: 100 }}>Fecha</th>
                <th style={{ ...ui.th, width: 72 }}>OC</th>
                <th style={{ ...ui.th, width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((s) => {
                const nItems = s.items_count != null ? s.items_count : (s.items || []).length
                return (
                <tr
                  key={s.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => abrirDetalle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = ui.accentSoft }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={ui.tdNum} data-label="#">{s.consecutivo}</td>
                  <td style={{ ...ui.td, fontWeight: 600 }} data-label="Título">
                    {s.titulo?.trim() || `Solicitud #${s.consecutivo}`}
                  </td>
                  <td style={{ ...ui.td, color: ESTADO_SOLICITUD_COLOR[s.estado], fontWeight: 700 }} data-label="Estado">
                    {ESTADO_SOLICITUD_LABEL[s.estado]}
                  </td>
                  <td style={ui.td} data-label="Solicitante">
                    {s.solicitante_nombre || '—'}
                  </td>
                  <td style={ui.td} data-label="Aprobación">
                    {textoAprobacionSolicitud(s)}
                  </td>
                  <td style={ui.tdNum} data-label="Ítems">{nItems}</td>
                  <td style={{ ...ui.td, whiteSpace: 'nowrap' }} data-label="Fecha">
                    {fmtFechaAlmacenCorta(s.created_at)}
                  </td>
                  <td style={ui.td} data-label="OC" onClick={(e) => e.stopPropagation()}>
                    {(s.estado === 'aprobada' || solicitudTieneOrdenCompra(s)) && s.orden_compra?.id && permisos?.exportar ? (
                      <OrdenCompraPdfClip ordenCompra={s.orden_compra} compact puedeExportar />
                    ) : '—'}
                  </td>
                  <td style={ui.td} data-label="Acciones" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
                          title="Agregar insumos adicionales a la misma Orden de Compra"
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
