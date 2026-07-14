import { useCallback, useEffect, useState } from 'react'
import SolicitudFormModal from './SolicitudFormModal'
import SolicitudDetalleModal from './SolicitudDetalleModal'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  solicitudPuedeValidar,
  solicitudTieneOrdenCompra,
} from './solicitudDetalleHelpers'
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

export default function SolicitudesPanel({
  permisos, t, token, contratoId, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [detalleId, setDetalleId] = useState(null)
  const [detalleTab, setDetalleTab] = useState('portada')
  const [anularTarget, setAnularTarget] = useState(null)
  const [anularBusy, setAnularBusy] = useState(false)
  const [eliminarDevTarget, setEliminarDevTarget] = useState(null)
  const [eliminarDevBusy, setEliminarDevBusy] = useState(false)

  const puedeEliminarDev = puedeEliminarSolicitudDesarrollador(permisos)

  const reload = useCallback(() => {
    setLoading(true)
    return api.listSolicitudes()
      .then((data) => setLista(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        onDataLoaded?.()
      })
  }, [api, onDataLoaded])

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📋 Solicitudes de materiales</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y trazabilidad por línea.
          </div>
        </div>
        {permisos?.crear && (
          <button type="button" style={ui.btnPrimary} onClick={() => setCreating(true)}>
            + Nueva solicitud
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: ui.textMuted }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          No hay solicitudes registradas.
        </div>
      ) : (
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }} className="cc-almacen-table-scroll">
          <table className="cc-almacen-responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>#</th>
                <th style={ui.th}>Título</th>
                <th style={ui.th}>Estado</th>
                <th style={ui.th}>Solicitante</th>
                <th style={ui.th}>Aprobación</th>
                <th style={ui.th}>Materiales</th>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>OC</th>
                <th style={ui.th} />
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr
                  key={s.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => abrirDetalle(s)}
                >
                  <td style={ui.td} data-label="#">{s.consecutivo}</td>
                  <td style={{ ...ui.td, fontWeight: 600, maxWidth: 220 }} data-label="Título">
                    {s.titulo?.trim() || `Solicitud #${s.consecutivo}`}
                  </td>
                  <td style={{ ...ui.td, color: ESTADO_SOLICITUD_COLOR[s.estado], fontWeight: 600 }} data-label="Estado">
                    {ESTADO_SOLICITUD_LABEL[s.estado]}
                  </td>
                  <td style={{ ...ui.td, fontSize: 'var(--cc-xs)' }} data-label="Solicitante">
                    {s.solicitante_nombre || '—'}
                  </td>
                  <td style={{ ...ui.td, fontSize: 'var(--cc-xs)', maxWidth: 220 }} data-label="Aprobación">
                    {textoAprobacionSolicitud(s)}
                  </td>
                  <td style={ui.td} data-label="Materiales">{(s.items || []).length} ítem(s)</td>
                  <td style={ui.td} data-label="Fecha">{fmtFechaAlmacenCorta(s.created_at)}</td>
                  <td style={ui.td} data-label="OC" onClick={(e) => e.stopPropagation()}>
                    {(s.estado === 'aprobada' || solicitudTieneOrdenCompra(s)) && s.orden_compra?.id && permisos?.exportar ? (
                      <OrdenCompraPdfClip ordenCompra={s.orden_compra} compact puedeExportar />
                    ) : '—'}
                  </td>
                  <td style={ui.td} data-label="Acciones" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {solicitudPuedeValidar(s, permisos) && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '6px 10px', fontSize: 'var(--cc-xs)' }}
                          onClick={() => abrirDetalle(s, 'portada')}
                        >
                          Revisar
                        </button>
                      )}
                      {puedeEliminarDev && (
                        <button
                          type="button"
                          style={{
                            ...ui.btnSecondary,
                            padding: '6px 10px',
                            fontSize: 'var(--cc-xs)',
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
                            padding: '6px 10px',
                            fontSize: 'var(--cc-xs)',
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formModalOpen && (
        <SolicitudFormModal
          solicitudId={editId}
          permisos={permisos}
          t={t}
          token={token}
          contratoId={contratoId}
          onClose={() => { setEditId(null); setCreating(false) }}
          onSaved={(result) => {
            if (result?.estado === 'borrador' && result?.id) {
              setCreating(false)
              setEditId(result.id)
              reload()
              return
            }
            setEditId(null)
            setCreating(false)
            reload()
          }}
        />
      )}

      {detalleId && (
        <SolicitudDetalleModal
          solicitudId={detalleId}
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
            setEditId(sol?.id || detalleId)
            setCreating(false)
          }}
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
