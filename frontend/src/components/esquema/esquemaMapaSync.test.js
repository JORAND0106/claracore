import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PX_PER_METER, metersToWorld } from './esquemaGeometry.js'
import { haversineMeters } from './esquemaMapaCapture.js'
import {
  canvasPanFromMapOrigin,
  canvasZoomFromMapPpm,
  entityScreenPxForMeters,
  mapCenterAsGeoOrigin,
  mapRelativeZoomPercent,
  mapScreenPixelsPerMeter,
  mapZoomAfterVisualFactor,
  syncCanvasTransformToMap,
  visualZoomStillResponsive,
} from './esquemaMapaSync.js'

/** Mapa mock: proyección lineal local (1 m este = k px, 1 m sur = k px). */
function makeLinearMap({ lng0 = -74.1, lat0 = 4.6, ppm = 2, bearingDeg = 0 } = {}) {
  // metros por grado aprox. en lat0
  const mPerDegLat = 110574
  const mPerDegLng = 111319 * Math.cos((lat0 * Math.PI) / 180)
  const rad = (bearingDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const toLocalM = (lng, lat) => {
    const east = (lng - lng0) * mPerDegLng
    const north = (lat - lat0) * mPerDegLat
    return { east, north }
  }

  return {
    getCenter() {
      return { lng: lng0, lat: lat0 }
    },
    project([lng, lat]) {
      const { east, north } = toLocalM(lng, lat)
      // bearing 0: +x = este, +y = sur (−norte). bearing 270: norte a la derecha.
      const x = (east * cos - (-north) * sin) * ppm
      const y = (east * sin + (-north) * cos) * ppm
      return { x, y }
    },
    unproject([x, y]) {
      const sx = x / ppm
      const sy = y / ppm
      const east = sx * cos + sy * sin
      const south = -sx * sin + sy * cos
      const north = -south
      return {
        lng: lng0 + east / mPerDegLng,
        lat: lat0 + north / mPerDegLat,
      }
    },
  }
}

describe('mapScreenPixelsPerMeter', () => {
  it('recupera ppm horizontal en proyección lineal', () => {
    const map = makeLinearMap({ ppm: 2.5 })
    const got = mapScreenPixelsPerMeter(map, { x: 0, y: 0 })
    assert.ok(got)
    assert.ok(Math.abs(got - 2.5) < 0.05)
  })

  it('funciona con bearing 270 (norte a la derecha)', () => {
    const map = makeLinearMap({ ppm: 4, bearingDeg: 270 })
    const got = mapScreenPixelsPerMeter(map, { x: 0, y: 0 })
    assert.ok(got)
    assert.ok(Math.abs(got - 4) < 0.08)
  })
})

describe('canvasZoomFromMapPpm', () => {
  it('zoom = ppm / PX_PER_METER (sin clamp)', () => {
    assert.equal(canvasZoomFromMapPpm(PX_PER_METER), 1)
    assert.equal(canvasZoomFromMapPpm(25), 0.5)
    assert.ok(Math.abs(canvasZoomFromMapPpm(0.42) - 0.42 / 50) < 1e-12)
  })
})

describe('syncCanvasTransformToMap', () => {
  it('ancla origen geo a mundo (0,0) y escala 20 m correctamente', () => {
    const ppm = 2 // 2 px/m en pantalla
    const map = makeLinearMap({ ppm, lng0: -74.1, lat0: 4.6 })
    const origin = { lng: -74.1, lat: 4.6 }
    const sync = syncCanvasTransformToMap(map, origin)
    assert.ok(sync)
    // haversine vs plano local: tolerancia ~1 %
    assert.ok(Math.abs(sync.zoom - ppm / PX_PER_METER) / (ppm / PX_PER_METER) < 0.01)
    // Origen en pantalla (0,0) → pan ≈ 0
    assert.ok(Math.abs(sync.pan.x) < 1e-6)
    assert.ok(Math.abs(sync.pan.y) < 1e-6)

    // Rectángulo 20 m en mundo → 20 * ppm_efectivo px en pantalla
    const worldW = metersToWorld(20)
    const screenW = worldW * sync.zoom
    assert.ok(Math.abs(screenW - entityScreenPxForMeters(20, sync.pixelsPerMeter)) < 1e-6)
    assert.ok(Math.abs(screenW - 40) / 40 < 0.01)
  })

  it('al panear el mapa (origen se mueve en pantalla) actualiza pan', () => {
    const ppm = 2
    const map = makeLinearMap({ ppm, lng0: -74.1, lat0: 4.6 })
    const origin = { lng: -74.1, lat: 4.6 }
    // Simula pan del mapa: project del origen ya no es (0,0)
    const shifted = {
      ...map,
      project([lng, lat]) {
        const p = map.project([lng, lat])
        return { x: p.x + 120, y: p.y + 40 }
      },
      unproject([x, y]) {
        return map.unproject([x - 120, y - 40])
      },
    }
    const sync = syncCanvasTransformToMap(shifted, origin)
    assert.ok(sync)
    assert.ok(Math.abs(sync.pan.x - 120) < 1e-6)
    assert.ok(Math.abs(sync.pan.y - 40) < 1e-6)
  })

  it('al cambiar ppm (zoom mapa) el tamaño en pantalla de 20 m cambia', () => {
    const origin = { lng: -74.1, lat: 4.6 }
    const near = syncCanvasTransformToMap(makeLinearMap({ ppm: 4 }), origin)
    const far = syncCanvasTransformToMap(makeLinearMap({ ppm: 1 }), origin)
    assert.ok(near && far)
    const wNear = metersToWorld(20) * near.zoom
    const wFar = metersToWorld(20) * far.zoom
    assert.ok(Math.abs(wNear - 80) / 80 < 0.01)
    assert.ok(Math.abs(wFar - 20) / 20 < 0.01)
    assert.ok(wNear > wFar * 3)
  })
})

describe('mapCenterAsGeoOrigin', () => {
  it('lee el centro del mapa', () => {
    assert.deepEqual(
      mapCenterAsGeoOrigin({ getCenter: () => ({ lng: -75, lat: 5 }) }),
      { lng: -75, lat: 5 },
    )
    assert.equal(mapCenterAsGeoOrigin(null), null)
  })
})

describe('consistencia haversine con mock', () => {
  it('100 px horizontales ≈ 100/ppm metros', () => {
    const ppm = 5
    const map = makeLinearMap({ ppm })
    const a = map.unproject([0, 0])
    const b = map.unproject([100, 0])
    const m = haversineMeters(a, b)
    assert.ok(Math.abs(m - 100 / ppm) < 0.5)
  })
})

describe('zoom visual independiente de la escala real', () => {
  it('mapZoomAfterVisualFactor no depende del zoomRef del lienzo', () => {
    const z16 = mapZoomAfterVisualFactor(16, 1.25)
    const z16out = mapZoomAfterVisualFactor(16, 1 / 1.25)
    assert.ok(z16 > 16)
    assert.ok(z16out < 16)
    // Simula zoomRef lienzo ≪ 1 tras sync: el factor sigue moviendo Mapbox
    assert.equal(visualZoomStillResponsive(16, 1.25), true)
    assert.equal(visualZoomStillResponsive(16, 1 / 1.25), true)
    assert.equal(visualZoomStillResponsive(16, 1), false)
  })

  it('tras “dibujar” (estado idle) in/out repetidos siguen respondiendo', () => {
    let mapZoom = 15.5
    // zoomRef del lienzo típico tras sync a ese nivel (~ppm bajos)
    let canvasZoom = 0.04
    for (let i = 0; i < 8; i += 1) {
      const factor = i % 2 === 0 ? 1.25 : 1 / 1.25
      assert.equal(visualZoomStillResponsive(mapZoom, factor), true)
      mapZoom = mapZoomAfterVisualFactor(mapZoom, factor)
      // La escala real (world) no cambia: solo el zoom Mapbox / canvas derivado
      canvasZoom = canvasZoom * factor
      assert.ok(Number.isFinite(mapZoom))
      assert.ok(canvasZoom > 0)
    }
  })

  it('mapRelativeZoomPercent: baseline = 100 %, factor 1.25 → 125', () => {
    assert.equal(mapRelativeZoomPercent(16, 16), 100)
    const z = mapZoomAfterVisualFactor(16, 1.25)
    assert.equal(mapRelativeZoomPercent(z, 16), 125)
  })

  it('escala real 20 m se mantiene al cambiar zoom visual (ppm proporcionales)', () => {
    const origin = { lng: -74.1, lat: 4.6 }
    const near = syncCanvasTransformToMap(makeLinearMap({ ppm: 4 }), origin)
    const far = syncCanvasTransformToMap(makeLinearMap({ ppm: 1 }), origin)
    assert.ok(near && far)
    // world de 20 m es fijo (PX_PER_METER); solo cambia el tamaño en pantalla
    const world20 = metersToWorld(20)
    assert.equal(world20, metersToWorld(20))
    const screenNear = world20 * near.zoom
    const screenFar = world20 * far.zoom
    assert.ok(Math.abs(screenNear / screenFar - 4) < 0.05)
  })
})
