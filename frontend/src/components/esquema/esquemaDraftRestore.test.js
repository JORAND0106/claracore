import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildEsquemaDraftSnapshot, esquemaDraftIsDirty } from './esquemaDraft.js'
import { orbitAnglesForView } from './esquema3dViews.js'
import { syncSolidsWithEntities, extrudeClosedEntity } from './esquema3dSolids.js'
import { metersToWorld } from './esquemaGeometry.js'

/**
 * Verifica el contrato de restauración de borrador que aplica EsquemaEditorModal:
 * refs de vista/órbita, sync sólido↔contorno y dirty.
 */
describe('continuar borrador — contrato de restauración', () => {
  it('snapshot 3D es dirty y conserva sólidos + vista', () => {
    const solid = extrudeClosedEntity({
      id: 'r1',
      type: 'rect',
      x1: 0,
      y1: 0,
      x2: metersToWorld(3.5),
      y2: metersToWorld(3.5),
    }, { viewId: 'top', cotaSuperior: 100, cotaInferior: 98 }).solid

    const snap = buildEsquemaDraftSnapshot({
      objects: [{
        id: 'r1',
        type: 'rect',
        x1: metersToWorld(1),
        y1: metersToWorld(1),
        x2: metersToWorld(4.5),
        y2: metersToWorld(4.5),
      }],
      mode3d: true,
      view3d: 'iso-ne',
      solids3d: [solid],
      pan: { x: 10, y: 20 },
      zoom: 1.25,
    })
    assert.equal(esquemaDraftIsDirty(snap), true)
    assert.equal(snap.mode3d, true)
    assert.equal(snap.view3d, 'iso-ne')
    assert.equal(snap.solids3d.length, 1)

    // Al restaurar: ángulos de la vista iso deben ser finitos
    const angles = orbitAnglesForView(snap.view3d)
    assert.ok(Number.isFinite(angles.yaw) && Number.isFinite(angles.pitch))

    // Sync al continuar: sólido sigue al contorno reposicionado
    const { solids, changed } = syncSolidsWithEntities(snap.solids3d, snap.objects)
    assert.equal(changed, true)
    assert.ok(Math.abs(solids[0].cells[0].ring[0].x - metersToWorld(1)) < 1e-6)
    assert.ok(Math.abs(solids[0].volumeM3 - 24.5) < 1e-9)
  })
})
