/**
 * Reabrir poligonal (solo Desarrollador) + prelim. campo desde crudos.
 * Ejecutar: node --test frontend/src/components/topografia/poligonalReabrirDev.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const modal = readFileSync(join(dir, 'PoligonalModal.jsx'), 'utf8')
const routes = readFileSync(join(dir, '../../../../backend/topografia_routes.py'), 'utf8')
const utils = readFileSync(join(dir, '../../../../backend/topografia_utils.py'), 'utf8')

describe('Reabrir poligonal (Desarrollador)', () => {
  it('UI solo con esDesarrolladorTopo y estado cerrado', () => {
    assert.match(modal, /reabrirPoligonalDev/)
    assert.match(modal, /Reabrir poligonal/)
    assert.match(modal, /esDesarrolladorTopo\(usuario\)/)
    assert.match(modal, /estado.*cerrado|cerrado.*Reabrir/)
    assert.match(modal, /\/poligonales\/\$\{poligonalId\}\/reabrir/)
  })

  it('endpoint POST /reabrir limpia ajuste, vuelve a borrador y registra log', () => {
    assert.match(routes, /def reabrir_poligonal/)
    assert.match(routes, /\/reabrir/)
    assert.match(routes, /Solo desarrollador puede reabrir/)
    assert.match(routes, /estado.*borrador|"borrador"/)
    assert.match(routes, /_limpiar_ajuste_poligonal/)
    assert.match(routes, /REABRIR_POLIGONAL/)
    assert.match(routes, /registrar_log/)
  })

  it('preliminar de campo se recalcula desde lecturas crudas', () => {
    assert.match(utils, /def calcular_cierre_preliminar_campo/)
    assert.match(utils, /def estaciones_campo_crudas/)
    assert.match(routes, /calcular_cierre_preliminar_campo/)
    assert.match(utils, /fuente.: .recalculado_campo.|fuente.*recalculado_campo/)
  })
})
