import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClaraViewport } from '../../useClaraViewport'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { downloadSicoeRegistrosExcel } from './sicoeExportExcel.js'
import { chipValidacionNivel } from './sicoeCantidadesGrillaHelpers.js'
import { pastelDeEstadoValidacion } from './sicoeReporteItemsTablaHelpers.js'
import { formatearCantidadTotal } from './sicoeCantidadRedondeo.js'
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
  const [confirmReg, setConfirmReg] = useState(null)
  const [exportando, setExportando] = useState(false)
  const scrollRef = useRef(null)

  const nivelesActivos = Array.isArray(nivelesContrato?.niveles_activos)
    ? nivelesContrato.niveles_activos
    : [1, 2, 3]

  const cargar = useCallback(async () => {
    if (!contratoId || !token || !busquedaActiva) {
      setPayload(null)
      setError(null)
      return
    }
    if (typeof buildFiltrosParams !== 'function') return
    setCargando(true)
    setError(null)
    try {
      const params = buildFiltrosParams()
      if (!params || ![...params.keys()].length) {
        setPayload({ ok: true, total: 0, registros: [], ocultar_costo_directo: false })
        return
      }
      const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/cantidades-por-item?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `Error ${res.status}`)
      setPayload(data)
      // Por defecto: tramos y capítulos abiertos; ítems recogidos.
      const regs = data?.registros || []
      const arbolTmp = sicoeConstruirArbolEjecucion(regs)
      setExpandTramos(new Set(arbolTmp.tramos.map((x) => x.key)))
      setExpandCaps(new Set(arbolTmp.tramos.flatMap((tr) => tr.capitulos.map((c) => c.key))))
      setExpandItems(new Set())
    } catch (e) {
      setPayload(null)
      setError(e?.message || String(e))
    } finally {
      setCargando(false)
    }
  }, [API_URL, contratoId, token, busquedaActiva, buildFiltrosParams])

  useEffect(() => {
    void cargar()
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
    padding: vistaCompacta ? '5px 6px' : '7px 8px',
    fontSize: 11,
    fontWeight: 800,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    border: `1px solid ${sheetGrid}`,
    background: t.headerBg || t.bg,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }
  const td = {
    padding: vistaCompacta ? '5px 6px' : '6px 8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    border: `1px solid ${sheetGrid}`,
    verticalAlign: 'middle',
    lineHeight: 1.25,
  }

  const toggleSet = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const colSpan = 6 + (verEco ? 2 : 0)

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
          padding: '1px 7px',
          borderRadius: 10,
          fontSize: 11,
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
        <div>
          <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: t.text }}>
            Ejecución consolidada
          </div>
          <div style={{ marginTop: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Tramo → Capítulo → Ítem · mismos filtros y costos que el informe mensual.
            {arbol.totalItems > 0 && (
              <> · {arbol.totalItems} ítem(s) · {arbol.totalRegistros} registro(s)</>
            )}
          </div>
        </div>
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
            padding: vistaCompacta ? '10px 14px' : '8px 14px',
            fontWeight: 800,
            fontSize: 'var(--cc-sm)',
            cursor: exportando || !arbol.tramos.length ? 'not-allowed' : 'pointer',
            opacity: exportando || !arbol.tramos.length ? 0.55 : 1,
            minHeight: vistaCompacta ? 44 : undefined,
          }}
        >
          {exportando ? 'Exportando…' : '⬇ Excel'}
        </button>
      </div>

      {cargando && (
        <div style={{ padding: 16, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando…</div>
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
              minWidth: vistaCompacta ? 720 : 880,
              tableLayout: 'fixed',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...th, width: vistaCompacta ? 120 : 140, textAlign: 'left' }}>Tramo</th>
                <th style={{ ...th, width: vistaCompacta ? 100 : 120, textAlign: 'left' }}>Capítulo</th>
                <th style={{ ...th, width: 72, textAlign: 'left' }}>Ítem</th>
                <th style={{ ...th, textAlign: 'left' }}>Descripción</th>
                <th style={{ ...th, width: 56, textAlign: 'center' }}>Und</th>
                {verEco && (
                  <th style={{ ...th, width: 100, textAlign: 'right' }}>Vlr unitario</th>
                )}
                <th style={{ ...th, width: 88, textAlign: 'right' }}>Cantidad</th>
                {verEco && (
                  <th style={{ ...th, width: 110, textAlign: 'right' }}>Costo Directo</th>
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
                    sheetGrid={sheetGrid}
                    t={t}
                    colSpan={colSpan}
                    chipValidacionUi={chipValidacionUi}
                    nivelesActivos={nivelesActivos}
                    onClickRegistro={(reg) => setConfirmReg(reg)}
                  />
                )
              })}
              <tr>
                <td
                  colSpan={colSpan - (verEco ? 2 : 1)}
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
            aria-labelledby="sicoe-ejec-confirm-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
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
              <div id="sicoe-ejec-confirm-title" style={{ fontSize: 'var(--cc-h3)', fontWeight: 700, marginBottom: 8 }}>
                Abrir registro
              </div>
              <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
                ¿Desea ver la información asociada a este registro?
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                Reporte #{confirmReg.numero_reporte ?? '—'} · Registro #{confirmReg.numero_registro ?? confirmReg.id}
                {' · '}
                Ítem {confirmReg.item_numero || '—'}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.4 }}>
                <strong style={{ color: t.text }}>Sí</strong>: abre el reporte completo.
                {' '}
                <strong style={{ color: t.text }}>No</strong>: abre solo este registro.
              </p>
            </div>
            <div style={{ padding: '12px 20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setConfirmReg(null)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: t.textMuted,
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const reg = confirmReg
                  setConfirmReg(null)
                  onAbrirRegistro?.(reg, { soloRegistro: true })
                }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.primary}66`,
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: t.primary,
                  fontWeight: 800,
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  const reg = confirmReg
                  setConfirmReg(null)
                  onAbrirRegistro?.(reg, { soloRegistro: false })
                }}
                style={{
                  background: t.primary,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                Sí
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
  sheetGrid,
  t,
  colSpan,
  chipValidacionUi,
  nivelesActivos,
  onClickRegistro,
}) {
  const bgTramo = 'color-mix(in srgb, ' + (t.primary || '#0077B6') + ' 10%, ' + (t.bgCard || '#fff') + ')'
  return (
    <>
      <tr
        onClick={toggleTramo}
        style={{ cursor: 'pointer', background: bgTramo }}
        title={trOpen ? 'Contraer tramo' : 'Expandir tramo'}
      >
        <td style={{ ...td, fontWeight: 900 }} colSpan={4}>
          <span style={{ marginRight: 6 }} aria-hidden>{trOpen ? '▼' : '▶'}</span>
          {tr.tramo}
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
              sheetGrid={sheetGrid}
              t={t}
              chipValidacionUi={chipValidacionUi}
              nivelesActivos={nivelesActivos}
              onClickRegistro={onClickRegistro}
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
  sheetGrid,
  t,
  chipValidacionUi,
  nivelesActivos,
  onClickRegistro,
}) {
  const bgCap = 'color-mix(in srgb, ' + (t.primary || '#0077B6') + ' 5%, ' + (t.bgCard || '#fff') + ')'
  return (
    <>
      <tr
        onClick={toggleCap}
        style={{ cursor: 'pointer', background: bgCap }}
        title={capOpen ? 'Contraer capítulo' : 'Expandir capítulo'}
      >
        <td style={{ ...td, color: t.textMuted, paddingLeft: 18 }}>{tr.tramo}</td>
        <td style={{ ...td, fontWeight: 800 }} colSpan={3}>
          <span style={{ marginRight: 6 }} aria-hidden>{capOpen ? '▼' : '▶'}</span>
          {cap.capitulo}
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
              sheetGrid={sheetGrid}
              t={t}
              chipValidacionUi={chipValidacionUi}
              nivelesActivos={nivelesActivos}
              onClickRegistro={onClickRegistro}
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
  t,
  chipValidacionUi,
  nivelesActivos,
  onClickRegistro,
}) {
  return (
    <>
      <tr
        onClick={toggleItem}
        style={{ cursor: 'pointer' }}
        title={itOpen ? 'Ocultar registros' : 'Ver registros del ítem'}
      >
        <td style={{ ...td, color: t.textMuted, fontSize: 11 }}>{tr.tramo}</td>
        <td style={{ ...td, color: t.textMuted, fontSize: 11 }}>{cap.capitulo}</td>
        <td style={{ ...td, fontWeight: 800 }}>
          <span style={{ marginRight: 4, color: t.textMuted }} aria-hidden>{itOpen ? '▼' : '▶'}</span>
          {it.item_numero}
        </td>
        <td style={{ ...td }} title={it.descripcion || undefined}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {it.descripcion || '—'}
          </div>
          {(it.validacion?.chips || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {it.validacion.chips.map((ch) => chipValidacionUi(ch))}
            </div>
          )}
        </td>
        <td style={{ ...td, textAlign: 'center' }}>{it.unidad || '—'}</td>
        {verEco && (
          <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {fmtVu(it.vlr_unitario)}
          </td>
        )}
        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtCant(it.cantidad)}
        </td>
        {verEco && (
          <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmtPesos(it.costo)}
          </td>
        )}
      </tr>
      {itOpen &&
        it.registros.map((reg) => {
          const chip = chipValidacionNivel(reg, nivelesActivos)
          const pastel = pastelDeEstadoValidacion(chip.estado)
          return (
            <tr
              key={reg.id}
              onClick={(e) => {
                e.stopPropagation()
                onClickRegistro?.(reg)
              }}
              style={{ cursor: 'pointer', background: 'color-mix(in srgb, ' + (t.bg || '#f8fafc') + ' 70%, transparent)' }}
              title="Abrir registro"
            >
              <td style={{ ...td, paddingLeft: 22, fontSize: 11, color: t.textMuted }} colSpan={2}>
                Rep #{reg.numero_reporte ?? '—'} · Reg #{reg.numero_registro ?? reg.id}
              </td>
              <td style={{ ...td, fontSize: 11, color: t.textMuted }}>{it.item_numero}</td>
              <td style={{ ...td }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: pastel.bg,
                    color: pastel.color || t.text,
                    fontSize: 11,
                    fontWeight: 800,
                    border: `1px solid ${pastel.border || 'transparent'}`,
                  }}
                  title={chip.tooltip}
                >
                  {chip.label} · {chip.estado}
                </span>
              </td>
              <td style={{ ...td, textAlign: 'center', color: t.textMuted }}>{it.unidad || '—'}</td>
              {verEco && (
                <td style={{ ...td, textAlign: 'right', fontSize: 11, color: t.textMuted }}>
                  {fmtVu(reg._vu_efectivo)}
                </td>
              )}
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCant(reg._cant_efectiva)}
              </td>
              {verEco && (
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPesos(reg._costo_efectivo)}
                </td>
              )}
            </tr>
          )
        })}
    </>
  )
}
