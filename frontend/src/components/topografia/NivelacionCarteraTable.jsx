/**
 * Cartera consolidada de Circuito de Nivelación (tabla Excel + cards móvil).
 * Solo lectura; clic/tap abre popup de edición (patrón Poligonal).
 */
import { useMemo } from 'react'
import {
  distanciaVminusFila,
  distanciaVplusFila,
  filaTieneVminus,
  filaTieneVplus,
  hilosIncongruentes,
} from '../../utils/topografia_nivelacion'
import { themeColorScheme } from './topografiaShared'
import { topoSheetStyles } from './topoSheetStyles'
import { fmtN } from './nivelacionUiShared'

function fmtHilos(bloque, esAutomatico) {
  if (!bloque) return '—'
  if (esAutomatico) {
    const has = [bloque.hS, bloque.hM, bloque.hI].some((v) => v !== '' && v != null)
    if (!has) return '—'
    return `${fmtN(bloque.hS, 3)} / ${fmtN(bloque.hM, 3)} / ${fmtN(bloque.hI, 3)}`
  }
  return bloque.lectura !== '' && bloque.lectura != null ? fmtN(bloque.lectura) : '—'
}

function CierreBadge() {
  return (
    <span
      title="Fila de cierre"
      style={{
        display: 'inline-block',
        marginTop: 2,
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 'var(--cc-xxs)',
        fontWeight: 800,
        color: '#fff',
        background: '#7c3aed',
        letterSpacing: '0.3px',
      }}
    >
      CIERRE
    </span>
  )
}

