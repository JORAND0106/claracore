/**
 * UI Crear reporte SICOE: z-index, autocomplete, abscisas, encabezado con logo.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCrearReporteUi.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abscisasExtremosPlanilla } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Crear reporte SICOE — UI popup', () => {
  it('importa API_BASE desde src/apiBase (evita ReferenceError en catálogos)', () => {
    assert.match(modalSrc, /import\s*\{\s*API_BASE\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/apiBase['"]/)
    assert.match(modalSrc, /\$\{API_BASE\}\/sicoe-obra\/\$\{contratoId\}\/subcontratistas-activos/)
    assert.match(modalSrc, /\$\{API_BASE\}\/sicoe-obra\/\$\{contratoId\}\/inspectores/)
    // Catálogos: exigir ok HTTP y vaciar listas si falla (buscador no queda “mudo” sin error)
    assert.match(modalSrc, /if\s*\(\s*!rs\.ok\s*\|\|\s*!ri\.ok\s*\|\|\s*!rc\.ok\s*\)/)
    assert.match(modalSrc, /setSubs\(\[\]\)/)
    assert.match(modalSrc, /setInsps\(\[\]\)/)
  })

  it('z-index por encima del editor de planilla y del PK', () => {
    assert.match(modalSrc, /CREAR_REPORTE_Z_INDEX\s*=\s*100060/)
    assert.match(modalSrc, /zIndex:\s*CREAR_REPORTE_Z_INDEX/)
    assert.match(modalSrc, /createPortal/)
    assert.match(formSrc, /zIndex:\s*100030/)
    assert.match(formSrc, /zIndex=\{100050\}/)
  })

  it('unifica Inspector/Subcontratista en CatalogAutocomplete (sin select+buscar)', () => {
    assert.match(modalSrc, /function CatalogAutocomplete/)
    assert.match(modalSrc, /aria-autocomplete="list"/)
    assert.match(modalSrc, /label="Subcontratista"/)
    assert.match(modalSrc, /label="Inspector"/)
    // Ya no hay el patrón buscador + <select> redundante
    assert.doesNotMatch(modalSrc, /placeholder="Buscar…"[\s\S]{0,80}<select/)
  })

  it('abscisas autodiligenciadas desde cartera (min/max) y preferencia por filas', () => {
    const abs = abscisasExtremosPlanilla(
      { cartera: { totales: { abscisa_inicial: 99, abscisa_final: 100 } } },
      [{ abscisa: '1,5' }, { abscisa: '9.2' }, { abscisa: '' }],
    )
    assert.equal(abs.absInicio, 1.5)
    assert.equal(abs.absFinal, 9.2)
    assert.match(modalSrc, /setNodoIni\(a0\)/)
    assert.match(modalSrc, /setNodoFin\(a1\)/)
    assert.match(modalSrc, /abs_inicio:\s*absIni/)
    assert.match(modalSrc, /abs_final:\s*absFin/)
  })

  it('encabezado con logo institucional y meta de planilla', () => {
    assert.match(modalSrc, /logoUrl/)
    assert.match(modalSrc, /Logo contratista|LOGO/)
    assert.match(modalSrc, /Crear reporte SICOE Obra/)
    assert.match(formSrc, /logo_contratista/)
    assert.match(formSrc, /logoUrl=\{usuario\?\.logo_contratista/)
  })
})
