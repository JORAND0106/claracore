import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseFotosHistorial,
  listaFotosRegistro,
  agregarEntradaFotoHistorial,
  reemplazarEntradaFotoHistorial,
  fotosPayloadDesdeHistorial,
  esFotoPreviewLocal,
} from './sicoeFotosHelpers.js'

describe('sicoeFotosHelpers', () => {
  it('parsea historial y cae a foto_url legacy', () => {
    assert.equal(parseFotosHistorial({ fotos_historial: [{ url: 'a' }] }).length, 1)
    assert.equal(listaFotosRegistro({ foto_url: 'https://x/f.jpg', foto_numero: 3 }).length, 1)
    assert.equal(listaFotosRegistro({ foto_url: 'https://x/f.jpg', foto_numero: 3 })[0].numero, 3)
  })

  it('agregar no borra existentes ni duplica URL', () => {
    const hist = agregarEntradaFotoHistorial(
      [{ url: 'https://a', numero: 1 }],
      { url: 'https://b', numero: 2 },
    )
    assert.equal(hist.length, 2)
    const hist2 = agregarEntradaFotoHistorial(hist, { url: 'https://a', numero: 1 })
    assert.equal(hist2.length, 2)
    assert.equal(hist2[hist2.length - 1].url, 'https://a')
  })

  it('reemplazar solo cambia la posición indicada', () => {
    const base = [
      { url: 'https://a', numero: 1 },
      { url: 'https://b', numero: 2 },
    ]
    const next = reemplazarEntradaFotoHistorial(base, 0, { url: 'https://c', numero: 3 })
    assert.equal(next.length, 2)
    assert.equal(next[0].url, 'https://c')
    assert.equal(next[1].url, 'https://b')
  })

  it('payload usa la foto más reciente como activa', () => {
    const p = fotosPayloadDesdeHistorial([
      { url: 'https://a', numero: 1 },
      { url: 'https://b', numero: 2 },
    ])
    assert.equal(p.foto_url, 'https://b')
    assert.equal(p.foto_numero, 2)
    assert.equal(p.fotos_historial.length, 2)
  })

  it('detecta preview local blob/data', () => {
    assert.equal(esFotoPreviewLocal('blob:http://x/1'), true)
    assert.equal(esFotoPreviewLocal('data:image/jpeg;base64,xx'), true)
    assert.equal(esFotoPreviewLocal('https://cdn/f.jpg'), false)
  })
})
