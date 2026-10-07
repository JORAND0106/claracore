import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PX_PER_METER, metersToWorld } from './esquemaGeometry.js'
import { haversineMeters } from './esquemaMapaCapture.js'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'
import {
  canvasPanFromMapOrigin,
  canvasZoomFromMapPpm,
  entityScreenPxForMeters,
  gkToCanvasWorld,
  lngLatToCanvasWorld,
  mapCenterAsGeoOrigin,
  mapRelativeZoomPercent,
  mapScreenPixelsPerMeter,
  mapZoomAfterVisualFactor,
  reprojectSceneObjectsToMap,
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

  it('entidad 2.41 m ≈ 2.41×ppm px en pantalla (no manzanas del pueblo)', () => {
    const ppm = 3
    const map = makeLinearMap({ ppm, lng0: -74.1, lat0: 4.6 })
    const sync = syncCanvasTransformToMap(map, { lng: -74.1, lat: 4.6 })
    assert.ok(sync)
    const entityM = 2.41
    const worldW = metersToWorld(entityM)
    const screenW = worldW * sync.zoom
    assert.ok(Math.abs(screenW - entityScreenPxForMeters(entityM, sync.pixelsPerMeter)) < 1e-6)
    assert.ok(screenW < 15)
    assert.ok(screenW > 5)
  })

  it('zoom lienzo 2.5 (fit nodos) vs sync: documenta el desfase del bug', () => {
    const ppm = 3
    const sync = syncCanvasTransformToMap(makeLinearMap({ ppm }), { lng: -74.1, lat: 4.6 })
    assert.ok(sync)
    const worldW = metersToWorld(2.41)
    const broken = worldW * 2.5
    const correct = worldW * sync.zoom
    assert.ok(broken / correct > 30)
  })
})

