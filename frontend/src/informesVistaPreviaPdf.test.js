import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  mensajeSiRespuestaEsHtmlEnVezDePdf,
  planDescargaPdfDesdeVistaPrevia,
  planDescargaSelloDesdeVistaPrevia,
  vistaPreviaEsHtmlIdu,
  vistaPreviaEsPdfBinario,
} from './informesVistaPreviaPdf.js'

const htmlPreview = {
  fase: 'ok',
  tipo: 'idu-html',
  pdfUrl: 'blob:http://x/1',
  mimeTipo: 'text/html',
}

const mesTodosPdf = {
  fase: 'ok',
  tipo: 'memoria-mes-todos-pdf',
  pdfUrl: 'blob:http://x/2',
  mimeTipo: 'application/pdf',
  pdfBlob: { type: 'application/pdf' },
  rutaSello: '/informes/1/ccd/cc-mes-002/completo/con-sello-firma',
  nombreArchivoSello: 'CC-MES-002-sello.pdf',
}

describe('vistaPreviaEsHtmlIdu / vistaPreviaEsPdfBinario', () => {
  it('detecta FO-EO-04 HTML (origen del error cc-rotate-btn)', () => {
    assert.equal(vistaPreviaEsHtmlIdu(htmlPreview), true)
    assert.equal(vistaPreviaEsPdfBinario(htmlPreview), false)
  })

  it('acepta CC-MES-002 PDF consolidado', () => {
    assert.equal(vistaPreviaEsHtmlIdu(mesTodosPdf), false)
    assert.equal(vistaPreviaEsPdfBinario(mesTodosPdf), true)
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

describe('planDescargaPdfDesdeVistaPrevia', () => {
  it('PDF en memoria → blob-local (no regenera)', () => {
    assert.deepEqual(planDescargaPdfDesdeVistaPrevia(mesTodosPdf), { action: 'blob-local' })
  })

  it('HTML FO-EO-04 con job listo → endpoint PDF del job (nunca el blob HTML)', () => {
    const plan = planDescargaPdfDesdeVistaPrevia(htmlPreview, {
      foEo04LastJobId: 'job-abc',
      contratoId: 42,
    })
    assert.equal(plan.action, 'fo-eo-04-job-pdf')
    assert.equal(plan.path, '/informes/42/ccd/pdf-job/job-abc/pdf')
    assert.match(plan.nombre, /\.pdf$/i)
  })

  it('HTML FO-EO-04 sin job → generar PDF real', () => {
    assert.deepEqual(planDescargaPdfDesdeVistaPrevia(htmlPreview, {}), {
      action: 'fo-eo-04-generar',
      conSello: false,
    })
  })
})

describe('planDescargaSelloDesdeVistaPrevia', () => {
  it('PDF con rutaSello → ruta-sello', () => {
    const plan = planDescargaSelloDesdeVistaPrevia(mesTodosPdf)
    assert.equal(plan.action, 'ruta-sello')
    assert.equal(plan.path, mesTodosPdf.rutaSello)
  })

  it('HTML FO-EO-04 con job → con-sello-firma del job', () => {
    const plan = planDescargaSelloDesdeVistaPrevia(htmlPreview, {
      foEo04LastJobId: 'job-abc',
      contratoId: 42,
    })
    assert.equal(plan.action, 'fo-eo-04-job-sello')
    assert.equal(plan.path, '/informes/42/ccd/pdf-job/job-abc/con-sello-firma')
  })

  it('HTML FO-EO-04 sin job → generar con sello', () => {
    assert.deepEqual(planDescargaSelloDesdeVistaPrevia(htmlPreview, {}), {
      action: 'fo-eo-04-generar',
      conSello: true,
    })
  })
})

describe('mensajeSiRespuestaEsHtmlEnVezDePdf', () => {
  it('detecta HTML con cc-rotate-btn', () => {
    const msg = mensajeSiRespuestaEsHtmlEnVezDePdf(
      '<style>.cc-rotate-btn { font-family: system-ui }</style><html>',
    )
    assert.match(msg, /HTML/)
    assert.match(msg, /pdf-job|application\/pdf|FO-IDU-EO-04/i)
  })

  it('null si no es HTML', () => {
    assert.equal(mensajeSiRespuestaEsHtmlEnVezDePdf('%PDF-1.4'), null)
  })
})
