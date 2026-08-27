/**
 * Node tests for actividades del Reporte de Evento.
 * Run: node --test src/modules/seguimiento/bitacoraEventoActividades.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  actividadRowCells,
  actividadesConRegistro,
  actividadesFromDetalle,
  actividadesParaPayload,
  emptyActividadRow,
  formatUbicacionActividad,
} from './bitacoraEventoActividades.js'

describe('actividadesFromDetalle', () => {
  it('devuelve fila vacía si no hay datos', () => {
    const rows = actividadesFromDetalle({})
    assert.equal(rows.length, 1)
    assert.equal(rows[0].actividad, '')
  })

  it('normaliza filas con ubicación PK', () => {
    const rows = actividadesFromDetalle({
      actividades: [
        {
          actividad: 'Excavación',
          abs_inicio: 'K0+000',
          abs_fin: 'K0+120',
          ubicacion_pk: '12',
          ubicacion_pk_id: 7,
          ubicacion_tramo: 'Tramo A',
          cantidad: '15',
          observacion: 'OK',
        },
        { actividad: '  ' },
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].actividad, 'Excavación')
    assert.equal(rows[0].ubicacion_pk_id, 7)
    assert.equal(rows[0].ubicacion_tramo, 'Tramo A')
  })
})

describe('actividadesParaPayload', () => {
  it('omite filas vacías y limpia strings', () => {
    const out = actividadesParaPayload([
      emptyActividadRow(),
      { ...emptyActividadRow(), actividad: ' Relleno ', cantidad: '3' },
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].actividad, 'Relleno')
    assert.equal(out[0].cantidad, '3')
  })
})

describe('formatUbicacionActividad / actividadRowCells', () => {
  it('arma etiqueta PK · tramo · costado', () => {
    const label = formatUbicacionActividad({
      ubicacion_pk: 'K12',
      ubicacion_tramo: 'Norte',
      ubicacion_costado: 'Derecho',
    })
    assert.equal(label, 'PK K12 · Norte · Derecho')
  })

  it('celdas para Libro Digital', () => {
    const c = actividadRowCells({
      actividad: 'Señalización',
      abs_inicio: 'K1',
      abs_fin: 'K2',
      ubicacion_pk: '9',
      cantidad: '2',
    })
    assert.equal(c.actividad, 'Señalización')
    assert.equal(c.ubicacion, 'PK 9')
    assert.equal(c.cantidad, '2')
  })

  it('actividadesConRegistro filtra vacías', () => {
    const rows = actividadesConRegistro({
      actividades: [{ actividad: 'A' }, { actividad: '' }],
    })
    assert.equal(rows.length, 1)
  })
})
