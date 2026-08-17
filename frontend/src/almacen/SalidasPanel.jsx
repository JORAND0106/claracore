import { useCallback, useEffect, useRef, useState } from 'react'
import CcConfirmModal from '../components/CcConfirmModal'
import SalidaFormModal from './SalidaFormModal'
import {
  puedeEditarCantidadSalidaAlmacen,
  puedeRegistrarSalidaAlmacen,
} from './almacenPermisos'
import AlmacenTrazabilidadButton from './AlmacenTrazabilidadButton'
import { validateCantidadSalidaEdit } from './salidaCantidadEditHelpers'
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
  permisos, token, t, refreshSignal = 0, onDataLoaded, onSalidaMutated,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const puedeSalida = puedeRegistrarSalidaAlmacen(permisos)
  const puedeEliminar = Boolean(permisos?.editar)
  const puedeEditarCantidad = puedeEditarCantidadSalidaAlmacen(permisos)
  const contratoId = permisos?.contratoId
  const [lista, setLista] = useState(() => readSalidasCache(contratoId) || [])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [eliminandoId, setEliminandoId] = useState(null)
  const [eliminarTarget, setEliminarTarget] = useState(null)
  const [editCantidadTarget, setEditCantidadTarget] = useState(null)
  const [editCantidadValor, setEditCantidadValor] = useState('')
  const [editCantidadError, setEditCantidadError] = useState('')
  const [editCantidadBusy, setEditCantidadBusy] = useState(false)
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

  const notifySalidaMutated = useCallback(() => {
    // Refresca Entradas/Inventario (saldos derivados) sin depender de un segundo reload local.
    onSalidaMutated?.()
  }, [onSalidaMutated])

  const onSaved = async (saved) => {
    clearSalidaDraft(contratoId)
    setCreating(false)
    invalidateSalidasCache(contratoId)
    await reload({ force: true })
    notifySalidaMutated()
    if (saved?.id && saved?.pdf_generando) {
      // Una sola revalidación diferida para marcar tiene_pdf_salida (sin doble reload inmediato).
      setTimeout(() => {
        invalidateSalidasCache(contratoId)
        reload({ force: true })
      }, 2500)
    }
  }

  const abrirEditarCantidad = (e, salida) => {
    e.stopPropagation()
    setEditCantidadError('')
    setEditCantidadTarget(salida)
    setEditCantidadValor(String(salida.cantidad_salida ?? ''))
  }

  const cerrarEditarCantidad = () => {
    if (editCantidadBusy) return
    setEditCantidadTarget(null)
    setEditCantidadValor('')
    setEditCantidadError('')
  }

  const guardarCantidad = async () => {
    if (!editCantidadTarget) return
    const check = validateCantidadSalidaEdit({
      cantidadNueva: editCantidadValor,
      cantidadActual: editCantidadTarget.cantidad_salida,
      cantidadDevuelta: editCantidadTarget.cantidad_devuelta,
      // Disponible exacto lo valida el backend; aquí solo tope por devoluciones.
      disponibleLinea: null,
    })
    if (!check.ok) {
      setEditCantidadError(check.message)
      return
    }
    setEditCantidadBusy(true)
    setEditCantidadError('')
    setError('')
    try {
      await api.updateSalidaCantidad(editCantidadTarget.id, check.cantidad)
      setEditCantidadTarget(null)
      setEditCantidadValor('')
      invalidateSalidasCache(contratoId)
      await reload({ force: true })
      notifySalidaMutated()
    } catch (err) {
      setEditCantidadError(err.message || String(err))
    } finally {
      setEditCantidadBusy(false)
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
      notifySalidaMutated()
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
                <th style={ui.th}>Cant. Neta</th>
                <th style={ui.th}>OC</th>
                <th style={ui.th}>Recibe</th>
                <th style={ui.th}>Despacha</th>
                <th style={{ ...ui.th, width: 44, textAlign: 'center' }} title="Trazabilidad">📜</th>
                <th style={{ ...ui.th, width: 88, textAlign: 'center' }}>Recibo</th>
                {puedeEliminar && <th style={{ ...ui.th, width: 44, textAlign: 'center' }}> </th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const busyPdf = pdfBusyId === s.id
                const tienePdf = Boolean(s.tiene_pdf_salida || s.salida_pdf_blob_path)
                const und = s.unidad || ''
                const neto = s.cantidad_neta != null
                  ? Number(s.cantidad_neta)
                  : Math.max(0, (Number(s.cantidad_salida) || 0) - (Number(s.cantidad_devuelta) || 0))
                return (
                  <tr key={s.id}>
                    <td style={ui.td} data-label="N.º">{formatSalidaNumero(s)}</td>
                    <td style={ui.td} data-label="Fecha">{fmtFechaAlmacen(s.fecha_hora_salida) || '—'}</td>
                    <td style={ui.td} data-label="PK-ID">{s.pk_id || '—'}</td>
                    <td style={ui.td} data-label="Material">{s.material_descripcion || '—'}</td>
                    <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-label="Cantidad">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        {fmtCant(s.cantidad_salida)}{und ? ` ${und}` : ''}
                        {puedeEditarCantidad && (
                          <button
                            type="button"
                            style={{
                              ...ui.btnSecondary,
                              padding: '2px 6px',
                              fontSize: 'var(--cc-xs)',
                              lineHeight: 1.2,
                            }}
                            title="Editar cantidad (Contratista Gerencial / Desarrollador)"
                            onClick={(e) => abrirEditarCantidad(e, s)}
                          >
                            ✎
                          </button>
                        )}
                      </span>
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} data-label="Devuelto">
                      {(Number(s.cantidad_devuelta) || 0) > 1e-9
                        ? (
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                            {fmtCant(s.cantidad_devuelta)}{und ? ` ${und}` : ''}
                          </span>
                        )
                        : '—'}
                    </td>
                    <td style={{
                      ...ui.td,
                      textAlign: 'right',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                      data-label="Cant. Neta"
                      title="Cantidad neta = salida − devoluciones (consumo definitivo)"
                    >
                      {fmtCant(neto)}{und ? ` ${und}` : ''}
                    </td>
                    <td style={ui.td} data-label="OC">{formatNumeroOcDisplay(s.numero_oc)}</td>
                    <td style={ui.td} data-label="Recibe">{s.receptor_nombre || '—'}</td>
                    <td style={ui.td} data-label="Despacha">{s.despachador_nombre || '—'}</td>
                    <td style={{ ...ui.td, textAlign: 'center' }} data-label="Historial">
                      <AlmacenTrazabilidadButton
                        token={token}
                        theme={t}
                        ui={ui}
                        compact
                        entidadTipo="salida"
                        entidadId={s.id}
                        titulo={`Almacén · Salida ${formatSalidaNumero(s)}${s.material_descripcion ? ` · ${s.material_descripcion}` : ''}`}
                      />
                    </td>
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

      {editCantidadTarget && (
        <CcConfirmModal
          theme={t}
          tipo="warn"
          titulo="Editar cantidad de salida"
          confirmar="Guardar"
          cancelar="Cancelar"
          procesando={editCantidadBusy}
          onCancel={cerrarEditarCantidad}
          onConfirm={guardarCantidad}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
              {formatSalidaNumero(editCantidadTarget)}
              {editCantidadTarget.material_descripcion
                ? ` · ${editCantidadTarget.material_descripcion}`
                : ''}
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)' }}>
              Nueva cantidad
              <input
                type="number"
                min={0}
                step="any"
                value={editCantidadValor}
                disabled={editCantidadBusy}
                onChange={(e) => setEditCantidadValor(e.target.value)}
                style={{
                  ...ui.input,
                  fontVariantNumeric: 'tabular-nums',
                }}
                autoFocus
              />
            </label>
            {(Number(editCantidadTarget.cantidad_devuelta) || 0) > 1e-9 && (
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Ya devuelto: {fmtCant(editCantidadTarget.cantidad_devuelta)}
                {editCantidadTarget.unidad ? ` ${editCantidadTarget.unidad}` : ''}
                {' '}(mínimo permitido).
              </div>
            )}
            {editCantidadError && (
              <div style={{ color: '#dc2626', fontSize: 'var(--cc-sm)' }}>{editCantidadError}</div>
            )}
          </div>
        </CcConfirmModal>
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
