/**
 * C-3D-05 — Extruir por cotas: superior | altura | inferior (±), fila única,
 * placeholders, edición y selección de cálculo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metersToWorld } from './esquemaGeometry.js'
import {
  extrudeClosedEntity,
  solidVolumeM3,
  updateExtrudedSolid,
  validateCotas,
} from './esquema3dSolids.js'
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

describe('C-3D-05 · sync superior|altura|inferior', () => {
  it('b) superior 1502,234 + altura 0,631 → inferior 1501,603', () => {
    let s = { superior: '', inferior: '', altura: '', lastKept: 'altura' }
    s = syncExtrudeCotasFields(s, 'superior', '1502,234')
    s = syncExtrudeCotasFields(s, 'altura', '0,631')
    assert.equal(s.inferior, '1501.603')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.ok, true)
    assert.equal(r.cotaSuperior, 1502.234)
    assert.equal(r.cotaInferior, 1501.603)
    assert.ok(Math.abs(r.altura - 0.631) < 1e-9)
  })

  it('c) superior 1502,234 + altura −0,631 → inferior 1502,865', () => {
    let s = { superior: '1502.234', inferior: '', altura: '', lastKept: 'inferior' }
    s = syncExtrudeCotasFields(s, 'altura', '-0.631')
    assert.equal(s.inferior, '1502.865')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.cotaInferior, 1502.234)
    assert.equal(r.cotaSuperior, 1502.865)
  })

  it('d) superior 100 + inferior 98 → altura 2,000', () => {
    let s = { superior: '', inferior: '', altura: '', lastKept: 'inferior' }
    s = syncExtrudeCotasFields(s, 'superior', '100')
    s = syncExtrudeCotasFields(s, 'inferior', '98')
    assert.equal(s.altura, '2.000')
    const r = resolveExtrudeCotasPair(s)
    assert.equal(r.cotaSuperior, 100)
    assert.equal(r.cotaInferior, 98)
  })

  it('con altura escrita, cambia superior → conserva altura y recalcula inferior', () => {
    let s = {
      superior: '1502.234', inferior: '1501.603', altura: '0.631', lastKept: 'altura',
    }
    s = syncExtrudeCotasFields(s, 'superior', '1500')
    assert.equal(s.altura, '0.631')
    assert.equal(s.inferior, formatCota3(1500 - 0.631))
  })

  it('altura 0 → aviso y no extruye', () => {
    const r = resolveExtrudeCotasPair({ superior: '100', inferior: '100', altura: '0' })
    assert.equal(r.ok, false)
    assert.match(r.error, /altura.*cero/i)
  })
})

describe('C-3D-05 · sólido, memoria y edición', () => {
  it('b) sólido entre cotas; memoria superior/inferior + volumen', () => {
    const r = resolveExtrudeCotasPair({
      superior: '1502.234', inferior: '1501.603', altura: '0.631',
    })
    const ent = rectAt(0, 0, 1, 1, 'b')
    const sa = extrudeClosedEntity(ent, {
      viewId: 'top',
      cotaSuperior: r.cotaSuperior,
      cotaInferior: r.cotaInferior,
    })
    assert.equal(sa.ok, true)
    assert.ok(Math.abs(solidVolumeM3(sa.solid) - 0.631) < 1e-9)
    const ma = describeSolidForMemoria(sa.solid)
    assert.ok(Math.abs(ma.cotaSuperior - 1502.234) < 1e-9)
    assert.ok(Math.abs(ma.cotaInferior - 1501.603) < 1e-9)

    // e) editar altura a 0,500 → volumen 0,500
    const upd = updateExtrudedSolid(sa.solid, ent, {
      cotaSuperior: 1502.234,
      cotaInferior: 1501.734,
    })
    assert.equal(upd.ok, true)
    assert.equal(upd.solid.id, sa.solid.id)
    assert.ok(Math.abs(solidVolumeM3(upd.solid) - 0.5) < 1e-9)
  })

  it('c) altura negativa: sólido entre 1502,234 y 1502,865', () => {
    const r = resolveExtrudeCotasPair({
      superior: '1502.234', inferior: '1502.865', altura: '-0.631',
    })
    assert.equal(r.cotaSuperior, 1502.865)
    assert.equal(r.cotaInferior, 1502.234)
    const v = validateCotas(r.cotaSuperiorCampo, r.cotaInferiorCampo)
    assert.equal(v.ok, true)
    assert.equal(v.z0, 1502.234)
    assert.equal(v.z1, 1502.865)
  })

  it('f) updateExtrudedSolid por longitud', () => {
    const ent = rectAt(0, 0, 2, 1, 'lat')
    const created = extrudeClosedEntity(ent, {
      viewId: 'front',
      lengthM: 0.3,
      faceDepthWorld: 0,
    })
    assert.equal(created.ok, true, created.error)
    const upd = updateExtrudedSolid(created.solid, ent, { lengthM: 0.5 })
    assert.equal(upd.ok, true, upd.error)
    assert.ok(Math.abs(Number(upd.solid.extrudeParams.lengthM) - 0.5) < 1e-9)
  })
})

describe('C-3D-05 · UI fila + placeholders + edición + calc', () => {
  it('a) una sola fila superior|altura|inferior; placeholders; sin texto largo', () => {
    const ui = readFileSync(join(__dirname, 'esquema3dUi.jsx'), 'utf8')
    const start = ui.indexOf('const EXTRUDE_COTA_PLACEHOLDERS')
    const extrudeFn = ui.slice(
      start >= 0 ? start : ui.indexOf('export function Esquema3dExtrudePopup'),
      ui.indexOf('export function Esquema3dSolevarPanel'),
    )
    assert.match(extrudeFn, /esquema-extruir-cotas-fila/)
    assert.match(extrudeFn, /gridTemplateColumns:\s*'1fr 1fr 1fr'/)
    assert.match(extrudeFn, /Cota superior/)
    assert.match(extrudeFn, /Cota inferior/)
    assert.match(extrudeFn, /esquema-extruir-cota-sup/)
    assert.match(extrudeFn, /esquema-extruir-cota-inf/)
    assert.match(extrudeFn, /esquema-extruir-altura/)
    assert.match(extrudeFn, /1502,234/)
    assert.match(extrudeFn, /placeholder=\{EXTRUDE_COTA_PLACEHOLDERS/)
    assert.doesNotMatch(extrudeFn, /Cota de partida/)
    assert.doesNotMatch(extrudeFn, /Cota de llegada/)
    assert.doesNotMatch(extrudeFn, /Altura = llegada/)
    assert.doesNotMatch(extrudeFn, /El sólido se construye entre las dos cotas/)
    // Nueva extrusión: campos vacíos (no precarga 100/98)
    assert.match(extrudeFn, /superior: ''/)
    assert.match(extrudeFn, /initialCotas/)
    assert.match(extrudeFn, /editing/)
  })

  it('modal reedita extrusión y actualiza sólido', () => {
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /updateExtrudedSolid/)
    assert.match(src, /solidCanEditExtrusion/)
    assert.match(src, /editing:\s*true/)
    assert.match(src, /editSolidId/)
    assert.match(src, /initialCotas/)
  })

  it('g) cálculo: hover no pega selección; clic selecciona el sólido exacto', () => {
    const panel = readFileSync(join(__dirname, 'esquema3dCalcPanel.jsx'), 'utf8')
    assert.match(panel, /onHoverSolid/)
    assert.match(panel, /onMouseEnter=\{\(\) => onHoverSolid/)
    assert.match(panel, /onMouseLeave=\{\(\) => onHoverSolid/)
    assert.doesNotMatch(panel, /onMouseEnter=\{\(\) => onHighlightSolid/)
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /calcHoverSolidId/)
    assert.match(modal, /onHoverSolid/)
  })

  it('contrato documenta fila + edición + selección', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /Cota superior/)
    assert.match(md, /fila horizontal/i)
    assert.match(md, /placeholder/i)
    assert.match(md, /esquemaExtrudeCotasAltura/)
  })
})
