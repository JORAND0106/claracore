import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { composeEsquemaPdf } from './esquemaExportPdf.js'

/** PNG 1×1 transparente */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('esquemaExportPdf', () => {
  it('genera PDF multipágina con esquema + memoria', async () => {
    const out = await composeEsquemaPdf({
      title: 'Excavación',
      esquemaPng: TINY_PNG,
      adjuntos: [
        { dataUri: TINY_PNG, kind: 'memoria-calculo', nombre: 'Memoria.png' },
        { dataUri: TINY_PNG, kind: 'despiece-acero', nombre: 'Despiece.png' },
        { dataUri: 'data:application/pdf;base64,AAA', kind: 'esquema-pdf', nombre: 'skip.pdf' },
      ],
    })
    assert.ok(out)
    assert.equal(out.mime, 'application/pdf')
    assert.equal(out.kind, 'esquema-pdf')
    assert.match(out.dataUri, /^data:application\/pdf/)
    assert.match(out.nombre, /\.pdf$/i)
  })
})
