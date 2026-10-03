/**
 * Mapa compacto: eje del abscisado + franjas (huellas) de registros.
 * Usado en Ambiente de Auditoría para resaltar hallazgos seleccionados.
 */
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache'
import { addMapboxGeolocateControl } from '../../mapboxSafe'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function colorItem(item) {
  const s = String(item || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 65% 45%)`
}

export default function SicoeMapaHuellas({
  t,
  contratoId,
  token,
  height = 320,
  highlightRegistroIds = [],
  filterItemNumeros = null,
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  const highlightRef = useRef(highlightRegistroIds)
  highlightRef.current = highlightRegistroIds

  useEffect(() => {
    if (!contratoId || !token || !mapRef.current) return undefined
    let cancelled = false
    setListo(false)
    setError('')

    const boot = async () => {
      try {
        const [planoPack, huellasRes] = await Promise.all([
          getContratoPlanoGeojson(API_BASE, contratoId, token),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/huellas?incluir_eje=true`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => (r.ok ? r.json() : EMPTY_FC)).catch(() => EMPTY_FC),
        ])
        if (cancelled) return

        const plano = planoPack?.plano_geojson || EMPTY_FC
        let huellas = {
          type: 'FeatureCollection',
          features: Array.isArray(huellasRes?.features) ? huellasRes.features : [],
        }
        if (Array.isArray(filterItemNumeros) && filterItemNumeros.length) {
          const set = new Set(filterItemNumeros.map(String))
          huellas = {
            ...huellas,
            features: huellas.features.filter((f) => set.has(String(f?.properties?.item_numero || ''))),
          }
        }
        const eje = huellasRes?.eje || EMPTY_FC

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
        addMapboxGeolocateControl(map)

        map.on('load', () => {
          map.addSource('plano-base', { type: 'geojson', data: plano })
          map.addLayer({
            id: 'plano-base-fill',
            type: 'fill',
            source: 'plano-base',
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.12 },
          })
          map.addLayer({
            id: 'plano-base-line',
            type: 'line',
            source: 'plano-base',
            paint: { 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.35 },
          })

          map.addSource('eje-abscisado', { type: 'geojson', data: eje })
          map.addLayer({
            id: 'eje-abscisado-line',
            type: 'line',
            source: 'eje-abscisado',
            paint: {
              'line-color': '#0ea5e9',
              'line-width': 2.5,
              'line-opacity': 0.85,
            },
          })

          const withColors = {
            ...huellas,
            features: (huellas.features || []).map((f) => {
              const precis = String(f?.properties?.precision || '') === 'precisa'
              const rid = String(f?.properties?.registro_id ?? '')
              const hi = (highlightRef.current || []).map(String).includes(rid)
              return {
                ...f,
                properties: {
                  ...f.properties,
                  color: hi ? '#dc2626' : colorItem(f?.properties?.item_numero),
                  opacity: hi ? 0.72 : precis ? 0.45 : 0.28,
                  stroke_w: hi ? 2.5 : precis ? 1.4 : 1,
                  dash: precis ? 0 : 1,
                },
              }
            }),
          }
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

          // Fit to huellas or eje
          const fitSrc = withColors.features.length ? withColors : eje
          try {
            const b = new mapboxgl.LngLatBounds()
            let any = false
            for (const f of fitSrc.features || []) {
              const g = f.geometry
              if (!g) continue
              const push = (c) => {
                if (Array.isArray(c) && typeof c[0] === 'number') {
                  b.extend(c)
                  any = true
                } else if (Array.isArray(c)) c.forEach(push)
              }
              push(g.coordinates)
            }
            if (any) map.fitBounds(b, { padding: 36, maxZoom: 17, bearing: 270 })
          } catch { /* ignore */ }

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

  // Actualizar highlight sin recrear el mapa
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !listo) return
    const src = map.getSource('huellas-franjas')
    if (!src || !src._data) return
    const hi = new Set((highlightRegistroIds || []).map(String))
    const next = {
      ...src._data,
      features: (src._data.features || []).map((f) => {
        const precis = String(f?.properties?.precision || '') === 'precisa'
        const rid = String(f?.properties?.registro_id ?? '')
        const isHi = hi.has(rid)
        return {
          ...f,
          properties: {
            ...f.properties,
            color: isHi ? '#dc2626' : colorItem(f?.properties?.item_numero),
            opacity: isHi ? 0.72 : precis ? 0.45 : 0.28,
            stroke_w: isHi ? 2.5 : precis ? 1.4 : 1,
          },
        }
      }),
    }
    src.setData(next)
  }, [highlightRegistroIds, listo])

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
          Cargando eje y franjas…
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
          fontSize: 'var(--cc-caption)', color: t?.textMuted, display: 'flex', gap: 8,
        }}
      >
        <span style={{ color: '#0ea5e9' }}>━ Eje</span>
        <span>▮ Precisa</span>
        <span style={{ opacity: 0.7 }}>▮ Aprox.</span>
      </div>
    </div>
  )
}
