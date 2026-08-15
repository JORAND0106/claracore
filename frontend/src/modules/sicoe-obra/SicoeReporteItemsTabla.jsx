/**
 * TAB «Ítems y registros»: tabla tipo hoja de cálculo, expansión por clic en fila,
 * menús flotantes (portal) e indicadores de validación por nivel/rol.
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { listaGraficosRegistro } from './sicoeGraficosHelpers'
import SicoeMediaLightbox from './SicoeMediaLightbox'
import {
  agruparRegistrosPorItem,
  pastelDeEstadoValidacion,
  estadoNivelRegistro,
  etiquetaCortaRolNivel,
  PASTEL_ESTADO_VALIDACION,
} from './sicoeReporteItemsTablaHelpers'

const COLOR_PUNTO = {
  Aprobado: '#10B981',
  Pendiente: '#F59E0B',
  Rechazado: '#EF4444',
  'No Objeto de Cobro': '#374151',
  'No Revisado': '#3B82F6',
}

/** Estilos de grilla/celdas derivados del tema de la plataforma (sin paleta aislada). */
function sheetStyles(t, carpetaCompact) {
  const grid = t.border
  return {
    grid,
    th: {
      fontSize: '11px',
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
      fontSize: '13px',
      color: t.text,
      border: `1px solid ${grid}`,
      verticalAlign: 'middle',
      lineHeight: 1.25,
      background: 'transparent',
    },
  }
}

