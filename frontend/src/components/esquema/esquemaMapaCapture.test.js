import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESQUEMA_MAPA_CENTER_DEFAULT,
  captureMapAreaToDataUrl,
  entityFractionOfMapWidth,
  geoSpanMetersFromLngLatCorners,
  haversineMeters,
  mapCssRectToLngLatCorners,
  normalizeMapLocation,
  normalizePrintAreaRect,
  printAreaToScaledWorldRect,
  printAreaToWorldRect,
} from './esquemaMapaCapture.js'
import { PX_PER_METER, metersToWorld, worldToMeters } from './esquemaGeometry.js'

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

describe('escala real del mapa insertado', () => {
  it('haversine ~111.2 km por grado en ecuador', () => {
    const d = haversineMeters({ lng: 0, lat: 0 }, { lng: 1, lat: 0 })
    assert.ok(Math.abs(d - 111319) < 200)
  })

  it('geoSpanMetersFromLngLatCorners calcula ancho/alto', () => {
    // ~100 m este-oeste y ~50 m norte-sur cerca del ecuador
    const degE = 100 / 111319
    const degN = 50 / 110574
    const span = geoSpanMetersFromLngLatCorners({
      nw: { lng: 0, lat: degN },
      ne: { lng: degE, lat: degN },
      sw: { lng: 0, lat: 0 },
      se: { lng: degE, lat: 0 },
    })
    assert.ok(span)
    assert.ok(Math.abs(span.widthM - 100) < 2)
    assert.ok(Math.abs(span.heightM - 50) < 2)
  })

  it('printAreaToScaledWorldRect usa PX_PER_METER (no el tamaño en pantalla)', () => {
    const area = { x: 50, y: 40, w: 400, h: 200 } // píxeles pantalla
    const span = { widthM: 80, heightM: 40 } // metros reales
    const placement = printAreaToScaledWorldRect(area, { x: 0, y: 0 }, 1, span)
    assert.ok(placement)
    assert.equal(placement.w, metersToWorld(80))
    assert.equal(placement.h, metersToWorld(40))
    assert.equal(placement.pxPerMeter, PX_PER_METER)
    // Centrado sobre el área de impresión en pantalla
    assert.equal(placement.x + placement.w / 2, 50 + 200)
    assert.equal(placement.y + placement.h / 2, 40 + 100)
  })

  it('entidad 20×3 m es proporción correcta sobre mapa de 80×40 m', () => {
    const mapW = 80
    const mapH = 40
    const placement = printAreaToScaledWorldRect(
      { x: 0, y: 0, w: 400, h: 200 },
      { x: 0, y: 0 },
      1,
      { widthM: mapW, heightM: mapH },
    )
    const entW = metersToWorld(20)
    const entH = metersToWorld(3)
    assert.equal(entityFractionOfMapWidth(20, mapW), 20 / 80)
    assert.ok(Math.abs(entW / placement.w - 0.25) < 1e-9)
    assert.ok(Math.abs(entH / placement.h - 3 / 40) < 1e-9)
    // worldToMeters es independiente del zoom visual del lienzo
    assert.equal(worldToMeters(entW), 20)
    assert.equal(worldToMeters(entH), 3)
  })

  it('mapCssRectToLngLatCorners usa unproject del mapa', () => {
    const map = {
      unproject([x, y]) {
        return { lng: x / 1000, lat: 4 + y / 1000 }
      },
    }
    const c = mapCssRectToLngLatCorners(map, { x: 0, y: 0, w: 100, h: 50 })
    assert.deepEqual(c.nw, { lng: 0, lat: 4 })
    assert.deepEqual(c.se, { lng: 0.1, lat: 4.05 })
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
