/**
 * Helpers de subdivisión de PK en subsectores por abscisa (Programación de obra).
 * La herramienta de esquema se usa como componente compartido; aquí solo hay
 * formato, validación y recorte de polígono a partir de abscisas.
 */
import { sicoeAbscisaAMetros } from './modules/sicoe-obra/sicoeLocalizacionHelpers.js'

export const SUBSECTOR_ABS_STEP_M = 10

/** Redondea metros a múltiplo de 10 (sin decimales). */
export function roundAbscisaDecenaM(val) {
  const m = typeof val === 'number' && Number.isFinite(val) ? val : sicoeAbscisaAMetros(val)
  if (m == null || !Number.isFinite(m)) return null
  return Math.round(m / SUBSECTOR_ABS_STEP_M) * SUBSECTOR_ABS_STEP_M
}

/** Formato institucional K3+000. */
export function formatAbscisaLabel(metros, { prefix = 'K' } = {}) {
  const m = roundAbscisaDecenaM(metros)
  if (m == null) return ''
  const mI = Math.max(0, Math.trunc(m))
  const km = Math.floor(mI / 1000)
  const rem = mI % 1000
  return `${prefix}${km}+${String(rem).padStart(3, '0')}`
}

export function parseAbscisaLabel(label) {
  if (label == null || label === '') return null
  if (typeof label === 'number') return roundAbscisaDecenaM(label)
  const s = String(label).trim().toUpperCase().replace(/\s+/g, '').replace(/^K/, '')
  return roundAbscisaDecenaM(s)
}

export function labelRangoSubsector(absIniM, absFinM) {
  const a = formatAbscisaLabel(absIniM)
  const b = formatAbscisaLabel(absFinM)
  if (!a || !b) return ''
  return `${a}–${b}`
}

/** Etiqueta visible: "PK · K3+000–K3+200". */
export function displayLabelSubsector(pkId, absIniM, absFinM) {
  const pk = String(pkId || '').trim()
  const rango = labelRangoSubsector(absIniM, absFinM)
  if (!rango) return pk
  return `${pk} · ${rango}`
}

export function featurePkId(f) {
  const p = f?.properties || {}
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

export function findPkFeature(planoFc, pkId) {
  const want = String(pkId || '').trim()
  if (!want || !planoFc?.features) return null
  return (
    planoFc.features.find((f) => {
      const g = f?.geometry?.type
      if (g !== 'Polygon' && g !== 'MultiPolygon') return false
      return featurePkId(f) === want
    }) || null
  )
}

function ringFromGeom(geom) {
  if (!geom) return null
  if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
    return geom.coordinates[0].map((c) => [Number(c[0]), Number(c[1])])
  }
  if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
    return geom.coordinates[0][0].map((c) => [Number(c[0]), Number(c[1])])
  }
  return null
}

function geomToClipping(geom) {
  if (!geom) return null
  if (geom.type === 'Polygon') return [geom.coordinates]
  if (geom.type === 'MultiPolygon') return geom.coordinates
  return null
}

function clippingToGeom(clipped) {
  if (!clipped?.length) return null
  if (clipped.length === 1) return { type: 'Polygon', coordinates: clipped[0] }
  return { type: 'MultiPolygon', coordinates: clipped }
}

/**
 * Recorta el polígono del PK entre abscisas siguiendo el eje (también en curvas).
 * Franja ancha entre estaciones ∩ polígono PK (polygon-clipping).
 * Async para no forzar deps pesadas en tests de formato.
 */
