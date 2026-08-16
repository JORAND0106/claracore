import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decimalAPuntosPct,
  etiquetaTributos,
  formImpuestoDesdeTributos,
  fmtPctDesdeDecimal,
  fmtSumatoriaAiu,
  inferirTipoImpuesto,
  normalizarTributos,
  parseEntradaAPuntosPct,
  puntosPctADecimal,
  seedTributosDesdeLegado,
  sumatoriaAiuPuntosPct,
  TIPO_IMPUESTO,
  tributosPayloadDesdeForm,
} from './catalogoInsumosTributos.js'

describe('catalogoInsumosTributos — impuesto unificado', () => {
  it('infiere IVA Pleno con solo IVA', () => {
    assert.equal(
      inferirTipoImpuesto({ iva: 19 }),
      TIPO_IMPUESTO.IVA_PLENO,
    )
    assert.equal(
      inferirTipoImpuesto({ administracion: '', imprevistos: '', utilidad: '', iva: '0.19' }, { valoresEnDecimal: true }),
      TIPO_IMPUESTO.IVA_PLENO,
    )
  })

  it('infiere IVA sobre Utilidad con A/Í/U + IVA', () => {
    assert.equal(
      inferirTipoImpuesto({ administracion: 5, imprevistos: 3, utilidad: 5, iva: 19 }),
      TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD,
    )
  })

  it('normaliza y fuerza sobre=utilidad cuando hay A/Í/U + IVA', () => {
    const t = normalizarTributos({
      aiu: { administracion: '5', imprevistos: 3, utilidad: 5 },
      iva: { porcentaje: '19', sobre: 'costo_base' },
    })
    assert.equal(t.tipo, TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD)
    assert.equal(t.aiu.administracion, 5)
    assert.equal(t.iva.porcentaje, 19)
    assert.equal(t.iva.sobre, 'utilidad')
    assert.equal(t.aiu.iva_utilidad, 19)
  })

  it('solo IVA → pleno sobre costo_base', () => {
    const t = normalizarTributos({ iva: { porcentaje: 19, sobre: 'utilidad' } })
    assert.equal(t.tipo, TIPO_IMPUESTO.IVA_PLENO)
    assert.equal(t.iva.sobre, 'costo_base')
    assert.equal(t.aiu.iva_utilidad, null)
  })

  it('convierte decimal ↔ puntos %', () => {
    assert.equal(decimalAPuntosPct('0.05'), 5)
    assert.equal(decimalAPuntosPct('0.195'), 19.5)
    assert.equal(puntosPctADecimal(5), '0.05')
    assert.equal(fmtPctDesdeDecimal('0.05'), '5%')
  })

  it('sumatoria A+I+U en % (sin IVA)', () => {
    const form = { administracion: '0.05', imprevistos: '0.03', utilidad: '0.05', iva: '0.19' }
    assert.equal(sumatoriaAiuPuntosPct(form), 13)
    assert.equal(fmtSumatoriaAiu(form), '13%')
  })

  it('parse CSV: decimal o puntos', () => {
    assert.equal(parseEntradaAPuntosPct('0.05'), 5)
    assert.equal(parseEntradaAPuntosPct('5'), 5)
    assert.equal(parseEntradaAPuntosPct('19%'), 19)
  })

  it('etiqueta incluye tipo inferido', () => {
    const e = etiquetaTributos({
      aiu: { administracion: 5, imprevistos: 3, utilidad: 5 },
      iva: { porcentaje: 19 },
    })
    assert.match(e, /IVA sobre Utilidad/)
    assert.match(e, /IVA 19%/)

    const e2 = etiquetaTributos({ iva: { porcentaje: 19 } })
    assert.match(e2, /IVA Pleno/)
  })

  it('migra legado IVA a tributos pleno', () => {
    const t = seedTributosDesdeLegado({ tipo_impuesto: 'iva', impuesto_porcentaje: 19 })
    assert.equal(t.tipo, TIPO_IMPUESTO.IVA_PLENO)
    assert.equal(t.iva.porcentaje, 19)
    assert.equal(t.iva.sobre, 'costo_base')
  })

  it('roundtrip form decimal → tributos puntos %', () => {
    const t = tributosPayloadDesdeForm({
      administracion: '0.05',
      imprevistos: '',
      utilidad: '0.04',
      iva: '0.19',
    })
    assert.equal(t.tipo, TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD)
    assert.equal(t.aiu.imprevistos, null)
    assert.equal(t.aiu.administracion, 5)
    assert.equal(t.aiu.utilidad, 4)
    assert.equal(t.iva.porcentaje, 19)
    assert.equal(t.iva.sobre, 'utilidad')
    const form = formImpuestoDesdeTributos(t)
    assert.equal(form.utilidad, '0.04')
    assert.equal(form.administracion, '0.05')
    assert.equal(form.imprevistos, '')
    assert.equal(form.iva, '0.19')
  })
})
