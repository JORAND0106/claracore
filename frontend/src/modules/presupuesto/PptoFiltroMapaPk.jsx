import { useLayoutEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { API_BASE } from '../../apiBase'

/** [lng, lat] WGS84 si el maestro trae coordenadas; si no, null. */
function pickLngLat(row) {
  if (!row || typeof row !== 'object') return null
  const la = row.lat ?? row.latitud ?? row.latitude ?? row.Lat
  const ln = row.lng ?? row.lon ?? row.longitud ?? row.longitude ?? row.Lng ?? row.lngd
  if (la == null || ln == null) return null
  const laN = parseFloat(la)
  const lnN = parseFloat(ln)
  if (Number.isNaN(laN) || Number.isNaN(lnN)) return null
  if (laN < -90 || laN > 90 || lnN < -180 || lnN > 180) return null
  return [lnN, laN]
}

/** Identificador PK en propiedades de GeoJSON (misma semántica que en click del plano). */
function featurePkId(f) {
  const p = f?.properties
  if (!p) return ''
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

function ringCoordsFromGeometry(g) {
  if (!g) return []
  if (g.type === 'Polygon') return g.coordinates[0] || []
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2)
  return []
}

/** [[minLng, minLat], [maxLng, maxLat]] o null. */
function boundsFromFC(fc) {
  const coords = (fc?.features || []).flatMap((f) => ringCoordsFromGeometry(f.geometry))
  if (coords.length < 1) return null
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

/**
 * `pkIdsDeGrilla`: null = mostrar todo el maestro con coordenadas; `[]` o lista = solo esos PK (armoniza con la grilla al elegir cap/ítem).
 * Vista con norte a la derecha. bearing 90° dejó el norte del pliego a la izquierda; +180° → 270°.
 */
export default function PptoFiltroMapaPk({ t, token, contratoId, onPkPick, pkIdsDeGrilla = null }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onPickRef = useRef(onPkPick)
  const tokenRef = useRef(token)
  onPickRef.current = onPkPick
  tokenRef.current = token

  const NORTH_RIGHT_BEARING = 270
  const filtroKey =
    pkIdsDeGrilla == null
      ? 'all'
      : pkIdsDeGrilla.length === 0
        ? 'empty'
        : [...new Set(pkIdsDeGrilla.map((x) => String(x).trim()).filter(Boolean))].sort().join('\x1e')

  useLayoutEffect(() => {
    if (!contratoId || !containerRef.current) return
    const c = containerRef.current
    const API = API_BASE
    const mbt = import.meta.env.VITE_MAPBOX_TOKEN
    let cancelled = false

    c.innerHTML = ''
    if (!mbt) {
      const d = document.createElement('div')
      d.textContent = 'Falta VITE_MAPBOX_TOKEN para el plano de PK.'
      d.style.cssText = `padding:12px;font-size:12px;color:${t?.textMuted || '#64748B'};`
      c.appendChild(d)
      return
    }
    const mapEl = document.createElement('div')
    mapEl.style.width = '100%'
    mapEl.style.height = '220px'
    c.appendChild(mapEl)

    const tok = tokenRef.current || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token')) || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cc_token'))
    const hdrs = { Authorization: `Bearer ${tok}` }

    const permit = pkIdsDeGrilla
    const permitSet =
      permit == null
        ? null
        : new Set(permit.map((x) => String(x).trim().toLowerCase()).filter(Boolean))

    const pkAllowed = (pkv) => {
      if (permit == null) return true
      if (permitSet.size === 0) return false
      return permitSet.has(String(pkv).trim().toLowerCase())
    }

    const isFiltered = permit != null && permitSet && permitSet.size > 0
    ;(async () => {
      const [rPk, rCt] = await Promise.all([
        fetch(`${API}/sicoe-obra/${contratoId}/pk-ids`, { headers: hdrs }).then((x) => (x.ok ? x.json() : [])),
        fetch(`${API}/contratos/${contratoId}`, { headers: hdrs }).then((x) => (x.ok ? x.json() : null)),
      ])
      if (cancelled) return
      const pkList = Array.isArray(rPk) ? rPk : []
      const contrato = rCt && typeof rCt === 'object' ? rCt : null
      const plano = contrato?.plano_geojson || null
      const center0 =
        contrato?.centro_lat != null && contrato?.centro_lng != null ? [contrato.centro_lng, contrato.centro_lat] : [-74.0817, 4.6097]
      const isDark = typeof t?.bg === 'string' && (t.bg === '#0A1628' || t.bg.toLowerCase() === '#0a1628')
      mapboxgl.accessToken = mbt
      const map = new mapboxgl.Map({
        container: mapEl,
        style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
        center: center0,
        zoom: 12,
        bearing: NORTH_RIGHT_BEARING,
      })
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      mapRef.current = map

      let withCoords = 0
      const toFit = []

      map.on('load', () => {
        if (cancelled) return

        // Con grilla filtrada por cap/ítem: polígono = solo features cuyo PK_ID está en la grilla (no el corredor completo).
        let planoData = null
        if (plano && plano.type === 'FeatureCollection' && Array.isArray(plano.features) && plano.features.length > 0) {
          if (isFiltered) {
            const matched = plano.features.filter((f) => {
              const id = featurePkId(f)
              return id && permitSet.has(id.toLowerCase())
            })
            if (matched.length > 0) {
              planoData = { type: 'FeatureCollection', features: matched }
            }
          } else {
            planoData = plano
          }
        }

        if (planoData) {
          map.addSource('ppto-plano', { type: 'geojson', data: planoData })
          map.addLayer({
            id: 'ppto-plano-fill',
            type: 'fill',
            source: 'ppto-plano',
            paint: {
              'fill-color': isFiltered ? '#0D9488' : '#0077B6',
              'fill-opacity': isFiltered ? 0.38 : 0.3,
            },
          })
          map.addLayer({
            id: 'ppto-plano-line',
            type: 'line',
            source: 'ppto-plano',
            paint: { 'line-color': isFiltered ? '#0F766E' : '#00A896', 'line-width': isFiltered ? 2 : 1 },
          })
          map.on('click', 'ppto-plano-fill', (e) => {
            const f = e.features?.[0]
            if (!f) return
            const v = featurePkId(f) || String(f.properties?.Layer ?? f.properties?.PK_ID ?? f.properties?.pk_id ?? '').trim()
            if (v) onPickRef.current(v)
          })
          map.on('mouseenter', 'ppto-plano-fill', () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'ppto-plano-fill', () => {
            map.getCanvas().style.cursor = ''
          })
        }

        const dot = isFiltered ? 14 : 12
        const col = isFiltered ? '#0D9488' : '#0077B6'
        pkList.forEach((row) => {
          const pkv = String(row?.pk_id ?? row?.civ ?? '').trim()
          if (!pkv || !pkAllowed(pkv)) return
          const ll = pickLngLat(row)
          if (!ll) return
          withCoords += 1
          toFit.push(ll)
          const el = document.createElement('div')
          el.style.cssText = `width:${dot}px;height:${dot}px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 0 0 1px ${col}66;cursor:pointer;`
          el.title = pkv
          new mapboxgl.Marker({ element: el }).setLngLat(ll).addTo(map)
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            onPickRef.current(pkv)
          })
        })
        try {
          const bPlano = planoData ? boundsFromFC(planoData) : null
          const bProyecto = !isFiltered && plano && plano.type === 'FeatureCollection' ? boundsFromFC(plano) : null

          if (isFiltered) {
            if (toFit.length === 1) {
              map.flyTo({ center: toFit[0], zoom: 15, bearing: NORTH_RIGHT_BEARING, pitch: 0 })
            } else if (toFit.length > 1) {
              const lngs = toFit.map((c) => c[0])
              const lats = toFit.map((c) => c[1])
              map.fitBounds(
                [
                  [Math.min(...lngs), Math.min(...lats)],
                  [Math.max(...lngs), Math.max(...lats)],
                ],
                { padding: 50, maxZoom: 17, bearing: NORTH_RIGHT_BEARING, pitch: 0 }
              )
            } else if (bPlano) {
              map.fitBounds(bPlano, { padding: 40, maxZoom: 16, bearing: NORTH_RIGHT_BEARING, pitch: 0 })
            }
          } else if (bProyecto) {
            map.fitBounds(bProyecto, { padding: 32, maxZoom: 16, bearing: NORTH_RIGHT_BEARING, pitch: 0 })
          } else if (toFit.length === 1) {
            map.flyTo({ center: toFit[0], zoom: 14, bearing: NORTH_RIGHT_BEARING, pitch: 0 })
          } else if (toFit.length > 1) {
            const lngs = toFit.map((c) => c[0])
            const lats = toFit.map((c) => c[1])
            map.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: 40, maxZoom: 16, bearing: NORTH_RIGHT_BEARING, pitch: 0 }
            )
          }
        } catch {
          /* ignore */
        }
        if (pkList.length > 0 && withCoords === 0 && !plano?.features?.length) {
          const hint = document.createElement('div')
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:10px;padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
          hint.textContent = 'Maestro PK sin coordenadas en lat/lng: use el polígono del plano o asigne posiciones en el maestro.'
          mapEl.style.position = 'relative'
          mapEl.appendChild(hint)
        } else if (Array.isArray(permit) && permit.length === 0) {
          const hint = document.createElement('div')
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:10px;padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
          hint.textContent = 'La grilla actual no tiene pk_id: no hay puntos que mostrar.'
          mapEl.style.position = 'relative'
          mapEl.appendChild(hint)
        } else if (permit && permitSet && permitSet.size > 0 && toFit.length === 0) {
          const hint = document.createElement('div')
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:10px;padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
          hint.textContent = 'Ninguno de los PK de la grilla tiene posición en el maestro. Use el polígono o complete lat/lng en PK.'
          mapEl.style.position = 'relative'
          mapEl.appendChild(hint)
        }
      })
    })()

    return () => {
      cancelled = true
      try {
        mapRef.current?.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
    }
  }, [contratoId, filtroKey])

  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>PLANO · PK (clic = filtrar · norte → derecha)</div>
      <div ref={containerRef} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${t.border}` }} />
    </div>
  )
}
