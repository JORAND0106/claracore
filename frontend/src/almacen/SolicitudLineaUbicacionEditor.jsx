import CcModalBrandHeader from '../components/CcModalBrandHeader'
import PresupuestoRegistroGrid from './PresupuestoRegistroGrid'
import UbicacionSolicitudFields from './UbicacionSolicitudFields'
import {
  almacenFormModalDialogStyle,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

/**
 * Popup de finalización de ubicación (tras elegir PK en el mapa satelital):
 * registro de presupuesto, tramo, costado y abscisas.
 */
export default function SolicitudLineaUbicacionEditor({
  item,
  lineIndex,
  t,
  solicitudId,
  busy,
  onRegistroSelect,
  onUbicacionChange,
  onClose,
}) {
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  if (!item) return null

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
              📍 Completar ubicación
              {lineIndex != null ? ` · Línea ${lineIndex}` : ''}
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2, lineHeight: 1.35 }}>
              PK-ID <strong style={{ color: ui.text }}>{pkLabel || '—'}</strong>
              {item.tramo ? <> · Tramo <strong style={{ color: ui.text }}>{item.tramo}</strong></> : null}
              {' · '}Seleccione el registro de presupuesto, costado y abscisas.
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '6px 12px' }} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
