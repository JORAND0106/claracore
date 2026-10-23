/**
 * Contrato UI: ventana de registros por ítem reemplaza el acordeón.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SICOE_ACORDEON_FUNCIONES_REQUERIDAS } from './sicoeItemRegistrosVentanaHelpers.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('SicoeItemRegistrosVentana · contrato acordeón → ventana', () => {
  it('la tabla abre SicoeItemRegistrosVentana (no despliega subtabla de registros)', () => {
    const tabla = readFileSync(join(here, 'SicoeReporteItemsTabla.jsx'), 'utf8')
    assert.match(tabla, /SicoeItemRegistrosVentana/)
    assert.match(tabla, /abrirVentanaItem/)
    assert.doesNotMatch(tabla, /function FragmentReg/)
    assert.match(tabla, /Clic para abrir registros del ítem/)
  })

  it('la ventana declara rejilla, detalle, prev/next, volver y leyenda', () => {
    const src = readFileSync(join(here, 'SicoeItemRegistrosVentana.jsx'), 'utf8')
    assert.match(src, /data-testid="sicoe-item-registros-ventana"/)
    assert.match(src, /data-testid="sicoe-item-ventana-rejilla"/)
    assert.match(src, /data-testid="sicoe-item-ventana-detalle"/)
    assert.match(src, /data-testid="sicoe-item-ventana-prev"/)
    assert.match(src, /data-testid="sicoe-item-ventana-next"/)
    assert.match(src, /data-testid="sicoe-item-ventana-volver-rejilla"/)
    assert.match(src, /onTrasValidacionExitosa/)
    assert.match(src, /evidenciaMosaico/)
    assert.match(src, /LeyendaEstados|sicoe-item-ventana-leyenda/)
  })

  it('inventario de funciones del acordeón documentado', () => {
    assert.ok(SICOE_ACORDEON_FUNCIONES_REQUERIDAS.length >= 10)
  })
})
