import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  esRolExcluidoInformeValidacion,
  usuarioDebeVerInformePeriodicoPopup,
} from './permisosContrato.js'

describe('permisosContrato · informe validación popup', () => {
  it('excluye Operativo Gerencial y Contratista Gerencial', () => {
    assert.equal(esRolExcluidoInformeValidacion({ rol_nombre: 'Operativo Gerencial' }), true)
    assert.equal(esRolExcluidoInformeValidacion({ rol_nombre: 'Contratista Gerencial' }), true)
    assert.equal(esRolExcluidoInformeValidacion({ cargo_nombre: 'Contratista Gerencial' }), true)
    assert.equal(esRolExcluidoInformeValidacion({ rol_nombre: 'Contratista Operativo' }), false)
  })

  it('popup solo con editar y sin rol gerencial excluido', () => {
    const editor = {
      rol_nombre: 'Contratista Operativo',
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', editar: true, contrato_id: 2 }],
    }
    assert.equal(usuarioDebeVerInformePeriodicoPopup(editor, 2), true)

    const gerencial = {
      rol_nombre: 'Contratista Gerencial',
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', editar: true, contrato_id: 2 }],
    }
    assert.equal(usuarioDebeVerInformePeriodicoPopup(gerencial, 2), false)

    const soloVer = {
      rol_nombre: 'Contratista Operativo',
      permisos: [{ funcion_nombre: 'Reporte de Cantidades', editar: false, ver: true, contrato_id: 2 }],
    }
    assert.equal(usuarioDebeVerInformePeriodicoPopup(soloVer, 2), false)
  })
})
