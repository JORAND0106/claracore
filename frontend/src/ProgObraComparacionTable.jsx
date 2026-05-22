import { useMemo, useState } from 'react'
import { fmtCOP, fmtDateHuman } from './progObraFormat'
import {
  COMPARE_COLORS,
  COMPARE_LABELS,
  filterCompareNodos,
  sortNodosByDesviacion,
} from './progObraCompare'

function fmtDelta(n, suffix = '') {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '0'
  return `${v > 0 ? '+' : ''}${v}${suffix}`
}

export default function ProgObraComparacionTable({ nodos, resumen, t, pkId, compact = false }) {
  const [soloAtrasados, setSoloAtrasados] = useState(false)
  const [soloCriticos, setSoloCriticos] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)

  const filtered = useMemo(() => {
    let list = filterCompareNodos(nodos, { soloAtrasados, soloCriticos, pkId })
    list = sortNodosByDesviacion(list)
    if (!sortDesc) list = [...list].reverse()
    return list
  }, [nodos, soloAtrasados, soloCriticos, pkId, sortDesc])

  const cell = {
    padding: compact ? '4px 6px' : '6px 8px',
    fontSize: compact ? 10 : 'var(--cc-caption)',
    borderBottom: `1px solid ${t.border}44`,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {resumen && (
        <div
          style={{
            padding: compact ? '6px 8px' : '8px 12px',
            fontSize: compact ? 10 : 'var(--cc-caption)',
            color: t.textMuted,
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
            lineHeight: 1.45,
          }}
        >
          Fin proyecto: {fmtDateHuman(resumen.fin_proyecto_baseline)} → {fmtDateHuman(resumen.fin_proyecto_target)}
          {' · '}
          Δ fin {fmtDelta(resumen.delta_fin_proyecto_dias, ' d')}
          {' · '}
          {resumen.pct_desviacion_fechas != null ? `${resumen.pct_desviacion_fechas}% fechas` : '—'}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: compact ? '6px 8px' : '8px 12px',
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0,
          fontSize: compact ? 10 : 'var(--cc-caption)',
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: t.text }}>
          <input type="checkbox" checked={soloAtrasados} onChange={(e) => setSoloAtrasados(e.target.checked)} />
          Solo atrasados
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: t.text }}>
          <input type="checkbox" checked={soloCriticos} onChange={(e) => setSoloCriticos(e.target.checked)} />
          Solo críticos
        </label>
        <button
          type="button"
          onClick={() => setSortDesc((d) => !d)}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            fontSize: compact ? 10 : 'var(--cc-caption)',
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            background: t.bg,
            color: t.text,
            cursor: 'pointer',
          }}
        >
          Orden: {sortDesc ? 'mayor Δ fin' : 'menor Δ fin'}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cell.fontSize }}>
          <thead>
            <tr style={{ background: t.bgCard, position: 'sticky', top: 0, zIndex: 1 }}>
              {['PK', 'WBS', 'BL inicio', 'Act inicio', 'Δ días', 'BL fin', 'Act fin', 'Δ dur', 'Δ costo', 'Estado'].map((h) => (
                <th
                  key={h}
                  style={{
                    ...cell,
                    fontWeight: 700,
                    color: t.textMuted,
                    textAlign: h.startsWith('Δ') || h === 'PK' ? 'center' : 'left',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...cell, color: t.textMuted, textAlign: 'center', padding: 16 }}>
                  Sin diferencias con los filtros actuales.
                </td>
              </tr>
            )}
            {filtered.map((n) => {
              const tipo = n.tipo_cambio || 'sin_cambio'
              const color = COMPARE_COLORS[tipo] || t.text
              return (
                <tr key={`${n.pk_id}-${n.capitulo}-${n.agrupador_id ?? n.codigo_wbs ?? n.label}`}>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 600 }}>{n.pk_id}</td>
                  <td style={{ ...cell, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.label}>
                    {n.codigo_wbs || n.label || '—'}
                  </td>
                  <td style={cell}>{fmtDateHuman(n.baseline?.fecha_inicio)}</td>
                  <td style={cell}>{fmtDateHuman(n.target?.fecha_inicio)}</td>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 600 }}>{fmtDelta(n.delta?.dias_fin)}</td>
                  <td style={cell}>{fmtDateHuman(n.baseline?.fecha_fin)}</td>
                  <td style={cell}>{fmtDateHuman(n.target?.fecha_fin)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{fmtDelta(n.delta?.duracion)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{n.delta?.costo != null ? fmtCOP(n.delta.costo) : '—'}</td>
                  <td style={{ ...cell, color, fontWeight: 600 }}>
                    {COMPARE_LABELS[tipo] || tipo}
                    {n.es_ruta_critica_target ? ' · RC' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
