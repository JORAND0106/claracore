/**
 * Helpers puros para la ficha "Verificar" de ClaraGIS (lectura + comparación dibujo).
 */
import { haversineM } from './sicoeEjeFranjas.js'
import { fmtCantidadConDimensiones } from './sicoeCantidadDimensiones.js'
import { formatearCantidadTotal } from './sicoeCantidadRedondeo.js'

const EARTH_R = 6371008.8

export function clasificarUnidadItem(unidad) {
  const s = String(unidad || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return 'otro'
  if (/(^| )(m3|m³|mt3|metro.?cubico)/.test(s) || s === 'm3' || s === 'm³') return 'otro'
  if (/(^| )(m2|m²|mt2|metro.?cuadrado)/.test(s) || s === 'm2' || s === 'm²') return 'area'
  if (
    s === 'm'
    || s === 'ml'
    || s === 'm.l'
    || s === 'm.l.'
    || /(metro.?lineal|^ml\b)/.test(s)
  ) return 'longitud'
  return 'otro'
}

function propsEsNodo(props) {
  const p = props || {}
  const t = String(p.dibujo_tipo || p.huella_tipo || '').toLowerCase()
  if (t === 'nodo' || t === 'punto') return true
  if (p.es_bloque || p.es_entidad) return true
  return false
}

/** Expande dibujo_geojson a features con geometría. */
export function featuresDesdeDibujoReporte(dibujo) {
  if (!dibujo || typeof dibujo !== 'object') return []
  const t = dibujo.type
  let raw = []
  if (t === 'FeatureCollection') raw = dibujo.features || []
  else if (t === 'Feature') raw = [dibujo]
  else if (['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point'].includes(t)) {
    raw = [{ type: 'Feature', geometry: dibujo, properties: {} }]
  }
  return (raw || []).filter((f) => f && f.geometry && f.geometry.type && f.geometry.coordinates != null)
}

/**
 * Clasifica el dibujo del reporte para comparación:
 * - linea si hay LineString (prioridad)
 * - poligono si hay Polygon/MultiPolygon que no sea solo nodo
 * - nodo si solo hay entidades/puntos nodo
 */
export function clasificarTipoDibujo(dibujo) {
  const feats = featuresDesdeDibujoReporte(dibujo)
  if (!feats.length) return null
  let hasLine = false
  let hasPoly = false
  let hasNodo = false
  for (const f of feats) {
    const g = f.geometry?.type
    if (g === 'LineString' || g === 'MultiLineString') hasLine = true
    else if (g === 'Polygon' || g === 'MultiPolygon') {
      if (propsEsNodo(f.properties)) hasNodo = true
      else hasPoly = true
    } else if (g === 'Point') {
      hasNodo = true
    }
  }
  if (hasLine) return 'linea'
  if (hasPoly) return 'poligono'
  if (hasNodo) return 'nodo'
  return null
}

export function longitudLineaM(geom) {
  if (!geom) return null
  const segs = []
  if (geom.type === 'LineString') segs.push(geom.coordinates || [])
  else if (geom.type === 'MultiLineString') segs.push(...(geom.coordinates || []))
  else return null
  let total = 0
  for (const coords of segs) {
    for (let i = 1; i < (coords || []).length; i += 1) {
      const a = coords[i - 1]
      const b = coords[i]
      if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue
      total += haversineM({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] })
    }
  }
  return total > 0 ? total : null
}

/** Área esférica aproximada (m²) de un anillo [lng,lat][]. */
export function areaAnilloM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[i + 1]
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) continue
    area += ((lng2 - lng1) * Math.PI) / 180
      * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180))
  }
  return Math.abs((area * EARTH_R * EARTH_R) / 2)
}

export function areaPoligonoM2(geom) {
  if (!geom) return null
  let total = 0
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates || []
    if (!rings[0]) return null
    total += areaAnilloM2(rings[0])
    for (let i = 1; i < rings.length; i += 1) total -= areaAnilloM2(rings[i])
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates || []) {
      if (!poly?.[0]) continue
      total += areaAnilloM2(poly[0])
      for (let i = 1; i < poly.length; i += 1) total -= areaAnilloM2(poly[i])
    }
  } else return null
  return total > 0 ? total : null
}

export function medirDibujoParaComparacion(dibujo, tipo) {
  const feats = featuresDesdeDibujoReporte(dibujo)
  if (tipo === 'linea') {
    let sum = 0
    let n = 0
    for (const f of feats) {
      const L = longitudLineaM(f.geometry)
      if (L != null) { sum += L; n += 1 }
    }
    return n ? sum : null
  }
  if (tipo === 'poligono') {
    let sum = 0
    let n = 0
    for (const f of feats) {
      if (propsEsNodo(f.properties)) continue
      const A = areaPoligonoM2(f.geometry)
      if (A != null) { sum += A; n += 1 }
    }
    return n ? sum : null
  }
  return null
}

/**
 * Comparación informativa dibujo vs cantidad reportada.
 * @returns {null|{ texto: string, ok: boolean, pctDiff: number, valorDibujo: number, unidadLabel: string }}
 */
