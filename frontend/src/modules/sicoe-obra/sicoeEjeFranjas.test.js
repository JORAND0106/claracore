import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarRegistroFranja,
  bearingDeg,
  construirFranjaPolygon,
  construirLineaSentidoEje,
  costadosCoinciden,
  distConSignoSobreEje,
  haversineM,
  normalizarCostadoDigitado,
  proyectarSobreEje,
  reconstruirEjesDesdeIndice,
} from './sicoeEjeFranjas.js'

/** Eje recto ~ norte-sur cerca de Bogotá, abscisas 0..100 cada 10 m. */
function ejeDummy() {
  const pts = []
  for (let m = 0; m <= 100; m += 10) {
    pts.push({ m, lng: -74.05, lat: 4.72 + m * 0.000009 }) // ~1 m ≈ 9e-6 deg lat
  }
  return [{ id: 0, puntos: pts }]
}

describe('sicoeEjeFranjas', () => {
  it('reconstruye eje continuo y parte saltos grandes', () => {
    const a = [
      { m: 0, lng: -74.05, lat: 4.72 },
      { m: 10, lng: -74.05, lat: 4.72009 },
      { m: 20, lng: -74.05, lat: 4.72018 },
    ]
    const ejes = reconstruirEjesDesdeIndice(a)
    assert.equal(ejes.length, 1)
    assert.equal(ejes[0].puntos.length, 3)

    const b = [
      ...a,
      { m: 200, lng: -74.1, lat: 4.8 }, // salto geográfico grande
      { m: 210, lng: -74.1, lat: 4.80009 },
    ]
    const ejes2 = reconstruirEjesDesdeIndice(b)
    assert.ok(ejes2.length >= 2)
  })

  it('proyecta punto al este → lado derecha/izquierda según rumbo', () => {
    const ejes = ejeDummy()
    // Punto al este del eje (lng mayor)
    const proy = proyectarSobreEje(ejes, -74.0499, 4.72045, { maxDistM: 50 })
    assert.ok(proy)
    assert.ok(proy.sobre_eje)
    assert.ok(proy.abs_m > 0)
    assert.ok(['izquierda', 'derecha', 'central'].includes(proy.lado))
  })

  it('construye polígono de franja entre abscisas', () => {
    const ejes = ejeDummy()
    const poly = construirFranjaPolygon({
      eje: ejes[0],
      absInicio: 20,
      absFinal: 60,
      distIni: 2,
      distFin: 2,
      ancho: 1,
      lado: 'derecha',
    })
    assert.equal(poly.type, 'Polygon')
    assert.ok(poly.coordinates[0].length >= 4)
  })

  it('alerta ubicación si abscisa digitada difiere de la proyectada', () => {
    const ejes = ejeDummy()
    // Coordenada cerca de abs ~50, pero digita 0–10
    const mid = ejes[0].puntos[5]
    const r = analizarRegistroFranja({
      registro: {
        id: 1,
        numero_registro: 1,
        item_numero: '1.1',
        abs_inicio: 0,
        abs_final: 10,
        margen: 'Derecha',
        ancho: 1,
        coord_lat: mid.lat,
        coord_lng: mid.lng + 0.00002,
      },
      ejes,
      toleranciaUbicacionM: 1,
    })
    assert.equal(r.ok, true)
    assert.ok(r.huella)
    const tipos = (r.hallazgos || []).map((h) => h.tipo)
    assert.ok(tipos.includes('ubicacion_inconsistente'))
  })

  it('dibuja aproximada sin coordenadas', () => {
    const ejes = ejeDummy()
    const r = analizarRegistroFranja({
      registro: {
        id: 2,
        abs_inicio: 10,
        abs_final: 40,
        margen: 'Izquierda',
        ancho: 0.8,
      },
      ejes,
    })
    assert.equal(r.precision, 'aproximada')
    assert.ok(r.huella)
    assert.equal((r.hallazgos || []).length, 0)
  })

  it('normaliza costados y haversine/bearing básicos', () => {
    assert.equal(normalizarCostadoDigitado('Izquierda'), 'izquierda')
    assert.equal(normalizarCostadoDigitado('Der'), 'derecha')
    assert.equal(costadosCoinciden('Izquierda', 'izquierda'), true)
    assert.equal(costadosCoinciden('Izquierda', 'derecha'), false)
    const d = haversineM({ lng: -74, lat: 4 }, { lng: -74, lat: 4.001 })
    assert.ok(d > 100 && d < 130)
    const br = bearingDeg({ lng: -74, lat: 4 }, { lng: -74, lat: 4.01 })
    assert.ok(br < 10 || br > 350)
  })

  it('construirLineaSentidoEje sigue el eje curvo, interpola offset y pasa por extremos', () => {
    // Eje con curva: avanza al norte y luego gira al este
    const pts = []
    for (let m = 0; m <= 50; m += 5) {
      pts.push({ m, lng: -74.05, lat: 4.72 + m * 0.000009 })
    }
    for (let m = 55; m <= 100; m += 5) {
      const t = m - 50
      pts.push({
        m,
        lng: -74.05 + t * 0.000009,
        lat: 4.72 + 50 * 0.000009,
      })
    }
    const ejes = [{ id: 0, puntos: pts }]
    const inicio = { lng: -74.04992, lat: 4.72018 }
    const fin = { lng: -74.0497, lat: 4.72045 }
    const line = construirLineaSentidoEje({
      ejes,
      inicio,
      fin,
      stepM: 5,
      maxDistM: 80,
    })
    assert.ok(line)
    assert.ok(line.points.length >= 3)
    assert.equal(line.points[0].lng, inicio.lng)
    assert.equal(line.points[0].lat, inicio.lat)
    assert.equal(line.points[line.points.length - 1].lng, fin.lng)
    assert.equal(line.points[line.points.length - 1].lat, fin.lat)
    const mid = line.points[Math.floor(line.points.length / 2)]
    const t = 0.5
    const straightLng = inicio.lng + t * (fin.lng - inicio.lng)
    const straightLat = inicio.lat + t * (fin.lat - inicio.lat)
    const off = Math.hypot(mid.lng - straightLng, mid.lat - straightLat)
    assert.ok(off > 1e-6, `mid should leave the chord on a curved axis, off=${off}`)
    assert.equal(distConSignoSobreEje({ dist_m: 2, lado: 'izquierda' }), 2)
    assert.equal(distConSignoSobreEje({ dist_m: 2, lado: 'derecha' }), -2)
  })
})
