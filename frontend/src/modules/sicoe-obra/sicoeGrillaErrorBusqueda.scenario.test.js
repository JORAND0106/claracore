/**
 * Si /reportes/buscar falla, la UI no debe decir «Sin resultados».
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')

describe('grilla Por reporte — error vs sin resultados', () => {
  it('detecta !res.ok en buscarReportes y guarda errorGrillaBusqueda', () => {
    assert.match(app, /errorGrillaBusqueda/)
    assert.match(app, /setErrorGrillaBusqueda/)
    assert.match(app, /if \(!res\.ok\)/)
    assert.match(app, /err\.grilla = true/)
  })

  it('muestra aviso con Reintentar y no Sin resultados ante error', () => {
    assert.match(app, /No se pudo cargar la grilla/)
    assert.match(app, /Reintentar/)
    const errIdx = app.indexOf('errorGrillaBusqueda ?')
    const emptyIdx = app.indexOf('Sin resultados para los filtros aplicados')
    assert.ok(errIdx > 0 && emptyIdx > errIdx)
  })

  it('select liviano backend omite valor_total', () => {
    const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')
    const parts = main.split('_SICOE_GRILLA_COLS_PARTS')[1] || ''
    const block = parts.slice(0, 800)
    assert.match(block, /enlace_soporte/)
    assert.equal(/valor_total/.test(block), false)
  })
})
