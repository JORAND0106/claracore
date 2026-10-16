import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClaraViewport } from '../../useClaraViewport'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { downloadSicoeRegistrosExcel } from './sicoeExportExcel.js'
import {
  chipValidacionNivel,
  nivelMaximoAprobado,
} from './sicoeCantidadesGrillaHelpers.js'
import {
  pastelDeEstadoValidacion,
  estadoNivelRegistro,
} from './sicoeReporteItemsTablaHelpers.js'
import { sicoeMedicionCeldasDisplay } from './sicoeVarilla.js'
import { formatearCantidadTotal, formatearDimension } from './sicoeCantidadRedondeo.js'
import {
  sicoeConstruirArbolEjecucion,
  sicoeFilasExcelEjecucion,
} from './sicoeEjecucionConsolidadaHelpers.js'

const SHEET_CELL_BORDER = '#94a3b8'

function fmtCant(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return formatearCantidadTotal(n, { locale: true })
}

function fmtDim(v) {
  if (v == null || v === '' || v === '—') return '—'
  if (typeof v === 'string' && Number.isNaN(Number(v))) return v
  return formatearDimension(v) ?? '—'
}

function fmtPesos(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `$ ${Math.round(n).toLocaleString('es-CO')}`
}

function fmtVu(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `$ ${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
}

function IconBtn({ title, onClick, disabled, t, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        background: 'transparent',
        color: t.text,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Vista consolidada tipo informe mensual de ejecución (Tramo → Capítulo → Ítem → registros).
 */
export default function SicoeEjecucionConsolidadaVista({
  t,
  contratoId,
  token,
  API_URL,
  nivelInfo,
  nivelesContrato,
  busquedaActiva = false,
  buildFiltrosParams,
  onAbrirRegistro,
  onValidarRapido,
  ejecutandoValidacion = false,
  refreshNonce = 0,
  filtrosVersion = 0,
  exportMeta = {},
}) {
  const { isMobile: vpMobile, isLandscapeMobile } = useClaraViewport()
  const vistaCompacta = vpMobile || isLandscapeMobile
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [expandTramos, setExpandTramos] = useState(() => new Set())
  const [expandCaps, setExpandCaps] = useState(() => new Set())
  const [expandItems, setExpandItems] = useState(() => new Set())
  /** Nivel de agrupación tipo Excel: 1 Tramos · 2 +Capítulos · 3 +Ítems · 4 +Registros. null = mezcla manual. */
  const [nivelAgrupacion, setNivelAgrupacion] = useState(3)
  const [confirmReg, setConfirmReg] = useState(null)
  const [exportando, setExportando] = useState(false)
  const [validandoId, setValidandoId] = useState(null)
  const expandInitRef = useRef(false)
  const scrollRef = useRef(null)

  const nivelesActivos = Array.isArray(nivelesContrato?.niveles_activos)
    ? nivelesContrato.niveles_activos
    : [1, 2, 3]
  const nvUsuario = Number(nivelInfo?.nivelValidacion) || null

  const aplicarExpandDefault = useCallback((regs) => {
    const arbolTmp = sicoeConstruirArbolEjecucion(regs || [])
    setExpandTramos(new Set(arbolTmp.tramos.map((x) => x.key)))
    setExpandCaps(new Set(arbolTmp.tramos.flatMap((tr) => tr.capitulos.map((c) => c.key))))
    setExpandItems(new Set())
    setNivelAgrupacion(3)
  }, [])

  const abortRef = useRef(null)
  const [ultimaCargaMs, setUltimaCargaMs] = useState(null)

  const cargar = useCallback(async () => {
    if (!contratoId || !token || !busquedaActiva) {
      setPayload(null)
      setError(null)
      expandInitRef.current = false
      setUltimaCargaMs(null)
      return
    }
    if (typeof buildFiltrosParams !== 'function') return
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setCargando(true)
    setError(null)
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    try {
      const params = buildFiltrosParams()
      if (!params || ![...params.keys()].length) {
        setPayload({ ok: true, total: 0, registros: [], ocultar_costo_directo: false })
        setUltimaCargaMs(0)
        return
      }
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/cantidades-por-item?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (ac.signal.aborted) return
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`)
      setPayload(data)
      const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0)
      setUltimaCargaMs(ms)
      if (typeof window !== 'undefined') {
        console.info(`[SicoeObra] Ejecución consolidada cargada en ${ms} ms`)
      }
      if (!expandInitRef.current) {
        aplicarExpandDefault(data?.registros || [])
        expandInitRef.current = true
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
      setPayload(null)
      setError(e?.message || String(e))
      setUltimaCargaMs(null)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      if (!ac.signal.aborted) setCargando(false)
    }
  }, [API_URL, contratoId, token, busquedaActiva, buildFiltrosParams, aplicarExpandDefault])

  useEffect(() => {
    // Cambio de filtros → reiniciar expansión por defecto.
    expandInitRef.current = false
  }, [filtrosVersion])

  useEffect(() => {
    void cargar()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [cargar, refreshNonce, filtrosVersion])

  const arbol = useMemo(
    () =>
      sicoeConstruirArbolEjecucion(payload?.registros || [], {
        nivelesActivos,
        payloadVu: payload?.vlr_unitario_listado,
      }),
    [payload, nivelesActivos],
  )

  const verEco = !!nivelInfo?.verValoresEconomicos && !payload?.ocultar_costo_directo
  const sheetGrid = t.sheetGridBorder || SHEET_CELL_BORDER

  const th = {
    padding: vistaCompacta ? '4px 5px' : '6px 7px',
    fontSize: 10,
    fontWeight: 800,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
    border: `1px solid ${sheetGrid}`,
    background: t.headerBg || t.bg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }
  const td = {
    padding: vistaCompacta ? '4px 5px' : '5px 7px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    border: `1px solid ${sheetGrid}`,
    verticalAlign: 'middle',
    lineHeight: 1.25,
  }

  const toggleSet = (setter, key) => {
    setNivelAgrupacion(null)
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const keysArbol = useMemo(() => {
    const tramos = arbol.tramos.map((x) => x.key)
    const caps = arbol.tramos.flatMap((tr) => tr.capitulos.map((c) => c.key))
    const items = arbol.tramos.flatMap((tr) =>
      tr.capitulos.flatMap((c) => c.items.map((it) => it.key)),
    )
    return { tramos, caps, items }
  }, [arbol])

  const aplicarNivelAgrupacion = useCallback((nivel) => {
    const n = Number(nivel)
    if (n === 1) {
      setExpandTramos(new Set())
      setExpandCaps(new Set())
      setExpandItems(new Set())
    } else if (n === 2) {
      setExpandTramos(new Set(keysArbol.tramos))
      setExpandCaps(new Set())
      setExpandItems(new Set())
    } else if (n === 3) {
      setExpandTramos(new Set(keysArbol.tramos))
      setExpandCaps(new Set(keysArbol.caps))
      setExpandItems(new Set())
    } else if (n === 4) {
      setExpandTramos(new Set(keysArbol.tramos))
      setExpandCaps(new Set(keysArbol.caps))
      setExpandItems(new Set(keysArbol.items))
    } else {
      return
    }
    setNivelAgrupacion(n)
  }, [keysArbol])

  const expandirTodo = () => {
    aplicarNivelAgrupacion(4)
  }
  const contraerTodo = () => {
    aplicarNivelAgrupacion(1)
  }
  const restablecerVista = () => {
    aplicarExpandDefault(payload?.registros || [])
  }

  const colSpanMain = 6 + (verEco ? 2 : 0)

  const NIVELES_AGRUPACION = [
    { n: 1, title: 'Nivel 1 — Solo tramos (con subtotales)' },
    { n: 2, title: 'Nivel 2 — Tramos y capítulos' },
    { n: 3, title: 'Nivel 3 — Tramos, capítulos e ítems' },
    { n: 4, title: 'Nivel 4 — Todo, incluidos los registros' },
  ]

  const descargarExcel = async () => {
    if (!arbol.tramos.length) return
    setExportando(true)
    try {
      const { headers, rows } = sicoeFilasExcelEjecucion(arbol, {
        verEco,
        incluirRegistros: true,
      })
      await downloadSicoeRegistrosExcel({
        meta: exportMeta || {},
        headers,
        bodyRows: rows,
        filename: `sicoe_ejecucion_consolidada_${contratoId || ''}.xlsx`,
      })
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setExportando(false)
    }
  }

  const patchRegistroLocal = useCallback((regId, patch) => {
    setPayload((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        registros: (prev.registros || []).map((r) =>
          String(r.id) === String(regId) ? { ...r, ...patch } : r,
        ),
      }
    })
  }, [])

  const validarDesdeSubtabla = async (reg, estado) => {
    if (!reg?.id || !onValidarRapido) return
    setValidandoId(reg.id)
    try {
      const ok = await onValidarRapido(reg, estado, { sinRefreshVista: true })
      if (ok && nvUsuario >= 1 && nvUsuario <= 6) {
        patchRegistroLocal(reg.id, { [`nivel${nvUsuario}_estado`]: estado })
      }
    } finally {
      setValidandoId(null)
    }
  }

  const puedeValidarFila = (reg) =>
    !!nivelInfo?.puedeValidar &&
    nvUsuario >= 1 &&
    nvUsuario <= 6 &&
    !reg?.bloqueado &&
    !!String(reg?.item_numero || '').trim()

  const chipValidacionUi = (chip) => {
    const pastel = pastelDeEstadoValidacion(chip.estado)
    return (
      <span
        key={`${chip.estado}-${chip.nivel}-${chip.label}`}
        title={`${chip.count} registro(s): ${chip.estado}${chip.nivel != null ? ` en N${chip.nivel}` : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 6px',
          borderRadius: 10,
          fontSize: 10,
          fontWeight: 800,
          background: pastel.bg,
          color: pastel.color || t.text,
          border: `1px solid ${pastel.border || 'transparent'}`,
          whiteSpace: 'nowrap',
        }}
      >
        {chip.count}·{chip.label}
        {chip.estado !== 'Aprobado' && chip.estado !== 'No Revisado' ? ` ${chip.estado.slice(0, 4)}` : ''}
      </span>
    )
  }

  const rowOpenStyle = (open) => ({
    cursor: 'pointer',
    background: open
      ? `color-mix(in srgb, ${t.primary || '#0077B6'} 12%, ${t.bgCard || '#fff'})`
      : undefined,
    boxShadow: open ? `inset 3px 0 0 ${t.primary || '#0077B6'}` : undefined,
  })

  if (!busquedaActiva) {
    return (
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 800, color: t.text, marginBottom: 6 }}>Ejecución consolidada</div>
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
          Defina criterios en <strong style={{ color: t.text }}>Filtros</strong> y ejecute la búsqueda
          para ver la consolidación por tramo, capítulo e ítem.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} ref={scrollRef}>
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
            Ejecución consolidada
          </div>
          <div style={{ marginTop: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Clic en la fila para desplegar · agrupación por capítulo efectivo del ítem.
            {arbol.totalItems > 0 && (
              <> · {arbol.totalItems} ítem(s) · {arbol.totalRegistros} registro(s)</>
            )}
            {(arbol.itemsSinPrecio || []).length > 0 && (
              <span style={{ color: '#b45309', fontWeight: 700 }}>
                {' '}· {(arbol.itemsSinPrecio || []).length} ítem(s) sin precio en Listado
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Niveles de agrupación"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              overflow: 'hidden',
              background: t.bg || t.bgCard,
            }}
          >
            {NIVELES_AGRUPACION.map(({ n, title }) => {
              const activo = nivelAgrupacion === n
              return (
                <button
                  key={n}
                  type="button"
                  title={title}
                  aria-label={title}
                  aria-pressed={activo}
                  disabled={!arbol.tramos.length}
                  onClick={() => aplicarNivelAgrupacion(n)}
                  style={{
                    width: vistaCompacta ? 36 : 32,
                    height: vistaCompacta ? 36 : 32,
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    borderRight: n < 4 ? `1px solid ${t.border}` : 'none',
                    background: activo ? (t.primary || '#0077B6') : 'transparent',
                    color: activo ? '#fff' : t.text,
                    fontWeight: 800,
                    fontSize: 'var(--cc-sm)',
                    cursor: !arbol.tramos.length ? 'not-allowed' : 'pointer',
                    opacity: !arbol.tramos.length ? 0.45 : 1,
                    lineHeight: 1,
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <IconBtn t={t} title="Desplegar todos los niveles" onClick={expandirTodo} disabled={!arbol.tramos.length}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M12 6.5L14 8l-2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconBtn>
          <IconBtn t={t} title="Contraer todos los niveles" onClick={contraerTodo} disabled={!arbol.tramos.length}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h8M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 6.5L12 8l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconBtn>
          <IconBtn
            t={t}
            title="Restablecer vista (como al abrir)"
            onClick={restablecerVista}
            disabled={!arbol.tramos.length}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3.5 8a4.5 4.5 0 1 0 1.2-3.1"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path d="M3 3.5v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconBtn>
          <button
            type="button"
            disabled={exportando || !arbol.tramos.length}
            onClick={() => void descargarExcel()}
            title="Descargar Excel de la vista consolidada (filtros activos)"
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: vistaCompacta ? '8px 12px' : '7px 12px',
              fontWeight: 800,
              fontSize: 'var(--cc-sm)',
              cursor: exportando || !arbol.tramos.length ? 'not-allowed' : 'pointer',
              opacity: exportando || !arbol.tramos.length ? 0.55 : 1,
              minHeight: 36,
            }}
          >
            {exportando ? '…' : '⬇ Excel'}
          </button>
        </div>
      </div>

      {cargando && (
        <div style={{ padding: '10px 14px', color: t.textMuted, fontSize: 'var(--cc-sm)' }} aria-live="polite">
          Cargando consolidada…
        </div>
      )}
      {!cargando && ultimaCargaMs != null && (
        <div style={{ padding: '0 4px 4px', color: t.textMuted, fontSize: 11 }} aria-hidden>
          {ultimaCargaMs} ms
        </div>
      )}
      {error && (
        <div style={{ padding: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 8, fontSize: 'var(--cc-sm)' }}>
          {error}
        </div>
      )}

      {!cargando && !error && arbol.tramos.length === 0 && (
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, color: t.textMuted }}>
          No hay registros con ítem para los filtros activos.
        </div>
      )}

      {!cargando && arbol.tramos.length > 0 && (
        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            overflow: 'auto',
            maxHeight: vistaCompacta ? '70vh' : '75vh',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: vistaCompacta ? 680 : 820,
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...th, width: vistaCompacta ? '14%' : '13%', textAlign: 'left' }}>Tramo</th>
                <th style={{ ...th, width: vistaCompacta ? '12%' : '12%', textAlign: 'left' }}>Capítulo</th>
                <th style={{ ...th, width: '7%', textAlign: 'left' }}>Ítem</th>
                <th style={{ ...th, width: vistaCompacta ? '18%' : '16%', textAlign: 'left' }}>Descripción</th>
                <th style={{ ...th, width: '6%', textAlign: 'center' }}>Und</th>
                {verEco && (
                  <th style={{ ...th, width: '12%', textAlign: 'right' }}>Vlr unitario</th>
                )}
                <th style={{ ...th, width: '11%', textAlign: 'right' }}>Cantidad</th>
                {verEco && (
                  <th style={{ ...th, width: '13%', textAlign: 'right' }}>Costo Directo</th>
                )}
              </tr>
            </thead>
            <tbody>
              {arbol.tramos.map((tr) => {
                const trOpen = expandTramos.has(tr.key)
                return (
                  <FragmentTramo
                    key={tr.key}
                    tr={tr}
                    trOpen={trOpen}
                    expandCaps={expandCaps}
                    expandItems={expandItems}
                    toggleTramo={() => toggleSet(setExpandTramos, tr.key)}
                    toggleCap={(k) => toggleSet(setExpandCaps, k)}
                    toggleItem={(k) => toggleSet(setExpandItems, k)}
                    verEco={verEco}
                    td={td}
                    th={th}
                    sheetGrid={sheetGrid}
                    t={t}
                    colSpanMain={colSpanMain}
                    chipValidacionUi={chipValidacionUi}
                    nivelesActivos={nivelesActivos}
                    rowOpenStyle={rowOpenStyle}
                    puedeValidarFila={puedeValidarFila}
                    nvUsuario={nvUsuario}
                    validandoId={validandoId}
                    ejecutandoValidacion={ejecutandoValidacion || validandoId != null}
                    onValidar={validarDesdeSubtabla}
                    onClickRegistro={(reg) => setConfirmReg(reg)}
                    vistaCompacta={vistaCompacta}
                  />
                )
              })}
              <tr>
                <td
                  colSpan={colSpanMain - (verEco ? 2 : 1)}
                  style={{
                    ...td,
                    fontWeight: 900,
                    background: t.headerBg || t.bg,
                    textAlign: 'right',
                  }}
                >
                  TOTAL GENERAL
                </td>
                <td style={{ ...td, fontWeight: 900, textAlign: 'right', background: t.headerBg || t.bg }}>
                  {fmtCant(arbol.totalCantidad)}
                </td>
                {verEco && (
                  <td style={{ ...td, fontWeight: 900, textAlign: 'right', background: t.headerBg || t.bg, color: '#0F6E56' }}>
                    {fmtPesos(arbol.totalCosto)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {confirmReg && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10800,
            background: t.overlay || 'rgba(15, 23, 42, 0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setConfirmReg(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sicoe-ejec-abrir-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: t.bgCard || t.bg || '#fff',
              border: `1px solid ${t.border || SHEET_CELL_BORDER}`,
              borderRadius: 14,
              boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
              overflow: 'hidden',
              color: t.text,
            }}
          >
            <CcModalBrandHeader theme={t} />
            <div style={{ padding: '16px 20px 8px' }}>
              <div id="sicoe-ejec-abrir-title" style={{ fontSize: 'var(--cc-h3)', fontWeight: 700, marginBottom: 8 }}>
                Abrir
              </div>
              <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
                Reporte #{confirmReg.numero_reporte ?? '—'} · Registro #{confirmReg.numero_registro ?? confirmReg.id}
                {' · '}
                Ítem {confirmReg.item_numero || '—'}
              </p>
            </div>
            <div
              style={{
                padding: '12px 20px 16px',
                display: 'flex',
                justifyContent: vistaCompacta ? 'stretch' : 'flex-end',
                gap: 8,
                flexWrap: 'wrap',
                flexDirection: vistaCompacta ? 'column-reverse' : 'row',
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmReg(null)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: vistaCompacta ? '12px 14px' : '8px 14px',
                  minHeight: vistaCompacta ? 44 : undefined,
                  cursor: 'pointer',
                  color: t.textMuted,
                  fontWeight: 600,
                  fontSize: 'var(--cc-sm)',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                title="Abre solo este registro (datos, fotos, gráfico, planilla y adjuntos)"
                onClick={() => {
                  const reg = confirmReg
                  setConfirmReg(null)
                  onAbrirRegistro?.(reg, { soloRegistro: true })
                }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.primary}`,
                  borderRadius: 8,
                  padding: vistaCompacta ? '12px 14px' : '8px 14px',
                  minHeight: vistaCompacta ? 44 : undefined,
                  cursor: 'pointer',
                  color: t.primary,
                  fontWeight: 800,
                  fontSize: 'var(--cc-sm)',
                }}
              >
                Registro
              </button>
              <button
                type="button"
                title="Abre el reporte completo con todos sus registros"
                onClick={() => {
                  const reg = confirmReg
                  setConfirmReg(null)
                  onAbrirRegistro?.(reg, { soloRegistro: false })
                }}
                style={{
                  background: t.primary,
                  border: 'none',
                  borderRadius: 8,
                  padding: vistaCompacta ? '12px 14px' : '8px 14px',
                  minHeight: vistaCompacta ? 44 : undefined,
                  cursor: 'pointer',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 'var(--cc-sm)',
                }}
              >
                Reporte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentTramo({
  tr,
  trOpen,
  expandCaps,
  expandItems,
  toggleTramo,
  toggleCap,
  toggleItem,
  verEco,
  td,
  th,
  sheetGrid,
  t,
  colSpanMain,
  chipValidacionUi,
  nivelesActivos,
  rowOpenStyle,
  puedeValidarFila,
  nvUsuario,
  validandoId,
  ejecutandoValidacion,
  onValidar,
  onClickRegistro,
  vistaCompacta,
}) {
  return (
    <>
      <tr
        onClick={toggleTramo}
        style={rowOpenStyle(trOpen)}
        title={trOpen ? 'Contraer tramo' : 'Desplegar tramo'}
        aria-expanded={trOpen}
      >
        <td style={{ ...td, fontWeight: 900 }} colSpan={4}>
          {tr.tramo}
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: t.textMuted }}>
            {trOpen ? 'desplegado' : 'clic para desplegar'}
          </span>
        </td>
        <td style={{ ...td, textAlign: 'center', color: t.textMuted }}>—</td>
        {verEco && <td style={{ ...td, textAlign: 'right', color: t.textMuted }}>—</td>}
        <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtCant(tr.cantidad)}</td>
        {verEco && (
          <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtPesos(tr.costo)}</td>
        )}
      </tr>
      {trOpen &&
        tr.capitulos.map((cap) => {
          const capOpen = expandCaps.has(cap.key)
          return (
            <FragmentCapitulo
              key={cap.key}
              tr={tr}
              cap={cap}
              capOpen={capOpen}
              expandItems={expandItems}
              toggleCap={() => toggleCap(cap.key)}
              toggleItem={toggleItem}
              verEco={verEco}
              td={td}
              th={th}
              sheetGrid={sheetGrid}
              t={t}
              colSpanMain={colSpanMain}
              chipValidacionUi={chipValidacionUi}
              nivelesActivos={nivelesActivos}
              rowOpenStyle={rowOpenStyle}
              puedeValidarFila={puedeValidarFila}
              nvUsuario={nvUsuario}
              validandoId={validandoId}
              ejecutandoValidacion={ejecutandoValidacion}
              onValidar={onValidar}
              onClickRegistro={onClickRegistro}
              vistaCompacta={vistaCompacta}
            />
          )
        })}
    </>
  )
}

