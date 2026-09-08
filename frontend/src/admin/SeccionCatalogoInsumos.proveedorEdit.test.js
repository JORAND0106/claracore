import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEditFormFromInsumoRow,
  captureFieldsFromPar,
  normProveedorNombreUi,
  proveedorContactsIncomplete,
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

  it('completa NIT y contactos por razón social aunque el id no tenga datos', () => {
    const got = resolveProveedorFieldsForEdit(
      { proveedor_nombre: 'PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.' },
      [{
        id: 'p1',
        es_ganadora: true,
        insumo: { proveedor: 'PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.', valor: 100 },
      }],
      [{
        id: 42,
        razon_social: 'PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.',
        nit: '860002212',
        contacto_email: 'ventas@pavco.co',
        contacto_nombre: 'Mesa',
        contacto_telefono: '601123',
      }],
    )
    assert.equal(got.razon_social, 'PAVCO (Wavin) MEXICHEM COLOMBIA S.A.S.')
    assert.equal(got.nit, '860002212')
    assert.equal(got.contacto_email, 'ventas@pavco.co')
    assert.equal(got.contacto_nombre, 'Mesa')
    assert.equal(got.contacto_telefono, '601123')
    assert.equal(got.proveedor_id, 42)
    assert.equal(proveedorContactsIncomplete(got), false)
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

describe('buildEditFormFromInsumoRow y captureFieldsFromPar', () => {
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

  it('autodiligencia Costos Insumo y No Previsto desde la fila ganadora', () => {
    const form = buildEditFormFromInsumoRow({
      codigo: 'INS-002',
      descripcion: 'Tuberia',
      unidad: 'M',
      cotizaciones_detalle: [
        {
          id: 'a-insumo',
          pair_id: 'a',
          tipo: 'insumo',
          es_ganadora: true,
          proveedor: 'PAVCO',
          valor: 1000,
          numero: 'BO-160-2026',
          fecha: '2026-03-01',
          vigencia: '30 días',
          impuesto: { administracion: '', imprevistos: '', utilidad: '', iva: '0.19' },
        },
        {
          id: 'a-np',
          pair_id: 'a',
          tipo: 'no_previsto',
          proveedor: 'PAVCO',
          valor: 1200,
          numero: 'BO-160-2026-NP',
          fecha: '2026-03-02',
          vigencia: '45 días',
          impuesto: { administracion: '0.1', imprevistos: '0.05', utilidad: '0.05', iva: '' },
        },
      ],
    })
    assert.equal(form.costo_base, '1000')
    assert.equal(form.cotizacion_numero, 'BO-160-2026')
    assert.equal(form.cotizacion_fecha, '2026-03-01')
    assert.equal(form.valor_no_previsto, '1200')
    assert.equal(form.cotizacion_numero_np, 'BO-160-2026-NP')
    assert.equal(form.cotizacion_fecha_np, '2026-03-02')
    assert.equal(form.cotizacion_vigencia_np, '45 días')
    assert.equal(form.impuesto.iva, '0.19')
    assert.equal(form.impuesto_np.administracion, '0.1')

    const fields = captureFieldsFromPar(form.cotizaciones_detalle[0])
    assert.equal(fields.valor_no_previsto, '1200')
    assert.equal(fields.cotizacion_numero_np, 'BO-160-2026-NP')
    assert.equal(fields.costo_base, '1000')
  })

  it('captureFieldsFromPar autodiligencia contactos de una cotización perdedora', () => {
    const fields = captureFieldsFromPar({
      id: 'b',
      es_ganadora: false,
      proveedor_id: 99,
      nit: '9002',
      contacto_email: 'o@x.co',
      contacto_nombre: 'Luis',
      contacto_telefono: '310',
      insumo: {
        proveedor: 'OTRO SAS',
        valor: '200',
        numero: 'OT-1',
        fecha: '2026-03-01',
        vigencia: '30',
        impuesto: { administracion: '', imprevistos: '', utilidad: '', iva: '' },
      },
      no_previsto: {
        valor: '',
        numero: '',
        fecha: '',
        vigencia: '',
        impuesto: { administracion: '', imprevistos: '', utilidad: '', iva: '' },
      },
    })
    assert.equal(fields.razon_social, 'OTRO SAS')
    assert.equal(fields.nit, '9002')
    assert.equal(fields.contacto_email, 'o@x.co')
    assert.equal(fields.contacto_nombre, 'Luis')
    assert.equal(fields.contacto_telefono, '310')
    assert.equal(fields.proveedor_id, 99)
    assert.equal(fields.costo_base, '200')
  })
})
