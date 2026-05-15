/**
 * Programación de obra — mapa (Mapbox) + panel lateral 420px.
 * Colores según prog_pk_estado de la versión vigente sellada; borrador en meta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { API_BASE } from './apiBase'
import { sanitizePlanoFeatureCollection } from './geoPlanoSanitize'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
/** Plano físico del contrato: norte a la izquierda; el usuario puede rotar después. */
const MAP_INITIAL_BEARING = 270
const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12'
const MAPBOX_STYLE_OUTDOORS = 'mapbox://styles/mapbox/outdoors-v12'
/** Alineado con backend presupuesto / prog_obra (polígonos). */
const PRESUPUESTO_TIPO_POLIGONO = 'Presupuesto de Obra'

function extendLngLatBox(box, lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return box
  if (!box) return { minLng: lng, maxLng: lng, minLat: lat, maxLat: lat }
  return {
    minLng: Math.min(box.minLng, lng),
    maxLng: Math.max(box.maxLng, lng),
    minLat: Math.min(box.minLat, lat),
    maxLat: Math.max(box.maxLat, lat),
  }
}

function extendBoxFromRing(box, ring) {
  if (!Array.isArray(ring)) return box
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    box = extendLngLatBox(box, Number(pt[0]), Number(pt[1]))
  }
  return box
}

function boundsFromGeometry(geom, box) {
  if (!geom?.type) return box
  const c = geom.coordinates
  switch (geom.type) {
    case 'Point':
      return extendLngLatBox(box, Number(c[0]), Number(c[1]))
    case 'MultiPoint':
      for (const p of c || []) box = extendLngLatBox(box, Number(p[0]), Number(p[1]))
      return box
    case 'LineString':
      return extendBoxFromRing(box, c)
    case 'MultiLineString':
      for (const line of c || []) box = extendBoxFromRing(box, line)
      return box
    case 'Polygon':
      for (const ring of c || []) box = extendBoxFromRing(box, ring)
      return box
    case 'MultiPolygon':
      for (const poly of c || []) for (const ring of poly || []) box = extendBoxFromRing(box, ring)
      return box
    case 'GeometryCollection':
      for (const g of geom.geometries || []) box = boundsFromGeometry(g, box)
      return box
    default:
      return box
  }
}

/** [[minLng, minLat], [maxLng, maxLat]] para map.fitBounds, o null si no hay geometría. */
function boundsLngLatFromFeatureCollection(fc) {
  let box = null
  const feats = fc?.features
  if (!Array.isArray(feats)) return null
  for (const f of feats) {
    if (f?.geometry) box = boundsFromGeometry(f.geometry, box)
  }
  if (!box) return null
  const { minLng, maxLng, minLat, maxLat } = box
  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return null
  }
  const eps = 1e-5
  if (Math.abs(maxLng - minLng) < eps && Math.abs(maxLat - minLat) < eps) {
    return [
      [minLng - eps, minLat - eps],
      [maxLng + eps, maxLat + eps],
    ]
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

function installMapboxAttributionLinksOpenNewTab(map) {
  const el = map.getContainer()
  const fn = (e) => {
    const a = e.target && typeof e.target.closest === 'function' && e.target.closest('a[href]')
    if (!a) return
    const h = a.getAttribute('href') || ''
    if (!h || h.charAt(0) === '#') return
    e.preventDefault()
    e.stopPropagation()
    window.open(h, '_blank', 'noopener,noreferrer')
  }
  el.addEventListener('click', fn, true)
  return () => {
    try {
      el.removeEventListener('click', fn, true)
    } catch {
      /* ignore */
    }
  }
}

function normalizePlanoGeojson(plano) {
  if (plano == null || plano === '') return { type: 'FeatureCollection', features: [] }
  let p = plano
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p)
    } catch {
      return { type: 'FeatureCollection', features: [] }
    }
  }
  if (!p || typeof p !== 'object') return { type: 'FeatureCollection', features: [] }
  let fc
  if (p.type === 'FeatureCollection' && Array.isArray(p.features)) fc = p
  else if (p.type === 'Feature' && p.geometry) fc = { type: 'FeatureCollection', features: [p] }
  else if (Array.isArray(p.features)) fc = { type: 'FeatureCollection', features: p.features }
  else return { type: 'FeatureCollection', features: [] }
  return sanitizePlanoFeatureCollection(fc)
}

function featurePkId(f) {
  const p = f?.properties
  if (!p) return ''
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

function colorForEstado(estado) {
  switch (estado) {
    case 'sin_cantidad':
      return { fill: '#94a3b8', line: '#64748b', op: 0.08 }
    case 'sin_iniciar':
      return { fill: '#888780', line: '#888780', op: 0.35 }
    case 'en_progreso':
      return { fill: '#EF9F27', line: '#EF9F27', op: 0.6 }
    case 'completa':
      return { fill: '#1D9E75', line: '#1D9E75', op: 0.7 }
    default:
      return { fill: '#888780', line: '#888780', op: 0.35 }
  }
}

/** Leyenda estados programación (alineada con prog_pk_estado / colorForEstado). */
const MAPA_LEYENDA_ESTADOS = [
  { key: 'sin_cantidad', label: 'Sin cantidad', desc: 'PK sin ítems activos en presupuesto', fill: '#94a3b8', op: 0.08 },
  { key: 'sin_iniciar', label: 'Sin iniciar', desc: 'Hay ítems; ninguno con fecha', fill: '#888780', op: 0.35 },
  { key: 'en_progreso', label: 'En progreso', desc: 'Algunos ítems con fecha', fill: '#EF9F27', op: 0.6 },
  { key: 'completa', label: 'Completa', desc: 'Todos los ítems con fecha', fill: '#1D9E75', op: 0.7 },
]

async function parseApiError(res) {
  try {
    const j = await res.json()
    const d = j?.detail
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : x?.msg || JSON.stringify(x))).join('; ')
    return d || res.statusText || `Error ${res.status}`
  } catch {
    return res.statusText || `Error ${res.status}`
  }
}

