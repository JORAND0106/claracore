import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoFObraCamposVacios,
  pptoFilaCoincideFObra,
  pptoFiltroDef,
  pptoFiltroValoresLista,
  pptoAppendFObraToSearchParams,
} from './pptoFiltroCatalogo.js'

describe('filtro Infraestructura', () => {
  it('está en el catálogo Ubicación como select_multi (junto a abscisado)', () => {
    const def = pptoFiltroDef('infraestructura')
    assert.equal(def?.categoria, 'ubicacion')
    assert.equal(def?.tipo, 'select_multi')
    assert.equal(def?.opcionesKey, 'infraestructuras')
  })

  it('incluye campos vacíos infraestructura / infraestructuras', () => {
    const v = pptoFObraCamposVacios()
    assert.equal(v.infraestructura, '')
    assert.deepEqual(v.infraestructuras, [])
  })

  it('filtra filas por uno o varios valores', () => {
    const f = { ...pptoFObraCamposVacios(), infraestructuras: ['Calzada', 'Berm Izq'] }
    assert.equal(pptoFilaCoincideFObra({ infraestructura: 'Calzada' }, f), true)
    assert.equal(pptoFilaCoincideFObra({ infraestructura: 'Berm Der' }, f), false)
    assert.deepEqual(pptoFiltroValoresLista(pptoFiltroDef('infraestructura'), f), ['Calzada', 'Berm Izq'])
  })

  it('envía query params infraestructura / infraestructuras', () => {
    const p = new URLSearchParams()
    pptoAppendFObraToSearchParams(p, {
      ...pptoFObraCamposVacios(),
      infraestructuras: ['Calzada', 'Berm Izq'],
    })
    assert.deepEqual(p.getAll('infraestructuras').sort(), ['Berm Izq', 'Calzada'].sort())
  })
})
