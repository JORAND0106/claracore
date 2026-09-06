import { AlmacenHelpIcon, fmtCant, fmtMoney, useAlmacenTheme } from './almacenShared'

/**
 * Resumen de línea en formato hoja de cálculo (ppto / negociado / cobro-costo-utilidad).
 */
export default function LineaResumenExcelTable({
  ctx,
  ctxNeg,
  analisis,
  supera = false,
  superaNegociado = false,
  esPrincipal = true,
  sinPrecio = false,
  verEconomicos = true,
}) {
  const ui = useAlmacenTheme()
  const tienePpto = Boolean(ctx)
  const tieneNeg = Boolean(ctxNeg?.tiene_negociado)
  const cant = analisis?.cantidad
  const vuCobro = analisis?.valor_cobro_unitario
  const vuInsumo = analisis?.costo_insumo_unitario
  const cobroLinea = analisis?.valor_cobro_linea
  const costoLinea = analisis?.costo_insumo_linea
  const util = analisis?.utilidad_estimada_linea
  const tienePrecio = analisis
    && analisis.tiene_precio_compra !== false
    && vuInsumo != null
    && Number(vuInsumo) > 0
  const tieneCobro = cobroLinea != null && vuCobro != null && Number(vuCobro) > 0
  const tieneEco = verEconomicos && analisis && (tieneCobro || tienePrecio || sinPrecio)

  if (!tienePpto && !tieneNeg && !tieneEco && esPrincipal) return null

  const alert = supera || superaNegociado
  const wrap = {
    marginTop: 6,
    borderRadius: 6,
    border: alert ? '1px solid #dc2626' : `1px solid ${ui.textMuted}33`,
    background: alert ? '#fef2f2' : (ui.accentSoft || `${ui.accent}12`),
    overflow: 'hidden',
  }
  const th = {
    ...ui.th,
    fontSize: 'var(--cc-xs)',
    padding: '4px 8px',
    whiteSpace: 'nowrap',
    background: alert ? '#fee2e2' : undefined,
  }
  const td = {
    ...ui.td,
    fontSize: 'var(--cc-xs)',
    padding: '4px 8px',
    verticalAlign: 'middle',
  }
  const tdNum = {
    ...td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }
  const posColor = 'var(--cc-color-positive)'
  const danger = 'var(--cc-color-danger)'

  const sectionTitle = (label, tip) => (
    <tr>
      <td
        colSpan={4}
        style={{
          ...td,
          fontWeight: 700,
          color: ui.accent,
          background: `${ui.accent}14`,
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {label}
          {tip ? <AlmacenHelpIcon ayuda={tip} /> : null}
        </span>
      </td>
    </tr>
  )

  return (
    <div style={wrap}>
      {!esPrincipal && (
        <div style={{
          padding: '5px 8px',
          fontSize: 'var(--cc-xs)',
          fontWeight: 700,
          color: ui.textMuted,
          borderBottom: `1px solid ${ui.textMuted}22`,
          background: `${ui.textMuted}10`,
        }}
        >
          Insumo asociado — no descuenta presupuesto del ítem
        </div>
      )}
      {(supera || superaNegociado) && (
        <div style={{
          padding: '5px 8px',
          fontSize: 'var(--cc-xs)',
          fontWeight: 700,
          color: '#991b1b',
          borderBottom: '1px solid #fecaca',
        }}
        >
          {supera && '⚠ Supera presupuesto en este PK-ID'}
          {supera && superaNegociado && ' · '}
          {superaNegociado && ctxNeg?.tiene_negociado && (
            `⚠ Supera cantidad negociada (${fmtCant(ctxNeg.consumo_total_despues)} / ${fmtCant(ctxNeg.cantidad_negociada)} ${ctxNeg.unidad || ''})`
          )}
        </div>
      )}

      <div className="cc-almacen-table-scroll">
        <table className="cc-almacen-rentabilidad-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 120 }}>Concepto</th>
              <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
              <th style={{ ...th, textAlign: 'right' }}>VU</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tienePpto && (
              <>
                {sectionTitle(
                  ctx.capitulo && ctx.item
                    ? `Presupuesto · ${ctx.capitulo} · ${ctx.item}${ctx.descripcion ? ` — ${ctx.descripcion}` : ''}`
                    : 'Presupuesto',
                  'Cantidades del ítem de cobro en este PK-ID.',
                )}
                <tr>
                  <td style={td}>Ppto registro{ctx.unidad ? ` (${ctx.unidad})` : ''}</td>
                  <td style={tdNum}>{fmtCant(ctx.cant_presupuestada)}</td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
                {ctx.registros_combo_count > 1 && (
                  <tr>
                    <td style={td}>Total PK ({ctx.registros_combo_count} reg.)</td>
                    <td style={tdNum}>{fmtCant(ctx.cant_presupuestada_combo)}</td>
                    <td style={tdNum}>—</td>
                    <td style={tdNum}>—</td>
                  </tr>
                )}
                <tr>
                  <td style={td}>Acumulado solicitado</td>
                  <td style={tdNum}>{fmtCant(ctx.cant_solicitada_acumulada)}</td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
                <tr>
                  <td style={td}>Esta línea</td>
                  <td style={tdNum}>{fmtCant(ctx.cantidad_solicitada)}</td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>Saldo después</td>
                  <td style={{
                    ...tdNum,
                    fontWeight: 700,
                    color: supera ? danger : posColor,
                  }}
                  >
                    {fmtCant(ctx.saldo_disponible_despues)}
                  </td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
              </>
            )}

            {tieneNeg && (
              <>
                {sectionTitle('Negociado con proveedor', 'Consumo frente a la cantidad pactada del insumo.')}
                <tr>
                  <td style={td}>Negociado{ctxNeg.unidad ? ` (${ctxNeg.unidad})` : ''}</td>
                  <td style={tdNum}>{fmtCant(ctxNeg.cantidad_negociada)}</td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
                <tr>
                  <td style={td}>Consumido (incl. esta línea)</td>
                  <td style={{
                    ...tdNum,
                    color: superaNegociado ? danger : undefined,
                  }}
                  >
                    {fmtCant(ctxNeg.consumo_total_despues)}
                  </td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>Saldo negociado</td>
                  <td style={{
                    ...tdNum,
                    fontWeight: 700,
                    color: superaNegociado ? danger : posColor,
                  }}
                  >
                    {fmtCant(ctxNeg.saldo_negociado_despues)}
                  </td>
                  <td style={tdNum}>—</td>
                  <td style={tdNum}>—</td>
                </tr>
              </>
            )}

            {tieneEco && (
              <>
                {sectionTitle('Cobro, costo y utilidad', 'Valores económicos de esta línea (sin operaciones en texto).')}
                {tieneCobro && (
                  <tr>
                    <td style={td}>Cobro</td>
                    <td style={tdNum}>{fmtCant(cant)}</td>
                    <td style={tdNum}>{fmtMoney(vuCobro)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(cobroLinea)}</td>
                  </tr>
                )}
                {tienePrecio ? (
                  <tr>
                    <td style={td}>Costo (consumido)</td>
                    <td style={tdNum}>{fmtCant(cant)}</td>
                    <td style={tdNum}>{fmtMoney(vuInsumo)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(costoLinea)}</td>
                  </tr>
                ) : (
                  <tr>
                    <td style={td}>Costo (consumido)</td>
                    <td colSpan={3} style={{ ...td, fontStyle: 'italic', opacity: 0.85 }}>
                      Sin precio de compra registrado en el catálogo
                    </td>
                  </tr>
                )}
                {util != null && tienePrecio && tieneCobro && (
                  <tr style={{ background: `${ui.accentSoft || `${ui.accent}18`}` }}>
                    <td style={{ ...td, fontWeight: 800, color: ui.accent }}>Utilidad estimada</td>
                    <td style={tdNum}>—</td>
                    <td style={tdNum}>—</td>
                    <td style={{
                      ...tdNum,
                      fontWeight: 800,
                      color: Number(util) >= 0 ? 'var(--cc-color-success)' : danger,
                    }}
                    >
                      {fmtMoney(util)}
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
