/**
 * API cliente: levantamiento topográfico sobre plano semáforo.
 */
import { API_BASE } from '../../apiBase'
import { parseCoordFile } from '../../components/esquema/esquemaCoords'
import { gkBogotaToWgs84 } from '../../utils/epsg3116'

function authHeaders(token) {
  const t = token
    || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token'))
    || ''
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export function puntosTopoAGeojson(puntos, reporteId = null) {
  const features = []
  for (const p of puntos || []) {
    let lng = p?.lng
    let lat = p?.lat
    if (!(Number.isFinite(Number(lng)) && Number.isFinite(Number(lat)))) {
      const ll = gkBogotaToWgs84(p?.este, p?.norte)
      if (!ll) continue
      lng = ll.lng
      lat = ll.lat
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
      properties: {
        id: p.id,
        punto: p.punto || '',
        label: String(p.punto || p.id || ''),
        norte: p.norte,
        este: p.este,
        cota: p.cota,
        descripcion: p.descripcion || '',
        origen: p.origen || 'manual',
        reporte_id: reporteId ?? p.reporte_id ?? null,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** Parsea CSV/XLSX del esquema y mapea a filas so_puntos_topograficos. */
export async function parseLevantamientoFile(file) {
  const rows = await parseCoordFile(file)
  return (rows || []).map((r) => ({
    punto: r.num || '',
    norte: r.norte,
    este: r.este,
    cota: r.cota,
    descripcion: r.desc || '',
  }))
}

export async function fetchLevantamientoMapa(contratoId, token, { reporteId } = {}) {
  const qs = reporteId != null ? `?reporte_id=${encodeURIComponent(reporteId)}` : ''
  const r = await fetch(`${API_BASE}/sicoe-obra/${contratoId}/levantamiento-mapa${qs}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) {
    const msg = await r.text().catch(() => '')
    throw new Error(msg || `Error levantamiento (${r.status})`)
  }
  return r.json()
}

export async function fetchPuntosReporteGeojson(contratoId, reporteId, token) {
  const r = await fetch(
    `${API_BASE}/sicoe-obra/${contratoId}/reportes/${reporteId}/puntos-topograficos?as_geojson=1`,
    { headers: authHeaders(token) },
  )
  if (!r.ok) throw new Error(`Error puntos reporte (${r.status})`)
  return r.json()
}

export async function cargarLevantamientoReporte({
  contratoId,
  reporteId,
  token,
  puntos,
  csvText,
  reemplazar = true,
  validarUbicacion = true,
}) {
  const r = await fetch(
    `${API_BASE}/sicoe-obra/${contratoId}/reportes/${reporteId}/levantamiento`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        puntos: puntos || null,
        csv_text: csvText || null,
        reemplazar,
        validar_ubicacion: validarUbicacion,
      }),
    },
  )
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const d = data?.detail
    const msg = typeof d === 'string'
      ? d
      : (d?.mensaje || data?.mensaje || `Error carga levantamiento (${r.status})`)
    const err = new Error(msg)
    err.detail = d
    err.status = r.status
    throw err
  }
  return data
}

export async function aplicarHuellaPrecisa({
  contratoId,
  registroId,
  token,
  geometriaTipo,
  vertices,
  coordsGeojson,
  lineStyle,
}) {
  const r = await fetch(
    `${API_BASE}/sicoe-obra/${contratoId}/registros/${registroId}/huella-precisa`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometria_tipo: geometriaTipo || null,
        vertices: vertices || null,
        coords_geojson: coordsGeojson || null,
        line_style: lineStyle || null,
      }),
    },
  )
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const d = data?.detail
    throw new Error(typeof d === 'string' ? d : (d?.mensaje || `Error huella precisa (${r.status})`))
  }
  return data
}

export async function fetchHuellasIndicadores(contratoId, token) {
  const r = await fetch(`${API_BASE}/sicoe-obra/${contratoId}/huellas/indicadores`, {
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error(`Error indicadores (${r.status})`)
  return r.json()
}

export async function fetchRegistrosDeReporte(contratoId, reporteId, token) {
  const r = await fetch(
    `${API_BASE}/sicoe-obra/${contratoId}/reportes/${reporteId}?ligero=1`,
    { headers: authHeaders(token) },
  )
  if (!r.ok) throw new Error(`Error reporte (${r.status})`)
  const data = await r.json()
  return {
    reporte: data,
    registros: Array.isArray(data?.registros) ? data.registros : [],
  }
}

/** Dasharray Mapbox equivalente a estilos de esquema. */
export function mapboxDashForLineStyle(style) {
  const s = String(style || 'continua')
  if (s === 'punteada') return [2, 2]
  if (s === 'punto_linea') return [6, 2, 1, 2]
  if (s === 'punto_punto_linea') return [6, 2, 1, 2, 1, 2]
  if (s === 'doble_seg') return [4, 3]
  return undefined
}
