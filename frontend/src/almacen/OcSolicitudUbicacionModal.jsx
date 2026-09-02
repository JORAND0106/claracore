import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import SolicitudItemDetalleCard from './SolicitudItemDetalleCard'
import {
  almacenFormModalDialogStyle,
  formatNumeroOcDisplay,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Detalle de destino del material (solicitud / OC): una sola línea, ubicación y mapa.
 */
export default function OcSolicitudUbicacionModal({
  solicitudId,
  solicitudItemId,
  numeroOc,
  insumoCodigo,
  contratoId,
  token,
  theme,
  onClose,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [sol, setSol] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!solicitudId) {
      setBusy(false)
      return
    }
    setBusy(true)
    setError('')
    api.getSolicitud(solicitudId, { ligera: true })
      .then(setSol)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }, [api, solicitudId])

  const item = useMemo(() => {
    if (!solicitudItemId) return null
    return (sol?.items || []).find((it) => Number(it.id) === Number(solicitudItemId)) || null
  }, [sol, solicitudItemId])

  const tituloOc = numeroOc != null ? formatNumeroOcDisplay(numeroOc) : '—'
  const tituloSol = sol?.consecutivo != null ? `#${sol.consecutivo}` : '…'
  const codigo = insumoCodigo || item?.insumo_codigo

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100024,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-ubicacion-title"
        className={`cc-almacen-form-modal cc-almacen-solicitud-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={almacenFormModalDialogStyle({ width: 'min(720px, 100%)', compact })}
      >
        <CcModalBrandHeader theme={theme} />
        <div className="cc-almacen-form-modal__header cc-almacen-solicitud-form-modal__header cc-almacen-solicitud-form-modal__header--compact">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="oc-ubicacion-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              📍 Destino del material
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: 'var(--cc-almacen-text-muted)', marginTop: 2 }}>
              Solicitud {tituloSol} · OC {tituloOc}
              {codigo ? ` · ${codigo}` : ''}
            </div>
          </div>
          <button
            type="button"
            style={{ ...ui.btnSecondary, padding: '6px 12px', flexShrink: 0 }}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="cc-almacen-form-modal__body cc-almacen-solicitud-form-modal__body">
          {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
          {busy && !sol && <div style={{ color: ui.textMuted }}>Cargando…</div>}
          {!busy && !error && !item && (
            <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
              No se encontró la línea de solicitud asociada a esta entrada.
            </div>
          )}
          {item && (
            <SolicitudItemDetalleCard
              item={item}
              consecutivo={sol?.consecutivo}
              lineIndex={item.numero_linea ?? 1}
              contratoId={contratoId}
              token={token}
              theme={theme}
              compact={compact}
              accordion={false}
              verEconomicos={false}
              resaltarCantidad
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={ui.btnPrimary} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
