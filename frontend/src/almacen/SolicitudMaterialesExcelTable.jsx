import {
  descripcionGrillaItem,
  estadoValidacionItem,
  fmtAbscisasLinea,
  saldoNegociadoItem,
  saldoPresupuestadoItem,
} from './solicitudDetalleHelpers'
import { fmtCant, useAlmacenTheme } from './almacenShared'

const ESTADO_COLOR = {
  pendiente: '#d97706',
  aprobado: '#059669',
  rechazado: '#dc2626',
}

/**
 * Grilla tipo Excel de materiales de una solicitud (revisión Gerencial).
 */
export default function SolicitudMaterialesExcelTable({
  items = [],
  sol,
  puedeValidar = false,
  onRowClick,
  onMapClick,
}) {
  const ui = useAlmacenTheme()
  const th = { ...ui.th, padding: '6px 7px', whiteSpace: 'nowrap' }
  const td = { ...ui.td, padding: '5px 7px' }
  const tdNum = { ...ui.tdNum, padding: '5px 7px' }

  if (!items.length) {
    return (
      <div style={{ ...ui.sheetWrap, padding: 16, color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
        No hay materiales en esta solicitud.
      </div>
    )
  }

  return (
    <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
      <table style={{ ...ui.sheetTable, minWidth: 1100 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 40 }}>#</th>
            <th style={{ ...th, width: 72 }}>Capítulo</th>
            <th style={{ ...th, width: 72 }}>Ítem</th>
            <th style={th}>Descripción</th>
            <th style={{ ...th, width: 130 }}>Abs. Ini & Fin</th>
            <th style={{ ...th, width: 100 }}>Tramo</th>
            <th style={{ ...th, width: 90 }}>PK-ID</th>
            <th style={{ ...th, textAlign: 'right', width: 88 }}>Cantidad</th>
            <th style={{ ...th, textAlign: 'right', width: 100 }}>Saldo Neg.</th>
            <th style={{ ...th, textAlign: 'right', width: 100 }}>Saldo Ppto</th>
            <th style={{ ...th, width: 52, textAlign: 'center' }}>Mapa</th>
            {puedeValidar && (
              <th style={{ ...th, width: 88 }}>Estado</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const saldoNeg = saldoNegociadoItem(it)
            const saldoPpto = saldoPresupuestadoItem(it)
            const ev = estadoValidacionItem(it, sol)
            const und = it.unidad || it.contexto_presupuesto?.unidad || ''
            return (
              <tr
                key={it.id ?? idx}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                onClick={() => onRowClick?.(it, idx)}
                onMouseEnter={(e) => { e.currentTarget.style.background = ui.accentSoft }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={tdNum}>{it.numero_linea ?? idx + 1}</td>
                <td style={td}>{it.capitulo || '—'}</td>
                <td style={td}>{it.item || '—'}</td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {descripcionGrillaItem(it)}
                  {!it.insumo_id && puedeValidar && (
                    <div style={{ fontSize: 'var(--cc-caption)', color: '#d97706', fontWeight: 500, marginTop: 2 }}>
                      Sin mapear
                    </div>
                  )}
                </td>
                <td style={td}>{fmtAbscisasLinea(it)}</td>
                <td style={td}>{it.tramo || it.contexto_presupuesto?.tramo || '—'}</td>
                <td style={td}>{it.pk_id || '—'}</td>
                <td style={tdNum}>
                  {fmtCant(it.cantidad)}{und ? ` ${und}` : ''}
                </td>
                <td style={{
                  ...tdNum,
                  color: saldoNeg == null
                    ? ui.textMuted
                    : saldoNeg < 0
                      ? 'var(--cc-color-danger)'
                      : 'var(--cc-color-positive)',
                }}
                >
                  {saldoNeg == null ? '—' : fmtCant(saldoNeg)}
                </td>
                <td style={{
                  ...tdNum,
                  color: saldoPpto == null
                    ? ui.textMuted
                    : saldoPpto < 0
                      ? 'var(--cc-color-danger)'
                      : 'var(--cc-color-positive)',
                }}
                >
                  {saldoPpto == null ? '—' : fmtCant(saldoPpto)}
                </td>
                <td
                  style={{ ...td, textAlign: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    title="Ver ubicación en mapa"
                    aria-label="Ver ubicación en mapa"
                    disabled={!it.pk_id}
                    onClick={() => onMapClick?.(it)}
                    style={{
                      ...ui.btnSecondary,
                      padding: '4px 8px',
                      minHeight: 0,
                      fontSize: 'var(--cc-sm)',
                      opacity: it.pk_id ? 1 : 0.4,
                    }}
                  >
                    🗺️
                  </button>
                </td>
                {puedeValidar && (
                  <td style={{
                    ...td,
                    color: ESTADO_COLOR[ev || 'pendiente'],
                    fontWeight: 700,
                    fontSize: 'var(--cc-xs)',
                  }}
                  >
                    {ev === 'aprobado' ? 'Aprobado' : ev === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
