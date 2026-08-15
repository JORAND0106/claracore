/**
 * TAB «Ítems y registros»: tabla principal por ítem con subtabla expandible de registros.
 * Rendimiento: un solo ítem expandido a la vez; HojaRegistro solo para el registro detallado.
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { listaGraficosRegistro } from './sicoeGraficosHelpers'
import SicoeMediaLightbox from './SicoeMediaLightbox'
import {
  agruparRegistrosPorItem,
  pastelDeEstadoValidacion,
  PASTEL_ESTADO_VALIDACION,
} from './sicoeReporteItemsTablaHelpers'

const COLOR_PUNTO = {
  Aprobado: '#10B981',
  Pendiente: '#F59E0B',
  Rechazado: '#EF4444',
  'No Objeto de Cobro': '#374151',
  'No Revisado': '#3B82F6',
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
}) {
  const [itemExpandido, setItemExpandido] = useState(itemExpandidoInicial)
  const [menuGrafRegId, setMenuGrafRegId] = useState(null)
  const [menuValRegId, setMenuValRegId] = useState(null)
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
    setMenuGrafRegId(null)
    setMenuValRegId(null)
  }, [])

  const idsSeleccionadosEnItem = useCallback(
    (regs) => regs.filter((r) => seleccionados.includes(r.id)).map((r) => r.id),
    [seleccionados],
  )

  const thStyle = {
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: carpetaCompact ? '8px 6px' : '10px 8px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${t.border}`,
    background: t.bgCard,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  }

  const tdStyle = {
    padding: carpetaCompact ? '8px 6px' : '10px 8px',
    fontSize: 'var(--cc-sm)',
    color: t.text,
    borderBottom: `1px solid ${t.border}`,
    verticalAlign: 'middle',
  }

  if (filasItem.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: t.textMuted }}>
        No hay registros con ítem asignado en este reporte.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: verValoresEconomicos ? 720 : 560 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }} aria-label="Expandir" />
              <th style={thStyle}>Ítem</th>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Und</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cantidad</th>
              {verValoresEconomicos && (
                <th style={{ ...thStyle, textAlign: 'right' }}>Costo Directo</th>
              )}
              <th style={{ ...thStyle, width: 140 }}>{nivelLabel ? `Valid. ${nivelLabel}` : 'Validación'}</th>
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
                  tdStyle={tdStyle}
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
                  menuGrafRegId={menuGrafRegId}
                  setMenuGrafRegId={setMenuGrafRegId}
                  menuValRegId={menuValRegId}
                  setMenuValRegId={setMenuValRegId}
                  setLightbox={setLightbox}
                  reporte={reporte}
                  onPedirEsquema={onPedirEsquema}
                  renderMenuAcciones={renderMenuAcciones}
                />
              )
            })}
          </tbody>
        </table>
      </div>

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
  tdStyle,
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
  menuGrafRegId,
  setMenuGrafRegId,
  menuValRegId,
  setMenuValRegId,
  setLightbox,
  reporte,
  onPedirEsquema,
  renderMenuAcciones,
}) {
  const colSpan = verValoresEconomicos ? 7 : 6

  return (
    <>
      <tr
        onClick={() => toggleItem(fila.itemNum)}
        style={{
          cursor: 'pointer',
          background: abierto ? `${t.primary}12` : t.bgCard,
          transition: 'background 0.12s',
        }}
        data-item={fila.itemNum}
      >
        <td style={tdStyle}>
          <span style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>{abierto ? '▼' : '▶'}</span>
        </td>
        <td style={{ ...tdStyle, fontWeight: 800, color: t.primary, whiteSpace: 'nowrap' }}>{fila.itemNum}</td>
        <td style={{ ...tdStyle, maxWidth: 280 }}>
          <span
            title={fila.descripcion}
            style={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: carpetaCompact ? 'nowrap' : 'normal',
              maxWidth: carpetaCompact ? 160 : 320,
            }}
          >
            {fila.descripcion}
          </span>
        </td>
        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fila.unidad}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(fila.sumCant)}
        </td>
        {verValoresEconomicos && (
          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: t.primary, fontVariantNumeric: 'tabular-nums' }}>
            {fmtPesos(fila.sumCd)}
          </td>
        )}
        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
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
                  color: '#64748b',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6' }} />
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
            <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
              {fila.regs.length} reg.
            </span>
          )}
        </td>
      </tr>

      {abierto && (
        <tr>
          <td colSpan={colSpan} style={{ padding: 0, background: t.bg, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ padding: carpetaCompact ? '8px 6px 12px' : '10px 12px 14px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={{ ...subTh(t), width: 32 }} />
                    <th style={subTh(t)}># Registro</th>
                    <th style={{ ...subTh(t), textAlign: 'right' }}>Long</th>
                    <th style={{ ...subTh(t), textAlign: 'right' }}>Ancho</th>
                    <th style={{ ...subTh(t), textAlign: 'right' }}>Espesor</th>
                    <th style={{ ...subTh(t), textAlign: 'right' }}>Cantidad</th>
                    <th style={{ ...subTh(t), textAlign: 'right' }}>Cant. Total</th>
                    {verValoresEconomicos && (
                      <th style={{ ...subTh(t), textAlign: 'right' }}>Costo Directo</th>
                    )}
                    <th style={{ ...subTh(t), textAlign: 'center', width: 44 }}>📷</th>
                    <th style={{ ...subTh(t), textAlign: 'center', width: 52 }}>📐</th>
                    <th style={{ ...subTh(t), textAlign: 'center', width: 56 }}>●</th>
                    <th style={{ ...subTh(t), width: 28 }} />
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
                        tdStyle={tdStyle}
                        t={t}
                        verValoresEconomicos={verValoresEconomicos}
                        seleccionados={seleccionados}
                        onToggleSeleccion={onToggleSeleccion}
                        onToggleRegistroExpandido={onToggleRegistroExpandido}
                        renderHojaRegistro={renderHojaRegistro}
                        menuGrafRegId={menuGrafRegId}
                        setMenuGrafRegId={setMenuGrafRegId}
                        menuValRegId={menuValRegId}
                        setMenuValRegId={setMenuValRegId}
                        setLightbox={setLightbox}
                        media={media}
                        tieneFoto={tieneFoto}
                        tieneGraf={tieneGraf}
                        rapido={rapido}
                        ejecutandoMasivo={ejecutandoMasivo}
                        onValidacionAprobar={onValidacionAprobar}
                        onPedirComentarioMasivo={onPedirComentarioMasivo}
                        onPedirEsquema={onPedirEsquema}
                        renderMenuAcciones={renderMenuAcciones}
                        subCols={subCols}
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

function FragmentReg({
  reg,
  estado,
  pastel,
  expandido,
  tdStyle,
  t,
  verValoresEconomicos,
  seleccionados,
  onToggleSeleccion,
  onToggleRegistroExpandido,
  renderHojaRegistro,
  menuGrafRegId,
  setMenuGrafRegId,
  menuValRegId,
  setMenuValRegId,
  setLightbox,
  media,
  tieneFoto,
  tieneGraf,
  rapido,
  ejecutandoMasivo,
  onValidacionAprobar,
  onPedirComentarioMasivo,
  onPedirEsquema,
  renderMenuAcciones,
  subCols,
}) {
  const colorPunto = COLOR_PUNTO[estado] || COLOR_PUNTO['No Revisado']

  return (
    <>
      <tr
        id={`registro-${reg.id}`}
        style={{
          background: pastel.bg !== 'transparent' ? pastel.bg : expandido ? `${t.primary}10` : undefined,
          outline: pastel.border !== 'transparent' ? `1px solid ${pastel.border}55` : undefined,
        }}
      >
        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={seleccionados.includes(reg.id)}
            onChange={() => onToggleSeleccion?.(reg.id)}
            style={{ width: 15, height: 15, accentColor: '#8B5CF6', cursor: 'pointer' }}
            aria-label={`Seleccionar registro ${reg.numero_registro}`}
          />
        </td>
        <td
          style={{ ...tdStyle, fontWeight: 800, color: '#D97706', cursor: 'pointer', whiteSpace: 'nowrap' }}
          onClick={() => onToggleRegistroExpandido?.(expandido ? null : reg.id)}
          title="Abrir detalle del registro"
        >
          #{reg.numero_registro}
          <span style={{ marginLeft: 6, color: t.textMuted, fontWeight: 500 }}>{expandido ? '▲' : '▼'}</span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(reg.longitud)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(reg.ancho)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(reg.espesor)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(reg.cantidad)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(reg.cantidad_total)}
        </td>
        {verValoresEconomicos && (
          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: t.primary, fontVariantNumeric: 'tabular-nums' }}>
            {fmtPesos(reg.costo_directo)}
          </td>
        )}
        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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
        <td style={{ ...tdStyle, textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="Gráfico / esquema"
            onClick={() => setMenuGrafRegId(menuGrafRegId === reg.id ? null : reg.id)}
            style={btnIcon(tieneGraf ? t.primary : t.textMuted)}
          >
            📐
          </button>
          {menuGrafRegId === reg.id && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                zIndex: 20,
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                minWidth: 160,
                padding: 4,
              }}
            >
              <button
                type="button"
                disabled={!tieneGraf}
                onClick={() => {
                  const idx = media.findIndex((m) => String(m.label || '').startsWith('Gráfico'))
                  if (idx >= 0) setLightbox({ items: media, index: idx })
                  setMenuGrafRegId(null)
                }}
                style={menuItem(t, !tieneGraf)}
              >
                Ver gráfico
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuGrafRegId(null)
                  onPedirEsquema?.(reg)
                }}
                style={menuItem(t, false)}
              >
                Crear / editar esquema
              </button>
            </div>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={`${estado}`}
            onClick={() => {
              if (!rapido) return
              setMenuValRegId(menuValRegId === reg.id ? null : reg.id)
            }}
            style={{
              ...btnIcon(colorPunto),
              opacity: rapido ? 1 : 0.55,
              cursor: rapido ? 'pointer' : 'default',
            }}
            aria-label={`Validación: ${estado}`}
          >
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: colorPunto,
                boxShadow: `0 0 0 2px ${pastel.bg !== 'transparent' ? pastel.border : '#cbd5e1'}`,
              }}
            />
          </button>
          {menuValRegId === reg.id && rapido && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                zIndex: 20,
                background: t.bgCard,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                minWidth: 140,
                padding: 4,
              }}
            >
              <button
                type="button"
                disabled={ejecutandoMasivo || estado === 'Aprobado'}
                onClick={() => {
                  setMenuValRegId(null)
                  onValidacionAprobar?.([reg.id])
                }}
                style={menuItem(t, ejecutandoMasivo || estado === 'Aprobado')}
              >
                ✅ Aprobar
              </button>
              <button
                type="button"
                disabled={ejecutandoMasivo}
                onClick={() => {
                  setMenuValRegId(null)
                  onPedirComentarioMasivo?.('Pendiente', [reg.id])
                }}
                style={menuItem(t, ejecutandoMasivo)}
              >
                🟡 Pendiente
              </button>
              <button
                type="button"
                disabled={ejecutandoMasivo}
                onClick={() => {
                  setMenuValRegId(null)
                  onPedirComentarioMasivo?.('Rechazado', [reg.id])
                }}
                style={menuItem(t, ejecutandoMasivo)}
              >
                🔴 Rechazar
              </button>
            </div>
          )}
        </td>
        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
          {renderMenuAcciones?.(reg)}
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={subCols} style={{ padding: 0, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ border: `1px solid ${t.primary}66`, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {renderHojaRegistro?.(reg)}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function subTh(t) {
  return {
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    padding: '6px 6px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${t.border}`,
    background: t.bg,
  }
}

function btnVal(bg, disabled) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    width: 26,
    height: 26,
    fontWeight: 800,
    fontSize: 12,
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
    fontSize: 16,
    lineHeight: 1,
    padding: '2px 4px',
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
    padding: '8px 10px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 600,
    color: t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    borderRadius: 6,
  }
}

export { PASTEL_ESTADO_VALIDACION }