export async function clipPkPolygonEntreAbscisas(pkGeomOrFeature, planoFc, absIniM, absFinM) {
  const geom = pkGeomOrFeature?.type === 'Feature'
    ? pkGeomOrFeature.geometry
    : pkGeomOrFeature
  const ring = ringFromGeom(geom)
  if (!ring || ring.length < 4) return null

  const a0 = roundAbscisaDecenaM(absIniM)
  const a1 = roundAbscisaDecenaM(absFinM)
  if (a0 == null || a1 == null || a1 <= a0) return null

  const {
    reconstruirEjesDesdePlano,
    proyectarSobreEje,
    construirFranjaPolygon,
  } = await import('./modules/sicoe-obra/sicoeEjeFranjas.js')
  const polygonClipping = (await import('polygon-clipping')).default

  const ejes = reconstruirEjesDesdePlano(planoFc)
  if (!ejes?.length) return null

  let best = ejes[0]
  let bestHits = -1
  for (const e of ejes) {
    let hits = 0
    for (const [lng, lat] of ring.slice(0, -1)) {
      const p = proyectarSobreEje([e], lng, lat, { maxDistM: 200 })
      if (p?.sobre_eje) hits += 1
    }
    if (hits > bestHits) {
      bestHits = hits
      best = e
    }
  }

  let maxDist = 8
  for (const [lng, lat] of ring.slice(0, -1)) {
    const p = proyectarSobreEje([best], lng, lat, { maxDistM: 500 })
    if (p?.dist_m != null) maxDist = Math.max(maxDist, Number(p.dist_m))
  }

  const franja = construirFranjaPolygon({
    eje: best,
    absInicio: a0,
    absFinal: a1,
    ancho: (maxDist + 4) * 2,
    lado: 'central',
    stepM: 5,
  })
  if (!franja) return null

  try {
    const a = geomToClipping(geom)
    const b = geomToClipping(franja)
    if (!a || !b) return franja
    const clipped = polygonClipping.intersection(a, b)
    return clippingToGeom(clipped) || franja
  } catch {
    return franja
  }
}

/** Abscisas desde una polilínea dibujada (2+ puntos) proyectada al eje. */
export async function abscisasDesdeTrazo(pointsLngLat, planoFc) {
  const pts = (pointsLngLat || [])
    .map((p) => ({ lng: Number(p.lng ?? p[0]), lat: Number(p.lat ?? p[1]) }))
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
  if (pts.length < 2) return null
  const { reconstruirEjesDesdePlano, proyectarSobreEje } = await import('./modules/sicoe-obra/sicoeEjeFranjas.js')
  const ejes = reconstruirEjesDesdePlano(planoFc)
  if (!ejes?.length) return null
  const ini = proyectarSobreEje(ejes, pts[0].lng, pts[0].lat, { maxDistM: 250 })
  const fin = proyectarSobreEje(ejes, pts[pts.length - 1].lng, pts[pts.length - 1].lat, { maxDistM: 250 })
  if (!ini?.sobre_eje || !fin?.sobre_eje) return null
  let a0 = roundAbscisaDecenaM(ini.abs_m)
  let a1 = roundAbscisaDecenaM(fin.abs_m)
  if (a0 == null || a1 == null) return null
  if (a0 > a1) [a0, a1] = [a1, a0]
  if (a1 <= a0) a1 = a0 + SUBSECTOR_ABS_STEP_M
  return {
    abs_inicio_m: a0,
    abs_final_m: a1,
    abs_inicio_label: formatAbscisaLabel(a0),
    abs_final_label: formatAbscisaLabel(a1),
  }
}

/** Extrae puntos lng/lat de la escena del esquema (polilínea o nodos). */
export function pointsFromEsquemaScene(objects, map, pan, zoom) {
  const objs = Array.isArray(objects) ? objects : []
  const poly = [...objs].reverse().find((o) => o?.type === 'polilinea' && Array.isArray(o.points) && o.points.length >= 2)
  const worldPts = poly?.points
    || objs.filter((o) => o?.type === 'nodo').map((o) => ({ x: o.x, y: o.y }))
  if (!worldPts?.length || !map || typeof map.unproject !== 'function') return []
  const out = []
  for (const p of worldPts) {
    const x = Number(p.x ?? p[0])
    const y = Number(p.y ?? p[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    try {
      // Si el objeto ya trae lng/lat (huella / sentidoEje), usarlo
      if (Number.isFinite(p.lng) && Number.isFinite(p.lat)) {
        out.push({ lng: p.lng, lat: p.lat })
        continue
      }
      const z = Number(zoom) || 1
      const px = x * z + (pan?.x || 0)
      const py = y * z + (pan?.y || 0)
      const ll = map.unproject([px, py])
      if (ll && Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) {
        out.push({ lng: ll.lng, lat: ll.lat })
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

export function overlapM(a0, a1, b0, b1) {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1))
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1))
  return Math.max(0, hi - lo)
}

export function rangesOverlap(a0, a1, b0, b1, eps = 1e-6) {
  return overlapM(a0, a1, b0, b1) > eps
}

/** Distancia aproximada del anillo (grados→m grosero) — smoke para geojson válido. */
export function ringPerimeterHintM(geom) {
  const ring = ringFromGeom(geom)
  if (!ring || ring.length < 2) return 0
  let s = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const dx = (ring[i + 1][0] - ring[i][0]) * 111320
    const dy = (ring[i + 1][1] - ring[i][1]) * 110540
    s += Math.hypot(dx, dy)
  }
  return s
}