function fmtNum(v, digits = 2) {
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

function mediaItemsDeRegistro(reg, reporte) {
  const items = []
  const foto = String(reg?.foto_url || '').trim()
  if (foto) items.push({ url: foto, label: 'Foto' })
  for (const g of listaGraficosRegistro(reg)) {
    if (g?.url) items.push({ url: g.url, label: g.numero != null ? `Gráfico #${g.numero}` : 'Gráfico' })
  }
  if (!items.some((i) => i.label.startsWith('Gráfico'))) {
    const fromRep = reporte?.registros?.find((r) => r.id === reg.id)
    const gu = String(reg?.grafico_url || fromRep?.grafico_url || '').trim()
    if (gu) items.push({ url: gu, label: 'Gráfico' })
  }
  return items
}

function rectFromEvent(e) {
  const el = e?.currentTarget
  if (!el?.getBoundingClientRect) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
}

/** Menú flotante fuera del overflow de la tabla (portal a body). */
function FloatingMenu({ anchor, onClose, children, width = 168, t }) {
  useEffect(() => {
    if (!anchor) return undefined
    const close = () => onClose?.()
    const onKey = (ev) => { if (ev.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  if (!anchor || typeof document === 'undefined') return null

  const vw = window.innerWidth || 800
  const vh = window.innerHeight || 600
  const menuW = width
  let left = anchor.right - menuW
  if (left < 8) left = 8
  if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8)
  let top = anchor.bottom + 4
  const estH = 140
  if (top + estH > vh - 8) top = Math.max(8, anchor.top - estH - 4)

  return createPortal(
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 11040, background: 'transparent' }}
      />
      <div
        role="menu"
        style={{
          position: 'fixed',
          top,
          left,
          zIndex: 11050,
          minWidth: menuW,
          background: t?.bgCard || '#fff',
          border: `1px solid ${t?.border || '#cbd5e1'}`,
          borderRadius: 10,
          boxShadow: t?.shadow || '0 12px 40px rgba(0,0,0,0.18)',
          padding: 4,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  )
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
}) {
  const [itemExpandido, setItemExpandido] = useState(itemExpandidoInicial)
  const [menuGraf, setMenuGraf] = useState(null) // { regId, anchor }
  const [menuVal, setMenuVal] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    if (itemExpandidoInicial != null && itemExpandidoInicial !== '') {
      setItemExpandido(itemExpandidoInicial)
    }
  }, [itemExpandidoInicial])

  useEffect(() => {
    if (registroExpandido == null) return
    const reg = registros.find((r) => String(r.id) === String(registroExpandido))
    if (reg?.item_numero) setItemExpandido(reg.item_numero)
  }, [registroExpandido, registros])

  useEffect(() => {
    if (registroExpandido == null) return
    const id = `registro-${registroExpandido}`
    const tmr = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 280)
    return () => clearTimeout(tmr)
  }, [registroExpandido, itemExpandido])

  const filasItem = useMemo(() => agruparRegistrosPorItem(registros), [registros])

  const toggleItem = useCallback((itemNum) => {
    setItemExpandido((prev) => (prev === itemNum ? null : itemNum))
    setMenuGraf(null)
    setMenuVal(null)
  }, [])

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

  const menuGrafReg = menuGraf ? registros.find((r) => r.id === menuGraf.regId) : null
  const menuValReg = menuVal ? registros.find((r) => r.id === menuVal.regId) : null
  const menuValEstado = menuValReg ? (estadoMiNivel?.(menuValReg) || 'No Revisado') : null
  const menuValRapido = menuValReg ? !!puedeValidarRapido?.(menuValReg) : false
  const menuGrafMedia = menuGrafReg ? mediaItemsDeRegistro(menuGrafReg, reporte) : []
  const menuGrafTiene = menuGrafMedia.some((m) => String(m.label || '').startsWith('Gráfico'))

  return (
    <div className="cc-sicoe-items-sheet-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
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
            tableLayout: 'auto',
          }}
        >
          <thead>
            <tr>
              <th style={sheetTh}>Ítem</th>
              <th style={sheetTh}>Descripción</th>
              <th style={{ ...sheetTh, textAlign: 'center' }}>Und</th>
              <th style={{ ...sheetTh, textAlign: 'right' }}>Cantidad</th>
              {verValoresEconomicos && (
                <th style={{ ...sheetTh, textAlign: 'right' }}>Costo Directo</th>
              )}
              <th style={{ ...sheetTh, minWidth: 120 }}>
                {nivelLabel ? `Validación · ${nivelLabel}` : 'Validación'}
              </th>
            </tr>
          </thead>
          <tbody>
            {filasItem.map((fila) => {
              const abierto = itemExpandido === fila.itemNum
              const selIds = idsSeleccionadosEnItem(fila.regs)
              const mostrarMasiva = puedeMasivaNivel && selIds.length > 0
              return (
                <FragmentItem
                  key={fila.itemNum}
                  fila={fila}
                  abierto={abierto}
                  toggleItem={toggleItem}
                  sheetTd={sheetTd}
                  sheetTh={sheetTh}
                  t={t}
                  verValoresEconomicos={verValoresEconomicos}
                  carpetaCompact={carpetaCompact}
                  mostrarMasiva={mostrarMasiva}
                  selIds={selIds}
                  ejecutandoMasivo={ejecutandoMasivo}
                  onValidacionAprobar={onValidacionAprobar}
                  onPedirComentarioMasivo={onPedirComentarioMasivo}
                  estadoMiNivel={estadoMiNivel}
                  puedeValidarRapido={puedeValidarRapido}
                  seleccionados={seleccionados}
                  onToggleSeleccion={onToggleSeleccion}
                  registroExpandido={registroExpandido}
                  onToggleRegistroExpandido={onToggleRegistroExpandido}
                  renderHojaRegistro={renderHojaRegistro}
                  setMenuGraf={setMenuGraf}
                  setMenuVal={setMenuVal}
                  setLightbox={setLightbox}
                  reporte={reporte}
                  onPedirEsquema={onPedirEsquema}
                  renderMenuAcciones={renderMenuAcciones}
                  nivelesIndicadores={nivelesIndicadores}
                  nivelUsuario={nivelUsuario}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {menuGraf && (
        <FloatingMenu anchor={menuGraf.anchor} onClose={() => setMenuGraf(null)} width={180} t={t}>
          <button
            type="button"
            disabled={!menuGrafTiene}
            onClick={() => {
              const idx = menuGrafMedia.findIndex((m) => String(m.label || '').startsWith('Gráfico'))
              if (idx >= 0) setLightbox({ items: menuGrafMedia, index: idx })
              setMenuGraf(null)
            }}
            style={menuItem(t, !menuGrafTiene)}
          >
            Ver gráfico
          </button>
          <button
            type="button"
            onClick={() => {
              const reg = menuGrafReg
              setMenuGraf(null)
              if (reg) onPedirEsquema?.(reg)
            }}
            style={menuItem(t, false)}
          >
            Crear / editar esquema
          </button>
        </FloatingMenu>
      )}

      {menuVal && menuValRapido && (
        <FloatingMenu anchor={menuVal.anchor} onClose={() => setMenuVal(null)} width={168} t={t}>
          <button
            type="button"
            disabled={ejecutandoMasivo || menuValEstado === 'Aprobado'}
            onClick={() => {
              const id = menuVal.regId
              setMenuVal(null)
              onValidacionAprobar?.([id])
            }}
            style={menuItem(t, ejecutandoMasivo || menuValEstado === 'Aprobado')}
          >
            ✅ Aprobar
          </button>
          <button
            type="button"
            disabled={ejecutandoMasivo}
            onClick={() => {
              const id = menuVal.regId
              setMenuVal(null)
              onPedirComentarioMasivo?.('Pendiente', [id])
            }}
            style={menuItem(t, ejecutandoMasivo)}
          >
            🟡 Pendiente
          </button>
          <button
            type="button"
            disabled={ejecutandoMasivo}
            onClick={() => {
              const id = menuVal.regId
              setMenuVal(null)
              onPedirComentarioMasivo?.('Rechazado', [id])
            }}
            style={menuItem(t, ejecutandoMasivo)}
          >
            🔴 Rechazar
          </button>
        </FloatingMenu>
      )}

      {lightbox && (
        <SicoeMediaLightbox
          open
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : null))}
          t={t}
        />
      )}
    </div>
  )
}

