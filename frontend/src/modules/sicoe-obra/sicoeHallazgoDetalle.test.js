/**
 * Franja de cobertura del detalle de hallazgo + layout comparativa (regresión).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAbsNum } from './sicoeAuditoriaTraslapos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

describe('SicoeHallazgoDetalle layout comparativa', () => {
  const src = readFileSync(join(__dirname, 'SicoeHallazgoDetalle.jsx'), 'utf8')
  const franja = readFileSync(join(__dirname, 'SicoeHallazgoFranja.jsx'), 'utf8')

  it('ya no monta el plano SVG de dos puntos (ComparativaMapa)', () => {
    assert.doesNotMatch(src, /SicoeHallazgoComparativaMapa/)
    assert.match(src, /FranjaCoberturaHallazgo/)
  })

  it('bloquea scroll del fondo y usa scroll de contenido contenido', () => {
    assert.match(src, /position = 'fixed'/)
    assert.match(src, /touchmove/)
    assert.match(src, /overscrollBehavior: 'contain'/)
    assert.match(src, /data-sicoe-comparativa-scroll="body"/)
    assert.match(src, /Justificación/)
  })

  it('franja muestra medida y abscisas sin overflow hidden en el chart', () => {
    assert.match(franja, /medidaTxt/)
    assert.match(franja, /overflow: 'visible'/)
    assert.match(franja, /Zona pisada/)
    assert.match(franja, /Hueco entre reportes/)
  })
})
