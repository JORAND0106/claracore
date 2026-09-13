/**
 * MAGNA-SIRGAS / Origen Nacional Bogotá — EPSG:3116 (Transverse Mercator)
 * → WGS84 geográficas (lon, lat).
 *
 * Misma parametrización que el backend (`topo_crs.py`) para Mapbox / PDF.
 */

const A = 6378137.0
const F = 1 / 298.257222101
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)
const K0 = 1.0
const FE = 1000000.0
const FN = 1000000.0
const LON0 = (-74.0775079166667 * Math.PI) / 180
const LAT0 = (4.596200416666666 * Math.PI) / 180

function meridionalArc(phi) {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi))
  )
}

const M0 = meridionalArc(LAT0)

/**
 * @param {number} este  Easting (m) EPSG:3116
 * @param {number} norte Northing (m) EPSG:3116
 * @returns {{ lng: number, lat: number } | null}
 */
export function gkBogotaToWgs84(este, norte) {
  const e = Number(este)
  const n = Number(norte)
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null

  const x = e - FE
  const y = n - FN
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const mu =
    (M0 + y / K0) /
    (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = EP2 * Math.cos(phi1) ** 2
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5
  const D = x / (N1 * K0)

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) /
          720)
  const lon =
    LON0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1)

  return { lng: (lon * 180) / Math.PI, lat: (lat * 180) / Math.PI }
}

/**
 * @param {{ este?: number, norte?: number, lng?: number, lat?: number }[]} puntos
 * @returns {{ lng: number, lat: number }[]}
 */
export function puntosGkALngLat(puntos) {
  const out = []
  for (const p of puntos || []) {
    if (Number.isFinite(p?.lng) && Number.isFinite(p?.lat)) {
      out.push({ lng: p.lng, lat: p.lat })
      continue
    }
    const ll = gkBogotaToWgs84(p?.este, p?.norte)
    if (ll) out.push(ll)
  }
  return out
}
