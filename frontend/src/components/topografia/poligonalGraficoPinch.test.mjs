/**
 * Regresión: Plano de poligonal sobre Mapbox satelital (EPSG:3116 → WGS84).
 * Ejecutar: node --test frontend/src/components/topografia/poligonalGraficoPinch.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const grafico = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')
const crs = readFileSync(join(dir, '../../utils/epsg3116.js'), 'utf8')

describe('PoligonalGrafico Mapbox satelital', () => {
  it('usa Mapbox satélite con transformación EPSG:3116', () => {
    assert.match(grafico, /crearMapboxMapSeguro/)
    assert.match(grafico, /SICOE_MAPA_STYLE_SATELLITE|satellite-streets/)
    assert.match(grafico, /gkBogotaToWgs84/)
    assert.match(grafico, /POLIGONAL_SATELLITE_OPACITY/)
    assert.match(grafico, /raster-opacity/)
    assert.match(crs, /EPSG:3116|1000000/)
  })

  it('conserva restablecer zoom, pan/zoom y clic en punto', () => {
    assert.match(grafico, /Restablecer zoom/)
    assert.match(grafico, /fitBounds|fitToTraverse/)
    assert.match(grafico, /pellizcar|Rueda/)
    assert.match(grafico, /NodoDetallePopup|selectedKey/)
    assert.match(grafico, /Clic en un punto: detalle/)
  })

  it('tiene control de orientación al norte (bearing 0)', () => {
    assert.match(grafico, /orientNorth|bearing:\s*0/)
    assert.match(grafico, /data-poligonal-compass|data-poligonal-north/)
  })

  it('tiene control de encuadre (fit bounds)', () => {
    assert.match(grafico, /data-poligonal-extent/)
    assert.match(grafico, /fitToTraverse|fitBounds/)
  })

  it('ya no depende del lienzo cartesiano SVG con viewBox propio', () => {
    assert.doesNotMatch(grafico, /useTopoViewportGestures/)
    assert.match(grafico, /data-poligonal-mapbox/)
  })
})
