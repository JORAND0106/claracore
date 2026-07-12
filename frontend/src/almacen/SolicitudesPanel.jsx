import { useCallback, useEffect, useState } from 'react'
import SolicitudForm from './SolicitudForm'
import SolicitudRevisionModal from './SolicitudRevisionModal'
import OrdenCompraPdfClip from './OrdenCompraPdfClip'
import CcConfirmModal from '../components/CcConfirmModal'
import {
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  puedeAnularSolicitud,
  textoAprobacionSolicitud,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

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
  const [revisionId, setRevisionId] = useState(null)
  const [anularTarget, setAnularTarget] = useState(null)
  const [anularBusy, setAnularBusy] = useState(false)

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
      if (!creating && !editId) reload()
      else onDataLoaded?.()
    }
  }, [refreshSignal, creating, editId, reload, onDataLoaded])

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

  if (creating || editId) {
    return (
      <SolicitudForm
        solicitudId={editId}
        permisos={permisos}
        t={t}
        token={token}
        contratoId={contratoId}
        onSaved={(result) => {
          if (result?.estado === 'borrador' && result?.id) {
            setCreating(false)
            setEditId(result.id)
            return
          }
          setEditId(null)
          setCreating(false)
          reload()
        }}
        onCancel={() => { setEditId(null); setCreating(false) }}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📋 Solicitudes de materiales</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y trazabilidad por línea.
          </div>
        </div>
        {permisos?.editar && (
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
                <tr key={s.id}>
                  <td style={ui.td} data-label="#">{s.consecutivo}</td>
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
                  <td style={ui.td} data-label="Fecha">{s.created_at?.slice(0, 10)}</td>
                  <td style={ui.td} data-label="OC">
                    {s.estado === 'aprobada' && s.orden_compra?.id ? (
                      <OrdenCompraPdfClip ordenCompra={s.orden_compra} compact />
                    ) : '—'}
                  </td>
                  <td style={ui.td} data-label="Acciones">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={ui.btnSecondary}
                        onClick={() => setEditId(s.id)}
                      >
                        {s.estado === 'borrador' && permisos?.editar ? 'Editar' : 'Ver'}
                      </button>
                      {s.estado === 'enviada' && permisos?.validar && (
                        <button
                          type="button"
                          style={{ ...ui.btnPrimary, padding: '6px 10px', fontSize: 'var(--cc-xs)' }}
                          onClick={() => setRevisionId(s.id)}
                        >
                          Revisar
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

      {revisionId && (
        <SolicitudRevisionModal
          solicitudId={revisionId}
          permisos={permisos}
          token={token}
          t={t}
          contratoId={contratoId}
          onClose={() => setRevisionId(null)}
          onUpdated={() => {
            setRevisionId(null)
            reload()
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
    </div>
  )
}
