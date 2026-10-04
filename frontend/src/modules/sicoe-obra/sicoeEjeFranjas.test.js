import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarRegistroFranja,
  bearingDeg,
  construirFranjaPolygon,
  construirLineaSentidoEje,
  costadosCoinciden,
  destinationPoint,
  distConSignoSobreEje,
  haversineM,
  normalizarCostadoDigitado,
  polylineSelfIntersects,
  proyectarSobreEje,
  proyeccionMasAllaDelEje,
  reconstruirEjesDesdeIndice,
  repararBuclesLocales,
  repararRemateExtremos,
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
    assert.equal(line.along, true)
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

  it('cara larga curva (tipo 9+130→9+970) sigue el eje, no la cuerda', () => {
    // Eje con gran curva: cuerda geográfica corta, abscisa larga.
    const pts = []
    for (let m = 9130; m <= 9970; m += 10) {
      const t = (m - 9130) / 840
      const ang = t * Math.PI // semicírculo → cuerda corta vs abs larga
      const R = 840 / Math.PI
      pts.push({
        m,
        lng: -74.5 + (R / 111320) * Math.sin(ang),
        lat: 4.4 + (R / 110540) * (1 - Math.cos(ang)),
      })
    }
    const ejes = [{ id: 0, puntos: pts }]
    const br0 = bearingDeg(pts[0], pts[1])
    const br1 = bearingDeg(pts[pts.length - 2], pts[pts.length - 1])
    const inicio = destinationPoint(pts[1].lng, pts[1].lat, (br0 + 270) % 360, 6)
    const fin = destinationPoint(pts[pts.length - 2].lng, pts[pts.length - 2].lat, (br1 + 270) % 360, 6)
    const chord = haversineM(inicio, fin)
    const line = construirLineaSentidoEje({
      ejes,
      inicio,
      fin,
      stepM: 10,
      maxDistM: 40,
    })
    assert.ok(line)
    assert.equal(line.along, true)
    assert.ok(line.points.length > 10, `n=${line.points.length}`)
    // La trayectoria debe ser mucho más larga que la cuerda (sigue la vía).
    let path = 0
    for (let i = 1; i < line.points.length; i += 1) {
      path += haversineM(line.points[i - 1], line.points[i])
    }
    assert.ok(path > chord * 1.5, `path=${path.toFixed(1)} chord=${chord.toFixed(1)}`)
    assert.equal(line.points[0].lng, inicio.lng)
    assert.equal(line.points[line.points.length - 1].lng, fin.lng)
    assert.equal(polylineSelfIntersects(line.points), false)
  })

  it('en extremo / más allá del abscisado sigue el eje y remata en el punto sin pico', () => {
    const pts = []
    for (let m = 9130; m <= 9180; m += 5) {
      pts.push({ m, lng: -74.4 + (m - 9130) * 0.000008, lat: 4.4 })
    }
    const ejes = [{ id: 0, puntos: pts }]
    const first = pts[0]
    const br = bearingDeg(pts[0], pts[1])
    const beyond = destinationPoint(first.lng, first.lat, (br + 180) % 360, 8)
    const leftBeyond = destinationPoint(beyond.lng, beyond.lat, (br + 270) % 360, 6)
    const mid = pts[6]
    const leftMid = destinationPoint(mid.lng, mid.lat, (br + 270) % 360, 6)
    const proy = proyectarSobreEje(ejes, leftBeyond.lng, leftBeyond.lat, { maxDistM: 40 })
    assert.ok(proyeccionMasAllaDelEje(ejes[0], proy, leftBeyond.lng, leftBeyond.lat))
    const line = construirLineaSentidoEje({
      ejes,
      inicio: leftMid,
      fin: leftBeyond,
      stepM: 2,
      maxDistM: 40,
    })
    assert.ok(line)
    assert.equal(line.points[0].lng, leftMid.lng)
    assert.equal(line.points[0].lat, leftMid.lat)
    assert.equal(line.points[line.points.length - 1].lng, leftBeyond.lng)
    assert.equal(line.points[line.points.length - 1].lat, leftBeyond.lat)
    // Debe densificar a lo largo (no recta que abandona el eje).
    assert.ok(line.points.length >= 3, `n=${line.points.length}`)
    assert.equal(line.along, true)
    // Sin picos: ningún interior muy lejos de ambos extremos a la vez de forma desproporcionada
    const chord = haversineM(leftMid, leftBeyond)
    for (let i = 1; i < line.points.length - 1; i += 1) {
      const d0 = haversineM(line.points[i], leftMid)
      const d1 = haversineM(line.points[i], leftBeyond)
      assert.ok(Math.min(d0, d1) < chord + 25, `spike at ${i}: d0=${d0} d1=${d1}`)
    }
  })

  it('transversal cerca del extremo queda recta (sin densificar)', () => {
    const pts = []
    for (let m = 0; m <= 50; m += 5) {
      pts.push({ m, lng: -74.3, lat: 4.5 + m * 0.000009 })
    }
    const ejes = [{ id: 0, puntos: pts }]
    const end = pts[pts.length - 1]
    const br = bearingDeg(pts[pts.length - 2], end)
    const left = destinationPoint(end.lng, end.lat, (br + 270) % 360, 5)
    const right = destinationPoint(end.lng, end.lat, (br + 90) % 360, 5)
    const line = construirLineaSentidoEje({
      ejes,
      inicio: left,
      fin: right,
      stepM: 2,
      maxDistM: 40,
    })
    assert.ok(line)
    assert.equal(line.along, false)
    assert.equal(line.points.length, 2)
  })

  it('curva cerrada: sigue el eje y repara bucles locales sin abandonar la vía', () => {
    const R2 = 30 / (Math.PI / 2)
    const cx = -74.4
    const cy = 4.5
    const tight = []
    for (let m = 9940; m <= 9970; m += 1) {
      const ang = ((m - 9940) / 30) * (Math.PI / 2)
      tight.push({
        m,
        lng: cx + (R2 / 111320) * Math.cos(ang),
        lat: cy + (R2 / 110540) * Math.sin(ang),
      })
    }
    const ejes = [{ id: 0, puntos: tight }]
    const i0 = tight[2]
    const i1 = tight[tight.length - 3]
    const brI = bearingDeg(tight[2], tight[3])
    const brF = bearingDeg(tight[tight.length - 4], tight[tight.length - 3])
    const inner0 = destinationPoint(i0.lng, i0.lat, (brI + 270) % 360, 14)
    const inner1 = destinationPoint(i1.lng, i1.lat, (brF + 270) % 360, 14)
    const line = construirLineaSentidoEje({
      ejes,
      inicio: inner0,
      fin: inner1,
      stepM: 1,
      maxDistM: 40,
    })
    assert.ok(line)
    assert.equal(line.along, true)
    assert.ok(line.points.length >= 3)
    assert.equal(polylineSelfIntersects(line.points), false)
    assert.equal(line.points[0].lng, inner0.lng)
    assert.equal(line.points[line.points.length - 1].lng, inner1.lng)
  })

  it('repararBuclesLocales y repararRemateExtremos corrigen solo la zona afectada', () => {
    const a = { lng: -74.1, lat: 4.1 }
    const b = { lng: -74.11, lat: 4.11 }
    // Cruce tipo lazo
    const loop = [
      a,
      { lng: -74.105, lat: 4.102 },
      { lng: -74.108, lat: 4.108 },
      { lng: -74.102, lat: 4.108 },
      { lng: -74.105, lat: 4.104 },
      b,
    ]
    const fixed = repararBuclesLocales(loop)
    assert.ok(fixed.length < loop.length)
    assert.equal(polylineSelfIntersects(fixed), false)

    const withHook = [
      a,
      { lng: -74.3, lat: 4.3 }, // pico lejano
      { lng: -74.1005, lat: 4.1005 },
      b,
    ]
    const remate = repararRemateExtremos(withHook, a, b, { maxHookM: 20, look: 3 })
    assert.ok(!remate.some((p) => Math.abs(p.lng + 74.3) < 1e-9))
    assert.equal(remate[0].lng, a.lng)
    assert.equal(remate[remate.length - 1].lng, b.lng)
  })
})
