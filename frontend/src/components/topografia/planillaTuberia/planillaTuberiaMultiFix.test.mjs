/**
 * Multi-fix UI — grilla perfil, Área en descuentos, alertas tabulares.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaMultiFix.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  agruparAlertasValidacion,
  validarFilasCarteraLocal,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const perfilSrc = readFileSync(join(dir, 'PlanillaTuberiaPerfil.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('Planilla tubería — multi-fix UI/persist', () => {
  it('perfil declara grilla horizontal y vertical', () => {
    assert.match(perfilSrc, /Grilla de referencia/)
    assert.match(perfilSrc, /xTicks/)
    assert.match(perfilSrc, /yTicks/)
  })

  it('Descuentos Específicos usa etiqueta Área (no Espesor)', () => {
    assert.match(formSrc, /\['Item', 'Long', 'Ancho', 'Área', 'Cantidad'\]/)
    assert.match(routesSrc, /desc num">Área</)
    // Resumen de cantidades sigue con Espesor
    assert.match(formSrc, /\['Item', 'Long', 'Ancho', 'Espesor', 'Desc\.', 'Cantidad'\]/)
  })

  it('replace usa estrategia upsert por orden', () => {
    assert.match(routesSrc, /strategy=upsert_orden/)
    assert.match(routesSrc, /Guarde la cartera de campo/)
  })

  it('alertas se agrupan en tabla Abscisa|Diferencia', () => {
    const avisos = validarFilasCarteraLocal([
      { orden: 1, abscisa: 10, terreno_natural: 100, subrasante_via: 100.2, cota_fondo_excavacion: 98 },
      { orden: 2, abscisa: 20, terreno_natural: 101, subrasante_via: 101.3, cota_fondo_excavacion: 99 },
    ], 'ALCANTARILLA')
    assert.ok(avisos.length >= 2)
    assert.ok(avisos.every((a) => a.msg === 'Nivel sobre TN'))
    assert.equal(avisos[0].diferencia, 0.2)
    const grupos = agruparAlertasValidacion(avisos)
    assert.equal(grupos.length, 1)
    assert.equal(grupos[0].filas.length, 2)
    assert.match(formSrc, /agruparAlertasValidacion/)
    assert.match(formSrc, />Abscisa</)
    assert.match(formSrc, />Diferencia</)
  })
})
