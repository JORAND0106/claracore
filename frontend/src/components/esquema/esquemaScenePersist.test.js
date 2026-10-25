import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canShowEditarEsquema,
  esquemaSceneToDataUri,
  hasEditableEsquemaScene,
  normalizeEsquemaScene,
  parseEsquemaScene,
  sceneFromSaveExtras,
} from './esquemaScenePersist.js'

describe('esquemaScenePersist', () => {
  it('normaliza snapshot editable con 2D/3D/cálculo', () => {
    const snap = normalizeEsquemaScene({
      objects: [{ id: '1', type: 'linea', x1: 0, y1: 0, x2: 10, y2: 0 }],
      solids3d: [{ id: 's1' }],
      volumeCalcs: [{ id: 'c1', lines: [{ id: 'l1' }] }],
      title: 'Prueba',
    })
    assert.ok(snap)
    assert.equal(snap.objects.length, 1)
    assert.equal(snap.solids3d.length, 1)
    assert.equal(snap.title, 'Prueba')
  })

  it('round-trip data URI', () => {
    const snap = normalizeEsquemaScene({
      objects: [{ id: 'a', type: 'nodo', x: 1, y: 2 }],
      title: 'Nodo',
    })
    const uri = esquemaSceneToDataUri(snap)
    assert.match(uri, /^data:application\/json;base64,/)
    const back = parseEsquemaScene(uri)
    assert.equal(back.objects[0].id, 'a')
    assert.equal(back.title, 'Nodo')
  })

  it('sceneFromSaveExtras lee extras.scene', () => {
    const s = sceneFromSaveExtras({
      scene: { objects: [{ id: '1', type: 'rect', x: 0, y: 0, w: 5, h: 5 }] },
    })
    assert.equal(s.objects.length, 1)
  })

  it('hasEditableEsquemaScene / canShowEditarEsquema', () => {
    assert.equal(hasEditableEsquemaScene({ scene: { objects: [{ id: 1, type: 'linea' }] } }), true)
    assert.equal(hasEditableEsquemaScene({ origen: 'esquema' }), false)
    assert.equal(canShowEditarEsquema({
      hasScene: true, canEdit: true, sealed: false,
    }), true)
    assert.equal(canShowEditarEsquema({
      hasScene: true, canEdit: true, sealed: true,
    }), false)
    assert.equal(canShowEditarEsquema({
      hasDraft: true, canEdit: false, sealed: false,
    }), false)
    assert.equal(canShowEditarEsquema({
      hasDraft: true, canEdit: true, sealed: false,
    }), true)
  })
})
