import { useState } from 'react'
import AlmacenPkMapaSelector from './AlmacenPkMapaSelector'
import PresupuestoItemSelector from './PresupuestoItemSelector'
import SolicitudLineaUbicacionEditor from './SolicitudLineaUbicacionEditor'
import { AlmacenHelpIcon, useAlmacenTheme } from './almacenShared'

const ROW_H = 40

const COLS = [
  { key: 'cap', abbr: 'Capítulo', tip: 'Capítulo de presupuesto', width: 110 },
  { key: 'item', abbr: 'Ítem', tip: 'Ítem de cobro', width: 150 },
  {
    key: 'mat',
    abbr: 'Material',
    tip: 'Describa el material que necesita. El Contratista Gerencial seleccionará el insumo del catálogo al aprobar.',
    width: 200,
  },
  {
    key: 'prin',
    abbr: 'Principal',
    tip: 'Marcado = consume presupuesto del ítem. Desmarcado = insumo asociado (no descuenta saldo ni alerta sobrepresupuesto).',
    width: 78,
  },
  { key: 'ubi', abbr: 'Ubicación', tip: 'PK-ID, registro de presupuesto, tramo, costado y abscisas', width: 110 },
  { key: 'cant', abbr: 'Cantidad', tip: 'Cantidad solicitada', width: 80 },
  { key: 'obs', abbr: 'Observación', tip: 'Notas de esta línea', width: 140 },
  { key: 'acc', abbr: '', tip: 'Agregar o eliminar fila', width: 80 },
]

const MATERIAL_HELP = COLS.find((c) => c.key === 'mat').tip

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
      title={tip}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        width: '100%',
      }}
      >
        {abbr ? <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{abbr}</span> : null}
        {tip && abbr ? <AlmacenHelpIcon ayuda={tip} /> : null}
      </span>
    </th>
  )
}

function ubicacionResumen(it) {
  const pk = it.pk_label || it.pk_id || ''
  if (!pk) return 'Sin ubicar'
  const parts = [pk]
  if (it.tramo) parts.push(it.tramo)
  if (it.costado) parts.push(it.costado)
  return parts.join(' · ')
}

/**
 * Grilla editable tipo Excel de líneas de solicitud (nueva / editar).
 * Ubicación: mapa satelital directo → popup de finalización (registro/tramo/costado/abscisas).
 */
