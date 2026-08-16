import {
  descripcionGrillaItem,
  estadoValidacionItem,
  fmtAbscisasLinea,
  saldoNegociadoItem,
  saldoPresupuestadoItem,
} from './solicitudDetalleHelpers'
import { AlmacenHelpIcon, fmtCant, useAlmacenTheme } from './almacenShared'

const ESTADO_COLOR = {
  pendiente: '#d97706',
  aprobado: '#059669',
  rechazado: '#dc2626',
}

const ROW_H = 36

const COLS = [
  { key: 'num', abbr: '#', tip: 'Número de línea', width: 40, align: 'right' },
  { key: 'cap', abbr: 'CAP.', tip: 'Capítulo de presupuesto', width: 64 },
  { key: 'item', abbr: 'ÍTEM', tip: 'Ítem de cobro', width: 64 },
  { key: 'desc', abbr: 'DESC.', tip: 'Descripción del material (texto libre o insumo mapeado)', width: 220 },
  { key: 'abs', abbr: 'ABS.', tip: 'Abscisa inicial y final', width: 120 },
  { key: 'tramo', abbr: 'TRAMO', tip: 'Tramo de la ubicación', width: 88 },
  { key: 'pk', abbr: 'PK-ID', tip: 'Identificador PK del sector', width: 80 },
  { key: 'cant', abbr: 'CANT.', tip: 'Cantidad solicitada', width: 80, align: 'right' },
  { key: 'sneg', abbr: 'S.NEG.', tip: 'Saldo negociado con el proveedor', width: 78, align: 'right' },
  { key: 'sppto', abbr: 'S.PPTO.', tip: 'Saldo presupuestado disponible en el PK-ID', width: 84, align: 'right' },
  { key: 'mapa', abbr: 'MAPA', tip: 'Ver ubicación en el mapa', width: 56, align: 'center' },
]

function cellBase(ui, { align = 'left', mono = false } = {}) {
  return {
    ...(mono ? ui.tdNum : ui.td),
    padding: '0 8px',
    height: ROW_H,
    maxHeight: ROW_H,
    lineHeight: `${ROW_H - 2}px`,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: align,
  }
}

function Trunc({ children, title }) {
  return (
    <span
      title={title || (typeof children === 'string' ? children : undefined)}
      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {children}
    </span>
  )
}

function ColHeader({ abbr, tip, style, align = 'left' }) {
  return (
    <th
      style={{
        ...style,
        padding: '6px 8px',
        height: 34,
        whiteSpace: 'nowrap',
        overflow: 'visible',
        textAlign: align,
        verticalAlign: 'middle',
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        width: '100%',
      }}
      >
        <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{abbr}</span>
        {tip && <AlmacenHelpIcon ayuda={tip} />}
      </span>
    </th>
  )
}

/**
 * Grilla tipo Excel de materiales de una solicitud (revisión Gerencial).
 * Encabezados abreviados con (?), filas de altura fija y truncamiento.
 */
