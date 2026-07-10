import { useCallback, useEffect, useState } from 'react'
import EntradaForm from './EntradaForm'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import { fmtCant, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function EntradasPanel({ permisos, token }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [lista, setLista] = useState([])
  const [creating, setCreating] = useState(false)
  const [expedienteOcId, setExpedienteOcId] = useState(null)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    api.listEntradas().then(setLista).catch((e) => setError(e.message))
  }, [api])

  useEffect(() => { reload() }, [reload])

  if (creating) {
    return (
      <EntradaForm
        permisos={permisos}
        onSaved={() => { setCreating(false); reload() }}
        onCancel={() => setCreating(false)}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📥 Entradas de material</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Registre ingresos contra órdenes de compra con soporte de remisión.
          </div>
        </div>
        {permisos?.crear && (
          <button type="button" style={ui.btnPrimary} onClick={() => setCreating(true)}>
            + Nueva entrada
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>No hay entradas registradas.</div>
      ) : (
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>OC</th>
                <th style={ui.th}>Remisión</th>
                <th style={ui.th} />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const oc = e.almacen_orden_compra || {}
                return (
                  <tr key={e.id}>
                    <td style={ui.td}>{e.fecha_entrada}</td>
                    <td style={ui.td}>#{oc.numero_oc}</td>
                    <td style={ui.td}>{e.remision_nombre ? '✓ Adjunta' : '—'}</td>
                    <td style={ui.td}>
                      <button
                        type="button"
                        style={ui.btnSecondary}
                        onClick={() => setExpedienteOcId(e.orden_compra_id)}
                      >
                        Ver expediente
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {expedienteOcId && (
        <ExpedienteCompraModal
          ocId={expedienteOcId}
          token={token}
          onClose={() => setExpedienteOcId(null)}
        />
      )}
    </div>
  )
}
