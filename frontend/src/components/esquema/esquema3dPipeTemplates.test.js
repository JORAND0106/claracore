import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCodoSolid,
  buildPipeTemplateSolid,
  buildReduccionSolid,
  buildTeeSolid,
  buildTuberiaSolid,
  isPipeTemplateSolid,
  PIPE_TEMPLATE_CATALOG,
  pipeAxisCotaFromLomo,
  pipeExteriorVolumeCylinderM3,
  pipeExteriorVolumeElbowM3,
  pipeOuterDiameterM,
  proposePipeAutoConnect,
  applyPipeAutoConnect,
  updatePipeTemplateSolid,
  validatePipeTemplateValues,
} from './esquema3dPipeTemplates.js'
import { naturalFormulaFromOperand } from './esquema3dCalc.js'
import { solidVolumeM3, subtractSolids, extrudeClosedEntity } from './esquema3dSolids.js'
import { metersToWorld } from './esquemaGeometry.js'

describe('esquema3dPipeTemplates · medidas y catálogo', () => {
  it('catálogo incluye tubería, codos, TEE y reducción', () => {
    const ids = PIPE_TEMPLATE_CATALOG.map((t) => t.id)
    assert.deepEqual(ids, [
      'tuberia', 'codo90', 'codo45', 'codo225', 'codo1125', 'tee', 'reduccion',
    ])
  })

  it('caso a) Øext, volumen y eje', () => {
    const de = pipeOuterDiameterM(0.30, 0.02)
    assert.equal(de, 0.34)
    const vol = pipeExteriorVolumeCylinderM3(0.34, 3.00)
    assert.ok(Math.abs(vol - (Math.PI * 0.17 * 0.17 * 3)) < 1e-12)
    assert.equal(Math.round(vol * 1000) / 1000, 0.272)
    const eje = pipeAxisCotaFromLomo(1500, 0.34)
    assert.equal(eje, 1499.83)
  })

  it('placeholders: validación sin precarga; cotas libres', () => {
    const bad = validatePipeTemplateValues('tuberia', {})
    assert.equal(bad.ok, false)
    const ok = validatePipeTemplateValues('tuberia', {
      diM: '0,30',
      espesorM: '0.02',
      lengthM: '3',
      cotaLomo: '1500,000',
    })
    assert.equal(ok.ok, true)
    assert.equal(ok.parsed.deM, 0.34)
    assert.equal(ok.parsed.cotaLomo, 1500)
  })
})

