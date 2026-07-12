import { fmtCant, fmtMoney } from './almacenShared'

/**
 * Desglose económico de línea: cobro (listado), consumo (insumo c/ impuesto), utilidad.
 */
export default function LineaResumenEconomico({ analisis, compact = false, color }) {
  if (!analisis) return null

  const cant = analisis.cantidad
  const vuCobro = analisis.valor_cobro_unitario
  const vuInsumo = analisis.costo_insumo_unitario
  const cobroLinea = analisis.valor_cobro_linea
  const consumidoLinea = analisis.costo_insumo_linea
  const util = analisis.utilidad_estimada_linea
  const tienePrecio = analisis.tiene_precio_compra !== false && vuInsumo != null && vuInsumo > 0
  const tieneCobro = cobroLinea != null && vuCobro != null && vuCobro > 0

  if (!tieneCobro && !tienePrecio) return null

  const utilColor = (util ?? 0) >= 0 ? 'var(--cc-color-success)' : 'var(--cc-color-danger)'
  const lineStyle = {
    fontSize: 'var(--cc-xs)',
    color: color || 'inherit',
    lineHeight: 1.45,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4, marginTop: 4 }}>
      {tieneCobro && (
        <div style={lineStyle}>
          <strong>Cobro:</strong>
          {' '}
          {fmtCant(cant)}
          {' × '}
          {fmtMoney(vuCobro)}
          {' = '}
          <strong>{fmtMoney(cobroLinea)}</strong>
        </div>
      )}
      {tienePrecio ? (
        <div style={lineStyle}>
          <strong>Consumido:</strong>
          {' '}
          {fmtCant(cant)}
          {' × '}
          {fmtMoney(vuInsumo)}
          {' = '}
          <strong>{fmtMoney(consumidoLinea)}</strong>
        </div>
      ) : (
        <div style={{ ...lineStyle, fontStyle: 'italic', opacity: 0.85 }}>
          Consumido: sin precio de compra registrado en el catálogo
        </div>
      )}
      {util != null && tienePrecio && tieneCobro && (
        <div style={{ ...lineStyle, color: utilColor }}>
          <strong>Utilidad estimada:</strong>
          {' '}
          {fmtMoney(cobroLinea)}
          {' − '}
          {fmtMoney(consumidoLinea)}
          {' = '}
          <strong>{fmtMoney(util)}</strong>
        </div>
      )}
    </div>
  )
}
