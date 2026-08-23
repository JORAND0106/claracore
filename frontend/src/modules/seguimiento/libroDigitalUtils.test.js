import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actaEstaBloqueada,
  buildActasPages,
  buildBitacoraPages,
  personalConCantidad,
} from './libroDigitalUtils.js'

describe('buildBitacoraPages', () => {
  it('agrupa por día: diario antes que eventos, fechas ascendentes', () => {
    const pages = buildBitacoraPages([
      { id: 3, tipo: 'evento', fecha: '2026-08-12', created_at: '2026-08-12T14:00:00Z', evento_tipo: 'novedades' },
      { id: 1, tipo: 'diario', fecha: '2026-08-12', created_at: '2026-08-12T08:00:00Z' },
      { id: 2, tipo: 'evento', fecha: '2026-08-12', created_at: '2026-08-12T10:00:00Z', evento_tipo: 'visita_terceros' },
      { id: 4, tipo: 'diario', fecha: '2026-08-10', created_at: '2026-08-10T09:00:00Z' },
      { id: 5, tipo: 'evento', fecha: '2026-08-11', created_at: '2026-08-11T11:00:00Z' },
    ])
    assert.deepEqual(
      pages.map((p) => `${p.kind}:${p.sourceId}`),
      ['diario:4', 'evento:5', 'diario:1', 'evento:2', 'evento:3'],
    )
  })

  it('omite filas sin fecha', () => {
    const pages = buildBitacoraPages([
      { id: 1, tipo: 'diario', fecha: '' },
      { id: 2, tipo: 'diario', fecha: '2026-08-01' },
    ])
    assert.equal(pages.length, 1)
    assert.equal(pages[0].sourceId, 2)
  })
})

describe('buildActasPages', () => {
  it('ordena por fecha y consecutivo; marca bloqueadas', () => {
    const pages = buildActasPages([
      { id: 2, consecutivo: 2, fecha_reunion: '2026-08-20', puede_abrir: true },
      { id: 1, consecutivo: 1, fecha_reunion: '2026-08-10', puede_abrir: false },
      { id: 3, consecutivo: 3, fecha_reunion: '2026-08-10', acceso_restringido: true },
    ])
    assert.equal(pages[0].kind, 'acta_bloqueada')
    assert.equal(pages[0].sourceId, 1)
    assert.equal(pages[1].kind, 'acta_bloqueada')
    assert.equal(pages[1].sourceId, 3)
    assert.equal(pages[2].kind, 'acta')
    assert.equal(pages[2].sourceId, 2)
  })
})

describe('helpers', () => {
  it('actaEstaBloqueada', () => {
    assert.equal(actaEstaBloqueada({ puede_abrir: false }), true)
    assert.equal(actaEstaBloqueada({ acceso_restringido: true }), true)
    assert.equal(actaEstaBloqueada({ puede_abrir: true }), false)
  })

  it('personalConCantidad filtra ceros', () => {
    assert.equal(personalConCantidad([
      { cargo: 'Oficial', cantidad: 2 },
      { cargo: 'Ayudante', cantidad: 0 },
    ]).length, 1)
  })
})
