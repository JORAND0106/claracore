/**
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaTramoMapa.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bearingDegTramo,
  puedeVerMapaTramo,
  resolverCoordsTramoWgs84,
} from './planillaTuberiaTramoMapa.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaTramoMapaModal.jsx'), 'utf8')

describe('Vista rápida tramo en mapa', () => {
  it('resuelve WGS84 desde API o conversión GK', () => {
    const fromApi = resolverCoordsTramoWgs84({
      coordsWgs84Inicio: { lat: 4.6, lon: -74.1 },
      coordsWgs84Fin: { lat: 4.61, lng: -74.09 },
    })
    assert.equal(fromApi.ok, true)
    assert.equal(fromApi.inicio.lng, -74.1)
    assert.equal(fromApi.fin.lat, 4.61)

    const convertGk = (este, norte) => {
      if (![este, norte].every(Number.isFinite)) return null
      return { lng: este / 1e6, lat: norte / 1e6 }
    }
    const fromGk = resolverCoordsTramoWgs84({
      norteIni: 1000000,
      esteIni: 900000,
      norteFin: 1000100,
      esteFin: 900100,
      convertGk,
    })
    assert.equal(fromGk.ok, true)
    assert.ok(Math.abs(fromGk.inicio.lng - 0.9) < 1e-9)

    assert.equal(
      puedeVerMapaTramo({ coordsWgs84Inicio: { lat: 1, lon: 2 } }),
      false,
    )
  })

  it('bearing apunta en ambos sentidos', () => {
    const a = { lng: -74.1, lat: 4.6 }
    const b = { lng: -74.09, lat: 4.6 }
    const ab = bearingDegTramo(a, b)
    const ba = bearingDegTramo(b, a)
    assert.ok(ab > 80 && ab < 100) // ~este
    assert.ok(ba > 260 && ba < 280) // ~oeste
    assert.ok(Math.abs(((ab - ba + 360) % 360) - 180) < 5)
  })

  it('Form expone icono ojo y modal Mapbox', () => {
    assert.match(formSrc, /PlanillaTuberiaTramoMapaModal/)
    assert.match(formSrc, /setTramoMapOpen\(true\)/)
    assert.match(formSrc, /data-icon-ojo-tramo/)
    assert.match(formSrc, /puedeVerMapaTramo/)
    assert.match(modalSrc, /crearMapboxMapSeguro/)
    assert.match(modalSrc, /Inicio/)
    assert.match(modalSrc, /Fin/)
    assert.match(modalSrc, /bearingDegTramo/)
    assert.match(modalSrc, /data-planilla-tramo-mapa-modal/)
  })
})
