import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import SicoeFiltroObraVista from './SicoeFiltroObraVista'
import {
  sicoeBundleTieneCriteriosUsuario,
  sicoeEstadosReporteFiltro,
  sicoeFiltroSnapshot,
  sicoePuedeVerFiltroSubcontratista,
} from './sicoeFiltroCatalogo'
import {
  cargarSicoeFiltroSesion,
  guardarSicoeFiltroSesion,
  limpiarSicoeFiltroSesion,
} from './sicoeFiltroSesion'
import { fetchSicoeMapaCalor } from './sicoeMapaCalorApi'
import { fmtCostoMapa } from './sicoeMapaCalorParams'
import { construirCalorSobreDibujos, weightColorExpr } from './sicoeMapaCalorDibujos'
import {
  CLARAGIS_HINT,
  CLARAGIS_TITULO,
  claraGisAnotarFocoFeatures,
  claraGisBundleFocoItem,
  claraGisBundleNoRevisado,
  claraGisBundleVacio,
  claraGisEsMesaValidador,
  claraGisOpacidadExpr,
  claraGisStrokeWidthExpr,
} from './claraGisMesaValidacion'
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
import { useTopoNivelacionMapaCapa } from '../../components/topografia/useTopoNivelacionMapaCapa'
import { addMapboxGeolocateControl } from '../../mapboxSafe'
import { useClaraViewport } from '../../useClaraViewport'

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
  return claraGisBundleVacio()
}

