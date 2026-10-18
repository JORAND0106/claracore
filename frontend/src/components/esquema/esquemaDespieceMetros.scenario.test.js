/**
 * Captura en metros, Forma en cm, peso kg/m con precisión real (#4 = 0,994).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computePositionMetrics,
  despieceFmtPesoKgM,
  despiecePesoKgM,
  normalizeDespiecePosition,
  segmentDisplayLabel,
  round2,
} from './esquemaDespiece.js'
import { blankSegmentsForShape, getBuiltinShape } from './esquemaDespieceShapes.js'
import { SICOE_VARILLA_PESOS_KG_M } from '../../modules/sicoe-obra/sicoeVarilla.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('caso a · Parrilla Superior en metros', () => {
  it('0,20+0,76+0,20 ×2 → 1,16 / 2,32 m · 0,994 · 2,31 kg; Forma en cm', () => {
    assert.equal(despiecePesoKgM('#4'), 0.994)
    assert.equal(despieceFmtPesoKgM(0.994), '0,994')
    // Tabla SicoeObra intacta
    assert.equal(SICOE_VARILLA_PESOS_KG_M['1/2'], 0.99)

    const shape = getBuiltinShape('doble_gancho_180')
    const segs = blankSegmentsForShape(shape)
    segs[0].lengthM = '0.20'
    segs[1].lengthM = '0.76'
    segs[2].lengthM = '0.20'
    const pos = {
      id: 'ps',
      name: 'Parrilla Superior',
      diameter: '1/2',
      pieces: 2,
      shapeId: 'doble_gancho_180',
      segments: segs,
      units: 'm',
    }
    const m = computePositionMetrics(pos)
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1.16)
    assert.equal(m.totalM, 2.32)
    assert.equal(m.pesoKgM, 0.994)
    assert.equal(m.pesoKg, 2.31)
    assert.equal(round2(2.32 * 0.994), 2.31)

    assert.equal(segmentDisplayLabel(segs[0]).value, 20)
    assert.equal(segmentDisplayLabel(segs[1]).value, 76)
    assert.equal(segmentDisplayLabel(segs[2]).value, 20)
  })
})

describe('caso b · As1a variable en metros', () => {
  it('0,20 + var 0,40–1,18 + 0,20 ×8 → 1,19 / 9,52 · 9,46 kg', () => {
    const shape = getBuiltinShape('doble_gancho')
    const segs = blankSegmentsForShape(shape)
    segs[0].lengthM = '0.20'
    segs[1].mode = 'variable'
    segs[1].minM = '0.40'
    segs[1].maxM = '1.18'
    segs[2].lengthM = '0.20'
    const m = computePositionMetrics({
      id: 'as1a',
      name: 'As1a',
      diameter: '#4',
      pieces: 8,
      shapeId: 'doble_gancho',
      segments: segs,
    })
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1.19)
    assert.equal(m.totalM, 9.52)
    assert.equal(m.pesoKg, 9.46)
    const d = segmentDisplayLabel(segs[1])
    assert.equal(d.varLine, 'Var. 40 a 118')
    assert.equal(d.promLine, 'Prom. 79')
  })
})

describe('caso c · posición guardada en cm conserva resultados', () => {
  it('migra lengthCm → lengthM sin cambiar parcial/total/peso', () => {
    const legacy = {
      id: 'old',
      name: 'As1',
      diameter: '1/2',
      pieces: 16,
      shapeId: 'doble_gancho',
      segments: [
        { id: 'left', name: 'Gancho izquierdo', mode: 'unica', lengthCm: '20' },
        { id: 'center', name: 'Tramo central', mode: 'unica', lengthCm: '155' },
        { id: 'right', name: 'Gancho derecho', mode: 'unica', lengthCm: '20' },
      ],
    }
    const before = computePositionMetrics(legacy)
    assert.equal(before.partialM, 1.95)
    assert.equal(before.totalM, 31.2)
    const norm = normalizeDespiecePosition(legacy)
    assert.equal(norm.segments[0].lengthM, '0.2')
    assert.equal(norm.segments[1].lengthM, '1.55')
    assert.equal(norm.units, 'm')
    const after = computePositionMetrics(norm)
    assert.equal(after.partialM, before.partialM)
    assert.equal(after.totalM, before.totalM)
    assert.equal(after.pesoKg, before.pesoKg)
  })
})

describe('caso d · UI/PNG metros + cm + precisión', () => {
  it('panel muestra «m»; export/forma en cm; fmt 0,994', () => {
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /lengthM/)
    assert.match(panel, />m</)
    assert.match(panel, /minM/)
    assert.doesNotMatch(panel, /Longitud cm/)
    const core = readFileSync(join(__dirname, 'esquemaDespiece.js'), 'utf8')
    assert.match(core, /0\.994/)
    assert.match(core, /DESPIECE_PESOS_KG_M_PRECISION/)
    assert.match(core, /segmentDisplayLabel/)
    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /normalizeDespiecePosition/)
  })
})

describe('contrato · metros y precisión', () => {
  it('documento actualizado', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /metros/i)
    assert.match(md, /0,994|0\.994/)
    assert.match(md, /esquemaDespieceMetros/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaDespieceMetros\.scenario\.test\.js/)
  })
})
