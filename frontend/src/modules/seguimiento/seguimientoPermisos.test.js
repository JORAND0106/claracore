import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { accesoSeguimiento, esContratistaGerencial } from './seguimientoPermisos.js'

describe('accesoSeguimiento', () => {
  it('abre el módulo a roles de obra sin matriz de Control de accesos', () => {
    const roles = [
      { rol_nombre: 'Interventoría' },
      { rol_nombre: 'Contratista' },
      { rol_nombre: 'Supervisor Externo' },
      { rol_nombre: 'Contratista Gerencial', rol_id: 7 },
      { rol_nombre: 'Interventoría Gerencial' },
      { rol_nombre: 'Contratista Operativo' },
      { rol_nombre: 'Interventoría Operativa' },
    ]
    for (const u of roles) {
      const p = accesoSeguimiento(u, 1)
      assert.equal(p.bloqueado, false)
      assert.equal(p.ver, true)
      assert.equal(p.crear, true)
      assert.equal(p.editar, true)
      assert.equal(p.validar, true)
      assert.equal(p.exportar, true)
      assert.equal(p.eliminar, false)
      assert.equal(p.esDesarrollador, false)
    }
  })

  it('Desarrollador puede eliminar definitivamente', () => {
    const p = accesoSeguimiento({ cargo_nombre: 'Desarrollador' }, 1)
    assert.equal(p.eliminar, true)
    assert.equal(p.esDesarrollador, true)
    assert.equal(p.ver, true)
  })

  it('detecta Contratista Gerencial', () => {
    assert.equal(esContratistaGerencial({ rol_nombre: 'Contratista Gerencial' }), true)
    assert.equal(esContratistaGerencial({ rol_id: 7 }), true)
    assert.equal(esContratistaGerencial({ rol_nombre: 'Contratista Operativo' }), false)
  })
})