function bundleInicialClaraGis(contratoId, capasIniciales, usuario) {
  if (!contratoId) return bundleVacio()
  try {
    const saved = cargarSicoeFiltroSesion(contratoId)
    if (saved && sicoeBundleTieneCriteriosUsuario(saved)) {
      return sicoeFiltroSnapshot(saved)
    }
  } catch { /* ignore */ }
  if (claraGisEsMesaValidador(usuario, contratoId, capasIniciales)) {
    return claraGisBundleNoRevisado(capasIniciales)
  }
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

/**
 * ClaraGIS (antes Plano Semáforo): mapa de calor + mesa de validación.
 */
export default function ModuloPlanoMapaCalor({
  t,
  usuario,
  token,
  capasInicialesValidacion = [],
  renderEmbedCarpeta = null,
}) {
  const contratoId = usuario?.contrato_id
  const { isMobile: vpMobile, isLandscapeMobile, isTablet, isNavDrawer, isDesktop } = useClaraViewport()
  /** Móvil + tablet (incl. landscape/iPad): capas e intensidad como iconos. Escritorio ancho: paneles compactos abiertos. */
  const panelsAsIcons = vpMobile || isLandscapeMobile || isTablet || isNavDrawer || !isDesktop

  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const abortRef = useRef(null)
  const puntosRef = useRef(EMPTY_FC)
  const mapReadyRef = useRef(false)
  const centeredPlanoRef = useRef(false)
  const fetchGenRef = useRef(0)
  const autoBusquedaHechaRef = useRef(false)
  const allHuellasRef = useRef([])
  const heatFcRef = useRef(EMPTY_FC)
  const trabajoBundleRef = useRef(null)
  const focoActivoRef = useRef(false)
  const abrirReporteRef = useRef(null)

  const [bundleAplicado, setBundleAplicado] = useState(() =>
    bundleInicialClaraGis(contratoId, capasInicialesValidacion, usuario),
  )
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
  const [mostrarHuellas, setMostrarHuellas] = useState(true)
  const [mostrarEje, setMostrarEje] = useState(true)
  const [mostrarNodos, setMostrarNodos] = useState(false)
  const [leyendaVista, setLeyendaVista] = useState({ con_dibujo: 0, sin_dibujo: 0 })
  const getMapNiv = useCallback(() => mapInstance.current, [])
  const capaNiv = useTopoNivelacionMapaCapa(getMapNiv, contratoId, token, { readyKey: mapReady })
  const [filtroSubcList, setFiltroSubcList] = useState([])
  const [nivelesDisponibles, setNivelesDisponibles] = useState([1, 2, 3])
  const [encabezadoPorNivel, setEncabezadoPorNivel] = useState({})
  const [panelAbierto, setPanelAbierto] = useState(null) // 'filtros' | 'capas' | 'intensidad' | null
  const [openFiltroSignal, setOpenFiltroSignal] = useState(0)
  const [embedReporte, setEmbedReporte] = useState(null)
  const [embedMin, setEmbedMin] = useState(false)
  const [embedCargando, setEmbedCargando] = useState(false)
  const [focoRevision, setFocoRevision] = useState(null) // { registroId, itemNumero }

  const nivelInfo = useMemo(() => {
    const rol = String(usuario?.rol_nombre || usuario?.rol || '').toLowerCase()
    return {
      esInterventoria: rol.includes('intervent'),
      rolOrigen: rol,
    }
  }, [usuario])

  const esMesaValidador = useMemo(
    () => claraGisEsMesaValidador(usuario, contratoId, capasInicialesValidacion),
    [usuario, contratoId, capasInicialesValidacion],
  )

  const estadosReporte = useMemo(
    () => sicoeEstadosReporteFiltro(usuario, nivelInfo, contratoId),
    [usuario, nivelInfo, contratoId],
  )
  const puedeVerSubcontratista = useMemo(
    () => sicoePuedeVerFiltroSubcontratista(usuario, contratoId),
    [usuario, contratoId],
  )

  const tieneCriterios = useMemo(
    () => sicoeBundleTieneCriteriosUsuario(bundleAplicado),
    [bundleAplicado],
  )

  const focusActive = !!(focoRevision?.registroId)

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

  const aplicarPaintFoco = useCallback((map, activo) => {
    if (!map) return
    try {
      if (map.getLayer('sicoe-calor-puntos')) {
        map.setPaintProperty('sicoe-calor-puntos', 'circle-opacity', claraGisOpacidadExpr(0.92, { focusActive: activo }))
        map.setPaintProperty('sicoe-calor-puntos', 'circle-stroke-width', claraGisStrokeWidthExpr(2.8, { focusActive: activo }))
        map.setPaintProperty(
          'sicoe-calor-puntos',
          'circle-stroke-color',
          activo
            ? ['case', ['==', ['get', 'claragis_modo'], 'activo'], '#fbbf24', '#f8fafc']
            : '#f8fafc',
        )
        map.setPaintProperty(
          'sicoe-calor-puntos',
          'circle-radius',
          activo
            ? [
              'case',
              ['==', ['get', 'claragis_modo'], 'activo'],
              ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 14, 17, 18],
              ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 17, 9],
            ]
            : ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8, 17, 11],
        )
      }
      if (map.getLayer('sicoe-huellas-fill')) {
        map.setPaintProperty(
          'sicoe-huellas-fill',
          'fill-opacity',
          activo
            ? [
              'case',
              ['==', ['get', 'claragis_modo'], 'activo'], 0.82,
              ['==', ['get', 'claragis_modo'], 'referencia'], 0.22,
              0.05,
            ]
            : [
              'case',
              ['==', ['get', 'color_mode'], 'calor'],
              0.55,
              ['case', ['==', ['get', 'precision'], 'precisa'], 0.4, 0.22],
            ],
        )
      }
      if (map.getLayer('sicoe-huellas-line')) {
        map.setPaintProperty(
          'sicoe-huellas-line',
          'line-width',
          activo
            ? [
              'case',
              ['==', ['get', 'claragis_modo'], 'activo'], 4.2,
              ['==', ['get', 'claragis_modo'], 'referencia'], 1.2,
              0.6,
            ]
            : [
              'case',
              ['==', ['get', 'color_mode'], 'calor'],
              2.4,
              1.4,
            ],
        )
        map.setPaintProperty(
          'sicoe-huellas-line',
          'line-opacity',
          activo
            ? [
              'case',
              ['==', ['get', 'claragis_modo'], 'activo'], 1,
              ['==', ['get', 'claragis_modo'], 'referencia'], 0.35,
              0.08,
            ]
            : 1,
        )
      }
      if (map.getLayer('sicoe-huellas-nodo-lod')) {
        map.setPaintProperty(
          'sicoe-huellas-nodo-lod',
          'circle-opacity',
          claraGisOpacidadExpr(0.95, { focusActive: activo }),
        )
        map.setPaintProperty(
          'sicoe-huellas-nodo-lod',
          'circle-stroke-color',
          activo
            ? ['case', ['==', ['get', 'claragis_modo'], 'activo'], '#fbbf24', '#fff']
            : '#fff',
        )
      }
    } catch { /* ignore */ }
  }, [])

  const aplicarPuntosAlMapa = useCallback((fc, { fit = false, registroFocoId = null } = {}) => {
    const map = mapInstance.current
    const raw = fc?.type === 'FeatureCollection' ? fc : EMPTY_FC
    const data = claraGisAnotarFocoFeatures(raw, registroFocoId ?? focoRevision?.registroId)
    heatFcRef.current = data
    puntosRef.current = data
    if (!map || !mapReadyRef.current) return

    const joined = construirCalorSobreDibujos(data, allHuellasRef.current)
    // Propagar claragis_modo a dibujos unidos
    const rid = registroFocoId != null ? String(registroFocoId) : (focoRevision?.registroId != null ? String(focoRevision.registroId) : null)
    if (rid && joined.dibujosFc?.features) {
      joined.dibujosFc = {
        ...joined.dibujosFc,
        features: joined.dibujosFc.features.map((f) => {
          const id = f?.properties?.id != null
            ? String(f.properties.id)
            : (f?.properties?.registro_id != null ? String(f.properties.registro_id) : '')
          return {
            ...f,
            properties: {
              ...(f.properties || {}),
              claragis_modo: id && id === rid ? 'activo' : 'referencia',
            },
          }
        }),
      }
    }
    if (rid && joined.puntosSinDibujoFc?.features) {
      joined.puntosSinDibujoFc = claraGisAnotarFocoFeatures(joined.puntosSinDibujoFc, rid)
    }

    setLeyendaVista({
      con_dibujo: joined.meta.con_dibujo,
      sin_dibujo: joined.meta.sin_dibujo,
    })

    const srcDib = map.getSource('sicoe-huellas')
    if (srcDib) {
      try { srcDib.setData(joined.dibujosFc) } catch { /* ignore */ }
    }
    const srcPts = map.getSource('sicoe-calor')
    if (srcPts) {
      try { srcPts.setData(joined.puntosSinDibujoFc) } catch { /* ignore */ }
    }

    aplicarPaintFoco(map, !!rid)
    focoActivoRef.current = !!rid

    if (fit) {
      const feats = [
        ...(joined.dibujosFc.features || []),
        ...(joined.puntosSinDibujoFc.features || []),
      ]
      const bPts = boundsFromPoints({ type: 'FeatureCollection', features: feats })
      if (bPts) {
        fitMapBounds(map, bPts, { padding: 56, maxZoom: 16, duration: 600 })
      } else {
        centrarEnProyecto(map, { duration: 0 })
      }
    }
  }, [centrarEnProyecto, aplicarPaintFoco, focoRevision?.registroId])

  const cargarMapaCalor = useCallback(async (bundle, { registroFocoId = null, fit = true } = {}) => {
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
      // Dibujos del botón Dibujar / huellas del conjunto filtrado (vienen en analisis).
      const dibujosFeats = Array.isArray(data.dibujos?.features)
        ? data.dibujos.features
        : []
      allHuellasRef.current = dibujosFeats
      setPuntosFc(fc)
      setMeta(data.meta || null)
      setBusquedaRealizada(true)
      aplicarPuntosAlMapa(fc, {
        fit: fit && fc.features.length > 0,
        registroFocoId,
      })
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

  const restaurarBloqueTrabajo = useCallback(() => {
    setFocoRevision(null)
    const base = trabajoBundleRef.current
      || (esMesaValidador
        ? claraGisBundleNoRevisado(capasInicialesValidacion)
        : bundleAplicado)
    const b = sicoeFiltroSnapshot(base)
    setBundleAplicado(b)
    guardarSicoeFiltroSesion(contratoId, b)
    void cargarMapaCalor(b)
  }, [esMesaValidador, capasInicialesValidacion, bundleAplicado, contratoId, cargarMapaCalor])

  // Plano + auxiliares
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

  // Cambio de contrato / capas iniciales (firma estable de capas)
  const capasIniKey = useMemo(
    () => (Array.isArray(capasInicialesValidacion) ? capasInicialesValidacion : [])
      .map((c) => `${c?.nivel}:${c?.estado}`)
      .join('|'),
    [capasInicialesValidacion],
  )

  useEffect(() => {
    autoBusquedaHechaRef.current = false
    const inicial = bundleInicialClaraGis(contratoId, capasInicialesValidacion, usuario)
    setBundleAplicado(inicial)
    trabajoBundleRef.current = esMesaValidador
      ? claraGisBundleNoRevisado(capasInicialesValidacion)
      : (sicoeBundleTieneCriteriosUsuario(inicial) ? inicial : null)
    if (sicoeBundleTieneCriteriosUsuario(inicial)) {
      try { guardarSicoeFiltroSesion(contratoId, inicial) } catch { /* ignore */ }
    }
    setBusquedaRealizada(false)
    setPuntosFc(EMPTY_FC)
    setMeta(null)
    setErrorMsg(null)
    setEmbedReporte(null)
    setEmbedMin(false)
    setFocoRevision(null)
    puntosRef.current = EMPTY_FC
    fetchGenRef.current += 1
  // capasIniKey evita reinicios por nueva referencia de array idéntico
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, capasIniKey, esMesaValidador])

  useEffect(() => {
    if (!contratoId || !token) return
    if (!tieneCriterios) return
    if (autoBusquedaHechaRef.current || busquedaRealizada || buscando) return
    autoBusquedaHechaRef.current = true
    if (!trabajoBundleRef.current && esMesaValidador) {
      trabajoBundleRef.current = claraGisBundleNoRevisado(capasInicialesValidacion)
    } else if (!trabajoBundleRef.current && tieneCriterios) {
      trabajoBundleRef.current = bundleAplicado
    }
    void cargarMapaCalor(bundleAplicado)
  }, [contratoId, token, tieneCriterios, bundleAplicado, busquedaRealizada, buscando, cargarMapaCalor, esMesaValidador, capasInicialesValidacion])

  const onBuscar = useCallback((snap) => {
    const b = sicoeFiltroSnapshot(snap)
    setBundleAplicado(b)
    guardarSicoeFiltroSesion(contratoId, b)
    if (!focoRevision) trabajoBundleRef.current = b
    setPanelAbierto(null)
    void cargarMapaCalor(b)
  }, [contratoId, cargarMapaCalor, focoRevision])

  const onLimpiar = useCallback(() => {
    fetchGenRef.current += 1
    if (abortRef.current) {
      try { abortRef.current.abort() } catch { /* ignore */ }
      abortRef.current = null
    }
    const vacio = bundleVacio()
    setBundleAplicado(vacio)
    limpiarSicoeFiltroSesion(contratoId)
    trabajoBundleRef.current = esMesaValidador
      ? claraGisBundleNoRevisado(capasInicialesValidacion)
      : null
    setBusquedaRealizada(false)
    setBuscando(false)
    setPuntosFc(EMPTY_FC)
    setMeta(null)
    setErrorMsg(null)
    setLeyendaVista({ con_dibujo: 0, sin_dibujo: 0 })
    setFocoRevision(null)
    aplicarPuntosAlMapa(EMPTY_FC)
    const map = mapInstance.current
    if (map) centrarEnProyecto(map, { duration: 400 })
  }, [contratoId, aplicarPuntosAlMapa, centrarEnProyecto, esMesaValidador, capasInicialesValidacion])

  const abrirReporteDesdeMapa = useCallback(async (props) => {
    const reporteId = props?.reporte_id
    const registroId = props?.id
    if (!reporteId || !contratoId || !token) return
    setEmbedCargando(true)
    setEmbedMin(false)
    setEmbedReporte({
      id: reporteId,
      numero_reporte: props?.numero_reporte,
      _cargandoDetalle: true,
      registros: [],
      puntos: [],
      ...(registroId != null ? { _autoRegistro: registroId } : {}),
    })
    try {
      const res = await fetch(`${API_BASE}/sicoe-obra/${contratoId}/reportes/${reporteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`No se pudo abrir el reporte (${res.status})`)
      const data = await res.json()
      setEmbedReporte({
        ...data,
        _cargandoDetalle: false,
        ...(registroId != null ? { _autoRegistro: registroId } : {}),
      })
    } catch (e) {
      setErrorMsg(e?.message || String(e))
      setEmbedReporte(null)
    } finally {
      setEmbedCargando(false)
    }
  }, [contratoId, token])

  abrirReporteRef.current = abrirReporteDesdeMapa

  const onRegistroExpandidoChange = useCallback((info) => {
    if (!info?.registroId) {
      if (focoRevision) restaurarBloqueTrabajo()
      return
    }
    const item = String(info.itemNumero || '').trim()
    if (!item) {
      setFocoRevision({ registroId: info.registroId, itemNumero: null })
      aplicarPuntosAlMapa(puntosRef.current, { registroFocoId: info.registroId, fit: true })
      return
    }
    if (!trabajoBundleRef.current) {
      trabajoBundleRef.current = sicoeFiltroSnapshot(bundleAplicado)
    }
    const focoBundle = claraGisBundleFocoItem(item, info.itemDescripcion)
    setFocoRevision({ registroId: info.registroId, itemNumero: item })
    setBundleAplicado(focoBundle)
    void cargarMapaCalor(focoBundle, { registroFocoId: info.registroId, fit: true })
  }, [focoRevision, restaurarBloqueTrabajo, aplicarPuntosAlMapa, bundleAplicado, cargarMapaCalor])

  const cerrarEmbed = useCallback(() => {
    setEmbedReporte(null)
    setEmbedMin(false)
    if (focoRevision) restaurarBloqueTrabajo()
    else if (esMesaValidador) {
      const b = claraGisBundleNoRevisado(capasInicialesValidacion)
      trabajoBundleRef.current = b
      setBundleAplicado(b)
      guardarSicoeFiltroSesion(contratoId, b)
      void cargarMapaCalor(b)
    }
  }, [focoRevision, restaurarBloqueTrabajo, esMesaValidador, capasInicialesValidacion, contratoId, cargarMapaCalor])

  // Inicializar mapa
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
    // Abajo a la derecha: la ventana incrustada del reporte vive arriba a la derecha.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right')
    addMapboxGeolocateControl(map, 'bottom-right')
    mapInstance.current = map

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
        layout: { visibility: 'none' },
        paint: {
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
            10, 5,
            14, 8,
            17, 11,
          ],
          'circle-color': weightColorExpr(),
          'circle-stroke-width': 2.8,
          'circle-stroke-color': '#f8fafc',
          'circle-opacity': 0.92,
          'circle-pitch-alignment': 'map',
        },
      })
      map.addLayer({
        id: 'sicoe-calor-puntos-halo',
        type: 'circle',
        source: 'sicoe-calor',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 8,
            14, 12,
            17, 16,
          ],
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
          'circle-opacity': 0.9,
        },
      })

      map.addSource('sicoe-eje', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'sicoe-eje-line',
        type: 'line',
        source: 'sicoe-eje',
        paint: { 'line-color': '#0ea5e9', 'line-width': 2.2, 'line-opacity': 0.8 },
        layout: { visibility: 'visible' },
      })
      map.addSource('sicoe-huellas', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'sicoe-huellas-fill',
        type: 'fill',
        source: 'sicoe-huellas',
        filter: [
          'all',
          ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
          ['!=', ['get', 'is_lod_marker'], 1],
          ['any',
            ['all',
              ['!=', ['get', 'huella_tipo'], 'nodo'],
              ['!=', ['get', 'huella_tipo'], 'punto'],
            ],
            ['>=', ['zoom'], 16],
          ],
        ],
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'color_mode'], 'calor'],
            weightColorExpr(),
            [
              'case',
              ['==', ['get', 'precision'], 'precisa'],
              '#2563eb',
              '#94a3b8',
            ],
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'color_mode'], 'calor'],
            0.55,
            [
              'case',
              ['==', ['get', 'precision'], 'precisa'],
              0.4,
              0.22,
            ],
          ],
        },
      })
      map.addLayer({
        id: 'sicoe-huellas-line',
        type: 'line',
        source: 'sicoe-huellas',
        filter: ['!=', ['get', 'is_lod_marker'], 1],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'color_mode'], 'calor'],
            weightColorExpr(),
            [
              'case',
              ['==', ['get', 'precision'], 'precisa'],
              '#1d4ed8',
              '#64748b',
            ],
          ],
          'line-width': [
            'case',
            ['==', ['get', 'color_mode'], 'calor'],
            2.4,
            1.4,
          ],
          'line-dasharray': [
            'case',
            ['==', ['get', 'precision'], 'aproximada'],
            ['literal', [1.5, 1.5]],
            ['literal', [1, 0]],
          ],
        },
      })
      map.addLayer({
        id: 'sicoe-huellas-nodo-lod',
        type: 'circle',
        source: 'sicoe-huellas',
        filter: ['==', ['get', 'is_lod_marker'], 1],
        maxzoom: 16.5,
        paint: {
          'circle-color': [
            'case',
            ['==', ['get', 'color_mode'], 'calor'],
            weightColorExpr(),
            '#2563eb',
          ],
          'circle-radius': 7,
          'circle-stroke-width': 1.6,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.95,
        },
      })
      map.addSource('sicoe-nodos', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'sicoe-nodos-fill',
        type: 'fill',
        source: 'sicoe-nodos',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.28 },
      })
      map.addLayer({
        id: 'sicoe-nodos-line',
        type: 'line',
        source: 'sicoe-nodos',
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#6d28d9', 'line-width': 1.5 },
      })
      map.addLayer({
        id: 'sicoe-nodos-point',
        type: 'circle',
        source: 'sicoe-nodos',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#7c3aed',
          'circle-radius': 5,
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.95,
        },
      })

      // Solo eje + nodos PK (liviano). Los dibujos filtrados llegan en analisis?formato=mapa_calor.
      fetch(`${API_BASE}/sicoe-obra/${contratoId}/huellas?incluir_eje=true&incluir_nodos=true&incluir_huellas=false`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || !mapInstance.current) return
          try {
            map.getSource('sicoe-eje')?.setData(data.eje || EMPTY_FC)
            map.getSource('sicoe-nodos')?.setData(data.nodos || EMPTY_FC)
            // No pisar allHuellasRef: ya viene de analisis.dibujos del filtro activo.
            if (heatFcRef.current?.features?.length && allHuellasRef.current.length) {
              const joined = construirCalorSobreDibujos(heatFcRef.current, allHuellasRef.current)
              map.getSource('sicoe-huellas')?.setData(joined.dibujosFc)
              map.getSource('sicoe-calor')?.setData(joined.puntosSinDibujoFc)
              setLeyendaVista({
                con_dibujo: joined.meta.con_dibujo,
                sin_dibujo: joined.meta.sin_dibujo,
              })
            }
          } catch { /* ignore */ }
        })
        .catch(() => {})

      const abrirDesdeFeature = (props) => {
        if (!props) return
        const p = { ...props }
        if (typeof abrirReporteRef.current === 'function') {
          void abrirReporteRef.current(p)
        }
      }

      map.on('mouseenter', 'sicoe-calor-puntos', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'sicoe-calor-puntos', () => { map.getCanvas().style.cursor = '' })
      map.on('click', 'sicoe-calor-puntos', (e) => {
        const f = e.features?.[0]
        if (!f) return
        abrirDesdeFeature(f.properties)
      })
      for (const layerId of ['sicoe-huellas-fill', 'sicoe-huellas-line', 'sicoe-huellas-nodo-lod']) {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
        map.on('click', layerId, (e) => {
          const f = e.features?.[0]
          if (!f || f.properties?.color_mode !== 'calor') return
          abrirDesdeFeature(f.properties)
        })
      }

      try { map.resize() } catch { /* ignore */ }
      mapReadyRef.current = true
      setMapReady(true)
      centrarEnProyecto(map, { duration: 0 })
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
      try { map.remove() } catch { /* ignore */ }
      mapInstance.current = null
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.bg, contratoId])

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

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return
    const visPlano = mostrarPlano ? 'visible' : 'none'
    const visPts = mostrarPuntos ? 'visible' : 'none'
    const visEje = mostrarEje ? 'visible' : 'none'
    const visHuellas = (mostrarHuellas || mostrarHeat) ? 'visible' : 'none'
    const visNodos = mostrarNodos ? 'visible' : 'none'
    for (const id of ['plano-underlay-fill', 'plano-underlay-line', 'plano-underlay-labels-pk']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visPlano)
    }
    try {
      setMapboxAbscisaLabelsVisibility(map, 'plano-underlay-labels-abscisa', mostrarPlano)
    } catch { /* ignore */ }
    if (map.getLayer('sicoe-calor-heat')) map.setLayoutProperty('sicoe-calor-heat', 'visibility', 'none')
    if (map.getLayer('sicoe-calor-puntos')) map.setLayoutProperty('sicoe-calor-puntos', 'visibility', visPts)
    if (map.getLayer('sicoe-calor-puntos-halo')) map.setLayoutProperty('sicoe-calor-puntos-halo', 'visibility', visPts)
    if (map.getLayer('sicoe-eje-line')) map.setLayoutProperty('sicoe-eje-line', 'visibility', visEje)
    for (const id of ['sicoe-huellas-fill', 'sicoe-huellas-line', 'sicoe-huellas-nodo-lod']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visHuellas)
    }
    for (const id of ['sicoe-nodos-fill', 'sicoe-nodos-line', 'sicoe-nodos-point']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visNodos)
    }
  }, [mostrarPlano, mostrarHeat, mostrarPuntos, mostrarEje, mostrarHuellas, mostrarNodos, mapReady])

  useEffect(() => {
    if (!mapReady) return
    aplicarPuntosAlMapa(puntosFc, { registroFocoId: focoRevision?.registroId })
  }, [puntosFc, mapReady, aplicarPuntosAlMapa, focoRevision?.registroId])

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !mapReady) return
    const tmr = setTimeout(() => {
      try { map.resize() } catch { /* ignore */ }
    }, 80)
    return () => clearTimeout(tmr)
  }, [panelAbierto, embedReporte, embedMin, mapReady, panelsAsIcons])

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
  const enPlano = (leyendaVista.con_dibujo || 0) + (leyendaVista.sin_dibujo || 0)

  const filtroTip = esMesaValidador
    ? 'Filtros — al entrar se carga No Revisado de su nivel. Sin filtros el plano muestra eje y abscisado para ubicarse.'
    : 'Filtros — elija criterios y Buscar para ver reportes en el plano. Sin filtros el plano muestra eje y abscisado para ubicarse.'

  const iconBtn = (id, label, emoji) => (
    <button
      key={id}
      type="button"
      title={id === 'filtros' ? filtroTip : label}
      aria-label={id === 'filtros' ? filtroTip : label}
      aria-pressed={panelAbierto === id}
      onClick={() => {
        if (id === 'filtros') {
          setOpenFiltroSignal((n) => n + 1)
          setPanelAbierto(null)
          return
        }
        setPanelAbierto((cur) => (cur === id ? null : id))
      }}
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        border: `1px solid ${panelAbierto === id ? t.primary : t.border}`,
        background: panelAbierto === id ? `${t.primary}22` : `${t.bgCard}F2`,
        color: t.text,
        cursor: 'pointer',
        fontSize: 16,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
      }}
    >
      {emoji}
    </button>
  )

  const capasPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[
        ['plano', 'Plano base (abscisado)', mostrarPlano, setMostrarPlano],
        ['heat', 'Calor en dibujos', mostrarHeat, setMostrarHeat],
        ['pts', 'Sin dibujo (puntos)', mostrarPuntos, setMostrarPuntos],
        ['eje', 'Eje', mostrarEje, setMostrarEje],
        ['huellas', 'Dibujos filtrados', mostrarHuellas, setMostrarHuellas],
        ['nodos', 'Nodos PK', mostrarNodos, setMostrarNodos],
      ].map(([key, label, on, setOn]) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-caption)', color: t.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          {label}
        </label>
      ))}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-caption)', color: t.text, cursor: 'pointer' }}>
        <input {...capaNiv.checkboxProps} />
        Puntos de nivelación{capaNiv.count ? ` (${capaNiv.count})` : ''}
      </label>
    </div>
  )

  const intensidadPanel = (
    <div>
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
          {enPlano} en plano
          {leyendaVista.con_dibujo ? ` · ${leyendaVista.con_dibujo} con dibujo` : ''}
          {leyendaVista.sin_dibujo ? ` · ${leyendaVista.sin_dibujo} sin dibujo` : ''}
          {meta.max_costo_directo != null ? ` · máx ${fmtCostoMapa(meta.max_costo_directo)}` : ''}
          {meta.sin_coords ? ` · ${meta.sin_coords} sin coords` : ''}
          {meta.truncado ? ` · truncado a ${meta.max_features}` : ''}
          {focusActive ? ' · foco de revisión' : ''}
        </div>
      )}
    </div>
  )

  return (
    <div
      className="cc-claragis-root"
      data-claragis="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: panelsAsIcons ? 6 : 10,
        height: 'calc(100dvh - 140px)',
        minHeight: 360,
        isolation: 'isolate',
        position: 'relative',
        zIndex: 0,
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: panelsAsIcons ? 4 : 8 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
            🗺️ {CLARAGIS_TITULO}
          </div>
          <span
            title={CLARAGIS_HINT}
            aria-label={CLARAGIS_HINT}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'help',
              userSelect: 'none',
            }}
          >
            i
          </span>
          {esMesaValidador && (
            <span style={{ fontSize: 'var(--cc-caption)', color: t.primary, fontWeight: 700 }}>
              Mesa de validación
            </span>
          )}
        </div>

        {!panelsAsIcons && (
          <SicoeFiltroObraVista
            t={t}
            contratoId={contratoId}
            token={token}
            bundleAplicado={bundleAplicado}
            onBuscar={onBuscar}
            onLimpiar={onLimpiar}
            onActualizar={() => void cargarMapaCalor(bundleAplicado, { registroFocoId: focoRevision?.registroId })}
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
            chipsUnaLinea
          />
        )}

        {panelsAsIcons && (
          <SicoeFiltroObraVista
            t={t}
            contratoId={contratoId}
            token={token}
            bundleAplicado={bundleAplicado}
            onBuscar={onBuscar}
            onLimpiar={onLimpiar}
            onActualizar={() => void cargarMapaCalor(bundleAplicado, { registroFocoId: focoRevision?.registroId })}
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
            hideToolbar
            chipsUnaLinea
            openModalSignal={openFiltroSignal}
          />
        )}
      </div>

      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 280,
        borderRadius: 12,
        overflow: 'hidden',
        border: `1px solid ${t.border}`,
      }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Controles recogidos (móvil/tablet) o paneles abiertos (desktop capas/intensidad) */}
        {panelsAsIcons ? (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 8,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {iconBtn('filtros', 'Filtros', '🔍')}
              {iconBtn('capas', 'Capas del plano', '🗂️')}
              {iconBtn('intensidad', 'Intensidad y conteos', '🌡️')}
            </div>
            {panelAbierto === 'capas' && (
              <div style={{
                background: `${t.bgCard}F5`, border: `1px solid ${t.border}`,
                borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                maxWidth: 260,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 'var(--cc-caption)', color: t.text }}>Capas</strong>
                  <button type="button" onClick={() => setPanelAbierto(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted }}>✕</button>
                </div>
                {capasPanel}
              </div>
            )}
            {panelAbierto === 'intensidad' && (
              <div style={{
                background: `${t.bgCard}F5`, border: `1px solid ${t.border}`,
                borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                maxWidth: 280,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 'var(--cc-caption)', color: t.text }}>Intensidad</strong>
                  <button type="button" onClick={() => setPanelAbierto(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted }}>✕</button>
                </div>
                {intensidadPanel}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 5,
              background: `${t.bgCard}EE`, border: `1px solid ${t.border}`,
              borderRadius: 10, padding: '8px 10px', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            }}>
              {capasPanel}
            </div>
            <div style={{
              position: 'absolute', bottom: 20, left: 12, zIndex: 5,
              background: `${t.bgCard}EE`, border: `1px solid ${t.border}`,
              borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              maxWidth: 320,
            }}>
              {intensidadPanel}
            </div>
          </>
        )}

        {tieneCriterios && busquedaRealizada && !buscando && nPts === 0 && !errorMsg && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 6, maxWidth: 'min(440px, 92%)', textAlign: 'center',
            background: `${t.bgCard}F2`, border: `1px solid ${t.border}`,
            borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-caption)' }}>
              {totalRegs > 0
                ? `${totalRegs} registro${totalRegs === 1 ? '' : 's'} · ${sinCoords || totalRegs} sin coordenadas`
                : 'Ningún registro cumple los filtros'}
            </div>
          </div>
        )}

        {(buscando || embedCargando) && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 4,
            background: `${t.bgCard}F2`, border: `1px solid ${t.border}`,
            borderRadius: 8, padding: '6px 10px',
            color: t.text, fontWeight: 700, fontSize: 'var(--cc-caption)',
            pointerEvents: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}>
            {embedCargando ? 'Abriendo reporte…' : 'Actualizando…'}
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

        {/* Ventana incrustada del reporte */}
        {embedReporte && typeof renderEmbedCarpeta === 'function' && (
          renderEmbedCarpeta({
            reporte: embedReporte,
            minimized: embedMin,
            onMinimize: () => setEmbedMin(true),
            onRestore: () => setEmbedMin(false),
            onClose: cerrarEmbed,
            onActualizar: cerrarEmbed,
            onRegistroExpandidoChange,
            onReporteActualizado: (patch) => {
              setEmbedReporte((prev) =>
                prev && String(prev.id) === String(patch?.id) ? { ...prev, ...patch } : prev,
              )
            },
            capasFiltroValidacion: !focoRevision && Array.isArray(bundleAplicado?.capasValidacion) && bundleAplicado.capasValidacion.length
              ? bundleAplicado.capasValidacion
              : null,
            capasFiltroValidacionOp: bundleAplicado?.capasValidacionOp || 'and',
          })
        )}
      </div>
    </div>
  )
}
