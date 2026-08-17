import { useCallback, useEffect, useRef, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import SalidaFormModal from './SalidaFormModal'
import { puedeRegistrarSalidaAlmacen } from './almacenPermisos'
import {
  invalidateSalidasCache,
  readSalidasCache,
  writeSalidasCache,
} from './salidasListCache'
import {
  fmtCant,
  fmtFechaAlmacen,
  formatNumeroOcDisplay,
  formatSalidaNumero,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

function clearSalidaDraft(contratoId) {
  try {
    sessionStorage.removeItem(`cc_almacen_salida_draft_${contratoId || 'x'}`)
  } catch { /* ignore */ }
}

export default function SalidasPanel({
  permisos, token, t, refreshSignal = 0, onDataLoaded,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const puedeSalida = puedeRegistrarSalidaAlmacen(permisos)
  const puedeEliminar = Boolean(permisos?.editar)
  const contratoId = permisos?.contratoId
  const [lista, setLista] = useState(() => readSalidasCache(contratoId) || [])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [eliminandoId, setEliminandoId] = useState(null)
  const [eliminarTarget, setEliminarTarget] = useState(null)
  const [pdfBusyId, setPdfBusyId] = useState(null)
  const lastRefreshSignal = useRef(refreshSignal)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applyLista = useCallback((rows) => {
    const next = Array.isArray(rows) ? rows : []
    writeSalidasCache(contratoId, next)
    if (mountedRef.current) setLista(next)
  }, [contratoId])

  const reload = useCallback((opts = {}) => {
    const force = Boolean(opts.force)
    if (!force) {
      const cached = readSalidasCache(contratoId)
      if (cached) {
        setLista(cached)
        onDataLoaded?.()
        return Promise.resolve(cached)
      }
    }
    return api.listSalidas()
      .then((rows) => {
        applyLista(rows)
        return rows
      })
      .catch((e) => {
        if (mountedRef.current) setError(e.message)
        return null
      })
      .finally(() => onDataLoaded?.())
  }, [api, applyLista, contratoId, onDataLoaded])

  // Carga inicial: usa caché caliente (Ctrl+Tab / remount) sin red.
  useEffect(() => {
    const cached = readSalidasCache(contratoId)
    if (cached) {
      setLista(cached)
      onDataLoaded?.()
      return undefined
    }
    let cancelled = false
    api.listSalidas()
      .then((rows) => {
        if (cancelled) return
        applyLista(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) onDataLoaded?.()
      })
    return () => { cancelled = true }
    // Solo al montar / cambiar contrato — no al renovar token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, api])

  useEffect(() => {
    // refreshSignal = Actualizar explícito del módulo (no foco de ventana).
    if (refreshSignal > 0 && refreshSignal !== lastRefreshSignal.current) {
      lastRefreshSignal.current = refreshSignal
      if (!creating) {
        invalidateSalidasCache(contratoId)
        reload({ force: true })
      } else {
        onDataLoaded?.()
      }
    }
  }, [refreshSignal, creating, reload, onDataLoaded, contratoId])

  const cerrarFormulario = () => {
    clearSalidaDraft(contratoId)
    setCreating(false)
  }

  const onSaved = async (saved) => {
    clearSalidaDraft(contratoId)
    setCreating(false)
    invalidateSalidasCache(contratoId)
    await reload({ force: true })
    if (saved?.id && saved?.pdf_generando) {
      // Una sola revalidación diferida para marcar tiene_pdf_salida (sin doble reload inmediato).
      setTimeout(() => {
        invalidateSalidasCache(contratoId)
        reload({ force: true })
      }, 2500)
    }
  }

  const abrirPdf = async (e, salida) => {
    e.stopPropagation()
    setPdfBusyId(salida.id)
    setError('')
    try {
      await api.openSalidaPdf(salida.id)
      // Si el PDF se generó en el server, refrescar solo la bandera sin vaciar la grilla.
      if (!salida.tiene_pdf_salida && !salida.salida_pdf_blob_path) {
        invalidateSalidasCache(contratoId)
        reload({ force: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setPdfBusyId(null)
    }
  }

  const imprimirPdf = async (e, salida) => {
    e.stopPropagation()
    setPdfBusyId(salida.id)
    setError('')
    try {
      await api.printSalidaPdf(salida.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setPdfBusyId(null)
    }
  }

  const ejecutarEliminar = async () => {
    if (!eliminarTarget) return
    const salida = eliminarTarget
    setEliminandoId(salida.id)
    setError('')
    try {
      await api.deleteSalida(salida.id)
      setEliminarTarget(null)
      invalidateSalidasCache(contratoId)
      await reload({ force: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>📤 Salidas de material</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
            Entrega de material desde almacén hacia obra, descontando contra entradas por PK-ID.
          </div>
        </div>
        {puedeSalida && (
          <button type="button" style={ui.btnPrimary} onClick={() => setCreating(true)}>
            + Nueva salida
          </button>
        )}
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>No hay salidas registradas.</div>
      ) : (
        <div style={{ ...ui.card, padding: 0, overflow: 'auto' }} className="cc-almacen-table-scroll">
          <table className="cc-almacen-responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={ui.th}>N.º</th>
                <th style={ui.th}>Fecha y hora</th>
                <th style={ui.th}>PK-ID</th>
                <th style={ui.th}>Material</th>
                <th style={ui.th}>Cantidad</th>
                <th style={ui.th}>Devuelto</th>
                <th style={ui.th}>OC</th>
                <th style={ui.th}>Recibe</th>
                <th style={ui.th}>Despacha</th>
                <th style={{ ...ui.th, width: 88, textAlign: 'center' }}>Recibo</th>
                {puedeEliminar && <th style={{ ...ui.th, width: 44, textAlign: 'center' }}> </th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const busyPdf = pdfBusyId === s.id
                const tienePdf = Boolean(s.tiene_pdf_salida || s.salida_pdf_blob_path)
                return (
                  <tr key={s.id}>
                    <td style={ui.td} data-label="N.º">{formatSalidaNumero(s)}</td>
                    <td style={ui.td} data-label="Fecha">{fmtFechaAlmacen(s.fecha_hora_salida) || '—'}</td>
                    <td style={ui.td} data-label="PK-ID">{s.pk_id || '—'}</td>
                    <td style={ui.td} data-label="Material">{s.material_descripcion || '—'}</td>
                    <td style={ui.td} data-label="Cantidad">
                      {(() => {
                        const und = s.unidad || ''
                        const bruto = fmtCant(s.cantidad_salida)
                        const devuelta = Number(s.cantidad_devuelta) || 0
                        if (devuelta > 1e-9) {
                          const neto = fmtCant(s.cantidad_neta ?? (Number(s.cantidad_salida) - devuelta))
                          return (
                            <span>
                              {bruto}{und ? ` ${und}` : ''}
                              <span style={{ display: 'block', fontSize: 'var(--cc-xs)', color: ui.textMuted, fontWeight: 600 }}>
                                {`(neto ${neto}${und ? ` ${und}` : ''})`}
                              </span>
                            </span>
                          )
                        }
                        return <>{bruto}{und ? ` ${und}` : ''}</>
                      })()}
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-label="Devuelto">
                      {(Number(s.cantidad_devuelta) || 0) > 1e-9
                        ? (
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                            {fmtCant(s.cantidad_devuelta)}{s.unidad ? ` ${s.unidad}` : ''}
                          </span>
                        )
                        : '—'}
                    </td>
                    <td style={ui.td} data-label="OC">{formatNumeroOcDisplay(s.numero_oc)}</td>
                    <td style={ui.td} data-label="Recibe">{s.receptor_nombre || '—'}</td>
                    <td style={ui.td} data-label="Despacha">{s.despachador_nombre || '—'}</td>
                    <td style={{ ...ui.td, textAlign: 'center' }} data-label="Recibo">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }}
                          disabled={busyPdf}
                          title={tienePdf ? 'Ver recibo PDF' : 'PDF en generación…'}
                          onClick={(e) => abrirPdf(e, s)}
                        >
                          {busyPdf ? '…' : '📄'}
                        </button>
                        <button
                          type="button"
                          style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }}
                          disabled={busyPdf || !tienePdf}
                          title="Imprimir recibo térmico"
                          onClick={(e) => imprimirPdf(e, s)}
                        >
                          🖨
                        </button>
                      </div>
                    </td>
                    {puedeEliminar && (
                      <td style={{ ...ui.td, textAlign: 'center' }} data-label=" ">
                        <button
                          type="button"
                          style={{ ...ui.btnSecondary, padding: '4px 8px', color: '#dc2626' }}
                          disabled={eliminandoId === s.id}
                          title="Eliminar salida"
                          onClick={() => setEliminarTarget(s)}
                        >
                          {eliminandoId === s.id ? '…' : '🗑'}
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

      {creating && (
        <SalidaFormModal
          permisos={permisos}
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
          onClose={cerrarFormulario}
          onSaved={onSaved}
        />
      )}

      {eliminarTarget && (
        <CcConfirmModal
          theme={t}
          tipo="danger"
          titulo="Eliminar salida"
          confirmar="Eliminar"
          cancelar="Cancelar"
          onCancel={() => setEliminarTarget(null)}
          onConfirm={ejecutarEliminar}
        >
          ¿Eliminar la salida {formatSalidaNumero(eliminarTarget)}?
          Se revertirá el movimiento de inventario asociado.
        </CcConfirmModal>
      )}
    </div>
  )
}