export default function SolicitudFormExcelTable({
  items,
  busy,
  t,
  token,
  contratoId,
  solicitudId,
  onPptoChange,
  onDescripcionChange,
  onCantidadChange,
  onPrincipalChange,
  onObservacionChange,
  onPkSelect,
  onPkClear,
  onRegistroSelect,
  onUbicacionChange,
  onAddRow,
  onRemoveRow,
}) {
  const ui = useAlmacenTheme()
  /** { idx, phase: 'mapa' | 'detalle' } */
  const [ubicacionFlow, setUbicacionFlow] = useState(null)
  const thBase = { ...ui.th, fontSize: 'var(--cc-xs)' }
  const minWidth = COLS.reduce((acc, c) => acc + c.width, 0)
  const cellInp = {
    ...ui.input,
    width: '100%',
    minWidth: 0,
    padding: '4px 6px',
    fontSize: 'var(--cc-xs)',
    height: 28,
    boxSizing: 'border-box',
  }
  const tdBase = {
    ...ui.td,
    padding: '4px 6px',
    height: ROW_H,
    verticalAlign: 'middle',
  }

  const iconBtn = (extra = {}) => ({
    ...ui.btnSecondary,
    padding: '4px 8px',
    fontSize: 'var(--cc-xs)',
    lineHeight: 1.2,
    fontWeight: 700,
    minWidth: 30,
    ...extra,
  })

  const flowIdx = ubicacionFlow?.idx
  const flowItem = flowIdx != null ? items[flowIdx] : null
  const theme = t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }

  return (
    <>
      <div
        style={{ ...ui.sheetWrap, overflow: 'visible' }}
        className="cc-almacen-table-scroll cc-almacen-items-sheet cc-almacen-solicitud-excel-sheet"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...ui.sheetTable, minWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {COLS.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <ColHeader
                    key={c.key}
                    abbr={c.abbr}
                    tip={c.tip}
                    style={thBase}
                    align={c.key === 'cant' || c.key === 'acc' || c.key === 'ubi' || c.key === 'prin' ? 'center' : 'left'}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id ?? `new-${idx}`}>
                  <PresupuestoItemSelector
                    variant="excel"
                    capitulo={it.presupuesto_capitulo}
                    item={it.presupuesto_item}
                    disabled={busy}
                    onChange={(sel) => onPptoChange(idx, sel)}
                  />
                  <td style={{ ...tdBase, overflow: 'visible' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <input
                        style={{ ...cellInp, flex: 1 }}
                        value={it.descripcion_solicitada || ''}
                        disabled={busy}
                        placeholder="Describa el material…"
                        title={it.descripcion_solicitada || ''}
                        onChange={(e) => onDescripcionChange(idx, e.target.value)}
                      />
                      <AlmacenHelpIcon ayuda={MATERIAL_HELP} />
                    </div>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <label
                      title={it.es_principal !== false
                        ? 'Insumo principal: descuenta presupuesto'
                        : 'Insumo asociado: no descuenta presupuesto'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: busy ? 'default' : 'pointer',
                        fontSize: 'var(--cc-xs)',
                        fontWeight: 600,
                        color: it.es_principal !== false ? ui.accent : ui.textMuted,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={it.es_principal !== false}
                        disabled={busy}
                        onChange={(e) => onPrincipalChange?.(idx, e.target.checked)}
                        aria-label="Insumo principal del ítem"
                      />
                    </label>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <button
                      type="button"
                      title={ubicacionResumen(it)}
                      disabled={busy}
                      onClick={() => setUbicacionFlow({ idx, phase: 'mapa' })}
                      style={{
                        ...iconBtn({
                          background: it.pk_id ? `${ui.accent}18` : undefined,
                          borderColor: it.pk_id ? ui.accent : undefined,
                          color: it.pk_id ? ui.accent : undefined,
                          maxWidth: '100%',
                        }),
                      }}
                    >
                      <span aria-hidden>🗺️</span>
                      <span style={{
                        display: 'inline-block',
                        maxWidth: 72,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                        marginLeft: 4,
                      }}
                      >
                        {it.pk_label || it.pk_id || 'PK'}
                      </span>
                    </button>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <input
                      style={{ ...cellInp, textAlign: 'right' }}
                      type="number"
                      min="0"
                      step="any"
                      value={it.cantidad}
                      disabled={busy}
                      onChange={(e) => onCantidadChange(idx, e.target.value)}
                    />
                  </td>
                  <td style={tdBase}>
                    <input
                      style={cellInp}
                      value={it.observacion_residente || ''}
                      disabled={busy}
                      placeholder="Opcional…"
                      title={it.observacion_residente || ''}
                      onChange={(e) => onObservacionChange(idx, e.target.value)}
                    />
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      title="Agregar fila"
                      disabled={busy}
                      onClick={() => onAddRow(idx)}
                      style={iconBtn({ marginRight: 4 })}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      title="Eliminar fila"
                      disabled={busy}
                      onClick={() => onRemoveRow(idx)}
                      style={iconBtn({ color: '#dc2626', borderColor: '#dc262666' })}
                    >
                      −
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ubicacionFlow?.phase === 'mapa' && flowItem && (
        <AlmacenPkMapaSelector
          t={theme}
          token={token}
          contratoId={contratoId}
          pkIdSeleccionado={flowItem.pk_id_id ? String(flowItem.pk_id_id) : ''}
          pkLabel={flowItem.pk_label || flowItem.pk_id}
          autoOpen
          hideTrigger
          initialBasemap="satelite"
          onSeleccionar={(sel) => {
            onPkSelect(flowIdx, sel)
            setUbicacionFlow({ idx: flowIdx, phase: 'detalle' })
          }}
          onLimpiar={() => onPkClear(flowIdx)}
          onMapClose={() => {
            // Si ya había PK y el usuario cierra el mapa, permitir completar detalle.
            if (flowItem.pk_id) {
              setUbicacionFlow({ idx: flowIdx, phase: 'detalle' })
            } else {
              setUbicacionFlow(null)
            }
          }}
        />
      )}

      {ubicacionFlow?.phase === 'detalle' && flowItem && (
        <SolicitudLineaUbicacionEditor
          item={flowItem}
          lineIndex={flowIdx + 1}
          t={t}
          solicitudId={solicitudId}
          busy={busy}
          onRegistroSelect={(reg) => onRegistroSelect(flowIdx, reg)}
          onUbicacionChange={(patch) => onUbicacionChange(flowIdx, patch)}
          onClose={() => setUbicacionFlow(null)}
        />
      )}
    </>
  )
}
