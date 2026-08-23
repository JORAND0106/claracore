/**
 * Regresión: panel superior 3 columnas (Amarres | Armadas | Agregar punto).
 * node --test src/components/topografia/poligonalPanel3Columnas.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PoligonalModal.jsx'), 'utf8')

describe('PoligonalModal — panel 3 columnas libreta', () => {
  it('define grilla 3 columnas para el panel superior', () => {
    assert.match(src, /minmax\(0, 1\.05fr\) minmax\(0, 0\.95fr\) minmax\(0, 1\.1fr\)/)
    assert.match(src, /Columna 1 — Amarres/)
    assert.match(src, /Columna 2 — Puntos de armada/)
    assert.match(src, /Columna 3 — Agregar/)
  })

  it('conserva Guardar amarres, Cambiar armada y Agregar punto', () => {
    assert.match(src, /onClick=\{guardarAmarres\}/)
    assert.match(src, /Cambiar armada/)
    assert.match(src, />\s*Agregar punto\s*</)
  })

  it('cartera y plano quedan debajo del panel consolidado', () => {
    const panelIdx = src.indexOf('Columna 1 — Amarres')
    const carteraIdx = src.indexOf('Cartera consolidada')
    const graficoIdx = src.indexOf('<PoligonalGrafico')
    assert.ok(panelIdx > 0 && carteraIdx > panelIdx)
    assert.ok(graficoIdx > carteraIdx)
  })

  it('en viewport compacto apila a una columna', () => {
    assert.match(src, /gridTemplateColumns: isCompact\s*\?\s*'1fr'/)
  })
})
