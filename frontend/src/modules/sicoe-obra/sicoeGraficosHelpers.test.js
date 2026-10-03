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

  it('galería reutiliza url y numero sin duplicar archivo', () => {
    const hist = agregarEntradaGraficoHistorial(
      [{ url: 'https://example.com/a.png', numero: 1, origen: 'manual' }],
      { url: 'https://example.com/g2.png', numero: 44, origen: 'galeria' },
    )
    assert.equal(etiquetaOrigenGrafico('galeria'), 'Galería')
    assert.equal(hist.length, 2)
    assert.equal(hist[1].numero, 44)
    assert.equal(hist[1].origen, 'galeria')
    // misma URL no se duplica
    const hist2 = agregarEntradaGraficoHistorial(hist, {
      url: 'https://example.com/g2.png',
      numero: 44,
      origen: 'galeria',
    })
    assert.equal(hist2.length, 2)
    assert.equal(hist2[1].numero, 44)
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