function FragmentCapitulo({
  tr,
  cap,
  capOpen,
  expandItems,
  toggleCap,
  toggleItem,
  verEco,
  td,
  th,
  sheetGrid,
  t,
  colSpanMain,
  chipValidacionUi,
  nivelesActivos,
  rowOpenStyle,
  puedeValidarFila,
  nvUsuario,
  validandoId,
  ejecutandoValidacion,
  onValidar,
  onClickRegistro,
  vistaCompacta,
}) {
  return (
    <>
      <tr
        onClick={toggleCap}
        style={rowOpenStyle(capOpen)}
        title={capOpen ? 'Contraer capítulo' : 'Desplegar capítulo'}
        aria-expanded={capOpen}
      >
        <td style={{ ...td, color: t.textMuted, fontSize: 11 }}>{tr.tramo}</td>
        <td style={{ ...td, fontWeight: 800 }} colSpan={3}>
          {cap.capitulo}
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: t.textMuted }}>
            {capOpen ? 'desplegado' : 'clic para desplegar'}
          </span>
        </td>
        <td style={{ ...td, textAlign: 'center', color: t.textMuted }}>—</td>
        {verEco && <td style={{ ...td, textAlign: 'right', color: t.textMuted }}>—</td>}
        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtCant(cap.cantidad)}</td>
        {verEco && (
          <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtPesos(cap.costo)}</td>
        )}
      </tr>
      {capOpen &&
        cap.items.map((it) => {
          const itOpen = expandItems.has(it.key)
          return (
            <FragmentItem
              key={it.key}
              tr={tr}
              cap={cap}
              it={it}
              itOpen={itOpen}
              toggleItem={() => toggleItem(it.key)}
              verEco={verEco}
              td={td}
              th={th}
              sheetGrid={sheetGrid}
              t={t}
              colSpanMain={colSpanMain}
              chipValidacionUi={chipValidacionUi}
              nivelesActivos={nivelesActivos}
              rowOpenStyle={rowOpenStyle}
              puedeValidarFila={puedeValidarFila}
              nvUsuario={nvUsuario}
              validandoId={validandoId}
              ejecutandoValidacion={ejecutandoValidacion}
              onValidar={onValidar}
              onClickRegistro={onClickRegistro}
              vistaCompacta={vistaCompacta}
            />
          )
        })}
    </>
  )
}

