/**
 * C-DES: doble gancho 180° + fleje comercial + Ø 1/4" + migración legado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computePositionMetrics,
  normalizeDespiecePosition,
  despieceResolverDiametro,
  despiecePesoKgM,
  despieceDiametroOpciones,
  round2,
} from './esquemaDespiece.js'
import {
  blankSegmentsForShape,
  getBuiltinShape,
  listBuiltinShapes,
} from './esquemaDespieceShapes.js'
import { SICOE_VARILLA_PESOS_KG_M, SICOE_VARILLA_DIAMETROS } from '../../modules/sicoe-obra/sicoeVarilla.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('caso a · doble gancho a 180° 15+150+15 ×10', () => {
  it('parcial 1,80 m · total 18,00 m · dibujo con dos ganchos 180°', () => {
    const shape = getBuiltinShape('doble_gancho_180')
    assert.ok(shape)
    assert.equal(shape.nombre, 'Doble gancho a 180°')
    assert.equal(shape.segments.length, 3)
    assert.deepEqual(shape.segments.map((s) => s.id), ['left', 'center', 'right'])
    // Paths: arco izquierdo, tramo, arco derecho
    assert.match(shape.segments[0].path, /A /)
    assert.match(shape.segments[2].path, /A /)
    assert.match(shape.segments[1].path, /^M .* L /)

    const segs = blankSegmentsForShape(shape)
    segs[0].lengthM = '0.15'
    segs[1].lengthM = '1.50'
    segs[2].lengthM = '0.15'
    const m = computePositionMetrics({
      id: 'p1',
      name: 'Dg180',
      diameter: '1/2',
      pieces: 10,
      shapeId: 'doble_gancho_180',
      segments: segs,
    })
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1.8)
    assert.equal(m.totalM, 18)
  })
})

describe('caso b · fleje comercial 22×22 ganchos 6 ×50', () => {
  it('parcial 1,00 m · total 50,00 m · geometría cerrada con ganchos interiores', () => {
    const shape = getBuiltinShape('fleje_135')
    assert.ok(shape)
    assert.match(shape.nombre, /comercial/i)
    assert.equal(shape.segments.length, 3)
    assert.deepEqual(shape.segments.map((s) => s.id), ['ladoA', 'ladoB', 'gancho'])
    // Ganchos hacia adentro (coordenadas dentro del rectángulo aprox.)
    assert.match(shape.segments[2].path, /M 32 84 L 52 68/)
    assert.match(shape.segments[2].path, /M 32 84 L 48 56/)
    // No paths hacia afuera (legado: 18 12 / 18 88)
    assert.doesNotMatch(shape.segments.map((s) => s.path).join(' '), /L 18 12|L 18 88/)

    const segs = blankSegmentsForShape(shape)
    const byId = Object.fromEntries(segs.map((s) => [s.id, s]))
    byId.ladoA.lengthM = '0.22'
    byId.ladoB.lengthM = '0.22'
    byId.gancho.lengthM = '0.06'
    const m = computePositionMetrics({
      id: 'f1',
      name: 'Est',
      diameter: '1/2',
      pieces: 50,
      shapeId: 'fleje_135',
      segments: segs,
    })
    assert.equal(m.ok, true)
    // 2×22 + 2×22 + 2×6 = 100 cm
    assert.equal(m.partialM, 1)
    assert.equal(m.totalM, 50)
  })
})

describe('caso c · fleje legado conserva valores con nueva geometría', () => {
  it('migra h1/top/right/bot/left/h2 → ladoA/ladoB/gancho', () => {
    const legacy = {
      id: 'old',
      name: 'EstOld',
      diameter: '3/8',
      pieces: 50,
      shapeId: 'fleje_135',
      segments: [
        { id: 'h1', name: 'Gancho 135° A', mode: 'unica', lengthCm: '6' },
        { id: 'top', name: 'Lado superior', mode: 'unica', lengthCm: '22' },
        { id: 'right', name: 'Lado derecho', mode: 'unica', lengthCm: '22' },
        { id: 'bot', name: 'Lado inferior', mode: 'unica', lengthCm: '22' },
        { id: 'left', name: 'Lado izquierdo', mode: 'unica', lengthCm: '22' },
        { id: 'h2', name: 'Gancho 135° B', mode: 'unica', lengthCm: '6' },
      ],
    }
    const norm = normalizeDespiecePosition(legacy)
    assert.deepEqual(norm.segments.map((s) => s.id), ['ladoA', 'ladoB', 'gancho'])
    assert.equal(norm.segments.find((s) => s.id === 'ladoA').lengthM, '0.22')
    assert.equal(norm.segments.find((s) => s.id === 'ladoB').lengthM, '0.22')
    assert.equal(norm.segments.find((s) => s.id === 'gancho').lengthM, '0.06')
    const m = computePositionMetrics(legacy)
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1)
    assert.equal(m.totalM, 50)
  })
})

describe('caso d · PNG y UI muestran ambas formas', () => {
  it('export y shapes incluyen doble_gancho_180 y fleje comercial', () => {
    const shapes = readFileSync(join(__dirname, 'esquemaDespieceShapes.js'), 'utf8')
    assert.match(shapes, /doble_gancho_180/)
    assert.match(shapes, /Fleje comercial/)
    assert.match(shapes, /contrib: 2/)
    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /normalizeDespiecePosition/)
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /normalizeDespiecePosition/)
    assert.ok(listBuiltinShapes().some((s) => s.id === 'doble_gancho_180'))
  })
})

describe('diámetro 1/4" (6 mm) en tabla NTC', () => {
  it('está disponible; no se modifica la tabla', () => {
    assert.ok(SICOE_VARILLA_DIAMETROS.includes('1/4'))
    assert.equal(SICOE_VARILLA_PESOS_KG_M['1/4'], 0.25)
    assert.equal(despieceResolverDiametro('1/4'), '1/4')
    assert.equal(despiecePesoKgM('1/4'), 0.25)
    const opts = despieceDiametroOpciones()
    assert.ok(opts.some((o) => o.id === '1/4'))
    // Alias #2 → 1/4
    assert.equal(despieceResolverDiametro('#2'), '1/4')
  })
})

describe('contrato · fleje 180', () => {
  it('documento menciona doble gancho 180 y fleje comercial', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /doble gancho a 180/i)
    assert.match(md, /fleje comercial/i)
    assert.match(md, /esquemaDespieceFleje180/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaDespieceFleje180\.scenario\.test\.js/)
  })
})