export default function SolicitudMaterialesExcelTable({
  items = [],
  sol,
  puedeValidar = false,
  onRowClick,
  onMapClick,
}) {
  const ui = useAlmacenTheme()
  const thBase = { ...ui.th, fontSize: 'var(--cc-xs)' }

  if (!items.length) {
    return (
      <div style={{ ...ui.sheetWrap, padding: 16, color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
        No hay materiales en esta solicitud.
      </div>
    )
  }

  const minWidth = COLS.reduce((acc, c) => acc + c.width, 0) + (puedeValidar ? 78 : 0)

  return (
    <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
      <table style={{ ...ui.sheetTable, minWidth, tableLayout: 'fixed' }}>
        <colgroup>
          {COLS.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          {puedeValidar && <col style={{ width: 78 }} />}
        </colgroup>
        <thead>
          <tr>
            {COLS.map((c) => (
              <ColHeader
                key={c.key}
                abbr={c.abbr}
                tip={c.tip}
                align={c.align || 'left'}
                style={thBase}
              />
            ))}
            {puedeValidar && (
              <ColHeader
                abbr="EST."
                tip="Estado de validación del ítem"
                style={thBase}
              />
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const saldoNeg = saldoNegociadoItem(it)
            const saldoPpto = saldoPresupuestadoItem(it)
            const ev = estadoValidacionItem(it, sol)
            const und = it.unidad || it.contexto_presupuesto?.unidad || ''
            const desc = descripcionGrillaItem(it)
            const descTitle = !it.insumo_id && puedeValidar ? `${desc} (sin mapear)` : desc
            const absTxt = fmtAbscisasLinea(it)
            const tramoTxt = it.tramo || it.contexto_presupuesto?.tramo || '—'
            const cantTxt = `${fmtCant(it.cantidad)}${und ? ` ${und}` : ''}`
            return (
              <tr
                key={it.id ?? idx}
                style={{ cursor: onRowClick ? 'pointer' : 'default', height: ROW_H }}
                onClick={() => onRowClick?.(it, idx)}
                onMouseEnter={(e) => { e.currentTarget.style.background = ui.accentSoft }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={cellBase(ui, { align: 'right', mono: true })}>
                  <Trunc>{it.numero_linea ?? idx + 1}</Trunc>
                </td>
                <td style={cellBase(ui)}>
                  <Trunc title={it.capitulo || '—'}>{it.capitulo || '—'}</Trunc>
                </td>
                <td style={cellBase(ui)}>
                  <Trunc title={it.item || '—'}>{it.item || '—'}</Trunc>
                </td>
                <td style={{ ...cellBase(ui), fontWeight: 600, color: !it.insumo_id && puedeValidar ? '#92400e' : undefined }}>
                  <Trunc title={descTitle}>{desc}</Trunc>
                </td>
                <td style={cellBase(ui)}>
                  <Trunc title={absTxt}>{absTxt}</Trunc>
                </td>
                <td style={cellBase(ui)}>
                  <Trunc title={tramoTxt}>{tramoTxt}</Trunc>
                </td>
                <td style={cellBase(ui)}>
                  <Trunc title={it.pk_id || '—'}>{it.pk_id || '—'}</Trunc>
                </td>
                <td style={cellBase(ui, { align: 'right', mono: true })}>
                  <Trunc title={cantTxt}>{cantTxt}</Trunc>
                </td>
                <td style={{
                  ...cellBase(ui, { align: 'right', mono: true }),
                  color: saldoNeg == null
                    ? ui.textMuted
                    : saldoNeg < 0
                      ? 'var(--cc-color-danger)'
                      : 'var(--cc-color-positive)',
                }}
                >
                  <Trunc>{saldoNeg == null ? '—' : fmtCant(saldoNeg)}</Trunc>
                </td>
                <td style={{
                  ...cellBase(ui, { align: 'right', mono: true }),
                  color: saldoPpto == null
                    ? ui.textMuted
                    : saldoPpto < 0
                      ? 'var(--cc-color-danger)'
                      : 'var(--cc-color-positive)',
                }}
                >
                  <Trunc>{saldoPpto == null ? '—' : fmtCant(saldoPpto)}</Trunc>
                </td>
                <td
                  style={{ ...cellBase(ui, { align: 'center' }), overflow: 'visible' }}
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
                      padding: '2px 6px',
                      minHeight: 0,
                      height: 26,
                      lineHeight: '22px',
                      fontSize: 'var(--cc-sm)',
                      opacity: it.pk_id ? 1 : 0.4,
                    }}
                  >
                    🗺️
                  </button>
                </td>
                {puedeValidar && (
                  <td style={{
                    ...cellBase(ui),
                    color: ESTADO_COLOR[ev || 'pendiente'],
                    fontWeight: 700,
                    fontSize: 'var(--cc-xs)',
                  }}
                  >
                    <Trunc>
                      {ev === 'aprobado' ? 'Aprobado' : ev === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                    </Trunc>
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
