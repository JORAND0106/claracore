/**
 * Smoke tests: marcador GPS (GeolocateControl) compartido por todos los mapas Mapbox.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAPBOX_GEOLOCATE_CONTROL_OPTIONS,
  MAPBOX_GEOLOCATE_FLAG,
  addMapboxGeolocateControl,
  ensureGeolocatePointerEventsNone,
  __resetGeolocatePointerCssForTests,
} from './mapboxGeolocate.js'

class GeolocateStub {
  constructor(options) {
    this.options = options
    this._handlers = {}
    this.triggered = false
  }
  on(evt, fn) {
    this._handlers[evt] = fn
    return this
  }
  trigger() {
    this.triggered = true
    return true
  }
}

function makeMap({ loaded = false } = {}) {
  const onceHandlers = {}
  return {
    controls: [],
    addControl(ctrl, position) {
      this.controls.push({ ctrl, position })
    },
    loaded() {
      return loaded
    },
    once(evt, fn) {
      onceHandlers[evt] = fn
    },
    _fire(evt) {
      onceHandlers[evt]?.()
    },
  }
}

describe('mapboxGeolocate', () => {
  beforeEach(() => {
    __resetGeolocatePointerCssForTests()
  })

  it('exporta opciones: tracking activo y sin follow de cámara', () => {
    const o = MAPBOX_GEOLOCATE_CONTROL_OPTIONS
    assert.equal(o.trackUserLocation, true)
    assert.equal(o.showUserLocation, true)
    assert.equal(o.showAccuracyCircle, true)
    assert.equal(o.showUserHeading, true)
    assert.equal(o.followUserLocation, false)
    assert.equal(o.positionOptions.enableHighAccuracy, true)
  })

  it('añade GeolocateControl en top-right', () => {
    const map = makeMap({ loaded: false })
    const ctrl = addMapboxGeolocateControl(map, 'top-right', { GeolocateControl: GeolocateStub })
    assert.ok(ctrl)
    assert.equal(map.controls.length, 1)
    assert.equal(map.controls[0].position, 'top-right')
    assert.equal(ctrl.options.followUserLocation, false)
    assert.equal(ctrl.options.trackUserLocation, true)
    assert.equal(map[MAPBOX_GEOLOCATE_FLAG], ctrl)
  })

  it('es idempotente por instancia de mapa', () => {
    const map = makeMap({ loaded: false })
    const a = addMapboxGeolocateControl(map, 'top-right', { GeolocateControl: GeolocateStub })
    const b = addMapboxGeolocateControl(map, 'top-right', { GeolocateControl: GeolocateStub })
    assert.equal(a, b)
    assert.equal(map.controls.length, 1)
  })

  it('solicita ubicación al evento load (sin errores si se deniega)', () => {
    const map = makeMap({ loaded: false })
    const ctrl = addMapboxGeolocateControl(map, 'top-right', { GeolocateControl: GeolocateStub })
    assert.equal(ctrl.triggered, false)
    map._fire('load')
    assert.equal(ctrl.triggered, true)
    assert.doesNotThrow(() => {
      ctrl._handlers.error?.({ code: 1, message: 'User denied Geolocation' })
    })
  })

  it('retorna null con mapa inválido', () => {
    assert.equal(addMapboxGeolocateControl(null), null)
    assert.equal(addMapboxGeolocateControl(undefined), null)
    assert.equal(addMapboxGeolocateControl({}), null)
  })

  it('inyecta CSS pointer-events:none una sola vez', () => {
    const appended = []
    const fakeDoc = {
      head: {
        appendChild(el) {
          appended.push(el)
        },
      },
      createElement(tag) {
        return {
          tag,
          attrs: {},
          setAttribute(k, v) {
            this.attrs[k] = v
          },
          textContent: '',
        }
      },
    }
    assert.equal(ensureGeolocatePointerEventsNone(fakeDoc), true)
    assert.equal(appended.length, 1)
    assert.match(appended[0].textContent, /pointer-events:\s*none/)
    assert.equal(ensureGeolocatePointerEventsNone(fakeDoc), false)
    assert.equal(appended.length, 1)
  })
})