export function compararCantidadConDibujo(reg, dibujoGeojson, { umbralPct = 5 } = {}) {
  const unidadClase = clasificarUnidadItem(reg?.unidad)
  const tipoDibujo = clasificarTipoDibujo(dibujoGeojson)
  if (!tipoDibujo || tipoDibujo === 'nodo') return null
  if (unidadClase === 'longitud' && tipoDibujo !== 'linea') return null
  if (unidadClase === 'area' && tipoDibujo !== 'poligono') return null
  if (unidadClase === 'otro') return null

  const valorDibujo = medirDibujoParaComparacion(dibujoGeojson, tipoDibujo)
  if (valorDibujo == null || !Number.isFinite(valorDibujo)) return null

  const reportada = Number(reg?.cantidad_total)
  if (!Number.isFinite(reportada) || reportada <= 0) return null

  const pctDiff = (Math.abs(valorDibujo - reportada) / reportada) * 100
  const ok = pctDiff <= umbralPct
  const unidadLabel = unidadClase === 'area' ? 'm²' : 'm'
  const fmt = formatearCantidadTotal(valorDibujo, { locale: true, empty: '—' })
  const texto = ok
    ? `Dibujo: ${fmt} ${unidadLabel} ✓`
    : `Dibujo: ${fmt} ${unidadLabel} · Δ ${pctDiff.toFixed(1).replace('.', ',')} %`
  return { texto, ok, pctDiff, valorDibujo, unidadLabel }
}

export function fmtCantidadVerificar(reg) {
  const base = fmtCantidadConDimensiones(reg)
  const und = String(reg?.unidad || '').trim()
  if (!und || base === '—') return base
  if (base.includes(und)) return base
  return `${base} ${und}`
}

export function fmtCostoDirectoVerificar(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return '—'
  try {
    return `$ ${Math.round(n).toLocaleString('es-CO')}`
  } catch {
    return `$ ${Math.round(n)}`
  }
}

export function lineaItemVerificar(reg) {
  const code = String(reg?.item_numero || '').trim() || '—'
  const desc = String(reg?.item_descripcion || '').trim()
  if (!desc) return code
  return `${code} · ${desc}`
}

/** Semáforo por niveles activos. */
export function semaforoNivelesRegistro(reg, nivelesActivos = [1, 2, 3], encabezados = {}) {
  return (nivelesActivos || []).map((n) => {
    const estado = reg?.[`nivel${n}_estado`] || 'No Revisado'
    let color = '#94a3b8'
    if (estado === 'Aprobado') color = '#16a34a'
    else if (estado === 'Rechazado' || estado === 'No Objeto de Cobro') color = '#dc2626'
    else if (estado === 'Pendiente') color = '#d97706'
    const usuario = reg?.[`nivel${n}_usuario_nombre`] || reg?.[`nivel${n}_por`] || null
    const fecha = reg?.[`nivel${n}_fecha`] || reg?.[`nivel${n}_at`] || null
    return {
      nivel: n,
      label: `N${n}`,
      estado,
      color,
      encabezado: encabezados[n] || `Nivel ${n}`,
      usuario,
      fecha,
    }
  })
}

export function textoSelladoRegistro(reg, nivelesContrato) {
  if (!reg) return 'Sin información de sellado'
  if (reg.bloqueado) {
    return 'Registro sellado (bloqueado). Solo lectura de dimensiones.'
  }
  const activos = Array.isArray(nivelesContrato?.niveles_activos)
    ? nivelesContrato.niveles_activos
    : [1, 2, 3]
  const maxN = Math.max(...activos.map(Number).filter((n) => n >= 1 && n <= 6), 0)
  if (maxN && (reg[`nivel${maxN}_estado`] || '') === 'Aprobado') {
    return `Sellado por aprobación en N${maxN}.`
  }
  return 'Registro no sellado.'
}

/**
 * Índice del siguiente registro pendiente de validación (ciclo desde `fromIdx+1`).
 * Pendiente = No Revisado o Pendiente en el nivel del usuario, y `puedeValidar(reg)`.
 */
export function indiceSiguientePendiente(regs, fromIdx, { estadoMiNivel, puedeValidar, omitirIds } = {}) {
  const list = Array.isArray(regs) ? regs : []
  if (!list.length) return -1
  const omit = new Set((omitirIds || []).map(String))
  const start = ((Number(fromIdx) || 0) + 1 + list.length) % list.length
  for (let k = 0; k < list.length; k += 1) {
    const i = (start + k) % list.length
    const r = list[i]
    if (r?.id != null && omit.has(String(r.id))) continue
    if (typeof puedeValidar === 'function' && !puedeValidar(r)) continue
    const est = typeof estadoMiNivel === 'function'
      ? estadoMiNivel(r)
      : (r?.nivel1_estado || 'No Revisado')
    if (est === 'No Revisado' || est === 'Pendiente') return i
  }
  // Si no hay más pendientes, avanzar al siguiente registro del reporte.
  if (list.length > 1) return start % list.length
  return -1
}

export function indiceRegistroPorId(regs, registroId) {
  if (registroId == null) return 0
  const i = (regs || []).findIndex((r) => r && String(r.id) === String(registroId))
  return i >= 0 ? i : 0
}
