import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import SicoeFiltroObraVista from './SicoeFiltroObraVista'
import {
  sicoeBundleTieneCriteriosUsuario,
  sicoeEstadosReporteFiltro,
  sicoeFiltroSnapshot,
  sicoeFSicoeVacios,
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
import {
  MAPBOX_PLANO_PAINT_LABELS,
  MAPBOX_ABSCISA_TEXT_FIELD,
  addMapboxAbscisaLabelLayers,
  mapboxPlanoSymbolLayout,
  setMapboxAbscisaLabelsVisibility,
} from '../../mapboxPlanoLabels'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN || '').trim()
const EMPTY_FC = { type: 'FeatureCollection', features: [] }

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

function boundsFromPoints(fc) {
  const feats = fc?.features || []
  if (!feats.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const f of feats) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const [lng, lat] = c
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  if (!Number.isFinite(minLng)) return null
  return [[minLng, minLat], [maxLng, maxLat]]
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

  const [bundleAplicado, setBundleAplicado] = useState(() => bundleVacio())
  const [busquedaRealizada, setBusquedaRealizada] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [meta, setMeta] = useState(null)
  const [puntosFc, setPuntosFc] = useState(EMPTY_FC)
  const [planoGeojson, setPlanoGeojson] = useState(null)
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

  const tieneCriterios = useMemo(
    () => sicoeBundleTieneCriteriosUsuario(bundleAplicado),
    [bundleAplicado],
  )

  // Cargar sesión de filtros SicoeObra + opciones auxiliares
  useEffect(() => {
    if (!contratoId || !token) return
    const saved = cargarSicoeFiltroSesion(contratoId)
    if (saved && sicoeBundleTieneCriteriosUsuario(saved)) {
      setBundleAplicado(sicoeFiltroSnapshot(saved))
    }
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
    getContratoPlanoGeojson(API_BASE, contratoId, token)
      .then((d) => setPlanoGeojson(d?.plano_geojson || null))
      .catch(() => setPlanoGeojson(null))
  }, [contratoId, token])

  const aplicarPuntosAlMapa = useCallback((fc, { fit = false } = {}) => {
    const map = mapInstance.current
    puntosRef.current = fc || EMPTY_FC
    if (!map?.getSource) return
    const src = map.getSource('sicoe-calor')
    if (src) src.setData(fc || EMPTY_FC)
    if (fit) {
      const b = boundsFromPoints(fc)
      if (b) {
        try {
          map.fitBounds(b, { padding: 56, bearing: 270, maxZoom: 16, duration: 600 })
        } catch { /* ignore */ }
      }
    }
  }, [])

  const cargarMapaCalor = useCallback(async (bundle) => {
    if (!contratoId || !token) return
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
      const fc = data?.type === 'FeatureCollection'
        ? data
        : { type: 'FeatureCollection', features: data?.features || [] }
      setPuntosFc(fc)
      setMeta(data?.meta || null)
      setBusquedaRealizada(true)
      aplicarPuntosAlMapa(fc, { fit: true })
    } catch (e) {
      if (e?.name === 'AbortError') return
      setErrorMsg(e?.message || String(e))
      setPuntosFc(EMPTY_FC)
      setMeta(null)
      aplicarPuntosAlMapa(EMPTY_FC)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBuscando(false)
    }
  }, [contratoId, token, aplicarPuntosAlMapa])

  // Auto-buscar si hay sesión con criterios
  useEffect(() => {
    if (!contratoId || !token) return
    if (sicoeBundleTieneCriteriosUsuario(bundleAplicado) && !busquedaRealizada && !buscando) {
      void cargarMapaCalor(bundleAplicado)
    }
    // solo al montar / cambio contrato
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, token])

  const onBuscar = useCallback((snap) => {
    const b = sicoeFiltroSnapshot(snap)
    setBundleAplicado(b)
    guardarSicoeFiltroSesion(contratoId, b)
    setSeleccionado(null)
    void cargarMapaCalor(b)
  }, [contratoId, cargarMapaCalor])

  const onLimpiar = useCallback(() => {
    const vacio = bundleVacio()
    setBundleAplicado(vacio)
    limpiarSicoeFiltroSesion(contratoId)
    setBusquedaRealizada(false)
    setPuntosFc(EMPTY_FC)
    setMeta(null)
    setSeleccionado(null)
    setErrorMsg(null)
    aplicarPuntosAlMapa(EMPTY_FC)
  }, [contratoId, aplicarPuntosAlMapa])

  // Inicializar mapa Mapbox
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapRef.current) return undefined
    if (mapInstance.current) return undefined

    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-74.05, 4.72],
      zoom: 12,
      bearing: 270,
    })
    const unreg = installMapboxAttributionLinksOpenNewTab(map)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapInstance.current = map
    popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })

    map.on('load', () => {
      // Underlay plano (opcional, baja opacidad)
      map.addSource('plano-underlay', {
        type: 'geojson',
        data: planoGeojson || EMPTY_FC,
      })
      map.addLayer({
        id: 'plano-underlay-fill',
        type: 'fill',
        source: 'plano-underlay',
        paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'plano-underlay-line',
        type: 'line',
        source: 'plano-underlay',
        paint: { 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.35 },
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
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.4],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 18, 15, 36],
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
            10, 3,
            14, 6,
            17, 9,
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'weight'],
            0, '#93c5fd',
            0.5, '#f59e0b',
            1, '#dc2626',
          ],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#0f172a',
          'circle-opacity': 0.9,
        },
      })

      const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
      const onLeave = () => { map.getCanvas().style.cursor = '' }
      map.on('mouseenter', 'sicoe-calor-puntos', onEnter)
      map.on('mouseleave', 'sicoe-calor-puntos', onLeave)
      map.on('click', 'sicoe-calor-puntos', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const props = { ...f.properties }
        // Mapbox serializa numbers as strings sometimes
        if (props.costo_directo != null) props.costo_directo = Number(props.costo_directo)
        if (props.cantidad_total != null) props.cantidad_total = Number(props.cantidad_total)
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
    })

    return () => {
      try { unreg() } catch { /* ignore */ }
      try { popupRef.current?.remove() } catch { /* ignore */ }
      try { map.remove() } catch { /* ignore */ }
      mapInstance.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.bg])

  // Actualizar underlay cuando llega el plano
  useEffect(() => {
    const map = mapInstance.current
    if (!map?.getSource) return
    const src = map.getSource('plano-underlay')
    if (src && planoGeojson) src.setData(planoGeojson)
  }, [planoGeojson])

  // Visibilidad de capas
  useEffect(() => {
    const map = mapInstance.current
    if (!map?.getLayer) return
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
  }, [mostrarPlano, mostrarHeat, mostrarPuntos])

  // Sync puntos si el mapa se crea después de la data
  useEffect(() => {
    aplicarPuntosAlMapa(puntosFc)
  }, [puntosFc, aplicarPuntosAlMapa])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 140px)' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
            🗺️ Mapa de calor · Reportes por costo directo
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
            Intensidad = costo directo acumulado de los registros que cumplen los filtros activos.
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
          puedeVerSubcontratista={!nivelInfo.esInterventoria}
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

        {/* Controles capas */}
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

        {/* Estado vacío / loading / meta */}
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
              y pulse <strong>Buscar</strong>. El calor refleja el costo directo de esos reportes.
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

        {/* Leyenda */}
        <div style={{
          position: 'absolute', bottom: 20, left: 12, zIndex: 5,
          background: `${t.bgCard}EE`, border: `1px solid ${t.border}`,
          borderRadius: 10, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
            INTENSIDAD · COSTO DIRECTO
          </div>
          <div style={{
            height: 10, borderRadius: 6, marginBottom: 6,
            background: 'linear-gradient(90deg,#2166ac,#fdae61,#b2182b)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
            <span>Menor</span>
            <span>Mayor</span>
          </div>
          {busquedaRealizada && meta && (
            <div style={{ marginTop: 8, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
              {nPts} punto{nPts === 1 ? '' : 's'}
              {meta.sin_coords ? ` · ${meta.sin_coords} sin coords` : ''}
              {meta.truncado ? ` · truncado a ${meta.max_features}` : ''}
            </div>
          )}
        </div>

        {/* Panel detalle lateral (refuerzo del popup) */}
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
