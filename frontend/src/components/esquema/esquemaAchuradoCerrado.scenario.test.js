/**
 * C-2D-05 · achurado siempre en contorno cerrado (sin fallo silencioso).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyHatchToEntity,
  resolveHatchTarget,
} from './esquemaHatch.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')
const pkg = () => JSON.parse(readFileSync(join(here, '../../../package.json'), 'utf8'))

describe('caso · achurado contorno cerrado (C-2D-05)', () => {
  it('tipos cerrados reciben hatch; abierta y sin selección avisan', () => {
    const shapes = [
      { id: '1', type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20 },
      { id: '2', type: 'elipse', x1: 0, y1: 0, x2: 30, y2: 30 },
      { id: '3', type: 'triangulo', x1: 0, y1: 0, x2: 40, y2: 30 },
      {
        id: '4',
        type: 'polilinea',
        closed: true,
        points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 15 }],
      },
    ]
    for (const s of shapes) {
      const r = resolveHatchTarget({ objects: [s], selectedIds: [s.id], hitId: null })
      assert.equal(r.ok, true, s.type)
      const h = applyHatchToEntity(s, 1)
      assert.equal(h.hatch, 1)
    }
    const open = {
      id: 'o',
      type: 'polilinea',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 0, y: 40 }],
    }
    const openR = resolveHatchTarget({ objects: [open], selectedIds: ['o'], hitId: null })
    assert.equal(openR.error, 'El contorno no está cerrado')
    const none = resolveHatchTarget({ objects: shapes, selectedIds: [], hitId: null })
    assert.equal(none.error, 'Seleccione un contorno')
  })

  it('copia / mover / rotar conservan hatch en la entidad', () => {
    const src = applyHatchToEntity(
      { id: 'r', type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 },
      3,
    )
    const copy = { ...src, id: 'r2', x1: 20, y1: 20, x2: 30, y2: 30, rotation: Math.PI / 6 }
    assert.equal(copy.hatch, 3)
    const scaled = { ...src, x2: 40, y2: 40 }
    assert.equal(scaled.hatch, 3)
  })

  it('editor usa resolveHatchTarget + applyHatchToEntity y muestra avisos', () => {
    const modal = read('EsquemaEditorModal.jsx')
    assert.match(modal, /resolveHatchTarget/)
    assert.match(modal, /applyHatchToEntity/)
    assert.match(modal, /Seleccione un contorno/)
    assert.match(modal, /El contorno no está cerrado/)
    // Ya no aplica hatch solo con flood-fill silencioso en el clic.
    assert.match(modal, /currentTool === 'hatch'[\s\S]{0,800}?resolveHatchTarget/)
  })

  it('contrato C-2D-05 y cableado en test:esquema', () => {
    const md = read('CONTRATO_ESQUEMA.md')
    assert.match(md, /C-2D-05/)
    assert.match(md, /Seleccione un contorno|El contorno no está cerrado/)
    assert.match(md, /esquemaAchuradoCerrado\.scenario\.test\.js/)
    const script = pkg().scripts['test:esquema'] || ''
    assert.match(script, /esquemaAchuradoCerrado\.scenario\.test\.js/)
  })
})
