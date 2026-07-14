import { useMemo, useState } from 'react'
import { AlmacenHelpIcon, fmtCant, fmtMoney, useAlmacenTheme } from './almacenShared'

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(1)} %`
}

function fmtNumeroOc(n) {
  if (n == null || n === '') return 'Sin OC'
  const s = String(n)
  return s.startsWith('#') ? s : `#${s.padStart(5, '0')}`
}

const METRIC_COLS = [
  {
    id: 'cantidad',
    label: 'Cant.',
    ayuda: 'Cantidad de insumo en esta línea.',
    render: (col) => fmtCant(col?.cantidad),
  },
  {
    id: 'vu_cobro',
    label: 'VU cobro',
    ayuda: 'Valor unitario de cobro según el ítem del listado de precios.',
    render: (col) => fmtMoney(col?.valor_cobro_unitario),
  },
  {
    id: 'total_cobro',
    label: 'Tot. cobro',
    ayuda: 'Total de cobro: cantidad × valor unitario de cobro.',
    render: (col) => fmtMoney(col?.valor_cobro_linea),
    strong: true,
  },
  {
    id: 'vu_costo',
    label: 'VU costo',
    ayuda: 'Valor unitario de compra del insumo en catálogo (con impuestos, si aplica).',
    render: (col) => {
      if (!col?.costo_insumo_unitario) return { sinPrecio: true }
      return { text: fmtMoney(col.costo_insumo_unitario) }
    },
  },
  {
    id: 'total_costo',
    label: 'Tot. costo',
    ayuda: 'Total de costo del insumo: cantidad × valor unitario de compra.',
    render: (col) => {
      if (!col?.costo_insumo_unitario && col?.costo_insumo_linea == null) return { sinPrecio: true }
      return { text: fmtMoney(col?.costo_insumo_linea) }
    },
  },
  {
    id: 'utilidad',
    label: 'Utilidad',
    ayuda: 'Diferencia entre el total de cobro y el total de costo del insumo.',
    render: (col) => ({
      text: fmtMoney(col?.utilidad_estimada_linea),
      util: col?.utilidad_estimada_linea,
    }),
  },
  {
    id: 'rentabilidad',
    label: '% rent.',
    ayuda: 'Porcentaje de utilidad sobre el total de cobro.',
    render: (col) => ({ text: fmtPct(col?.rentabilidad_pct) }),
  },
]

function MetricHeader({ label, ayuda }) {
  return (
    <span className="cc-almacen-rentabilidad-th">
      <span>{label}</span>
      {ayuda && <AlmacenHelpIcon ayuda={ayuda} />}
    </span>
  )
}

function renderValor(col, metric) {
  const out = metric.render(col)
  if (out == null || out === '—') return '—'
  if (typeof out === 'string') return out
  if (out.sinPrecio) {
    return (
      <span style={{ fontStyle: 'italic', opacity: 0.85, fontSize: 'var(--cc-xs)' }}>
        Sin precio
      </span>
    )
  }
  const style = {}
  if (metric.strong) style.fontWeight = 700
  if (out.util != null) {
    style.color = out.util >= 0 ? 'var(--cc-color-success)' : 'var(--cc-color-danger)'
    style.fontWeight = 600
  }
  return <span style={style}>{out.text ?? '—'}</span>
}

/** Convierte formato legacy (presente/acumulado/actual) al desglose por filas. */
export function filasRentabilidad(analisisRentabilidad) {
  if (!analisisRentabilidad) return []
  if (Array.isArray(analisisRentabilidad.filas) && analisisRentabilidad.filas.length) {
    return analisisRentabilidad.filas
  }
  const { presente, acumulado_anterior: acum, actual } = analisisRentabilidad
  const filas = []
  if (acum?.cantidad > 0 || acum?.valor_cobro_linea) {
    filas.push({ ...acum, etiqueta_fila: 'Acum. anterior', numero_oc: null, es_actual: false })
  }
  if (presente) {
    filas.push({ ...presente, etiqueta_fila: 'Esta solicitud', numero_oc: null, es_actual: true })
  } else if (actual && actual !== presente) {
    filas.push({ ...actual, etiqueta_fila: 'Acum. actual', numero_oc: null, es_actual: true })
  }
  return filas
}

/**
 * Tabla cobro / costo / rentabilidad — una fila por OC / solicitud.
 */
export default function TablaRentabilidadAcumulada({
  analisisRentabilidad,
  proveedorCatalogo,
  verEconomicos = true,
  defaultExpanded = false,
}) {
  const ui = useAlmacenTheme()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const filas = useMemo(
    () => filasRentabilidad(analisisRentabilidad),
    [analisisRentabilidad],
  )

  if (!verEconomicos || !filas.length) return null

  const numCell = {
    ...ui.td,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }

  const thMetric = {
    ...ui.th,
    textAlign: 'right',
    fontSize: 'var(--cc-xs)',
    lineHeight: 1.25,
    verticalAlign: 'bottom',
    minWidth: 72,
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="cc-almacen-rentabilidad-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontWeight: 700, fontSize: 'var(--cc-sm)' }}>
          Cobro, costo y rentabilidad
        </span>
        <span aria-hidden style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
          {expanded ? '▾ Ocultar' : '▸ Mostrar'}
        </span>
      </button>

      {expanded && (
        <>
          <div className="cc-almacen-table-scroll" style={{ marginTop: 8 }}>
            <table className="cc-almacen-rentabilidad-table cc-almacen-rentabilidad-table--transposed">
              <thead>
                <tr>
                  <th style={{ ...ui.th, textAlign: 'left', minWidth: 108 }} />
                  <th style={{ ...ui.th, textAlign: 'left', minWidth: 88, fontSize: 'var(--cc-xs)' }}>
                    Nº OC
                  </th>
                  {METRIC_COLS.map((metric) => (
                    <th key={metric.id} style={thMetric}>
                      <MetricHeader label={metric.label} ayuda={metric.ayuda} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, idx) => (
                  <tr
                    key={`${fila.solicitud_id ?? 'r'}-${fila.numero_oc ?? 'x'}-${idx}`}
                    style={fila.es_actual ? { background: `${ui.accentSoft}55` } : undefined}
                  >
                    <td style={{
                      ...ui.td,
                      fontWeight: fila.es_actual ? 700 : 600,
                      fontSize: 'var(--cc-xs)',
                      color: fila.es_actual ? ui.accent : ui.text,
                    }}
                    >
                      {fila.etiqueta_fila || '—'}
                    </td>
                    <td style={{ ...ui.td, fontSize: 'var(--cc-xs)', fontWeight: 600 }}>
                      {fmtNumeroOc(fila.numero_oc)}
                    </td>
                    {METRIC_COLS.map((metric) => (
                      <td key={metric.id} style={numCell}>
                        {renderValor(fila, metric)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proveedorCatalogo && (
            <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 8 }}>
              <strong>Proveedor catálogo:</strong> {proveedorCatalogo}
            </div>
          )}
        </>
      )}
    </div>
  )
}
