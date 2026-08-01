import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

// Stub fetch before importing module under test
const calls = []
let nextResponse = { ok: true, status: 200, body: [{ capitulo: '01. Cap' }] }

globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts })
  const { ok, status, body } = nextResponse
  return {
    ok,
    status,
    async json() {
      return body
    },
  }
}

const {
  fetchSicoeCapitulosCached,
  invalidateSicoeCatalogoCache,
  _sicoeCatalogoCacheClearForTests,
  _sicoeCatalogoCacheSizeForTests,
} = await import('./sicoeCatalogoCache.js')

describe('sicoeCatalogoCache', () => {
  beforeEach(() => {
    calls.length = 0
    _sicoeCatalogoCacheClearForTests()
    nextResponse = { ok: true, status: 200, body: [{ capitulo: '01. Cap' }] }
  })

  afterEach(() => {
    invalidateSicoeCatalogoCache(null)
  })

  it('cachea capítulos OK y no vuelve a pedir al servidor', async () => {
    const a = await fetchSicoeCapitulosCached('http://api', 2, 'tok')
    const b = await fetchSicoeCapitulosCached('http://api', 2, 'tok')
    assert.deepEqual(a, ['01. Cap'])
    assert.deepEqual(b, ['01. Cap'])
    assert.equal(calls.length, 1)
    assert.ok(_sicoeCatalogoCacheSizeForTests() >= 1)
  })

  it('NO cachea errores HTTP (evita envenenar el catálogo vacío)', async () => {
    nextResponse = { ok: false, status: 500, body: { detail: 'boom' } }
    await assert.rejects(
      () => fetchSicoeCapitulosCached('http://api', 2, 'tok'),
      /HTTP 500/,
    )
    assert.equal(_sicoeCatalogoCacheSizeForTests(), 0)

    nextResponse = { ok: true, status: 200, body: [{ capitulo: '02. Otro' }] }
    const ok = await fetchSicoeCapitulosCached('http://api', 2, 'tok')
    assert.deepEqual(ok, ['02. Otro'])
    assert.equal(calls.length, 2)
  })
})
