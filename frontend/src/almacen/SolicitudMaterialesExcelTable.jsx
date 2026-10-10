import { Fragment, useState } from 'react'
import AlmacenItemMapaPreview from './AlmacenItemMapaPreview'
import {
  descripcionCompletaLinea,
  estadoValidacionItem,
  etiquetaProveedorLinea,
  fmtAbscisasLinea,
  previewPalabras,
  saldoNegociadoItem,
  saldoPresupuestadoItem,
  valorCompraLinea,
} from './solicitudDetalleHelpers'
import { AlmacenHelpIcon, fmtCant, fmtMoney, useAlmacenTheme } from './almacenShared'

const ESTADO_COLOR = {
  pendiente: '#d97706',
  aprobado: '#059669',
  rechazado: '#dc2626',
}

const ROW_H = 36

const COLS = [
  { key: 'cap', abbr: 'CAP.', tip: 'Capítulo de presupuesto', width: 110 },
  { key: 'item', abbr: 'ÍTEM', tip: 'Ítem y descripción. El texto completo aparece al pasar el cursor.', width: 280 },
  { key: 'just', abbr: 'JUST.', tip: 'Justificación. Se ven las primeras palabras; el texto completo aparece al pasar el cursor.', width: 150 },
  { key: 'prov', abbr: 'PROV.', tip: 'Proveedor elegido en la revisión de línea', width: 150 },
  { key: 'valor', abbr: 'VALOR', tip: 'Valor de la compra: cantidad por el valor ofertado, con IVA incluido', width: 120, align: 'right' },
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

function textoItemVisible(it) {
  return descripcionCompletaLinea(it) || '—'
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
      ? { ...c, abbr: 'CANT.', tip: 'Cantidad pedida. Este rol no ve valores en dinero.' }
      : c
  ))

  if (!items.length) {
    return (
      <div style={{ ...ui.sheetWrap, padding: 16, color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
        No hay materiales en esta solicitud.
      </div>
    )
  }

  const minWidth = cols.reduce((acc, c) => acc + c.width, 0) + (puedeSeleccionar ? 36 : 0)
  const colSpan = cols.length + (puedeSeleccionar ? 1 : 0)
  const panelItem = panel ? items.find((it) => it.id === panel.id) || panel.item : null

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
            {items.map((it, idx) => {
              const ev = estadoValidacionItem(it, sol)
              const desc = textoItemVisible(it)
              const faltaInsumo = !it.insumo_id && (puedeValidar || destacarSinInsumo)
              const just = previewPalabras(it.observacion_residente, 3)
              const prov = etiquetaProveedorLinea(it)
              const und = it.unidad || it.contexto_presupuesto?.unidad || ''
              const cantTxt = `${fmtCant(it.cantidad)}${und ? ` ${und}` : ''}`
              const valor = verEconomicos ? valorCompraLinea(it) : null
              const valorTxt = verEconomicos ? (valor == null ? '—' : fmtMoney(valor)) : cantTxt
              const grupoId = String(it.grupo_seleccion || '').trim()
              const prevGrupo = String(items[idx - 1]?.grupo_seleccion || '').trim()
              const muestraGrupo = grupoId && grupoId !== prevGrupo
              const grupoItems = muestraGrupo
                ? items.filter((row) => String(row.grupo_seleccion || '').trim() === grupoId)
                : []
              const marcada = Boolean(it.id != null && seleccion?.has(it.id))
              return (
                <Fragment key={it.id ?? `row-${idx}`}>
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
                          disabled={it.id == null}
                          aria-label={`Seleccionar línea ${it.numero_linea ?? idx + 1}`}
                          onChange={(e) => onToggleLinea?.(it.id, e.target.checked)}
                        />
                      </td>
                    )}
                    <td style={cellBase(ui)}>
                      <Trunc title={it.capitulo || '—'}>{it.capitulo || '—'}</Trunc>
                    </td>
                    <td style={{ ...cellBase(ui), fontWeight: 600, color: faltaInsumo ? '#92400e' : undefined }}>
                      <Trunc title={desc}>{desc}</Trunc>
                    </td>
                    <td style={cellBase(ui)} data-testid="linea-justificacion">
                      {just.completo
                        ? <Trunc title={just.completo}>{just.visible}</Trunc>
                        : <Trunc>—</Trunc>}
                    </td>
                    <td style={{
                      ...cellBase(ui),
                      color: (it.sin_insumo || (!it.insumo_id && !it.es_recurrente)) ? '#92400e' : undefined,
                      fontWeight: (it.sin_insumo || (!it.insumo_id && !it.es_recurrente)) ? 700 : 500,
                    }}
                    >
                      <Trunc title={prov}>{prov}</Trunc>
                    </td>
                    <td style={cellBase(ui, { align: 'right', mono: true })}>
                      <Trunc title={valorTxt}>{valorTxt}</Trunc>
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
                        onClick={() => setPanel({ tipo: 'ubicacion', id: it.id, item: it })}
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
                        onClick={() => setPanel({ tipo: 'saldos', id: it.id, item: it })}
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
                      <Trunc>
                        {ev === 'aprobado' ? 'Aprobado' : ev === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                      </Trunc>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {panel?.tipo === 'ubicacion' && panelItem && (
        <PanelLinea titulo="Ubicación de la línea" onClose={() => setPanel(null)}>
          <dl style={{ margin: 0, fontSize: 'var(--cc-sm)', display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 8px' }}>
            <dt style={{ color: ui.textMuted }}>Abscisa</dt>
            <dd style={{ margin: 0 }}>{fmtAbscisasLinea(panelItem)}</dd>
            <dt style={{ color: ui.textMuted }}>Tramo</dt>
            <dd style={{ margin: 0 }}>{panelItem.tramo || panelItem.contexto_presupuesto?.tramo || '—'}</dd>
            <dt style={{ color: ui.textMuted }}>PK-ID</dt>
            <dd style={{ margin: 0 }}>{panelItem.pk_id || '—'}</dd>
          </dl>
          <div style={{ marginTop: 12 }} data-testid="linea-panel-mapa">
            {panelItem.pk_id ? (
              <AlmacenItemMapaPreview
                t={t}
                token={token}
                contratoId={contratoId}
                pkLabel={panelItem.pk_label || panelItem.pk_id}
                height={220}
                interactive
                showBasemapToggle
              />
            ) : (
              <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Esta línea no tiene PK-ID para mostrar el mapa.</div>
            )}
          </div>
        </PanelLinea>
      )}
      {panel?.tipo === 'saldos' && panelItem && (
        <PanelLinea titulo="Saldos de la línea" onClose={() => setPanel(null)}>
          <SaldosContenido item={panelItem} />
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
