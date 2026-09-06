import { useState } from 'react'
import PresupuestoItemSelector from './PresupuestoItemSelector'
import SolicitudLineaUbicacionEditor from './SolicitudLineaUbicacionEditor'
import { AlmacenHelpIcon, useAlmacenTheme } from './almacenShared'

const ROW_H = 40

const COLS = [
  { key: 'cap', abbr: 'Capítulo', tip: 'Capítulo de presupuesto', width: 120 },
  { key: 'item', abbr: 'Ítem', tip: 'Ítem de cobro', width: 160 },
  {
    key: 'mat',
    abbr: 'Material',
    tip: 'Describa el material que necesita. El Contratista Gerencial seleccionará el insumo del catálogo al aprobar.',
    width: 240,
  },
  { key: 'ubi', abbr: 'Ubicación', tip: 'PK-ID, registro de presupuesto, tramo, costado y abscisas', width: 120 },
  { key: 'cant', abbr: 'Cantidad', tip: 'Cantidad solicitada', width: 88 },
  { key: 'obs', abbr: 'Observación', tip: 'Notas de esta línea', width: 160 },
  { key: 'acc', abbr: '', tip: 'Agregar o eliminar fila', width: 88 },
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
  onObservacionChange,
  onPkSelect,
  onPkClear,
  onRegistroSelect,
  onUbicacionChange,
  onAddRow,
  onRemoveRow,
}) {
  const ui = useAlmacenTheme()
  const [ubicacionIdx, setUbicacionIdx] = useState(null)
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

  return (
    <>
      <div style={ui.sheetWrap} className="cc-almacen-table-scroll cc-almacen-items-sheet">
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
                  align={c.key === 'cant' || c.key === 'acc' || c.key === 'ubi' ? 'center' : 'left'}
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
                  <button
                    type="button"
                    title={ubicacionResumen(it)}
                    disabled={busy}
                    onClick={() => setUbicacionIdx(idx)}
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

      {ubicacionIdx != null && items[ubicacionIdx] && (
        <SolicitudLineaUbicacionEditor
          item={items[ubicacionIdx]}
          lineIndex={ubicacionIdx + 1}
          t={t}
          token={token}
          contratoId={contratoId}
          solicitudId={solicitudId}
          busy={busy}
          onPkSelect={(sel) => onPkSelect(ubicacionIdx, sel)}
          onPkClear={() => onPkClear(ubicacionIdx)}
          onRegistroSelect={(reg) => onRegistroSelect(ubicacionIdx, reg)}
          onUbicacionChange={(patch) => onUbicacionChange(ubicacionIdx, patch)}
          onClose={() => setUbicacionIdx(null)}
        />
      )}
    </>
  )
}
