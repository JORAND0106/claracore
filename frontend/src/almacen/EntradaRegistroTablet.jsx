/**
 * Registro de Entradas — popup amplio independiente (tablet 10").
 * Recibo («Llegó material»): OC consolidada → captura única (cant+placa+2 fotos) → confirmar.
 * Disposición («Salió material»): flujo previo (sector / escombrera) sin cambio de alcance.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import {
  formatNombrePropio,
  fmtCant,
  todayDateInputColombia,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { prepareRemisionSoporte } from './almacenRemisionSoporte'
import {
  countSearchDisplay,
  distributeCantidadOverLineas,
  filterOcsForSearch,
  formatPlacaInput,
  highlightSegments,
  motivosPorRevisarPreview,
  placaValida,
  PASO,
} from './entradaRegistroTabletHelpers'

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
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const camRemisionRef = useRef(null)
  const camMaterialRef = useRef(null)
  const contrato = contratoId || permisos?.contratoId

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
  const [placa, setPlaca] = useState('')
  const [conductor, setConductor] = useState('')
  const [placaOpts, setPlacaOpts] = useState([])
  const [vehiculoNuevo, setVehiculoNuevo] = useState(false)
  const [fotoRemision, setFotoRemision] = useState(null)
  const [fotoRemisionPreview, setFotoRemisionPreview] = useState('')
  const [fotoMaterial, setFotoMaterial] = useState(null)
  const [fotoMaterialPreview, setFotoMaterialPreview] = useState('')
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [tramo, setTramo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const puedeCrear = Boolean(permisos?.crear)
  const cantNum = Number(cantidad)
  const saldoOc = insumoSel ? Number(insumoSel.saldo_cantidad || 0) : (ocCard ? Number(ocCard.saldo_cantidad_total || 0) : null)
  const superaSaldo = Boolean(insumoSel && cantNum > 0 && cantNum > saldoOc + 0.0001)
  const sinInsumo = Boolean(!ocCard && !insumoId)
  const fotosCompletas = Boolean(fotoRemision && fotoMaterial)

  const draft = useMemo(() => ({
    tipo,
    orden_compra_id: ocCard?.orden_compra_id || null,
    supera_saldo: superaSaldo,
    proveedor_manual: proveedorManual || (!proveedorId && Boolean(proveedorNombre)),
    sin_insumo: sinInsumo,
    sin_sector: tipo === 'recibo' && !String(pkId || pkLabel || '').trim(),
    foto: fotoRemision,
    vehiculo_nuevo: vehiculoNuevo,
  }), [tipo, ocCard, superaSaldo, proveedorManual, proveedorId, proveedorNombre, sinInsumo, pkId, pkLabel, fotoRemision, vehiculoNuevo])

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
    setPlaca('')
    setConductor('')
    setVehiculoNuevo(false)
    revokeUrl(fotoRemisionPreview)
    revokeUrl(fotoMaterialPreview)
    setFotoRemision(null)
    setFotoRemisionPreview('')
    setFotoMaterial(null)
    setFotoMaterialPreview('')
    setPkId('')
    setPkLabel('')
    setTramo('')
    setError('')
    setOkMsg('')
    setOcSearch('')
  }

  const elegirTipo = (t) => {
    resetFlujo()
    setTipo(t)
    setPaso(t === 'recibo' ? PASO.OC : PASO.SECTOR)
  }

  const elegirInsumoDeOc = (card, insumo) => {
    setOcCard(card)
    setInsumoSel(insumo)
    setProveedorId(card.proveedor_id || null)
    setProveedorNombre(card.proveedor_nombre || '')
    setProveedorManual(false)
    setInsumoId(insumo.insumo_id || null)
    setInsumoLabel(insumo.material_descripcion || '')
    setInsumoUnidad(insumo.unidad || 'm³')
    const sector = (insumo.pk_id || '').trim()
    setPkId(sector)
    setPkLabel(sector)
    setTramo(insumo.tramo || '')
    setPaso(PASO.CAPTURA)
  }

  const elegirSinOc = () => {
    setOcCard(null)
    setInsumoSel(null)
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

  const takeFoto = async (which, e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return false
    setBusy(true)
    setError('')
    try {
      const { file } = await prepareRemisionSoporte(f)
      const url = URL.createObjectURL(file)
      if (which === 'remision') {
        revokeUrl(fotoRemisionPreview)
        setFotoRemision(file)
        setFotoRemisionPreview(url)
      } else {
        revokeUrl(fotoMaterialPreview)
        setFotoMaterial(file)
        setFotoMaterialPreview(url)
      }
      return true
    } catch (err) {
      setError(err.message || 'No se pudo preparar la foto')
      return false
    } finally {
      setBusy(false)
    }
  }

  const capturaLista = Boolean(
    cantNum > 0
    && placaValida(placa)
    && conductor.trim()
    && fotosCompletas,
  )

  const guardar = async () => {
    if (!puedeCrear) return
    if (tipo === 'recibo' && !fotosCompletas) {
      setError('Se requieren las dos fotos: recibo y material descargado.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('fecha_entrada', todayDateInputColombia())
      if (ocCard?.orden_compra_id) fd.append('orden_compra_id', String(ocCard.orden_compra_id))
      if (proveedorId) fd.append('proveedor_id', String(proveedorId))
      if (proveedorNombre) fd.append('proveedor_nombre_texto', proveedorNombre)
      if (insumoId) fd.append('insumo_id', String(insumoId))
      if (insumoLabel) fd.append('material_descripcion', insumoLabel)
      if (insumoUnidad) fd.append('unidad', insumoUnidad)
      const sector = (pkLabel || pkId || '').trim()
      if (sector) fd.append('pk_id', sector)
      if (tramo) fd.append('tramo', tramo)
      if (placa) fd.append('placa', placa)
      if (conductor) fd.append('transportador', formatNombrePropio(conductor))

      let items
      if (insumoSel?.lineas?.length) {
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

      const r = await api.createEntrada(fd)
      setOkMsg(r?.por_revisar ? 'Guardado · por revisar' : 'Guardado')
      onSaved?.(r)
      if (r?.id) {
        try {
          await api.printDisposicionPdf(r.id)
        } catch {
          try { await api.openDisposicionPdf(r.id) } catch { /* ignore */ }
        }
      }
      setTimeout(() => {
        resetFlujo()
        setOcsLoaded(false)
        setOcs([])
        setTipo(null)
        setPaso(PASO.INICIO)
        setOkMsg('')
      }, 900)
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
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
        position: 'fixed',
        top: overlayTop,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100040,
        background: 'var(--cc-almacen-overlay, rgba(15, 23, 42, 0.55))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        boxSizing: 'border-box',
        overscrollBehavior: 'contain',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        data-testid="entrada-tablet-popup"
        style={{
          width: 'min(1100px, 96%)',
          maxHeight: 'min(92dvh, calc(100% - 8px))',
          margin: '0 auto',
          background: 'var(--cc-almacen-bg-card, #fff)',
          color: 'var(--cc-almacen-text, #0f172a)',
          borderRadius: 16,
          border: `1px solid ${ui.borderColor}`,
          boxShadow: 'var(--cc-almacen-shadow-modal, 0 24px 64px rgba(0,0,0,0.35))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          alignSelf: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
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

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
        >
          {error && (
            <div data-testid="entrada-tablet-error" style={{ color: '#b91c1c', marginBottom: 12, fontWeight: 600 }}>{error}</div>
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
                style={btnHome('#ea580c')}
                onClick={() => elegirTipo('disposicion')}
              >
                <span style={{ fontSize: '2.2rem' }} aria-hidden>🚚</span>
                Salió material
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
                      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                        📋 OC{' '}
                        <HighlightText
                          text={c.numero_oc != null ? `#${c.numero_oc}` : '—'}
                          query={ocSearch}
                        />
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        🏭 <HighlightText text={c.proveedor_nombre || 'Proveedor'} query={ocSearch} />
                      </div>
                      <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                        {insumos.map((ins) => (
                          <button
                            key={ins.key || `${ins.insumo_id}-${ins.material_descripcion}`}
                            type="button"
                            data-testid="entrada-tablet-oc-insumo"
                            style={{
                              ...ui.btnSecondary,
                              textAlign: 'left',
                              minHeight: 52,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: 2,
                              width: '100%',
                            }}
                            onClick={() => elegirInsumoDeOc(c, ins)}
                          >
                            <span style={{ fontWeight: 700 }}>
                              🧱 <HighlightText text={ins.material_descripcion || 'Material'} query={ocSearch} />
                            </span>
                            <span style={{ color: ui.accent, fontWeight: 800 }}>
                              Falta {fmtCant(ins.saldo_cantidad)} {ins.unidad || ''}
                            </span>
                          </button>
                        ))}
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
            <div data-testid="entrada-tablet-captura" style={{ display: 'grid', gap: 10, width: '100%' }}>
              <div
                data-testid="entrada-tablet-captura-fila"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 10,
                  alignItems: 'end',
                  width: '100%',
                }}
              >
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Cantidad ({insumoUnidad || 'm³'})</div>
                  <input
                    inputMode="decimal"
                    style={{ ...inputGiant(ui), fontSize: '1.6rem', textAlign: 'center', minHeight: 52 }}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                    placeholder="0"
                    data-testid="entrada-tablet-cantidad"
                  />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Saldo OC</div>
                  <div
                    data-testid="entrada-tablet-saldo"
                    style={{
                      ...inputGiant(ui),
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: 800,
                      background: ui.accentSoft || 'rgba(0,119,182,0.12)',
                      border: `1px solid ${ui.borderColor}`,
                      minHeight: 52,
                    }}
                  >
                    {insumoSel || ocCard
                      ? `${fmtCant(saldoOc)} ${insumoSel?.unidad || insumoUnidad || ''}${ocCard?.numero_oc != null ? ` · #${ocCard.numero_oc}` : ''}`
                      : '—'}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Placa</div>
                  <input
                    style={{ ...inputGiant(ui), textTransform: 'uppercase', letterSpacing: 2, minHeight: 52 }}
                    value={placa}
                    onChange={(e) => { void onPlacaChange(e.target.value) }}
                    placeholder="AAA-000"
                    data-testid="entrada-tablet-placa"
                    autoCapitalize="characters"
                  />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Conductor</div>
                  <input
                    style={{ ...inputGiant(ui), minHeight: 52 }}
                    value={conductor}
                    onChange={(e) => {
                      setConductor(e.target.value)
                      if (placaValida(placa)) setVehiculoNuevo(true)
                    }}
                    placeholder="Nombre"
                    data-testid="entrada-tablet-conductor"
                  />
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }} data-testid="entrada-tablet-mapa">
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Sector</div>
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
                <div style={{ color: '#b45309', fontWeight: 700 }}>⚠ Supera saldo · se guarda por revisar</div>
              )}
              {vehiculoNuevo && placaValida(placa) && (
                <div style={{ color: '#b45309', fontWeight: 700 }}>Vehículo nuevo · por revisar</div>
              )}
              {placaOpts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {placaOpts.slice(0, 5).map((r) => (
                    <button
                      key={r.placa}
                      type="button"
                      style={{ ...ui.btnSecondary, minHeight: 40 }}
                      onClick={() => {
                        setPlaca(formatPlacaInput(r.placa))
                        setConductor(formatNombrePropio(r.nombre))
                        setVehiculoNuevo(false)
                      }}
                    >
                      🚛 {formatPlacaInput(r.placa)} · {formatNombrePropio(r.nombre)}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ fontWeight: 800, marginTop: 2 }}>Fotos (obligatorias)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    ref={camRemisionRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => { void takeFoto('remision', e) }}
                  />
                  <button
                    type="button"
                    data-testid="entrada-tablet-foto-remision"
                    style={{
                      ...btnHome(fotoRemision ? '#15803d' : '#0077B6'),
                      minHeight: 72,
                      opacity: busy ? 0.7 : 1,
                    }}
                    disabled={busy}
                    onClick={() => camRemisionRef.current?.click()}
                  >
                    <span style={{ fontSize: '1.5rem' }} aria-hidden>📄</span>
                    {fotoRemision ? 'Recibo ✓' : 'Foto recibo'}
                  </button>
                  {fotoRemisionPreview ? (
                    <img src={fotoRemisionPreview} alt="Recibo" style={{ width: '100%', maxHeight: 88, objectFit: 'cover', borderRadius: 10 }} />
                  ) : (
                    <div data-testid="entrada-tablet-falta-remision" style={{ color: '#b45309', fontWeight: 700, fontSize: '0.85rem' }}>Falta foto del recibo</div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    ref={camMaterialRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => { void takeFoto('material', e) }}
                  />
                  <button
                    type="button"
                    data-testid="entrada-tablet-foto-material"
                    style={{
                      ...btnHome(fotoMaterial ? '#15803d' : '#0077B6'),
                      minHeight: 72,
                      opacity: busy ? 0.7 : 1,
                    }}
                    disabled={busy}
                    onClick={() => camMaterialRef.current?.click()}
                  >
                    <span style={{ fontSize: '1.5rem' }} aria-hidden>📷</span>
                    {fotoMaterial ? 'Material ✓' : 'Foto material'}
                  </button>
                  {fotoMaterialPreview ? (
                    <img src={fotoMaterialPreview} alt="Material" style={{ width: '100%', maxHeight: 88, objectFit: 'cover', borderRadius: 10 }} />
                  ) : (
                    <div data-testid="entrada-tablet-falta-material" style={{ color: '#b45309', fontWeight: 700, fontSize: '0.85rem' }}>Falta foto del material</div>
                  )}
                </div>
              </div>

              <button
                type="button"
                data-testid="entrada-tablet-captura-siguiente"
                style={{ ...ui.btnPrimary, minHeight: 52, fontSize: '1.1rem' }}
                disabled={!capturaLista || busy}
                onClick={() => setPaso(PASO.CONFIRMAR)}
              >
                Revisar y confirmar
              </button>
              {!capturaLista && (
                <div style={{ color: ui.textMuted, fontSize: '0.9rem' }}>
                  Complete cantidad, placa, conductor y las dos fotos para continuar.
                </div>
              )}
            </div>
          )}

          {paso === PASO.CONFIRMAR && tipo === 'recibo' && (
            <div data-testid="entrada-tablet-resumen" style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 900, margin: '0 auto' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>Confirmar</div>
              <div style={cardTouch(ui, false)}>
                <div>🧱 {insumoLabel || 'Material'}</div>
                <div>🏭 {proveedorNombre || '—'}</div>
                <div>📋 {ocCard?.numero_oc != null ? `OC #${ocCard.numero_oc}` : 'Sin OC'}</div>
                <div>📍 {(pkLabel || pkId) ? `${pkLabel || pkId}${tramo ? ` · ${tramo}` : ''}` : 'Sin sector'}</div>
                <div style={{ fontWeight: 800 }}>{fmtCant(cantNum)} {insumoUnidad}</div>
                <div>🚛 {placa} · {conductor}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  {fotoRemisionPreview && (
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>Recibo</div>
                      <img src={fotoRemisionPreview} alt="Recibo" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10 }} />
                    </div>
                  )}
                  {fotoMaterialPreview && (
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>Material</div>
                      <img src={fotoMaterialPreview} alt="Material" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10 }} />
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
                      background: '#fbbf24',
                      color: '#78350f',
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
                disabled={busy || !fotosCompletas}
                onClick={() => { void guardar() }}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
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
              <input
                ref={camRemisionRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  void takeFoto('remision', e).then((ok) => {
                    if (ok) setPaso(PASO.CONFIRMAR)
                  })
                }}
              />
              <button
                type="button"
                style={btnHome('#0077B6')}
                disabled={busy}
                onClick={() => camRemisionRef.current?.click()}
              >
                <span style={{ fontSize: '2.4rem' }} aria-hidden>📷</span>
                Tomar foto
              </button>
              <button
                type="button"
                style={{ ...ui.btnSecondary, minHeight: 52, width: '100%' }}
                onClick={() => {
                  setFotoRemision(null)
                  revokeUrl(fotoRemisionPreview)
                  setFotoRemisionPreview('')
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
