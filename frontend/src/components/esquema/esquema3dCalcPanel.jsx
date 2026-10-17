/**
 * Panel de cálculo de volúmenes (tabla tipo Excel, paleta institucional).
 */
import React, { useMemo, useState } from 'react'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  formatVolumeM3,
  isValidCalcSolid,
  lastCalcLineNeedsNombre,
  resolveCalcLine,
} from './esquema3dCalc.js'

export function Esquema3dCalcPanel({
  t,
  ui,
  open,
  onClose,
  calcs,
  activeCalcId,
  onActiveCalcId,
  onCreateCalc,
  onRenameCalc,
  onDeleteCalc,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  solids,
  selectedSolidIds,
  onHint,
  onHighlightSolid,
  highlightedSolidId = null,
  embedded = false,
}) {
  const [newName, setNewName] = useState('Excavación')
  const active = useMemo(
    () => (calcs || []).find((c) => c.id === activeCalcId) || (calcs || [])[0] || null,
    [calcs, activeCalcId],
  )
  const total = active ? calcTotalM3(active, solids) : 0
  const lineOptions = useMemo(() => (
    (active?.lines || [])
      .filter((l) => l.solidId)
      .map((l) => ({
        solidId: l.solidId,
        nombre: l.nombre || 'Elemento',
      }))
  ), [active])

  if (!open) return null

  const defaultDiscountFrom = (exceptSolidId) => {
    const sumLine = (active?.lines || []).find((l) => l.op === 'sum' && l.solidId && l.solidId !== exceptSolidId)
    if (sumLine) return sumLine.solidId
    const other = (active?.lines || []).find((l) => l.solidId && l.solidId !== exceptSolidId)
    return other?.solidId || null
  }

  const applyOp = (line, op) => {
    const discountFromSolidId = op === 'subtract'
      ? (line.discountFromSolidId || defaultDiscountFrom(line.solidId))
      : null
    const patch = { op, discountFromSolidId }
    onUpdateLine?.(active.id, line.id, patch)
    if (op === 'subtract') {
      const nextLine = { ...line, ...patch }
      const probe = resolveCalcLine(nextLine, solids, {
        ...active,
        lines: (active.lines || []).map((l) => (
          l.id === line.id ? nextLine : l
        )),
      })
      if (!probe.ok) {
        onHint?.(probe.error || 'No se puede descontar: sin volumen común.')
      }
    }
  }

  const addFromSelection = () => {
    const ids = selectedSolidIds || []
    if (!ids.length) {
      onHint?.('Seleccione uno o más sólidos en el dibujo para agregarlos al cálculo.')
      return
    }
    const needsName = lastCalcLineNeedsNombre(active)
    if (needsName) {
      onHint?.('Nombre el último sólido del cálculo antes de agregar otro.')
      return
    }
    let added = 0
    let skipped = 0
    for (const id of ids) {
      const solid = (solids || []).find((s) => s.id === id)
      if (!isValidCalcSolid(solid)) {
        skipped += 1
        continue
      }
      // Sin nombre automático: el usuario debe escribirlo.
      if (added >= 1) {
        onHint?.('Nombre el sólido agregado antes de añadir otro.')
        break
      }
      onAddLine?.(active?.id, createCalcLine({
        solidId: id,
        nombre: '',
        op: 'sum',
      }))
      added += 1
      onHighlightSolid?.(id)
    }
    if (!added) {
      onHint?.(skipped
        ? 'Seleccione un sólido cerrado y bien construido.'
        : 'Nombre el último sólido del cálculo antes de agregar otro.')
      return
    }
    if (skipped) onHint?.(`${added} agregado(s). ${skipped} no válido(s) omitido(s). Nombre el sólido.`)
    else onHint?.('Elemento agregado. Escriba su nombre en la lista.')
  }

  const selectLineSolid = (solidId) => {
    if (!solidId) return
    onHighlightSolid?.(solidId)
  }

  const shellStyle = embedded
    ? {
      position: 'relative',
      width: '100%',
      maxHeight: 'min(520px, 65vh)',
      minHeight: 180,
      background: t.bg || '#fff',
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }
    : {
      position: 'absolute',
      right: 12,
      top: 12,
      bottom: 12,
      width: 'min(420px, 92vw)',
      zIndex: 8,
      background: t.bgCard || '#fff',
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      boxShadow: t.shadow || '0 12px 32px rgba(15,23,42,0.18)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }

  const headerBg = t.primary || '#0f766e'
  const altRow = t.bgHover || '#f1f5f9'
  const borderCell = t.border || '#cbd5e1'

  return (
    <div
      data-testid="esquema-calc-panel"
      data-embedded={embedded ? '1' : '0'}
      style={shellStyle}
    >
      {embedded ? null : (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: `1px solid ${t.border}`,
        background: `color-mix(in srgb, ${t.primary || '#0f766e'} 12%, ${t.bgCard || '#fff'})`,
      }}
      >
        <div style={{ fontWeight: 800, color: t.primary || '#0f766e', fontSize: 14, flex: 1 }}>
          Cálculo de volúmenes
        </div>
        <button type="button" title="Cerrar panel" data-cc-tooltip="Cerrar panel" onClick={onClose} style={btnGhost(t)}>✕</button>
      </div>
      )}
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 6px 0' }}>
          <button type="button" title="Cerrar panel" data-cc-tooltip="Cerrar panel" onClick={onClose} style={{ ...btnGhost(t), padding: '2px 8px' }}>✕</button>
        </div>
      ) : null}

      <div style={{ padding: 10, borderBottom: `1px solid ${t.border}`, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del cálculo"
            style={inputStyle(t)}
          />
          <button
            type="button"
            title="Crear cálculo"
            onClick={() => {
              const c = createVolumeCalc(newName || 'Cálculo')
              onCreateCalc?.(c)
              onActiveCalcId?.(c.id)
              setNewName('Concreto')
            }}
            style={btnPrimary(t)}
          >
            + Crear
          </button>
        </div>
        {(calcs || []).length ? (
          <select
            value={active?.id || ''}
            onChange={(e) => onActiveCalcId?.(e.target.value)}
            style={inputStyle(t)}
            title="Cálculos del esquema"
          >
            {(calcs || []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        ) : (
          <div style={{ fontSize: 12, color: ui?.muted || '#64748b' }}>
            Cree un cálculo (p. ej. Excavación, Concreto).
          </div>
        )}
        {active ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={active.nombre}
              onChange={(e) => onRenameCalc?.(active.id, e.target.value)}
              style={{ ...inputStyle(t), flex: 1 }}
              title="Nombre del cálculo activo"
            />
            <button
              type="button"
              title="Eliminar cálculo"
              onClick={() => onDeleteCalc?.(active.id)}
              style={btnGhost(t)}
            >
              Eliminar
            </button>
          </div>
        ) : null}
      </div>

      {active ? (
        <>
          <div style={{ padding: '8px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${t.border}` }}>
            <button type="button" title="Agregar sólidos seleccionados" onClick={addFromSelection} style={btnPrimary(t)}>
              + Sólidos seleccionados
            </button>
            <span style={{ fontSize: 11, color: ui?.muted || '#64748b', alignSelf: 'center' }}>
              {selectedSolidIds?.length || 0} seleccionado(s)
            </span>
          </div>

          <div
            data-testid="esquema-calc-lines-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'auto',
              padding: 0,
              WebkitOverflowScrolling: 'touch',
              scrollbarGutter: 'stable',
            }}
          >
            <table
              data-testid="esquema-calc-excel-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                tableLayout: 'fixed',
              }}
            >
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ background: headerBg, color: '#fff', textAlign: 'left' }}>
                  <th style={{ ...thExcel(borderCell), width: 28, textAlign: 'center', color: '#fff', background: headerBg }}>#</th>
                  <th style={{ ...thExcel(borderCell), width: 36, textAlign: 'center', color: '#fff', background: headerBg }}>Color</th>
                  <th style={{ ...thExcel(borderCell), color: '#fff', background: headerBg }}>Nombre</th>
                  <th style={{ ...thExcel(borderCell), width: 40, textAlign: 'center', color: '#fff', background: headerBg }} title="Operación">Op</th>
                  <th style={{ ...thExcel(borderCell), width: '22%', color: '#fff', background: headerBg }}>Descuenta de</th>
                  <th style={{ ...thExcel(borderCell), width: 72, textAlign: 'right', color: '#fff', background: headerBg }}>Volumen (m³)</th>
                  <th style={{ ...thExcel(borderCell), width: 28, color: '#fff', background: headerBg }} />
                </tr>
              </thead>
              <tbody>
                {(active.lines || []).map((line, idx) => {
                  const r = resolveCalcLine(line, solids, active)
                  const solid = (solids || []).find((s) => s.id === line.solidId)
                  const fromOptions = lineOptions.filter((o) => o.solidId !== line.solidId)
                  const isHi = highlightedSolidId && line.solidId === highlightedSolidId
                  const rowBg = isHi
                    ? `color-mix(in srgb, ${t.primary || '#0f766e'} 18%, #fff)`
                    : (idx % 2 === 1 ? altRow : (t.bg || '#fff'))
                  return (
                    <tr
                      key={line.id}
                      data-testid="esquema-calc-row"
                      data-solid-id={line.solidId || ''}
                      onClick={() => selectLineSolid(line.solidId)}
                      style={{
                        background: rowBg,
                        cursor: line.solidId ? 'pointer' : 'default',
                        outline: isHi ? `2px solid ${t.primary || '#0f766e'}` : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      <td style={{ ...tdExcel(borderCell), textAlign: 'center', fontWeight: 700, color: t.textMuted || '#64748b' }}>
                        {idx + 1}
                      </td>
                      <td style={{ ...tdExcel(borderCell), textAlign: 'center' }}>
                        <span
                          title={solid?.color || ''}
                          style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            border: `1px solid ${borderCell}`,
                            background: solid?.color || '#94a3b8',
                            verticalAlign: 'middle',
                          }}
                        />
                      </td>
                      <td style={tdExcel(borderCell)} onClick={(e) => e.stopPropagation()}>
                        <input
                          value={line.nombre}
                          placeholder="Nombre obligatorio"
                          aria-label="Nombre del sólido"
                          onChange={(e) => onUpdateLine?.(active.id, line.id, { nombre: e.target.value })}
                          onFocus={() => selectLineSolid(line.solidId)}
                          style={{
                            ...inputStyle(t),
                            padding: '3px 5px',
                            fontSize: 12,
                            borderRadius: 0,
                            border: `1px solid ${String(line.nombre || '').trim() ? borderCell : '#f59e0b'}`,
                            background: 'transparent',
                          }}
                        />
                        {!r.ok && line.op === 'subtract' ? (
                          <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2, lineHeight: 1.3 }}>
                            {r.error || 'Sin volumen común'}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...tdExcel(borderCell), verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        <div
                          data-testid="esquema-calc-op-icons"
                          role="group"
                          aria-label="Operación"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <button
                            type="button"
                            title="Suma"
                            aria-label="Suma"
                            aria-pressed={line.op === 'sum'}
                            data-testid="esquema-calc-op-sum"
                            onClick={() => applyOp(line, 'sum')}
                            style={opIconBtn(t, line.op === 'sum', false)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            title="Descuenta"
                            aria-label="Descuenta"
                            aria-pressed={line.op === 'subtract'}
                            data-testid="esquema-calc-op-subtract"
                            onClick={() => applyOp(line, 'subtract')}
                            style={opIconBtn(t, line.op === 'subtract', true)}
                          >
                            −
                          </button>
                        </div>
                      </td>
                      <td style={tdExcel(borderCell)} onClick={(e) => e.stopPropagation()}>
                        {line.op === 'subtract' ? (
                          <select
                            data-testid="esquema-calc-discount-from"
                            value={line.discountFromSolidId || ''}
                            onChange={(e) => {
                              const discountFromSolidId = e.target.value || null
                              const nextLine = { ...line, discountFromSolidId }
                              onUpdateLine?.(active.id, line.id, { discountFromSolidId })
                              const probe = resolveCalcLine(nextLine, solids, {
                                ...active,
                                lines: (active.lines || []).map((l) => (
                                  l.id === line.id ? nextLine : l
                                )),
                              })
                              if (!probe.ok) {
                                onHint?.(probe.error || 'No se puede descontar del sólido indicado.')
                              }
                            }}
                            style={{ ...inputStyle(t), padding: '3px 4px', fontSize: 11, borderRadius: 0 }}
                            title="Descuenta de"
                          >
                            <option value="">— Elegir —</option>
                            {fromOptions.map((o) => (
                              <option key={o.solidId} value={o.solidId}>{o.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: ui?.muted || '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{
                        ...tdExcel(borderCell),
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: r.ok ? (line.op === 'subtract' ? '#b91c1c' : t.text) : '#b91c1c',
                      }}
                      >
                        {r.ok
                          ? `${line.op === 'subtract' ? '−' : ''}${Number(r.volumeM3).toFixed(2)}`
                          : '—'}
                      </td>
                      <td style={{ ...tdExcel(borderCell), textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Quitar"
                          onClick={() => onRemoveLine?.(active.id, line.id)}
                          style={{ ...btnGhost(t), padding: '2px 6px', borderRadius: 0 }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!(active.lines || []).length ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdExcel(borderCell), color: ui?.muted || '#64748b', padding: 12 }}>
                      Seleccione sólidos en el dibujo y pulse «Sólidos seleccionados».
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div
            data-testid="esquema-calc-total-row"
            style={{
              padding: '10px 12px',
              borderTop: `2px solid ${headerBg}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: altRow,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted || '#64748b' }}>Total</span>
            <span data-testid="esquema-calc-total" style={{ fontSize: 16, fontWeight: 800, color: t.primary || '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
              {formatVolumeM3(total)}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

function thExcel(border) {
  return {
    padding: '6px 4px',
    border: `1px solid ${border}`,
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.02,
    whiteSpace: 'nowrap',
  }
}
function tdExcel(border) {
  return {
    padding: '3px 4px',
    border: `1px solid ${border}`,
    verticalAlign: 'middle',
  }
}
function inputStyle(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 8px',
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.inputBg || '#fff',
    color: t.text,
    fontSize: 13,
  }
}
function btnGhost(t) {
  return {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    fontWeight: 700,
    cursor: 'pointer',
  }
}
function btnPrimary(t) {
  return {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: t.primary || '#0f766e',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}
/** Íconos apilados + / − de la columna Op. */
function opIconBtn(t, active, isSubtract) {
  const accent = isSubtract ? '#b91c1c' : (t.primary || '#0f766e')
  return {
    width: 26,
    height: 22,
    minWidth: 26,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: `1px solid ${active ? accent : (t.border || '#cbd5e1')}`,
    background: active ? accent : (t.bg || '#fff'),
    color: active ? '#fff' : (t.textMuted || '#64748b'),
    fontWeight: 800,
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
  }
}
