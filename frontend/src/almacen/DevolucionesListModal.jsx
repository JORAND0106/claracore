import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import CcConfirmModal from '../components/CcConfirmModal'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import DevolucionFormModal from './DevolucionFormModal'
import {
  fmtCant,
  fmtFechaAlmacen,
  formatSalidaNumero,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

function formatDevolucionNumero(d) {
  if (!d) return '—'
  if (d.codigo) return d.codigo
  const n = d.numero_devolucion
  if (n == null || n === '') return '—'
  return `Dev-${String(n).padStart(5, '0')}`
}

/**
 * Punto único de devoluciones: listado + eliminar + registrar nueva.
 * Filtra por salidaId cuando se abre desde la columna Devuelto de Salidas.
 */
export default function DevolucionesListModal({
  t,
  token,
  permisos,
  salidaId = null,
  onClose,
  onChanged,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const puedeEliminar = Boolean(permisos?.editar)
  const puedeCrear = Boolean(permisos?.crear)
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [eliminarTarget, setEliminarTarget] = useState(null)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [nuevaOpen, setNuevaOpen] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    return api.listDevoluciones()
      .then((rows) => {
        const all = Array.isArray(rows) ? rows : []
        if (salidaId != null) {
          setLista(all.filter((d) => Number(d.salida_id) === Number(salidaId)))
        } else {
          setLista(all)
        }
      })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false))
  }, [api, salidaId])

  useEffect(() => { reload() }, [reload])

  const titulo = useMemo(() => {
    if (salidaId != null) return 'Devoluciones de la salida'
    return 'Devoluciones'
  }, [salidaId])

  const ejecutarEliminar = async () => {
    if (!eliminarTarget) return
    const target = eliminarTarget
    setEliminandoId(target.id)
    setError('')
    try {
      await api.deleteDevolucion(target.id)
      setEliminarTarget(null)
      await reload()
      onChanged?.({ salidaId: target.salida_id, devolucionId: target.id })
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setEliminandoId(null)
    }
  }

  const onNuevaSaved = () => {
    setNuevaOpen(false)
    reload()
    onChanged?.({ created: true })
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="devoluciones-list-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483000,
          background: 'rgba(15,23,42,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !nuevaOpen) onClose?.()
        }}
      >
        <div
          style={{
            ...ui.card,
            width: 'min(920px, 100%)',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >          <CcModalBrandHeader theme={t} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              padding: '14px 16px',
              borderBottom: `1px solid ${ui.border || '#e2e8f0'}`,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <div id="devoluciones-list-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
                ↩️ {titulo}
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
                Consulte devoluciones registradas o registre una nueva contra una salida.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {puedeCrear && (
                <button
                  type="button"
                  style={ui.btnPrimary}
                  onClick={() => setNuevaOpen(true)}
                  title="Registrar una nueva devolución de material"
                >
                  + Nueva devolución
                </button>
              )}
              <button type="button" style={ui.btnSecondary} onClick={onClose}>Cerrar</button>
            </div>
          </div>

          <div style={{ padding: 16 }}>
            {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
            {loading ? (
              <div style={{ color: ui.textMuted }}>Cargando…</div>
            ) : lista.length === 0 ? (
              <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
                No hay devoluciones{salidaId != null ? ' para esta salida' : ''}.
                {puedeCrear && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      style={ui.btnPrimary}
                      onClick={() => setNuevaOpen(true)}
                    >
                      + Nueva devolución
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflow: 'auto' }} className="cc-almacen-table-scroll">
                <table className="cc-almacen-responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={ui.th}>N.º</th>
                      <th style={ui.th}>Fecha</th>
                      <th style={ui.th}>Salida</th>
                      <th style={ui.th}>Material</th>
                      <th style={ui.th}>Cantidad</th>
                      <th style={ui.th}>PK-ID</th>
                      <th style={ui.th}>Recibe</th>
                      <th style={{ ...ui.th, width: 44, textAlign: 'center' }} title="Trazabilidad">📜</th>
                      {puedeEliminar && <th style={{ ...ui.th, width: 44, textAlign: 'center' }}> </th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((d) => {
                      const und = d.unidad || ''
                      return (
                        <tr key={d.id}>
                          <td style={ui.td} data-label="N.º">{formatDevolucionNumero(d)}</td>
                          <td style={ui.td} data-label="Fecha">{fmtFechaAlmacen(d.fecha_hora_devolucion) || '—'}</td>
                          <td style={ui.td} data-label="Salida">
                            {d.codigo_salida
                              || (d.numero_salida != null ? formatSalidaNumero(d.numero_salida) : '—')}
                          </td>
                          <td style={ui.td} data-label="Material">{d.material_descripcion || '—'}</td>
                          <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-label="Cantidad">
                            {fmtCant(d.cantidad)}{und ? ` ${und}` : ''}
                          </td>
                          <td style={ui.td} data-label="PK-ID">{d.pk_id || '—'}</td>
                          <td style={ui.td} data-label="Recibe">{d.receptor_nombre || '—'}</td>
                          <td style={{ ...ui.td, textAlign: 'center' }} data-label="Historial">
                            <AlmacenTrazabilidadButton
                              token={token}
                              theme={t}
                              ui={ui}
                              compact
                              entidadTipo="devolucion"
                              entidadId={d.id}
                              titulo={`Almacén · Devolución ${formatDevolucionNumero(d)}`}
                            />
                          </td>
                          {puedeEliminar && (
                            <td style={{ ...ui.td, textAlign: 'center' }} data-label="Eliminar">
                              <button
                                type="button"
                                style={{ ...ui.btnSecondary, padding: '4px 8px', color: '#dc2626' }}
                                disabled={eliminandoId === d.id}
                                title="Eliminar devolución"
                                onClick={() => setEliminarTarget(d)}
                              >
                                {eliminandoId === d.id ? '…' : '🗑'}
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
          </div>
        </div>
      </div>

      {nuevaOpen && (
        <DevolucionFormModal
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
          zIndex={2147483100}
          onClose={() => setNuevaOpen(false)}
          onSaved={onNuevaSaved}
        />
      )}

      {eliminarTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Eliminar devolución"
          confirmar="Eliminar"
          cancelar="Cancelar"
          procesando={eliminandoId === eliminarTarget.id}
          zIndex={2147483200}
          onCancel={() => !eliminandoId && setEliminarTarget(null)}
          onConfirm={ejecutarEliminar}
        >
          ¿Eliminar la devolución {formatDevolucionNumero(eliminarTarget)}
          {eliminarTarget.material_descripcion ? ` · ${eliminarTarget.material_descripcion}` : ''}
          {' '}({fmtCant(eliminarTarget.cantidad)}{eliminarTarget.unidad ? ` ${eliminarTarget.unidad}` : ''})?
          <div style={{ marginTop: 10, opacity: 0.9 }}>
            Se revertirá el saldo en inventario y la cantidad neta de la salida quedará
            como si esta devolución no hubiera existido.
          </div>
        </CcConfirmModal>
      )}
    </>
  )
}
