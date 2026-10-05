/**
 * Mapa del ambiente de Auditoría: plano de obra (fondo tenue) + eje + huellas.
 * Vista inicial siempre centrada en la obra; nunca en la ubicación del dispositivo.
 * filterItemNumeros solo filtra capas de huellas (no remonta el mapa ni el plano).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache'
import { addMapboxGeolocateControl } from '../../mapboxSafe'
import {
  MAPBOX_PLANO_PAINT_LABELS,
  addMapboxAbscisaLabelLayers,
  mapboxPlanoSymbolLayout,
} from '../../mapboxPlanoLabels'
import { colorDibujoPorItems, leyendaColoresItems } from './sicoeItemColores'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

const FILTER_MAPBOX_LABEL_PK = [
  'all',
  ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
  ['>', ['length', ['to-string', ['get', 'pk_id']]], 0],
]

function paintHuellas(features, highlightRegistroIds, highlightPkIds) {
  const hiReg = new Set((highlightRegistroIds || []).map(String))
  const hiPk = new Set((highlightPkIds || []).map(String))
  const hasHi = hiReg.size > 0 || hiPk.size > 0
  const out = []
  for (const f of features || []) {
    const precis = String(f?.properties?.precision || '') === 'precisa'
    const rid = String(f?.properties?.registro_id ?? '')
    const pk = String(f?.properties?.pk_id_id ?? '')
    const hi = hiReg.has(rid) || (pk && hiPk.has(pk))
    let opacity = precis ? 0.45 : 0.28
    let stroke_w = precis ? 1.6 : 1.2
    // Color estándar del ítem (nunca el color libre del usuario al dibujar).
    const color = colorDibujoPorItems(f?.properties?.item_numero)
    if (hasHi) {
      if (hi) {
        opacity = 0.72
        stroke_w = 2.6
      } else {
        opacity = 0.12
        stroke_w = 0.8
      }
    }
    const props = {
      ...f.properties,
      color,
      opacity,
      stroke_w,
      dash: precis ? 0 : 1,
      hi: hi ? 1 : 0,
      is_lod_marker: 0,
    }
    out.push({ ...f, properties: props })
    // LOD: nodos con entidad → marcador de punto cuando el zoom no alcanza a distinguir
    const ht = String(f?.properties?.huella_tipo || f?.properties?.dibujo_tipo || '').toLowerCase()
    if (ht === 'nodo' || ht === 'punto') {
      if (f?.geometry?.type === 'Point') {
        out[out.length - 1] = {
          ...f,
          properties: { ...props, is_lod_marker: 1, radius: hi ? 8 : 6 },
        }
      } else if (f?.geometry?.type === 'Polygon') {
        const c = centroidOfGeom(f.geometry)
        if (c) {
          out.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: c },
            properties: {
              ...props,
              is_lod_marker: 1,
              radius: hi ? 8 : 6,
            },
          })
        }
      }
    }
  }
  return { type: 'FeatureCollection', features: out }
}

function centroidOfGeom(geom) {
  if (!geom) return null
  if (geom.type === 'Point') return geom.coordinates
  const ring = geom.type === 'Polygon'
    ? geom.coordinates?.[0]
    : geom.type === 'MultiPolygon'
      ? geom.coordinates?.[0]?.[0]
      : null
  if (!Array.isArray(ring) || !ring.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) continue
    sx += Number(p[0])
    sy += Number(p[1])
    n += 1
  }
  if (!n) return null
  return [sx / n, sy / n]
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

function filterHuellasByItems(features, filterItemNumeros) {
  if (!Array.isArray(filterItemNumeros) || !filterItemNumeros.length) return features || []
  const set = new Set(filterItemNumeros.map(String))
  return (features || []).filter((f) => set.has(String(f?.properties?.item_numero || '')))
}

/**
 * null/undefined = sin restricción por registro.
 * Array (vacío o no) = mostrar solo esos registro_id (vacío → ninguna huella).
 */
function filterHuellasByRegistroIds(features, filterRegistroIds) {
  if (!Array.isArray(filterRegistroIds)) return null
  const set = new Set(filterRegistroIds.map(String).filter(Boolean))
  if (!set.size) return []
  return (features || []).filter((f) => {
    const rid = f?.properties?.registro_id ?? f?.properties?.id
    return rid != null && set.has(String(rid))
  })
}

function mensajeErrorMapa(err) {
  const raw = String(err?.message || err || '').trim()
  if (/load failed|failed to fetch|networkerror|abort/i.test(raw)) {
    return 'No se pudo cargar el plano de obra. Compruebe la conexión e intente de nuevo.'
  }
  if (!raw || raw.length > 200 || /<!DOCTYPE|<html/i.test(raw)) {
    return 'No se pudo cargar el plano de obra. Intente de nuevo.'
  }
  return raw
}

