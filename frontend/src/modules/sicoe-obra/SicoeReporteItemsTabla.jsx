/**
 * TAB «Ítems y registros»: listado de ítems; clic abre ventana con tarjetas/detalle
 * (reemplaza el acordeón). Conserva selección y validación masiva.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  agruparRegistrosPorItem,
  conteoEstadosPorNivel,
  idsRegistrosEnEstado,
  sumatoriaCostoDirectoFilasItem,
  sumatoriaCantidadFilasItem,
  normalizarItemNumSicoe,
  sicoeItemFilaAbierta,
} from './sicoeReporteItemsTablaHelpers'
import SicoeItemRegistrosVentana from './SicoeItemRegistrosVentana.jsx'

const COLOR_PUNTO = {
  Aprobado: '#10B981',
  Pendiente: '#F59E0B',
  Rechazado: '#EF4444',
  'No Objeto de Cobro': '#374151',
  'No Revisado': '#3B82F6',
}

/** Divisor de celda tipo Excel (contraste medio; evita el #e2e8f0 demasiado tenue). */
const SHEET_CELL_BORDER = '#94a3b8'

/** Estilos de grilla/celdas derivados del tema de la plataforma (sin paleta aislada). */
function sheetStyles(t, carpetaCompact) {
  const grid = t.sheetGridBorder || SHEET_CELL_BORDER
  return {
    grid,
    th: {
      fontSize: 'var(--cc-caption)',
      fontWeight: 800,
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      padding: carpetaCompact ? '7px 8px' : '8px 10px',
      textAlign: 'left',
      whiteSpace: 'nowrap',
      border: `1px solid ${grid}`,
      background: t.headerBg || t.bg,
      position: 'sticky',
      top: 0,
      zIndex: 2,
    },
    td: {
      padding: carpetaCompact ? '5px 8px' : '6px 10px',
      fontSize: 'var(--cc-sm)',
      color: t.text,
      border: `1px solid ${grid}`,
      verticalAlign: 'middle',
      lineHeight: 1.25,
      background: 'transparent',
    },
  }
}

function fmtNum(v, digits = 3) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