function FragmentItem({
  tr,
  cap,
  it,
  itOpen,
  toggleItem,
  verEco,
  td,
  th,
  sheetGrid,
  t,
  colSpanMain,
  chipValidacionUi,
  nivelesActivos,
  rowOpenStyle,
  puedeValidarFila,
  nvUsuario,
  validandoId,
  ejecutandoValidacion,
  onValidar,
  onClickRegistro,
  vistaCompacta,
}) {
  return (
    <>
      <tr
        onClick={toggleItem}
        style={rowOpenStyle(itOpen)}
        title={itOpen ? 'Ocultar registros' : 'Ver registros del ítem'}
        aria-expanded={itOpen}
      >
        <td style={{ ...td, color: t.textMuted, fontSize: 11 }}>{tr.tramo}</td>
        <td style={{ ...td, color: t.textMuted, fontSize: 11 }}>{cap.capitulo}</td>
        <td style={{ ...td, fontWeight: 800 }}>{it.item_numero}</td>
        <td style={{ ...td, paddingTop: 4, paddingBottom: 4 }}>
          <div
            title={it.descripcion || undefined}
            style={{
              fontSize: 11,
              lineHeight: 1.3,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              color: t.text,
            }}
          >
            {it.descripcion || '—'}
          </div>
          {it.sin_precio_listado && (
            <div
              title="Sin precio en Listado de Precios para este capítulo e ítem"
              style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: '#b45309' }}
            >
              ⚠ Sin precio en Listado
            </div>
          )}
          {(it.validacion?.chips || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {it.validacion.chips.map((ch) => chipValidacionUi(ch))}
            </div>
          )}
        </td>
        <td style={{ ...td, textAlign: 'center' }}>{it.unidad || '—'}</td>
        {verEco && (
          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {it.sin_precio_listado ? (
              <span
                title="Sin precio en Listado de Precios para este capítulo e ítem"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: '#b45309',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                <span aria-hidden>⚠</span> Sin precio
              </span>
            ) : (
              fmtVu(it.vlr_unitario)
            )}
          </td>
        )}
        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtCant(it.cantidad)}
        </td>
        {verEco && (
          <td
            style={{
              ...td,
              textAlign: 'right',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: it.sin_precio_listado ? '#b45309' : undefined,
            }}
            title={it.sin_precio_listado ? 'Sin precio en Listado de Precios — no se valora como $0 normal' : undefined}
          >
            {it.sin_precio_listado ? '—' : fmtPesos(it.costo)}
          </td>
        )}
      </tr>
      {itOpen && (
        <tr>
          <td colSpan={colSpanMain} style={{ padding: 0, border: `1px solid ${sheetGrid}`, background: t.bg || t.bgCard }}>
            <SubtablaRegistros
              registros={it.registros}
              verEco={verEco}
              t={t}
              th={th}
              sheetGrid={sheetGrid}
              nivelesActivos={nivelesActivos}
              puedeValidarFila={puedeValidarFila}
              nvUsuario={nvUsuario}
              validandoId={validandoId}
              ejecutandoValidacion={ejecutandoValidacion}
              onValidar={onValidar}
              onClickRegistro={onClickRegistro}
              vistaCompacta={vistaCompacta}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function SubtablaRegistros({
  registros,
  verEco,
  t,
  th,
  sheetGrid,
  nivelesActivos,
  puedeValidarFila,
  nvUsuario,
  validandoId,
  ejecutandoValidacion,
  onValidar,
  onClickRegistro,
  vistaCompacta,
}) {
  const tdS = {
    padding: vistaCompacta ? '3px 5px' : '4px 6px',
    fontSize: 11,
    color: t.text,
    border: `1px solid ${sheetGrid}`,
    verticalAlign: 'middle',
    lineHeight: 1.2,
  }
  const num = { ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '6px 8px 10px', overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: verEco ? 780 : 680,
          tableLayout: 'auto',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Reporte</th>
            <th style={{ ...th, textAlign: 'left' }}>Registro</th>
            <th style={{ ...th, textAlign: 'right' }}>Longitud</th>
            <th style={{ ...th, textAlign: 'right' }} title="Ancho o Diámetro Ø (varilla)">Ancho/Ø</th>
            <th style={{ ...th, textAlign: 'right' }} title="Espesor o Peso kg/m (varilla)">Esp./kg/m</th>
            <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
            <th style={{ ...th, textAlign: 'right' }}>Cant. Total</th>
            {verEco && <th style={{ ...th, textAlign: 'right' }}>Costo directo</th>}
            <th style={{ ...th, textAlign: 'left' }}>Validación</th>
            <th style={{ ...th, textAlign: 'left' }}>Último nivel aprobado</th>
          </tr>
        </thead>
        <tbody>
          {(registros || []).map((reg) => {
            const cel = sicoeMedicionCeldasDisplay(reg)
            const chip = chipValidacionNivel(reg, nivelesActivos)
            const pastel = pastelDeEstadoValidacion(chip.estado)
            const maxApr = nivelMaximoAprobado(reg, nivelesActivos)
            const estMi = nvUsuario ? estadoNivelRegistro(reg, nvUsuario) : 'No Revisado'
            const puede = puedeValidarFila(reg)
            const busy = ejecutandoValidacion || String(validandoId) === String(reg.id)
            return (
              <tr
                key={reg.id}
                onClick={() => onClickRegistro?.(reg)}
                style={{ cursor: 'pointer' }}
                title="Abrir registro"
              >
                <td style={{ ...tdS, fontWeight: 700 }}>#{reg.numero_reporte ?? '—'}</td>
                <td style={{ ...tdS, fontWeight: 700 }}>#{reg.numero_registro ?? reg.id}</td>
                <td style={num}>{fmtDim(reg.longitud)}</td>
                <td style={num} title={cel.esVarilla ? 'Diámetro Ø' : 'Ancho'}>
                  {cel.esVarilla ? (cel.col2 || '—') : fmtDim(cel.col2)}
                </td>
                <td style={num} title={cel.esVarilla ? 'Peso kg/m' : 'Espesor'}>
                  {cel.esVarilla ? (cel.col3 || '—') : fmtDim(cel.col3)}
                </td>
                <td style={num}>{fmtDim(reg.cantidad)}</td>
                <td style={{ ...num, fontWeight: 700 }}>
                  {fmtCant(reg._cant_efectiva ?? reg.cantidad_total)}
                </td>
                {verEco && (
                  <td style={{ ...num, fontWeight: 700 }}>
                    {fmtPesos(reg._costo_efectivo)}
                  </td>
                )}
                <td style={tdS} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span
                      title={chip.tooltip}
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 5,
                        background: pastel.bg !== 'transparent' ? pastel.bg : `${t.textMuted}18`,
                        border: pastel.border !== 'transparent'
                          ? `1px solid ${pastel.border}`
                          : `1px solid ${t.border}`,
                        color: pastel.color || t.textMuted,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chip.label}
                    </span>
                    {puede && (
                      <>
                        <button
                          type="button"
                          disabled={busy || estMi === 'Aprobado'}
                          title="Aprobar en mi nivel"
                          onClick={() => onValidar?.(reg, 'Aprobado')}
                          style={btnVal('#16a34a', busy || estMi === 'Aprobado')}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          disabled={busy || estMi === 'Pendiente'}
                          title="Pendiente en mi nivel"
                          onClick={() => onValidar?.(reg, 'Pendiente')}
                          style={btnVal('#d97706', busy || estMi === 'Pendiente')}
                        >
                          ⏸
                        </button>
                        <button
                          type="button"
                          disabled={busy || estMi === 'Rechazado'}
                          title="Rechazar en mi nivel"
                          onClick={() => onValidar?.(reg, 'Rechazado')}
                          style={btnVal('#dc2626', busy || estMi === 'Rechazado')}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  {maxApr != null ? (
                    <span style={{ fontWeight: 800, color: '#166534' }}>N{maxApr}</span>
                  ) : (
                    <span style={{ color: t.textMuted }}>Sin aprobación</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function btnVal(bg, disabled) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    width: 24,
    height: 22,
    padding: 0,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }
}
