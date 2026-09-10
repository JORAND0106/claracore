/**
 * Node tests — permisos y helpers RRHH.
 * Run: node --test src/modules/rrhh/rrhhPermisos.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { accesoRrhh, permisoRrhh } from './rrhhPermisos.js'
import {
  payloadFromForm,
  EMPTY_TRABAJADOR_FORM,
  validateTrabajadorForm,
} from './rrhhHelpers.js'

describe('rrhhPermisos', () => {
  it('desarrollador tiene acceso total', () => {
    const u = { cargo_nombre: 'Desarrollador', permisos: [] }
    const a = accesoRrhh(u, 1)
    assert.equal(a.ver, true)
    assert.equal(a.crear, true)
    assert.equal(a.eliminar, true)
    assert.equal(a.puedeAdminCatalogo, true)
  })

  it('sin permisos no ve el módulo', () => {
    const u = { cargo_nombre: 'Residente', permisos: [], contrato_id: 10 }
    assert.equal(permisoRrhh(u, 'ver', 10), false)
    assert.equal(accesoRrhh(u, 10).ver, false)
  })

  it('respeta flag ver de la matriz (RRHH legado)', () => {
    const u = {
      cargo_nombre: 'Administrador',
      contrato_id: 10,
      permisos: [{
        funcion_nombre: 'RRHH',
        contrato_id: 10,
        ver: true,
        crear: false,
        editar: true,
        eliminar: false,
        validar: false,
        exportar: false,
      }],
    }
    const a = accesoRrhh(u, 10)
    assert.equal(a.ver, true)
    assert.equal(a.crear, false)
    assert.equal(a.editar, true)
  })

  it('acepta nombre Recursos Humanos', () => {
    const u = {
      cargo_nombre: 'Administrador',
      contrato_id: 10,
      permisos: [{
        funcion_nombre: 'Recursos Humanos',
        contrato_id: 10,
        ver: true,
        crear: true,
        editar: false,
        eliminar: false,
        validar: false,
        exportar: false,
      }],
    }
    assert.equal(permisoRrhh(u, 'ver', 10), true)
    assert.equal(permisoRrhh(u, 'crear', 10), true)
    assert.equal(permisoRrhh(u, 'editar', 10), false)
  })
})

describe('rrhhHelpers payload', () => {
  it('arma payload con empresa subcontratista y salario colombiano', () => {
    const p = payloadFromForm({
      ...EMPTY_TRABAJADOR_FORM,
      nombres: 'Juan',
      apellidos: 'Gómez',
      numero_documento: '998877',
      salario: '$ 2.500.000',
      salario_liquidable: false,
      lugar_expedicion: 'Bogotá, Cundinamarca',
      tipo_sangre: 'O+',
      subsidio_transporte: true,
      tipo_contrato: 'Término fijo',
      empresa_key: 'sub:42',
      empresa_tipo: 'subcontratista',
      empresa_subcontratista_id: '42',
    })
    assert.equal(p.nombres, 'Juan')
    assert.equal(p.empresa_tipo, 'subcontratista')
    assert.equal(p.empresa_subcontratista_id, 42)
    assert.equal(p.empresa_key, 'sub:42')
    assert.equal(p.tipo_contrato, 'Término fijo')
    assert.equal(p.subsidio_transporte, true)
    assert.equal(p.salario, 2500000)
    assert.equal(p.salario_liquidable, false)
    assert.equal(p.lugar_expedicion, 'Bogotá, Cundinamarca')
    assert.equal(p.tipo_sangre, 'O+')
  })

  it('valida campos obligatorios al guardar', () => {
    const bad = validateTrabajadorForm({ ...EMPTY_TRABAJADOR_FORM })
    assert.equal(bad.ok, false)
    assert.ok(bad.faltantes.includes('Nombres'))
    assert.ok(bad.faltantes.includes('Número de documento'))
    const good = validateTrabajadorForm({
      ...EMPTY_TRABAJADOR_FORM,
      nombres: 'Ana',
      apellidos: 'Pérez',
      tipo_documento: 'CC',
      numero_documento: '123456',
      empresa_key: 'consorcio',
    })
    assert.equal(good.ok, true)
    const nonDigits = validateTrabajadorForm({
      ...EMPTY_TRABAJADOR_FORM,
      nombres: 'Ana',
      apellidos: 'Pérez',
      tipo_documento: 'CC',
      numero_documento: '12AB',
      empresa_key: 'consorcio',
    })
    assert.equal(nonDigits.ok, false)
  })

  it('construye checklist con tipos extendidos y Otro al final', async () => {
    const { buildDocChecklist, slugTipoDocumento } = await import('./rrhhHelpers.js')
    const list = buildDocChecklist('soporte', ['Licencia de conducción', 'Certificado bancario'])
    assert.equal(list[list.length - 1].tipo, 'otro')
    assert.ok(list.some((t) => t.tipo === slugTipoDocumento('Licencia de conducción')))
    assert.ok(list.some((t) => t.label === 'Certificado bancario'))
    assert.ok(list.some((t) => t.tipo === 'cedula'))
  })
})
