import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import TrazabilidadRegistroModal from '../../TrazabilidadRegistroModal'
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import * as XLSX from "xlsx"
import ExcelJS from "exceljs"
import { API_BASE } from '../../apiBase'
import EmojiPicker from '../../EmojiPicker'
import PptoFiltroObraVista from './PptoFiltroObraVista'

/** Tipografía alineada con Pequeña / Mediana / Grande (`applyClaraTypography` en `typographyScale.js`) */
function getToken() {
  return localStorage.getItem("cc_token") || sessionStorage.getItem("cc_token")
}

/** Misma lógica que en App.jsx: permisos de validación y visibilidad por rol. */
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
  const permRpt  = permisos.find(p =>
    (p.funcion_nombre || '').toLowerCase().includes('reporte de cantidades')
  )
  const puedeValidar = !!(permRpt?.validar)
  const puedeEditar  = !!(permRpt?.editar)

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

function criterioVistaActivo(f) {
  if (!f) return false
  const e = f.eje || 'interv'
  return !!(
    (f.cap && String(f.cap).trim()) ||
    (f.item && String(f.item).trim()) ||
    (f.idPol && String(f.idPol).trim()) ||
    (f.pkCriterio && String(f.pkCriterio).trim()) ||
    (f.texto && String(f.texto).trim()) ||
    (f.tramo && String(f.tramo).trim()) ||
    (f.calzada && String(f.calzada).trim()) ||
    (f.nodoI && String(f.nodoI).trim()) ||
    (f.nodoF && String(f.nodoF).trim()) ||
    (f.absA && String(f.absA).trim()) ||
    (f.absB && String(f.absB).trim()) ||
    (e === 'interv' && f.revisado && String(f.revisado).trim()) ||
    (e === 'depur' && f.preInterv && String(f.preInterv).trim())
  )
}

