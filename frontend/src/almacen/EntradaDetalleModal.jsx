import { useEffect, useState } from 'react'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import { puedeVerAlertasEntrada } from './almacenPermisos'
import {
  AlmacenFieldLabel,
  fmtCant,
  fmtMoney,
  formatEntradaNumero,
  fmtFechaAlmacenSolo,
  useAlmacenApi,
  useAlmacenCompact,
  useAlmacenTheme,
} from './almacenShared'

const TIPO_LABEL = {
  disposicion: 'Disposición',
  recibo: 'Recibo de materiales',
}

export default function EntradaDetalleModal({
  entradaId,
  onClose,
  token,
  contratoId,
  theme,
  permisos,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const compact = useAlmacenCompact()
  const [ent, setEnt] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!entradaId) return
    setBusy(true)
    api.getEntrada(entradaId)
      .then(setEnt)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }, [api, entradaId])

  const overlay = {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    display: 'flex',
    alignItems: compact ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: compact ? 0 : 16,
  }

  const modal = {
    ...ui.card,
    width: '100%',
    maxWidth: compact ? '100%' : 560,
    maxHeight: compact ? '96dvh' : '92vh',
    overflow: 'auto',
    boxShadow: compact ? 'var(--cc-almacen-shadow-sheet)' : 'var(--cc-almacen-shadow-modal)',
    borderRadius: compact ? '16px 16px 0 0' : ui.card.borderRadius,
    paddingBottom: compact ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : ui.card.padding,
  }

  const row = (label, val) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
      <span style={{ color: ui.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', fontWeight: 500 }}>{val ?? '—'}</span>
    </div>
  )

  const oc = ent?.almacen_orden_compra || {}
  const item0 = ent?.items?.[0]?.almacen_orden_compra_item || {}
  const verAlertas = puedeVerAlertasEntrada(permisos)
  const unidad = item0.unidad || ent?.insumo_unidad || ''

  return (
    <div
      style={overlay}
      className={compact ? 'cc-almacen-modal-overlay cc-almacen-modal-overlay--compact' : 'cc-almacen-modal-overlay'}
      role="dialog"
      aria-modal="true"
    >
      <div style={modal} className={compact ? 'cc-almacen-modal-sheet' : ''} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>
              Entrada {formatEntradaNumero(ent)}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
              Resumen del registro de material
            </div>
          </div>
          <button type="button" style={{ ...ui.btnSecondary, padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
        {busy && !ent && <div style={{ color: ui.textMuted }}>Cargando…</div>}

        {ent && (
          <>
            {row('Tipo', TIPO_LABEL[ent.tipo] || ent.tipo)}
            {row('Documento', ent.numero_documento || '—')}
            {row('Fecha', fmtFechaAlmacenSolo(ent.fecha_entrada))}
            {row('Orden de compra', oc.numero_oc ? `#${oc.numero_oc}` : '—')}
            {row('Proveedor', ent.proveedor_nombre)}
            {row('Insumo', ent.insumo_label || item0.material_descripcion)}
            {row('Cantidad', `${fmtCant(ent.cantidad_recibida_total)} ${unidad}`.trim())}
            {row('PK / sector', ent.pk_id)}
            {row('Tramo', ent.tramo)}
            {row('Costado', ent.costado)}
            {row('Abscisas', [ent.abscisa_inicial, ent.abscisa_final].filter(Boolean).join(' → ') || '—')}
            {row('Placa', ent.placa)}
            {row('Transportador', ent.transportador)}
            {row('Registrado por', ent.usuario_nombre)}

            {verAlertas && ent.alerta_silenciosa_detalle && (
              <div style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                color: '#92400e',
                fontSize: 'var(--cc-sm)',
              }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Alerta de control</div>
                {ent.alerta_silenciosa_detalle}
              </div>
            )}

            {ent.pk_id && (
              <div style={{ marginTop: 14 }}>
                <AlmacenFieldLabel icon="🗺️" label="Ubicación en mapa" />
                <AlmacenItemMapaPreview
                  t={theme}
                  token={token}
                  contratoId={contratoId}
                  pkLabel={ent.pk_id}
                  height={240}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {ent.tiene_pdf_disposicion && (
                <>
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    title="Ver PDF POS"
                    onClick={() => api.openDisposicionPdf(ent.id).catch((e) => setError(e.message))}
                  >
                    📄 Ver PDF
                  </button>
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    title="Imprimir PDF POS"
                    onClick={() => api.printDisposicionPdf(ent.id).catch((e) => setError(e.message))}
                  >
                    🖨️ Imprimir
                  </button>
                </>
              )}
              <button type="button" style={ui.btnPrimary} onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
