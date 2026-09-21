/**
 * Nombre obligatorio y único — Planillas de Tubería.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaNombre.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validarNombrePlanilla } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('Nombre planilla — obligatorio y único', () => {
  it('validarNombrePlanilla rechaza vacío y duplicados', () => {
    assert.equal(validarNombrePlanilla('').ok, false)
    assert.equal(validarNombrePlanilla('   ').ok, false)
    const lista = [{ id: 'a', nombre: 'Tramo Norte' }, { id: 'b', nombre: 'Otro' }]
    assert.equal(validarNombrePlanilla('tramo norte', lista).ok, false)
    assert.equal(validarNombrePlanilla('Tramo Norte', lista, 'a').ok, true)
    const ok = validarNombrePlanilla('  Nuevo  ', lista)
    assert.equal(ok.ok, true)
    assert.equal(ok.nombre, 'Nuevo')
  })

  it('backend elimina default Planilla {tipo} y exige unicidad', () => {
    assert.match(routesSrc, /_assert_nombre_planilla_unico/)
    assert.doesNotMatch(routesSrc, /f"Planilla \{tipo\}"/)
    assert.match(routesSrc, /El nombre de la planilla es obligatorio/)
  })

  it('UI valida al crear y guardar params; input de nombre al crear', () => {
    assert.match(formSrc, /validarNombrePlanilla/)
    assert.match(formSrc, /Nombre \(obligatorio\)/)
    assert.match(formSrc, /const vNom = validarNombrePlanilla\(params\.nombre, lista\)/)
    assert.match(formSrc, /validarNombrePlanilla\(params\.nombre, lista, planilla\.id\)/)
  })
})
