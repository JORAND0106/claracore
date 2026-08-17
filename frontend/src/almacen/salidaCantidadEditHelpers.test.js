import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  puedeEditarCantidadSalidaPorPermisos,
  validateCantidadSalidaEdit,
} from './salidaCantidadEditHelpers.js'

describe('edición cantidad salida — roles', () => {
  it('solo CG o Desarrollador ven la opción', () => {
    assert.equal(puedeEditarCantidadSalidaPorPermisos({ esContratistaGerencial: true }), true)
    assert.equal(puedeEditarCantidadSalidaPorPermisos({ esDesarrollador: true }), true)
    assert.equal(puedeEditarCantidadSalidaPorPermisos({
      esContratistaGerencial: true,
      esDesarrollador: true,
    }), true)
    assert.equal(puedeEditarCantidadSalidaPorPermisos({ editar: true, crear: true }), false)
    assert.equal(puedeEditarCantidadSalidaPorPermisos({ validar: true }), false)
    assert.equal(puedeEditarCantidadSalidaPorPermisos({}), false)
  })
})

describe('edición cantidad salida — validación', () => {
  it('rechaza <= 0', () => {
    assert.equal(validateCantidadSalidaEdit({ cantidadNueva: 0, cantidadActual: 10 }).ok, false)
    assert.equal(validateCantidadSalidaEdit({ cantidadNueva: -1, cantidadActual: 10 }).ok, false)
  })

  it('no permite menor a lo devuelto', () => {
    const r = validateCantidadSalidaEdit({
      cantidadNueva: 2,
      cantidadActual: 10,
      cantidadDevuelta: 5,
    })
    assert.equal(r.ok, false)
    assert.match(r.message, /devuelto/)
  })

  it('permite igual a lo devuelto', () => {
    const r = validateCantidadSalidaEdit({
      cantidadNueva: 5,
      cantidadActual: 10,
      cantidadDevuelta: 5,
    })
    assert.equal(r.ok, true)
  })

  it('respeta máximo disponible + cantidad actual', () => {
    const r = validateCantidadSalidaEdit({
      cantidadNueva: 20,
      cantidadActual: 10,
      cantidadDevuelta: 0,
      disponibleLinea: 5,
    })
    assert.equal(r.ok, false)
    assert.match(r.message, /disponible|Máximo/)
  })

  it('acepta valor dentro de rango', () => {
    const r = validateCantidadSalidaEdit({
      cantidadNueva: 12,
      cantidadActual: 10,
      cantidadDevuelta: 2,
      disponibleLinea: 5,
    })
    assert.equal(r.ok, true)
    assert.equal(r.cantidad, 12)
  })
})
