/**
 * Mapa del ambiente de Auditoría: plano de obra (fondo tenue) + eje + huellas.
 * Vista inicial siempre centrada en la obra; nunca en la ubicación del dispositivo.
 */
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache'
import { addMapboxGeolocateControl } from '../../mapboxSafe'
import {
  MAPBOX_PLANO_PAINT_LABELS,
  addMapboxAbscisaLabelLayers,
  mapboxPlanoSymbolLayout,
} from '../../mapboxPlanoLabels'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

const FILTER_MAPBOX_LABEL_PK = [
  'all',
  ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
  ['>', ['length', ['to-string', ['get', 'pk_id']]], 0],
]

function colorItem(item) {
  const s = String(item || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 65% 45%)`
}

function paintHuellas(features, highlightRegistroIds, highlightPkIds) {
  const hiReg = new Set((highlightRegistroIds || []).map(String))
  const hiPk = new Set((highlightPkIds || []).map(String))
  const hasHi = hiReg.size > 0 || hiPk.size > 0
  return {
    type: 'FeatureCollection',
    features: (features || []).map((f) => {
      const precis = String(f?.properties?.precision || '') === 'precisa'
      const rid = String(f?.properties?.registro_id ?? '')
      const pk = String(f?.properties?.pk_id_id ?? '')
      const hi = hiReg.has(rid) || (pk && hiPk.has(pk))
      // Sin selección: contraste medio. Con selección: resaltados fuertes, resto apagado.
      let opacity = precis ? 0.4 : 0.22
      let stroke_w = precis ? 1.4 : 1
      let color = colorItem(f?.properties?.item_numero)
      if (hasHi) {
        if (hi) {
          opacity = 0.78
          stroke_w = 2.8
          color = '#dc2626'
        } else {
          opacity = 0.12
          stroke_w = 0.8
        }
      }
      return {
        ...f,
        properties: {
          ...f.properties,
          color,
          opacity,
          stroke_w,
          dash: precis ? 0 : 1,
          hi: hi ? 1 : 0,
        },
      }
    }),
  }
}

function paintNodos(nodosFc, highlightPkIds) {
  const hiPk = new Set((highlightPkIds || []).map(String))
  const hasHi = hiPk.size > 0
  return {
    type: 'FeatureCollection',
    features: (nodosFc?.features || []).map((f) => {
      const pk = String(f?.properties?.pk_id_id ?? '')
      const hi = pk && hiPk.has(pk)
      return {
        ...f,
        properties: {
          ...f.properties,
          color: hi ? '#dc2626' : '#7c3aed',
          opacity: hasHi ? (hi ? 0.8 : 0.15) : (hi ? 0.75 : 0.35),
          stroke_w: hi ? 2.5 : 1.5,
          radius: hi ? 8 : 5,
          hi: hi ? 1 : 0,
        },
      }
    }),
  }
}

function forEachLngLat(node, fn) {
  if (!Array.isArray(node)) return
  if (typeof node[0] === 'number' && typeof node[1] === 'number') {
    fn(node[0], node[1])
    return
  }
  for (let i = 0; i < node.length; i += 1) forEachLngLat(node[i], fn)
}

function boundsFromFc(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || !feats.length) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let n = 0
  for (const f of feats) {
    const g = f?.geometry
    if (!g?.coordinates) continue
    forEachLngLat(g.coordinates, (lng, lat) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      n += 1
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    })
  }
  if (!n) return null
  return { minLng, maxLng, minLat, maxLat }
}

function fitObra(map, bounds, { padding = 40, maxZoom = 16, duration = 0 } = {}) {
  if (!map || !bounds) return false
  let { minLng, maxLng, minLat, maxLat } = bounds
  if (minLng === maxLng) { minLng -= 1e-4; maxLng += 1e-4 }
  if (minLat === maxLat) { minLat -= 1e-4; maxLat += 1e-4 }
  try {
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding,
      bearing: 270,
      pitch: 0,
      maxZoom,
      duration,
    })
    return true
  } catch {
    return false
  }
}

function boundsOfHighlights(huellasFeats, nodosFc, highlightRegistroIds, highlightPkIds) {
  const hiReg = new Set((highlightRegistroIds || []).map(String))
  const hiPk = new Set((highlightPkIds || []).map(String))
  if (!hiReg.size && !hiPk.size) return null
  const feats = []
  for (const f of huellasFeats || []) {
    const rid = String(f?.properties?.registro_id ?? '')
    const pk = String(f?.properties?.pk_id_id ?? '')
    if (hiReg.has(rid) || (pk && hiPk.has(pk))) feats.push(f)
  }
  for (const f of nodosFc?.features || []) {
    const pk = String(f?.properties?.pk_id_id ?? '')
    if (pk && hiPk.has(pk)) feats.push(f)
  }
  return boundsFromFc({ type: 'FeatureCollection', features: feats })
}

export default function SicoeMapaHuellas({
  t,
  contratoId,
  token,
  height = 320,
  highlightRegistroIds = [],
  highlightPkIds = [],
  filterItemNumeros = null,
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const rawHuellasRef = useRef([])
  const rawNodosRef = useRef(EMPTY_FC)
  const planoBoundsRef = useRef(null)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  const highlightRef = useRef({ highlightRegistroIds, highlightPkIds })
  highlightRef.current = { highlightRegistroIds, highlightPkIds }

  useEffect(() => {
    if (!contratoId || !token || !mapRef.current) return undefined
    let cancelled = false
    setListo(false)
    setError('')

    const boot = async () => {
      try {
        const [planoPack, huellasRes] = await Promise.all([
          getContratoPlanoGeojson(API_BASE, contratoId, token),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/huellas?incluir_eje=true&incluir_nodos=true`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => (r.ok ? r.json() : EMPTY_FC)).catch(() => EMPTY_FC),
        ])
        if (cancelled) return

        const plano = planoPack?.plano_geojson || EMPTY_FC
        let huellasFeats = Array.isArray(huellasRes?.features) ? huellasRes.features : []
        // filterItemNumeros solo afecta capas de hallazgos/huellas, NUNCA el plano de fondo
        if (Array.isArray(filterItemNumeros) && filterItemNumeros.length) {
          const set = new Set(filterItemNumeros.map(String))
          huellasFeats = huellasFeats.filter((f) => set.has(String(f?.properties?.item_numero || '')))
        }
        rawHuellasRef.current = huellasFeats
        rawNodosRef.current = huellasRes?.nodos || EMPTY_FC
        const eje = huellasRes?.eje || EMPTY_FC
        planoBoundsRef.current = boundsFromFc(plano) || boundsFromFc(eje)

        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
        if (mapInstance.current) {
          try { mapInstance.current.remove() } catch { /* ignore */ }
          mapInstance.current = null
        }
        const map = new mapboxgl.Map({
          container: mapRef.current,
          style: t?.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
          center: [-74.05, 4.72],
          zoom: 11,
          bearing: 270,
        })
        mapInstance.current = map
        map.addControl(new mapboxgl.NavigationControl(), 'top-right')
        // No auto-centrar en GPS: la vista inicial debe ser la obra.
        addMapboxGeolocateControl(map, 'top-right', { autoTrigger: false })

        map.on('load', () => {
          // Capa de fondo: proyecto (PK-ID + abscisado), siempre tenue y visible
          map.addSource('plano-base', { type: 'geojson', data: plano })
          map.addLayer({
            id: 'plano-base-fill',
            type: 'fill',
            source: 'plano-base',
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.14 },
          })
          map.addLayer({
            id: 'plano-base-line',
            type: 'line',
            source: 'plano-base',
            paint: { 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.4 },
          })
          map.addLayer({
            id: 'plano-base-labels-pk',
            type: 'symbol',
            source: 'plano-base',
            filter: FILTER_MAPBOX_LABEL_PK,
            layout: mapboxPlanoSymbolLayout(['get', 'pk_id'], true),
            paint: {
              ...MAPBOX_PLANO_PAINT_LABELS,
              'text-color': '#64748b',
              'text-halo-color': '#ffffff',
              'text-opacity': 0.7,
            },
          })
          try {
            addMapboxAbscisaLabelLayers(map, {
              idPrefix: 'plano-base-labels-abscisa',
              source: 'plano-base',
              layout: mapboxPlanoSymbolLayout(
                ['coalesce', ['get', 'etiqueta'], ['get', 'Etiqueta'], ''],
                true,
              ),
              paint: {
                ...MAPBOX_PLANO_PAINT_LABELS,
                'text-color': '#64748b',
                'text-opacity': 0.65,
              },
            })
          } catch { /* ignore */ }

          map.addSource('eje-abscisado', { type: 'geojson', data: eje })
          map.addLayer({
            id: 'eje-abscisado-line',
            type: 'line',
            source: 'eje-abscisado',
            paint: {
              'line-color': '#0ea5e9',
              'line-width': 2,
              'line-opacity': 0.55,
            },
          })

          const { highlightRegistroIds: hrs, highlightPkIds: hps } = highlightRef.current
          const withColors = paintHuellas(huellasFeats, hrs, hps)
          map.addSource('huellas-franjas', { type: 'geojson', data: withColors })
          map.addLayer({
            id: 'huellas-fill',
            type: 'fill',
            source: 'huellas-franjas',
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': ['get', 'opacity'],
            },
          })
          map.addLayer({
            id: 'huellas-line',
            type: 'line',
            source: 'huellas-franjas',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['get', 'stroke_w'],
              'line-opacity': 0.95,
              'line-dasharray': [
                'case',
                ['==', ['get', 'dash'], 1],
                ['literal', [1.5, 1.5]],
                ['literal', [1, 0]],
              ],
            },
          })

          const nodosPainted = paintNodos(rawNodosRef.current, hps)
          map.addSource('huellas-nodos', { type: 'geojson', data: nodosPainted })
          map.addLayer({
            id: 'nodos-poly-fill',
            type: 'fill',
            source: 'huellas-nodos',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': ['get', 'opacity'],
            },
          })
          map.addLayer({
            id: 'nodos-poly-line',
            type: 'line',
            source: 'huellas-nodos',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['get', 'stroke_w'],
            },
          })
          map.addLayer({
            id: 'nodos-point',
            type: 'circle',
            source: 'huellas-nodos',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': ['get', 'radius'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
              'circle-opacity': 0.95,
            },
          })

          // Vista inicial: siempre la obra completa (plano), nunca GPS ni solo hallazgos.
          fitObra(map, planoBoundsRef.current, { padding: 40, maxZoom: 16, duration: 0 })

          setListo(true)
        })
      } catch (e) {
        if (!cancelled) setError(e?.message || 'No se pudo cargar el mapa de huellas')
      }
    }
    void boot()
    return () => {
      cancelled = true
      if (mapInstance.current) {
        try { mapInstance.current.remove() } catch { /* ignore */ }
        mapInstance.current = null
      }
    }
  }, [contratoId, token, t?.bg, filterItemNumeros])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !listo) return
    const srcH = map.getSource('huellas-franjas')
    if (srcH) srcH.setData(paintHuellas(rawHuellasRef.current, highlightRegistroIds, highlightPkIds))
    const srcN = map.getSource('huellas-nodos')
    if (srcN) srcN.setData(paintNodos(rawNodosRef.current, highlightPkIds))

    const hasHi = (highlightRegistroIds || []).length > 0 || (highlightPkIds || []).length > 0
    if (hasHi) {
      const b = boundsOfHighlights(
        rawHuellasRef.current,
        rawNodosRef.current,
        highlightRegistroIds,
        highlightPkIds,
      )
      if (b) fitObra(map, b, { padding: 48, maxZoom: 17, duration: 450 })
    } else {
      // Quitar selección / limpiar filtros → vista completa de la obra
      fitObra(map, planoBoundsRef.current, { padding: 40, maxZoom: 16, duration: 450 })
    }
  }, [highlightRegistroIds, highlightPkIds, listo])

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 8, overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {!listo && !error && (
        <div
          style={{
            position: 'absolute', inset: 0, background: t?.bg || '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t?.textMuted, fontSize: 'var(--cc-sm)',
          }}
        >
          Cargando plano de obra…
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute', inset: 0, background: t?.bgCard || '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#dc2626', fontSize: 'var(--cc-sm)', padding: 12, textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          position: 'absolute', bottom: 8, left: 8,
          background: `${t?.bgCard || '#fff'}DD`, borderRadius: 6, padding: '4px 8px',
          fontSize: 'var(--cc-caption)', color: t?.textMuted, display: 'flex', gap: 8, flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#64748b' }}>▦ Proyecto</span>
        <span style={{ color: '#0ea5e9' }}>━ Eje</span>
        <span>▮ Huella</span>
        <span style={{ color: '#7c3aed' }}>● Nodo</span>
      </div>
    </div>
  )
}
