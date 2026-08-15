import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  etiquetaTributos,
  formAiuDesdeTributos,
  normalizarTributos,
  seedTributosDesdeLegado,
  tributosDesdeForm,
} from './catalogoInsumosTributos.js'

describe('catalogoInsumosTributos', () => {
  it('normaliza AIU e IVA independientes', () => {
    const t = normalizarTributos({
      aiu: { administracion: '5', imprevistos: 3, utilidad: 5, iva_utilidad: 19 },
      iva: { porcentaje: '19', sobre: 'utilidad' },
    })
    assert.equal(t.aiu.administracion, 5)
    assert.equal(t.iva.sobre, 'utilidad')
    assert.equal(t.iva.porcentaje, 19)
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

  it('roundtrip form → tributos', () => {
    const t = tributosDesdeForm(
      { administracion: '5', imprevistos: '', utilidad: '4', iva_utilidad: '19' },
      { porcentaje: '19', sobre: 'aiu' },
    )
    assert.equal(t.aiu.imprevistos, null)
    assert.equal(t.aiu.utilidad, 4)
    const form = formAiuDesdeTributos(t)
    assert.equal(form.utilidad, '4')
    assert.equal(form.imprevistos, '')
  })
})
