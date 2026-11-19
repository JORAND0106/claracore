/**
 * Subcontratista ve todos sus registros asignados; objeto de pago no filtra búsqueda.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sicoeRegistroVisibleParaSub } from './sicoeSubcontratistaRegistros.js'

const here = dirname(fileURLToPath(import.meta.url))
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')
const pyVis = readFileSync(join(here, '../../../../backend/sicoe_subcontratista_registros.py'), 'utf8')
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')

describe('Sicoe — visibilidad sub sin filtrar por objeto de pago', () => {
  it('buscar/analisis/cpi no pasan solo_objeto_pago_sub=restricted', () => {
    assert.equal(/solo_objeto_pago_sub=_sub_restricto/.test(main), false)
    assert.match(main, /solo_objeto_pago_sub=False/)
  })

  it('detalle filtrar_registros_para_sub no exige objeto de pago', () => {
    assert.match(pyVis, /Incluye cualquier estado de validación/)
    assert.equal(
      sicoeRegistroVisibleParaSub(
        { subcontratista_id: 3, nivel2_objeto_pago_sub: false },
        3,
      ),
      true,
    )
  })

  it('poll de sesión refresca empresa', () => {
    assert.match(app, /const empresaChanged =/)
    assert.match(app, /msgs\.push\('empresa'\)/)
  })

  it('validar_sub y helper de query conservan nivel2_objeto_pago_sub', () => {
    // Cortes / validación de pago: la condición sigue existiendo en el helper.
    assert.match(main, /if solo_objeto_pago_sub:/)
    assert.match(main, /nivel2_objeto_pago_sub debe ser True/)
  })
})
