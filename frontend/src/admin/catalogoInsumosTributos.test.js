import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decimalAPuntosPct,
  etiquetaTributos,
  formImpuestoDesdeTributos,
  fmtPctDesdeDecimal,
  fmtSumatoriaAiu,
  formatPuntosPctExacto,
  inferirTipoImpuesto,
  normalizarTributos,
  parseEntradaAPuntosPct,
  puntosPctADecimal,
  seedTributosDesdeLegado,
  sumatoriaAiuPuntosPct,
  tipoTributoCortoDesdeRow,
  TIPO_IMPUESTO,
  tributosPayloadDesdeForm,
  computeValorDespuesAiuIva,
  valorTributarioLabelDesdeRow,
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

  it('total % efectivo incluye IVA sobre U', () => {
    // A5 + I2 + (U5 + U5×19%) = 5+2+5.95 = 12.95
    const form = { administracion: '0.05', imprevistos: '0.02', utilidad: '0.05', iva: '0.19' }
    assert.equal(inferirTipoImpuesto(form, { valoresEnDecimal: true }), TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD)
    assert.equal(sumatoriaAiuPuntosPct(form), 12.95)
    assert.equal(fmtSumatoriaAiu(form), '12.95%')

    // Sin IVA: solo A+Í+U
    const sinIva = { administracion: '0.051', imprevistos: '0.0325', utilidad: '0.04075', iva: '' }
    assert.equal(sumatoriaAiuPuntosPct(sinIva), 12.425)
    assert.equal(fmtSumatoriaAiu(sinIva), '12.425%')

    // IVA pleno: solo IVA
    const pleno = { administracion: '', imprevistos: '', utilidad: '', iva: '0.19' }
    assert.equal(sumatoriaAiuPuntosPct(pleno), 19)
    assert.equal(fmtSumatoriaAiu(pleno), '19%')
  })

  it('porcentajes UI exactos vs montos COP enteros (reglas separadas)', () => {
    assert.equal(fmtPctDesdeDecimal('0.04075'), '4.075%')
    assert.equal(fmtPctDesdeDecimal('0.051234'), '5.1234%')
    // Con IVA sobre U: 5.1234 + 3.25 + (4.075 + 4.075×0.19) = 13.22265
    const form = { administracion: '0.051234', imprevistos: '0.0325', utilidad: '0.04075', iva: '0.19' }
    assert.equal(sumatoriaAiuPuntosPct(form), 13.22265)
    assert.equal(fmtSumatoriaAiu(form), '13.22265%')
    assert.equal(decimalAPuntosPct('0.04075'), 4.075)
    assert.equal(decimalAPuntosPct('0.051234'), 5.1234)
    assert.equal(
      computeValorDespuesAiuIva(
        18500,
        { administracion: '0.05', imprevistos: '0.03', utilidad: '0.05', iva: '0.19' },
        { valoresEnDecimal: true },
      ),
      21081,
    )
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

  it('calcula valor después: IVA pleno', () => {
    assert.equal(
      computeValorDespuesAiuIva(10000, { iva: { porcentaje: 19 } }),
      11900,
    )
    assert.equal(
      computeValorDespuesAiuIva(10000, { administracion: '', imprevistos: '', utilidad: '', iva: '0.19' }, { valoresEnDecimal: true }),
      11900,
    )
  })

  it('calcula valor después: IVA sobre utilidad', () => {
    assert.equal(
      computeValorDespuesAiuIva(10000, {
        administracion: 5, imprevistos: 3, utilidad: 5, iva: { porcentaje: 19 },
      }),
      11395,
    )
    // 18500×1.13 + 18500×0.05×0.19 = 21080.75 → redondeo COP a 21081
    assert.equal(
      computeValorDespuesAiuIva(
        18500,
        { administracion: '0.05', imprevistos: '0.03', utilidad: '0.05', iva: '0.19' },
        { valoresEnDecimal: true },
      ),
      21081,
    )
  })

  it('redondea a 0 decimales (pesos COP)', () => {
    assert.equal(
      computeValorDespuesAiuIva(10001, { iva: { porcentaje: 19 } }),
      11901,
    )
    // 10001 * 1.19 = 11901.19 → 11901
    assert.equal(
      computeValorDespuesAiuIva(3333, {
        administracion: 5, imprevistos: 3, utilidad: 5, iva: { porcentaje: 19 },
      }),
      Math.round(3333 * 1.13 + 3333 * 0.05 * 0.19),
    )
  })

  it('calcula valor después: solo AIU', () => {
    assert.equal(
      computeValorDespuesAiuIva(10000, {
        aiu: { administracion: 5, imprevistos: 3, utilidad: 5 },
      }),
      11300,
    )
  })

  it('tipoTributoCorto y valorTributarioLabel para grilla', () => {
    assert.equal(
      tipoTributoCortoDesdeRow({ tributos: { iva: { porcentaje: 19 } } }),
      'IVA',
    )
    assert.equal(
      tipoTributoCortoDesdeRow({
        tributos: { administracion: 5, imprevistos: 3, utilidad: 5 },
      }),
      'AIU',
    )
    assert.match(
      valorTributarioLabelDesdeRow({ tributos: { iva: { porcentaje: 19 } } }),
      /19/,
    )
  })
})
