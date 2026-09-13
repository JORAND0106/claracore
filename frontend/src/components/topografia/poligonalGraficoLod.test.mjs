/**
 * Regresión: Plano satelital + popup al clic en nodo.
 * Ejecutar: node --test frontend/src/components/topografia/poligonalGraficoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')

describe('PoligonalGrafico vista satelital + popup', () => {
  it('dibuja trazado y etiquetas sobre Mapbox', () => {
    assert.match(src, /poligonal-line|SRC_LINE|LineString/)
    assert.match(src, /text-field|nombre/)
    assert.match(src, /POLIGONAL_SATELLITE_OPACITY/)
    assert.doesNotMatch(src, /mostrarDistancias|mostrarAngulos/)
    assert.doesNotMatch(src, /resolvePlanoLod|placePointLabels|showCoords|showAngs/)
  })

  it('abre popup de detalle al clic en un nodo', () => {
    assert.match(src, /NodoDetallePopup|selectedKey/)
    assert.match(src, /distanciasVecinas/)
    assert.match(src, /Dist\. anterior|distPrev/)
    assert.match(src, /Dist\. siguiente|distNext/)
    assert.match(src, /queryRenderedFeatures/)
    assert.match(src, /Clic en un punto: detalle/)
  })

  it('conserva restablecer zoom y gestos nativos Mapbox', () => {
    assert.match(src, /Restablecer zoom/)
    assert.match(src, /fitBounds|fitToTraverse/)
    assert.match(src, /crearMapboxMapSeguro/)
  })
})