// ─── MÓDULO PRESUPUESTO ───────────────────────────────────────────────────────
function ModuloPresupuesto({ t, usuario, token, s, navRegistroId = null, onNavRegistroConsumed }) {
  const API = API_BASE
  const contratoId = usuario?.contrato_id

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importProgreso, setImportProgreso] = useState(0)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [filaZoom, setFilaZoom] = useState(null) // id de la fila con zoom activo
  const [editando, setEditando] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [modalImport, setModalImport] = useState(null)
  const [modoImport, setModoImport] = useState('replace')
  const [confirmReplace, setConfirmReplace] = useState(false)
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
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 50
  const [modalDetallePpto, setModalDetallePpto] = useState(null)
  const [modalDetallePptoEditable, setModalDetallePptoEditable] = useState(false)
  /** Trazabilidad por fila: entidad `presupuesto` en API /logs/entidad/presupuesto/{id} */
  const [trazabilidadPresupuesto, setTrazabilidadPresupuesto] = useState(null)
  const [popupDims, setPopupDims] = useState({ ancho: '', espesor: '', area_long_nod: '' })
  const [popupCap,  setPopupCap]  = useState('')
  const [popupItem, setPopupItem] = useState('')
  const [popupItemBusq, setPopupItemBusq] = useState('')
  const [popupItemOpen, setPopupItemOpen] = useState(false)
  const [popupGuardando, setPopupGuardando] = useState(false)
  const [popupMsg, setPopupMsg] = useState('')
  // ── Revisor de Tramos ─────────────────────────────────────────────────────
  const [modalModoCapitulo, setModalModoCapitulo] = useState(null) // nombre del capítulo pendiente
  const [modoCapSeleccion,  setModoCapSeleccion]  = useState('')   // '' | 'todos' | 'tramos'
  const [busquedaTramo,     setBusquedaTramo]     = useState('')
  const [selTramoTab,       setSelTramoTab]       = useState({ ini: new Set(), fin: new Set(), tramo: new Set() })
  const [filtroEstrella,    setFiltroEstrella]    = useState('')  // '' | 'vacia' | 'roja' | 'amarilla' | 'verde'
  const [filtroEstrellaTipo, setFiltroEstrellaTipo] = useState('tramo') // 'ini' | 'fin' | 'tramo'
  const [tramoSelec,        setTramoSelec]        = useState(null) // {no_inicio, no_final, label}
  const [tabTramo,          setTabTramo]          = useState(0)    // 0=INFO 1=NODO INI 2=NODO FIN 3=TRAMO
  /** Fase B: filtros de servidor (misma semántica capítulo/ítem que dashboard SICOE) */
  const [ubicacionTramo,   setUbicacionTramo]   = useState('')
  const [ubicacionCalzada, setUbicacionCalzada] = useState('')
  const [opcionesUbicacion, setOpcionesUbicacion] = useState({ tramos: [], calzadas: [] })
  const debounceFetchPptoRef = useRef(null)
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
    cap: '', item: '', idPol: '', pkCriterio: '', texto: '', tramo: '', calzada: '', nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '',
  })
  const fObraRef = useRef(fObra)
  useEffect(() => { fObraRef.current = fObra }, [fObra])
  const [capExpandido, setCapExpandido] = useState(null)
  const [buscandoFiltroObra, setBuscandoFiltroObra] = useState(false)
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
  /** SicoeCAD → API → ClaraCore (source=sicoe_cad), no el import CSV del navegador */
  const [sincroSicoeModal, setSincroSicoeModal] = useState(null) // { insertados, enviados?, ts }
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
    const interval = setInterval(poll, 8000)
    return () => clearInterval(interval)
  }, [contratoId, token])

    // ── Constantes drill-down ──────────────────────────────────────────────────
  const NIVELES = ['capitulo', 'item', 'pk_id']
  const NOM     = { capitulo:'Capítulo', item:'Ítem', pk_id:'PK_ID' }
  const PALETA_BARRAS = [
    '#0077B6','#00B4C6','#00A896','#028090','#05668D',
    '#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B',
    '#44BBA4','#E94F37','#393E41','#F5A623','#7B2D8B',
  ]

  const fmt  = (n) => n != null ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n) : '-'
  const fmtN = (n) => n != null ? new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n) : '-'
  const fmtM = (n) => {
    if (n == null) return ''
    if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`
    if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`
    if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`
    return `$${Math.round(n)}`
  }

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => { if (contratoId) cargarCapitulos() }, [contratoId])
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
          setModalDetallePpto(registro)
          setModalDetallePptoEditable(!registro.sellado)
          setPopupDims({ ancho: registro.ancho ?? '', espesor: registro.espesor ?? '', area_long_nod: registro.area_long_nod ?? '' })
          setPopupCap(registro.capitulo || '')
          setPopupItem(registro.item || '')
          setPopupItemBusq(registro.item ? `${registro.item} · ${registro.descripcion || ''}` : '')
          setPopupMsg('')
        }
      })
      .catch(() => {})
    if (onNavRegistroConsumed) onNavRegistroConsumed()
  }, [navRegistroId])

    useEffect(() => {
    if (!contratoId) return
    fetch(`${API}/notificaciones/usuarios-destinatarios`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setUsuariosDestinatarios).catch(() => {})
  }, [contratoId])

    useEffect(() => {
    if (!contratoId) return
    const pkidDrill = drill.find(d => d.campo === 'pk_id')
    if (pkidDrill) { setPptoPkidColores({}); return }
    const params = new URLSearchParams()
    const capDrill = drill.find(d => d.campo === 'capitulo')
    const itemDrill = drill.find(d => d.campo === 'item')
    if (itemDrill) params.set('item', itemDrill.valor)
    else if (capDrill) params.set('capitulo', capDrill.valor)
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
  /** Solo Desarrollador edita área / long. / NOD, ancho y espesor (y recálculo por dimensiones). */
  const puedeEditarDimensiones = esDeveloper
  const _permPpto    = (usuario?.permisos || []).find(p => p.funcion_nombre?.toLowerCase() === 'editar registros presupuesto')
  const puedeEditar  = esDeveloper || (_permPpto?.editar   ?? false)
  const puedeValidar = esDeveloper || (_permPpto?.validar  ?? false)
  const puedeEliminar = esDeveloper || (_permPpto?.eliminar ?? false)
  const nivelInfo    = determinarNivelValidacion(usuario)
  const esSellado = (r) => r?.sellado === true
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
  const [verPapelera, setVerPapelera] = useState(false)
  const _pptoCacheRef   = useRef(null)   // { data, ts, papelera } – solo para papelera
  const _pptoCachePorCap = useRef({})    // { [capitulo]: { data, ts } }
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
    if (capD) p.set('capitulo', capD.valor)
    if (itemD) p.set('item', itemD.valor)
    if (verPapelera) p.set('papelera', 'true')
    const f = fObra
    if (f.tramo) p.set('tramo', f.tramo)
    if (f.calzada) p.set('calzada', f.calzada)
    if (f.nodoI) p.set('nodo_inicio', f.nodoI.trim())
    if (f.nodoF) p.set('nodo_final', f.nodoF.trim())
    if (f.absA) p.set('abs_desde', String(f.absA).replace(',', '.'))
    if (f.absB) p.set('abs_hasta', String(f.absB).replace(',', '.'))
    if (f.eje === 'interv' && f.revisado) p.set('revisado', f.revisado)
    if (f.eje === 'depur' && f.preInterv) p.set('pre_interv_estado', f.preInterv)
    if (f.idPol && String(f.idPol).trim()) p.set('id_pol', f.idPol.trim())
    if (f.pkCriterio && String(f.pkCriterio).trim()) p.set('pk_criterio', f.pkCriterio.trim())
    if (f.texto && String(f.texto).trim()) p.set('texto', f.texto.trim())
    return p
  }, [armarFiltrosUbicacionSolo, drill, fObra, verPapelera])

  const detalleConItem = !!drill.find(d => d.campo === 'item')
  const cacheKeyPpto = useMemo(() => {
    const capD = drill.find(d => d.campo === 'capitulo')
    const itemD = drill.find(d => d.campo === 'item')
    const f = fObra
    const obraKey = [f.tramo, f.calzada, f.eje, f.revisado, f.preInterv, f.idPol, f.pkCriterio, f.texto, f.nodoI, f.nodoF, f.absA, f.absB].join('\x1e')
    return [
      capD?.valor, itemD?.valor, ubicacionTramo, ubicacionCalzada, filtroEstado,
      busquedaTipo, busquedaV1, busquedaV2, verPapelera, obraKey,
    ].join('|')
  }, [drill, ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2, verPapelera, fObra])

  const keyCacheFila = (cap, it) => [cap, it || '', ubicacionTramo, ubicacionCalzada, filtroEstado, busquedaTipo, busquedaV1, busquedaV2].join('|')

  /**
   * Misma query que el listado; acumula offset en bloques. Conteo: GET conteo; filas: GET con limit+offset.
   * Los callers hacen un solo setState con el resultado.
   */
  async function fetchPresupuestoPaginasCompletas(pQuery) {
    const h = { Authorization: `Bearer ${token}` }
    const pConteo = new URLSearchParams(pQuery.toString())
    const qC = pConteo.toString()
    const resC = await fetch(`${API}/presupuesto/${contratoId}/conteo${qC ? `?${qC}` : ''}`, { headers: h })
    let totalN = 0
    let conteoOk = false
    if (resC.ok) {
      conteoOk = true
      const j = await resC.json()
      if (j && typeof j.total === 'number') totalN = j.total
    }
    if (conteoOk && totalN === 0) {
      return { rows: [], total: 0 }
    }
    const acc = []
    let off = 0
    while (true) {
      const p = new URLSearchParams(pQuery.toString())
      p.set('limit', String(PRES_PTO_CHUNK))
      p.set('offset', String(off))
      const q = p.toString()
      const res = await fetch(`${API}/presupuesto/${contratoId}${q ? `?${q}` : ''}`, { headers: h })
      if (!res.ok) break
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      if (list.length === 0) break
      acc.push(...list)
      if (list.length < PRES_PTO_CHUNK) break
      off += list.length
    }
    return { rows: acc, total: totalN > 0 ? totalN : acc.length }
  }

async function cargarRegistros(modoPapelera, forzar = false) {
    if (!contratoId) return
    const esPapelera = modoPapelera !== undefined ? modoPapelera : verPapelera
    // Servir desde caché si es válido
    const cached = _pptoCacheRef.current
    if (!forzar && cached && cached.papelera === esPapelera &&
        (Date.now() - cached.ts) < PPTO_CACHE_TTL) {
      setRegistros(cached.data)
      setPagina(1)
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
    setPagina(1)
  }

  // ── Carga lazy por capítulo ────────────────────────────────────────────────
  async function cargarCapitulos() {
    if (!contratoId) return
    setLoadingCapitulos(true)
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/capitulos-lista`, {
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
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p)
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
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p0)
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
    if (!capD?.valor || !itemD?.valor) return
    const u = new URLSearchParams({ capitulo: capD.valor, item: itemD.valor })
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
    if (capActual) {
      delete _pptoCachePorCap.current[keyCacheFila(capActual, itemActual)]
      if (itemActual) {
        setRegistros(prev => prev.filter(r => r.capitulo !== capActual || r.item !== itemActual))
      } else {
        setRegistros(prev => prev.filter(r => r.capitulo !== capActual))
      }
      await cargarCapituloData(capActual, itemActual || null)
    }
    await cargarCapitulos()
  }

  useEffect(() => {
    if (sincroSicoeModal) recargarCapActual(true)
  }, [sincroSicoeModal?.ts])

  // Multisesión: refresco ~1s con pestaña activa. No encolar si ya hay carga o pantalla de carga (evita parpadeo).
  useEffect(() => {
    if (!contratoId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (cargaPptoInFlightRef.current || loading) return
      if (buscandoFiltroObra) return
      if (detalleConItem) {
        skipDebounceFiltrosRef.current = true
        refreshRegistrosDetalle({ forzar: true, syncPreserveSize: true })
        return
      }
      const capD = drill.find((d) => d.campo === 'capitulo')?.valor
      const itemD = drill.find((d) => d.campo === 'item')?.valor
      if (capD && !itemD) {
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
    const iv = setInterval(tick, 3000)
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
    const f = { ...fIn, eje: fIn.eje || 'interv' }
    const has = criterioVistaActivo(f)
    if (!has) {
      window.alert('Indique al menos un criterio: capítulo, ítem, ID-POL, PK, texto, tramo, calzada, nodos, abscisas o estado (Interventoría o depuración).')
      return
    }
    setFObra(f)
    setBuscandoFiltroObra(true)
    cargaPptoIdRef.current += 1
    const cargaId = cargaPptoIdRef.current
    cargaPptoInFlightRef.current = true
    try {
      syncFObraALegacy(f)
      const d = []
      if (f.cap) d.push({ campo: 'capitulo', valor: f.cap })
      if (f.item) d.push({ campo: 'item', valor: f.item })
      setDrill(d)
      if (f.cap) setCapActivo(f.cap)

      const p = new URLSearchParams()
      if (verPapelera) p.set('papelera', 'true')
      if (f.cap) p.set('capitulo', f.cap)
      if (f.item) p.set('item', f.item)
      if (f.tramo) p.set('tramo', f.tramo)
      if (f.calzada) p.set('calzada', f.calzada)
      if (f.nodoI) p.set('nodo_inicio', f.nodoI.trim())
      if (f.nodoF) p.set('nodo_final', f.nodoF.trim())
      if (f.absA) p.set('abs_desde', String(f.absA).replace(',', '.'))
      if (f.absB) p.set('abs_hasta', String(f.absB).replace(',', '.'))
      if (f.eje === 'interv' && f.revisado) p.set('revisado', f.revisado)
      if (f.eje === 'depur' && f.preInterv) p.set('pre_interv_estado', f.preInterv)
      if (f.idPol && String(f.idPol).trim()) p.set('id_pol', f.idPol.trim())
      if (f.pkCriterio && String(f.pkCriterio).trim()) p.set('pk_criterio', f.pkCriterio.trim())
      if (f.texto && String(f.texto).trim()) p.set('texto', f.texto.trim())
      const { rows, total } = await fetchPresupuestoPaginasCompletas(p)
      if (cargaId !== cargaPptoIdRef.current) return
      setConteoFiltro(total)
      setRegistros(rows)
      setPagina(1)
      _pptoCachePorCap.current = {}
      const capD = f.cap
      const itemD = f.item
      if (capD) {
        const key = [capD, itemD || '', f.tramo, f.calzada, f.eje, f.revisado, f.preInterv, f.idPol, f.pkCriterio, f.texto, f.nodoI, f.nodoF, f.absA, f.absB].join('|')
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
    await aplicarFiltroObraConF(fObra)
  }

  const fObraInicialVacio = () => ({
    cap: '', item: '', idPol: '', pkCriterio: '', texto: '', tramo: '', calzada: '', nodoI: '', nodoF: '', absA: '', absB: '', eje: 'interv', revisado: '', preInterv: '',
  })

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
    if (f2.item) d.push({ campo: 'item', valor: f2.item })
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
    setDrill([])
    setUbicacionTramo(''); setUbicacionCalzada(''); setFiltroEstado(''); setBusquedaTipo(''); setBusquedaV1(''); setBusquedaV2(''); setConteoFiltro(null)
    setRegistros([]); setCapExpandido(null); setItemsResumen([]); setCapActivo(null); setPkidsSeleccionados([])
    setPagina(1)
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
    const next = { ...fObraRef.current, cap: capitulo, item: '' }
    setFObra(next)
    fObraRef.current = next
    setCapActivo(capitulo)
    await cargarItemsCapitulo(capitulo)
    await aplicarFiltroObraConF({ ...next, cap: capitulo, item: '' })
  }

  function onPickItemFromPanel(itemNum) {
    const cap = (fObraRef.current.cap && fObraRef.current.cap.trim()) || capExpandido
    if (!cap) return
    aplicarFiltroObraConF({ ...fObraRef.current, cap, item: itemNum })
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
  const nivelIdx     = NIVELES.indexOf(nivelActual ?? primerNivel)
  const colorActual  = PALETA_BARRAS[Math.max(0, Math.min(nivelIdx, PALETA_BARRAS.length - 1))]

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
      const TITULOS = { dims:'📐 Cambio de Dimensiones', item_capitulo:'🔄 Cambio de Ítem/Capítulo', validacion:'🔍 Cambio de Estado' }
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
  }, [fObra.cap, fObra.item, registros])

  const drillMatch = (r) => {
    if (!drill.length) return true
    return drill.every(({ campo, valor }) => String(r[campo] ?? '') === String(valor ?? ''))
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

  const totalPaginas = Math.ceil(registrosFiltrados.length / POR_PAGINA)
  const registrosOrdenados = useMemo(() =>
    [...registrosFiltrados].sort((a, b) => {
      const va = String(a.id_pol || a.pk_id || '')
      const vb = String(b.id_pol || b.pk_id || '')
      return vb.localeCompare(va, 'es', { numeric: true })
    })
  , [registrosFiltrados])
  const registrosPagina = useMemo(() =>
    registrosOrdenados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  , [registrosOrdenados, pagina])
  const idsPaginaNoSellados = useMemo(
    () => registrosPagina.filter(r => !esSellado(r)).map(r => r.id),
    [registrosPagina]
  )

  /** Resumen de validación alineado con la grilla visible (registros filtrados). */
  const resumenValidacionVista = useMemo(() => {
    const porRevisado = {}
    const porPreInterv = {}
    let costoAcum = 0
    for (const r of registrosFiltrados) {
      const cd = Number(r.costo_directo) || 0
      costoAcum += cd
      const rev = r.revisado || 'No Revisado'
      if (!porRevisado[rev]) porRevisado[rev] = { count: 0, costo: 0 }
      porRevisado[rev].count += 1
      porRevisado[rev].costo += cd
      const pre = (r.pre_interv_estado == null || r.pre_interv_estado === '') ? 'No Revisado' : r.pre_interv_estado
      if (!porPreInterv[pre]) porPreInterv[pre] = { count: 0, costo: 0 }
      porPreInterv[pre].count += 1
      porPreInterv[pre].costo += cd
    }
    return { porRevisado, porPreInterv, total: registrosFiltrados.length, costoAcum }
  }, [registrosFiltrados])

  async function cargarItemsCapitulo(capitulo) {
    if (!contratoId) return
    setItemsResumen([])
    setCapActivo(capitulo)
    try {
      const res = await fetch(
        `${API}/presupuesto/${contratoId}/items-lista?capitulo=${encodeURIComponent(capitulo)}`,
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

  // ── Import CSV ─────────────────────────────────────────────────────────────
  async function handleImportCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const raw  = await file.text()
    const text = raw.replace(/^\uFEFF/, '')

    // Parser CSV robusto — respeta campos entre comillas con separador interno
    function parseCSVLine(line, sep) {
      const result = []; let cur = ''; let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQuote = !inQuote }
        else if (ch === sep && !inQuote) { result.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      result.push(cur.trim())
      return result
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const firstLine = lines[0]
    const sep = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ','
    const headers = parseCSVLine(firstLine, sep).map(h => h.replace(/^"|"$/g,'').trim().toUpperCase())

    const MAP = {
      'PK_ID':'pk_id',
      'CAPITULO':'capitulo','CAPÍTULO':'capitulo','COMPETENCIA':'competencia',
      'ITEM':'item','ÍTEM':'item',
      'DESCRIPCION':'descripcion','DESCRIPCIÓN':'descripcion',
      'UND':'und',
      'CALZADA':'calzada','TRAMO':'tramo',
      'ABS. INICIO':'abs_inicio','ABS. FINAL':'abs_final',
      'ABS INICIO':'abs_inicio','ABS FINAL':'abs_final',
      'VLR UNITARIO':'vlr_unitario','VLR. UNITARIO':'vlr_unitario','VALOR UNITARIO':'valor_unitario',
      'NO. INICIO':'no_inicio','NO. FINAL':'no_final',
      'NO INICIO':'no_inicio','NO FINAL':'no_final',
      'AREA/LONG/NOD':'area_long_nod','ÁREA/LONG/NOD':'area_long_nod',
      'AREA/LONG':'area_long_nod','ÁREA/LONG':'area_long_nod',
      'ANCHO':'ancho','ESPESOR':'espesor',
      'CANT.TOTAL':'cant_total','CANT. TOTAL':'cant_total','CANTIDAD':'cant_total',
      'COSTO DIRECTO':'costo_directo',
      'TIPO DE EJECUCIÓN':'tipo_ejecucion','TIPO DE EJECUCION':'tipo_ejecucion',
      'TIPO DE ENTIDAD':'tipo_entidad',
      'ID_POL':'id_pol','ID POL':'id_pol',
      'OBSERVACIÓN':'observacion','OBSERVACION':'observacion',
      'ENTHANDLE':'ent_handle','ENT_HANDLE':'ent_handle',
      'TXTHANDLE':'txt_handle','TXT_HANDLE':'txt_handle',
      'LAYERENT':'layer_ent','LAYER_ENT':'layer_ent',
      'LAYERTXT':'layer_txt','LAYER_TXT':'layer_txt',
      'COLORHEX':'color_hex','COLOR_HEX':'color_hex',
      'GUID':'guid',
      'X_LABEL (ESTE)':'x_label','X_LABEL':'x_label',
      'Y_LABEL (NORTE)':'y_label','Y_LABEL':'y_label',
      'REVISADO (TRUE/FALSE)':'revisado','REVISADO':'revisado',
      'OBSERVACIÓN EXTERNA':'observacion_externa','OBSERVACION EXTERNA':'observacion_externa',
      'REV_BLOCK_HANDLE':'rev_block_handle',
    }
    const NUMS = new Set(['vlr_unitario','valor_unitario','area_long_nod','ancho','espesor','cant_total','costo_directo','x_label','y_label'])
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i], sep).map(v => v.replace(/^"|"$/g,'').trim())
      const obj = {}
      headers.forEach((h, idx) => {
        const key = MAP[h]; if (!key) return
        const v = vals[idx] || ''
        if (NUMS.has(key)) { const n = parseFloat(v.replace(/[,$]/g,'')); obj[key] = isNaN(n) ? null : n }
        else obj[key] = v || null
      })
      if (obj.pk_id || obj.item) rows.push(obj)
    }
    setModalImport({ rows, fileName: file.name })
    setModoImport('append'); setConfirmReplace(false); e.target.value = ''
  }

  async function ejecutarImport() {
    if (!modalImport) return
    if (modoImport === 'replace' && !confirmReplace) { setConfirmReplace(true); return }
    const { rows } = modalImport
    setModalImport(null); setImporting(true); setImportProgreso(0)
    const BATCH = 500
    let ok = true; let msj = ''
    let totalInsertados = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const mode = i === 0 ? modoImport : 'append'
      const res = await fetch(`${API}/presupuesto/${contratoId}/bulk?mode=${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(batch)
      })
      if (!res.ok) {
        let detail = 'Error al importar'
        try {
          const d = await res.json()
          detail = d.detail != null ? String(d.detail) : detail
        } catch { /* ignore */ }
        msj = `❌ ${detail}`
        ok = false
        break
      }
      try {
        const j = await res.json()
        const ins = j && typeof j.insertados === 'number' ? j.insertados : batch.length
        totalInsertados += ins
      } catch {
        totalInsertados += batch.length
      }
      setImportProgreso(Math.min(100, Math.round(((i + batch.length) / rows.length) * 100)))
    }
    setImporting(false); setImportProgreso(0)
    if (ok) {
      setImportMsg(`✅ Importación completada (${rows.length} filas, ${totalInsertados} almacenadas).`)
      setTimeout(() => setImportMsg(''), 6000)
    } else {
      setImportMsg(msj)
      setTimeout(() => setImportMsg(''), 8000)
    }
    if (ok) { await recargarCapActual(true) }
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
    (puedeEditarDimensiones && [...seleccionados].some(id => editDims[id]))
  ) && ![...seleccionados].some(id => esSellado(registros.find(r => r.id === id)))

  async function ejecutarRecalcular() {
    const ids = [...seleccionados]
    const tieneDims  = ids.some(id => editDims[id])
    if (tieneDims && !puedeEditarDimensiones) {
      alert('Solo el cargo Desarrollador puede guardar cambios de dimensiones en lote.')
      return
    }
    const tieneItem  = !!(editCapitulo || editItem)
    const tipoComent = tieneItem ? 'item_capitulo' : 'dims'

    // Pedir comentario (obligatorio)
    const comentarioData = await pedirComentario(tipoComent, true)
    if (comentarioData === null) return  // canceló
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null

    const dims = ids.filter(id => editDims[id]).map(id => {
      const d = editDims[id]
      return {
        id,
        ancho: d.ancho !== '' && d.ancho != null ? parseFloat(d.ancho) : null,
        espesor: d.espesor !== '' && d.espesor != null ? parseFloat(d.espesor) : null,
        area_long_nod: d.area_long_nod !== '' && d.area_long_nod != null ? parseFloat(d.area_long_nod) : null,
      }
    })
    const body = { ids, dims: dims.length > 0 ? dims : null }
    if (editCapitulo)   body.capitulo    = editCapitulo
    if (editItem)       { body.item = editItem; body.descripcion = precioSeleccionado?.descripcion ?? null }
    if (precioSeleccionado) body.vlr_unitario = precioSeleccionado.precio_unitario
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-recalcular`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(ids, tipoComent, comentario, destinatarioId)
      // Patch local — actualizar registros en memoria sin recargar
      setRegistros(prev => prev.map(r => {
        if (!ids.includes(r.id)) return r
        const dim = dims.find(d => d.id === r.id)
        const ancho   = (dim?.ancho != null ? dim.ancho : (r.ancho ?? 0)) || 0
        const espesor = (dim?.espesor != null ? dim.espesor : (r.espesor ?? 0)) || 0
        const area    = (dim?.area_long_nod != null ? dim.area_long_nod : (r.area_long_nod ?? 0)) || 0
        const vlr     = precioSeleccionado?.precio_unitario ?? r.vlr_unitario ?? 0
        const cant    = (ancho > 0 || espesor > 0) ? Math.round(area * ancho * espesor * 10000) / 10000 : area
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
      }))
      setEditCapitulo(''); setEditItem(''); setEditDims({}); setSeleccionados(new Set()); setModalConfirm(false)
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
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [...seleccionados], revisado: estado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios([...seleccionados], 'validacion', comentario, destinatarioId)
      const idsSelec = [...seleccionados]
      setBulkEstado(''); setSeleccionados(new Set())
      lanzarClaraLinkEstado(idsSelec, estado)
      setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, idsSelec, estado)))
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
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [...seleccionados], revisado: bulkEstado })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios([...seleccionados], 'validacion', comentario, destinatarioId)
      const idsSelec = [...seleccionados]
      const estadoAplicado = bulkEstado
      setBulkEstado(''); setSeleccionados(new Set())
      lanzarClaraLinkEstado(idsSelec, estadoAplicado)
      setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, idsSelec, estadoAplicado)))
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
    setGuardandoBulk(true)
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-pre-interv`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: selIds, estado: bulkPreInterv })
    })
    setGuardandoBulk(false)
    if (res.ok) {
      if (comentario.trim()) await crearComentarios(selIds, 'validacion', comentario, destinatarioId)
      const idsSelec = [...selIds]
      const estadoPre = bulkPreInterv
      setBulkPreInterv(''); setSeleccionados(new Set())
      setRegistros(prev => prev.map(r => aplicarCambioPreIntervLocal(r, idsSelec, estadoPre)))
    } else {
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
    if (esSellado(registro)) return
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
    if (esSellado(reg)) return
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
    const res = await fetch(`${API}/presupuesto/item/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (res.ok) { setEditando(null); await recargarCapActual() }
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
  useEffect(() => setPagina(1), [registrosFiltrados.length])
  useEffect(() => {
    const ids = registrosPagina?.map(r => r.id)
    if (ids?.length) cargarComentariosResumen(ids)
  }, [pagina, registrosFiltrados.length])

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
    const token = getToken()
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: [id], revisado: nuevoEstado })
    })
    if (!res.ok) return
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId)
    lanzarClaraLinkEstado([id], nuevoEstado)
    setRegistros(prev => prev.map(r => aplicarCambioEstadoLocal(r, [id], nuevoEstado)))
  }

  async function cambiarPreIntervDirecto(id, nuevoEstado) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    const obligatorio = nuevoEstado === 'Pendiente' || nuevoEstado === 'Rechazado'
    const comentarioData = await pedirComentario('validacion', obligatorio)
    if (comentarioData === null) return
    const comentario = comentarioData?.mensaje || ''
    const destinatarioId = comentarioData?.destinatarioId || null
    const tok = getToken()
    const res = await fetch(`${API}/presupuesto/${contratoId}/bulk-pre-interv`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ ids: [id], estado: nuevoEstado })
    })
    if (!res.ok) {
      try {
        const d = await res.json()
        alert(d.detail || 'No se pudo guardar la depuración previa.')
      } catch {
        alert('No se pudo guardar la depuración previa.')
      }
      return
    }
    if (comentario.trim()) await crearComentarios([id], 'validacion', comentario, destinatarioId)
    setRegistros(prev => prev.map(r => aplicarCambioPreIntervLocal(r, [id], nuevoEstado)))
  }

