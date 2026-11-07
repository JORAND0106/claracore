/**
 * C-3D-05 — Extruir por cotas: partida / llegada / altura editable (±).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, solidVolumeM3, validateCotas } from './esquema3dSolids.js'
import { describeSolidForMemoria } from './esquema3dCalc.js'
import {
  formatCota3,
  resolveExtrudeCotasPair,
  syncExtrudeCotasFields,
} from './esquema3dCalc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function rectAt(xM, yM, wM, hM, id = 'r') {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(xM),
    y1: metersToWorld(yM),
    x2: metersToWorld(xM + wM),
    y2: metersToWorld(yM + hM),
  }
}

describe('C-3D-05 · syncExtrudeCotasFields', () => {
  it('a) partida 1502,234 + altura −0,631 → llegada 1501,603', () => {
    let s = {
      partida: '', llegada: '', altura: '', lastKept: 'altura',
    }
    s = syncExtrudeCotasFields(s, 'partida', '1502,234')
    s = syncExtrudeCotasFields(s, 'altura', '-0,631')
    assert.equal(s.llegada, '1501.603')
    assert.equal(s.lastKept, 'altura')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.ok, true)
    assert.equal(r.cotaSuperior, 1502.234)
    assert.equal(r.cotaInferior, 1501.603)
    assert.ok(Math.abs(r.altura - (-0.631)) < 1e-9)
  })

  it('b) partida 1502,234 + altura 0,631 → llegada 1502,865', () => {
    let s = { partida: '1502.234', llegada: '', altura: '', lastKept: 'llegada' }
    s = syncExtrudeCotasFields(s, 'altura', '0.631')
    assert.equal(s.llegada, '1502.865')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.cotaInferior, 1502.234)
    assert.equal(r.cotaSuperior, 1502.865)
  })

  it('c) partida 100 + llegada 98 → altura −2,000', () => {
    let s = { partida: '', llegada: '', altura: '', lastKept: 'llegada' }
    s = syncExtrudeCotasFields(s, 'partida', '100')
    s = syncExtrudeCotasFields(s, 'llegada', '98')
    assert.equal(s.altura, '-2.000')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.cotaSuperior, 100)
    assert.equal(r.cotaInferior, 98)
  })

  it('d) con altura escrita, cambia partida → conserva altura y recalcula llegada', () => {
    let s = { partida: '1502.234', llegada: '1501.603', altura: '-0.631', lastKept: 'altura' }
    s = syncExtrudeCotasFields(s, 'partida', '1500')
    assert.equal(s.altura, '-0.631')
    assert.equal(s.llegada, formatCota3(1500 - 0.631))
    assert.equal(s.lastKept, 'altura')
  })

  it('e) altura 0 → aviso y no extruye', () => {
    const r = resolveExtrudeCotasPair({ partida: '100', llegada: '100', altura: '0' })
    assert.equal(r.ok, false)
    assert.match(r.error, /altura.*cero/i)
  })
})

describe('C-3D-05 · sólido y memoria', () => {
  it('a/b) sólido entre cotas reales; memoria superior/inferior + volumen', () => {
    // a) 1×1 m entre 1501.603 y 1502.234 → vol = 0.631
    const ra = resolveExtrudeCotasPair({
      partida: '1502.234', llegada: '1501.603', altura: '-0.631',
    })
    const sa = extrudeClosedEntity(rectAt(0, 0, 1, 1, 'a'), {
      viewId: 'top',
      cotaSuperior: ra.cotaSuperior,
      cotaInferior: ra.cotaInferior,
    })
    assert.equal(sa.ok, true)
    assert.ok(Math.abs(solidVolumeM3(sa.solid) - 0.631) < 1e-9)
    const ma = describeSolidForMemoria(sa.solid)
    assert.ok(Math.abs(ma.cotaSuperior - 1502.234) < 1e-9)
    assert.ok(Math.abs(ma.cotaInferior - 1501.603) < 1e-9)
    assert.ok(Math.abs(ma.volumeM3 - 0.631) < 1e-9)

    // b) 1×1 m entre 1502.234 y 1502.865 → vol = 0.631
    const rb = resolveExtrudeCotasPair({
      partida: '1502.234', llegada: '1502.865', altura: '0.631',
    })
    const sb = extrudeClosedEntity(rectAt(0, 0, 1, 1, 'b'), {
      viewId: 'top',
      cotaSuperior: rb.cotaSuperior,
      cotaInferior: rb.cotaInferior,
    })
    assert.equal(sb.ok, true)
    assert.ok(Math.abs(solidVolumeM3(sb.solid) - 0.631) < 1e-9)
    const mb = describeSolidForMemoria(sb.solid)
    assert.ok(Math.abs(mb.cotaSuperior - 1502.865) < 1e-9)
    assert.ok(Math.abs(mb.cotaInferior - 1502.234) < 1e-9)
  })

  it('c) misma geometría que cota superior 100 / inferior 98', () => {
    const r = resolveExtrudeCotasPair({ partida: '100', llegada: '98' })
    assert.deepEqual(
      { z1: r.cotaSuperior, z0: r.cotaInferior },
      { z1: 100, z0: 98 },
    )
    const v = validateCotas(100, 98)
    const vInv = validateCotas(98, 100)
    assert.equal(v.ok && vInv.ok, true)
    assert.equal(v.z0, vInv.z0)
    assert.equal(v.z1, vInv.z1)
  })
})

describe('C-3D-05 · UI popup', () => {
  it('campos partida/llegada/altura editables en popup Extruir', () => {
    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    const extrudeFn = ui.slice(
      ui.indexOf('export function Esquema3dExtrudePopup'),
      ui.indexOf('export function Esquema3dSolevarPanel'),
    )
    assert.match(extrudeFn, /Cota de partida/)
    assert.match(extrudeFn, /Cota de llegada/)
    assert.match(extrudeFn, /esquema-extruir-cota-partida/)
    assert.match(extrudeFn, /esquema-extruir-cota-llegada/)
    assert.match(extrudeFn, /esquema-extruir-altura/)
    assert.match(extrudeFn, /syncExtrudeCotasFields/)
    assert.match(extrudeFn, /resolveExtrudeCotasPair/)
    assert.doesNotMatch(extrudeFn, /Altura calculada/)
    assert.doesNotMatch(extrudeFn, /solo lectura/)
    // Conserva extrusión por longitud
    assert.match(extrudeFn, /esquema-extruir-longitud/)
  })

  it('contrato documenta altura ±', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /Cota de partida/)
    assert.match(md, /altura.*positiva o negativa/i)
    assert.match(md, /esquemaExtrudeCotasAltura/)
  })
})
