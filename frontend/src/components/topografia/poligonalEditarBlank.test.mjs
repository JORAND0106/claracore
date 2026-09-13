/**
 * Regresión: pantalla en blanco al «Editar poligonal».
 *
 * Causa raíz: CcModalBrandHeader se insertó con theme={t} pero PoligonalModal
 * declara `const theme = …` (no `t`) → ReferenceError: t is not defined al montar.
 *
 * node --test frontend/src/components/topografia/poligonalEditarBlank.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(dir, name), 'utf8')

describe('Editar poligonal — blank screen (CcModalBrandHeader theme)', () => {
  it('PoligonalModal pasa theme (no t) a CcModalBrandHeader', () => {
    const src = read('PoligonalModal.jsx')
    assert.match(src, /import CcModalBrandHeader from ['"]\.\.\/CcModalBrandHeader['"]/)
    assert.match(src, /<CcModalBrandHeader\s+theme=\{theme\}\s*\/>/)
    assert.doesNotMatch(src, /<CcModalBrandHeader\s+theme=\{t\}\s*\/>/)
    assert.match(src, /\bconst theme\s*=/)
  })

  it('PoligonalForm envuelve el modal con TopoRenderErrorBoundary', () => {
    const src = read('PoligonalForm.jsx')
    assert.match(src, /TopoRenderErrorBoundary/)
    assert.match(src, /Error al abrir la poligonal/)
    assert.match(src, /<TopoRenderErrorBoundary[\s\S]*<PoligonalModal[\s\S]*<\/TopoRenderErrorBoundary>/)
  })

  it('TopoRenderErrorBoundary existe y muestra el mensaje de error', () => {
    const src = read('TopoRenderErrorBoundary.jsx')
    assert.match(src, /getDerivedStateFromError/)
    assert.match(src, /componentDidCatch/)
    assert.match(src, /data-topo-render-error/)
    assert.match(src, /Reintentar/)
  })

  it('PoligonalGrafico no usa theme=\{t\} sin definir t', () => {
    const src = read('PoligonalGrafico.jsx')
    assert.doesNotMatch(src, /<CcModalBrandHeader\s+theme=\{t\}\s*\/>/)
  })
})
