/**
 * Node tests — bloques de evento en Reporte Diario.
 * Run: node --test src/modules/seguimiento/eventoBloquesHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyEventoBloque,
  emptyEventoDetalle,
  eventosFromEntrada,
  eventosParaPayload,
  debeMostrarObservacionesDia,
} from './eventoBloquesHelpers.js'

describe('emptyEventoBloque / emptyEventoDetalle', () => {
  it('crea bloque con tipo reporte_actividades y una actividad', () => {
    const b = emptyEventoBloque()
    assert.ok(b.id)
    assert.equal(b.evento_tipo, 'reporte_actividades')
    assert.equal(b.dirigido_a, '')
    assert.equal(b.cuerpo_html, '')
    assert.equal(b.evento_detalle.actividades.length, 1)
    assert.deepEqual(b.imagenes, [])
    assert.ok(b.created_at)
  })

  it('detalle SST y visita_terceros con campos esperados', () => {
    const sst = emptyEventoDetalle('incidente_sst')
    assert.equal(sst.gravedad, 'leve')
    assert.equal(sst.descripcion_incidente, '')
    const visita = emptyEventoDetalle('visita_terceros')
    assert.equal(visita.entidad, '')
    assert.equal(visita.visitantes_lista.length, 1)
  })
})

describe('eventosFromEntrada', () => {
  it('devuelve [] si no hay eventos', () => {
    assert.deepEqual(eventosFromEntrada(null), [])
    assert.deepEqual(eventosFromEntrada({}), [])
  })

  it('normaliza actividades y visitantes', () => {
    const rows = eventosFromEntrada({
      eventos: [{
        id: 'ev-1',
        evento_tipo: 'visita_terceros',
        dirigido_a: 'Interventoría',
        cuerpo_html: '<p>Ok</p>',
        evento_detalle: {
          actividades: [{ actividad: 'Inspección', cantidad: '1' }, { actividad: '  ' }],
          visitantes: 'Ana (Ing.)',
          entidad: 'ANLA',
        },
        imagenes: [{ blob_path: 'a.png' }],
      }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'ev-1')
    assert.equal(rows[0].evento_detalle.actividades.length, 1)
    assert.equal(rows[0].evento_detalle.actividades[0].actividad, 'Inspección')
    assert.ok(rows[0].evento_detalle.visitantes_lista.length >= 1)
    assert.equal(rows[0].evento_detalle.entidad, 'ANLA')
    assert.equal(rows[0].imagenes.length, 1)
  })
})

describe('eventosParaPayload', () => {
  it('limpia actividades vacías y omite pending conservando data_uri', () => {
    const out = eventosParaPayload([{
      id: 'ev-2',
      evento_tipo: 'reporte_actividades',
      dirigido_a: 'ignorado',
      cuerpo_html: '<p>x</p>',
      evento_detalle: {
        actividades: [
          { actividad: '', cantidad: '' },
          { actividad: ' Relleno ', cantidad: '2' },
        ],
      },
      imagenes: [
        { nombre: 'a.png', data_uri: 'data:image/png;base64,AAA', pending: true, mime_type: 'image/png' },
        { nombre: 'b.png', blob_path: 'path/b.png', mime_type: 'image/png' },
        { nombre: 'empty.png' },
      ],
      created_at: '2026-08-27T12:00:00.000Z',
    }])
    assert.equal(out.length, 1)
    assert.equal(out[0].dirigido_a, '')
    assert.equal(out[0].evento_detalle.actividades.length, 1)
    assert.equal(out[0].evento_detalle.actividades[0].actividad, 'Relleno')
    assert.equal(out[0].imagenes.length, 2)
    assert.equal(out[0].imagenes[0].data_uri, 'data:image/png;base64,AAA')
    assert.equal(out[0].imagenes[0].pending, undefined)
    assert.equal(out[0].imagenes[1].blob_path, 'path/b.png')
  })

  it('serializa visitantes_lista para visita_terceros', () => {
    const out = eventosParaPayload([{
      evento_tipo: 'visita_terceros',
      dirigido_a: '  Contratista  ',
      cuerpo_html: '',
      evento_detalle: {
        actividades: [],
        visitantes_lista: [
          { nombre: ' Ana ', cargo: 'Ing.', origen: 'catalogo' },
          { nombre: '  ' },
        ],
        entidad: 'X',
        motivo: 'Y',
      },
      imagenes: [],
    }])
    assert.equal(out[0].dirigido_a, 'Contratista')
    assert.equal(out[0].evento_detalle.visitantes_lista.length, 1)
    assert.equal(out[0].evento_detalle.visitantes_lista[0].nombre, 'Ana')
    assert.equal(out[0].evento_detalle.visitantes, 'Ana (Ing.)')
  })
})

describe('debeMostrarObservacionesDia', () => {
  it('muestra Observaciones sin eventos o con lista vacía', () => {
    assert.equal(debeMostrarObservacionesDia(undefined), true)
    assert.equal(debeMostrarObservacionesDia(null), true)
    assert.equal(debeMostrarObservacionesDia([]), true)
  })

  it('oculta Observaciones con al menos un evento', () => {
    assert.equal(debeMostrarObservacionesDia([{ id: '1' }]), false)
    assert.equal(debeMostrarObservacionesDia([{ id: '1' }, { id: '2' }]), false)
  })
})
