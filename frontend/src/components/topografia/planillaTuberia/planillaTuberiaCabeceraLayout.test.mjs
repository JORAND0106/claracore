/**
 * Cabecera planilla tubería: layout multilínea con etiquetas visibles.
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

describe('Planilla tubería — cabecera multilínea', () => {
  it('TopoExcelSheet soporta groups con etiquetas visibles', () => {
    assert.match(sheetSrc, /groups/)
    assert.match(sheetSrc, /cc-topo-sheet-groups/)
    assert.match(sheetSrc, /function GroupsLayout/)
    assert.match(sheetSrc, /function CompactField/)
  })

  it('cabecera usa al menos 3 grupos lógicos etiquetados', () => {
    assert.match(formSrc, /groups=\{\[/)
    assert.match(formSrc, /Identificación del tramo/)
    assert.match(formSrc, /Tubería \/ sección/)
    assert.match(formSrc, /Coordenadas \(Abs Inicial \/ Final\)/)
  })

  it('conserva PK por mapa y coords Abs Inicial/Final editables', () => {
    assert.match(formSrc, /setPkMapOpen\(true\)/)
    assert.match(formSrc, /norte_abs_inicial/)
    assert.match(formSrc, /este_abs_final/)
    assert.match(formSrc, /BitacoraMaterialUbicacionModal/)
  })
})
