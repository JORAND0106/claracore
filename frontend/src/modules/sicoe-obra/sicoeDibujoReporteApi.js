/**
 * API dibujo por reporte (huella compartida).
 */
export function reporteTieneDibujo(reporte) {
  const g = reporte?.dibujo_geojson
  if (!g) return false
  if (typeof g === 'object') {
    if (g.type === 'FeatureCollection') return Array.isArray(g.features) && g.features.length > 0
    if (g.type === 'Feature' || g.type === 'Polygon' || g.type === 'MultiPolygon') return true
  }
  return false
}

export async function guardarDibujoReporte({
  API_URL,
  contratoId,
  token,
  reporteId,
  dibujoGeojson,
  dibujoEscena,
  origenLngLat = null,
}) {
  const res = await fetch(
    `${API_URL}/sicoe-obra/${contratoId}/reportes/${reporteId}/dibujo`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dibujo_geojson: dibujoGeojson,
        dibujo_escena: dibujoEscena,
        origen_lnglat: origenLngLat,
      }),
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    let detail = txt
    try {
      const j = JSON.parse(txt)
      detail = j?.detail || txt
    } catch { /* ignore */ }
    throw new Error(detail || `Error ${res.status}`)
  }
  return res.json()
}

export async function borrarDibujoReporte({ API_URL, contratoId, token, reporteId }) {
  const res = await fetch(
    `${API_URL}/sicoe-obra/${contratoId}/reportes/${reporteId}/dibujo`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Error ${res.status}`)
  }
  return res.json()
}
