import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  etiquetaOrigenGrafico,
  agregarEntradaGraficoHistorial,
  graficosPayloadDesdeHistorial,
  dataUriEsquemaAFile,
} from './sicoeGraficosHelpers.js'

describe('sicoeGraficosHelpers · esquema', () => {
  it('etiqueta origen esquema', () => {
    assert.equal(etiquetaOrigenGrafico('esquema'), 'Esquema a mano')
  })

  it('historial asocia entrada con origen esquema al registro', () => {
    const hist = agregarEntradaGraficoHistorial([], {
      url: 'https://example.com/g1.png',
      numero: 12,
      creado_en: '2026-08-01T00:00:00Z',
      origen: 'esquema',
    })
    assert.equal(hist.length, 1)
    assert.equal(hist[0].origen, 'esquema')
    const payload = graficosPayloadDesdeHistorial(hist)
    assert.equal(payload.grafico_url, 'https://example.com/g1.png')
    assert.equal(payload.grafico_numero, 12)
    assert.equal(payload.graficos_historial.length, 1)
  })

  it('dataUriEsquemaAFile produce PNG File', async () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const file = await dataUriEsquemaAFile(dataUrl, 'esquema_reg1')
    assert.ok(file instanceof File)
    assert.match(file.type, /image\/png/)
    assert.match(file.name, /^esquema_reg1_\d+\.png$/)
    assert.ok(file.size > 0)
  })
})
