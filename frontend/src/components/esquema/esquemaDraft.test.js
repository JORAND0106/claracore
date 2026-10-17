import 'fake-indexeddb/auto'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEsquemaDraftSnapshot,
  esquemaDraftClear,
  esquemaDraftIsDirty,
  esquemaDraftKey,
  esquemaDraftLoad,
  esquemaDraftSave,
  getEsquemaDraftUserId,
} from './esquemaDraft.js'

describe('esquemaDraft', () => {
  const key = esquemaDraftKey({
    module: 'test',
    entityId: 'unit-1',
    userId: 'user-test',
    contratoId: 99,
  })

  before(async () => {
    await esquemaDraftClear(key)
  })

  after(async () => {
    await esquemaDraftClear(key)
  })

  it('clave incluye usuario, módulo y entidad', () => {
    assert.match(key, /cc_esquema_draft_v1:user-test:test:99:unit-1/)
    assert.equal(typeof getEsquemaDraftUserId(), 'string')
  })

  it('isDirty: vacío no, con objetos o sólidos sí', () => {
    assert.equal(esquemaDraftIsDirty(buildEsquemaDraftSnapshot()), false)
    assert.equal(esquemaDraftIsDirty(buildEsquemaDraftSnapshot({
      objects: [{ id: '1', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 }],
    })), true)
    assert.equal(esquemaDraftIsDirty(buildEsquemaDraftSnapshot({
      solids3d: [{ id: 's1', type: 'solid3d', cells: [], volumeM3: 0 }],
    })), true)
  })

  it('guarda y carga borrador completo (2D+3D+cálculos)', async () => {
    const snap = buildEsquemaDraftSnapshot({
      objects: [{ id: 'r1', type: 'rect', x1: 0, y1: 0, x2: 50, y2: 50 }],
      solids3d: [{
        id: 's1',
        type: 'solid3d',
        cells: [{ ring: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], z0: 98, z1: 100 }],
        volumeM3: 24.5,
      }],
      volumeCalcs: [{
        id: 'c1',
        nombre: 'Excavación',
        lines: [{ id: 'l1', solidId: 's1', nombre: 'Caja', op: 'sum' }],
      }],
      mode3d: true,
      view3d: 'iso-ne',
      pan: { x: 12, y: -4 },
      zoom: 1.5,
      mapActive: true,
      mapOpacity: 0.4,
      mapBasemap: 'satelite',
    })
    const saved = await esquemaDraftSave({
      key,
      module: 'test',
      entityId: 'unit-1',
      userId: 'user-test',
      contratoId: 99,
      snapshot: snap,
    })
    assert.equal(saved.ok, true)

    const loaded = await esquemaDraftLoad(key, { userId: 'user-test' })
    assert.ok(loaded)
    assert.equal(loaded.snapshot.mode3d, true)
    assert.equal(loaded.snapshot.view3d, 'iso-ne')
    assert.equal(loaded.snapshot.objects.length, 1)
    assert.equal(loaded.snapshot.solids3d[0].volumeM3, 24.5)
    assert.equal(loaded.snapshot.volumeCalcs[0].nombre, 'Excavación')
    assert.equal(loaded.snapshot.zoom, 1.5)
    assert.equal(loaded.snapshot.mapBasemap, 'satelite')
  })

  it('otro usuario no puede leer el borrador', async () => {
    const other = await esquemaDraftLoad(key, { userId: 'otro-user' })
    assert.equal(other, null)
  })

  it('clear elimina el borrador', async () => {
    await esquemaDraftClear(key)
    const loaded = await esquemaDraftLoad(key, { userId: 'user-test' })
    assert.equal(loaded, null)
  })
})
