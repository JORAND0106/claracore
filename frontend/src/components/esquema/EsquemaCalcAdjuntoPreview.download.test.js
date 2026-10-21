/**
 * Regresión: al abrir el 3.er gráfico del carrusel, Descargar debe usar ese slide
 * y no el primer PNG/esquema de la lista de siblings.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'EsquemaCalcAdjuntoPreview.jsx'), 'utf8')
const slider = readFileSync(
  join(dir, '../adjuntos/AdjuntosMediaSlider.jsx'),
  'utf8',
)

describe('descarga del gráfico activo (no el primero del carrusel)', () => {
  it('el preview prioriza el item abierto como active', () => {
    assert.match(src, /const active = item \|\| list\[0\] \|\| null/)
    assert.match(src, /data-testid="esquema-calc-download-file"/)
    assert.match(src, /onClick=\{\(\) => downloadFromUrl\(\s*rawUrl/)
  })

  it('el slider no pasa todo el carrusel como siblings de descarga', () => {
    assert.match(slider, /No pasar todo el carrusel como siblings/)
    assert.match(slider, /let siblings = \[enriched\]/)
    assert.doesNotMatch(slider, /setPreview\(\{ item: enriched, siblings: lista \}\)/)
  })
})
