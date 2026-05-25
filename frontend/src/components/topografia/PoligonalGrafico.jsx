import { useMemo } from 'react'
import { card } from './topografiaShared'

export default function PoligonalGrafico({ estaciones, ancho = 520, alto = 360 }) {
  const puntos = useMemo(() => (estaciones || []).filter((e) => e.norte_ajustado != null && e.este_ajustado != null), [estaciones])

  const svg = useMemo(() => {
    if (!puntos.length) return null
    const nortes = puntos.map((p) => p.norte_ajustado)
    const estes = puntos.map((p) => p.este_ajustado)
    let minN = Math.min(...nortes), maxN = Math.max(...nortes)
    let minE = Math.min(...estes), maxE = Math.max(...estes)
    const pad = Math.max(maxN - minN, maxE - minE, 1) * 0.15
    minN -= pad; maxN += pad; minE -= pad; maxE += pad
    const tx = (e) => 40 + ((e - minE) / Math.max(maxE - minE, 0.001)) * (ancho - 80)
    const ty = (n) => alto - 40 - ((n - minN) / Math.max(maxN - minN, 0.001)) * (alto - 80)
    const coords = puntos.map((p) => `${tx(p.este_ajustado)},${ty(p.norte_ajustado)}`).join(' ')
    return { coords, puntos, tx, ty }
  }, [puntos, ancho, alto])

  if (!svg) {
    return <div style={{ ...card, color: '#64748b' }}>Calcule la poligonal para ver el grafico.</div>
  }

  return (
    <div style={card}>
      <svg width="100%" viewBox={`0 0 ${ancho} ${alto}`} style={{ maxHeight: alto, background: '#f8fafc', borderRadius: 8 }}>
        <polygon points={svg.coords} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth="2" />
        {svg.puntos.map((p) => (
          <g key={p.id || p.nombre_punto}>
            <circle cx={svg.tx(p.este_ajustado)} cy={svg.ty(p.norte_ajustado)} r="4" fill="#2563eb" />
            <text x={svg.tx(p.este_ajustado) + 6} y={svg.ty(p.norte_ajustado) - 6} fontSize="10" fill="#1e293b">{p.nombre_punto}</text>
          </g>
        ))}
        <text x={ancho - 20} y="20" fontSize="10" fill="#64748b">N</text>
        <line x1={ancho - 20} y1="26" x2={ancho - 20} y2="8" stroke="#64748b" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
