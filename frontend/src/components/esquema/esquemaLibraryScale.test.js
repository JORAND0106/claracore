/**
 * Tests: inserción 1:1 de entidades de biblioteca (sin calibración).
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { metersToWorld, worldToMeters, PX_PER_METER } from './esquemaGeometry.js'
import { packLibraryBlock, saveLibraryItem } from './esquemaLibrary.js'
import {
  formatLibraryMeasuresLabel,
  instantiateLibraryItemAtRealScale,
  isScaleLockedBloque,
  measuresFromObjects,
  syncSceneBloquesToLibrary,
} from './esquemaLibraryScale.js'

const CID = 'test-contrato-escala-1a1'

function memStore() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

describe('esquemaLibraryScale 1:1', () => {
  beforeEach(() => {
    globalThis.localStorage = memStore()
  })

  it('PX_PER_METER contract', () => {
    assert.equal(PX_PER_METER, 50)
    assert.equal(metersToWorld(1.2), 60)
    assert.equal(worldToMeters(60), 1.2)
  })

  it('medidasFromObjects refleja lo dibujado', () => {
    const d = metersToWorld(1.2)
    const m = measuresFromObjects([{ type: 'elipse', x1: 0, y1: 0, x2: d, y2: d }])
    assert.ok(Math.abs(m.ancho_m - 1.2) < 1e-9)
    assert.ok(Math.abs(m.alto_m - 1.2) < 1e-9)
  })

  it('saveLibraryItem conserva dimensiones dibujadas (sin flag de calibración)', () => {
    const d = metersToWorld(1.2)
    const item = saveLibraryItem(CID, {
      nombre: 'Pozo',
      objects: [{ type: 'elipse', x1: 0, y1: 0, x2: d, y2: d }],
    })
    assert.ok(Math.abs(item.ancho_m - 1.2) < 1e-9)
    assert.ok(Math.abs(item.alto_m - 1.2) < 1e-9)
    assert.equal(item.medidas_reales, undefined)
    assert.match(formatLibraryMeasuresLabel(item), /1\.20/)
  })

  it('legacy sin ancho_m/alto_m se inserta 1:1 con su geometría', () => {
    const item = {
      id: 'lib-legacy',
      nombre: 'Legacy',
      objects: [{ type: 'rect', x1: 0, y1: 0, x2: 200, y2: 100 }],
      w: 200,
      h: 100,
    }
    const placed = instantiateLibraryItemAtRealScale(item, { x: 500, y: 300 })
    assert.equal(placed.length, 1)
    assert.equal(placed[0].scaleLocked, true)
    assert.equal(placed[0].w, 200)
    assert.equal(placed[0].h, 100)
    assert.ok(Math.abs(placed[0].x + placed[0].w / 2 - 500) < 1e-6)
    assert.ok(Math.abs(placed[0].y + placed[0].h / 2 - 300) < 1e-6)
    assert.equal(isScaleLockedBloque(placed[0]), true)
  })

  it('insertar centra el punto medio en el nodo', () => {
    const d = metersToWorld(1.2)
    const item = saveLibraryItem(CID, {
      nombre: 'Nodo',
      objects: [{ type: 'elipse', x1: 0, y1: 0, x2: d, y2: d }],
    })
    const placed = instantiateLibraryItemAtRealScale(item, { x: 10, y: 20 }, { fromLibraryOnNode: true })
    assert.ok(Math.abs(placed[0].w - d) < 1e-6)
    assert.ok(Math.abs(placed[0].x + placed[0].w / 2 - 10) < 1e-6)
    assert.ok(Math.abs(placed[0].y + placed[0].h / 2 - 20) < 1e-6)
    assert.equal(placed[0].fromLibraryOnNode, true)
  })

  it('syncSceneBloquesToLibrary solo asegura scaleLocked (no reescala)', () => {
    const scene = [{
      type: 'bloque',
      id: 'b1',
      libraryId: 'lib1',
      x: 10,
      y: 20,
      w: 100,
      h: 50,
      children: [],
    }]
    const sync = syncSceneBloquesToLibrary(scene, [{ id: 'lib1', nombre: 'X', objects: [] }])
    assert.equal(sync.changed, true)
    assert.equal(sync.objects[0].scaleLocked, true)
    assert.equal(sync.objects[0].w, 100)
    assert.equal(sync.objects[0].h, 50)
  })

  it('packLibraryBlock + cota: 1.20 m de ancho', () => {
    const w = metersToWorld(1.2)
    const packed = packLibraryBlock([{ type: 'rect', x1: 0, y1: 0, x2: w, y2: metersToWorld(0.8) }])
    assert.ok(Math.abs(worldToMeters(packed.w) - 1.2) < 1e-9)
  })
})
