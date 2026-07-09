import { useLayoutEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache'
import { sanitizePlanoFeatureCollection } from '../../geoPlanoSanitize'
import {
  mapboxPlanoSymbolLayout,
  MAPBOX_PLANO_PAINT_LABELS,
  MAPBOX_ABSCISA_TEXT_FIELD,
  addMapboxAbscisaLabelLayers,
} from '../../mapboxPlanoLabels'
import { crearMapboxMapSeguro } from '../../mapboxSafe'

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
 * Mapa PK en panel/drawer. Sin refresco automático.
 * `selectedPk`: PK activo (sincronizado con chip). Persiste vía estado del padre entre aperturas.
 */
export default function PptoFiltroMapaPk({
  t,
  token,
  contratoId,
  onPkPick,
  pkIdsDeGrilla = null,
  selectedPk = '',
  onClearSelection,
  height = 220,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onPickRef = useRef(onPkPick)
  const onClearRef = useRef(onClearSelection)
  const tokenRef = useRef(token)
  const selectedRef = useRef(selectedPk)
  onPickRef.current = onPkPick
  onClearRef.current = onClearSelection
  tokenRef.current = token
  selectedRef.current = selectedPk

  const NORTH_RIGHT_BEARING = 270
  const filtroKey =
    pkIdsDeGrilla == null
      ? 'all'
      : pkIdsDeGrilla.length === 0
        ? 'empty'
        : [...new Set(pkIdsDeGrilla.map((x) => String(x).trim()).filter(Boolean))].sort().join('\x1e')
  const selKey = String(selectedPk || '').trim().toLowerCase()

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
      d.style.cssText = `padding:12px;font-size:var(--cc-sm);color:${t?.textMuted || '#64748B'};`
      c.appendChild(d)
      return
    }
    const mapEl = document.createElement('div')
    mapEl.style.width = '100%'
    mapEl.style.height = typeof height === 'number' ? `${height}px` : height
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

    const applySelectionStyle = (map) => {
      const sel = String(selectedRef.current || '').trim()
      if (!sel || !map.getLayer('ppto-plano-fill')) return
      try {
        map.setPaintProperty('ppto-plano-fill', 'fill-color', [
          'case',
          ['==', ['downcase', ['coalesce', ['get', 'PK_ID'], ['get', 'pk_id'], ['get', 'Layer'], '']], sel.toLowerCase()],
          '#F59E0B',
          isFiltered ? '#0D9488' : '#0077B6',
        ])
        map.setPaintProperty('ppto-plano-fill', 'fill-opacity', [
          'case',
          ['==', ['downcase', ['coalesce', ['get', 'PK_ID'], ['get', 'pk_id'], ['get', 'Layer'], '']], sel.toLowerCase()],
          0.55,
          isFiltered ? 0.38 : 0.3,
        ])
      } catch {
        /* ignore */
      }
    }

    ;(async () => {
      const [rPk, rCt] = await Promise.all([
        fetch(`${API}/sicoe-obra/${contratoId}/pk-ids`, { headers: hdrs }).then((x) => (x.ok ? x.json() : [])),
        getContratoPlanoGeojson(API_BASE, contratoId, tok).then((d) =>
          d && typeof d === 'object'
            ? { plano_geojson: d.plano_geojson, centro_lat: d.centro_lat, centro_lng: d.centro_lng }
            : null,
        ),
      ])
      if (cancelled) return
      const pkList = Array.isArray(rPk) ? rPk : []
      const contrato = rCt && typeof rCt === 'object' ? rCt : null
      const plano = contrato?.plano_geojson || null
      const center0 =
        contrato?.centro_lat != null && contrato?.centro_lng != null ? [contrato.centro_lng, contrato.centro_lat] : [-74.0817, 4.6097]
      const isDark = typeof t?.bg === 'string' && (t.bg === '#0A1628' || t.bg.toLowerCase() === '#0a1628')
      const { map, error: mapErr } = crearMapboxMapSeguro(mapEl, {
        style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
        center: center0,
        zoom: 12,
        bearing: NORTH_RIGHT_BEARING,
        preserveDrawingBuffer: true,
      })
      if (cancelled) return
      if (mapErr || !map) {
        mapEl.textContent = mapErr || 'Mapa no disponible (WebGL). Puede continuar sin vista de plano.'
        mapEl.style.cssText = `padding:12px;font-size:var(--cc-sm);color:${t?.textMuted || '#64748B'};line-height:1.45;`
        return
      }
      try { map.doubleClickZoom.disable() } catch { /* ignore */ }
      map.getCanvas().style.touchAction = 'manipulation'
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      mapRef.current = map

      let withCoords = 0
      const toFit = []
      const markerEls = []

      const esperarMapaIdle = () =>
        new Promise((resolve) => {
          if (map.loaded()) map.once('idle', resolve)
          else map.once('load', () => map.once('idle', resolve))
        })

      const capturarVistaPlano = async (lngLat) => {
        if (!lngLat) return null
        try {
          map.flyTo({
            center: [lngLat.lng, lngLat.lat],
            zoom: 16,
            duration: 0,
            bearing: NORTH_RIGHT_BEARING,
          })
          await Promise.race([
            esperarMapaIdle(),
            new Promise((r) => setTimeout(r, 2500)),
          ])
          await new Promise((r) => setTimeout(r, 200))
          return map.getCanvas().toDataURL('image/jpeg', 0.88)
        } catch {
          return null
        }
      }

      const togglePk = (pkv, meta = null) => {
        const v = String(pkv || '').trim()
        if (!v) return
        const cur = String(selectedRef.current || '').trim().toLowerCase()
        if (cur === v.toLowerCase()) {
          selectedRef.current = ''
          onClearRef.current?.()
        } else {
          selectedRef.current = v
          onPickRef.current(v, meta)
        }
        applySelectionStyle(map)
        markerEls.forEach(({ el, pk }) => {
          const on = String(pk).trim().toLowerCase() === String(selectedRef.current || '').trim().toLowerCase()
          el.style.background = on ? '#F59E0B' : isFiltered ? '#0D9488' : '#0077B6'
          el.style.transform = on ? 'scale(1.15)' : 'scale(1)'
        })
      }

      map.on('load', () => {
        if (cancelled) return

        let planoData = null
        const planoFc = sanitizePlanoFeatureCollection(
          plano && plano.type === 'FeatureCollection' ? plano : { type: 'FeatureCollection', features: [] },
        )
        const soloPoligonos = (planoFc.features || []).filter(
          (f) => f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon',
        ).map((f) => {
          const pkid = featurePkId(f)
          return pkid
            ? { ...f, properties: { ...f.properties, pk_id: f.properties?.pk_id || pkid } }
            : f
        })
        // Puntos de abscisa (etiqueta K+M): necesarios para capas symbol; no mezclar con fill de PK.
        const puntosAbscisa = (planoFc.features || []).filter((f) => {
          const gt = f?.geometry?.type
          if (gt !== 'Point' && gt !== 'MultiPoint') return false
          return String(f?.properties?.etiqueta ?? f?.properties?.Etiqueta ?? '').trim().length > 0
        })
        if (soloPoligonos.length > 0 || puntosAbscisa.length > 0) {
          let polys = soloPoligonos
          if (isFiltered && soloPoligonos.length > 0) {
            const matched = soloPoligonos.filter((f) => {
              const id = featurePkId(f)
              return id && permitSet.has(id.toLowerCase())
            })
            if (matched.length > 0) polys = matched
          }
          planoData = { type: 'FeatureCollection', features: [...polys, ...puntosAbscisa] }
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
          addMapboxAbscisaLabelLayers(map, {
            idPrefix: 'ppto-labels-abscisa',
            source: 'ppto-plano',
            layout: mapboxPlanoSymbolLayout(MAPBOX_ABSCISA_TEXT_FIELD),
            paint: MAPBOX_PLANO_PAINT_LABELS,
          })
          const manejarTapPlano = (e) => {
            const f = e.features?.[0]
            if (!f) return
            const v = featurePkId(f) || String(f.properties?.Layer ?? f.properties?.PK_ID ?? f.properties?.pk_id ?? '').trim()
            if (!v) return
            const meta = e.lngLat ? { lng: e.lngLat.lng, lat: e.lngLat.lat } : null
            togglePk(v, meta)
            if (meta) {
              capturarVistaPlano(e.lngLat).then((screenshot) => {
                if (screenshot) onPickRef.current?.(v, { ...meta, screenshot, screenshotOnly: true })
              })
            }
          }
          map.on('click', 'ppto-plano-fill', manejarTapPlano)
          map.on('mouseenter', 'ppto-plano-fill', () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'ppto-plano-fill', () => {
            map.getCanvas().style.cursor = ''
          })
          applySelectionStyle(map)
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
          const sel = String(selectedRef.current || '').trim().toLowerCase() === pkv.toLowerCase()
          el.style.cssText = `width:${dot}px;height:${dot}px;border-radius:50%;background:${sel ? '#F59E0B' : col};border:2px solid #fff;box-shadow:0 0 0 1px ${col}66;cursor:pointer;transform:${sel ? 'scale(1.15)' : 'scale(1)'};`
          el.title = pkv
          new mapboxgl.Marker({ element: el }).setLngLat(ll).addTo(map)
          markerEls.push({ el, pk: pkv })
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            togglePk(pkv, { lng: ll[0], lat: ll[1] })
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
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:var(--cc-caption);padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
          hint.textContent = 'Maestro PK sin coordenadas en lat/lng: use el polígono del plano o asigne posiciones en el maestro.'
          mapEl.style.position = 'relative'
          mapEl.appendChild(hint)
        } else if (Array.isArray(permit) && permit.length === 0) {
          const hint = document.createElement('div')
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:var(--cc-caption);padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
          hint.textContent = 'La grilla actual no tiene pk_id: no hay puntos que mostrar.'
          mapEl.style.position = 'relative'
          mapEl.appendChild(hint)
        } else if (permit && permitSet && permitSet.size > 0 && toFit.length === 0) {
          const hint = document.createElement('div')
          hint.style.cssText = `position:absolute;bottom:6px;left:6px;right:6px;font-size:var(--cc-caption);padding:4px 6px;background:#fff9;border-radius:4px;pointer-events:none;color:${t?.textMuted || '#64748B'};`
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
  }, [contratoId, filtroKey, selKey, height])

  return (
    <div style={{ fontSize: 'var(--cc-body)', height: typeof height === 'number' ? `${height}px` : height, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginBottom: 4 }}>Clic = filtrar PK · norte → derecha</div>
      <div ref={containerRef} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${t.border}`, flex: 1, minHeight: 0 }} />
    </div>
  )
}
