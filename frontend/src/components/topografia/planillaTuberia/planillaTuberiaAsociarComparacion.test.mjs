/**
 * Tabla de comparación del popup Asociar → reporte SICOE.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAsociarComparacion.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASOCIAR_POPUP_ANCHO_PREVIO_PX,
  ASOCIAR_POPUP_ANCHO_PX,
  registrosComparacionDesdeReporte,
} from './planillaTuberiaAsociarComparacion.js'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaAsociarReporteModal.jsx'), 'utf8')

describe('Asociar popup — ancho y tabla comparación', () => {
  it('ensancha el popup al doble (1440)', () => {
    assert.equal(ASOCIAR_POPUP_ANCHO_PREVIO_PX, 720)
    assert.equal(ASOCIAR_POPUP_ANCHO_PX, 1440)
    assert.match(modalSrc, /ASOCIAR_POPUP_ANCHO_PX/)
    assert.match(modalSrc, /data-asociar-reporte-popup/)
    assert.doesNotMatch(modalSrc, /min\(720px/)
  })

  it('layout en dos zonas y z-index por encima de la planilla', () => {
    assert.match(modalSrc, /data-asociar-zona-asociacion/)
    assert.match(modalSrc, /data-asociar-zona-comparacion/)
    assert.match(modalSrc, /data-asociar-comparacion-tabla/)
    assert.match(modalSrc, /CREAR_REPORTE_Z_INDEX/)
    assert.match(modalSrc, /max-width: 900px/)
  })

  it('consulta registros del reporte seleccionado (SICOE ligero) y reacciona al cambio', () => {
    assert.match(modalSrc, /reportes\/\$\{reporteId\}\?ligero=1/)
    assert.match(modalSrc, /registrosComparacionDesdeReporte/)
    assert.match(modalSrc, /selected\?\.id/)
    assert.match(modalSrc, /Ítems cobrados en el reporte/)
  })

  it('registrosComparacionDesdeReporte mapea ítem/dims/cantidad con redondeo SICOE', () => {
    const rows = registrosComparacionDesdeReporte({
      registros: [
        {
          id: 11,
          item_numero: '2.1',
          item_descripcion: 'Excavación',
          observacion: 'Tramo A',
          unidad: 'm3',
          longitud: 10.1234,
          ancho: 1.5,
          espesor: 0.3333,
          cantidad: 1,
          cantidad_total: 5.12345,
        },
        {
          id: 12,
          item_numero: '',
          observacion: 'Sin ítem',
          unidad: 'm',
          longitud: null,
          ancho: null,
          espesor: null,
          cantidad_total: 0.05,
        },
      ],
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].item, '2.1')
    assert.equal(rows[0].descripcion, 'Excavación · Tramo A')
    assert.equal(rows[0].unidad, 'm3')
    assert.equal(rows[0].longitud, '10.123')
    assert.equal(rows[0].ancho, '1.5')
    assert.equal(rows[0].espesor, '0.333')
    // cantidad_total ≥ 0.10 → 2 decimales (regla SICOE)
    assert.equal(rows[0].cantidad, '5.12')
    assert.equal(rows[1].item, '—')
    assert.equal(rows[1].descripcion, 'Sin ítem')
    // cantidad_total < 0.10 → 3 decimales
    assert.equal(rows[1].cantidad, '0.050')
  })

  it('sin registros → lista vacía', () => {
    assert.deepEqual(registrosComparacionDesdeReporte({}), [])
    assert.deepEqual(registrosComparacionDesdeReporte({ registros: null }), [])
  })
})
