import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aplanarImagenesGaleriaGraficos } from './pptoGraficosGaleria.js'

describe('aplanarImagenesGaleriaGraficos', () => {
  it('aplana imágenes de grupos y omite grupos sin imagen / urls vacías', () => {
    const out = aplanarImagenesGaleriaGraficos([
      {
        id: 'g1',
        pie_foto: 'Pie A',
        items: ['1. CAP · 1.01'],
        imagenes: [
          { id: 1, url: 'https://x/a.jpg', blob_path: 'b/a', descripcion: '' },
          { id: 2, url: '', blob_path: null },
        ],
      },
      { id: 'g2', pie_foto: 'Vacío', imagenes: [] },
      {
        id: 'g3',
        caption: '—',
        imagenes: [{ id: 3, url: 'https://x/c.jpg', descripcion: 'Detalle' }],
      },
    ])
    assert.equal(out.length, 2)
    assert.equal(out[0].url, 'https://x/a.jpg')
    assert.equal(out[0].blob_path, 'b/a')
    assert.equal(out[0].descripcion, 'Pie A')
    assert.equal(out[0].items_label, '1. CAP · 1.01')
    assert.equal(out[1].descripcion, 'Detalle')
  })
})
