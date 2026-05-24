import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import TrazabilidadRegistroModal from '../../TrazabilidadRegistroModal'
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as XLSX from "xlsx"
import ExcelJS from "exceljs"
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../apiBase'
import { supabase } from '../../supabaseClient'
import { formatCOP, formatCOPShort } from '../../utils/formatCOP'
import EmojiPicker from '../../EmojiPicker'
import PptoFiltroObraVista from './PptoFiltroObraVista'
import PptoVersionador from './PptoVersionador'
import { downloadPresupuestoInformeExcel } from './presupuestoExportExcel'
import { pptoAppendFObraToSearchParams, pptoCriterioVistaActivo as criterioVistaActivo, pptoFiltroNormalizar, pptoFiltroDef, pptoFiltroValoresLista, pptoFObraToExportBody, pptoExportBodyToSearchParams } from './pptoFiltroCatalogo'
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

/** Visibilidad y niveles de validación presupuesto (depuración / interventoría): permisos de «editar registros presupuesto», no Reporte de cantidades. */
function determinarNivelValidacion(usuario) {
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  const rol     = norm(usuario?.rol_nombre || usuario?.rol || '')
  const cargo   = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const permisos = usuario?.permisos || []
  const permPpto = permisos.find(p =>
    (p.funcion_nombre || '').toLowerCase() === 'editar registros presupuesto'
  )
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

function pptoAppendTipoEjecucion(p, f) {
  const te = String(f?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT).trim() || PPTO_TIPO_EJECUCION_DEFAULT
  p.set('tipo_ejecucion', te)
}

function pptoTieneAmbosTiposEjecucion(tipos) {
  if (!Array.isArray(tipos)) return false
  const set = new Set(tipos.map((x) => String(x).trim()))
  return set.has(PPTO_TIPO_EJECUCION_DEFAULT) && set.has(PPTO_TIPO_EJECUCION_OBRA)
}

// ─── MÓDULO PRESUPUESTO ───────────────────────────────────────────────────────
function ModuloPresupuesto({ t, usuario, token, s, navRegistroId = null, onNavRegistroConsumed }) {
  const API = API_BASE
  const contratoId = usuario?.contrato_id

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [seleccionados, setSeleccionados] = useState(new Set())
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
  const [bulkEstado, setBulkEstado] = useState('')
  const [bulkPreInterv, setBulkPreInterv] = useState('')
  const [busquedaTipo, setBusquedaTipo] = useState('')   // 'nodo' | 'abscisa' | 'idpol'
  const [busquedaV1,   setBusquedaV1]   = useState('')   // nodo_ini | abs_ini | idpol
  const [busquedaV2,   setBusquedaV2]   = useState('')   // nodo_fin | abs_fin (no se usa en idpol)
  const [filtroEstado, setFiltroEstado] = useState('')   // filtro permanente de estado de revisión
  const [guardandoBulk, setGuardandoBulk] = useState(false)
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
  const pptoCargaRef = useRef({ key: '', nextOffset: 0, hasMore: false, total: 0 })
  const cargaPptoInFlightRef = useRef(false)
  const cargaPptoIdRef = useRef(0)
  const registrosRef = useRef([])
  useEffect(() => { registrosRef.current = registros }, [registros])
  /** Filtro tipo SICOE Obra (reemplaza drill por gráfico de barras) */
  const [fObra, setFObra] = useState({
    cap: '', caps: [], item: '', items: [], idPol: '', pkCriterio: '', texto: '', tramo: '', tramos: [], calzada: '', calzadas: [], nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '', competencia: '', competencias: [], und: '', unds: [], sellado: '', dadoDeBaja: '', vlrUnitarioMin: '', vlrUnitarioMax: '', cantTotalMin: '', cantTotalMax: '', costoDirectoMin: '', costoDirectoMax: '', tipoEjecucion: PPTO_TIPO_EJECUCION_DEFAULT,
  })
  const fObraRef = useRef(fObra)
  useEffect(() => { fObraRef.current = fObra }, [fObra])
  const [tiposEjecucionDisponibles, setTiposEjecucionDisponibles] = useState([])
  const mostrarToggleTipoEjecucion = pptoTieneAmbosTiposEjecucion(tiposEjecucionDisponibles)
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
  const [modalComentario,  setModalComentario]  = useState(null) // {tipo, obligatorio, resolve}
  const [textoComentario,  setTextoComentario]  = useState('')
  const [destinatarioComentario, setDestinatarioComentario] = useState('')
  const [usuariosDestinatarios,  setUsuariosDestinatarios]  = useState([])
  const [comentariosPorId, setComentariosPorId] = useState({})
  const [modalHilo,           setModalHilo]           = useState(null) // {registroId, tipo, data}
  const [modalResumenValidacion, setModalResumenValidacion] = useState(false)
  const [exportPresupuestoOpen, setExportPresupuestoOpen] = useState(false)
  const [exportPresupuestoModo, setExportPresupuestoModo] = useState('presupuesto_obra')
  const [exportPresupuestoBusy, setExportPresupuestoBusy] = useState(false)
  const [exportPresupuestoError, setExportPresupuestoError] = useState(null)
  const [versionesPresupuesto, setVersionesPresupuesto] = useState([])
  const [versionCrearOpen, setVersionCrearOpen] = useState(false)
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const [verPapelera, setVerPapelera] = useState(false)
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
  const [sincroSicoeModal, setSincroSicoeModal] = useState(null) // { insertados, enviados?, ts }
  /** Discrepancias listado_precios antes de POST /bulk (mismo payload que SicoeCAD). */
  const [sicoeCadListadoModal, setSicoeCadListadoModal] = useState(null) // { discrepancias, itemsSnapshot, mode, sicoeEnviados }
  const [sicoeCadImportBusy, setSicoeCadImportBusy] = useState(false)
  const [hiloLoading,         setHiloLoading]         = useState(false)
  /** Texto de respuesta por comentario raíz (evita un solo input compartido entre varias tarjetas). */
  const [respuestaHiloPorId,  setRespuestaHiloPorId]  = useState({})
  const [nuevoComentTexto,    setNuevoComentTexto]    = useState('')
  
  // ── Enlace DWG ──────────────────────────────────────────────────────────── 
  const [dwgEnlazado, setDwgEnlazado] = useState(false)
  useEffect(() => {
    if (!contratoId) return
    const check = async () => {
      try {
        const tok = getToken()
        if (!tok) return
        const r = await fetch(`${API}/cad-queue/${contratoId}/estado`, {
          headers: { Authorization: `Bearer ${tok}` }
        })
        if (r.ok) { const d = await r.json(); setDwgEnlazado(d.enlazado) }
      } catch {}
    }
    check()
    // 5s generaba demasiadas peticiones concurrentes al API y empeora 502 en Azure con poco CPU/RAM.
    const iv = setInterval(check, 20000)
    return () => clearInterval(iv)
  }, [contratoId])

  // ── Aviso de auditoría: cantidades enviadas desde SicoeCAD (misma vía /bulk que alimenta presupuesto y la cola CAD) ──
  useEffect(() => {
    if (!contratoId || !token) return
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
  }, [contratoId, token])

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
    if (!contratoId) return
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/presupuesto/${contratoId}/filtros`, { headers: h })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setTiposEjecucionDisponibles(Array.isArray(d?.tipos_ejecucion) ? d.tipos_ejecucion : []))
      .catch(() => setTiposEjecucionDisponibles([]))
    void cargarCapitulos()
    void cargarVersionesPresupuesto()
  }, [contratoId, token, cargarVersionesPresupuesto])
  useEffect(() => {
    if (!contratoId) return
    const h = { Authorization: `Bearer ${token}` }
    fetch(`${API}/presupuesto/${contratoId}/maestro-ubicacion-pk`, { headers: h })
      .then((r) => (r.ok ? r.json() : { tramos: [], calzadas: [] }))
      .then((d) => setOpcionesUbicacion({ tramos: d.tramos || [], calzadas: d.calzadas || [] }))
      .catch(() => {})
  }, [contratoId, token])
  
useEffect(() => {
    if (!navRegistroId || !contratoId) return
    const tok = getToken()
    fetch(`${API}/presupuesto/item/${navRegistroId}`, { headers: { Authorization: `Bearer ${tok}` } })
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
    if (!contratoId) return
    const q = new URLSearchParams({ contrato_id: String(contratoId) })
    fetch(`${API}/notificaciones/usuarios-destinatarios?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuariosDestinatarios).catch(() => {})
  }, [contratoId, token])

    useEffect(() => {
    if (!contratoId) return
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
  }, [contratoId, drill])

  useEffect(() => {
    if (!contratoId) return
    fetch(`${API}/listado-precios/${contratoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setListadoPrecios).catch(() => {})
  }, [contratoId])

  const esDeveloper  = usuario?.cargo_nombre?.toLowerCase() === 'desarrollador'
  const _permPpto    = (usuario?.permisos || []).find(p => p.funcion_nombre?.toLowerCase() === 'editar registros presupuesto')
  /** Contrato 2: editores con matriz «editar» pueden tratar No.Ini / No.Fin y área/long como Desarrollador (backend alineado). */
  const PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG = 2
  const puedeEditarNodosYAreaLongComoDev =
    esDeveloper ||
    (Number(contratoId) === PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG && !!(_permPpto?.editar))
  /** Editar No.Ini / No.Fin en grilla (y payload de nodos en «Aplicar cambios»). */
  const puedeEditarNodosGrilla = puedeEditarNodosYAreaLongComoDev
  /** Desarrollador o permiso «editar registros presupuesto» con acción editar: dimensiones y recálculo. */
  const puedeEditarDimensiones = esDeveloper || (_permPpto?.editar ?? false)
  const puedeEditar  = esDeveloper || (_permPpto?.editar   ?? false)
  /** Solo contratista (no Desarrollador) con permiso editar: puede reabrir registro sellado con motivo obligatorio. */
  const esRolContratistaPpto = (() => {
    const r = (usuario?.rol_nombre || '').toLowerCase().trim()
    return r === 'contratista' || r === 'operativo contratista'
  })()
  const puedeReabrirTrasAprob = esRolContratistaPpto && !esDeveloper && (_permPpto?.editar ?? false)
  const puedeValidar = esDeveloper || (_permPpto?.validar  ?? false)
  const puedeEliminar = esDeveloper || (_permPpto?.eliminar ?? false)
  const nivelInfo    = determinarNivelValidacion(usuario)
  const esSellado = (r) => r?.sellado === true
  const aplicaReglasCadPresupuesto = Number(contratoId) !== PRESUPUESTO_CONTRATO_EDICION_NODOS_AREA_LONG
  const MSG_BAJA_DESDE_PLANO = 'Este registro está enlazado al plano (ID-POL). La baja debe gestionarse desde ClaraLink/DWG en SicoeCAD.'
  const MSG_DIMS_DESDE_PLANO = 'Las dimensiones de registros enlazados al plano deben modificarse desde ClaraLink/DWG.'
  const MSG_AREA_LONG_DESDE_PLANO = 'El campo Área/Long/Nodo debe modificarse desde ClaraLink/DWG en este contrato.'
  const TITULO_DIM_CAD = 'Modificar desde ClaraLink/DWG (plano CAD)'
  const registroEnlazadoPlano = (r) => {
    const v = r?.id_pol
    return v != null && String(v).trim() !== ''
  }
  const bloqueaDarDeBajaDesdeWeb = (r) => aplicaReglasCadPresupuesto && registroEnlazadoPlano(r)
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
  const validarDarDeBajaIds = (ids, resolverReg) => {
    if (ids.some((id) => bloqueaDarDeBajaDesdeWeb(resolverReg(id)))) {
      window.alert(MSG_BAJA_DESDE_PLANO)
      return false
    }
    return true
  }
  /** Grilla / detalle / tramos: edición si no está sellado, o contratista con permiso que puede reabrir. */
  const puedeEditarFilaPptoNoSelladoOReabrir = (r) => !esSellado(r) || puedeReabrirTrasAprob

  const ESTADOS_INTERV_CT_REQUIERE_MOTIVO = ['Aprobado', 'Pendiente', 'Rechazado']

  function requiereMotivoIntervContratista(reg, body) {
    if (!esRolContratistaPpto || esDeveloper || esSellado(reg) || !body || typeof body !== 'object') return false
    const rv = String(reg?.revisado || 'No Revisado').trim()
    if (!ESTADOS_INTERV_CT_REQUIERE_MOTIVO.includes(rv)) return false
    const keys = ['capitulo', 'item', 'descripcion', 'und', 'vlr_unitario', 'observacion_externa', 'costo_directo', 'area_long_nod', 'ancho', 'espesor']
    for (const k of keys) {
      if (!(k in body)) continue
      const a = body[k]
      const b = reg[k]
      if (k === 'vlr_unitario' || k === 'costo_directo' || k === 'area_long_nod' || k === 'ancho' || k === 'espesor') {
        const na = Number(a), nb = Number(b)
        if (Number.isFinite(na) && Number.isFinite(nb)) {
          if (Math.abs(na - nb) > 1e-4) return true
        } else if (String(a ?? '') !== String(b ?? '')) return true
      } else if (String(a ?? '').trim() !== String(b ?? '').trim()) return true
    }
    return false
  }

  async function adjuntarMotivoSiEdicionContratistaConInterv(reg, body) {
    if (!requiereMotivoIntervContratista(reg, body)) return true
    const com = await pedirComentario('contratista_edita_interv', true)
    if (com == null) return false
    const m = String(com.mensaje || '').trim()
    if (m.length < 15) {
      window.alert('El motivo debe tener al menos 15 caracteres (queda registrado para Interventoría).')
      return false
    }
    body.motivo_edicion_con_estado_interv = m
    return true
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
  const puedePrevalidarUI = (nivelInfo.puedePrevalidarAntesInterv || esDeveloper) && puedeValidar && !nivelInfo.esInterventoria
  const mostrarColumnaDepuracion = !nivelInfo.esInterventoria
  const _pptoCacheRef   = useRef(null)   // { data, ts, papelera } – solo para papelera
  const _pptoCachePorCap = useRef({})    // { [capitulo]: { data, ts } }
  const _lastWriteAtRef  = useRef(0)     // timestamp de la última escritura; suprime polling 6 s post-write
  // Caché corta: otras sesiones (p. ej. interventoría) deben ver ediciones con latencia de segundos, no minutos
  const PPTO_CACHE_TTL  = 2 * 1000  // 2 s — vista papelera / lista plana
  const CAP_CACHE_TTL   = 2 * 1000  // 2 s — grilla por capítulo e ítem (antes 5–10 min)
  const [capitulosResumen,  setCapitulosResumen]  = useState([])
  const [loadingCapitulos,  setLoadingCapitulos]  = useState(false)
  const [itemsResumen,      setItemsResumen]      = useState([])
  const [capActivo,         setCapActivo]         = useState(null)  

  const armarFiltrosUbicacionSolo = useCallback(() => {
    const p = new URLSearchParams()
    if (ubicacionTramo) p.set('tramo', ubicacionTramo)
    if (ubicacionCalzada) p.set('calzada', ubicacionCalzada)
    if (filtroEstado) p.set('revisado', filtroEstado)
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
  }, [ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2])

  /**
   * Misma semántica que `aplicarFiltroObraConF`: cap/ítem + SICOE Obra (pk_criterio, id_pol, tramos, etc.)
   * para que el poll / debounce no borre un filtro fino (p. ej. PK elegido en el mapa).
   */
  const armarQueryPresupuestoServer = useCallback(() => {
    const p = armarFiltrosUbicacionSolo()
    const capD = drill.find(d => d.campo === 'capitulo')
    const itemD = drill.find(d => d.campo === 'item')
    const itemsD = drill.find(d => d.campo === 'items')
    if (capD) p.set('capitulo', capD.valor)
    if (itemsD && Array.isArray(itemsD.valor) && itemsD.valor.length > 1) {
      for (const it of itemsD.valor) p.append('items', String(it))
    } else if (itemD) p.set('item', itemD.valor)
    else if (itemsD && Array.isArray(itemsD.valor) && itemsD.valor.length === 1) p.set('item', String(itemsD.valor[0]))
    if (verPapelera) p.set('papelera', 'true')
    pptoAppendFObraToSearchParams(p, fObra)
    return p
  }, [armarFiltrosUbicacionSolo, drill, fObra, verPapelera])

  const armarPayloadExportPresupuesto = useCallback(() => {
    const f = fObraRef.current || fObra
    return pptoFObraToExportBody(f, {
      drill,
      capExpandido,
      tipoEjecucionDefault: PPTO_TIPO_EJECUCION_DEFAULT,
      verPapelera,
    })
  }, [drill, fObra, capExpandido, verPapelera])

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
    setExportPresupuestoModo('presupuesto_obra')
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
        throw new Error('Configure filtros y pulse Buscar antes de exportar.')
      }
      const res = await fetch(`${API}/presupuesto/${contratoId}/exportar-informe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...filtros, modo: exportPresupuestoModo }),
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
      if (!payload?.resumen?.length) {
        throw new Error('No hay registros para exportar con los filtros actuales.')
      }
      await downloadPresupuestoInformeExcel(
        payload,
        {
          ...(exportMetaContrato || {}),
          logo_contratista: exportMetaContrato?.logo_contratista || usuario?.logo_contratista || null,
        },
        contratoId,
      )
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
    exportPresupuestoModo,
    token,
    drill,
    capExpandido,
    fObra,
    usuario?.logo_contratista,
  ])

  const detalleConItem = !!drill.find(d => d.campo === 'item' || d.campo === 'items')
  const cacheKeyPpto = useMemo(() => {
    const capD = drill.find(d => d.campo === 'capitulo')
    const itemD = drill.find(d => d.campo === 'item')
    const itemsD = drill.find(d => d.campo === 'items')
    const f = fObra
    const obraKey = [f.tramo, f.calzada, f.eje, f.revisado, f.preInterv, f.idPol, f.pkCriterio, f.texto, f.nodoI, f.nodoF, f.absA, f.absB, f.tipoEjecucion].join('\x1e')
    const itemKey = itemsD?.valor?.length
      ? [...itemsD.valor].map(String).sort().join('\x1f')
      : (itemD?.valor ?? '')
    return [
      capD?.valor, itemKey, ubicacionTramo, ubicacionCalzada, filtroEstado,
      busquedaTipo, busquedaV1, busquedaV2, verPapelera, obraKey,
    ].join('|')
  }, [drill, ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2, verPapelera, fObra])

  const keyCacheFila = (cap, it) => [
    cap,
    it || '',
    fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT,
    ubicacionTramo,
    ubicacionCalzada,
    filtroEstado,
    busquedaTipo,
    busquedaV1,
    busquedaV2,
  ].join('|')

  /**
   * Carga el listado completo: 1 request de conteo + N páginas con concurrencia limitada (max 3).
   * Limitar a 3 simultáneos evita saturar el pool de conexiones de Supabase.
   * @param {URLSearchParams} pQuery mismos params que el listado
   * @param {(rows: object[]) => void} [onBatch] Tras cada tanda de hasta 3 peticiones en paralelo, filas acumuladas hasta el momento (misma orden que al finalizar).
   */
  async function fetchPresupuestoPaginasCompletas(pQuery, onBatch) {
    const h = { Authorization: `Bearer ${token}` }
    const qC = new URLSearchParams(pQuery.toString()).toString()
    const resC = await fetch(`${API}/presupuesto/${contratoId}/conteo${qC ? `?${qC}` : ''}`, { headers: h })
    let totalN = 0
    if (resC.ok) {
      const j = await resC.json()
      if (j && typeof j.total === 'number') totalN = j.total
    }
    if (totalN === 0) return { rows: [], total: 0 }

    const offsets = []
    for (let off = 0; off < totalN; off += PRES_PTO_CHUNK) offsets.push(off)

    const fetchPage = (off) => {
      const p = new URLSearchParams(pQuery.toString())
      p.set('limit', String(PRES_PTO_CHUNK))
      p.set('offset', String(off))
      return fetch(`${API}/presupuesto/${contratoId}?${p.toString()}`, { headers: h })
        .then(r => r.ok ? r.json() : [])
        .then(d => Array.isArray(d) ? d : [])
        .catch(() => [])
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
    return { rows: allRows, total: totalN }
  }

async function cargarRegistros(modoPapelera, forzar = false) {
    if (!contratoId) return
    const esPapelera = modoPapelera !== undefined ? modoPapelera : verPapelera
    // Servir desde caché si es válido
    const cached = _pptoCacheRef.current
    if (!forzar && cached && cached.papelera === esPapelera &&
        (Date.now() - cached.ts) < PPTO_CACHE_TTL) {
      setRegistros(cached.data)
      setVisibleRegistrosCount(50)
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    if (esPapelera) params.set('papelera', 'true')
    const qs = params.toString()
    const res = await fetch(`${API}/presupuesto/${contratoId}${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      _pptoCacheRef.current = { data, ts: Date.now(), papelera: esPapelera }
      setRegistros(data)
    }
    setLoading(false)
    setVisibleRegistrosCount(50)
  }

  // ── Carga lazy por capítulo ────────────────────────────────────────────────
  async function cargarCapitulos() {
    if (!contratoId) return
    setLoadingCapitulos(true)
    try {
      const p = new URLSearchParams()
      pptoAppendTipoEjecucion(p, fObraRef.current)
      const qs = p.toString()
      const res = await fetch(`${API}/presupuesto/${contratoId}/capitulos-lista${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const list = await res.json()
        setCapitulosResumen(Array.isArray(list) ? [...list].sort(cmpCapituloLabel) : list)
      }
    } catch {}
    setLoadingCapitulos(false)
  }
  
  async function cargarCapituloData(capitulo, item = null, opts = false) {
    const o = typeof opts === 'object' && opts && !Array.isArray(opts) ? opts : { forzar: !!opts, syncPreserveSize: false }
    if (!contratoId) return
    const p = armarFiltrosUbicacionSolo()
    p.set('capitulo', capitulo)
    if (item) p.set('item', item)
    pptoAppendTipoEjecucion(p, fObraRef.current)
    const cacheKey = keyCacheFila(capitulo, item)
    const silent = !!o.forzar && !!o.syncPreserveSize
    if (!o.forzar) {
      const cached = _pptoCachePorCap.current[cacheKey]
      if (cached && (Date.now() - cached.ts) < CAP_CACHE_TTL) {
        if (Array.isArray(cached.data) && typeof cached.total === 'number' && cached.data.length < cached.total) {
          delete _pptoCachePorCap.current[cacheKey]
        } else {
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
      }
    } else {
      delete _pptoCachePorCap.current[cacheKey]
    }
    cargaPptoIdRef.current += 1
    const cargaId = cargaPptoIdRef.current
    if (silent) {
      cargaPptoInFlightRef.current = true
    } else {
      setLoading(true)
    }
    try {
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p, (partial) => {
        if (cargaId !== cargaPptoIdRef.current) return
        setRegistros(partial)
      })
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
    const silent = !!forzar && !!syncPreserveSize
    if (!forzar) {
      const cached = _pptoCachePorCap.current[cacheKeyPpto]
      if (cached && (Date.now() - cached.ts) < CAP_CACHE_TTL) {
        if (Array.isArray(cached.data) && typeof cached.total === 'number' && cached.data.length < cached.total) {
          delete _pptoCachePorCap.current[cacheKeyPpto]
        } else {
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
      .catch(() => {})
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
      _pptoCachePorCap.current = {}
      _pptoCacheRef.current = null
      setRegistros([])
      setDrill([])
      setUbicacionTramo('')
      setUbicacionCalzada('')
      await cargarCapitulos()
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
        delete _pptoCachePorCap.current[keyCacheFila(capActual, null)]
        setRegistros((prev) => prev.filter((r) => r.capitulo !== capActual))
        await cargarCapituloData(capActual, null)
      }
    }
    await cargarCapitulos()
  }
  recargarCapActualRef.current = recargarCapActual

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
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk?mode=${modeQ}&source=sicoe_cad`, {
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

  const solicitarImportPresupuestoSicoeCadConValidacion = useCallback(async ({ items, mode = 'append', sicoeEnviados } = {}) => {
    const tok = getToken()
    if (!tok || !contratoId) {
      alert('Sin sesión o contrato.')
      return
    }
    if (!Array.isArray(items) || items.length === 0) return
    setSicoeCadImportBusy(true)
    try {
      const valRes = await fetch(`${API}/presupuesto/${contratoId}/bulk-validar`, {
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
  }, [API, contratoId, ejecutarBulkPresupuestoSicoeCadDirecto])

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

  /** Realtime presupuesto: solo refresca resumen liviano (GET /resumen); el listado sigue con polling 22s. */
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase || !contratoId) return
    const cid = String(contratoId)
    const filt = `contrato_id=eq.${cid}`
    const aplicarResumen = (d) => {
      if (!d || typeof d !== 'object') return
      const rows = d.por_capitulo
      if (!Array.isArray(rows)) return
      const list = rows.map((r) => ({
        capitulo: r.capitulo,
        costo_total: Number(r.costo) || 0,
        total_registros: Number(r.registros) || 0,
      }))
      setCapitulosResumen([...list].sort(cmpCapituloLabel))
    }
    const onChange = () => {
      const tok = getToken()
      if (!tok) return
      fetch(`${API}/presupuesto/${contratoId}/resumen`, { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) aplicarResumen(d)
        })
        .catch(() => {})
    }
    const channel = supabase
      .channel(`presupuesto-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'presupuesto', filter: filt },
        onChange,
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [contratoId])

  // Multisesión: refresco con pestaña activa. Intervalos cortos disparan conteo + N× presupuesto?limit=1000 y saturan el API.
  useEffect(() => {
    const PPTO_MULTI_POLL_MS = 22000
    if (!contratoId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (cargaPptoInFlightRef.current || loading) return
      if (buscandoFiltroObra) return
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
      tick()
      if (!detalleConItem && drill.length === 0 && !verPapelera) void cargarCapitulos()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = setInterval(tick, PPTO_MULTI_POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      clearInterval(iv)
    }
  }, [contratoId, detalleConItem, drill, verPapelera, loading, buscandoFiltroObra, fObra])

  function syncFObraALegacy(f) {
    setUbicacionTramo(f.tramo || '')
    setUbicacionCalzada(f.calzada || '')
    setFiltroEstado((f.eje || 'interv') === 'interv' ? (f.revisado || '') : '')
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

  async function aplicarFiltroObraConF(fIn) {
    if (!contratoId) return
    const ctx = { drill, capExpandido, tipoEjecucionDefault: PPTO_TIPO_EJECUCION_DEFAULT }
    const f = pptoFiltroNormalizar({ ...(fIn || {}), eje: fIn?.eje || 'interv' }, ctx)
    const has = criterioVistaActivo(f, ctx)
    if (!has) {
      setAvisoSistema({ titulo: 'Filtros', mensaje: 'Indique al menos un criterio de filtro activo.', tipo: 'warn' })
      return
    }
    setFObra(f)
    fObraRef.current = f
    setBuscandoFiltroObra(true)
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

      const p = new URLSearchParams()
      if (verPapelera) p.set('papelera', 'true')
      pptoAppendFObraToSearchParams(p, f)
      pptoAppendTipoEjecucion(p, f)
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p, (partial) => {
        if (cargaId !== cargaPptoIdRef.current) return
        setRegistros(partial)
      })
      if (cargaId !== cargaPptoIdRef.current) return
      setConteoFiltro(total)
      setRegistros(rows)
      setVisibleRegistrosCount(50)
      _pptoCachePorCap.current = {}
      const capD = capPrim || f.cap
      const itemKey = itemsLista.length > 1 ? itemsLista.join('\x1f') : (itemsLista[0] || '')
      if (capD) {
        const key = [capD, itemKey, f.tramo, f.calzada, f.eje, f.revisado, f.preInterv, f.idPol, f.pkCriterio, f.texto, f.nodoI, f.nodoF, f.absA, f.absB, f.competencia, f.und, f.sellado, f.dadoDeBaja, f.vlrUnitarioMin, f.vlrUnitarioMax, f.cantTotalMin, f.cantTotalMax, f.costoDirectoMin, f.costoDirectoMax, f.tipoEjecucion].join('|')
        pptoCargaRef.current = { key, nextOffset: rows.length, hasMore: false, total }
        _pptoCachePorCap.current[key] = { data: rows, ts: Date.now(), total }
      }
      skipDebounceFiltrosRef.current = true
    } catch { /* silencio */ } finally {
      cargaPptoInFlightRef.current = false
      setBuscandoFiltroObra(false)
    }
  }

  async function aplicarFiltroObra() {
    await aplicarFiltroObraConF(fObraRef.current || fObra)
  }

  const fObraInicialVacio = () => ({
    cap: '', caps: [], item: '', items: [], idPol: '', pkCriterio: '', texto: '', tramo: '', tramos: [], calzada: '', calzadas: [], nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '', competencia: '', competencias: [], und: '', unds: [], sellado: '', dadoDeBaja: '', vlrUnitarioMin: '', vlrUnitarioMax: '', cantTotalMin: '', cantTotalMax: '', costoDirectoMin: '', costoDirectoMax: '', tipoEjecucion: fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT,
  })

  async function onCambioTipoEjecucion(nuevoTipo) {
    const te = String(nuevoTipo || PPTO_TIPO_EJECUCION_DEFAULT).trim() || PPTO_TIPO_EJECUCION_DEFAULT
    if (te === (fObraRef.current?.tipoEjecucion || PPTO_TIPO_EJECUCION_DEFAULT)) return
    const next = { ...fObraRef.current, tipoEjecucion: te }
    setFObra(next)
    fObraRef.current = next
    cargaPptoIdRef.current += 1
    _pptoCachePorCap.current = {}
    _pptoCacheRef.current = null
    pptoCargaRef.current = { key: '', nextOffset: 0, hasMore: false, total: 0 }
    setConteoFiltro(null)
    setRegistros([])
    setItemsResumen([])
    setSeleccionados(new Set())
    setVisibleRegistrosCount(50)
    await cargarCapitulos()
    const cap = (next.cap && String(next.cap).trim()) || capExpandido
    if (cap) await cargarItemsCapitulo(cap)
    if (criterioVistaActivo(next)) {
      await aplicarFiltroObraConF(next)
    } else if (drill.length > 0) {
      await recargarCapActual(false)
    }
  }

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
    cargaPptoIdRef.current += 1
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
    _pptoCachePorCap.current = {}
    _pptoCacheRef.current = null
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
    await cargarItemsCapitulo(capitulo)
    await aplicarFiltroObraConF({ ...next, cap: capitulo, item: '' })
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
      void aplicarFiltroObraConF({ ...base, item: '', items: picked })
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
        void aplicarFiltroObraConF({ ...base, item: '', items: [] })
        return
      }
      const arr = sortItems(arrRaw)
      if (arr.length === 1) {
        anchorIdxPanelRef.current = idx
        void aplicarFiltroObraConF({ ...base, item: arr[0], items: [] })
        return
      }
      anchorIdxPanelRef.current = idx
      void aplicarFiltroObraConF({ ...base, item: '', items: arr })
      return
    }
    anchorIdxPanelRef.current = idx
    void aplicarFiltroObraConF({ ...base, item: String(itemNum), items: [] })
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
  function pedirComentario(tipo, obligatorio) {
    return new Promise(resolve => {
      setTextoComentario('')
      setDestinatarioComentario('')
      setModalComentario({ tipo, obligatorio, resolve })
    })
  }

  async function crearComentarios(ids, tipo, mensaje, destinatarioId = null) {
    if (!mensaje.trim()) return
    await fetch(`${API}/presupuesto/${contratoId}/comentarios/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ presupuesto_ids: ids, tipo, mensaje: mensaje.trim(), usuario_nombre: usuario?.nombre || 'Usuario' })
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

  const registrosFiltrados = useMemo(() => {
    const parseAbs = s => {
      if (!s) return null
      return parseFloat(String(s).replace('+', ''))
    }
    return registros.filter(r => {
      if (!drillMatch(r)) return false
      if (pkidsSeleccionados.length > 0) {
        if (!pkidsSeleccionados.includes(r.pk_id)) return false
      }
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
      if (filtroEstado) {
        const estadoReal = r.revisado || 'No Revisado'
        if (estadoReal !== filtroEstado) return false
      }
      return true
    })
  }, [registros, drill, busquedaTipo, busquedaV1, busquedaV2, filtroEstado, pkidsSeleccionados, detalleConItem, ubicacionTramo, ubicacionCalzada])

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

  const registrosOrdenados = useMemo(() =>
    [...registrosFiltrados].sort((a, b) => {
      const va = String(a.id_pol || a.pk_id || '')
      const vb = String(b.id_pol || b.pk_id || '')
      return vb.localeCompare(va, 'es', { numeric: true })
    })
  , [registrosFiltrados])
  const registrosPagina = useMemo(() => {
    const n = registrosOrdenados.length
    const take = Math.min(visibleRegistrosCount, n)
    return registrosOrdenados.slice(0, take)
  }, [registrosOrdenados, visibleRegistrosCount])
  const idsPaginaNoSellados = useMemo(
    () => registrosPagina.filter(r => !esSellado(r)).map(r => r.id),
    [registrosPagina]
  )

  const hayMasRegistrosVista = visibleRegistrosCount < registrosOrdenados.length

  const handleCargarMasRegistrosVista = () => {
    const el = pptoTablaScrollRef.current
    const prevH = el?.scrollHeight ?? 0
    const prevT = el?.scrollTop ?? 0
    setVisibleRegistrosCount((c) => Math.min(c + POR_PAGINA, registrosOrdenados.length))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrap = pptoTablaScrollRef.current
        if (!wrap) return
        wrap.scrollTop = prevT + (wrap.scrollHeight - prevH)
      })
    })
  }

  /** Resumen de validación alineado con la grilla visible (registros filtrados). */
  const resumenValidacionVista = useMemo(() => {
    const porRevisado = {}
    const porPreInterv = {}
    let costoAcum = 0
    let cantTotalAcum = 0
    for (const r of registrosFiltrados) {
      const cd = Number(r.costo_directo) || 0
      costoAcum += cd
      cantTotalAcum += Number(r.cant_total) || 0
      const rev = r.revisado || 'No Revisado'
      if (!porRevisado[rev]) porRevisado[rev] = { count: 0, costo: 0 }
      porRevisado[rev].count += 1
      porRevisado[rev].costo += cd
      const pre = (r.pre_interv_estado == null || r.pre_interv_estado === '') ? 'No Revisado' : r.pre_interv_estado
      if (!porPreInterv[pre]) porPreInterv[pre] = { count: 0, costo: 0 }
      porPreInterv[pre].count += 1
      porPreInterv[pre].costo += cd
    }
    return { porRevisado, porPreInterv, total: registrosFiltrados.length, costoAcum, cantTotalAcum }
  }, [registrosFiltrados])

  /** Título del panel de totales: ítem + descripción según filtro (panel lateral, grilla o listado de precios). */
  const etiquetaTituloVistaFiltrada = useMemo(() => {
    const prim = fObraItemsLista(fObra)
    if (!prim.length) return 'Sin ítem en criterio'
    if (prim.length > 1) return `${prim.length} ítems seleccionados`
    const raw = prim[0]
    const normKey = (s) => String(s ?? '').trim().replace(/\.+$/, '')
    const nk = normKey(raw)
    const matchItem = (x) => {
      const ix = String(x ?? '').trim()
      return ix === raw || normKey(ix) === nk
    }
    const fromPanel = itemsResumen.find((it) => matchItem(it.item))
    let desc = String(fromPanel?.descripcion ?? '').trim()
    let itemLabel = String(fromPanel?.item ?? raw).trim()
    if (!desc && registrosFiltrados.length) {
      const r0 = registrosFiltrados.find((r) => matchItem(r.item))
      if (r0) {
        desc = String(r0.descripcion ?? '').trim()
        if (!fromPanel) itemLabel = String(r0.item ?? raw).trim()
      }
    }
    if (!desc && Array.isArray(listadoPrecios)) {
      const p = listadoPrecios.find((x) => matchItem(x.item_numero))
      if (p) desc = String(p.descripcion ?? '').trim()
    }
    return desc ? `${itemLabel} · ${desc}` : itemLabel
  }, [fObra.item, fObra.items, itemsResumen, registrosFiltrados, listadoPrecios])

  async function cargarItemsCapitulo(capitulo) {
    if (!contratoId) return
    setItemsResumen([])
    setCapActivo(capitulo)
    try {
      const p = new URLSearchParams({ capitulo })
      pptoAppendTipoEjecucion(p, fObraRef.current)
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/items-lista?${p.toString()}`,
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
    setDrill(prev => prev.slice(0, idx))
    // Los registros de capítulos cargados permanecen en memoria para re-uso
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

  async function ejecutarRecalcular() {
    const ids = [...seleccionados]
    if (aplicaReglasCadPresupuesto) {
      const intentaArea = ids.some((id) => {
        const d = editDims[id]
        return d && d.area_long_nod != null && d.area_long_nod !== ''
      })
      if (intentaArea) {
        alert(MSG_AREA_LONG_DESDE_PLANO)
        return
      }
      const intentaCad = ids.some((id) => {
        const d = editDims[id]
        const row = registros.find((r) => r.id === id)
        if (!d || !row || !registroEnlazadoPlano(row)) return false
        return (d.ancho != null && d.ancho !== '') || (d.espesor != null && d.espesor !== '')
      })
      if (intentaCad) {
        alert(MSG_DIMS_DESDE_PLANO)
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
    const tieneItem = !!(editCapitulo || editItem)
    if (!tieneItem && !tieneCambioMedidas && !tieneCambioNodos) {
      alert('No hay cambios para aplicar.')
      return
    }
    const tipoComent = tieneItem ? 'item_capitulo' : 'dims'

    // Pedir comentario (obligatorio)
    const comentarioData = await pedirComentario(tipoComent, true)
    if (comentarioData === null) return  // canceló
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null

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
        const res = await fetch(`${API}/presupuesto/item/${id}`, {
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
        if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioId)
        setRegistros(prev => prev.map(r => (updatesById[r.id] ? { ...r, ...updatesById[r.id] } : r)))
        setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
        cargarCapitulos().catch(() => {})
        return
      }
      nodosMergeEnBulk = updatesById
    }

    const dims = ids.filter(id => editDims[id]).map(id => {
      const d = editDims[id]
      const row = registros.find((r) => r.id === id)
      const cad = aplicaReglasCadPresupuesto && registroEnlazadoPlano(row)
      return {
        id,
        ancho: !cad && d.ancho !== '' && d.ancho != null ? parseFloat(d.ancho) : null,
        espesor: !cad && d.espesor !== '' && d.espesor != null ? parseFloat(d.espesor) : null,
        area_long_nod:
          !aplicaReglasCadPresupuesto && puedeEditarNodosYAreaLongComoDev && d.area_long_nod !== '' && d.area_long_nod != null ? parseFloat(d.area_long_nod) : null,
      }
    })
    const body = { ids, dims: dims.length > 0 ? dims : null }
    if (editCapitulo)   body.capitulo    = editCapitulo
    if (editItem)       { body.item = editItem; body.descripcion = precioSeleccionado?.descripcion ?? null }
    if (precioSeleccionado) body.vlr_unitario = precioSeleccionado.precio_unitario

    // Calcular resultado esperado localmente y aplicarlo antes del fetch
    const computarFila = (r) => {
      if (!ids.includes(r.id)) return r
      const dim = dims.find(d => d.id === r.id)
      const ancho   = (dim?.ancho != null ? dim.ancho : (r.ancho ?? 0)) || 0
      const espesor = (dim?.espesor != null ? dim.espesor : (r.espesor ?? 0)) || 0
      const area    = (dim?.area_long_nod != null ? dim.area_long_nod : (r.area_long_nod ?? 0)) || 0
      const vlr     = precioSeleccionado?.precio_unitario ?? r.vlr_unitario ?? 0
      const cant    = (ancho > 0 || espesor > 0) ? Math.round(area * ancho * espesor * 100) / 100 : Math.round(area * 100) / 100
      const costo   = Math.round(cant * vlr)
      return {
        ...r,
        ...(editCapitulo && { capitulo: editCapitulo }),
        ...(editItem && { item: editItem, descripcion: precioSeleccionado?.descripcion ?? r.descripcion }),
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
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-recalcular`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioId)
    } else {
      // Revertir si falló
      setRegistros(prev => prev.map(r => {
        const orig = snapOriginal.find(x => x.id === r.id)
        return orig ? orig : r
      }))
    }
  }

async function ejecutarBulkEstadoDirecto(estado) {
    if (!estado || seleccionados.size === 0) return
    const selIds = [...seleccionados]
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados (aprobados por Interventoría) en la selección; no pueden modificarse.')
      return
    }
    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    // Actualización optimista inmediata
    setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, selIds, estado)))
    setBulkEstado(''); setSeleccionados(new Set())
    _lastWriteAtRef.current = Date.now()
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selIds, revisado: estado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId)
      lanzarClaraLinkEstado(selIds, estado)
    }
  }

  async function ejecutarBulkEstado() {
    if (!bulkEstado || seleccionados.size === 0) return
    const selIds = [...seleccionados]
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados (aprobados por Interventoría) en la selección; no pueden modificarse.')
      return
    }
    const obligatorio = bulkEstado === 'Pendiente' || bulkEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const estadoAplicado = bulkEstado
    // Actualización optimista inmediata
    setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, selIds, estadoAplicado)))
    setBulkEstado(''); setSeleccionados(new Set())
    _lastWriteAtRef.current = Date.now()
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selIds, revisado: estadoAplicado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId)
      lanzarClaraLinkEstado(selIds, estadoAplicado)
    }
  }

  async function ejecutarBulkPreInterv() {
    if (!bulkPreInterv || seleccionados.size === 0) return
    const selIds = [...seleccionados]
    if (selIds.some(id => esSellado(registros.find(rr => rr.id === id)))) {
      alert('Hay registros sellados en la selección; no pueden modificarse.')
      return
    }
    const obligatorio = bulkPreInterv === 'Pendiente' || bulkPreInterv === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const estadoPre = bulkPreInterv
    // Capturar estado original para revertir si falla
    const snapOriginal = registros.filter(r => selIds.includes(r.id))
    // Actualización optimista inmediata
    setRegistros(prev => prev.map(r => aplicarCambioPreIntervLocal(r, selIds, estadoPre)))
    setBulkPreInterv(''); setSeleccionados(new Set())
    _lastWriteAtRef.current = Date.now()
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-pre-interv`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selIds, estado: estadoPre })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId)
    } else {
      // Revertir al estado original
      setRegistros(prev => prev.map(r => {
        const orig = snapOriginal.find(x => x.id === r.id)
        return orig ? orig : r
      }))
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo aplicar la depuración previa.')
      } catch {
        alert('No se pudo aplicar la depuración previa.')
      }
    }
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
    if (esSellado(reg) && puedeReabrirTrasAprob) {
      const com = await pedirComentario('reapertura', true)
      if (com == null) return
      motivoReap = String(com.mensaje || '').trim()
      if (motivoReap.length < 15) { alert('El motivo de reapertura debe tener al menos 15 caracteres (visible para Interventoría).'); return }
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
    if (motivoReap) body.motivo_edicion_tras_sellado = motivoReap
    if (!(await adjuntarMotivoSiEdicionContratistaConInterv(reg, body))) return
    const res = await fetch(`${API}/presupuesto/item/${id}`, {
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
      // Actualizar totales del panel izquierdo en background sin bloquear la UI
      cargarCapitulos().catch(() => {})
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
  function toggleSel(id) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodos() {
    const idsPagina = registrosPagina.map(r => r.id)
    const idsNoSellados = registrosPagina.filter(r => !esSellado(r)).map(r => r.id)
    const todosNoSelladosSeleccionados = idsNoSellados.length > 0 && idsNoSellados.every(id => seleccionados.has(id))
    if (todosNoSelladosSeleccionados) {
      setSeleccionados(prev => { const n = new Set(prev); idsPagina.forEach(i => n.delete(i)); return n })
    } else {
      setSeleccionados(prev => { const n = new Set(prev); idsNoSellados.forEach(i => n.add(i)); return n })
    }
  }
  useEffect(() => {
    setVisibleRegistrosCount(Math.min(50, registrosFiltrados.length))
  }, [registrosFiltrados.length])
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
  const estadoColor = (r) => r === 'Aprobado' ? '#16A34A' : r === 'Pendiente' ? '#D97706' : r === 'Rechazado' ? '#EF4444' : '#3B82F6'
  const SEMAFORO = [
    { valor: 'No Revisado', color: '#3B82F6', label: '🔵' },
    { valor: 'Rechazado', color: '#EF4444', label: '🔴' },
    { valor: 'Pendiente', color: '#D97706', label: '🟡' },
    { valor: 'Aprobado',  color: '#16A34A', label: '🟢' },
  ]

async function highlightEnDwg(registro) {
  if (!registro?.id) return
  const esTablet = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const contratoId = registro.contrato_id
  const token = getToken()
  if (esTablet || !window.__claralink_disponible) {
    // vía cad_queue
    await fetch(`${API}/cad-queue/${contratoId}/highlight-registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ presupuesto_id: registro.id })
    }).catch(() => {})
  } else {
    // vía ClaraLink (mismo esquema que zoomEnDwg)
    const url = `claralink://highlight?handle=${registro.ent_handle}&txt=${registro.txt_handle || ''}&x=${registro.x_label || 0}&y=${registro.y_label || 0}`
    window.location.href = url
  }
}

  function zoomEnDwg(registro) {
    if (!registro.x_label || !registro.y_label) return
    setFilaZoom(registro.id)
    const esClaraLinkDisponible = !(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    if (esClaraLinkDisponible) {
      const uri = `claralink://zoom?x=${registro.x_label}&y=${registro.y_label}&radio=20&handle=${registro.ent_handle || ''}&txt=${registro.txt_handle || ''}`
      window.location.href = uri
    } else {
      if (!registro.pk_id) return
      const tok = getToken()
      fetch(`${API}/cad-queue/${contratoId}/zoom-pkid?pk_id=${encodeURIComponent(registro.pk_id)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}` }
      }).catch(() => {})
    }
  }

  async function cambiarEstadoDirecto(id, nuevoEstado) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    // Actualización optimista inmediata — el usuario ve el cambio al instante
    setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, [id], nuevoEstado)))
    _lastWriteAtRef.current = Date.now()
    const token = getToken()
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [id], revisado: nuevoEstado })
    })
    if (!res.ok) {
      // Revertir si falló
      setRegistros(prev => prev.map(r => r.id === id ? row : r))
      return
    }
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId)
    lanzarClaraLinkEstado([id], nuevoEstado)
  }

  async function cambiarPreIntervDirecto(id, nuevoEstado) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    // Actualización optimista inmediata
    setRegistros(prev => prev.map(r => aplicarCambioPreIntervLocal(r, [id], nuevoEstado)))
    _lastWriteAtRef.current = Date.now()
    const tok = getToken()
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-pre-interv`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ ids: [id], estado: nuevoEstado })
    })
    if (!res.ok) {
      // Revertir si falló
      setRegistros(prev => prev.map(r => r.id === id ? row : r))
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo guardar la depuración previa.')
      } catch {
        alert('No se pudo guardar la depuración previa.')
      }
      return
    }
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId)
  }

async function darDeBaja(id) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    if (bloqueaDarDeBajaDesdeWeb(row)) {
      window.alert(MSG_BAJA_DESDE_PLANO)
      return
    }
    const comentarioData = await pedirComentario('validacion', true) // obligatorio
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const res = await fetch(`${API}/presupuesto/item/${id}/dar-baja`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      await crearComentarios([id], 'validacion', `[BAJA] ${comentario}`, destinatarioId)
      await recargarCapActual()
    } else {
      try {
        const d = await res.json()
        alert(d.detail || 'Error al dar de baja el registro')
      } catch {
        alert('Error al dar de baja el registro')
      }
    }
  }

async function restaurar(id) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    if (!window.confirm('¿Restaurar este registro? Volverá a aparecer en la grilla y se reactivará en el DWG.')) return
    const res = await fetch(`${API}/presupuesto/item/${id}/restaurar`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      await recargarCapActual()
    } else alert('Error al restaurar el registro')
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
          <strong style={{ color: t.text }}>Cargo Desarrollador:</strong> la reapertura de registros sellados, el motivo al editar con estado ya validado por Interventoría y el paso a «No Revisado» en ese flujo solo aplican al perfil{' '}
          <strong>contratista</strong> (con permiso editar presupuesto). Para probarlos, use un usuario con ese rol. Como desarrollador sí verá el botón ✏️ en el revisor de tramos (abre el detalle del registro) y la edición de dimensiones donde corresponda.
        </div>
      )}
      {/* ── Modal Revisor de Tramos ─────────────────────────────────────────── */}
      {modalModoCapitulo && (() => {
        const capRegs = registros.filter(r => r.capitulo === modalModoCapitulo)

        // Tramos únicos: no_inicio !== no_final
        const tramosUnicos = []
        const vistos = new Set()
        capRegs.forEach(r => {
          if (!r.no_inicio || !r.no_final) return
          if (r.no_inicio === r.no_final) return
          const key = `${r.no_inicio}||${r.no_final}`
          if (!vistos.has(key)) {
            vistos.add(key)
            tramosUnicos.push({ no_inicio: r.no_inicio, no_final: r.no_final, label: `${r.no_inicio} → ${r.no_final}` })
          }
        })

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
        const regsTramo   = tramoSelec ? capRegs.filter(r => r.no_inicio === tramoSelec.no_inicio && r.no_final === tramoSelec.no_final)   : []

        const estIni   = tramoSelec ? calcEstrella(regsNodoIni) : 'vacia'
        const estFin   = tramoSelec ? calcEstrella(regsNodoFin) : 'vacia'
        const estTramo = tramoSelec ? calcEstrella(regsTramo)   : 'vacia'

        const TAB_LABELS = ['📋 Info Tramo', '🔵 Nodo Inicio', '🔴 Nodo Fin', '📏 Tramo']

        // Renderiza filas de ítems con semáforo
        const FilaItem = ({ r }) => {
          const est = r.revisado || 'No Revisado'
          const clr = estadoColor(est)
          return (
            <div onClick={() => { zoomEnDwg(r); highlightEnDwg(r) }}
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
                {[{valor:'Rechazado',label:'🔴'},{valor:'Pendiente',label:'🟡'},{valor:'Aprobado',label:'🟢'}].map(op => (
                  <button key={op.valor}
                    title={op.valor}
                    onClick={async (e) => { e.stopPropagation(); if (puedeValidar && !esSellado(r)) await cambiarEstadoDirecto(r.id, op.valor) }}
                    style={{ background: est === op.valor ? clr : t.bgCard,
                      border:`1.5px solid ${est === op.valor ? clr : t.border}`,
                      borderRadius:'50%', width:'22px', height:'22px', fontSize:'var(--cc-sm)',
                      cursor: puedeValidar && !esSellado(r) ? 'pointer' : 'default',
                      display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                    {op.label}
                  </button>
                ))}
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
                {/* Botón volver */}
                <button onClick={() => { setTramoSelec(null); cargarRegistros(verPapelera, true) }}
                  style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'7px',
                    padding:'5px 12px', fontSize:'var(--cc-sm)', cursor:'pointer', color:t.textMuted, marginBottom:'14px' }}>
                  ← Volver a tramos
                </button>

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
                      return row && !esSellado(row)
                    })
                    if (!ids.length) return
                    const obligatorio = estado === 'Pendiente' || estado === 'Rechazado'
                    const comentarioData = await pedirComentario('validacion', obligatorio)
                    if (comentarioData === null) return
                    const comentario = comentarioData?.mensaje || ''
                    const destinatarioId = comentarioData?.destinatarioId || null
                    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ ids, revisado: estado })
                    })
                    if (res.ok) {
                      if (comentario.trim()) await crearComentarios(ids, 'validacion', comentario, destinatarioId)
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
                              {puedeValidar && SEMAFORO.map(s => (
                                <button key={s.valor} onClick={() => validarTab(s.valor)}
                                  style={{ background:t.bgCard, border:`1.5px solid ${s.color}`, borderRadius:'6px', padding:'3px 8px', fontSize:'var(--cc-sm)', cursor:'pointer', color:s.color, fontWeight:'700' }}>
                                  {s.label} {s.valor}
                                </button>
                              ))}
                              {puedeEliminar && (
                                <button onClick={async () => {
                                  const idsBaja = [...selTab].filter(id => {
                                    const row = regs.find(x => x.id === id)
                                    return row && !esSellado(row)
                                  })
                                  if (idsBaja.length === 0) return
                                  if (!validarDarDeBajaIds(idsBaja, (id) => regs.find((x) => x.id === id))) return
                                  const comentarioData = await pedirComentario('validacion', true)
                                  if (comentarioData === null) return
                                  const comentario = comentarioData?.mensaje || ''
                                  const destinatarioId = comentarioData?.destinatarioId || null
                                  for (const id of idsBaja) {
                                    const res = await fetch(`${API}/presupuesto/item/${id}/dar-baja`, {
                                      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
                                    })
                                    if (res.ok) await crearComentarios([id], 'validacion', `[BAJA] ${comentario}`, destinatarioId)
                                  }
                                  setSelTramoTab(prev => ({ ...prev, [key]: new Set() }))
                                  await recargarCapActual()
                                }}
                                  style={{ background:'#EF444418', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px', fontSize:'var(--cc-sm)', cursor:'pointer', color:'#EF4444', fontWeight:'700' }}>
                                  🗑️ Dar de baja ({[...selTab].filter(id => regs.find(x => x.id === id) && !esSellado(regs.find(x => x.id === id))).length})
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
                                    zoomEnDwg(r); highlightEnDwg(r)
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
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    style={{ display:'flex', gap:'3px', alignItems:'center', justifyContent:'center', flex:'0.7 0 72px' }}
                                    title="Depuración (residente de costos / obra)"
                                  >
                                    {SEMAFORO.map(s => {
                                      const preDisp = (r.pre_interv_estado == null || r.pre_interv_estado === '') ? 'No Revisado' : r.pre_interv_estado
                                      const activo = preDisp === s.valor
                                      const esLegadoPre = (r.pre_interv_estado == null || r.pre_interv_estado === '')
                                      return (
                                        <div
                                          key={`tr-pre-${r.id}-${s.valor}`}
                                          onClick={() => puedePrevalidarUI && !activo && !esSellado(r) && cambiarPreIntervDirecto(r.id, s.valor)}
                                          style={{
                                            width: activo ? '15px' : '11px',
                                            height: activo ? '15px' : '11px',
                                            borderRadius: '50%',
                                            background: activo ? s.color : s.color + '33',
                                            border: `1.5px solid ${activo ? s.color : s.color + '55'}`,
                                            cursor: puedePrevalidarUI && !activo && !esSellado(r) ? 'pointer' : 'default',
                                            opacity: esSellado(r) ? 0.45 : (esLegadoPre ? 0.75 : 1),
                                          }}
                                        />
                                      )
                                    })}
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
                                      const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
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
                                  {[{valor:'Rechazado',label:'🔴'},{valor:'Pendiente',label:'🟡'},{valor:'Aprobado',label:'🟢'}].map(op => {
                                    const est = r.revisado || 'No Revisado'
                                    const clr = estadoColor(est)
                                    return (
                                      <button key={op.valor} title={op.valor}
                                        onClick={async (e) => { e.stopPropagation(); if (puedeValidar && !esSellado(r)) await cambiarEstadoDirecto(r.id, op.valor) }}
                                        style={{ background: est === op.valor ? clr : t.bgCard,
                                          border:`1.5px solid ${est === op.valor ? clr : t.border}`,
                                          borderRadius:'50%', width:'22px', height:'22px', fontSize:'var(--cc-sm)',
                                          cursor: puedeValidar && !esSellado(r) ? 'pointer' : 'default',
                                          display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                                        {op.label}
                                      </button>
                                    )
                                  })}
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
                    const res = await fetch(`${API}/presupuesto/${contratoId}/agregar-cantidad`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify(body)
                    })
                    if (res.ok) {
                      const newRow = await res.json()
                      setRegistros(prev => [...prev, newRow])
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
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:'12px' }}
          onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'min(1040px, 100%)',maxWidth:'100%',maxHeight:'min(80vh, 700px)',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px', gap:'10px', flexWrap:'wrap' }}>
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
                      }}
                    >✏️ Editar</button>
                  )
                })()}
              </div>
              <button onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }} style={{ background:'transparent',border:'none',fontSize:'var(--cc-lg)',cursor:'pointer',color:t.textMuted }}>✕</button>
            </div>
            {(() => {
              const r = modalDetallePpto
              const F = ({label, val, flex=1}) => (
                <div style={{ flex, minWidth:0 }}>
                  <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>{label}</div>
                  <div style={{ fontSize:'var(--cc-sm)',color:t.text,fontWeight:'500',marginTop:'1px',wordBreak:'break-word',overflowWrap:'anywhere' }}>{val ?? '—'}</div>
                </div>
              )
              const Row = ({children}) => (
                <div style={{ display:'flex',gap:'12px',background:t.bg,borderRadius:'6px',padding:'7px 10px',marginBottom:'5px' }}>{children}</div>
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
                      🔓 Como contratista puede editar capítulo/ítem y datos permitidos: al guardar se pedirá un motivo obligatorio, se anulará el sellado y el estado de Interventoría volverá a «No Revisado» para volver a validar.
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', alignItems:'start' }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:'5px', minWidth:0 }}>
                      <Row><F label="ID_POL" val={r.id_pol||r.pk_id}/><F label="CAPÍTULO" val={r.capitulo}/><F label="ÍTEM" val={r.item} flex={0.5}/></Row>
                      <BigF label="DESCRIPCIÓN" val={r.descripcion}/>
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
                      <Row><F label="TRAMO" val={r.tramo}/><F label="CALZADA" val={r.calzada}/><F label="PK" val={r.pk_id} flex={0.5}/></Row>
                    </div>
                  </div>
                  {/* Acciones desde buzón */}
                  {modalDetallePptoEditable && (puedeEditar || puedeEliminar) && (!esSellado(r) || puedeReabrirTrasAprob) && (
                    <div style={{ borderTop:`1px solid ${t.border}`, marginTop:'14px', paddingTop:'14px' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', alignItems:'stretch' }}>
                      {/* ── Editar dimensiones — ancho/espesor siempre con permiso; área/long solo sin CAD o contrato autorizado ── */}
                      {puedeEditarDimensiones && !esSellado(r) && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', minWidth:0 }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#F59E0B', letterSpacing:'0.5px', marginBottom:'8px' }}>📐 EDITAR DIMENSIONES</div>
                          <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, marginBottom:'10px', lineHeight:1.45 }}>
                            Ajuste <strong>ancho</strong> y <strong>espesor</strong>; al guardar se <strong>recalculan cantidad total y costo directo</strong> con el valor unitario del registro (sin requerir plano CAD).
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
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom: puedeEditarAreaLongNodInline() ? '10px' : '8px' }}>
                            <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                              <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ANCHO</span>
                              <input type="number" step="any" value={popupDims.ancho}
                                onChange={e => setPopupDims(d => ({...d, ancho: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            </label>
                            <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                              <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ESPESOR</span>
                              <input type="number" step="any" value={popupDims.espesor}
                                onChange={e => setPopupDims(d => ({...d, espesor: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            </label>
                          </div>
                          {puedeEditarAreaLongNodInline() && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'8px' }}>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>ÁREA / LONG / NOD</span>
                                <input type="number" step="any" value={popupDims.area_long_nod}
                                  onChange={e => setPopupDims(d => ({...d, area_long_nod: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                              </label>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>NODO INICIO</span>
                                <input type="text" value={popupDims.no_inicio}
                                  onChange={e => setPopupDims(d => ({...d, no_inicio: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                              </label>
                              <label style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                                <span style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700' }}>NODO FINAL</span>
                                <input type="text" value={popupDims.no_final}
                                  onChange={e => setPopupDims(d => ({...d, no_final: e.target.value}))}
                                  style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
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
                            // Actualización optimista inmediata
                            const optimisticRow = { ...r, ...body }
                            setModalDetallePpto(optimisticRow)
                            setRegistros(prev => prev.map(x => x.id === r.id ? optimisticRow : x))
                            setPopupMsg('✅ Dimensiones actualizadas')
                            _lastWriteAtRef.current = Date.now()
                            setPopupGuardando(true)
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const d = await res.json()
                              if (d && d.id) {
                                setModalDetallePpto(d)
                                setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(d))
                                setRegistros(prev => prev.map(x => x.id === d.id ? d : x))
                              }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                            } else {
                              // Revertir si falló
                              setModalDetallePpto(r)
                              setRegistros(prev => prev.map(x => x.id === r.id ? r : x))
                              setPopupMsg('❌ Error al guardar')
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
                            if (!(await adjuntarMotivoSiEdicionContratistaConInterv(r, body))) return
                            const optimisticRow = { ...r, ...body }
                            setModalDetallePpto(optimisticRow)
                            setRegistros(prev => prev.map(x => x.id === r.id ? optimisticRow : x))
                            _lastWriteAtRef.current = Date.now()
                            setPopupGuardando(true)
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body),
                            })
                            if (res.ok) {
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
                              setPopupMsg('❌ Error al guardar tipo de ejecución')
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
                            if (esSellado(r) && puedeReabrirTrasAprob) {
                              const com = await pedirComentario('reapertura', true)
                              if (com == null) { return }
                              motivoReap = String(com.mensaje || '').trim()
                              if (motivoReap.length < 15) { alert('El motivo de reapertura debe tener al menos 15 caracteres (visible para Interventoría).'); return }
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
                            }
                            if (!(await adjuntarMotivoSiEdicionContratistaConInterv(r, body))) { return }
                            // Actualización optimista inmediata
                            const optimisticRow = { ...r, ...body }
                            setModalDetallePpto(optimisticRow)
                            setRegistros(prev => prev.map(x => x.id === r.id ? optimisticRow : x))
                            setPopupMsg('✅ Capítulo/ítem actualizado')
                            _lastWriteAtRef.current = Date.now()
                            setPopupGuardando(true)
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const d = await res.json()
                              if (d && d.id) {
                                setModalDetallePpto(d)
                                setModalDetallePptoEditable(puedeEditarFilaPptoNoSelladoOReabrir(d))
                                setRegistros(prev => prev.map(x => x.id === d.id ? d : x))
                              }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                            } else {
                              // Revertir si falló
                              setModalDetallePpto(r)
                              setRegistros(prev => prev.map(x => x.id === r.id ? r : x))
                              try { const d = await res.json(); setPopupMsg(`❌ ${d.detail || 'Error al guardar'}`) } catch { setPopupMsg('❌ Error al guardar') }
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
                        <button onClick={async () => {
                          if (bloqueaDarDeBajaDesdeWeb(r)) {
                            window.alert(MSG_BAJA_DESDE_PLANO)
                            return
                          }
                          if (!window.confirm('¿Dar de baja este registro?')) return
                          setModalDetallePpto(null); setModalDetallePptoEditable(false)
                          await darDeBaja(r.id)
                        }}
                          style={{ background:'#EF444418', border:'1px solid #EF444444', borderRadius:'8px', padding:'8px 16px', fontSize:'var(--cc-sm)', fontWeight:'700', color:'#EF4444', cursor:'pointer' }}>
                          🗑️ Dar de baja
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
        const minLen  = (modalComentario.tipo === 'reapertura' || modalComentario.tipo === 'contratista_edita_interv') ? 15 : 1
        const valido  = !modalComentario.obligatorio || textoComentario.trim().length >= minLen
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:6000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'28px',width:'460px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ fontSize:'var(--cc-body)',fontWeight:'700',color,marginBottom:'6px' }}>{TITULOS[modalComentario.tipo] || TITULOS.validacion}</div>
              <div style={{ fontSize:'var(--cc-sm)',color:t.textMuted,marginBottom:'16px' }}>
                {modalComentario.tipo === 'reapertura' ? (
                  <>⚠️ Obligatorio (mín. 15 caracteres). Queda registrado para Interventoría: el registro pasa a «No Revisado» y deja de estar sellado.</>
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
                  NOTIFICAR A (opcional)
                </div>
                <select value={destinatarioComentario} onChange={e => setDestinatarioComentario(e.target.value)}
                  style={{ width:'100%',background:t.inputBg,border:`1.5px solid ${t.border}`,borderRadius:'8px',padding:'8px 12px',color:destinatarioComentario ? t.text : t.textMuted,fontSize:'var(--cc-label)',cursor:'pointer' }}>
                  <option value="">— Sin notificación —</option>
                  {usuariosDestinatarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} · {u.cargo}</option>
                  ))}
                </select>
              </div>
              <div style={{ position:'relative' }}>
                <textarea id="textarea-comentario" autoFocus value={textoComentario} onChange={e => setTextoComentario(e.target.value)}
                  placeholder="Escribe aquí el motivo o comentario..."
                  style={{ width:'100%',minHeight:'100px',background:t.inputBg,border:`1.5px solid ${color}66`,borderRadius:'8px',padding:'10px',color:t.text,fontSize:'var(--cc-label)',resize:'vertical',boxSizing:'border-box' }} />
                <div style={{ position:'absolute', bottom:'8px', right:'8px' }}>
                  <EmojiPicker t={t} onSelect={em => setTextoComentario(prev => prev + em)} />
                </div>
              </div>
              {modalComentario.obligatorio && textoComentario.trim().length < minLen && (
                <div style={{ fontSize:'var(--cc-sm)',color:'#EF4444',marginTop:'4px' }}>* {(modalComentario.tipo === 'reapertura' || modalComentario.tipo === 'contratista_edita_interv') ? `Mínimo ${minLen} caracteres` : 'Este campo es obligatorio'}</div>
              )}
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'18px' }}>
                <button onClick={() => { modalComentario.resolve(null); setModalComentario(null) }}
                  style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'var(--cc-label)',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
                <button onClick={() => {
                  if (!valido) return;
                  modalComentario.resolve({ mensaje: textoComentario, destinatarioId: destinatarioComentario || null });
                  setModalComentario(null);
                }}
                  disabled={!valido}
                  style={{ background:valido?color:'#999',color:'#fff',border:'none',borderRadius:'8px',padding:'9px 22px',fontSize:'var(--cc-label)',fontWeight:'700',cursor:valido?'pointer':'not-allowed' }}>
                  {modalComentario.obligatorio ? '✓ Confirmar' : '✓ Continuar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
                    await fetch(`${API}/presupuesto/${contratoId}/comentarios/bulk`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                      body: JSON.stringify({
                        presupuesto_ids: [modalHilo.registroId],
                        tipo: modalHilo.tipo,
                        mensaje: nuevoComentTexto.trim(),
                        usuario_nombre: usuario?.nombre || 'Usuario',
                      })
                    })
                    const msg = nuevoComentTexto.trim()
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

      {/* ── Auditoría: cantidades migradas desde SicoeCAD (cliente) → cola / sincro con el DWG (cad_queue) ── */}
      {sincroSicoeModal && (() => {
        const a = sincroSicoeModal
        const nRec = a.insertados
        const nDwg = a.enviados
        const coinciden = nDwg == null || nDwg === nRec
        const cerrar = async () => {
          setSincroSicoeModal(null)
          try {
            await fetch(`${API}/presupuesto/${contratoId}/sincro-sicoe-cad-auditoria/ack`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${getToken()}` }
            })
          } catch { /* ignore */ }
        }
        return (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.68)', zIndex:4100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sincro-sicoe-titulo"
          >
            <div
              style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:16, padding:26, width:500, maxWidth:'96vw', boxShadow:'0 24px 64px rgba(0,0,0,0.45)' }}
              onClick={e => e.stopPropagation()}
            >
              <div id="sincro-sicoe-titulo" style={{ fontSize:'var(--cc-label)', fontWeight:800, letterSpacing:0.6, color:t.primary, marginBottom:6 }}>AUDITORÍA SICOECAD — COLA CAD</div>
              <div style={{ fontSize:'var(--cc-lg)', fontWeight:800, color:t.text, marginBottom:10, lineHeight:1.35 }}>
                <strong>ClaraCore</strong> está recibiendo{' '}
                <strong style={{ color:t.primary }}>{nRec.toLocaleString('es-CO')}</strong> registro{nRec !== 1 ? 's' : ''} de presupuesto
                procedente de <strong>SicoeCAD</strong> (migración de cantidades desde el DWG hacia el servidor, en línea con la cola de operaciones hacia / desde AutoCAD, <em>cad_queue</em>).
              </div>
              <div style={{ background:t.bg, borderRadius:10, padding:14, marginBottom:14, border:`1px solid ${t.border}`, fontSize:'var(--cc-body)', color:t.text }}>
                {nDwg != null && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:0 }}>
                  <div style={{ padding:10, borderRadius:8, background:t.primary+'12', border:`1px solid ${t.primary}44` }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Indicado desde el DWG (SicoeCAD)</div>
                    <div style={{ fontSize:'var(--cc-h2)', fontWeight:800, color:t.primary }}>{nDwg.toLocaleString('es-CO')}</div>
                  </div>
                  <div style={{ padding:10, borderRadius:8, background: coinciden ? '#16A34A18' : '#F59E0B22', border:`1px solid ${coinciden ? '#16A34A55' : '#F59E0B55'}` }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Almacenados en ClaraCore</div>
                    <div style={{ fontSize:'var(--cc-h2)', fontWeight:800, color: coinciden ? '#16A34A' : '#D97706' }}>{nRec.toLocaleString('es-CO')}</div>
                  </div>
                </div>
                )}
                {nDwg == null && (
                  <div style={{ padding:10, borderRadius:8, background:'#0EA5E918', border:'1px solid #0EA5E944' }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Registros almacenados en esta sincronización</div>
                    <div style={{ fontSize:'var(--cc-h1)', fontWeight:800, color:'#0284C7' }}>{nRec.toLocaleString('es-CO')}</div>
                    <div style={{ fontSize:'var(--cc-label)', color:t.textMuted, marginTop:6 }}>Para cruzar cifra a cifra con el DWG, el conector puede enviar la cabecera <code style={{ fontSize:'var(--cc-caption)' }}>X-SicoeCAD-Enviados</code> con el conteo leído en el pliego.</div>
                  </div>
                )}
                {nDwg != null && !coinciden && (
                  <div style={{ marginTop:12, padding:10, background:'#FEF3C7', border:'1px solid #FCD34D', borderRadius:8, fontSize:'var(--cc-sm)', color:'#92400E' }}>
                    <strong>Atención:</strong> el conteo reportado por el DWG y el almacenado en ClaraCore no coinciden. Revise trazas de red, claves duplicadas o entidades excluidas al migrar.
                  </div>
                )}
              </div>
              <p style={{ fontSize:'var(--cc-sm)', color:t.textMuted, lineHeight:1.5, marginBottom:16 }}>
                Sirve para auditar qué salió del DWG y qué quedó persistido en la base, en el mismo flujo en que <strong>cad_queue</strong> conecta SicoeCAD con ClaraCore.
              </p>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button type="button" onClick={cerrar} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', fontSize:'var(--cc-label)', fontWeight:700, cursor:'pointer' }}>Entendido</button>
              </div>
            </div>
          </div>
        )
      })()}

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

      {!verPapelera && exportPresupuestoOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !exportPresupuestoBusy && setExportPresupuestoOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: t.bgCard,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              boxShadow: '0 28px 90px rgba(0,0,0,0.55)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${t.border}`,
                background: '#0F1923',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#fff' }}>📥 Exportar informe Excel</div>
                <div style={{ fontSize: 'var(--cc-sm)', color: '#94A3B8', marginTop: 2 }}>
                  Resumen + soporte de cantidades por ítem
                </div>
              </div>
              <button
                type="button"
                onClick={() => !exportPresupuestoBusy && setExportPresupuestoOpen(false)}
                style={{ background: 'transparent', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 'var(--cc-title)' }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, marginBottom: 10 }}>
                ¿Qué desea descargar?
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `2px solid ${exportPresupuestoModo === 'presupuesto_obra' ? t.primary : t.border}`,
                  background: exportPresupuestoModo === 'presupuesto_obra' ? `${t.primary}12` : t.bg,
                  cursor: exportPresupuestoBusy ? 'wait' : 'pointer',
                  marginBottom: 10,
                }}
              >
                <input
                  type="radio"
                  name="exportPresupuestoModo"
                  value="presupuesto_obra"
                  checked={exportPresupuestoModo === 'presupuesto_obra'}
                  onChange={() => setExportPresupuestoModo('presupuesto_obra')}
                  disabled={exportPresupuestoBusy}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 800, color: t.text }}>a) Presupuesto de obra</div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                    Cantidad total subida y calculada por ítem. Costo directo = cantidad × valor unitario.
                  </div>
                </div>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `2px solid ${exportPresupuestoModo === 'obra_ejecutada' ? t.primary : t.border}`,
                  background: exportPresupuestoModo === 'obra_ejecutada' ? `${t.primary}12` : t.bg,
                  cursor: exportPresupuestoBusy ? 'wait' : 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="exportPresupuestoModo"
                  value="obra_ejecutada"
                  checked={exportPresupuestoModo === 'obra_ejecutada'}
                  onChange={() => setExportPresupuestoModo('obra_ejecutada')}
                  disabled={exportPresupuestoBusy}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 800, color: t.text }}>b) Obra ejecutada</div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                    Solo cantidades aprobadas por Interventoría (nivel máximo de validación).
                  </div>
                </div>
              </label>
              <p style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, margin: '14px 0 0', lineHeight: 1.4 }}>
                Alcance: <strong style={{ color: t.text }}>{exportEstimado.alcance || '—'}</strong>
              </p>
              {exportEstimado.cargando && (
                <p style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, margin: '8px 0 0' }}>Calculando tamaño de la descarga…</p>
              )}
              {exportEstimado.esGrande && !exportEstimado.cargando && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#FEF3C7',
                    border: '1px solid #F59E0B',
                    color: '#92400E',
                    fontSize: 'var(--cc-sm)',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>⏳ Descarga que puede demorar</strong>
                  <div style={{ marginTop: 4 }}>
                    El volumen es grande ({exportEstimado.registros != null ? `${exportEstimado.registros.toLocaleString('es-CO')} registros` : 'muchos registros'}).
                    La generación del Excel puede tardar varios minutos. Para una descarga más rápida, filtre por capítulo o ítem en el panel izquierdo antes de exportar.
                  </div>
                </div>
              )}
              {!exportEstimado.esGrande && !exportEstimado.cargando && exportEstimado.registros != null && (
                <p style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, margin: '8px 0 0', lineHeight: 1.4 }}>
                  Tip: seleccione capítulo/ítem en el panel «Presupuesto por capítulo» para exportar solo ese alcance.
                </p>
              )}
              {exportPresupuestoError && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: 'var(--cc-sm)' }}>
                  {exportPresupuestoError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setExportPresupuestoOpen(false)}
                  disabled={exportPresupuestoBusy}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: t.textMuted,
                    fontSize: 'var(--cc-sm)',
                    cursor: exportPresupuestoBusy ? 'wait' : 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void descargarPresupuestoExcel()}
                  disabled={exportPresupuestoBusy}
                  style={{
                    background: exportPresupuestoBusy ? '#94a3b8' : t.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 700,
                    cursor: exportPresupuestoBusy ? 'wait' : 'pointer',
                  }}
                >
                  {exportPresupuestoBusy ? '⏳ Generando…' : '⬇ Descargar Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
          onBuscar={(fSnap) => aplicarFiltroObraConF(fSnap || fObraRef.current || fObra)}
          onLimpiar={limpiarFiltroObra}
          listadoPrecios={listadoPrecios}
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
                  : `${conteoFiltro != null ? conteoFiltro.toLocaleString('es-CO') : registros.length} en contrato · ${registrosFiltrados.length} filtrados (vista)`} · {seleccionados.size} seleccionados
              </span>
            </>
          )}
          onActualizar={() => recargarCapActual(drill.length === 0)}
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
        />
      )}
      {verPapelera && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:12, marginBottom:10, color:t.textMuted, fontSize:'var(--cc-sm)' }}>Papelera: use «Actualizar»; el filtrado avanzado aplica al volver a activos.</div>
      )}
      {((conteoFiltro != null && registros.length > 0) || (!verPapelera && registrosFiltrados.length > 0)) && (
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, marginBottom:10 }}>
          {conteoFiltro != null && registros.length > 0 && (
            <div style={{ fontSize:'var(--cc-sm)', fontWeight:700, color:t.primary }}>
              Coincidencias (servidor): {conteoFiltro.toLocaleString('es-CO')}
            </div>
          )}
          {!verPapelera && registrosFiltrados.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setModalResumenValidacion(true)}
                style={{ background:'#0D948818', border:'1px solid #0D9488', borderRadius:8, padding:'7px 14px', fontSize:'var(--cc-sm)', fontWeight:700, color:'#0D9488', cursor:'pointer' }}
                title="Informe de estados según el mismo conjunto de filas que ve la grilla (filtro actual)"
              >
                📊 Resumen de validación
              </button>
              <div
                role="group"
                aria-label="Totales de la vista filtrada"
                style={{
                  display:'flex',
                  flexWrap:'wrap',
                  alignItems:'stretch',
                  gap:14,
                  padding:'10px 16px',
                  borderRadius:10,
                  border:`2px solid ${t.primary}33`,
                  background:`linear-gradient(180deg, ${t.bgCard} 0%, ${t.bg} 100%)`,
                  boxShadow:'0 1px 3px rgba(0,0,0,0.08)',
                  flex:'1 1 520px',
                  minWidth:320,
                  maxWidth:'100%',
                }}
              >
                <div style={{
                  flex:'1 1 280px',
                  minWidth:220,
                  maxWidth:'min(720px, 100%)',
                  paddingRight:8,
                  borderRight:`1px solid ${t.border}`,
                  alignSelf:'stretch',
                  display:'flex',
                  alignItems:'center',
                }}>
                  <div style={{
                    fontSize:'var(--cc-sm)',
                    fontWeight:800,
                    color:t.text,
                    lineHeight:1.4,
                    wordBreak:'break-word',
                  }}>
                    {etiquetaTituloVistaFiltrada}
                  </div>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:14, flex:'1 1 260px' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Registros</span>
                  <span style={{ fontSize:'var(--cc-md)', fontWeight:800, color:t.primary, lineHeight:1.2 }}>
                    {resumenValidacionVista.total.toLocaleString('es-CO')}
                  </span>
                </div>
                <div style={{ width:1, height:28, background:t.border, alignSelf:'center' }} />
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Cant. total (suma)</span>
                  <span style={{ fontSize:'var(--cc-md)', fontWeight:800, color:t.text, lineHeight:1.2 }}>
                    {fmtN(resumenValidacionVista.cantTotalAcum)}
                  </span>
                </div>
                <div style={{ width:1, height:28, background:t.border, alignSelf:'center' }} />
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:'var(--cc-caption)', fontWeight:700, color:t.textMuted }}>Costo directo</span>
                  <span style={{ fontSize:'var(--cc-md)', fontWeight:800, color:t.primary, lineHeight:1.2 }}>
                    {nivelInfo.verValoresEconomicos ? fmt(resumenValidacionVista.costoAcum) : '—'}
                  </span>
                </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {modalResumenValidacion && (() => {
        const { porRevisado, porPreInterv, total, costoAcum, cantTotalAcum } = resumenValidacionVista
        const filas = (estados, data) => {
          const visto = new Set()
          const out = []
          for (const s of estados) {
            if (data[s.valor] != null) { out.push(s.valor); visto.add(s.valor) }
          }
          for (const k of Object.keys(data)) { if (!visto.has(k)) out.push(k) }
          return out
        }
        const filasInt = filas(SEMAFORO, porRevisado)
        const filasDep = filas(SEMAFORO, porPreInterv)
        const thS = { padding:'6px 10px', textAlign:'left', fontSize: 'var(--cc-label)', color:t.textMuted, borderBottom:`1px solid ${t.border}` }
        const rowS = (k, d) => {
          const meta = SEMAFORO.find(s => s.valor === k) || { label:'', color:'#94A3B8' }
          const pct = total > 0 ? Math.round((d.count / total) * 1000) / 10 : 0
          return (
            <tr key={k} style={{ borderBottom:`1px solid ${t.border}33` }}>
              <td style={{ ...thS, fontWeight:700, color:t.text, border:0, padding:'8px 10px' }}><span style={{ marginRight:6 }}>{meta.label || '•'}</span> {k}</td>
              <td style={{ ...thS, border:0, padding:'8px 10px', textAlign:'right' }}>{d.count.toLocaleString('es-CO')}</td>
              <td style={{ ...thS, border:0, padding:'8px 10px', textAlign:'right' }}>{pct}%</td>
              {nivelInfo.verValoresEconomicos && (
                <td style={{ ...thS, border:0, padding:'8px 10px', textAlign:'right', color:t.primary, fontWeight:600 }}>{fmt(d.costo)}</td>
              )}
            </tr>
          )
        }
        const nCol = nivelInfo.verValoresEconomicos ? 4 : 3
        return (
          <div
            style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', zIndex:4500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
            onClick={() => setModalResumenValidacion(false)}
            role="presentation"
          >
            <div
              style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:14, padding:22, width:560, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.45)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, gap:12 }}>
                <div>
                  <div style={{ fontSize:'var(--cc-md)', fontWeight:800, color:t.primary }}>📋 Resumen de validación (filtro actual)</div>
                  <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted, marginTop:6, lineHeight:1.45 }}>
                    Mismas filas que la grilla visible (búsqueda, capítulo, ítem, mapa, etc., incl. filtros extra en memoria). No es un total de contrato completo a menos que el filtro abarque todo.
                  </div>
                </div>
                <button type="button" onClick={() => setModalResumenValidacion(false)} style={{ background:'transparent', border:'none', fontSize:'var(--cc-h1)', cursor:'pointer', color:t.textMuted, lineHeight:1 }}>✕</button>
              </div>
              <div style={{ fontSize:'var(--cc-body)', color:t.text, marginBottom:14, padding:10, background:t.bg, borderRadius:8, border:`1px solid ${t.border}` }}>
                <strong>{total.toLocaleString('es-CO')}</strong> reg. · <strong>Cant. total (suma):</strong> {fmtN(cantTotalAcum)} · <strong>Costo directo (suma):</strong> {nivelInfo.verValoresEconomicos ? fmt(costoAcum) : '— (rol sin valores)'}
              </div>
              <div style={{ fontSize:'var(--cc-sm)', fontWeight:800, color:t.text, marginBottom:6 }}>Interventoría — revisado (semáforo en obra)</div>
              <div style={{ overflowX:'auto', marginBottom:18 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--cc-sm)' }}>
                  <thead>
                    <tr style={{ background:t.bg }}>
                      <th style={thS}>Estado</th>
                      <th style={{ ...thS, textAlign:'right' }}>Registros</th>
                      <th style={{ ...thS, textAlign:'right' }}>%</th>
                      {nivelInfo.verValoresEconomicos && <th style={{ ...thS, textAlign:'right' }}>Costo dir.</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filasInt.length === 0
                      ? <tr><td colSpan={nCol} style={{ padding:12, color:t.textMuted, fontSize:'var(--cc-sm)' }}>Sin datos</td></tr>
                      : filasInt.map((k) => rowS(k, porRevisado[k]))}
                  </tbody>
                </table>
              </div>
              {mostrarColumnaDepuracion && (
                <>
                  <div style={{ fontSize:'var(--cc-sm)', fontWeight:800, color:t.text, marginBottom:6 }}>Depuración (residente de costos / obra) — pre-Interventoría</div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--cc-sm)' }}>
                      <thead>
                        <tr style={{ background:t.bg }}>
                          <th style={thS}>Estado</th>
                          <th style={{ ...thS, textAlign:'right' }}>Registros</th>
                          <th style={{ ...thS, textAlign:'right' }}>%</th>
                          {nivelInfo.verValoresEconomicos && <th style={{ ...thS, textAlign:'right' }}>Costo dir.</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filasDep.length === 0
                          ? <tr><td colSpan={nCol} style={{ padding:12, color:t.textMuted, fontSize:'var(--cc-sm)' }}>Sin datos</td></tr>
                          : filasDep.map((k) => rowS(k, porPreInterv[k]))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div style={{ marginTop:16, textAlign:'right' }}>
                <button type="button" onClick={() => setModalResumenValidacion(false)} style={{ background:t.primary, color:'#fff', border:'none', borderRadius:8, padding:'9px 22px', fontSize:'var(--cc-label)', fontWeight:700, cursor:'pointer' }}>Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {((!verPapelera && capitulosResumen.length > 0) || registros.length > 0) && (puedeEditar || puedeValidar) && (
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'10px',padding:'10px 14px',marginBottom:'10px',boxShadow:t.shadow,display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center' }}>
          {seleccionados.size > 0 && (
            <>
              <span style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color:t.primary,background:t.primary+'18',borderRadius:'20px',padding:'3px 10px',whiteSpace:'nowrap' }}>
                {seleccionados.size} sel.
              </span>

              {puedeEditar && (<>
                {/* Capítulo */}
                <select value={editCapitulo}
                  onChange={e => { setEditCapitulo(e.target.value); setEditItem(''); setItemBusqueda(''); setItemDropOpen(false) }}
                  style={{ background:t.inputBg,border:`1.5px solid ${editCapitulo?t.primary:t.border}`,borderRadius:'7px',padding:'5px 10px',color:editCapitulo?t.text:t.textMuted,fontSize:'var(--cc-sm)',cursor:'pointer',maxWidth:'180px' }}>
                  <option value="">Capítulo…</option>
                  {capitulosListado.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Buscador predictivo de ítem */}
                <div style={{ position:'relative' }}>
                  <input
                    value={itemBusqueda}
                    onChange={e => { setItemBusqueda(e.target.value); setItemDropOpen(true); setItemNavIdx(-1); if (!e.target.value) setEditItem('') }}
                    onFocus={() => setItemDropOpen(true)}
                    onBlur={() => setTimeout(() => { setItemDropOpen(false); setItemNavIdx(-1) }, 180)}
                    onKeyDown={e => {
                      const filtrados = itemsListado.filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase())).slice(0, 30)
                      if (e.key === 'ArrowDown') { e.preventDefault(); setItemNavIdx(i => { const n = Math.min(i + 1, filtrados.length - 1); setTimeout(() => { const el = itemDropRef.current?.children[n]; el?.scrollIntoView({ block:'nearest' }) }, 0); return n }) }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setItemNavIdx(i => { const n = Math.max(i - 1, 0); setTimeout(() => { const el = itemDropRef.current?.children[n]; el?.scrollIntoView({ block:'nearest' }) }, 0); return n }) }
                      else if (e.key === 'Enter' && itemNavIdx >= 0 && filtrados[itemNavIdx]) {
                        const p = filtrados[itemNavIdx]
                        setEditItem(p.item_numero); setItemBusqueda(`${p.item_numero} · ${p.descripcion}`); setItemDropOpen(false); setItemNavIdx(-1)
                      }
                      else if (e.key === 'Escape') { setItemDropOpen(false); setItemNavIdx(-1) }
                    }}
                    placeholder={editCapitulo ? 'Buscar ítem…' : 'Primero selecciona capítulo'}
                    disabled={!editCapitulo}
                    style={{ background:t.inputBg,border:`1.5px solid ${editItem?t.primary:t.border}`,borderRadius:'7px',padding:'5px 10px',color:t.text,fontSize:'var(--cc-sm)',width:'280px',opacity:editCapitulo?1:0.45,cursor:editCapitulo?'text':'not-allowed' }}
                  />
                  {itemDropOpen && editCapitulo && itemBusqueda.length > 0 && (
                    <div ref={itemDropRef} style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:999,background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'8px',boxShadow:'0 8px 24px rgba(0,0,0,0.2)',maxHeight:'220px',overflowY:'auto',marginTop:'3px' }}>
                      {itemsListado
                        .filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase()))
                        .slice(0, 80)
                        .map((p, idx) => (
                          <div key={p.id}
                            onMouseDown={() => { setEditItem(p.item_numero); setItemBusqueda(`${p.item_numero} · ${p.descripcion}`); setItemDropOpen(false); setItemNavIdx(-1) }}
                            onMouseEnter={() => setItemNavIdx(idx)}
                            style={{ padding:'8px 12px', fontSize:'var(--cc-sm)', cursor:'pointer', borderBottom:`1px solid ${t.border}`, color: idx === itemNavIdx ? '#fff' : t.text, background: idx === itemNavIdx ? t.primary : 'transparent', transition:'background 0.1s' }}>
                            <strong>{p.item_numero}</strong> · {p.descripcion}
                          </div>
                        ))}
                      {itemsListado.filter(p => `${p.item_numero} ${p.descripcion}`.toLowerCase().includes(itemBusqueda.toLowerCase())).length === 0 && (
                        <div style={{ padding:'10px 12px',fontSize:'var(--cc-sm)',color:t.textMuted }}>Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Vlr unit badge */}
                {precioSeleccionado && (
                  <span style={{ fontSize:'var(--cc-sm)',fontWeight:'700',color:t.primary,background:t.primary+'18',borderRadius:'7px',padding:'5px 10px',whiteSpace:'nowrap' }}>
                    {fmt(precioSeleccionado.precio_unitario)}
                  </span>
                )}

                <button onClick={() => hayModificaciones && setModalConfirm(true)}
                  disabled={!hayModificaciones}
                  style={{ background:hayModificaciones?t.primary:t.border,color:hayModificaciones?'#fff':t.textMuted,border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'var(--cc-sm)',fontWeight:'700',cursor:hayModificaciones?'pointer':'not-allowed',whiteSpace:'nowrap' }}>
                  🔄 Recalcular
                </button>
              </>)}

              {puedeEliminar && !verPapelera && seleccionados.size > 1 && (
                <button onClick={async () => {
                  const idsBaja = [...seleccionados].filter(id => !esSellado(registros.find(rr => rr.id === id)))
                  if (idsBaja.length === 0) {
                    alert('Los registros seleccionados están sellados (aprobados por Interventoría) y no pueden modificarse.')
                    return
                  }
                  if (!validarDarDeBajaIds(idsBaja, (id) => registros.find((rr) => rr.id === id))) return
                  const comentarioData = await pedirComentario('validacion', true)
                  if (comentarioData === null) return
                  const comentario = comentarioData?.mensaje || ''
                  for (const id of idsBaja) {
                    const res = await fetch(`${API}/presupuesto/item/${id}/dar-baja`, {
                      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) await crearComentarios([id], 'validacion', `[BAJA MASIVA] ${comentario}`)
                  }
                  setSeleccionados(new Set())
                  await recargarCapActual()
                }}
                style={{ background:'#EF444415', border:'1px solid #EF444466', borderRadius:'7px', padding:'6px 14px', color:'#EF4444', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                  🗑️ Dar de baja ({seleccionados.size})
                </button>
              )}

              {puedeValidar && (<>
                <select value={bulkEstado} onChange={e => setBulkEstado(e.target.value)}
                  style={{ background:t.inputBg, border:`1.5px solid ${bulkEstado ? estadoColor(bulkEstado) : t.border}`, borderRadius:'7px', padding:'5px 10px', color:bulkEstado ? estadoColor(bulkEstado) : t.textMuted, fontSize:'var(--cc-sm)', cursor:'pointer', fontWeight: bulkEstado ? '700' : '400' }}>
                  <option value="">Estado…</option>
                  {SEMAFORO.map(s => <option key={s.valor} value={s.valor}>{s.label} {s.valor}</option>)}
                </select>
                <button onClick={ejecutarBulkEstado}
                  disabled={!bulkEstado || guardandoBulk}
                  style={{ background:bulkEstado?'#16A34A':t.border,color:bulkEstado?'#fff':t.textMuted,border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'var(--cc-sm)',fontWeight:'700',cursor:bulkEstado?'pointer':'not-allowed',whiteSpace:'nowrap' }}>
                  ✓ Aplicar
                </button>
              </>)}

              {puedePrevalidarUI && (<>
                <span style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.textMuted, whiteSpace:'nowrap' }} title="Residente de Costos u Obra — antes de Interventoría">Depuración → Interv.</span>
                <select value={bulkPreInterv} onChange={e => setBulkPreInterv(e.target.value)}
                  style={{ background:t.inputBg, border:`1.5px solid ${bulkPreInterv ? estadoColor(bulkPreInterv) : t.border}`, borderRadius:'7px', padding:'5px 10px', color:bulkPreInterv ? estadoColor(bulkPreInterv) : t.textMuted, fontSize:'var(--cc-sm)', cursor:'pointer', fontWeight: bulkPreInterv ? '700' : '400' }}>
                  <option value="">Depuración…</option>
                  {SEMAFORO.map(s => <option key={s.valor} value={s.valor}>{s.label} {s.valor}</option>)}
                </select>
                <button onClick={ejecutarBulkPreInterv}
                  disabled={!bulkPreInterv || guardandoBulk}
                  style={{ background:bulkPreInterv?'#0D9488':t.border,color:bulkPreInterv?'#fff':t.textMuted,border:'none',borderRadius:'7px',padding:'6px 14px',fontSize:'var(--cc-sm)',fontWeight:'700',cursor:bulkPreInterv?'pointer':'not-allowed',whiteSpace:'nowrap' }}>
                  ✓ Depuración
                </button>
              </>)}
            </>
          )}
        </div>
      )}

      {/* Carga / sin datos: dashboard drill oculto; filtros SICOE Obra arriba */}
      {(loading || loadingCapitulos) ? (
        <div style={s.emptyState}>{loadingCapitulos ? '⏳ Cargando presupuesto...' : '⏳ Cargando capítulo...'}</div>
      ) : (verPapelera ? registros.length === 0 : (capitulosResumen.length === 0 && registros.length === 0)) ? (
        <div style={s.emptyState}>📂 Importa un CSV para comenzar</div>
      ) : null}

      {/* ── Barra Editar / Validar ── */}
      {/* ── Indicador DWG ─────────────────────────────────────────── */}
