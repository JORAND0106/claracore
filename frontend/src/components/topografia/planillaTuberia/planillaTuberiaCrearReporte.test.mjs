/**
 * Tests del bridge Planilla tubería → SICOE so_reportes/so_registros.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCrearReporte.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)
const sicoeSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_sicoe.py'),
  'utf8',
)

describe('Planillas Tubería — Crear Reporte SICOE', () => {
  it('backend: endpoint y armado de líneas sin ítem', () => {
    assert.match(routesSrc, /crear-reporte-sicoe/)
    assert.match(routesSrc, /CrearReporteSicoeBody/)
    assert.match(routesSrc, /Sin Asignar Ítem/)
    assert.match(sicoeSrc, /def lineas_registros_desde_calculo/)
    assert.match(sicoeSrc, /claracore:planilla-tuberia:/)
    assert.match(sicoeSrc, /observacion/)
  })

  it('UI: botón Crear reporte + modal actores', () => {
    assert.match(formSrc, /Crear reporte/)
    assert.match(formSrc, /crear-reporte-sicoe/)
    assert.match(formSrc, /subcontratista_id/)
    assert.match(formSrc, /inspector_id/)
    assert.match(formSrc, /capitulo/)
    assert.match(formSrc, /nodo_ini/)
    assert.match(formSrc, /nodo_fin/)
  })
})
