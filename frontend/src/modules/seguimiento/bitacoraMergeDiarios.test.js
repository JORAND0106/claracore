import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeDiariosParaEditor, pickKeeperDiario } from './bitacoraMergeDiarios.js'

describe('bitacoraMergeDiarios', () => {
  it('pickKeeperDiario elige el menor id', () => {
    assert.equal(pickKeeperDiario([{ id: 9 }, { id: 3 }, { id: 7 }]).id, 3)
    assert.equal(pickKeeperDiario([]), null)
  })

  it('mergeDiariosParaEditor concatena asistencia/usos y estampa tramo de origen', () => {
    const merged = mergeDiariosParaEditor([
      {
        id: 2,
        tramo: 'Sur',
        asistencia_colaboradores: [{ nombre: 'Beto', rrhh_trabajador_id: 2 }],
        equipos_uso: [{ equipo_nombre: 'Volqueta' }],
        materiales: [],
        personal: [],
        eventos: [],
        imagenes: [],
      },
      {
        id: 1,
        tramo: 'Norte',
        asistencia_colaboradores: [{ nombre: 'Ana', rrhh_trabajador_id: 1, tramo: 'Norte' }],
        equipos_uso: [{ equipo_nombre: 'Retro', tramo: 'Norte' }],
        materiales: [{ tipo_material: 'Grava' }],
        personal: [{ cargo: 'Oficial', cantidad: 1 }],
        eventos: [{ id: 'e1' }],
        imagenes: [{ nombre: 'f.png' }],
      },
    ])
    assert.equal(merged.id, 1)
    assert.equal(merged.tramo, null)
    assert.deepEqual(merged._merged_from_ids, [1, 2])
    assert.equal(merged.asistencia_colaboradores.length, 2)
    assert.equal(merged.asistencia_colaboradores[0].nombre, 'Ana')
    assert.equal(merged.asistencia_colaboradores[1].nombre, 'Beto')
    assert.equal(merged.asistencia_colaboradores[1].tramo, 'Sur')
    assert.equal(merged.equipos_uso.length, 2)
    assert.equal(merged.equipos_uso.find((u) => u.equipo_nombre === 'Volqueta').tramo, 'Sur')
    assert.equal(merged.materiales[0].tramo, 'Norte')
    assert.equal(merged.eventos.length, 1)
    assert.equal(merged.imagenes.length, 1)
  })

  it('un solo diario se devuelve sin merge meta', () => {
    const one = mergeDiariosParaEditor([{ id: 5, tramo: 'A', asistencia_colaboradores: [] }])
    assert.equal(one.id, 5)
    assert.equal(one._merged_from_ids, undefined)
  })
})