async function darDeBaja(id) {
    const row = registros.find(rr => rr.id === id)
    if (esSellado(row)) return
    if (!dwgEnlazado) {
      alert('⚠️ Para dar de baja un registro necesitas tener el DWG enlazado.')
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
    } else alert('Error al dar de baja el registro')
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
              <div style={{ minWidth: '100px', maxWidth: '160px', fontSize: 'var(--cc-caption)', color: t.text, fontWeight: '600', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(r.id_pol || r.pk_id || '')}>
                {r.id_pol || r.pk_id || '—'}
              </div>
              <div style={{ flex:2, fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{r.item}</div>
              <div style={{ flex:3, fontSize:'var(--cc-sm)', color:t.textMuted }}>{r.descripcion}</div>
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {[r.area_long_nod, r.ancho, r.espesor].filter(Boolean).join(' × ')}
              </div>
              <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:3}) : '—'}
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

        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.7)',zIndex:3500,display:'flex',alignItems:'center',justifyContent:'center' }}
            onClick={(e) => { if (modalComentario) return; setModalModoCapitulo(null); setTramoSelec(null); setModoSeleccionClon(false); setClonBase(null) }}>
            <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:'16px',
              padding:'24px', width: tramoSelec ? '1066px' : '572px', maxWidth:'96vw',
              maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
              transition:'width .25s' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <div>
                  <div style={{ fontSize:'var(--cc-label)', fontWeight:'800', color:t.primary }}>
                    {tramoSelec ? `🔎 ${tramoSelec.label}` : '📂 Abrir capítulo'}
                  </div>
                  <div style={{ fontSize:'var(--cc-sm)', color:t.textMuted, marginTop:'2px' }}>{modalModoCapitulo}</div>
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
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
                      {regs.length > 0 && puedeValidar && (
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'6px 10px', background:t.bg, borderRadius:'8px' }}>
                          <input type="checkbox" checked={todosSelec} onChange={toggleTab}
                            style={{ width:'14px', height:'14px', cursor:'pointer' }} />
                          <span style={{ fontSize:'var(--cc-sm)', fontWeight:'700', color:t.textMuted }}>
                            {todosSelec ? 'Deseleccionar todos' : `Seleccionar todos (${regs.length})`}
                          </span>
                          {algunoSelec && (
                            <div style={{ marginLeft:'auto', display:'flex', gap:'4px' }}>
                              {SEMAFORO.map(s => (
                                <button key={s.valor} onClick={() => validarTab(s.valor)}
                                  style={{ background:t.bgCard, border:`1.5px solid ${s.color}`, borderRadius:'6px', padding:'3px 8px', fontSize:'var(--cc-sm)', cursor:'pointer', color:s.color, fontWeight:'700' }}>
                                  {s.label} {s.valor}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display:'flex', gap:'8px', fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, padding:'0 10px', marginBottom:'6px', letterSpacing:'0.4px' }}>
                        <span style={{ minWidth: '100px', maxWidth: '160px', flexShrink: 0 }}>ID-POL</span>
                        <span style={{ width: '80px', flexShrink: 0 }}>ÍTEM</span><span style={{ flex: 3 }}>DESCRIPCIÓN</span>
                        <span style={{ minWidth: '120px', textAlign: 'right', whiteSpace: 'nowrap' }}>DIMS</span><span style={{ flex: 1, textAlign: 'right' }}>CANT.</span>
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
                                  style={{ minWidth: '100px', maxWidth: '160px', flexShrink: 0, fontSize: 'var(--cc-caption)', color: t.text, fontWeight: '600', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={String(r.id_pol || r.pk_id || '')}
                                >
                                  {r.id_pol || r.pk_id || '—'}
                                </div>
                                <div style={{ width:'80px', flexShrink:0, fontSize:'var(--cc-sm)', color:t.text, fontWeight:'600' }}>{r.item}</div>
                                <div style={{ flex:3, fontSize:'var(--cc-sm)', color:t.textMuted }}>{r.descripcion}</div>
                                {/* Dims — solo Desarrollador */}
                                <div style={{ minWidth:'120px', fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right', whiteSpace:'nowrap' }}>
                                  {puedeEditarDimensiones && !esSellado(r) && editDims[r.id] !== undefined ? (
                                    <div style={{ display:'flex', flexDirection:'column', gap:'2px', alignItems:'flex-end' }} onClick={e => e.stopPropagation()}>
                                      <input type="number" placeholder="a/l/n" value={editDims[r.id].area_long_nod ?? ''}
                                        onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], area_long_nod: e.target.value } }))}
                                        style={{ width:'52px', fontSize:'var(--cc-caption)', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 4px', color:t.text, textAlign:'right' }} />
                                      <input type="number" placeholder="ancho" value={editDims[r.id].ancho ?? ''}
                                        onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], ancho: e.target.value } }))}
                                        style={{ width:'52px', fontSize:'var(--cc-caption)', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 4px', color:t.text, textAlign:'right' }} />
                                      <input type="number" placeholder="esp" value={editDims[r.id].espesor ?? ''}
                                        onChange={e => setEditDims(p => ({ ...p, [r.id]: { ...p[r.id], espesor: e.target.value } }))}
                                        style={{ width:'52px', fontSize:'var(--cc-caption)', background:t.inputBg, border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 4px', color:t.text, textAlign:'right' }} />
                                    </div>
                                  ) : (
                                    <span onClick={puedeEditarDimensiones && !esSellado(r) ? (e) => { e.stopPropagation(); setEditDims(p => ({ ...p, [r.id]: { area_long_nod: r.area_long_nod ?? '', ancho: r.ancho ?? '', espesor: r.espesor ?? '' } })) } : undefined}
                                      title={puedeEditarDimensiones && !esSellado(r) ? 'Clic para editar dims' : undefined}
                                      style={{ cursor: puedeEditarDimensiones && !esSellado(r) ? 'pointer' : 'default', textDecoration: puedeEditarDimensiones && !esSellado(r) ? 'underline dotted' : 'none', whiteSpace:'nowrap' }}>
                                      {[r.area_long_nod, r.ancho, r.espesor].filter(v => v != null && v !== '').join(' × ') || '—'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ flex:1, fontSize:'var(--cc-sm)', color:t.textMuted, textAlign:'right' }}>
                                  {r.cant_total != null ? Number(r.cant_total).toLocaleString('es-CO', {maximumFractionDigits:3}) : '—'}
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
                                      if (a !== undefined) pay.area_long_nod = a
                                      if (w !== undefined) pay.ancho = w
                                      if (espN !== undefined) pay.espesor = espN
                                      if (Object.keys(pay).length === 0) return
                                      const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify(pay)
                                      })
                                      if (res.ok) {
                                        const updated = await res.json()
                                        setRegistros(prev => prev.map(x => x.id === r.id ? updated : x))
                                        setEditDims(p => { const n = {...p}; delete n[r.id]; return n })
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
                                </div>
                              </div>
                              {/* Comentario de validación — clic para ver hilo */}
                              {comentariosTramo[r.id] && (
                                <div onClick={() => abrirHilo(r.id, 'validacion')}
                                  style={{ padding:'4px 10px 7px 36px', fontSize:'var(--cc-caption)', color:t.textMuted,
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
                                    <span style={{ marginLeft:'6px', color:t.textMuted, fontSize:'var(--cc-caption)' }}>
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
        const _area  = parseFloat(nuevaCant.area_long_nod) || 0
        const _ancho = parseFloat(nuevaCant.ancho)         || 0
        const _esp   = parseFloat(nuevaCant.espesor)       || 0
        const _vlr   = parseFloat(nuevaCant.itemSel?.precio_unitario) || 0
        const _cant  = (_ancho || _esp) ? _area * _ancho * _esp : _area
        const _costo = Math.round(_cant * _vlr)
        const puedeGuardar = nuevaCant.itemSel && _area > 0
        const InpLabel = ({label, val, onChange, type='number'}) => (
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px', marginBottom:'3px' }}>{label}</div>
            <input type={type} value={val} onChange={onChange}
              style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'7px', padding:'7px 10px', color:t.text, fontSize:'var(--cc-sm)' }} />
          </div>
        )
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

              {/* Dims */}
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                <InpLabel label="LONGITUD / ÁREA" val={nuevaCant.area_long_nod} onChange={e => setNuevaCant(p => ({ ...p, area_long_nod: e.target.value }))} />
                <InpLabel label="ANCHO" val={nuevaCant.ancho} onChange={e => setNuevaCant(p => ({ ...p, ancho: e.target.value }))} />
                <InpLabel label="ESPESOR" val={nuevaCant.espesor} onChange={e => setNuevaCant(p => ({ ...p, espesor: e.target.value }))} />
              </div>

              {/* Totales calculados */}
              {_area > 0 && nuevaCant.itemSel && (
                <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>CANT. CALCULADA</div>
                    <div style={{ fontSize:'var(--cc-md)', fontWeight:'800', color:t.text, marginTop:'2px' }}>{_cant.toLocaleString('es-CO', {maximumFractionDigits:3})}</div>
                  </div>
                  <div style={{ flex:1, background:t.bg, borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.5px' }}>COSTO DIRECTO</div>
                    <div style={{ fontSize:'var(--cc-md)', fontWeight:'800', color:t.primary, marginTop:'2px' }}>${_costo.toLocaleString('es-CO')}</div>
                  </div>
                </div>
              )}

              <button disabled={!puedeGuardar || guardandoNuevaCant}
                onClick={async () => {
                  if (!puedeGuardar) return
                  setGuardandoNuevaCant(true)
                  try {
                    const p = nuevaCant.itemSel
                    const body = {
                      item:          p.item_numero,
                      descripcion:   p.descripcion,
                      und:           p.und || p.unidad,
                      vlr_unitario:  p.precio_unitario,
                      area_long_nod: _area || null,
                      ancho:         _ancho || null,
                      espesor:       _esp || null,
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
                      alert('Error al agregar cantidad')
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
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'20px',width:'520px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px' }}>
              <div style={{ fontSize:'var(--cc-md)',fontWeight:'800',color:t.primary }}>📋 Detalle del Registro</div>
              <button onClick={() => { setModalDetallePpto(null); setModalDetallePptoEditable(false) }} style={{ background:'transparent',border:'none',fontSize:'var(--cc-lg)',cursor:'pointer',color:t.textMuted }}>✕</button>
            </div>
            {(() => {
              const r = modalDetallePpto
              const F = ({label, val, flex=1}) => (
                <div style={{ flex, minWidth:0 }}>
                  <div style={{ fontSize:'var(--cc-caption)',fontWeight:'700',color:t.textMuted,letterSpacing:'0.6px' }}>{label}</div>
                  <div style={{ fontSize:'var(--cc-sm)',color:t.text,fontWeight:'500',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{val ?? '—'}</div>
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
                  <Row><F label="ID_POL" val={r.id_pol||r.pk_id}/><F label="CAPÍTULO" val={r.capitulo}/><F label="ÍTEM" val={r.item} flex={0.5}/></Row>
                  <BigF label="DESCRIPCIÓN" val={r.descripcion}/>
                  <Row><F label="UNIDAD" val={r.und} flex={0.5}/><F label="REVISADO" val={r.revisado||'No Revisado'}/><F label="TIPO" val={r.tipo}/></Row>
                  {mostrarColumnaDepuracion && (
                    <Row>
                      <F label="DEPURACIÓN (COSTOS / OBRA)" val={r.pre_interv_estado == null || r.pre_interv_estado === '' ? '— (legado)' : r.pre_interv_estado} flex={1}/>
                      {r.pre_interv_por && <F label="POR" val={r.pre_interv_por} flex={1}/>}
                    </Row>
                  )}
                  {esSellado(r) && (
                    <div style={{ background:'rgba(22,101,52,0.12)', border:`1px solid rgba(22,101,52,0.35)`, borderRadius:'8px', padding:'10px 12px', marginBottom:'8px', fontSize:'var(--cc-sm)', color:'#166534', fontWeight:'600' }}>
                      🔒 Registro sellado — aprobado por Interventoría. No admite cambios de cantidades ni de estado.
                    </div>
                  )}
                  <Row><F label="NODO INICIO" val={r.no_inicio}/><F label="NODO FINAL" val={r.no_final}/></Row>
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
                  <div style={{ display:'flex', gap:'12px', marginBottom:'5px' }}>
                    <div style={{ flex:1.1, minWidth:0, background:t.bg, borderRadius:'6px', padding:'7px 10px' }} title={r.calculo_por || ''}>
                      <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.6px' }}>CÁLCULO (usuario)</div>
                      <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'500', marginTop:'1px', lineHeight:1.35, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{r.calculo_por ?? '—'}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0, background:t.bg, borderRadius:'6px', padding:'7px 10px' }}>
                      <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:t.textMuted, letterSpacing:'0.6px' }}>CÁLCULO (fecha y hora)</div>
                      <div style={{ fontSize:'var(--cc-sm)', color:t.text, fontWeight:'500', marginTop:'1px' }}>{fmtFechaHoraRecalculo(r.calculo_en)}</div>
                    </div>
                  </div>
                  <Row><F label="TRAMO" val={r.tramo}/><F label="CALZADA" val={r.calzada}/><F label="PK" val={r.pk_id} flex={0.5}/></Row>
                  {/* Acciones desde buzón */}
                  {modalDetallePptoEditable && (puedeEditar || puedeEliminar) && !esSellado(r) && (
                    <div style={{ borderTop:`1px solid ${t.border}`, marginTop:'12px', paddingTop:'12px' }}>

                      {/* ── Editar dimensiones (solo Desarrollador) ── */}
                      {puedeEditarDimensiones && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', marginBottom:'10px' }}>
                          <div style={{ fontSize:'var(--cc-caption)', fontWeight:'700', color:'#F59E0B', letterSpacing:'0.5px', marginBottom:'8px' }}>📐 EDITAR DIMENSIONES</div>
                          <div style={{ display:'flex', gap:'10px', marginBottom:'8px', flexWrap:'wrap' }}>
                            <div style={{ flex:1, minWidth:'100px' }}>
                              <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ÁREA / LONG / NOD</div>
                              <input type="number" value={popupDims.area_long_nod}
                                onChange={e => setPopupDims(d => ({...d, area_long_nod: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ flex:1, minWidth:'100px' }}>
                              <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ANCHO</div>
                              <input type="number" value={popupDims.ancho}
                                onChange={e => setPopupDims(d => ({...d, ancho: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            </div>
                            <div style={{ flex:1, minWidth:'100px' }}>
                              <div style={{ fontSize:'var(--cc-caption)', color:t.textMuted, fontWeight:'700', marginBottom:'3px' }}>ESPESOR</div>
                              <input type="number" value={popupDims.espesor}
                                onChange={e => setPopupDims(d => ({...d, espesor: e.target.value}))}
                                style={{ width:'100%', background:t.inputBg, border:`1.5px solid ${t.border}`, borderRadius:'6px', padding:'6px 8px', color:t.text, fontSize:'var(--cc-sm)', boxSizing:'border-box' }} />
                            </div>
                          </div>
                          <button disabled={popupGuardando} onClick={async () => {
                            setPopupGuardando(true); setPopupMsg('')
                            const pArea = popupDims.area_long_nod === '' ? NaN : parseFloat(popupDims.area_long_nod)
                            const pAncho = popupDims.ancho === '' ? NaN : parseFloat(popupDims.ancho)
                            const pEsp = popupDims.espesor === '' ? NaN : parseFloat(popupDims.espesor)
                            const area = Number.isFinite(pArea) ? pArea : 0
                            const ancho = Number.isFinite(pAncho) ? pAncho : 0
                            const esp   = Number.isFinite(pEsp) ? pEsp : 0
                            const cant  = (ancho > 0 || esp > 0) ? Math.round(area * ancho * esp * 10000) / 10000 : area
                            const costo = Math.round(cant * (r.vlr_unitario || 0))
                            const body  = {
                              area_long_nod: Number.isFinite(pArea) ? pArea : null,
                              ancho: Number.isFinite(pAncho) ? pAncho : null,
                              espesor: Number.isFinite(pEsp) ? pEsp : null,
                              cant_total: cant,
                              costo_directo: costo
                            }
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const updated = await fetch(`${API}/presupuesto/item/${r.id}`, { headers:{ Authorization:`Bearer ${token}` } })
                              if (updated.ok) { const d = await updated.json(); setModalDetallePpto(d) }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                              setPopupMsg('✅ Dimensiones actualizadas')
                            } else setPopupMsg('❌ Error al guardar')
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#F59E0B', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', opacity: popupGuardando ? 0.6 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Recalcular y guardar'}
                          </button>
                        </div>
                      )}

                      {/* ── Cambiar capítulo / ítem ── */}
                      {puedeEditar && (
                        <div style={{ background:t.bg, borderRadius:'8px', padding:'10px 12px', marginBottom:'10px' }}>
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
                            setPopupGuardando(true); setPopupMsg('')
                            const precio = listadoPrecios.find(p => p.item_numero === popupItem)
                            const vlr    = precio?.valor_unitario || precio?.vlr_unitario || r.vlr_unitario || 0
                            const cant   = r.cant_total || 0
                            const body   = {
                              ...(popupCap  && { capitulo: popupCap }),
                              ...(popupItem && { item: popupItem, descripcion: precio?.descripcion || r.descripcion, und: precio?.und || r.und }),
                              vlr_unitario:  vlr,
                              costo_directo: Math.round(cant * vlr)
                            }
                            const res = await fetch(`${API}/presupuesto/item/${r.id}`, {
                              method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                              body: JSON.stringify(body)
                            })
                            if (res.ok) {
                              const updated = await fetch(`${API}/presupuesto/item/${r.id}`, { headers:{ Authorization:`Bearer ${token}` } })
                              if (updated.ok) { const d = await updated.json(); setModalDetallePpto(d) }
                              { const c = drill.find(d=>d.campo==='capitulo')?.valor; if(c) delete _pptoCachePorCap.current[c] }
                              setPopupMsg('✅ Capítulo/ítem actualizado')
                            } else setPopupMsg('❌ Error al guardar')
                            setPopupGuardando(false)
                          }}
                            style={{ background:'#0077B6', color:'#fff', border:'none', borderRadius:'7px', padding:'7px 18px', fontSize:'var(--cc-sm)', fontWeight:'700', cursor:'pointer', opacity: (popupGuardando || (!popupCap && !popupItem)) ? 0.5 : 1 }}>
                            {popupGuardando ? '⏳ Guardando...' : '💾 Actualizar y recalcular'}
                          </button>
                        </div>
                      )}

                      {/* ── Dar de baja — solo si DWG enlazado ── */}
                      {puedeEliminar && dwgEnlazado && (
                        <button onClick={async () => {
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

      {/* ── Modal comentario ── */}
      {modalComentario && (() => {
        const TITULOS = { dims:'📐 Comentario — Cambio de Dimensiones', item_capitulo:'🔄 Comentario — Cambio de Ítem/Capítulo', validacion:'🔍 Comentario — Cambio de Estado' }
        const COLORES = { dims:'#F59E0B', item_capitulo:'#0077B6', validacion:'#10B981' }
        const color   = COLORES[modalComentario.tipo] || t.primary
        const valido  = !modalComentario.obligatorio || textoComentario.trim().length > 0
        return (
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:6000,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ background:t.bgCard,border:`1.5px solid ${color}44`,borderRadius:'16px',padding:'28px',width:'460px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>
              <div style={{ fontSize:'var(--cc-body)',fontWeight:'700',color,marginBottom:'6px' }}>{TITULOS[modalComentario.tipo]}</div>
              <div style={{ fontSize:'var(--cc-sm)',color:t.textMuted,marginBottom:'16px' }}>
                {modalComentario.obligatorio ? '⚠️ El comentario es obligatorio para este estado.' : 'Opcional — explica el motivo del cambio.'}
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
              {modalComentario.obligatorio && !textoComentario.trim() && (
                <div style={{ fontSize:'var(--cc-sm)',color:'#EF4444',marginTop:'4px' }}>* Este campo es obligatorio</div>
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

      {/* ── Modal importar ── */}
      {modalImport && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'16px',padding:'28px',width:'420px',maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'var(--cc-md)',fontWeight:'700',color:t.primary,marginBottom:'8px' }}>📂 Importar Presupuesto</div>
            <div style={{ fontSize:'var(--cc-label)',color:t.textMuted,marginBottom:'20px' }}>{modalImport.fileName} — <strong style={{color:t.text}}>{modalImport.rows.length} registros</strong></div>
            <div style={{ fontSize:'var(--cc-label)',fontWeight:'600',color:t.text,marginBottom:'10px' }}>¿Cómo desea cargar los datos?</div>
            <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'20px' }}>
              {[['replace','🔄 Reemplazar todo','Elimina los registros actuales y carga los nuevos'],['append','➕ Agregar','Agrega los nuevos registros sin eliminar los existentes']].map(([v,l,d]) => (
                <label key={v} style={{ display:'flex',alignItems:'flex-start',gap:'10px',padding:'12px',border:`2px solid ${modoImport===v?t.primary:t.border}`,borderRadius:'8px',cursor:'pointer',background:modoImport===v?t.primary+'11':'transparent' }}>
                  <input type="radio" name="modo" value={v} checked={modoImport===v} onChange={() => { setModoImport(v); setConfirmReplace(false) }} style={{ marginTop:'2px' }} />
                  <div><div style={{ fontSize:'var(--cc-label)',fontWeight:'600',color:t.text }}>{l}</div><div style={{ fontSize:'var(--cc-sm)',color:t.textMuted }}>{d}</div></div>
                </label>
              ))}
            </div>
            {modoImport === 'replace' && confirmReplace && (
              <div style={{ background:'#FEE2E2',border:'1px solid #FCA5A5',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'var(--cc-sm)',color:'#DC2626' }}>
                ⚠️ <strong>Esta acción no se puede deshacer.</strong> Se eliminarán todos los registros actuales. ¿Confirma?
              </div>
            )}
            <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
              <button onClick={() => { setModalImport(null); setConfirmReplace(false) }} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'8px',padding:'9px 18px',fontSize:'var(--cc-label)',color:t.textMuted,cursor:'pointer' }}>Cancelar</button>
              <button onClick={ejecutarImport} style={{ background:modoImport==='replace'&&confirmReplace?'#DC2626':t.primary,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 20px',fontSize:'var(--cc-label)',fontWeight:'600',cursor:'pointer' }}>
                {modoImport==='replace'&&!confirmReplace?'Continuar →':modoImport==='replace'?'⚠️ Sí, reemplazar':'➕ Agregar'}
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
            onClick={cerrar}
            role="presentation"
          >
            <div
              style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:16, padding:26, width:500, maxWidth:'96vw', boxShadow:'0 24px 64px rgba(0,0,0,0.45)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize:'var(--cc-label)', fontWeight:800, letterSpacing:0.6, color:t.primary, marginBottom:6 }}>AUDITORÍA SICOECAD — COLA CAD</div>
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

      {/* ── Toolbar ── */}
      <div style={{ display:'flex',gap:'12px',alignItems:'center',marginBottom:'16px',flexWrap:'wrap' }}>
        {esDeveloper && (
          <label style={{ background:colorActual,color:'#fff',border:'none',borderRadius:'8px',padding:'9px 18px',fontSize:'var(--cc-label)',fontWeight:'600',cursor:importing?'wait':'pointer',opacity:importing?0.7:1 }}>
            {importing ? `Importando ${importProgreso}%...` : '📂 Importar CSV'}
            <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportCSV} disabled={importing} />
          </label>
        )}
        {importing && (
          <div style={{ flex:1,maxWidth:'200px',height:'6px',background:t.border,borderRadius:'3px',overflow:'hidden' }}>
            <div style={{ width:`${importProgreso}%`,height:'100%',background:t.primary,borderRadius:'3px',transition:'width 0.3s' }} />
          </div>
        )}
        {importMsg && <span style={{ fontSize:'var(--cc-label)',color:importMsg.startsWith('✅')?'#16A34A':importMsg.startsWith('❌')?'#DC2626':t.textMuted }}>{importMsg}</span>}
        <span style={{ marginLeft:'auto',fontSize:'var(--cc-sm)',color:t.textMuted }}>
        <button onClick={() => recargarCapActual(drill.length === 0)}
          style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'8px', padding:'7px 14px', color:t.textMuted, fontSize:'var(--cc-sm)', fontWeight:'600', cursor:'pointer' }}>
          🔄 Actualizar
        </button>
          {drill.length === 0 && !verPapelera
            ? `${capitulosResumen.length} capítulos`
            : `${conteoFiltro != null ? conteoFiltro.toLocaleString('es-CO') : registros.length} en contrato · ${registrosFiltrados.length} filtrados (vista)`} · {seleccionados.size} seleccionados
      {totalPaginas > 1 && (
        <span style={{ marginLeft: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina === 1}
            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor: pagina===1?'default':'pointer', color: pagina===1?t.textMuted:t.text }}>‹</button>
          <span style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>Pág. {pagina} / {totalPaginas}</span>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p+1))} disabled={pagina === totalPaginas}
            style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:'4px', padding:'2px 8px', cursor: pagina===totalPaginas?'default':'pointer', color: pagina===totalPaginas?t.textMuted:t.text }}>›</button>
        </span>
      )}
        </span>
      </div>

      {!verPapelera && (
        <PptoFiltroObraVista
          t={t}
          s={s}
          contratoId={contratoId}
          token={token}
          f={fObra}
          onF={(patch) => setFObra(p => ({ ...p, ...patch }))}
          capitulosResumen={capitulosResumen}
          itemsResumen={itemsResumen}
          loadingCapitulos={loadingCapitulos}
          capExpandido={capExpandido}
          onToggleCap={onToggleCapPanelObra}
          onPickItem={onPickItemFromPanel}
          onBuscar={aplicarFiltroObra}
          onLimpiar={limpiarFiltroObra}
          onRestablecerPksItem={restablecerPksVistaItem}
          onRevisorTramos={abrirRevisorTramosObra}
          tramoOptions={opcionesUbicacion.tramos}
          calzadaOptions={opcionesUbicacion.calzadas}
          semaforo={SEMAFORO}
          buscando={buscandoFiltroObra}
          onMapPkPick={onMapPkPresu}
          pkIdsDeGrilla={pkIdsDeGrillaParaMapa}
        />
      )}
      {verPapelera && (
        <div style={{ background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:12, marginBottom:10, color:t.textMuted, fontSize:'var(--cc-sm)' }}>Papelera: use «Actualizar» o importar; el filtrado avanzado aplica al volver a activos.</div>
      )}
      {((conteoFiltro != null && registros.length > 0) || (!verPapelera && registrosFiltrados.length > 0)) && (
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10 }}>
            {conteoFiltro != null && registros.length > 0 && (
              <div style={{ fontSize:'var(--cc-sm)', fontWeight:700, color:t.primary }}>
                Coincidencias (servidor): {conteoFiltro.toLocaleString('es-CO')}
              </div>
            )}
            {!verPapelera && registrosFiltrados.length > 0 && (
              <button
                type="button"
                onClick={() => setModalResumenValidacion(true)}
                style={{ background:'#0D948818', border:'1px solid #0D9488', borderRadius:8, padding:'7px 14px', fontSize:'var(--cc-sm)', fontWeight:700, color:'#0D9488', cursor:'pointer' }}
                title="Informe de estados según el mismo conjunto de filas que ve la grilla (filtro actual)"
              >
                📊 Resumen de validación
              </button>
            )}
          </div>
          {!verPapelera && registrosFiltrados.length > 0 && (
            <div style={{ fontSize:'var(--cc-label)', color:t.textMuted }}>Vista: {resumenValidacionVista.total} registro{resumenValidacionVista.total !== 1 ? 's' : ''} filtrado{resumenValidacionVista.total !== 1 ? 's' : ''} · costo {fmt(resumenValidacionVista.costoAcum)}</div>
          )}
        </div>
      )}

      {modalResumenValidacion && (() => {
        const { porRevisado, porPreInterv, total, costoAcum } = resumenValidacionVista
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
                <strong>{total.toLocaleString('es-CO')}</strong> reg. · <strong>Costo directo (suma):</strong> {nivelInfo.verValoresEconomicos ? fmt(costoAcum) : '— (rol sin valores)'}
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

              {puedeEliminar && !verPapelera && dwgEnlazado && seleccionados.size > 1 && (
                <button onClick={async () => {
                  const idsBaja = [...seleccionados].filter(id => !esSellado(registros.find(rr => rr.id === id)))
                  if (idsBaja.length === 0) {
                    alert('Los registros seleccionados están sellados (aprobados por Interventoría) y no pueden modificarse.')
                    return
                  }
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
        <div style={{ background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:'12px',overflow:'auto',boxShadow:t.shadow }}>
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
                <th style={thStyle}>No.Ini</th>
                <th style={thStyle}>No.Fin</th>
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
                const isEdit = editando === r.id && !esSellado(r)
                const bgSellado = esSellado(r) ? 'rgba(22,101,52,0.06)' : 'transparent'
                return (
                  <tr key={r.id} data-id={r.id} style={{ background: filaZoom===r.id ? '#F59E0B22' : seleccionados.has(r.id) ? (t.primary+'18') : bgSellado, cursor: r.x_label ? 'crosshair' : 'default', outline: filaZoom===r.id ? '2px solid #F59E0B88' : 'none', transition:'background 0.3s, outline 0.3s' }}
                    onClick={() => { if (!isEdit) { zoomEnDwg(r); highlightEnDwg(r); if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && r.pk_id) { const td = document.getElementById(`zoom-feedback-${r.id}`); if(td){td.style.opacity='1'; setTimeout(()=>{td.style.opacity='0'},2000)} } } }}>
                    <td style={{...tdStyle, whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <input type="checkbox" checked={seleccionados.has(r.id)} disabled={esSellado(r)} onChange={() => toggleSel(r.id)}
                          style={{ cursor: esSellado(r) ? 'not-allowed' : 'pointer', opacity: esSellado(r) ? 0.45 : 1 }} />
                        <span id={`zoom-feedback-${r.id}`} style={{ fontSize:'var(--cc-caption)', color:'#10B981', opacity:'0', transition:'opacity 0.3s', pointerEvents:'none' }}>🎯</span>
                        <button onClick={() => { setModalDetallePpto(r); setModalDetallePptoEditable(!esSellado(r)); setPopupDims({ ancho: r.ancho ?? '', espesor: r.espesor ?? '', area_long_nod: r.area_long_nod ?? '' }) }}
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
                        onClick={() => { setModalDetallePpto(r); setModalDetallePptoEditable(!esSellado(r)); setPopupDims({ ancho: r.ancho ?? '', espesor: r.espesor ?? '', area_long_nod: r.area_long_nod ?? '' }) }}
                        title="Ver detalle"
                        style={{ fontWeight:'600', color:t.primary, cursor:'pointer', textDecoration:'underline' }}>
                        {r.id_pol||r.pk_id||'-'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.capitulo} onChange={e=>setEditValues({...editValues,capitulo:e.target.value})}
                        style={{ width:'120px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} onClick={e=>e.stopPropagation()} />
                        : r.capitulo}
                    </td>
                    <td style={{ ...tdStyle, fontSize:'var(--cc-sm)', color:t.textMuted }}>{r.competencia||'—'}</td>
                    <td style={tdStyle}>
                      {isEdit ? <input value={editValues.item} onChange={e=>setEditValues({...editValues,item:e.target.value})}
                        style={{ width:'80px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} onClick={e=>e.stopPropagation()} />
                        : r.item}
                    </td>
                    <td style={{ ...tdStyle,maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.descripcion}</td>
                    <td style={tdStyle}>{r.und}</td>
                    <td style={{ ...tdStyle }}>{r.no_inicio || '-'}</td>
                    <td style={{ ...tdStyle }}>{r.no_final || '-'}</td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {isEdit && puedeEditarDimensiones
                        ? <input type="number" value={editValues.area_long_nod} onChange={e=>setEditValues({...editValues,area_long_nod:e.target.value})}
                            style={{ width:'80px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : puedeEditarDimensiones && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.area_long_nod ?? (r.area_long_nod ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], area_long_nod: v } })) }}
                            style={{ width:'80px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : fmtN(r.area_long_nod)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {isEdit && puedeEditarDimensiones
                        ? <input type="number" value={editValues.ancho} onChange={e=>setEditValues({...editValues,ancho:e.target.value})}
                            style={{ width:'70px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : puedeEditarDimensiones && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.ancho ?? (r.ancho ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], ancho: v } })) }}
                            style={{ width:'70px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : fmtN(r.ancho)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right' }} onClick={e=>e.stopPropagation()}>
                      {isEdit && puedeEditarDimensiones
                        ? <input type="number" value={editValues.espesor} onChange={e=>setEditValues({...editValues,espesor:e.target.value})}
                            style={{ width:'70px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : puedeEditarDimensiones && seleccionados.has(r.id) && !esSellado(r)
                        ? <input type="number" value={editDims[r.id]?.espesor ?? (r.espesor ?? '')}
                            onChange={e => { const v = e.target.value; setEditDims(prev => ({ ...prev, [r.id]: { ...prev[r.id], espesor: v } })) }}
                            style={{ width:'70px',background:t.inputBg,border:`1.5px solid ${t.primary}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} />
                        : fmtN(r.espesor)}
                    </td>
                    <td style={{ ...tdStyle,textAlign:'right',fontWeight:'600' }}>{fmtN(r.cant_total)}</td>
                    {nivelInfo.verValoresEconomicos && (
                    <td style={{ ...tdStyle,textAlign:'right' }}>
                      {isEdit ? <input type="number" value={editValues.vlr_unitario} onChange={e=>setEditValues({...editValues,vlr_unitario:e.target.value})}
                        style={{ width:'90px',background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:'4px',padding:'3px 6px',color:t.text,fontSize:'var(--cc-sm)' }} onClick={e=>e.stopPropagation()} />
                        : fmt(r.vlr_unitario)}
                    </td>
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
                    {puedeEliminar && !verPapelera && dwgEnlazado && (
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

                    {puedeEditar && (
                      <td style={tdStyle} onClick={e=>e.stopPropagation()}>
                        {esSellado(r) ? (
                          <span title="Registro sellado — no editable" style={{ fontSize:'var(--cc-sm)', color:t.textMuted }}>🔒</span>
                        ) : isEdit ? (
                          <div style={{ display:'flex',gap:'4px' }}>
                            <button onClick={() => guardarEdicion(r.id)} style={{ background:t.primary,color:'#fff',border:'none',borderRadius:'4px',padding:'4px 10px',fontSize:'var(--cc-sm)',cursor:'pointer' }}>✓</button>
                            <button onClick={() => setEditando(null)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'4px',padding:'4px 8px',fontSize:'var(--cc-sm)',cursor:'pointer',color:t.textMuted }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => iniciarEdicion(r)} style={{ background:'transparent',border:`1px solid ${t.border}`,borderRadius:'4px',padding:'4px 8px',fontSize:'var(--cc-sm)',cursor:'pointer',color:t.textMuted }}>✏️</button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
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
