/**
 * Franja visual de cobertura con solape/hueco resaltado (Auditoría SicoeObra).
 */
import { useMemo } from 'react'
import { fmtAbscisaK, parseAbsNum } from './sicoeAuditoriaTraslapos'

function txt(v) {
  return String(v ?? '').trim()
}

export function FranjaCoberturaHallazgo({ t, hallazgo, registros }) {
  const tipo = txt(hallazgo?.tipo).toLowerCase()
  const hiLo = parseAbsNum(hallazgo?.abs_desde)
  const hiHi = parseAbsNum(hallazgo?.abs_hasta)

  const ranges = useMemo(() => {
    const list = []
    for (const r of registros || []) {
      const a0 = parseAbsNum(r?.abs_inicio)
      const a1 = parseAbsNum(r?.abs_final)
      if (a0 == null || a1 == null) continue
      const lo = Math.min(a0, a1)
      const hi = Math.max(a0, a1)
      list.push({
        lo,
        hi,
        label: r?.numero_registro != null ? `Reg. ${r.numero_registro}` : `ID ${r?.id}`,
        id: r?.id,
      })
    }
    return list
  }, [registros])

  const extent = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const r of ranges) {
      if (r.lo < min) min = r.lo
      if (r.hi > max) max = r.hi
    }
    if (hiLo != null && hiLo < min) min = hiLo
    if (hiHi != null && hiHi > max) max = hiHi
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
    const pad = Math.max((max - min) * 0.08, 1)
    return { min: min - pad, max: max + pad }
  }, [ranges, hiLo, hiHi])

  if (!extent || !ranges.length) {
    return (
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, padding: '8px 0' }}>
        {tipo === 'traslapo' && hallazgo?.pk_id_id
          ? `Traslapo puntual en PK ${hallazgo.pk_id_id} (sin abscisas lineales).`
          : 'Sin abscisas para dibujar la franja de cobertura.'}
      </div>
    )
  }

  const span = extent.max - extent.min
  const highlightColor = tipo === 'vacio' ? '#d97706' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>
        Cobertura
        {hiLo != null && hiHi != null
          ? ` · ${tipo === 'vacio' ? 'Hueco' : 'Solape'}: ${fmtAbscisaK(hiLo)} → ${fmtAbscisaK(hiHi)}`
          : ''}
      </div>
      <div
        style={{
          position: 'relative',
          height: 12 + ranges.length * 22,
          background: t.inputBg || t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            top: 10,
            height: 2,
            background: t.border,
          }}
        />
        {hiLo != null && hiHi != null && (
          <div
            title={`${tipo === 'vacio' ? 'Hueco' : 'Solape'} ${fmtAbscisaK(hiLo)}–${fmtAbscisaK(hiHi)}`}
            style={{
              position: 'absolute',
              left: `calc(8px + (100% - 16px) * ${(hiLo - extent.min) / span})`,
              width: `calc((100% - 16px) * ${Math.max(hiHi - hiLo, 0) / span})`,
              top: 0,
              bottom: 0,
              background: `${highlightColor}33`,
              borderLeft: `2px solid ${highlightColor}`,
              borderRight: `2px solid ${highlightColor}`,
              pointerEvents: 'none',
            }}
          />
        )}
        {ranges.map((r, i) => (
          <div
            key={`${r.id}-${i}`}
            title={`${r.label}: ${fmtAbscisaK(r.lo)}–${fmtAbscisaK(r.hi)}`}
            style={{
              position: 'absolute',
              left: `calc(8px + (100% - 16px) * ${(r.lo - extent.min) / span})`,
              width: `calc((100% - 16px) * ${Math.max(r.hi - r.lo, 0) / span})`,
              top: 18 + i * 22,
              height: 14,
              background: i % 2 === 0 ? '#0ea5e9' : '#8b5cf6',
              borderRadius: 4,
              opacity: 0.85,
              minWidth: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 'var(--cc-caption)', color: t.textMuted }}>
        {ranges.map((r, i) => (
          <span key={`leg-${r.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: i % 2 === 0 ? '#0ea5e9' : '#8b5cf6',
              }}
            />
            {r.label} ({fmtAbscisaK(r.lo)}–{fmtAbscisaK(r.hi)})
          </span>
        ))}
        {hiLo != null && hiHi != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: highlightColor }} />
            {tipo === 'vacio' ? 'Hueco' : 'Solape'}
          </span>
        )}
      </div>
    </div>
  )
}

export default FranjaCoberturaHallazgo
