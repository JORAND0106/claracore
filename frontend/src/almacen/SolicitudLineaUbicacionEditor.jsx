import CcModalBrandHeader from '../components/CcModalBrandHeader'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import PresupuestoRegistroGrid from './PresupuestoRegistroGrid'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import {
  AlmacenFieldLabel,
  almacenFormModalDialogStyle,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Editor de ubicación de una línea de solicitud (mapa PK, registro de presupuesto,
 * tramo, costado y abscisas). Se abre desde el botón de mapa de la fila Excel.
 */
export default function SolicitudLineaUbicacionEditor({
  item,
  lineIndex,
  t,
  token,
  contratoId,
  solicitudId,
  busy,
  onPkSelect,
  onPkClear,
  onRegistroSelect,
  onUbicacionChange,
  onClose,
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  if (!item) return null

  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  const pkLabel = item.pk_label || item.pk_id || ''

  return (
    <div
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100045,
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
        aria-labelledby="solicitud-linea-ubicacion-title"
        className={`cc-almacen-form-modal${compact ? ' cc-almacen-modal-sheet' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={almacenFormModalDialogStyle({ width: 'min(760px, 100%)', compact })}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 12,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div id="solicitud-linea-ubicacion-title" style={{ fontSize: 'var(--cc-title)', fontWeight: 800 }}>
              🗺️ Ubicación
              {lineIndex != null ? ` · Línea ${lineIndex}` : ''}
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2, lineHeight: 1.35 }}>
              Seleccione PK-ID, registro de presupuesto, tramo, costado y abscisas.
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '6px 12px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <AlmacenFieldLabel icon="🗺️" label="Ubicación PK-ID" compact ayuda="Seleccione en el mapa el sector." />
            <AlmacenPkMapaSelector
              t={theme}
              token={token}
              contratoId={contratoId}
              pkIdSeleccionado={item.pk_id_id ? String(item.pk_id_id) : ''}
              pkLabel={pkLabel}
              onSeleccionar={onPkSelect}
              onLimpiar={onPkClear}
              compact
            />
          </div>

          <PresupuestoRegistroGrid
            capitulo={item.presupuesto_capitulo}
            item={item.presupuesto_item}
            pkId={item.pk_id}
            presupuestoId={item.presupuesto_id}
            excludeSolicitudId={solicitudId || undefined}
            disabled={busy}
            onSelect={onRegistroSelect}
          />

          <UbicacionSolicitudFields
            variant="excel"
            pkId={pkLabel}
            tramo={item.tramo}
            costado={item.costado}
            abscisaInicial={item.abscisa_inicial}
            abscisaFinal={item.abscisa_final}
            absInicioDisplay={item.abs_inicio_display}
            absFinalDisplay={item.abs_final_display}
            nodoInicio={item.nodo_inicio}
            nodoFinal={item.nodo_final}
            abscisasEditable
            disabled={busy}
            onChange={onUbicacionChange}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={ui.btnPrimary} onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
