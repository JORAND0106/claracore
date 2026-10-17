/**
 * Panel de cálculo de volúmenes (estilo hoja / Excel, paleta institucional).
 */
import React, { useMemo, useState } from 'react'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  formatVolumeM3,
  isValidCalcSolid,
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
}) {
  const [newName, setNewName] = useState('Excavación')
  const active = useMemo(
    () => (calcs || []).find((c) => c.id === activeCalcId) || (calcs || [])[0] || null,
    [calcs, activeCalcId],
  )
  const total = active ? calcTotalM3(active, solids) : 0

  if (!open) return null

  const addFromSelection = () => {
    const ids = selectedSolidIds || []
    if (!ids.length) {
      onHint?.('Seleccione uno o más sólidos en el dibujo para agregarlos al cálculo.')
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
      onAddLine?.(active?.id, createCalcLine({
        solidId: id,
        nombre: `Sólido ${(active?.lines?.length || 0) + added + 1}`,
        op: 'sum',
      }))
      added += 1
    }
    if (!added) {
      onHint?.('Seleccione un sólido cerrado y bien construido.')
      return
    }
    if (skipped) onHint?.(`${added} agregado(s). ${skipped} no válido(s) omitido(s).`)
    else onHint?.(`${added} elemento(s) agregados al cálculo.`)
  }

  return (
    <div
      data-testid="esquema-calc-panel"
      style={{
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
      }}
    >
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
        <button type="button" title="Cerrar panel" onClick={onClose} style={btnGhost(t)}>✕</button>
      </div>

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

          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: t.bgHover || '#f1f5f9', textAlign: 'left' }}>
                  <th style={th(t)}>Nombre</th>
                  <th style={th(t)}>Op</th>
                  <th style={{ ...th(t), textAlign: 'right' }}>Volumen</th>
                  <th style={th(t)} />
                </tr>
              </thead>
              <tbody>
                {(active.lines || []).map((line) => {
                  const r = resolveCalcLine(line, solids)
                  return (
                    <tr key={line.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <td style={td()}>
                        <input
                          value={line.nombre}
                          onChange={(e) => onUpdateLine?.(active.id, line.id, { nombre: e.target.value })}
                          style={{ ...inputStyle(t), padding: '4px 6px', fontSize: 12 }}
                        />
                      </td>
                      <td style={td()}>
                        <select
                          value={line.op}
                          onChange={(e) => onUpdateLine?.(active.id, line.id, { op: e.target.value })}
                          style={{ ...inputStyle(t), padding: '4px 6px', fontSize: 12 }}
                          title="Suma o descuenta"
                        >
                          <option value="sum">Suma</option>
                          <option value="subtract">Descuenta</option>
                        </select>
                      </td>
                      <td style={{ ...td(), textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: r.ok ? (line.op === 'subtract' ? '#b91c1c' : t.text) : '#b91c1c' }}>
                        {r.ok
                          ? `${line.op === 'subtract' ? '−' : '+'}${Number(r.volumeM3).toFixed(2)}`
                          : '—'}
                      </td>
                      <td style={td()}>
                        <button
                          type="button"
                          title="Quitar"
                          onClick={() => onRemoveLine?.(active.id, line.id)}
                          style={{ ...btnGhost(t), padding: '2px 6px' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!(active.lines || []).length ? (
                  <tr>
                    <td colSpan={4} style={{ ...td(), color: ui?.muted || '#64748b', padding: 12 }}>
                      Seleccione sólidos en el dibujo y pulse «Sólidos seleccionados».
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div style={{
            padding: '10px 12px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: t.bgHover || '#f8fafc',
          }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted || '#64748b' }}>Total</span>
            <span data-testid="esquema-calc-total" style={{ fontSize: 16, fontWeight: 800, color: t.primary || '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
              {formatVolumeM3(total)}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

function th(t) {
  return { padding: '6px 6px', borderBottom: `1px solid ${t.border}`, fontWeight: 700, color: t.textMuted || '#64748b', fontSize: 11 }
}
function td() {
  return { padding: '4px 4px', verticalAlign: 'middle' }
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