describe('esquema3dPipeTemplates · construcción', () => {
  it('tubería horizontal: volumen exterior y templateMeta', () => {
    const r = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 3, cotaLomo: 1500,
    })
    assert.equal(r.ok, true)
    assert.equal(isPipeTemplateSolid(r.solid), true)
    assert.equal(Math.round(solidVolumeM3(r.solid) * 1000) / 1000, 0.272)
    assert.equal(r.solid.formMeta?.kind, 'cylinder')
    assert.equal(r.solid.templateMeta?.ends?.length, 2)
    assert.equal(r.ejeCota, 1499.83)
  })

  it('tubería con pendiente (cota final distinta)', () => {
    const r = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 3,
      cotaLomo: 1500, cotaLomoFinal: 1499.7,
    })
    assert.equal(r.ok, true)
    assert.equal(Math.round(solidVolumeM3(r.solid) * 1000) / 1000, 0.272)
    const zA = r.solid.templateMeta.ends[0].center.zCota
    const zB = r.solid.templateMeta.ends[1].center.zCota
    assert.ok(Math.abs(zA - 1499.83) < 1e-6)
    assert.ok(Math.abs(zB - (1499.7 - 0.17)) < 1e-6)
  })

  it('codo 90° volumen π r² R θ', () => {
    const vol = pipeExteriorVolumeElbowM3(0.34, 0.5, 90)
    const expected = Math.PI * 0.17 * 0.17 * (0.5 * Math.PI / 2)
    assert.ok(Math.abs(vol - expected) < 1e-12)
    const r = buildCodoSolid('codo90', {
      diM: 0.30, espesorM: 0.02, bendRadiusM: 0.5, cotaLomo: 1500,
    })
    assert.equal(r.ok, true)
    assert.ok(Math.abs(solidVolumeM3(r.solid) - vol) < 1e-9)
    assert.equal(r.solid.formMeta?.kind, 'pipe_elbow')
  })

  it('TEE y reducción construyen y calculan', () => {
    const tee = buildTeeSolid({
      diM: 0.30, diBranchM: 0.20, espesorM: 0.02,
      lengthM: 1.2, branchLengthM: 0.6, cotaLomo: 1500,
    })
    assert.equal(tee.ok, true)
    assert.equal(tee.solid.templateMeta?.ends?.length, 3)
    assert.ok(solidVolumeM3(tee.solid) > 0)

    const red = buildReduccionSolid({
      diMajorM: 0.30, diMinorM: 0.20, espesorM: 0.02,
      lengthM: 0.5, cotaLomo: 1500,
    })
    assert.equal(red.ok, true)
    assert.equal(red.solid.formMeta?.kind, 'cone_frustum')
    const expect = Math.PI * (0.5 / 3) * (0.17 ** 2 + 0.17 * 0.12 + 0.12 ** 2)
    assert.ok(Math.abs(solidVolumeM3(red.solid) - expect) < 1e-9)
  })

  it('editar diámetro actualiza el sólido en su lugar', () => {
    const first = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 3, cotaLomo: 1500,
    })
    const id = first.solid.id
    const upd = updatePipeTemplateSolid(first.solid, {
      diM: 0.40, espesorM: 0.02, lengthM: 3, cotaLomo: 1500,
    })
    assert.equal(upd.ok, true)
    assert.equal(upd.solid.id, id)
    assert.equal(upd.solid.templateMeta.params.diM, 0.40)
    assert.equal(upd.solid.formMeta.diameterM, 0.44)
  })

  it('sustraer tubería de concreto descuenta volumen exterior', () => {
    const pipe = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 3, cotaLomo: 1.0,
    }).solid
    // Muro vertical (vista top) que envuelve el tubo horizontal.
    const wall = extrudeClosedEntity({
      type: 'rect',
      id: 'muro',
      x1: metersToWorld(-0.5),
      y1: metersToWorld(-0.5),
      x2: metersToWorld(3.5),
      y2: metersToWorld(0.5),
    }, {
      viewId: 'top',
      cotaSuperior: 1.5,
      cotaInferior: 0.5,
    }).solid
    const before = solidVolumeM3(wall)
    const sub = subtractSolids(wall, [pipe])
    assert.equal(sub.ok, true)
    // La plataforma redondea operandos a 2 decimales en booleanos (p. ej. 0,272 → 0,27).
    const delta = Math.round((before - solidVolumeM3(sub.solid)) * 100) / 100
    const pipeV = Math.round(solidVolumeM3(pipe) * 100) / 100
    assert.equal(delta, pipeV)
    assert.equal(sub.solid.booleanMeta?.subtracted?.[0]?.volumeM3, pipeV)
  })

  it('conexión automática pega extremos cercanos', () => {
    const a = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 1, cotaLomo: 1500,
    }, { originM: { x: 0, y: 0 } }).solid
    const b = buildTuberiaSolid({
      diM: 0.30, espesorM: 0.02, lengthM: 1, cotaLomo: 1500,
    }, { originM: { x: 1.05, y: 0 } }).solid
    const prop = proposePipeAutoConnect(b, [a], { thresholdM: 0.12 })
    assert.ok(prop)
    const connected = applyPipeAutoConnect(b, prop)
    const endIn = connected.templateMeta.ends[0].center
    const endOut = a.templateMeta.ends[1].center
    assert.ok(Math.abs(endIn.x - endOut.x) < 1e-6)
    assert.ok(Math.abs(endIn.y - endOut.y) < 1e-6)
    assert.ok(Math.abs(endIn.zCota - endOut.zCota) < 1e-6)
  })

  it('memoria: fórmula natural de tubería y codo', () => {
    const pipe = buildPipeTemplateSolid('tuberia', {
      diM: 0.30, espesorM: 0.02, lengthM: 3, cotaLomo: 1500,
    }).solid
    const nat = naturalFormulaFromOperand({
      volumeM3: solidVolumeM3(pipe),
      formMeta: pipe.formMeta,
    })
    assert.match(nat.formula, /π/)
    assert.match(nat.formula, /0[,.]17/)

    const elbow = buildCodoSolid('codo90', {
      diM: 0.30, espesorM: 0.02, bendRadiusM: 0.5, cotaLomo: 1500,
    }).solid
    const natE = naturalFormulaFromOperand({
      volumeM3: solidVolumeM3(elbow),
      formMeta: elbow.formMeta,
    })
    assert.match(natE.forma, /Codo/)
    assert.match(natE.formula, /π/)
  })
})