describe('reprojectSceneObjectsToMap / gkToCanvasWorld', () => {
  it('coloca el nodo donde project(WGS84) — corrige desfase planar a ~2 km', () => {
    const este0 = 959000
    const norte0 = 970800
    const este = 959000
    const norte = 972840 // ~2040 m al norte en Gauss
    const ll0 = gkBogotaToWgs84(este0, norte0)
    const ll = gkBogotaToWgs84(este, norte)
    assert.ok(ll0 && ll)
    const map = makeLinearMap({ ppm: 2, lng0: ll0.lng, lat0: ll0.lat })
    const sync = syncCanvasTransformToMap(map, ll0)
    assert.ok(sync)

    const planar = { x: 0, y: -(norte - norte0) * PX_PER_METER }
    const planarScreen = {
      x: planar.x * sync.zoom + sync.pan.x,
      y: planar.y * sync.zoom + sync.pan.y,
    }
    const expected = map.project([ll.lng, ll.lat])
    const planarErrM = Math.hypot(planarScreen.x - expected.x, planarScreen.y - expected.y)
      / sync.pixelsPerMeter
    // En mock lineal el residual GK↔geo es menor que en Mercator real (~11 m),
    // pero sigue siendo notable a 2 km.
    assert.ok(planarErrM > 1.5, `planar err should be noticeable, got ${planarErrM.toFixed(2)} m`)

    const [nodo] = reprojectSceneObjectsToMap(
      [{ type: 'nodo', id: 'n45', x: planar.x, y: planar.y, este, norte, nodeNum: '45' }],
      map,
      sync.pan,
      sync.zoom,
      { este0, norte0 },
    )
    const screen = {
      x: nodo.x * sync.zoom + sync.pan.x,
      y: nodo.y * sync.zoom + sync.pan.y,
    }
    assert.ok(Math.abs(screen.x - expected.x) < 0.08, `dx=${screen.x - expected.x}`)
    assert.ok(Math.abs(screen.y - expected.y) < 0.08, `dy=${screen.y - expected.y}`)
    // Tras reproyectar, el error respecto al mapa debe ser ≈ 0 (≪ residual planar).
    const fixedErrM = Math.hypot(screen.x - expected.x, screen.y - expected.y) / sync.pixelsPerMeter
    assert.ok(fixedErrM < 0.05, `fixed err ${fixedErrM}`)
    assert.ok(fixedErrM < planarErrM / 10)

    const via = gkToCanvasWorld(map, este, norte, sync.pan, sync.zoom)
    assert.ok(via)
    assert.ok(Math.abs(via.x - nodo.x) < 1e-9)
    assert.ok(Math.abs(via.y - nodo.y) < 1e-9)
  })

  it('no mueve trazos libres sin ancla geo', () => {
    const map = makeLinearMap({ ppm: 2 })
    const sync = syncCanvasTransformToMap(map, { lng: -74.1, lat: 4.6 })
    const free = { type: 'polilinea', id: 'f', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }
    const [out] = reprojectSceneObjectsToMap(
      [free],
      map,
      sync.pan,
      sync.zoom,
      { este0: 1, norte0: 2 },
    )
    assert.equal(out.points[0].x, 10)
    assert.equal(out.points[1].y, 40)
  })

  it('lngLatToCanvasWorld es inverso de project con pan/zoom', () => {
    const map = makeLinearMap({ ppm: 3, lng0: -74.2, lat0: 4.5 })
    const origin = { lng: -74.2, lat: 4.5 }
    const sync = syncCanvasTransformToMap(map, origin)
    const target = { lng: -74.201, lat: 4.502 }
    const w = lngLatToCanvasWorld(map, target.lng, target.lat, sync.pan, sync.zoom)
    const screen = { x: w.x * sync.zoom + sync.pan.x, y: w.y * sync.zoom + sync.pan.y }
    const p = map.project([target.lng, target.lat])
    assert.ok(Math.abs(screen.x - p.x) < 1e-6)
    assert.ok(Math.abs(screen.y - p.y) < 1e-6)
  })

  it('línea fromCoordTable queda amarrada a nodos tras varios zoom (sella GK)', () => {
    const este0 = 959000
    const norte0 = 970800
    const n1 = { este: 959000, norte: 970800 }
    const n2 = { este: 959120, norte: 972840 } // ~2 km al norte + este
    const ll0 = gkBogotaToWgs84(este0, norte0)
    assert.ok(ll0)

    const mapA = makeLinearMap({ ppm: 2, lng0: ll0.lng, lat0: ll0.lat })
    const syncA = syncCanvasTransformToMap(mapA, ll0)
    assert.ok(syncA)
    const gkOrigin = { este0, norte0 }

    // Mundo planar inicial (como topoToWorld) — sin este1/norte1 (bug histórico).
    const line0 = {
      id: 'L',
      type: 'linea',
      fromCoordTable: true,
      joinSeq: true,
      x1: 0,
      y1: 0,
      x2: (n2.este - este0) * PX_PER_METER,
      y2: -(n2.norte - norte0) * PX_PER_METER,
    }
    const nodoA = { id: 'a', type: 'nodo', nodeNum: '1', x: line0.x1, y: line0.y1, ...n1 }
    const nodoB = { id: 'b', type: 'nodo', nodeNum: '2', x: line0.x2, y: line0.y2, ...n2 }

    const pass1 = reprojectSceneObjectsToMap(
      [nodoA, nodoB, line0],
      mapA,
      syncA.pan,
      syncA.zoom,
      gkOrigin,
    )
    const line1 = pass1.find((o) => o.id === 'L')
    const na1 = pass1.find((o) => o.id === 'a')
    const nb1 = pass1.find((o) => o.id === 'b')
    assert.ok(Number.isFinite(line1.este1) && Number.isFinite(line1.norte1))
    assert.ok(Number.isFinite(line1.este2) && Number.isFinite(line1.norte2))
    assert.ok(Math.hypot(line1.x1 - na1.x, line1.y1 - na1.y) < 1e-6)
    assert.ok(Math.hypot(line1.x2 - nb1.x, line1.y2 - nb1.y) < 1e-6)

    // Acercar (ppm ×4) y volver a alejar: extremos deben seguir en los nodos.
    const mapB = makeLinearMap({ ppm: 8, lng0: ll0.lng, lat0: ll0.lat })
    const syncB = syncCanvasTransformToMap(mapB, ll0)
    const pass2 = reprojectSceneObjectsToMap(pass1, mapB, syncB.pan, syncB.zoom, gkOrigin)
    const line2 = pass2.find((o) => o.id === 'L')
    const na2 = pass2.find((o) => o.id === 'a')
    const nb2 = pass2.find((o) => o.id === 'b')
    assert.ok(Math.hypot(line2.x1 - na2.x, line2.y1 - na2.y) < 1e-6, 'inicio suelto en zoom in')
    assert.ok(Math.hypot(line2.x2 - nb2.x, line2.y2 - nb2.y) < 1e-6, 'fin suelto en zoom in')

    const mapC = makeLinearMap({ ppm: 2, lng0: ll0.lng, lat0: ll0.lat })
    const syncC = syncCanvasTransformToMap(mapC, ll0)
    const pass3 = reprojectSceneObjectsToMap(pass2, mapC, syncC.pan, syncC.zoom, gkOrigin)
    const line3 = pass3.find((o) => o.id === 'L')
    const na3 = pass3.find((o) => o.id === 'a')
    const nb3 = pass3.find((o) => o.id === 'b')
    assert.ok(Math.hypot(line3.x1 - na3.x, line3.y1 - na3.y) < 1e-6)
    assert.ok(Math.hypot(line3.x2 - nb3.x, line3.y2 - nb3.y) < 1e-6)
    // Sin desplazamiento acumulado respecto a la 1.ª pasada (mismo ppm).
    assert.ok(Math.hypot(line3.x1 - line1.x1, line3.y1 - line1.y1) < 1e-6)
    assert.ok(Math.hypot(line3.x2 - line1.x2, line3.y2 - line1.y2) < 1e-6)
  })
})
