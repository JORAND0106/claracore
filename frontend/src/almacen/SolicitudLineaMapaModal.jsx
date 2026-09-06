import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { fmtAbscisasLinea, fmtNodosLinea, nodosLineaSolicitud } from './solicitudDetalleHelpers'
import {
  almacenFormModalDialogStyle,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Modal de ubicación de línea: grilla Excel + mapa interactivo (táctil + satélite).
 */
export default function SolicitudLineaMapaModal({
  item,
  token,
  contratoId,
  t,
  onClose,
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  if (!item) return null

  const pkLabel = item.pk_label || item.pk_id || ''
  const absTxt = fmtAbscisasLinea(item)
  const nodos = nodosLineaSolicitud(item)
  const nodosTxt = fmtNodosLinea(item)
  const theme = t || {
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
    whiteSpace: 'nowrap',
  }
  const td = {
    ...ui.td,
    fontSize: 'var(--cc-sm)',
    padding: '6px 8px',
    fontWeight: 600,
  }

  const filas = [
    { campo: 'PK-ID', valor: pkLabel || '—' },
    { campo: 'Tramo', valor: item.tramo || '—' },
    { campo: 'Costado', valor: item.costado || '—' },
    { campo: 'Abs. Ini — Fin', valor: absTxt },
    {
      campo: 'Nodo Ini — Fin',
      valor: (nodos.inicio || nodos.final) ? nodosTxt : '—',
    },
  ]

  const mapHeight = compact ? 300 : 420

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100040,
        display: 'flex',
        alignItems: compact ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: compact ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ubicación de la línea"
        className={compact ? 'cc-almacen-modal-sheet' : ''}
        onClick={(e) => e.stopPropagation()}
        style={almacenFormModalDialogStyle({
          width: compact ? '100%' : 'min(1000px, 100%)',
          compact,
        })}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 12,
          padding: compact ? '0 4px' : 0,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              🗺️ Ubicación
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 2 }}>
              PK-ID {pkLabel || '—'}
              {item.tramo ? ` · Tramo ${item.tramo}` : ''}
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '6px 12px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

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
                <th style={{ ...th, width: compact ? '40%' : 150 }}>Campo</th>
                <th style={th}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => (
                <tr
                  key={f.campo}
                  style={{ background: idx % 2 === 0 ? 'transparent' : `${ui.textMuted}08` }}
                >
                  <td style={{ ...td, fontWeight: 700, color: ui.textMuted }}>{f.campo}</td>
                  <td style={td}>{f.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pkLabel ? (
          <div>
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
              t={theme}
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
          <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', padding: 16 }}>
            Esta línea no tiene PK-ID asignado.
          </div>
        )}
      </div>
    </div>
  )
}
