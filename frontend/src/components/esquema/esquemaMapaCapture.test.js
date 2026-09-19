import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESQUEMA_MAPA_CENTER_DEFAULT,
  captureMapAreaToDataUrl,
  normalizeMapLocation,
  normalizePrintAreaRect,
  printAreaToWorldRect,
} from './esquemaMapaCapture.js'

describe('normalizeMapLocation', () => {
  it('acepta lat/lng y aliases de registro', () => {
    assert.deepEqual(normalizeMapLocation({ lat: 4.5, lng: -74.1 }), { lat: 4.5, lng: -74.1 })
    assert.deepEqual(
      normalizeMapLocation({ coord_lat: 5, coord_lng: -75 }),
      { lat: 5, lng: -75 },
    )
    assert.deepEqual(
      normalizeMapLocation({ coordLat: '4.2', coordLng: '-74.05' }),
      { lat: 4.2, lng: -74.05 },
    )
  })

  it('rechaza valores inválidos', () => {
    assert.equal(normalizeMapLocation(null), null)
    assert.equal(normalizeMapLocation({ lat: 99, lng: 0 }), null)
    assert.equal(normalizeMapLocation({ lat: 'x', lng: 1 }), null)
  })
})

describe('normalizePrintAreaRect', () => {
  it('normaliza y recorta al lienzo', () => {
    assert.deepEqual(
      normalizePrintAreaRect({ x: 100, y: 80 }, { x: 20, y: 30 }, { w: 400, h: 300 }),
      { x: 20, y: 30, w: 80, h: 50 },
    )
  })

  it('rechaza áreas demasiado pequeñas', () => {
    assert.equal(
      normalizePrintAreaRect({ x: 10, y: 10 }, { x: 12, y: 12 }, { w: 400, h: 300 }),
      null,
    )
  })
})

describe('printAreaToWorldRect', () => {
  it('convierte con pan/zoom identidad', () => {
    assert.deepEqual(
      printAreaToWorldRect({ x: 10, y: 20, w: 100, h: 50 }, { x: 0, y: 0 }, 1),
      { x: 10, y: 20, w: 100, h: 50 },
    )
  })

  it('aplica pan y zoom', () => {
    assert.deepEqual(
      printAreaToWorldRect({ x: 100, y: 100, w: 200, h: 100 }, { x: 20, y: 40 }, 2),
      { x: 40, y: 30, w: 100, h: 50 },
    )
  })
})

describe('captureMapAreaToDataUrl', () => {
  it('compone opacidad 0 como blanco y opacidad parcial', () => {
    if (typeof document === 'undefined') return
    const src = document.createElement('canvas')
    src.width = 40
    src.height = 40
    Object.defineProperty(src, 'clientWidth', { value: 40 })
    Object.defineProperty(src, 'clientHeight', { value: 40 })
    const sctx = src.getContext('2d')
    sctx.fillStyle = '#00ff00'
    sctx.fillRect(0, 0, 40, 40)

    const white = captureMapAreaToDataUrl(src, { x: 0, y: 0, w: 20, h: 20 }, 0)
    assert.ok(white?.startsWith('data:image/png'))

    const mid = captureMapAreaToDataUrl(src, { x: 0, y: 0, w: 20, h: 20 }, 0.5)
    assert.ok(mid?.startsWith('data:image/png'))
    assert.notEqual(white, mid)
  })

  it('exporta centro por defecto válido', () => {
    assert.ok(Number.isFinite(ESQUEMA_MAPA_CENTER_DEFAULT.lat))
    assert.ok(Number.isFinite(ESQUEMA_MAPA_CENTER_DEFAULT.lng))
  })
})
