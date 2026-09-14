import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CAPACITACION_RC_PASOS,
  CAPACITACION_RC_TABS,
  capacitacionRcEsIntro,
  capacitacionRcEsOutro,
  capacitacionRcPasoPorIndice,
  capacitacionRcTabActivo,
  capacitacionRcTotalPasos,
} from './capacitacionReporteCantidadesScript.js'

describe('capacitacionReporteCantidadesScript', () => {
  it('cubre intro + 5 pestañas del asistente + envío', () => {
    assert.equal(CAPACITACION_RC_TABS.length, 5)
    assert.ok(capacitacionRcTotalPasos() >= 10)

    const fases = new Set(CAPACITACION_RC_PASOS.map((p) => p.fase))
    assert.ok(fases.has('intro'))
    assert.ok(fases.has('wizard'))
    assert.ok(fases.has('outro'))

    const tabsTocadas = new Set(
      CAPACITACION_RC_PASOS.filter((p) => p.tab != null).map((p) => p.tab),
    )
    assert.deepEqual([...tabsTocadas].sort(), [0, 1, 2, 3, 4])
  })

  it('mantiene el orden de highlights clave de la referencia', () => {
    const ids = CAPACITACION_RC_PASOS.map((p) => p.id)
    assert.ok(ids.indexOf('assemble') < ids.indexOf('lockup'))
    assert.ok(ids.indexOf('lockup') < ids.indexOf('hold'))
    assert.ok(ids.indexOf('paso1-tabs') < ids.indexOf('paso2-descripcion'))
    assert.ok(ids.indexOf('paso3-plantilla') < ids.indexOf('paso4-tipo'))
    assert.ok(ids.indexOf('paso5-agregar') < ids.indexOf('paso6-topografia'))
    assert.ok(ids.indexOf('paso6-topografia') < ids.indexOf('paso7-enviar'))
  })

  it('expone helpers de navegación seguros', () => {
    const first = capacitacionRcPasoPorIndice(0)
    const last = capacitacionRcPasoPorIndice(999)
    assert.equal(first.id, 'assemble')
    assert.equal(last.id, 'paso7-enviar')
    assert.equal(capacitacionRcEsIntro(first), true)
    assert.equal(capacitacionRcEsOutro(last), true)
    assert.equal(capacitacionRcTabActivo(first), 0)
    assert.equal(capacitacionRcTabActivo({ tab: 4 }), 4)
    assert.equal(capacitacionRcTabActivo({ tab: 99 }), 4)
  })

  it('incluye duraciones positivas alineadas al ritmo de referencia', () => {
    for (const paso of CAPACITACION_RC_PASOS) {
      assert.ok(paso.durMs >= 800, `${paso.id} sin duración útil`)
      assert.ok(paso.titulo && paso.narracion)
    }
  })
})
