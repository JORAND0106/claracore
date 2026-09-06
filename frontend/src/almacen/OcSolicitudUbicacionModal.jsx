import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import {
  fmtAbscisasLinea,
  fmtNodosLinea,
  nodosLineaSolicitud,
} from './solicitudDetalleHelpers'
import {
  almacenFormModalDialogStyle,
  fmtCant,
  formatNumeroOcDisplay,
  formatSolicitudLinea,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Destino del material (solicitud / OC): grilla Excel + mapa interactivo con satélite.
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
  const pkLabel = item?.pk_label || item?.pk_id || ''
  const mapTheme = theme || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const th = {
    ...ui.th,
    fontSize: 'var(--cc-xs)',
    padding: '6px 8px',
    width: compact ? '38%' : 160,
    whiteSpace: 'nowrap',
  }
  const td = {
    ...ui.td,
    fontSize: 'var(--cc-sm)',
    padding: '6px 8px',
    fontWeight: 600,
  }

  const filas = item ? [
    {
      campo: 'Línea',
      valor: formatSolicitudLinea(sol?.consecutivo, item.numero_linea ?? 1),
    },
    {
      campo: 'Insumo',
      valor: [
        codigo || null,
        item.insumo?.label || item.material_descripcion || null,
      ].filter(Boolean).join(' — ') || '—',
    },
    {
      campo: 'Cantidad',
      valor: `${fmtCant(item.cantidad)} ${item.unidad || ''}`.trim(),
    },
    {
      campo: 'Capítulo · Ítem',
      valor: [
        item.presupuesto_capitulo || item.capitulo,
        item.presupuesto_item || item.item,
      ].filter(Boolean).join(' · ') || '—',
    },
    { campo: 'PK-ID', valor: pkLabel || '—' },
    { campo: 'Tramo', valor: item.tramo || '—' },
    { campo: 'Costado', valor: item.costado || '—' },
    { campo: 'Abs. Ini — Fin', valor: fmtAbscisasLinea(item) },
    {
      campo: 'Nodo Ini — Fin',
      valor: (() => {
        const n = nodosLineaSolicitud(item)
        return (n.inicio || n.final) ? fmtNodosLinea(item) : '—'
      })(),
    },
    {
      campo: 'Observación',
      valor: (item.observacion_residente || '').trim() || '—',
    },
  ] : []

  const mapHeight = compact ? 320 : 440

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
        style={almacenFormModalDialogStyle({
          width: compact ? '100%' : 'min(1080px, 100%)',
          compact,
        })}
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
            <>
              <div
                style={{ ...ui.sheetWrap, marginBottom: 12 }}
                className="cc-almacen-table-scroll"
              >
                <table
                  className="cc-almacen-destino-excel"
                  style={{ ...ui.sheetTable, width: '100%', borderCollapse: 'collapse' }}
                >
                  <thead>
                    <tr>
                      <th style={th}>Campo</th>
                      <th style={{ ...th, width: 'auto' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, idx) => (
                      <tr
                        key={f.campo}
                        style={{ background: idx % 2 === 0 ? 'transparent' : `${ui.textMuted}08` }}
                      >
                        <td style={{ ...td, fontWeight: 700, color: ui.textMuted, whiteSpace: 'nowrap' }}>
                          {f.campo}
                        </td>
                        <td style={{ ...td, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {f.valor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pkLabel ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 'var(--cc-xs)',
                    fontWeight: 700,
                    color: ui.textMuted,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                  >
                    Mapa · gestos táctiles · capa satelital
                  </div>
                  <AlmacenItemMapaPreview
                    t={mapTheme}
                    token={token}
                    contratoId={contratoId}
                    pkLabel={pkLabel}
                    height={mapHeight}
                    interactive
                    showBasemapToggle
                    initialBasemap="satelite"
                  />
                </div>
              ) : (
                <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
                  Esta línea no tiene PK-ID asignado; no hay mapa de destino.
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={ui.btnPrimary} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