export default function NivelacionCarteraTable({
  filas = [],
  filasVista = [],
  tipoNivel = 'electronico',
  ui,
  bloques,
  isCompact = false,
  bmInicialNombre = '',
  editandoIdx = null,
  onEditar = null,
  onEliminar = null,
  editable = false,
}) {
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const esAutomatico = tipoNivel === 'automatico'
  const thBase = { ...sheet.th, position: 'sticky', top: 0, zIndex: 2 }
  const tdBase = { ...sheet.td }
  const thGroup = {
    ...thBase,
    textAlign: 'center',
    fontSize: 'var(--cc-xxs)',
  }
  const thGroupColor = (bk) => ({
    ...thGroup,
    background: bloques[bk]?.header || sheet.th.background,
  })
  const thSubGroupColor = (bk) => ({
    ...thBase,
    fontSize: 'var(--cc-xxs)',
    textAlign: 'center',
    background: bloques[bk]?.bg || sheet.th.background,
  })
  const tdGroupColor = (bk) => ({
    ...tdBase,
    textAlign: 'center',
    background: bloques[bk]?.bg,
    fontSize: 'var(--cc-xs)',
  })

  if (!filasVista.length) {
    return (
      <div style={{ padding: '16px 12px', color: ui.textMuted, fontSize: 'var(--cc-sm)', textAlign: 'center' }}>
        Sin lecturas en la cartera. Use el panel superior y «Agregar lectura».
      </div>
    )
  }

  const rowClick = (idx, fila, ev) => {
    if (!onEditar || !editable) return
    if (ev?.target?.closest?.('button, a')) return
    onEditar(idx, fila)
  }

  if (isCompact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filasVista.map((vistaRow, idx) => {
          const fila = filas[idx] || vistaRow
          const esCierre = Boolean(fila.es_fila_cierre)
          const distVp = vistaRow.distancia_vplus_calc
          const distVm = vistaRow.distancia_vminus_calc
          const distOver = (distVp != null && distVp > 50) || (distVm != null && distVm > 50)
          const selected = editandoIdx === idx
          const border = ui.t?.border || '#e2e8f0'
          return (
            <div
              key={idx}
              role={editable && onEditar ? 'button' : undefined}
              tabIndex={editable && onEditar ? 0 : undefined}
              onClick={(ev) => rowClick(idx, fila, ev)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  rowClick(idx, fila, ev)
                }
              }}
              title={editable && onEditar ? 'Toque para editar lectura' : undefined}
              style={{
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${selected ? ui.accent : (esCierre ? bloques.cierre.border : border)}`,
                background: selected
                  ? `${ui.accent}14`
                  : esCierre
                    ? bloques.cierre.row
                    : distOver
                      ? bloques.alerta.row
                      : (ui.t?.bgCard || '#fff'),
                boxShadow: esCierre ? `inset 3px 0 0 ${bloques.cierre.border}` : undefined,
                cursor: editable && onEditar ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div>
                  <strong>#{idx + 1}</strong>
                  {' · '}
                  <span style={{ fontWeight: 700 }}>{fila.nombre_punto || (idx === 0 ? bmInicialNombre : '—')}</span>
                  {' · '}
                  <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
                    {idx === 0 ? 'BM' : (fila.tipo_punto || '—')}
                  </span>
                  {esCierre && (
                    <div><CierreBadge /></div>
                  )}
                </div>
                {editable && onEliminar && (
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, padding: '4px 10px', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); onEliminar(idx) }}
                    title="Eliminar lectura"
                  >
                    🗑
                  </button>
                )}
              </div>
              {['vplus', 'vi', 'vminus'].map((bk) => (
                <div
                  key={bk}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr auto',
                    gap: 6,
                    alignItems: 'center',
                    padding: '4px 6px',
                    marginBottom: 4,
                    borderRadius: 6,
                    background: bloques[bk]?.bg,
                    fontSize: 'var(--cc-xs)',
                  }}
                >
                  <strong style={{ color: bloques[bk]?.accent }}>{bk === 'vplus' ? 'V+' : bk === 'vi' ? 'Vi' : 'V−'}</strong>
                  <span>{fmtHilos(fila[bk], esAutomatico)}</span>
                  {(bk === 'vplus' || bk === 'vminus') && (
                    <span style={{ color: ui.textMuted }}>
                      d=
                      {fmtN(bk === 'vplus' ? distVp : distVm, 2)}
                    </span>
                  )}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6, fontSize: 'var(--cc-xs)' }}>
                <div>
                  <div style={{ color: ui.textMuted, fontWeight: 700 }}>H. ins.</div>
                  <div style={{ fontWeight: 700, color: ui.accent }}>{fmtN(vistaRow.altura_instrumento)}</div>
                </div>
                <div>
                  <div style={{ color: ui.textMuted, fontWeight: 700 }}>Cota</div>
                  <div style={{ fontWeight: 700 }}>{fmtN(vistaRow.cota)}</div>
                </div>
                <div>
                  <div style={{ color: ui.textMuted, fontWeight: 700 }}>PK</div>
                  <div>{fila.ubicacion_pk || fila.abscisa || '—'}</div>
                </div>
              </div>
              {fila.descripcion_punto ? (
                <div style={{ marginTop: 4, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{fila.descripcion_punto}</div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch', colorScheme: themeColorScheme(ui.t) }}
      className="cc-topo-table-scroll"
    >
      <table style={{ ...sheet.sheetTable, tableLayout: 'auto' }}>
        <thead>
          <tr>
            <th style={thBase} rowSpan={2}>#</th>
            <th style={{ ...thBase, width: 72 }} rowSpan={2}>Punto</th>
            <th style={{ ...thBase, minWidth: 90 }} rowSpan={2}>Tipo</th>
            <th style={thGroupColor('vplus')} colSpan={esAutomatico ? 4 : 2}>V+</th>
            <th style={thGroupColor('vi')} colSpan={esAutomatico ? 3 : 1}>Vi</th>
            <th style={thGroupColor('vminus')} colSpan={esAutomatico ? 4 : 2}>V−</th>
            <th style={thGroup} rowSpan={2}>H. ins.</th>
            <th style={thGroup} rowSpan={2}>Cota</th>
            <th style={thBase} rowSpan={2}>Abscisa/PK</th>
            <th style={thBase} rowSpan={2}>Descripción</th>
            {editable && <th style={thBase} rowSpan={2} />}
          </tr>
          {esAutomatico ? (
            <tr>
              {['V+', 'Vi', 'V−'].flatMap((label) => {
                const cols = ['S', 'M', 'I'].map((h) => (
                  <th key={`${label}-${h}`} style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>{h}</th>
                ))
                if (label === 'V+') cols.push(<th key="Vp-d" style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>Dist</th>)
                if (label === 'V−') cols.push(<th key="Vm-d" style={{ ...thBase, fontSize: 'var(--cc-xxs)', textAlign: 'center' }}>Dist</th>)
                return cols
              })}
            </tr>
          ) : (
            <tr>
              <th style={thSubGroupColor('vplus')}>Lect.</th>
              <th style={thSubGroupColor('vplus')}>Dist</th>
              <th style={thSubGroupColor('vi')}>Lect.</th>
              <th style={thSubGroupColor('vminus')}>Lect.</th>
              <th style={thSubGroupColor('vminus')}>Dist</th>
            </tr>
          )}
        </thead>
        <tbody>
          {filasVista.map((vistaRow, idx) => {
            const fila = filas[idx] || vistaRow
            const esCierre = Boolean(fila.es_fila_cierre)
            const distVp = vistaRow.distancia_vplus_calc ?? distanciaVplusFila(fila, tipoNivel)
            const distVm = vistaRow.distancia_vminus_calc ?? distanciaVminusFila(fila, tipoNivel)
            const distOver = (distVp != null && distVp > 50) || (distVm != null && distVm > 50)
            const selected = editandoIdx === idx
            const hilosBad = esAutomatico && ['vplus', 'vi', 'vminus'].some((bk) => hilosIncongruentes(fila[bk], tipoNivel))

            const celdasHilos = (bk) => {
              if (esCierre && bk !== 'vminus') {
                if (!esAutomatico) return <td key={bk} style={tdGroupColor(bk)}>—</td>
                return ['hS', 'hM', 'hI'].map((hk) => <td key={`${bk}-${hk}`} style={tdGroupColor(bk)}>—</td>)
              }
              if (!esAutomatico) {
                return <td key={bk} style={tdGroupColor(bk)}>{fmtHilos(fila[bk], false)}</td>
              }
              return ['hS', 'hM', 'hI'].map((hk) => (
                <td key={`${bk}-${hk}`} style={tdGroupColor(bk)}>{fmtN(fila[bk]?.[hk], 3)}</td>
              ))
            }

            return (
              <tr
                key={idx}
                onClick={(ev) => rowClick(idx, fila, ev)}
                title={editable && onEditar ? 'Clic para editar lectura' : undefined}
                style={{
                  background: selected
                    ? `${ui.accent}18`
                    : esCierre
                      ? bloques.cierre.row
                      : distOver || hilosBad
                        ? bloques.alerta.row
                        : undefined,
                  outline: esCierre ? `2px solid ${bloques.cierre.border}` : selected ? `2px solid ${ui.accent}` : undefined,
                  boxShadow: esCierre ? `inset 3px 0 0 ${bloques.cierre.border}` : undefined,
                  cursor: editable && onEditar ? 'pointer' : 'default',
                }}
              >
                <td style={tdBase}>
                  {idx + 1}
                  {esCierre && <div><CierreBadge /></div>}
                </td>
                <td style={tdBase}>
                  <span style={{ fontWeight: esCierre || idx === 0 ? 700 : 400 }}>
                    {fila.nombre_punto || (idx === 0 ? bmInicialNombre : '—')}
                  </span>
                </td>
                <td style={tdBase}>{idx === 0 ? 'BM' : (fila.tipo_punto || '—')}</td>
                {celdasHilos('vplus')}
                <td style={{ ...tdGroupColor('vplus'), color: distVp > 50 ? '#dc2626' : undefined, fontWeight: distVp > 50 ? 700 : 400 }}>
                  {esCierre ? '—' : (filaTieneVplus(fila, tipoNivel) ? fmtN(distVp, 2) : '—')}
                </td>
                {celdasHilos('vi')}
                {celdasHilos('vminus')}
                <td style={{ ...tdGroupColor('vminus'), color: distVm > 50 ? '#dc2626' : undefined, fontWeight: distVm > 50 ? 700 : 400 }}>
                  {filaTieneVminus(fila, tipoNivel) ? fmtN(distVm, 2) : '—'}
                </td>
                <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: ui.accent }}>{fmtN(vistaRow.altura_instrumento)}</td>
                <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700 }}>{fmtN(vistaRow.cota)}</td>
                <td style={tdBase}>{fila.ubicacion_pk || fila.abscisa || '—'}</td>
                <td style={tdBase}>{fila.descripcion_punto || '—'}</td>
                {editable && (
                  <td style={tdBase}>
                    {onEliminar && (
                      <button
                        type="button"
                        style={{ ...ui.btnSecondary, padding: '2px 8px' }}
                        onClick={(e) => { e.stopPropagation(); onEliminar(idx) }}
                        title="Eliminar lectura"
                      >
                        🗑
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
