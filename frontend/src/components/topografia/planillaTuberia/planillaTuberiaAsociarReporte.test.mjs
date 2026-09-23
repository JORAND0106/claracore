/**
 * Asociar planilla a reporte SICOE existente + sin alerta Nivel sobre TN.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAsociarReporte.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validarFilasCarteraLocal } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaAsociarReporteModal.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)
const motorSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia.py'),
  'utf8',
)

describe('Asociar planilla a reporte SICOE existente', () => {
  it('UI expone botón y modal de asociar', () => {
    assert.match(formSrc, /PlanillaTuberiaAsociarReporteModal/)
    assert.match(formSrc, /data-asociar-reporte-sicoe-btn/)
    assert.match(formSrc, /Asociar a reporte SICOE existente/)
    assert.match(formSrc, /asociar-reporte-sicoe/)
    assert.match(modalSrc, /Asociar a reporte existente/)
    assert.match(modalSrc, /data-asociar-numero-reporte/)
    assert.match(modalSrc, /data-asociar-esquema-btn/)
    assert.match(modalSrc, /sin actualizar cantidades/i)
  })

  it('backend asocia sin crear registros ni sync de cantidades', () => {
    assert.match(routesSrc, /asociar-reporte-sicoe/)
    assert.match(routesSrc, /def asociar_reporte_sicoe_existente/)
    assert.match(routesSrc, /solo_adjunto/)
    assert.match(routesSrc, /_reemplazar_puntos_topograficos_planilla/)
    assert.match(routesSrc, /El esquema del tramo es obligatorio/)
    // No inserta so_registros en el flujo asociar (solo update)
    const asociarBlock = routesSrc.slice(
      routesSrc.indexOf('def asociar_reporte_sicoe_existente'),
      routesSrc.indexOf('def cerrar('),
    )
    assert.doesNotMatch(asociarBlock, /\.insert\(rows_ins\)/)
    assert.match(asociarBlock, /so_registros[\s\S]*\.update\(/)
  })

  it('sync de cantidades omite vínculos solo_adjunto', () => {
    assert.match(routesSrc, /if link\.get\("solo_adjunto"\)/)
  })
})

describe('Validación cartera — sin alerta Nivel sobre TN', () => {
  it('no genera aviso cuando el nivel está sobre el TN', () => {
    const avisos = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 100.25, cota_fondo_excavacion: 98,
      },
    ], 'ALCANTARILLA')
    assert.equal(avisos.length, 0)
    assert.doesNotMatch(motorSrc, /Nivel sobre TN/)
  })

  it('sí alerta cuando CFE supera TN o el nivel', () => {
    const cfeTn = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 99, cota_fondo_excavacion: 100.5,
      },
    ], 'ALCANTARILLA')
    assert.ok(cfeTn.some((a) => a.msg === 'CFE > TN' && a.prioridad === 'error'))

    const nivelCfe = validarFilasCarteraLocal([
      {
        orden: 1, abscisa: 10, terreno_natural: 100,
        subrasante_via: 97, cota_fondo_excavacion: 98,
      },
    ], 'ALCANTARILLA')
    assert.ok(nivelCfe.some((a) => a.msg === 'Nivel < CFE' && a.prioridad === 'error'))
  })
})
