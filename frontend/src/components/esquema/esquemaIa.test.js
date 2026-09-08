import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  IA_MAX_USOS,
  hydrateIaObjects,
  iaBlocked,
  iaFechaBogota,
  iaHasScene,
  iaRemainingHoy,
  readLocalIaUsos,
  sceneForIa,
  writeLocalIaUsos,
} from './esquemaIa.js'

describe('esquemaIa', () => {
  it('cupo diario: 20 usos por usuario; se bloquea al llegar al tope', () => {
    assert.equal(IA_MAX_USOS, 20)
    assert.equal(iaRemainingHoy(0), 20)
    assert.equal(iaRemainingHoy(7), 13)
    assert.equal(iaRemainingHoy(20), 0)
    assert.equal(iaBlocked(19), false)
    assert.equal(iaBlocked(20), true)
  })

  it('el cache local se reinicia al cambiar el día de Bogotá', () => {
    const store = {}
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
    }
    writeLocalIaUsos(11, '2026-09-07')
    assert.equal(readLocalIaUsos('2026-09-07'), 11)
    assert.equal(readLocalIaUsos('2026-09-08'), 0)
    assert.match(iaFechaBogota(new Date('2026-09-08T04:30:00Z')), /^\d{4}-\d{2}-\d{2}$/)
  })

  it('iaHasScene ignora solo el fondo raster', () => {
    assert.equal(iaHasScene([{ type: 'image', fit: true }]), false)
    assert.equal(iaHasScene([{ type: 'image', fit: true }, { type: 'rect', x1: 0, y1: 0, x2: 2, y2: 2 }]), true)
  })

  it('hidrata rect y texto y descarta tipos prohibidos', () => {
    const objs = hydrateIaObjects([
      { type: 'rect', x1: 0, y1: 0, x2: 60, y2: 60 },
      { type: 'texto', x: 0, y: 70, text: 'Planta' },
      { type: 'image', url: 'x' },
      { type: 'bloque', children: [] },
    ])
    assert.equal(objs.length, 2)
    assert.equal(objs[0].type, 'rect')
    assert.ok(objs[0].id)
    assert.equal(objs[1].text, 'Planta')
  })

  it('sceneForIa omite fondo raster y bloques', () => {
    const scene = sceneForIa([
      { type: 'image', fit: true },
      { type: 'rect', x1: 1, y1: 2, x2: 3, y2: 4 },
      { type: 'hatchRegion', x: 0, y: 0, w: 10, h: 10, hatch: 6, maskDataUri: 'data:huge' },
    ])
    assert.equal(scene.length, 2)
    assert.equal(scene[0].type, 'rect')
    assert.equal(scene[1].type, 'hatchRegion')
    assert.equal(scene[1].maskDataUri, undefined)
  })
})