function streetsStyleUrl(isDarkTheme) {
  return isDarkTheme ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
}

/** Terreno Mapbox (DEM) — solo en modo satélite. */
function ensureMapTerrain(map) {
  try {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      })
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
  } catch {
    /* conflicto con DEM del propio estilo */
  }
}

function clearMapTerrain(map) {
  try {
    map.setTerrain(null)
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem')
  } catch {
    /* ignore */
  }
}

const PROG_MAP_HANDLERS = Symbol('progMapHandlers')

function removeProgLayersIfAny(map) {
  try {
    if (map.getLayer('prog-line')) map.removeLayer('prog-line')
    if (map.getLayer('prog-fill')) map.removeLayer('prog-fill')
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource('prog-pol')) map.removeSource('prog-pol')
  } catch {
    /* ignore */
  }
}

/** Tras `load` o `style.load`: terreno solo en satélite; fuente/capas/eventos de polígonos. */
function applyProgMapAfterStyle(map, basemapMode, enriched, setSelPk) {
  if (!map || !enriched) return
  if (basemapMode === 'satellite') {
    clearMapTerrain(map)
    ensureMapTerrain(map)
  } else {
    clearMapTerrain(map)
  }
  removeProgLayersIfAny(map)
  map.addSource('prog-pol', { type: 'geojson', data: enriched })
  map.addLayer({
    id: 'prog-fill',
    type: 'fill',
    source: 'prog-pol',
    paint: {
      'fill-color': ['get', 'prog_fill'],
      'fill-opacity': ['get', 'prog_op'],
    },
  })
  map.addLayer({
    id: 'prog-line',
    type: 'line',
    source: 'prog-pol',
    paint: {
      'line-color': ['coalesce', ['get', 'prog_line'], '#888780'],
      'line-width': 2,
      'line-opacity': 0.9,
    },
  })
  const prev = map[PROG_MAP_HANDLERS]
  if (prev) {
    try {
      map.off('click', 'prog-fill', prev.onClick)
      map.off('mouseenter', 'prog-fill', prev.onEnter)
      map.off('mouseleave', 'prog-fill', prev.onLeave)
    } catch {
      /* ignore */
    }
  }
  const onClick = (e) => {
    const f = e.features && e.features[0]
    const pkid = featurePkId(f)
    if (pkid) setSelPk(pkid)
  }
  const onEnter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
  }
  map.on('click', 'prog-fill', onClick)
  map.on('mouseenter', 'prog-fill', onEnter)
  map.on('mouseleave', 'prog-fill', onLeave)
  map[PROG_MAP_HANDLERS] = { onClick, onEnter, onLeave }
}

function basemapStyleUrl(mode, isDarkTheme) {
  if (mode === 'satellite') return MAPBOX_STYLE_SATELLITE
  if (mode === 'topo') return MAPBOX_STYLE_OUTDOORS
  return streetsStyleUrl(isDarkTheme)
}

function basemapLabel(mode) {
  if (mode === 'topo') return 'Topo'
  if (mode === 'satellite') return 'Satélite'
  return 'Plano'
}

/** Control top-right: menú Plano / Topo / Satélite. */
function createBasemapStyleControl({ getMode, t, onSelect }) {
  let container
  let menu
  let mainBtn
  const closeMenu = () => {
    if (menu) menu.style.display = 'none'
  }
  const mkOpt = (value, label) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    const styleBase = [
      'display:block',
      'width:100%',
      'text-align:left',
      'padding:8px 12px',
      'font-size:12px',
      'font-weight:600',
      'border:none',
      'background:transparent',
      'color:' + (t.text || '#111'),
      'cursor:pointer',
    ].join(';')
    b.style.cssText = styleBase
    const applySel = () => {
      const cur = getMode()
      if (value === cur) {
        b.style.background = (t.primary || '#2563eb') + '22'
        b.style.color = t.primary || '#2563eb'
      } else {
        b.style.background = 'transparent'
        b.style.color = t.text || '#111'
      }
    }
    applySel()
    b.onmouseenter = () => {
      if (value !== getMode()) b.style.background = (t.bg || '#f3f4f6')
    }
    b.onmouseleave = () => applySel()
    b.onclick = (ev) => {
      ev.stopPropagation()
      onSelect(value)
      closeMenu()
      if (mainBtn) mainBtn.textContent = basemapLabel(value)
    }
    return b
  }
  const rebuildMenu = () => {
    if (!menu) return
    menu.innerHTML = ''
    menu.appendChild(mkOpt('plano', 'Plano'))
    menu.appendChild(mkOpt('topo', 'Topo'))
    menu.appendChild(mkOpt('satellite', 'Satélite'))
  }
  return {
    onAdd() {
      container = document.createElement('div')
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
      container.style.position = 'relative'

      mainBtn = document.createElement('button')
      mainBtn.type = 'button'
      mainBtn.setAttribute('data-prog-basemap-btn', '1')
      mainBtn.textContent = basemapLabel(getMode())
      mainBtn.title = 'Vista del mapa'
      mainBtn.style.cssText = [
        'font-size:11px',
        'font-weight:700',
        'padding:6px 10px',
        'min-width:76px',
        'cursor:pointer',
        'color:#fff',
        'background:' + (t.primary || '#2563eb'),
        'border:none',
        'border-radius:4px',
      ].join(';')
      mainBtn.onmousedown = (e) => e.preventDefault()
      mainBtn.onclick = (e) => {
        e.stopPropagation()
        if (!menu) return
        rebuildMenu()
        mainBtn.textContent = basemapLabel(getMode())
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
      }

      menu = document.createElement('div')
      menu.style.cssText = [
        'display:none',
        'position:absolute',
        'top:100%',
        'right:0',
        'margin-top:4px',
        'min-width:140px',
        'padding:4px 0',
        'border-radius:8px',
        'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
        'background:' + (t.bgCard || '#fff'),
        'border:1px solid ' + (t.border || '#e5e7eb'),
        'z-index:20',
      ].join(';')
      rebuildMenu()

      container.appendChild(mainBtn)
      container.appendChild(menu)

      const onDoc = (e) => {
        if (!container.contains(e.target)) closeMenu()
      }
      document.addEventListener('click', onDoc, true)
      container.__progDocClose = onDoc

      return container
    },
    onRemove() {
      if (container?.__progDocClose) {
        document.removeEventListener('click', container.__progDocClose, true)
      }
      if (container?.parentNode) container.parentNode.removeChild(container)
    },
    getDefaultPosition: () => 'top-right',
  }
}

