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

  it('empresa contratista/interventoría/consorcio no aísla (aunque haya sid residual)', () => {
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Residente', empresa_tipo: 'contratista', subcontratista_id: 9 }),
      false,
    )
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Inspector', empresa_tipo: 'interventoria', subcontratista_id: 9 }),
      false,
    )
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Residente', empresa_tipo: 'consorcio', subcontratista_id: 2 }),
      false,
    )
  })

  it('sid residual o cargo Subcontratista sin empresa_tipo no aísla', () => {
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Inspector', subcontratista_id: 12 }),
      false,
    )
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Subcontratista', subcontratista_id: 3 }),
      false,
    )
    assert.equal(
      usuarioAisladoPorEmpresaSub({ cargo_nombre: 'Residente' }),
      false,
    )
  })

  it('empresa subcontratista sin id sigue restricted (vacío forzado)', () => {
    assert.deepEqual(
      scopeEmpresaSubcontratista({ empresa_tipo: 'subcontratista' }),
      { restricted: true, forcedId: null },
    )
  })

  it('reconstruye clave desde usuario', () => {
    assert.equal(empresaKeyFromUsuario({ empresa_tipo: 'contratista' }), 'contratista')
    assert.equal(empresaKeyFromUsuario({ empresa_tipo: 'subcontratista', subcontratista_id: 3 }), 'sub:3')
  })

  it('sid residual sin tipo no aparece como Empresa=sub en el selector', () => {
    assert.equal(empresaKeyFromUsuario({ subcontratista_id: 12 }), '')
    assert.equal(empresaKeyFromUsuario({ empresa_tipo: null, subcontratista_id: 4 }), '')
  })

  it('rol subcontratista sin empresa no aísla ni activa vista sub', () => {
    assert.equal(
      esVistaSubcontratista({ rol_nombre: 'subcontratista', subcontratista_id: 8 }),
      false,
    )
    assert.equal(
      esVistaSubcontratista({ rol_nombre: 'Operativo Interventoria', empresa_tipo: 'interventoria' }),
      false,
    )
  })
})
