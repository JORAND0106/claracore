import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  mensajeSiRespuestaEsHtmlEnVezDePdf,
  vistaPreviaEsPdfBinario,
} from './informesVistaPreviaPdf.js'

describe('vistaPreviaEsPdfBinario', () => {
  it('rechaza FO-EO-04 HTML preview (causa del error cc-rotate-btn)', () => {
    assert.equal(
      vistaPreviaEsPdfBinario({
        fase: 'ok',
        tipo: 'idu-html',
        pdfUrl: 'blob:http://x/1',
        mimeTipo: 'text/html',
      }),
      false,
    )
  })

  it('acepta CC-MES-002 PDF consolidado', () => {
    assert.equal(
      vistaPreviaEsPdfBinario({
        fase: 'ok',
        tipo: 'memoria-mes-todos-pdf',
        pdfUrl: 'blob:http://x/2',
        mimeTipo: 'application/pdf',
        pdfBlob: { type: 'application/pdf' },
      }),
      true,
    )
  })

  it('acepta CC-SUB-001 PDF', () => {
    assert.equal(
      vistaPreviaEsPdfBinario({
        fase: 'ok',
        tipo: 'corte-pdf',
        mimeTipo: 'application/pdf',
      }),
      true,
    )
  })
})

describe('mensajeSiRespuestaEsHtmlEnVezDePdf', () => {
  it('detecta HTML con cc-rotate-btn', () => {
    const msg = mensajeSiRespuestaEsHtmlEnVezDePdf(
      '<style>.cc-rotate-btn { font-family: system-ui }</style><html>',
    )
    assert.match(msg, /HTML/)
    assert.match(msg, /FO-IDU-EO-04|PDF/)
  })

  it('null si no es HTML', () => {
    assert.equal(mensajeSiRespuestaEsHtmlEnVezDePdf('%PDF-1.4'), null)
  })
})
