/**
 * Tests: escala real de entidades de biblioteca.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { metersToWorld, worldToMeters, PX_PER_METER } from './esquemaGeometry.js'
import { packLibraryBlock, saveLibraryItem } from './esquemaLibrary.js'
import {
  calibrateLibraryItem,
  calibrateObjectsToMeters,
  canInsertLibraryItemOnPlane,
  formatLibraryMeasuresLabel,
  instantiateLibraryItemAtRealScale,
  libraryItemHasRealMeasures,
  measuresFromObjects,
  rescaleBloqueToLibraryItem,
  syncSceneBloquesToLibrary,
} from './esquemaLibraryScale.js'

const CID = 'test-contrato-escala'

function memStore() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

describe('esquemaLibraryScale', () => {
  beforeEach(() => {
    globalThis.localStorage = memStore()
  })

  it('PX_PER_METER contract', () => {
    assert.equal(PX_PER_METER, 50)
    assert.equal(metersToWorld(1.2), 60)
    assert.equal(worldToMeters(60), 1.2)
  })

  it('medidasFromObjects: círculo 1.20 m de diámetro', () => {
    const d = metersToWorld(1.2)
    const objs = [{ type: 'elipse', x1: 0, y1: 0, x2: d, y2: d }]
    const m = measuresFromObjects(objs)
    assert.ok(Math.abs(m.ancho_m - 1.2) < 1e-9)
    assert.ok(Math.abs(m.alto_m - 1.2) < 1e-9)
  })

  it('save con medidasReales marca la entidad', () => {
    const d = metersToWorld(1.2)
    const item = saveLibraryItem(CID, {
      nombre: 'Pozo',
      objects: [{ type: 'elipse', x1: 0, y1: 0, x2: d, y2: d }],
      medidasReales: true,
    })
    assert.equal(item.medidas_reales, true)
    assert.ok(Math.abs(item.ancho_m - 1.2) < 1e-9)
    assert.equal(libraryItemHasRealMeasures(item), true)
    assert.equal(canInsertLibraryItemOnPlane(item), true)
  })

  it('save sin medidasReales queda pendiente', () => {
    const item = saveLibraryItem(CID, {
      nombre: 'Legacy',
      objects: [{ type: 'rect', x1: 0, y1: 0, x2: 200, y2: 100 }],
      medidasReales: false,
    })
    assert.equal(item.medidas_reales, false)
    assert.equal(libraryItemHasRealMeasures(item), false)
    assert.equal(canInsertLibraryItemOnPlane(item), false)
    assert.match(formatLibraryMeasuresLabel(item), /pendiente/i)
  })

  it('calibrar ancho a 1.20 m escala proporcionalmente', () => {
    // Entidad 200×100 world (= 4×2 m mal dibujada)
    const objects = [{ type: 'rect', x1: 0, y1: 0, x2: 200, y2: 100 }]
    const cal = calibrateObjectsToMeters(objects, 'ancho', 1.2)
    assert.ok(cal)
    assert.ok(Math.abs(cal.ancho_m - 1.2) < 1e-6)
    assert.ok(Math.abs(cal.alto_m - 0.6) < 1e-6) // proporción 2:1
    assert.ok(Math.abs(cal.w - metersToWorld(1.2)) < 1e-6)
  })

  it('calibrateLibraryItem persiste y permite insertar a escala real', () => {
    const item = saveLibraryItem(CID, {
      nombre: 'Pozo legacy',
      objects: [{ type: 'elipse', x1: 0, y1: 0, x2: 200, y2: 200 }],
      medidasReales: false,
    })
    const res = calibrateLibraryItem(CID, item.id, { axis: 'ancho', metros: 1.2 })
    assert.ok(res)
    assert.equal(res.item.medidas_reales, true)
    assert.ok(Math.abs(res.item.ancho_m - 1.2) < 1e-6)
    assert.ok(Math.abs(res.item.alto_m - 1.2) < 1e-6)

    const placed = instantiateLibraryItemAtRealScale(res.item, { x: 500, y: 300 })
    assert.equal(placed.length, 1)
    assert.equal(placed[0].scaleLocked, true)
    assert.ok(Math.abs(placed[0].w - metersToWorld(1.2)) < 1e-6)
    assert.ok(Math.abs(placed[0].x + placed[0].w / 2 - 500) < 1e-6)
    assert.ok(Math.abs(placed[0].y + placed[0].h / 2 - 300) < 1e-6)
  })

  it('syncSceneBloquesToLibrary corrige bloques insertados', () => {
    const item = saveLibraryItem(CID, {
      nombre: 'Caja',
      objects: [{ type: 'rect', x1: 0, y1: 0, x2: 100, y2: 50 }],
      medidasReales: false,
    })
    // Insertado a escala incorrecta (world 100×50)
    const scene = [{
      type: 'bloque',
      id: 'b1',
      libraryId: item.id,
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      rotation: 0,
      children: [{ type: 'rect', x1: 0, y1: 0, x2: 100, y2: 50 }],
    }]
    const cal = calibrateLibraryItem(CID, item.id, { axis: 'ancho', metros: 2 })
    const sync = syncSceneBloquesToLibrary(scene, cal.items)
    assert.equal(sync.changed, true)
    const b = sync.objects[0]
    assert.ok(Math.abs(b.w - metersToWorld(2)) < 1e-6)
    assert.ok(Math.abs(b.h - metersToWorld(1)) < 1e-6)
    // Centro conservado
    assert.ok(Math.abs((b.x + b.w / 2) - (10 + 50)) < 1e-6)
    assert.ok(Math.abs((b.y + b.h / 2) - (20 + 25)) < 1e-6)
    assert.equal(b.scaleLocked, true)
  })

  it('rescaleBloqueToLibraryItem conserva rotación', () => {
    const item = {
      id: 'lib1',
      nombre: 'X',
      medidas_reales: true,
      ancho_m: 1,
      alto_m: 1,
      objects: [{ type: 'rect', x1: 0, y1: 0, x2: metersToWorld(1), y2: metersToWorld(1) }],
    }
    const bloque = {
      type: 'bloque',
      id: 'keep',
      libraryId: 'lib1',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      rotation: Math.PI / 4,
      children: [],
    }
    const next = rescaleBloqueToLibraryItem(bloque, item)
    assert.equal(next.id, 'keep')
    assert.equal(next.rotation, Math.PI / 4)
    assert.ok(Math.abs(next.w - metersToWorld(1)) < 1e-6)
  })

  it('packLibraryBlock + cota: 1.20 m de ancho se mide igual', () => {
    const w = metersToWorld(1.2)
    const packed = packLibraryBlock([{ type: 'rect', x1: 0, y1: 0, x2: w, y2: metersToWorld(0.8) }])
    assert.ok(Math.abs(worldToMeters(packed.w) - 1.2) < 1e-9)
  })
})
