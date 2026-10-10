import { Fragment, useState } from 'react'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import {
  agruparLineasMismoInsumo,
  descripcionFilaInsumo,
  detalleSectorLinea,
  estadoFilaInsumo,
  previewPalabras,
  saldoNegociadoItem,
  saldoPresupuestadoItem,
} from './solicitudDetalleHelpers'
import { AlmacenHelpIcon, fmtCant, fmtMoney, useAlmacenTheme } from './almacenShared'

const ESTADO_COLOR = {
  pendiente: '#d97706',
  aprobado: '#059669',
  rechazado: '#dc2626',
  varios: '#64748b',
}

const ROW_H = 36

const COLS = [
  { key: 'cap', abbr: 'CAP.', tip: 'Capítulo de presupuesto', width: 110 },
  { key: 'item', abbr: 'ÍTEM', tip: 'Ítem y descripción. El texto completo aparece al pasar el cursor.', width: 280 },
  { key: 'just', abbr: 'JUST.', tip: 'Justificación. Se ven las primeras palabras; el texto completo aparece al pasar el cursor.', width: 150 },
  { key: 'prov', abbr: 'PROV.', tip: 'Proveedor elegido en la revisión de línea', width: 150 },
  { key: 'valor', abbr: 'CANT. / VALOR', tip: 'Cantidad pedida junto al valor de esa cantidad, con IVA incluido', width: 220, align: 'right' },
  { key: 'ubi', abbr: 'UBIC.', tip: 'Abscisa, tramo, PK-ID y mapa', width: 64, align: 'center' },
  { key: 'saldos', abbr: 'SALDOS', tip: 'Saldo negociado y saldo de presupuesto, en cantidades', width: 72, align: 'center' },
  { key: 'est', abbr: 'EST.', tip: 'Estado de la línea: Aprobado, Rechazado o Pendiente', width: 88 },
]

function cellBase(ui, { align = 'left', mono = false } = {}) {
  return {
    ...(mono ? ui.tdNum : ui.td),
    padding: '0 8px',
    height: ROW_H,
    maxHeight: ROW_H,
    lineHeight: `${ROW_H - 2}px`,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: align,
  }
}

function Trunc({ children, title }) {
  return (
    <span
      title={title || (typeof children === 'string' ? children : undefined)}
      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {children}
    </span>
  )
}

function ColHeader({ abbr, tip, style, align = 'left' }) {
  return (
    <th
      style={{
        ...style,
        padding: '6px 8px',
        height: 34,
        whiteSpace: 'nowrap',
        overflow: 'visible',
        textAlign: align,
        verticalAlign: 'middle',
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        width: '100%',
      }}
      >
        <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{abbr}</span>
        {tip && <AlmacenHelpIcon ayuda={tip} />}
      </span>
    </th>
  )
}

function textoCantidadJuntoValor(cantidad, unidad, valor, verEconomicos) {
  const cant = `${fmtCant(cantidad)}${unidad ? ` ${unidad}` : ''}`
  if (!verEconomicos || valor == null) return cant
  return `${cant} · ${fmtMoney(valor)}`
}

function etiquetaEstado(ev) {
  if (ev === 'aprobado') return 'Aprobado'
  if (ev === 'rechazado') return 'Rechazado'
  if (ev === 'varios') return 'Varios'
  return 'Pendiente'
}

