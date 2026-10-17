/**
 * Casos a–e: toggle de comandos, Op con íconos, nombres obligatorios, panel ampliable.
 * (Paneo de gestos se verifica por contrato de estilos/handlers; ver CONTRATO.)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createCalcLine,
  createVolumeCalc,
  calcLineHasNombre,
  lastCalcLineNeedsNombre,
  volumeCalcsHaveUnnamed,
  calcTotalM3,
} from './esquema3dCalc.js'
import { ESQUEMA_CONTEXT_SIDEBAR_W, squareModalOuterSize } from './esquemaGeometry.js'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, solidVolumeM3 } from './esquema3dSolids.js'

/** Simula el toggle de la barra: segundo clic → selección. */
function toggleTool(current, clickedId) {
  if (current === clickedId && clickedId !== 'seleccion') return 'seleccion'
  return clickedId
}

describe('comandos activar/desactivar · caso a', () => {
  it('segundo clic en el mismo comando vuelve a selección', () => {
    let tool = 'seleccion'
    tool = toggleTool(tool, 'lapiz')
    assert.equal(tool, 'lapiz')
    tool = toggleTool(tool, 'lapiz')
    assert.equal(tool, 'seleccion')
    tool = toggleTool(tool, 'paneo')
    assert.equal(tool, 'paneo')
    tool = toggleTool(tool, 'paneo')
    assert.equal(tool, 'seleccion')
    tool = toggleTool(tool, 'seleccion')
    assert.equal(tool, 'seleccion')
  })
})

describe('columna Op con íconos · caso c', () => {
  it('cambiar sum ↔ subtract actualiza el total', () => {
    const box = extrudeClosedEntity({
      id: 'b', type: 'rect',
      x1: 0, y1: 0, x2: metersToWorld(2), y2: metersToWorld(2),
    }, { viewId: 'top', cotaSuperior: 1, cotaInferior: 0 }).solid
    box.id = 'b'
    const hole = extrudeClosedEntity({
      id: 'h', type: 'rect',
      x1: metersToWorld(0.5), y1: metersToWorld(0.5),
      x2: metersToWorld(1.5), y2: metersToWorld(1.5),
    }, { viewId: 'top', cotaSuperior: 1, cotaInferior: 0 }).solid
    hole.id = 'h'
    const calc = createVolumeCalc('T')
    calc.lines = [
      createCalcLine({ solidId: 'b', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'h', nombre: 'Hueco', op: 'sum' }),
    ]
    const solids = [box, hole]
    const sumBoth = calcTotalM3(calc, solids)
    calc.lines[1].op = 'subtract'
    calc.lines[1].discountFromSolidId = 'b'
    const after = calcTotalM3(calc, solids)
    assert.ok(after < sumBoth)
    assert.ok(Math.abs(after - (solidVolumeM3(box) - solidVolumeM3(hole))) < 0.02
      || Math.abs(after - (round2ish(solidVolumeM3(box)) - round2ish(solidVolumeM3(hole)))) < 0.05)
  })
})

function round2ish(n) {
  return Math.round(Number(n) * 100) / 100
}

describe('panel lateral ampliable · caso d', () => {
  it('squareModalOuterSize admite ancho ≥ 300 y hasta 560 sin solapar (lado se ajusta)', () => {
    const base = squareModalOuterSize(1400, 900, ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(base.sidebar, ESQUEMA_CONTEXT_SIDEBAR_W)
    const wide = squareModalOuterSize(1400, 900, 480)
    assert.equal(wide.sidebar, 480)
    assert.equal(wide.w, wide.side + 480)
    assert.ok(wide.side <= base.side || wide.w > base.w)
    assert.ok(wide.side >= 280)
  })
})

describe('nombres obligatorios · caso e', () => {
  it('createCalcLine deja nombre vacío (sin Sólido N automático)', () => {
    const line = createCalcLine({ solidId: 'a', op: 'sum' })
    assert.equal(line.nombre, '')
    assert.equal(calcLineHasNombre(line), false)
  })

  it('bloquea agregar otro si el último no tiene nombre', () => {
    const calc = createVolumeCalc('C')
    calc.lines = [createCalcLine({ solidId: 'a', nombre: '', op: 'sum' })]
    assert.ok(lastCalcLineNeedsNombre(calc))
    calc.lines[0].nombre = 'Muro'
    assert.equal(lastCalcLineNeedsNombre(calc), null)
  })

  it('volumeCalcsHaveUnnamed bloquea guardar', () => {
    const calc = createVolumeCalc('C')
    calc.lines = [
      createCalcLine({ solidId: 'a', nombre: 'Ok', op: 'sum' }),
      createCalcLine({ solidId: 'b', nombre: '  ', op: 'sum' }),
    ]
    assert.equal(volumeCalcsHaveUnnamed([calc]), true)
    calc.lines[1].nombre = 'Placa'
    assert.equal(volumeCalcsHaveUnnamed([calc]), false)
  })
})
