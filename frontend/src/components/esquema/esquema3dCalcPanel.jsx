/**
 * Panel de cálculo de volúmenes: lista compacta de nombres + popup Excel para datos.
 */
import React, { useMemo, useState } from 'react'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  describeSolidForMemoria,
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
  phoneFullscreenPopups = false,
}) {
  const [newName, setNewName] = useState('Excavación')
  const [popup, setPopup] = useState(null) // { mode:'add'|'edit', drafts:[] }
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

  const defaultDiscountFrom = (exceptSolidId, drafts = []) => {
    const fromDraft = (drafts || []).find((d) => d.op === 'sum' && d.solidId !== exceptSolidId)
    if (fromDraft) return fromDraft.solidId
    const sumLine = (active?.lines || []).find((l) => l.op === 'sum' && l.solidId && l.solidId !== exceptSolidId)
    if (sumLine) return sumLine.solidId
    const other = (active?.lines || []).find((l) => l.solidId && l.solidId !== exceptSolidId)
    return other?.solidId || null
  }

  const openAddPopup = () => {
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
    const drafts = []
    for (const id of ids) {
      const solid = (solids || []).find((s) => s.id === id)
      if (!isValidCalcSolid(solid)) continue
      const desc = describeSolidForMemoria(solid)
      drafts.push({
        key: id,
        solidId: id,
        nombre: '',
        op: 'sum',
        discountFromSolidId: null,
        color: solid.color || '#0f766e',
        volumeM3: Number(solid.volumeM3) || 0,
        forma: desc?.forma || 'Sólido',
        lineId: null,
      })
    }
    if (!drafts.length) {
      onHint?.('Seleccione un sólido cerrado y bien construido.')
      return
    }
    setPopup({ mode: 'add', drafts })
  }

  const openEditPopup = (line) => {
    const solid = (solids || []).find((s) => s.id === line.solidId)
    const desc = describeSolidForMemoria(solid)
    const r = resolveCalcLine(line, solids, active)
    setPopup({
      mode: 'edit',
      drafts: [{
        key: line.id,
        solidId: line.solidId,
        nombre: line.nombre || '',
        op: line.op === 'subtract' ? 'subtract' : 'sum',
        discountFromSolidId: line.discountFromSolidId || null,
        color: solid?.color || '#0f766e',
        volumeM3: r.ok ? r.volumeM3 : (Number(solid?.volumeM3) || 0),
        forma: desc?.forma || 'Sólido',
        lineId: line.id,
      }],
    })
    if (line.solidId) onHighlightSolid?.(line.solidId)
  }

  const confirmPopup = () => {
    if (!popup?.drafts?.length || !active) return
    const unnamed = popup.drafts.find((d) => !String(d.nombre || '').trim())
    if (unnamed) {
      onHint?.('Escriba el nombre de cada sólido antes de confirmar.')
      return
    }
    if (popup.mode === 'add') {
      for (const d of popup.drafts) {
        onAddLine?.(active.id, createCalcLine({
          solidId: d.solidId,
          nombre: String(d.nombre).trim(),
          op: d.op,
          discountFromSolidId: d.op === 'subtract'
            ? (d.discountFromSolidId || defaultDiscountFrom(d.solidId, popup.drafts))
            : null,
        }))
      }
      onHint?.(`${popup.drafts.length} sólido(s) agregados al cálculo.`)
    } else {
      for (const d of popup.drafts) {
        if (!d.lineId) continue
        onUpdateLine?.(active.id, d.lineId, {
          nombre: String(d.nombre).trim(),
          op: d.op,
          discountFromSolidId: d.op === 'subtract'
            ? (d.discountFromSolidId || defaultDiscountFrom(d.solidId))
            : null,
        })
      }
      onHint?.('Datos del sólido actualizados.')
    }
    setPopup(null)
  }

  const patchDraft = (key, patch) => {
    setPopup((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        drafts: prev.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)),
      }
    })
  }

  const shellStyle = embedded
    ? {
      position: 'relative',
      width: '100%',
      maxHeight: 'min(520px, 65vh)',
      minHeight: 160,
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

  return (
    <div
      data-testid="esquema-calc-panel"
      data-embedded={embedded ? '1' : '0'}
      style={shellStyle}
    >
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 6px 0' }}>
          <button type="button" title="Cerrar panel" data-cc-tooltip="Cerrar panel" onClick={onClose} style={{ ...btnGhost(t), padding: '2px 8px' }}>✕</button>
        </div>
      ) : (
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
      )}

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
            <button type="button" title="Eliminar cálculo" onClick={() => onDeleteCalc?.(active.id)} style={btnGhost(t)}>
              Eliminar
            </button>
          </div>
        ) : null}
      </div>

      {active ? (
        <>
          <div style={{ padding: '8px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${t.border}` }}>
            <button
              type="button"
              title="Agregar sólidos seleccionados"
              data-testid="esquema-calc-add-selected"
              onClick={openAddPopup}
              style={btnPrimary(t)}
            >
              + Sólidos seleccionados
            </button>
            <span style={{ fontSize: 11, color: ui?.muted || '#64748b', alignSelf: 'center' }}>
              {selectedSolidIds?.length || 0} seleccionado(s)
            </span>
          </div>

          <div
            data-testid="esquema-calc-names-list"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '6px 8px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {(active.lines || []).map((line) => {
              const r = resolveCalcLine(line, solids, active)
              const solid = (solids || []).find((s) => s.id === line.solidId)
              const desc = describeSolidForMemoria(solid)
              const isHi = highlightedSolidId && line.solidId === highlightedSolidId
              const tip = [
                line.op === 'subtract' ? 'Descuenta' : 'Suma',
                line.discountFromNombre || (line.op === 'subtract' ? (lineOptions.find((o) => o.solidId === line.discountFromSolidId)?.nombre || '—') : null),
                desc?.forma,
                r.ok ? `${Number(r.volumeM3).toFixed(2)} m³` : null,
              ].filter(Boolean).join(' · ')
              return (
                <button
                  key={line.id}
                  type="button"
                  data-testid="esquema-calc-name-row"
                  data-solid-id={line.solidId || ''}
                  title={tip}
                  data-cc-tooltip={tip}
                  onMouseEnter={() => onHighlightSolid?.(line.solidId)}
                  onFocus={() => onHighlightSolid?.(line.solidId)}
                  onPointerDown={() => onHighlightSolid?.(line.solidId)}
                  onClick={() => openEditPopup(line)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    marginBottom: 4,
                    borderRadius: 6,
                    border: `1px solid ${isHi ? (t.primary || '#0f766e') : (t.border || '#cbd5e1')}`,
                    background: isHi
                      ? `color-mix(in srgb, ${t.primary || '#0f766e'} 14%, #fff)`
                      : (t.bg || '#fff'),
                    cursor: 'pointer',
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: solid?.color || '#94a3b8',
                      border: `1px solid ${t.border}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(line.nombre || '').trim() || (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>Sin nombre</span>
                    )}
                  </span>
                  <button
                    type="button"
                    title="Quitar"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveLine?.(active.id, line.id)
                    }}
                    style={{ ...btnGhost(t), padding: '2px 6px', fontSize: 12 }}
                  >
                    ×
                  </button>
                </button>
              )
            })}
            {!(active.lines || []).length ? (
              <div style={{ fontSize: 12, color: ui?.muted || '#64748b', padding: 10 }}>
                Seleccione sólidos y pulse «Sólidos seleccionados».
              </div>
            ) : null}
          </div>

          <div
            data-testid="esquema-calc-total-row"
            style={{
              padding: '10px 12px',
              borderTop: `2px solid ${t.primary || '#0f766e'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: t.bgHover || '#f8fafc',
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

      {popup ? (
        <CalcDataPopup
          t={t}
          ui={ui}
          mode={popup.mode}
          drafts={popup.drafts}
          lineOptions={lineOptions}
          onPatch={patchDraft}
          onCancel={() => setPopup(null)}
          onConfirm={confirmPopup}
          onHighlightSolid={onHighlightSolid}
          phoneFullscreen={!!phoneFullscreenPopups}
        />
      ) : null}
    </div>
  )
}

function CalcDataPopup({
  t,
  ui,
  mode,
  drafts,
  lineOptions,
  onPatch,
  onCancel,
  onConfirm,
  onHighlightSolid,
  phoneFullscreen = false,
}) {
  const hasUnnamed = (drafts || []).some((d) => !String(d.nombre || '').trim())
  const border = t.border || '#cbd5e1'
  const headerBg = t.primary || '#0f766e'
  return (
    <div
      data-testid="esquema-calc-data-popup"
      data-phone-fullscreen={phoneFullscreen ? '1' : '0'}
      role="dialog"
      aria-modal="true"
      aria-label="Datos del cálculo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: phoneFullscreen ? 'stretch' : 'center',
        justifyContent: phoneFullscreen ? 'stretch' : 'center',
        padding: phoneFullscreen ? 0 : 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: phoneFullscreen ? '100%' : 'min(720px, 96vw)',
          height: phoneFullscreen ? '100%' : undefined,
          maxHeight: phoneFullscreen ? '100%' : 'min(80vh, 640px)',
          background: t.bgCard || '#fff',
          borderRadius: phoneFullscreen ? 0 : 10,
          border: phoneFullscreen ? 'none' : `1px solid ${border}`,
          boxShadow: phoneFullscreen ? 'none' : '0 20px 48px rgba(15,23,42,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 14px',
          background: `color-mix(in srgb, ${headerBg} 14%, #fff)`,
          borderBottom: `1px solid ${border}`,
          fontWeight: 800,
          color: headerBg,
          fontSize: 15,
        }}
        >
          {mode === 'add' ? 'Agregar sólidos al cálculo' : 'Editar sólido del cálculo'}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          <table
            data-testid="esquema-calc-popup-table"
            style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}
          >
            <thead>
              <tr style={{ background: headerBg, color: '#fff' }}>
                <th style={th(border, headerBg)}>Color</th>
                <th style={{ ...th(border, headerBg), width: '18%' }}>Forma</th>
                <th style={{ ...th(border, headerBg), width: '22%' }}>Nombre</th>
                <th style={{ ...th(border, headerBg), width: 70, textAlign: 'center' }}>Op</th>
                <th style={{ ...th(border, headerBg), width: '20%' }}>Descuenta de</th>
                <th style={{ ...th(border, headerBg), width: 80, textAlign: 'right' }}>Volumen</th>
              </tr>
            </thead>
            <tbody>
              {(drafts || []).map((d, idx) => (
                <tr
                  key={d.key}
                  style={{ background: idx % 2 ? (t.bgHover || '#f1f5f9') : (t.bg || '#fff') }}
                  onClick={() => onHighlightSolid?.(d.solidId)}
                >
                  <td style={td(border)}>
                    <span style={{
                      display: 'inline-block',
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      background: d.color,
                      border: `1px solid ${border}`,
                    }}
                    />
                  </td>
                  <td style={{ ...td(border), color: ui?.muted || '#64748b' }}>{d.forma}</td>
                  <td style={td(border)} onClick={(e) => e.stopPropagation()}>
                    <input
                      value={d.nombre}
                      placeholder="Nombre obligatorio"
                      aria-label="Nombre del sólido"
                      data-testid="esquema-calc-popup-nombre"
                      onChange={(e) => onPatch(d.key, { nombre: e.target.value })}
                      style={{
                        ...inputStyle(t),
                        padding: '6px 8px',
                        borderRadius: 0,
                        border: `1px solid ${String(d.nombre || '').trim() ? border : '#f59e0b'}`,
                      }}
                    />
                  </td>
                  <td style={{ ...td(border), textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <button
                        type="button"
                        title="Suma"
                        aria-label="Suma"
                        aria-pressed={d.op === 'sum'}
                        onClick={() => onPatch(d.key, { op: 'sum', discountFromSolidId: null })}
                        style={opIconBtn(t, d.op === 'sum', false)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        title="Descuenta"
                        aria-label="Descuenta"
                        aria-pressed={d.op === 'subtract'}
                        onClick={() => onPatch(d.key, {
                          op: 'subtract',
                          discountFromSolidId: d.discountFromSolidId
                            || lineOptions.find((o) => o.solidId !== d.solidId)?.solidId
                            || null,
                        })}
                        style={opIconBtn(t, d.op === 'subtract', true)}
                      >
                        −
                      </button>
                    </div>
                  </td>
                  <td style={td(border)} onClick={(e) => e.stopPropagation()}>
                    {d.op === 'subtract' ? (
                      <select
                        value={d.discountFromSolidId || ''}
                        onChange={(e) => onPatch(d.key, { discountFromSolidId: e.target.value || null })}
                        style={{ ...inputStyle(t), padding: '4px 6px', borderRadius: 0, fontSize: 11 }}
                      >
                        <option value="">— Elegir —</option>
                        {lineOptions.filter((o) => o.solidId !== d.solidId).map((o) => (
                          <option key={o.solidId} value={o.solidId}>{o.nombre}</option>
                        ))}
                        {(drafts || []).filter((x) => x.solidId !== d.solidId && x.op === 'sum').map((x) => (
                          <option key={`d-${x.solidId}`} value={x.solidId}>
                            {String(x.nombre || '').trim() || 'Nuevo (suma)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: ui?.muted || '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{
                    ...td(border),
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                  }}
                  >
                    {Number(d.volumeM3 || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasUnnamed ? (
            <div data-testid="esquema-calc-popup-unnamed-hint" style={{ marginTop: 8, fontSize: 12, color: '#b45309', fontWeight: 700 }}>
              Escriba el nombre de cada sólido antes de confirmar.
            </div>
          ) : null}
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '10px 12px',
          borderTop: `1px solid ${border}`,
          background: t.bgHover || '#f8fafc',
        }}
        >
          <button type="button" onClick={onCancel} style={btnGhost(t)}>Cancelar</button>
          <button
            type="button"
            data-testid="esquema-calc-popup-confirm"
            onClick={onConfirm}
            disabled={hasUnnamed}
            style={{
              ...btnPrimary(t),
              opacity: hasUnnamed ? 0.45 : 1,
              cursor: hasUnnamed ? 'not-allowed' : 'pointer',
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function th(border, bg) {
  return {
    padding: '8px 6px',
    border: `1px solid ${border}`,
    background: bg,
    color: '#fff',
    fontWeight: 700,
    fontSize: 11,
    textAlign: 'left',
  }
}
function td(border) {
  return {
    padding: '6px 6px',
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
