/**
 * Cálculo NewPoint en cliente (paridad con backend topografia_utils.newpoint_por_angulo_distancias).
 */
import { gmsToDecimal, decimalToGms } from './topografia_angular.js'

function segundosArcoATexto(seg) {
  const n = Number(seg)
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const absN = Math.abs(n)
  const grados = Math.floor(absN / 3600)
  const resto = absN - grados * 3600
  const minutos = Math.floor(resto / 60)
  const s = Math.round((resto - minutos * 60) * 100) / 100
  return `${sign}${String(grados).padStart(2, '0')}°${String(minutos).padStart(2, '0')}'${String(s.toFixed(2)).padStart(5, '0')}"`
}

function interseccionCirculos(n1, e1, d1, n2, e2, d2) {
  const dx = e2 - e1
  const dy = n2 - n1
  const d = Math.hypot(dx, dy)
  if (d < 1e-9) return []
  if (d > d1 + d2 || d < Math.abs(d1 - d2)) return []
  const a = (d1 * d1 - d2 * d2 + d * d) / (2 * d)
  const h2 = d1 * d1 - a * a
  if (h2 < 0) return []
  const h = Math.sqrt(Math.max(0, h2))
  const xm = e1 + (a * dx) / d
  const ym = n1 + (a * dy) / d
  const rx = (-dy * h) / d
  const ry = (dx * h) / d
  return [
    [ym + ry, xm + rx],
    [ym - ry, xm - rx],
  ]
}

function anguloInteriorEstacion(nu, eu, n1, e1, n2, e2) {
  const a1 = Math.atan2(e1 - eu, n1 - nu)
  const a2 = Math.atan2(e2 - eu, n2 - nu)
  let ang = Math.abs(a1 - a2) * (180 / Math.PI)
  if (ang > 180) ang = 360 - ang
  return ang
}

function puntoDentroPoligono(n, e, vertices) {
  if (!vertices?.length) return null
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ni, ei] = vertices[i]
    const [nj, ej] = vertices[j]
    if ((ei > e) !== (ej > e) && n < ((nj - ni) * (e - ei)) / (ej - ei + 1e-15) + ni) {
      inside = !inside
    }
  }
  return inside
}

function detalleOpcionNewpoint(letra, nu, eu, n1, e1, n2, e2, alphaDeg, verticesPoligonal) {
  const angInt = anguloInteriorEstacion(nu, eu, n1, e1, n2, e2)
  const errAng = Math.abs(angInt - alphaDeg) * 3600
  const inside = verticesPoligonal?.length
    ? puntoDentroPoligono(nu, eu, verticesPoligonal)
    : null
  return {
    letra,
    norte: Math.round(nu * 10000) / 10000,
    este: Math.round(eu * 10000) / 10000,
    error_angular_segundos: Math.round(errAng * 100) / 100,
    error_angular_gms_texto: segundosArcoATexto(errAng),
    angulo_calculado_texto: decimalToGms(angInt),
    dentro_poligonal: inside,
  }
}

export function newpointPorAnguloDistancias(
  n1, e1, d1,
  n2, e2, d2,
  anguloObservadoGms,
  verticesPoligonal = null,
) {
  const alphaDeg = gmsToDecimal(anguloObservadoGms)
  const alpha = (alphaDeg * Math.PI) / 180
  const dP1p2 = Math.hypot(n2 - n1, e2 - e1)
  const dTriangulo = Math.sqrt(Math.max(0, d1 * d1 + d2 * d2 - 2 * d1 * d2 * Math.cos(alpha)))
  const errorLinealMedicion = Math.abs(dP1p2 - dTriangulo)

  let candidatos = interseccionCirculos(n1, e1, d1, n2, e2, d2)
  if (!candidatos.length) {
    const aN = n2 - n1
    const aE = e2 - e1
    const c = -d1 + d2 * Math.cos(alpha)
    const s = d2 * Math.sin(alpha)
    if (Math.abs(c) < 1e-12 && Math.abs(s) < 1e-12) {
      throw new Error('Geometría degenerada: revise distancias y ángulo observado.')
    }
    const theta = Math.atan2(aE, aN) - Math.atan2(s, c)
    candidatos = [[n1 - d1 * Math.cos(theta), e1 - d1 * Math.sin(theta)]]
  }

  candidatos = [...candidatos].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const letras = ['A', 'B']
  const opciones = candidatos.slice(0, 2).map(([nu, eu], i) =>
    detalleOpcionNewpoint(letras[i], nu, eu, n1, e1, n2, e2, alphaDeg, verticesPoligonal),
  )
  const errAngRef = opciones[0]?.error_angular_segundos ?? 0

  return {
    opciones,
    distancia_p1p2: Math.round(dP1p2 * 10000) / 10000,
    distancia_triangulo: Math.round(dTriangulo * 10000) / 10000,
    error_lineal: Math.round(errorLinealMedicion * 10000) / 10000,
    error_angular_segundos: errAngRef,
    error_angular_gms_texto: segundosArcoATexto(errAngRef),
  }
}

/** Construye respuesta tipo API POST /newpoints a partir del cálculo local. */
export function buildNewpointOfflineResponse(form, puntosMap, verticesPoligonal, calc) {
  const p1 = puntosMap[form.punto1_id]
  const p2 = puntosMap[form.punto2_id]
  const opA = calc.opciones[0]
  const opB = calc.opciones[1]
  return {
    id: form._localId || form.id,
    _offline: true,
    _pending_sync: true,
    poligonal_id: form.poligonal_id,
    nombre_punto_nuevo: form.nombre_punto_nuevo,
    descripcion: form.descripcion,
    punto1_id: form.punto1_id,
    punto2_id: form.punto2_id,
    distancia1: Number(form.distancia1),
    distancia2: Number(form.distancia2),
    angulo_observado_gms: Number(form.angulo_observado_gms),
    opcion_a_norte: opA?.norte,
    opcion_a_este: opA?.este,
    opcion_b_norte: opB?.norte,
    opcion_b_este: opB?.este,
    opciones: calc.opciones,
    opcion_elegida: form.opcion_elegida || null,
    norte_resultado: form.opcion_elegida === 'B' ? opB?.norte : form.opcion_elegida === 'A' ? opA?.norte : null,
    este_resultado: form.opcion_elegida === 'B' ? opB?.este : form.opcion_elegida === 'A' ? opA?.este : null,
    error_lineal: calc.error_lineal,
    error_angular_segundos: calc.error_angular_segundos,
    tolerancia_lineal: form.tolerancia_lineal ?? 0.05,
    tolerancia_angular_seg: form.tolerancia_angular_seg ?? 30,
    admisible: calc.error_lineal <= (form.tolerancia_lineal ?? 0.05)
      && calc.error_angular_segundos <= (form.tolerancia_angular_seg ?? 30),
    operador: form.operador,
    fecha: form.fecha,
    equipo_marca: form.equipo_marca,
    equipo_referencia: form.equipo_referencia,
    equipo_serial: form.equipo_serial,
    estado: 'calculado',
    vertices_poligonal: verticesPoligonal,
    punto1_nombre: p1?.nombre,
    punto2_nombre: p2?.nombre,
  }
}