function PanelLinea({ titulo, onClose, children }) {
  const ui = useAlmacenTheme()
  return (
    <div
      role="dialog"
      aria-label={titulo}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 16px 40px #0003',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>{titulo}</strong>
          <button type="button" style={ui.btnSecondary} onClick={onClose} aria-label="Cerrar panel">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Grilla reducida de materiales de una solicitud.
 * Ubicación y saldos viven en paneles; el valor de compra sigue la visibilidad del rol.
 */
export default function SolicitudMaterialesExcelTable({
  items = [],
  sol,
  puedeValidar = false,
  destacarSinInsumo = false,
  onRowClick,
  puedeSeleccionar = false,
  seleccion,
  onToggleLinea,
  puedeAsignar = false,
  onAsignarGrupo,
  onAprobarGrupo,
  verEconomicos = false,
  token,
  contratoId,
  t,
}) {
  const ui = useAlmacenTheme()
  const thBase = { ...ui.th, fontSize: 'var(--cc-xs)' }
  const [panel, setPanel] = useState(null)
  const cols = COLS.map((c) => (
    c.key === 'valor' && !verEconomicos
      ? { ...c, abbr: 'CANT.', tip: 'Cantidad pedida. Este rol no ve valores en dinero.', width: 120 }
      : c
  ))
  const filas = agruparLineasMismoInsumo(items)

  if (!items.length) {
    return (
      <div style={{ ...ui.sheetWrap, padding: 16, color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
        No hay materiales en esta solicitud.
      </div>
    )
  }

  const minWidth = cols.reduce((acc, c) => acc + c.width, 0) + (puedeSeleccionar ? 36 : 0)
  const colSpan = cols.length + (puedeSeleccionar ? 1 : 0)
  const panelItems = panel?.items || []

  return (
    <>
      <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
        <table style={{ ...ui.sheetTable, minWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {puedeSeleccionar && <col style={{ width: 36 }} />}
            {cols.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {puedeSeleccionar && (
                <ColHeader abbr="" tip="Seleccionar líneas para asignar o aprobar en bloque" style={thBase} />
              )}
              {cols.map((c) => (
                <ColHeader
                  key={c.key}
                  abbr={c.abbr}
                  tip={c.tip}
                  align={c.align || 'left'}
                  style={thBase}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => {
              const it = fila.items[0]
              const ev = estadoFilaInsumo(fila.items, sol)
              const desc = descripcionFilaInsumo(fila) || '—'
              const descTitulo = fila.items.length > 1
                ? `${desc} — pedido en ${fila.items.length} sectores`
                : desc
              const faltaInsumo = fila.items.length === 1 && !it.insumo_id && (puedeValidar || destacarSinInsumo)
              const just = fila.variasJustificaciones
                ? { visible: 'Varias…', completo: fila.justificacion }
                : previewPalabras(fila.justificacion, 3)
              const sinInsumo = fila.items.length === 1 && (it.sin_insumo || (!it.insumo_id && !it.es_recurrente))
              const cantValor = textoCantidadJuntoValor(fila.cantidad, fila.unidad, fila.valor, verEconomicos)
              const grupoId = String(it.grupo_seleccion || '').trim()
              const prevGrupo = String(filas[idx - 1]?.items?.[0]?.grupo_seleccion || '').trim()
              const muestraGrupo = grupoId && grupoId !== prevGrupo
              const grupoItems = muestraGrupo
                ? items.filter((row) => String(row.grupo_seleccion || '').trim() === grupoId)
                : []
              const ids = fila.items.map((row) => row.id).filter((id) => id != null)
              const marcada = ids.length > 0 && ids.every((id) => seleccion?.has(id))
              return (
                <Fragment key={fila.key}>
                  {muestraGrupo && (
                    <tr>
                      <td
                        colSpan={colSpan}
                        style={{
                          ...cellBase(ui),
                          background: ui.accentSoft,
                          fontWeight: 700,
                          fontSize: 'var(--cc-xs)',
                          height: 'auto',
                          maxHeight: 'none',
                          lineHeight: 1.35,
                          whiteSpace: 'normal',
                          overflow: 'visible',
                          padding: '6px 8px',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                          <span title={it.grupo_etiqueta || 'Grupo de la misma selección'}>
                            {it.grupo_etiqueta || 'Grupo'}
                            {' '}
                            ({grupoItems.length})
                          </span>
                          {puedeAsignar && onAsignarGrupo && (
                            <button
                              type="button"
                              style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0, height: 24 }}
                              onClick={() => onAsignarGrupo(grupoId, grupoItems)}
                            >
                              Asignar insumo
                            </button>
                          )}
                          {puedeValidar && onAprobarGrupo && (
                            <button
                              type="button"
                              style={{ ...ui.btnSecondary, padding: '2px 8px', minHeight: 0, height: 24 }}
                              onClick={() => onAprobarGrupo(grupoId, grupoItems)}
                            >
                              Aprobar grupo
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    style={{ cursor: onRowClick ? 'pointer' : 'default', height: ROW_H }}
                    data-testid={fila.items.length > 1 ? 'linea-grupo-insumo' : 'linea-solicitud'}
                    onClick={() => onRowClick?.(it, idx)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = ui.accentSoft }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {puedeSeleccionar && (
                      <td
                        style={{ ...cellBase(ui, { align: 'center' }), overflow: 'visible' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={ids.length === 0}
                          aria-label={`Seleccionar línea ${it.numero_linea ?? idx + 1}`}
                          onChange={(e) => {
                            const checked = e.target.checked
                            ids.forEach((id) => onToggleLinea?.(id, checked))
                          }}
                        />
                      </td>
                    )}
                    <td style={cellBase(ui)}>
                      <Trunc title={fila.capituloTitulo}>{fila.capitulo}</Trunc>
                    </td>
                    <td style={{ ...cellBase(ui), fontWeight: 600, color: faltaInsumo ? '#92400e' : undefined }}>
                      <Trunc title={descTitulo}>{desc}</Trunc>
                    </td>
                    <td style={cellBase(ui)} data-testid="linea-justificacion">
                      {just.completo
                        ? <Trunc title={just.completo}>{just.visible}</Trunc>
                        : <Trunc>—</Trunc>}
                    </td>
                    <td style={{
                      ...cellBase(ui),
                      color: sinInsumo ? '#92400e' : undefined,
                      fontWeight: sinInsumo ? 700 : 500,
                    }}
                    >
                      <Trunc title={fila.proveedorTitulo}>{fila.proveedor}</Trunc>
                    </td>
                    <td style={cellBase(ui, { align: 'right', mono: true })} data-testid="linea-cant-valor">
                      <Trunc title={cantValor}>{cantValor}</Trunc>
                    </td>
                    <td
                      style={{ ...cellBase(ui, { align: 'center' }), overflow: 'visible' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Ubicación"
                        aria-label="Ver ubicación"
                        data-testid="linea-btn-ubicacion"
                        onClick={() => setPanel({ tipo: 'ubicacion', items: fila.items })}
                        style={{ ...ui.btnSecondary, padding: '2px 6px', minHeight: 0, height: 26, lineHeight: '22px' }}
                      >
                        📍
                      </button>
                    </td>
                    <td
                      style={{ ...cellBase(ui, { align: 'center' }), overflow: 'visible' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Saldos"
                        aria-label="Ver saldos"
                        data-testid="linea-btn-saldos"
                        onClick={() => setPanel({ tipo: 'saldos', items: fila.items })}
                        style={{ ...ui.btnSecondary, padding: '2px 6px', minHeight: 0, height: 26, lineHeight: '22px' }}
                      >
                        Σ
                      </button>
                    </td>
                    <td style={{
                      ...cellBase(ui),
                      color: ESTADO_COLOR[ev || 'pendiente'],
                      fontWeight: 700,
                      fontSize: 'var(--cc-xs)',
                    }}
                    >
                      <Trunc title={ev === 'varios' ? 'Hay sectores en estados distintos' : etiquetaEstado(ev)}>
                        {etiquetaEstado(ev)}
                      </Trunc>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {panel?.tipo === 'ubicacion' && panelItems.length > 0 && (
        <PanelLinea
          titulo={panelItems.length > 1 ? 'Dónde se pidió' : 'Ubicación de la línea'}
          onClose={() => setPanel(null)}
        >
          <div data-testid="linea-panel-sectores" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {panelItems.map((row) => {
              const sector = detalleSectorLinea(row)
              return (
                <dl
                  key={row.id ?? sector.pk}
                  style={{ margin: 0, fontSize: 'var(--cc-sm)', display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 8px' }}
                >
                  <dt style={{ color: ui.textMuted }}>Lugar</dt>
                  <dd style={{ margin: 0 }}>{sector.lugar}</dd>
                  <dt style={{ color: ui.textMuted }}>Abscisa</dt>
                  <dd style={{ margin: 0 }}>{sector.abscisa}</dd>
                  <dt style={{ color: ui.textMuted }}>PK-ID</dt>
                  <dd style={{ margin: 0 }}>{sector.pk}</dd>
                  <dt style={{ color: ui.textMuted }}>Cantidad</dt>
                  <dd style={{ margin: 0 }}>{fmtCant(sector.cantidad)}{sector.unidad ? ` ${sector.unidad}` : ''}</dd>
                </dl>
              )
            })}
          </div>
          {panelItems.length === 1 && (
            <div style={{ marginTop: 12 }} data-testid="linea-panel-mapa">
              {panelItems[0].pk_id ? (
                <AlmacenItemMapaPreview
                  t={t}
                  token={token}
                  contratoId={contratoId}
                  pkLabel={panelItems[0].pk_label || panelItems[0].pk_id}
                  height={220}
                  interactive
                  showBasemapToggle
                />
              ) : (
                <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Esta línea no tiene PK-ID para mostrar el mapa.</div>
              )}
            </div>
          )}
        </PanelLinea>
      )}
      {panel?.tipo === 'saldos' && panelItems.length > 0 && (
        <PanelLinea titulo={panelItems.length > 1 ? 'Saldos por sector' : 'Saldos de la línea'} onClose={() => setPanel(null)}>
          {panelItems.map((row) => (
            <div key={row.id ?? row.pk_id} style={{ marginBottom: panelItems.length > 1 ? 12 : 0 }}>
              {panelItems.length > 1 && (
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', marginBottom: 4 }}>
                  {detalleSectorLinea(row).lugar} · {detalleSectorLinea(row).pk}
                </div>
              )}
              <SaldosContenido item={row} />
            </div>
          ))}
        </PanelLinea>
      )}
    </>
  )
}

function SaldosContenido({ item }) {
  const ui = useAlmacenTheme()
  const neg = saldoNegociadoItem(item)
  const ppto = saldoPresupuestadoItem(item)
  const und = item.unidad || item.contexto_presupuesto?.unidad || ''
  const fila = (label, valor) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${ui.textMuted}22` }}>
      <span>{label}</span>
      <strong>{valor == null ? '—' : `${fmtCant(valor)}${und ? ` ${und}` : ''}`}</strong>
    </div>
  )
  return (
    <div data-testid="linea-panel-saldos" style={{ fontSize: 'var(--cc-sm)' }}>
      {fila('Saldo negociado', neg)}
      {fila('Saldo de presupuesto', ppto)}
    </div>
  )
}
