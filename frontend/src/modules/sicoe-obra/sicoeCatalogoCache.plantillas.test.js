import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  _sicoeCatalogoCacheClearForTests,
  fetchSicoePlantillasCached,
  invalidateSicoePlantillasCache,
} from './sicoeCatalogoCache.js'

afterEach(() => {
  _sicoeCatalogoCacheClearForTests()
})

describe('sicoeCatalogoCache plantillas personales', () => {
  it('aísla caché por usuarioId', async () => {
    const calls = []
    const orig = globalThis.fetch
    globalThis.fetch = async (url) => {
      calls.push(String(url))
      return {
        ok: true,
        async json() {
          return [{ id: calls.length, nombre: `u${calls.length}` }]
        },
      }
    }
    try {
      const a = await fetchSicoePlantillasCached('http://x', 1, 'Cap', 't', 10)
      const b = await fetchSicoePlantillasCached('http://x', 1, 'Cap', 't', 20)
      const a2 = await fetchSicoePlantillasCached('http://x', 1, 'Cap', 't', 10)
      assert.equal(a[0].id, 1)
      assert.equal(b[0].id, 2)
      assert.equal(a2[0].id, 1)
      assert.equal(calls.length, 2)
      invalidateSicoePlantillasCache(1, 10)
      const a3 = await fetchSicoePlantillasCached('http://x', 1, 'Cap', 't', 10)
      assert.equal(a3[0].id, 3)
      assert.equal(calls.length, 3)
    } finally {
      globalThis.fetch = orig
    }
  })
})