function FragmentItem({
  fila,
  abierto,
  toggleItem,
  sheetTd,
  sheetTh,
  t,
  verValoresEconomicos,
  carpetaCompact,
  mostrarMasiva,
  selIds,
  ejecutandoMasivo,
  onValidacionAprobar,
  onPedirComentarioMasivo,
  estadoMiNivel,
  puedeValidarRapido,
  seleccionados,
  onToggleSeleccion,
  registroExpandido,
  onToggleRegistroExpandido,
  renderHojaRegistro,
  setMenuGraf,
  setMenuVal,
  setLightbox,
  reporte,
  onPedirEsquema,
  renderMenuAcciones,
  nivelesIndicadores,
  nivelUsuario,
}) {
  const colSpan = verValoresEconomicos ? 6 : 5
  const itemRowBg = abierto ? `${t.primary}18` : t.bgCard

  return (
    <>
      <tr
        onClick={() => toggleItem(fila.itemNum)}
        style={{
          cursor: 'pointer',
          background: itemRowBg,
          transition: 'background 0.1s',
        }}
        data-item={fila.itemNum}
        title={abierto ? 'Clic para contraer' : 'Clic para ver registros'}
      >
        <td style={{ ...sheetTd, fontWeight: 800, color: t.primary, whiteSpace: 'nowrap', width: 88 }}>
          {fila.itemNum}
        </td>
        <td style={{ ...sheetTd, maxWidth: 420 }}>
          <span
            title={fila.descripcion}
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: carpetaCompact ? 200 : 420,
            }}
          >
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
                  fontSize: 11,
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
            <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
              {fila.regs.length} reg.
            </span>
          )}
        </td>
      </tr>

      {abierto && (
        <tr>
          <td colSpan={colSpan} style={{ padding: 0, background: t.bg, border: `1px solid ${t.border}` }}>
            <div style={{ padding: carpetaCompact ? '6px 4px 8px' : '8px 8px 10px', overflowX: 'auto' }}>
              <table
                className="cc-sicoe-items-sheet cc-sicoe-items-sheet--sub"
                style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}
              >
                <thead>
                  <tr>
                    <th style={{ ...sheetTh, width: 28, textAlign: 'center' }} />
                    <th style={sheetTh}># Registro</th>
                    <th style={{ ...sheetTh, textAlign: 'right' }}>Long</th>
                    <th style={{ ...sheetTh, textAlign: 'right' }}>Ancho</th>
                    <th style={{ ...sheetTh, textAlign: 'right' }}>Espesor</th>
                    <th style={{ ...sheetTh, textAlign: 'right' }}>Cantidad</th>
                    <th style={{ ...sheetTh, textAlign: 'right' }}>Cant. Total</th>
                    {verValoresEconomicos && (
                      <th style={{ ...sheetTh, textAlign: 'right' }}>Costo Directo</th>
                    )}
                    <th style={{ ...sheetTh, textAlign: 'center', width: 40 }}>📷</th>
                    <th style={{ ...sheetTh, textAlign: 'center', width: 40 }}>📐</th>
                    <th style={{ ...sheetTh, textAlign: 'center', minWidth: 88 }}>Validadores</th>
                    <th style={{ ...sheetTh, width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {fila.regs.map((reg) => {
                    const estado = estadoMiNivel?.(reg) || 'No Revisado'
                    const pastel = pastelDeEstadoValidacion(estado)
                    const expandido =
                      registroExpandido != null && String(registroExpandido) === String(reg.id)
                    const media = mediaItemsDeRegistro(reg, reporte)
                    const tieneFoto = !!String(reg.foto_url || '').trim()
                    const tieneGraf = media.some((m) => String(m.label || '').startsWith('Gráfico'))
                    const rapido = puedeValidarRapido?.(reg)
                    const subCols = verValoresEconomicos ? 12 : 11

                    return (
                      <FragmentReg
                        key={reg.id}
                        reg={reg}
                        estado={estado}
                        pastel={pastel}
                        expandido={expandido}
                        sheetTd={sheetTd}
                        t={t}
                        verValoresEconomicos={verValoresEconomicos}
                        seleccionados={seleccionados}
                        onToggleSeleccion={onToggleSeleccion}
                        onToggleRegistroExpandido={onToggleRegistroExpandido}
                        renderHojaRegistro={renderHojaRegistro}
                        setMenuGraf={setMenuGraf}
                        setMenuVal={setMenuVal}
                        setLightbox={setLightbox}
                        media={media}
                        tieneFoto={tieneFoto}
                        tieneGraf={tieneGraf}
                        rapido={rapido}
                        renderMenuAcciones={renderMenuAcciones}
                        subCols={subCols}
                        nivelesIndicadores={nivelesIndicadores}
                        nivelUsuario={nivelUsuario}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function IndicadoresNiveles({
  reg,
  nivelesIndicadores,
  nivelUsuario,
  rapido,
  onOpenValMenu,
  t,
}) {
  const lista = Array.isArray(nivelesIndicadores) && nivelesIndicadores.length
    ? nivelesIndicadores
    : [{ nivel: Number(nivelUsuario) || 1, emoji: '📋', label: 'N?', encabezado: 'Validación' }]

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', justifyContent: 'center' }}
      onClick={(e) => e.stopPropagation()}
    >
      {lista.map((nv) => {
        const est = estadoNivelRegistro(reg, nv.nivel)
        const color = COLOR_PUNTO[est] || COLOR_PUNTO['No Revisado']
        const rolCorto = etiquetaCortaRolNivel(nv.encabezado, nv.nivel)
        const esMi = Number(nv.nivel) === Number(nivelUsuario)
        const tip = `${nv.label} · ${rolCorto}: ${est}${esMi && rapido ? ' — clic para validar' : ''}`
        return (
          <button
            key={nv.nivel}
            type="button"
            title={tip}
            aria-label={tip}
            onClick={(e) => {
              e.stopPropagation()
              if (esMi && rapido) onOpenValMenu?.(e)
            }}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: esMi ? `${t.primary}22` : 'transparent',
              border: esMi ? `1px solid ${t.primary}` : '1px solid transparent',
              borderRadius: 6,
              padding: '2px 4px',
              cursor: esMi && rapido ? 'pointer' : 'default',
              minWidth: 28,
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 11, lineHeight: 1 }} aria-hidden>{nv.emoji || '📋'}</span>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: color,
                boxShadow: est === 'No Revisado' ? `inset 0 0 0 1px ${t.border}` : `0 0 0 1px ${color}55`,
              }}
            />
            <span style={{ fontSize: 9, fontWeight: 800, color: esMi ? t.primary : t.textMuted, letterSpacing: '0.02em' }}>
              {nv.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FragmentReg({
  reg,
  estado,
  pastel,
  expandido,
  sheetTd,
  t,
  verValoresEconomicos,
  seleccionados,
  onToggleSeleccion,
  onToggleRegistroExpandido,
  renderHojaRegistro,
  setMenuGraf,
  setMenuVal,
  setLightbox,
  media,
  tieneFoto,
  tieneGraf,
  rapido,
  renderMenuAcciones,
  subCols,
  nivelesIndicadores,
  nivelUsuario,
}) {
  const hasPastel = pastel.bg !== 'transparent'
  const rowBg = hasPastel
    ? pastel.bg
    : expandido
      ? `${t.primary}14`
      : t.bgCard
  const rowFg = hasPastel && pastel.color ? pastel.color : t.text
  const tdTheme = { ...sheetTd, color: rowFg }
  const numStyle = {
    ...tdTheme,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontSize: 12,
  }

  const openDetail = () => onToggleRegistroExpandido?.(expandido ? null : reg.id)

  return (
    <>
      <tr
        id={`registro-${reg.id}`}
        onClick={openDetail}
        title={expandido ? 'Clic para cerrar detalle' : 'Clic para abrir detalle'}
        style={{
          background: rowBg,
          cursor: 'pointer',
          outline: hasPastel ? `1px solid ${pastel.border}66` : undefined,
          color: rowFg,
        }}
      >
        <td style={{ ...tdTheme, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={seleccionados.includes(reg.id)}
            onChange={() => onToggleSeleccion?.(reg.id)}
            style={{ width: 14, height: 14, accentColor: t.primary, cursor: 'pointer' }}
            aria-label={`Seleccionar registro ${reg.numero_registro}`}
          />
        </td>
        <td style={{ ...tdTheme, fontWeight: 800, color: hasPastel ? rowFg : '#D97706', whiteSpace: 'nowrap' }}>
          #{reg.numero_registro}
        </td>
        <td style={numStyle}>{fmtNum(reg.longitud)}</td>
        <td style={numStyle}>{fmtNum(reg.ancho)}</td>
        <td style={numStyle}>{fmtNum(reg.espesor)}</td>
        <td style={numStyle}>{fmtNum(reg.cantidad)}</td>
        <td style={{ ...numStyle, fontWeight: 700 }}>{fmtNum(reg.cantidad_total)}</td>
        {verValoresEconomicos && (
          <td style={{ ...numStyle, fontWeight: 700, color: hasPastel ? rowFg : t.primary }}>{fmtPesos(reg.costo_directo)}</td>
        )}
        <td style={{ ...tdTheme, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={tieneFoto ? 'Ver foto' : 'Sin foto — abrir detalle para cargar'}
            onClick={() => {
              if (tieneFoto && media.length) {
                setLightbox({ items: media, index: 0 })
              } else {
                onToggleRegistroExpandido?.(reg.id)
              }
            }}
            style={btnIcon(tieneFoto ? t.primary : t.textMuted)}
          >
            📷
          </button>
        </td>
        <td style={{ ...tdTheme, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="Gráfico / esquema"
            onClick={(e) => {
              setMenuVal(null)
              setMenuGraf({ regId: reg.id, anchor: rectFromEvent(e) })
            }}
            style={btnIcon(tieneGraf ? t.primary : t.textMuted)}
          >
            📐
          </button>
        </td>
        <td style={{ ...tdTheme, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <IndicadoresNiveles
            reg={reg}
            nivelesIndicadores={nivelesIndicadores}
            nivelUsuario={nivelUsuario}
            rapido={rapido}
            t={t}
            onOpenValMenu={(e) => {
              setMenuGraf(null)
              setMenuVal({ regId: reg.id, anchor: rectFromEvent(e) })
            }}
          />
        </td>
        <td style={tdTheme} onClick={(e) => e.stopPropagation()}>
          {renderMenuAcciones?.(reg)}
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={subCols} style={{ padding: 0, border: `1px solid ${t.border}` }}>
            <div style={{ borderTop: `2px solid ${t.primary}`, overflow: 'hidden', background: t.bgCard }}>
              {renderHojaRegistro?.(reg)}
            </div>
          </td>
        </tr>
      )}
    </>
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
    fontSize: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    padding: 0,
  }
}

function btnIcon(color) {
  return {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 15,
    lineHeight: 1,
    padding: '2px 3px',
    color,
  }
}

function menuItem(t, disabled) {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    padding: '9px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: t?.text || '#0F2942',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    borderRadius: 6,
  }
}

export { PASTEL_ESTADO_VALIDACION }
