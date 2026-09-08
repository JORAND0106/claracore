import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEditFormFromInsumoRow,
  normProveedorNombreUi,
  resolveProveedorFieldsForEdit,
} from './catalogoInsumosProveedorEdit.js'

describe('normProveedorNombreUi', () => {
  it('ignora placeholders del listado', () => {
    assert.equal(normProveedorNombreUi('—'), '')
    assert.equal(normProveedorNombreUi('-'), '')
    assert.equal(normProveedorNombreUi('–'), '')
    assert.equal(normProveedorNombreUi('  '), '')
  })

  it('conserva razón social real', () => {
    assert.equal(normProveedorNombreUi('Acme SAS'), 'Acme SAS')
  })
})

describe('resolveProveedorFieldsForEdit', () => {
  it('usa campos enriquecidos de la fila', () => {
    const got = resolveProveedorFieldsForEdit({
      proveedor_id: 7,
      proveedor_nombre: 'Acme SAS',
      proveedor_nit: '900111',
      contacto_email: 'a@acme.co',
      contacto_nombre: 'Ana',
      contacto_telefono: '300',
    })
    assert.equal(got.proveedor_id, 7)
    assert.equal(got.razon_social, 'Acme SAS')
    assert.equal(got.nit, '900111')
    assert.equal(got.contacto_email, 'a@acme.co')
    assert.equal(got.contacto_nombre, 'Ana')
    assert.equal(got.contacto_telefono, '300')
  })

  it('completa desde directorio cuando el listado solo trae id o nombre vacío', () => {
    const got = resolveProveedorFieldsForEdit(
      { proveedor_id: 7, proveedor_nombre: '—' },
      [],
      [{
        id: 7,
        razon_social: 'Acme SAS',
        nit: '900111',
        contacto_email: 'a@acme.co',
        contacto_nombre: 'Ana',
        contacto_telefono: '300',
      }],
    )
    assert.equal(got.razon_social, 'Acme SAS')
    assert.equal(got.nit, '900111')
    assert.equal(got.contacto_email, 'a@acme.co')
    assert.equal(got.contacto_nombre, 'Ana')
    assert.equal(got.contacto_telefono, '300')
  })

  it('toma proveedor de la cotización ganadora si la fila no lo trae', () => {
    const pares = [{
      id: 'p1',
      es_ganadora: true,
      nit: '800222',
      contacto_email: 'ventas@beta.co',
      contacto_nombre: 'Luis',
      contacto_telefono: '310',
      insumo: { proveedor: 'Beta Ltda', valor: 100 },
    }]
    const got = resolveProveedorFieldsForEdit({ proveedor_nombre: '—' }, pares, [])
    assert.equal(got.razon_social, 'Beta Ltda')
    assert.equal(got.nit, '800222')
    assert.equal(got.contacto_email, 'ventas@beta.co')
  })
})

describe('buildEditFormFromInsumoRow', () => {
  it('autodiligencia proveedor al armar el formulario de edición', () => {
    const form = buildEditFormFromInsumoRow({
      codigo: 'INS-001',
      descripcion: 'Cemento',
      unidad: 'KG',
      rendimiento: 1,
      costo: 1000,
      proveedor_id: 3,
      proveedor_nombre: 'Cementos XYZ',
      proveedor_nit: '901234',
      contacto_email: 'c@xyz.co',
      contacto_nombre: 'Carla',
      contacto_telefono: '320',
      requiere_cotizacion: true,
    })
    assert.equal(form.codigo, 'INS-001')
    assert.equal(form.razon_social, 'Cementos XYZ')
    assert.equal(form.nit, '901234')
    assert.equal(form.contacto_email, 'c@xyz.co')
    assert.equal(form.contacto_nombre, 'Carla')
    assert.equal(form.contacto_telefono, '320')
    assert.equal(form.proveedor_id, 3)
  })
})
