import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evidenciaEsImagen,
  evidenciaEsMediaCarrusel,
  isEsquemaCalcAdjunto,
  isEsquemaAdjunto,
  isPdfAdjunto,
  slidesFromChecklistItem,
  slidesFromImagenes,
  slidesFromRegistro,
} from './adjuntosMedia.js'

describe('adjuntosMedia · slider unificado', () => {
  it('mezcla foto y esquemas en un solo arreglo de slides', () => {
    const slides = slidesFromRegistro('https://x/foto.jpg', [
      { url: 'https://x/g1.png', numero: 4, origen: 'manual' },
      { url: 'https://x/esq.png', numero: 5, origen: 'esquema' },
    ])
    assert.equal(slides.length, 3)
    assert.equal(slides[0].kind, 'foto')
    assert.equal(slides[1].kind, 'grafico')
    assert.equal(slides[1].label, 'Gráfico #4')
    assert.equal(slides[2].kind, 'esquema')
    assert.equal(slides[2].label, 'Esquema #5')
  })

  it('checklist une imagen y esquema como slides del mismo carrusel', () => {
    const slides = slidesFromChecklistItem({
      imagen: { url: 'https://x/a.jpg' },
      esquema: { data_uri: 'data:image/png;base64,xx', kind: 'esquema' },
    })
    assert.equal(slides.length, 2)
    assert.equal(slides[0].kind, 'foto')
    assert.equal(slides[1].kind, 'esquema')
  })

  it('imagenes de presupuesto/bitácora distinguen origen esquema', () => {
    const slides = slidesFromImagenes([
      { previewUrl: 'https://x/a.jpg', origen: 'upload' },
      { previewUrl: 'https://x/b.png', origen: 'esquema' },
    ])
    assert.equal(slides.map((s) => s.kind).join(','), 'foto,esquema')
    assert.equal(isEsquemaAdjunto({ origen: 'esquema' }), true)
  })

  it('detecta evidencias de imagen vs archivo', () => {
    assert.equal(evidenciaEsImagen({ mime_type: 'image/png', nombre_archivo: 'a.png' }), true)
    assert.equal(evidenciaEsImagen({ mime_type: 'application/pdf', nombre_archivo: 'a.pdf' }), false)
  })

  it('incluye memoria PDF y gráfico isométrico en el carrusel', () => {
    assert.equal(isEsquemaCalcAdjunto({ origen: 'esquema-calculo', kind: 'memoria-calculo' }), true)
    assert.equal(isPdfAdjunto({ kind: 'memoria-calculo', nombre: 'memoria.pdf' }), true)
    assert.equal(evidenciaEsMediaCarrusel({
      mime_type: 'application/pdf',
      origen: 'esquema-calculo',
      kind: 'memoria-calculo',
      nombre_archivo: 'memoria.pdf',
    }), true)

    const slides = slidesFromImagenes([
      {
        previewUrl: 'blob:pdf',
        origen: 'esquema-calculo',
        kind: 'memoria-calculo',
        mime: 'application/pdf',
        nombre: 'memoria_calculo_Pozo.pdf',
      },
      {
        previewUrl: 'blob:png',
        origen: 'esquema-calculo',
        kind: 'grafico-isometrico',
        mime: 'image/png',
      },
    ])
    assert.equal(slides.length, 2)
    assert.equal(slides[0].kind, 'memoria-calculo')
    assert.match(slides[0].label, /Memoria|memoria/i)
    assert.equal(slides[1].kind, 'grafico-isometrico')

    const checklist = slidesFromChecklistItem({
      imagen: { url: 'https://x/a.jpg' },
      esquema_calc_adjuntos: [
        { data_uri: 'data:application/pdf;base64,xx', kind: 'memoria-calculo', origen: 'esquema-calculo', nombre: 'm.pdf' },
      ],
    })
    assert.equal(checklist.some((s) => s.kind === 'memoria-calculo'), true)

    // Registro SicoeObra / hoja: origen esquema-calculo debe conservar kind PDF/PNG
    const reg = slidesFromRegistro(null, [
      {
        url: 'https://x/memoria_calculo_Pozo_25S.pdf',
        origen: 'esquema-calculo',
        kind: 'memoria-calculo',
        mime: 'application/pdf',
        nombre: 'memoria_calculo_Pozo_25S.pdf',
        numero: 7,
      },
      {
        url: 'https://x/grafico_isometrico_Pozo_25S.png',
        origen: 'esquema-calculo',
        kind: 'grafico-isometrico',
        mime: 'image/png',
        numero: 8,
      },
    ])
    assert.equal(reg.length, 2)
    assert.equal(reg[0].kind, 'memoria-calculo')
    assert.equal(reg[1].kind, 'grafico-isometrico')
    assert.match(reg[0].label, /Memoria|memoria/i)
  })
})
