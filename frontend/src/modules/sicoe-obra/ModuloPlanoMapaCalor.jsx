import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import SicoeFiltroObraVista from './SicoeFiltroObraVista'
import {
  sicoeBundleTieneCriteriosUsuario,
  sicoeEstadosReporteFiltro,
  sicoeFiltroSnapshot,
  sicoeFSicoeVacios,
  sicoePuedeVerFiltroSubcontratista,
} from './sicoeFiltroCatalogo'
import {
  cargarSicoeFiltroSesion,
  guardarSicoeFiltroSesion,
  limpiarSicoeFiltroSesion,
} from './sicoeFiltroSesion'
import { fetchSicoeMapaCalor } from './sicoeMapaCalorApi'
import { fmtCostoMapa } from './sicoeMapaCalorParams'
import { API_BASE } from '../../apiBase'
import { getContratoPlanoGeojson } from '../../contratoPlanoGeojsonCache'
import { sanitizePlanoFeatureCollection } from '../../geoPlanoSanitize'
import {
  MAPBOX_PLANO_PAINT_LABELS,
  MAPBOX_ABSCISA_TEXT_FIELD,
  addMapboxAbscisaLabelLayers,
  mapboxPlanoSymbolLayout,
  setMapboxAbscisaLabelsVisibility,
} from '../../mapboxPlanoLabels'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN || '').trim()
const EMPTY_FC = { type: 'FeatureCollection', features: [] }
const DEFAULT_CENTER = [-74.05, 4.72]

const FILTER_MAPBOX_LABEL_PK = [
  'all',
  ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
  ['>', ['length', ['to-string', ['get', 'pk_id']]], 0],
]

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
    try { el.removeEventListener('click', fn, true) } catch { /* ignore */ }
  }
}

const ETIQUETAS_VALIDACION = [
  '01. Ensayos de Laboratorio',
  '02. Certificados de Calidad',
  '03. Información y/o Entrega Topografía',
  '04. Entrega en obra',
  '05. Informe o Concepto Especialista',
  '06. Incluida dentro del precio',
  '07. Reportado en actas anteriores',
  '08. Pendiente por aprobación de precio',
  '09. Actividad sin concluir',
  '10. Precio no corresponde con la actividad',
  '11. Actualizar información',
  '12. Reproceso',
  '13. Actividad no ejecutada',
  '14. Relacionada con Balance de Obra',
]

function bundleVacio() {
  return {
    fSicoe: sicoeFSicoeVacios(),
    itemsChips: [],
    itemsOp: 'and',
    capasValidacion: [],
    capasValidacionOp: 'and',
    q_observacion: '',
    q_nodo: '',
    panelCapitulos: [],
    panelActasRpo: [],
  }
}

function bundleInicialDesdeSesion(contratoId) {
  if (!contratoId) return bundleVacio()
  try {
    const saved = cargarSicoeFiltroSesion(contratoId)
    if (saved && sicoeBundleTieneCriteriosUsuario(saved)) {
      return sicoeFiltroSnapshot(saved)
    }
  } catch { /* ignore */ }
  return bundleVacio()
}

