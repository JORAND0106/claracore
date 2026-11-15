/**
 * Plano de Auditoría: eje liviano + dibujos solo del hallazgo seleccionado.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mapa = readFileSync(join(here, 'SicoeMapaHuellas.jsx'), 'utf8')
const amb = readFileSync(join(here, 'SicoeAmbienteAuditoria.jsx'), 'utf8')
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')
const dibujo = readFileSync(join(here, '../../../../backend/sicoe_dibujo_auditoria.py'), 'utf8')

describe('Auditoría — plano rápido e inconsistencias precisas', () => {
  it('mount pide eje sin huellas del contrato', () => {
    assert.match(mapa, /incluir_huellas=false/)
    assert.match(mapa, /Cargando eje y abscisado/)
  })

  it('dibujos se piden con registro_ids del hallazgo', () => {
    assert.match(mapa, /registro_ids/)
    assert.match(mapa, /Dibujos del hallazgo/)
    assert.match(amb, /Solo dibujos del hallazgo seleccionado/)
    assert.equal(/if \(ambitoRegIds != null\) return \[\.\.\.ambitoRegIds\]/.test(amb), false)
  })

  it('API /huellas acepta registro_ids', () => {
    assert.match(main, /registro_ids: Optional\[str\]/)
  })

  it('consistencia usa extremos, no centroide vía franja', () => {
    assert.match(dibujo, /extremos_lnglat_desde_feature/)
    assert.match(dibujo, /Preferible no alertar/)
    assert.equal(/reg_virtual\["coord_lat"\] = centro\["lat"\]/.test(dibujo), false)
    assert.match(dibujo, /digitado:/)
    assert.match(dibujo, /diferencia:/)
    assert.match(dibujo, /tolerancia:/)
  })
})