<div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', flexWrap:'wrap' }}>
        {puedeEliminar && (
          <button onClick={async () => { const v = !verPapelera; setVerPapelera(v); if (v) { _pptoCacheRef.current = null; cargarRegistros(true) } else { setRegistros([]); setDrill([]); await cargarCapitulos() } }}
            style={{ background: verPapelera ? '#EF444422' : t.bgCard, border:`1px solid ${verPapelera ? '#EF4444' : t.border}`, borderRadius:'8px', padding:'6px 14px', color: verPapelera ? '#EF4444' : t.textMuted, fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer' }}>
            🗑️ {verPapelera ? 'Ver activos' : 'Papelera'}
          </button>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 14px',
          background: dwgEnlazado ? '#16A34A18' : '#EF444418',
          border: `1px solid ${dwgEnlazado ? '#16A34A44' : '#EF444444'}`,
          borderRadius:'8px', fontSize:'var(--cc-sm)', color: dwgEnlazado ? '#16A34A' : '#EF4444',
          fontWeight:'600' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%',
            background: dwgEnlazado ? '#16A34A' : '#EF4444',
            boxShadow: dwgEnlazado ? '0 0 6px #16A34A' : 'none' }} />
          {dwgEnlazado ? '🔗 DWG Enlazado — Semáforo y edición activos' : '⛓️ Sin DWG — Semáforo y edición deshabilitados'}
        </div>
      </div>
      {/* ── Tabla ── */}
      {(drill.length > 0 || busquedaTipo || filtroEstado || pkidsSeleccionados.length > 0 || !!ubicacionTramo || !!ubicacionCalzada || criterioVistaActivo(fObra)) && registrosFiltrados.length > 0 && (
        <div ref={pptoTablaScrollRef} style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',overflow:'auto',boxShadow:t.shadow }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'var(--cc-sm)' }}>
            <thead style={{ background:t.bg }}>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={idsPaginaNoSellados.length > 0 && idsPaginaNoSellados.every(id => seleccionados.has(id))} onChange={toggleTodos} /></th>
                <th style={thStyle}>ID_POL</th>
                <th style={thStyle}>Capítulo</th>
                <th style={thStyle}>Competencia</th>
                <th style={thStyle}>Ítem</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Und</th>
                <th style={thStyle} title={puedeEditarNodosGrilla ? 'Edite con la fila seleccionada y Aplicar cambios (Desarrollador o editor en contrato autorizado)' : undefined}>No.Ini</th>
                <th style={thStyle} title={puedeEditarNodosGrilla ? 'Edite con la fila seleccionada y Aplicar cambios (Desarrollador o editor en contrato autorizado)' : undefined}>No.Fin</th>
                <th style={thStyle}>Área/Long</th>
                <th style={thStyle}>Ancho</th>
                <th style={thStyle}>Espesor</th>
                <th style={thStyle}>Cant.Total</th>
                <th style={thStyle}>Vlr Unit.</th>
                <th style={thStyle}>Costo Directo</th>
                {mostrarColumnaDepuracion && (
                  <th style={thStyle} title="Residente de Costos u Obra — antes de Interventoría">Depuración</th>
                )}
                <th style={thStyle}>Revisado</th>
                <th style={thStyle} title="Trazabilidad / auditoría">📜</th>
                <th style={thStyle}>💬</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {registrosPagina.map(r => {
                const bgSellado = esSellado(r) ? 'rgba(22,101,52,0.06)' : 'transparent'
                return (
                  <tr key={r.id} data-id={r.id} style={{ background: filaZoom===r.id ? '#F59E0B22' : seleccionados.has(r.id) ? (t.primary+'18') : bgSellado, cursor: r.x_label ? 'crosshair' : 'default', outline: filaZoom===r.id ? '2px solid #F59E0B88' : 'none', transition:'background 0.3s, outline 0.3s' }}
                    onClick={() => { zoomEnDwg(r); highlightEnDwg(r); if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && r.pk_id) { const td = document.getElementById(`zoom-feedback-${r.id}`); if(td){td.style.opacity='1'; setTimeout(()=>{td.style.opacity='0'},2000)} } }}>
                    <td style={{...tdStyle, whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <input type="checkbox" checked={seleccionados.has(r.id)} disabled={esSellado(r)} onChange={() => toggleSel(r.id)}
                          style={{ cursor: esSellado(r) ? 'not-allowed' : 'pointer', opacity: esSellado(r) ? 0.45 : 1 }} />
                        <span id={`zoom-feedback-${r.id}`} style={{ fontSize:'var(--cc-caption)', color:'#10B981', opacity:'0', transition:'opacity 0.3s', pointerEvents:'none' }}>🎯</span>
                        <button onClick={() => abrirDetallePptoDesdeFila(r)}
                          title="Ver detalle"
                          style={{ background:'transparent', border:'none', cursor:'pointer', color:t.textMuted, fontSize:'var(--cc-label)', padding:'0', lineHeight:1, display:'flex', alignItems:'center' }}
                          onMouseEnter={e => e.currentTarget.style.color=t.primary}
                          onMouseLeave={e => e.currentTarget.style.color=t.textMuted}>
                          ℹ️
                        </button>
                      </div>
                    </td>
                    <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                      <span
                        onClick={() => abrirDetallePptoDesdeFila(r)}
                        title="Ver detalle"
                        style={{ fontWeight:'600', color:t.primary, cursor:'pointer', textDecoration:'underline' }}>
                        {r.id_pol||r.pk_id||'-'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.capitulo || ''}>{r.capitulo}</td>
                    <td style={{ ...tdStyle, fontSize:'var(--cc-sm)', color:t.textMuted }}>{r.competencia||'—'}</td>
                    <td style={tdStyle}>{r.item}</td>
                    <td style={{ ...tdStyle,maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.descripcion}</td>
                    <td style={tdStyle}>{r.und}</td>
                    <td style={{ ...tdStyle }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarNodosGrilla && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="text" value={editDims[r.id]?.no_inicio !== undefined ? editDims[r.id].no_inicio : (r.no_inicio || '')}
                            onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), no_inicio: e.target.value } }))}
                            placeholder="No.Ini"
                            style={{ width:'76px',background:'transparent',border:'none',borderBottom:`1.5px solid #7c3aed`,outline:'none',padding:'2px 4px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : (r.no_inicio || '-')}
                    </td>
                    <td style={{ ...tdStyle }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarNodosGrilla && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="text" value={editDims[r.id]?.no_final !== undefined ? editDims[r.id].no_final : (r.no_final || '')}
                            onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), no_final: e.target.value } }))}
                            placeholder="No.Fin"
                            style={{ width:'76px',background:'transparent',border:'none',borderBottom:`1.5px solid #7c3aed`,outline:'none',padding:'2px 4px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : (r.no_final || '-')}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAreaLongNodInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.area_long_nod ?? (r.area_long_nod ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], area_long_nod: v } })) }}
                            style={{ width:'72px',background:'transparent',border:'none',borderBottom:`1.5px solid #F59E0B`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : aplicaReglasCadPresupuesto
                          ? renderDimBloqueadaCad(fmtN(r.area_long_nod), MSG_AREA_LONG_DESDE_PLANO)
                          : fmtN(r.area_long_nod)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAnchoEspesorInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.ancho ?? (r.ancho ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], ancho: v } })) }}
                            style={{ width:'60px',background:'transparent',border:'none',borderBottom:`1.5px solid ${t.primary}`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : fmtN(r.ancho)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {puedeEditarAnchoEspesorInline() && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.espesor ?? (r.espesor ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], espesor: v } })) }}
                            style={{ width:'60px',background:'transparent',border:'none',borderBottom:`1.5px solid ${t.primary}`,outline:'none',padding:'2px 2px',color:t.text,fontSize:'var(--cc-sm)',textAlign:'right' }} />
                        : fmtN(r.espesor)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right',fontWeight:'600' }}>{fmtN(r.cant_total)}</td>
                    {nivelInfo.verValoresEconomicos && (
                    <td style={{ ...tdStyle,textAlign:'right' }}>{fmt(r.vlr_unitario)}</td>
                    )}
                    {nivelInfo.verValoresEconomicos && (
                    <td style={{ ...tdStyle,textAlign:'right',fontWeight:'700',color:t.primary }}>{fmt(r.costo_directo)}</td>
                    )}
                    {mostrarColumnaDepuracion && (() => {
                      const preDisp = (r.pre_interv_estado == null || r.pre_interv_estado === '') ? 'No Revisado' : r.pre_interv_estado
                      const esLegadoPre = (r.pre_interv_estado == null || r.pre_interv_estado === '')
                      return (
                    <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', justifyContent:'center', flexWrap:'wrap' }}>
                        {SEMAFORO.map(s => {
                          const activo = preDisp === s.valor
                          return (
                            <div
                              key={`pre-${s.valor}`}
                              title={esLegadoPre ? `${s.valor} (registro anterior sin depuración)` : `Depuración: ${s.valor}`}
                              onClick={() => puedePrevalidarUI && !activo && !esSellado(r) && cambiarPreIntervDirecto(r.id, s.valor)}
                              style={{
                                width: activo ? '18px' : '12px',
                                height: activo ? '18px' : '12px',
                                borderRadius: '50%',
                                background: activo ? s.color : s.color + '33',
                                border: `2px solid ${activo ? s.color : s.color + '66'}`,
                                cursor: puedePrevalidarUI && !activo && !esSellado(r) ? 'pointer' : 'default',
                                opacity: esSellado(r) ? 0.55 : (esLegadoPre ? 0.75 : 1),
                                transition: 'all 0.2s',
                                boxShadow: activo ? `0 0 8px ${s.color}88` : 'none',
                              }}
                            />
                          )
                        })}
                      </div>
                    </td>
                      )
                    })()}
                    <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', justifyContent:'center' }}>
                        {SEMAFORO.map(s => {
                          const activo = (r.revisado || 'No Revisado') === s.valor
                          return (
                            <div
                              key={s.valor}
                              title={s.valor}
                              onClick={() => puedeValidar && !activo && !esSellado(r) && cambiarEstadoDirecto(r.id, s.valor)}
                              style={{
                                width: activo ? '18px' : '12px',
                                height: activo ? '18px' : '12px',
                                borderRadius: '50%',
                                background: activo ? s.color : s.color + '33',
                                border: `2px solid ${activo ? s.color : s.color + '66'}`,
                                cursor: puedeValidar && !activo && !esSellado(r) ? 'pointer' : 'default',
                                opacity: esSellado(r) ? 0.55 : 1,
                                transition: 'all 0.2s',
                                boxShadow: activo ? `0 0 8px ${s.color}88` : 'none',
                              }}
                            />
                          )
                        })}
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
                    <td style={{ ...tdStyle, textAlign:'center', width: 40 }} onClick={e=>e.stopPropagation()}>
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
                    <td style={{ ...tdStyle, minWidth:'80px' }} onClick={e=>e.stopPropagation()}>
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
                          <button onClick={() => !esSellado(r) && darDeBaja(r.id)}
                            title="Dar de baja"
                            disabled={esSellado(r)}
                            style={{ background:'#EF444415', border:'1px solid #EF444444', borderRadius:'6px', padding:'3px 8px', color:'#EF4444', fontSize:'var(--cc-sm)', cursor:'pointer' }}>
                            🗑️
                          </button>
                        )}
                      </td>
                    )}
                    {puedeEliminar && verPapelera && (
                      <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                        {seleccionados.has(r.id) && (
                          <button onClick={() => restaurar(r.id)}
                            title="Restaurar registro"
                            style={{ background:'#10B98115', border:'1px solid #10B98144', borderRadius:'6px', padding:'3px 8px', color:'#10B981', fontSize:'var(--cc-sm)', cursor:'pointer' }}>
                            🔄 Restaurar
                          </button>
                        )}
                      </td>
                    )}

                  </tr>
                )
              })}
            </tbody>
          </table>
          {hayMasRegistrosVista && (
            <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: `1px solid ${t.border}` }}>
              <button
                type="button"
                onClick={handleCargarMasRegistrosVista}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: 600,
                  color: t.textMuted,
                  cursor: 'pointer',
                }}
              >
                Cargar 50 registros más
              </button>
            </div>
          )}
        </div>
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
