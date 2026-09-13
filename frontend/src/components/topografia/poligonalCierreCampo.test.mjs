/**
 * Cierre lineal muestra dato de campo (no post-Bowditch).
 * Ejecutar: node --test frontend/src/components/topografia/poligonalCierreCampo.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const panel = readFileSync(join(dir, 'PoligonalCierrePanel.jsx'), 'utf8')
const routes = readFileSync(join(dir, '../../../../backend/topografia_routes.py'), 'utf8')
const calc = readFileSync(join(dir, 'PoligonalCalculoTable.jsx'), 'utf8')
const grafico = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')

describe('Cierre lineal = dato de campo', () => {
  it('panel usa prelim/campo como principal y ya no muestra fila Prelim. campo', () => {
    assert.match(panel, /cierrePreliminar/)
    assert.match(panel, /usarPre|cierre_lineal_es_campo|cierre_desde_coords_ajustadas/)
    assert.doesNotMatch(panel, />Prelim\. campo</)
    assert.doesNotMatch(panel, /ajustado \(Bowditch\)/)
  })

  it('GET overlaya cierre lineal de campo sobre el payload', () => {
    assert.match(routes, /cierre_lineal_es_campo/)
    assert.match(routes, /calcular_cierre_preliminar_campo/)
  })
})

describe('Encuadre Mapbox', () => {
  it('botón de extent junto al norte', () => {
    assert.match(grafico, /data-poligonal-extent/)
    assert.match(grafico, /fitToTraverse/)
    assert.match(grafico, /data-poligonal-compass/)
  })
})

describe('Cartera punto de arranque', () => {
  it('primera fila con Arranque y solo N/E/Z', () => {
    assert.match(calc, /puntoInicial/)
    assert.match(calc, /arranque/)
    assert.match(calc, /Arranque/)
    assert.match(calc, /arranque-poligonal/)
  })
})

describe('Reabrir resiliente a PGRST204', () => {
  it('omite columnas ausentes al actualizar topo_poligonales', () => {
    assert.match(routes, /_update_topo_poligonales_safe/)
    assert.match(routes, /_pgrst_unknown_column_topo/)
    assert.match(routes, /error_lineal_preliminar/)
  })
})
