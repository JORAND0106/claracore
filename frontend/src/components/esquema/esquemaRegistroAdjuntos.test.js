import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterEsquemaRegistroAdjuntos,
  isEsquemaRegistroAdjunto,
  isMisplacedEsquemaExportInRegistro,
  repairEsquemaRegistroList,
  isEsquemaPngPayload,
} from './esquemaRegistroAdjuntos.js'

describe('esquemaRegistroAdjuntos · PNG siempre en registro', () => {
  it('bloquea PDF/DXF/escena del registro', () => {
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'esquema-dxf', dataUri: 'data:application/dxf;base64,xx', mime: 'application/dxf',
    }), false)
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'esquema-pdf', dataUri: 'data:application/pdf;base64,xx', mime: 'application/pdf',
    }), false)
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'esquema-scene', dataUri: 'data:application/json;base64,e30=', mime: 'application/json',
    }), false)
  })

  it('permite PNG de esquema, memoria y despiece', () => {
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'esquema', dataUri: 'data:image/png;base64,xx', mime: 'image/png',
    }), true)
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'memoria-calculo', dataUri: 'data:image/png;base64,xx', mime: 'image/png',
    }), true)
    assert.equal(isEsquemaRegistroAdjunto({
      kind: 'despiece-acero', dataUri: 'data:image/png;base64,xx', mime: 'image/png',
    }), true)
  })

  it('filterEsquemaRegistroAdjuntos quita exports', () => {
    const out = filterEsquemaRegistroAdjuntos([
      { kind: 'memoria-calculo', dataUri: 'data:image/png;base64,a', mime: 'image/png' },
      { kind: 'esquema-dxf', dataUri: 'data:application/dxf;base64,b', mime: 'application/dxf' },
      { kind: 'esquema-pdf', dataUri: 'data:application/pdf;base64,c', mime: 'application/pdf' },
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'memoria-calculo')
  })

  it('repairEsquemaRegistroList corrige DXF mal guardados', () => {
    const repaired = repairEsquemaRegistroList([
      { origen: 'esquema', kind: 'esquema', url: 'https://x/a.dxf', mime: 'application/dxf', nombre: 'esquema.dxf' },
      { origen: 'esquema', kind: 'esquema', url: 'https://x/a.png', mime: 'image/png', nombre: 'esquema.png' },
      { kind: 'esquema-dxf', url: 'https://x/b.dxf', mime: 'application/dxf' },
    ])
    assert.equal(repaired.length, 1)
    assert.match(repaired[0].url, /\.png/)
    assert.equal(isMisplacedEsquemaExportInRegistro({
      kind: 'esquema', nombre: 'x.dxf', mime: 'application/dxf',
    }), true)
  })

  it('isEsquemaPngPayload', () => {
    assert.equal(isEsquemaPngPayload('data:image/png;base64,xx'), true)
    assert.equal(isEsquemaPngPayload('data:application/dxf;base64,xx'), false)
    assert.equal(isEsquemaPngPayload('https://x/a.png'), true)
  })
})