function normalizePlanoFc(plano) {
  if (plano == null || plano === '') return EMPTY_FC
  let p = plano
  if (typeof p === 'string') {
    try { p = JSON.parse(p) } catch { return EMPTY_FC }
  }
  if (!p || typeof p !== 'object') return EMPTY_FC
  let fc
  if (p.type === 'FeatureCollection' && Array.isArray(p.features)) fc = p
  else if (p.type === 'Feature' && p.geometry) fc = { type: 'FeatureCollection', features: [p] }
  else if (Array.isArray(p.features)) fc = { type: 'FeatureCollection', features: p.features }
  else return EMPTY_FC
  try {
    return sanitizePlanoFeatureCollection(fc) || fc
  } catch {
    return fc
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

function boundsFromGeometry(geom) {
  if (!geom?.type) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let n = 0
  const consider = (lng, lat) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    n += 1
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const walk = (g) => {
    if (!g?.type) return
    if (g.type === 'GeometryCollection') {
      for (const sub of g.geometries || []) walk(sub)
      return
    }
    if (g.coordinates) forEachLngLat(g.coordinates, consider)
  }
  walk(geom)
  if (!n) return null
  return { minLng, maxLng, minLat, maxLat }
}

function boundsFromFeatureCollection(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || !feats.length) return null
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  let any = false
  for (const f of feats) {
    const b = f?.type === 'Feature' ? boundsFromGeometry(f.geometry) : boundsFromGeometry(f)
    if (!b) continue
    any = true
    if (b.minLng < minLng) minLng = b.minLng
    if (b.maxLng > maxLng) maxLng = b.maxLng
    if (b.minLat < minLat) minLat = b.minLat
    if (b.maxLat > maxLat) maxLat = b.maxLat
  }
  if (!any) return null
  return { minLng, maxLng, minLat, maxLat }
}

function boundsFromPoints(fc) {
  return boundsFromFeatureCollection(fc)
}

function fitMapBounds(map, bounds, { padding = 48, maxZoom = 17, duration = 0 } = {}) {
  if (!map || !bounds) return
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
  } catch { /* ignore */ }
}

