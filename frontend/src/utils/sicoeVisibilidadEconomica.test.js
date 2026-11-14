import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sicoeUsuarioVeValoresEconomicos } from './sicoeVisibilidadEconomica.js'

describe('sicoeUsuarioVeValoresEconomicos', () => {
  it('oculta a operativo contratista / interventoría', () => {
    assert.equal(
      sicoeUsuarioVeValoresEconomicos({ rol_nombre: 'Operativo Contratista' }),
      false,
    )
    assert.equal(
      sicoeUsuarioVeValoresEconomicos({ rol: 'operativo interventoria' }),
      false,
    )
  })

  it('desarrollador / contratista con permiso siguen viendo', () => {
    assert.equal(
      sicoeUsuarioVeValoresEconomicos({ rol_nombre: 'Desarrollador' }),
      true,
    )
    assert.equal(
      sicoeUsuarioVeValoresEconomicos({
        rol_nombre: 'Contratista',
        empresa_tipo: 'contratista',
      }),
      true,
    )
  })

  it('subcontratista ve (precios propios) aunque no vea contrato', () => {
    assert.equal(
      sicoeUsuarioVeValoresEconomicos({
        rol_nombre: 'Contratista',
        empresa_tipo: 'subcontratista',
        subcontratista_id: 9,
      }),
      true,
    )
  })
})
