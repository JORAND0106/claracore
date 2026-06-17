import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVistaCacheKey,
  clearVistaCache,
  getVistaCache,
  hashVistaPayload,
  invalidateVistaCache,
  invalidateVistaModulo,
  setVistaCache,
  _vistaCacheMemorySize,
  VISTA_CACHE_TTL,
} from './vistaCache.js'
import {
  sicoeBundleCacheHash,
  sicoeVistaCacheKey,
  sicoePushNavegacion,
  sicoePopNavegacion,
  sicoeClearNavegacion,
  sicoeSetVistaCache,
  sicoeGetVistaCache,
} from './sicoeVistaCache.js'

describe('vistaCache', () => {
  it('buildVistaCacheKey omite segmentos vacíos', () => {
    assert.equal(buildVistaCacheKey('sicoe', 12, '', 'busqueda'), 'sicoe|12|busqueda')
  })

  it('get/set respeta TTL del módulo', () => {
    clearVistaCache()
    const key = buildVistaCacheKey('sicoe', 1, 'x')
    setVistaCache(key, { ok: true }, { modulo: 'sicoe', ttl: 50 })
    assert.ok(getVistaCache(key, { modulo: 'sicoe' }))
    const origNow = Date.now
    Date.now = () => origNow() + 60
    try {
      assert.equal(getVistaCache(key, { modulo: 'sicoe' }), null)
    } finally {
      Date.now = origNow
    }
  })

  it('invalidateVistaModulo borra por prefijo', () => {
    clearVistaCache()
    setVistaCache(buildVistaCacheKey('sicoe', 9, 'a'), { a: 1 }, { modulo: 'sicoe' })
    setVistaCache(buildVistaCacheKey('dashboard', 9, 'b'), { b: 1 }, { modulo: 'dashboard' })
    invalidateVistaModulo('sicoe', 9)
    assert.equal(getVistaCache(buildVistaCacheKey('sicoe', 9, 'a'), { modulo: 'sicoe' }), null)
    assert.ok(getVistaCache(buildVistaCacheKey('dashboard', 9, 'b'), { modulo: 'dashboard' }))
  })

  it('hashVistaPayload es estable ante reorden de claves', () => {
    assert.equal(
      hashVistaPayload({ b: 1, a: 2 }),
      hashVistaPayload({ a: 2, b: 1 }),
    )
  })
})

describe('sicoeVistaCache', () => {
  const bundleA = {
    fSicoe: { capitulo: '01', item: '' },
    itemsChips: [],
    itemsOp: 'and',
    capasValidacion: [],
    capasValidacionOp: 'and',
    panelCapitulos: [],
    panelActasRpo: [],
  }
  const bundleB = {
    ...bundleA,
    fSicoe: { ...bundleA.fSicoe, item: '1.01' },
  }

  it('clave distinta por bundle distinto', () => {
    const k1 = sicoeVistaCacheKey(42, bundleA)
    const k2 = sicoeVistaCacheKey(42, bundleB)
    assert.notEqual(k1, k2)
    assert.ok(k1.startsWith('sicoe|42|busqueda|'))
  })

  it('stack pop devuelve vista anterior', () => {
    sicoeClearNavegacion(42)
    sicoeSetVistaCache(42, {
      bundle: bundleA,
      reportes: [{ id: 1 }],
      analisis: { modo: 'general', grupos: [] },
      hayMas: false,
      offsetActual: 50,
    })
    sicoeSetVistaCache(42, {
      bundle: bundleB,
      reportes: [{ id: 2 }],
      analisis: { modo: 'item_detalle', grupos: [] },
      hayMas: true,
      offsetActual: 50,
    })
    const prev = sicoePopNavegacion(42)
    assert.equal(prev.reportes[0].id, 1)
    assert.equal(sicoeGetVistaCache(42, bundleA)?.reportes[0].id, 1)
  })

  it('sicoeBundleCacheHash ignora orden de claves internas', () => {
    assert.equal(
      sicoeBundleCacheHash({ fSicoe: { item: '', capitulo: '01' }, itemsChips: [] }),
      sicoeBundleCacheHash({ itemsChips: [], fSicoe: { capitulo: '01', item: '' } }),
    )
  })
})

describe('VISTA_CACHE_TTL', () => {
  it('TTLs de navegación mayores que colaboración presupuesto', () => {
    assert.ok(VISTA_CACHE_TTL.presupuesto_nav > VISTA_CACHE_TTL.presupuesto_live)
    assert.ok(VISTA_CACHE_TTL.sicoe >= 5 * 60 * 1000)
  })
})
