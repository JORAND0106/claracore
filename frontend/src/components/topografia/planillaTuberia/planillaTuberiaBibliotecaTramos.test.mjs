/**
 * Biblioteca de tramos: menú + navegación al editor de planillas.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaBibliotecaTramos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const bibSrc = readFileSync(join(dir, 'BibliotecaTramos.jsx'), 'utf8')
const mainSrc = readFileSync(join(dir, '../TopografiaMain.jsx'), 'utf8')

describe('Biblioteca de tramos — menú y navegación', () => {
  it('agrega entrada de menú debajo de Planillas de Tubería', () => {
    assert.match(mainSrc, /id: 'topo_biblioteca_tramos'/)
    assert.match(mainSrc, /label: 'Biblioteca de tramos'/)
    const idxPlanillas = mainSrc.indexOf("id: 'topo_planillas_tuberia'")
    const idxBib = mainSrc.indexOf("id: 'topo_biblioteca_tramos'")
    assert.ok(idxPlanillas >= 0 && idxBib > idxPlanillas)
  })

  it('BibliotecaTramos lista planillas y abre en el editor', () => {
    assert.match(bibSrc, /api\('\/planillas-tuberia'\)/)
    assert.match(bibSrc, /onAbrirPlanilla/)
    assert.match(bibSrc, /p\.pk_id/)
    assert.match(bibSrc, /p\.estado/)
    assert.match(mainSrc, /case 'topo_biblioteca_tramos'/)
    assert.match(mainSrc, /setPlanillaTuberiaFocusId\(id\)/)
    assert.match(mainSrc, /intentarSubmodulo\('topo_planillas_tuberia'\)/)
  })

  it('Planillas de Tubería ya no muestra el panel lateral de listado', () => {
    assert.doesNotMatch(formSrc, /Planillas del contrato/)
    assert.match(formSrc, /Biblioteca de tramos/)
    assert.match(formSrc, /planillaIdFocus/)
    assert.match(formSrc, /onPlanillaFocusConsumed/)
    assert.doesNotMatch(formSrc, /gridTemplateColumns: 'minmax\(200px, 280px\) 1fr'/)
  })
})
