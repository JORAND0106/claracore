/**
 * Perfil longitudinal — series del motor (nulls rompen la polilínea).
 * Incluye grilla de referencia (abscisas × cotas) para lectura intermedia.
 */
import { fmtNDash } from './planillaTuberiaUtils'

function niceStep(span, targetTicks = 5) {
  if (!(span > 0)) return 1
  const raw = span / Math.max(targetTicks, 1)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  let step
  if (n <= 1) step = 1
  else if (n <= 2) step = 2
  else if (n <= 5) step = 5
  else step = 10
  return step * pow
}

function ticks(min, max, target = 5) {
  const span = max - min
  if (!(span > 0)) return [min]
  const step = niceStep(span, target)
  const start = Math.ceil(min / step) * step
  const out = []
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(v)
  if (!out.length || out[0] > min + step * 0.01) out.unshift(min)
  if (out[out.length - 1] < max - step * 0.01) out.push(max)
  return out
}

export default function PlanillaTuberiaPerfil({ perfil, ui }) {
  const p = perfil || {}
  const abs = p.abscisas || []
  const tn = p.terreno_natural || []
  const nv = p.nivel_referencia || []
  const cfe = p.cota_fondo_excavacion || []

  const nums = [...tn, ...nv, ...cfe].filter((v) => v != null && !Number.isNaN(Number(v))).map(Number)
  const absN = abs.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number)
  if (absN.length < 2 || nums.length < 2) {
    return (
      <div style={{ padding: 12, color: ui?.textMuted || '#64748b', fontSize: 'var(--cc-sm)' }}>
        Perfil longitudinal: capture al menos dos abscisas con cotas.
      </div>
    )
  }
  const minA = Math.min(...absN)
  const maxA = Math.max(...absN)
  const minY = Math.min(...nums)
  const maxY = Math.max(...nums)
  const W = 520
  const H = 220
  const pad = { l: 48, r: 16, t: 24, b: 36 }
  const xScale = (W - pad.l - pad.r) / Math.max(maxA - minA, 1e-6)
  const yScale = (H - pad.t - pad.b) / Math.max(maxY - minY, 1e-6)
  const yBase = H - pad.b
  const xOf = (a) => pad.l + (Number(a) - minA) * xScale
  const yOf = (v) => yBase - (Number(v) - minY) * yScale

  const xTicks = ticks(minA, maxA, 6)
  const yTicks = ticks(minY, maxY, 5)

  function poly(vals, color) {
    const chunks = []
    let cur = []
    for (let i = 0; i < abs.length; i += 1) {
      const a = abs[i]
      const v = vals[i]
      if (a == null || v == null || Number.isNaN(Number(a)) || Number.isNaN(Number(v))) {
        if (cur.length) { chunks.push(cur); cur = [] }
        continue
      }
      cur.push(`${xOf(a)},${yOf(v)}`)
    }
    if (cur.length) chunks.push(cur)
    return chunks.map((c, i) => (
      <polyline key={`${color}-${i}`} points={c.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    ))
  }

  return (
    <div style={{ border: `1px solid ${ui?.border || '#cbd5e1'}`, borderRadius: 8, padding: 8, background: ui?.cardBg || '#fff' }}>
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, marginBottom: 4, color: ui?.textMuted || '#64748b' }}>
        Perfil longitudinal
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Perfil longitudinal">
        {/* Grilla de referencia */}
        {xTicks.map((a, i) => (
          <line
            key={`gx-${i}`}
            x1={xOf(a)}
            y1={pad.t}
            x2={xOf(a)}
            y2={yBase}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        {yTicks.map((v, i) => (
          <line
            key={`gy-${i}`}
            x1={pad.l}
            y1={yOf(v)}
            x2={W - pad.r}
            y2={yOf(v)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={yBase} stroke="#94a3b8" />
        <line x1={pad.l} y1={yBase} x2={W - pad.r} y2={yBase} stroke="#94a3b8" />
        {poly(tn, '#166534')}
        {poly(nv, '#1d4ed8')}
        {poly(cfe, '#b45309')}
        <text x={pad.l} y={14} fontSize="10" fill="#166534">TN</text>
        <text x={pad.l + 40} y={14} fontSize="10" fill="#1d4ed8">{p.etiqueta_nivel || 'Nivel'}</text>
        <text x={pad.l + 140} y={14} fontSize="10" fill="#b45309">CFE</text>
        {yTicks.map((v, i) => (
          <text key={`yl-${i}`} x={pad.l - 4} y={yOf(v) + 3} fontSize="8" fill="#94a3b8" textAnchor="end">
            {fmtNDash(v, 2)}
          </text>
        ))}
        <text x={pad.l} y={H - 8} fontSize="9" fill="#64748b">{fmtNDash(minA, 2)}</text>
        <text x={W - pad.r} y={H - 8} fontSize="9" fill="#64748b" textAnchor="end">{fmtNDash(maxA, 2)}</text>
      </svg>
    </div>
  )
}
