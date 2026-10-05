/**
 * Franja visual de cobertura con solape/hueco resaltado (Auditoría SicoeObra).
 * Gráfico de barras permanente para la zona pisada / hueco en la ventana comparativa.
 */
import { useMemo } from 'react'
import { fmtAbscisaK, parseAbsNum } from './sicoeAuditoriaTraslapos'

function txt(v) {
  return String(v ?? '').trim()
}

function fmtMedidaM(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const s = Math.abs(n - Math.round(n)) < 1e-9
    ? String(Math.round(n))
    : n.toLocaleString('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
  return `${s} m`
}

export function FranjaCoberturaHallazgo({ t, hallazgo, registros }) {
  const tipo = txt(hallazgo?.tipo).toLowerCase()
  const esVacio = tipo === 'vacio'
  const hiLo = parseAbsNum(hallazgo?.abs_desde)
  const hiHi = parseAbsNum(hallazgo?.abs_hasta)
  const medidaTxt = fmtMedidaM(hallazgo?.medida_m)

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
    return { min: min - pad, max: max + pad, dataMin: min, dataMax: max }
  }, [ranges, hiLo, hiHi])

  const tituloSeccion = esVacio ? 'Hueco entre reportes' : 'Zona pisada'
  const labelHallazgo = esVacio ? 'Hueco' : 'Solape'

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
  const highlightColor = esVacio ? '#d97706' : '#dc2626'
  const chartH = Math.max(56, 16 + ranges.length * 26)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 'var(--cc-sm)', color: t.text, fontWeight: 800 }}>
        {tituloSeccion}
        {medidaTxt ? (
          <span style={{ color: highlightColor, marginLeft: 8, fontWeight: 800 }}>
            {medidaTxt}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 600 }}>
        {hiLo != null && hiHi != null
          ? `${labelHallazgo}: ${fmtAbscisaK(hiLo)} → ${fmtAbscisaK(hiHi)}`
          : 'Cobertura de registros por abscisas'}
      </div>
      <div
        role="img"
        aria-label={`${tituloSeccion}${medidaTxt ? ` ${medidaTxt}` : ''}`}
        style={{
          position: 'relative',
          height: chartH,
          background: t.inputBg || t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          /* visible: no cortar barras ni etiquetas */
          overflow: 'visible',
          minWidth: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            top: 12,
            height: 2,
            background: t.border,
          }}
        />
        {hiLo != null && hiHi != null && (
          <div
            title={`${labelHallazgo} ${fmtAbscisaK(hiLo)}–${fmtAbscisaK(hiHi)}${medidaTxt ? ` · ${medidaTxt}` : ''}`}
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
              minWidth: 2,
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
              top: 20 + i * 26,
              height: 16,
              background: i % 2 === 0 ? '#0ea5e9' : '#8b5cf6',
              borderRadius: 4,
              opacity: 0.9,
              minWidth: 2,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 'var(--cc-caption)',
          color: t.textMuted,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{fmtAbscisaK(extent.dataMin)}</span>
        <span>{fmtAbscisaK(extent.dataMax)}</span>
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
                flexShrink: 0,
              }}
            />
            {r.label} ({fmtAbscisaK(r.lo)}–{fmtAbscisaK(r.hi)})
          </span>
        ))}
        {hiLo != null && hiHi != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: highlightColor }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: highlightColor, flexShrink: 0 }} />
            {labelHallazgo}{medidaTxt ? ` · ${medidaTxt}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export default FranjaCoberturaHallazgo
