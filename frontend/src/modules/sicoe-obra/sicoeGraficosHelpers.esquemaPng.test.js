import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  graficosPayloadDesdeHistorial,
  pickPrimaryGraficoFromHistorial,
  dataUriEsquemaAFile,
  urlADataUriParaEsquema,
} from './sicoeGraficosHelpers.js'
import { isEsquemaPngDataUrl } from '../../components/esquema/esquemaExport.js'

describe('esquema guardado PNG · gráfico principal', () => {
  it('pickPrimary prioriza origen esquema sobre PDF de memoria', () => {
    const hist = [
      { url: 'https://cdn/esquema.png', origen: 'esquema', numero: 1 },
      { url: 'https://cdn/iso.png', origen: 'esquema-calculo', kind: 'grafico-isometrico', mime: 'image/png', numero: 2 },
      { url: 'https://cdn/memoria.pdf', origen: 'esquema-calculo', kind: 'memoria-calculo', mime: 'application/pdf', numero: 3 },
    ]
    const p = pickPrimaryGraficoFromHistorial(hist)
    assert.equal(p.url, 'https://cdn/esquema.png')
    const payload = graficosPayloadDesdeHistorial(hist)
    assert.equal(payload.grafico_url, 'https://cdn/esquema.png')
    assert.equal(payload.graficos_historial.length, 3)
  })

  it('si no hay esquema, usa última imagen (no PDF)', () => {
    const hist = [
      { url: 'https://cdn/foto.jpg', origen: 'manual', numero: 1 },
      { url: 'https://cdn/m.pdf', origen: 'esquema-calculo', kind: 'memoria-calculo', mime: 'application/pdf', numero: 2 },
    ]
    assert.equal(pickPrimaryGraficoFromHistorial(hist).url, 'https://cdn/foto.jpg')
  })

  it('isEsquemaPngDataUrl solo acepta PNG', () => {
    assert.equal(isEsquemaPngDataUrl('data:image/png;base64,aa'), true)
    assert.equal(isEsquemaPngDataUrl('data:application/pdf;base64,aa'), false)
  })

  it('urlADataUriParaEsquema rechaza PDF', async () => {
    assert.equal(await urlADataUriParaEsquema('data:application/pdf;base64,aaa'), null)
    assert.equal(await urlADataUriParaEsquema('https://x/memoria.pdf'), null)
  })

  it('dataUriEsquemaAFile rechaza PDF y fuerza image/png', async () => {
    assert.equal(await dataUriEsquemaAFile('data:application/pdf;base64,aaa'), null)
    // PNG 1x1
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const f = await dataUriEsquemaAFile(png, 'esquema-test')
    assert.ok(f)
    assert.equal(f.type, 'image/png')
    assert.match(f.name, /\.png$/)
  })
})
