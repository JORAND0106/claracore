import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  empresaFromKey,
  empresaKeyFromUsuario,
  esVistaSubcontratista,
  scopeEmpresaSubcontratista,
  usuarioAisladoPorEmpresaSub,
} from './empresaUsuario.js'

describe('empresaUsuario', () => {
  it('parsea claves del selector', () => {
    assert.deepEqual(empresaFromKey('contratista'), { empresa_tipo: 'contratista', subcontratista_id: null })
    assert.deepEqual(empresaFromKey('interventoria'), { empresa_tipo: 'interventoria', subcontratista_id: null })
    assert.deepEqual(empresaFromKey('sub:9'), { empresa_tipo: 'subcontratista', subcontratista_id: 9 })
  })

  it('aísla por empresa sub independiente del cargo', () => {
    const u = {
      cargo_nombre: 'Coordinador de Topografía',
      rol_nombre: 'Operativo Contratista',
      empresa_tipo: 'subcontratista',
      subcontratista_id: 5,
    }
    assert.equal(usuarioAisladoPorEmpresaSub(u), true)
    assert.equal(esVistaSubcontratista(u), true)
    assert.deepEqual(scopeEmpresaSubcontratista(u), { restricted: true, forcedId: 5 })
  })

  it('empresa contratista/interventoría no aísla', () => {
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Residente', empresa_tipo: 'contratista' }),
      false,
    )
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Inspector', empresa_tipo: 'interventoria' }),
      false,
    )
  })

  it('reconstruye clave desde usuario', () => {
    assert.equal(empresaKeyFromUsuario({ empresa_tipo: 'contratista' }), 'contratista')
    assert.equal(empresaKeyFromUsuario({ empresa_tipo: 'subcontratista', subcontratista_id: 3 }), 'sub:3')
  })
})
