import { API_BASE } from '../../apiBase'
import {
  sicoeBuildMapaCalorSearchParams,
  sicoeSerializarCapasMapa,
  fmtCostoMapa,
} from './sicoeMapaCalorParams'

export { sicoeBuildMapaCalorSearchParams, sicoeSerializarCapasMapa, fmtCostoMapa }

export async function fetchSicoeMapaCalor(contratoId, token, bundle, { signal } = {}) {
  const params = sicoeBuildMapaCalorSearchParams(bundle)
  const url = `${API_BASE}/sicoe-obra/${contratoId}/analisis?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `HTTP ${res.status}`)
  }
  return res.json()
}
