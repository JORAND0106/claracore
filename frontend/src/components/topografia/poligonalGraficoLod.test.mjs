/**
 * Regresión: Plano simplificado (nombres) + popup al clic en nodo.
 * Ejecutar: node --test frontend/src/components/topografia/poligonalGraficoLod.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'PoligonalGrafico.jsx'), 'utf8')
const gestures = readFileSync(join(dir, 'useTopoViewportGestures.js'), 'utf8')

describe('PoligonalGrafico vista simplificada + popup', () => {
  it('por defecto solo muestra nombres (sin ángulos/distancias/coords permanentes)', () => {
    assert.match(src, /NameLabel/)
    assert.match(src, /pickVisibleLabelIndices/)
    assert.doesNotMatch(src, /mostrarDistancias|mostrarAngulos/)
    assert.doesNotMatch(src, /resolvePlanoLod|placePointLabels|showCoords|showAngs/)
    assert.doesNotMatch(src, /Detalle: nombres \+ distancias/)
  })

  it('abre popup de detalle al clic/tap en un nodo', () => {
    assert.match(src, /NodoDetallePopup|selectedKey/)
    assert.match(src, /distanciasVecinas/)
    assert.match(src, /Dist\. anterior|distPrev/)
    assert.match(src, /Dist\. siguiente|distNext/)
    assert.match(src, /trySelectFromTap|consumeTap/)
    assert.match(src, /Clic en un punto: detalle/)
  })

  it('conserva marcadores acotados, zoom táctil y viewBox', () => {
    assert.match(src, /markerRadiusSvg/)
    assert.match(src, /useTopoViewportGestures/)
    assert.match(src, /viewBox/)
    assert.match(gestures, /consumeTap/)
  })
})
