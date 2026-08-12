import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  esRolContratistaDepuracion,
  esRolInterventoriaValidacion,
} from './pptoRolesValidacion.js'

function puedeTabDepuracion(usuario, { esDev = false, puedeValidar = false } = {}) {
  const esLadoInterv = esRolInterventoriaValidacion(usuario)
  return !esLadoInterv && (esDev || (puedeValidar && esRolContratistaDepuracion(usuario)))
}

describe('visibilidad pestaña Validación por depuración', () => {
  it('oculta depuración a roles de Interventoría (incl. gerencial y operativo)', () => {
    assert.equal(esRolInterventoriaValidacion({ rol_nombre: 'Interventoría' }), true)
    assert.equal(esRolInterventoriaValidacion({ rol_nombre: 'Operativo Interventoría' }), true)
    assert.equal(esRolInterventoriaValidacion({ rol_nombre: 'Interventoría Gerencial' }), true)
    assert.equal(esRolContratistaDepuracion({ rol_nombre: 'Interventoría' }), false)
  })

  it('permite depuración a Contratista / Operativo / Gerencial contratista', () => {
    assert.equal(esRolContratistaDepuracion({ rol_nombre: 'Contratista' }), true)
    assert.equal(esRolContratistaDepuracion({ rol_nombre: 'Operativo Contratista' }), true)
    assert.equal(esRolContratistaDepuracion({ rol_nombre: 'Contratista Gerencial' }), true)
    assert.equal(esRolInterventoriaValidacion({ rol_nombre: 'Contratista' }), false)
  })

  it('regla de tab: interventoría nunca ve depuración aunque tenga validar', () => {
    assert.equal(puedeTabDepuracion({ rol_nombre: 'Interventoría' }, { puedeValidar: true }), false)
    assert.equal(puedeTabDepuracion({ rol_nombre: 'Operativo Interventoría' }, { puedeValidar: true }), false)
    assert.equal(puedeTabDepuracion({ rol_nombre: 'Contratista' }, { puedeValidar: true }), true)
    // Desarrollador con rol interventoría tampoco ve la pestaña de depuración
    assert.equal(puedeTabDepuracion({ rol_nombre: 'Interventoría' }, { esDev: true }), false)
  })
})
