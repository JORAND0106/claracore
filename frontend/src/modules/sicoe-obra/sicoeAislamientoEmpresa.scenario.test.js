/**
 * Aislamiento Sicoe: solo Empresa=subcontratista; no rol ni sid residual.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  empresaKeyFromUsuario,
  esVistaSubcontratista,
  usuarioAisladoPorEmpresaSub,
} from '../../utils/empresaUsuario.js'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')

describe('Sicoe — aislamiento por empresa real', () => {
  it('App inyecta subcontratista_id solo vía usuarioAisladoPorEmpresaSub', () => {
    assert.match(app, /usuarioAisladoPorEmpresaSub\(usuario\)/)
    assert.equal(
      /if \(esSub && subIdUsuario && !params\.has\('subcontratista_id'\)\)/.test(app),
      false,
    )
  })

  it('PUT admin no fuerza empresa_tipo=subcontratista por sid residual', () => {
    assert.match(main, /NUNCA forzar subcontratista solo por sid residual/)
    assert.equal(
      /elif final_sub_id is not None:\s+data\["empresa_tipo"\] = "subcontratista"/.test(main),
      false,
    )
  })

  it('refresh incluye empresa_tipo', () => {
    assert.match(main, /new_token = create_token\(\{/)
    assert.match(
      main,
      /"subcontratista_id": usuario\.get\("subcontratista_id"\),\s*"empresa_tipo": usuario\.get\("empresa_tipo"\)/,
    )
  })

  it('casos de usuario: consorcio, interventoría, sub, sin empresa', () => {
    assert.equal(usuarioAisladoPorEmpresaSub({ empresa_tipo: 'contratista' }), false)
    assert.equal(usuarioAisladoPorEmpresaSub({ empresa_tipo: 'consorcio' }), false)
    assert.equal(usuarioAisladoPorEmpresaSub({ empresa_tipo: 'interventoria' }), false)
    assert.equal(usuarioAisladoPorEmpresaSub({}), false)
    assert.equal(
      usuarioAisladoPorEmpresaSub({ empresa_tipo: 'subcontratista', subcontratista_id: 2 }),
      true,
    )
    assert.equal(esVistaSubcontratista({ rol_nombre: 'subcontratista' }), false)
    assert.equal(empresaKeyFromUsuario({ subcontratista_id: 9 }), '')
  })
})