export default function SicoeMapaHuellas({
  t,
  contratoId,
  token,
  height = 320,
  highlightRegistroIds = [],
  highlightPkIds = [],
  filterItemNumeros = null,
  filterRegistroIds = null,
}) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const allHuellasRef = useRef([])
  const rawHuellasRef = useRef([])
  const rawNodosRef = useRef(EMPTY_FC)
  const planoBoundsRef = useRef(null)
  const filterKeyRef = useRef('')
  const filterRegKeyRef = useRef('')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)
  const [mostrarNodosPk, setMostrarNodosPk] = useState(false)
  const [leyendaItems, setLeyendaItems] = useState([])
  const highlightRef = useRef({ highlightRegistroIds, highlightPkIds })
  highlightRef.current = { highlightRegistroIds, highlightPkIds }

  const filterKey = Array.isArray(filterItemNumeros) && filterItemNumeros.length
    ? [...filterItemNumeros].map(String).sort().join('|')
    : ''
  filterKeyRef.current = filterKey

  // null = sin filtro por registro; string (posiblemente vacía) = restricción activa
  const filterRegKey = Array.isArray(filterRegistroIds)
    ? [...filterRegistroIds].map(String).filter(Boolean).sort().join('|')
    : null
  filterRegKeyRef.current = filterRegKey

  const aplicarFiltroHuellas = useCallback(() => {
    const map = mapInstance.current
    const regKey = filterRegKeyRef.current
    const byReg = filterHuellasByRegistroIds(
      allHuellasRef.current,
      regKey == null ? null : (regKey ? regKey.split('|') : []),
    )
    const items = filterKeyRef.current ? filterKeyRef.current.split('|') : []
    const filtered = byReg != null
      ? byReg
      : filterHuellasByItems(allHuellasRef.current, items)
    rawHuellasRef.current = filtered
    setLeyendaItems(leyendaColoresItems(
      (filtered || []).map((f) => f?.properties?.item_numero),
    ))
    if (!map || !listo) return
    const { highlightRegistroIds: hrs, highlightPkIds: hps } = highlightRef.current
    const srcH = map.getSource('huellas-franjas')
    if (srcH) srcH.setData(paintHuellas(filtered, hrs, hps))
  }, [listo])

  useEffect(() => {
    if (!contratoId || !token || !mapRef.current) return undefined
    let cancelled = false
    setListo(false)
    setError('')

    const boot = async () => {
      try {
        const tokenMb = import.meta.env.VITE_MAPBOX_TOKEN
        if (!tokenMb) {
          throw new Error('Falta la configuración del mapa (Mapbox). Contacte al administrador.')
        }

        const [planoPack, huellasRes] = await Promise.all([
          getContratoPlanoGeojson(API_BASE, contratoId, token).catch((e) => {
            throw new Error(mensajeErrorMapa(e))
          }),
          fetch(`${API_BASE}/sicoe-obra/${contratoId}/huellas?incluir_eje=true&incluir_nodos=true`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => (r.ok ? r.json() : EMPTY_FC))
            .catch(() => EMPTY_FC),
        ])
        if (cancelled) return

        const plano = planoPack?.plano_geojson || EMPTY_FC
        const allHuellas = Array.isArray(huellasRes?.features) ? huellasRes.features : []
        allHuellasRef.current = allHuellas
        const regKey = filterRegKeyRef.current
        const byReg = filterHuellasByRegistroIds(
          allHuellas,
          regKey == null ? null : (regKey ? regKey.split('|') : []),
        )
        const items = filterKeyRef.current ? filterKeyRef.current.split('|') : []
        const huellasFeats = byReg != null
          ? byReg
          : filterHuellasByItems(allHuellas, items)
        rawHuellasRef.current = huellasFeats
        setLeyendaItems(leyendaColoresItems(
          (huellasFeats || []).map((f) => f?.properties?.item_numero),
        ))
        rawNodosRef.current = huellasRes?.nodos || EMPTY_FC
        const eje = huellasRes?.eje || EMPTY_FC
        planoBoundsRef.current = boundsFromFc(plano) || boundsFromFc(eje) || boundsFromFc({
          type: 'FeatureCollection',
          features: allHuellas,
        })
        if (!planoBoundsRef.current) {
          throw new Error(
            'No se pudo abrir el plano de obra: el contrato no tiene GeoJSON de proyecto ni eje cargado.',
          )
        }

        mapboxgl.accessToken = tokenMb
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
        addMapboxGeolocateControl(map, 'top-right', { autoTrigger: false })

        const onLoad = () => {
          if (cancelled) return
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
            filter: [
              'all',
              ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
              ['!=', ['get', 'is_lod_marker'], 1],
              // Entidad de nodo: solo al acercar; de lejos basta el marcador LOD
              ['any',
                ['all',
                  ['!=', ['get', 'huella_tipo'], 'nodo'],
                  ['!=', ['get', 'huella_tipo'], 'punto'],
                ],
                ['>=', ['zoom'], 16],
              ],
            ],
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': ['get', 'opacity'],
            },
          })
          map.addLayer({
            id: 'huellas-line',
            type: 'line',
            source: 'huellas-franjas',
            filter: ['!=', ['get', 'is_lod_marker'], 1],
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
          map.addLayer({
            id: 'huellas-nodo-lod',
            type: 'circle',
            source: 'huellas-franjas',
            filter: ['==', ['get', 'is_lod_marker'], 1],
            maxzoom: 16.5,
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': ['coalesce', ['get', 'radius'], 6],
              'circle-stroke-width': 1.6,
              'circle-stroke-color': '#fff',
              'circle-opacity': 0.95,
            },
          })

          const nodosPainted = paintNodos(rawNodosRef.current, hps)
          map.addSource('huellas-nodos', { type: 'geojson', data: nodosPainted })
          map.addLayer({
            id: 'nodos-poly-fill',
            type: 'fill',
            source: 'huellas-nodos',
            filter: ['==', ['geometry-type'], 'Polygon'],
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
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
            layout: { visibility: 'none' },
            paint: {
              'circle-color': ['get', 'color'],
              'circle-radius': ['get', 'radius'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
              'circle-opacity': 0.95,
            },
          })

          fitObra(map, planoBoundsRef.current, { padding: 40, maxZoom: 16, duration: 0 })
          setListo(true)
        }

        if (map.loaded()) onLoad()
        else map.once('load', onLoad)

        map.once('error', (ev) => {
          if (cancelled) return
          setError(mensajeErrorMapa(ev?.error || 'Error del mapa'))
        })
      } catch (e) {
        if (!cancelled) setError(mensajeErrorMapa(e))
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
    // filterItemNumeros NO remonta: se aplica en efecto aparte
  }, [contratoId, token, t?.bg, reloadNonce])

  // Filtrar huellas por registro/ítem sin destruir el mapa / plano de fondo
  useEffect(() => {
    aplicarFiltroHuellas()
  }, [filterKey, filterRegKey, aplicarFiltroHuellas])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !listo) return
    const vis = mostrarNodosPk ? 'visible' : 'none'
    for (const id of ['nodos-poly-fill', 'nodos-poly-line', 'nodos-point']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [mostrarNodosPk, listo])

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
      fitObra(map, planoBoundsRef.current, { padding: 40, maxZoom: 16, duration: 450 })
    }
  }, [highlightRegistroIds, highlightPkIds, listo])

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 8, overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <label
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: `${t.bgCard || '#fff'}EE`,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '4px 8px',
          fontSize: 'var(--cc-caption)',
          color: t.text,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={mostrarNodosPk}
          onChange={(e) => setMostrarNodosPk(e.target.checked)}
        />
        Nodos PK
      </label>
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: '#dc2626', fontSize: 'var(--cc-sm)', padding: 12, textAlign: 'center',
          }}
        >
          <div>{error}</div>
          <button
            type="button"
            onClick={() => {
              setError('')
              setListo(false)
              setReloadNonce((n) => n + 1)
            }}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 12px',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 'var(--cc-caption)',
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      <div
        style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          background: `${t?.bgCard || '#fff'}EE`, borderRadius: 8, padding: '6px 8px',
          fontSize: 'var(--cc-caption)', color: t?.textMuted,
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: '42%', overflowY: 'auto',
          border: `1px solid ${t?.border || 'transparent'}`,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b' }}>▦ Proyecto</span>
          <span style={{ color: '#0ea5e9' }}>━ Eje</span>
        </div>
        {leyendaItems.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: t?.textMuted }}>Ítems:</span>
            {leyendaItems.map((it) => (
              <span
                key={it.item_numero}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: t?.text }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: it.color,
                    flexShrink: 0,
                  }}
                />
                {it.item_numero}
              </span>
            ))}
          </div>
        ) : (
          <span>Seleccione un hallazgo para ver sus dibujos.</span>
        )}
      </div>
    </div>
  )
}
