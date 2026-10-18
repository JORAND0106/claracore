/**
 * Cuadro de despiece — casos a–g del contrato (C-DES-*).
 * Pesos: tabla NTC 2289 de plataforma (`sicoeVarilla.js`). #4 = Ø 1/2 = 0,99 kg/m.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computePositionMetrics,
  computeScheduleTotalKg,
  createEmptySchedule,
  despiecePesoKgM,
  despieceResolverDiametro,
  fmt2,
  round2,
  segmentDisplayLabel,
  spiralDevelopedLengthCm,
} from './esquemaDespiece.js'
import {
  blankSegmentsForShape,
  buildCustomShapeFromPolyline,
  getBuiltinShape,
  listBuiltinShapes,
} from './esquemaDespieceShapes.js'
import {
  findDespieceShape,
  listAllDespieceShapes,
  loadCustomDespieceShapes,
  saveCustomDespieceShape,
  despieceFormasStorageKey,
} from './esquemaDespieceLibrary.js'
import { SICOE_VARILLA_PESOS_KG_M } from '../../modules/sicoe-obra/sicoeVarilla.js'
import { metersToWorld } from './esquemaGeometry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function dobleGanchoPos({ name, pieces, segs }) {
  const shape = getBuiltinShape('doble_gancho')
  const segments = blankSegmentsForShape(shape).map((s, i) => {
    const conf = segs[i]
    if (conf.mode === 'variable') {
      return { ...s, mode: 'variable', minCm: String(conf.min), maxCm: String(conf.max) }
    }
    return { ...s, mode: 'unica', lengthCm: String(conf.cm) }
  })
  return {
    id: name,
    name,
    diameter: '1/2', // #4
    pieces,
    shapeId: 'doble_gancho',
    segments,
  }
}

describe('despiece · diámetro NTC #4', () => {
  it('#4 resuelve a 1/2 con peso de tabla (0,99)', () => {
    assert.equal(despieceResolverDiametro('#4'), '1/2')
    assert.equal(despiecePesoKgM('#4'), SICOE_VARILLA_PESOS_KG_M['1/2'])
    assert.equal(despiecePesoKgM('#4'), 0.99)
  })
})

describe('caso a · As1 doble gancho 20+155+20 × 16', () => {
  it('1,95 m parcial · 31,20 m total · peso = L×0,99', () => {
    const pos = dobleGanchoPos({
      name: 'As1',
      pieces: 16,
      segs: [{ cm: 20 }, { cm: 155 }, { cm: 20 }],
    })
    const m = computePositionMetrics(pos)
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1.95)
    assert.equal(m.totalM, 31.2)
    assert.equal(m.pesoKg, round2(31.2 * 0.99))
    assert.equal(fmt2(m.pesoKg), '30,89')
  })
})

describe('caso b · As1a variable 40–118 (prom 79)', () => {
  it('1,19 m · 9,52 m · etiqueta Var/Prom', () => {
    const pos = dobleGanchoPos({
      name: 'As1a',
      pieces: 8,
      segs: [{ cm: 20 }, { mode: 'variable', min: 40, max: 118 }, { cm: 20 }],
    })
    const m = computePositionMetrics(pos)
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 1.19)
    assert.equal(m.totalM, 9.52)
    assert.equal(m.pesoKg, round2(9.52 * 0.99))
    const d = segmentDisplayLabel(pos.segments[1])
    assert.equal(d.varLine, 'Var. 40 a 118')
    assert.equal(d.promLine, 'Prom. 79')
  })
})

describe('caso c · As2 variable 160–236 (prom 198)', () => {
  it('2,38 m · 47,60 m', () => {
    const pos = dobleGanchoPos({
      name: 'As2',
      pieces: 20,
      segs: [{ cm: 20 }, { mode: 'variable', min: 160, max: 236 }, { cm: 20 }],
    })
    const m = computePositionMetrics(pos)
    assert.equal(m.ok, true)
    assert.equal(m.partialM, 2.38)
    assert.equal(m.totalM, 47.6)
    assert.equal(m.pesoKg, round2(47.6 * 0.99))
  })
})

describe('caso d · total tres posiciones', () => {
  it('suma de pesos mostrados', () => {
    const positions = [
      dobleGanchoPos({ name: 'As1', pieces: 16, segs: [{ cm: 20 }, { cm: 155 }, { cm: 20 }] }),
      dobleGanchoPos({ name: 'As1a', pieces: 8, segs: [{ cm: 20 }, { mode: 'variable', min: 40, max: 118 }, { cm: 20 }] }),
      dobleGanchoPos({ name: 'As2', pieces: 20, segs: [{ cm: 20 }, { mode: 'variable', min: 160, max: 236 }, { cm: 20 }] }),
    ]
    const total = computeScheduleTotalKg(positions)
    const a = round2(31.2 * 0.99)
    const b = round2(9.52 * 0.99)
    const c = round2(47.6 * 0.99)
    assert.equal(total, round2(a + b + c))
    assert.equal(fmt2(total), '87,43')
  })
})

describe('caso e · fleje, espiral y forma de usuario', () => {
  const mem = new Map()
  before(() => {
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)) },
      removeItem: (k) => { mem.delete(k) },
    }
  })
  after(() => {
    delete globalThis.localStorage
  })

  it('builtin incluye fleje y espiral; fórmula espiral; custom visible a otro usuario', () => {
    const ids = listBuiltinShapes().map((s) => s.id)
    assert.ok(ids.includes('fleje_135'))
    assert.ok(ids.includes('espiral'))
    assert.ok(ids.includes('doble_gancho'))
    assert.ok(ids.includes('recta'))
    assert.ok(ids.includes('aro'))
    assert.ok(ids.includes('escalonada_z'))

    // n × √((π·d)² + paso²)
    const L = spiralDevelopedLengthCm(20, 10, 5)
    const expected = 5 * Math.sqrt((Math.PI * 20) ** 2 + 10 ** 2)
    assert.ok(Math.abs(L - expected) < 1e-9)

    const espiralPos = {
      id: 'e1',
      name: 'Esp1',
      diameter: '1/2',
      pieces: 2,
      shapeId: 'espiral',
      segments: [],
      spiral: { diametroCm: 20, pasoCm: 10, vueltas: 5 },
    }
    const me = computePositionMetrics(espiralPos)
    assert.equal(me.ok, true)
    assert.equal(me.partialM, round2(L / 100))

    const fleje = getBuiltinShape('fleje_135')
    assert.equal(fleje.segments.length, 3)
    assert.ok(fleje.segments.every((s) => s.contrib === 2))
    // L = 2A+2B+2G con A=B=G=25 → 150 cm
    const fSegs = blankSegmentsForShape(fleje).map((s) => ({ ...s, lengthCm: '25' }))
    const mf = computePositionMetrics({
      id: 'f1', name: 'Est1', diameter: '3/8', pieces: 10, shapeId: 'fleje_135', segments: fSegs,
    })
    assert.equal(mf.ok, true)
    assert.equal(mf.partialM, round2((2 * 25 + 2 * 25 + 2 * 25) / 100))
    assert.ok(ids.includes('doble_gancho_180'))

    // Forma creada: usuario A guarda; usuario B (mismo contrato) la ve.
    const poly = {
      type: 'polyline',
      points: [
        { x: metersToWorld(0), y: metersToWorld(0) },
        { x: metersToWorld(1), y: metersToWorld(0) },
        { x: metersToWorld(1), y: metersToWorld(0.5) },
      ],
    }
    const custom = buildCustomShapeFromPolyline(poly, {
      nombre: 'Mi estribo especial',
      segmentNames: ['Tramo A', 'Tramo B'],
    })
    assert.ok(custom)
    assert.equal(custom.segments.length, 2)
    const saved = saveCustomDespieceShape('contrato-test-despiece', custom)
    assert.ok(saved)
    // «Otro usuario»: misma clave de contrato (sin userId) → aparece en catálogo.
    assert.ok(despieceFormasStorageKey('contrato-test-despiece').includes('despiece_formas'))
    const all = listAllDespieceShapes('contrato-test-despiece')
    assert.ok(all.some((s) => s.id === custom.id && s.nombre === 'Mi estribo especial'))
    assert.equal(findDespieceShape('contrato-test-despiece', custom.id)?.builtin, false)
    assert.equal(loadCustomDespieceShapes('contrato-test-despiece').length >= 1, true)
  })
})

describe('caso f · PNG adjunto despiece-acero', () => {
  it('export emite kind despiece-acero y UI/wiring presentes', () => {
    const exp = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(exp, /despiece-acero/)
    assert.match(exp, /composeDespiecePng/)
    assert.match(exp, /Cuadro de despiece/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /buildDespieceAdjuntos|buildDespieceScheduleAdjuntos/)
    assert.match(modal, /esquema-despiece-btn/)
    assert.match(modal, /EsquemaDespiecePanel/)
    const media = readFileSync(join(__dirname, '../adjuntos/adjuntosMedia.js'), 'utf8')
    assert.match(media, /despiece-acero/)
    assert.match(media, /Cuadro de despiece/)
  })
})

describe('caso g · borrador conserva cuadros', () => {
  it('snapshot incluye despieceSchedules; editar recalcula', () => {
    const draft = readFileSync(join(__dirname, 'esquemaDraft.js'), 'utf8')
    assert.match(draft, /despieceSchedules/)
    const schedule = createEmptySchedule('Alcantarilla K1+316 – Cabezal Descole')
    schedule.positions = [
      dobleGanchoPos({ name: 'As1', pieces: 16, segs: [{ cm: 20 }, { cm: 155 }, { cm: 20 }] }),
    ]
    assert.equal(computeScheduleTotalKg(schedule.positions), round2(31.2 * 0.99))
    // Editar piezas → recalcula
    schedule.positions[0] = { ...schedule.positions[0], pieces: 8 }
    assert.equal(computeScheduleTotalKg(schedule.positions), round2(15.6 * 0.99))
  })
})

describe('contrato · C-DES', () => {
  it('documento y package.json incluyen despiece', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /Cuadro de despiece/i)
    assert.match(md, /esquemaDespiece/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaDespiece\.scenario\.test\.js/)
  })
})
