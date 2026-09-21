/**
 * Fotos por línea de cantidad/descuento + bloqueo al guardar cartera.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaFotosLinea.test.mjs
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
const engineSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia.py'),
  'utf8',
)

describe('Planillas Tubería — fotos por línea', () => {
  it('UI: FotoLineaBtn en cantidades y descuentos + validación al guardar', () => {
    assert.match(formSrc, /function FotoLineaBtn/)
    assert.match(formSrc, /fotosLineas/)
    assert.match(formSrc, /fotos_lineas: fotosLineas/)
    assert.match(formSrc, /lineasSinFoto/)
    assert.match(formSrc, /Registro fotográfico obligatorio/)
    assert.match(formSrc, /setFotosDeLinea\('cantidades'/)
    assert.match(formSrc, /setFotosDeLinea\('descuentos'/)
    assert.ok(formSrc.includes("'Foto'"))
  })

  it('backend: validar_fotos_lineas y persistencia en cartera', () => {
    assert.match(engineSrc, /def validar_fotos_lineas/)
    assert.match(routesSrc, /validar_fotos_lineas/)
    assert.match(routesSrc, /fotos_lineas/)
    assert.match(routesSrc, /class CarteraBody/)
  })
})
