/**
 * Registro de Entradas pensado para tablet 10" (dedo, poco texto, sin bloqueos).
 * Recibo («Llegó material») y disposición («Sale escombro»).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import {
  formatNombrePropio,
  fmtCant,
  todayDateInputColombia,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'
import { prepareRemisionSoporte } from './almacenRemisionSoporte'
import {
  formatPlacaInput,
  motivosPorRevisarPreview,
  placaValida,
  PASO,
} from './entradaRegistroTabletHelpers'

const btnGiant = (bg, color = '#fff') => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 140,
  width: '100%',
  borderRadius: 16,
  border: 'none',
  background: bg,
  color,
  fontSize: '1.35rem',
  fontWeight: 800,
  cursor: 'pointer',
  padding: 20,
  boxShadow: '0 4px 16px rgba(15,23,42,0.18)',
})

const cardTouch = (ui, selected) => ({
  ...ui.card,
  padding: 16,
  marginBottom: 10,
  cursor: 'pointer',
  border: selected ? `3px solid ${ui.accent}` : `2px solid ${ui.borderColor}`,
  minHeight: 72,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  WebkitTapHighlightColor: 'transparent',
})

const inputGiant = (ui) => ({
  ...ui.input,
  fontSize: '1.6rem',
  padding: '16px 14px',
  minHeight: 56,
  width: '100%',
  boxSizing: 'border-box',
})

export default function EntradaRegistroTablet({
  onClose,
  onSaved,
  permisos,
  theme,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const camRef = useRef(null)

  const [paso, setPaso] = useState(PASO.INICIO)
  const [tipo, setTipo] = useState(null) // recibo | disposicion
  const [ocs, setOcs] = useState([])
  const [loadingOc, setLoadingOc] = useState(false)
  const [ocCard, setOcCard] = useState(null)
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
  const [cantidad, setCantidad] = useState('')
  const [placa, setPlaca] = useState('')
  const [conductor, setConductor] = useState('')
  const [placaOpts, setPlacaOpts] = useState([])
  const [vehiculoNuevo, setVehiculoNuevo] = useState(false)
  const [foto, setFoto] = useState(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [pkId, setPkId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const puedeCrear = Boolean(permisos?.crear)
  const cantNum = Number(cantidad)
  const saldoOc = ocCard ? Number(ocCard.saldo_cantidad || 0) : null
  const superaSaldo = Boolean(ocCard && cantNum > 0 && cantNum > saldoOc + 0.0001)

  const draft = useMemo(() => ({
    orden_compra_id: ocCard?.orden_compra_id || null,
    supera_saldo: superaSaldo,
    proveedor_manual: proveedorManual || (!proveedorId && Boolean(proveedorNombre)),
    foto,
    vehiculo_nuevo: vehiculoNuevo,
  }), [ocCard, superaSaldo, proveedorManual, proveedorId, proveedorNombre, foto, vehiculoNuevo])

  const motivosPrev = motivosPorRevisarPreview(draft)

  const loadOcs = useCallback(() => {
    setLoadingOc(true)
    api.listOcsPendientesEntrada()
      .then((rows) => setOcs(Array.isArray(rows) ? rows : []))
      .catch((e) => setError(e.message || 'No se pudieron cargar las OC'))
      .finally(() => setLoadingOc(false))
  }, [api])

  useEffect(() => {
    if (paso === PASO.OC) loadOcs()
  }, [paso, loadOcs])

  useEffect(() => {
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
  }, [api, provQuery])

  useEffect(() => {
    if (!insumoQuery.trim()) {
      setInsumoOpts([])
      return undefined
    }
    const t = setTimeout(() => {
      const fn = api.searchInsumosCatalog || api.searchInsumos
      Promise.resolve(fn.call(api, insumoQuery))
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : (rows?.items || [])
          setInsumoOpts(list)
        })
        .catch(() => setInsumoOpts([]))
    }, 220)
    return () => clearTimeout(t)
  }, [api, insumoQuery])

  const resetFlujo = () => {
    setOcCard(null)
    setProveedorId(null)
    setProveedorNombre('')
    setProveedorManual(false)
    setInsumoId(null)
    setInsumoLabel('')
    setInsumoUnidad('m³')
    setCantidad('')
    setPlaca('')
    setConductor('')
    setVehiculoNuevo(false)
    setFoto(null)
    setFotoPreview('')
    setPkId('')
    setError('')
    setOkMsg('')
  }

  const elegirTipo = (t) => {
    resetFlujo()
    setTipo(t)
    setPaso(t === 'recibo' ? PASO.OC : PASO.SECTOR)
  }

  const elegirOc = (card) => {
    setOcCard(card)
    setProveedorId(card.proveedor_id || null)
    setProveedorNombre(card.proveedor_nombre || '')
    setProveedorManual(false)
    setInsumoId(card.insumo_id || null)
    setInsumoLabel(card.material_descripcion || '')
    setInsumoUnidad(card.unidad || 'm³')
    setPkId(card.pk_id || '')
    setPaso(PASO.CANTIDAD)
  }

  const elegirSinOc = () => {
    setOcCard(null)
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

  const onFoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    setError('')
    try {
      const { file } = await prepareRemisionSoporte(f)
      setFoto(file)
      setFotoPreview(URL.createObjectURL(file))
      setPaso(PASO.CONFIRMAR)
    } catch (err) {
      setError(err.message || 'No se pudo preparar la foto')
    } finally {
      setBusy(false)
    }
  }

  const guardar = async () => {
    if (!puedeCrear) return
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
      if (pkId) fd.append('pk_id', pkId)
      if (placa) fd.append('placa', placa)
      if (conductor) fd.append('transportador', formatNombrePropio(conductor))

      const item = { cantidad_recibida: cantNum }
      if (ocCard?.orden_compra_item_id) item.orden_compra_item_id = ocCard.orden_compra_item_id
      fd.append('items_json', JSON.stringify([item]))
      if (foto) fd.append('remision', foto)

      const r = await api.createEntrada(fd)
      setOkMsg(r?.por_revisar ? `Guardado · por revisar` : 'Guardado')
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
    ? 'Sale escombro'
    : tipo === 'recibo'
      ? 'Llegó material'
      : 'Registrar entrada'

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="entrada-registro-tablet"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: ui.card?.background || '#fff',
        display: 'flex',
        flexDirection: 'column',
        color: ui.text,
      }}
    >
      <CcModalBrandHeader theme={theme} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: `1px solid ${ui.borderColor}`,
        gap: 8,
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
            } else setPaso(tipo === 'disposicion' && paso === PASO.CANTIDAD ? PASO.ESCOMBRERA : PASO.OC)
          }}
          aria-label="Atrás"
        >
          ←
        </button>
        <div style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'center', flex: 1 }}>{headerTitle}</div>
        <button
          type="button"
          style={{ ...ui.btnSecondary, minWidth: 48, minHeight: 48 }}
          onClick={() => onClose?.()}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {error && (
          <div data-testid="entrada-tablet-error" style={{ color: '#b91c1c', marginBottom: 12, fontWeight: 600 }}>{error}</div>
        )}
        {okMsg && (
          <div style={{ color: '#15803d', marginBottom: 12, fontWeight: 800, fontSize: '1.2rem' }}>{okMsg}</div>
        )}

        {paso === PASO.INICIO && (
          <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
            <button
              type="button"
              data-testid="entrada-tablet-recibo"
              style={btnGiant('#16a34a')}
              onClick={() => elegirTipo('recibo')}
            >
              <span style={{ fontSize: '2.4rem' }} aria-hidden>📦</span>
              Llegó material
            </button>
            <button
              type="button"
              data-testid="entrada-tablet-disposicion"
              style={btnGiant('#ea580c')}
              onClick={() => elegirTipo('disposicion')}
            >
              <span style={{ fontSize: '2.4rem' }} aria-hidden>🚚</span>
              Sale escombro
            </button>
          </div>
        )}

        {paso === PASO.OC && (
          <div>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: '1.1rem' }}>¿Cuál orden?</div>
            {loadingOc && <div style={{ color: ui.textMuted }}>Cargando…</div>}
            {!loadingOc && ocs.map((c) => (
              <button
                key={`${c.orden_compra_id}-${c.orden_compra_item_id}`}
                type="button"
                data-testid="entrada-tablet-oc-card"
                style={{ ...cardTouch(ui, false), textAlign: 'left', width: '100%' }}
                onClick={() => elegirOc(c)}
              >
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>🏭 {c.proveedor_nombre || 'Proveedor'}</div>
                <div style={{ fontSize: '1rem' }}>🧱 {c.material_descripcion || 'Material'}</div>
                <div style={{ fontWeight: 700, color: ui.accent }}>
                  Falta {fmtCant(c.saldo_cantidad)} {c.unidad || ''}
                  {c.numero_oc != null ? ` · OC #${c.numero_oc}` : ''}
                </div>
              </button>
            ))}
            <button
              type="button"
              data-testid="entrada-tablet-sin-oc"
              style={{ ...cardTouch(ui, false), textAlign: 'left', width: '100%', borderStyle: 'dashed' }}
              onClick={elegirSinOc}
            >
              <div style={{ fontWeight: 800 }}>📋 Sin orden de compra</div>
              <div style={{ color: ui.textMuted, fontSize: '0.95rem' }}>Quedará por revisar</div>
            </button>
          </div>
        )}

        {paso === PASO.SIN_OC && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontWeight: 800 }}>Proveedor</div>
            <input
              style={inputGiant(ui)}
              placeholder="Buscar o escribir nombre"
              value={proveedorManual ? proveedorNombre : provQuery}
              onChange={(e) => {
                const v = e.target.value
                setProveedorManual(false)
                setProveedorId(null)
                setProvQuery(v)
                setProveedorNombre(v)
              }}
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
              placeholder="Buscar material"
              value={insumoQuery}
              onChange={(e) => setInsumoQuery(e.target.value)}
            />
            {insumoOpts.slice(0, 6).map((row) => {
              const id = row.insumo_id || row.id
              const label = row.label || row.descripcion || row.codigo || String(id)
              return (
                <button
                  key={id}
                  type="button"
                  style={cardTouch(ui, Number(insumoId) === Number(id))}
                  onClick={() => {
                    setInsumoId(id)
                    setInsumoLabel(label)
                    setInsumoUnidad(row.unidad || 'm³')
                    setInsumoQuery(label)
                  }}
                >
                  {label}
                </button>
              )
            })}

            <div style={{ fontWeight: 800, marginTop: 8 }}>Sector (opcional)</div>
            <input
              style={inputGiant(ui)}
              placeholder="PK-ID"
              value={pkId}
              onChange={(e) => setPkId(e.target.value.trim())}
            />

            <button
              type="button"
              style={{ ...ui.btnPrimary, minHeight: 56, fontSize: '1.1rem', marginTop: 8 }}
              disabled={!proveedorNombre.trim() || !insumoId}
              onClick={() => setPaso(PASO.CANTIDAD)}
            >
              Siguiente
            </button>
          </div>
        )}

        {paso === PASO.SECTOR && (
          <div style={{ display: 'grid', gap: 12 }}>
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
          <div style={{ display: 'grid', gap: 12 }}>
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

        {paso === PASO.CANTIDAD && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>
              Cantidad ({insumoUnidad || 'm³'})
            </div>
            {ocCard && (
              <div style={{
                padding: 12,
                borderRadius: 12,
                background: ui.accentSoft || 'rgba(0,119,182,0.12)',
                fontWeight: 700,
              }}
              >
                Saldo OC: {fmtCant(saldoOc)} {ocCard.unidad || ''}
              </div>
            )}
            <input
              inputMode="decimal"
              style={{ ...inputGiant(ui), fontSize: '2rem', textAlign: 'center' }}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
              placeholder="0"
              data-testid="entrada-tablet-cantidad"
            />
            {superaSaldo && (
              <div style={{ color: '#b45309', fontWeight: 700 }}>⚠ Supera saldo · se guarda por revisar</div>
            )}
            <button
              type="button"
              style={{ ...ui.btnPrimary, minHeight: 56, fontSize: '1.1rem' }}
              disabled={!(cantNum > 0)}
              onClick={() => setPaso(PASO.PLACA)}
            >
              Siguiente
            </button>
          </div>
        )}

        {paso === PASO.PLACA && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800 }}>Placa</div>
            <input
              style={{ ...inputGiant(ui), textTransform: 'uppercase', letterSpacing: 2 }}
              value={placa}
              onChange={(e) => { void onPlacaChange(e.target.value) }}
              placeholder="AAA-000"
              data-testid="entrada-tablet-placa"
              autoCapitalize="characters"
            />
            {placaOpts.slice(0, 5).map((r) => (
              <button
                key={r.placa}
                type="button"
                style={cardTouch(ui, false)}
                onClick={() => {
                  setPlaca(formatPlacaInput(r.placa))
                  setConductor(formatNombrePropio(r.nombre))
                  setVehiculoNuevo(false)
                }}
              >
                🚛 {formatPlacaInput(r.placa)} · {formatNombrePropio(r.nombre)}
              </button>
            ))}
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
            {vehiculoNuevo && placaValida(placa) && (
              <div style={{ color: '#b45309', fontWeight: 700 }}>Vehículo nuevo · por revisar</div>
            )}
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

        {paso === PASO.FOTO && (
          <div style={{ display: 'grid', gap: 16, justifyItems: 'center', marginTop: 24 }}>
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFoto} />
            <button
              type="button"
              data-testid="entrada-tablet-foto"
              style={btnGiant('#0077B6')}
              disabled={busy}
              onClick={() => camRef.current?.click()}
            >
              <span style={{ fontSize: '2.6rem' }} aria-hidden>📷</span>
              Tomar foto
            </button>
            <button
              type="button"
              style={{ ...ui.btnSecondary, minHeight: 52, width: '100%' }}
              onClick={() => {
                setFoto(null)
                setFotoPreview('')
                setPaso(PASO.CONFIRMAR)
              }}
            >
              Sin foto (por revisar)
            </button>
          </div>
        )}

        {paso === PASO.CONFIRMAR && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>Confirmar</div>
            <div style={cardTouch(ui, false)}>
              <div>🧱 {insumoLabel || 'Material'}</div>
              <div>🏭 {proveedorNombre || '—'}</div>
              <div style={{ fontWeight: 800 }}>{fmtCant(cantNum)} {insumoUnidad}</div>
              <div>🚛 {placa} · {conductor}</div>
              {fotoPreview ? (
                <img src={fotoPreview} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginTop: 8 }} />
              ) : (
                <div style={{ color: '#b45309', fontWeight: 700 }}>Sin foto</div>
              )}
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
              style={btnGiant('#16a34a')}
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
  )
}