function fmtDateIso(s) {
  if (s == null || s === '') return ''
  if (typeof s === 'string') return s.slice(0, 10)
  return String(s)
}

function useDebounced(value, ms) {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return d
}

export default function ModuloProgramacionObra({
  t,
  usuario,
  token,
  puedeEditar = false,
  puedeCrear = false,
  puedeValidar = false,
}) {
  const cid = usuario?.contrato_id
  const uid = usuario?.id
  const API = API_BASE
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const mapBaseModeRef = useRef('plano')
  const enrichedGeojsonRef = useRef(null)
  const [plano, setPlano] = useState(undefined)
  const [mapaResp, setMapaResp] = useState(null)
  const [versiones, setVersiones] = useState([])
  const [selPk, setSelPk] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)
  const [workingVersionId, setWorkingVersionId] = useState(null)
  const [presupuestoRows, setPresupuestoRows] = useState([])
  const [loadPpto, setLoadPpto] = useState(false)
  const [actData, setActData] = useState({ capitulos: [], actividades: [] })
  const [loadAct, setLoadAct] = useState(false)
  const [expandedCaps, setExpandedCaps] = useState(() => new Set())
  const [panelBusy, setPanelBusy] = useState(false)
  const [validaciones, setValidaciones] = useState([])
  const [loadVal, setLoadVal] = useState(false)
  const [showCrearVersion, setShowCrearVersion] = useState(false)
  const [crearMotivo, setCrearMotivo] = useState('')
  const [validarModal, setValidarModal] = useState(null)
  /** 'plano' = callejero claro/oscuro; 'topo' = outdoors; 'satellite' = satélite + relieve 3D. */
  const [mapBaseMode, setMapBaseMode] = useState('plano')
  mapBaseModeRef.current = mapBaseMode

  const hdrs = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 5000)
  }, [])

  const refreshMapaYVersiones = useCallback(
    async (ensureVersionRow = null) => {
      if (!cid || !token) return
      const [m, v] = await Promise.all([
        fetch(`${API}/prog-obra/${cid}/mapa`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`${API}/prog-obra/${cid}/versiones`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
          r.ok ? r.json() : null,
        ),
      ])
      setMapaResp(m && typeof m === 'object' ? m : { pk: [], meta: {} })
      let arr = Array.isArray(v) ? v : []
      if (ensureVersionRow?.id != null) {
        const id = String(ensureVersionRow.id)
        if (!arr.some((x) => String(x.id) === id)) {
          arr = [ensureVersionRow, ...arr]
        }
      }
      arr = [...arr].sort((a, b) => (Number(b.numero_version) || 0) - (Number(a.numero_version) || 0))
      setVersiones(arr)
      return m
    },
    [cid, token, API],
  )

  useEffect(() => {
    if (!cid || !token) {
      setPlano({ type: 'FeatureCollection', features: [] })
      setMapaResp(null)
      setVersiones([])
      return
    }
    let cancel = false
    setPlano(undefined)
    setErr('')
    Promise.all([
      fetch(`${API}/contratos/${cid}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API}/prog-obra/${cid}/mapa`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API}/prog-obra/${cid}/versiones`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([c, m, v]) => {
        if (cancel) return
        const raw = c?.plano_geojson ?? null
        setPlano(normalizePlanoGeojson(raw))
        setMapaResp(m && typeof m === 'object' ? m : { pk: [], meta: {} })
        setVersiones(Array.isArray(v) ? v : [])
      })
      .catch((e) => {
        if (!cancel) setErr(e?.message || 'Error de red')
      })
    return () => {
      cancel = true
    }
  }, [cid, token, API])

  const meta = mapaResp?.meta || {}
  const borradorMeta = meta.borrador

  useEffect(() => {
    if (borradorMeta?.id) setWorkingVersionId((prev) => prev || String(borradorMeta.id))
  }, [borradorMeta?.id])

  const tieneSellada = useMemo(
    () => versiones.some((v) => (v.estado || '') === 'sellada'),
    [versiones],
  )

  const workingVersion = useMemo(
    () => versiones.find((v) => String(v.id) === String(workingVersionId)) || null,
    [versiones, workingVersionId],
  )

  const pkMeta = useCallback(() => {
    const rows = mapaResp?.pk
    if (!Array.isArray(rows)) return {}
    const m = {}
    for (const r of rows) {
      const id = String(r.pk_id || '').trim()
      if (id) m[id] = r
    }
    return m
  }, [mapaResp])

  useEffect(() => {
    if (!MAPBOX_TOKEN || plano === undefined) return
    const mref = mapRef.current
    if (!mref) return

    if (mapInst.current) {
      try {
        mapInst.current.remove()
      } catch {
        /* ignore */
      }
      mapInst.current = null
    }

    mapboxgl.accessToken = MAPBOX_TOKEN
    const isDarkTheme = t.bg === '#0A1628'
    const styleUrl = basemapStyleUrl(mapBaseModeRef.current, isDarkTheme)
    const map = new mapboxgl.Map({
      container: mref,
      style: styleUrl,
      center: [0, 0],
      zoom: 1,
      bearing: MAP_INITIAL_BEARING,
      pitch: 0,
    })
    map.__progLastStyleUrl = styleUrl
    const unreg = installMapboxAttributionLinksOpenNewTab(map)
    mapInst.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(
      createBasemapStyleControl({
        getMode: () => mapBaseModeRef.current,
        t,
        onSelect: (v) => {
          if (v === 'plano' || v === 'topo' || v === 'satellite') setMapBaseMode(v)
        },
      }),
      'top-right',
    )

    const metaMap = pkMeta()
    const enriched = {
      ...plano,
      features: (plano.features || []).map((f) => {
        const pkid = featurePkId(f)
        const row = metaMap[pkid] || {}
        const est = row.estado_programacion || 'sin_iniciar'
        const c = colorForEstado(est)
        return {
          ...f,
          properties: {
            ...f.properties,
            pk_id: pkid,
            prog_estado: est,
            prog_fill: c.fill,
            prog_line: c.line,
            prog_op: c.op,
          },
        }
      }),
    }
    enrichedGeojsonRef.current = enriched

    map.on('load', () => {
      applyProgMapAfterStyle(map, mapBaseModeRef.current, enriched, setSelPk)
      const lab = map.getContainer().querySelector('[data-prog-basemap-btn]')
      if (lab) lab.textContent = basemapLabel(mapBaseModeRef.current)
      const b = boundsLngLatFromFeatureCollection(enriched)
      if (b) {
        const runFit = () => {
          try {
            map.resize()
            map.fitBounds(b, {
              padding: { top: 56, bottom: 132, left: 200, right: 56 },
              maxZoom: 22,
              duration: 0,
              bearing: MAP_INITIAL_BEARING,
              pitch: 0,
              essential: true,
            })
          } catch {
            /* ignore fit errors (geometría vacía / WebGL) */
          }
        }
        requestAnimationFrame(runFit)
      }
    })

    return () => {
      unreg()
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      if (mapInst.current === map) mapInst.current = null
    }
  }, [cid, plano, mapaResp, t.bg, pkMeta])

  useEffect(() => {
    const map = mapInst.current
    if (!map || !MAPBOX_TOKEN) return
    if (!map.isStyleLoaded()) return
    const isDark = t.bg === '#0A1628'
    const url = basemapStyleUrl(mapBaseMode, isDark)
    if (map.__progLastStyleUrl === url) return
    map.__progLastStyleUrl = url
    map.setStyle(url)
    const modeAtSwitch = mapBaseMode
    map.once('style.load', () => {
      applyProgMapAfterStyle(map, modeAtSwitch, enrichedGeojsonRef.current, setSelPk)
      const lab = map.getContainer().querySelector('[data-prog-basemap-btn]')
      if (lab) lab.textContent = basemapLabel(modeAtSwitch)
    })
  }, [mapBaseMode, t.bg])

  const pptoPorPk = useMemo(() => {
    if (!selPk) return []
    return presupuestoRows.filter(
      (r) =>
        String(r.pk_id || '').trim() === selPk &&
        String(r.tipo_ejecucion || '').trim() === PRESUPUESTO_TIPO_POLIGONO &&
        r.dado_de_baja !== true,
    )
  }, [presupuestoRows, selPk])

  const capitulosOrdenados = useMemo(() => {
    const caps = new Map()
    for (const r of pptoPorPk) {
      const c = String(r.capitulo || '').trim()
      if (!c) continue
      if (!caps.has(c)) caps.set(c, [])
      caps.get(c).push(r)
    }
    return [...caps.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [pptoPorPk])

  const capKeyOrden = useMemo(() => capitulosOrdenados.join('|'), [capitulosOrdenados])

  useEffect(() => {
    if (!selPk) {
      setExpandedCaps(new Set())
      return
    }
    if (capitulosOrdenados.length === 0) {
      setExpandedCaps(new Set())
      return
    }
    setExpandedCaps(new Set([capitulosOrdenados[0]]))
  }, [selPk, capKeyOrden, capitulosOrdenados])

  const itemsPorCapitulo = useCallback(
    (cap) => {
      const m = new Map()
      for (const r of pptoPorPk) {
        if (String(r.capitulo || '').trim() !== cap) continue
        const it = String(r.item || '').trim()
        if (!it) continue
        const key = `${cap}\u0000${it}`
        if (!m.has(key)) {
          m.set(key, {
            capitulo: cap,
            item: it,
            cant_total: Number(r.cant_total) || 0,
            und: String(r.und || '').slice(0, 20),
            vlr_unitario: Number(r.vlr_unitario) || 0,
          })
        } else {
          const cur = m.get(key)
          cur.cant_total += Number(r.cant_total) || 0
        }
      }
      return [...m.values()].sort((a, b) => a.item.localeCompare(b.item, undefined, { numeric: true }))
    },
    [pptoPorPk],
  )

  const actividadKey = (cap, item, seg = 1) => `${cap}\u0000${item}\u0000${seg}`

  const actMap = useMemo(() => {
    const m = {}
    for (const a of actData.actividades || []) {
      const k = actividadKey(String(a.capitulo || ''), String(a.item || ''), Number(a.segmento) || 1)
      m[k] = a
    }
    return m
  }, [actData.actividades])

  const capProgMap = useMemo(() => {
    const m = {}
    for (const c of actData.capitulos || []) {
      const cap = String(c.capitulo || '').trim()
      if (cap) m[cap] = c
    }
    return m
  }, [actData.capitulos])

  useEffect(() => {
    if (!cid || !token || !selPk) {
      setPresupuestoRows([])
      return
    }
    let cancel = false
    setLoadPpto(true)
    const q = new URLSearchParams()
    q.set('pk_criterio', selPk)
    q.set('limit', '3000')
    fetch(`${API}/presupuesto/${cid}?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancel) setPresupuestoRows(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancel) setPresupuestoRows([])
      })
      .finally(() => {
        if (!cancel) setLoadPpto(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, selPk, API])

  useEffect(() => {
    if (!cid || !token || !selPk || !workingVersionId) {
      setActData({ capitulos: [], actividades: [] })
      return
    }
    let cancel = false
    setLoadAct(true)
    const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: selPk })
    fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }))
      .then((d) => {
        if (!cancel) setActData(d && typeof d === 'object' ? d : { capitulos: [], actividades: [] })
      })
      .catch(() => {
        if (!cancel) setActData({ capitulos: [], actividades: [] })
      })
      .finally(() => {
        if (!cancel) setLoadAct(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, selPk, workingVersionId, API])

  useEffect(() => {
    if (!cid || !token || !workingVersionId) {
      setValidaciones([])
      return
    }
    const est = workingVersion?.estado
    if (est !== 'en_validacion' && est !== 'sellada') {
      setValidaciones([])
      return
    }
    let cancel = false
    setLoadVal(true)
    fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validaciones`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancel) setValidaciones(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancel) setValidaciones([])
      })
      .finally(() => {
        if (!cancel) setLoadVal(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, workingVersionId, workingVersion?.estado, API])

  const rowSel = selPk ? pkMeta()[selPk] : null
  const esBorradorEditable = workingVersion && (workingVersion.estado || '') === 'borrador'
  const esEnValidacion = workingVersion && (workingVersion.estado || '') === 'en_validacion'
  const esSellada = workingVersion && (workingVersion.estado || '') === 'sellada'

  const badgeEstado = (estado) => {
    const e = (estado || '').toLowerCase()
    const colors = {
      borrador: { bg: '#e0e7ff', fg: '#3730a3' },
      en_validacion: { bg: '#fef3c7', fg: '#92400e' },
      sellada: { bg: '#d1fae5', fg: '#065f46' },
      archivada: { bg: '#f3f4f6', fg: '#4b5563' },
      rechazada: { bg: '#fee2e2', fg: '#991b1b' },
    }
    const c = colors[e] || { bg: t.bg, fg: t.textMuted }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          background: c.bg,
          color: c.fg,
        }}
      >
        {estado || '—'}
      </span>
    )
  }

  const handleCrearVersion = async () => {
    if (!puedeCrear || !cid) return
    const tipo = tieneSellada ? 'reprogramacion' : 'baseline'
    if (tipo === 'reprogramacion' && !crearMotivo.trim()) {
      showToast('Indique el motivo de la reprogramación.', 'err')
      return
    }
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          tipo,
          motivo_reprogramacion: tipo === 'reprogramacion' ? crearMotivo.trim() : null,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const row = await res.json()
      setShowCrearVersion(false)
      setCrearMotivo('')
      const vid = row?.id != null ? String(row.id) : null
      await refreshMapaYVersiones(row)
      if (vid) setWorkingVersionId(vid)
      showToast(`Versión nº${row.numero_version} creada (${row.estado}).`)
    } catch (e) {
      showToast(e?.message || 'No se pudo crear la versión', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleEnviarValidacion = async () => {
    if (!puedeEditar || !cid || !workingVersionId) return
    if (!window.confirm('¿Enviar esta versión a la cadena de validación? No podrá editar el cronograma hasta un rechazo.'))
      return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/enviar-validacion`, {
        method: 'POST',
        headers: hdrs,
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      await refreshMapaYVersiones()
      showToast('Versión enviada a validación.')
    } catch (e) {
      showToast(e?.message || 'Error al enviar', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleGuardarCapitulo = async (capitulo, fechaIso, durInt) => {
    if (!puedeEditar || !cid || !workingVersionId || !selPk) return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/capitulo`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          version_id: workingVersionId,
          pk_id: selPk,
          capitulo,
          fecha_inicio_sugerida: fechaIso || null,
          duracion_dias_habiles: durInt != null && durInt !== '' ? parseInt(String(durInt), 10) : null,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: selPk })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }),
      )
      setActData(d)
      showToast(`Capítulo «${capitulo}» guardado.`)
    } catch (e) {
      showToast(e?.message || 'Error al guardar capítulo', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleHerencia = async (capitulo) => {
    if (!puedeEditar || !cid || !workingVersionId || !selPk) return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/herencia`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ version_id: workingVersionId, pk_id: selPk, capitulo }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: selPk })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }),
      )
      setActData(d)
      await refreshMapaYVersiones()
      showToast('Herencia aplicada a ítems sin fecha.')
    } catch (e) {
      showToast(e?.message || 'No se pudo aplicar herencia', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleGuardarItem = async (itemDef, form) => {
    if (!puedeEditar || !cid || !workingVersionId || !selPk) return
    const cant = Number(itemDef.cant_total)
    if (!(cant > 0)) {
      showToast('Este ítem no tiene cantidad en presupuesto; no se programa.', 'err')
      return
    }
    setPanelBusy(true)
    try {
      const body = {
        version_id: workingVersionId,
        pk_id: selPk,
        capitulo: itemDef.capitulo,
        item: itemDef.item,
        segmento: 1,
        fecha_inicio: form.fecha_inicio || null,
        duracion_dias_habiles: form.duracion != null && form.duracion !== '' ? parseInt(String(form.duracion), 10) : null,
        cantidad_programada: cant,
        unidad: itemDef.und || '?',
        costo_unitario: Number(itemDef.vlr_unitario) || 0,
        tipo_distribucion: 'lineal',
        override_manual: !!form.override_manual,
        heredado_de_capitulo: !!form.heredado_de_capitulo,
      }
      const res = await fetch(`${API}/prog-obra/${cid}/actividad`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: selPk })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }),
      )
      setActData(d)
      await refreshMapaYVersiones()
      showToast(`Ítem ${itemDef.capitulo} / ${itemDef.item} guardado.`)
    } catch (e) {
      showToast(e?.message || 'Error al guardar actividad', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleValidarDecision = async (nivel, aprobar, observacion) => {
    if (!puedeValidar || !cid || !workingVersionId) return
    if (!aprobar && !(observacion || '').trim()) {
      showToast('La observación es obligatoria al rechazar.', 'err')
      return
    }
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validar`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ nivel, aprobar, observacion: observacion || null }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const out = await res.json()
      const fueRechazo = out?.resultado === 'rechazado'
      const fueSellada = out?.resultado === 'sellada'
      if (fueRechazo) {
        showToast(
          uid
            ? 'Rechazo registrado. El creador de la versión recibe una notificación en la bandeja del sistema.'
            : 'Rechazo registrado.',
          'ok',
        )
      } else {
        showToast(aprobar ? 'Validación registrada.' : 'Procesado.')
      }
      setValidarModal(null)
      await refreshMapaYVersiones()
      if (fueSellada) {
        showToast('Versión sellada y publicada como vigente. Mapa actualizado.')
      }
      const valRows = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : []))
      setValidaciones(Array.isArray(valRows) ? valRows : [])
    } catch (e) {
      showToast(e?.message || 'Error en validación', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const btnStyle = (primary = false, disabled = false) => ({
    padding: '6px 12px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${primary ? t.primary : t.border}`,
    background: primary ? t.primary : t.bgCard,
    color: primary ? '#fff' : t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  })

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    fontSize: 'var(--cc-sm)',
  }

  if (!cid) {
    return (
      <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)', padding: '48px 20px', textAlign: 'center' }}>
        Selecciona un contrato para usar programación de obra.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)', minHeight: 480, gap: 0, position: 'relative' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 360,
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            background: toast.kind === 'err' ? '#fee2e2' : '#d1fae5',
            color: toast.kind === 'err' ? '#991b1b' : '#065f46',
            fontSize: 'var(--cc-sm)',
            fontWeight: 600,
          }}
        >
          {toast.msg}
        </div>
      )}
      {validarModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !panelBusy && setValidarModal(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 20,
              color: t.text,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 12, color: t.primary }}>
              Nivel {validarModal.nivel} — {validarModal.aprobar ? 'Aprobar' : 'Rechazar'}
            </div>
            {!validarModal.aprobar && (
              <>
                <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Observación *</label>
                <textarea
                  value={validarModal.obs || ''}
                  onChange={(e) => setValidarModal((m) => ({ ...m, obs: e.target.value }))}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={() => setValidarModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={btnStyle(true, panelBusy)}
                disabled={panelBusy}
                onClick={() =>
                  handleValidarDecision(validarModal.nivel, validarModal.aprobar, validarModal.aprobar ? null : validarModal.obs)
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {showCrearVersion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !panelBusy && setShowCrearVersion(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 20,
              color: t.text,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: t.primary }}>Nueva versión de programación</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 12 }}>
              {tieneSellada
                ? 'Se creará una reprogramación. Indique el motivo (obligatorio).'
                : 'Se creará la versión baseline inicial del contrato.'}
            </div>
            {tieneSellada && (
              <>
                <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Motivo *</label>
                <textarea
                  value={crearMotivo}
                  onChange={(e) => setCrearMotivo(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={() => setShowCrearVersion(false)}>
                Cancelar
              </button>
              <button type="button" style={btnStyle(true, panelBusy)} disabled={panelBusy} onClick={handleCrearVersion}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {err && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 2,
              background: '#fee2e2',
              color: '#b91c1c',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 'var(--cc-sm)',
            }}
          >
            {err}
          </div>
        )}
        {borradorMeta && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 2,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.primary,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
            }}
          >
            Borrador nº{borradorMeta.numero_version} — el mapa refleja la versión sellada vigente
          </div>
        )}
        {!MAPBOX_TOKEN && <div style={{ padding: 24, color: t.textMuted }}>Falta VITE_MAPBOX_TOKEN para el mapa.</div>}
        <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            zIndex: 4,
            maxWidth: 280,
            padding: '10px 12px',
            borderRadius: 10,
            background: `${t.bgCard}ee`,
            border: `1px solid ${t.border}`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
            fontSize: 11,
            color: t.text,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, color: t.primary, marginBottom: 8, fontSize: 12 }}>Estado de programación</div>
          {MAPA_LEYENDA_ESTADOS.map((it) => (
            <div key={it.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  marginTop: 2,
                  flexShrink: 0,
                  background: it.fill,
                  opacity: Math.max(it.op, 0.15),
                  border: `1px solid ${t.border}`,
                }}
              />
              <span>
                <strong style={{ color: t.text }}>{it.label}</strong>
                <span style={{ color: t.textMuted, display: 'block', lineHeight: 1.35 }}>{it.desc}</span>
              </span>
            </div>
          ))}
        </div>
        {mapaResp?.tiempo_ms != null && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              zIndex: 3,
              fontSize: 11,
              color: t.textMuted,
              background: `${t.bgCard}cc`,
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            /mapa {mapaResp.tiempo_ms} ms
          </div>
        )}
      </div>

      <div
        style={{
          width: 420,
          flexShrink: 0,
          borderLeft: `1px solid ${t.border}`,
          background: t.bgCard,
          padding: 16,
          overflowY: 'auto',
          fontSize: 'var(--cc-sm)',
        }}
      >
        <div style={{ fontWeight: 700, color: t.primary, marginBottom: 12, fontSize: 'var(--cc-md)' }}>Programación de obra</div>

        <div style={{ color: t.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
          Contrato <strong style={{ color: t.text }}>{cid}</strong> · Vigente sellada:{' '}
          <strong style={{ color: t.text }}>
            {meta.version_vigente_numero != null ? `nº ${meta.version_vigente_numero}` : '—'}
          </strong>
        </div>

        <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ fontWeight: 600, color: t.text, marginBottom: 8 }}>Versión de trabajo</div>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, marginBottom: 8 }}>
            El borrador se guarda en el servidor: puede programar solo algunos PKs, cerrar sesión y continuar en otro momento; la
            misma versión seguirá disponible aquí.
          </div>
          <select
            value={workingVersionId || ''}
            onChange={(e) => setWorkingVersionId(e.target.value || null)}
            style={{ ...inputStyle, marginBottom: 8 }}
          >
            <option value="">— Seleccione —</option>
            {versiones.map((v) => (
              <option key={v.id} value={v.id}>
                nº{v.numero_version} · {v.tipo} · {v.estado}
              </option>
            ))}
          </select>
          {puedeCrear && (
            <button type="button" style={{ ...btnStyle(true), width: '100%' }} disabled={panelBusy} onClick={() => setShowCrearVersion(true)}>
              + Nueva versión
            </button>
          )}
          {workingVersion && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: t.textMuted }}>Estado:</span>
              {badgeEstado(workingVersion.estado)}
            </div>
          )}
          {(puedeEditar || puedeValidar) && workingVersion && esBorradorEditable && (
            <button
              type="button"
              title="PROGOB: permiso Editar o Validar (el servidor exige al menos uno de los dos)."
              style={{ ...btnStyle(true), width: '100%', marginTop: 10 }}
              disabled={panelBusy}
              onClick={handleEnviarValidacion}
            >
              Enviar a validación
            </button>
          )}
        </div>

        {(esEnValidacion || esSellada) && (
          <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}>
            <div style={{ fontWeight: 600, color: t.text, marginBottom: 8 }}>Flujo de aprobación</div>
            {loadVal && <div style={{ color: t.textMuted }}>Cargando…</div>}
            {!loadVal && validaciones.length === 0 && (
              <div style={{ color: t.textMuted, fontSize: 11 }}>Sin filas de validación (versión no enviada o datos no disponibles).</div>
            )}
            <ul style={{ margin: 0, paddingLeft: 18, color: t.text, lineHeight: 1.7 }}>
              {validaciones.map((val) => (
                <li key={val.id || `${val.nivel}-${val.orden}`}>
                  <strong>Nivel {val.nivel}</strong> — {badgeEstado(val.estado)}
                  {val.validado_en && (
                    <span style={{ color: t.textMuted, fontSize: 11 }}>
                      {' '}
                      · {fmtDateIso(val.validado_en)}
                    </span>
                  )}
                  {puedeValidar && esEnValidacion && val.estado === 'pendiente' && (
                    <span style={{ marginLeft: 8 }}>
                      <button
                        type="button"
                        style={{ ...btnStyle(true), padding: '2px 8px', fontSize: 11 }}
                        disabled={panelBusy}
                        onClick={() => setValidarModal({ nivel: val.nivel, aprobar: true, obs: '' })}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        style={{ ...btnStyle(false), padding: '2px 8px', fontSize: 11, marginLeft: 4 }}
                        disabled={panelBusy}
                        onClick={() => setValidarModal({ nivel: val.nivel, aprobar: false, obs: '' })}
                      >
                        Rechazar
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {puedeValidar && esEnValidacion && (
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>
                Solo el nivel pendiente correspondiente a su rol puede validarse; el servidor rechaza si no corresponde.
              </div>
            )}
          </div>
        )}

        <hr style={{ border: 0, borderTop: `1px solid ${t.border}`, margin: '14px 0' }} />

        <div style={{ fontWeight: 600, color: t.text, marginBottom: 8 }}>Polígono (PK)</div>
        {selPk ? (
          <div>
            <div style={{ color: t.primary, fontWeight: 700, marginBottom: 8 }}>{selPk}</div>
            {rowSel ? (
              <div style={{ color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
                <div>
                  Estado (vigente): <strong style={{ color: t.text }}>{rowSel.estado_programacion}</strong>
                </div>
                <div>
                  Ítems: {rowSel.items_con_fecha ?? 0} / {rowSel.items_total ?? 0}
                </div>
                {rowSel.porcentaje_programado != null && <div>Programado: {rowSel.porcentaje_programado}%</div>}
              </div>
            ) : (
              <div style={{ color: t.textMuted, marginBottom: 12 }}>Sin fila de estado para este PK en la versión vigente.</div>
            )}

            {!workingVersionId && (
              <div style={{ color: t.textMuted, fontSize: 11 }}>Seleccione una versión de trabajo para editar capítulos e ítems.</div>
            )}

            {workingVersionId && !esBorradorEditable && (
              <div style={{ color: t.textMuted, fontSize: 11, marginBottom: 8 }}>
                Solo se edita en <strong>borrador</strong>. Esta versión está {workingVersion?.estado || '—'}.
              </div>
            )}

            {loadPpto && <div style={{ color: t.textMuted }}>Cargando presupuesto del PK…</div>}
            {!loadPpto && pptoPorPk.length === 0 && (
              <div style={{ color: t.textMuted }}>No hay líneas «{PRESUPUESTO_TIPO_POLIGONO}» activas para este PK.</div>
            )}

            {workingVersionId && esBorradorEditable && puedeEditar && capitulosOrdenados.map((cap) => (
              <CapituloBlock
                key={cap}
                cap={cap}
                t={t}
                expanded={expandedCaps.has(cap)}
                onToggle={() =>
                  setExpandedCaps((prev) => {
                    const n = new Set(prev)
                    if (n.has(cap)) n.delete(cap)
                    else n.add(cap)
                    return n
                  })
                }
                capRow={capProgMap[cap]}
                items={itemsPorCapitulo(cap)}
                actMap={actMap}
                actividadKey={actividadKey}
                cid={cid}
                token={token}
                API={API}
                panelBusy={panelBusy}
                onGuardarCap={(fecha, dur) => handleGuardarCapitulo(cap, fecha, dur)}
                onHerencia={() => handleHerencia(cap)}
                onGuardarItem={handleGuardarItem}
                btnStyle={btnStyle}
                inputStyle={inputStyle}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: t.textMuted }}>Haz clic en un polígono del plano.</div>
        )}

        {loadAct && selPk && workingVersionId && (
          <div style={{ color: t.textMuted, marginTop: 8 }}>Sincronizando actividades…</div>
        )}
      </div>
    </div>
  )
}

function CapituloBlock({
  cap,
  t,
  expanded,
  onToggle,
  capRow,
  items,
  actMap,
  actividadKey,
  cid,
  token,
  API,
  panelBusy,
  onGuardarCap,
  onHerencia,
  onGuardarItem,
  btnStyle,
  inputStyle,
}) {
  const cr = capRow || {}
  const [fecha, setFecha] = useState(() => fmtDateIso(cr.fecha_inicio_sugerida))
  const [dur, setDur] = useState(cr.duracion_dias_habiles != null ? String(cr.duracion_dias_habiles) : '')

  useEffect(() => {
    setFecha(fmtDateIso(cr.fecha_inicio_sugerida))
    setDur(cr.duracion_dias_habiles != null ? String(cr.duracion_dias_habiles) : '')
  }, [cr.fecha_inicio_sugerida, cr.duracion_dias_habiles, cap])

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 12px',
          border: 'none',
          background: t.bg,
          color: t.text,
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 'var(--cc-sm)',
        }}
      >
        {expanded ? '▼' : '▶'} {cap}
      </button>
      {expanded && (
        <div style={{ padding: 12, borderTop: `1px solid ${t.border}` }}>
          <div style={{ fontWeight: 600, color: t.primary, marginBottom: 8 }}>Capítulo</div>
          <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 2 }}>Fecha inicio sugerida</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
          <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 2 }}>Duración (días hábiles)</label>
          <input
            type="number"
            min={1}
            value={dur}
            onChange={(e) => setDur(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button type="button" style={btnStyle(true, panelBusy)} disabled={panelBusy} onClick={() => onGuardarCap(fecha || null, dur)}>
              Guardar capítulo
            </button>
            <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={onHerencia}>
              Aplicar herencia a ítems sin fecha
            </button>
          </div>

          <div style={{ fontWeight: 600, color: t.text, margin: '14px 0 8px' }}>Ítems</div>
          {items.map((it) => (
            <ItemRowForm
              key={`${it.capitulo}-${it.item}`}
              itemDef={it}
              act={actMap[actividadKey(it.capitulo, it.item, 1)]}
              cid={cid}
              token={token}
              API={API}
              panelBusy={panelBusy}
              onGuardar={(form) => onGuardarItem(it, form)}
              btnStyle={btnStyle}
              inputStyle={inputStyle}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ItemRowForm({ itemDef, act, cid, token, API, panelBusy, onGuardar, btnStyle, inputStyle, t }) {
  const ex = act || {}
  const [fechaIni, setFechaIni] = useState(() => fmtDateIso(ex.fecha_inicio))
  const [duracion, setDuracion] = useState(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  const [overrideManual, setOverrideManual] = useState(!!ex.override_manual)
  const debDur = useDebounced(duracion, 320)
  const debFecha = useDebounced(fechaIni, 320)
  const [finCalc, setFinCalc] = useState(() => fmtDateIso(ex.fecha_fin_calculada))

  useEffect(() => {
    setFechaIni(fmtDateIso(ex.fecha_inicio))
    setDuracion(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
    setOverrideManual(!!ex.override_manual)
    setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
  }, [ex.fecha_inicio, ex.duracion_dias_habiles, ex.fecha_fin_calculada, ex.override_manual, itemDef.item])

  useEffect(() => {
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !d || d < 1 || !cid || !token) {
      setFinCalc('')
      return
    }
    let cancel = false
    const q = new URLSearchParams({
      fecha_inicio: debFecha,
      duracion_dias_habiles: String(d),
    })
    fetch(`${API}/prog-obra/${cid}/calcular-fin?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancel) setFinCalc(j?.fecha_fin_calculada ? String(j.fecha_fin_calculada).slice(0, 10) : '')
      })
      .catch(() => {
        if (!cancel) setFinCalc('')
      })
    return () => {
      cancel = true
    }
  }, [debFecha, debDur, cid, token, API])

  const heredado = !!ex.heredado_de_capitulo
  const ov = overrideManual

  return (
    <div
      style={{
        marginBottom: 10,
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.bg,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 600, color: t.text }}>{itemDef.item}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
          {heredado && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af' }}>
              Heredado
            </span>
          )}
          {ov && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>
              Override manual
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>
        Cant. {itemDef.cant_total} {itemDef.und || ''} · V/U {itemDef.vlr_unitario}
      </div>
      <label style={{ display: 'block', fontSize: 10, color: t.textMuted }}>Fecha inicio</label>
      <input type="date" value={fechaIni} onChange={(e) => setFechaIni(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
      <label style={{ display: 'block', fontSize: 10, color: t.textMuted }}>Duración (días hábiles)</label>
      <input
        type="number"
        min={1}
        value={duracion}
        onChange={(e) => setDuracion(e.target.value)}
        style={{ ...inputStyle, marginBottom: 6 }}
      />
      <label style={{ display: 'block', fontSize: 10, color: t.textMuted }}>Fecha fin (calculada)</label>
      <input type="text" readOnly value={finCalc || '—'} style={{ ...inputStyle, marginBottom: 8, opacity: 0.9 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.text, marginBottom: 6 }}>
        <input type="checkbox" checked={overrideManual} onChange={(e) => setOverrideManual(e.target.checked)} />
        Override manual (prioriza este cronograma sobre la herencia del capítulo)
      </label>
      <button
        type="button"
        style={{ ...btnStyle(true, panelBusy), width: '100%' }}
        disabled={panelBusy}
        onClick={() =>
          onGuardar({
            fecha_inicio: fechaIni || null,
            duracion: duracion,
            override_manual: overrideManual,
            heredado_de_capitulo: !!ex.heredado_de_capitulo && !overrideManual,
          })
        }
      >
        Guardar ítem
      </button>
    </div>
  )
}
