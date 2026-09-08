import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  evidenciaEsImagen,
  isEsquemaAdjunto,
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
})