function nivelEstadoResumen(props) {
  const parts = []
  for (let i = 1; i <= 6; i += 1) {
    const e = props?.[`nivel${i}`]
    if (e) parts.push(`N${i}: ${e}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}

function fmtFechaCorta(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return String(iso).slice(0, 10)
  }
}

/**
 * Plano Semáforo → mapa de calor de reportes SicoeObra por costo_directo,
 * sincronizado con el mismo bloque de filtros de la grilla.
 */
export default function ModuloPlanoMapaCalor({ t, usuario, token }) {
  const contratoId = usuario?.contrato_id
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const popupRef = useRef(null)
  const abortRef = useRef(null)
  const puntosRef = useRef(EMPTY_FC)
  const mapReadyRef = useRef(false)
  const centeredPlanoRef = useRef(false)
  const fetchGenRef = useRef(0)
  /** Evita doble GET: auto-sesión una vez; Buscar/Actualizar van por handler directo. */
  const autoBusquedaHechaRef = useRef(false)

  const [bundleAplicado, setBundleAplicado] = useState(() => bundleInicialDesdeSesion(contratoId))
  const [busquedaRealizada, setBusquedaRealizada] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [meta, setMeta] = useState(null)
  const [puntosFc, setPuntosFc] = useState(EMPTY_FC)
  const [planoGeojson, setPlanoGeojson] = useState(EMPTY_FC)
  const [centroContrato, setCentroContrato] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [mostrarPlano, setMostrarPlano] = useState(true)
  const [mostrarHeat, setMostrarHeat] = useState(true)
  const [mostrarPuntos, setMostrarPuntos] = useState(true)
  const [seleccionado, setSeleccionado] = useState(null)
  const [filtroSubcList, setFiltroSubcList] = useState([])
  const [nivelesDisponibles, setNivelesDisponibles] = useState([1, 2, 3])
  const [encabezadoPorNivel, setEncabezadoPorNivel] = useState({})

  const nivelInfo = useMemo(() => {
    const rol = String(usuario?.rol_nombre || usuario?.rol || '').toLowerCase()
    return {
      esInterventoria: rol.includes('intervent'),
      rolOrigen: rol,
    }
  }, [usuario])

  const estadosReporte = useMemo(
    () => sicoeEstadosReporteFiltro(usuario, nivelInfo),
    [usuario, nivelInfo],
  )
  const puedeVerSubcontratista = useMemo(
    () => sicoePuedeVerFiltroSubcontratista(usuario, contratoId),
    [usuario, contratoId],
  )

  const tieneCriterios = useMemo(
    () => sicoeBundleTieneCriteriosUsuario(bundleAplicado),
    [bundleAplicado],
  )

  const centrarEnProyecto = useCallback((map, { duration = 0 } = {}) => {
    if (!map) return false
    const bPlano = boundsFromFeatureCollection(planoGeojson)
    if (bPlano) {
      fitMapBounds(map, bPlano, { padding: 48, maxZoom: 17, duration })
      centeredPlanoRef.current = true
      return true
    }
    if (Array.isArray(centroContrato) && centroContrato.length >= 2) {
      try {
        map.jumpTo({ center: centroContrato, zoom: 13, bearing: 270, pitch: 0 })
        centeredPlanoRef.current = true
        return true
      } catch { /* ignore */ }
    }
    return false
  }, [planoGeojson, centroContrato])

  // Cargar plano + opciones auxiliares (filtros de sesión ya van en el state inicial)
  useEffect(() => {
    if (!contratoId || !token) return undefined
    centeredPlanoRef.current = false
    const hdrs = { Authorization: `Bearer ${token}` }
    fetch(`${API_BASE}/sicoe-obra/${contratoId}/subcontratistas-activos`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFiltroSubcList(Array.isArray(d) ? d : []))
      .catch(() => setFiltroSubcList([]))
    fetch(`${API_BASE}/sicoe-obra/${contratoId}/niveles-validacion`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        const na = Array.isArray(d.niveles_activos)
          ? d.niveles_activos.map(Number).filter((n) => n >= 1 && n <= 6)
          : []
        if (na.length) setNivelesDisponibles(na)
        const enc = {}
        const rows = Array.isArray(d.niveles) ? d.niveles : (Array.isArray(d) ? d : [])
        for (const row of rows) {
          if (row?.nivel != null) enc[row.nivel] = row.encabezado || row.nombre || `Nivel ${row.nivel}`
        }
        setEncabezadoPorNivel(enc)
      })
      .catch(() => {})

    let cancelled = false
    getContratoPlanoGeojson(API_BASE, contratoId, token)
      .then((d) => {
        if (cancelled) return
        setPlanoGeojson(normalizePlanoFc(d?.plano_geojson))
        const la = d?.centro_lat != null ? Number(d.centro_lat) : NaN
        const ln = d?.centro_lng != null ? Number(d.centro_lng) : NaN
        if (Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0)) {
          setCentroContrato([ln, la])
        } else {
          setCentroContrato(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlanoGeojson(EMPTY_FC)
          setCentroContrato(null)
        }
      })
    return () => { cancelled = true }
  }, [contratoId, token])

  // Si cambia el contrato, rehidratar filtros de sesión
  useEffect(() => {
    autoBusquedaHechaRef.current = false
    setBundleAplicado(bundleInicialDesdeSesion(contratoId))
    setBusquedaRealizada(false)
    setPuntosFc(EMPTY_FC)
    setMeta(null)
    setErrorMsg(null)
    setSeleccionado(null)
    puntosRef.current = EMPTY_FC
    fetchGenRef.current += 1
  }, [contratoId])

  const aplicarPuntosAlMapa = useCallback((fc, { fit = false } = {}) => {
    const map = mapInstance.current
    const data = fc?.type === 'FeatureCollection' ? fc : EMPTY_FC
    puntosRef.current = data
    if (!map || !mapReadyRef.current) return
    const src = map.getSource('sicoe-calor')
    if (src) {
      try { src.setData(data) } catch { /* ignore */ }
    }
    if (fit) {
      const bPts = boundsFromPoints(data)
      if (bPts) {
        fitMapBounds(map, bPts, { padding: 56, maxZoom: 16, duration: 600 })
      } else {
        centrarEnProyecto(map, { duration: 0 })
      }
    }
  }, [centrarEnProyecto])

  const cargarMapaCalor = useCallback(async (bundle) => {
    if (!contratoId || !token) return
    const gen = ++fetchGenRef.current
    if (!sicoeBundleTieneCriteriosUsuario(bundle)) {
      setPuntosFc(EMPTY_FC)
      setMeta(null)
      setBusquedaRealizada(false)
      aplicarPuntosAlMapa(EMPTY_FC)
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBuscando(true)
    setErrorMsg(null)
    try {
      const data = await fetchSicoeMapaCalor(contratoId, token, bundle, { signal: ac.signal })
      if (gen !== fetchGenRef.current) return
      if (!data || data.type !== 'FeatureCollection') {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : 'Respuesta inválida del mapa de calor',
        )
      }
      const fc = {
        type: 'FeatureCollection',
        features: Array.isArray(data.features) ? data.features : [],
      }
      setPuntosFc(fc)
      setMeta(data.meta || null)
      setBusquedaRealizada(true)
      aplicarPuntosAlMapa(fc, { fit: fc.features.length > 0 })
    } catch (e) {
      if (e?.name === 'AbortError') return
      if (gen !== fetchGenRef.current) return
      setErrorMsg(e?.message || String(e))
      setPuntosFc(EMPTY_FC)
      setMeta(null)
      setBusquedaRealizada(true)
      aplicarPuntosAlMapa(EMPTY_FC)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      if (gen === fetchGenRef.current) setBuscando(false)
    }
  }, [contratoId, token, aplicarPuntosAlMapa])

  // Auto-buscar una vez si la sesión ya trae criterios (el Bug previo: el effect no veía el bundle restaurado)
  useEffect(() => {
    if (!contratoId || !token) return
    if (!tieneCriterios) return
    if (autoBusquedaHechaRef.current || busquedaRealizada || buscando) return
    autoBusquedaHechaRef.current = true
    void cargarMapaCalor(bundleAplicado)
  }, [contratoId, token, tieneCriterios, bundleAplicado, busquedaRealizada, buscando, cargarMapaCalor])

  const onBuscar = useCallback((snap) => {
    const b = sicoeFiltroSnapshot(snap)
    setBundleAplicado(b)
    guardarSicoeFiltroSesion(contratoId, b)
    setSeleccionado(null)
    // Carga directa (el efecto de auto-búsqueda no reentra si ya está buscando / realizada)
    void cargarMapaCalor(b)
  }, [contratoId, cargarMapaCalor])

  const onLimpiar = useCallback(() => {
    fetchGenRef.current += 1
    if (abortRef.current) {
      try { abortRef.current.abort() } catch { /* ignore */ }
      abortRef.current = null
    }
    const vacio = bundleVacio()
    setBundleAplicado(vacio)
    limpiarSicoeFiltroSesion(contratoId)
    setBusquedaRealizada(false)
    setBuscando(false)
    setPuntosFc(EMPTY_FC)
    setMeta(null)
    setSeleccionado(null)
    setErrorMsg(null)
    aplicarPuntosAlMapa(EMPTY_FC)
    const map = mapInstance.current
    if (map) centrarEnProyecto(map, { duration: 400 })
  }, [contratoId, aplicarPuntosAlMapa, centrarEnProyecto])

  // Inicializar mapa Mapbox
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapRef.current) return undefined

    mapReadyRef.current = false
    setMapReady(false)
    if (mapInstance.current) {
      try { mapInstance.current.remove() } catch { /* ignore */ }
      mapInstance.current = null
    }

    mapboxgl.accessToken = MAPBOX_TOKEN
    const initialCenter = Array.isArray(centroContrato) ? centroContrato : DEFAULT_CENTER
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: initialCenter,
      zoom: 12,
      bearing: 270,
    })
    const unreg = installMapboxAttributionLinksOpenNewTab(map)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapInstance.current = map
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })

    const onLoad = () => {
      map.addSource('plano-underlay', {
        type: 'geojson',
        data: planoGeojson || EMPTY_FC,
      })
      map.addLayer({
        id: 'plano-underlay-fill',
        type: 'fill',
        source: 'plano-underlay',
        paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.14 },
      })
      map.addLayer({
        id: 'plano-underlay-line',
        type: 'line',
        source: 'plano-underlay',
        paint: { 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.4 },
      })
      map.addLayer({
        id: 'plano-underlay-labels-pk',
        type: 'symbol',
        source: 'plano-underlay',
        filter: FILTER_MAPBOX_LABEL_PK,
        layout: mapboxPlanoSymbolLayout(['get', 'pk_id']),
        paint: MAPBOX_PLANO_PAINT_LABELS,
      })
      try {
        addMapboxAbscisaLabelLayers(map, {
          idPrefix: 'plano-underlay-labels-abscisa',
          source: 'plano-underlay',
          layout: mapboxPlanoSymbolLayout(MAPBOX_ABSCISA_TEXT_FIELD),
          paint: MAPBOX_PLANO_PAINT_LABELS,
        })
      } catch { /* labels opcionales */ }

      map.addSource('sicoe-calor', {
        type: 'geojson',
        data: puntosRef.current || EMPTY_FC,
      })

      map.addLayer({
        id: 'sicoe-calor-heat',
        type: 'heatmap',
        source: 'sicoe-calor',
        maxzoom: 18,
        paint: {
          // weight ya viene normalizado 0–1 respecto al max costo_directo del filtro activo
          'heatmap-weight': [
            'interpolate', ['linear'],
            ['coalesce', ['to-number', ['get', 'weight']], 0],
            0, 0,
            1, 1,
          ],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 18, 15, 40],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)',
          ],
        },
      })

      map.addLayer({
        id: 'sicoe-calor-puntos',
        type: 'circle',
        source: 'sicoe-calor',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 3.5,
            14, 6.5,
            17, 9,
          ],
          'circle-color': [
            'interpolate', ['linear'],
            ['coalesce', ['to-number', ['get', 'weight']], 0],
            0, '#93c5fd',
            0.5, '#f59e0b',
            1, '#dc2626',
          ],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#0f172a',
          'circle-opacity': 0.92,
        },
      })

      map.on('mouseenter', 'sicoe-calor-puntos', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'sicoe-calor-puntos', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'sicoe-calor-puntos', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const props = { ...f.properties }
        if (props.costo_directo != null) props.costo_directo = Number(props.costo_directo)
        if (props.cantidad_total != null) props.cantidad_total = Number(props.cantidad_total)
        if (props.weight != null) props.weight = Number(props.weight)
        setSeleccionado(props)
        const coords = f.geometry?.coordinates
        if (coords && popupRef.current) {
          const html = `
            <div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.45;color:#0f172a;">
              <div style="font-weight:800;margin-bottom:6px;color:#0369a1;">
                Reg. ${props.numero_registro ?? '—'} · Rep. ${props.numero_reporte ?? '—'}
              </div>
              <div><strong>Costo directo:</strong> ${fmtCostoMapa(props.costo_directo)}</div>
              <div><strong>Fecha:</strong> ${fmtFechaCorta(props.created_at)}</div>
              <div><strong>Capítulo:</strong> ${props.capitulo || '—'}</div>
              <div><strong>Ítem:</strong> ${props.item_numero || '—'} ${props.item_descripcion ? `· ${String(props.item_descripcion).slice(0, 80)}` : ''}</div>
              <div><strong>Estado reporte:</strong> ${props.estado_reporte || '—'}</div>
              <div><strong>Validación:</strong> ${nivelEstadoResumen(props)}</div>
            </div>`
          popupRef.current.setLngLat(coords).setHTML(html).addTo(map)
        }
      })

      try { map.resize() } catch { /* ignore */ }
      mapReadyRef.current = true
      setMapReady(true)
      centrarEnProyecto(map, { duration: 0 })
      const srcCalor = map.getSource('sicoe-calor')
      if (srcCalor) {
        try { srcCalor.setData(puntosRef.current || EMPTY_FC) } catch { /* ignore */ }
      }
    }

    if (map.loaded()) onLoad()
    else map.on('load', onLoad)

    let ro
    try {
      ro = new ResizeObserver(() => {
        try { map.resize() } catch { /* ignore */ }
      })
      if (mapRef.current) ro.observe(mapRef.current)
    } catch { /* ResizeObserver no disponible */ }

    return () => {
      mapReadyRef.current = false
      try { ro?.disconnect() } catch { /* ignore */ }
      try { unreg() } catch { /* ignore */ }
      try { popupRef.current?.remove() } catch { /* ignore */ }
      try { map.remove() } catch { /* ignore */ }
      mapInstance.current = null
      setMapReady(false)
    }
  // Recrear al cambiar tema; el plano/centro se aplican por efectos aparte
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.bg, contratoId])

  // Actualizar underlay + recentrar al proyecto cuando llega el plano
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return
    const src = map.getSource('plano-underlay')
    if (src) {
      try { src.setData(planoGeojson || EMPTY_FC) } catch { /* ignore */ }
    }
    const nPts = puntosRef.current?.features?.length || 0
    if (!nPts) centrarEnProyecto(map, { duration: centeredPlanoRef.current ? 0 : 400 })
  }, [planoGeojson, centroContrato, mapReady, centrarEnProyecto])

  // Visibilidad de capas
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return
    const visPlano = mostrarPlano ? 'visible' : 'none'
    const visHeat = mostrarHeat ? 'visible' : 'none'
    const visPts = mostrarPuntos ? 'visible' : 'none'
    for (const id of ['plano-underlay-fill', 'plano-underlay-line', 'plano-underlay-labels-pk']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visPlano)
    }
    try {
      setMapboxAbscisaLabelsVisibility(map, 'plano-underlay-labels-abscisa', mostrarPlano)
    } catch { /* ignore */ }
    if (map.getLayer('sicoe-calor-heat')) map.setLayoutProperty('sicoe-calor-heat', 'visibility', visHeat)
    if (map.getLayer('sicoe-calor-puntos')) map.setLayoutProperty('sicoe-calor-puntos', 'visibility', visPts)
  }, [mostrarPlano, mostrarHeat, mostrarPuntos, mapReady])

  // Sync puntos cuando el mapa queda listo o cambia la data
  useEffect(() => {
    if (!mapReady) return
    aplicarPuntosAlMapa(puntosFc)
  }, [puntosFc, mapReady, aplicarPuntosAlMapa])

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: '24px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, maxWidth: '520px' }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: t.primary }}>Mapbox sin token</div>
        <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.5 }}>
          Falta <code style={{ fontSize: 12 }}>VITE_MAPBOX_TOKEN</code> en el <code style={{ fontSize: 12 }}>.env</code> del frontend.
        </p>
      </div>
    )
  }

  const nPts = puntosFc?.features?.length || 0
  const sinCoords = meta?.sin_coords || 0
  const totalRegs = meta?.total_registros || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 140px)' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
            🗺️ Mapa de calor · Reportes por costo directo
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
            Intensidad relativa al filtro activo: el mayor <em>costo directo</em> del conjunto filtrado = calor máximo.
            Sin filtros no se muestra ningún dato.
          </div>
        </div>
        <SicoeFiltroObraVista
          t={t}
          contratoId={contratoId}
          token={token}
          bundleAplicado={bundleAplicado}
          onBuscar={onBuscar}
          onLimpiar={onLimpiar}
          onActualizar={() => void cargarMapaCalor(bundleAplicado)}
          actualizarDisabled={!tieneCriterios || buscando}
          buscando={buscando}
          puedeExportar={false}
          puedeVerSubcontratista={puedeVerSubcontratista}
          estadosReporte={estadosReporte}
          etiquetasValidacion={ETIQUETAS_VALIDACION}
          nivelesDisponibles={nivelesDisponibles}
          encabezadoPorNivel={encabezadoPorNivel}
          filtroSubcList={filtroSubcList}
          busquedaRealizada={busquedaRealizada}
        />
      </div>

      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 320,
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${t.border}`,
      }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 5,
          background: `${t.bgCard}EE`, border: `1px solid ${t.border}`,
          borderRadius: 10, padding: '8px 10px', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[
            ['plano', 'Plano base', mostrarPlano, setMostrarPlano],
            ['heat', 'Mapa de calor', mostrarHeat, setMostrarHeat],
            ['pts', 'Puntos', mostrarPuntos, setMostrarPuntos],
          ].map(([key, label, on, setOn]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-caption)', color: t.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        {!tieneCriterios && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            maxWidth: 420, textAlign: 'center', zIndex: 6,
            background: `${t.bgCard}F5`, border: `1px solid ${t.border}`,
            borderRadius: 12, padding: '16px 20px', boxShadow: t.shadow,
          }}>
            <div style={{ fontWeight: 800, color: t.text, marginBottom: 6 }}>Defina filtros para ver el mapa</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              Abra <strong>Filtros</strong>, elija criterios (capítulo, fechas, subcontratista, etc.)
              y pulse <strong>Buscar</strong>. El calor se escala al mayor costo directo de ese resultado.
            </div>
          </div>
        )}

        {tieneCriterios && busquedaRealizada && !buscando && nPts === 0 && !errorMsg && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            maxWidth: 440, textAlign: 'center', zIndex: 6,
            background: `${t.bgCard}F5`, border: `1px solid ${t.border}`,
            borderRadius: 12, padding: '16px 20px', boxShadow: t.shadow,
          }}>
            <div style={{ fontWeight: 800, color: t.text, marginBottom: 6 }}>Sin puntos georreferenciados</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              {totalRegs > 0
                ? `Hay ${totalRegs} registro${totalRegs === 1 ? '' : 's'} con el filtro actual, pero ${sinCoords || totalRegs} sin coordenadas GPS.`
                : 'Ningún registro cumple los filtros activos.'}
            </div>
          </div>
        )}

        {buscando && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 4,
            background: 'rgba(15,23,42,0.25)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
          }}>
            Actualizando mapa de calor…
          </div>
        )}

        {errorMsg && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 7, maxWidth: 480, background: '#FEF2F2', color: '#B91C1C',
            border: '1px solid #FECACA', borderRadius: 10, padding: '8px 12px',
            fontSize: 'var(--cc-caption)',
          }}>
            {errorMsg}
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 20, left: 12, zIndex: 5,
          background: `${t.bgCard}EE`, border: `1px solid ${t.border}`,
          borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
            INTENSIDAD RELATIVA · COSTO DIRECTO
          </div>
          <div style={{
            height: 10, borderRadius: 6, marginBottom: 6,
            background: 'linear-gradient(90deg,#2166ac,#fdae61,#b2182b)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            <span>Menor del filtro</span>
            <span>Máx. del filtro</span>
          </div>
          {busquedaRealizada && meta && (
            <div style={{ marginTop: 8, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
              {nPts} punto{nPts === 1 ? '' : 's'}
              {meta.max_costo_directo != null ? ` · máx ${fmtCostoMapa(meta.max_costo_directo)}` : ''}
              {meta.sin_coords ? ` · ${meta.sin_coords} sin coords` : ''}
              {meta.truncado ? ` · truncado a ${meta.max_features}` : ''}
            </div>
          )}
        </div>

        {seleccionado && (
          <div style={{
            position: 'absolute', top: 12, right: 56, zIndex: 6,
            background: `${t.bgCard}F2`, border: `1px solid ${t.border}`,
            borderRadius: 10, padding: '12px 14px', minWidth: 240, maxWidth: 320,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-sm)' }}>
                Reg. {seleccionado.numero_registro ?? '—'} · Rep. {seleccionado.numero_reporte ?? '—'}
              </div>
              <button
                type="button"
                onClick={() => { setSeleccionado(null); try { popupRef.current?.remove() } catch { /* */ } }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 'var(--cc-lg)' }}
              >
                ✕
              </button>
            </div>
            {[
              ['Costo directo', fmtCostoMapa(seleccionado.costo_directo)],
              ['Fecha', fmtFechaCorta(seleccionado.created_at)],
              ['Capítulo', seleccionado.capitulo || '—'],
              ['Ítem', seleccionado.item_numero || '—'],
              ['Cantidad', seleccionado.cantidad_total != null ? String(seleccionado.cantidad_total) : '—'],
              ['Estado reporte', seleccionado.estado_reporte || '—'],
              ['Validación', nivelEstadoResumen(seleccionado)],
              ['PK / tramo', [seleccionado.pk_id_id, seleccionado.tramo, seleccionado.margen].filter(Boolean).join(' · ') || '—'],
              ['Origen coords', seleccionado.origen_coord === 'reporte' ? 'Reporte (loc. única)' : 'Registro'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>{k}</span>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.text, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            {seleccionado.item_descripcion && (
              <div style={{ marginTop: 6, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
                {String(seleccionado.item_descripcion).slice(0, 160)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
