import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { htmlToPlainText } from './richTextUtils.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('tema formato tabla / prose', () => {
  it('htmlToPlainText no pega frases entre párrafos y lista', () => {
    const html = (
      '<p>Se revisó el avance del equipo.</p>'
      + '<ol><li><p>El recurso denominado X.</p></li>'
      + '<li><p>Cada módulo aporta cantidades.</p></li></ol>'
    )
    const plano = htmlToPlainText(html)
    assert.doesNotMatch(plano, /equipo\.El/)
    assert.doesNotMatch(plano, /X\.Cada/)
    assert.match(plano, /equipo\.\s/)
    assert.match(plano, /El recurso/)
  })

  it('ActaTemasTable renderiza HTML tipográfico, no solo plano', () => {
    const src = readFileSync(join(here, 'ActaTemasTable.jsx'), 'utf8')
    assert.match(src, /TemaProseHtml/)
    assert.match(src, /clamp=\{!expandido/)
    assert.doesNotMatch(
      src,
      /expandido \? plano : truncate\(plano/,
    )
  })

  it('PDF sigue usando render rico de temas', () => {
    const pdf = readFileSync(
      join(here, '../../../../backend/seguimiento_pdf.py'),
      'utf8',
    )
    assert.match(pdf, /_render_tema_texto_pdf/)
    assert.match(pdf, /render_tema_html_for_pdf/)
  })
})
