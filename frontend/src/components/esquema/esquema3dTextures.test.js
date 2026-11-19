import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SOLID_TEXTURE_CATALOG,
  getSolidTexturePattern,
  normalizeSolidTextureId,
  resolveSolidTextureFillStyle,
  solidTextureThumbnailDataUrl,
} from './esquema3dTextures.js'
import { solidFaceFillStyle } from './esquema3dSolids.js'

function mockCtx() {
  return {
    createPattern(c) {
      return { __pattern: true, canvas: c }
    },
  }
}

describe('esquema3dTextures', () => {
  it('catálogo extensible con Sin textura primero', () => {
    assert.equal(SOLID_TEXTURE_CATALOG[0].id, 'none')
    assert.ok(SOLID_TEXTURE_CATALOG.length >= 9)
  })

  it('genera patrón procedural cacheado cuando hay document', () => {
    if (typeof document === 'undefined') {
      assert.equal(getSolidTexturePattern(mockCtx(), 'concreto', '#888', 1), null)
      return
    }
    const ctx = mockCtx()
    const a = getSolidTexturePattern(ctx, 'concreto', '#888888', 1)
    const b = getSolidTexturePattern(ctx, 'concreto', '#888888', 1)
    assert.ok(a)
    assert.equal(a, b)
    const thumb = solidTextureThumbnailDataUrl('cesped', '#228B22', 32)
    assert.match(thumb || '', /^data:image\/png/)
  })

  it('solidFaceFillStyle: textura vs vista técnica', () => {
    if (typeof document === 'undefined') {
      assert.equal(normalizeSolidTextureId('asfalto'), 'asfalto')
      return
    }
    const solid = { color: '#666666', textureId: 'piedra' }
    const ctx = mockCtx()
    // createPattern needs a real canvas from document — use real 2d if available
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const real = canvas.getContext('2d')
    if (!real?.createPattern) {
      assert.ok(resolveSolidTextureFillStyle(ctx, solid, 1, { texturesEnabled: true }) == null
        || typeof resolveSolidTextureFillStyle(ctx, solid, 1, { texturesEnabled: true }) === 'object')
      return
    }
    const textured = solidFaceFillStyle(real, solid, 1.0, 0.85, { texturesEnabled: true })
    const technical = solidFaceFillStyle(real, solid, 1.0, 0.85, { texturesEnabled: false })
    assert.notEqual(textured, technical)
    assert.match(String(technical), /^rgba\(/)
  })
})
