/**
 * Registro de Entradas — popup amplio independiente (tablet 10").
 * Recibo («Llegó material»): OC consolidada → captura única (cant+placa+2 fotos) → confirmar.
 * «Salió material» abre el popup de salidas (onAbrirSalioMaterial); no usa el flujo disposicion.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { sha256Hex } from '../comprimirImagen'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import EntradaSoporteGaleriaModal from './EntradaSoporteGaleriaModal'
import EntradaSoportePicker from './EntradaSoportePicker'
import { almacenContraste, estiloAvisoAlmacen } from './almacenContraste'
import {
  buildAlmacenCssVars,
  formatNombrePropio,
  fmtCant,
  todayDateInputColombia,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { MODO_RETROACTIVO } from './retroactivoModo'
import { prepareRemisionSoporte } from './almacenRemisionSoporte'
import {
  applyCantidadToOcRow,
  excelCantidadKeyNav,
  splitInsumoCodigoDesc,
} from './entradaOcExcelHelpers'
import {
  medirVistaTablaOc,
  textoAlertaVistaTablaOc,
} from './entradaOcTablaVista'
import {
  formatRemisionNumeroInput,
  normalizeRemisionNumero,
  remisionNumeroOk,
} from './entradaRemisionNumero'
import {
  fileFromClipboardEvent,
  MSG_PEGADO_VACIO,
  resolvePasteTarget,
  validateSoportePaste,
} from './entradaSoportePaste'
import { puedeRegistrarSalidaAlmacen } from './almacenPermisos'
import {
  alertaAgotamientoOc,
  DEFAULT_UMBRAL_AMARILLO,
  DEFAULT_UMBRAL_ROJO,
  esInsumoConsumido,
  mensajeAlertaAgotamiento,
  saldoResultante,
  textoSaldoProgreso,
} from './entradaOcSaldoHelpers'
import {
  buildItemsFromOcSeleccion,
  consolidarResumenInsumos,
  countSearchDisplay,
  distributeCantidadOverLineas,
  filterOcsForSearch,
  formatPlacaInput,
  highlightSegments,
  initOcLineasSeleccion,
  motivosPorRevisarPreview,
  placaValida,
  PASO,
  resumenLineasSeleccion,
} from './entradaRegistroTabletHelpers'
import { buildPrefillSalidaInmediata } from './salidaInmediataHelpers'

function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* ignore */ }
  return `ent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function HighlightText({ text, query }) {
  const segs = highlightSegments(text, query)
  return (
    <>
      {segs.map((s, i) => (
        s.hit
          ? <mark key={i} style={{ background: '#fde68a', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>{s.text}</mark>
          : <span key={i}>{s.text}</span>
      ))}
    </>
  )
}

const btnHome = (bg, color = '#fff') => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 110,
  width: '100%',
  borderRadius: 14,
  border: 'none',
  background: bg,
  color,
  fontSize: 'var(--cc-md, 1.1rem)',
  fontWeight: 800,
  cursor: 'pointer',
  padding: 14,
  boxShadow: 'var(--cc-almacen-shadow-modal, 0 4px 14px rgba(15,23,42,0.14))',
})

const cardTouch = (ui, selected) => ({
  ...ui.card,
  padding: 14,
  marginBottom: 0,
  cursor: 'pointer',
  border: selected ? `3px solid ${ui.accent}` : `1px solid ${ui.borderColor}`,
  borderRadius: 12,
  minHeight: 64,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  WebkitTapHighlightColor: 'transparent',
  background: ui.card?.background || 'var(--cc-almacen-bg-card, #fff)',
  color: ui.text,
})

const inputGiant = (ui) => ({
  ...ui.input,
  fontSize: 'var(--cc-title, 1.25rem)',
  padding: '12px 12px',
  minHeight: 48,
  width: '100%',
  boxSizing: 'border-box',
})

function revokeUrl(url) {
  if (url) {
    try { URL.revokeObjectURL(url) } catch { /* ignore */ }
  }
}

export default function EntradaRegistroTablet({
  onClose,
  onSaved,
  permisos,
  theme,
  token,
  contratoId,
  onAbrirSalioMaterial,
  modoRegistro = 'actualizado',
  fechaHechoInicial = '',
  onFechaHechoChange,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const contraste = useMemo(() => almacenContraste(ui), [ui])
  const themeCssVars = useMemo(() => buildAlmacenCssVars(theme || {}), [theme])
  const qtyInputRefs = useRef({})
  const ocRowRefs = useRef({})
  const ocTableScrollRef = useRef(null)
  const continuarCapturaRef = useRef(null)
  const numeroRemisionRef = useRef(null)
  const contrato = contratoId || permisos?.contratoId
  const esRetro = modoRegistro === MODO_RETROACTIVO
  const [fechaHecho, setFechaHecho] = useState(() => fechaHechoInicial || todayDateInputColombia())
  const [fechaAprox, setFechaAprox] = useState(false)

  useEffect(() => {
    if (fechaHechoInicial) setFechaHecho(fechaHechoInicial)
  }, [fechaHechoInicial])

  const setFechaHechoPersist = (v) => {
    setFechaHecho(v)
    onFechaHechoChange?.(v)
  }

  const [paso, setPaso] = useState(PASO.INICIO)
  const [tipo, setTipo] = useState(null)
  const [ocs, setOcs] = useState([])
  const [ocsLoaded, setOcsLoaded] = useState(false)
  const [loadingOc, setLoadingOc] = useState(false)
  const [ocTimingMs, setOcTimingMs] = useState(null)
  const [ocSearch, setOcSearch] = useState('')
  const [chromeTop, setChromeTop] = useState(0)
  const [ocCard, setOcCard] = useState(null)
  const [insumoSel, setInsumoSel] = useState(null)
  const [proveedorId, setProveedorId] = useState(null)
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [proveedorManual, setProveedorManual] = useState(false)
  const [provQuery, setProvQuery] = useState('')
  const [provOpts, setProvOpts] = useState([])
  const [insumoId, setInsumoId] = useState(null)
  const [insumoLabel, setInsumoLabel] = useState('')
  const [insumoUnidad, setInsumoUnidad] = useState('m³')
  const [insumoQuery, setInsumoQuery] = useState('')
  const [insumoOpts, setInsumoOpts] = useState([])
  const [materialManual, setMaterialManual] = useState(false)
  const [cantidad, setCantidad] = useState('')
  const [ocSeleccion, setOcSeleccion] = useState([])
  const [placa, setPlaca] = useState('')
  const [conductor, setConductor] = useState('')
  const [placaOpts, setPlacaOpts] = useState([])
  const [vehiculoNuevo, setVehiculoNuevo] = useState(false)
  const [llegadaDomicilio, setLlegadaDomicilio] = useState(false)
  const [fotoRemision, setFotoRemision] = useState(null)
  const [fotoRemisionPreview, setFotoRemisionPreview] = useState('')
  const [fotoRemisionHash, setFotoRemisionHash] = useState('')
  const [fotoMaterial, setFotoMaterial] = useState(null)
  const [fotoMaterialPreview, setFotoMaterialPreview] = useState('')
  const [fotoMaterialHash, setFotoMaterialHash] = useState('')
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [tramo, setTramo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [salidasPorRevisar, setSalidasPorRevisar] = useState(0)
  const [soporteFocus, setSoporteFocus] = useState(null) // 'remision' | 'material' | null
  const [pasteHint, setPasteHint] = useState('')
  const [numeroRemision, setNumeroRemision] = useState('')
  const [remisionDupHint, setRemisionDupHint] = useState('')
  const [galeriaKind, setGaleriaKind] = useState(null) // 'remision' | 'material' | null
  const [previewSoporte, setPreviewSoporte] = useState(null) // 'remision' | 'material' | null
  const [tablaVista, setTablaVista] = useState({ visible: 0, total: 0, hayOcultas: false, marcadasOcultas: 0 })
  const [savePhase, setSavePhase] = useState('')
  const [pdfHint, setPdfHint] = useState('')
  /** null = sin responder; true/false = Sí/No a salida inmediata */
  const [usaDeUnaVez, setUsaDeUnaVez] = useState(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey())
  const [confirmDup, setConfirmDup] = useState(null)
  const [umbralAmarillo, setUmbralAmarillo] = useState(DEFAULT_UMBRAL_AMARILLO)
  const [umbralRojo, setUmbralRojo] = useState(DEFAULT_UMBRAL_ROJO)

  const puedeCrear = Boolean(permisos?.crear)
  const remisionBloqueada = Boolean(remisionDupHint)
  const puedeSalida = puedeRegistrarSalidaAlmacen(permisos)
  const puedeValidar = Boolean(permisos?.validar)
  const preguntaSalidaVisible = Boolean(puedeSalida && tipo === 'recibo')
  const cantNum = Number(cantidad)
  const lineasResumen = useMemo(() => resumenLineasSeleccion(ocSeleccion), [ocSeleccion])
  const lineasResumenVista = useMemo(
    () => consolidarResumenInsumos(lineasResumen),
    [lineasResumen],
  )
  const modoMultiOc = Boolean(ocCard && ocSeleccion.length)
  const superaSaldo = modoMultiOc
    ? lineasResumen.some((ln) => ln.supera)
    : Boolean(insumoSel && cantNum > 0 && cantNum > (Number(insumoSel.saldo_cantidad) || 0) + 0.0001)
  const sinInsumo = Boolean(!ocCard && !insumoId)
  const fotosCompletas = Boolean(fotoRemision && fotoMaterial)
  const numeroRemisionListo = remisionNumeroOk(numeroRemision)
  const placaOk = !placa.trim() || placaValida(placa)

  const draft = useMemo(() => ({
    tipo,
    orden_compra_id: ocCard?.orden_compra_id || null,
    // supera_saldo ya no es «por revisar»: bloquea confirmar (regla nueva).
    supera_saldo: false,
    proveedor_manual: proveedorManual || (!proveedorId && Boolean(proveedorNombre)),
    sin_insumo: sinInsumo,
    sin_sector: tipo === 'recibo' && !String(pkId || pkLabel || '').trim(),
    foto: fotoRemision,
    // Vacío o domicilio no marca por revisar; solo vehículo nuevo con placa válida.
    vehiculo_nuevo: Boolean(vehiculoNuevo && placaValida(placa) && !llegadaDomicilio),
  }), [tipo, ocCard, proveedorManual, proveedorId, proveedorNombre, sinInsumo, pkId, pkLabel, fotoRemision, vehiculoNuevo, placa, llegadaDomicilio])

  const motivosPrev = motivosPorRevisarPreview(draft)

  const ocsFiltradas = useMemo(
    () => filterOcsForSearch(ocs, ocSearch),
    [ocs, ocSearch],
  )
  const ocDisplayCount = useMemo(() => countSearchDisplay(ocsFiltradas), [ocsFiltradas])

  const mostrarSinOc = useMemo(() => {
    if (loadingOc && !ocsLoaded) return false
    if (ocs.length === 0) return true
    return Boolean(ocSearch.trim()) && ocsFiltradas.length === 0
  }, [loadingOc, ocsLoaded, ocs.length, ocSearch, ocsFiltradas.length])

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.cc-app-header')
      setChromeTop(el ? Math.round(el.getBoundingClientRect().bottom) : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // Panel independiente: bloquear scroll del fondo.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    const prevTouch = body.style.touchAction
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
      body.style.touchAction = prevTouch
    }
  }, [])

  const loadOcs = useCallback((opts = {}) => {
    const silent = Boolean(opts.silent)
    if (!silent) setLoadingOc(true)
    const tClient = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    api.listOcsPendientesEntrada()
      .then((res) => {
        const rows = Array.isArray(res) ? res : (res?.items || [])
        setOcs(rows)
        setOcsLoaded(true)
        const server = res?.timing_ms || null
        const clientMs = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tClient)
        setOcTimingMs({ client_ms: clientMs, server })
        if (typeof console !== 'undefined' && console.info) {
          console.info('[almacen] ocs-pendientes', { client_ms: clientMs, server, count: rows.length })
        }
      })
      .catch((e) => {
        if (!silent) setError(e.message || 'No se pudieron cargar las OC')
      })
      .finally(() => {
        if (!silent) setLoadingOc(false)
      })
  }, [api])

  useEffect(() => {
    if (paso !== PASO.OC) return undefined
    if (ocsLoaded) {
      loadOcs({ silent: true })
      return undefined
    }
    loadOcs({ silent: false })
    return undefined
  }, [paso, ocsLoaded, loadOcs])

  useEffect(() => {
    let cancelled = false
    api.getConfig()
      .then((cfg) => {
        if (cancelled || !cfg) return
        const a = Number(cfg.alerta_saldo_amarillo_pct)
        const r = Number(cfg.alerta_saldo_rojo_pct)
        if (Number.isFinite(a) && a > 0) setUmbralAmarillo(a)
        if (Number.isFinite(r) && r > 0) setUmbralRojo(r)
      })
      .catch(() => { /* defaults */ })
    return () => { cancelled = true }
  }, [api])

  useEffect(() => {
    if (paso !== PASO.SIN_OC && paso !== PASO.ESCOMBRERA) return undefined
    if (paso === PASO.ESCOMBRERA) {
      if (!provQuery.trim()) {
        setProvOpts([])
        return undefined
      }
      const t = setTimeout(() => {
        api.searchProveedores(provQuery)
          .then((rows) => setProvOpts(Array.isArray(rows) ? rows : []))
          .catch(() => setProvOpts([]))
      }, 220)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      api.searchProveedoresSolicitados(provQuery, { insumoId: insumoId || undefined })
        .then((rows) => setProvOpts(Array.isArray(rows) ? rows : []))
        .catch(() => setProvOpts([]))
    }, 220)
    return () => clearTimeout(t)
  }, [api, provQuery, paso, insumoId])

  useEffect(() => {
    if (paso !== PASO.SIN_OC) return undefined
    if (materialManual) return undefined
    const t = setTimeout(() => {
      api.searchMaterialesSolicitados(insumoQuery, { proveedorId: proveedorId || undefined })
        .then((rows) => setInsumoOpts(Array.isArray(rows) ? rows : []))
        .catch(() => setInsumoOpts([]))
    }, 220)
    return () => clearTimeout(t)
  }, [api, insumoQuery, paso, proveedorId, materialManual])

  const resetFlujo = () => {
    setOcCard(null)
    setInsumoSel(null)
    setProveedorId(null)
    setProveedorNombre('')
    setProveedorManual(false)
    setInsumoId(null)
    setInsumoLabel('')
    setInsumoUnidad('m³')
    setInsumoQuery('')
    setMaterialManual(false)
    setCantidad('')
    setOcSeleccion([])
    setPlaca('')
    setConductor('')
    setPlacaOpts([])
    setVehiculoNuevo(false)
    setLlegadaDomicilio(false)
    revokeUrl(fotoRemisionPreview)
    revokeUrl(fotoMaterialPreview)
    setFotoRemision(null)
    setFotoRemisionPreview('')
    setFotoRemisionHash('')
    setFotoMaterial(null)
    setFotoMaterialPreview('')
    setFotoMaterialHash('')
    setPkId('')
    setPkLabel('')
    setTramo('')
    setError('')
    setOkMsg('')
    setOcSearch('')
    setSoporteFocus(null)
    setPasteHint('')
    setNumeroRemision('')
    setRemisionDupHint('')
    setGaleriaKind(null)
    setPreviewSoporte(null)
    setTablaVista({ visible: 0, total: 0, hayOcultas: false, marcadasOcultas: 0 })
    setSavePhase('')
    setPdfHint('')
    setUsaDeUnaVez(null)
    setIdempotencyKey(newIdempotencyKey())
    setConfirmDup(null)
  }

  const elegirTipo = (t) => {
    if (t === 'disposicion' || t === 'salida') {
      // Salió material → popup de salidas (Tab migrado).
      onAbrirSalioMaterial?.({ mode: 'registrar' })
      onClose?.()
      return
    }
    resetFlujo()
    setTipo(t)
    setPaso(t === 'recibo' ? PASO.OC : PASO.SECTOR)
  }

  useEffect(() => {
    if (!puedeValidar) {
      setSalidasPorRevisar(0)
      return undefined
    }
    let cancelled = false
    api.countSalidasPorRevisar()
      .then((n) => { if (!cancelled) setSalidasPorRevisar(n) })
      .catch(() => { if (!cancelled) setSalidasPorRevisar(0) })
    return () => { cancelled = true }
  }, [api, puedeValidar, paso])

  const abrirCapturaOc = (card, { premarcarKey = null, seedSectorFrom = null } = {}) => {
    const insumosFull = Array.isArray(card.insumos) ? card.insumos : []
    // Si venimos de búsqueda por línea, cargar todos los insumos de la OC original
    // (no solo los filtrados) para poder marcar más en la misma entrada.
    const fuente = ocs.find((c) => Number(c.orden_compra_id) === Number(card.orden_compra_id)) || card
    const insumos = Array.isArray(fuente.insumos) && fuente.insumos.length
      ? fuente.insumos
      : insumosFull
    setOcCard(fuente)
    setInsumoSel(null)
    setProveedorId(fuente.proveedor_id || card.proveedor_id || null)
    setProveedorNombre(fuente.proveedor_nombre || card.proveedor_nombre || '')
    setProveedorManual(false)
    setOcSeleccion(initOcLineasSeleccion(insumos, premarcarKey))
    const seed = seedSectorFrom || insumos.find((i) => (i.key || `${i.insumo_id}-${i.material_descripcion}`) === premarcarKey) || insumos[0]
    if (seed) {
      setInsumoId(seed.insumo_id || null)
      setInsumoLabel(seed.material_descripcion || '')
      setInsumoUnidad(seed.unidad || 'm³')
      const sector = (seed.pk_id || '').trim()
      setPkId(sector)
      setPkLabel(sector)
      setTramo(seed.tramo || '')
    }
    setCantidad('')
    setPaso(PASO.CAPTURA)
  }

  const elegirOcCompleta = (card) => {
    abrirCapturaOc(card, { premarcarKey: null })
  }

  const elegirInsumoDeOc = (card, insumo) => {
    if (Boolean(insumo?.consumido) || esInsumoConsumido(insumo?.saldo_cantidad)) return
    const key = insumo.key || `${insumo.insumo_id}-${insumo.material_descripcion}`
    abrirCapturaOc(card, { premarcarKey: key, seedSectorFrom: insumo })
  }

  const toggleOcLinea = (key) => {
    setOcSeleccion((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (row.consumido || esInsumoConsumido(row.insumo?.saldo_cantidad)) return row
      return {
        ...row,
        marked: !row.marked,
        cantidad: row.marked ? '' : (row.cantidad || ''),
      }
    }))
  }

  const setOcLineaCantidad = (key, raw) => {
    setOcSeleccion((prev) => prev.map((row) => {
      if (row.key !== key) return row
      if (row.consumido || esInsumoConsumido(row.insumo?.saldo_cantidad)) return row
      return applyCantidadToOcRow(row, raw)
    }))
  }

  const refreshTablaVista = useCallback(() => {
    const scrollEl = ocTableScrollRef.current
    const rows = ocSeleccion.map((r) => ocRowRefs.current[r.key]).filter(Boolean)
    const marked = new Set(ocSeleccion.filter((r) => r.marked).map((r) => r.key))
    setTablaVista(medirVistaTablaOc(scrollEl, rows, marked))
  }, [ocSeleccion])

  useEffect(() => {
    if (paso !== PASO.CAPTURA || !modoMultiOc) return undefined
    refreshTablaVista()
    const el = ocTableScrollRef.current
    if (!el) return undefined
    const onScroll = () => refreshTablaVista()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refreshTablaVista()) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [paso, modoMultiOc, refreshTablaVista, ocSeleccion.length])

  const focusQtyAt = (idx) => {
    const keys = ocSeleccion.map((r) => r.key)
    const k = keys[idx]
    if (!k) return
    const row = ocRowRefs.current[k]
    try {
      row?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    } catch { /* ignore */ }
    const el = qtyInputRefs.current[k]
    if (el) {
      el.focus()
      el.select?.()
    }
    requestAnimationFrame(() => refreshTablaVista())
  }

  const focusNumeroRemision = () => {
    const el = numeroRemisionRef.current
    if (!el) return
    el.focus()
    el.select?.()
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch { /* ignore */ }
  }

  const onQtyKeyDown = (e, idx) => {
    const nav = excelCantidadKeyNav(e.key, {
      shiftKey: e.shiftKey,
      isFirst: idx === 0,
      isLast: idx === ocSeleccion.length - 1,
    })
    if (nav.action === 'stay' && !nav.select) return
    if (nav.action === 'continue') {
      // Tras la última cantidad → N.º de remisión (antes de soportes / confirmar).
      e.preventDefault()
      focusNumeroRemision()
      return
    }
    if (nav.action === 'next' || nav.action === 'down') {
      e.preventDefault()
      focusQtyAt(idx + 1)
      return
    }
    if (nav.action === 'prev' || nav.action === 'up') {
      e.preventDefault()
      focusQtyAt(idx - 1)
    }
  }

  const onCantidadSimpleKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    if (e.key === 'Tab' && e.shiftKey) return
    e.preventDefault()
    focusNumeroRemision()
  }

  const elegirSinOc = () => {
    setOcCard(null)
    setInsumoSel(null)
    setOcSeleccion([])
    setPaso(PASO.SIN_OC)
  }

  const onPlacaChange = async (raw) => {
    const fmt = formatPlacaInput(raw)
    setPlaca(fmt)
    setVehiculoNuevo(false)
    if (fmt.length < 2) {
      setPlacaOpts([])
      return
    }
    try {
      const rows = await api.searchTransportadores(fmt)
      setPlacaOpts(Array.isArray(rows) ? rows : [])
      if (placaValida(fmt)) {
        const exact = (rows || []).find((r) => formatPlacaInput(r.placa) === fmt)
        if (exact?.nombre) {
          setConductor(formatNombrePropio(exact.nombre))
          setVehiculoNuevo(false)
        } else {
          const r = await api.getTransportadorPorPlaca(fmt)
          if (r?.encontrado && r?.nombre) {
            setConductor(formatNombrePropio(r.nombre))
            setVehiculoNuevo(false)
          } else {
            setVehiculoNuevo(true)
          }
        }
      }
    } catch {
      setPlacaOpts([])
    }
  }

  const takeSoporteFile = async (which, f) => {
    if (!f) return false
    setBusy(true)
    setError('')
    try {
      const checkFmt = validateSoportePaste(f, which)
      if (!checkFmt.ok) throw new Error(checkFmt.message)
      const { file } = await prepareRemisionSoporte(f)
      const digest = await sha256Hex(file)
      if (which === 'remision' && fotoMaterialHash && digest === fotoMaterialHash) {
        throw new Error('La remisión y la foto del descargue no pueden ser el mismo archivo.')
      }
      if (which === 'material' && fotoRemisionHash && digest === fotoRemisionHash) {
        throw new Error('La remisión y la foto del descargue no pueden ser el mismo archivo.')
      }
      const check = await api.checkEntradaSoporteHash(digest)
      if (check?.exists) {
        const cod = check.codigo_entrada || check.entrada_id
        throw new Error(check.message || `Este archivo ya se usó en la entrada ${cod}.`)
      }
      const url = (file.type || '').includes('pdf') ? '' : URL.createObjectURL(file)
      if (which === 'remision') {
        revokeUrl(fotoRemisionPreview)
        setFotoRemision(file)
        setFotoRemisionPreview(url)
        setFotoRemisionHash(digest)
      } else {
        revokeUrl(fotoMaterialPreview)
        setFotoMaterial(file)
        setFotoMaterialPreview(url)
        setFotoMaterialHash(digest)
      }
      return true
    } catch (err) {
      setError(err.message || 'No se pudo preparar el soporte')
      return false
    } finally {
      setBusy(false)
    }
  }

  const takeSoporte = async (which, e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return false
    return takeSoporteFile(which, f)
  }

  const applyPasteToTarget = (whichForced, file, emptyMessage) => {
    const target = resolvePasteTarget({
      focusedKind: whichForced || soporteFocus,
      hasRemision: Boolean(fotoRemision),
      hasMaterial: Boolean(fotoMaterial),
    })
    const which = whichForced || target.which
    const label = which === 'remision' ? 'Remisión' : 'Foto del descargue'
    const replaced = which === 'remision' ? Boolean(fotoRemision) : Boolean(fotoMaterial)
    if (!file) {
      setError(emptyMessage || MSG_PEGADO_VACIO)
      setPasteHint('')
      return
    }
    setPasteHint(`Pegado en ${label}${replaced ? ' (reemplazo)' : ''}.`)
    setSoporteFocus(which)
    void takeSoporteFile(which, file)
  }

  const onPasteSoporte = (e) => {
    if (paso !== PASO.CAPTURA || tipo !== 'recibo') return
    // La zona «Pegar aquí» ya procesó el evento (stopPropagation). El botón Pegar
    // no es contentEditable: Ctrl/Cmd+V con el popup abierto sigue llegando aquí.
    const pegarZona = e.target?.closest?.('[data-testid$="-pegar-zona"]')
    if (pegarZona) return
    const f = fileFromClipboardEvent(e)
    if (!f) {
      // Sin archivo: no interferir con pegar texto en inputs (placa, cantidad…).
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      e.preventDefault()
      applyPasteToTarget(null, null, MSG_PEGADO_VACIO)
      return
    }
    e.preventDefault()
    applyPasteToTarget(null, f)
  }

  const onPasteEnSoporte = (which, fileOrNull, message) => {
    applyPasteToTarget(which, fileOrNull, message)
  }

  const hayLineasOc = modoMultiOc && lineasResumen.length > 0
  const hayCantidadSinOc = !modoMultiOc && cantNum > 0
  const capturaLista = Boolean(
    fotosCompletas
    && numeroRemisionListo
    && !remisionBloqueada
    && placaOk
    && !superaSaldo
    && (hayLineasOc || hayCantidadSinOc),
  )

  const onNumeroRemisionKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (capturaLista) continuarCapturaRef.current?.click()
    }
  }

  const onNumeroRemisionChange = (raw) => {
    setNumeroRemision(formatRemisionNumeroInput(raw))
    setRemisionDupHint('')
  }

  // Aviso (no bloqueo) si el N.º ya se usó con el mismo proveedor.
  useEffect(() => {
    if (paso !== PASO.CAPTURA || tipo !== 'recibo') return undefined
    const numero = normalizeRemisionNumero(numeroRemision)
    if (!numero) {
      setRemisionDupHint('')
      return undefined
    }
    if (!proveedorId && !String(proveedorNombre || '').trim()) {
      setRemisionDupHint('')
      return undefined
    }
    let cancelled = false
    const t = setTimeout(() => {
      api.checkEntradaNumeroRemision({
        numeroDocumento: numero,
        proveedorId,
        proveedorNombre,
      }).then((r) => {
        if (cancelled) return
        if (r?.exists) {
          setRemisionDupHint(r.message || `Este N.º ya se usó en ${r.codigo_entrada || 'otra entrada'}.`)
        } else {
          setRemisionDupHint('')
        }
      }).catch(() => {
        if (!cancelled) setRemisionDupHint('')
      })
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [api, numeroRemision, paso, proveedorId, proveedorNombre, tipo])

  const guardar = async (opts = {}) => {
    if (!puedeCrear) return
    if (tipo === 'recibo' && !fotosCompletas) {
      setError('Se requieren la remisión y la foto del descargue.')
      return
    }
    if (tipo === 'recibo' && !numeroRemisionListo) {
      setError('Indique el número de remisión del proveedor.')
      focusNumeroRemision()
      return
    }
    if (superaSaldo) {
      setError('Hay cantidades mayores al saldo de la OC. Corríjalas para continuar.')
      return
    }
    if (preguntaSalidaVisible && usaDeUnaVez == null) {
      setError('Indique si el material se usa de una vez en obra (Sí o No).')
      return
    }
    if (remisionBloqueada) {
      setError(remisionDupHint || 'Este N.º de remisión ya está registrado con este proveedor.')
      focusNumeroRemision()
      return
    }
    if (!llegadaDomicilio && placa.trim() && !placaValida(placa)) {
      setError('Placa inválida. Use formato AAA-000 o marque «Llegó por domicilio».')
      return
    }
    setBusy(true)
    setError('')
    setPdfHint('')
    setSavePhase('Guardando…')
    try {
      if (esRetro) {
        if (!fechaHecho) {
          setError('Indique la fecha del hecho (llegada del material).')
          setBusy(false)
          setSavePhase('')
          return
        }
        const hoy = todayDateInputColombia()
        if (fechaHecho > hoy) {
          setError('No se aceptan fechas futuras.')
          setBusy(false)
          setSavePhase('')
          return
        }
      }
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('fecha_entrada', esRetro ? fechaHecho : todayDateInputColombia())
      if (esRetro) {
        fd.append('es_retroactivo', 'true')
        if (fechaAprox) fd.append('fecha_aproximada', 'true')
      }
      fd.append('idempotency_key', idempotencyKey)
      if (opts.confirmPosibleDuplicado || confirmDup?.confirmed) {
        fd.append('confirm_posible_duplicado', 'true')
      }
      if (tipo === 'recibo') {
        fd.append('numero_documento', normalizeRemisionNumero(numeroRemision))
      }
      if (ocCard?.orden_compra_id) fd.append('orden_compra_id', String(ocCard.orden_compra_id))
      if (proveedorId) fd.append('proveedor_id', String(proveedorId))
      if (proveedorNombre) fd.append('proveedor_nombre_texto', proveedorNombre)
      if (insumoId) fd.append('insumo_id', String(insumoId))
      if (insumoLabel) fd.append('material_descripcion', insumoLabel)
      if (insumoUnidad) fd.append('unidad', insumoUnidad)
      const sector = (pkLabel || pkId || '').trim()
      if (sector) fd.append('pk_id', sector)
      if (tramo) fd.append('tramo', tramo)
      if (llegadaDomicilio) {
        fd.append('llegada_domicilio', 'true')
      } else {
        if (placa) fd.append('placa', placa)
        if (conductor) fd.append('transportador', formatNombrePropio(conductor))
      }
      if (preguntaSalidaVisible && usaDeUnaVez === true) {
        fd.append('salida_inmediata_pendiente', 'true')
      }

      let items
      if (modoMultiOc) {
        items = buildItemsFromOcSeleccion(ocSeleccion)
        if (!items.length) {
          setError('Marque al menos un insumo e indique su cantidad.')
          setBusy(false)
          setSavePhase('')
          return
        }
      } else if (insumoSel?.lineas?.length) {
        items = distributeCantidadOverLineas(insumoSel.lineas, cantNum)
        if (!items.length) {
          items = [{ cantidad_recibida: cantNum, orden_compra_item_id: insumoSel.lineas[0].orden_compra_item_id }]
        }
      } else {
        items = [{ cantidad_recibida: cantNum }]
      }
      fd.append('items_json', JSON.stringify(items))
      if (fotoRemision) fd.append('remision', fotoRemision)
      if (fotoMaterial) fd.append('material_foto', fotoMaterial)
      if (fotoRemisionHash) fd.append('remision_content_hash', fotoRemisionHash)
      if (fotoMaterialHash) fd.append('material_content_hash', fotoMaterialHash)

      // Crítico: validar + registrar + saldo + soportes. PDF/impresión en segundo plano.
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const r = await api.createEntrada(fd)
      const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0)
      const quiereSalida = preguntaSalidaVisible && usaDeUnaVez === true
      setOkMsg(
        `${r?.por_revisar ? 'Guardado · por revisar' : 'Guardado'}`
        + (r?.codigo ? ` · ${r.codigo}` : '')
        + (quiereSalida ? ' · salida pendiente de confirmar' : '')
        + ` · ${Math.max(1, Math.round(ms / 100) / 10)}s`,
      )
      onSaved?.(r)
      setBusy(false)
      setSavePhase('')
      if (r?.id) {
        setPdfHint('Preparando recibo térmico…')
        void (async () => {
          try {
            await api.printDisposicionPdf(r.id, { retries: 10, retryDelayMs: 450 })
            setPdfHint('')
          } catch {
            try {
              await api.openDisposicionPdf(r.id, { retries: 4, retryDelayMs: 500 })
              setPdfHint('')
            } catch {
              setPdfHint('Recibo guardado, pero no se pudo imprimir. Reintente desde el listado de entradas.')
            }
          }
        })()
      }
      if (quiereSalida && r?.id) {
        const prefill = buildPrefillSalidaInmediata(r, {
          pkId: pkLabel || pkId,
          pkLabel: pkLabel || pkId,
          tramo,
        })
        setTimeout(() => {
          onAbrirSalioMaterial?.({ mode: 'registrar', prefillInmediata: prefill })
          resetFlujo()
          setOcsLoaded(false)
          setOcs([])
          setTipo(null)
          setPaso(PASO.INICIO)
          setOkMsg('')
          setPdfHint('')
          onClose?.()
        }, 700)
        return
      }
      setTimeout(() => {
        resetFlujo()
        setOcsLoaded(false)
        setOcs([])
        setTipo(null)
        setPaso(PASO.INICIO)
        setOkMsg('')
        setPdfHint('')
      }, 1200)
    } catch (e) {
      if (e?.code === 'POSIBLE_DUPLICADO' || e?.detalle?.code === 'POSIBLE_DUPLICADO') {
        const d = e.detalle || {}
        setConfirmDup({
          message: d.message || e.message,
          codigo: d.codigo_entrada,
          minutos: d.minutos,
          confirmed: false,
        })
        setBusy(false)
        setSavePhase('')
        return
      }
      // Tras falla de red, reutilizar la misma clave evita duplicar si el servidor sí guardó.
      setError(e.message || 'No se pudo guardar')
      setBusy(false)
      setSavePhase('')
    }
  }

  const confirmarDuplicadoYGuardar = () => {
    setConfirmDup((prev) => (prev ? { ...prev, confirmed: true } : { confirmed: true, message: '' }))
    void guardar({ confirmPosibleDuplicado: true })
  }

  if (!puedeCrear) return null

  const headerTitle = tipo === 'disposicion'
    ? 'Salió material'
    : tipo === 'recibo'
      ? 'Llegó material'
      : 'Registrar entrada'

  const puedeSeguirSinOc = Boolean(
    proveedorNombre.trim()
    && (insumoId || (materialManual && insumoLabel.trim())),
  )

  const overlayTop = chromeTop || 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="entrada-registro-tablet"
      className="cc-almacen-theme-scope"
      style={{
        ...themeCssVars,
        position: 'fixed',
        top: overlayTop,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100040,
        background: 'var(--cc-almacen-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        boxSizing: 'border-box',
        overscrollBehavior: 'contain',
        color: 'var(--cc-almacen-text)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      onPaste={onPasteSoporte}
    >
      <div
        data-testid="entrada-tablet-popup"
        style={{
          width: 'min(1100px, 96%)',
          maxHeight: 'min(92dvh, calc(100% - 8px))',
          margin: '0 auto',
          background: 'var(--cc-almacen-bg-card)',
          color: 'var(--cc-almacen-text)',
          borderRadius: 16,
          border: '1px solid var(--cc-almacen-border)',
          boxShadow: 'var(--cc-almacen-shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          alignSelf: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPasteSoporte}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `1px solid ${ui.borderColor}`,
          gap: 8,
          flexShrink: 0,
        }}
        >
          <button
            type="button"
            style={{ ...ui.btnSecondary, minWidth: 48, minHeight: 48, fontSize: '1.2rem' }}
            onClick={() => {
              if (paso === PASO.INICIO) onClose?.()
              else if (paso === PASO.OC || paso === PASO.SECTOR) {
                setTipo(null)
                setPaso(PASO.INICIO)
              } else if (paso === PASO.SIN_OC) setPaso(PASO.OC)
              else if (paso === PASO.ESCOMBRERA) setPaso(PASO.SECTOR)
              else if (paso === PASO.CAPTURA) {
                if (ocCard) setPaso(PASO.OC)
                else setPaso(PASO.SIN_OC)
              } else if (paso === PASO.CONFIRMAR) setPaso(PASO.CAPTURA)
              else if (paso === PASO.CANTIDAD) {
                if (tipo === 'disposicion') setPaso(PASO.ESCOMBRERA)
                else setPaso(PASO.OC)
              } else if (paso === PASO.PLACA) setPaso(PASO.CANTIDAD)
              else if (paso === PASO.FOTO) setPaso(PASO.PLACA)
              else setPaso(PASO.INICIO)
            }}
            aria-label="Atrás"
          >
            ←
          </button>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md, 1.1rem)', textAlign: 'center', flex: 1 }}>{headerTitle}</div>
          <button
            type="button"
            style={{ ...ui.btnSecondary, minWidth: 48, minHeight: 48 }}
            onClick={() => onClose?.()}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div
          data-testid="entrada-tablet-body"
          style={{
            flex: 1,
            overflow: paso === PASO.CAPTURA ? 'hidden' : 'auto',
            padding: paso === PASO.CAPTURA ? 10 : 16,
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            display: paso === PASO.CAPTURA ? 'flex' : undefined,
            flexDirection: paso === PASO.CAPTURA ? 'column' : undefined,
            minHeight: 0,
          }}
        >
          {error && (
            <div data-testid="entrada-tablet-error" style={{ color: 'var(--cc-almacen-danger-text)', marginBottom: 12, fontWeight: 600 }}>{error}</div>
          )}
          {okMsg && (
            <div style={{ color: '#15803d', marginBottom: 12, fontWeight: 800, fontSize: '1.2rem' }}>{okMsg}</div>
          )}

          {paso === PASO.INICIO && (
            <div
              data-testid="entrada-tablet-inicio-botones"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginTop: 12,
                alignItems: 'stretch',
              }}
            >
              <button
                type="button"
                data-testid="entrada-tablet-recibo"
                style={btnHome('#16a34a')}
                onClick={() => elegirTipo('recibo')}
              >
                <span style={{ fontSize: '2.2rem' }} aria-hidden>📦</span>
                Llegó material
              </button>
              <button
                type="button"
                data-testid="entrada-tablet-disposicion"
                style={{ ...btnHome('#ea580c'), position: 'relative' }}
                onClick={() => elegirTipo('salida')}
              >
                <span style={{ fontSize: '2.2rem' }} aria-hidden>🚚</span>
                Salió material
                {puedeValidar && salidasPorRevisar > 0 && (
                  <span
                    data-testid="salio-material-por-revisar-badge"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 10,
                      background: '#dc2626',
                      color: '#fff',
                      borderRadius: 12,
                      minWidth: 24,
                      height: 24,
                      padding: '0 6px',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {salidasPorRevisar}
                  </span>
                )}
              </button>
            </div>
          )}

          {paso === PASO.OC && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--cc-md, 1.05rem)' }}>¿Cuál orden?</div>
                <div data-testid="entrada-tablet-oc-count" style={{ color: ui.textMuted, fontWeight: 600, fontSize: 'var(--cc-sm, 0.9rem)' }}>
                  {loadingOc && !ocsLoaded
                    ? 'Cargando…'
                    : (ocSearch.trim()
                      ? `${ocDisplayCount} resultado${ocDisplayCount === 1 ? '' : 's'}`
                      : `${ocDisplayCount} OC`)}
                  {ocTimingMs?.client_ms != null && ocsLoaded ? ` · ${ocTimingMs.client_ms} ms` : ''}
                  {ocTimingMs?.server?.source ? ` · ${ocTimingMs.server.source}` : ''}
                </div>
              </div>
              <input
                data-testid="entrada-tablet-oc-search"
                style={{ ...inputGiant(ui), marginBottom: 14 }}
                placeholder="Buscar OC, proveedor, material, solicitud…"
                value={ocSearch}
                onChange={(e) => setOcSearch(e.target.value)}
                autoComplete="off"
              />
              {loadingOc && !ocsLoaded && (
                <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando órdenes…</div>
              )}
              <div
                data-testid="entrada-tablet-oc-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                  width: '100%',
                }}
              >
                {ocsFiltradas.map((c) => {
                  const insumos = Array.isArray(c.insumos) ? c.insumos : []
                  return (
                    <div
                      key={`${c.orden_compra_id}-${c.matchMode || 'all'}-${insumos.map((i) => i.key).join(',')}`}
                      data-testid="entrada-tablet-oc-card"
                      data-match-mode={c.matchMode || 'all'}
                      style={{
                        ...cardTouch(ui, false),
                        cursor: 'default',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>
                          📋 OC{' '}
                          <HighlightText
                            text={c.numero_oc != null ? `#${c.numero_oc}` : '—'}
                            query={ocSearch}
                          />
                        </span>
                        {(c.alerta_agotamiento === 'rojo' || c.alerta_agotamiento === 'amarillo') && (
                          <span
                            data-testid="entrada-tablet-oc-alerta"
                            title={c.alerta_agotamiento === 'rojo' ? 'OC por consumirse' : 'Se está acabando la OC'}
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: c.alerta_agotamiento === 'rojo' ? '#fee2e2' : '#fef3c7',
                              color: c.alerta_agotamiento === 'rojo' ? '#991b1b' : '#92400e',
                            }}
                          >
                            {c.alerta_agotamiento === 'rojo' ? '🔴 Por consumirse' : '🟡 Se acaba'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        🏭 <HighlightText text={c.proveedor_nombre || 'Proveedor'} query={ocSearch} />
                      </div>
                      <button
                        type="button"
                        data-testid="entrada-tablet-oc-completa"
                        style={{
                          ...ui.btnPrimary,
                          minHeight: 48,
                          width: '100%',
                          fontWeight: 800,
                          marginTop: 4,
                        }}
                        onClick={() => elegirOcCompleta(c)}
                      >
                        ✅ Toda la OC ({insumos.filter((i) => !esInsumoConsumido(i.saldo_cantidad) && !i.consumido).length}/{insumos.length} con saldo)
                      </button>
                      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                        {insumos.map((ins) => {
                          const consumidoIns = Boolean(ins.consumido) || esInsumoConsumido(ins.saldo_cantidad)
                          return (
                          <button
                            key={ins.key || `${ins.insumo_id}-${ins.material_descripcion}`}
                            type="button"
                            data-testid="entrada-tablet-oc-insumo"
                            disabled={consumidoIns}
                            style={{
                              ...ui.btnSecondary,
                              textAlign: 'left',
                              minHeight: 52,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              opacity: consumidoIns ? 0.55 : 1,
                              cursor: consumidoIns ? 'not-allowed' : 'pointer',
                              gap: 2,
                              width: '100%',
                            }}
                            onClick={() => elegirInsumoDeOc(c, ins)}
                          >
                            <span style={{ fontWeight: 700 }}>
                              🧱 <HighlightText text={ins.material_descripcion || 'Material'} query={ocSearch} />
                            </span>
                            <span style={{ color: consumidoIns ? ui.textMuted : ui.accent, fontWeight: 800 }}>
                              {consumidoIns
                                ? 'Consumido'
                                : `Falta ${fmtCant(ins.saldo_cantidad)} ${ins.unidad || ''}`}
                            </span>
                          </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {mostrarSinOc && (
                  <button
                    type="button"
                    data-testid="entrada-tablet-sin-oc"
                    style={{
                      ...cardTouch(ui, false),
                      textAlign: 'left',
                      width: '100%',
                      borderStyle: 'dashed',
                    }}
                    onClick={elegirSinOc}
                  >
                    <div style={{ fontWeight: 800 }}>📋 Sin orden de compra</div>
                    <div style={{ color: ui.textMuted, fontSize: '0.95rem' }}>Quedará por revisar</div>
                  </button>
                )}
              </div>
            </div>
          )}

          {paso === PASO.SIN_OC && (
            <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
              <div style={{ fontWeight: 800 }}>Proveedor</div>
              <input
                style={inputGiant(ui)}
                placeholder="Buscar proveedor"
                value={proveedorManual ? proveedorNombre : provQuery}
                onChange={(e) => {
                  const v = e.target.value
                  setProveedorManual(false)
                  setProveedorId(null)
                  setProvQuery(v)
                  setProveedorNombre(v)
                }}
                data-testid="entrada-tablet-prov-search"
              />
              {provOpts.slice(0, 6).map((p) => (
                <button
                  key={p.proveedor_id || p.id}
                  type="button"
                  style={cardTouch(ui, Number(proveedorId) === Number(p.proveedor_id || p.id))}
                  onClick={() => {
                    setProveedorId(p.proveedor_id || p.id)
                    setProveedorNombre(p.razon_social || p.nombre || '')
                    setProveedorManual(false)
                    setProvQuery(p.razon_social || p.nombre || '')
                  }}
                >
                  {p.razon_social || p.nombre}
                </button>
              ))}
              {proveedorNombre.trim() && !proveedorId && (
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, minHeight: 48 }}
                  onClick={() => setProveedorManual(true)}
                >
                  Usar «{proveedorNombre.trim()}» (por revisar)
                </button>
              )}

              <div style={{ fontWeight: 800, marginTop: 8 }}>Material</div>
              <input
                style={inputGiant(ui)}
                placeholder="Buscar material solicitado"
                value={insumoQuery}
                onChange={(e) => {
                  setMaterialManual(false)
                  setInsumoId(null)
                  setInsumoQuery(e.target.value)
                  setInsumoLabel(e.target.value)
                }}
                data-testid="entrada-tablet-mat-search"
              />
              {!materialManual && insumoOpts.slice(0, 6).map((row) => {
                const id = row.insumo_id || row.id
                const label = row.label || row.descripcion || row.material_descripcion || row.codigo || String(id || '')
                return (
                  <button
                    key={id || label}
                    type="button"
                    style={cardTouch(ui, Number(insumoId) === Number(id))}
                    onClick={() => {
                      setInsumoId(id || null)
                      setInsumoLabel(label)
                      setInsumoUnidad(row.unidad || 'm³')
                      setInsumoQuery(label)
                      setMaterialManual(false)
                    }}
                  >
                    {label}
                  </button>
                )
              })}
              {insumoQuery.trim() && !insumoId && (
                <button
                  type="button"
                  data-testid="entrada-tablet-mat-manual"
                  style={{ ...ui.btnSecondary, minHeight: 48 }}
                  onClick={() => {
                    setMaterialManual(true)
                    setInsumoId(null)
                    setInsumoLabel(insumoQuery.trim())
                    setInsumoOpts([])
                  }}
                >
                  Usar «{insumoQuery.trim()}» (por revisar)
                </button>
              )}

              <button
                type="button"
                style={{ ...ui.btnPrimary, minHeight: 56, fontSize: '1.1rem', marginTop: 8 }}
                disabled={!puedeSeguirSinOc}
                onClick={() => setPaso(PASO.CAPTURA)}
              >
                Siguiente
              </button>
            </div>
          )}

          {paso === PASO.CAPTURA && (
            <div
              data-testid="entrada-tablet-captura"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: '100%',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {esRetro && (
                <div
                  data-testid="entrada-tablet-fecha-hecho"
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 10,
                    borderRadius: 10,
                    background: '#fff7ed',
                    border: '1px solid #fdba74',
                    flexShrink: 0,
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 800, color: '#9a3412' }}>
                    Fecha del hecho (llegada)
                    <input
                      type="date"
                      value={fechaHecho}
                      max={todayDateInputColombia()}
                      onChange={(e) => setFechaHechoPersist(e.target.value)}
                      style={{ ...ui.input, fontSize: '1.1rem', minHeight: 44 }}
                      required
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#9a3412' }}>
                    <input
                      type="checkbox"
                      checked={fechaAprox}
                      onChange={(e) => setFechaAprox(e.target.checked)}
                    />
                    Fecha aproximada
                  </label>
                </div>
              )}
              {modoMultiOc ? (
                <div data-testid="entrada-tablet-oc-lineas" style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, flex: '1 1 auto', maxHeight: 'min(34vh, 260px)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                    <span>
                      ¿Qué llegó?
                      {ocCard?.numero_oc != null ? ` · OC #${ocCard.numero_oc}` : ''}
                    </span>
                    <span data-testid="entrada-tablet-oc-marcadas" style={{ fontWeight: 700, color: ui.textMuted }}>
                      {lineasResumen.length}/{ocSeleccion.length}
                    </span>
                  </div>
                  {tablaVista.hayOcultas && (
                    <div
                      data-testid="entrada-tablet-oc-vista-alerta"
                      style={{
                        ...estiloAvisoAlmacen(contraste, 'warn'),
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        flexShrink: 0,
                        padding: '6px 8px',
                      }}
                    >
                      {textoAlertaVistaTablaOc(tablaVista)}
                    </div>
                  )}
                  <div
                    ref={ocTableScrollRef}
                    className="cc-almacen-table-scroll"
                    data-testid="entrada-tablet-oc-scroll"
                    style={{
                      flex: 1,
                      minHeight: 72,
                      overflowY: 'scroll',
                      overflowX: 'auto',
                      border: `1px solid ${ui.borderColor}`,
                      borderRadius: 8,
                      WebkitOverflowScrolling: 'touch',
                      scrollbarWidth: 'thin',
                    }}
                  >
                    <table
                      data-testid="entrada-tablet-oc-excel"
                      style={{
                        width: '100%',
                        borderCollapse: 'separate',
                        borderSpacing: 0,
                        fontSize: 'var(--cc-sm, 0.9rem)',
                        background: 'var(--cc-almacen-bg-card)',
                        color: 'var(--cc-almacen-text)',
                      }}
                    >
                      <thead>
                        <tr style={{ background: 'var(--cc-almacen-sheet-head)', color: 'var(--cc-almacen-sheet-head-text)' }}>
                          {['✓', 'Código', 'Descripción', 'Und', 'Saldo', 'Cantidad'].map((h) => (
                            <th
                              key={h}
                              style={{
                                borderBottom: '1px solid var(--cc-almacen-border)',
                                borderRight: '1px solid var(--cc-almacen-border)',
                                padding: '6px 6px',
                                textAlign: h === 'Cantidad' || h === 'Saldo' ? 'right' : 'left',
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                position: 'sticky',
                                top: 0,
                                zIndex: 2,
                                background: 'var(--cc-almacen-sheet-head)',
                                color: 'var(--cc-almacen-sheet-head-text)',
                                fontSize: '0.8rem',
                                boxShadow: '0 1px 0 var(--cc-almacen-border)',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ocSeleccion.map((row, idx) => {
                          const ins = row.insumo || {}
                          const { codigo, descripcion } = splitInsumoCodigoDesc(ins.material_descripcion)
                          const cantN = Number(String(row.cantidad || '').replace(',', '.'))
                          const saldoMax = Number(ins.saldo_cantidad) || 0
                          const pedida = Number(ins.cantidad_pedida) || 0
                          const consumido = Boolean(row.consumido) || esInsumoConsumido(saldoMax)
                          const supera = !consumido && row.marked && Number.isFinite(cantN) && cantN > saldoMax + 0.0001
                          const resultante = row.marked && cantN > 0
                            ? saldoResultante(saldoMax, cantN)
                            : saldoMax
                          const nivel = alertaAgotamientoOc(resultante, pedida, {
                            amarilloPct: umbralAmarillo,
                            rojoPct: umbralRojo,
                          })
                          const alertaTxt = mensajeAlertaAgotamiento(nivel, resultante, pedida, ins.unidad || '')
                          return (
                            <tr
                              key={row.key}
                              ref={(el) => { ocRowRefs.current[row.key] = el }}
                              data-row-key={row.key}
                              data-testid="entrada-tablet-oc-linea"
                              data-consumido={consumido || undefined}
                              style={{
                                background: consumido
                                  ? 'var(--cc-almacen-input-bg)'
                                  : row.marked
                                    ? (supera ? 'var(--cc-almacen-row-error)' : 'var(--cc-almacen-row-marked)')
                                    : 'transparent',
                                color: consumido ? 'var(--cc-almacen-text-muted)' : 'var(--cc-almacen-text)',
                                opacity: consumido ? 0.72 : 1,
                              }}
                            >
                              <td style={{ borderBottom: '1px solid var(--cc-almacen-border)', borderRight: '1px solid var(--cc-almacen-border)', padding: 2, textAlign: 'center' }}>
                                <button
                                  type="button"
                                  aria-pressed={row.marked}
                                  data-testid="entrada-tablet-oc-check"
                                  disabled={consumido}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 6,
                                    border: `2px solid ${row.marked ? 'var(--cc-almacen-accent)' : 'var(--cc-almacen-border)'}`,
                                    background: row.marked ? 'var(--cc-almacen-accent)' : 'transparent',
                                    color: row.marked ? '#fff' : 'var(--cc-almacen-text)',
                                    fontWeight: 900,
                                    cursor: consumido ? 'not-allowed' : 'pointer',
                                  }}
                                  onClick={() => { if (!consumido) toggleOcLinea(row.key) }}
                                >
                                  {row.marked ? '✓' : ''}
                                </button>
                              </td>
                              <td style={{ borderBottom: '1px solid var(--cc-almacen-border)', borderRight: '1px solid var(--cc-almacen-border)', padding: '4px 4px', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                                {codigo || '—'}
                              </td>
                              <td style={{ borderBottom: '1px solid var(--cc-almacen-border)', borderRight: '1px solid var(--cc-almacen-border)', padding: '4px 4px', maxWidth: 200, fontSize: '0.8rem' }}>
                                {descripcion}
                                {consumido && (
                                  <div data-testid="entrada-tablet-oc-consumido" style={{ fontWeight: 800, fontSize: '0.68rem', color: 'var(--cc-almacen-warn-text, #b45309)' }}>
                                    Consumido
                                  </div>
                                )}
                              </td>
                              <td style={{ borderBottom: '1px solid var(--cc-almacen-border)', borderRight: '1px solid var(--cc-almacen-border)', padding: '4px 4px', fontSize: '0.8rem' }}>
                                {ins.unidad || ''}
                              </td>
                              <td style={{
                                borderBottom: '1px solid var(--cc-almacen-border)',
                                borderRight: '1px solid var(--cc-almacen-border)',
                                padding: '4px 4px',
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                lineHeight: 1.25,
                                minWidth: 110,
                              }}
                              >
                                <div>{textoSaldoProgreso(saldoMax, pedida, ins.unidad || '')}</div>
                                {pedida > 0 && (
                                  <div
                                    aria-hidden
                                    style={{
                                      marginTop: 3,
                                      height: 4,
                                      borderRadius: 999,
                                      background: 'var(--cc-almacen-border)',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div style={{
                                      width: `${Math.max(0, Math.min(100, (saldoMax / pedida) * 100))}%`,
                                      height: '100%',
                                      background: nivel === 'rojo' ? '#dc2626' : nivel === 'amarillo' ? '#f59e0b' : 'var(--cc-almacen-accent)',
                                    }}
                                    />
                                  </div>
                                )}
                                {row.marked && cantN > 0 && !consumido && (
                                  <div data-testid="entrada-tablet-saldo-resultante" style={{ fontWeight: 700, marginTop: 2 }}>
                                    quedarían {fmtCant(resultante)}{ins.unidad ? ` ${ins.unidad}` : ''}
                                  </div>
                                )}
                                {alertaTxt && row.marked && !consumido && (
                                  <div
                                    data-testid={`entrada-tablet-alerta-${nivel}`}
                                    style={{
                                      marginTop: 2,
                                      fontWeight: 800,
                                      color: nivel === 'rojo' ? '#b91c1c' : '#b45309',
                                    }}
                                  >
                                    {nivel === 'rojo' ? '🔴' : '🟡'} {alertaTxt}
                                  </div>
                                )}
                              </td>
                              <td style={{ borderBottom: '1px solid var(--cc-almacen-border)', padding: 2 }}>
                                <input
                                  ref={(el) => { qtyInputRefs.current[row.key] = el }}
                                  inputMode="decimal"
                                  data-testid="entrada-tablet-cantidad"
                                  className={`cc-almacen-qty-cell${supera ? ' cc-almacen-qty-cell--error' : ''}`}
                                  aria-invalid={supera || undefined}
                                  disabled={consumido}
                                  style={{
                                    ...ui.input,
                                    width: '100%',
                                    minWidth: 64,
                                    boxSizing: 'border-box',
                                    fontSize: '1.05rem',
                                    textAlign: 'right',
                                    minHeight: 36,
                                    fontVariantNumeric: 'tabular-nums',
                                    background: consumido
                                      ? 'var(--cc-almacen-input-bg)'
                                      : supera ? 'var(--cc-almacen-qty-error-bg)' : 'var(--cc-almacen-input-bg)',
                                    color: supera ? 'var(--cc-almacen-qty-error-text)' : 'var(--cc-almacen-text)',
                                    borderColor: supera ? 'var(--cc-almacen-qty-error-border)' : 'var(--cc-almacen-border)',
                                    opacity: consumido ? 0.6 : 1,
                                  }}
                                  value={consumido ? '' : row.cantidad}
                                  onChange={(e) => setOcLineaCantidad(row.key, e.target.value)}
                                  onFocus={(e) => {
                                    e.target.select?.()
                                    try {
                                      ocRowRefs.current[row.key]?.scrollIntoView?.({ block: 'nearest' })
                                    } catch { /* ignore */ }
                                    requestAnimationFrame(() => refreshTablaVista())
                                  }}
                                  onKeyDown={(e) => onQtyKeyDown(e, idx)}
                                  placeholder={consumido ? '—' : '0'}
                                  title={consumido ? 'Consumido' : (supera ? `Máximo ${fmtCant(saldoMax)}` : undefined)}
                                />
                                {supera && (
                                  <div
                                    data-testid="entrada-tablet-qty-error"
                                    style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      color: 'var(--cc-almacen-qty-error-text)',
                                      textAlign: 'right',
                                    }}
                                  >
                                    Máx. {fmtCant(saldoMax)}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div
                    data-testid="entrada-tablet-oc-total"
                    style={{ display: 'none' }}
                    aria-hidden
                  >
                    Marcadas: {lineasResumen.length} de {ocSeleccion.length}
                  </div>
                </div>
              ) : (
                <div
                  data-testid="entrada-tablet-captura-fila"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 160px) 1fr',
                    gap: 8,
                    alignItems: 'end',
                    width: '100%',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>Cantidad ({insumoUnidad || 'm³'})</div>
                    <input
                      inputMode="decimal"
                      style={{ ...inputGiant(ui), fontSize: '1.35rem', textAlign: 'center', minHeight: 42 }}
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                      onKeyDown={onCantidadSimpleKeyDown}
                      placeholder="0"
                      data-testid="entrada-tablet-cantidad"
                    />
                  </div>
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>Material</div>
                    <div style={{ ...inputGiant(ui), display: 'flex', alignItems: 'center', fontWeight: 700, minHeight: 42, fontSize: '0.95rem' }}>
                      {insumoLabel || '—'}
                    </div>
                  </div>
                </div>
              )}

              <div
                data-testid="entrada-tablet-captura-fila"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'end',
                  width: '100%',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  data-testid="entrada-tablet-domicilio"
                  aria-pressed={llegadaDomicilio}
                  style={{
                    ...ui.btnSecondary,
                    minHeight: 36,
                    fontWeight: 800,
                    justifyContent: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    fontSize: '0.78rem',
                    flex: '0 0 auto',
                    background: llegadaDomicilio ? 'var(--cc-almacen-accent-soft)' : undefined,
                    borderColor: llegadaDomicilio ? 'var(--cc-almacen-accent)' : undefined,
                  }}
                  onClick={() => {
                    setLlegadaDomicilio((v) => {
                      const next = !v
                      if (next) {
                        setPlaca('')
                        setConductor('')
                        setPlacaOpts([])
                        setVehiculoNuevo(false)
                      }
                      return next
                    })
                  }}
                >
                  <span aria-hidden>🏠</span>
                  {llegadaDomicilio ? 'Domicilio ✓' : 'Domicilio'}
                </button>
                {!llegadaDomicilio && (
                  <>
                    <div style={{ display: 'grid', gap: 1, minWidth: 88, flex: '1 1 88px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.68rem', color: ui.textMuted }}>Placa</div>
                      <input
                        style={{ ...inputGiant(ui), textTransform: 'uppercase', letterSpacing: 1, minHeight: 36, fontSize: '0.95rem', padding: '4px 6px' }}
                        value={placa}
                        onChange={(e) => { void onPlacaChange(e.target.value) }}
                        placeholder="AAA-000"
                        data-testid="entrada-tablet-placa"
                        autoCapitalize="characters"
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 1, minWidth: 100, flex: '1 1 110px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.68rem', color: ui.textMuted }}>Conductor</div>
                      <input
                        style={{ ...inputGiant(ui), minHeight: 36, fontSize: '0.95rem', padding: '4px 6px' }}
                        value={conductor}
                        onChange={(e) => {
                          setConductor(e.target.value)
                          if (placaValida(placa)) setVehiculoNuevo(true)
                        }}
                        placeholder="Nombre"
                        data-testid="entrada-tablet-conductor"
                      />
                    </div>
                  </>
                )}
                <div style={{ display: 'grid', gap: 1, minWidth: 100, flex: '1 1 120px' }} data-testid="entrada-tablet-mapa">
                  <div style={{ fontWeight: 700, fontSize: '0.68rem', color: ui.textMuted }}>Sector</div>
                  <AlmacenPkMapaSelector
                    t={theme || ui}
                    token={token}
                    contratoId={contrato}
                    pkIdSeleccionado=""
                    pkLabel={pkLabel || pkId}
                    onSeleccionar={(sel) => {
                      setPkId(sel.pk_id || sel.pk_label || '')
                      setPkLabel(sel.pk_label || sel.pk_id || '')
                      setTramo(sel.tramo || '')
                    }}
                    onLimpiar={() => {
                      setPkId('')
                      setPkLabel('')
                      setTramo('')
                    }}
                    compact
                    initialBasemap="satelite"
                    showBasemapToggle
                  />
                </div>
              </div>

              {superaSaldo && (
                <div
                  data-testid="entrada-tablet-supera-saldo"
                  style={{ ...estiloAvisoAlmacen(contraste, 'danger'), fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}
                >
                  Cantidad mayor al saldo de la OC.
                </div>
              )}
              {!llegadaDomicilio && vehiculoNuevo && placaValida(placa) && (
                <div style={{ ...estiloAvisoAlmacen(contraste, 'warn'), fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>Vehículo nuevo · por revisar</div>
              )}
              {!llegadaDomicilio && placa.trim() && !placaValida(placa) && (
                <div style={{ color: 'var(--cc-almacen-danger-text)', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>Placa incompleta (AAA-000)</div>
              )}
              {!llegadaDomicilio && placaOpts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
                  {placaOpts.slice(0, 4).map((r) => (
                    <button
                      key={r.placa}
                      type="button"
                      style={{ ...ui.btnSecondary, minHeight: 34, fontSize: '0.8rem' }}
                      onClick={() => {
                        setPlaca(formatPlacaInput(r.placa))
                        setConductor(formatNombrePropio(r.nombre))
                        setVehiculoNuevo(false)
                      }}
                    >
                      🚛 {formatPlacaInput(r.placa)}
                    </button>
                  ))}
                </div>
              )}

              {pasteHint && (
                <div
                  data-testid="entrada-tablet-paste-hint"
                  style={{ ...estiloAvisoAlmacen(contraste, 'info'), fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}
                >
                  {pasteHint}
                </div>
              )}
              {remisionDupHint && (
                <div
                  data-testid="entrada-tablet-numero-remision-dup"
                  style={{ ...estiloAvisoAlmacen(contraste, 'danger'), fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}
                >
                  {remisionDupHint}
                </div>
              )}

              <div
                data-testid="entrada-tablet-soportes-fila"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 8,
                  flexShrink: 0,
                  alignItems: 'start',
                }}
              >
                <EntradaSoportePicker
                  kind="remision"
                  file={fotoRemision}
                  previewUrl={fotoRemisionPreview}
                  busy={busy}
                  selected={soporteFocus === 'remision'}
                  onSelect={setSoporteFocus}
                  onPickFile={(e) => { void takeSoporte('remision', e) }}
                  onPasteFile={(f, msg) => { onPasteEnSoporte('remision', f, msg) }}
                  onOpenGaleriaPlataforma={() => setGaleriaKind('remision')}
                  onOpenPreview={() => setPreviewSoporte('remision')}
                  labelReady="Remisión ✓"
                  labelEmpty="Falta"
                >
                  <div data-testid="entrada-tablet-numero-remision-wrap" style={{ display: 'grid', gap: 2 }}>
                    <label
                      htmlFor="entrada-tablet-numero-remision"
                      style={{ fontWeight: 700, fontSize: '0.65rem', color: 'var(--cc-almacen-text)' }}
                    >
                      🔢 N.º remisión *
                    </label>
                    <input
                      id="entrada-tablet-numero-remision"
                      ref={numeroRemisionRef}
                      data-testid="entrada-tablet-numero-remision"
                      autoComplete="off"
                      autoCapitalize="characters"
                      inputMode="text"
                      placeholder="REM-123"
                      aria-required="true"
                      aria-invalid={!numeroRemisionListo || undefined}
                      value={numeroRemision}
                      onChange={(e) => onNumeroRemisionChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        setSoporteFocus('remision')
                        try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* ignore */ }
                      }}
                      onKeyDown={onNumeroRemisionKeyDown}
                      style={{
                        ...inputGiant(ui),
                        fontSize: '0.9rem',
                        minHeight: 34,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        fontWeight: 800,
                        padding: '3px 6px',
                        border: `2px solid ${numeroRemisionListo ? 'var(--cc-almacen-accent)' : 'var(--cc-almacen-warn-border, #d97706)'}`,
                        background: 'var(--cc-almacen-bg-card)',
                        color: 'var(--cc-almacen-text)',
                      }}
                    />
                    {!numeroRemisionListo && (
                      <div
                        data-testid="entrada-tablet-numero-remision-falta"
                        style={{ color: 'var(--cc-almacen-warn-text, #b45309)', fontWeight: 700, fontSize: '0.62rem' }}
                      >
                        Falta N.º
                      </div>
                    )}
                  </div>
                </EntradaSoportePicker>
                <EntradaSoportePicker
                  kind="material"
                  file={fotoMaterial}
                  previewUrl={fotoMaterialPreview}
                  busy={busy}
                  selected={soporteFocus === 'material'}
                  onSelect={setSoporteFocus}
                  onPickFile={(e) => { void takeSoporte('material', e) }}
                  onPasteFile={(f, msg) => { onPasteEnSoporte('material', f, msg) }}
                  onOpenGaleriaPlataforma={() => setGaleriaKind('material')}
                  onOpenPreview={() => setPreviewSoporte('material')}
                  labelReady="Descargue ✓"
                  labelEmpty="Falta"
                />
              </div>

              {preguntaSalidaVisible && (
                <div
                  data-testid="entrada-tablet-usa-de-una-vez"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                    padding: '6px 8px',
                    borderRadius: 10,
                    border: '1px solid var(--cc-almacen-border)',
                    background: 'var(--cc-almacen-bg-card)',
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--cc-almacen-text)' }}>
                    <span aria-hidden>⚡</span>
                    {' '}¿Se usa de una vez en obra? (genera la salida)
                  </span>
                  <button
                    type="button"
                    data-testid="entrada-tablet-usa-de-una-vez-si"
                    style={{
                      ...ui.btnSecondary,
                      minHeight: 36,
                      fontWeight: 800,
                      background: usaDeUnaVez === true ? 'var(--cc-almacen-accent-soft, #dbeafe)' : undefined,
                      borderColor: usaDeUnaVez === true ? 'var(--cc-almacen-accent)' : undefined,
                    }}
                    disabled={busy}
                    onClick={() => setUsaDeUnaVez(true)}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    data-testid="entrada-tablet-usa-de-una-vez-no"
                    style={{
                      ...ui.btnSecondary,
                      minHeight: 36,
                      fontWeight: 800,
                      background: usaDeUnaVez === false ? 'var(--cc-almacen-accent-soft, #dbeafe)' : undefined,
                      borderColor: usaDeUnaVez === false ? 'var(--cc-almacen-accent)' : undefined,
                    }}
                    disabled={busy}
                    onClick={() => setUsaDeUnaVez(false)}
                  >
                    No
                  </button>
                </div>
              )}

              <button
                ref={continuarCapturaRef}
                type="button"
                data-testid="entrada-tablet-captura-siguiente"
                style={{ ...ui.btnPrimary, minHeight: 44, fontSize: '1rem', flexShrink: 0 }}
                disabled={!capturaLista || busy || (preguntaSalidaVisible && usaDeUnaVez == null)}
                onClick={() => setPaso(PASO.CONFIRMAR)}
              >
                Revisar y confirmar
              </button>
            </div>
          )}

          <EntradaSoporteGaleriaModal
            open={Boolean(galeriaKind)}
            kind={galeriaKind || 'remision'}
            contraste={contraste}
            onClose={() => setGaleriaKind(null)}
            onPickUsed={(codigo) => {
              setGaleriaKind(null)
              setError(
                `Esa imagen ya se usó en la entrada ${codigo}. `
                + 'Cargue otra con Cámara, Archivo o Pegar.',
              )
            }}
          />

          {previewSoporte && (
            <div
              role="dialog"
              aria-modal="true"
              data-testid="entrada-soporte-preview-modal"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100070,
                background: 'var(--cc-almacen-overlay)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setPreviewSoporte(null) }}
            >
              <div
                style={{
                  width: 'min(720px, 96%)',
                  maxHeight: 'min(85dvh, 640px)',
                  background: 'var(--cc-almacen-bg-card)',
                  color: 'var(--cc-almacen-text)',
                  borderRadius: 14,
                  border: '1px solid var(--cc-almacen-border)',
                  boxShadow: 'var(--cc-almacen-shadow-modal)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--cc-almacen-border)',
                  gap: 8,
                }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {previewSoporte === 'remision' ? '📄 Remisión' : '📷 Descargue'}
                  </div>
                  <button
                    type="button"
                    data-testid="entrada-soporte-preview-cerrar"
                    style={{ ...ui.btnSecondary, minHeight: 40 }}
                    onClick={() => setPreviewSoporte(null)}
                  >
                    Cerrar
                  </button>
                </div>
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--cc-almacen-input-bg)',
                }}
                >
                  {previewSoporte === 'remision' && (
                    (fotoRemision?.type || '').includes('pdf') || /\.pdf$/i.test(fotoRemision?.name || '')
                      ? (
                        <div style={{ textAlign: 'center', fontWeight: 800 }}>
                          <div style={{ fontSize: '3rem' }} aria-hidden>📎</div>
                          <div>{fotoRemision?.name || 'remision.pdf'}</div>
                        </div>
                      )
                      : (fotoRemisionPreview ? (
                        <img
                          src={fotoRemisionPreview}
                          alt="Remisión"
                          style={{ maxWidth: '100%', maxHeight: 'min(60dvh, 480px)', objectFit: 'contain', borderRadius: 8 }}
                        />
                      ) : null)
                  )}
                  {previewSoporte === 'material' && fotoMaterialPreview && (
                    <img
                      src={fotoMaterialPreview}
                      alt="Descargue"
                      style={{ maxWidth: '100%', maxHeight: 'min(60dvh, 480px)', objectFit: 'contain', borderRadius: 8 }}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, borderTop: '1px solid var(--cc-almacen-border)' }}>
                  <button
                    type="button"
                    data-testid="entrada-soporte-preview-reemplazar"
                    style={{ ...ui.btnPrimary, minHeight: 44, flex: 1 }}
                    onClick={() => {
                      const kind = previewSoporte
                      setPreviewSoporte(null)
                      setSoporteFocus(kind)
                      // Dispara Archivo del picker correspondiente.
                      const input = document.querySelector(`[data-testid="entrada-soporte-${kind}-file-input"]`)
                      input?.click?.()
                    }}
                  >
                    Reemplazar
                  </button>
                  <button
                    type="button"
                    data-testid="entrada-soporte-preview-quitar"
                    style={{ ...ui.btnSecondary, minHeight: 44, flex: 1 }}
                    onClick={() => {
                      const kind = previewSoporte
                      setPreviewSoporte(null)
                      if (kind === 'remision') {
                        revokeUrl(fotoRemisionPreview)
                        setFotoRemision(null)
                        setFotoRemisionPreview('')
                        setFotoRemisionHash('')
                      } else {
                        revokeUrl(fotoMaterialPreview)
                        setFotoMaterial(null)
                        setFotoMaterialPreview('')
                        setFotoMaterialHash('')
                      }
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          )}

          {paso === PASO.CONFIRMAR && tipo === 'recibo' && (
            <div data-testid="entrada-tablet-resumen" style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 900, margin: '0 auto' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>Confirmar</div>
              <div style={cardTouch(ui, false)}>
                {esRetro && (
                  <div style={{ fontWeight: 800, color: '#9a3412' }}>
                    ⏱ Retroactivo · hecho {fechaHecho}{fechaAprox ? ' (aprox.)' : ''}
                  </div>
                )}
                <div>🏭 {proveedorNombre || '—'}</div>
                <div>📋 {ocCard?.numero_oc != null ? `OC #${ocCard.numero_oc}` : 'Sin OC'}</div>
                <div data-testid="entrada-tablet-resumen-numero-remision" style={{ fontWeight: 800 }}>
                  🔢 N.º remisión: {normalizeRemisionNumero(numeroRemision) || '—'}
                </div>
                <div>📍 {(pkLabel || pkId) ? `${pkLabel || pkId}${tramo ? ` · ${tramo}` : ''}` : 'Sin sector'}</div>
                {modoMultiOc ? (
                  <div data-testid="entrada-tablet-resumen-insumos" style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                    {lineasResumenVista.map((ln) => {
                      const row = ocSeleccion.find((r) => r.key === ln.key)
                      const pedida = Number(row?.insumo?.cantidad_pedida) || 0
                      const resultante = saldoResultante(ln.saldo, ln.cantidad)
                      const nivel = alertaAgotamientoOc(resultante, pedida, {
                        amarilloPct: umbralAmarillo,
                        rojoPct: umbralRojo,
                      })
                      const alertaTxt = mensajeAlertaAgotamiento(nivel, resultante, pedida, ln.unidad)
                      return (
                        <div key={ln.key} style={{ fontWeight: 700 }}>
                          🧱 {ln.material_descripcion}: {fmtCant(ln.cantidad)} {ln.unidad}
                          {ln.supera ? ' ⚠' : ''}
                          {alertaTxt ? (
                            <div
                              data-testid={`entrada-tablet-resumen-alerta-${nivel}`}
                              style={{
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                color: nivel === 'rojo' ? '#b91c1c' : '#b45309',
                              }}
                            >
                              {nivel === 'rojo' ? '🔴' : '🟡'} {alertaTxt}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ fontWeight: 800 }}>
                    🧱 {insumoLabel || 'Material'} · {fmtCant(cantNum)} {insumoUnidad}
                  </div>
                )}
                <div>
                  {llegadaDomicilio
                    ? '🏠 Domicilio'
                    : `🚛 ${placa || '—'} · ${conductor || '—'}`}
                </div>
                {preguntaSalidaVisible && (
                  <div
                    data-testid="entrada-tablet-resumen-salida-inmediata"
                    style={{ marginTop: 6, fontWeight: 800, color: usaDeUnaVez ? '#15803d' : ui.textMuted }}
                  >
                    {usaDeUnaVez
                      ? '⚡ También se generará la salida (confirmar después del recibo)'
                      : 'Sin salida inmediata'}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  {fotoRemision && (
                    <div data-testid="entrada-tablet-resumen-remision">
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>Remisión</div>
                      {(fotoRemision.type || '').includes('pdf') || /\.pdf$/i.test(fotoRemision.name || '') ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
                          border: `1px solid ${ui.borderColor}`, borderRadius: 10, padding: 10,
                        }}
                        >
                          <span style={{ fontSize: '1.6rem' }} aria-hidden>📎</span>
                          <span style={{ wordBreak: 'break-word' }}>{fotoRemision.name || 'remision.pdf'}</span>
                        </div>
                      ) : fotoRemisionPreview ? (
                        <img src={fotoRemisionPreview} alt="Remisión" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10 }} />
                      ) : null}
                    </div>
                  )}
                  {fotoMaterial && (
                    <div data-testid="entrada-tablet-resumen-descargue">
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>Foto del descargue</div>
                      {fotoMaterialPreview ? (
                        <img src={fotoMaterialPreview} alt="Descargue" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10 }} />
                      ) : null}
                    </div>
                  )}
                </div>
                {motivosPrev.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span title={motivosPrev.join(' · ')} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: contraste.warnBg,
                      color: contraste.warnText,
                      border: `1px solid ${contraste.warnBorder}`,
                      fontWeight: 900,
                    }}
                    >
                      !
                    </span>
                    <span style={{ fontSize: '0.9rem', color: ui.textMuted }}>{motivosPrev.join(' · ')}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                data-testid="entrada-tablet-guardar"
                style={btnHome('#16a34a')}
                disabled={
                  busy
                  || !fotosCompletas
                  || !numeroRemisionListo
                  || remisionBloqueada
                  || superaSaldo
                  || (preguntaSalidaVisible && usaDeUnaVez == null)
                }
                onClick={() => { void guardar() }}
              >
                {busy ? (savePhase || 'Guardando…') : (usaDeUnaVez ? 'Guardar y abrir salida' : 'Guardar')}
              </button>
              {confirmDup && !confirmDup.confirmed && (
                <div
                  data-testid="entrada-tablet-confirm-dup"
                  style={{ ...estiloAvisoAlmacen(contraste, 'warn'), display: 'grid', gap: 10, fontWeight: 700 }}
                >
                  <div>{confirmDup.message || 'Ya hay una entrada igual reciente. ¿Es otra llegada?'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      data-testid="entrada-tablet-confirm-dup-si"
                      style={{ ...ui.btnPrimary, minHeight: 44 }}
                      disabled={busy}
                      onClick={() => confirmarDuplicadoYGuardar()}
                    >
                      Sí, es otra llegada
                    </button>
                    <button
                      type="button"
                      data-testid="entrada-tablet-confirm-dup-no"
                      style={{ ...ui.btnSecondary, minHeight: 44 }}
                      disabled={busy}
                      onClick={() => setConfirmDup(null)}
                    >
                      No, cancelar
                    </button>
                  </div>
                </div>
              )}
              {pdfHint && (
                <div data-testid="entrada-tablet-pdf-hint" style={{ ...estiloAvisoAlmacen(contraste, 'info'), fontWeight: 700 }}>
                  {pdfHint}
                </div>
              )}
              <button
                type="button"
                data-testid="entrada-tablet-corregir"
                style={{ ...ui.btnSecondary, minHeight: 56 }}
                disabled={busy}
                onClick={() => setPaso(PASO.CAPTURA)}
              >
                Corregir
              </button>
            </div>
          )}

          {/* Disposición («Salió material»): pasos previos */}
          {paso === PASO.SECTOR && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Sector</div>
              <input
                style={inputGiant(ui)}
                placeholder="PK-ID"
                value={pkId}
                onChange={(e) => setPkId(e.target.value)}
                data-testid="entrada-tablet-pk"
              />
              <button
                type="button"
                style={{ ...ui.btnPrimary, minHeight: 56 }}
                disabled={!String(pkId || '').trim()}
                onClick={() => {
                  setPkId(String(pkId).trim())
                  setPaso(PASO.ESCOMBRERA)
                }}
              >
                Siguiente
              </button>
            </div>
          )}

          {paso === PASO.ESCOMBRERA && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <div style={{ fontWeight: 800 }}>Escombrera</div>
              <input
                style={inputGiant(ui)}
                placeholder="Buscar o escribir"
                value={proveedorManual ? proveedorNombre : provQuery}
                onChange={(e) => {
                  const v = e.target.value
                  setProveedorManual(false)
                  setProveedorId(null)
                  setProvQuery(v)
                  setProveedorNombre(v)
                }}
              />
              {provOpts.slice(0, 8).map((p) => (
                <button
                  key={p.proveedor_id || p.id}
                  type="button"
                  style={cardTouch(ui, Number(proveedorId) === Number(p.proveedor_id || p.id))}
                  onClick={() => {
                    setProveedorId(p.proveedor_id || p.id)
                    setProveedorNombre(p.razon_social || p.nombre || '')
                    setProveedorManual(false)
                    setInsumoLabel(insumoLabel || 'Escombro')
                    setInsumoUnidad('m³')
                    setPaso(PASO.CANTIDAD)
                  }}
                >
                  {p.razon_social || p.nombre}
                </button>
              ))}
              {proveedorNombre.trim() && (
                <button
                  type="button"
                  style={{ ...ui.btnPrimary, minHeight: 56 }}
                  onClick={() => {
                    if (!proveedorId) setProveedorManual(true)
                    if (!insumoLabel) setInsumoLabel('Escombro')
                    setInsumoUnidad('m³')
                    setPaso(PASO.CANTIDAD)
                  }}
                >
                  Continuar
                </button>
              )}
            </div>
          )}

          {paso === PASO.CANTIDAD && tipo === 'disposicion' && (
            <div style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>Cantidad (m³)</div>
              <input
                inputMode="decimal"
                style={{ ...inputGiant(ui), fontSize: '2rem', textAlign: 'center' }}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                placeholder="0"
              />
              <button
                type="button"
                style={{ ...ui.btnPrimary, minHeight: 56 }}
                disabled={!(cantNum > 0)}
                onClick={() => setPaso(PASO.PLACA)}
              >
                Siguiente
              </button>
            </div>
          )}

          {paso === PASO.PLACA && tipo === 'disposicion' && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <div style={{ fontWeight: 800 }}>Placa</div>
              <input
                style={{ ...inputGiant(ui), textTransform: 'uppercase', letterSpacing: 2 }}
                value={placa}
                onChange={(e) => { void onPlacaChange(e.target.value) }}
                placeholder="AAA-000"
                autoCapitalize="characters"
              />
              <div style={{ fontWeight: 800 }}>Conductor</div>
              <input
                style={inputGiant(ui)}
                value={conductor}
                onChange={(e) => {
                  setConductor(e.target.value)
                  if (placaValida(placa)) setVehiculoNuevo(true)
                }}
                placeholder="Nombre"
              />
              <button
                type="button"
                style={{ ...ui.btnPrimary, minHeight: 56 }}
                disabled={!placaValida(placa) || !conductor.trim()}
                onClick={() => setPaso(PASO.FOTO)}
              >
                Siguiente
              </button>
            </div>
          )}

          {paso === PASO.FOTO && tipo === 'disposicion' && (
            <div style={{ display: 'grid', gap: 16, justifyItems: 'center', marginTop: 12, maxWidth: 560 }}>
              {/* Flujo legado; «Salió material» abre SalioMaterialPopup. Se mantiene por compatibilidad. */}
              <EntradaSoportePicker
                kind="remision"
                file={fotoRemision}
                previewUrl={fotoRemisionPreview}
                busy={busy}
                onPickFile={(e) => {
                  void takeSoporte('remision', e).then((ok) => {
                    if (ok) setPaso(PASO.CONFIRMAR)
                  })
                }}
                labelReady="Foto ✓"
                labelEmpty="Opcional en disposición"
              />
              <button
                type="button"
                style={{ ...ui.btnSecondary, minHeight: 52, width: '100%' }}
                onClick={() => {
                  setFotoRemision(null)
                  revokeUrl(fotoRemisionPreview)
                  setFotoRemisionPreview('')
                  setFotoRemisionHash('')
                  setPaso(PASO.CONFIRMAR)
                }}
              >
                Sin foto (por revisar)
              </button>
            </div>
          )}

          {paso === PASO.CONFIRMAR && tipo === 'disposicion' && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>Confirmar</div>
              <div style={cardTouch(ui, false)}>
                <div>🧱 {insumoLabel || 'Escombro'}</div>
                <div>🏭 {proveedorNombre || '—'}</div>
                <div style={{ fontWeight: 800 }}>{fmtCant(cantNum)} {insumoUnidad || 'm³'}</div>
                <div>🚛 {placa} · {conductor}</div>
                {fotoRemisionPreview ? (
                  <img src={fotoRemisionPreview} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginTop: 8 }} />
                ) : (
                  <div style={{ color: '#b45309', fontWeight: 700 }}>Sin foto</div>
                )}
              </div>
              <button
                type="button"
                data-testid="entrada-tablet-guardar"
                style={btnHome('#16a34a')}
                disabled={busy}
                onClick={() => { void guardar() }}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                style={{ ...ui.btnSecondary, minHeight: 56 }}
                disabled={busy}
                onClick={() => setPaso(PASO.CANTIDAD)}
              >
                Corregir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
