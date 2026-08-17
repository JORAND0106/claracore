import { useCallback, useEffect, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import EntradaFormModal from './EntradaFormModal'
import DespachadorModal from './DespachadorModal'
import DevolucionFormModal from './DevolucionFormModal'
import EntradaDetalleModal from './EntradaDetalleModal'
import { puedeRegistrarEntradaAlmacen, puedeVerAlertasEntrada } from './almacenPermisos'
import { invalidateSalidasCache } from './salidasListCache'
import {
  formatEntradaNumero,
  formatEntradaCantidadGrilla,
  formatEntradaSaldoOcDespuesGrilla,
  fmtFechaAlmacenSolo,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

const TIPO_LABEL = {
  disposicion: 'Disposición',
  recibo: 'Recibo',
}

export default function EntradasPanel({
  permisos, token, t, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const verAlertas = puedeVerAlertasEntrada(permisos)
  const puedeEntrada = puedeRegistrarEntradaAlmacen(permisos)
  const puedeEliminar = Boolean(permisos?.editar)
  const [lista, setLista] = useState([])
  const [creating, setCreating] = useState(false)
  const [despachadorOpen, setDespachadorOpen] = useState(false)
  const [devolucionOpen, setDevolucionOpen] = useState(false)
  const [detalleId, setDetalleId] = useState(null)
  const [error, setError] = useState('')
  const [eliminandoId, setEliminandoId] = useState(null)
  const [eliminarTarget, setEliminarTarget] = useState(null)

  const solicitarEliminar = (e, entrada) => {
    e.stopPropagation()
    setEliminarTarget(entrada)
  }

  const ejecutarEliminar = async () => {
    if (!eliminarTarget) return
    const entrada = eliminarTarget
    setEliminandoId(entrada.id)
    setError('')
    try {
      await api.deleteEntrada(entrada.id)
      if (detalleId === entrada.id) setDetalleId(null)
      setEliminarTarget(null)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setEliminandoId(null)
    }
  }

  const reload = useCallback(() => api.listEntradas()
    .then(setLista)
    .catch((e) => setError(e.message))
    .finally(() => onDataLoaded?.()), [api, onDataLoaded])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (refreshSignal > 0) {
      if (!creating && !despachadorOpen && !devolucionOpen) reload()
      else onDataLoaded?.()
    }
  }, [refreshSignal, creating, despachadorOpen, devolucionOpen, reload, onDataLoaded])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📥 Entradas de material</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Registre ingresos contra órdenes de compra con soporte de remisión o disposición.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {permisos?.crear && (
            <button type="button" style={ui.btnSecondary} onClick={() => setDevolucionOpen(true)}>
              ↩️ Devolución
            </button>
          )}
          {permisos?.crear && (
            <button type="button" style={ui.btnSecondary} onClick={() => setDespachadorOpen(true)}>
              🚚 Despachador
            </button>
          )}
          {puedeEntrada && (
            <button type="button" style={ui.btnPrimary} onClick={() => setCreating(true)}>
              + Nueva entrada
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>No hay entradas registradas.</div>
      ) : (
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }} className="cc-almacen-table-scroll">
          <table className="cc-almacen-responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>N.º</th>
                <th style={ui.th}>Fecha</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Documento</th>
                <th style={ui.th}>OC</th>
                <th style={ui.th}>Recibido en entrada</th>
                <th style={ui.th}>Saldo OC tras entrada</th>
                <th style={ui.th}>Proveedor</th>
                <th style={ui.th}>Usuario</th>
                {verAlertas && <th style={{ ...ui.th, width: 40, textAlign: 'center' }}>⚠</th>}
                <th style={{ ...ui.th, width: 72, textAlign: 'center' }}>PDF</th>
                {puedeEliminar && <th style={{ ...ui.th, width: 44, textAlign: 'center' }}> </th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const oc = e.almacen_orden_compra || {}
                const tienePdf = Boolean(e.disposicion_pdf_blob_path)
                return (
                  <tr
                    key={e.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDetalleId(e.id)}
                    title="Ver resumen"
                  >
                    <td style={{ ...ui.td, fontWeight: 700 }} data-label="N.º">{formatEntradaNumero(e)}</td>
                    <td style={ui.td} data-label="Fecha">{fmtFechaAlmacenSolo(e.fecha_entrada)}</td>
                    <td style={ui.td} data-label="Tipo">{TIPO_LABEL[e.tipo] || e.tipo || 'Recibo'}</td>
                    <td style={ui.td} data-label="Documento">{e.numero_documento || (e.remision_nombre ? '✓ Remisión' : '—')}</td>
                    <td style={ui.td} data-label="OC">#{oc.numero_oc || '—'}</td>
                    <td style={ui.td} data-label="Recibido en entrada" title={formatEntradaCantidadGrilla(e)}>
                      {formatEntradaCantidadGrilla(e)}
                    </td>
                    <td style={ui.td} data-label="Saldo OC tras entrada" title={formatEntradaSaldoOcDespuesGrilla(e)}>
                      {formatEntradaSaldoOcDespuesGrilla(e)}
                    </td>
                    <td style={ui.td} data-label="Proveedor">{e.proveedor_nombre || '—'}</td>
                    <td style={ui.td} data-label="Usuario">{e.usuario_nombre || '—'}</td>
                    {verAlertas && (
                      <td style={{ ...ui.td, textAlign: 'center', color: '#d97706' }} data-label="Alerta" title={e.alerta_silenciosa_detalle || ''}>
                        {e.alerta_silenciosa_detalle ? '⚠' : '—'}
                      </td>
                    )}
                    <td style={{ ...ui.td, textAlign: 'center' }} data-label="PDF" onClick={(ev) => ev.stopPropagation()}>
                      {tienePdf ? (
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            type="button"
                            title="Ver PDF POS"
                            aria-label="Ver PDF POS"
                            style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-md)' }}
                            onClick={() => api.openDisposicionPdf(e.id).catch((err) => setError(err.message))}
                          >
                            📄
                          </button>
                          <button
                            type="button"
                            title="Imprimir PDF POS"
                            aria-label="Imprimir PDF POS"
                            style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-md)' }}
                            onClick={() => api.printDisposicionPdf(e.id).catch((err) => setError(err.message))}
                          >
                            🖨️
                          </button>
                        </span>
                      ) : (
                        <span style={{ color: ui.textMuted }}>—</span>
                      )}
                    </td>
                    {puedeEliminar && (
                      <td style={{ ...ui.td, textAlign: 'center' }} data-label="Eliminar" onClick={(ev) => ev.stopPropagation()}>
                        <button
                          type="button"
                          title="Eliminar entrada"
                          aria-label="Eliminar entrada"
                          disabled={eliminandoId === e.id}
                          style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-md)', color: '#b91c1c' }}
                          onClick={(ev) => solicitarEliminar(ev, e)}
                        >
                          {eliminandoId === e.id ? '…' : '🗑️'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {despachadorOpen && (
        <DespachadorModal
          permisos={permisos}
          token={token}
          contratoId={permisos?.contratoId}
          theme={t}
          onClose={() => setDespachadorOpen(false)}
          onSaved={() => reload()}
        />
      )}

      {devolucionOpen && (
        <DevolucionFormModal
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
          onClose={() => setDevolucionOpen(false)}
          onSaved={() => {
            setDevolucionOpen(false)
            invalidateSalidasCache(permisos?.contratoId)
            reload()
          }}
        />
      )}

      {creating && (
        <EntradaFormModal
          permisos={permisos}
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload() }}
        />
      )}

      {detalleId && (
        <EntradaDetalleModal
          entradaId={detalleId}
          token={token}
          contratoId={permisos?.contratoId}
          theme={t}
          permisos={permisos}
          onClose={() => setDetalleId(null)}
        />
      )}

      {eliminarTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Eliminar entrada"
          confirmar="Eliminar"
          cancelar="Cancelar"
          procesando={eliminandoId === eliminarTarget.id}
          onCancel={() => !eliminandoId && setEliminarTarget(null)}
          onConfirm={ejecutarEliminar}
        >
          {(() => {
            const nEnt = formatEntradaNumero(eliminarTarget)
            const doc = eliminarTarget.numero_documento ? ` · doc. ${eliminarTarget.numero_documento}` : ''
            return (
              <>
                ¿Eliminar la entrada {nEnt}{doc}?
                <div style={{ marginTop: 10, color: 'inherit', opacity: 0.9 }}>
                  Si era el último consecutivo, ese número quedará disponible para el siguiente registro.
                </div>
              </>
            )
          })()}
        </CcConfirmModal>
      )}
    </div>
  )
}
