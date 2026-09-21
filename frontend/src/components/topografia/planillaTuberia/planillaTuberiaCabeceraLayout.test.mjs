/**
 * Cabecera planilla tubería: 2 filas Excel compactas (sin bloques de grupo).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCabeceraLayout.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const sheetSrc = readFileSync(join(dir, '../TopoExcelSheet.jsx'), 'utf8')

describe('Planilla tubería — cabecera compacta 2 filas', () => {
  it('TopoExcelSheet soporta rows (Excel apilado sin títulos de grupo)', () => {
    assert.match(sheetSrc, /function ExcelRowsLayout/)
    assert.match(sheetSrc, /Array\.isArray\(rows\)/)
    assert.match(sheetSrc, /cc-topo-sheet-rows/)
    assert.match(sheetSrc, /width: '80%'/)
  })

  it('cabecera usa exactamente 2 filas de datos (tramo + coords), sin groups', () => {
    assert.match(formSrc, /rows=\{\[/)
    assert.match(formSrc, /key: 'tramo'/)
    assert.match(formSrc, /key: 'coords'/)
    assert.doesNotMatch(formSrc, /groups=\{\[/)
    assert.doesNotMatch(formSrc, /Identificación del tramo/)
    assert.doesNotMatch(formSrc, /Tubería \/ sección/)
  })

  it('conserva PK por mapa, coords y campos de tubería editables', () => {
    assert.match(formSrc, /setPkMapOpen\(true\)/)
    assert.match(formSrc, /norte_abs_inicial/)
    assert.match(formSrc, /este_abs_final/)
    assert.match(formSrc, /diametro_m/)
    assert.match(formSrc, /relacion_atraque/)
    assert.match(formSrc, /BitacoraMaterialUbicacionModal/)
  })
})
