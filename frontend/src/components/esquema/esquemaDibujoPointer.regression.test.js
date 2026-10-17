/**
 * Regresión bloqueante: el lienzo debe recibir pointer/touch.
 * #942 rompió el dibujo con stopPropagation() en fase capture del wrap padre.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extrudeModeForView } from './esquema3dViews.js'

const here = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(here, 'EsquemaEditorModal.jsx'), 'utf8')

describe('regresión · se puede dibujar (pointer llega al canvas)', () => {
  it('el wrap de dibujo no corta pointer/touch en fase capture con stopPropagation', () => {
    const wrapIdx = modalSrc.indexOf('data-testid="esquema-drawing-wrap"')
    assert.ok(wrapIdx > 0, 'falta esquema-drawing-wrap')
    // Ventana de ~40 líneas del atributo wrap (JSX del contenedor).
    const window = modalSrc.slice(wrapIdx, wrapIdx + 1800)
    assert.equal(
      /onPointerDownCapture\s*=\s*\{[^}]*stopPropagation/.test(window),
      false,
      'onPointerDownCapture + stopPropagation en el wrap bloquea el canvas (regresión #942)',
    )
    assert.equal(
      /onTouchStartCapture\s*=\s*\{[^}]*stopPropagation/.test(window),
      false,
      'onTouchStartCapture + stopPropagation en el wrap bloquea el canvas (regresión #942)',
    )
    // El canvas sí debe manejar pointer.
    assert.match(modalSrc, /onPointerDown=\{onPointerDown\}/)
    assert.match(modalSrc, /touchAction:\s*'none'/)
  })

  it('2D y 3D: modos de extrusión disponibles (popup cotas vs longitud)', () => {
    assert.equal(extrudeModeForView('top'), 'cotas')
    assert.equal(extrudeModeForView('bottom'), 'cotas')
    assert.equal(extrudeModeForView('front'), 'length')
    assert.equal(extrudeModeForView('left'), 'length')
    assert.equal(extrudeModeForView('back'), 'length')
    assert.equal(extrudeModeForView('right'), 'length')
  })
})
