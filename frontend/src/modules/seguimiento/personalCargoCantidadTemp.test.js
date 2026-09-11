/**
 * Tests — cargo/cantidad temporal + helpers clima histórico.
 * Run: node --test src/modules/seguimiento/personalAsistenciaHelpers.test.js
 *      node --test src/modules/seguimiento/bitacoraClimaHistorico.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergePersonalCantidades,
  normalizarPersonalCantidades,
  personalAgregadoDesdeAsistencia,
  puedeUsarCargoCantidadTemporal,
  recoverPersonalManual,
} from './personalAsistenciaHelpers.js'
import { BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO } from './bitacoraConstants.js'

describe('cargo/cantidad temporal + merge resumen', () => {
  it('gate solo Dev + contrato ICCU-CTO-1574-2025', () => {
    assert.equal(BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO, 'ICCU-CTO-1574-2025')
    assert.equal(puedeUsarCargoCantidadTemporal({
      esDesarrollador: true,
      contratoNumero: 'ICCU-CTO-1574-2025',
    }), true)
    assert.equal(puedeUsarCargoCantidadTemporal({
      esDesarrollador: true,
      contratoNumero: 'OTRO-CTO',
    }), false)
    assert.equal(puedeUsarCargoCantidadTemporal({
      esDesarrollador: false,
      contratoNumero: 'ICCU-CTO-1574-2025',
    }), false)
  })

  it('merge RRHH + manual en resumen', () => {
    const rrhh = personalAgregadoDesdeAsistencia([
      { nombre: 'A', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'C', cargo: 'Ayudante', estado: 'activo' },
    ])
    const manual = [{ cargo: 'Oficial', cantidad: 3 }, { cargo: 'Boal', cantidad: 1 }]
    assert.deepEqual(mergePersonalCantidades(rrhh, manual), [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Boal', cantidad: 1 },
      { cargo: 'Oficial', cantidad: 5 },
    ])
  })

  it('recoverPersonalManual como diferencia personal − RRHH', () => {
    const personal = [
      { cargo: 'Oficial', cantidad: 5 },
      { cargo: 'Ayudante', cantidad: 1 },
    ]
    const asist = [
      { nombre: 'A', cargo: 'Oficial', estado: 'activo' },
      { nombre: 'B', cargo: 'Oficial', estado: 'activo' },
    ]
    assert.deepEqual(recoverPersonalManual(personal, asist), [
      { cargo: 'Ayudante', cantidad: 1 },
      { cargo: 'Oficial', cantidad: 3 },
    ])
  })

  it('normalizarPersonalCantidades ignora ceros y suma', () => {
    assert.deepEqual(normalizarPersonalCantidades([
      { cargo: 'Oficial', cantidad: 2 },
      { cargo: 'oficial', cantidad: 1 },
      { cargo: 'X', cantidad: 0 },
    ]), [{ cargo: 'Oficial', cantidad: 3 }])
  })
})
