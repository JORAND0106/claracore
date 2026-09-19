/**
 * SVG paramétrico de sección típica (datos del motor backend).
 */
export default function PlanillaTuberiaSeccionSvg({ seccionTipica, ui }) {
  const st = seccionTipica || {}
  const B = Math.max(Number(st.ancho_excavacion_m) || 1.2, 0.4)
  const D = Math.max(Number(st.diametro_externo_m) || 0.6, 0.2)
  const hRel = Math.max(Number(st.altura_relleno_m) || 0.2, 0.05)
  const hExc = Math.max(Number(st.prom_altura_excavacion) || B, 0.5)
  const tipo = st.tipo || 'ALCANTARILLA'

  const W = 360
  const H = 260
  const scale = Math.min(200 / B, 160 / Math.max(hExc, D + hRel + 0.3))
  const cx = W / 2
  const trenchW = B * scale
  const trenchH = hExc * scale
  const top = 36
  const left = cx - trenchW / 2
  const pipeR = (D / 2) * scale
  const bedH = hRel * scale
  const pipeCy = top + trenchH - bedH - pipeR * 0.15

  return (
    <div style={{ border: `1px solid ${ui?.border || '#cbd5e1'}`, borderRadius: 8, padding: 8, background: ui?.cardBg || '#fff' }}>
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, marginBottom: 4, color: ui?.textMuted || '#64748b' }}>
        Sección típica — {tipo}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sección típica de tubería">
        <rect x={left} y={top} width={trenchW} height={trenchH} fill="#f1f5f9" stroke="#334155" strokeWidth="2" />
        <rect x={left} y={top + trenchH - bedH} width={trenchW} height={bedH} fill="#fde68a" stroke="#b45309" strokeWidth="1" opacity="0.85" />
        <circle cx={cx} cy={pipeCy} r={pipeR} fill={tipo === 'FILTRO' ? '#7dd3fc' : '#94a3b8'} stroke="#0f172a" strokeWidth="2" />
        <line x1={left - 12} y1={top} x2={left - 12} y2={top + trenchH} stroke="#0ea5e9" strokeWidth="1.5" />
        <text x={left - 16} y={top + trenchH / 2} fontSize="10" fill="#0369a1" textAnchor="end" dominantBaseline="middle">
          {`h_exc ${Number(st.prom_altura_excavacion || 0).toFixed(2)}`}
        </text>
        <line x1={left} y1={top + trenchH + 14} x2={left + trenchW} y2={top + trenchH + 14} stroke="#64748b" strokeWidth="1.2" />
        <text x={cx} y={top + trenchH + 28} fontSize="10" fill="#475569" textAnchor="middle">
          {`B=${B.toFixed(2)} m · Øext=${D.toFixed(3)} m · h_atr=${hRel.toFixed(3)} m (${st.relacion_atraque || ''})`}
        </text>
        <text x={cx} y={H - 8} fontSize="10" fill="#64748b" textAnchor="middle">
          {`A1=${Number(st.area_1_m2 || 0).toFixed(4)} m² · A2=${Number(st.area_2_m2 || 0).toFixed(4)} m²`}
        </text>
      </svg>
    </div>
  )
}
