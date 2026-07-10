import { useCallback, useEffect, useState } from 'react'
import SolicitudForm from './SolicitudForm'
import {
  ESTADO_SOLICITUD_COLOR,
  ESTADO_SOLICITUD_LABEL,
  fmtCant,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

export default function SolicitudesPanel({ permisos, t, token, contratoId }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    api.listSolicitudes()
      .then((data) => setLista(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => { reload() }, [reload])

  if (creating || editId) {
    return (
      <SolicitudForm
        solicitudId={editId}
        permisos={permisos}
        t={t}
        token={token}
        contratoId={contratoId}
        onSaved={(result) => {
          if (creating && result?.id) {
            setCreating(false)
            setEditId(result.id)
          } else {
            setEditId(null)
            setCreating(false)
            reload()
          }
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
            Genere solicitudes de insumos con ubicación PK-ID, control presupuestal y cotizaciones comparativas.
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
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>#</th>
                <th style={ui.th}>Estado</th>
                <th style={ui.th}>Materiales</th>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th} />
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.id}>
                  <td style={ui.td}>{s.consecutivo}</td>
                  <td style={{ ...ui.td, color: ESTADO_SOLICITUD_COLOR[s.estado], fontWeight: 600 }}>
                    {ESTADO_SOLICITUD_LABEL[s.estado]}
                  </td>
                  <td style={ui.td}>{(s.items || []).length} ítem(s)</td>
                  <td style={ui.td}>{s.created_at?.slice(0, 10)}</td>
                  <td style={ui.td}>
                    <button
                      type="button"
                      style={ui.btnSecondary}
                      onClick={() => setEditId(s.id)}
                    >
                      {s.estado === 'borrador' && permisos?.editar ? 'Editar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
