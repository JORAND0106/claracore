import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decimalAPuntosPct,
  etiquetaTributos,
  formAiuDesdeTributos,
  fmtPctDesdeDecimal,
  fmtSumatoriaAiu,
  normalizarTributos,
  parseEntradaAPuntosPct,
  puntosPctADecimal,
  seedTributosDesdeLegado,
  sumatoriaAiuPuntosPct,
  tributosDesdeForm,
} from './catalogoInsumosTributos.js'

describe('catalogoInsumosTributos', () => {
  it('normaliza AIU e IVA independientes (puntos %)', () => {
    const t = normalizarTributos({
      aiu: { administracion: '5', imprevistos: 3, utilidad: 5, iva_utilidad: 19 },
      iva: { porcentaje: '19', sobre: 'utilidad' },
    })
    assert.equal(t.aiu.administracion, 5)
    assert.equal(t.iva.sobre, 'utilidad')
    assert.equal(t.iva.porcentaje, 19)
  })

  it('convierte decimal ↔ puntos %', () => {
    assert.equal(decimalAPuntosPct('0.05'), 5)
    assert.equal(decimalAPuntosPct('0.195'), 19.5)
    assert.equal(puntosPctADecimal(5), '0.05')
    assert.equal(fmtPctDesdeDecimal('0.05'), '5%')
  })

  it('sumatoria A+I+U en % (sin IVA/Util)', () => {
    const form = { administracion: '0.05', imprevistos: '0.03', utilidad: '0.05', iva_utilidad: '0.19' }
    assert.equal(sumatoriaAiuPuntosPct(form), 13)
    assert.equal(fmtSumatoriaAiu(form), '13%')
  })

  it('parse CSV: decimal o puntos', () => {
    assert.equal(parseEntradaAPuntosPct('0.05'), 5)
    assert.equal(parseEntradaAPuntosPct('5'), 5)
    assert.equal(parseEntradaAPuntosPct('19%'), 19)
  })

  it('arma etiqueta legible', () => {
    const e = etiquetaTributos({
      aiu: { administracion: 5, imprevistos: 3, utilidad: 5, iva_utilidad: 19 },
      iva: { porcentaje: 19, sobre: 'costo_base' },
    })
    assert.match(e, /AIU/)
    assert.match(e, /IVA 19%/)
  })

  it('migra legado IVA a tributos', () => {
    const t = seedTributosDesdeLegado({ tipo_impuesto: 'iva', impuesto_porcentaje: 19 })
    assert.equal(t.iva.porcentaje, 19)
    assert.equal(t.iva.sobre, 'costo_base')
  })

  it('roundtrip form decimal → tributos puntos %', () => {
    const t = tributosDesdeForm(
      { administracion: '0.05', imprevistos: '', utilidad: '0.04', iva_utilidad: '0.19' },
      { porcentaje: '19', sobre: 'aiu' },
    )
    assert.equal(t.aiu.imprevistos, null)
    assert.equal(t.aiu.administracion, 5)
    assert.equal(t.aiu.utilidad, 4)
    assert.equal(t.aiu.iva_utilidad, 19)
    const form = formAiuDesdeTributos(t)
    assert.equal(form.utilidad, '0.04')
    assert.equal(form.administracion, '0.05')
    assert.equal(form.imprevistos, '')
  })
})
