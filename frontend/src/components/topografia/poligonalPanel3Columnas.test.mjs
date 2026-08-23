/**
 * Regresión: panel 2 bloques (Amarres+Armadas | Agregar punto 2 col).
 * node --test src/components/topografia/poligonalPanel3Columnas.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PoligonalModal.jsx'), 'utf8')

describe('PoligonalModal — panel 2 bloques libreta', () => {
  it('usa 2 bloques: izquierdo Amarres+Armadas, derecho Agregar punto', () => {
    assert.match(src, /minmax\(0, 1\.15fr\) minmax\(0, 1fr\)/)
    assert.match(src, /Bloque izquierdo — Amarres/)
    assert.match(src, /Bloque derecho — Agregar punto/)
    assert.match(src, /COLS_AMARRES_LIBRETA/)
    assert.match(src, /COLS_AGREGAR_PUNTO_2COL/)
  })

  it('Amarres es TopoExcelSheet y Puntos de armada queda debajo', () => {
    const izq = src.indexOf('Bloque izquierdo — Amarres')
    const amarreSheet = src.indexOf('columns={COLS_AMARRES_LIBRETA}', izq)
    const armadas = src.indexOf('title="Puntos de armada"', izq)
    const derecho = src.indexOf('Bloque derecho — Agregar punto')
    assert.ok(amarreSheet > izq && armadas > amarreSheet && derecho > armadas)
  })

  it('conserva Guardar amarres, Cambiar armada y Agregar punto', () => {
    assert.match(src, /onClick=\{guardarAmarres\}/)
    assert.match(src, /Cambiar armada/)
    assert.match(src, />\s*Agregar punto\s*</)
  })

  it('cartera y plano quedan debajo del panel', () => {
    const panelIdx = src.indexOf('Bloque izquierdo — Amarres')
    const carteraIdx = src.indexOf('Cartera consolidada')
    const graficoIdx = src.indexOf('<PoligonalGrafico')
    assert.ok(panelIdx > 0 && carteraIdx > panelIdx)
    assert.ok(graficoIdx > carteraIdx)
  })

  it('en viewport compacto apila a una columna', () => {
    assert.match(src, /gridTemplateColumns: isCompact \? '1fr' : 'minmax\(0, 1\.15fr\) minmax\(0, 1fr\)'/)
  })
})
