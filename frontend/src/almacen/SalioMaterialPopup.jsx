/**
 * Popup «Salió material» — mismo estilo que Llegó material.
 * Registrar (material → captura → confirmar) + Historial (Tab Salidas completo).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import ReceptorObraSelector from './ReceptorObraSelector'
import SalidasPanel from './SalidasPanel'
import {
  formatEntradaNumero,
  fmtCant,
  datetimeLocalColombiaToIsoUtc,
  nowDatetimeLocalColombia,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import {
  consolidarMaterialesDisponibles,
  filterMaterialCards,
  motivosSalidaPorRevisarPreview,
  pickLineaPreferida,
  SALIO_PASO,
} from './salioMaterialHelpers'

const btnHome = (bg, color = '#fff') => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 96,
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
  position: 'relative',
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

export default function SalioMaterialPopup({
  onClose,
  onSaved,
  permisos,
  theme,
  token,
  contratoId,
  initialMode = 'registrar', // 'registrar' | 'historial'
  refreshSignal = 0,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const contrato = contratoId || permisos?.contratoId
  const puedeCrear = Boolean(permisos?.crear)
  const puedeValidar = Boolean(permisos?.validar)

  const [modo, setModo] = useState(
    initialMode === 'historial' ? SALIO_PASO.HISTORIAL : SALIO_PASO.REGISTRAR_MATERIAL,
  )
  const [chromeTop, setChromeTop] = useState(0)
  const [lineas, setLineas] = useState([])
  const [loadingLineas, setLoadingLineas] = useState(false)
  const [search, setSearch] = useState('')
  const [materialCard, setMaterialCard] = useState(null)
  const [lineaSel, setLineaSel] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [receptor, setReceptor] = useState(null)
  const [fechaHora, setFechaHora] = useState(() => nowDatetimeLocalColombia())
  const [pkId, setPkId] = useState('')
  const [pkLabel, setPkLabel] = useState('')
  const [pkIdId, setPkIdId] = useState(null)
  const [tramo, setTramo] = useState('')
  const [costado, setCostado] = useState('')
  const [abscisaInicial, setAbscisaInicial] = useState('')
  const [abscisaFinal, setAbscisaFinal] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [savedSalida, setSavedSalida] = useState(null)
  const [porRevisarCount, setPorRevisarCount] = useState(0)
  const [historialRefresh, setHistorialRefresh] = useState(0)

  const cards = useMemo(() => consolidarMaterialesDisponibles(lineas), [lineas])
  const cardsFiltradas = useMemo(() => filterMaterialCards(cards, search), [cards, search])
  const cantNum = Number(String(cantidad).replace(',', '.'))
  const saldoDisp = Number(lineaSel?.cantidad_disponible || 0)
  const superaStock = Boolean(lineaSel && Number.isFinite(cantNum) && cantNum > saldoDisp + 1e-9)
  const sinSector = !String(pkId || pkLabel || '').trim()
  const sinReceptor = !receptor?.id
  const motivosPrev = motivosSalidaPorRevisarPreview({ sinSector, sinReceptor })

  const reloadDisponibles = useCallback(() => {
    setLoadingLineas(true)
    return api.listEntradasDisponibles()
      .then((rows) => setLineas(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        setLineas([])
        setError(e.message || 'No se pudieron cargar materiales con entrada')
      })
      .finally(() => setLoadingLineas(false))
  }, [api])

  const reloadPorRevisarCount = useCallback(() => {
    if (!puedeValidar) {
      setPorRevisarCount(0)
      return Promise.resolve(0)
    }
    return api.countSalidasPorRevisar()
      .then((n) => {
        setPorRevisarCount(n)
        return n
      })
      .catch(() => {
        setPorRevisarCount(0)
        return 0
      })
  }, [api, puedeValidar])

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

  useEffect(() => {
    if (modo === SALIO_PASO.HISTORIAL) return undefined
    reloadDisponibles()
    reloadPorRevisarCount()
    return undefined
  }, [modo, reloadDisponibles, reloadPorRevisarCount])

  useEffect(() => {
    reloadPorRevisarCount()
  }, [reloadPorRevisarCount, refreshSignal, historialRefresh])

  const resetRegistro = () => {
    setMaterialCard(null)
    setLineaSel(null)
    setCantidad('')
    setReceptor(null)
    setFechaHora(nowDatetimeLocalColombia())
    setPkId('')
    setPkLabel('')
    setPkIdId(null)
    setTramo('')
    setCostado('')
    setAbscisaInicial('')
    setAbscisaFinal('')
    setObservaciones('')
    setSavedSalida(null)
    setError('')
    setOkMsg('')
    setSearch('')
  }

  const irRegistrar = () => {
    resetRegistro()
    setModo(SALIO_PASO.REGISTRAR_MATERIAL)
  }

  const irHistorial = () => {
    setModo(SALIO_PASO.HISTORIAL)
    setHistorialRefresh((n) => n + 1)
  }

  const elegirLinea = (ln, card) => {
    setError('')
    setMaterialCard(card || null)
    setLineaSel(ln)
    setCantidad('')
    setPkId(ln?.pk_id || '')
    setPkLabel(ln?.pk_id || '')
    setPkIdId(null)
    setTramo(ln?.tramo || '')
    setCostado(ln?.costado || '')
    setAbscisaInicial(ln?.abscisa_inicial || '')
    setAbscisaFinal(ln?.abscisa_final || '')
    setModo(SALIO_PASO.REGISTRAR_CAPTURA)
  }

  const elegirCard = (card) => {
    const visibles = card.lineasVisibles || card.lineas || []
    if (visibles.length === 1) {
      elegirLinea(visibles[0], card)
      return
    }
    const pref = pickLineaPreferida(visibles)
    if (pref) elegirLinea(pref, card)
  }

  const onPkSeleccionar = (sel) => {
    setPkId(sel.pk_id || sel.pk_label || '')
    setPkLabel(sel.pk_label || sel.pk_id || '')
    setPkIdId(sel.pk_id_id ?? null)
    if (sel.tramo) setTramo(sel.tramo)
  }

  const onPkLimpiar = () => {
    setPkId('')
    setPkLabel('')
    setPkIdId(null)
  }

  const puedeConfirmar = Boolean(
    lineaSel
    && Number.isFinite(cantNum)
    && cantNum > 0
    && !superaStock,
  )

  const guardar = async () => {
    if (!puedeConfirmar || !lineaSel) return
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      const body = {
        entrada_item_id: Number(lineaSel.entrada_item_id),
        cantidad_salida: cantNum,
        receptor_usuario_id: receptor?.id || null,
        fecha_hora_salida: datetimeLocalColombiaToIsoUtc(fechaHora),
        pk_id: pkId.trim() || null,
        pk_id_id: pkIdId,
        tramo: tramo || null,
        costado: costado || null,
        abscisa_inicial: abscisaInicial || null,
        abscisa_final: abscisaFinal || null,
        observaciones: observaciones.trim() || null,
      }
      const saved = await api.createSalida(body)
      setSavedSalida(saved)
      setOkMsg(saved?.por_revisar ? 'Guardado · por revisar' : 'Guardado')
      onSaved?.(saved)
      reloadPorRevisarCount()
      reloadDisponibles()
    } catch (e) {
      setError(e.message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const imprimirRecibo = async () => {
    const id = savedSalida?.id
    if (!id) return
    setBusy(true)
    setError('')
    try {
      await api.printSalidaPdf(id)
    } catch (e) {
      setError(e.message || 'No se pudo imprimir')
    } finally {
      setBusy(false)
    }
  }

  const headerTitle = modo === SALIO_PASO.HISTORIAL
    ? 'Historial de salidas'
    : 'Salió material'

  const overlayTop = chromeTop || 0

  const atras = () => {
    if (modo === SALIO_PASO.HISTORIAL) {
      if (initialMode === 'historial') onClose?.()
      else irRegistrar()
      return
    }
    if (modo === SALIO_PASO.REGISTRAR_CONFIRMAR) {
      if (savedSalida) {
        resetRegistro()
        setModo(SALIO_PASO.REGISTRAR_MATERIAL)
      } else {
        setModo(SALIO_PASO.REGISTRAR_CAPTURA)
      }
      return
    }
    if (modo === SALIO_PASO.REGISTRAR_CAPTURA) {
      setLineaSel(null)
      setMaterialCard(null)
      setModo(SALIO_PASO.REGISTRAR_MATERIAL)
      return
    }
    onClose?.()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="salio-material-popup"
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
        data-testid="salio-material-dialog"
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
            onClick={atras}
            aria-label="Atrás"
          >
            ←
          </button>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md, 1.1rem)', textAlign: 'center', flex: 1 }}>
            {headerTitle}
          </div>
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
          display: 'flex',
          gap: 8,
          padding: '8px 14px',
          borderBottom: `1px solid ${ui.borderColor}`,
          flexShrink: 0,
        }}
        >
          {puedeCrear && (
            <button
              type="button"
              data-testid="salio-tab-registrar"
              style={{
                ...ui.btnSecondary,
                flex: 1,
                fontWeight: 800,
                background: modo !== SALIO_PASO.HISTORIAL ? ui.accent : undefined,
                color: modo !== SALIO_PASO.HISTORIAL ? '#fff' : undefined,
              }}
              onClick={irRegistrar}
            >
              🚚 Registrar
            </button>
          )}
          <button
            type="button"
            data-testid="salio-tab-historial"
            style={{
              ...ui.btnSecondary,
              flex: 1,
              fontWeight: 800,
              background: modo === SALIO_PASO.HISTORIAL ? ui.accent : undefined,
              color: modo === SALIO_PASO.HISTORIAL ? '#fff' : undefined,
              position: 'relative',
            }}
            onClick={irHistorial}
          >
            📋 Historial
            {puedeValidar && porRevisarCount > 0 && (
              <span
                data-testid="salio-historial-por-revisar-badge"
                style={{
                  marginLeft: 6,
                  background: '#dc2626',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '0 6px',
                  fontSize: 'var(--cc-xs)',
                }}
              >
                {porRevisarCount}
              </span>
            )}
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
            <div data-testid="salio-error" style={{ color: '#b91c1c', marginBottom: 12, fontWeight: 600 }}>{error}</div>
          )}
          {okMsg && (
            <div style={{ color: '#15803d', marginBottom: 12, fontWeight: 800, fontSize: '1.2rem' }}>{okMsg}</div>
          )}

          {modo === SALIO_PASO.HISTORIAL && (
            <SalidasPanel
              permisos={permisos}
              token={token}
              t={theme}
              refreshSignal={historialRefresh + refreshSignal}
              embedded
              onSalidaMutated={() => {
                reloadPorRevisarCount()
                onSaved?.()
              }}
            />
          )}

          {modo === SALIO_PASO.REGISTRAR_MATERIAL && puedeCrear && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--cc-md, 1.05rem)', marginBottom: 8 }}>
                ¿Qué material sale?
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 10 }}>
                Solo materiales con entrada registrada y saldo disponible.
              </div>
              <input
                data-testid="salio-material-search"
                style={{ ...inputGiant(ui), marginBottom: 14 }}
                placeholder="Buscar material, OC, entrada, PK…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              {loadingLineas && (
                <div style={{ color: ui.textMuted, marginBottom: 12 }}>Cargando materiales…</div>
              )}
              {!loadingLineas && cards.length === 0 && (
                <div
                  data-testid="salio-sin-entradas"
                  style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}
                >
                  No hay materiales con entrada y saldo. Primero registre su entrada en «Llegó material».
                </div>
              )}
              {!loadingLineas && cards.length > 0 && cardsFiltradas.length === 0 && (
                <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
                  Ningún material coincide. Si no aparece, primero debe registrarse su entrada.
                </div>
              )}
              <div
                data-testid="salio-material-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {cardsFiltradas.map((card) => {
                  const lineasVis = card.lineasVisibles || card.lineas || []
                  return (
                    <div key={card.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        type="button"
                        data-testid="salio-material-card"
                        style={cardTouch(ui, false)}
                        onClick={() => elegirCard(card)}
                      >
                        <div style={{ fontWeight: 800 }}>{card.material_descripcion}</div>
                        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                          Disponible: {fmtCant(card.cantidad_disponible_total)}
                          {card.unidad ? ` ${card.unidad}` : ''}
                          {card.numeros_oc?.length ? ` · OC ${card.numeros_oc.join(', ')}` : ''}
                        </div>
                      </button>
                      {search.trim() && card.matchMode === 'lineas' && lineasVis.map((ln) => (
                        <button
                          key={ln.entrada_item_id}
                          type="button"
                          data-testid="salio-linea-hit"
                          style={{
                            ...ui.btnSecondary,
                            textAlign: 'left',
                            fontSize: 'var(--cc-xs)',
                            padding: '8px 10px',
                          }}
                          onClick={() => elegirLinea(ln, card)}
                        >
                          {formatEntradaNumero(ln)}
                          {' · '}
                          {fmtCant(ln.cantidad_disponible)}{ln.unidad ? ` ${ln.unidad}` : ''}
                          {ln.pk_id ? ` · PK ${ln.pk_id}` : ''}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {modo === SALIO_PASO.REGISTRAR_CAPTURA && lineaSel && (
            <div data-testid="salio-captura">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>{lineaSel.material_descripcion}</div>
              <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
                {formatEntradaNumero(lineaSel)}
                {lineaSel.numero_oc != null ? ` · OC ${lineaSel.numero_oc}` : ''}
                {' · Disponible: '}
                <strong>{fmtCant(saldoDisp)}{lineaSel.unidad ? ` ${lineaSel.unidad}` : ''}</strong>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: 12,
              }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 700 }}>
                  Cantidad
                  <input
                    data-testid="salio-cantidad"
                    type="number"
                    min={0}
                    step="any"
                    style={inputGiant(ui)}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                  {superaStock && (
                    <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: 'var(--cc-sm)' }}>
                      No puede superar el disponible ({fmtCant(saldoDisp)}).
                    </span>
                  )}
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 700 }}>
                  Quién recibe
                  <ReceptorObraSelector value={receptor} onChange={setReceptor} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 700 }}>
                  Fecha y hora
                  <input
                    type="datetime-local"
                    style={inputGiant(ui)}
                    value={fechaHora}
                    onChange={(e) => setFechaHora(e.target.value)}
                  />
                </label>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Sector (PK-ID) de destino
                  <span style={{ fontWeight: 500, color: ui.textMuted }}> — opcional</span>
                </div>
                <AlmacenPkMapaSelector
                  t={theme}
                  token={token}
                  contratoId={contrato}
                  pkIdSeleccionado={pkId}
                  pkLabel={pkLabel}
                  onSeleccionar={onPkSeleccionar}
                  onLimpiar={onPkLimpiar}
                  compact
                />
                {pkId && (
                  <div style={{ marginTop: 6, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                    Destino: {pkLabel || pkId}
                    {tramo ? ` · ${tramo}` : ''}
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontWeight: 700, marginBottom: 12 }}>
                Observaciones
                <input
                  style={ui.input}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Opcional"
                />
              </label>

              {motivosPrev.length > 0 && (
                <div
                  data-testid="salio-motivos-prev"
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 12,
                    fontSize: 'var(--cc-sm)',
                    fontWeight: 600,
                  }}
                >
                  Se guardará por revisar: {motivosPrev.join(' · ')}
                </div>
              )}

              <button
                type="button"
                data-testid="salio-ir-confirmar"
                style={{ ...btnHome('#ea580c'), minHeight: 56 }}
                disabled={!puedeConfirmar}
                onClick={() => {
                  if (!puedeConfirmar) return
                  setModo(SALIO_PASO.REGISTRAR_CONFIRMAR)
                }}
              >
                Continuar →
              </button>
            </div>
          )}

          {modo === SALIO_PASO.REGISTRAR_CONFIRMAR && lineaSel && (
            <div data-testid="salio-confirmar">
              {!savedSalida ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 12 }}>Confirmar salida</div>
                  <div style={{ ...ui.card, marginBottom: 14, lineHeight: 1.5 }}>
                    <div><strong>{lineaSel.material_descripcion}</strong></div>
                    <div>Cantidad: {fmtCant(cantNum)}{lineaSel.unidad ? ` ${lineaSel.unidad}` : ''}</div>
                    <div>Recibe: {receptor?.label || '— (por revisar)'}</div>
                    <div>Sector: {pkLabel || pkId || '— (por revisar)'}</div>
                    <div>Entrada: {formatEntradaNumero(lineaSel)}</div>
                    {motivosPrev.length > 0 && (
                      <div style={{ marginTop: 8, color: '#92400e', fontWeight: 700 }}>
                        Por revisar: {motivosPrev.join(' · ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      data-testid="salio-corregir"
                      style={btnHome('#64748b')}
                      disabled={busy}
                      onClick={() => setModo(SALIO_PASO.REGISTRAR_CAPTURA)}
                    >
                      Corregir
                    </button>
                    <button
                      type="button"
                      data-testid="salio-guardar"
                      style={btnHome('#16a34a')}
                      disabled={busy || !puedeConfirmar}
                      onClick={guardar}
                    >
                      {busy ? '…' : 'Guardar'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: 10, color: '#15803d' }}>
                    Salida registrada
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    {savedSalida.codigo || savedSalida.numero_salida
                      ? `N.º ${savedSalida.codigo || savedSalida.numero_salida}`
                      : 'Listo'}
                    {savedSalida.por_revisar ? ' · por revisar' : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      data-testid="salio-imprimir"
                      style={btnHome('#2563eb')}
                      disabled={busy}
                      onClick={imprimirRecibo}
                    >
                      🖨 Imprimir recibo
                    </button>
                    <button
                      type="button"
                      style={btnHome('#ea580c')}
                      onClick={() => {
                        resetRegistro()
                        setModo(SALIO_PASO.REGISTRAR_MATERIAL)
                      }}
                    >
                      Otra salida
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
