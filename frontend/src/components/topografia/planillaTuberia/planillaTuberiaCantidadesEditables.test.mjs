/**
 * Resumen de Cantidades: Excavación Roca al final + editable; línea Otros.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCantidadesEditables.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const engineSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia.py'),
  'utf8',
)

describe('Resumen de Cantidades — Roca al final + Otros editable', () => {
  it('motor: EXC_ROC y OTROS al final con dims editables', () => {
    assert.match(engineSrc, /CODIGOS_CANTIDADES_EDITABLES/)
    assert.match(engineSrc, /"codigo": "OTROS"/)
    assert.match(engineSrc, /cantidades_manuales/)
    const itemsBlock = engineSrc.slice(
      engineSrc.indexOf('ITEMS_CANTIDADES = ('),
      engineSrc.indexOf('CODIGOS_CANTIDADES_EDITABLES'),
    )
    const idxRoc = itemsBlock.indexOf('"EXC_ROC"')
    const idxOtros = itemsBlock.indexOf('"OTROS"')
    const idxExc = itemsBlock.indexOf('"EXC"')
    assert.ok(idxExc >= 0 && idxRoc > idxExc && idxOtros > idxRoc)
  })

  it('UI: inputs Long/Ancho/Espesor y observación Otros en resumen', () => {
    assert.match(formSrc, /cantManuales/)
    assert.match(formSrc, /setOverrideCantidad/)
    assert.match(formSrc, /editable_dims/)
    assert.match(formSrc, /editable_nombre/)
    assert.match(formSrc, /Otros:/)
    assert.match(formSrc, /cantidades_manuales: cantManuales/)
    assert.match(formSrc, /meta_cabecera: metaCabeceraActual\(\)/)
    assert.match(formSrc, /displayNetoCant/)
  })
})
