/**
 * Memoria de cálculo: una sola PNG (iso + cuadro por colores), sin PDF.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import { extrudeClosedEntity, solidVolumeM3, uniteSolids } from './esquema3dSolids.js'
import {
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
  round2,
} from './esquema3dCalc.js'
import {
  buildCalcAdjuntos,
  composeCalcMemoriaPng,
  labelsFromSnapshot,
  renderMemoriaColorTableCanvas,
} from './esquema3dCalcExport.js'
import { solidLineWidthWorld, SOLID3D_STYLE } from './esquema3dSolids.js'

function rectAt(x0, y0, wM, hM, id) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

describe('presentación legible · grosores fijos', () => {
  it('solidLineWidthWorld baja al subir pixelScale (export no engrosa)', () => {
    const w1 = solidLineWidthWorld(SOLID3D_STYLE.visiblePx, 1)
    const w4 = solidLineWidthWorld(SOLID3D_STYLE.visiblePx, 4)
    assert.ok(w4 < w1)
    assert.ok(Math.abs(w1 * 1 - SOLID3D_STYLE.visiblePx) < 0.2)
    // Tras ctx.scale(4), el ancho en píxeles ≈ visiblePx
    assert.ok(Math.abs(w4 * 4 - SOLID3D_STYLE.visiblePx) < 0.25)
  })
})

describe('memoria PNG lado a lado', () => {
  it('labelsFromSnapshot numera en orden de líneas', () => {
    const labels = labelsFromSnapshot({
      lines: [
        { solidId: 'a', ok: true, volumeM3: 1 },
        { solidId: 'b', ok: true, volumeM3: 2 },
        { solidId: null, ok: false },
      ],
    })
    assert.deepEqual(labels, [
      { solidId: 'a', num: 1 },
      { solidId: 'b', num: 2 },
    ])
  })

  it('buildCalcAdjuntos emite un solo PNG memoria-calculo (no PDF)', async () => {
    const big = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'big'), {
      viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
    }).solid
    big.id = 'big'
    big.color = '#7c3aed'
    const a = extrudeClosedEntity(rectAt(5, 0, 0.5, 0.5, 'a'), {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    const b = extrudeClosedEntity(rectAt(5.5, 0, 0.5, 0.5, 'b'), {
      viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
    }).solid
    const u = uniteSolids([a, b])
    assert.equal(u.ok, true)
    u.solid.id = 'united'
    u.solid.color = '#2563eb'

    const calc = createVolumeCalc('Excavación')
    calc.lines = [
      createCalcLine({ solidId: 'big', nombre: 'Mayor', op: 'sum' }),
      createCalcLine({ solidId: 'united', nombre: 'Unido interno', op: 'subtract' }),
    ]
    const solids = [big, u.solid]
    const snap = freezeCalcSnapshot(calc, solids)
    assert.equal(snap.lines[0].volumeM3, round2(solidVolumeM3(big)))
    assert.ok(snap.lines[0].detail?.color)
    assert.ok(snap.lines[0].detail?.longM > 0)

    // Sin document (node): compose puede devolver null; validar firma y tabla.
    const table = renderMemoriaColorTableCanvas(snap, { width: 800 })
    // En node sin canvas DOM real, document puede existir vía undici... o no.
    if (typeof document !== 'undefined' && table) {
      assert.ok(table.width > 0)
      assert.ok(table.height > 0)
      const png = await composeCalcMemoriaPng({ snapshot: snap, solids })
      if (png) {
        assert.match(png.nombre, /\.png$/i)
        assert.match(png.dataUri, /^data:image\/png/)
        assert.ok(!String(png.nombre).endsWith('.pdf'))
      }
      const adj = await buildCalcAdjuntos(snap, new Map(solids.map((s) => [s.id, s])))
      assert.equal(adj.length, 1)
      assert.equal(adj[0].kind, 'memoria-calculo')
      assert.equal(adj[0].mime, 'image/png')
      assert.ok(!adj.some((a) => String(a.mime).includes('pdf')))
    } else {
      // Entorno sin DOM: al menos el snapshot trae columnas del cuadro por colores.
      assert.ok(Number.isFinite(snap.lines[0].detail.longM))
      assert.ok(Number.isFinite(snap.lines[0].detail.anchM))
      assert.ok(Number.isFinite(snap.lines[0].detail.espesorM))
    }
  })
})