function fmtPesos(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

export default function SicoeReporteItemsTabla({
  t,
  reporte,
  registros,
  verValoresEconomicos = true,
  carpetaCompact = false,
  estadoMiNivel,
  puedeValidarRapido,
  puedeMasivaNivel = false,
  ejecutandoMasivo = false,
  seleccionados = [],
  onToggleSeleccion,
  onSetSeleccionados,
  onValidacionAprobar,
  onPedirComentarioMasivo,
  registroExpandido = null,
  onToggleRegistroExpandido,
  itemExpandidoInicial = null,
  renderHojaRegistro,
  onPedirEsquema,
  renderMenuAcciones,
  nivelLabel = '',
  nivelesIndicadores = [],
  nivelUsuario = null,
  nivelesActivos = [1, 2, 3],
  API_URL = null,
  contratoId = null,
  hdrs = {},
  fetchObservacionValidacion = null,
}) {
  /** Ítem cuya ventana institucional está abierta (sustituye el acordeón). */
  const [ventanaItemNum, setVentanaItemNum] = useState(() => normalizarItemNumSicoe(itemExpandidoInicial))
  const [estadoFiltroMasivo, setEstadoFiltroMasivo] = useState(null) // 'Aprobado'|'Pendiente'|...
  const lastForcedRegExpRef = useRef(null)
  const lastInicialKeyRef = useRef(normalizarItemNumSicoe(itemExpandidoInicial))
  /** Tras un clic del usuario, no dejar que sync/_autoRegistro vuelva a pisar la ventana. */
  const userTouchedItemRef = useRef(false)

  useEffect(() => {
    const key = normalizarItemNumSicoe(itemExpandidoInicial)
    if (!key) return
    if (lastInicialKeyRef.current !== key) {
      lastInicialKeyRef.current = key
      userTouchedItemRef.current = false
      setVentanaItemNum(key)
      return
    }
    if (!userTouchedItemRef.current) setVentanaItemNum(key)
  }, [itemExpandidoInicial])

  // Deep-link / _autoRegistro: abrir ventana del ítem del registro activo.
  useEffect(() => {
    if (registroExpandido == null) {
      lastForcedRegExpRef.current = null
      return
    }
    const token = String(registroExpandido)
    if (lastForcedRegExpRef.current === token) return
    let reg = registros.find((r) => String(r.id) === token)
    if (!reg) {
      reg = registros.find((r) => String(r.numero_registro) === token)
    }
    const key = normalizarItemNumSicoe(reg?.item_numero)
    if (!key) return
    if (userTouchedItemRef.current) return
    lastForcedRegExpRef.current = token
    setVentanaItemNum(key)
  }, [registroExpandido, registros])

  useEffect(() => {
    if (seleccionados.length === 0) setEstadoFiltroMasivo(null)
  }, [seleccionados.length])

  const filasItem = useMemo(() => agruparRegistrosPorItem(registros), [registros])
  const filaVentana = useMemo(
    () => filasItem.find((f) => sicoeItemFilaAbierta(ventanaItemNum, f.itemNum)) || null,
    [filasItem, ventanaItemNum],
  )
  const todosIds = useMemo(() => registros.map((r) => r.id).filter((id) => id != null), [registros])
  const todosSeleccionados = todosIds.length > 0 && todosIds.every((id) => seleccionados.includes(id))
  const algunoSeleccionado = seleccionados.length > 0

  const regsSeleccionados = useMemo(
    () => registros.filter((r) => seleccionados.includes(r.id)),
    [registros, seleccionados],
  )
  const conteoSeleccion = useMemo(
    () => conteoEstadosPorNivel(regsSeleccionados, estadoMiNivel),
    [regsSeleccionados, estadoMiNivel],
  )
  const idsFiltroEstado = useMemo(() => {
    if (!estadoFiltroMasivo) return []
    return idsRegistrosEnEstado(regsSeleccionados, estadoMiNivel, estadoFiltroMasivo)
  }, [regsSeleccionados, estadoMiNivel, estadoFiltroMasivo])
  const idsFiltroElegibles = useMemo(
    () => idsFiltroEstado.filter((id) => {
      const r = registros.find((x) => x.id === id)
      return r && puedeValidarRapido?.(r)
    }),
    [idsFiltroEstado, registros, puedeValidarRapido],
  )

  const totalCant = useMemo(() => sumatoriaCantidadFilasItem(filasItem), [filasItem])
  const totalCd = useMemo(() => sumatoriaCostoDirectoFilasItem(filasItem), [filasItem])

  const abrirVentanaItem = useCallback((itemNum) => {
    const key = normalizarItemNumSicoe(itemNum)
    if (!key) return
    userTouchedItemRef.current = true
    setVentanaItemNum(key)
  }, [])

  const cerrarVentanaItem = useCallback(() => {
    userTouchedItemRef.current = true
    setVentanaItemNum(null)
    onToggleRegistroExpandido?.(null)
  }, [onToggleRegistroExpandido])

  const toggleSeleccionarTodos = useCallback(() => {
    if (!onSetSeleccionados) return
    if (todosSeleccionados) onSetSeleccionados([])
    else onSetSeleccionados([...todosIds])
  }, [onSetSeleccionados, todosSeleccionados, todosIds])

  const idsSeleccionadosEnItem = useCallback(
    (regs) => regs.filter((r) => seleccionados.includes(r.id)).map((r) => r.id),
    [seleccionados],
  )

  const { grid, th: sheetTh, td: sheetTd } = useMemo(
    () => sheetStyles(t, carpetaCompact),
    [t, carpetaCompact],
  )

  if (filasItem.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
        No hay registros con ítem asignado en este reporte.
      </div>
    )
  }

  const ESTADOS_RESUMEN = [
    { key: 'No Revisado', label: 'No revisados', color: COLOR_PUNTO['No Revisado'] },
    { key: 'Pendiente', label: 'Pendientes', color: COLOR_PUNTO.Pendiente },
    { key: 'Rechazado', label: 'Rechazados', color: COLOR_PUNTO.Rechazado },
    { key: 'Aprobado', label: 'Aprobados', color: COLOR_PUNTO.Aprobado },
  ]

  return (
    <div className="cc-sicoe-items-sheet-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Barra: seleccionar todo + resumen por estado de la selección */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: carpetaCompact ? '10px' : '12px 14px',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 'var(--cc-sm)',
            fontWeight: 700,
            color: t.text,
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={todosSeleccionados}
            ref={(el) => {
              if (el) el.indeterminate = algunoSeleccionado && !todosSeleccionados
            }}
            onChange={toggleSeleccionarTodos}
            style={{ width: 16, height: 16, accentColor: t.primary, cursor: 'pointer' }}
            aria-label="Seleccionar o deseleccionar todos los registros"
          />
          {todosSeleccionados
            ? `Deseleccionar todo (${todosIds.length})`
            : `Seleccionar todo (${todosIds.length} registros)`}
        </label>

        {algunoSeleccionado && !puedeMasivaNivel && (
          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
            {seleccionados.length} registro(s) seleccionado(s)
          </div>
        )}

        {algunoSeleccionado && puedeMasivaNivel && (
          <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
            <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Selección · {seleccionados.length} registro(s){nivelLabel ? ` · ${nivelLabel}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: estadoFiltroMasivo ? 10 : 0 }}>
              {ESTADOS_RESUMEN.map(({ key, label, color }) => {
                const cnt = conteoSeleccion[key] ?? 0
                const activo = estadoFiltroMasivo === key
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={cnt === 0}
                    onClick={() => setEstadoFiltroMasivo(activo ? null : key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: activo ? `${color}22` : t.bg,
                      border: `1px solid ${activo ? color : t.border}`,
                      borderRadius: 16,
                      padding: '6px 12px',
                      cursor: cnt > 0 ? 'pointer' : 'default',
                      opacity: cnt > 0 ? 1 : 0.45,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>{cnt}</span>
                    <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>{label}</span>
                  </button>
                )
              })}
            </div>
            {estadoFiltroMasivo && puedeMasivaNivel && estadoFiltroMasivo !== 'Aprobado' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>
                  Masivo sobre {estadoFiltroMasivo === 'No Revisado' ? 'no revisados' : estadoFiltroMasivo.toLowerCase()} ({idsFiltroElegibles.length} elegibles):
                </span>
                <button
                  type="button"
                  disabled={ejecutandoMasivo || idsFiltroElegibles.length === 0}
                  onClick={() => onValidacionAprobar?.(idsFiltroElegibles)}
                  style={{
                    ...btnVal('#16a34a', ejecutandoMasivo || idsFiltroElegibles.length === 0),
                    width: 'auto',
                    padding: '6px 12px',
                    height: 'auto',
                    fontSize: 'var(--cc-label)',
                  }}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  disabled={ejecutandoMasivo || idsFiltroElegibles.length === 0}
                  onClick={() => onPedirComentarioMasivo?.('Pendiente', idsFiltroElegibles)}
                  style={{
                    ...btnVal('#d97706', ejecutandoMasivo || idsFiltroElegibles.length === 0),
                    width: 'auto',
                    padding: '6px 12px',
                    height: 'auto',
                    fontSize: 'var(--cc-label)',
                  }}
                >
                  Pendiente
                </button>
                <button
                  type="button"
                  disabled={ejecutandoMasivo || idsFiltroElegibles.length === 0}
                  onClick={() => onPedirComentarioMasivo?.('Rechazado', idsFiltroElegibles)}
                  style={{
                    ...btnVal('#dc2626', ejecutandoMasivo || idsFiltroElegibles.length === 0),
                    width: 'auto',
                    padding: '6px 12px',
                    height: 'auto',
                    fontSize: 'var(--cc-label)',
                  }}
                >
                  Rechazar
                </button>
              </div>
            )}
            {estadoFiltroMasivo === 'Aprobado' && (
              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                Los registros ya aprobados no se revalidan en bloque desde este resumen. Elige otro estado o desmarca la selección.
              </div>
            )}
          </div>
        )}
      </div>

      {carpetaCompact ? (
        <div className="cc-sicoe-items-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filasItem.map((fila) => {
              const abierto = sicoeItemFilaAbierta(ventanaItemNum, fila.itemNum)
              const selIds = idsSeleccionadosEnItem(fila.regs)
              const mostrarMasiva = puedeMasivaNivel && selIds.length > 0
              return (
                <MobileItemCard
                  key={fila.itemNum}
                  fila={fila}
                  abierto={abierto}
                  toggleItem={abrirVentanaItem}
                  t={t}
                  verValoresEconomicos={verValoresEconomicos}
                  mostrarMasiva={mostrarMasiva}
                  selIds={selIds}
                  ejecutandoMasivo={ejecutandoMasivo}
                  onValidacionAprobar={onValidacionAprobar}
                  onPedirComentarioMasivo={onPedirComentarioMasivo}
                />
              )
          })}
          <div
            style={{
              background: t.headerBg || t.bg,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 800, color: t.text }}>Total</span>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>
                Cant. <strong style={{ color: t.text, fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(totalCant)}</strong>
              </span>
              {verValoresEconomicos && (
                <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  CD <strong style={{ color: t.primary, fontWeight: 900, fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtPesos(totalCd)}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
      <div
        style={{
          overflowX: 'auto',
          border: `1px solid ${grid}`,
          background: t.bgCard,
          borderRadius: 4,
        }}
      >
        <table
          className="cc-sicoe-items-sheet"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: verValoresEconomicos ? 980 : 820,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '88px' }} />
            <col />
            <col style={{ width: '56px' }} />
            <col style={{ width: '110px' }} />
            {verValoresEconomicos && <col style={{ width: '130px' }} />}
            <col style={{ width: '130px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={sheetTh}>Ítem</th>
              <th style={sheetTh}>Descripción</th>
              <th style={{ ...sheetTh, textAlign: 'center' }}>Und</th>
              <th style={{ ...sheetTh, textAlign: 'right' }}>Cantidad</th>
              {verValoresEconomicos && (
                <th style={{ ...sheetTh, textAlign: 'right' }}>Costo Directo</th>
              )}
              <th style={sheetTh}>
                {nivelLabel ? `Validación · ${nivelLabel}` : 'Validación'}
              </th>
            </tr>
          </thead>
          <tbody>
            {filasItem.map((fila) => {
              const abierto = sicoeItemFilaAbierta(ventanaItemNum, fila.itemNum)
              const selIds = idsSeleccionadosEnItem(fila.regs)
              const mostrarMasiva = puedeMasivaNivel && selIds.length > 0
              return (
                <FragmentItem
                  key={fila.itemNum}
                  fila={fila}
                  abierto={abierto}
                  toggleItem={abrirVentanaItem}
                  sheetTd={sheetTd}
                  t={t}
                  verValoresEconomicos={verValoresEconomicos}
                  mostrarMasiva={mostrarMasiva}
                  selIds={selIds}
                  ejecutandoMasivo={ejecutandoMasivo}
                  onValidacionAprobar={onValidacionAprobar}
                  onPedirComentarioMasivo={onPedirComentarioMasivo}
                />
              )
            })}
            <tr style={{ background: t.headerBg || t.bg }}>
              <td
                colSpan={3}
                style={{ ...sheetTd, fontWeight: 800, color: t.text, textAlign: 'right' }}
              >
                Total
              </td>
              <td
                style={{
                  ...sheetTd,
                  textAlign: 'right',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  color: t.text,
                }}
              >
                {fmtNum(totalCant)}
              </td>
              {verValoresEconomicos && (
                <td
                  style={{
                    ...sheetTd,
                    textAlign: 'right',
                    fontWeight: 900,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'ui-monospace, Consolas, monospace',
                    color: t.primary,
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  {fmtPesos(totalCd)}
                </td>
              )}
              <td style={sheetTd} />
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {filaVentana && (
        <SicoeItemRegistrosVentana
          open
          onClose={cerrarVentanaItem}
          t={t}
          itemNum={filaVentana.itemNum}
          itemDescripcion={filaVentana.descripcion}
          registros={filaVentana.regs}
          registroIdActivo={registroExpandido}
          onRegistroIdActivo={(id) => onToggleRegistroExpandido?.(id)}
          nivelesActivos={nivelesActivos}
          renderHojaRegistro={renderHojaRegistro}
          renderMenuAcciones={renderMenuAcciones}
          API_URL={API_URL}
          contratoId={contratoId}
          hdrs={hdrs}
          fetchObservacionValidacion={fetchObservacionValidacion}
          seleccionados={seleccionados}
          onToggleSeleccion={onToggleSeleccion}
        />
      )}
    </div>
  )
}


/** Vista móvil: fila de ítem; clic abre la ventana (sin acordeón). */
function MobileItemCard({
  fila,
  abierto,
  toggleItem,
  t,
  verValoresEconomicos,
  mostrarMasiva,
  selIds,
  ejecutandoMasivo,
  onValidacionAprobar,
  onPedirComentarioMasivo,
}) {
  return (
    <div
      style={{
        background: abierto ? `${t.primary}14` : t.bgCard,
        border: `1px solid ${abierto ? t.primary : t.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => toggleItem(fila.itemNum)}
        title="Abrir registros del ítem"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '12px 14px',
          cursor: 'pointer',
          color: t.text,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-sm)' }}>{fila.itemNum}</div>
            <div style={{ fontSize: 'var(--cc-sm)', lineHeight: 1.35, marginTop: 4, wordBreak: 'break-word' }}>{fila.descripcion}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 8, fontSize: 'var(--cc-label)', color: t.textMuted }}>
              <span>Und <strong style={{ color: t.text }}>{fila.unidad}</strong></span>
              <span>Cant <strong style={{ color: t.text, fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtNum(fila.sumCant)}</strong></span>
              {verValoresEconomicos && (
                <span>CD <strong style={{ color: t.primary, fontFamily: 'ui-monospace, Consolas, monospace' }}>{fmtPesos(fila.sumCd)}</strong></span>
              )}
              <span>{fila.regs.length} reg.</span>
            </div>
          </div>
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-label)', flexShrink: 0 }}>▸</span>
        </div>
      </button>

      {mostrarMasiva && (
        <div
          style={{ padding: '0 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted }}>Masivo ({selIds.length})</span>
          <button type="button" disabled={ejecutandoMasivo} onClick={() => onValidacionAprobar?.(selIds)} style={{ ...btnVal('#16a34a', ejecutandoMasivo), width: 'auto', padding: '6px 10px', height: 'auto' }}>✓</button>
          <button type="button" disabled={ejecutandoMasivo} onClick={() => onPedirComentarioMasivo?.('Pendiente', selIds)} style={{ ...btnVal('#d97706', ejecutandoMasivo), width: 'auto', padding: '6px 10px', height: 'auto' }}>●</button>
          <button type="button" disabled={ejecutandoMasivo} onClick={() => onPedirComentarioMasivo?.('Rechazado', selIds)} style={{ ...btnVal('#dc2626', ejecutandoMasivo), width: 'auto', padding: '6px 10px', height: 'auto' }}>✕</button>
        </div>
      )}
    </div>
  )
}

function FragmentItem({
  fila,
  abierto,
  toggleItem,
  sheetTd,
  t,
  verValoresEconomicos,
  mostrarMasiva,
  selIds,
  ejecutandoMasivo,
  onValidacionAprobar,
  onPedirComentarioMasivo,
}) {
  const itemRowBg = abierto ? `${t.primary}18` : t.bgCard

  return (
    <tr
      onClick={() => toggleItem(fila.itemNum)}
      style={{
        cursor: 'pointer',
        background: itemRowBg,
        transition: 'background 0.1s',
      }}
      data-item={fila.itemNum}
      title="Clic para abrir registros del ítem"
    >
      <td style={{ ...sheetTd, fontWeight: 800, color: t.primary, whiteSpace: 'nowrap' }}>
        {fila.itemNum}
      </td>
      <td style={{ ...sheetTd, wordBreak: 'break-word' }}>
        <span title={fila.descripcion} style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.35 }}>
          {fila.descripcion}
        </span>
      </td>
      <td style={{ ...sheetTd, textAlign: 'center', whiteSpace: 'nowrap' }}>{fila.unidad}</td>
      <td style={{ ...sheetTd, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, Consolas, monospace' }}>
        {fmtNum(fila.sumCant)}
      </td>
      {verValoresEconomicos && (
        <td style={{ ...sheetTd, textAlign: 'right', fontWeight: 700, color: t.primary, fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, Consolas, monospace' }}>
          {fmtPesos(fila.sumCd)}
        </td>
      )}
      <td style={sheetTd} onClick={(e) => e.stopPropagation()}>
        {mostrarMasiva ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }} title={`Validar ${selIds.length} seleccionado(s)`}>
            <span
              title={`Masivo (${selIds.length})`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--cc-caption)',
                fontWeight: 800,
                color: t.textMuted,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary }} />
              {selIds.length}
            </span>
            <button
              type="button"
              disabled={ejecutandoMasivo}
              onClick={() => onValidacionAprobar?.(selIds)}
              style={btnVal('#16a34a', ejecutandoMasivo)}
              title="Aprobar seleccionados"
            >
              ✓
            </button>
            <button
              type="button"
              disabled={ejecutandoMasivo}
              onClick={() => onPedirComentarioMasivo?.('Pendiente', selIds)}
              style={btnVal('#d97706', ejecutandoMasivo)}
              title="Pendiente seleccionados"
            >
              ●
            </button>
            <button
              type="button"
              disabled={ejecutandoMasivo}
              onClick={() => onPedirComentarioMasivo?.('Rechazado', selIds)}
              style={btnVal('#dc2626', ejecutandoMasivo)}
              title="Rechazar seleccionados"
            >
              ✕
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 600 }}>
            {fila.regs.length} reg. ▸
          </span>
        )}
      </td>
    </tr>
  )
}

function btnVal(bg, disabled) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    width: 24,
    height: 24,
    fontWeight: 800,
    fontSize: 'var(--cc-caption)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    padding: 0,
  }
}

export { PASTEL_ESTADO_VALIDACION } from './sicoeReporteItemsTablaHelpers'
