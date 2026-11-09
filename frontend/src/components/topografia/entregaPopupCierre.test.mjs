/**
 * Regresión: el X de la entrega debe cerrar siempre y no reabrir ni dejar capas bloqueantes.
 * node --test src/components/topografia/entregaPopupCierre.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Vías — cierre del popup de entrega', () => {
  it('no reabre sola la primera entrega al cerrar (sel null)', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    assert.doesNotMatch(
      src,
      /if\s*\(\s*!lista\.length\s*\|\|\s*sel\s*\|\|\s*creando\s*\)\s*return[\s\S]*?cargarDetalle\(lista\[0\]\.id\)/,
    )
  })

  it('cerrarEntregaPopup cierra siempre y limpia capas hijas', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    const fn = src.slice(src.indexOf('const cerrarEntregaPopup'), src.indexOf('const abrirNivelacion'))
    assert.match(fn, /setDetalle\(null\)/)
    assert.match(fn, /setSel\(null\)/)
    assert.match(fn, /setNivelacionOpen\(false\)/)
    assert.match(fn, /setCargaCarteraOpen\(false\)/)
    assert.doesNotMatch(fn, /if\s*\(\s*nivelacionOpen\s*\)\s*return/)
    assert.doesNotMatch(fn, /if\s*\(\s*carteraSinGuardar\(\)\s*\)/)
  })

  it('confirmaciones quedan por encima del popup de entrega', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    assert.match(src, /zIndex:\s*100060/)
    assert.match(src, /zIndex=\{100200\}/)
  })

  it('nivelación y cargar cartera cierran con X sin dejar capa', () => {
    const niv = readFileSync(join(dir, 'EntregaNivelacionLecturasModal.jsx'), 'utf8')
    assert.match(niv, /const cerrar = \(e\) =>/)
    assert.match(niv, /onClose\?\.\(\)/)
    assert.doesNotMatch(niv, /window\.confirm/)

    const carga = readFileSync(join(dir, 'EntregaCarteraCargaModal.jsx'), 'utf8')
    assert.match(carga, /IconClose/)
    assert.match(carga, /aria-label="Cerrar"/)
    assert.match(carga, /onClose\?\.\(\)/)
  })
})
