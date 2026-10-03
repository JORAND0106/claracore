/**
 * Franja de cobertura del detalle de hallazgo (lógica de rangos).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAbsNum } from './sicoeAuditoriaTraslapos.js'

/** Misma lógica de extent que FranjaCoberturaHallazgo (sin React). */
function extentCobertura(hallazgo, registros) {
  const hiLo = parseAbsNum(hallazgo?.abs_desde)
  const hiHi = parseAbsNum(hallazgo?.abs_hasta)
  const ranges = []
  for (const r of registros || []) {
    const a0 = parseAbsNum(r?.abs_inicio)
    const a1 = parseAbsNum(r?.abs_final)
    if (a0 == null || a1 == null) continue
    ranges.push({ lo: Math.min(a0, a1), hi: Math.max(a0, a1) })
  }
  let min = Infinity
  let max = -Infinity
  for (const r of ranges) {
    if (r.lo < min) min = r.lo
    if (r.hi > max) max = r.hi
  }
  if (hiLo != null && hiLo < min) min = hiLo
  if (hiHi != null && hiHi > max) max = hiHi
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
  return { min, max, ranges, highlight: hiLo != null && hiHi != null ? { lo: hiLo, hi: hiHi } : null }
}

describe('extentCobertura hallazgo', () => {
  it('incluye solape de traslapo dentro del extent', () => {
    const e = extentCobertura(
      { tipo: 'traslapo', abs_desde: 8, abs_hasta: 10 },
      [
        { abs_inicio: 0, abs_final: 10 },
        { abs_inicio: 8, abs_final: 20 },
      ],
    )
    assert.ok(e)
    assert.equal(e.highlight.lo, 8)
    assert.equal(e.highlight.hi, 10)
    assert.ok(e.min <= 0)
    assert.ok(e.max >= 20)
  })

  it('devuelve null si no hay abscisas', () => {
    assert.equal(
      extentCobertura({ tipo: 'traslapo', pk_id_id: 5 }, [{ pk_id_id: 5 }]),
      null,
    )
  })
})
