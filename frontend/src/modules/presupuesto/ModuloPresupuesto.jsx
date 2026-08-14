import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { flushSync } from "react-dom"
import { Flame } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import TrazabilidadRegistroModal from '../../TrazabilidadRegistroModal'
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as XLSX from "xlsx"
import ExcelJS from "exceljs"
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL, logApiFailure } from '../../apiBase'
import { supabase } from '../../supabaseClient'
import { createRealtimeDebouncer, isEfectivoOffline } from '../../realtimeUtils'
import { formatCOP, formatCOPShort } from '../../utils/formatCOP'
import EmojiPicker from '../../EmojiPicker'
import { useClaraViewport } from '../../useClaraViewport'
import PptoFiltroObraVista from './PptoFiltroObraVista'
import PptoPanelValidacion from './PptoPanelValidacion'
import PptoEdicionMasivaModal from './PptoEdicionMasivaModal'
import PptoGraficosModal from './PptoGraficosModal'
import PptoGruposGraficosModal from './PptoGruposGraficosModal'
import PptoSincroSicoeLoteModal from './PptoSincroSicoeLoteModal'
import PptoBuscarObjetivoModal from './PptoBuscarObjetivoModal'
import PptoExportExcelModal from './PptoExportExcelModal'
import PptoValidacionIcon from './PptoValidacionIcon'
import {
  PPTO_SEMAFORO_ESTADOS,
  pptoEstadoDepuracionDisplay,
  pptoEstadoInterventoriaDisplay,
  pptoEstadoValidacionColor,
  pptoEsLegadoDepuracion,
} from './pptoEstadosValidacion'
import {
  esDesarrolladorPresupuesto,
  esCargoDesarrolladorPresupuesto,
  esRolContratistaDepuracion,
  esRolInterventoriaValidacion,
  preIntervLiberadoParaInterventoria,
} from './pptoRolesValidacion'
import {
  capturarSnapshotFilas,
  restaurarSnapshotPresupuesto,
  filasDesdeSnapshot,
} from './pptoUndoUltima'
import PptoVersionador from './PptoVersionador'
import PptoVersionCadConfirmModal from './PptoVersionCadConfirmModal'
import PptoComentarioModoModal from './PptoComentarioModoModal'
import {
  PPTO_COMENTARIO_MODO_APPEND,
  PPTO_COMENTARIO_MODO_REPLACE,
  pptoComentarioTipoLabel,
  pptoConcatenarObservacion,
} from './pptoComentarioModo'
import PptoSincronizarVlrModal from './PptoSincronizarVlrModal'
import {
  buildPptoEndpoints,
  pptoGuardarVersionActiva,
  pptoLeerVersionActiva,
  pptoMaterializarBiblioteca,
} from './pptoVersionActiva'
import { downloadPresupuestoCrudoExcel, downloadPresupuestoInformeExcel } from './presupuestoExportExcel'
import { resolverMetaLogosPresupuesto } from './presupuestoExportLogos'
import { idsRangoSeleccion } from './pptoSeleccionRango'
import { pptoFormatoNodos } from './pptoFormatoNodos'
import { pptoConstruirTramosUnicos, pptoFilasDeTramo } from './pptoTramoBusqueda'
import { pptoPopVistaAnterior, pptoTotalesSeleccion } from './pptoNavegacionVista'
import { invalidateVistaModulo, VISTA_CACHE_TTL } from '../../cache/vistaCache'
import { useModulo } from '../../context/ModuloContext'
import { pptoBuildPresupuestoSearchParams, pptoCriterioVistaActivo as criterioVistaActivo, pptoFilaCoincideFObra, pptoFilaCoincidePreInterv, pptoFilaCoincideRevisado, pptoFiltroNormalizar, pptoFiltroDef, pptoFiltroUbicacionCacheKey, pptoFiltroValoresLista, pptoFiltrosActivosKeys, pptoFObraParaConsulta, pptoFObraToExportBody, pptoExportBodyToSearchParams, pptoRequiereConsultaServidor, pptoTieneFiltrosChip } from './pptoFiltroCatalogo'
import { fetchPptoPanelValidacion, pptoBuildPanelValidacionParams } from './pptoPanelValidacionApi'
import { cargarFiltroSesion, guardarFiltroSesion, limpiarFiltroSesion } from './pptoFiltroSesion'
import CcAvisoModal from '../../components/CcAvisoModal'

/** Tipografía alineada con Pequeña / Mediana / Grande (`applyClaraTypography` en `typographyScale.js`) */
function getToken() {
  return localStorage.getItem("cc_token") || sessionStorage.getItem("cc_token")
}

/**
 * Dimensiones / precios tecleados con coma decimal (es-CO).
 * `parseFloat('1,55')` → 1; `parseFloat('-0,82')` → -0 y con `|| 0` se pierde el signo.
 */
function parseDimInputEs(v) {
  if (v === '' || v == null) return NaN
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}

/** Precio unitario desde fila `listado_precios` (PostgREST suele exponer `precio_unitario`). */
function precioVlrDesdeListado(p) {
  if (!p || typeof p !== 'object') return null
  const raw = p.precio_unitario ?? p.valor_unitario ?? p.vlr_unitario
  if (raw === '' || raw == null) return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Componente estable (no dentro del render) para no perder el foco al teclear en el modal «Agregar cantidad». */
function AgregarCantidadDimInput({ label, value, onChange, t }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 'var(--cc-caption)', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          background: t.inputBg,
          border: `1.5px solid ${t.border}`,
          borderRadius: '7px',
          padding: '7px 10px',
          color: t.text,
          fontSize: 'var(--cc-sm)',
        }}
      />
    </div>
  )
}

/** Evento y puente global: SicoeCAD / WebView2 puede `dispatchEvent` o `window.__CLARACORE_PRESUPUESTO_SICOECAD_IMPORT__(detail)`. */
export const CLARACORE_PRESUPUESTO_SICOECAD_IMPORT_EVENT = 'claracore:presupuesto-sicoe-cad-import'

function aplicarCorreccionesDiscrepanciasSicoeCad(items, discrepancias) {
  const out = items.map((row) => ({ ...row }))
  for (const d of discrepancias || []) {
    const i = d.fila_index
    if (typeof i !== 'number' || i < 0 || i >= out.length) continue
    const r = { ...out[i] }
    if (d.capitulo_sugerido !== undefined && d.capitulo_sugerido !== null) r.capitulo = d.capitulo_sugerido
    if (d.item_sugerido !== undefined && d.item_sugerido !== null) r.item = d.item_sugerido
    if (d.descripcion_correcta !== undefined && d.descripcion_correcta !== null) r.descripcion = d.descripcion_correcta
    if (d.unidad_correcta !== undefined && d.unidad_correcta !== null) r.und = d.unidad_correcta
    if (d.vlr_unitario_correcto !== undefined && d.vlr_unitario_correcto !== null) r.vlr_unitario = d.vlr_unitario_correcto
    out[i] = r
  }
  return out
}

/** Fila de matriz «editar registros presupuesto» para el contrato activo (evita .find() con permisos de otro contrato). */
function permisoEditarRegistrosPresupuesto(usuario, contratoId) {
  const want = 'editar registros presupuesto'
  const rows = (usuario?.permisos || []).filter(
    (p) => (p.funcion_nombre || '').toLowerCase() === want,
  )
  if (!rows.length) return null
  const cid = Number(contratoId)
  if (Number.isFinite(cid)) {
    const exact = rows.find((p) => Number(p.contrato_id) === cid)
    if (exact) return exact
    const legacy = rows.find((p) => p.contrato_id == null || p.contrato_id === '')
    if (legacy) return legacy
  }
  return rows[0]
}

/** Visibilidad y niveles de validación presupuesto (depuración / interventoría): permisos de «editar registros presupuesto», no Reporte de cantidades. */
function determinarNivelValidacion(usuario, contratoId) {
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  const rol     = norm(usuario?.rol_nombre || usuario?.rol || '')
  const cargo   = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const permPpto = permisoEditarRegistrosPresupuesto(usuario, contratoId)
  const puedeValidar = !!(permPpto?.validar)
  const puedeEditar  = !!(permPpto?.editar)

  const esContratista   = rol === 'contratista' || rol === 'operativo contratista'
  const esInterventoria = rol === 'interventoria' || rol === 'operativo interventoria'
  const esSubRol        = rol === 'subcontratista'

  const esOperativoContratista   = rol === 'operativo contratista'
  const esOperativoInterventoria = rol === 'operativo interventoria'
  const esApoyoTecnico           = esInterventoria && !puedeValidar &&
                                   (cargo.includes('apoyo') || cargo.includes('técnico') || cargo.includes('tecnico'))
  const esSubcontratista         = esSubRol || cargo.includes('subcontratista')
  const esSoloComentarista       = esOperativoInterventoria  // puede ver y comentar, no valida ni edita

  const verValoresEconomicos = !(esOperativoContratista || esOperativoInterventoria || esApoyoTecnico)

  let nivelValidacion = null
  const esDev = cargo.includes('desarrollador')

  if (esDev) {
    nivelValidacion = 1
  } else if (esContratista && puedeValidar &&
      (cargo.includes('inspector') || cargo.includes('topógrafo') || cargo.includes('topografo'))) {
    nivelValidacion = 1
  } else if (esContratista && puedeValidar &&
      (cargo.includes('residente') || cargo.includes('director de obra'))) {
    nivelValidacion = 2
  } else if (esInterventoria && !esOperativoInterventoria && puedeValidar &&
      (cargo.includes('residente') || cargo.includes('director'))) {
    nivelValidacion = 3
  } else if (esApoyoTecnico) {
    nivelValidacion = 3
  }

  const rolOrigen = esInterventoria ? 'interventoria'
                  : esSubRol        ? 'subcontratista'
                  : 'contratista'

  const puedePrevalidarAntesInterv = esContratista && puedeValidar &&
    (cargo.includes('residente de costos') || cargo.includes('residente de obra'))

  return {
    nivelValidacion, puedeEditar, puedeValidar, esApoyoTecnico, esSubcontratista, esSoloComentarista,
    verValoresEconomicos, rolOrigen, esInterventoria, puedePrevalidarAntesInterv,
  }
}

function PresupuestoTooltip({ active, payload, t, color, fmt }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const fmtQ = n => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '—'
  return (
    <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'8px', padding:'10px 14px', boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}>
      <div style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.text, marginBottom:'6px', maxWidth:'280px', wordBreak:'break-word' }}>{d.label}</div>
      <div style={{ fontSize:'var(--cc-label)', fontWeight:'700', color, marginBottom:'4px' }}>{fmt(d.costo)}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
        <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>{d.count} registro{d.count !== 1 ? 's' : ''}</div>
        {d.cantTotal != null   && <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>Cant. Total: <span style={{color:t.text,fontWeight:'600'}}>{fmtQ(d.cantTotal)}</span></div>}
        {d.und != null         && <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>Und: <span style={{color:t.text,fontWeight:'600'}}>{d.und}</span></div>}
        {d.vlrUnit != null     && <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>Vlr. Unit.: <span style={{color:t.text,fontWeight:'600'}}>{fmt(d.vlrUnit)}</span></div>}
      </div>
    </div>
  )
}

/** Orden 1, 2, … 10, 11 (no lexicográfico 1,10,11,2). */
/** Lista de capítulos derivada del panel agregado (evita GET capitulos-lista = otro barrido 40k). */
function capitulosResumenDesdePanelFilas(filas) {
  if (!Array.isArray(filas) || !filas.length) return []
  return filas
    .map((g) => ({
      capitulo: g.capitulo || g.label || '',
      costo_total: Number(g.totalCosto) || 0,
      total_registros: Number(g.totalRegs) || 0,
    }))
    .filter((c) => c.capitulo)
    .sort(cmpCapituloLabel)
}

function cmpCapituloLabel(a, b) {
  const key = (row) => {
    const c = row?.capitulo ?? row
    const m = String(c ?? '').match(/^(\d+)/)
    return m ? [0, parseInt(m[1], 10), c] : [1, 0, c]
  }
  const ka = key(a)
  const kb = key(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  return String(ka[2] ?? '').localeCompare(String(kb[2] ?? ''), 'es', { numeric: true })
}

function fObraItemsLista(f) {
  if (!f) return []
  if (Array.isArray(f.items) && f.items.length) {
    return [...new Set(f.items.map((x) => String(x ?? '').trim()).filter(Boolean))]
  }
  const one = String(f.item ?? '').trim()
  if (!one) return []
  if (one.includes(',')) {
    return [...new Set(one.split(',').map((s) => String(s).trim()).filter(Boolean))]
  }
  return [one]
}

const PPTO_TIPO_EJECUCION_DEFAULT = 'Presupuesto de Obra'
const PPTO_TIPO_EJECUCION_OBRA = 'Obra Ejecutada'

function pptoExportTipoDesdeVista(tipoEjecucion) {
  return (tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT) === PPTO_TIPO_EJECUCION_OBRA
    ? 'obra_ejecutada'
    : 'presupuesto_obra'
}

function pptoExportModoFromSeleccion(formato, tipo) {
  const esObra = tipo === 'obra_ejecutada'
  if (formato === 'crudo') return esObra ? 'obra_ejecutada_crudo' : 'presupuesto_obra_crudo'
  return esObra ? 'obra_ejecutada' : 'presupuesto_obra'
}

const pptoVistaLsKey = (contratoId) => `clara_dash_vista_${contratoId}`

function pptoCtxFiltro(drillRef, capExpandidoRef) {
  return { drill: drillRef, capExpandido: capExpandidoRef, tipoEjecucionDefault: PPTO_TIPO_EJECUCION_DEFAULT }
}

// ─── MÓDULO PRESUPUESTO ───────────────────────────────────────────────────────
function ModuloPresupuesto({ t, usuario, token, s, navRegistroId = null, onNavRegistroConsumed, oculto = false }) {
  const API = API_BASE
  const contratoId = usuario?.contrato_id
  const { isMobile: pptoVpMobile, isLandscapeMobile: pptoLandscapeMobile } = useClaraViewport()
  const pptoCompact = pptoVpMobile || pptoLandscapeMobile

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [seleccionados, setSeleccionados] = useState(new Set())
  /** Ancla para Shift+clic en checkboxes de la grilla (último marcado individualmente). */
  const lastSelAnchorIdRef = useRef(null)
  const [filaZoom, setFilaZoom] = useState(null) // id de la fila con zoom activo
  const [editando, setEditando] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [drill, setDrill] = useState([])        // [{campo, valor}, …] – ruta activa
  const [hoveredBar, setHoveredBar] = useState(null)
  // ── Estado edición y validación ────────────────────────────────────────────
  const [listadoPrecios, setListadoPrecios] = useState([])
  const [editCapitulo, setEditCapitulo] = useState('')
  const [editItem, setEditItem] = useState('')
  const [editDims, setEditDims] = useState({})      // {[id]: { area_long_nod?, ancho, espesor }}
  const [modalConfirm, setModalConfirm] = useState(false)
  const [modalEdicionMasiva, setModalEdicionMasiva] = useState(false)
  const [competenciasEdicionMasiva, setCompetenciasEdicionMasiva] = useState([])

  useEffect(() => {
    if (!modalEdicionMasiva || !contratoId) return
    let cancelled = false
    ;(async () => {
      try {
        const tok = getToken()
        // Mismo listado que SicoeObra al asignar ítem: competencias habilitadas del contrato
        // (base + competencias_contrato + listado_precios), no las de la grilla/selección.
        const res = await fetch(`${API}/contratos/${contratoId}/competencias`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        let lista = []
        if (res.ok) {
          const data = await res.json()
          lista = Array.isArray(data?.competencias) ? data.competencias : []
        }
        const cleaned = [...new Set(
          lista.map((x) => String(x || '').trim()).filter(Boolean),
        )].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
        if (!cancelled) setCompetenciasEdicionMasiva(cleaned)
      } catch {
        if (!cancelled) setCompetenciasEdicionMasiva([])
      }
    })()
    return () => { cancelled = true }
  }, [modalEdicionMasiva, contratoId, API])
  const [modalGraficos, setModalGraficos] = useState(false)
  const [modalGruposGraficos, setModalGruposGraficos] = useState(false)
  const [modalBuscarObjetivo, setModalBuscarObjetivo] = useState(false)
  /** IDs de presupuesto con al menos un gráfico asociado (indicador en grilla). */
  const [idsConGrafico, setIdsConGrafico] = useState(() => new Set())
  const [bulkEstado, setBulkEstado] = useState('')
  const [bulkPreInterv, setBulkPreInterv] = useState('')
  const [bulkTipoEjecucion, setBulkTipoEjecucion] = useState('')
  const [busquedaTipo, setBusquedaTipo] = useState('')   // 'nodo' | 'abscisa' | 'idpol'
  const [busquedaV1,   setBusquedaV1]   = useState('')   // nodo_ini | abs_ini | idpol
  const [busquedaV2,   setBusquedaV2]   = useState('')   // nodo_fin | abs_fin (no se usa en idpol)
  const [filtroEstado, setFiltroEstado] = useState('')   // filtro permanente de estado de revisión
  const [guardandoBulk, setGuardandoBulk] = useState(false)
  const [dandoDeBaja, setDandoDeBaja] = useState(false)
  const [restaurandoPapelera, setRestaurandoPapelera] = useState(false)
  const [purgandoPapelera, setPurgandoPapelera] = useState(false)
  const [papeleraTotal, setPapeleraTotal] = useState(0)
  const [papeleraCargados, setPapeleraCargados] = useState(0)
  const [papeleraCargandoMas, setPapeleraCargandoMas] = useState(false)
  const papeleraNextOffsetRef = useRef(0)
  const PAPELERA_PAGE = 100
  const PAPELERA_DIAS_PURGA = 30
  const restaurarLockRef = useRef(false)
  const purgarLockRef = useRef(false)
  const [undoUltima, setUndoUltima] = useState(null)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const undoSnapRef = useRef(null)
  const darDeBajaLockRef = useRef(false)
  const [itemBusqueda, setItemBusqueda] = useState('')
  const [itemDropOpen, setItemDropOpen] = useState(false)
  const [itemNavIdx, setItemNavIdx] = useState(-1)
  const itemDropRef = useRef(null)
  /** Cuántas filas de `registrosOrdenados` mostrar en la grilla (scroll infinito por bloques de 50). */
  const [visibleRegistrosCount, setVisibleRegistrosCount] = useState(50)
  const POR_PAGINA = 50
  const pptoTablaScrollRef = useRef(null)
  const [modalDetallePpto, setModalDetallePpto] = useState(null)
  const [modalDetallePptoEditable, setModalDetallePptoEditable] = useState(false)
  /** Trazabilidad por fila: entidad `presupuesto` en API /logs/entidad/presupuesto/{id} */
  const [trazabilidadPresupuesto, setTrazabilidadPresupuesto] = useState(null)
  const [popupDims, setPopupDims] = useState({ ancho: '', espesor: '', area_long_nod: '', no_inicio: '', no_final: '' })
  const [popupCap,  setPopupCap]  = useState('')
  const [popupTipoEjecucion, setPopupTipoEjecucion] = useState(PPTO_TIPO_EJECUCION_DEFAULT)
  const [popupItem, setPopupItem] = useState('')
  const [popupItemBusq, setPopupItemBusq] = useState('')
  const [popupItemOpen, setPopupItemOpen] = useState(false)
  const [popupGuardando, setPopupGuardando] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  const [avisoSistema, setAvisoSistema] = useState(null)
  const [confirmCargaGrande, setConfirmCargaGrande] = useState(null)
  const confirmCargaGrandeRef = useRef(null)
  const [filtroResetKey, setFiltroResetKey] = useState(0)
  // ── Revisor de Tramos ─────────────────────────────────────────────────────
  const [modalModoCapitulo, setModalModoCapitulo] = useState(null) // nombre del capítulo pendiente
  const [modoCapSeleccion,  setModoCapSeleccion]  = useState('')   // '' | 'todos' | 'tramos'
  const [busquedaTramo,     setBusquedaTramo]     = useState('')
  const [selTramoTab,       setSelTramoTab]       = useState({ ini: new Set(), fin: new Set(), tramo: new Set() })
  const [filtroEstrella,    setFiltroEstrella]    = useState('')  // '' | 'vacia' | 'roja' | 'amarilla' | 'verde'
  const [filtroEstrellaTipo, setFiltroEstrellaTipo] = useState('tramo') // 'ini' | 'fin' | 'tramo'
  const [tramoSelec,        setTramoSelec]        = useState(null) // {no_inicio, no_final, label}
  const [tabTramo,          setTabTramo]          = useState(0)    // 0=INFO 1=NODO INI 2=NODO FIN 3=TRAMO
  const [refrescandoRevisorTramos, setRefrescandoRevisorTramos] = useState(false)
  /** Fase B: filtros de servidor (misma semántica capítulo/ítem que dashboard SICOE) */
  const [ubicacionTramo,   setUbicacionTramo]   = useState('')
  const [ubicacionCalzada, setUbicacionCalzada] = useState('')
  const [opcionesUbicacion, setOpcionesUbicacion] = useState({ tramos: [], calzadas: [] })
  const debounceFetchPptoRef = useRef(null)
  const recargarCapActualRef = useRef(null)
  /** Fase C: total con los mismos filtros que el listado (GET /conteo) */
  const [conteoFiltro, setConteoFiltro] = useState(null)
  const conteoFiltroRef = useRef(null)
  useEffect(() => { conteoFiltroRef.current = conteoFiltro }, [conteoFiltro])
  /** Tamaño de lote al traer /presupuesto (limit/offset). La UI aplica un solo setRegistros al final. */
  const PRES_PTO_CHUNK = 1000
  /** Umbral para avisar al usuario que la búsqueda puede demorar. */
  const PRES_PTO_ALERTA_GRANDE_UMBRAL = 5000

  function pedirConfirmacionCargaGrande(totalN) {
    return new Promise((resolve) => {
      confirmCargaGrandeRef.current = resolve
      setConfirmCargaGrande({ total: totalN })
    })
  }

  function resolverConfirmCargaGrande(continuar) {
    const resolve = confirmCargaGrandeRef.current
    confirmCargaGrandeRef.current = null
    setConfirmCargaGrande(null)
    if (typeof resolve === 'function') resolve(!!continuar)
  }
  const pptoCargaRef = useRef({ key: '', nextOffset: 0, hasMore: false, total: 0 })
  const cargaPptoInFlightRef = useRef(false)
  const cargaPptoIdRef = useRef(0)
  /** true tras Buscar con chips: no auto-refrescar cada 22 s ni al volver a la pestaña. */
  const busquedaServidorActivaRef = useRef(false)
  const [busquedaServidorActiva, setBusquedaServidorActiva] = useState(false)
  const [panelBusquedaSeq, setPanelBusquedaSeq] = useState(0)
  /** Filas del panel desde GET /panel-validacion-interv (agregado servidor). */
  const [panelFilasServidor, setPanelFilasServidor] = useState(null)
  const [cargandoGrillaPresupuesto, setCargandoGrillaPresupuesto] = useState(false)
  /** Snapshot fObra/drill antes de entrar a ítems desde el panel (restaurar en «Atrás»). */
  const panelDrillRestoreRef = useRef(null)
  const registrosRef = useRef([])
  useEffect(() => { registrosRef.current = registros }, [registros])
  /** Filtro tipo SICOE Obra (reemplaza drill por gráfico de barras) */
  const [fObra, setFObra] = useState({
    cap: '', caps: [], item: '', items: [], idPol: '', pkCriterio: '', texto: '', tramo: '', tramos: [], calzada: '', calzadas: [], infraestructura: '', infraestructuras: [], nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '', competencia: '', competencias: [], und: '', unds: [], sellado: '', dadoDeBaja: '', vlrUnitarioMin: '', vlrUnitarioMax: '', cantTotalMin: '', cantTotalMax: '', costoDirectoMin: '', costoDirectoMax: '', tipoEjecucion: PPTO_TIPO_EJECUCION_DEFAULT,
  })
  const fObraRef = useRef(fObra)
  useEffect(() => { fObraRef.current = fObra }, [fObra])

  useEffect(() => {
    if (!contratoId) return
    try {
      const saved = localStorage.getItem(pptoVistaLsKey(contratoId))
      if (saved === PPTO_TIPO_EJECUCION_OBRA || saved === PPTO_TIPO_EJECUCION_DEFAULT) {
        setFObra((prev) => {
          if ((prev.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT) === saved) return prev
          const next = { ...prev, tipoEjecucion: saved }
          fObraRef.current = next
          return next
        })
      }
    } catch { /* ignore */ }
  }, [contratoId])

  const [capExpandido, setCapExpandido] = useState(null)
  const [buscandoFiltroObra, setBuscandoFiltroObra] = useState(false)
  /** Ancla de selección en panel ítems (Mayús+clic = rango desde este índice). */
  const anchorIdxPanelRef = useRef(-1)
  // ── Agregar cantidad / Revisor tramos extras ─────────────────────────────
  const [comentariosTramo,   setComentariosTramo]   = useState({})
  const [modoSeleccionClon,  setModoSeleccionClon]  = useState(false)
  const [clonBase,           setClonBase]           = useState(null)
  const [modalAgregarCant,   setModalAgregarCant]   = useState(false)
  const [nuevaCant,          setNuevaCant]          = useState({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
  const [guardandoNuevaCant, setGuardandoNuevaCant] = useState(false)
  // ── Comentarios ──────────────────────────────────────────────────────────
  const [modalComentario,  setModalComentario]  = useState(null) // {tipo, obligatorio, resolve, ids}
  const [textoComentario,  setTextoComentario]  = useState('')
  const [destinatarioComentario, setDestinatarioComentario] = useState('')
  const [usuariosDestinatarios,  setUsuariosDestinatarios]  = useState([])
  const [comentariosPorId, setComentariosPorId] = useState({})
  const [modalModoHistorial, setModalModoHistorial] = useState(null) // {nConHistorial,nTotal,etiqueta,titulo,resolve}
  const [modalHilo,           setModalHilo]           = useState(null) // {registroId, tipo, data}
  const [exportPresupuestoOpen, setExportPresupuestoOpen] = useState(false)
  const [exportPresupuestoFormato, setExportPresupuestoFormato] = useState('informe')
  const [exportPresupuestoBusy, setExportPresupuestoBusy] = useState(false)
  const [exportPresupuestoError, setExportPresupuestoError] = useState(null)
  const [versionesPresupuesto, setVersionesPresupuesto] = useState([])
  const [versionCrearOpen, setVersionCrearOpen] = useState(false)
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const nivelInfo = useMemo(() => determinarNivelValidacion(usuario, contratoId), [usuario, contratoId])
  const esDeveloper = esCargoDesarrolladorPresupuesto(usuario)
  /** Biblioteca paralela persistente (sessionStorage): requiere permiso editar presupuesto. */
  const puedeEditarVersionBiblioteca = esDeveloper || nivelInfo.puedeEditar
  const [versionActiva, setVersionActivaRaw] = useState(null)
  const [versionCadConfirm, setVersionCadConfirm] = useState(null)
  const [syncVlrOpen, setSyncVlrOpen] = useState(false)
  const [syncVlrPhase, setSyncVlrPhase] = useState('confirm')
  const [syncVlrBusy, setSyncVlrBusy] = useState(false)
  const [syncVlrError, setSyncVlrError] = useState(null)
  const [syncVlrResult, setSyncVlrResult] = useState(null)
  const pptoEndpointsRef = useRef(buildPptoEndpoints({ API: API_BASE, contratoId, versionActiva: null }))
  const setVersionActiva = useCallback((v) => {
    pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva: v })
    setVersionActivaRaw(v)
    if (puedeEditarVersionBiblioteca) {
      pptoGuardarVersionActiva(contratoId, v)
    }
  }, [API, contratoId, puedeEditarVersionBiblioteca])
  const pptoEp = useCallback(
    () => pptoEndpointsRef.current || buildPptoEndpoints({ API, contratoId, versionActiva }),
    [API, contratoId, versionActiva],
  )
  const pptoQueryBib = useCallback((p) => {
    const ep = pptoEp()
    const base = p instanceof URLSearchParams ? new URLSearchParams(p.toString()) : new URLSearchParams(String(p || '').replace(/^\?/, ''))
    if (ep.mode === 'version' && ep.appendBibliotecaQuery) return ep.appendBibliotecaQuery(base)
    return base
  }, [pptoEp])
  useEffect(() => {
    if (!puedeEditarVersionBiblioteca) {
      setVersionActivaRaw(null)
      pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva: null })
      versionRestorePendingRef.current = false
      return
    }
    const v = pptoLeerVersionActiva(contratoId)
    pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva: v })
    setVersionActivaRaw(v)
    versionRestorePendingRef.current = !!v?.id
  }, [contratoId, API, puedeEditarVersionBiblioteca])
  useEffect(() => {
    pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva })
  }, [API, contratoId, versionActiva])
  const aplicarFiltroObraConFRef = useRef(null)
  const recargarVistaVersionActivaRef = useRef(null)
  const versionActivaIdTrackedRef = useRef(undefined)
  const versionRestorePendingRef = useRef(false)
  const pptoValidacionPendienteRef = useRef(0)
  const trabajarEnVersionBiblioteca = useCallback(async (version) => {
    if (!version?.id) return
    const va = {
      id: String(version.id),
      etiqueta: String(version.etiqueta || ''),
      numero_version: version.numero_version,
    }
    pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva: va })
    setVersionPanelOpen(false)
    try {
      await pptoMaterializarBiblioteca(pptoEndpointsRef.current, token)
    } catch (e) {
      window.alert(e?.message || 'No se pudo abrir la biblioteca de esta versión.')
      return
    }
    setVersionActiva(va)
  }, [API, contratoId, setVersionActiva, token])
  const volverPresupuestoVivo = useCallback(() => {
    setVersionActiva(null)
  }, [setVersionActiva])
  const versionVistaTemporal = !!(versionActiva?.id && !puedeEditarVersionBiblioteca)
  useEffect(() => {
    if (!contratoId || oculto) return
    const vid = versionActiva?.id ? String(versionActiva.id) : null
    if (versionActivaIdTrackedRef.current === undefined) {
      versionActivaIdTrackedRef.current = vid
      return
    }
    if (versionActivaIdTrackedRef.current === vid) return
    versionActivaIdTrackedRef.current = vid
    _lastWriteAtRef.current = Date.now()
    cargaPptoIdRef.current += 1
    void recargarVistaVersionActivaRef.current?.()
  }, [versionActiva?.id, contratoId, oculto])
  useEffect(() => {
    if (!versionVistaTemporal || !oculto) return
    setVersionActivaRaw(null)
    pptoEndpointsRef.current = buildPptoEndpoints({ API, contratoId, versionActiva: null })
  }, [versionVistaTemporal, oculto, API, contratoId])
  const [verPapelera, setVerPapelera] = useState(false)
  const mostrarToggleTipoEjecucion = !verPapelera
  const versionVigente = useMemo(
    () => versionesPresupuesto.find((v) => v.es_vigente) || null,
    [versionesPresupuesto],
  )
  const mostrarVersionadorPresupuesto =
    !verPapelera && (fObra.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT) === PPTO_TIPO_EJECUCION_DEFAULT
  const [exportMetaContrato, setExportMetaContrato] = useState(null)
  const [exportEstimado, setExportEstimado] = useState({
    cargando: false,
    registros: null,
    items: null,
    alcance: '',
    esGrande: false,
  })
  const EXPORT_LENTO_REGISTROS = 1200
  const EXPORT_LENTO_SIN_FILTRO = 400
  /** SicoeCAD → API → ClaraCore (source=sicoe_cad), no el import CSV del navegador */
  const [sincroSicoeModal, setSincroSicoeModal] = useState(null) // { insertados, enviados?, ts, presupuesto_ids? }
  /** Discrepancias listado_precios antes de POST /bulk (mismo payload que SicoeCAD). */
  const [sicoeCadListadoModal, setSicoeCadListadoModal] = useState(null) // { discrepancias, itemsSnapshot, mode, sicoeEnviados }
  const [sicoeCadImportBusy, setSicoeCadImportBusy] = useState(false)
  const [hiloLoading,         setHiloLoading]         = useState(false)
  /** Texto de respuesta por comentario raíz (evita un solo input compartido entre varias tarjetas). */
  const [respuestaHiloPorId,  setRespuestaHiloPorId]  = useState({})
  const [nuevoComentTexto,    setNuevoComentTexto]    = useState('')
  
  // ── Enlace DWG (SicoeCAD heartbeat → cola cad_queue, no ClaraLink) ───────
  // Solo se muestra el indicador verde cuando hay DWG activo; el panel
  // «Ejes CAD» y el aviso rojo «Sin DWG» quedan ocultos (flujo Agent/SICOECAD).
  const [dwgEnlazado, setDwgEnlazado] = useState(false)
  const dwgEnlazadoRef = useRef(false)
  const navPlanoTimerRef = useRef(null)

  const refrescarDwgEnlazado = useCallback(async () => {
    if (!contratoId) return false
    try {
      const tok = getToken()
      if (!tok) return false
      const r = await fetch(`${API}/cad-queue/${contratoId}/estado`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!r.ok) return false
      const d = await r.json()
      const enlazado = !!d.enlazado
      dwgEnlazadoRef.current = enlazado
      setDwgEnlazado(enlazado)
      return enlazado
    } catch {
      return false
    }
  }, [contratoId])

  useEffect(() => {
    if (!contratoId || oculto) return
    void refrescarDwgEnlazado()
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') void refrescarDwgEnlazado()
    }, 5000)
    const onActivo = () => { if (document.visibilityState === 'visible') void refrescarDwgEnlazado() }
    document.addEventListener('visibilitychange', onActivo)
    window.addEventListener('focus', onActivo)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onActivo)
      window.removeEventListener('focus', onActivo)
    }
  }, [contratoId, oculto, refrescarDwgEnlazado])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.__claralink_disponible = true
    }
  }, [])

  // ── Aviso de auditoría: cantidades enviadas desde SicoeCAD (misma vía /bulk que alimenta presupuesto y la cola CAD) ──
  useEffect(() => {
    if (!contratoId || !token || oculto) return
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        const r = await fetch(`${API}/presupuesto/${contratoId}/sincro-sicoe-cad-auditoria`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })
        if (!r.ok) return
        const d = await r.json()
        if (d.pendiente) {
          setSincroSicoeModal((prev) => (prev && prev.ts === d.pendiente.ts ? prev : d.pendiente))
        }
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 16000)
    const onVis = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [contratoId, token, oculto])

  const cargarIdsConGrafico = useCallback(async () => {
    if (!contratoId || !token) {
      setIdsConGrafico(new Set())
      return
    }
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/graficos/presupuesto-ids`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const ids = Array.isArray(data?.presupuesto_ids) ? data.presupuesto_ids : []
      setIdsConGrafico(new Set(ids.map((id) => Number(id))))
    } catch {
      /* ignore */
    }
  }, [API, contratoId, token])

  useEffect(() => {
    if (!contratoId || !token || oculto) return
    void cargarIdsConGrafico()
  }, [contratoId, token, oculto, cargarIdsConGrafico])

    // ── Constantes drill-down ──────────────────────────────────────────────────
  const NIVELES = ['capitulo', 'item', 'pk_id']
  const NOM     = { capitulo:'Capítulo', item:'Ítem', pk_id:'PK_ID' }

  const fmt  = (n) => (n != null ? formatCOP(n) : '-')
  const fmtN = (n) => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '-'
  const fmtM = (n) => (n == null ? '' : formatCOPShort(n))

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const cargarVersionesPresupuesto = useCallback(async () => {
    if (!contratoId) return
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/versiones`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setVersionesPresupuesto(Array.isArray(data) ? data : [])
      }
    } catch {
      setVersionesPresupuesto([])
    }
  }, [API, contratoId, token])

  useEffect(() => {
    if (!contratoId || oculto) return
    // Capítulos: se llenan con el panel agregado (Buscar), no con capitulos-lista al abrir.
    void cargarVersionesPresupuesto()
  }, [contratoId, token, cargarVersionesPresupuesto, oculto])
  useEffect(() => {
    if (!contratoId || oculto) return
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/presupuesto/${contratoId}/maestro-ubicacion-pk`, { headers: h })
      .then((r) => (r.ok ? r.json() : { tramos: [], calzadas: [] }))
      .then((d) => setOpcionesUbicacion({ tramos: d.tramos || [], calzadas: d.calzadas || [] }))
      .catch(() => {})
  }, [contratoId, token, oculto])
  
useEffect(() => {
    if (!navRegistroId || !contratoId) return
    const tok = getToken()
    fetch(`${pptoEp().item(navRegistroId)}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(registro => {
        if (registro) {
          abrirDetallePptoDesdeFila(registro)
        }
      })
      .catch(() => {})
    if (onNavRegistroConsumed) onNavRegistroConsumed()
  }, [navRegistroId])

    useEffect(() => {
    if (!contratoId || oculto) return
    const q = new URLSearchParams({ contrato_id: String(contratoId) })
    fetch(`${API}/notificaciones/usuarios-destinatarios?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuariosDestinatarios).catch(() => {})
  }, [contratoId, token, oculto])

    useEffect(() => {
    if (!contratoId || oculto) return
    const pkidDrill = drill.find(d => d.campo === 'pk_id')
    if (pkidDrill) { setPptoPkidColores({}); return }
    const params = new URLSearchParams()
    const capDrill = drill.find(d => d.campo === 'capitulo')
    const itemDrill = drill.find(d => d.campo === 'item')
    const itemsDrill = drill.find(d => d.campo === 'items')
    if (itemDrill) params.set('item', itemDrill.valor)
    else if (capDrill) {
      params.set('capitulo', capDrill.valor)
      if (itemsDrill?.valor?.length === 1) params.set('item', String(itemsDrill.valor[0]))
    }
    fetch(`${API}/sicoe-obra/${contratoId}/dashboard-pkid-colores?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.ok ? r.json() : {}).then(setPptoPkidColores).catch(() => {})
  }, [contratoId, drill, oculto])

  useEffect(() => {
    limpiarUndoPresupuesto()
  }, [contratoId])

  useEffect(() => {
    if (!contratoId || oculto) return
    fetch(`${API}/listado-precios/${contratoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setListadoPrecios).catch(() => {})
  }, [contratoId, oculto])

  const esDevPpto    = esDeveloper || esDesarrolladorPresupuesto(usuario)
  const _permPpto    = permisoEditarRegistrosPresupuesto(usuario, contratoId)
  /** Contrato 2: editores con matriz «editar» pueden tratar nodos (no_inicio / no_final) y área/long como Desarrollador (backend alineado). */
  const PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG = 2
  const puedeEditarNodosYAreaLongComoDev =
    esDeveloper ||
    (Number(contratoId) === PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG && !!(_permPpto?.editar))
  /** Editar nodos (no_inicio / no_final) vía detalle / Aplicar cambios (no en columnas Tramo/Infraestructura). */
  const puedeEditarNodosGrilla = puedeEditarNodosYAreaLongComoDev
  /** Desarrollador o permiso «editar registros presupuesto» con acción editar: dimensiones y recálculo. */
  const puedeEditarDimensiones = (esDeveloper || (_permPpto?.editar ?? false)) && !versionVistaTemporal
  const puedeEditar  = (esDeveloper || (_permPpto?.editar   ?? false)) && !versionVistaTemporal
  /** Botón 💲↻: Desarrollador o matriz «editar registros presupuesto» con crear o editar. */
  const puedeSincronizarVlrUnitario = (
    esDeveloper || !!(_permPpto?.editar) || !!(_permPpto?.crear)
  ) && !versionVistaTemporal
  /** Cualquier usuario con permiso editar (o Desarrollador): puede reabrir sellado con motivo + destinatario. */
  const puedeReabrirTrasAprob = (esDeveloper || (_permPpto?.editar ?? false)) && !versionVistaTemporal
  const puedeValidar = (esDeveloper || (_permPpto?.validar  ?? false)) && !versionVistaTemporal
  const puedeEliminar = (esDeveloper || (_permPpto?.eliminar ?? false)) && !versionVistaTemporal
  const esSellado = (r) => r?.sellado === true
  const puedeSeleccionarFilaPpto = (r) => !esSellado(r) || puedeReabrirTrasAprob
  const filaPptoNoSeleccionable = (r) => !puedeSeleccionarFilaPpto(r)
  const aplicaReglasCadPresupuesto = Number(contratoId) !== PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG
  const MSG_BAJA_DESDE_PLANO =
    'Este registro está enlazado al plano (ID-POL). Para darlo de baja desde la web, abra AutoCAD con el DWG del contrato y pulse «Sincronizar» en SicoeCAD con el mismo usuario de ClaraCore (debe verse «DWG Enlazado» arriba). Si no hay enlace activo, gestione la baja desde SicoeCAD en el dibujo.'
  const MSG_AREA_LONG_DESDE_PLANO = 'El campo Área/Long/Nodo debe modificarse desde ClaraLink/DWG en este contrato.'
  const TITULO_DIM_CAD = 'Modificar desde ClaraLink/DWG (plano CAD)'
  const registroEnlazadoPlano = (r) => {
    const v = r?.id_pol
    return v != null && String(v).trim() !== ''
  }
  /** Misma regla que el backend: con id_pol solo bloquea si NO hay sesión CAD del usuario. */
  const bloqueaDarDeBajaDesdeWeb = (r, enlazado = dwgEnlazadoRef.current || dwgEnlazado) => {
    if (!aplicaReglasCadPresupuesto || !registroEnlazadoPlano(r)) return false
    return !enlazado
  }
  const puedeEditarAreaLongNodInline = () => !aplicaReglasCadPresupuesto && puedeEditarNodosYAreaLongComoDev
  const puedeEditarAnchoEspesorInline = () => puedeEditar
  const puedeIniciarEdicionDimsInline = (r) => {
    if (!puedeEditarDimensiones || esSellado(r)) return false
    return true
  }
  const estiloDimSoloLecturaCad = {
    color: t.textMuted,
    opacity: 0.88,
    fontStyle: 'italic',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }
  const renderDimBloqueadaCad = (valor, titulo) => (
    <span title={titulo || TITULO_DIM_CAD} style={estiloDimSoloLecturaCad}>
      <span aria-hidden="true" style={{ fontSize: '0.85em' }}>🔒</span>
      {valor ?? '—'}
    </span>
  )
  const validarDarDeBajaIds = async (ids, resolverReg) => {
    const requiereCad = ids.some((id) => {
      const r = resolverReg(id)
      return r && aplicaReglasCadPresupuesto && registroEnlazadoPlano(r)
    })
    let enlazado = dwgEnlazadoRef.current || dwgEnlazado
    if (requiereCad && !enlazado) enlazado = await refrescarDwgEnlazado()
    if (ids.some((id) => bloqueaDarDeBajaDesdeWeb(resolverReg(id), enlazado))) {
      window.alert(MSG_BAJA_DESDE_PLANO)
      return false
    }
    return true
  }

  const logDarBajaDiagnostico = (...partes) => {
    console.warn('[ClaraCore · Presupuesto · dar de baja]', ...partes)
  }

  const esRespuestaYaDadoDeBaja = (status, detail) => {
    if (status !== 400) return false
    const t = String(detail || '').toLowerCase()
    return (
      t.includes('dado de baja')
      || t.includes('ya estaba')
      || t.includes('ya se encuentra')
      || t.includes('operación duplicada')
      || t.includes('operacion duplicada')
      || t.includes('ya fue dado')
      || t.includes('estado inválido')
      || t.includes('estado invalido')
    )
  }

  async function clasificarRespuestaDarBaja(res, id) {
    if (res.ok) return { estado: 'ok', id }
    const detail = await leerDetalleErrorRes(res, `HTTP ${res.status}`)
    if (esRespuestaYaDadoDeBaja(res.status, detail)) {
      logDarBajaDiagnostico(`Ítem ${id}: ya dado de baja (HTTP ${res.status}) — ${detail}`)
      return { estado: 'ya_baja', id, detail, status: res.status }
    }
    logDarBajaDiagnostico(`Ítem ${id}: error HTTP ${res.status} — ${detail}`)
    logApiFailure(`presupuesto/dar-baja id=${id}`, new Error(`${res.status}: ${detail}`))
    return { estado: 'error', id, detail, status: res.status }
  }

  /**
   * Una sola ejecución de baja por lote (anti doble-click / concurrencia).
   * Trata «ya dado de baja» (400) como éxito idempotente, no como fallo bloqueante.
   */
  async function ejecutarDarDeBajaLote(ids, {
    comentario = '',
    destinatarioId = null,
    modoComentario = null,
    etiquetaComentario = '[BAJA]',
    resolverReg = (id) => registros.find((r) => r.id === id),
    alTerminarSeleccion = null,
  } = {}) {
    if (darDeBajaLockRef.current) {
      logDarBajaDiagnostico('Solicitud ignorada: ya hay un lote de baja en curso.')
      setAvisoSistema({
        titulo: 'Dar de baja',
        mensaje: 'Ya hay una operación de baja en curso. Espere a que finalice antes de intentar de nuevo.',
        tipo: 'warn',
      })
      return { cancelado: true, motivo: 'en_curso' }
    }

    const idsUnicos = [...new Set((ids || []).filter(Boolean))]
    if (!idsUnicos.length) return { cancelado: true, motivo: 'vacio' }

    const idsPendientes = idsUnicos.filter((id) => !resolverReg(id)?.dado_de_baja)
    const idsYaLocal = idsUnicos.filter((id) => resolverReg(id)?.dado_de_baja)
    if (idsYaLocal.length) {
      logDarBajaDiagnostico(
        `${idsYaLocal.length} ítem(s) omitidos en cliente (ya marcados dado_de_baja):`,
        idsYaLocal.join(', '),
      )
    }
    if (!idsPendientes.length) {
      setAvisoSistema({
        titulo: 'Dar de baja',
        mensaje: 'Los ítems seleccionados ya estaban dados de baja.',
        tipo: 'ok',
      })
      if (typeof alTerminarSeleccion === 'function') alTerminarSeleccion()
      await recargarCapActual()
      return { ok: 0, yaBaja: idsYaLocal.length, errores: [], cancelado: false }
    }

    darDeBajaLockRef.current = true
    setDandoDeBaja(true)
    logDarBajaDiagnostico(`Inicio lote (${idsPendientes.length} ítem(s)):`, idsPendientes.join(', '))

    const resultados = { ok: 0, yaBaja: idsYaLocal.length, errores: [] }

    try {
      for (const id of idsPendientes) {
        const res = await fetch(`${pptoEp().itemDarBaja(id)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        })
        const cls = await clasificarRespuestaDarBaja(res, id)
        if (cls.estado === 'ok') {
          resultados.ok += 1
          if (comentario.trim()) {
            await crearComentarios([id], 'validacion', `${etiquetaComentario} ${comentario}`, destinatarioId, modoComentario)
          }
        } else if (cls.estado === 'ya_baja') {
          resultados.yaBaja += 1
        } else {
          resultados.errores.push(cls)
        }
      }

      if (typeof alTerminarSeleccion === 'function') alTerminarSeleccion()

      _lastWriteAtRef.current = Date.now()
      await recargarCapActual()

      const lineas = []
      if (resultados.ok > 0) lineas.push(`${resultados.ok} dado(s) de baja correctamente.`)
      if (resultados.yaBaja > 0) {
        lineas.push(`${resultados.yaBaja} ya estaba(n) dado(s) de baja (sin reintentar layoff).`)
      }
      if (resultados.errores.length > 0) {
        const detErr = resultados.errores
          .slice(0, 8)
          .map((e) => `· ID ${e.id} (HTTP ${e.status}): ${e.detail}`)
          .join('\n')
        lineas.push(`${resultados.errores.length} no se pudo(ieron) dar de baja:\n${detErr}`)
        if (resultados.errores.length > 8) {
          lineas.push(`… y ${resultados.errores.length - 8} más (ver consola).`)
        }
      }

      logDarBajaDiagnostico('Resumen lote:', resultados)

      if (resultados.errores.length > 0) {
        setAvisoSistema({
          titulo: 'Dar de baja — resultado parcial',
          mensaje: lineas.join('\n\n'),
          tipo: resultados.ok + resultados.yaBaja > 0 ? 'warn' : 'error',
        })
      } else if (idsPendientes.length > 1 || resultados.yaBaja > 0) {
        setAvisoSistema({
          titulo: 'Dar de baja',
          mensaje: lineas.join('\n'),
          tipo: 'ok',
        })
      }

      return { ...resultados, cancelado: false }
    } finally {
      darDeBajaLockRef.current = false
      setDandoDeBaja(false)
    }
  }
  /** Grilla / detalle / tramos: edición si no está sellado, o contratista con permiso que puede reabrir. */
  const puedeEditarFilaPptoNoSelladoOReabrir = (r) => !esSellado(r) || puedeReabrirTrasAprob

  const ESTADOS_INTERV_CT_REQUIERE_MOTIVO = ['Aprobado', 'Pendiente', 'Rechazado']
  const MIN_JUSTIFICACION_INTERV = 15
  const MIN_JUSTIFICACION_EDICION = 3

  function valorCampoCambio(reg, body, k) {
    const a = body[k]
    const b = reg[k]
    if (k === 'vlr_unitario' || k === 'costo_directo' || k === 'area_long_nod' || k === 'ancho' || k === 'espesor') {
      const na = Number(a)
      const nb = Number(b)
      if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) > 1e-4
      return String(a ?? '') !== String(b ?? '')
    }
    return String(a ?? '').trim() !== String(b ?? '').trim()
  }

  function cuerpoTieneCambioSustantivo(reg, body) {
    if (!reg || !body || typeof body !== 'object') return false
    const keys = [
      'capitulo', 'item', 'descripcion', 'und', 'vlr_unitario', 'observacion_externa', 'costo_directo',
      'area_long_nod', 'ancho', 'espesor', 'no_inicio', 'no_final', 'tipo_ejecucion',
    ]
    return keys.some((k) => k in body && valorCampoCambio(reg, body, k))
  }

  function requiereMotivoIntervContratista(reg, body) {
    if (esDeveloper || esSellado(reg) || !body || typeof body !== 'object') return false
    if (!esRolContratistaDepuracion(usuario)) return false
    const rv = String(reg?.revisado || 'No Revisado').trim()
    if (!ESTADOS_INTERV_CT_REQUIERE_MOTIVO.includes(rv)) return false
    return cuerpoTieneCambioSustantivo(reg, body)
  }

  function mensajeJustificacionCorta(len, minLen, esInterv = false) {
    if (len <= 0) {
      return esInterv
        ? `Debe escribir una justificación de la modificación (mínimo ${minLen} caracteres). El registro volverá a «No Revisado» en Interventoría.`
        : 'Debe escribir una justificación de la modificación antes de guardar (explique qué cambió y por qué).'
    }
    return `La justificación es muy corta (${len} de ${minLen} caracteres). Amplíe el texto: indique qué dato modificó, el valor anterior si aplica y el motivo del cambio.`
  }

  async function adjuntarMotivoSiEdicionContratistaConInterv(reg, body) {
    if (!requiereMotivoIntervContratista(reg, body)) return { ok: true }
    const com = await pedirComentario('contratista_edita_interv', true, reg?.id != null ? [reg.id] : [])
    if (com == null) return { ok: false }
    const m = String(com.mensaje || '').trim()
    if (m.length < MIN_JUSTIFICACION_INTERV) {
      window.alert(mensajeJustificacionCorta(m.length, MIN_JUSTIFICACION_INTERV, true))
      return { ok: false }
    }
    body.motivo_edicion_con_estado_interv = m
    return { ok: true, modoComentario: com.modo || PPTO_COMENTARIO_MODO_APPEND }
  }

  /**
   * Panel detalle: popup de justificación (mismo espíritu que edición masiva / recálculo en grilla).
   * Devuelve { ok, comentarioTrazabilidad } para crear comentario tras guardar OK.
   */
  async function pedirJustificacionEdicionDetalle(reg, body, contexto) {
    if (!cuerpoTieneCambioSustantivo(reg, body)) return { ok: true }

    if (requiereMotivoIntervContratista(reg, body)) {
      const interv = await adjuntarMotivoSiEdicionContratistaConInterv(reg, body)
      return interv.ok ? { ok: true } : { ok: false }
    }

    if (esDeveloper) return { ok: true }

    const tipoComent = contexto === 'item_capitulo' ? 'item_capitulo' : 'dims'
    const com = await pedirComentario(tipoComent, true, reg?.id != null ? [reg.id] : [])
    if (com == null) return { ok: false }
    const m = String(com.mensaje || '').trim()
    if (m.length < MIN_JUSTIFICACION_EDICION) {
      window.alert(mensajeJustificacionCorta(m.length, MIN_JUSTIFICACION_EDICION, false))
      return { ok: false }
    }
    return {
      ok: true,
      comentarioTrazabilidad: {
        tipo: tipoComent,
        mensaje: m,
        destinatarioId: com.destinatarioId || null,
        modo: com.modo || PPTO_COMENTARIO_MODO_APPEND,
      },
    }
  }

  function textoObservacionRegistro(r) {
    const partes = []
    if (r?.observacion_externa) partes.push(String(r.observacion_externa).trim())
    if (r?.observacion) partes.push(String(r.observacion).trim())
    return partes.filter(Boolean).join(' · ') || null
  }

  async function leerDetalleErrorRes(res, fallback = 'Error al guardar') {
    try {
      const d = await res.json()
      const detail = d?.detail
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
      if (Array.isArray(detail)) {
        const parts = detail.map((x) => (typeof x === 'object' && x?.msg ? x.msg : String(x))).filter(Boolean)
        if (parts.length) return parts.join('; ')
      }
    } catch { /* ignore */ }
    return fallback
  }

  function abrirDetallePptoDesdeFila(registro) {
    if (!registro) return
    setModalDetallePpto(registro)
    setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(registro))
    setPopupDims({
      ancho: registro.ancho ?? '',
      espesor: registro.espesor ?? '',
      area_long_nod: registro.area_long_nod ?? '',
      no_inicio: registro.no_inicio ?? '',
      no_final: registro.no_final ?? '',
    })
    setPopupCap(registro.capitulo || '')
    setPopupTipoEjecucion(registro.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT)
    setPopupItem(registro.item || '')
    setPopupItemBusq(registro.item ? `${registro.item} · ${registro.descripcion || ''}` : '')
    setPopupMsg('')
  }
  /** Tras bulk-estado: refleja sellado cuando Interventoría aprueba (mismo criterio que el backend). */
  const aplicarCambioEstadoLocal = (r, ids, nuevoEstado) => {
    if (!ids.includes(r.id)) return r
    const next = { ...r, revisado: nuevoEstado }
    if (nuevoEstado === 'Aprobado' && usuario?.rol_nombre === 'Interventoría') {
      next.sellado = true
      next.validado_por = usuario?.nombre || usuario?.email || ''
      next.validado_en = new Date().toISOString()
    }
    if (nuevoEstado !== 'Aprobado') {
      next.validado_por = null
      next.validado_en = null
    }
    return next
  }
  const aplicarCambioPreIntervLocal = (r, ids, nuevoEstado) => {
    if (!ids.includes(r.id)) return r
    const next = { ...r, pre_interv_estado: nuevoEstado }
    if (nuevoEstado === 'Aprobado') {
      next.pre_interv_por = usuario?.nombre || usuario?.email || ''
      next.pre_interv_en = new Date().toISOString()
    } else {
      next.pre_interv_por = null
      next.pre_interv_en = null
    }
    return next
  }
  const puedePrevalidarUI = esDevPpto || puedeValidar
  const puedeValidarInterventoriaUI = esDevPpto || puedeValidar
  const puedeValidarInterventoriaRegistro = (r) => {
    if (!puedeValidarInterventoriaUI || esSellado(r)) return false
    if (esDevPpto) return true
    return preIntervLiberadoParaInterventoria(r)
  }
  const puedeTabEditarMasiva = esDevPpto || puedeEditar
  // Depuración (pre_interv_estado) es flujo interno del Contratista: oculta a todo rol Interventoría.
  const esLadoInterventoriaPpto = esRolInterventoriaValidacion(usuario)
  const puedeTabDepuracionMasiva =
    !esLadoInterventoriaPpto && (esDevPpto || (puedeValidar && esRolContratistaDepuracion(usuario)))
  const puedeTabInterventoriaMasiva = esDevPpto || puedeValidar
  const puedeAbrirEdicionMasiva =
    puedeTabEditarMasiva || puedeTabDepuracionMasiva || puedeTabInterventoriaMasiva
  const mostrarColumnaDepuracion = !esLadoInterventoriaPpto
  const _pptoCacheRef   = useRef(null)   // { data, ts, papelera } – solo para papelera
  const _pptoCachePorCap = useRef({})    // { [cacheKey]: { data, ts, total } }
  const _pptoPanelCacheRef = useRef({})   // { [panelKey]: { filas, capitulosResumen, total, ts } }
  const _pptoCapitulosListaCacheRef = useRef({}) // { [key]: { list, ts } }
  const panelFilasServidorRef = useRef(null)
  const _lastWriteAtRef  = useRef(0)     // timestamp de la última escritura; suprime polling 6 s post-write

  function registrarUndoPresupuesto(label, ids) {
    const lista = [...new Set((ids || []).filter(Boolean))]
    if (!lista.length) return
    const snap = capturarSnapshotFilas(registros, lista)
    if (!snap) return
    undoSnapRef.current = snap
    setUndoUltima({ label: String(label || 'Última acción'), count: lista.length, at: Date.now() })
  }

  function limpiarUndoPresupuesto() {
    undoSnapRef.current = null
    setUndoUltima(null)
  }

  async function deshacerUltimaAccionPresupuesto() {
    const snap = undoSnapRef.current
    const meta = undoUltima
    if (!snap || !meta || deshaciendo) return
    if (
      !window.confirm(
        `¿Deshacer «${meta.label}» en ${meta.count} registro(s)? Solo se revierte la última acción guardada.`,
      )
    ) {
      return
    }
    limpiarUndoPresupuesto()
    setDeshaciendo(true)
    try {
      const ids = await restaurarSnapshotPresupuesto({
        API,
        token,
        contratoId,
        snap,
        aplicaReglasCadPresupuesto: aplicaReglasCadPresupuesto,
        puedeEditarAreaLongNod: puedeEditarAreaLongNodInline(),
      })
      const byId = Object.fromEntries(filasDesdeSnapshot(snap).map((r) => [r.id, r]))
      setRegistros((prev) => prev.map((r) => (byId[r.id] ? { ...r, ...byId[r.id] } : r)))
      _lastWriteAtRef.current = Date.now()
      setAvisoSistema({
        titulo: 'Deshacer',
        mensaje: `Se restauró la última acción (${ids.length} registro(s)).`,
        tipo: 'ok',
      })
      cargarCapitulos({ silent: true }).catch(() => {})
    } catch (e) {
      undoSnapRef.current = snap
      setUndoUltima(meta)
      window.alert(e?.message || 'No se pudo deshacer la última acción.')
    } finally {
      setDeshaciendo(false)
    }
  }
  // Caché corta post-escritura (colaboración); navegación más larga al volver atrás en el panel
  const PPTO_CACHE_TTL  = VISTA_CACHE_TTL.presupuesto_live
  const CAP_CACHE_TTL   = VISTA_CACHE_TTL.presupuesto_live
  const CAP_CACHE_TTL_NAV = VISTA_CACHE_TTL.presupuesto_nav
  const pptoCacheTtlEfectivo = () =>
    Date.now() - _lastWriteAtRef.current < 10000 ? CAP_CACHE_TTL : CAP_CACHE_TTL_NAV
  const invalidarCachePresupuestoContrato = () => {
    _pptoCacheRef.current = null
    _pptoCachePorCap.current = {}
    _pptoPanelCacheRef.current = {}
    _pptoCapitulosListaCacheRef.current = {}
    if (contratoId) invalidateVistaModulo('presupuesto', contratoId)
  }
  const invalidarCachePanelPresupuesto = () => {
    _pptoPanelCacheRef.current = {}
    _pptoCapitulosListaCacheRef.current = {}
  }

  function pptoCacheEntryCompleta(entry) {
    if (!entry || !Array.isArray(entry.data)) return false
    if (typeof entry.total !== 'number' || entry.data.length < entry.total) return false
    return (Date.now() - entry.ts) < pptoCacheTtlEfectivo()
  }

  function pptoFiltrarFilasCliente(rows, f, drillArr) {
    if (!Array.isArray(rows) || !rows.length) return []
    return rows.filter((r) => pptoFilaCoincideFObra(r, f, drillArr))
  }

  /** Cache exacta o derivada filtrando un volcado completo ya en memoria (p. ej. 43k). */
  function pptoBuscarCacheGrilla(f, drillArr, leg = {}, { permitirDerivada = true } = {}) {
    const targetKey = pptoGridCacheKey(f, drillArr, leg)
    const exact = pptoLeerCacheGrid(targetKey)
    if (exact) {
      return { data: exact.data, total: exact.total, cacheKey: targetKey, derivado: false }
    }
    if (!permitirDerivada || pptoRequiereConsultaServidor(f, { drill: drillArr })) return null
    let mejor = null
    for (const entry of Object.values(_pptoCachePorCap.current)) {
      if (!pptoCacheEntryCompleta(entry)) continue
      const filtered = pptoFiltrarFilasCliente(entry.data, f, drillArr)
      if (!filtered.length) continue
      if (!mejor || entry.data.length > mejor.entry.data.length) {
        mejor = { entry, filtered }
      }
    }
    if (!mejor) return null
    return {
      data: mejor.filtered,
      total: mejor.filtered.length,
      cacheKey: targetKey,
      derivado: true,
    }
  }

  function pptoAplicarHitCacheGrilla(hit, f, drillArr) {
    if (!hit) return false
    setConteoFiltro(hit.total)
    setRegistros(hit.data)
    setVisibleRegistrosCount(50)
    pptoCargaRef.current = {
      key: hit.cacheKey,
      nextOffset: hit.data.length,
      hasMore: false,
      total: hit.total,
    }
    pptoGuardarEnCacheGrid(hit.cacheKey, hit.data, hit.total)
    busquedaServidorActivaRef.current = true
    setBusquedaServidorActiva(true)
    return true
  }
  /** Stack de vistas (grilla + filtros) para Atrás sin refetch. */
  const pptoDrillStackRef = useRef([])

  function pptoVersionScopeKey() {
    const vid = pptoEndpointsRef.current?.versionId
    return vid ? String(vid) : 'vivo'
  }

  function pptoGridCacheKey(f, drillArr, leg = {}) {
    const d = drillArr || []
    const capD = d.find((x) => x.campo === 'capitulo')
    const itemD = d.find((x) => x.campo === 'item')
    const itemsD = d.find((x) => x.campo === 'items')
    const ff = f || {}
    const itemsLista = fObraItemsLista(ff)
    const capVals = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), ff)
    let capKey = '*'
    if (leg.capOverride != null && String(leg.capOverride).trim()) {
      capKey = String(leg.capOverride).trim()
    } else if (capD?.valor) {
      capKey = String(capD.valor).trim()
    } else if (capVals.length) {
      capKey = capVals.slice().sort().join('\x1f')
    } else if (ff.cap) {
      capKey = String(ff.cap).trim()
    }
    const compVals = pptoFiltroValoresLista(pptoFiltroDef('competencia'), ff)
    const compKey = compVals.length ? compVals.slice().sort().join('\x1f') : ''
    let itemKey = ''
    if (leg.item != null && String(leg.item).trim()) {
      itemKey = String(leg.item).trim()
    } else if (itemsD?.valor?.length) {
      itemKey = [...itemsD.valor].map(String).sort().join('\x1f')
    } else if (itemD?.valor) {
      itemKey = String(itemD.valor)
    } else if (itemsLista.length > 1) {
      itemKey = itemsLista.map(String).sort().join('\x1f')
    } else if (itemsLista.length === 1) {
      itemKey = String(itemsLista[0])
    }
    const ubKey = pptoFiltroUbicacionCacheKey(ff)
    const obraKey = [
      ubKey.tramos,
      ubKey.calzadas,
      ubKey.infraestructuras,
      ff.eje, ff.revisado, ff.preInterv, ff.idPol, ff.pkCriterio, ff.texto,
      ff.nodoI, ff.nodoF, ff.absA, ff.absB, ff.tipoEjecucion,
    ].join('\x1e')
    return [
      pptoVersionScopeKey(),
      capKey,
      itemKey,
      compKey,
      leg.ubicacionTramo ?? ubicacionTramo,
      leg.ubicacionCalzada ?? ubicacionCalzada,
      leg.filtroEstado ?? filtroEstado,
      leg.busquedaTipo ?? busquedaTipo,
      leg.busquedaV1 ?? busquedaV1,
      leg.busquedaV2 ?? busquedaV2,
      leg.verPapelera ?? verPapelera,
      obraKey,
    ].join('|')
  }

  function pptoLeerCacheGrid(cacheKey) {
    if (!cacheKey) return null
    const cached = _pptoCachePorCap.current[cacheKey]
    if (!cached || (Date.now() - cached.ts) >= pptoCacheTtlEfectivo()) return null
    if (Array.isArray(cached.data) && typeof cached.total === 'number' && cached.data.length < cached.total) {
      return null
    }
    return cached
  }

  function pptoGuardarEnCacheGrid(cacheKey, rows, total) {
    if (!cacheKey) return
    _pptoCachePorCap.current[cacheKey] = {
      data: Array.isArray(rows) ? rows : [],
      ts: Date.now(),
      total: typeof total === 'number' ? total : (rows?.length ?? 0),
    }
  }

  /** Actualización optimista: invalida cargas en vuelo y sincroniza caché local. */
  function pptoParchearRegistrosOptimista(patchRowFn) {
    cargaPptoIdRef.current += 1
    _lastWriteAtRef.current = Date.now()
    const apply = (rows) => (Array.isArray(rows) ? rows.map(patchRowFn) : rows)
    setRegistros((prev) => apply(prev))
    for (const key of Object.keys(_pptoCachePorCap.current)) {
      const entry = _pptoCachePorCap.current[key]
      if (!entry?.data?.length) continue
      _pptoCachePorCap.current[key] = {
        ...entry,
        data: apply(entry.data),
        ts: Date.now(),
      }
    }
    if (_pptoCacheRef.current?.data?.length) {
      _pptoCacheRef.current = {
        ..._pptoCacheRef.current,
        data: apply(_pptoCacheRef.current.data),
        ts: Date.now(),
      }
    }
  }

  function pptoIniciarValidacionOptimista(patchRowFn) {
    pptoValidacionPendienteRef.current += 1
    pptoParchearRegistrosOptimista(patchRowFn)
  }

  function pptoFinValidacionOptimista() {
    pptoValidacionPendienteRef.current = Math.max(0, pptoValidacionPendienteRef.current - 1)
  }

  /** Tras validación exitosa en servidor: refrescar panel/conteos al cambiar de versión. */
  function pptoPostValidacionServidorOk() {
    invalidarCachePanelPresupuesto()
    _pptoCapitulosListaCacheRef.current = {}
  }

  function pptoCapitulosListaCacheKey(f, ctx) {
    const p = pptoQueryBib(pptoBuildPresupuestoSearchParams(f, ctx, {}))
    return `cap_list|${pptoVersionScopeKey()}|${p.toString()}`
  }

  function pptoPanelCacheKey(f, ctx, nivel, capituloDrill = '') {
    const p = pptoBuildPanelValidacionParams(f, ctx, {
      verPapelera,
      nivel,
      capituloDrill,
    })
    return `panel|cantEstadoV2|${pptoVersionScopeKey()}|${pptoQueryBib(p).toString()}`
  }

  function pptoPushVistaNavegacion() {
    const snap = {
      fObra: { ...(fObraRef.current || {}) },
      drill: [...(drill || [])],
      registros: Array.isArray(registrosRef.current) ? registrosRef.current : [],
      conteoFiltro: conteoFiltroRef.current,
      busquedaServidorActiva: busquedaServidorActivaRef.current,
      capActivo,
      cacheKey: pptoGridCacheKey(fObraRef.current, drill),
      panelFilasServidor: Array.isArray(panelFilasServidor) ? panelFilasServidor : null,
      capitulosResumenPanel: Array.isArray(capitulosResumen) && capitulosResumen.length
        ? [...capitulosResumen]
        : null,
    }
    const stack = pptoDrillStackRef.current
    const top = stack[stack.length - 1]
    if (top?.cacheKey === snap.cacheKey) {
      stack[stack.length - 1] = snap
    } else {
      stack.push(snap)
      if (stack.length > 24) stack.shift()
    }
    pptoGuardarEnCacheGrid(snap.cacheKey, snap.registros, snap.conteoFiltro ?? snap.registros.length)
    return snap
  }

  function pptoRestaurarVistaSnap(snap) {
    if (!snap) return false
    const f = { ...(snap.fObra || {}) }
    setFObra(f)
    fObraRef.current = f
    syncFObraALegacy(f)
    setDrill(Array.isArray(snap.drill) ? [...snap.drill] : [])
    setCapActivo(snap.capActivo ?? null)
    busquedaServidorActivaRef.current = !!snap.busquedaServidorActiva
    setBusquedaServidorActiva(!!snap.busquedaServidorActiva)
    const rows = Array.isArray(snap.registros) ? snap.registros : []
    setRegistros(rows)
    setConteoFiltro(snap.conteoFiltro ?? null)
    if (Array.isArray(snap.panelFilasServidor)) {
      setPanelFilasServidor(snap.panelFilasServidor)
      panelFilasServidorRef.current = snap.panelFilasServidor
    }
    if (Array.isArray(snap.capitulosResumenPanel)) {
      setCapitulosResumen(snap.capitulosResumenPanel)
    }
    const cacheKey = snap.cacheKey || pptoGridCacheKey(f, snap.drill)
    pptoCargaRef.current = {
      key: cacheKey,
      nextOffset: rows.length,
      hasMore: false,
      total: snap.conteoFiltro ?? rows.length,
    }
    pptoGuardarEnCacheGrid(cacheKey, rows, snap.conteoFiltro ?? rows.length)
    setVisibleRegistrosCount(50)
    setLoading(false)
    setCargandoGrillaPresupuesto(false)
    skipDebounceFiltrosRef.current = true
    return true
  }
  const [capitulosResumen,  setCapitulosResumen]  = useState([])
  const [loadingCapitulos,  setLoadingCapitulos]  = useState(false)
  const [itemsResumen,      setItemsResumen]      = useState([])
  const [capActivo,         setCapActivo]         = useState(null)  

  const armarFiltrosUbicacionSolo = useCallback(() => {
    const p = new URLSearchParams()
    if (ubicacionTramo) p.set('tramo', ubicacionTramo)
    if (ubicacionCalzada) p.set('calzada', ubicacionCalzada)
    if (busquedaTipo === 'nodo' || busquedaTipo === 'tramo') {
      if (busquedaV1.trim()) p.set('nodo_inicio', busquedaV1.trim())
      if (busquedaV2.trim()) p.set('nodo_final', busquedaV2.trim())
    } else if (busquedaTipo === 'abscisa') {
      const a = busquedaV1.trim() !== '' ? parseFloat(String(busquedaV1).replace(',', '.')) : null
      const b = busquedaV2.trim() !== '' ? parseFloat(String(busquedaV2).replace(',', '.')) : null
      if (a != null && !Number.isNaN(a)) p.set('abs_desde', String(a))
      if (b != null && !Number.isNaN(b)) p.set('abs_hasta', String(b))
    } else if ((busquedaTipo === 'idpol' || busquedaTipo === 'registro') && busquedaV1.trim()) {
      p.set('buscar', busquedaV1.trim())
    }
    return p
  }, [ubicacionTramo, ubicacionCalzada, busquedaTipo, busquedaV1, busquedaV2])

  /**
   * Misma semántica que `aplicarFiltroObraConF`: cap/ítem + SICOE Obra (pk_criterio, id_pol, tramos, etc.)
   * para que el poll / debounce no borre un filtro fino (p. ej. PK elegido en el mapa).
   */
  const armarQueryPresupuestoServer = useCallback(() => {
    const ctx = pptoCtxFiltro(drill, capExpandido)
    const fMerged = pptoFObraParaConsulta(fObraRef.current || fObra, { filtroEstado })
    if (ubicacionTramo) { fMerged.tramo = ubicacionTramo; fMerged.tramos = [] }
    if (ubicacionCalzada) { fMerged.calzada = ubicacionCalzada; fMerged.calzadas = [] }
    const p = pptoBuildPresupuestoSearchParams(fMerged, ctx, { verPapelera })
    const leg = armarFiltrosUbicacionSolo()
    for (const [k, v] of leg.entries()) {
      if (k === 'buscar' || k === 'nodo_inicio' || k === 'nodo_final' || k === 'abs_desde' || k === 'abs_hasta') {
        if (!p.has(k)) p.set(k, v)
      }
    }
    return p
  }, [armarFiltrosUbicacionSolo, drill, fObra, capExpandido, verPapelera, ubicacionTramo, ubicacionCalzada, filtroEstado])

  const armarPayloadExportPresupuesto = useCallback(() => {
    const f = pptoFObraParaConsulta(fObraRef.current || fObra, { filtroEstado })
    return pptoFObraToExportBody(f, {
      drill,
      capExpandido,
      tipoEjecucionDefault: PPTO_TIPO_EJECUCION_DEFAULT,
      verPapelera,
    })
  }, [drill, fObra, capExpandido, verPapelera, filtroEstado])

  const payloadExportAQuery = useCallback((payload) => pptoExportBodyToSearchParams(payload), [])

  const describirAlcanceExport = useCallback((payload, totalReg, itemsCount) => {
    const partes = []
    if (payload.capitulo) {
      const capTxt = String(payload.capitulo)
      partes.push(`Capítulo: ${capTxt.length > 36 ? `${capTxt.slice(0, 36)}…` : capTxt}`)
    } else if (Array.isArray(payload.capitulos) && payload.capitulos.length) {
      partes.push(`${payload.capitulos.length} capítulo${payload.capitulos.length !== 1 ? 's' : ''}`)
    }
    if (Array.isArray(payload.items) && payload.items.length) {
      partes.push(`${payload.items.length} ítem${payload.items.length !== 1 ? 's' : ''}`)
    } else if (payload.item) {
      partes.push(`Ítem: ${payload.item}`)
    } else if ((payload.capitulo || payload.capitulos?.length) && itemsCount != null) {
      partes.push(`${itemsCount} ítem${itemsCount !== 1 ? 's' : ''} del capítulo`)
    }
    if (payload.tipo_ejecucion) partes.push(payload.tipo_ejecucion)
    if (payload.tramo) partes.push(`Tramo: ${payload.tramo}`)
    else if (Array.isArray(payload.tramos) && payload.tramos.length) partes.push(`${payload.tramos.length} tramos`)
    if (payload.calzada) partes.push(`Calzada: ${payload.calzada}`)
    if (payload.revisado) partes.push(`Int.: ${payload.revisado}`)
    if (payload.pre_interv_estado) partes.push(`Dep.: ${payload.pre_interv_estado}`)
    if (payload.id_pol) partes.push(`ID-POL: ${payload.id_pol}`)
    if (payload.pk_criterio) partes.push(`PK: ${payload.pk_criterio}`)
    if (payload.texto) partes.push('Texto filtrado')
    if (payload.competencia) partes.push(`Comp.: ${payload.competencia}`)
    if (payload.und) partes.push(`Und: ${payload.und}`)
    const base = partes.length ? partes.join(' · ') : 'Sin filtros activos'
    if (totalReg != null) return `${base} — ${totalReg.toLocaleString('es-CO')} registros`
    return base
  }, [])

  const abrirPopupExportPresupuesto = useCallback(async () => {
    if (!contratoId) return
    setExportPresupuestoOpen(true)
    setExportPresupuestoError(null)
    setExportPresupuestoFormato('informe')
    setExportMetaContrato(null)
    setExportEstimado({ cargando: true, registros: null, items: null, alcance: 'Calculando alcance…', esGrande: false })
    try {
      const rc = await fetch(`${API}/contratos/${contratoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const c = rc.ok ? await rc.json() : null
      setExportMetaContrato(c && typeof c === 'object' ? c : null)
    } catch {
      setExportMetaContrato(null)
    }

    try {
      const payload = armarPayloadExportPresupuesto()
      const hayFiltroCapItem = !!(payload.capitulo || payload.capitulos?.length || payload.item || (payload.items && payload.items.length))
      const p = payloadExportAQuery(payload)
      const resC = await fetch(`${API}/presupuesto/${contratoId}/conteo${p.toString() ? `?${p.toString()}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      let totalReg = conteoFiltroRef.current
      if (resC.ok) {
        const j = await resC.json()
        if (j && typeof j.total === 'number') totalReg = j.total
      } else if (totalReg == null && !hayFiltroCapItem) {
        totalReg = capitulosResumen.reduce((s, x) => s + (x.total_registros || 0), 0)
      }

      let itemsCount = null
      if (Array.isArray(payload.items) && payload.items.length) {
        itemsCount = payload.items.length
      } else if (payload.item) {
        itemsCount = 1
      } else if (payload.capitulo && String(payload.capitulo) === String(capExpandido || fObraRef.current?.cap || '')) {
        itemsCount = itemsResumen.length
      } else if (Array.isArray(payload.capitulos) && payload.capitulos.length === 1 && String(payload.capitulos[0]) === String(capExpandido || fObraRef.current?.cap || '')) {
        itemsCount = itemsResumen.length
      }

      const esGrande =
        (totalReg != null && totalReg >= EXPORT_LENTO_REGISTROS) ||
        (!hayFiltroCapItem && totalReg != null && totalReg >= EXPORT_LENTO_SIN_FILTRO)

      setExportEstimado({
        cargando: false,
        registros: totalReg,
        items: itemsCount,
        alcance: describirAlcanceExport(payload, totalReg, itemsCount),
        esGrande,
      })
    } catch {
      setExportEstimado({
        cargando: false,
        registros: null,
        items: null,
        alcance: 'No se pudo estimar el tamaño; se usarán los filtros activos.',
        esGrande: false,
      })
    }
  }, [
    API,
    armarPayloadExportPresupuesto,
    capExpandido,
    capitulosResumen,
    contratoId,
    describirAlcanceExport,
    itemsResumen.length,
    payloadExportAQuery,
    token,
  ])

  const descargarPresupuestoExcel = useCallback(async () => {
    if (!contratoId || exportPresupuestoBusy) return
    setExportPresupuestoBusy(true)
    setExportPresupuestoError(null)
    try {
      const filtros = armarPayloadExportPresupuesto()
      const ctx = { drill, capExpandido, tipoEjecucionDefault: PPTO_TIPO_EJECUCION_DEFAULT }
      if (!criterioVistaActivo(fObraRef.current || fObra, ctx)) {
        throw new Error('Pulse Buscar (o cambie el toggle) antes de exportar.')
      }
      const exportTipo = pptoExportTipoDesdeVista(fObraRef.current?.tipoEjecucion || fObra.tipoEjecucion)
      const modo = pptoExportModoFromSeleccion(exportPresupuestoFormato, exportTipo)
      const tipoExport = exportTipo === 'obra_ejecutada'
        ? PPTO_TIPO_EJECUCION_OBRA
        : PPTO_TIPO_EJECUCION_DEFAULT
      const esCrudo = exportPresupuestoFormato === 'crudo'
      const res = await fetch(`${API}/presupuesto/${contratoId}/exportar-informe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...filtros, modo, tipo_ejecucion: tipoExport }),
      })
      if (!res.ok) {
        let msg = `Error ${res.status} exportando presupuesto`
        try {
          const j = JSON.parse(await res.text())
          msg = j?.detail || msg
        } catch {
          /* ignore */
        }
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const payload = await res.json()
      let metaFuente = exportMetaContrato
      const logosIncompletos =
        !metaFuente?.logo_interventoria || !metaFuente?.logo_entidad || !metaFuente?.logo_contratista
      if (logosIncompletos) {
        try {
          const rc = await fetch(`${API}/contratos/${contratoId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (rc.ok) {
            const fresh = await rc.json()
            if (fresh && typeof fresh === 'object') {
              metaFuente = fresh
              setExportMetaContrato(fresh)
            }
          }
        } catch {
          /* usa meta previa / sesión */
        }
      }
      const metaExport = resolverMetaLogosPresupuesto(metaFuente, usuario, contratoId)
      if (esCrudo || payload?.formato === 'crudo') {
        if (!payload?.filas?.length) {
          throw new Error('No hay registros para exportar con los filtros actuales.')
        }
        await downloadPresupuestoCrudoExcel(payload, metaExport, contratoId)
      } else {
        if (!payload?.resumen?.length) {
          throw new Error('No hay registros para exportar con los filtros actuales.')
        }
        const stats = await downloadPresupuestoInformeExcel(
          payload,
          metaExport,
          contratoId,
          undefined,
          { API, token },
        )
        if (stats?.graficosEnPayload > 0 && stats?.graficosEmbebidos === 0) {
          setExportPresupuestoError(
            'El Excel se generó, pero no se pudieron incrustar los gráficos. Revise la conexión o vuelva a intentar.',
          )
        }
      }
      setExportPresupuestoOpen(false)
    } catch (e) {
      setExportPresupuestoError(e?.message || 'Error exportando Excel')
    } finally {
      setExportPresupuestoBusy(false)
    }
  }, [
    API,
    armarPayloadExportPresupuesto,
    contratoId,
    exportMetaContrato,
    exportPresupuestoBusy,
    exportPresupuestoFormato,
    fObra,
    token,
    drill,
    capExpandido,
    usuario,
  ])

  const detalleConItem = !!drill.find(d => d.campo === 'item' || d.campo === 'items')
  const cacheKeyPpto = useMemo(
    () => pptoGridCacheKey(fObra, drill),
    [drill, ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2, verPapelera, fObra, versionActiva?.id],
  )

  const keyCacheFila = (cap, it) => pptoGridCacheKey(fObraRef.current, drill, { item: it, capOverride: cap })

  /**
   * Carga el listado completo: 1 request de conteo + N páginas con concurrencia limitada (max 3).
   * Limitar a 3 simultáneos evita saturar el pool de conexiones de Supabase.
   * @param {URLSearchParams} pQuery mismos params que el listado
   * @param {(rows: object[]) => void} [onBatch] Tras cada tanda de hasta 3 peticiones en paralelo, filas acumuladas hasta el momento (misma orden que al finalizar).
   * @param {{ avisarCargaGrande?: boolean, onTotalConocido?: (total: number) => void }} [opts]
   */
  async function fetchPresupuestoPaginasCompletas(pQuery, onBatch, opts = {}) {
    const { avisarCargaGrande = true, onTotalConocido } = opts
    const h = { Authorization: `Bearer ${token}` }
    const pBib = pptoQueryBib(pQuery)
    const qC = pBib.toString()
    const ep = pptoEp()
    const resC = await fetch(`${ep.conteo}${qC ? `?${qC}` : ''}`, { headers: h })
    let totalN = 0
    if (resC.ok) {
      const j = await resC.json()
      if (j && typeof j.total === 'number') totalN = j.total
    } else {
      let det = `Error ${resC.status} al contar registros`
      try {
        const j = await resC.json()
        det = j?.detail || det
      } catch { /* ignore */ }
      throw new Error(typeof det === 'string' ? det : JSON.stringify(det))
    }
    if (typeof onTotalConocido === 'function') onTotalConocido(totalN)
    if (totalN > PRES_PTO_ALERTA_GRANDE_UMBRAL && avisarCargaGrande) {
      const continuar = await pedirConfirmacionCargaGrande(totalN)
      if (!continuar) return { rows: [], total: totalN, cancelado: true }
    }
    if (totalN === 0) return { rows: [], total: 0 }

    const offsets = []
    for (let off = 0; off < totalN; off += PRES_PTO_CHUNK) offsets.push(off)

    const fetchPage = async (off) => {
      const p = pptoQueryBib(pQuery)
      p.set('limit', String(PRES_PTO_CHUNK))
      p.set('offset', String(off))
      for (let intento = 0; intento < 3; intento += 1) {
        try {
          const r = await fetch(`${ep.list}?${p.toString()}`, { headers: h })
          if (r.ok) {
            const d = await r.json()
            if (Array.isArray(d)) return d
          }
        } catch { /* reintento */ }
        if (intento < 2) await new Promise((res) => setTimeout(res, 350 * (intento + 1)))
      }
      return []
    }

    // Concurrencia máxima de 3 páginas simultáneas para no saturar Supabase
    const CONCURRENCY = 3
    const allRows = []
    for (let i = 0; i < offsets.length; i += CONCURRENCY) {
      const batch = offsets.slice(i, i + CONCURRENCY)
      const batchPages = await Promise.all(batch.map(fetchPage))
      allRows.push(...batchPages.flat())
      if (typeof onBatch === 'function') {
        onBatch(allRows.slice())
      }
    }
    if (allRows.length < totalN) {
      console.warn(`[Presupuesto] Carga incompleta: ${allRows.length}/${totalN} filas`)
    }
    return { rows: allRows, total: totalN }
  }

async function cargarRegistros(modoPapelera, forzar = false) {
    if (!contratoId) return
    const esPapelera = modoPapelera !== undefined ? modoPapelera : verPapelera
    // Servir desde caché si es válido (solo activos; papelera siempre pagina en servidor)
    const cached = _pptoCacheRef.current
    if (!esPapelera && !forzar && cached && cached.papelera === false &&
        (Date.now() - cached.ts) < PPTO_CACHE_TTL) {
      setRegistros(cached.data)
      setVisibleRegistrosCount(50)
      return
    }
    setLoading(true)
    const ep = pptoEp()
    const h = { Authorization: `Bearer ${token}` }
    try {
      if (esPapelera) {
        // Evitar que filtros/drill de la vista activa oculten la página del servidor
        setRegistros([])
        papeleraNextOffsetRef.current = 0
        setPapeleraCargados(0)
        setPapeleraTotal(0)
        const pCount = pptoQueryBib(new URLSearchParams({ papelera: 'true' }))
        let totalN = 0
        try {
          const resC = await fetch(`${ep.conteo}?${pCount.toString()}`, { headers: h })
          if (resC.ok) {
            const j = await resC.json()
            if (j && typeof j.total === 'number') totalN = j.total
          }
        } catch { /* ignore */ }
        setPapeleraTotal(totalN)
        const p = pptoQueryBib(new URLSearchParams({
          papelera: 'true',
          limit: String(PAPELERA_PAGE),
          offset: '0',
        }))
        const res = await fetch(`${ep.list}?${p.toString()}`, { headers: h })
        if (res.ok) {
          const data = await res.json()
          const rows = Array.isArray(data) ? data : []
          setRegistros(rows)
          papeleraNextOffsetRef.current = rows.length
          setPapeleraCargados(rows.length)
          setVisibleRegistrosCount(Math.max(rows.length, PAPELERA_PAGE))
          if (totalN === 0 && rows.length > 0) setPapeleraTotal(rows.length)
        } else {
          console.warn('[Presupuesto] Papelera: listado falló', res.status)
          setRegistros([])
          papeleraNextOffsetRef.current = 0
          setPapeleraCargados(0)
          setAvisoSistema({
            titulo: 'Papelera',
            mensaje: `No se pudieron cargar los registros dados de baja (HTTP ${res.status}).`,
            tipo: 'warn',
          })
        }
      } else {
        setPapeleraTotal(0)
        papeleraNextOffsetRef.current = 0
        setPapeleraCargados(0)
        const params = new URLSearchParams()
        const pFinal = pptoQueryBib(params)
        const qs = pFinal.toString()
        const res = await fetch(`${ep.list}${qs ? `?${qs}` : ''}`, { headers: h })
        if (res.ok) {
          const data = await res.json()
          _pptoCacheRef.current = { data, ts: Date.now(), papelera: false }
          setRegistros(data)
        }
        setVisibleRegistrosCount(50)
      }
    } finally {
      setLoading(false)
    }
  }

  async function cargarMasPapeleraServidor(increment) {
    if (!verPapelera || papeleraCargandoMas || loading) return
    const off = papeleraNextOffsetRef.current
    if (papeleraTotal > 0 && off >= papeleraTotal) return
    const want = increment === 'all'
      ? Math.min(1000, Math.max(0, (papeleraTotal || off + 1000) - off))
      : Math.max(1, Number(increment) || PAPELERA_PAGE)
    if (want <= 0) return
    setPapeleraCargandoMas(true)
    try {
      const ep = pptoEp()
      const p = pptoQueryBib(new URLSearchParams({
        papelera: 'true',
        limit: String(want),
        offset: String(off),
      }))
      const res = await fetch(`${ep.list}?${p.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const rows = Array.isArray(data) ? data : []
      if (!rows.length) {
        if (papeleraTotal > 0) {
          papeleraNextOffsetRef.current = papeleraTotal
          setPapeleraCargados(papeleraTotal)
        }
        return
      }
      setRegistros((prev) => {
        const seen = new Set(prev.map((r) => r.id))
        const merged = prev.slice()
        for (const r of rows) {
          if (r?.id != null && !seen.has(r.id)) {
            seen.add(r.id)
            merged.push(r)
          }
        }
        return merged
      })
      const nextOff = off + rows.length
      papeleraNextOffsetRef.current = nextOff
      setPapeleraCargados(nextOff)
      setVisibleRegistrosCount((n) => Math.max(n, nextOff))
    } finally {
      setPapeleraCargandoMas(false)
    }
  }

  const capitulosFetchRef = useRef(0)

  // ── Carga lazy por capítulo ────────────────────────────────────────────────
  async function cargarCapitulos(opts = {}) {
    const silent = !!opts.silent
    if (!contratoId) return
    const f = fObraRef.current || fObra
    const ctx = pptoCtxFiltro(drill, capExpandido)
    const cacheKey = pptoCapitulosListaCacheKey(f, ctx)
    if (!opts.force) {
      const cached = _pptoCapitulosListaCacheRef.current[cacheKey]
      if (cached && Date.now() - cached.ts < pptoCacheTtlEfectivo() && Array.isArray(cached.list)) {
        setCapitulosResumen(cached.list)
        return
      }
    }
    const seq = ++capitulosFetchRef.current
    if (!silent) setLoadingCapitulos(true)
    try {
      const p = pptoQueryBib(pptoBuildPresupuestoSearchParams(fObraRef.current || fObra, pptoCtxFiltro(drill, capExpandido), {}))
      const qs = p.toString()
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 120000)
      const res = await fetch(`${pptoEp().capitulosLista}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      })
      clearTimeout(t)
      if (seq !== capitulosFetchRef.current) return
      if (res.ok) {
        const list = await res.json()
        const sorted = Array.isArray(list) ? [...list].sort(cmpCapituloLabel) : list
        setCapitulosResumen(sorted)
        _pptoCapitulosListaCacheRef.current[cacheKey] = { list: sorted, ts: Date.now() }
      }
    } catch { /* silencio */ } finally {
      if (seq === capitulosFetchRef.current && !silent) setLoadingCapitulos(false)
    }
  }
  
  async function cargarCapituloData(capitulo, item = null, opts = false) {
    const o = typeof opts === 'object' && opts && !Array.isArray(opts) ? opts : { forzar: !!opts, syncPreserveSize: false }
    const cap = String(capitulo || '').trim()
    if (!contratoId || !cap) return
    const ctx = pptoCtxFiltro(drill, capExpandido)
    const p = pptoBuildPresupuestoSearchParams(fObraRef.current || fObra, ctx, {
      verPapelera,
      capituloOverride: cap,
      itemOverride: item,
    })
    const cacheKey = pptoGridCacheKey(fObraRef.current, drill, { capOverride: cap, item })
    const silent = !!o.forzar && !!o.syncPreserveSize
    if (!o.forzar) {
      const cached = pptoLeerCacheGrid(cacheKey)
      if (cached) {
        setRegistros(cached.data)
        if (typeof cached.total === 'number') setConteoFiltro(cached.total)
        pptoCargaRef.current = {
          key: cacheKey,
          nextOffset: Array.isArray(cached.data) ? cached.data.length : 0,
          hasMore: false,
          total: typeof cached.total === 'number' ? cached.total : 0,
        }
        return
      }
    } else {
      delete _pptoCachePorCap.current[cacheKey]
    }
    cargaPptoIdRef.current += 1
    const cargaId = cargaPptoIdRef.current
    if (silent) {
      cargaPptoInFlightRef.current = true
    } else {
      busquedaServidorActivaRef.current = false
      setLoading(true)
      setVisibleRegistrosCount(50)
    }
    try {
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p, (partial) => {
        if (cargaId !== cargaPptoIdRef.current) return
        setRegistros(partial)
      }, { avisarCargaGrande: !silent, onTotalConocido: silent ? undefined : (n) => {
        if (cargaId === cargaPptoIdRef.current) setConteoFiltro(n)
      } })
      if (cargaId !== cargaPptoIdRef.current) return
      setConteoFiltro(total)
      setRegistros(rows)
      pptoCargaRef.current = { key: cacheKey, nextOffset: rows.length, hasMore: false, total }
      _pptoCachePorCap.current[cacheKey] = { data: rows, ts: Date.now(), total }
    } catch { /* silencio */ } finally {
      if (silent) {
        cargaPptoInFlightRef.current = false
      } else {
        setLoading(false)
      }
    }
  }

  /** Carga o refresca el detalle (ítem) con filtros de servidor; invalida caché por query. */
  async function refreshRegistrosDetalle({ forzar = false, syncPreserveSize = false } = {}) {
    if (!contratoId || !detalleConItem) return
    if (pptoValidacionPendienteRef.current > 0) return
    const silent = !!forzar && !!syncPreserveSize
    if (!forzar) {
      const cached = pptoLeerCacheGrid(cacheKeyPpto)
      if (cached) {
        setRegistros(cached.data)
        if (typeof cached.total === 'number') setConteoFiltro(cached.total)
        pptoCargaRef.current = {
          key: cacheKeyPpto,
          nextOffset: Array.isArray(cached.data) ? cached.data.length : 0,
          hasMore: false,
          total: typeof cached.total === 'number' ? cached.total : 0,
        }
        return
      }
    } else {
      delete _pptoCachePorCap.current[cacheKeyPpto]
    }
    cargaPptoIdRef.current += 1
    const cargaId = cargaPptoIdRef.current
    if (silent) {
      cargaPptoInFlightRef.current = true
    } else {
      setLoading(true)
    }
    try {
      const p0 = armarQueryPresupuestoServer()
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p0, (partial) => {
        if (cargaId !== cargaPptoIdRef.current) return
        setRegistros(partial)
      }, {
        avisarCargaGrande: !silent,
        onTotalConocido: silent ? undefined : (n) => {
          if (cargaId === cargaPptoIdRef.current) setConteoFiltro(n)
        },
      })
      if (cargaId !== cargaPptoIdRef.current) return
      setConteoFiltro(total)
      setRegistros(rows)
      pptoCargaRef.current = { key: cacheKeyPpto, nextOffset: rows.length, hasMore: false, total }
      _pptoCachePorCap.current[cacheKeyPpto] = { data: rows, ts: Date.now(), total }
    } catch { /* silencio */ } finally {
      if (silent) {
        cargaPptoInFlightRef.current = false
      } else {
        setLoading(false)
      }
    }
  }

  const skipDebounceFiltrosRef = useRef(true)

  useEffect(() => {
    if (!detalleConItem) {
      setUbicacionTramo('')
      setUbicacionCalzada('')
      setConteoFiltro(null)
    }
  }, [detalleConItem])

  useEffect(() => {
    if (!contratoId || !detalleConItem) return
    const capD = drill.find(d => d.campo === 'capitulo')
    const itemD = drill.find(d => d.campo === 'item')
    const itemsD = drill.find(d => d.campo === 'items')
    if (!capD?.valor) return
    const u = new URLSearchParams({ capitulo: capD.valor })
    if (itemsD?.valor?.length > 1) {
      for (const it of itemsD.valor) u.append('items', String(it))
    } else if (itemD?.valor) {
      u.set('item', itemD.valor)
    } else if (itemsD?.valor?.length === 1) {
      u.set('item', String(itemsD.valor[0]))
    } else return
    fetch(`${API}/presupuesto/${contratoId}/filtros?${u}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOpcionesUbicacion({ tramos: d.tramos || [], calzadas: d.calzadas || [] }) })
      .catch(() => {
        fetch(`${API}/presupuesto/${contratoId}/maestro-ubicacion-pk`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setOpcionesUbicacion({ tramos: d.tramos || [], calzadas: d.calzadas || [] }) })
          .catch(() => {})
      })
  }, [contratoId, detalleConItem, drill, token])

  useEffect(() => {
    if (!detalleConItem || !contratoId) {
      skipDebounceFiltrosRef.current = true
      return
    }
    if (skipDebounceFiltrosRef.current) {
      skipDebounceFiltrosRef.current = false
      return
    }
    if (debounceFetchPptoRef.current) clearTimeout(debounceFetchPptoRef.current)
    debounceFetchPptoRef.current = setTimeout(() => {
      debounceFetchPptoRef.current = null
      refreshRegistrosDetalle({ forzar: true, syncPreserveSize: false })
    }, 450)
    return () => { if (debounceFetchPptoRef.current) clearTimeout(debounceFetchPptoRef.current) }
  }, [contratoId, detalleConItem, ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2])

  async function recargarCapActual(limpiarTodo = false) {
    // Suprimir polling durante la recarga para que el cargaId no sea invalidado por el tick
    _lastWriteAtRef.current = Date.now()
    if (limpiarTodo) {
      if (versionActiva?.id && recargarVistaVersionActivaRef.current) {
        await recargarVistaVersionActivaRef.current()
        return
      }
      // Con búsqueda/filtro activo: re-ejecutar la consulta (antes solo limpiaba la grilla
      // y recargaba la lista de capítulos → el botón «Actualizar» parecía no hacer nada).
      const fAct = fObraRef.current || fObra
      const ctxAct = pptoCtxFiltro(drill, capExpandido)
      if (
        busquedaServidorActivaRef.current ||
        criterioVistaActivo(fAct, ctxAct)
      ) {
        invalidarCachePresupuestoContrato()
        if (aplicarFiltroObraConFRef.current) {
          await aplicarFiltroObraConFRef.current(fAct, {
            cargarGrilla: true,
            skipCacheGrilla: true,
            pushNavegacionAntes: false,
            limpiarNavegacion: false,
          })
          return
        }
      }
      invalidarCachePresupuestoContrato()
      setRegistros([])
      setDrill([])
      setUbicacionTramo('')
      setUbicacionCalzada('')
      await cargarCapitulos({ silent: true })
      return
    }
    const capActual = drill.find(d => d.campo === 'capitulo')?.valor
    const itemActual = drill.find(d => d.campo === 'item')?.valor
    const itemsMulti = drill.find(d => d.campo === 'items')?.valor
    if (capActual) {
      if (detalleConItem) {
        delete _pptoCachePorCap.current[cacheKeyPpto]
        const keep = new Set(
          Array.isArray(itemsMulti) && itemsMulti.length
            ? itemsMulti.map((x) => String(x))
            : itemActual
              ? [String(itemActual)]
              : []
        )
        if (keep.size) {
          setRegistros((prev) => prev.filter((r) => r.capitulo !== capActual || keep.has(String(r.item))))
        } else {
          setRegistros((prev) => prev.filter((r) => r.capitulo !== capActual))
        }
        await refreshRegistrosDetalle({ forzar: true, syncPreserveSize: false })
      } else {
        delete _pptoCachePorCap.current[pptoGridCacheKey(fObraRef.current, drill, { capOverride: capActual, item: '' })]
        setRegistros((prev) => prev.filter((r) => r.capitulo !== capActual))
        await cargarCapituloData(capActual, null)
      }
    }
    await cargarCapitulos({ silent: true })
  }
  recargarCapActualRef.current = recargarCapActual

  const abrirSincronizarVlrUnitario = useCallback(() => {
    setSyncVlrPhase('confirm')
    setSyncVlrError(null)
    setSyncVlrResult(null)
    setSyncVlrOpen(true)
  }, [])

  const ejecutarSincronizarVlrUnitario = useCallback(async () => {
    if (!contratoId || syncVlrBusy) return
    setSyncVlrBusy(true)
    setSyncVlrError(null)
    try {
      const qs = armarQueryPresupuestoServer().toString()
      const url = `${API}/presupuesto/${contratoId}/sincronizar-vlr-unitario${qs ? `?${qs}` : ''}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try {
          const j = await res.json()
          msg = j?.detail || msg
        } catch { /* ignore */ }
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
      const data = await res.json()
      setSyncVlrResult(data)
      setSyncVlrPhase('result')
      invalidarCachePresupuestoContrato()
      await recargarCapActualRef.current?.(drill.length === 0)
    } catch (e) {
      setSyncVlrError(e?.message || 'No se pudo sincronizar los valores unitarios.')
    } finally {
      setSyncVlrBusy(false)
    }
  }, [API, contratoId, token, syncVlrBusy, drill.length, invalidarCachePresupuestoContrato, armarQueryPresupuestoServer])

  useEffect(() => {
    if (!contratoId || oculto || !versionRestorePendingRef.current) return
    if (!versionActiva?.id || !recargarVistaVersionActivaRef.current) return
    versionRestorePendingRef.current = false
    void recargarVistaVersionActivaRef.current()
  }, [contratoId, oculto, versionActiva?.id])

  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  useEffect(() => {
    setModuloRefresh({
      label: 'Presupuesto',
      fn: () => recargarCapActualRef.current?.(drill.length === 0),
      disabled: loading || buscandoFiltroObra,
      busy: loading || buscandoFiltroObra,
    })
    return clearModuloRefresh
  }, [setModuloRefresh, clearModuloRefresh, drill.length, loading, buscandoFiltroObra])

  const ejecutarBulkPresupuestoSicoeCadDirecto = useCallback(async (items, { mode = 'append', sicoeEnviados } = {}) => {
    const tok = getToken()
    if (!tok || !contratoId) throw new Error('Sin sesión o contrato.')
    const modeQ = encodeURIComponent(mode || 'append')
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    }
    if (sicoeEnviados != null && Number.isFinite(Number(sicoeEnviados))) {
      headers['X-SicoeCAD-Enviados'] = String(Math.floor(Number(sicoeEnviados)))
    }
    const res = await fetch(`${pptoEp().bulk}?mode=${modeQ}&source=sicoe_cad`, {
      method: 'POST',
      headers,
      body: JSON.stringify(items),
    })
    if (!res.ok) {
      let msg = `Error ${res.status}`
      try {
        const err = await res.json()
        if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    return res.json()
  }, [API, contratoId])

  const solicitarImportPresupuestoSicoeCadConValidacion = useCallback(async ({ items, mode = 'append', sicoeEnviados, skipVersionConfirm = false } = {}) => {
    const tok = getToken()
    if (!tok || !contratoId) {
      alert('Sin sesión o contrato.')
      return
    }
    if (!Array.isArray(items) || items.length === 0) return
    if (pptoEp().mode === 'version' && !skipVersionConfirm) {
      setVersionCadConfirm({ items, mode, sicoeEnviados })
      return
    }
    setSicoeCadImportBusy(true)
    try {
      const valRes = await fetch(`${pptoEp().bulkValidar}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(items),
      })
      if (!valRes.ok) {
        let msg = `La validación falló (${valRes.status}).`
        try {
          const err = await valRes.json()
          if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail)
        } catch { /* ignore */ }
        alert(msg)
        return
      }
      const valJson = await valRes.json()
      if (!valJson.tiene_discrepancias) {
        await ejecutarBulkPresupuestoSicoeCadDirecto(items, { mode, sicoeEnviados })
        await recargarCapActualRef.current?.(true)
      } else {
        setSicoeCadListadoModal({
          discrepancias: Array.isArray(valJson.discrepancias) ? valJson.discrepancias : [],
          itemsSnapshot: JSON.parse(JSON.stringify(items)),
          mode,
          sicoeEnviados,
        })
      }
    } catch (e) {
      alert(e?.message || 'No se pudo completar la importación.')
    } finally {
      setSicoeCadImportBusy(false)
    }
  }, [API, contratoId, ejecutarBulkPresupuestoSicoeCadDirecto, pptoEp])

  useEffect(() => {
    if (!contratoId) return undefined
    const bridge = (detail) => {
      window.dispatchEvent(new CustomEvent(CLARACORE_PRESUPUESTO_SICOECAD_IMPORT_EVENT, { detail: detail || {} }))
    }
    const onCustom = (ev) => {
      const d = ev.detail || {}
      if (d.contratoId != null && Number(d.contratoId) !== Number(contratoId)) return
      if (!Array.isArray(d.items) || d.items.length === 0) return
      void solicitarImportPresupuestoSicoeCadConValidacion({
        items: d.items,
        mode: d.mode || 'append',
        sicoeEnviados: d.sicoeEnviados,
      })
    }
    const onMsg = (event) => {
      const d = event.data
      if (!d || d.type !== 'claracore-presupuesto-sicoe-cad-import') return
      if (event.origin && event.origin !== 'null' && event.origin !== window.location.origin) return
      if (d.contratoId != null && Number(d.contratoId) !== Number(contratoId)) return
      if (!Array.isArray(d.items) || d.items.length === 0) return
      void solicitarImportPresupuestoSicoeCadConValidacion({
        items: d.items,
        mode: d.mode || 'append',
        sicoeEnviados: d.sicoeEnviados,
      })
    }
    window.addEventListener(CLARACORE_PRESUPUESTO_SICOECAD_IMPORT_EVENT, onCustom)
    window.addEventListener('message', onMsg)
    window.__CLARACORE_PRESUPUESTO_SICOECAD_IMPORT__ = bridge
    return () => {
      window.removeEventListener(CLARACORE_PRESUPUESTO_SICOECAD_IMPORT_EVENT, onCustom)
      window.removeEventListener('message', onMsg)
      if (window.__CLARACORE_PRESUPUESTO_SICOECAD_IMPORT__ === bridge) {
        try {
          delete window.__CLARACORE_PRESUPUESTO_SICOECAD_IMPORT__
        } catch { /* ignore */ }
      }
    }
  }, [contratoId, solicitarImportPresupuestoSicoeCadConValidacion])

  useEffect(() => {
    if (sincroSicoeModal) recargarCapActual(true)
  }, [sincroSicoeModal?.ts])

  /** Canal 3 — presupuesto: resumen por capítulo (filtro contrato_id). */
  useEffect(() => {
    if (oculto || isEfectivoOffline() || !SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase || !contratoId) return
    const cid = String(contratoId)
    const filt = `contrato_id=eq.${cid}`
    const debouncer = createRealtimeDebouncer(() => {
      void cargarCapitulos({ silent: true })
    })
    const channel = supabase
      .channel(`presupuesto-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presupuesto', filter: filt },
        () => debouncer.schedule(),
      )
      .subscribe()
    return () => {
      debouncer.dispose()
      void supabase.removeChannel(channel)
    }
  }, [contratoId, oculto])

  /** Canal 5 — cad_queue: cola SicoeCAD ↔ ClaraCore (solo con DWG enlazado). */
  useEffect(() => {
    if (oculto || !dwgEnlazado || isEfectivoOffline() || !SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase || !contratoId) return
    const cid = String(contratoId)
    const filt = `contrato_id=eq.${cid}`
    const debouncer = createRealtimeDebouncer(() => {
      void recargarCapActualRef.current?.(false)
    })
    const channel = supabase
      .channel(`cad-queue-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cad_queue', filter: filt },
        () => debouncer.schedule(),
      )
      .subscribe()
    return () => {
      debouncer.dispose()
      void supabase.removeChannel(channel)
    }
  }, [contratoId, oculto, dwgEnlazado])

  // Multisesión: refresco solo en vista por capítulo/ítem (panel). No interrumpe búsqueda con chips.
  useEffect(() => {
    const PPTO_MULTI_POLL_MS = 22000
    if (!contratoId || oculto) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (busquedaServidorActivaRef.current) return
      if (cargaPptoInFlightRef.current || loading) return
      if (buscandoFiltroObra) return
      if (pptoValidacionPendienteRef.current > 0) return
      // No sobreescribir estado local durante 8 s después de escritura o recarga manual del usuario
      if (Date.now() - _lastWriteAtRef.current < 8000) return
      if (detalleConItem) {
        skipDebounceFiltrosRef.current = true
        refreshRegistrosDetalle({ forzar: true, syncPreserveSize: true })
        return
      }
      const capD = drill.find((d) => d.campo === 'capitulo')?.valor
      const itemD = drill.find((d) => d.campo === 'item')?.valor
      const itemsDr = drill.find((d) => d.campo === 'items')?.valor
      if (capD && !itemD && !(Array.isArray(itemsDr) && itemsDr.length)) {
        void cargarCapituloData(capD, null, { forzar: true, syncPreserveSize: true })
        return
      }
      if (verPapelera) void cargarRegistros(undefined, true)
    }
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (busquedaServidorActivaRef.current) return
      tick()
      if (!detalleConItem && drill.length === 0 && !verPapelera) void cargarCapitulos({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = setInterval(tick, PPTO_MULTI_POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      clearInterval(iv)
    }
  }, [contratoId, oculto, detalleConItem, drill, verPapelera, loading, buscandoFiltroObra, fObra])

  function syncFObraALegacy(f) {
    const tramos = pptoFiltroValoresLista(pptoFiltroDef('tramo'), f)
    const calzadas = pptoFiltroValoresLista(pptoFiltroDef('calzada'), f)
    setUbicacionTramo(tramos.length === 1 ? tramos[0] : '')
    setUbicacionCalzada(calzadas.length === 1 ? calzadas[0] : '')
    setFiltroEstado(f.revisado || '')
    if (f.nodoI || f.nodoF) {
      setBusquedaTipo('nodo')
      setBusquedaV1(f.nodoI || '')
      setBusquedaV2(f.nodoF || '')
    } else if (f.absA || f.absB) {
      setBusquedaTipo('abscisa')
      setBusquedaV1(f.absA || '')
      setBusquedaV2(f.absB || '')
    } else {
      setBusquedaTipo('')
      setBusquedaV1('')
      setBusquedaV2('')
    }
  }

  async function cargarPanelValidacionServidor(f, ctx, { nivel = 'capitulo', capituloDrill = '', cargaId } = {}) {
    const panelKey = pptoPanelCacheKey(f, ctx, nivel, capituloDrill)
    const cachedPanel = _pptoPanelCacheRef.current[panelKey]
    if (cachedPanel && (Date.now() - cachedPanel.ts) < pptoCacheTtlEfectivo()) {
      if (cargaId != null && cargaId !== cargaPptoIdRef.current) {
        return { filas: cachedPanel.filas, total_registros: cachedPanel.total, nivel, fuente: 'cache', cancelado: true }
      }
      setPanelFilasServidor(cachedPanel.filas)
      panelFilasServidorRef.current = cachedPanel.filas
      if (typeof cachedPanel.total === 'number') setConteoFiltro(cachedPanel.total)
      if (Array.isArray(cachedPanel.capitulosResumen) && cachedPanel.capitulosResumen.length) {
        setCapitulosResumen(cachedPanel.capitulosResumen)
      }
      return {
        filas: cachedPanel.filas,
        total_registros: cachedPanel.total,
        nivel,
        fuente: 'cache',
      }
    }
    const pPanel = pptoBuildPanelValidacionParams(f, ctx, {
      verPapelera,
      nivel,
      capituloDrill,
    })
    const data = await fetchPptoPanelValidacion(API, token, contratoId, pptoQueryBib(pPanel), pptoEp())
    if (cargaId != null && cargaId !== cargaPptoIdRef.current) {
      return { ...(data || {}), cancelado: true }
    }
    const filas = Array.isArray(data?.filas) ? data.filas : []
    setPanelFilasServidor(filas)
    panelFilasServidorRef.current = filas
    const total = typeof data?.total_registros === 'number' ? data.total_registros : null
    if (total != null) setConteoFiltro(total)
    let capResumen = null
    if ((nivel || data?.nivel || 'capitulo') === 'capitulo' && filas.length) {
      capResumen = capitulosResumenDesdePanelFilas(filas)
      setCapitulosResumen(capResumen)
    }
    _pptoPanelCacheRef.current[panelKey] = {
      filas,
      capitulosResumen: capResumen,
      total,
      ts: Date.now(),
    }
    if (data?.fuente === 'legacy') {
      setAvisoSistema({
        titulo: 'Panel en modo lento',
        mensaje:
          'La función SQL del panel no respondió; se usó barrido fila a fila. Ejecute backend/sql/presupuesto_panel_validacion_rpc.sql en Supabase y reinicie el backend.',
        tipo: 'warn',
      })
    }
    return data
  }

  async function aplicarFiltroObraConF(fIn, opts = {}) {
    const cargarGrilla = opts.cargarGrilla !== false
    const limpiarNavegacion = opts.limpiarNavegacion === true
    const pushNavegacionAntes = opts.pushNavegacionAntes === true
    if (!contratoId) return
    if (pushNavegacionAntes) pptoPushVistaNavegacion()
    if (limpiarNavegacion) pptoDrillStackRef.current = []
    // Presupuesto vivo o biblioteca de versión (pptoEp / ?biblioteca=1).
    const ctx = pptoCtxFiltro(drill, capExpandido)
    const f = pptoFiltroNormalizar({ ...(fIn || {}), eje: fIn?.eje || 'interv' }, ctx)
    const has = criterioVistaActivo(f, ctx)
    if (!has) {
      setAvisoSistema({ titulo: 'Filtros', mensaje: 'Seleccione Presupuesto de Obra u Obra Ejecutada, o añada un filtro con + Filtro.', tipo: 'warn' })
      return
    }
    invalidarCachePanelPresupuesto()
    setFObra(f)
    fObraRef.current = f
    setBuscandoFiltroObra(true)
    if (cargarGrilla) setCargandoGrillaPresupuesto(true)
    cargaPptoIdRef.current += 1
    const cargaId = cargaPptoIdRef.current
    cargaPptoInFlightRef.current = true
    try {
      syncFObraALegacy(f)
      const itemsLista = fObraItemsLista(f)
      const capVals = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), f)
      const d = []
      if (capVals.length === 1) d.push({ campo: 'capitulo', valor: capVals[0] })
      if (itemsLista.length > 1) d.push({ campo: 'items', valor: itemsLista })
      else if (itemsLista.length === 1) d.push({ campo: 'item', valor: itemsLista[0] })
      setDrill(d)
      const capPrim = capVals[0] || f.cap || ''
      if (capPrim) setCapActivo(capPrim)

      const ctxBusqueda = { ...ctx, drill: d }
      const nivelPanel = capVals.length === 1 ? 'item' : 'capitulo'
      const capDrillPanel = capVals.length === 1 ? capVals[0] : ''

      const panelPromise = cargarPanelValidacionServidor(f, ctxBusqueda, {
        nivel: nivelPanel,
        capituloDrill: capDrillPanel,
        cargaId,
      })

      if (!cargarGrilla) {
        await panelPromise
        if (cargaId !== cargaPptoIdRef.current) return
        invalidarCachePanelPresupuesto()
        pptoDrillStackRef.current = []
        busquedaServidorActivaRef.current = true
        setBusquedaServidorActiva(true)
        setPanelBusquedaSeq((n) => n + 1)
        panelDrillRestoreRef.current = null
        skipDebounceFiltrosRef.current = true
        guardarFiltroSesion(contratoId, {
          f,
          activeKeys: pptoFiltrosActivosKeys(f, []),
          searched: true,
        })
        return
      }

      const hitGrid = opts.skipCacheGrilla ? null : pptoBuscarCacheGrilla(f, d)
      const [_, gridResult] = await Promise.all([
        panelPromise,
        hitGrid
          ? Promise.resolve({ rows: hitGrid.data, total: hitGrid.total, cancelado: false, desdeCache: true, hitGrid })
          : (async () => {
            const p = pptoBuildPresupuestoSearchParams(f, ctxBusqueda, { verPapelera })
            return fetchPresupuestoPaginasCompletas(p, (partial) => {
              if (cargaId !== cargaPptoIdRef.current) return
              setRegistros(partial)
            }, {
              avisarCargaGrande: true,
              onTotalConocido: (n) => {
                if (cargaId === cargaPptoIdRef.current) setConteoFiltro(n)
              },
            }).then((r) => ({ ...r, desdeCache: false }))
          })(),
      ])
      const { rows, total, cancelado, desdeCache, hitGrid: hitAplicar } = gridResult
      if (cargaId !== cargaPptoIdRef.current) return
      if (cancelado) {
        setRegistros([])
        busquedaServidorActivaRef.current = true
        setBusquedaServidorActiva(true)
        return
      }
      if (desdeCache && hitAplicar) {
        pptoAplicarHitCacheGrilla(hitAplicar, f, d)
        pptoPushVistaNavegacion()
        setPanelBusquedaSeq((n) => n + 1)
        panelDrillRestoreRef.current = null
        skipDebounceFiltrosRef.current = true
        guardarFiltroSesion(contratoId, {
          f,
          activeKeys: pptoFiltrosActivosKeys(f, []),
          searched: true,
        })
        return
      }
      setConteoFiltro(total)
      setRegistros(rows)
      setVisibleRegistrosCount(50)
      if (rows.length < total) {
        setAvisoSistema({
          titulo: 'Carga incompleta',
          mensaje: `Se recibieron ${rows.length.toLocaleString('es-CO')} de ${total.toLocaleString('es-CO')} registros. Pulse Buscar de nuevo o Actualizar.`,
          tipo: 'warn',
        })
      }
      const cacheKey = pptoGridCacheKey(f, d)
      pptoCargaRef.current = { key: cacheKey, nextOffset: rows.length, hasMore: false, total }
      pptoGuardarEnCacheGrid(cacheKey, rows, total)
      pptoPushVistaNavegacion()
      busquedaServidorActivaRef.current = true
      setBusquedaServidorActiva(true)
      setPanelBusquedaSeq((n) => n + 1)
      panelDrillRestoreRef.current = null
      skipDebounceFiltrosRef.current = true
      guardarFiltroSesion(contratoId, {
        f,
        activeKeys: pptoFiltrosActivosKeys(f, []),
        searched: true,
      })
    } catch (err) {
      setAvisoSistema({
        titulo: 'Error al buscar',
        mensaje: err?.message || 'No se pudo cargar el presupuesto con los filtros indicados.',
        tipo: 'warn',
      })
    } finally {
      cargaPptoInFlightRef.current = false
      setBuscandoFiltroObra(false)
      setCargandoGrillaPresupuesto(false)
    }
  }

  async function recargarVistaVersionActiva() {
    invalidarCachePresupuestoContrato()
    setRegistros([])
    setDrill([])
    setPanelFilasServidor([])
    panelFilasServidorRef.current = []
    setCapitulosResumen([])
    setConteoFiltro(null)
    busquedaServidorActivaRef.current = false
    setBusquedaServidorActiva(false)
    setCapActivo(null)
    pptoDrillStackRef.current = []
    cargaPptoIdRef.current += 1
    skipDebounceFiltrosRef.current = true
    const f = pptoFiltroNormalizar(
      { ...(fObraRef.current || fObra), eje: fObraRef.current?.eje || 'interv' },
      pptoCtxFiltro([], capExpandido),
    )
    if (aplicarFiltroObraConFRef.current) {
      await aplicarFiltroObraConFRef.current(f, {
        cargarGrilla: true,
        limpiarNavegacion: true,
        pushNavegacionAntes: false,
      })
      return
    }
    await cargarCapitulos({ silent: false })
  }
  aplicarFiltroObraConFRef.current = aplicarFiltroObraConF
  recargarVistaVersionActivaRef.current = recargarVistaVersionActiva

  async function aplicarFiltroObra() {
    await aplicarFiltroObraConF(fObraRef.current || fObra)
  }

  const aplicarPanelCapitulos = useCallback(
    async (caps) => {
      const list = Array.isArray(caps) ? caps.filter(Boolean) : []
      const base = { ...(fObraRef.current || fObra) }
      const next = {
        ...base,
        cap: list.length === 1 ? list[0] : '',
        caps: list.length > 1 ? list : [],
        item: '',
        items: [],
      }
      setDrill(list.length === 1 ? [{ campo: 'capitulo', valor: list[0] }] : [])
      if (!list.length) setCapActivo(null)
      await aplicarFiltroObraConF(next, { cargarGrilla: true, pushNavegacionAntes: true })
    },
    [contratoId],
  )

  const aplicarPanelItems = useCallback(
    async (capitulo, items) => {
      const list = Array.isArray(items) ? items.filter(Boolean) : []
      const base = { ...(fObraRef.current || fObra) }
      const next = {
        ...base,
        cap: capitulo || '',
        caps: [],
        item: list.length === 1 ? list[0] : '',
        items: list.length > 1 ? list : [],
      }
      await aplicarFiltroObraConF(next, { cargarGrilla: true, pushNavegacionAntes: true })
    },
    [contratoId],
  )

  /** Carga grilla por capítulo/ítem; `estado` vacío = todos los estados (resumen consolidado). */
  const filtrarEstadoDesdePanel = useCallback(
    async ({ capitulo, item, estado }) => {
      const base = { ...(fObraRef.current || fObra) }
      const cap = String(capitulo || '').trim()
      const it = item ? String(item).trim() : ''
      const next = {
        ...base,
        eje: 'interv',
        revisado: estado || '',
        preInterv: '',
        cap,
        caps: [],
        item: it,
        items: [],
      }
      const d = []
      if (cap) d.push({ campo: 'capitulo', valor: cap })
      if (it) d.push({ campo: 'item', valor: it })
      setDrill(d)
      if (cap) setCapActivo(cap)
      setVisibleRegistrosCount(80)
      await aplicarFiltroObraConF(next, { cargarGrilla: true, pushNavegacionAntes: true, skipCacheGrilla: true })
      window.setTimeout(() => {
        pptoTablaScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    },
    [contratoId],
  )

  /** Clic en nombre de capítulo del panel: resumen consolidado (todos los estados). */
  const drillCapituloDesdePanel = useCallback(async (capitulo) => {
    const cap = String(capitulo || '').trim()
    if (!cap) return
    await filtrarEstadoDesdePanel({ capitulo: cap, item: '', estado: '' })
  }, [filtrarEstadoDesdePanel])

  const volverPanelCapitulos = useCallback(async () => {
    let prev = pptoPopVistaAnterior(pptoDrillStackRef.current)
    if (!prev && panelDrillRestoreRef.current) {
      prev = panelDrillRestoreRef.current
      panelDrillRestoreRef.current = null
    }
    // Snapshots incompletos (sin fObra) no deben «restaurarse»: vaciarían los filtros.
    if (prev && prev.fObra && pptoRestaurarVistaSnap(prev)) {
      try {
        const fRest = { ...(fObraRef.current || fObra), item: '', items: [] }
        const ctx = pptoCtxFiltro(
          (prev.drill || []).filter((x) => x.campo !== 'item' && x.campo !== 'items'),
          capExpandido,
        )
        // Siempre pedir agregación de capítulos: el snap pudo quedar en nivel ítem.
        await cargarPanelValidacionServidor(fRest, ctx, { nivel: 'capitulo' })
      } catch { /* panel opcional al volver */ }
      setPanelBusquedaSeq((n) => n + 1)
      return
    }

    setDrill((d) => (d || []).filter((x) => x.campo !== 'item' && x.campo !== 'items'))
    const nfBack = { ...(fObraRef.current || fObra), item: '', items: [] }
    setFObra(nfBack)
    fObraRef.current = nfBack
    syncFObraALegacy(nfBack)
    const dBack = (drill || []).filter((x) => x.campo !== 'item' && x.campo !== 'items')
    const cacheKey = pptoGridCacheKey(nfBack, dBack)
    const cached = pptoLeerCacheGrid(cacheKey)
    if (cached) {
      setRegistros(cached.data)
      if (typeof cached.total === 'number') setConteoFiltro(cached.total)
      pptoCargaRef.current = {
        key: cacheKey,
        nextOffset: Array.isArray(cached.data) ? cached.data.length : 0,
        hasMore: false,
        total: typeof cached.total === 'number' ? cached.total : 0,
      }
    }
    try {
      const ctx = pptoCtxFiltro(dBack, capExpandido)
      await cargarPanelValidacionServidor(fObraRef.current || fObra, ctx, { nivel: 'capitulo' })
      setPanelBusquedaSeq((n) => n + 1)
    } catch { /* panel opcional al volver */ }
  }, [fObra, drill, capExpandido])

  const fObraInicialVacio = () => ({
    cap: '', caps: [], item: '', items: [], idPol: '', pkCriterio: '', texto: '', tramo: '', tramos: [], calzada: '', calzadas: [], infraestructura: '', infraestructuras: [], nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '', competencia: '', competencias: [], und: '', unds: [], sellado: '', dadoDeBaja: '', vlrUnitarioMin: '', vlrUnitarioMax: '', cantTotalMin: '', cantTotalMax: '', costoDirectoMin: '', costoDirectoMax: '', tipoEjecucion: fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT,
  })

  async function onCambioTipoEjecucion(nuevoTipo) {
    const te = String(nuevoTipo || PPTO_TIPO_EJECUCION_DEFAULT).trim() || PPTO_TIPO_EJECUCION_DEFAULT
    if (te === (fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT)) return
    try {
      if (contratoId) localStorage.setItem(pptoVistaLsKey(contratoId), te)
    } catch { /* ignore */ }
    const next = { ...fObraRef.current, tipoEjecucion: te }
    setFObra(next)
    fObraRef.current = next
    busquedaServidorActivaRef.current = false
    setBusquedaServidorActiva(false)
    cargaPptoIdRef.current += 1
    invalidarCachePresupuestoContrato()
    pptoCargaRef.current = { key: '', nextOffset: 0, hasMore: false, total: 0 }
    setConteoFiltro(null)
    setRegistros([])
    setSeleccionados(new Set())
    setVisibleRegistrosCount(50)
    setPanelFilasServidor(null)
    const ctx = pptoCtxFiltro(drill, capExpandido)
    const fNorm = pptoFiltroNormalizar(next, ctx)
    if (!pptoTieneFiltrosChip(fNorm, ctx)) {
      setDrill([])
      setCapExpandido(null)
      setCapActivo(null)
      setItemsResumen([])
      const fSoloTipo = { ...fNorm, cap: '', caps: [], item: '', items: [] }
      setFObra(fSoloTipo)
      fObraRef.current = fSoloTipo
      await aplicarFiltroObraConF(fSoloTipo, { cargarGrilla: false })
      return
    }
    await aplicarFiltroObraConF(fNorm)
  }

  useEffect(() => {
    if (!contratoId || oculto) return
    try {
      const saved = localStorage.getItem(pptoVistaLsKey(contratoId))
      if (saved !== PPTO_TIPO_EJECUCION_OBRA && saved !== PPTO_TIPO_EJECUCION_DEFAULT) return
      const actual = fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT
      if (actual === saved) return
      void onCambioTipoEjecucion(saved)
    } catch { /* ignore */ }
  }, [contratoId, oculto])

  const sesionFiltroRestauradaRef = useRef(false)
  useEffect(() => {
    sesionFiltroRestauradaRef.current = false
  }, [contratoId])

  useEffect(() => {
    if (!contratoId || oculto || sesionFiltroRestauradaRef.current) return
    const ses = cargarFiltroSesion(contratoId)
    if (!ses?.searched || !ses?.f) return
    sesionFiltroRestauradaRef.current = true
    const te = fObraRef.current?.tipoEjecucion || ses.f.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT
    const fRest = { ...ses.f, tipoEjecucion: te }
    skipDebounceFiltrosRef.current = true
    void aplicarFiltroObraConF(fRest)
  }, [contratoId, oculto])

  /** Quita búsqueda fina (PK, ID-POL, texto) y vuelve a cargar; mantiene cap/ítem y tramo/validación. */
  async function restablecerPksVistaItem() {
    const base = fObraRef.current
    const f2 = { ...base, pkCriterio: '', idPol: '', texto: '' }
    if (!criterioVistaActivo(f2)) return
    setFObra(f2)
    fObraRef.current = f2
    syncFObraALegacy(f2)
    const d = []
    if (f2.cap) d.push({ campo: 'capitulo', valor: f2.cap })
    const itemsLista = fObraItemsLista(f2)
    if (itemsLista.length > 1) d.push({ campo: 'items', valor: itemsLista })
    else if (itemsLista.length === 1) d.push({ campo: 'item', valor: itemsLista[0] })
    setDrill(d)
    if (f2.cap) setCapActivo(f2.cap)
    skipDebounceFiltrosRef.current = true
    await aplicarFiltroObraConF(f2)
  }

  function limpiarFiltroObra() {
    panelDrillRestoreRef.current = null
    setPanelFilasServidor(null)
    cargaPptoIdRef.current += 1
    busquedaServidorActivaRef.current = false
    setBusquedaServidorActiva(false)
    limpiarFiltroSesion(contratoId)
    const vacio = fObraInicialVacio()
    setFObra(vacio)
    fObraRef.current = vacio
    setFiltroResetKey((k) => k + 1)
    setDrill([])
    setUbicacionTramo(''); setUbicacionCalzada(''); setFiltroEstado(''); setBusquedaTipo(''); setBusquedaV1(''); setBusquedaV2(''); setConteoFiltro(null)
    setRegistros([]); setCapExpandido(null); setItemsResumen([]); setCapActivo(null); setPkidsSeleccionados([])
    setVisibleRegistrosCount(50)
    setSeleccionados(new Set())
    setItemBusqueda(''); setItemNavIdx(-1)
    setOpcionesUbicacion({ tramos: [], calzadas: [] })
    invalidarCachePresupuestoContrato()
    pptoCargaRef.current = { key: '', nextOffset: 0, hasMore: false, total: 0 }
    skipDebounceFiltrosRef.current = true
    void cargarCapitulos()
  }

  function onMapPkPresu(pk) {
    const v = String(pk || '').trim()
    if (!v) return
    aplicarFiltroObraConF({ ...fObraRef.current, pkCriterio: v })
  }

  async function onToggleCapPanelObra(capitulo) {
    if (capExpandido === capitulo) {
      setCapExpandido(null)
      return
    }
    setCapExpandido(capitulo)
    const next = { ...fObraRef.current, cap: capitulo, item: '', items: [] }
    setFObra(next)
    fObraRef.current = next
    setCapActivo(capitulo)
    setDrill([{ campo: 'capitulo', valor: capitulo }])
    await cargarItemsCapitulo(capitulo)
    await cargarCapituloData(capitulo, null)
  }

  function onPickItemFromPanel(itemNum, ev) {
    const cap = (fObraRef.current.cap && fObraRef.current.cap.trim()) || capExpandido
    if (!cap) return
    const list = itemsResumen
    const idx = list.findIndex((x) => String(x.item) === String(itemNum))
    if (idx < 0) return
    const orderMap = new Map(list.map((x, i) => [String(x.item), i]))
    const sortItems = (arr) =>
      [...new Set(arr.map((x) => String(x)))].sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))

    const base = { ...fObraRef.current, cap }

    if (ev?.shiftKey && anchorIdxPanelRef.current >= 0) {
      const a = Math.min(anchorIdxPanelRef.current, idx)
      const b = Math.max(anchorIdxPanelRef.current, idx)
      const picked = list.slice(a, b + 1).map((x) => String(x.item))
      anchorIdxPanelRef.current = idx
      void aplicarFiltroObraConF({ ...base, item: '', items: picked }, { pushNavegacionAntes: true })
      return
    }
    if (ev?.ctrlKey || ev?.metaKey) {
      const cur = fObraItemsLista(base)
      const set = new Set(cur.map(String))
      const k = String(itemNum)
      if (set.has(k)) set.delete(k)
      else set.add(k)
      const arrRaw = [...set]
      if (arrRaw.length === 0) {
        anchorIdxPanelRef.current = idx
        void aplicarFiltroObraConF({ ...base, item: '', items: [] }, { pushNavegacionAntes: true })
        return
      }
      const arr = sortItems(arrRaw)
      if (arr.length === 1) {
        anchorIdxPanelRef.current = idx
        void aplicarFiltroObraConF({ ...base, item: arr[0], items: [] }, { pushNavegacionAntes: true })
        return
      }
      anchorIdxPanelRef.current = idx
      void aplicarFiltroObraConF({ ...base, item: '', items: arr }, { pushNavegacionAntes: true })
      return
    }
    anchorIdxPanelRef.current = idx
    void aplicarFiltroObraConF({ ...base, item: String(itemNum), items: [] }, { pushNavegacionAntes: true })
  }

  async function abrirRevisorTramosObra() {
    const cap = (fObra.cap && fObra.cap.trim()) || capExpandido
    if (!cap) {
      window.alert('Seleccione un capítulo (panel izquierdo o campo Capítulo).')
      return
    }
    const f = { ...fObraRef.current, cap }
    setFObra(f)
    syncFObraALegacy(f)
    setDrill([{ campo: 'capitulo', valor: cap }])
    setCapActivo(cap)
    setModalModoCapitulo(cap)
    setModoCapSeleccion('tramos')
    setTramoSelec(null)
    setTabTramo(0)
    await cargarCapituloData(cap, null)
  }

  // ── Inserción de bloque de validación vía ClaraLink ───────────────────────
  async function lanzarClaraLinkEstado(ids, nuevoEstado) {
    const ESTADOS_BLOQUE = ['Aprobado', 'Pendiente', 'Rechazado']
    if (!ESTADOS_BLOQUE.includes(nuevoEstado)) return
    const targets = ids
      .map(id => registros.find(r => r.id === id))
      .filter(r => r?.x_label != null && r?.y_label != null && r?.layer_txt)
    for (const r of targets) {
      const params = new URLSearchParams({
        bloque:      nuevoEstado,
        x:           String(r.x_label),
        y:           String(r.y_label),
        layer:       r.layer_txt,
        registro_id: String(r.id),
        api_token:   token,
      })
      if (r.rev_block_handle) params.set('handle_borrar', r.rev_block_handle)
      const a = document.createElement('a')
      a.href = `claralink://insertar?${params}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Pausa entre registros para que ClaraLink procese uno a uno
      if (targets.length > 1) await new Promise(res => setTimeout(res, 900))
    }
  }

  // ── Drill-down computado ───────────────────────────────────────────────────
  const [pptoPkidColores,    setPptoPkidColores]    = useState({})
  const [pptoPkidFoco,    setPptoPkidFoco]    = useState(null)
  const [pkidsSeleccionados, setPkidsSeleccionados] = useState([])
  const mapPptoRef      = useRef(null)
  const mapPptoInstance = useRef(null)
  const [mapPptoListo,   setMapPptoListo]   = useState(false)
  const [primerNivel, setPrimerNivel] = useState('capitulo')
  const nivelesOrden = [primerNivel, ...NIVELES.filter(n => n !== primerNivel)]
  const nivelActual  = nivelesOrden[drill.length] || null

  // ── Comentarios: pedir, crear, cargar resumen ────────────────────────────
  function pedirComentario(tipo, obligatorio, ids = []) {
    return new Promise(resolve => {
      setTextoComentario('')
      setDestinatarioComentario('')
      setModalComentario({ tipo, obligatorio, resolve, ids: Array.isArray(ids) ? ids : [] })
    })
  }

  function pedirModoHistorial({ nConHistorial, nTotal, etiqueta, titulo }) {
    return new Promise((resolve) => {
      setModalModoHistorial({
        nConHistorial,
        nTotal,
        etiqueta,
        titulo,
        resolve,
      })
    })
  }

  async function contarHistorialComentarios(ids, tipo) {
    const idList = (ids || []).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    const tipoN = String(tipo || '').trim()
    if (!idList.length || !tipoN || !contratoId) return 0
    const tok = getToken()
    let con = 0
    const CHUNK = 80
    for (let i = 0; i < idList.length; i += CHUNK) {
      const chunk = idList.slice(i, i + CHUNK)
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/comentarios-historial-count?ids=${chunk.join(',')}&tipo=${encodeURIComponent(tipoN)}`,
        { headers: { Authorization: `Bearer ${tok}` } },
      )
      if (!res.ok) continue
      const data = await res.json().catch(() => ({}))
      con += Number(data?.con_historial || 0)
    }
    return con
  }

  /** @returns {'append'|'replace'|null} null = canceló */
  async function resolverModoSiHayHistorial(ids, tipo, { etiqueta } = {}) {
    const idList = (ids || []).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    if (!idList.length) return PPTO_COMENTARIO_MODO_APPEND
    const n = await contarHistorialComentarios(idList, tipo)
    if (n <= 0) return PPTO_COMENTARIO_MODO_APPEND
    return pedirModoHistorial({
      nConHistorial: n,
      nTotal: idList.length,
      etiqueta: etiqueta || `comentarios de ${pptoComentarioTipoLabel(tipo)}`,
      titulo: 'Ya hay comentarios previos',
    })
  }

  async function crearComentarios(ids, tipo, mensaje, destinatarioId = null, modo = null) {
    if (!mensaje.trim()) return false
    let modoFinal = modo
    if (!modoFinal) {
      modoFinal = await resolverModoSiHayHistorial(ids, tipo)
      if (modoFinal == null) return false
    }
    await fetch(`${API}/presupuesto/${contratoId}/comentarios/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        presupuesto_ids: ids,
        tipo,
        mensaje: mensaje.trim(),
        usuario_nombre: usuario?.nombre || 'Usuario',
        modo: modoFinal,
      }),
    })
    // Enviar notificación si hay destinatario
    if (destinatarioId) {
        const TITULOS = { dims:'📐 Cambio de Dimensiones', item_capitulo:'🔄 Cambio de Ítem/Capítulo', validacion:'🔍 Cambio de Estado', reapertura:'🔓 Reapertura de registro sellado', contratista_edita_interv:'✏️ Motivo — Edición con validación Interventoría' }
      await fetch(`${API}/notificaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          destinatario_id: parseInt(destinatarioId),
          asunto: TITULOS[tipo] || 'Comentario en presupuesto',
          mensaje: mensaje.trim(),
          tipo: 'MENSAJE_DIRECTO',
          modulo: 'PRESUPUESTO',
          contrato_id: contratoId,
          entidad_tipo: 'presupuesto',
          entidad_id: ids[0]?.toString(),
        })
      }).catch(() => {})
    }
    return true
  }

  async function cargarComentariosResumen(ids) {
    if (!ids || ids.length === 0) return
    const res = await fetch(`${API}/presupuesto/${contratoId}/comentarios-resumen?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setComentariosPorId(prev => ({ ...prev, ...data }))
    }
  }

  /** Un GET por capítulo (join en servidor): evita URL/cuerpo con miles de IDs y N rondas POST. */
  async function fetchComentariosValidacionPorCapitulo(capitulo) {
    if (!String(capitulo || '').trim() || !contratoId) return {}
    const p = new URLSearchParams({ capitulo: String(capitulo) })
    const res = await fetch(`${API}/presupuesto/${contratoId}/comentarios-validacion-capitulo?${p}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return {}
    return res.json()
  }

  async function refrescarDatosRevisorTramosModal() {
    const cap = modalModoCapitulo
    if (!String(cap || '').trim() || !contratoId) return
    const itemsD = drill.find((d) => d.campo === 'items')
    const itemDrill =
      drill.find((d) => d.campo === 'item')?.valor ||
      (itemsD?.valor?.length === 1 ? String(itemsD.valor[0]) : null) ||
      null
    const itemCarga = itemsD?.valor?.length > 1 ? null : itemDrill
    // Suprimir polling para que no invalide el cargaId de esta recarga
    _lastWriteAtRef.current = Date.now()
    setRefrescandoRevisorTramos(true)
    try {
      await cargarCapituloData(cap, itemCarga, { forzar: true, syncPreserveSize: false })
      const data = await fetchComentariosValidacionPorCapitulo(cap)
      setComentariosTramo((prev) => ({ ...prev, ...data }))
    } finally {
      setRefrescandoRevisorTramos(false)
    }
  }

  async function abrirHilo(registroId, tipo, opts = {}) {
    const { preserveReplyDrafts = false } = opts
    setHiloLoading(true)
    if (!preserveReplyDrafts) setRespuestaHiloPorId({})
    setModalHilo({ registroId, tipo, data: [] })
    const res = await fetch(`${API}/presupuesto/${registroId}/comentarios?tipo=${tipo}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setModalHilo({ registroId, tipo, data })
    }
    setHiloLoading(false)
  }

  async function responderEnHilo(parentId) {
    const msg = String(respuestaHiloPorId[parentId] ?? '').trim()
    if (!msg) return
    await fetch(`${API}/comentarios/${parentId}/respuesta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensaje: msg, usuario_nombre: usuario?.nombre || 'Usuario' })
    })
    setRespuestaHiloPorId((prev) => {
      const next = { ...prev }
      delete next[parentId]
      return next
    })
    if (modalHilo) await abrirHilo(modalHilo.registroId, modalHilo.tipo, { preserveReplyDrafts: true })
  }

  /** Con capítulo en filtro: el plano solo muestra PK que aparecen en la grilla (cap o cap+ítem). Sin cap: maestro completo. */
  const pkIdsDeGrillaParaMapa = useMemo(() => {
    if (!(fObra.cap || '').trim()) return null
    const s = new Set()
    for (const r of registros) {
      const p =
        r.pk_id != null && String(r.pk_id).trim() !== ''
          ? String(r.pk_id).trim()
          : r.pk != null && String(r.pk).trim() !== ''
            ? String(r.pk).trim()
            : ''
      if (p) s.add(p)
    }
    return [...s]
  }, [fObra.cap, fObra.item, fObra.items, registros])

  const drillMatch = (r) => {
    if (!drill.length) return true
    return drill.every(({ campo, valor }) => {
      if (campo === 'items' && Array.isArray(valor)) {
        if (!valor.length) return true
        const s = new Set(valor.map((x) => String(x)))
        return s.has(String(r.item ?? ''))
      }
      return String(r[campo] ?? '') === String(valor ?? '')
    })
  }

  /** Auto-drill a ítems solo si hay filtro explícito de un capítulo; sin filtros → vista capítulos. */
  const capUnicoPanel = useMemo(() => {
    const caps = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), fObra)
    if (caps.length === 1) return caps[0]
    if (caps.length > 1) return ''
    return ''
  }, [fObra])

  const registrosFiltrados = useMemo(() => {
    // Papelera: el servidor ya pagina/filtra dado_de_baja; no reaplicar drill/filtros
    // de la vista activa (dejarían la primera página vacía en pantalla).
    if (verPapelera) return registros
    const parseAbs = s => {
      if (!s) return null
      return parseFloat(String(s).replace('+', ''))
    }
    const revFiltro = fObra.revisado || filtroEstado || ''
    const preFiltro = fObra.preInterv || ''
    const tramoFiltro = pptoFiltroValoresLista(pptoFiltroDef('tramo'), fObra)
    const calzadaFiltro = pptoFiltroValoresLista(pptoFiltroDef('calzada'), fObra)
    const infraFiltro = pptoFiltroValoresLista(pptoFiltroDef('infraestructura'), fObra)
    return registros.filter(r => {
      if (!drillMatch(r)) return false
      if (pkidsSeleccionados.length > 0) {
        if (!pkidsSeleccionados.includes(r.pk_id)) return false
      }
      if (!pptoFilaCoincideRevisado(r, revFiltro)) return false
      if (!pptoFilaCoincidePreInterv(r, preFiltro)) return false
      if (tramoFiltro.length && !tramoFiltro.includes(String(r.tramo ?? '').trim())) return false
      if (calzadaFiltro.length && !calzadaFiltro.includes(String(r.calzada ?? '').trim())) return false
      if (infraFiltro.length && !infraFiltro.includes(String(r.infraestructura ?? '').trim())) return false
      if (detalleConItem) return true
      if (busquedaTipo === 'tramo') {
        const v1 = busquedaV1.trim().toLowerCase()
        const v2 = busquedaV2.trim().toLowerCase()
        if (v1 && !(r.no_inicio || '').toLowerCase().includes(v1)) return false
        if (v2 && !(r.no_final  || '').toLowerCase().includes(v2)) return false
      } else
      if (busquedaTipo === 'nodo') {
        const v1 = busquedaV1.trim().toLowerCase()
        const v2 = busquedaV2.trim().toLowerCase()
        if (v1 && !(r.no_inicio || '').toLowerCase().includes(v1)) return false
        if (v2 && !(r.no_final  || '').toLowerCase().includes(v2)) return false
      } else if (busquedaTipo === 'abscisa') {
        const ini = parseAbs(r.abs_inicio)
        const v1 = busquedaV1.trim() !== '' ? parseFloat(busquedaV1) : null
        const v2 = busquedaV2.trim() !== '' ? parseFloat(busquedaV2) : null
        if (v1 !== null || v2 !== null) {
          if (ini === null) return false
          if (v1 !== null && ini < v1) return false
          if (v2 !== null && ini > v2) return false
        }
      } else if (busquedaTipo === 'registro') {
        const v1 = busquedaV1.trim().toLowerCase()
        if (v1 && !(r.registro || '').toLowerCase().includes(v1)) return false
      } else if (busquedaTipo === 'idpol') {
        const v1 = busquedaV1.trim().toLowerCase()
        if (v1 && !(r.id_pol || r.pk_id || '').toLowerCase().includes(v1)) return false
      }
      return true
    })
  }, [registros, verPapelera, drill, busquedaTipo, busquedaV1, busquedaV2, filtroEstado, fObra.revisado, fObra.preInterv, fObra.tramo, fObra.tramos, fObra.calzada, fObra.calzadas, fObra.infraestructura, fObra.infraestructuras, pkidsSeleccionados, detalleConItem, ubicacionTramo, ubicacionCalzada])

  /**
   * Misma fuente de datos que el botón «Tramos» / `cargarCapituloData`:
   * `pptoBuildPresupuestoSearchParams(fObra actual, …)` + listado paginado
   * (`pptoEp().conteo` / `pptoEp().list`). Luego filtra por capítulo.
   * No muta la grilla principal (carga aislada para edición masiva).
   */
  async function cargarFuenteTramosEdicionMasiva() {
    const fAct = fObraRef.current || fObra
    const cap = String(
      (fAct.cap && String(fAct.cap).trim())
      || (capExpandido && String(capExpandido).trim())
      || drill.find((d) => d.campo === 'capitulo')?.valor
      || '',
    ).trim()

    if (!contratoId) {
      return { cap: null, rows: [], error: 'Sin contrato activo.' }
    }

    if (!cap) {
      const rows = Array.isArray(registrosFiltrados) ? registrosFiltrados : []
      return {
        cap: null,
        rows,
        fuente: 'grilla',
        aviso: 'Sin capítulo activo: se usan los registros de la grilla filtrada.',
      }
    }

    const ctx = pptoCtxFiltro(drill, capExpandido)
    const p = pptoBuildPresupuestoSearchParams(fAct, ctx, {
      verPapelera,
      capituloOverride: cap,
      itemOverride: null,
    })
    try {
      const { rows } = await fetchPresupuestoPaginasCompletas(p, null, { avisarCargaGrande: false })
      const capRegs = (rows || []).filter((r) => r.capitulo === cap)
      return { cap, rows: capRegs, fuente: 'api' }
    } catch (e) {
      const rows = Array.isArray(registrosFiltrados)
        ? registrosFiltrados.filter((r) => r.capitulo === cap)
        : []
      return {
        cap,
        rows,
        fuente: 'grilla',
        error: e?.message || 'No se pudieron cargar los tramos desde el servidor.',
      }
    }
  }

  const chartData = useMemo(() => {
    if (drill.length === 1 && nivelActual === 'item' && itemsResumen.length > 0) {
      return itemsResumen.map(c => ({
        name: c.item,
        label: `${c.item} · ${(c.descripcion||'').slice(0,38)}`,
        costo: c.costo_total,
        count: c.total_registros,
        cantTotal: c.cant_total, und: c.und, vlrUnit: c.vlr_unitario,
      })).sort((a,b) => a.name.localeCompare(b.name,'es',{numeric:true}))
    }
    if (drill.length === 0 && primerNivel === 'capitulo') {
      return capitulosResumen.map(c => ({
        name: c.capitulo,
        label: c.capitulo.length > 48 ? c.capitulo.slice(0, 48) + '…' : c.capitulo,
        costo: c.costo_total,
        count: c.total_registros,
        cantTotal: null, und: null, vlrUnit: null,
      })).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    }
    if (!nivelActual || registros.length === 0) return []
    const agg = {}
    registrosFiltrados.forEach(r => {
      const key = r[nivelActual] ?? '(sin valor)'
      if (!agg[key]) {
        let label = key
        if (nivelActual === 'item') {
          const desc = (r.descripcion ?? '').slice(0, 38)
          label = `${r.item ?? ''} · ${desc}${(r.descripcion ?? '').length > 38 ? '…' : ''}`
        } else if (key.length > 48) {
          label = key.slice(0, 48) + '…'
        }
        agg[key] = { name: key, label, costo: 0, count: 0, cantTotal: 0, und: r.und ?? null, vlrUnit: r.vlr_unitario ?? null }
      }
      agg[key].costo     += r.costo_directo ?? 0
      agg[key].cantTotal += r.cant_total ?? 0
      agg[key].count++
    })
    return Object.values(agg).sort((a, b) => a.name.localeCompare(b.name, 'es', {numeric: true}))
  }, [registrosFiltrados, nivelActual, drill, primerNivel, capitulosResumen])

  const costoTotal = useMemo(() => {
    if (drill.length === 0 && primerNivel === 'capitulo')
      return capitulosResumen.reduce((s, c) => s + (c.costo_total ?? 0), 0)
    return registrosFiltrados.reduce((s, r) => s + (r.costo_directo ?? 0), 0)
  }, [registrosFiltrados, drill, primerNivel, capitulosResumen])

  /** Totales dinámicos de la selección actual en grilla (cant_total + costo_directo). */
  const totalesSeleccion = useMemo(
    () => pptoTotalesSeleccion(registros, seleccionados),
    [registros, seleccionados],
  )

  const registrosOrdenados = useMemo(() => {
    if (verPapelera) {
      // Backend ya ordena por updated_at desc (recientes primero)
      return registrosFiltrados
    }
    return [...registrosFiltrados].sort((a, b) => {
      const va = String(a.id_pol || a.pk_id || '')
      const vb = String(b.id_pol || b.pk_id || '')
      return vb.localeCompare(va, 'es', { numeric: true })
    })
  }, [registrosFiltrados, verPapelera])
  const registrosPagina = useMemo(() => {
    const n = registrosOrdenados.length
    const take = Math.min(visibleRegistrosCount, n)
    return registrosOrdenados.slice(0, take)
  }, [registrosOrdenados, visibleRegistrosCount])
  const idsPaginaNoSellados = useMemo(
    () => registrosPagina.filter(r => !esSellado(r)).map(r => r.id),
    [registrosPagina]
  )

  const hayMasRegistrosVista = verPapelera
    ? (papeleraTotal > 0
        ? papeleraCargados < papeleraTotal
        : visibleRegistrosCount < registrosOrdenados.length)
    : visibleRegistrosCount < registrosOrdenados.length

  const textoProgresoPapelera = verPapelera
    ? `${Math.min(registrosPagina.length, papeleraCargados || registrosPagina.length).toLocaleString('es-CO')} cargados`
      + (papeleraTotal > 0 ? ` / ${papeleraTotal.toLocaleString('es-CO')} en papelera` : '')
    : `${registrosPagina.length.toLocaleString('es-CO')} / ${registrosOrdenados.length.toLocaleString('es-CO')} en pantalla`

  const pptoFilaTecladoIdxRef = useRef(-1)

  const handlePptoGrillaKeyDown = useCallback((e) => {
    const key = e.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return

    const target = e.target
    if (target instanceof HTMLElement) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      if (target.closest('button, a, [role="button"], [role="menuitem"], [contenteditable="true"]')) return
    }

    const wrap = pptoTablaScrollRef.current
    if (!wrap) return

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      wrap.scrollBy({ left: key === 'ArrowLeft' ? -120 : 120, behavior: 'smooth' })
      return
    }

    const rows = registrosPagina
    if (!rows.length) return

    e.preventDefault()
    e.stopPropagation()

    let idx = pptoFilaTecladoIdxRef.current
    if (idx < 0 || idx >= rows.length) {
      const zoomIdx = filaZoom != null ? rows.findIndex((r) => r.id === filaZoom) : -1
      idx = zoomIdx >= 0 ? zoomIdx : 0
    } else {
      idx = key === 'ArrowDown' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0)
    }
    pptoFilaTecladoIdxRef.current = idx
    const row = rows[idx]
    if (!row) return
    setFilaZoom(row.id)
    const tr = wrap.querySelector(`tr[data-id="${row.id}"]`)
    tr?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [registrosPagina, filaZoom])

  useEffect(() => {
    if (filaZoom == null) return
    const idx = registrosPagina.findIndex((r) => r.id === filaZoom)
    if (idx >= 0) pptoFilaTecladoIdxRef.current = idx
  }, [filaZoom, registrosPagina])

  const handleCargarMasRegistrosVista = (increment) => {
    if (verPapelera) {
      void cargarMasPapeleraServidor(increment)
      return
    }
    const el = pptoTablaScrollRef.current
    const prevH = el?.scrollHeight ?? 0
    const prevT = el?.scrollTop ?? 0
    const total = registrosOrdenados.length
    setVisibleRegistrosCount((c) => {
      if (increment === 'all') return total
      const add = typeof increment === 'number' && increment > 0 ? increment : POR_PAGINA
      return Math.min(c + add, total)
    })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrap = pptoTablaScrollRef.current
        if (!wrap) return
        wrap.scrollTop = prevT + (wrap.scrollHeight - prevH)
      })
    })
  }

  async function cargarItemsCapitulo(capitulo) {
    if (!contratoId) return
    setItemsResumen([])
    setCapActivo(capitulo)
    try {
      const p = pptoQueryBib(pptoBuildPresupuestoSearchParams(fObraRef.current || fObra, pptoCtxFiltro(drill, capExpandido), {
        capituloOverride: capitulo,
      }))
      const res = await fetch(
        `${pptoEp().itemsLista}?${p.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) setItemsResumen(await res.json())
    } catch {}
  }

  async function handleBarClick(barData) {
    if (!nivelActual || !barData?.name) return
    if (nivelActual === 'capitulo') {
      setModoCapSeleccion('')
      setTramoSelec(null)
      setTabTramo(0)
      setModalModoCapitulo(barData.name)
      return
    }
    if (nivelActual === 'item' && capActivo) {
      setDrill(prev => [...prev, { campo: nivelActual, valor: barData.name }])
      await cargarCapituloData(capActivo, barData.name)
      return
    }
    setDrill(prev => [...prev, { campo: nivelActual, valor: barData.name }])
  }
  function irA(idx) {
    const stack = pptoDrillStackRef.current
    if (stack.length > idx + 1) {
      pptoDrillStackRef.current = stack.slice(0, idx + 1)
      const target = pptoDrillStackRef.current[idx]
      if (target && pptoRestaurarVistaSnap(target)) return
    }
    setDrill((prev) => prev.slice(0, idx))
  }

  // ── Listado de precios: derivados ──────────────────────────────────────────
  const capitulosListado = useMemo(() => [...new Set(listadoPrecios.map(p => p.capitulo).filter(Boolean))].sort((a, b) => {
    const numA = parseFloat(a); const numB = parseFloat(b)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.localeCompare(b, 'es', { numeric: true })
  }), [listadoPrecios])
  const itemsListado = useMemo(() => listadoPrecios.filter(p => !editCapitulo || p.capitulo === editCapitulo), [listadoPrecios, editCapitulo])
  const precioSeleccionado = useMemo(() => listadoPrecios.find(p => p.item_numero === editItem) || null, [listadoPrecios, editItem])
  const hayModificaciones = seleccionados.size > 0 && (
    editCapitulo !== '' || editItem !== '' ||
    (puedeEditar && [...seleccionados].some(id => editDims[id]))
  ) && ![...seleccionados].some(id => esSellado(registros.find(r => r.id === id)))

  async function ejecutarRecalcular({
    skipUndo = false,
    undoLabel = 'Recálculo masivo',
    capituloOverride,
    itemOverride,
    precioOverride,
    idsOverride,
  } = {}) {
    const capAplicar = capituloOverride ?? editCapitulo
    const itemAplicar = itemOverride ?? editItem
    const precioAplicar = precioOverride ?? precioSeleccionado
    const ids = idsOverride ?? [...seleccionados]
    if (aplicaReglasCadPresupuesto) {
      const intentaArea = ids.some((id) => {
        const d = editDims[id]
        return d && d.area_long_nod != null && d.area_long_nod !== ''
      })
      if (intentaArea) {
        alert(MSG_AREA_LONG_DESDE_PLANO)
        return
      }
    }
    // Solo area_long_nod está restringido al Desarrollador; ancho/espesor los puede editar cualquier editor
    const tieneAreaLong = ids.some(id => editDims[id]?.area_long_nod != null)
    if (tieneAreaLong && !puedeEditarNodosYAreaLongComoDev) {
      alert('El campo Área/Long/Nodo en recálculo masivo solo está habilitado para Desarrollador o para editores del contrato autorizado en presupuesto.')
      return
    }
    const tieneCambioMedidas = ids.some(id => {
      const d = editDims[id]
      if (!d) return false
      return (d.area_long_nod != null && d.area_long_nod !== '') || (d.ancho != null && d.ancho !== '') || (d.espesor != null && d.espesor !== '')
    })
    const tieneCambioNodos = puedeEditarNodosYAreaLongComoDev && ids.some(id => {
      const d = editDims[id]
      return d && ('no_inicio' in d || 'no_final' in d)
    })
    const tieneItem = !!(capAplicar || itemAplicar)
    if (!tieneItem && !tieneCambioMedidas && !tieneCambioNodos) {
      alert('No hay cambios para aplicar.')
      return
    }
    const tipoComent = tieneItem ? 'item_capitulo' : 'dims'

    // Pedir comentario (obligatorio)
    const comentarioData = await pedirComentario(tipoComent, true, ids)
    if (comentarioData === null) return  // canceló
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const modoComentario = comentarioData?.modo || null
    if (!skipUndo) registrarUndoPresupuesto(undoLabel, ids)

    let nodosMergeEnBulk = {}
    if (tieneCambioNodos) {
      const updatesById = {}
      let intentosPut = 0
      for (const id of ids) {
        const d = editDims[id]
        if (!d || (!('no_inicio' in d) && !('no_final' in d))) continue
        const row = registros.find(r => r.id === id)
        if (!row || esSellado(row)) continue
        const payload = {}
        if ('no_inicio' in d) payload.no_inicio = String(d.no_inicio ?? '').trim() || null
        if ('no_final' in d) payload.no_final = String(d.no_final ?? '').trim() || null
        if (Object.keys(payload).length === 0) continue
        intentosPut += 1
        const res = await fetch(`${pptoEp().item(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          try {
            const err = await res.json()
            alert(err.detail || 'No se pudieron guardar los nodos.')
          } catch {
            alert('No se pudieron guardar los nodos.')
          }
          return
        }
        try {
          const data = await res.json()
          if (data?.id) updatesById[data.id] = data
        } catch { /* ok */ }
      }
      if (intentosPut === 0 && !tieneItem && !tieneCambioMedidas) {
        alert('No hay nodos editables en la selección (p. ej. todos los registros están sellados).')
        return
      }
      if (!tieneItem && !tieneCambioMedidas) {
        if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioId, modoComentario)
        setRegistros(prev => prev.map(r => (updatesById[r.id] ? { ...r, ...updatesById[r.id] } : r)))
        setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
        cargarCapitulos({ silent: true }).catch(() => {})
        return
      }
      nodosMergeEnBulk = updatesById
    }

    const dims = ids.filter(id => editDims[id]).map(id => {
      const d = editDims[id]
      const row = registros.find((r) => r.id === id)
      const cad = aplicaReglasCadPresupuesto && row && registroEnlazadoPlano(row)
      return {
        id,
        ancho: d.ancho !== '' && d.ancho != null ? parseFloat(d.ancho) : null,
        espesor: d.espesor !== '' && d.espesor != null ? parseFloat(d.espesor) : null,
        area_long_nod:
          !cad && puedeEditarNodosYAreaLongComoDev && d.area_long_nod !== '' && d.area_long_nod != null ? parseFloat(d.area_long_nod) : null,
      }
    })
    const body = { ids, dims: dims.length > 0 ? dims : null }
    if (capAplicar) body.capitulo = capAplicar
    if (itemAplicar) {
      body.item = itemAplicar
      body.descripcion = precioAplicar?.descripcion ?? null
    }
    if (precioAplicar) body.vlr_unitario = precioAplicar.precio_unitario

    // Calcular resultado esperado localmente y aplicarlo antes del fetch
    const computarFila = (r) => {
      if (!ids.includes(r.id)) return r
      const dim = dims.find(d => d.id === r.id)
      const ancho   = (dim?.ancho != null ? dim.ancho : (r.ancho ?? 0)) || 0
      const espesor = (dim?.espesor != null ? dim.espesor : (r.espesor ?? 0)) || 0
      const area    = (dim?.area_long_nod != null ? dim.area_long_nod : (r.area_long_nod ?? 0)) || 0
      const vlr     = precioAplicar?.precio_unitario ?? r.vlr_unitario ?? 0
      const cant    = (ancho > 0 || espesor > 0) ? Math.round(area * ancho * espesor * 100) / 100 : Math.round(area * 100) / 100
      const costo   = Math.round(cant * vlr)
      return {
        ...r,
        ...(capAplicar && { capitulo: capAplicar }),
        ...(itemAplicar && { item: itemAplicar, descripcion: precioAplicar?.descripcion ?? r.descripcion }),
        ...(dim && { ancho, espesor, area_long_nod: area }),
        cant_total:    cant,
        costo_directo: costo,
        vlr_unitario:  vlr,
      }
    }
    const snapOriginal = registros.filter(r => ids.includes(r.id))
    setRegistros(prev => prev.map(r => computarFila(nodosMergeEnBulk[r.id] ? { ...r, ...nodosMergeEnBulk[r.id] } : r)))
    setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
    _lastWriteAtRef.current = Date.now()

    setGuardandoBulk(true)
    const res = await fetch(`${pptoEp().bulkRecalcular}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioId, modoComentario)
    } else {
      // Revertir si falló
      setRegistros(prev => prev.map(r => {
        const orig = snapOriginal.find(x => x.id === r.id)
        return orig ? orig : r
      }))
    }
  }

  async function ejecutarBulkTipoEjecucion({ skipConfirm = false, tipoOverride, idsOverride } = {}) {
    const tipoAplicar = tipoOverride ?? bulkTipoEjecucion
    const selIds = idsOverride ?? [...seleccionados]
    if (!tipoAplicar || selIds.length === 0) return false
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados (aprobados por Interventoría) en la selección; no pueden modificarse.')
      return
    }
    const vistaTipo = fObraRef.current?.tipoEjecucion || fObra.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT
    if (!skipConfirm && !window.confirm(`¿Cambiar tipo de ejecución a «${tipoAplicar}» en ${selIds.length} registro(s)?`)) return false
    registrarUndoPresupuesto('Tipo de ejecución (selección)', selIds)
    setGuardandoBulk(true)
    const res = await fetch(`${pptoEp().bulkTipoEjecucion}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selIds, tipo_ejecucion: tipoAplicar }),
    })
    setGuardandoBulk(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err?.detail || 'No se pudo cambiar el tipo de ejecución.')
      return false
    }
    const d = await res.json().catch(() => ({}))
    const nuevoTipo = d?.tipo_ejecucion || tipoAplicar
    _lastWriteAtRef.current = Date.now()
    setBulkTipoEjecucion('')
    setSeleccionados(new Set())
    if (nuevoTipo !== vistaTipo) {
      setRegistros(prev => prev.filter(r => !selIds.includes(r.id)))
      setAvisoSistema({
        titulo: 'Tipo de ejecución',
        mensaje: `${d?.actualizados ?? selIds.length} registro(s) pasaron a «${nuevoTipo}». Ya no aparecen en la vista «${vistaTipo}»; use el toggle Presupuesto de Obra / Obra Ejecutada.`,
        tipo: 'info',
      })
    } else {
      setRegistros(prev => prev.map(r => (selIds.includes(r.id) ? { ...r, tipo_ejecucion: nuevoTipo } : r)))
      setAvisoSistema({
        titulo: 'Tipo de ejecución',
        mensaje: `${d?.actualizados ?? selIds.length} registro(s) actualizados a «${nuevoTipo}».`,
        tipo: 'ok',
      })
    }
    { const c = drill.find(x => x.campo === 'capitulo')?.valor; if (c) delete _pptoCachePorCap.current[c] }
    return true
  }

  async function ejecutarBulkEstadoDirecto(estado) {
    if (!estado || seleccionados.size === 0) return
    const selIds = [...seleccionados]
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados (aprobados por Interventoría) en la selección; no pueden modificarse.')
      return
    }
    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio, selIds)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const modoComentario = comentarioData?.modo || null
    registrarUndoPresupuesto('Validación Interventoría (selección)', selIds)
    const snapOriginal = registros.filter(r => selIds.includes(r.id))
    pptoIniciarValidacionOptimista((r) => aplicarCambioEstadoLocal(r, selIds, estado))
    setBulkEstado(''); setSeleccionados(new Set())
    setGuardandoBulk(true)
    try {
      const res = await fetch(`${pptoEp().bulkEstado}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: selIds, revisado: estado })
      })
      if (res.ok) {
        pptoPostValidacionServidorOk()
        if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId, modoComentario)
        lanzarClaraLinkEstado(selIds, estado)
      } else {
        pptoParchearRegistrosOptimista((r) => {
          const orig = snapOriginal.find(x => x.id === r.id)
          return orig || r
        })
      }
    } finally {
      setGuardandoBulk(false)
      pptoFinValidacionOptimista()
    }
  }

  async function ejecutarBulkEstado(estadoOverride, { idsOverride, skipPedirComentario = false, comentario: comentarioPreset = '' } = {}) {
    const estadoAplicado = estadoOverride ?? bulkEstado
    const selIds = idsOverride ?? [...seleccionados]
    if (!estadoAplicado || selIds.length === 0) return false
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados (aprobados por Interventoría) en la selección; no pueden modificarse.')
      return false
    }
    const obligatorio = estadoAplicado === 'Pendiente' || estadoAplicado === 'Rechazado'
    let comentario = comentarioPreset
    let destinatarioId = null
    let modoComentario = null
    if (!skipPedirComentario) {
      const comentarioData = await pedirComentario('validacion', obligatorio, selIds)
      if (comentarioData === null) return false
      comentario = comentarioData?.mensaje || ''
      destinatarioId = comentarioData?.destinatarioId || null
      modoComentario = comentarioData?.modo || null
    } else if (String(comentario || '').trim()) {
      modoComentario = await resolverModoSiHayHistorial(selIds, 'validacion')
      if (modoComentario == null) return false
    }
    registrarUndoPresupuesto('Validación Interventoría (selección)', selIds)
    const snapOriginal = registros.filter(r => selIds.includes(r.id))
    pptoIniciarValidacionOptimista((r) => aplicarCambioEstadoLocal(r, selIds, estadoAplicado))
    setBulkEstado(''); setSeleccionados(new Set())
    setGuardandoBulk(true)
    try {
      const res = await fetch(`${pptoEp().bulkEstado}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: selIds, revisado: estadoAplicado })
      })
      if (res.ok) {
        pptoPostValidacionServidorOk()
        if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId, modoComentario)
        lanzarClaraLinkEstado(selIds, estadoAplicado)
        return true
      }
      pptoParchearRegistrosOptimista((r) => {
        const orig = snapOriginal.find(x => x.id === r.id)
        return orig || r
      })
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo aplicar la validación de Interventoría.')
      } catch {
        alert('No se pudo aplicar la validación de Interventoría.')
      }
      return false
    } finally {
      setGuardandoBulk(false)
      pptoFinValidacionOptimista()
    }
  }

  async function ejecutarBulkPreInterv(estadoOverride, { idsOverride, skipPedirComentario = false, comentario: comentarioPreset = '' } = {}) {
    const estadoPre = estadoOverride ?? bulkPreInterv
    const selIds = idsOverride ?? [...seleccionados]
    if (!estadoPre || selIds.length === 0) return false
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados en la selección; no pueden modificarse.')
      return
    }
    const obligatorio = estadoPre === 'Pendiente' || estadoPre === 'Rechazado'
    let comentario = comentarioPreset
    let destinatarioId = null
    let modoComentario = null
    if (!skipPedirComentario) {
      const comentarioData = await pedirComentario('validacion', obligatorio, selIds)
      if (comentarioData === null) return false
      comentario = comentarioData?.mensaje || ''
      destinatarioId = comentarioData?.destinatarioId || null
      modoComentario = comentarioData?.modo || null
    } else if (String(comentario || '').trim()) {
      modoComentario = await resolverModoSiHayHistorial(selIds, 'validacion')
      if (modoComentario == null) return false
    }
    registrarUndoPresupuesto('Depuración (selección)', selIds)
    const snapOriginal = registros.filter(r => selIds.includes(r.id))
    pptoIniciarValidacionOptimista((r) => aplicarCambioPreIntervLocal(r, selIds, estadoPre))
    setBulkPreInterv(''); setSeleccionados(new Set())
    setGuardandoBulk(true)
    try {
      const res = await fetch(`${pptoEp().bulkPreInterv}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: selIds, estado: estadoPre })
      })
      if (res.ok) {
        pptoPostValidacionServidorOk()
        if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId, modoComentario)
        return true
      }
      pptoParchearRegistrosOptimista((r) => {
        const orig = snapOriginal.find(x => x.id === r.id)
        return orig || r
      })
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo aplicar la depuración previa.')
      } catch {
        alert('No se pudo aplicar la depuración previa.')
      }
      return false
    } finally {
      setGuardandoBulk(false)
      pptoFinValidacionOptimista()
    }
  }

  function idsSeleccionadosEditables() {
    return [...seleccionados].filter((id) => !esSellado(registros.find((r) => r.id === id)))
  }

  function idsSelladosSeleccionados() {
    return [...seleccionados].filter((id) => esSellado(registros.find((r) => r.id === id)))
  }

  /** Reapertura masiva: motivo + destinatario → No Revisado / sellado=false + notificación. */
  async function reabrirSelladosSeleccionados() {
    if (!puedeReabrirTrasAprob || versionActiva?.id) return
    const url = pptoEp().bulkReabrir
    if (!url) {
      window.alert('La reapertura masiva solo aplica al presupuesto vigente.')
      return
    }
    const ids = idsSelladosSeleccionados()
    if (!ids.length) {
      window.alert('Seleccione uno o más registros sellados para reabrir.')
      return
    }
    const com = await pedirComentario('reapertura', true, ids)
    if (com == null) return
    const motivo = String(com.mensaje || '').trim()
    const destinatarioId = com.destinatarioId ? parseInt(com.destinatarioId, 10) : null
    if (motivo.length < MIN_JUSTIFICACION_INTERV) {
      window.alert(mensajeJustificacionCorta(motivo.length, MIN_JUSTIFICACION_INTERV, true))
      return
    }
    if (!destinatarioId) {
      window.alert('Seleccione un destinatario para notificar la reapertura.')
      return
    }
    registrarUndoPresupuesto('Reapertura de registros sellados', ids)
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids, motivo, destinatario_id: destinatarioId }),
    })
    if (!res.ok) {
      let msg = 'No se pudo reabrir los registros sellados.'
      try {
        const j = await res.json()
        msg = j?.detail || msg
      } catch { /* ignore */ }
      window.alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
      return
    }
    const data = await res.json().catch(() => ({}))
    const idsOk = Array.isArray(data?.ids) ? data.ids : ids
    setRegistros((prev) => prev.map((r) => (
      idsOk.includes(r.id)
        ? { ...r, sellado: false, revisado: 'No Revisado', validado_por: null, validado_en: null }
        : r
    )))
    setSeleccionados((prev) => {
      const n = new Set(prev)
      idsOk.forEach((id) => n.delete(id))
      return n
    })
    setAvisoSistema({
      titulo: 'Reapertura',
      mensaje: `Se reabri${idsOk.length === 1 ? 'ó 1 registro' : `eron ${idsOk.length} registros`} sellado(s). Quedaron en «No Revisado» y se notificó al destinatario.`,
      tipo: 'ok',
    })
    cargarCapitulos({ silent: true }).catch(() => {})
  }

  function filaResumenMasivo(r, campo, antiguo, nuevo) {
    return {
      id: r.id,
      ref: r.pk_id || r.id,
      capitulo: r.capitulo,
      item: r.item,
      campo,
      antiguo: String(antiguo ?? '—'),
      nuevo: String(nuevo ?? '—'),
    }
  }

  async function aplicarObservacionMasiva(ids, texto) {
    const t0 = String(texto || '').trim()
    if (!t0 || !ids.length) return
    const conPrev = ids.filter((id) => {
      const r = registros.find((x) => x.id === id)
      return String(r?.observacion_externa || '').trim().length > 0
    })
    let modo = PPTO_COMENTARIO_MODO_REPLACE
    if (conPrev.length > 0) {
      const elegido = await pedirModoHistorial({
        nConHistorial: conPrev.length,
        nTotal: ids.length,
        etiqueta: 'observaciones',
        titulo: 'Ya hay observaciones previas',
      })
      if (elegido == null) {
        throw new Error('Actualización de observación cancelada.')
      }
      modo = elegido
    }
    const res = await fetch(`${pptoEp().bulkObservacion}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids, observacion_externa: t0, modo }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo actualizar la observación.')
    }
    setRegistros((prev) => prev.map((r) => {
      if (!ids.includes(r.id)) return r
      const nextObs = modo === PPTO_COMENTARIO_MODO_APPEND
        ? pptoConcatenarObservacion(r.observacion_externa, t0)
        : t0
      return { ...r, observacion_externa: nextObs }
    }))
  }

  async function aplicarCompetenciaMasiva(ids, competencia) {
    const comp = String(competencia || '').trim()
    if (!comp || !ids.length) return
    const ep = pptoEp()
    const method = ep.mode === 'version' ? 'POST' : 'PUT'
    const res = await fetch(`${ep.bulkCompetencia}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids, competencia: comp }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.detail || 'No se pudo actualizar la competencia.')
    }
    setRegistros((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, competencia: comp } : r)))
  }

  async function aplicarMasivoCapItem({ capitulo, item, competencia, precioSeleccionado, observacion }) {
    const cap = capitulo || ''
    const it = item || ''
    const comp = String(competencia || '').trim()
    const obs = String(observacion || '').trim()
    const ids = idsSeleccionadosEditables()
    if (!ids.length) throw new Error('No hay registros editables (los sellados se omiten).')
    registrarUndoPresupuesto('Edición masiva: Capítulo / Ítem', ids)

    const tieneCapItem = !!(cap || it)
    if (!tieneCapItem && !comp && !obs) {
      throw new Error('Indique capítulo, ítem, competencia u observación (opcional).')
    }

    const resumen = ids.map((id) => {
      const r = registros.find((x) => x.id === id)
      if (!r) return null
      const partes = []
      if (cap && cap !== (r.capitulo || '')) partes.push(`Cap: ${r.capitulo || '—'} → ${cap}`)
      if (it && it !== (r.item || '')) partes.push(`Ítem: ${r.item || '—'} → ${it}`)
      if (precioSeleccionado && it) partes.push(`V.U: ${fmt(precioSeleccionado.precio_unitario)}`)
      if (comp && comp !== (r.competencia || '')) partes.push(`Comp: ${r.competencia || '—'} → ${comp}`)
      if (obs) partes.push(`Obs: ${obs}`)
      if (!partes.length) return null
      return filaResumenMasivo(
        r,
        'Capítulo / Ítem',
        `${r.capitulo || '—'} / ${r.item || '—'}`,
        partes.join(' · '),
      )
    }).filter(Boolean)

    if (tieneCapItem) {
      const idsCapItemCambio = ids.filter((id) => {
        const r = registros.find((x) => x.id === id)
        if (!r) return false
        return (cap && cap !== (r.capitulo || '')) || (it && it !== (r.item || ''))
      })
      if (!idsCapItemCambio.length && !comp && !obs) {
        throw new Error('Ningún registro editable requiere ese cambio de capítulo/ítem.')
      }
      if (idsCapItemCambio.length) {
        flushSync(() => {
          setEditCapitulo(cap)
          setEditItem(it)
          if (it && precioSeleccionado) {
            setItemBusqueda(`${precioSeleccionado.item_numero} · ${precioSeleccionado.descripcion || ''}`)
          }
        })
        setModalConfirm(false)
        await ejecutarRecalcular({
          skipUndo: true,
          capituloOverride: cap,
          itemOverride: it,
          precioOverride: precioSeleccionado,
          idsOverride: idsCapItemCambio,
        })
      }
    }
    if (comp) {
      const idsComp = ids.filter((id) => {
        const r = registros.find((x) => x.id === id)
        return r && (r.competencia || '') !== comp
      })
      if (idsComp.length) await aplicarCompetenciaMasiva(idsComp, comp)
    }
    if (obs) await aplicarObservacionMasiva(ids, obs)
    return resumen
  }

  async function aplicarMasivoTramosCompetencia({ ids: idsIn, competencia }) {
    const comp = String(competencia || '').trim()
    if (!comp) throw new Error('Seleccione la nueva competencia.')
    // Competencia es cambio administrativo: incluye sellados (el endpoint solo toca competencia).
    const ids = [...new Set((idsIn || []).filter((id) => id != null && id !== ''))]
    if (!ids.length) throw new Error('No hay registros seleccionados en Tramos.')
    registrarUndoPresupuesto('Edición masiva: Competencia (Tramos)', ids)
    const resumen = ids.map((id) => {
      const r = registros.find((x) => String(x.id) === String(id))
      const ant = r ? (r.competencia || '—') : '—'
      if (r && (r.competencia || '') === comp) return null
      return filaResumenMasivo(
        r || { id, pk_id: id, capitulo: '', item: '' },
        'Competencia',
        ant,
        comp,
      )
    }).filter(Boolean)
    const idsCambio = ids.filter((id) => {
      const r = registros.find((x) => String(x.id) === String(id))
      if (!r) return true
      return (r.competencia || '') !== comp
    })
    if (!idsCambio.length) throw new Error('Ningún registro requiere ese cambio de competencia.')
    await aplicarCompetenciaMasiva(idsCambio, comp)
    return resumen
  }

  async function aplicarMasivoDimensiones({ ancho, espesor, observacion }) {
    const obs = String(observacion || '').trim()
    const ids = idsSeleccionadosEditables()
    if (!ids.length) throw new Error('No hay registros editables (los sellados se omiten).')

    const parseDim = (s) => {
      const n = parseFloat(String(s ?? '').replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    const tieneAn = String(ancho ?? '').trim() !== ''
    const tieneEsp = String(espesor ?? '').trim() !== ''
    const anNum = tieneAn ? parseDim(ancho) : null
    const espNum = tieneEsp ? parseDim(espesor) : null
    if (!tieneAn && !tieneEsp && !obs) {
      throw new Error('Indique al menos una dimensión u observación (opcional).')
    }
    if ((tieneAn && anNum === null) || (tieneEsp && espNum === null)) {
      throw new Error('Ancho y espesor deben ser valores numéricos válidos.')
    }

    const fmtD = (v) => (v != null && v !== '' ? String(v) : '—')
    const resumen = ids.map((id) => {
      const r = registros.find((x) => x.id === id)
      if (!r) return null
      const partes = []
      if (anNum != null) partes.push(`Ancho: ${fmtD(r.ancho)} → ${anNum}`)
      if (espNum != null) partes.push(`Espesor: ${fmtD(r.espesor)} → ${espNum}`)
      if (anNum != null || espNum != null) {
        const area = parseFloat(r.area_long_nod) || 0
        const w = anNum ?? (parseFloat(r.ancho) || 0)
        const e = espNum ?? (parseFloat(r.espesor) || 0)
        const cant = (w > 0 || e > 0) ? Math.round(area * w * e * 100) / 100 : Math.round(area * 100) / 100
        const costo = Math.round(cant * (parseFloat(r.vlr_unitario) || 0))
        partes.push(`Cant: ${fmtD(r.cant_total)} → ${cant}`)
        partes.push(`CD: ${formatCOP(r.costo_directo)} → ${formatCOP(costo)}`)
      }
      if (obs) partes.push(`Obs: ${obs}`)
      return filaResumenMasivo(
        r,
        'Dimensiones',
        `${fmtD(r.area_long_nod)} · ${fmtD(r.ancho)} · ${fmtD(r.espesor)}`,
        partes.join(' · '),
      )
    }).filter(Boolean)

    if (anNum != null || espNum != null) {
      const comentarioData = await pedirComentario('dims', true, ids)
      if (comentarioData === null) throw new Error('Operación cancelada.')

      registrarUndoPresupuesto('Edición masiva: Dimensiones', ids)
      const dims = ids.map((id) => {
        const o = { id }
        if (anNum != null) o.ancho = anNum
        if (espNum != null) o.espesor = espNum
        return o
      })
      const snapOriginal = registros.filter((r) => ids.includes(r.id))
      setRegistros((prev) => prev.map((r) => {
        if (!ids.includes(r.id)) return r
        const area = parseFloat(r.area_long_nod) || 0
        const w = anNum ?? (parseFloat(r.ancho) || 0)
        const e = espNum ?? (parseFloat(r.espesor) || 0)
        const cant = (w > 0 || e > 0) ? Math.round(area * w * e * 100) / 100 : Math.round(area * 100) / 100
        const costo = Math.round(cant * (parseFloat(r.vlr_unitario) || 0))
        return {
          ...r,
          ...(anNum != null && { ancho: anNum }),
          ...(espNum != null && { espesor: espNum }),
          cant_total: cant,
          costo_directo: costo,
        }
      }))
      _lastWriteAtRef.current = Date.now()
      setGuardandoBulk(true)
      const res = await fetch(`${pptoEp().bulkRecalcular}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids, dims }),
      })
      setGuardandoBulk(false)
      if (!res.ok) {
        setRegistros((prev) => prev.map((r) => {
          const orig = snapOriginal.find((x) => x.id === r.id)
          return orig || r
        }))
        const err = await res.json().catch(() => ({}))
        const detail = err?.detail
        throw new Error(typeof detail === 'string' ? detail : 'No se pudieron aplicar las dimensiones.')
      }
      const comentario = comentarioData?.mensaje || ''
      if (comentario.trim()) await crearComentarios(ids, 'dims', comentario, comentarioData?.destinatarioId || null, comentarioData?.modo || null)
      cargarCapitulos({ silent: true }).catch(() => {})
    }
    if (obs) await aplicarObservacionMasiva(ids, obs)
    return resumen
  }

  async function aplicarMasivoTipo({ tipo_ejecucion, observacion }) {
    const obs = String(observacion || '').trim()
    const ids = idsSeleccionadosEditables()
    if (!ids.length) throw new Error('No hay registros editables.')
    registrarUndoPresupuesto('Edición masiva: Tipo de ejecución', ids)
    const resumen = ids.map((id) => {
      const r = registros.find((x) => x.id === id)
      if (!r) return null
      const ant = r.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT
      return filaResumenMasivo(r, 'Tipo ejecución', ant, tipo_ejecucion + (obs ? ` · Obs: ${obs}` : ''))
    }).filter(Boolean)

    const ok = await ejecutarBulkTipoEjecucion({ skipConfirm: true, tipoOverride: tipo_ejecucion, idsOverride: ids })
    if (!ok) throw new Error('No se pudo cambiar el tipo de ejecución.')
    if (obs) await aplicarObservacionMasiva(ids, obs)
    return resumen
  }

  async function aplicarMasivoDepuracion({ estado, observacion }) {
    const obs = String(observacion || '').trim()
    const ids = idsSeleccionadosEditables()
    if (!ids.length) throw new Error('No hay registros editables.')
    registrarUndoPresupuesto('Edición masiva: Depuración', ids)
    const resumen = ids.map((id) => {
      const r = registros.find((x) => x.id === id)
      if (!r) return null
      const ant = r.pre_interv_estado || 'No Revisado'
      return filaResumenMasivo(r, 'Depuración', ant, estado + (obs ? ` · Obs: ${obs}` : ''))
    }).filter(Boolean)

    const ok = await ejecutarBulkPreInterv(estado, { idsOverride: ids, skipPedirComentario: true })
    if (!ok) throw new Error('No se pudo aplicar la depuración.')
    if (obs) await aplicarObservacionMasiva(ids, obs)
    return resumen
  }

  async function aplicarMasivoInterventoria({ estado, observacion }) {
    const obs = String(observacion || '').trim()
    let ids = idsSeleccionadosEditables()
    if (!esDevPpto) {
      ids = ids.filter((id) => {
        const r = registros.find((x) => x.id === id)
        return r && preIntervLiberadoParaInterventoria(r)
      })
    }
    if (!ids.length) {
      throw new Error(
        'Ningún registro seleccionado tiene depuración contratista aprobada. Interventoría solo valida tras «Aprobado» en depuración.',
      )
    }
    registrarUndoPresupuesto('Edición masiva: Interventoría', ids)
    const resumen = ids.map((id) => {
      const r = registros.find((x) => x.id === id)
      if (!r) return null
      const ant = r.revisado || 'No Revisado'
      return filaResumenMasivo(r, 'Interventoría', ant, estado + (obs ? ` · Obs: ${obs}` : ''))
    }).filter(Boolean)

    const ok = await ejecutarBulkEstado(estado, { idsOverride: ids, skipPedirComentario: true })
    if (!ok) throw new Error('No se pudo aplicar la validación de Interventoría.')
    if (obs) await aplicarObservacionMasiva(ids, obs)
    return resumen
  }

  // ── Edición inline ─────────────────────────────────────────────────────────
  function iniciarEdicion(registro) {
    if (esSellado(registro) && !puedeReabrirTrasAprob) return
    setEditando(registro.id)
    setEditValues({
      area_long_nod: registro.area_long_nod ?? '',
      ancho: registro.ancho ?? '',
      espesor: registro.espesor ?? '',
      vlr_unitario: registro.vlr_unitario ?? '',
      capitulo: registro.capitulo ?? '',
      item: registro.item ?? '',
      revisado: registro.revisado ?? '',
    })
  }

  async function guardarEdicion(id) {
    const reg = registros.find(rr => rr.id === id)
    if (esSellado(reg) && !puedeReabrirTrasAprob) return
    let motivoReap = null
    let destinatarioReap = null
    if (esSellado(reg) && puedeReabrirTrasAprob) {
      const com = await pedirComentario('reapertura', true, [id])
      if (com == null) return
      motivoReap = String(com.mensaje || '').trim()
      destinatarioReap = com.destinatarioId ? parseInt(com.destinatarioId, 10) : null
      if (motivoReap.length < 15) { alert('El motivo de reapertura debe tener al menos 15 caracteres (visible para Interventoría).'); return }
      if (!destinatarioReap) { alert('Seleccione un destinatario para notificar la reapertura.'); return }
    }
    const body = {}
    const allowDim = puedeEditarDimensiones
    if (allowDim) {
      const p = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
      body.area_long_nod = p(editValues.area_long_nod)
      body.ancho = p(editValues.ancho)
      body.espesor = p(editValues.espesor)
    }
    Object.entries(editValues).forEach(([k, v]) => {
      if (['area_long_nod', 'ancho', 'espesor'].includes(k)) return
      if (v === '' || v == null) return
      if (!allowDim && ['area_long_nod', 'ancho', 'espesor'].includes(k)) return
      body[k] = ['vlr_unitario', 'cant_total'].includes(k) ? parseFloat(v) : v
    })
    const capB = body.capitulo != null ? String(body.capitulo).trim() : null
    const itB = body.item != null ? String(body.item).trim() : null
    const capEff = capB ?? String(reg.capitulo ?? '').trim()
    const itEff = itB ?? String(reg.item ?? '').trim()
    const itemMut = itB != null && itB !== String(reg.item ?? '').trim()
    const capMut = capB != null && capB !== String(reg.capitulo ?? '').trim()
    if ((itemMut || capMut) && capEff && itEff && Array.isArray(listadoPrecios) && listadoPrecios.length) {
      const precio =
        listadoPrecios.find(
          (p) =>
            String(p.item_numero ?? '').trim() === itEff &&
            (!capMut || String(p.capitulo ?? '').trim() === capEff),
        ) || listadoPrecios.find((p) => String(p.item_numero ?? '').trim() === itEff)
      const pv = precioVlrDesdeListado(precio)
      if (pv != null) {
        body.vlr_unitario = pv
        if (!allowDim) {
          const cant0 = parseFloat(String(reg.cant_total ?? '').replace(',', '.')) || 0
          body.costo_directo = Math.round(cant0 * pv)
        }
      }
    }
    if (motivoReap) {
      body.motivo_edicion_tras_sellado = motivoReap
      if (destinatarioReap) body.destinatario_id = destinatarioReap
    }
    const just = await pedirJustificacionEdicionDetalle(reg, body, 'dims')
    if (!just.ok) return
    registrarUndoPresupuesto('Edición de registro', [id])
    const res = await fetch(`${pptoEp().item(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (res.ok) {
      const d = await res.json()
      setEditando(null)
      if (d && d.id) {
        setRegistros(prev => prev.map(r => r.id === d.id ? d : r))
      }
      if (just.comentarioTrazabilidad) {
        const c = just.comentarioTrazabilidad
        await crearComentarios([id], c.tipo, c.mensaje, c.destinatarioId, c.modo || null)
      }
      cargarCapitulos({ silent: true }).catch(() => {})
    } else {
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo guardar la edición.')
      } catch {
        alert('No se pudo guardar la edición.')
      }
    }
  }

  // ── Selección ──────────────────────────────────────────────────────────────
  /** Estilo táctil del checkbox de fila (tabla y cards). */
  const pptoCheckStyle = {
    width: 22,
    height: 22,
    minWidth: 22,
    minHeight: 22,
    margin: 0,
    accentColor: t.primary,
    flexShrink: 0,
  }

  function toggleSel(id) {
    const row = registros.find(rr => rr.id === id)
    if (filaPptoNoSeleccionable(row)) return
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    lastSelAnchorIdRef.current = id
  }

  /**
   * Clic en checkbox de fila: Shift+clic selecciona el rango desde el ancla
   * (mismo patrón que el panel de ítems / gestores de archivos).
   */
  function onSelCheckboxClick(id, e) {
    e.stopPropagation()
    const row = registrosPagina.find((rr) => rr.id === id) || registros.find((rr) => rr.id === id)
    if (filaPptoNoSeleccionable(row)) {
      e.preventDefault()
      return
    }
    if (e.shiftKey && lastSelAnchorIdRef.current != null) {
      e.preventDefault()
      const ids = idsRangoSeleccion(registrosPagina, lastSelAnchorIdRef.current, id, filaPptoNoSeleccionable)
      if (ids.length) {
        setSeleccionados((prev) => {
          const n = new Set(prev)
          ids.forEach((i) => n.add(i))
          return n
        })
      }
      lastSelAnchorIdRef.current = id
    }
  }

  function onSelCheckboxChange(id, e) {
    // Sin Shift: toggle individual y actualiza ancla.
    // Con Shift, onClick ya aplicó el rango (preventDefault); no volver a togglear.
    if (e?.shiftKey) return
    toggleSel(id)
  }

  function toggleTodos() {
    const idsPagina = registrosPagina.map(r => r.id)
    const idsSeleccionables = registrosPagina.filter(r => puedeSeleccionarFilaPpto(r)).map(r => r.id)
    const todosSeleccionablesMarcados = idsSeleccionables.length > 0 && idsSeleccionables.every(id => seleccionados.has(id))
    if (todosSeleccionablesMarcados) {
      setSeleccionados(prev => { const n = new Set(prev); idsPagina.forEach(i => n.delete(i)); return n })
      lastSelAnchorIdRef.current = null
    } else {
      setSeleccionados(prev => { const n = new Set(prev); idsSeleccionables.forEach(i => n.add(i)); return n })
      if (idsSeleccionables.length) lastSelAnchorIdRef.current = idsSeleccionables[idsSeleccionables.length - 1]
    }
  }
  useEffect(() => {
    const ids = registrosPagina?.map(r => r.id)
    if (ids?.length) cargarComentariosResumen(ids)
  }, [visibleRegistrosCount, registrosFiltrados.length])

  // Comentarios de validación del capítulo al elegir tramo (una petición, sin lista de miles de IDs)
  useEffect(() => {
    if (!tramoSelec || !modalModoCapitulo || !contratoId) return
    fetchComentariosValidacionPorCapitulo(modalModoCapitulo)
      .then(data => setComentariosTramo(prev => ({ ...prev, ...data })))
      .catch(() => {})
  }, [tramoSelec, modalModoCapitulo])

  // ── Estilos ────────────────────────────────────────────────────────────────
  const REVISADO_OPTS = ['No Revisado', 'Rechazado', 'Pendiente', 'Aprobado']
  const estadoColor = pptoEstadoValidacionColor
  const SEMAFORO = PPTO_SEMAFORO_ESTADOS.map((s) => ({ ...s, label: s.valor === 'No Revisado' ? '🔵' : s.valor === 'Rechazado' ? '🔴' : s.valor === 'Pendiente' ? '🟡' : '🟢' }))

  /** Zoom + resaltado en plano vía cola del Agent (SicoeCAD). Requiere DWG enlazado (heartbeat). */
  function navegarRegistroEnPlano(registro) {
    if (!registro?.id) return
    const tieneHandle = registro.ent_handle != null && String(registro.ent_handle).trim() !== ''
    const tieneCoords = registro.x_label != null && registro.y_label != null
    if (!tieneHandle && !tieneCoords) return

    setFilaZoom(registro.id)
    if (navPlanoTimerRef.current) clearTimeout(navPlanoTimerRef.current)
    navPlanoTimerRef.current = setTimeout(() => {
      navPlanoTimerRef.current = null
      void ejecutarNavegarRegistroEnPlano(registro, tieneHandle, tieneCoords)
    }, 150)
  }

  async function ejecutarNavegarRegistroEnPlano(registro, tieneHandle, tieneCoords) {
    const MSG_SIN_DWG =
      'Para ver este registro en AutoCAD, abra el Agent ClaraCAD e inicie sesión con el mismo usuario de la web. ' +
      'AutoCAD debe estar abierto y el DWG enlazado (indicador verde en la barra superior).'

    const tok = getToken()
    const cid = registro.contrato_id || contratoId

    let enlazado = dwgEnlazadoRef.current || dwgEnlazado
    if (!enlazado && tok) {
      enlazado = await refrescarDwgEnlazado()
    }

    if (!enlazado) {
      window.alert(MSG_SIN_DWG)
      return
    }

    if (!tok) {
      window.alert('Debe iniciar sesión en ClaraCore para enviar comandos a AutoCAD.')
      return
    }

    const encolarHighlight = async () => {
      if (!tieneHandle) return false
      const r = await fetch(`${API}/cad-queue/${cid}/highlight-registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ presupuesto_id: registro.id }),
      })
      return r.ok
    }

    const encolarPk = async () => {
      if (!registro.pk_id) return false
      const r = await fetch(`${API}/cad-queue/${cid}/zoom-pkid?pk_id=${encodeURIComponent(registro.pk_id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      })
      return r.ok
    }

    try {
      if (await encolarHighlight()) return
      if (await encolarPk()) return
      window.alert(
        'No se pudo encolar la navegación en AutoCAD. Verifique que el registro tenga entidad enlazada (handle) o PK_ID.',
      )
    } catch {
      window.alert('Error de comunicación con el servidor. Intente de nuevo.')
    }
  }

  async function cambiarEstadoDirecto(id, nuevoEstado) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    if (puedeValidarInterventoriaUI && !esDevPpto && !preIntervLiberadoParaInterventoria(row)) {
      window.alert(
        'El registro debe estar aprobado en depuración contratista (Residente de Costos u Obra) antes de la validación de Interventoría.',
      )
      return
    }
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio, [id])
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const modoComentario = comentarioData?.modo || null
    registrarUndoPresupuesto('Validación Interventoría', [id])
    pptoIniciarValidacionOptimista((r) => aplicarCambioEstadoLocal(r, [id], nuevoEstado))
    try {
      const token = getToken()
      const res = await fetch(`${pptoEp().bulkEstado}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [id], revisado: nuevoEstado })
      })
      if (!res.ok) {
        limpiarUndoPresupuesto()
        pptoParchearRegistrosOptimista((r) => (r.id === id ? row : r))
        return
      }
      pptoPostValidacionServidorOk()
      if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId, modoComentario)
      lanzarClaraLinkEstado([id], nuevoEstado)
    } finally {
      pptoFinValidacionOptimista()
    }
  }

  async function cambiarPreIntervDirecto(id, nuevoEstado) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio, [id])
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const modoComentario = comentarioData?.modo || null
    registrarUndoPresupuesto('Depuración', [id])
    pptoIniciarValidacionOptimista((r) => aplicarCambioPreIntervLocal(r, [id], nuevoEstado))
    try {
      const tok = getToken()
      const res = await fetch(`${pptoEp().bulkPreInterv}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ ids: [id], estado: nuevoEstado })
      })
      if (!res.ok) {
        limpiarUndoPresupuesto()
        pptoParchearRegistrosOptimista((r) => (r.id === id ? row : r))
        try {
          const d = await res.json()
          alert(d.detail || 'No se pudo guardar la depuración previa.')
        } catch {
          alert('No se pudo guardar la depuración previa.')
        }
        return
      }
      pptoPostValidacionServidorOk()
      if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId, modoComentario)
    } finally {
      pptoFinValidacionOptimista()
    }
  }

async function darDeBaja(id) {
    if (dandoDeBaja || darDeBajaLockRef.current) return
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    let enlazado = dwgEnlazadoRef.current || dwgEnlazado
    if (bloqueaDarDeBajaDesdeWeb(row, enlazado)) {
      enlazado = await refrescarDwgEnlazado()
      if (bloqueaDarDeBajaDesdeWeb(row, enlazado)) {
        window.alert(MSG_BAJA_DESDE_PLANO)
        return
      }
    }
    const comentarioData = await pedirComentario('validacion', true, [id])
    if (comentarioData === null) return
    await ejecutarDarDeBajaLote([id], {
      comentario: comentarioData?.mensaje || '',
      destinatarioId: comentarioData?.destinatarioId || null,
      modoComentario: comentarioData?.modo || null,
      etiquetaComentario: '[BAJA]',
      resolverReg: (iid) => registros.find((rr) => rr.id === iid),
      alTerminarSeleccion: () => {
        setSeleccionados((prev) => {
          const n = new Set(prev)
          n.delete(id)
          return n
        })
      },
    })
  }

  async function refrescarTrasRestaurarPapelera() {
    _lastWriteAtRef.current = Date.now()
    _pptoCacheRef.current = null
    invalidarCachePresupuestoContrato()
    if (verPapelera) {
      setSeleccionados(new Set())
      await cargarRegistros(true, true)
      return
    }
    await recargarCapActual(true)
  }

  /**
   * Restaura uno o varios registros desde Papelera (quita dado_de_baja).
   * Sellados: omitidos / bloqueados. Tras éxito recarga la vista Papelera.
   */
  async function ejecutarRestaurarLote(ids, { confirmar = true } = {}) {
    if (restaurarLockRef.current || restaurandoPapelera) return { cancelado: true }
    const idsUnicos = [...new Set((ids || []).filter(Boolean))]
    if (!idsUnicos.length) return { cancelado: true, motivo: 'vacio' }

    const sellados = idsUnicos.filter((id) => esSellado(registros.find((rr) => rr.id === id)))
    const idsOk = idsUnicos.filter((id) => !esSellado(registros.find((rr) => rr.id === id)))
    if (!idsOk.length) {
      window.alert(
        'Los registros seleccionados están sellados (aprobados por Interventoría) y no pueden restaurarse.',
      )
      return { cancelado: true, motivo: 'sellados' }
    }
    if (confirmar) {
      const extraSellados = sellados.length
        ? `\n\nSe omitirán ${sellados.length} sellado(s).`
        : ''
      const msg =
        idsOk.length === 1
          ? '¿Restaurar este registro? Volverá al listado activo del presupuesto con los mismos datos.'
          : `¿Restaurar ${idsOk.length} registro(s)? Volverán al listado activo del presupuesto con los mismos datos.`
      if (!window.confirm(msg + extraSellados)) {
        return { cancelado: true, motivo: 'confirm' }
      }
    }

    restaurarLockRef.current = true
    setRestaurandoPapelera(true)
    const resultados = { ok: 0, errores: [] }
    try {
      const tok = getToken()
      for (const id of idsOk) {
        const res = await fetch(`${pptoEp().itemRestaurar(id)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok}` },
        })
        if (res.ok) {
          resultados.ok += 1
        } else {
          let detail = `HTTP ${res.status}`
          try {
            const d = await res.json()
            detail = d?.detail || detail
          } catch { /* ignore */ }
          resultados.errores.push({ id, detail })
        }
      }
      await refrescarTrasRestaurarPapelera()
      if (resultados.errores.length) {
        const muestra = resultados.errores
          .slice(0, 3)
          .map((e) => `#${e.id}: ${e.detail}`)
          .join('\n')
        window.alert(
          `Restaurados: ${resultados.ok}. Fallidos: ${resultados.errores.length}.\n${muestra}`,
        )
      } else if (resultados.ok > 1) {
        setAvisoSistema({
          titulo: 'Papelera',
          mensaje: `${resultados.ok} registro(s) restaurados al presupuesto activo.`,
          tipo: 'ok',
        })
      }
    } finally {
      restaurarLockRef.current = false
      setRestaurandoPapelera(false)
    }
    return resultados
  }

  async function restaurar(id) {
    const row = registros.find((rr) => rr.id === id)
    if (esSellado(row)) {
      window.alert('Registro sellado (aprobado por Interventoría): no puede restaurarse.')
      return
    }
    await ejecutarRestaurarLote([id])
  }

  /**
   * Eliminación definitiva (irreversible) de registros en Papelera.
   * Icono Flame — distinto de 🗑️ (dar de baja) y 🔄 (restaurar).
   */
  async function ejecutarPurgarDefinitivoLote(ids, { confirmar = true } = {}) {
    if (purgarLockRef.current || purgandoPapelera) return { cancelado: true }
    const ep = pptoEp()
    if (!ep.itemPurgar && !ep.papeleraPurgarLote) {
      window.alert('La eliminación definitiva no está disponible en vista de versión.')
      return { cancelado: true, motivo: 'version' }
    }
    const idsUnicos = [...new Set((ids || []).filter(Boolean))]
    if (!idsUnicos.length) return { cancelado: true, motivo: 'vacio' }
    if (confirmar) {
      const msg =
        idsUnicos.length === 1
          ? '¿Eliminar DEFINITIVAMENTE este registro?\n\nEsta acción es irreversible: no podrá restaurarse desde la Papelera.'
          : `¿Eliminar DEFINITIVAMENTE ${idsUnicos.length} registro(s)?\n\nEsta acción es irreversible.`
      if (!window.confirm(msg)) return { cancelado: true, motivo: 'confirm' }
    }
    purgarLockRef.current = true
    setPurgandoPapelera(true)
    try {
      const tok = getToken()
      let eliminados = []
      let errores = []
      if (ep.papeleraPurgarLote && idsUnicos.length > 1) {
        const res = await fetch(ep.papeleraPurgarLote, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: idsUnicos }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          window.alert(data?.detail || `Error ${res.status}`)
          return { cancelado: true }
        }
        eliminados = data.eliminados || []
        errores = data.errores || []
      } else {
        for (const id of idsUnicos) {
          const url = typeof ep.itemPurgar === 'function' ? ep.itemPurgar(id) : null
          if (!url) continue
          const res = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${tok}` },
          })
          if (res.ok) eliminados.push(id)
          else {
            let detail = `HTTP ${res.status}`
            try {
              const d = await res.json()
              detail = d?.detail || detail
            } catch { /* ignore */ }
            errores.push({ id, detail })
          }
        }
      }
      await refrescarTrasRestaurarPapelera()
      if (errores.length) {
        window.alert(
          `Eliminados: ${eliminados.length}. Fallidos: ${errores.length}.\n`
          + errores.slice(0, 3).map((e) => `#${e.id}: ${e.detail}`).join('\n'),
        )
      } else if (eliminados.length > 1) {
        setAvisoSistema({
          titulo: 'Papelera',
          mensaje: `${eliminados.length} registro(s) eliminados definitivamente.`,
          tipo: 'ok',
        })
      }
      return { eliminados, errores }
    } finally {
      purgarLockRef.current = false
      setPurgandoPapelera(false)
    }
  }

  async function purgarDefinitivo(id) {
    await ejecutarPurgarDefinitivoLote([id])
  }

  const thStyle = { padding:'8px 10px', fontSize:'var(--cc-sm)', fontWeight:'700', letterSpacing:'0.5px', color:t.textMuted, borderBottom:`1px solid ${t.border}`, textAlign:'left', whiteSpace:'nowrap' }
  const tdStyle = { padding:'7px 10px', fontSize:'var(--cc-sm)', borderBottom:`1px solid ${t.border}`, verticalAlign:'middle' }
  const bcBtn   = (active) => ({
    background: active ? t.primary : 'transparent',
    color: active ? '#fff' : t.textMuted,
    border: `1px solid ${active ? t.primary : t.border}`,
    borderRadius: '20px', padding: '4px 12px', fontSize: 'var(--cc-sm)',
    fontWeight: active ? '600' : '400', cursor: 'pointer', transition: 'all 0.15s',
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cc-modulo-presupuesto" style={{ fontSize: 'var(--cc-body)', lineHeight: 1.5 }}>
      {esDeveloper && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 'var(--cc-sm)',
            color: t.textMuted,
            background: t.bg,
            border: `1px dashed ${t.border}`,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: t.text }}>Cargo Desarrollador:</strong> la reapertura de registros sellados (motivo + destinatario → «No Revisado») aplica a quien tenga permiso{' '}
          <strong>editar</strong> en «editar registros presupuesto» (y a Desarrollador). El motivo al editar con estado ya validado por Interventoría <em>sin</em> sellado sigue siendo propio del perfil contratista.
        </div>
      )}
      {/* ── Modal Revisor de Tramos ─────────────────────────────────────────── */}
      {modalModoCapitulo && (() => {
        const capRegs = registros.filter(r => r.capitulo === modalModoCapitulo)

        // Tramos únicos: misma lógica que pptoConstruirTramosUnicos / botón Tramos
        const tramosUnicos = pptoConstruirTramosUnicos(capRegs)

        // Calcular estrellas por tramo
        const calcEstrella = (regs) => {
          if (!regs.length) return 'vacia'
          const estados = regs.map(r => r.revisado || 'No Revisado')
          if (estados.some(e => e === 'No Revisado')) return 'vacia'
          if (estados.some(e => e === 'Rechazado')) return 'roja'
          if (estados.some(e => e === 'Pendiente' || e === 'Verificar Campo')) return 'amarilla'
          return 'verde'
        }
        const colorEstrella = (e) => e === 'verde' ? '#16A34A' : e === 'amarilla' ? '#D97706' : e === 'roja' ? '#EF4444' : t.border
        const iconEstrella  = (e) => e === 'vacia' ? '☆' : '★'

        // Registros del tramo seleccionado
        const regsNodoIni = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_inicio && r.no_final === tramoSelec.no_inicio) : []
        const regsNodoFin = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_final  && r.no_final === tramoSelec.no_final)  : []
        const regsTramo   = tramoSelec ? pptoFilasDeTramo(capRegs, tramoSelec) : []

        const estIni   = tramoSelec ? calcEstrella(regsNodoIni) : 'vacia'
        const estFin   = tramoSelec ? calcEstrella(regsNodoFin) : 'vacia'
        const estTramo = tramoSelec ? calcEstrella(regsTramo)   : 'vacia'

        const tramoIdxActual = tramoSelec
          ? tramosUnicos.findIndex(
              (tr) => tr.no_inicio === tramoSelec.no_inicio && tr.no_final === tramoSelec.no_final,
            )
          : -1
        const tramoNavBtn = (disabled) => ({
          background: disabled ? t.bg : t.bgCard,
          border: `1px solid ${disabled ? t.border : t.primary + '55'}`,
          borderRadius: '8px',
          padding: '5px 12px',
          fontSize: 'var(--cc-sm)',
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          color: disabled ? t.textMuted : t.primary,
          opacity: disabled ? 0.45 : 1,
          transition: 'opacity .15s, border-color .15s',
          whiteSpace: 'nowrap',
        })
        const irTramoRelativo = (delta) => {
          if (tramoIdxActual < 0) return
          const dest = tramosUnicos[tramoIdxActual + delta]
          if (!dest) return
          setModoSeleccionClon(false)
          setClonBase(null)
          setTramoSelec(dest)
        }

        const TAB_LABELS = ['📋 Info Tramo', '🔵 Nodo Inicio', '🔴 Nodo Fin', '📏 Tramo']

        // Renderiza filas de ítems con semáforo
        const FilaItem = ({ r }) => {
          const est = r.revisado || 'No Revisado'
          const clr = estadoColor(est)
          return (
            <div onClick={() => { navegarRegistroEnPlano(r) }}
              style={{ display:'flex', gap:'8px', alignItems:'center', padding:'8px 10px',
                borderRadius:'8px', cursor:'pointer', background:t.bg, marginBottom:'6px',
                border:`1px solid ${t.border}` }}>
              <div style={{ minWidth: '100px', maxWidth: '160px', fontSize: 'var(--cc-sm)', color: t.text, fontWeight: '600', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.id_pol || r.pk_id || '')}>
                {r.id_pol || r.pk_id || '—'}
              </div>
              <div style={{ flex:2, fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{r.item}</div>
              <div style={{ flex:3, fontSize:'var(--cc-sm)', color:t.textMuted, lineHeight: 1.4 }}>{r.descripcion}</div>
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {[r.area_long_nod, r.ancho, r.espesor].filter(Boolean).join(' × ')}
              </div>
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:2}) : '—'}
              </div>
              {nivelInfo.verValoresEconomicos && (
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {r.vlr_unitario != null ? `$${Number(r.vlr_unitario).toLocaleString('es-CO')}` : '—'}
              </div>
              )}
              {nivelInfo.verValoresEconomicos && (
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {r.costo_directo != null ? `$${Number(r.costo_directo).toLocaleString('es-CO')}` : '—'}
              </div>
              )}
              <div style={{ display:'flex', gap:'4px' }}>
                <PptoValidacionIcon
                  eje="interventoria"
                  estado={pptoEstadoInterventoriaDisplay(r)}
                  esSellado={esSellado(r)}
                  t={t}
                  compact
                  tituloBloqueo={
                    puedeValidarInterventoriaUI && !preIntervLiberadoParaInterventoria(r) && !esDevPpto
                      ? 'Requiere depuración aprobada'
                      : ''
                  }
                  puedeSeleccionar={() => puedeValidarInterventoriaRegistro(r)}
                  onSeleccionar={(valor) => cambiarEstadoDirecto(r.id, valor)}
                />
              </div>
            </div>
          )
        }

        const TabVacia = ({ msg }) => (
          <div style={{ padding:'30px', textAlign:'center', color:t.textMuted, fontSize:'var(--cc-label)', fontStyle:'italic' }}>{msg}</div>
        )

        /** Inputs de dimensiones: ancho ~2× (antes 52px) y fuente con escala del header (Pequeña/Mediana/Grande). */
        const tramoDimInput = {
          width: '100px',
          minWidth: '88px',
          maxWidth: '128px',
          fontSize: 'var(--cc-input)',
          lineHeight: 1.35,
          background: t.inputBg,
          border: `1px solid ${t.border}`,
          borderRadius: '6px',
          padding: '5px 8px',
          color: t.text,
          textAlign: 'right',
          boxSizing: 'border-box',
        }

        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:3500,display:'flex',alignItems:'center',justifyContent:'center' }}
            onClick={(e) => { if (modalComentario) return; setModalModoCapitulo(null); setTramoSelec(null); setModoSeleccionClon(false); setClonBase(null) }}>
            <div className="cc-revisor-tramos" style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px',
              padding:'24px', width: tramoSelec ? 'min(1200px, 98vw)' : 'min(600px, 96vw)', maxWidth:'98vw',
              maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontSize: 'var(--cc-body)', lineHeight: 1.45,
              transition:'width .25s' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <div>
                  <div style={{ fontSize:'var(--cc-md)', fontWeight:'800', color:t.primary }}>
                    {tramoSelec ? `🔎 ${tramoSelec.label}` : '📂 Abrir capítulo'}
                  </div>
                  <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted, marginTop:'2px' }}>{modalModoCapitulo}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  <button
                    type="button"
                    disabled={refrescandoRevisorTramos}
                    onClick={() => { void refrescarDatosRevisorTramosModal() }}
                    title="Vuelve a cargar los registros del capítulo desde el servidor (mantiene tramo y pestaña)"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: refrescandoRevisorTramos ? 'wait' : 'pointer',
                      opacity: refrescandoRevisorTramos ? 0.55 : 0.92,
                    }}
                  >
                    {refrescandoRevisorTramos ? '…' : '⟳ Actualizar'}
                  </button>
                  {puedeEditar && puedeEditarDimensiones && (
                    <button onClick={() => { setModoSeleccionClon(true); setClonBase(null) }}
                      style={{ background:t.primary+'22', color:t.primary, border:`1px solid ${t.primary}`, borderRadius:'8px', padding:'5px 12px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer' }}>
                      ＋ Agregar cantidad
                    </button>
                  )}
                  <button onClick={() => { setModalModoCapitulo(null); setTramoSelec(null); setModoSeleccionClon(false); setClonBase(null) }}
                    style={{ background:'transparent', border:'none', fontSize:'var(--cc-lg)', cursor:'pointer', color:t.textMuted }}>✕</button>
                </div>
              </div>

              {/* Si no hay tramo seleccionado → mostrar dropdown */}
              {!tramoSelec && (<>
                <div style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.textMuted, marginBottom:'6px', letterSpacing:'0.5px' }}>
                    ¿CÓMO QUIERES REVISAR ESTE CAPÍTULO?
                  </div>
                  <select value={modoCapSeleccion}
                    onChange={async e => {
                      const val = e.target.value
                      setModoCapSeleccion(val)
                      if (val === 'tramos' && modalModoCapitulo) {
                        await cargarCapituloData(modalModoCapitulo)
                        const data = await fetchComentariosValidacionPorCapitulo(modalModoCapitulo)
                        setComentariosTramo(data)
                      }
                    }}
                    style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`,
                      borderRadius:'9px', padding:'10px 14px', color:t.text, fontSize:'var(--cc-label)', cursor:'pointer' }}>
                    <option value=''>— Selecciona una opción —</option>
                    <option value='todos'>Ver por ítem</option>
                    <option value='tramos'>Revisar por tramo</option>
                  </select>
                </div>

                {/* Botón Todos */}
                {modoCapSeleccion === 'todos' && (
                  <button onClick={async () => {
                    const cap = modalModoCapitulo
                    setModalModoCapitulo(null)
                    await cargarItemsCapitulo(cap)
                    setDrill([{ campo: 'capitulo', valor: cap }])
                  }}
                    style={{ width:'100%', background:t.primary, color:'#fff', border:'none',
                      borderRadius:'9px', padding:'11px', fontSize:'var(--cc-label)', fontWeight:'700', cursor:'pointer', marginBottom:'8px' }}>
                    Ver ítems →
                  </button>
                )}

                {/* Lista de tramos */}
                {modoCapSeleccion === 'tramos' && (
                  <div>
                    {/* Header con contador */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                      <div style={{ fontSize:'var(--cc-sm)', fontWeight:'800', color:t.text, letterSpacing:'0.3px' }}>
                        TRAMOS DISPONIBLES
                        <span style={{ marginLeft:'8px', background:t.primary+'22', color:t.primary, borderRadius:'20px', padding:'2px 10px', fontSize:'var(--cc-sm)', fontWeight:'700' }}>
                          {tramosUnicos.length}
                        </span>
                      </div>
                      {filtroEstrella && (
                        <button onClick={() => setFiltroEstrella('')}
                          style={{ background:'transparent', border:'none', fontSize:'var(--cc-sm)', color:t.textMuted, cursor:'pointer', textDecoration:'underline' }}>
                          ✕ Limpiar filtro
                        </button>
                      )}
                    </div>

                    {/* Buscador */}
                    <div style={{ position:'relative', marginBottom:'10px' }}>
                      <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'var(--cc-label)', pointerEvents:'none' }}>🔍</span>
                      <input
                        value={busquedaTramo}
                        onChange={e => setBusquedaTramo(e.target.value)}
                        placeholder="Buscar por nodo inicio o fin..."
                        style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${busquedaTramo ? t.primary : t.border}`,
                          borderRadius:'10px', padding:'9px 12px 9px 32px', color:t.text, fontSize:'var(--cc-sm)',
                          boxSizing:'border-box', outline:'none', transition:'border-color .15s' }}
                      />
                    </div>

                    {/* Filtros de estado */}
                    <div style={{ background:t.bg, borderRadius:'10px', padding:'10px 12px', marginBottom:'10px' }}>
                      <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'8px' }}>
                        FILTRAR POR ESTADO DE REVISIÓN
                      </div>
                      {/* Selector de qué revisar */}
                      <div style={{ display:'flex', gap:'4px', marginBottom:'8px' }}>
                        {[['ini','Nodo Ini'],['fin','Nodo Fin'],['tramo','Tramo']].map(([k,l]) => (
                          <button key={k} onClick={() => setFiltroEstrellaTipo(k)}
                            style={{ flex:1, padding:'5px', fontSize:'var(--cc-caption)', fontWeight:'700', cursor:'pointer', borderRadius:'7px',
                              background: filtroEstrellaTipo === k ? t.primary : t.bgCard,
                              color: filtroEstrellaTipo === k ? '#fff' : t.textMuted,
                              border: `1.5px solid ${filtroEstrellaTipo === k ? t.primary : t.border}`,
                              transition:'all .15s' }}>
                            {l}
                          </button>
                        ))}
                      </div>
                      {/* Botones de estado */}
                      <div style={{ display:'flex', gap:'4px' }}>
                        {[
                          { key:'vacia',    label:'⬜ Sin revisar', bg:'#F1F5F9', color:'#64748B' },
                          { key:'roja',     label:'🔴 Rechazado',  bg:'#FEE2E2', color:'#EF4444' },
                          { key:'amarilla', label:'🟡 Pendiente',  bg:'#FEF9C3', color:'#D97706' },
                          { key:'verde',    label:'🟢 Aprobado',   bg:'#DCFCE7', color:'#16A34A' },
                        ].map(({ key, label, bg, color }) => (
                          <button key={key} onClick={() => setFiltroEstrella(prev => prev === key ? '' : key)}
                            style={{ flex:1, padding:'5px 4px', fontSize:'var(--cc-caption)', fontWeight:'700', cursor:'pointer', borderRadius:'7px',
                              background: filtroEstrella === key ? bg : t.bgCard,
                              color: filtroEstrella === key ? color : t.textMuted,
                              border: `1.5px solid ${filtroEstrella === key ? color : t.border}`,
                              transition:'all .15s' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tramosUnicos.length === 0 && (
                      <div style={{ padding:'20px', textAlign:'center', color:t.textMuted, fontSize:'var(--cc-sm)', fontStyle:'italic' }}>
                        No hay tramos definidos en este capítulo
                      </div>
                    )}

                    {/* Lista filtrada */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px', maxHeight:'260px', overflowY:'auto' }}>
                      {tramosUnicos.filter(tr => {
                        const busq = busquedaTramo.trim().toLowerCase()
                        if (busq && !tr.no_inicio?.toLowerCase().includes(busq) && !tr.no_final?.toLowerCase().includes(busq)) return false
                        if (!filtroEstrella) return true
                        const rIni = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_inicio)
                        const rFin = capRegs.filter(r => r.no_inicio === tr.no_final  && r.no_final === tr.no_final)
                        const rTr  = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_final)
                        const eMap = { ini: calcEstrella(rIni), fin: calcEstrella(rFin), tramo: calcEstrella(rTr) }
                        return eMap[filtroEstrellaTipo] === filtroEstrella
                      }).map((tr, i) => {
                        const rIni = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_inicio)
                        const rFin = capRegs.filter(r => r.no_inicio === tr.no_final  && r.no_final === tr.no_final)
                        const rTr  = capRegs.filter(r => r.no_inicio === tr.no_inicio && r.no_final === tr.no_final)
                        const eI = calcEstrella(rIni), eF = calcEstrella(rFin), eT = calcEstrella(rTr)
                        return (
                          <div key={i} onClick={() => { setTramoSelec(tr); setTabTramo(0); setBusquedaTramo('') }}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                              padding:'10px 14px', borderRadius:'10px', cursor:'pointer',
                              background:t.bg, border:`1.5px solid ${t.border}`, transition:'all .15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = t.primary; e.currentTarget.style.background = t.primary+'0D' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.bg }}>
                            <div style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.text }}>{tr.label}</div>
                            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                              {[
                                { e: eI, label: 'NI' },
                                { e: eF, label: 'NF' },
                                { e: eT, label: 'TR' },
                              ].map(({ e, label }, idx) => (
                                <div key={idx} style={{ textAlign:'center' }}>
                                  <div style={{ fontSize:'var(--cc-md)', color:colorEstrella(e), lineHeight:1 }}>{iconEstrella(e)}</div>
                                  <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', letterSpacing:'0.3px' }}>{label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>)}

              {/* Panel de 4 pestañas cuando hay tramo seleccionado */}
              {tramoSelec && (<>
                {/* Banner modo selección clon */}
                {modoSeleccionClon && (
                  <div style={{ background:t.primary+'20', border:`1px solid ${t.primary}`, borderRadius:'8px', padding:'8px 12px', marginBottom:'10px', fontSize:'var(--cc-sm)', color:t.primary, fontWeight:'700', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>🎯 Haz clic en un registro para clonar su posición</span>
                    <button onClick={() => setModoSeleccionClon(false)} style={{ background:'transparent', border:'none', cursor:'pointer', color:t.primary, fontWeight:'800', fontSize:'var(--cc-label)' }}>Cancelar</button>
                  </div>
                )}
                {/* Navegación entre tramos */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    marginBottom: '14px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setTramoSelec(null); cargarRegistros(verPapelera, true) }}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${t.border}`,
                      borderRadius: '7px',
                      padding: '5px 12px',
                      fontSize: 'var(--cc-sm)',
                      cursor: 'pointer',
                      color: t.textMuted,
                    }}
                  >
                    ← Volver a tramos
                  </button>
                  {tramosUnicos.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={tramoIdxActual <= 0}
                        onClick={() => irTramoRelativo(-1)}
                        title="Tramo anterior"
                        style={tramoNavBtn(tramoIdxActual <= 0)}
                      >
                        ‹ Anterior
                      </button>
                      <span
                        style={{
                          fontSize: 'var(--cc-caption)',
                          color: t.textMuted,
                          fontWeight: 700,
                          minWidth: '52px',
                          textAlign: 'center',
                        }}
                      >
                        {tramoIdxActual >= 0 ? `${tramoIdxActual + 1} / ${tramosUnicos.length}` : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={tramoIdxActual < 0 || tramoIdxActual >= tramosUnicos.length - 1}
                        onClick={() => irTramoRelativo(1)}
                        title="Tramo siguiente"
                        style={tramoNavBtn(tramoIdxActual < 0 || tramoIdxActual >= tramosUnicos.length - 1)}
                      >
                        Siguiente ›
                      </button>
                    </div>
                  )}
                </div>

                {/* Estrellas resumen */}
                <div style={{ display:'flex', gap:'16px', alignItems:'center', background:t.bg,
                  borderRadius:'10px', padding:'10px 16px', marginBottom:'14px' }}>
                  {[{e:estIni,l:'Nodo Inicio',sub:tramoSelec?.no_inicio},{e:estFin,l:'Nodo Fin',sub:tramoSelec?.no_final},{e:estTramo,l:'Tramo',sub:''}].map(({e,l,sub}, idx) => (
                    <div key={idx} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'var(--cc-h2)', color:colorEstrella(e) }}>{iconEstrella(e)}</div>
                      <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', letterSpacing:'0.4px' }}>{l.toUpperCase()}</div>
                      {sub && <div style={{ fontSize:'var(--cc-caption)', color:t.primary, fontWeight:'800', marginTop:'2px' }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                  {TAB_LABELS.map((label, idx) => (
                    <button key={idx} onClick={() => setTabTramo(idx)}
                      style={{ padding:'8px 16px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer',
                        background: tabTramo === idx ? t.primary : t.bg,
                        border: `1.5px solid ${tabTramo === idx ? t.primary : t.border}`,
                        color: tabTramo === idx ? '#fff' : t.textMuted,
                        borderRadius:'20px', transition:'all .15s' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* TAB 0: INFO TRAMO */}
                {tabTramo === 0 && (() => {
                  const r = regsTramo[0] || regsNodoIni[0] || regsNodoFin[0] || {}
                  const F = ({label, val}) => (
                    <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', flex:1 }}>
                      <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
                      <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{val || '—'}</div>
                    </div>
                  )
                  return (
                    <div>
                      <div style={{ textAlign:'center', fontSize:'var(--cc-lg)', fontWeight:'800', color:t.primary, marginBottom:'16px', padding:'12px', background:t.bg, borderRadius:'10px' }}>
                        {tramoSelec.label}
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="CAPÍTULO" val={modalModoCapitulo} />
                        <F label="COMPETENCIA" val={r.competencia} />
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="TRAMO" val={r.tramo} />
                        <F label="CALZADA" val={r.calzada} />
                        <F label="PK_ID" val={r.pk_id} />
                      </div>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                        <F label="ABS. INICIO" val={r.abs_inicio} />
                        <F label="ABS. FINAL" val={r.abs_final} />
                      </div>
                      <div style={{ display:'flex', gap:'8px' }}>
                        <F label="NODO INICIO" val={tramoSelec.no_inicio} />
                        <F label="NODO FIN" val={tramoSelec.no_final} />
                      </div>
                    </div>
                  )
                })()}

                {/* Helper local para tabs de tramo */}
                {[
                  { tab: 1, regs: regsNodoIni, key: 'ini', msg: 'NODO EXISTENTE SIN REPORTE DE CANTIDADES' },
                  { tab: 2, regs: regsNodoFin, key: 'fin', msg: 'NODO EXISTENTE SIN REPORTE DE CANTIDADES' },
                  { tab: 3, regs: regsTramo,   key: 'tramo', msg: 'SIN CANTIDADES REPORTADAS PARA ESTE TRAMO' },
                ].filter(t => t.tab === tabTramo).map(({ regs, key, msg }) => {
                  const selTab = selTramoTab[key]
                  const regsLibres = regs.filter(r => !esSellado(r))
                  const todosSelec = regsLibres.length > 0 && regsLibres.every(r => selTab.has(r.id))
                  const algunoSelec = regs.some(r => selTab.has(r.id))
                  const toggleTab = () => {
                    setSelTramoTab(prev => {
                      const n = new Set(prev[key])
                      if (todosSelec) regs.forEach(r => n.delete(r.id))
                      else regsLibres.forEach(r => n.add(r.id))
                      return { ...prev, [key]: n }
                    })
                  }
                  const validarTab = async (estado) => {
                    let ids = [...selTab].filter(id => {
                      const row = regs.find(x => x.id === id)
                      return row && !esSellado(row) && (esDevPpto || preIntervLiberadoParaInterventoria(row))
                    })
                    if (!ids.length) {
                      if (puedeValidarInterventoriaUI && !esDevPpto) {
                        window.alert(
                          'Ningún registro seleccionado tiene depuración contratista aprobada. Interventoría solo valida tras «Aprobado» en depuración.',
                        )
                      }
                      return
                    }
                    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
                    const comentarioData = await pedirComentario('validacion', obligatorio, ids)
                    if (comentarioData === null) return
                    const comentario = comentarioData?.mensaje || ''
                    const destinatarioId = comentarioData?.destinatarioId || null
                    const modoComentario = comentarioData?.modo || null
                    registrarUndoPresupuesto('Validación Interventoría (tramo)', ids)
                    const res = await fetch(`${pptoEp().bulkEstado}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ ids, revisado: estado })
                    })
                    if (res.ok) {
                      if (comentario.trim()) await crearComentarios(ids, 'validacion', comentario, destinatarioId, modoComentario)
                      lanzarClaraLinkEstado(ids, estado)
                      setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, ids, estado)))
                      setSelTramoTab(prev => ({ ...prev, [key]: new Set() }))
                    }
                  }
                  return (
                    <div key={key}>
                      {regs.length > 0 && (puedeValidar || puedeEliminar) && (
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'6px 10px', background:t.bg, borderRadius:'8px' }}>
                          <input type="checkbox" checked={todosSelec} onChange={toggleTab}
                            style={{ width:'14px', height:'14px', cursor:'pointer' }} />
                          <span style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.textMuted }}>
                            {todosSelec ? 'Deseleccionar todos' : `Seleccionar todos (${regs.length})`}
                          </span>
                          {algunoSelec && (
                            <div style={{ marginLeft:'auto', display:'flex', gap:'4px', flexWrap:'wrap' }}>
                              {puedeValidarInterventoriaUI && SEMAFORO.map(s => (
                                <button key={s.valor} onClick={() => validarTab(s.valor)}
                                  style={{ background:t.bgCard, border:`1.5px solid ${s.color}`, borderRadius:'6px', padding:'3px 8px', fontSize:'var(--cc-sm)', cursor:'pointer', color:s.color, fontWeight:'700' }}>
                                  {s.label} {s.valor}
                                </button>
                              ))}
                              {puedeEliminar && (
                                <button
                                  type="button"
                                  disabled={dandoDeBaja}
                                  onClick={async () => {
                                    if (dandoDeBaja) return
                                    const idsBaja = [...selTab].filter(id => {
                                      const row = regs.find(x => x.id === id)
                                      return row && !esSellado(row)
                                    })
                                    if (idsBaja.length === 0) return
                                    if (!(await validarDarDeBajaIds(idsBaja, (id) => regs.find((x) => x.id === id)))) return
                                    const comentarioData = await pedirComentario('validacion', true, idsBaja)
                                    if (comentarioData === null) return
                                    await ejecutarDarDeBajaLote(idsBaja, {
                                      comentario: comentarioData?.mensaje || '',
                                      destinatarioId: comentarioData?.destinatarioId || null,
                                      modoComentario: comentarioData?.modo || null,
                                      etiquetaComentario: '[BAJA]',
                                      resolverReg: (id) => regs.find((x) => x.id === id),
                                      alTerminarSeleccion: () => setSelTramoTab(prev => ({ ...prev, [key]: new Set() })),
                                    })
                                  }}
                                  style={{
                                    background:'#EF444418', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px',
                                    fontSize:'var(--cc-sm)', cursor: dandoDeBaja ? 'not-allowed' : 'pointer', color:'#EF4444', fontWeight:'700',
                                    opacity: dandoDeBaja ? 0.55 : 1,
                                  }}>
                                  {dandoDeBaja ? '⏳ Baja en curso…' : `🗑️ Dar de baja (${[...selTab].filter(id => regs.find(x => x.id === id) && !esSellado(regs.find(x => x.id === id))).length})`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display:'flex', gap:'8px', fontSize:'var(--cc-sm)', fontWeight:'700', color:t.textMuted, padding:'0 10px', marginBottom:'6px', letterSpacing:'0.4px' }}>
                        <span style={{ minWidth: '100px', maxWidth: '160px', flexShrink: 0 }}>ID-POL</span>
                        <span style={{ width: '80px', flexShrink: 0 }}>ÍTEM</span><span style={{ flex: 3 }}>DESCRIPCIÓN</span>
                        <span style={{ minWidth: '200px', textAlign: 'right', whiteSpace: 'nowrap' }}>DIMS</span><span style={{ flex: 1, textAlign: 'right' }}>CANT.</span>
                        <span style={{flex:1,textAlign:'right'}}>V. UNIT.</span><span style={{flex:1,textAlign:'right'}}>C. DIRECTO</span>
                        {mostrarColumnaDepuracion && <span style={{ flex:0.7, textAlign:'center' }} title="Depuración (contratista / obra)">Dep.</span>}
                        <span style={{ flex:0.7, textAlign:'center' }} title="Interventoría">Rev.</span>
                        <span style={{flex:0.5}}></span>
                      </div>
                      {regs.length === 0
                        ? <TabVacia msg={msg} />
                        : regs.map(r => (
                            <div key={r.id}
                              style={{ borderRadius:'8px', marginBottom:'6px',
                                border:`1px solid ${modoSeleccionClon ? t.primary : selTab.has(r.id) ? t.primary : t.border}`,
                                background: modoSeleccionClon ? t.primary+'10' : selTab.has(r.id) ? t.primary+'18' : t.bg }}>
                              <div onClick={() => {
                                  if (modoSeleccionClon) {
                                    setClonBase(r)
                                    setModoSeleccionClon(false)
                                    setNuevaCant({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
                                    setModalAgregarCant(true)
                                  } else {
                                    navegarRegistroEnPlano(r)
                                  }
                                }}
                                style={{ display:'flex', gap:'8px', alignItems:'center', padding:'8px 10px', cursor:'pointer' }}>
                                <input type="checkbox" checked={selTab.has(r.id)}
                                  onClick={e => e.stopPropagation()}
                                  disabled={esSellado(r)}
                                  onChange={() => {
                                    if (esSellado(r)) return
                                    setSelTramoTab(prev => {
                                      const n = new Set(prev[key])
                                      selTab.has(r.id) ? n.delete(r.id) : n.add(r.id)
                                      return { ...prev, [key]: n }
                                    })
                                  }}
                                  style={{ width:'13px', height:'13px', cursor: esSellado(r) ? 'not-allowed' : 'pointer', flexShrink:0, opacity: esSellado(r) ? 0.45 : 1 }} />
                                <div
                                  style={{ minWidth: '100px', maxWidth: '160px', flexShrink: 0, fontSize: 'var(--cc-sm)', color: t.text, fontWeight: '600', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={String(r.id_pol || r.pk_id || '')}
                                >
                                  {r.id_pol || r.pk_id || '—'}
                                </div>
                                <div style={{ width:'80px', flexShrink:0, fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{r.item}</div>
                                <div style={{ flex:3, fontSize:'var(--cc-sm)', color:t.textMuted, lineHeight: 1.4 }}>{r.descripcion}</div>
                                {/* Dims — área/long: Dev o contrato autorizado; ancho/esp: editores presupuesto */}
                                <div style={{ minWidth:'200px', flexShrink:0, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right', whiteSpace:'nowrap' }}>
                                  {puedeEditarDimensiones && !esSellado(r) && editDims[r.id] !== undefined ? (
                                    <div style={{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'flex-end' }} onClick={e => e.stopPropagation()}>
                                      {puedeEditarAreaLongNodInline() ? (
                                        <input type="number" placeholder="a/l/n" value={editDims[r.id].area_long_nod ?? ''}
                                          onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], area_long_nod: e.target.value } }))}
                                          style={tramoDimInput} />
                                      ) : aplicaReglasCadPresupuesto ? (
                                        renderDimBloqueadaCad(`a/l/n: ${r.area_long_nod ?? '—'}`, MSG_AREA_LONG_DESDE_PLANO)
                                      ) : (
                                        <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, opacity:0.95 }} title="Área/long solo Desarrollador o editor en contrato autorizado">
                                          a/l/n: {r.area_long_nod ?? '—'}
                                        </span>
                                      )}
                                      {puedeEditarAnchoEspesorInline() ? (
                                        <>
                                          <input type="number" placeholder="ancho" value={editDims[r.id].ancho ?? ''}
                                            onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], ancho: e.target.value } }))}
                                            style={tramoDimInput} />
                                          <input type="number" placeholder="esp" value={editDims[r.id].espesor ?? ''}
                                            onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], espesor: e.target.value } }))}
                                            style={tramoDimInput} />
                                        </>
                                      ) : (
                                        <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted }}>
                                          {[r.ancho, r.espesor].filter(v => v != null && v !== '').join(' × ') || '—'}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span onClick={puedeIniciarEdicionDimsInline(r) ? (e) => { e.stopPropagation(); setEditDims(p => ({ ...p, [r.id]: { area_long_nod: r.area_long_nod ?? '', ancho: r.ancho ?? '', espesor: r.espesor ?? '' } })) } : undefined}
                                      title={puedeIniciarEdicionDimsInline(r) ? 'Clic para editar dims' : undefined}
                                      style={{ cursor: puedeIniciarEdicionDimsInline(r) ? 'pointer' : 'default', textDecoration: puedeIniciarEdicionDimsInline(r) ? 'underline dotted' : 'none', whiteSpace:'nowrap' }}>
                                      {[r.area_long_nod, r.ancho, r.espesor].filter(v => v != null && v !== '').join(' × ') || '—'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                                  {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:2}) : '—'}
                                </div>
                                {nivelInfo.verValoresEconomicos && (
                                <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                                  {r.vlr_unitario != null ? `$${Number(r.vlr_unitario).toLocaleString('es-CO')}` : '—'}
                                </div>
                                )}
                                {nivelInfo.verValoresEconomicos && (
                                <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                                  {r.costo_directo != null ? `$${Number(r.costo_directo).toLocaleString('es-CO')}` : '—'}
                                </div>
                                )}
                                {mostrarColumnaDepuracion && (
                                  <div style={{ display: 'flex', justifyContent: 'center', flex: '0.7 0 72px' }} onClick={e => e.stopPropagation()}>
                                    <PptoValidacionIcon
                                      eje="depuracion"
                                      estado={pptoEstadoDepuracionDisplay(r)}
                                      esLegado={pptoEsLegadoDepuracion(r)}
                                      esSellado={esSellado(r)}
                                      t={t}
                                      compact
                                      puedeSeleccionar={(valor) => puedePrevalidarUI && !esSellado(r)}
                                      onSeleccionar={(valor) => cambiarPreIntervDirecto(r.id, valor)}
                                    />
                                  </div>
                                )}
                                <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                                  {/* Botón guardar dims */}
                                  {puedeEditarDimensiones && !esSellado(r) && editDims[r.id] !== undefined && (
                                    <button onClick={async (evt) => {
                                      evt.stopPropagation()
                                      const d = editDims[r.id]
                                      const num = (x) => {
                                        if (x === '' || x == null) return undefined
                                        const n = Number(x)
                                        return Number.isFinite(n) ? n : undefined
                                      }
                                      const pay = {}
                                      const a = num(d.area_long_nod)
                                      const w = num(d.ancho)
                                      const espN = num(d.espesor)
                                      if (puedeEditarAreaLongNodInline() && a !== undefined) pay.area_long_nod = a
                                      if (puedeEditarAnchoEspesorInline() && w !== undefined) pay.ancho = w
                                      if (puedeEditarAnchoEspesorInline() && espN !== undefined) pay.espesor = espN
                                      if (Object.keys(pay).length === 0) return
                                      // Calcular resultado localmente y aplicar de forma optimista
                                      const aF = pay.area_long_nod ?? r.area_long_nod ?? 0
                                      const wF = pay.ancho ?? r.ancho ?? 0
                                      const eF = pay.espesor ?? r.espesor ?? 0
                                      const cant = (wF || eF) ? Math.round(aF * wF * eF * 100) / 100 : Math.round(aF * 100) / 100
                                      const costo = Math.round(cant * (r.vlr_unitario || 0))
                                      const optimisticRow = { ...r, ...pay, cant_total: cant, costo_directo: costo }
                                      setRegistros(prev => prev.map(x => x.id === r.id ? optimisticRow : x))
                                      setEditDims(p => { const n = {...p}; delete n[r.id]; return n })
                                      _lastWriteAtRef.current = Date.now()
                                      const res = await fetch(`${pptoEp().item(r.id)}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify(pay)
                                      })
                                      if (res.ok) {
                                        const updated = await res.json()
                                        setRegistros(prev => prev.map(x => x.id === r.id ? updated : x))
                                      } else {
                                        // Revertir si falló
                                        setRegistros(prev => prev.map(x => x.id === r.id ? r : x))
                                        setEditDims(p => ({ ...p, [r.id]: d }))
                                      }
                                    }}
                                    style={{ background:t.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'3px 8px', fontSize:'var(--cc-sm)', cursor:'pointer', fontWeight:'700', flexShrink:0 }}>
                                      ✓
                                    </button>
                                  )}
                                  <PptoValidacionIcon
                                    eje="interventoria"
                                    estado={pptoEstadoInterventoriaDisplay(r)}
                                    esSellado={esSellado(r)}
                                    t={t}
                                    compact
                                    tituloBloqueo={
                                      puedeValidarInterventoriaUI && !preIntervLiberadoParaInterventoria(r) && !esDevPpto
                                        ? 'Requiere depuración aprobada'
                                        : ''
                                    }
                                    puedeSeleccionar={() => puedeValidarInterventoriaRegistro(r)}
                                    onSeleccionar={(valor) => cambiarEstadoDirecto(r.id, valor)}
                                  />
                                  {puedeEditar && (
                                    <button
                                      type="button"
                                      title="Editar capítulo, ítem o valor (contratista: si estaba validado por Interventoría, se pedirá motivo y el estado pasará a No Revisado)"
                                      onClick={(e) => { e.stopPropagation(); abrirDetallePptoDesdeFila(r) }}
                                      style={{
                                        marginLeft: '4px',
                                        background: t.bgCard,
                                        border: `1px solid ${t.border}`,
                                        borderRadius: '6px',
                                        padding: '2px 8px',
                                        fontSize: 'var(--cc-sm)',
                                        cursor: 'pointer',
                                        color: t.primary,
                                        fontWeight: '700',
                                        flexShrink: 0,
                                      }}
                                    >✏️</button>
                                  )}
                                </div>
                              </div>
                              {/* Comentario de validación — clic para ver hilo */}
                              {comentariosTramo[r.id] && (
                                <div onClick={() => abrirHilo(r.id, 'validacion')}
                                  style={{ padding:'6px 10px 8px 36px', fontSize:'var(--cc-sm)', color:t.textMuted,
                                    cursor:'pointer', borderTop:`1px solid ${t.border}`,
                                    background:t.bg+'80', borderRadius:'0 0 8px 8px' }}>
                                  <span style={{ fontStyle:'italic' }}>
                                    💬 {comentariosTramo[r.id].mensaje.length > 80
                                      ? comentariosTramo[r.id].mensaje.slice(0, 80) + '…'
                                      : comentariosTramo[r.id].mensaje}
                                  </span>
                                  <span style={{ marginLeft:'8px', color:t.primary, fontWeight:'600' }}>
                                    — {comentariosTramo[r.id].usuario_nombre}
                                  </span>
                                  {comentariosTramo[r.id].created_at && (
                                    <span style={{ marginLeft:'6px', color:t.textMuted, fontSize:'var(--cc-sm)' }}>
                                      {(() => { try { return new Date(comentariosTramo[r.id].created_at).toLocaleDateString('es-CO',{dateStyle:'short'}) } catch { return '' } })()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                      }
                    </div>
                  )
                })}
              </>)}
            </div>
          </div>
        )
      })()}

      {/* Modal agregar cantidad */}
      {modalAgregarCant && clonBase && (() => {
        const preciosFilt = listadoPrecios.filter(p =>
          !nuevaCant.itemBusq ||
          p.item_numero?.toLowerCase().includes(nuevaCant.itemBusq.toLowerCase()) ||
          p.descripcion?.toLowerCase().includes(nuevaCant.itemBusq.toLowerCase())
        ).slice(0, 20)
        const _area  = parseDimInputEs(nuevaCant.area_long_nod)
        const _ancho = parseDimInputEs(nuevaCant.ancho)
        const _esp   = parseDimInputEs(nuevaCant.espesor)
        const _vlrRaw = nuevaCant.itemSel?.precio_unitario
        const _vlr =
          typeof _vlrRaw === 'number' && Number.isFinite(_vlrRaw)
            ? _vlrRaw
            : parseDimInputEs(_vlrRaw) || 0
        const _cant = Number.isFinite(_area) && Number.isFinite(_ancho) && Number.isFinite(_esp)
          ? ((_ancho || _esp) ? _area * _ancho * _esp : _area)
          : NaN
        const _costo = Number.isFinite(_cant) && Number.isFinite(_vlr) ? Math.round(_cant * _vlr) : NaN
        const dimsOk = Number.isFinite(_area) && Number.isFinite(_ancho) && Number.isFinite(_esp)
        const puedeGuardar = nuevaCant.itemSel && dimsOk && _area > 0
        return (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', zIndex:4000, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => { setModalAgregarCant(false) }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'14px', padding:'22px', width:'480px', maxWidth:'96vw', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.55)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={{ fontSize:'var(--cc-label)', fontWeight:'800', color:t.primary }}>＋ Agregar cantidad</div>
                <button onClick={() => setModalAgregarCant(false)} style={{ background:'transparent', border:'none', fontSize:'var(--cc-lg)', cursor:'pointer', color:t.textMuted }}>✕</button>
              </div>

              {/* Referencia clon */}
              <div style={{ background:t.bg, borderRadius:'8px', padding:'8px 12px', marginBottom:'14px', fontSize:'var(--cc-sm)', color:t.textMuted }}>
                <span style={{ fontWeight:'700', color:t.text }}>Posición clonada: </span>
                {clonBase.no_inicio} → {clonBase.no_final}
                {clonBase.tramo ? ` · ${clonBase.tramo}` : ''}
              </div>

              {/* Búsqueda ítem */}
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'4px' }}>ÍTEM DEL LISTADO DE PRECIOS</div>
                <input value={nuevaCant.itemBusq}
                  onChange={e => setNuevaCant(p => ({ ...p, itemBusq: e.target.value, itemSel: null }))}
                  placeholder="Buscar por número o descripción..."
                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${nuevaCant.itemSel ? t.primary : t.border}`, borderRadius:'8px', padding:'8px 12px', color:t.text, fontSize:'var(--cc-sm)' }} />
                {nuevaCant.itemBusq && !nuevaCant.itemSel && (
                  <div style={{ border:`1px solid ${t.border}`, borderRadius:'8px', marginTop:'4px', maxHeight:'160px', overflowY:'auto', background:t.bgCard }}>
                    {preciosFilt.length === 0
                      ? <div style={{ padding:'10px 12px', fontSize:'var(--cc-sm)', color:t.textMuted }}>Sin resultados</div>
                      : preciosFilt.map(p => (
                        <div key={p.item_numero} onClick={() => setNuevaCant(prev => ({ ...prev, itemSel: p, itemBusq: `${p.item_numero} — ${p.descripcion}` }))}
                          style={{ padding:'8px 12px', fontSize:'var(--cc-sm)', cursor:'pointer', borderBottom:`1px solid ${t.border}` }}
                          onMouseEnter={e => e.currentTarget.style.background = t.primary+'15'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontWeight:'700', color:t.text }}>{p.item_numero}</span>
                          <span style={{ color:t.textMuted, marginLeft:'8px' }}>{p.descripcion}</span>
                          <span style={{ color:t.primary, marginLeft:'8px', fontSize:'var(--cc-caption)' }}>{p.unidad} · ${Number(p.precio_unitario || 0).toLocaleString('es-CO')}</span>
                        </div>
                      ))
                    }
                  </div>
                )}
                {nuevaCant.itemSel && (
                  <div style={{ marginTop:'6px', fontSize:'var(--cc-sm)', color:t.primary, fontWeight:'600' }}>
                    ✓ {nuevaCant.itemSel.und || nuevaCant.itemSel.unidad} · ${Number(nuevaCant.itemSel.precio_unitario || 0).toLocaleString('es-CO')}
                  </div>
                )}
              </div>

              {/* Dims — inputs en componente de módulo estable para no perder foco en cada tecla */}
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                <AgregarCantidadDimInput label="LONGITUD / ÁREA" value={nuevaCant.area_long_nod} onChange={(e) => setNuevaCant((p) => ({ ...p, area_long_nod: e.target.value }))} t={t} />
                <AgregarCantidadDimInput label="ANCHO" value={nuevaCant.ancho} onChange={(e) => setNuevaCant((p) => ({ ...p, ancho: e.target.value }))} t={t} />
                <AgregarCantidadDimInput label="ESPESOR" value={nuevaCant.espesor} onChange={(e) => setNuevaCant((p) => ({ ...p, espesor: e.target.value }))} t={t} />
              </div>

              {/* Totales calculados */}
              {nuevaCant.itemSel && dimsOk && _area > 0 && Number.isFinite(_cant) && (
                <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>CANT. CALCULADA</div>
                    <div style={{ fontSize:'var(--cc-md)', fontWeight:'800', color:t.text, marginTop:'2px' }}>{_cant.toLocaleString('es-CO', {maximumFractionDigits:2})}</div>
                  </div>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>COSTO DIRECTO</div>
                    <div style={{ fontSize:'var(--cc-md)', fontWeight:'800', color:t.primary, marginTop:'2px' }}>${Number.isFinite(_costo) ? _costo.toLocaleString('es-CO') : '—'}</div>
                  </div>
                </div>
              )}

              <button disabled={!puedeGuardar || guardandoNuevaCant}
                onClick={async () => {
                  if (!puedeGuardar) return
                  setGuardandoNuevaCant(true)
                  try {
                    const p = nuevaCant.itemSel
                    const areaN = parseDimInputEs(nuevaCant.area_long_nod)
                    const anchoN = parseDimInputEs(nuevaCant.ancho)
                    const espN = parseDimInputEs(nuevaCant.espesor)
                    const vlrP =
                      typeof p.precio_unitario === 'number' && Number.isFinite(p.precio_unitario)
                        ? p.precio_unitario
                        : parseDimInputEs(p.precio_unitario) || 0
                    const body = {
                      item:          p.item_numero,
                      descripcion:   p.descripcion,
                      und:           p.und || p.unidad,
                      vlr_unitario:  vlrP,
                      area_long_nod: Number.isFinite(areaN) ? areaN : null,
                      ancho:         Number.isFinite(anchoN) ? anchoN : null,
                      espesor:       Number.isFinite(espN) ? espN : null,
                      capitulo:      clonBase.capitulo,
                      competencia:   clonBase.competencia,
                      calzada:       clonBase.calzada,
                      tramo:         clonBase.tramo,
                      abs_inicio:    clonBase.abs_inicio,
                      abs_final:     clonBase.abs_final,
                      no_inicio:     clonBase.no_inicio,
                      no_final:      clonBase.no_final,
                      tipo_ejecucion: clonBase.tipo_ejecucion,
                      tipo_entidad:  clonBase.tipo_entidad,
                      id_pol_base:   clonBase.id_pol,
                      layer_ent:     clonBase.layer_ent,
                      layer_txt:     clonBase.layer_txt,
                      x_label:       clonBase.x_label,
                      y_label:       clonBase.y_label,
                    }
                    const ep = pptoEp()
                    const res = ep.mode === 'version'
                      ? await fetch(`${ep.bulk}?mode=append`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify([{
                            ...body,
                            contrato_id: contratoId,
                            tipo_ejecucion: body.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT,
                          }]),
                        })
                      : await fetch(`${API}/presupuesto/${contratoId}/agregar-cantidad`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify(body),
                        })
                    if (res.ok) {
                      if (ep.mode === 'version') {
                        await res.json()
                        await recargarCapActualRef.current?.(true)
                      } else {
                        const newRow = await res.json()
                        setRegistros(prev => [...prev, newRow])
                      }
                      setModalAgregarCant(false)
                      setClonBase(null)
                      setNuevaCant({ itemBusq:'', itemSel:null, area_long_nod:'', ancho:'', espesor:'' })
                    } else {
                      let msg = `No se pudo agregar la cantidad (${res.status}).`
                      try {
                        const j = await res.json()
                        if (typeof j?.detail === 'string') msg = j.detail
                        else if (Array.isArray(j?.detail)) {
                          msg = j.detail.map((e) => (e.msg ? `${e.loc?.join('.')}: ${e.msg}` : JSON.stringify(e))).join('\n')
                        }
                      } catch (_) {}
                      alert(msg)
                    }
                  } finally {
                    setGuardandoNuevaCant(false)
                  }
                }}
                style={{ width:'100%', background: puedeGuardar ? t.primary : t.border, color:'#fff', border:'none', borderRadius:'9px', padding:'11px', fontSize:'var(--cc-label)', fontWeight:'700', cursor: puedeGuardar ? 'pointer' : 'default', opacity: guardandoNuevaCant ? 0.7 : 1 }}>
                {guardandoNuevaCant ? 'Guardando...' : '＋ Agregar cantidad'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Modal detalle registro presupuesto */}
      {modalDetallePpto && (
        <div
          className="cc-ppto-modal-overlay"
          style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:'12px' }}
          onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }}>
          <div
            className="cc-ppto-modal-sheet cc-ppto-detalle-sheet"
            style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'min(1040px, 100%)',maxWidth:'100%',maxHeight:'min(80vh, 700px)',overflowY:'auto',WebkitOverflowScrolling:'touch',boxShadow:'0 20px 60px rgba(0,0,0,0.4)',display:'flex',flexDirection:'column',boxSizing:'border-box' }}
            onClick={e => e.stopPropagation()}>
            <div className="cc-ppto-detalle-header" style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px', gap:'10px', flexWrap:'wrap', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize:'var(--cc-md)',fontWeight:'800',color:t.primary }}>📋 Detalle del Registro</div>
                {(() => {
                  const r0 = modalDetallePpto
                  if (!r0) return null
                  const puedePanel = (puedeEditar || puedeEliminar) && puedeEditarFilaPptoNoSelladoOReabrir(r0)
                  if (!puedePanel || modalDetallePptoEditable) return null
                  return (
                    <button
                      type="button"
                      onClick={() => setModalDetallePptoEditable(true)}
                      style={{
                        background: t.primary,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: 'var(--cc-sm)',
                        fontWeight: '700',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        minHeight: 44,
                      }}
                    >✏️ Editar</button>
                  )
                })()}
              </div>
              <button
                type="button"
                aria-label="Cerrar detalle"
                onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }}
                style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, width: 44, height: 44, fontSize:'var(--cc-lg)',cursor:'pointer',color:t.text, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
              >✕</button>
            </div>
            <div className="cc-ppto-modal-body" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
            {(() => {
              const r = modalDetallePpto
              const F = ({label, val, flex=1}) => (
                <div style={{ flex, minWidth:0 }}>
                  <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>{label}</div>
                  <div style={{ fontSize:'var(--cc-sm)',color:t.text,fontWeight:'500',marginTop:'1px',wordBreak:'break-word',overflowWrap:'anywhere' }}>{val ?? '—'}</div>
                </div>
              )
              const Row = ({children}) => (
                <div className="cc-ppto-detalle-row" style={{ display:'flex',gap:'12px',background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px',flexWrap:'wrap' }}>{children}</div>
              )
              const BigF = ({label, val}) => (
                <div style={{ background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>
                  <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px',marginBottom:'3px' }}>{label}</div>
                  <div style={{ fontSize:'var(--cc-sm)',color:t.text,lineHeight:1.5 }}>{val ?? '—'}</div>
                </div>
              )
              const fmtFechaHoraRecalculo = (iso) => {
                if (!iso) return '—'
                const d = new Date(iso)
                if (Number.isNaN(d.getTime())) return String(iso)
                return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
              }
              return (
                <>
                  {esSellado(r) && !puedeReabrirTrasAprob && (
                    <div style={{ background:'rgba(22,101,52,0.12)', border:`1px solid rgba(22,101,52,0.35)`, borderRadius:'8px', padding:'10px 12px', marginBottom:'12px', fontSize:'var(--cc-sm)', color:'#166534', fontWeight:'600' }}>
                      🔒 Registro sellado — aprobado por Interventoría. No admite cambios de cantidades ni de estado.
                    </div>
                  )}
                  {esSellado(r) && puedeReabrirTrasAprob && (
                    <div style={{ background:'rgba(14,165,233,0.12)', border:`1px solid rgba(14,165,233,0.4)`, borderRadius:'8px', padding:'10px 12px', marginBottom:'12px', fontSize:'var(--cc-sm)', color:'#0369A1', fontWeight:'600' }}>
                      🔓 Puede editar este registro sellado: al guardar se pedirá destinatario y motivo (mín. 15 caracteres), se anulará el sellado y el estado de Interventoría volverá a «No Revisado».
                    </div>
                  )}
                  <div className="cc-ppto-detalle-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', alignItems:'start' }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px', minWidth:0 }}>
                      <Row>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>ID_POL</div>
                          <div style={{ fontSize:'var(--cc-sm)',color:t.text,fontWeight:'500',marginTop:'1px',wordBreak:'break-word',overflowWrap:'anywhere' }}>
                            {r.id_pol || r.pk_id || '—'}
                          </div>
                          <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px',marginTop:'4px' }}>REG. ID</div>
                          <div style={{ fontSize:'var(--cc-sm)',color:t.text,fontWeight:'500',marginTop:'1px' }}>{r.id ?? '—'}</div>
                        </div>
                        <F label="CAPÍTULO" val={r.capitulo}/>
                        <F label="ÍTEM" val={r.item} flex={0.5}/>
                      </Row>
                      <BigF label="DESCRIPCIÓN" val={r.descripcion}/>
                      <BigF label="OBSERVACIÓN" val={textoObservacionRegistro(r)}/>
                      <Row><F label="UNIDAD" val={r.und} flex={0.5}/><F label="REVISADO" val={r.revisado||'No Revisado'}/><F label="TIPO EJECUCIÓN" val={r.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT}/></Row>
                      {mostrarColumnaDepuracion && (
                        <Row>
                          <F label="DEPURACIÓN (COSTOS / OBRA)" val={r.pre_interv_estado == null || r.pre_interv_estado === '' ? '— (legado)' : r.pre_interv_estado} flex={1}/>
                          {r.pre_interv_por && <F label="POR" val={r.pre_interv_por} flex={1}/>}
                        </Row>
                      )}
                      <Row><F label="NODO INICIO" val={r.no_inicio}/><F label="NODO FINAL" val={r.no_final}/></Row>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px', minWidth:0 }}>
                      <Row><F label="ABS. INICIO" val={r.abs_inicio}/><F label="ABS. FINAL" val={r.abs_final}/></Row>
                      <Row>
                        <F label="ÁREA/LONG" val={fmtN(r.area_long_nod)} flex={0.6}/>
                        <F label="ANCHO" val={fmtN(r.ancho)} flex={0.6}/>
                        <F label="ESPESOR" val={fmtN(r.espesor)} flex={0.6}/>
                        <F label="CANT. TOTAL" val={fmtN(r.cant_total)} flex={0.6}/>
                      </Row>
                      {nivelInfo.verValoresEconomicos && (
                        <Row>
                          <F label="VLR. UNITARIO" val={fmt(r.vlr_unitario)}/>
                          <F label="COSTO DIRECTO" val={fmt(r.costo_directo)}/>
                        </Row>
                      )}
                      <div style={{ display:'flex', gap:'12px', marginBottom:'5px', flexWrap:'wrap' }}>
                        <div style={{ flex:'1 1 140px', minWidth:0, background:t.bg, borderRadius:'6px', padding:'7px 10px' }} title={r.calculo_por || ''}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.6px' }}>CÁLCULO (usuario)</div>
                          <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'500', marginTop:'1px', lineHeight:1.35, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{r.calculo_por ?? '—'}</div>
                        </div>
                        <div style={{ flex:'1 1 140px', minWidth:0, background:t.bg, borderRadius:'6px', padding:'7px 10px' }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.6px' }}>CÁLCULO (fecha y hora)</div>
                          <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'500', marginTop:'1px' }}>{fmtFechaHoraRecalculo(r.calculo_en)}</div>
                        </div>
                      </div>
                      <Row><F label="TRAMO" val={r.tramo}/><F label="INFRAESTRUCTURA" val={r.infraestructura}/><F label="CALZADA" val={r.calzada}/><F label="PK" val={r.pk_id} flex={0.5}/></Row>
                      <BigF
                        label="OBSERVACIÓN"
                        val={r.observacion != null && String(r.observacion).trim() ? String(r.observacion).trim() : null}
                      />
                    </div>
                  </div>
                  {/* Acciones desde buzón */}
                  {modalDetallePptoEditable && (puedeEditar || puedeEliminar) && (!esSellado(r) || puedeReabrirTrasAprob) && (
                    <div className="cc-ppto-detalle-acciones" style={{ borderTop:`1px solid ${t.border}`, marginTop:'14px', paddingTop:'14px' }}>
                      <div className="cc-ppto-detalle-acciones-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', alignItems:'stretch' }}>
                      {/* ── Editar dimensiones — ancho/espesor siempre con permiso; área/long solo sin CAD o contrato autorizado ── */}
                      {puedeEditarDimensiones && !esSellado(r) && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', minWidth:0 }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#F59E0B', letterSpacing:'0.5px', marginBottom:'8px' }}>📐 EDITAR DIMENSIONES</div>
                          <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, marginBottom:'10px', lineHeight:1.45 }}>
                            Ajuste <strong>ancho</strong> y <strong>espesor</strong>; al guardar se <strong>recalculan cantidad total y costo directo</strong> con el valor unitario del registro (sin requerir plano CAD).
                            {' '}Al pulsar guardar se abrirá una ventana para la <strong>justificación del cambio</strong> (obligatoria).
                            {puedeEditarAreaLongNodInline() && (
                              <span>
                                {' '}
                                También puede editar <strong>área/long/nod</strong> y los <strong>nodos inicio / final</strong> (Desarrollador o editor en contrato autorizado).
                              </span>
                            )}
                            {aplicaReglasCadPresupuesto && !puedeEditarAreaLongNodInline() && (
                              <span> El campo <strong>área/long/nod</strong> debe modificarse desde ClaraLink/DWG en este contrato.</span>
                            )}
                          </div>
                          <div className="cc-ppto-detalle-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom: puedeEditarAreaLongNodInline() ? '10px' : '8px' }}>
                            <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                              <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ANCHO</span>
                              <input type="number" step="any" value={popupDims.ancho}
                                onChange={e => setPopupDims(d => ({...d, ancho: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', minHeight: 44 }} />
                            </label>
                            <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                              <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ESPESOR</span>
                              <input type="number" step="any" value={popupDims.espesor}
                                onChange={e => setPopupDims(d => ({...d, espesor: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', minHeight: 44 }} />
                            </label>
                          </div>
                          {puedeEditarAreaLongNodInline() && (
                            <div className="cc-ppto-detalle-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'8px' }}>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ÁREA / LONG / NOD</span>
                                <input type="number" step="any" value={popupDims.area_long_nod}
                                  onChange={e => setPopupDims(d => ({...d, area_long_nod: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', minHeight: 44 }} />
                              </label>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>NODO INICIO</span>
                                <input type="text" value={popupDims.no_inicio}
                                  onChange={e => setPopupDims(d => ({...d, no_inicio: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', minHeight: 44 }} />
                              </label>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>NODO FINAL</span>
                                <input type="text" value={popupDims.no_final}
                                  onChange={e => setPopupDims(d => ({...d, no_final: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', minHeight: 44 }} />
                              </label>
                            </div>
                          )}
                          <button disabled={popupGuardando} onClick={async () => {
                            setPopupMsg('')
                            const parseDim = (x) => {
                              const n = parseFloat(String(x ?? '').replace(',', '.'))
                              return Number.isFinite(n) ? n : NaN
                            }
                            const pAncho = parseDim(popupDims.ancho)
                            const pEsp = parseDim(popupDims.espesor)
                            const pArea = puedeEditarAreaLongNodInline() ? parseDim(popupDims.area_long_nod) : parseDim(r.area_long_nod)
                            if (![pArea, pAncho, pEsp].every(Number.isFinite)) {
                              window.alert('Indique valores numéricos válidos en área/longitud, ancho y espesor.')
                              return
                            }
                            const area = pArea
                            const ancho = pAncho
                            const esp = pEsp
                            const cant = (ancho > 0 || esp > 0) ? Math.round(area * ancho * esp * 100) / 100 : Math.round(area * 100) / 100
                            const costo = Math.round(cant * (r.vlr_unitario || 0))
                            const body = {
                              ancho,
                              espesor: esp,
                              cant_total: cant,
                              costo_directo: costo,
                            }
                            if (puedeEditarAreaLongNodInline()) {
                              body.area_long_nod = area
                              body.no_inicio = String(popupDims.no_inicio ?? '').trim() || null
                              body.no_final = String(popupDims.no_final ?? '').trim() || null
                            }
                            const justDims = await pedirJustificacionEdicionDetalle(r, body, 'dims')
                            if (!justDims.ok) return
                            setPopupGuardando(true)
                            const res = await fetch(`${pptoEp().item(r.id)}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const d = await res.json()
                              if (justDims.comentarioTrazabilidad) {
                                const c = justDims.comentarioTrazabilidad
                                await crearComentarios([r.id], c.tipo, c.mensaje, c.destinatarioId, c.modo || null)
                              }
                              if (d && d.id) {
                                setModalDetallePpto(d)
                                setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(d))
                                setRegistros(prev => prev.map(x => x.id === d.id ? d : x))
                                setPopupDims({
                                  ancho: d.ancho ?? '',
                                  espesor: d.espesor ?? '',
                                  area_long_nod: d.area_long_nod ?? '',
                                  no_inicio: d.no_inicio ?? '',
                                  no_final: d.no_final ?? '',
                                })
                              }
                              _lastWriteAtRef.current = Date.now()
                              setPopupMsg('✅ Dimensiones actualizadas')
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                            } else {
                              const msg = await leerDetalleErrorRes(res)
                              setPopupMsg(`❌ ${msg}`)
                            }
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#F59E0B', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', opacity: popupGuardando ? 0.6 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Recalcular y guardar'}
                          </button>
                        </div>
                      )}

                      {/* ── Corregir tipo de ejecución (Presupuesto de Obra / Obra Ejecutada) ── */}
                      {puedeEditar && !esSellado(r) && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', minWidth:0 }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#7C3AED', letterSpacing:'0.5px', marginBottom:'8px' }}>↔ TIPO DE EJECUCIÓN</div>
                          <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, marginBottom:'8px', lineHeight:1.45 }}>
                            Corrija si el registro quedó mal clasificado entre presupuesto de obra y obra ejecutada.
                          </div>
                          <select value={popupTipoEjecucion}
                            onChange={e => setPopupTipoEjecucion(e.target.value)}
                            style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box', marginBottom:'8px' }}>
                            <option value={PPTO_TIPO_EJECUCION_DEFAULT}>{PPTO_TIPO_EJECUCION_DEFAULT}</option>
                            <option value={PPTO_TIPO_EJECUCION_OBRA}>{PPTO_TIPO_EJECUCION_OBRA}</option>
                          </select>
                          <button disabled={popupGuardando || popupTipoEjecucion === (r.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT)} onClick={async () => {
                            setPopupMsg('')
                            const body = { tipo_ejecucion: popupTipoEjecucion }
                            const justTipo = await pedirJustificacionEdicionDetalle(r, body, 'item_capitulo')
                            if (!justTipo.ok) return
                            setPopupGuardando(true)
                            const res = await fetch(`${pptoEp().item(r.id)}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body),
                            })
                            if (res.ok) {
                              if (justTipo.comentarioTrazabilidad) {
                                const c = justTipo.comentarioTrazabilidad
                                await crearComentarios([r.id], c.tipo, c.mensaje, c.destinatarioId, c.modo || null)
                              }
                              const d = await res.json()
                              const nuevoTipo = d?.tipo_ejecucion || popupTipoEjecucion
                              const vistaTipo = fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT
                              if (nuevoTipo !== vistaTipo) {
                                setRegistros((prev) => prev.filter((x) => x.id !== r.id))
                                setModalDetallePpto(null)
                                setAvisoSistema({
                                  titulo: 'Tipo de ejecución',
                                  mensaje: `Tipo de ejecución actualizado a «${nuevoTipo}». El registro deja de mostrarse en la vista «${vistaTipo}»; use el toggle Presupuesto de Obra / Obra Ejecutada para verlo.`,
                                  tipo: 'info',
                                })
                              } else if (d?.id) {
                                setModalDetallePpto(d)
                                setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(d))
                                setRegistros((prev) => prev.map((x) => (x.id === d.id ? d : x)))
                                setPopupTipoEjecucion(d.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT)
                                setPopupMsg('✅ Tipo de ejecución actualizado')
                              }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                            } else {
                              setModalDetallePpto(r)
                              setRegistros(prev => prev.map(x => x.id === r.id ? r : x))
                              setPopupTipoEjecucion(r.tipo_ejecucion || PPTO_TIPO_EJECUCION_DEFAULT)
                              const msg = await leerDetalleErrorRes(res, 'Error al guardar tipo de ejecución')
                              setPopupMsg(`❌ ${msg}`)
                            }
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#7C3AED', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', opacity: popupGuardando ? 0.6 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Guardar tipo'}
                          </button>
                        </div>
                      )}

                      {/* ── Cambiar capítulo / ítem ── */}
                      {puedeEditar && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', minWidth:0 }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#0077B6', letterSpacing:'0.5px', marginBottom:'8px' }}>🔄 CAMBIAR CAPÍTULO / ÍTEM</div>
                          <div style={{ marginBottom:'8px' }}>
                            <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>CAPÍTULO</div>
                            <select value={popupCap}
                              onChange={e => { setPopupCap(e.target.value); setPopupItem(''); setPopupItemBusq('') }}
                              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }}>
                              <option value="">— Selecciona capítulo —</option>
                              {capitulosListado.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div style={{ marginBottom:'8px', position:'relative' }}>
                            <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ÍTEM</div>
                            <input value={popupItemBusq} disabled={!popupCap}
                              onChange={e => { setPopupItemBusq(e.target.value); setPopupItemOpen(true); setPopupItem('') }}
                              placeholder={popupCap ? 'Buscar ítem...' : 'Primero selecciona capítulo'}
                              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${popupItem ? t.primary : t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            {popupItemOpen && popupCap && (
                              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'6px', maxHeight:'160px', overflowY:'auto', zIndex:100, boxShadow:'0 4px 16px rgba(0,0,0,0.2)' }}>
                                {listadoPrecios
                                  .filter(p => p.capitulo === popupCap && (!popupItemBusq || `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(popupItemBusq.toLowerCase())))
                                  .slice(0, 20)
                                  .map(p => (
                                    <div key={p.item_numero} onClick={() => { setPopupItem(p.item_numero); setPopupItemBusq(`${p.item_numero} · ${p.descripcion}`); setPopupItemOpen(false) }}
                                      style={{ padding:'6px 10px', fontSize:'var(--cc-sm)', cursor:'pointer', borderBottom:`1px solid ${t.border}44` }}
                                      onMouseEnter={e => e.currentTarget.style.background=t.bg}
                                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                      <strong>{p.item_numero}</strong> — {p.descripcion}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          <button disabled={popupGuardando || (!popupCap && !popupItem)} onClick={async () => {
                            setPopupMsg('')
                            let motivoReap = null
                            let destinatarioReap = null
                            if (esSellado(r) && puedeReabrirTrasAprob) {
                              const com = await pedirComentario('reapertura', true, [r.id])
                              if (com == null) { return }
                              motivoReap = String(com.mensaje || '').trim()
                              destinatarioReap = com.destinatarioId ? parseInt(com.destinatarioId, 10) : null
                              if (motivoReap.length < MIN_JUSTIFICACION_INTERV) {
                                window.alert(mensajeJustificacionCorta(motivoReap.length, MIN_JUSTIFICACION_INTERV, true))
                                return
                              }
                              if (!destinatarioReap) {
                                window.alert('Seleccione un destinatario para notificar la reapertura.')
                                return
                              }
                            }
                            const precio = listadoPrecios.find(p => p.item_numero === popupItem)
                            const vlr =
                              precioVlrDesdeListado(precio) ??
                              (Number(r.vlr_unitario) || 0)
                            const cant   = r.cant_total || 0
                            const body   = {
                              ...(popupCap  && { capitulo: popupCap }),
                              ...(popupItem && { item: popupItem, descripcion: precio?.descripcion || r.descripcion, und: precio?.und || r.und }),
                              vlr_unitario:  vlr,
                              costo_directo: Math.round(cant * vlr),
                              ...(motivoReap ? { motivo_edicion_tras_sellado: motivoReap } : {}),
                              ...(destinatarioReap ? { destinatario_id: destinatarioReap } : {}),
                            }
                            if (popupCap && popupCap !== (r.capitulo || '') && !popupItem) {
                              window.alert('Cambió el capítulo: seleccione un ítem del listado de precios para ese capítulo.')
                              return
                            }
                            const justCap = await pedirJustificacionEdicionDetalle(r, body, 'item_capitulo')
                            if (!justCap.ok) return
                            setPopupGuardando(true)
                            const res = await fetch(`${pptoEp().item(r.id)}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              if (justCap.comentarioTrazabilidad) {
                                const c = justCap.comentarioTrazabilidad
                                await crearComentarios([r.id], c.tipo, c.mensaje, c.destinatarioId, c.modo || null)
                              }
                              const d = await res.json()
                              if (d && d.id) {
                                setModalDetallePpto(d)
                                setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(d))
                                setRegistros(prev => prev.map(x => x.id === d.id ? d : x))
                                setPopupCap(d.capitulo || '')
                                setPopupItem(d.item || '')
                                setPopupItemBusq(d.item ? `${d.item} · ${d.descripcion || ''}` : '')
                              }
                              _lastWriteAtRef.current = Date.now()
                              setPopupMsg('✅ Capítulo/ítem actualizado')
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                            } else {
                              const msg = await leerDetalleErrorRes(res)
                              setPopupMsg(`❌ ${msg}`)
                            }
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#0077B6', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', opacity: (popupGuardando || (!popupCap && !popupItem)) ? 0.5 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Actualizar y recalcular'}
                          </button>
                        </div>
                      )}
                      </div>

                      {/* ── Dar de baja — no disponible en registros sellados (reabrir antes con el flujo contratista) ── */}
                      {puedeEliminar && !esSellado(r) && (
                        <button
                          type="button"
                          disabled={dandoDeBaja}
                          onClick={async () => {
                            if (dandoDeBaja) return
                            let enlazado = dwgEnlazadoRef.current || dwgEnlazado
                            if (bloqueaDarDeBajaDesdeWeb(r, enlazado)) {
                              enlazado = await refrescarDwgEnlazado()
                              if (bloqueaDarDeBajaDesdeWeb(r, enlazado)) {
                                window.alert(MSG_BAJA_DESDE_PLANO)
                                return
                              }
                            }
                            if (!window.confirm('¿Dar de baja este registro?')) return
                            setModalDetallePpto(null); setModalDetallePptoEditable(false)
                            await darDeBaja(r.id)
                          }}
                          style={{
                            background:'#EF444418', border:'1px solid #EF444444', borderRadius:'8px', padding:'8px 16px',
                            fontSize:'var(--cc-sm)', fontWeight:'700', color:'#EF4444', cursor: dandoDeBaja ? 'not-allowed' : 'pointer',
                            opacity: dandoDeBaja ? 0.55 : 1,
                          }}>
                          {dandoDeBaja ? '⏳ Baja en curso…' : '🗑️ Dar de baja'}
                        </button>
                      )}

                      {/* Mensaje de resultado */}
                      {popupMsg && (
                        <div style={{ marginTop:'8px', fontSize:'var(--cc-sm)', color: popupMsg.startsWith('✅') ? '#16A34A' : '#EF4444', fontWeight:'600' }}>
                          {popupMsg}
                        </div>
                      )}
                    </div>
                  )}
                    {r.revisado === 'Verificado' && r.validado_por && (
                    <div style={{ borderTop:`1px solid ${t.border}`, marginTop:'8px', paddingTop:'8px', display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'#16A34A22', border:'1px solid #16A34A44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'var(--cc-label)', flexShrink:0 }}>✅</div>
                      <div>
                        <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#16A34A', letterSpacing:'0.5px' }}>VERIFICADO POR</div>
                        <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{r.validado_por}</div>
                        {r.validado_en && <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted }}>
                          {new Date(r.validado_en).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' })}
                        </div>}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            </div>
          </div>
        </div>
      )}

      {trazabilidadPresupuesto && (
        <TrazabilidadRegistroModal
          apiBase={API}
          token={getToken()}
          entidadTipo="presupuesto"
          entidadId={trazabilidadPresupuesto.id}
          titulo={`Presupuesto · ID_POL ${trazabilidadPresupuesto.id_pol || trazabilidadPresupuesto.pk_id || trazabilidadPresupuesto.id}`}
          theme={t}
          onClose={() => setTrazabilidadPresupuesto(null)}
        />
      )}

      {confirmCargaGrande && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100015,
            background: 'rgba(15, 23, 42, 0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => resolverConfirmCargaGrande(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 320,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: '16px 18px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
            }}
          >
            <div style={{ fontSize: 'var(--cc-body)', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Consulta extensa
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
              <strong style={{ color: t.text }}>{confirmCargaGrande.total.toLocaleString('es-CO')}</strong> registros — puede demorar. ¿Continuar?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => resolverConfirmCargaGrande(false)}
                style={{
                  background: 'transparent',
                  color: t.textMuted,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => resolverConfirmCargaGrande(true)}
                style={{
                  background: t.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Sí
              </button>
            </div>
          </div>
        </div>
      )}

      {avisoSistema && (
        <CcAvisoModal
          theme={t}
          titulo={avisoSistema.titulo}
          mensaje={avisoSistema.mensaje}
          tipo={avisoSistema.tipo}
          onClose={() => setAvisoSistema(null)}
        />
      )}

      {/* ── Modal comentario ── */}
      {modalComentario && (() => {
        const TITULOS = { dims:'📐 Comentario — Cambio de Dimensiones', item_capitulo:'🔄 Comentario — Cambio de Ítem/Capítulo', validacion:'🔍 Comentario — Cambio de Estado', reapertura:'🔓 Motivo — Reapertura tras aprobación Interventoría', contratista_edita_interv:'✏️ Motivo — Edición con validación Interventoría' }
        const COLORES = { dims:'#F59E0B', item_capitulo:'#0077B6', validacion:'#10B981', reapertura:'#0EA5E9', contratista_edita_interv:'#0D9488' }
        const color   = COLORES[modalComentario.tipo] || t.primary
        const minLen  = (modalComentario.tipo === 'reapertura' || modalComentario.tipo === 'contratista_edita_interv')
          ? MIN_JUSTIFICACION_INTERV
          : MIN_JUSTIFICACION_EDICION
        const lenTxt  = textoComentario.trim().length
        const requiereDestinatario = modalComentario.tipo === 'reapertura'
        const nIdsReap = Array.isArray(modalComentario.ids) ? modalComentario.ids.length : 0
        const destinatariosOrdenados = [...(usuariosDestinatarios || [])].sort((a, b) => {
          const score = (u) => (/intervent/i.test(`${u?.rol || ''} ${u?.cargo || ''}`) ? 0 : 1)
          const d = score(a) - score(b)
          if (d !== 0) return d
          return String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es')
        })
        const valido  = (!modalComentario.obligatorio || lenTxt >= minLen)
          && (!requiereDestinatario || !!destinatarioComentario)
        const esIntervMotivo = modalComentario.tipo === 'reapertura' || modalComentario.tipo === 'contratista_edita_interv'
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex: modalDetallePpto ? 100020 : 6000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'28px',width:'460px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ fontSize:'var(--cc-body)',fontWeight:'700',color,marginBottom:'6px' }}>{TITULOS[modalComentario.tipo] || TITULOS.validacion}</div>
              <div style={{ fontSize:'var(--cc-sm)',color:t.textMuted,marginBottom:'16px' }}>
                {modalComentario.tipo === 'reapertura' ? (
                  <>⚠️ Obligatorio: destinatario + motivo (mín. 15 caracteres). {nIdsReap > 1 ? `Se reabrirán ${nIdsReap} registros sellados` : 'El registro pasa a «No Revisado» y deja de estar sellado'}; se notifica al destinatario.</>
                ) : modalComentario.tipo === 'contratista_edita_interv' ? (
                  <>⚠️ Obligatorio (mín. 15 caracteres). Queda registrado para Interventoría: el estado de validación pasa a «No Revisado».</>
                ) : modalComentario.obligatorio ? (
                  '⚠️ El comentario es obligatorio para este estado.'
                ) : (
                  'Opcional — explica el motivo del cambio.'
                )}
              </div>
              {/* Selector de destinatario */}
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color:t.textMuted,marginBottom:'6px',letterSpacing:'0.5px' }}>
                  {requiereDestinatario ? 'DESTINATARIO (obligatorio)' : 'NOTIFICAR A (opcional)'}
                </div>
                <select value={destinatarioComentario} onChange={e => setDestinatarioComentario(e.target.value)}
                  style={{ width:'100%',background:t.inputBg,border:`1.5px solid ${requiereDestinatario && !destinatarioComentario ? '#EF4444' : t.border}`,borderRadius:'8px',padding:'8px 12px',color:destinatarioComentario ? t.text : t.textMuted,fontSize:'var(--cc-label)',cursor:'pointer' }}>
                  <option value="">{requiereDestinatario ? '— Elija destinatario —' : '— Sin notificación —'}</option>
                  {destinatariosOrdenados.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} · {u.cargo || u.rol || '—'}</option>
                  ))}
                </select>
                {requiereDestinatario && !destinatarioComentario && (
                  <div style={{ fontSize:'var(--cc-sm)',color:'#EF4444',marginTop:'6px' }}>
                    Elija a quién notificar (usuarios del contrato; Interventoría aparece primero).
                  </div>
                )}
              </div>
              <div style={{ position:'relative' }}>
                <textarea id="textarea-comentario" autoFocus value={textoComentario} onChange={e => setTextoComentario(e.target.value)}
                  placeholder="Escribe aquí el motivo o comentario..."
                  style={{ width:'100%',minHeight:'100px',background:t.inputBg,border:`1.5px solid ${color}66`,borderRadius:'8px',padding:'10px',color:t.text,fontSize:'var(--cc-label)',resize:'vertical',boxSizing:'border-box' }} />
                <div style={{ position:'absolute', bottom:'8px', right:'8px' }}>
                  <EmojiPicker t={t} onSelect={em => setTextoComentario(prev => prev + em)} />
                </div>
              </div>
              {modalComentario.obligatorio && lenTxt < minLen && (
                <div style={{ fontSize:'var(--cc-sm)',color:'#EF4444',marginTop:'6px',lineHeight:1.45 }}>
                  {lenTxt > 0
                    ? `La justificación es muy corta (${lenTxt} de ${minLen} caracteres). Amplíe el texto: qué modificó, por qué y, si aplica, el valor anterior.`
                    : (esIntervMotivo
                      ? `Escriba la justificación de la modificación (mínimo ${minLen} caracteres). El estado de Interventoría volverá a «No Revisado».`
                      : `Escriba la justificación del cambio (mínimo ${minLen} caracteres) antes de guardar.`)}
                </div>
              )}
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'18px' }}>
                <button onClick={() => { modalComentario.resolve(null); setModalComentario(null) }}
                  style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'var(--cc-label)',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
                <button onClick={async () => {
                  if (!valido) {
                    if (requiereDestinatario && !destinatarioComentario) {
                      window.alert('Seleccione un destinatario para notificar la reapertura.')
                      return
                    }
                    window.alert(mensajeJustificacionCorta(lenTxt, minLen, esIntervMotivo))
                    return
                  }
                  const idsHist = Array.isArray(modalComentario.ids) ? modalComentario.ids : []
                  const msg = String(textoComentario || '').trim()
                  let modo = PPTO_COMENTARIO_MODO_APPEND
                  if (msg && idsHist.length && modalComentario.tipo !== 'reapertura') {
                    modo = await resolverModoSiHayHistorial(idsHist, modalComentario.tipo)
                    if (modo == null) return
                  }
                  modalComentario.resolve({
                    mensaje: textoComentario,
                    destinatarioId: destinatarioComentario || null,
                    modo,
                  })
                  setModalComentario(null)
                }}
                  style={{ background:valido?color:'#999',color:'#fff',border:'none',borderRadius:'8px',padding:'9px 22px',fontSize:'var(--cc-label)',fontWeight:'700',cursor:valido?'pointer':'not-allowed',opacity:valido?1:0.85 }}>
                  {modalComentario.obligatorio ? '✓ Confirmar' : '✓ Continuar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <PptoComentarioModoModal
        open={modalModoHistorial}
        t={t}
        onCancel={() => {
          modalModoHistorial?.resolve?.(null)
          setModalModoHistorial(null)
        }}
        onAppend={(modo) => {
          modalModoHistorial?.resolve?.(modo || PPTO_COMENTARIO_MODO_APPEND)
          setModalModoHistorial(null)
        }}
        onReplace={(modo) => {
          modalModoHistorial?.resolve?.(modo || PPTO_COMENTARIO_MODO_REPLACE)
          setModalModoHistorial(null)
        }}
      />

      {/* ── Modal hilo de comentarios ── */}
      {modalHilo && (() => {
        const TITULOS = { dims:'📐 Dimensiones', item_capitulo:'🔄 Ítem / Capítulo', validacion:'🔍 Validación' }
        const COLORES = { dims:'#F59E0B', item_capitulo:'#0077B6', validacion:'#10B981' }
        const color   = COLORES[modalHilo.tipo] || t.primary
        const fmtFecha = iso => { try { return new Date(iso).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) } catch { return iso } }
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'24px',width:'520px',maxWidth:'95vw',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px' }}>
                <div style={{ fontSize:'var(--cc-body)',fontWeight:'700',color }}>💬 {TITULOS[modalHilo.tipo]}</div>
                <button onClick={() => { setModalHilo(null); setNuevoComentTexto(''); setRespuestaHiloPorId({}) }} style={{ background:'transparent',border:'none',fontSize:'var(--cc-lg)',cursor:'pointer',color:t.textMuted }}>✕</button>
              </div>
              <div style={{ overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:'12px',paddingRight:'4px',minHeight:0 }}>
                {hiloLoading ? <div style={{ textAlign:'center',padding:'30px',color:t.textMuted }}>Cargando...</div>
                : modalHilo.data.length === 0 ? <div style={{ textAlign:'center',padding:'20px',color:t.textMuted,fontSize:'var(--cc-label)' }}>Sin comentarios aún</div>
                : modalHilo.data.map(c => {
                    const textoResp = String(respuestaHiloPorId[c.id] ?? '')
                    const puedeEnviarResp = textoResp.trim().length > 0
                    return (
                  <div key={c.id} style={{ background:t.bg,borderRadius:'10px',padding:'12px',border:`1px solid ${color}33` }}>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'6px' }}>
                      <span style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color }}>{c.usuario_nombre}</span>
                      <span style={{ fontSize:'var(--cc-caption)',color:t.textMuted }}>{fmtFecha(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:'var(--cc-label)',color:t.text,lineHeight:1.5 }}>{c.mensaje}</div>
                    {(c.respuestas||[]).length > 0 && (
                      <div style={{ marginTop:'10px',paddingLeft:'12px',borderLeft:`2px solid ${color}44`,display:'flex',flexDirection:'column',gap:'8px' }}>
                        {c.respuestas.map(r => (
                          <div key={r.id}>
                            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'3px' }}>
                              <span style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color:t.textMuted }}>{r.usuario_nombre}</span>
                              <span style={{ fontSize:'var(--cc-caption)',color:t.textMuted }}>{fmtFecha(r.created_at)}</span>
                            </div>
                            <div style={{ fontSize:'var(--cc-sm)',color:t.text }}>{r.mensaje}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop:'10px',display:'flex',gap:'6px',alignItems:'center' }}>
                      <EmojiPicker t={t} onSelect={em => setRespuestaHiloPorId(prev => ({ ...prev, [c.id]: (prev[c.id] ?? '') + em }))} />
                      <input value={textoResp} onChange={e => setRespuestaHiloPorId(prev => ({ ...prev, [c.id]: e.target.value }))}
                        onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); responderEnHilo(c.id) } }}
                        placeholder="Responder..." style={{ flex:1,background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'6px',padding:'5px 10px',fontSize:'var(--cc-sm)',color:t.text }} />
                      <button onClick={()=>responderEnHilo(c.id)} disabled={!puedeEnviarResp}
                        style={{ background:puedeEnviarResp?color:'#999',color:'#fff',border:'none',borderRadius:'6px',padding:'5px 12px',fontSize:'var(--cc-sm)',cursor:puedeEnviarResp?'pointer':'default' }}>↩</button>
                    </div>
                  </div>
                    )
                })}
              </div>
              {/* Campo nuevo comentario top-level */}
              <div style={{ marginTop:'12px', borderTop:`1px solid ${t.border}`, paddingTop:'12px', display:'flex', gap:'6px', alignItems:'center' }}>
                <input value={nuevoComentTexto} onChange={e => setNuevoComentTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('btn-nuevo-coment')?.click() } }}
                  placeholder="Nuevo comentario de validación..."
                  style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'7px', padding:'7px 10px', fontSize:'var(--cc-sm)', color:t.text }} />
                <button id="btn-nuevo-coment" disabled={!nuevoComentTexto.trim()}
                  onClick={async () => {
                    if (!nuevoComentTexto.trim()) return
                    const msg = nuevoComentTexto.trim()
                    const ok = await crearComentarios(
                      [modalHilo.registroId],
                      modalHilo.tipo,
                      msg,
                      null,
                    )
                    if (!ok) return
                    setNuevoComentTexto('')
                    await abrirHilo(modalHilo.registroId, modalHilo.tipo, { preserveReplyDrafts: true })
                    // Actualizar resumen en popup de tramos
                    setComentariosTramo(prev => ({
                      ...prev,
                      [modalHilo.registroId]: { mensaje: msg, usuario_nombre: usuario?.nombre || 'Usuario', created_at: new Date().toISOString() }
                    }))
                  }}
                  style={{ background: nuevoComentTexto.trim() ? color : '#999', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 14px', fontSize:'var(--cc-sm)', cursor: nuevoComentTexto.trim() ? 'pointer' : 'default', fontWeight:'700', flexShrink:0 }}>
                  ↩
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      <PptoEdicionMasivaModal
        open={modalEdicionMasiva}
        onClose={() => setModalEdicionMasiva(false)}
        t={t}
        seleccionados={seleccionados}
        registros={registros}
        registrosGrilla={registrosFiltrados}
        esSellado={esSellado}
        onCargarFuenteTramos={cargarFuenteTramosEdicionMasiva}
        puedeTabEditar={puedeTabEditarMasiva}
        puedeTabDepuracion={puedeTabDepuracionMasiva}
        puedeTabInterventoria={puedeTabInterventoriaMasiva}
        puedeEditarDimensiones={puedeEditarDimensiones || esDevPpto}
        requiereDepuracionAprobadaInterv={!esDevPpto}
        capitulosListado={capitulosListado}
        listadoPrecios={listadoPrecios}
        competenciasOpciones={competenciasEdicionMasiva}
        guardandoBulk={guardandoBulk}
        onApplyCapItem={aplicarMasivoCapItem}
        onApplyDimensiones={aplicarMasivoDimensiones}
        onApplyTipo={aplicarMasivoTipo}
        onApplyTramosCompetencia={aplicarMasivoTramosCompetencia}
        onApplyDepuracion={aplicarMasivoDepuracion}
        onApplyInterventoria={aplicarMasivoInterventoria}
      />
      <PptoGraficosModal
        open={modalGraficos}
        onClose={() => setModalGraficos(false)}
        t={t}
        seleccionados={seleccionados}
        registros={registros}
        contratoId={contratoId}
        token={token}
        API={API}
        onSaved={(data) => {
          const ids = Array.isArray(data?.presupuesto_ids) ? data.presupuesto_ids : []
          if (ids.length) {
            setIdsConGrafico((prev) => {
              const next = new Set(prev)
              for (const id of ids) next.add(Number(id))
              return next
            })
          } else {
            void cargarIdsConGrafico()
          }
        }}
      />
      <PptoGruposGraficosModal
        open={modalGruposGraficos}
        onClose={() => {
          setModalGruposGraficos(false)
          void cargarIdsConGrafico()
        }}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        onMembershipChange={({ action, presupuesto_ids } = {}) => {
          if (action === 'refresh') {
            void cargarIdsConGrafico()
            return
          }
          const ids = Array.isArray(presupuesto_ids) ? presupuesto_ids : []
          if (!ids.length) return
          setIdsConGrafico((prev) => {
            const next = new Set(prev)
            for (const id of ids) {
              const n = Number(id)
              if (!Number.isFinite(n)) continue
              if (action === 'remove') next.delete(n)
              else next.add(n)
            }
            return next
          })
        }}
      />

      <PptoBuscarObjetivoModal
        open={modalBuscarObjetivo}
        onClose={() => setModalBuscarObjetivo(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        pptoEp={pptoEndpointsRef.current || buildPptoEndpoints({ API, contratoId, versionActiva })}
        onApplied={(updated) => {
          if (updated?.id != null) {
            setRegistros((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
            )
          }
          void cargarCapitulos({ force: true, silent: true })
        }}
      />

      {/* ── Modal confirmar recálculo ── */}
      {modalConfirm && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.55)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'28px',width:'440px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'var(--cc-md)',fontWeight:'700',color:t.primary,marginBottom:'16px' }}>🔄 Confirmar Recálculo</div>
            <div style={{ fontSize:'var(--cc-label)',color:t.textMuted,marginBottom:'14px' }}>
              Se actualizarán <strong style={{color:t.text}}>{seleccionados.size} registro(s)</strong> con los siguientes cambios:
            </div>
            <div style={{ background:t.bg,borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'var(--cc-label)',display:'flex',flexDirection:'column',gap:'6px' }}>
              {editCapitulo && <span>📁 <strong>Capítulo:</strong> {editCapitulo}</span>}
              {editItem && <span>📌 <strong>Ítem:</strong> {editItem} · {precioSeleccionado?.descripcion || ''}</span>}
              {precioSeleccionado && <span>💲 <strong>Vlr. Unitario:</strong> {fmt(precioSeleccionado.precio_unitario)}</span>}
              {puedeEditarDimensiones && [...seleccionados].some(id => editDims[id]) && (
                <span>📐 <strong>Dimensiones</strong> modificadas en {[...seleccionados].filter(id => editDims[id]).length} fila(s)</span>
              )}
              <span style={{color:t.textMuted,fontSize:'var(--cc-sm)',marginTop:'4px'}}>
                Cant.Total = Área × Ancho × Espesor &nbsp;→&nbsp; Costo Directo = Cant.Total × Vlr.Unit
              </span>
            </div>
            <div style={{ background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:'8px',padding:'10px 14px',fontSize:'var(--cc-sm)',color:'#92400E',marginBottom:'20px' }}>
              ⚠️ Esta acción modifica los datos en la base de datos y <strong>no se puede deshacer.</strong>
            </div>
            <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
              <button onClick={() => setModalConfirm(false)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'var(--cc-label)',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarRecalcular} disabled={guardandoBulk} style={{ background:t.primary,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 22px',fontSize:'var(--cc-label)',fontWeight:'700',cursor:guardandoBulk?'wait':'pointer',opacity:guardandoBulk?0.7:1 }}>
                {guardandoBulk ? 'Guardando...' : '✓ Confirmar y guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recepción lote SicoeCAD: confirmación concreta + cargar gráfico del lote (alternativa B) ── */}
      <PptoSincroSicoeLoteModal
        open={!!sincroSicoeModal}
        data={sincroSicoeModal}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        onDismiss={async () => {
          setSincroSicoeModal(null)
          try {
            await fetch(`${API}/presupuesto/${contratoId}/sincro-sicoe-cad-auditoria/ack`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${getToken()}` },
            })
          } catch { /* ignore */ }
        }}
        onSaved={(data) => {
          const ids = Array.isArray(data?.presupuesto_ids) ? data.presupuesto_ids : []
          if (ids.length) {
            setIdsConGrafico((prev) => {
              const next = new Set(prev)
              for (const id of ids) next.add(Number(id))
              return next
            })
          } else {
            void cargarIdsConGrafico()
          }
        }}
      />

      {/* ── SicoeCAD: discrepancias con listado_precios antes de POST /bulk ── */}
      {sicoeCadListadoModal && (() => {
        const m = sicoeCadListadoModal
        const totalItems = m.itemsSnapshot?.length ?? 0
        const disc = m.discrepancias || []
        const nDisc = disc.length
        const th = {
          padding: '10px 8px',
          textAlign: 'left',
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          color: t.textMuted,
          borderBottom: `1.5px solid ${t.border}`,
          background: t.bg,
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }
        const tdBase = {
          padding: '8px',
          fontSize: 'var(--cc-sm)',
          color: t.text,
          verticalAlign: 'top',
          borderBottom: `1px solid ${t.border}`,
          lineHeight: 1.45,
        }
        const cerrar = () => { if (!sicoeCadImportBusy) setSicoeCadListadoModal(null) }
        const confirmarCorregido = async () => {
          if (sicoeCadImportBusy) return
          setSicoeCadImportBusy(true)
          try {
            const fixed = aplicarCorreccionesDiscrepanciasSicoeCad(m.itemsSnapshot, m.discrepancias)
            await ejecutarBulkPresupuestoSicoeCadDirecto(fixed, { mode: m.mode, sicoeEnviados: m.sicoeEnviados })
            setSicoeCadListadoModal(null)
            await recargarCapActualRef.current?.(true)
          } catch (e) {
            alert(e?.message || 'No se pudo importar con los valores corregidos.')
          } finally {
            setSicoeCadImportBusy(false)
          }
        }
        return (
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.68)', zIndex: 4150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sicoe-listado-discrep-titulo"
          >
            <div
              style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 26, width: 960, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 'var(--cc-h2)', lineHeight: 1 }} aria-hidden>⚠️</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div id="sicoe-listado-discrep-titulo" style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text, lineHeight: 1.3 }}>
                    Se encontraron discrepancias con el listado de precios
                  </div>
                  <div style={{ fontSize: 'var(--cc-label)', color: t.textMuted, marginTop: 8 }}>
                    Se encontraron <strong style={{ color: t.text }}>{nDisc.toLocaleString('es-CO')}</strong> discrepancia{nDisc !== 1 ? 's' : ''} en{' '}
                    <strong style={{ color: t.text }}>{totalItems.toLocaleString('es-CO')}</strong> ítem{totalItems !== 1 ? 's' : ''} importado{totalItems !== 1 ? 's' : ''}.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={sicoeCadImportBusy}
                  style={{ background: 'transparent', border: 'none', fontSize: 'var(--cc-lg)', cursor: sicoeCadImportBusy ? 'wait' : 'pointer', color: t.textMuted, flexShrink: 0 }}
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginBottom: 16, border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Ítem recibido → Ítem sugerido</th>
                      <th style={th}>Capítulo</th>
                      <th style={th}>Descripción correcta</th>
                      <th style={th}>Unidad correcta</th>
                      <th style={{ ...th, textAlign: 'right' }}>Valor unitario recibido → Valor correcto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disc.map((d, idx) => {
                      const recalc = !!d.requiere_recalculo
                      const rowBg = recalc ? 'rgba(254, 226, 226, 0.65)' : 'transparent'
                      const vlrStyle = recalc ? { color: '#B91C1C', fontWeight: 800 } : { color: t.text }
                      const capTxt =
                        d.capitulo_recibido === d.capitulo_sugerido || !d.capitulo_sugerido
                          ? (d.capitulo_recibido || '—')
                          : `${d.capitulo_recibido || '—'} → ${d.capitulo_sugerido || '—'}`
                      return (
                        <tr key={`${d.fila_index}-${idx}`} style={{ background: rowBg }}>
                          <td style={tdBase}>
                            <span style={{ fontWeight: 600 }}>{d.item_recibido || '—'}</span>
                            {d.item_sugerido != null && d.item_sugerido !== '' && d.item_recibido !== d.item_sugerido && (
                              <span style={{ color: t.textMuted }}>
                                {' '}
                                → <span style={{ color: t.primary, fontWeight: 700 }}>{d.item_sugerido}</span>
                              </span>
                            )}
                          </td>
                          <td style={tdBase}>{capTxt}</td>
                          <td style={{ ...tdBase, maxWidth: 220 }}>{d.descripcion_correcta != null && d.descripcion_correcta !== '' ? d.descripcion_correcta : '—'}</td>
                          <td style={tdBase}>{d.unidad_correcta != null && d.unidad_correcta !== '' ? d.unidad_correcta : '—'}</td>
                          <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap', ...vlrStyle }}>
                            {fmtN(d.vlr_unitario_recibido)} → {fmtN(d.vlr_unitario_correcto)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={sicoeCadImportBusy}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '9px 18px',
                    fontSize: 'var(--cc-label)',
                    color: t.textMuted,
                    cursor: sicoeCadImportBusy ? 'wait' : 'pointer',
                  }}
                >
                  Cancelar importación
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarCorregido()}
                  disabled={sicoeCadImportBusy}
                  style={{
                    background: sicoeCadImportBusy ? '#94a3b8' : t.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 22px',
                    fontSize: 'var(--cc-label)',
                    fontWeight: 700,
                    cursor: sicoeCadImportBusy ? 'wait' : 'pointer',
                    opacity: sicoeCadImportBusy ? 0.85 : 1,
                  }}
                >
                  {sicoeCadImportBusy ? 'Importando…' : 'Importar con valores correctos'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {!verPapelera && (
        <PptoExportExcelModal
          open={exportPresupuestoOpen}
          onClose={() => !exportPresupuestoBusy && setExportPresupuestoOpen(false)}
          t={t}
          busy={exportPresupuestoBusy}
          error={exportPresupuestoError}
          formato={exportPresupuestoFormato}
          onFormatoChange={setExportPresupuestoFormato}
          vistaLabel={
            pptoExportTipoDesdeVista(fObraRef.current?.tipoEjecucion || fObra.tipoEjecucion) === 'obra_ejecutada'
              ? PPTO_TIPO_EJECUCION_OBRA
              : PPTO_TIPO_EJECUCION_DEFAULT
          }
          exportTipoVista={pptoExportTipoDesdeVista(fObraRef.current?.tipoEjecucion || fObra.tipoEjecucion)}
          estimado={exportEstimado}
          onDownload={descargarPresupuestoExcel}
        />
      )}

      {!verPapelera && (
        <PptoFiltroObraVista
          t={t}
          s={s}
          contratoId={contratoId}
          token={token}
          f={fObra}
          onF={(patch) => {
            setFObra((p) => {
              const next = { ...p, ...patch }
              fObraRef.current = next
              syncFObraALegacy(next)
              return next
            })
          }}
          filtroResetKey={filtroResetKey}
          capitulosResumen={capitulosResumen}
          itemsResumen={itemsResumen}
          loadingCapitulos={loadingCapitulos}
          capExpandido={capExpandido}
          onToggleCap={onToggleCapPanelObra}
          onPickItem={onPickItemFromPanel}
          onBuscar={async (fSnap) => {
            await aplicarFiltroObraConF(fSnap || fObraRef.current || fObra)
          }}
          onLimpiar={limpiarFiltroObra}
          listadoPrecios={listadoPrecios}
          registrosGrilla={registros}
          onRestablecerPksItem={restablecerPksVistaItem}
          onRevisorTramos={abrirRevisorTramosObra}
          tramoOptions={opcionesUbicacion.tramos}
          calzadaOptions={opcionesUbicacion.calzadas}
          semaforo={SEMAFORO}
          buscando={buscandoFiltroObra}
          barraResumen={(
            <>
              <span style={{ whiteSpace: 'nowrap' }}>
                {drill.length === 0 && !verPapelera
                  ? `${capitulosResumen.length} capítulos`
                  : `${conteoFiltro != null ? conteoFiltro.toLocaleString('es-CO') : registros.length} en contrato · ${registrosFiltrados.length} filtrados (vista)`}
                {' · '}
                {seleccionados.size} seleccionados
                {seleccionados.size > 0 && (
                  <span style={{ marginLeft: 6, fontWeight: 700, color: 'var(--cc-primary, #2563eb)' }}>
                    · Cant. {fmtN(totalesSeleccion.cant)} · CD {fmt(totalesSeleccion.costo)}
                  </span>
                )}
              </span>
            </>
          )}
          onActualizar={() => { void recargarCapActual(drill.length === 0) }}
          actualizarDisabled={loading || buscandoFiltroObra}
          onExportarExcel={abrirPopupExportPresupuesto}
          exportandoExcel={exportPresupuestoBusy}
          onMapPkPick={onMapPkPresu}
          pkIdsDeGrilla={pkIdsDeGrillaParaMapa}
          mostrarToggleTipoEjecucion={mostrarToggleTipoEjecucion}
          onTipoEjecucionChange={onCambioTipoEjecucion}
          mostrarVersionador={mostrarVersionadorPresupuesto}
          esVersionInicial={versionesPresupuesto.length === 0}
          onAbrirCrearVersion={() => setVersionCrearOpen(true)}
          onAbrirPanelVersiones={() => setVersionPanelOpen(true)}
          versionActiva={versionActiva}
          versionVistaTemporal={versionVistaTemporal}
          onVolverPresupuestoVivo={puedeEditarVersionBiblioteca ? () => void volverPresupuestoVivo() : undefined}
          esDeveloper={esDeveloper}
          puedeSincronizarVlr={puedeSincronizarVlrUnitario}
          onSincronizarVlrUnitario={puedeSincronizarVlrUnitario ? abrirSincronizarVlrUnitario : undefined}
          sincronizarVlrBusy={syncVlrBusy}
        />
      )}

      {!verPapelera && (
        <PptoPanelValidacion
          t={t}
          registrosFiltrados={registrosFiltrados}
          registrosBusqueda={registros}
          filasServidor={panelFilasServidor}
          capitulosResumen={capitulosResumen}
          verValoresEconomicos={nivelInfo.verValoresEconomicos}
          busquedaActiva={busquedaServidorActiva || buscandoFiltroObra}
          busquedaSeq={panelBusquedaSeq}
          puedeBuscar={criterioVistaActivo(fObra, pptoCtxFiltro(drill, capExpandido))}
          autoCapitulo={capUnicoPanel}
          cargando={loading || buscandoFiltroObra}
          onBuscar={async () => {
            const base = fObraRef.current || fObra
            await aplicarFiltroObraConF({ ...base, eje: base?.eje || 'interv' }, { limpiarNavegacion: true })
          }}
          onLimpiarTodo={limpiarFiltroObra}
          onVolverCapitulos={volverPanelCapitulos}
          onDrillCapitulo={drillCapituloDesdePanel}
          onAplicarCapitulos={aplicarPanelCapitulos}
          onAplicarItems={aplicarPanelItems}
          onFiltrarEstadoCelda={filtrarEstadoDesdePanel}
          listadoPrecios={listadoPrecios}
        />
      )}

      {mostrarVersionadorPresupuesto && (
        <PptoVersionador
          t={t}
          token={token}
          API={API}
          contratoId={contratoId}
          usuario={usuario}
          versionesPresupuesto={versionesPresupuesto}
          versionVigente={versionVigente}
          createOpen={versionCrearOpen}
          onCreateOpenChange={setVersionCrearOpen}
          panelOpen={versionPanelOpen}
          onPanelOpenChange={setVersionPanelOpen}
          onVersionesReload={cargarVersionesPresupuesto}
          versionActiva={versionActiva}
          onTrabajarEnVersion={(v) => void trabajarEnVersionBiblioteca(v)}
        />
      )}
      <PptoVersionCadConfirmModal
        open={!!versionCadConfirm}
        t={t}
        versionActiva={versionActiva}
        itemCount={versionCadConfirm?.items?.length || 0}
        busy={sicoeCadImportBusy}
        onCancel={() => setVersionCadConfirm(null)}
        onConfirm={() => {
          const pending = versionCadConfirm
          if (!pending) return
          setVersionCadConfirm(null)
          void solicitarImportPresupuestoSicoeCadConValidacion({
            ...pending,
            skipVersionConfirm: true,
          })
        }}
      />
      <PptoSincronizarVlrModal
        open={syncVlrOpen}
        phase={syncVlrPhase}
        busy={syncVlrBusy}
        error={syncVlrError}
        result={syncVlrResult}
        t={t}
        onCancel={() => !syncVlrBusy && setSyncVlrOpen(false)}
        onConfirm={() => void ejecutarSincronizarVlrUnitario()}
        onCloseResult={() => setSyncVlrOpen(false)}
      />
      {verPapelera && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:12, marginBottom:10, color:t.textMuted, fontSize:'var(--cc-sm)', lineHeight:1.45 }}>
          Papelera: se muestran primero los dados de baja más recientes
          {papeleraTotal > 0 ? ` (${papeleraTotal.toLocaleString('es-CO')} en total)` : ''}.
          {' '}Los registros se eliminan automáticamente a los <strong style={{ color: t.text }}>{PAPELERA_DIAS_PURGA} días</strong>.
          {' '}Use el icono de llama para eliminar definitivamente antes de ese plazo.
        </div>
      )}
      {cargandoGrillaPresupuesto && conteoFiltro != null && conteoFiltro > PRES_PTO_ALERTA_GRANDE_UMBRAL && !confirmCargaGrande && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:'var(--cc-sm)', color:'#92400E' }}>
          Descargando {conteoFiltro.toLocaleString('es-CO')} registros en la grilla…
        </div>
      )}
      {conteoFiltro != null && (busquedaServidorActiva || buscandoFiltroObra) && (
        <div style={{ fontSize:'var(--cc-sm)', fontWeight:700, color:t.primary, marginBottom:8 }}>
          Coincidencias (servidor): {conteoFiltro.toLocaleString('es-CO')}
          {registros.length > 0
            ? ` · ${registrosFiltrados.length.toLocaleString('es-CO')} en grilla`
            : busquedaServidorActiva && !cargandoGrillaPresupuesto
              ? ' · grilla vacía (use el panel para filtrar filas)'
              : ''}
        </div>
      )}
      {busquedaServidorActiva && registrosFiltrados.length === 0 && (panelFilasServidor?.length > 0) && !cargandoGrillaPresupuesto && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:'var(--cc-sm)', color:t.textMuted, lineHeight:1.45 }}>
          Resumen cargado en el panel. Pulse el <strong style={{ color:t.text }}>nombre del capítulo/ítem</strong>, una <strong style={{ color:t.text }}>celda de estado</strong> o <strong style={{ color:t.text }}>Aplicar filtros</strong> para traer registros a la grilla.
        </div>
      )}

      {((!verPapelera && capitulosResumen.length > 0) || registros.length > 0) && (puedeAbrirEdicionMasiva || puedeReabrirTrasAprob || puedeEliminar || (!versionActiva?.id && !verPapelera)) && (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',boxShadow:t.shadow,display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center' }}>
          {(puedeAbrirEdicionMasiva || puedeReabrirTrasAprob) && (
            <>
              {seleccionados.size > 0 && (
                <span
                  style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color:t.primary,background:t.primary+'18',borderRadius:'20px',padding:'3px 10px',whiteSpace:'nowrap' }}
                  title="Suma de Cantidad y Costo directo de los registros seleccionados"
                >
                  {seleccionados.size} sel. · Cant. {fmtN(totalesSeleccion.cant)} · CD {fmt(totalesSeleccion.costo)}
                </span>
              )}
              {puedeAbrirEdicionMasiva && (
              <button
                type="button"
                disabled={seleccionados.size === 0}
                aria-label="Edición masiva"
                title={seleccionados.size === 0
                  ? 'Edición masiva: seleccione uno o más registros'
                  : 'Edición masiva: capítulo, dimensiones, validación…'}
                onClick={() => seleccionados.size > 0 && setModalEdicionMasiva(true)}
                style={{
                  width: 40,
                  height: 40,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: seleccionados.size > 0 ? t.primary : t.border,
                  color: seleccionados.size > 0 ? '#fff' : t.textMuted,
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 18,
                  cursor: seleccionados.size > 0 ? 'pointer' : 'not-allowed',
                  opacity: seleccionados.size > 0 ? 1 : 0.85,
                }}
              >
                ✏️
              </button>
              )}
              {puedeReabrirTrasAprob && !versionActiva?.id && !verPapelera && (
                <button
                  type="button"
                  disabled={idsSelladosSeleccionados().length === 0}
                  aria-label="Reabrir sellados"
                  title={
                    idsSelladosSeleccionados().length === 0
                      ? 'Reabrir sellados: marque uno o más registros 🔒'
                      : `Reabrir ${idsSelladosSeleccionados().length} sellado(s) con motivo y destinatario`
                  }
                  onClick={() => { void reabrirSelladosSeleccionados() }}
                  style={{
                    minHeight: 40,
                    padding: '0 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: idsSelladosSeleccionados().length > 0 ? '#0EA5E9' : t.border,
                    color: idsSelladosSeleccionados().length > 0 ? '#fff' : t.textMuted,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    cursor: idsSelladosSeleccionados().length > 0 ? 'pointer' : 'not-allowed',
                    opacity: idsSelladosSeleccionados().length > 0 ? 1 : 0.85,
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔓 Reabrir{idsSelladosSeleccionados().length > 0 ? ` (${idsSelladosSeleccionados().length})` : ''}
                </button>
              )}
              {!versionActiva?.id && !verPapelera && (
                <button
                  type="button"
                  disabled={seleccionados.size === 0}
                  aria-label="Agregar gráficos a la selección"
                  title={seleccionados.size === 0
                    ? 'Agregar gráficos: seleccione uno o más registros'
                    : 'Agregar gráficos: nuevo grupo (archivo, galería o Ctrl+V)'}
                  onClick={() => seleccionados.size > 0 && setModalGraficos(true)}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: seleccionados.size > 0 ? '#0F766E' : t.border,
                    color: seleccionados.size > 0 ? '#fff' : t.textMuted,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 18,
                    cursor: seleccionados.size > 0 ? 'pointer' : 'not-allowed',
                    opacity: seleccionados.size > 0 ? 1 : 0.85,
                  }}
                >
                  🖼
                </button>
              )}
            </>
          )}
          {!versionActiva?.id && !verPapelera && (
            <button
              type="button"
              aria-label="Gráficos del contrato"
              title="Gráficos del contrato: ver y editar grupos existentes"
              onClick={() => setModalGruposGraficos(true)}
              style={{
                width: 40,
                height: 40,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.bg,
                color: t.text,
                border: `1.5px solid ${t.border}`,
                borderRadius: 8,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              🗂️
            </button>
          )}
          {!versionActiva?.id && !verPapelera && puedeEditarDimensiones && (
            <button
              type="button"
              aria-label="Buscar objetivo"
              title="Buscar objetivo: ajustar una dimensión de un registro para cerrar el presupuesto total"
              onClick={() => setModalBuscarObjetivo(true)}
              style={{
                width: 40,
                height: 40,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: t.bg,
                color: t.text,
                border: `1.5px solid ${t.border}`,
                borderRadius: 8,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              🎯
            </button>
          )}
          {seleccionados.size > 0 && (
            <>
              {undoUltima && (
                <button
                  type="button"
                  aria-label={`Deshacer: ${undoUltima.label}`}
                  title={`Deshacer: ${undoUltima.label}`}
                  onClick={() => void deshacerUltimaAccionPresupuesto()}
                  disabled={deshaciendo || guardandoBulk || dandoDeBaja}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: t.bgCard,
                    color: '#B45309',
                    border: '1.5px solid #F59E0B',
                    borderRadius: 8,
                    fontSize: 18,
                    cursor: deshaciendo || guardandoBulk ? 'not-allowed' : 'pointer',
                    opacity: deshaciendo || guardandoBulk ? 0.6 : 1,
                  }}
                >
                  {deshaciendo ? '⏳' : '↩'}
                </button>
              )}

              {puedeEliminar && !verPapelera && seleccionados.size > 1 && (
                <button
                  type="button"
                  disabled={dandoDeBaja}
                  aria-label={`Dar de baja (${seleccionados.size})`}
                  title={`Dar de baja (${seleccionados.size} seleccionados)`}
                  onClick={async () => {
                    if (dandoDeBaja) return
                    const idsBaja = [...seleccionados].filter(id => !esSellado(registros.find(rr => rr.id === id)))
                    if (idsBaja.length === 0) {
                      alert('Los registros seleccionados están sellados (aprobados por Interventoría) y no pueden modificarse.')
                      return
                    }
                    if (!(await validarDarDeBajaIds(idsBaja, (id) => registros.find((rr) => rr.id === id)))) return
                    const comentarioData = await pedirComentario('validacion', true, idsBaja)
                    if (comentarioData === null) return
                    await ejecutarDarDeBajaLote(idsBaja, {
                      comentario: comentarioData?.mensaje || '',
                      destinatarioId: comentarioData?.destinatarioId || null,
                      modoComentario: comentarioData?.modo || null,
                      etiquetaComentario: '[BAJA MASIVA]',
                      resolverReg: (id) => registros.find((rr) => rr.id === id),
                      alTerminarSeleccion: () => setSeleccionados(new Set()),
                    })
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#EF444415',
                    border: '1px solid #EF444466',
                    borderRadius: 8,
                    color: '#EF4444',
                    fontSize: 18,
                    cursor: dandoDeBaja ? 'not-allowed' : 'pointer',
                    opacity: dandoDeBaja ? 0.55 : 1,
                  }}
                >
                  {dandoDeBaja ? '⏳' : '🗑️'}
                </button>
              )}

              {puedeEliminar && verPapelera && seleccionados.size >= 1 && (
                <button
                  type="button"
                  disabled={restaurandoPapelera || purgandoPapelera}
                  aria-label={`Restaurar (${seleccionados.size})`}
                  title={`Restaurar ${seleccionados.size} seleccionado(s) al presupuesto activo`}
                  onClick={async () => {
                    if (restaurandoPapelera || purgandoPapelera) return
                    const idsRest = [...seleccionados].filter(
                      (id) => !esSellado(registros.find((rr) => rr.id === id)),
                    )
                    if (idsRest.length === 0) {
                      window.alert(
                        'Los registros seleccionados están sellados (aprobados por Interventoría) y no pueden restaurarse.',
                      )
                      return
                    }
                    await ejecutarRestaurarLote(idsRest)
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#10B98115',
                    border: '1px solid #10B98166',
                    borderRadius: 8,
                    color: '#10B981',
                    fontSize: 18,
                    cursor: (restaurandoPapelera || purgandoPapelera) ? 'not-allowed' : 'pointer',
                    opacity: (restaurandoPapelera || purgandoPapelera) ? 0.55 : 1,
                  }}
                >
                  {restaurandoPapelera ? '⏳' : '🔄'}
                </button>
              )}

              {puedeEliminar && verPapelera && seleccionados.size >= 1 && pptoEp().itemPurgar && (
                <button
                  type="button"
                  disabled={purgandoPapelera || restaurandoPapelera}
                  aria-label={`Eliminar definitivamente (${seleccionados.size})`}
                  title={`Eliminar definitivamente (${seleccionados.size}) — irreversible`}
                  onClick={async () => {
                    if (purgandoPapelera || restaurandoPapelera) return
                    await ejecutarPurgarDefinitivoLote([...seleccionados])
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#7C2D1218',
                    border: '1px solid #F9731666',
                    borderRadius: 8,
                    color: '#EA580C',
                    cursor: (purgandoPapelera || restaurandoPapelera) ? 'not-allowed' : 'pointer',
                    opacity: (purgandoPapelera || restaurandoPapelera) ? 0.55 : 1,
                  }}
                >
                  {purgandoPapelera ? '⏳' : <Flame size={18} strokeWidth={2.25} aria-hidden />}
                </button>
              )}

            </>
          )}
        </div>
      )}

      {/* Carga capítulo activo (no bloquear toda la vista por resumen de capítulos) */}
      {verPapelera && loading ? (
        <div style={s.emptyState}>⏳ Cargando papelera…</div>
      ) : loading && drill.length > 0 ? (
        <div style={s.emptyState}>⏳ Cargando capítulo...</div>
      ) : verPapelera && registros.length === 0 ? (
        <div style={s.emptyState}>🗑️ La Papelera está vacía</div>
      ) : (!verPapelera && capitulosResumen.length === 0 && registros.length === 0 && !loadingCapitulos) ? (
        <div style={s.emptyState}>{loadingCapitulos ? '⏳ Cargando lista de capítulos…' : '📂 Importa un CSV para comenzar'}</div>
      ) : null}

      {/* ── Papelera + indicador DWG (solo verde cuando hay enlace activo) ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', flexWrap:'wrap' }}>
        {puedeEliminar && (
          <button onClick={async () => {
            const v = !verPapelera
            setVerPapelera(v)
            if (v) {
              _pptoCacheRef.current = null
              // Salir del drill/búsqueda activa: la Papelera pagina en servidor sin esos filtros
              setDrill([])
              setCapExpandido(null)
              setCapActivo(null)
              setItemsResumen([])
              busquedaServidorActivaRef.current = false
              setBusquedaServidorActiva(false)
              setSeleccionados(new Set())
              void cargarRegistros(true)
            } else {
              setRegistros([])
              setDrill([])
              setPapeleraTotal(0)
              setPapeleraCargados(0)
              papeleraNextOffsetRef.current = 0
              await cargarCapitulos()
            }
          }}
            style={{ background: verPapelera ? '#EF444422' : t.bgCard, border:`1px solid ${verPapelera ? '#EF4444' : t.border}`, borderRadius:'8px', padding:'6px 14px', color: verPapelera ? '#EF4444' : t.textMuted, fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer' }}>
            🗑️ {verPapelera ? 'Ver activos' : 'Papelera'}
          </button>
        )}
        {dwgEnlazado && (
          <div
            title="DWG enlazado — clic en grilla navega el plano vía Agent ClaraCAD"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: '#16A34A18',
              border: '1px solid #16A34A44',
              borderRadius: '8px',
              fontSize: 'var(--cc-sm)',
              color: '#16A34A',
              fontWeight: '600',
            }}
          >
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#16A34A',
              boxShadow: '0 0 6px #16A34A',
            }} />
            🔗 DWG Enlazado
          </div>
        )}
      </div>
      {/* ── Tabla ── */}
      {(verPapelera || busquedaServidorActiva || drill.length > 0 || busquedaTipo || filtroEstado || pkidsSeleccionados.length > 0 || !!ubicacionTramo || !!ubicacionCalzada || criterioVistaActivo(fObra)) && registrosFiltrados.length > 0 && (
        <>
        {pptoCompact && (
          <div className="cc-ppto-reg-cards" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {registrosPagina.map((r) => {
              const bgSellado = esSellado(r) ? 'rgba(22,101,52,0.06)' : undefined
              const colorRev = pptoEstadoValidacionColor(r.revisado)
              return (
                <div
                  key={`card-${r.id}`}
                  className="cc-ppto-reg-card"
                  onClick={() => {
                    navegarRegistroEnPlano(r)
                    abrirDetallePptoDesdeFila(r)
                  }}
                  style={{
                    background: seleccionados.has(r.id) ? (t.primary + '18') : (bgSellado || t.bgCard),
                    border: `1px solid ${seleccionados.has(r.id) ? t.primary : t.border}`,
                    borderLeft: `4px solid ${colorRev}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minHeight: 44,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="cc-ppto-row-check"
                      checked={seleccionados.has(r.id)}
                      disabled={!puedeSeleccionarFilaPpto(r)}
                      title={
                        esSellado(r)
                          ? (puedeReabrirTrasAprob
                            ? 'Sellado: selecciónelo para reabrir con motivo'
                            : 'Registro sellado')
                          : 'Marque filas (Shift+clic = rango)'
                      }
                      onClick={(e) => onSelCheckboxClick(r.id, e)}
                      onChange={(e) => onSelCheckboxChange(r.id, e)}
                      style={{
                        ...pptoCheckStyle,
                        cursor: puedeSeleccionarFilaPpto(r) ? 'pointer' : 'not-allowed',
                        opacity: puedeSeleccionarFilaPpto(r) ? 1 : 0.45,
                      }}
                    />
                    <span style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-body)', flex: 1, minWidth: 0 }}>
                      {r.id_pol || r.pk_id || `#${r.id}`}
                    </span>
                    {esSellado(r) && <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: '#15803d' }}>🔒</span>}
                    <button
                      type="button"
                      aria-label="Ver detalle"
                      onClick={() => abrirDetallePptoDesdeFila(r)}
                      style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, minWidth: 44, minHeight: 44, cursor: 'pointer', fontSize: 'var(--cc-md)' }}
                    >ℹ️</button>
                  </div>
                  <div className="cc-ppto-reg-card-meta">
                    <div className="cc-ppto-reg-card-meta-item">
                      <span>Capítulo</span>
                      <span className="cc-sicoe-truncate" title={r.capitulo || '—'}>{r.capitulo || '—'}</span>
                    </div>
                    <div className="cc-ppto-reg-card-meta-item">
                      <span>Ítem</span>
                      <span className="cc-sicoe-truncate" title={r.item || '—'}>{r.item || '—'}</span>
                    </div>
                    <div className="cc-ppto-reg-card-meta-item">
                      <span>Cant.</span>
                      <span className="cc-sicoe-num">{fmtN(r.cant_total)}</span>
                    </div>
                    <div className="cc-ppto-reg-card-meta-item">
                      <span>Estado</span>
                      <span style={{ color: colorRev, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorRev, flexShrink: 0 }} />
                        {r.revisado || 'No Revisado'}
                      </span>
                    </div>
                  </div>
                  {r.descripcion && (
                    <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion}>
                      {r.descripcion}
                    </div>
                  )}
                  <div className="cc-ppto-reg-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="Trazabilidad"
                      title="Trazabilidad"
                      onClick={() => setTrazabilidadPresupuesto(r)}
                      style={{
                        width: 40,
                        minWidth: 40,
                        height: 40,
                        minHeight: 40,
                        flex: '0 0 auto',
                        background: t.bg,
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        color: t.primary,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 'var(--cc-md)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >📜</button>
                    {mostrarColumnaDepuracion && (
                      <PptoValidacionIcon
                        eje="depuracion"
                        estado={pptoEstadoDepuracionDisplay(r)}
                        esLegado={pptoEsLegadoDepuracion(r)}
                        esSellado={esSellado(r)}
                        t={t}
                        compact
                        puedeSeleccionar={(valor) => puedePrevalidarUI && !esSellado(r)}
                        onSeleccionar={(valor) => cambiarPreIntervDirecto(r.id, valor)}
                      />
                    )}
                    <PptoValidacionIcon
                      eje="interventoria"
                      estado={pptoEstadoInterventoriaDisplay(r)}
                      esSellado={esSellado(r)}
                      t={t}
                      compact
                      tituloBloqueo={
                        puedeValidarInterventoriaUI && !preIntervLiberadoParaInterventoria(r) && !esDevPpto
                          ? 'Requiere depuración aprobada'
                          : ''
                      }
                      puedeSeleccionar={() => puedeValidarInterventoriaRegistro(r)}
                      onSeleccionar={(valor) => cambiarEstadoDirecto(r.id, valor)}
                    />
                    {puedeEditar && (
                      <button
                        type="button"
                        aria-label="Detalle"
                        title="Detalle"
                        onClick={() => abrirDetallePptoDesdeFila(r)}
                        style={{
                          width: 40,
                          minWidth: 40,
                          height: 40,
                          minHeight: 40,
                          flex: '0 0 auto',
                          background: t.primary,
                          border: 'none',
                          borderRadius: 8,
                          color: '#fff',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: 'var(--cc-md)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      >✏️</button>
                    )}
                    {puedeEliminar && !verPapelera && seleccionados.has(r.id) && !esSellado(r) && (
                      <button
                        type="button"
                        aria-label="Dar de baja"
                        title={dandoDeBaja ? 'Baja en curso…' : 'Dar de baja'}
                        disabled={dandoDeBaja}
                        onClick={() => { if (!dandoDeBaja) void darDeBaja(r.id) }}
                        style={{
                          width: 40,
                          minWidth: 40,
                          height: 40,
                          minHeight: 40,
                          flex: '0 0 auto',
                          background: '#EF444415',
                          border: '1px solid #EF444444',
                          borderRadius: 8,
                          color: '#EF4444',
                          fontWeight: 700,
                          cursor: dandoDeBaja ? 'not-allowed' : 'pointer',
                          fontSize: 'var(--cc-md)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          opacity: dandoDeBaja ? 0.55 : 1,
                        }}
                      >🗑️</button>
                    )}
                    {puedeEliminar && verPapelera && (
                      <>
                      <button
                        type="button"
                        aria-label={esSellado(r) ? 'No se puede restaurar (sellado)' : 'Restaurar'}
                        title={
                          esSellado(r)
                            ? 'Sellado por Interventoría: no se puede restaurar'
                            : (restaurandoPapelera ? 'Restauración en curso…' : 'Restaurar al presupuesto activo')
                        }
                        disabled={esSellado(r) || restaurandoPapelera || purgandoPapelera}
                        onClick={() => { if (!esSellado(r) && !restaurandoPapelera && !purgandoPapelera) void restaurar(r.id) }}
                        style={{
                          width: 40,
                          minWidth: 40,
                          height: 40,
                          minHeight: 40,
                          flex: '0 0 auto',
                          background: '#10B98115',
                          border: '1px solid #10B98144',
                          borderRadius: 8,
                          color: '#10B981',
                          fontWeight: 700,
                          cursor: (esSellado(r) || restaurandoPapelera || purgandoPapelera) ? 'not-allowed' : 'pointer',
                          fontSize: 'var(--cc-md)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          opacity: (esSellado(r) || restaurandoPapelera || purgandoPapelera) ? 0.4 : 1,
                        }}
                      >🔄</button>
                      {pptoEp().itemPurgar && (
                        <button
                          type="button"
                          aria-label="Eliminar definitivamente"
                          title={purgandoPapelera ? 'Eliminación en curso…' : 'Eliminar definitivamente'}
                          disabled={purgandoPapelera || restaurandoPapelera}
                          onClick={() => { if (!purgandoPapelera && !restaurandoPapelera) void purgarDefinitivo(r.id) }}
                          style={{
                            width: 40,
                            minWidth: 40,
                            height: 40,
                            minHeight: 40,
                            flex: '0 0 auto',
                            background: '#7C2D1218',
                            border: '1px solid #F9731644',
                            borderRadius: 8,
                            color: '#EA580C',
                            cursor: (purgandoPapelera || restaurandoPapelera) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            opacity: (purgandoPapelera || restaurandoPapelera) ? 0.45 : 1,
                          }}
                        >
                          {purgandoPapelera ? '⏳' : <Flame size={16} strokeWidth={2.25} aria-hidden />}
                        </button>
                      )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div
          ref={pptoTablaScrollRef}
          className="cc-ppto-table-scroll cc-ppto-table-desktop"
          tabIndex={0}
          role="grid"
          aria-label="Grilla de presupuesto"
          onKeyDown={handlePptoGrillaKeyDown}
          onMouseDown={(e) => {
            const t = e.target
            if (!(t instanceof HTMLElement)) return
            if (t.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
            pptoTablaScrollRef.current?.focus({ preventScroll: true })
          }}
          style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',overflowX:'auto',overflowY:'auto',WebkitOverflowScrolling:'touch',boxShadow:t.shadow, '--ppto-sticky-bg': t.bgCard, '--ppto-sticky-head': t.bg, display: pptoCompact ? 'none' : undefined, outline: 'none' }}
        >
          <table className="cc-ppto-data-table" style={{ width:'max-content', borderCollapse:'collapse', fontSize:'var(--cc-sm)' }}>
            <thead style={{ background:t.bg }}>
              <tr>
                <th className="cc-ppto-sticky-col cc-ppto-sticky-col--check cc-ppto-col-check" style={thStyle}>
                  <input
                    type="checkbox"
                    className="cc-ppto-row-check"
                    checked={idsPaginaNoSellados.length > 0 && idsPaginaNoSellados.every(id => seleccionados.has(id))}
                    onChange={toggleTodos}
                    title="Marque filas (Shift+clic = rango). Clic aquí: seleccionar / deseleccionar todos los visibles"
                    style={{ ...pptoCheckStyle, cursor: 'pointer' }}
                  />
                </th>
                <th className="cc-ppto-sticky-col cc-ppto-sticky-col--id cc-ppto-col-id" style={thStyle}>ID_POL</th>
                <th className="cc-ppto-col-cap" style={{ ...thStyle, maxWidth: 95, width: 95 }}>Capítulo</th>
                <th className="cc-ppto-col-nodos" style={thStyle} title="Nodo Inicio → Nodo Fin">Nodos</th>
                <th className="cc-ppto-col-item" style={thStyle}>Ítem</th>
                <th className="cc-ppto-col-desc" style={{ ...thStyle, maxWidth: 162, width: 162 }}>Descripción</th>
                <th className="cc-ppto-col-und" style={thStyle}>Und</th>
                <th className="cc-ppto-col-nodo" style={thStyle} title="Tramo del registro (presupuesto.tramo / maestro pk_ids)">Tramo</th>
                <th className="cc-ppto-col-nodo" style={thStyle} title="Infraestructura del PK (maestro pk_ids)">Infraestructura</th>
                <th className="cc-ppto-col-abs" style={thStyle} title="Abscisa inicio">Abs. Inicio</th>
                <th className="cc-ppto-col-abs" style={thStyle} title="Abscisa final">Abs. Final</th>
                <th className="cc-ppto-col-area" style={thStyle}>Área/Long</th>
                <th className="cc-ppto-col-secondary cc-ppto-col-ancho" style={thStyle}>Ancho</th>
                <th className="cc-ppto-col-secondary cc-ppto-col-espesor" style={thStyle}>Espesor</th>
                <th className="cc-ppto-col-cant" style={thStyle}>Cant.Total</th>
                {nivelInfo.verValoresEconomicos && (
                  <th className="cc-ppto-col-vlr" style={thStyle}>Vlr Unit.</th>
                )}
                {nivelInfo.verValoresEconomicos && (
                  <th className="cc-ppto-col-costo" style={thStyle}>Costo Directo</th>
                )}
                {mostrarColumnaDepuracion && (
                  <th className="cc-ppto-col-semaforo" style={thStyle} title="Residente de Costos u Obra — antes de Interventoría">Depuración</th>
                )}
                <th className="cc-ppto-col-semaforo" style={thStyle}>Revisado</th>
                <th className="cc-ppto-col-icon" style={thStyle} title="Trazabilidad / auditoría">📜</th>
                <th className="cc-ppto-col-icon" style={thStyle}>💬</th>
                <th className="cc-ppto-col-icon" style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {registrosPagina.map(r => {
                const bgSellado = esSellado(r) ? 'rgba(22,101,52,0.06)' : 'transparent'
                return (
                  <tr key={r.id} data-id={r.id} className="cc-ppto-data-row" style={{ background: filaZoom===r.id ? '#F59E0B22' : seleccionados.has(r.id) ? (t.primary+'18') : bgSellado, cursor: r.x_label ? 'crosshair' : 'default', outline: filaZoom===r.id ? '2px solid #F59E0B88' : 'none', transition:'background 0.3s, outline 0.3s' }}
                    onClick={() => { navegarRegistroEnPlano(r); if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && r.pk_id) { const td = document.getElementById(`zoom-feedback-${r.id}`); if(td){td.style.opacity='1'; setTimeout(()=>{td.style.opacity='0'},2000)} } }}>
                    <td className="cc-ppto-sticky-col cc-ppto-sticky-col--check cc-ppto-col-check" style={{...tdStyle, whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <input
                          type="checkbox"
                          className="cc-ppto-row-check"
                          checked={seleccionados.has(r.id)}
                          disabled={!puedeSeleccionarFilaPpto(r)}
                          title={
                            esSellado(r)
                              ? (puedeReabrirTrasAprob
                                ? 'Sellado: selecciónelo para reabrir con motivo'
                                : 'Registro sellado')
                              : 'Marque filas (Shift+clic = rango)'
                          }
                          onClick={(e) => onSelCheckboxClick(r.id, e)}
                          onChange={(e) => onSelCheckboxChange(r.id, e)}
                          style={{
                            ...pptoCheckStyle,
                            cursor: puedeSeleccionarFilaPpto(r) ? 'pointer' : 'not-allowed',
                            opacity: puedeSeleccionarFilaPpto(r) ? 1 : 0.45,
                          }}
                        />
                        <span id={`zoom-feedback-${r.id}`} style={{ fontSize:'var(--cc-caption)', color:'#10B981', opacity:'0', transition:'opacity 0.3s', pointerEvents:'none' }}>🎯</span>
                        {idsConGrafico.has(Number(r.id)) && (
                          <span
                            title="Este registro pertenece a un grupo con gráfico"
                            aria-label="Tiene gráfico"
                            style={{ fontSize: 'var(--cc-label)', lineHeight: 1 }}
                          >
                            🖼
                          </span>
                        )}
                        <button onClick={() => abrirDetallePptoDesdeFila(r)}
                          title="Ver detalle"
                          style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'var(--cc-label)', padding:'0', lineHeight:1, display:'flex', alignItems:'center' }}
                          onMouseEnter={e => e.currentTarget.style.color=t.primary}
                          onMouseLeave={e => e.currentTarget.style.color=t.textMuted}>
                          ℹ️
                        </button>
                      </div>
                    </td>
                    <td className="cc-ppto-sticky-col cc-ppto-sticky-col--id cc-ppto-col-id" style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                      <span
                        onClick={() => abrirDetallePptoDesdeFila(r)}
                        title="Ver detalle"
                        style={{ fontWeight:'600', color:t.primary, cursor:'pointer', textDecoration:'underline' }}>
                        {r.id_pol||r.pk_id||'-'}
                      </span>
                    </td>
                    <td className="cc-ppto-col-cap cc-ppto-col-ellipsis" style={{ ...tdStyle, maxWidth: 95, width: 95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.capitulo || ''}>{r.capitulo}</td>
                    <td
                      className="cc-ppto-col-nodos cc-ppto-col-ellipsis"
                      style={{ ...tdStyle, fontSize:'var(--cc-sm)', color:t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={pptoFormatoNodos(r)}
                    >
                      {pptoFormatoNodos(r)}
                    </td>
                    <td className="cc-ppto-col-item cc-ppto-col-ellipsis" style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.item}</td>
                    <td className="cc-ppto-col-desc cc-ppto-col-ellipsis" style={{ ...tdStyle, maxWidth: 162, width: 162, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion || ''}>{r.descripcion}</td>
                    <td className="cc-ppto-col-und" style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.und}</td>
                    <td
                      className="cc-ppto-col-nodo cc-ppto-col-ellipsis"
                      style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.tramo || undefined}
                    >
                      {(r.tramo && String(r.tramo).trim()) ? r.tramo : '-'}
                    </td>
                    <td
                      className="cc-ppto-col-nodo cc-ppto-col-ellipsis"
                      style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.infraestructura || undefined}
                    >
                      {(r.infraestructura && String(r.infraestructura).trim()) ? r.infraestructura : '-'}
                    </td>
                    <td
                      className="cc-ppto-col-abs cc-ppto-col-ellipsis"
                      style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.abs_inicio != null && String(r.abs_inicio).trim() ? String(r.abs_inicio) : undefined}
                    >
                      {r.abs_inicio != null && String(r.abs_inicio).trim() ? r.abs_inicio : '-'}
                    </td>
                    <td
                      className="cc-ppto-col-abs cc-ppto-col-ellipsis"
                      style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={r.abs_final != null && String(r.abs_final).trim() ? String(r.abs_final) : undefined}
                    >
                      {r.abs_final != null && String(r.abs_final).trim() ? r.abs_final : '-'}
                    </td>
                    <td className="cc-ppto-col-area" style={{ ...tdStyle,textAlign:'right', whiteSpace: 'nowrap' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAreaLongNodInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.area_long_nod ?? (r.area_long_nod ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], area_long_nod: v } })) }}
                            style={{ width:'72px',background:'transparent',border:'none',borderBottom:`1.5px solid #F59E0B`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : aplicaReglasCadPresupuesto
                          ? renderDimBloqueadaCad(fmtN(r.area_long_nod), MSG_AREA_LONG_DESDE_PLANO)
                          : fmtN(r.area_long_nod)}
                    </td>
                    <td className="cc-ppto-col-secondary cc-ppto-col-ancho" style={{ ...tdStyle,textAlign:'right', whiteSpace: 'nowrap' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAnchoEspesorInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.ancho ?? (r.ancho ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], ancho: v } })) }}
                            style={{ width:'60px',background:'transparent',border:'none',borderBottom:`1.5px solid ${t.primary}`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : fmtN(r.ancho)}
                    </td>
                    <td className="cc-ppto-col-secondary cc-ppto-col-espesor" style={{ ...tdStyle,textAlign:'right', whiteSpace: 'nowrap' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAnchoEspesorInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.espesor ?? (r.espesor ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], espesor: v } })) }}
                            style={{ width:'60px',background:'transparent',border:'none',borderBottom:`1.5px solid ${t.primary}`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : fmtN(r.espesor)}
                    </td>
                    <td className="cc-ppto-col-cant" style={{ ...tdStyle,textAlign:'right',fontWeight:'600', whiteSpace: 'nowrap' }}>{fmtN(r.cant_total)}</td>
                    {nivelInfo.verValoresEconomicos && (
                    <td className="cc-ppto-col-vlr" style={{ ...tdStyle,textAlign:'right', whiteSpace: 'nowrap' }}>{fmt(r.vlr_unitario)}</td>
                    )}
                    {nivelInfo.verValoresEconomicos && (
                    <td className="cc-ppto-col-costo" style={{ ...tdStyle,textAlign:'right',fontWeight:'700',color:t.primary, whiteSpace: 'nowrap' }}>{fmt(r.costo_directo)}</td>
                    )}
                    {mostrarColumnaDepuracion && (
                    <td className="cc-ppto-col-semaforo" style={tdStyle} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', justifyContent:'center' }}>
                        <PptoValidacionIcon
                          eje="depuracion"
                          estado={pptoEstadoDepuracionDisplay(r)}
                          esLegado={pptoEsLegadoDepuracion(r)}
                          esSellado={esSellado(r)}
                          t={t}
                          puedeSeleccionar={(valor) => puedePrevalidarUI && !esSellado(r)}
                          onSeleccionar={(valor) => cambiarPreIntervDirecto(r.id, valor)}
                        />
                      </div>
                    </td>
                    )}
                    <td className="cc-ppto-col-semaforo" style={tdStyle} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', justifyContent:'center' }}>
                        <PptoValidacionIcon
                          eje="interventoria"
                          estado={pptoEstadoInterventoriaDisplay(r)}
                          esSellado={esSellado(r)}
                          t={t}
                          tituloBloqueo={
                            puedeValidarInterventoriaUI && !preIntervLiberadoParaInterventoria(r) && !esDevPpto
                              ? 'Requiere depuración aprobada'
                              : ''
                          }
                          puedeSeleccionar={() => puedeValidarInterventoriaRegistro(r)}
                          onSeleccionar={(valor) => cambiarEstadoDirecto(r.id, valor)}
                        />
                        {esSellado(r) && (
                          <span title="Sellado — aprobado por Interventoría" style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#15803d', marginLeft:'4px', whiteSpace:'nowrap' }}>🔒</span>
                        )}
                        {puedeEditar && (
                          <button
                            type="button"
                            title="Abrir detalle del registro (mismo que en revisor de tramos: capítulo, ítem, valor; si es contratista con permiso y está sellado, podrá reabrir con motivo)"
                            onClick={(e) => { e.stopPropagation(); abrirDetallePptoDesdeFila(r) }}
                            style={{
                              marginLeft: '4px',
                              background: t.bgCard,
                              border: `1px solid ${t.border}`,
                              borderRadius: '6px',
                              padding: '2px 8px',
                              fontSize: 'var(--cc-sm)',
                              cursor: 'pointer',
                              color: t.primary,
                              fontWeight: '700',
                              flexShrink: 0,
                            }}
                          >✏️</button>
                        )}
                      </div>
                    </td>
                    <td className="cc-ppto-col-icon" style={{ ...tdStyle, textAlign:'center', width: 40 }} onClick={e=>e.stopPropagation()}>
                      <button
                        type="button"
                        title="Trazabilidad y auditoría de este registro"
                        onClick={() => setTrazabilidadPresupuesto(r)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${t.border}`,
                          borderRadius: '6px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontSize: 'var(--cc-sm)',
                          color: t.primary,
                        }}
                      >📜</button>
                    </td>
                    <td className="cc-ppto-col-icon" style={{ ...tdStyle, minWidth:'80px' }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'4px', alignItems:'center', justifyContent:'center' }}>
                        {[
                          { tipo:'dims',          icono:'📐', color:'#F59E0B', label:'Dims' },
                          { tipo:'item_capitulo', icono:'🔄', color:'#0077B6', label:'Ítem/Cap' },
                          { tipo:'validacion',    icono:'🔍', color:'#10B981', label:'Validación' },
                        ].map(({ tipo, icono, color, label }) => {
                          const c = comentariosPorId[r.id]?.[tipo]
                          if (!c || c.count === 0) return null
                          const tieneRespuestas = c.replies
                          return (
                            <div key={tipo} style={{ position:'relative' }}
                              title={`${label}: ${c.count} comentario(s)`}
                              onClick={() => abrirHilo(r.id, tipo)}>
                              <div style={{
                                background: color + '22', border:`1px solid ${color}66`,
                                borderRadius:'6px', padding:'2px 5px', fontSize:'var(--cc-sm)',
                                cursor:'pointer', color, transition:'all 0.15s',
                                fontWeight: tieneRespuestas ? '700' : '400',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.background = color + '44' }}
                                onMouseLeave={e => { e.currentTarget.style.background = color + '22' }}>
                                {icono}
                              </div>
                              {tieneRespuestas && (
                                <div style={{ position:'absolute', top:'-3px', right:'-3px', width:'7px', height:'7px', borderRadius:'50%', background:color, border:`1.5px solid ${t.bgCard}` }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    {puedeEliminar && !verPapelera && (
                      <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                        {seleccionados.has(r.id) && (
                          <button
                            type="button"
                            onClick={() => { if (!esSellado(r) && !dandoDeBaja) void darDeBaja(r.id) }}
                            title={dandoDeBaja ? 'Baja en curso…' : 'Dar de baja'}
                            disabled={esSellado(r) || dandoDeBaja}
                            style={{
                              background:'#EF444415', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px',
                              color:'#EF4444', fontSize:'var(--cc-sm)', cursor: (esSellado(r) || dandoDeBaja) ? 'not-allowed' : 'pointer',
                              opacity: dandoDeBaja ? 0.55 : 1,
                            }}>
                            🗑️
                          </button>
                        )}
                      </td>
                    )}
                    {puedeEliminar && verPapelera && (
                      <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => { if (!esSellado(r) && !restaurandoPapelera && !purgandoPapelera) void restaurar(r.id) }}
                          title={
                            esSellado(r)
                              ? 'Sellado por Interventoría: no se puede restaurar'
                              : (restaurandoPapelera ? 'Restauración en curso…' : 'Restaurar al presupuesto activo')
                          }
                          disabled={esSellado(r) || restaurandoPapelera || purgandoPapelera}
                          style={{
                            background: '#10B98115',
                            border: '1px solid #10B98144',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            color: '#10B981',
                            fontSize: 'var(--cc-sm)',
                            cursor: (esSellado(r) || restaurandoPapelera || purgandoPapelera) ? 'not-allowed' : 'pointer',
                            opacity: (esSellado(r) || restaurandoPapelera || purgandoPapelera) ? 0.4 : 1,
                          }}
                        >
                          🔄
                        </button>
                        {pptoEp().itemPurgar && (
                          <button
                            type="button"
                            onClick={() => { if (!purgandoPapelera && !restaurandoPapelera) void purgarDefinitivo(r.id) }}
                            title={purgandoPapelera ? 'Eliminación en curso…' : 'Eliminar definitivamente'}
                            aria-label="Eliminar definitivamente"
                            disabled={purgandoPapelera || restaurandoPapelera}
                            style={{
                              background: '#7C2D1218',
                              border: '1px solid #F9731644',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              color: '#EA580C',
                              fontSize: 'var(--cc-sm)',
                              cursor: (purgandoPapelera || restaurandoPapelera) ? 'not-allowed' : 'pointer',
                              opacity: (purgandoPapelera || restaurandoPapelera) ? 0.45 : 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {purgandoPapelera ? '⏳' : <Flame size={14} strokeWidth={2.25} aria-hidden />}
                          </button>
                        )}
                        </div>
                      </td>
                    )}

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hayMasRegistrosVista && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: pptoCompact ? 'none' : undefined,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                marginTop: pptoCompact ? 0 : undefined,
              }}
            >
              <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginRight: 4 }}>
                {textoProgresoPapelera}
                {papeleraCargandoMas ? ' · cargando…' : ''}
              </span>
              {[
                { label: verPapelera ? 'Cargar 100 más' : 'Cargar 50 registros', inc: verPapelera ? 100 : 50 },
                { label: verPapelera ? 'Cargar 500 más' : 'Cargar 100 registros', inc: verPapelera ? 500 : 100 },
                ...(verPapelera && papeleraTotal > 5000
                  ? []
                  : [{ label: verPapelera ? 'Cargar 1000 más' : 'Cargar todo', inc: verPapelera ? 1000 : 'all' }]),
              ].map(({ label, inc }) => (
                <button
                  key={label}
                  type="button"
                  disabled={papeleraCargandoMas}
                  onClick={() => handleCargarMasRegistrosVista(inc)}
                  style={{
                    background: inc === 'all' || inc === 1000 ? t.primary + '18' : 'transparent',
                    border: `1px solid ${inc === 'all' || inc === 1000 ? t.primary + '66' : t.border}`,
                    borderRadius: 8,
                    padding: pptoCompact ? '10px 14px' : '7px 14px',
                    minHeight: pptoCompact ? 44 : undefined,
                    color: t.text,
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    cursor: papeleraCargandoMas ? 'wait' : 'pointer',
                    opacity: papeleraCargandoMas ? 0.6 : 1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
        )}
        </>
      )}
    </div>
  )
}

// ─── MINI MAPA PRESUPUESTO ────────────────────────────────────────────────────
function MiniMapaPresupuesto({ t, colores, pkidsActivos, pkidsResaltados = [], onPkidClick }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const [listo, setListo] = useState(false)

  const getColor = (pkid, activo, pct) => {
    if (!activo) return '#334155'
    if (pkidsResaltados.length > 0) {
      return pkidsResaltados.includes(pkid) ? '#FF6B00' : '#0077B633'
    }
    return pct > 75 ? '#0077B6' : pct > 50 ? '#00B4C6' : pct > 25 ? '#00A896' : '#028090'
  }

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: t.bg === '#0A1628' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-74.05, 4.72], zoom: 11, interactive: true, bearing: 270
    })
    mapInst.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.on('load', () => {
      fetch('/pOLIGONOS_1551t_Project_Feat.json').then(r => r.json()).then(geojson => {
        const features = geojson.features
          .filter(f => f.properties.Layer !== 'dibujo externo')
          .map(f => {
            const pkid = String(f.properties.Layer).trim()
            const activo = pkidsActivos.includes(pkid)
            const d = colores[pkid] || {}
            const pct = d.pct || 0
            return { ...f, properties: { ...f.properties, pk_id: pkid, activo: activo ? 1 : 0, color: getColor(pkid, activo, pct) } }
          })
        const data = { ...geojson, features }
        map.addSource('ppto-pols', { type: 'geojson', data })
        map.addLayer({ id: 'ppto-fill', type: 'fill', source: 'ppto-pols',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'activo'], 1], 0.85, 0.1] }
        })
        map.addLayer({ id: 'ppto-labels', type: 'symbol', source: 'ppto-pols',
          layout: {
            'text-field': ['get', 'pk_id'],
            'text-size': 9,
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1 }
        })
        map.on('mouseenter', 'ppto-fill', (e) => {
          if (e.features[0].properties.activo) map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'ppto-fill', () => { map.getCanvas().style.cursor = '' })
        map.on('click', 'ppto-fill', (e) => {
          const props = e.features[0].properties
          if (props.activo) onPkidClick(props.pk_id, e.originalEvent.ctrlKey || e.originalEvent.metaKey)
        })
        const coords = features.filter(f => f.properties.activo).flatMap(f => {
          const g = f.geometry
          if (g.type === 'Polygon') return g.coordinates[0]
          if (g.type === 'MultiPolygon') return g.coordinates.flat(2)
          return []
        })
        if (coords.length > 0) {
          const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)],[Math.max(...lngs), Math.max(...lats)]], { padding: 20, duration: 0, bearing: 270, pitch: 0 })
        }
        setListo(true)
      })
    })
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; setListo(false) } }
  }, [])

  // Actualizar colores sin hacer zoom
  useEffect(() => {
    const map = mapInst.current
    if (!map || !listo || !map.getSource('ppto-pols')) return
    const src = map.getSource('ppto-pols')
    const raw = src._data
    if (!raw?.features) return
    src.setData({
      ...raw,
      features: raw.features.map(f => {
        const pkid = f.properties.pk_id || String(f.properties.Layer).trim()
        const activo = pkidsActivos.includes(pkid)
        const d = colores[pkid] || {}
        const pct = d.pct || 0
        return { ...f, properties: { ...f.properties, pk_id: pkid, activo: activo ? 1 : 0, color: getColor(pkid, activo, pct) } }
      })
    })
  }, [colores, pkidsActivos, pkidsResaltados, listo])

  return (
    <div style={{ position:'relative', width:'100%', height:'320px', borderRadius:'8px', overflow:'hidden', border:`1px solid ${t.border}` }}>
      <div ref={mapRef} style={{ width:'100%', height:'100%' }} />
      {!listo && (
        <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'var(--cc-sm)', color:t.textMuted }}>
          ⏳ Cargando mapa...
        </div>
      )}
      <div style={{ position:'absolute', bottom:'8px', left:'8px', background:t.bgCard+'DD', borderRadius:'6px', padding:'5px 8px', fontSize:'var(--cc-caption)', color:t.textMuted }}>
        🔵 Activo · 🟠 Seleccionado · Ctrl+click para multi-selección
      </div>
    </div>
  )
}

export default ModuloPresupuesto
