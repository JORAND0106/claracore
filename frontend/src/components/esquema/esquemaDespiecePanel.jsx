/**
 * Panel lateral «Cuadro de despiece» + popup de captura de posición.
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  blankSegmentsForShape,
  blankSpiral,
  getBuiltinShape,
} from './esquemaDespieceShapes.js'
import {
  listAllDespieceShapes,
  findDespieceShape,
  saveCustomDespieceShape,
} from './esquemaDespieceLibrary.js'
import {
  computePositionMetrics,
  computeScheduleTotalKg,
  createEmptySchedule,
  despieceDiametroOpciones,
  fmt2,
  despieceFmtPesoKgM,
  newDespieceId,
  normalizeDespiecePosition,
  segmentLengthCm,
} from './esquemaDespiece.js'
import { buildCustomShapeFromPolyline } from './esquemaDespieceShapes.js'

function ShapeSvg({ shape, highlightId = null, size = 120 }) {
  if (!shape) return null
  const vb = shape.viewBox || '0 0 120 40'
  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox={vb}
      style={{ display: 'block', maxWidth: '100%' }}
      aria-hidden
    >
      {(shape.segments || []).map((seg) => (
        <path
          key={seg.id}
          d={seg.path}
          fill="none"
          stroke={highlightId === seg.id ? '#ea580c' : '#0f766e'}
          strokeWidth={highlightId === seg.id ? 4 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {shape.kind === 'spiral' && shape.thumbPath ? (
        <path d={shape.thumbPath} fill="none" stroke="#0f766e" strokeWidth={2.5} />
      ) : null}
    </svg>
  )
}

function ShapeThumb({ shape, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`despiece-shape-${shape.id}`}
      style={{
        border: selected ? '2px solid #0f766e' : '1px solid #cbd5e1',
        borderRadius: 8,
        padding: 6,
        background: selected ? 'rgba(15,118,110,0.08)' : '#fff',
        cursor: 'pointer',
        textAlign: 'center',
        minWidth: 88,
      }}
    >
      <ShapeSvg shape={shape} size={72} />
      <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: '#0f172a' }}>{shape.nombre}</div>
    </button>
  )
}

/**
 * Popup amplio tipo Excel para agregar/editar posición.
 */
export function EsquemaDespiecePositionPopup({
  t,
  ui,
  contratoId,
  initial = null,
  onCancel,
  onSave,
  onCreateShapeFromSelection = null,
  selectedPolyline = null,
}) {
  const shapes = useMemo(() => listAllDespieceShapes(contratoId), [contratoId])
  const diamOpts = useMemo(() => despieceDiametroOpciones(), [])
  const initialNorm = initial ? normalizeDespiecePosition(initial) : null
  const [name, setName] = useState(initialNorm?.name || initial?.name || '')
  const [diameter, setDiameter] = useState(initialNorm?.diameter || initial?.diameter || '1/2')
  const [pieces, setPieces] = useState(
    (initialNorm?.pieces ?? initial?.pieces) != null
      ? String(initialNorm?.pieces ?? initial?.pieces)
      : '',
  )
  const [shapeId, setShapeId] = useState(initialNorm?.shapeId || initial?.shapeId || 'doble_gancho')
  const [segments, setSegments] = useState(() => {
    const src = initialNorm || initial
    if (src?.segments?.length) return src.segments.map((s) => ({ ...s }))
    const sh = findDespieceShape(contratoId, src?.shapeId || 'doble_gancho')
    return blankSegmentsForShape(sh)
  })
  const [spiral, setSpiral] = useState(() => initialNorm?.spiral || initial?.spiral || blankSpiral())
  const [activeSeg, setActiveSeg] = useState(null)
  const [error, setError] = useState('')
  const [customName, setCustomName] = useState('')
  const [segNames, setSegNames] = useState([])

  const shape = findDespieceShape(contratoId, shapeId) || getBuiltinShape(shapeId)

  useEffect(() => {
    // Al cambiar de forma (nueva o edición), reinicia segmentos / espiral.
    if (initial?.shapeId === shapeId && initial?.segments?.length && shapeId === (initial.shapeId || 'doble_gancho')) {
      // primera carga de edición: segmentos ya inicializados en useState
      return
    }
    const sh = findDespieceShape(contratoId, shapeId)
    if (sh?.kind === 'spiral') {
      setSegments([])
      setSpiral(initial?.shapeId === shapeId && initial?.spiral ? { ...initial.spiral } : blankSpiral())
    } else {
      setSegments(blankSegmentsForShape(sh))
      setSpiral(null)
    }
    setActiveSeg(sh?.segments?.[0]?.id || null)
  }, [shapeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const draftPos = {
    id: initial?.id || 'draft',
    name,
    diameter,
    pieces,
    shapeId,
    segments,
    spiral: shape?.kind === 'spiral' ? spiral : null,
  }
  const metrics = computePositionMetrics(draftPos)

  const updateSeg = (id, patch) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const focusNext = (currentId) => {
    const ids = (shape?.segments || []).map((s) => s.id)
    const i = ids.indexOf(currentId)
    const next = ids[i + 1]
    if (next) setActiveSeg(next)
  }

  const submit = () => {
    setError('')
    if (!String(name).trim()) {
      setError('La posición es obligatoria (ej. As1).')
      return
    }
    const pos = {
      id: initial?.id || newDespieceId('pos'),
      name: String(name).trim(),
      diameter,
      pieces,
      shapeId,
      segments: shape?.kind === 'spiral' ? [] : segments,
      spiral: shape?.kind === 'spiral' ? { ...spiral } : null,
    }
    const m = computePositionMetrics(pos)
    if (!m.ok) {
      setError(m.error || 'Revise los datos.')
      return
    }
    onSave?.(pos)
  }

  const saveCustomShape = () => {
    if (!selectedPolyline) {
      setError('Seleccione una polilínea en el dibujo para crear la forma.')
      return
    }
    if (!String(customName).trim()) {
      setError('Indique el nombre de la forma nueva.')
      return
    }
    const built = buildCustomShapeFromPolyline(selectedPolyline, {
      nombre: customName,
      segmentNames: segNames,
    })
    if (!built) {
      setError('No se pudieron identificar segmentos en la polilínea.')
      return
    }
    saveCustomDespieceShape(contratoId, built)
    setShapeId(built.id)
    setSegments(blankSegmentsForShape(built))
    setError('')
    onCreateShapeFromSelection?.(built)
  }

  const overlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    zIndex: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
  const card = {
    background: t.bgCard || '#fff',
    color: t.text,
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    width: 'min(920px, 96vw)',
    maxHeight: '92vh',
    overflow: 'auto',
    padding: 16,
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  }
  const input = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg || '#fff',
    color: t.text,
    fontSize: 14,
  }
  const label = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }

  return (
    <div style={overlay} data-testid="esquema-despiece-position-popup" role="dialog" aria-modal="true">
      <div style={card} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{initial ? 'Editar posición' : 'Agregar posición'}</div>
          <button type="button" onClick={onCancel} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: t.text }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={label}>
            Posición
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="As1"
              style={input}
              data-testid="despiece-pos-name"
            />
          </label>
          <label style={label}>
            Diámetro (NTC 2289)
            <select
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
              style={input}
              data-testid="despiece-pos-diametro"
            >
              {diamOpts.map((o) => (
                <option key={o.id} value={o.id}>{o.label} · {despieceFmtPesoKgM(o.pesoKgM)} kg/m</option>
              ))}
            </select>
          </label>
          <label style={label}>
            N° piezas
            <input
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              inputMode="numeric"
              style={input}
              data-testid="despiece-pos-piezas"
            />
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Forma</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {shapes.map((s) => (
            <ShapeThumb
              key={s.id}
              shape={s}
              selected={s.id === shapeId}
              onClick={() => setShapeId(s.id)}
            />
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 16,
          alignItems: 'start',
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: ui?.muted || '#64748b' }}>
              {shape?.nombre || 'Forma'} — resalte del segmento activo
            </div>
            <ShapeSvg shape={shape} highlightId={activeSeg} size={280} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {shape?.kind === 'spiral' ? (
              <>
                {['diametroCm', 'pasoCm', 'vueltas'].map((k) => (
                  <label key={k} style={label}>
                    {k === 'diametroCm' ? 'Diámetro (cm)' : k === 'pasoCm' ? 'Paso (cm)' : 'N° de vueltas'}
                    <input
                      value={spiral?.[k] ?? ''}
                      onChange={(e) => setSpiral((prev) => ({ ...(prev || {}), [k]: e.target.value }))}
                      onFocus={() => setActiveSeg(null)}
                      style={input}
                      inputMode="decimal"
                      data-testid={`despiece-spiral-${k}`}
                    />
                  </label>
                ))}
              </>
            ) : (
              (segments || []).map((seg) => (
                <div
                  key={seg.id}
                  style={{
                    border: `1px solid ${activeSeg === seg.id ? (t.primary || '#0f766e') : t.border}`,
                    borderRadius: 8,
                    padding: 8,
                    background: activeSeg === seg.id ? 'rgba(15,118,110,0.06)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{seg.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600 }}>
                      <input
                        type="radio"
                        name={`mode-${seg.id}`}
                        checked={seg.mode !== 'variable'}
                        onChange={() => updateSeg(seg.id, { mode: 'unica' })}
                      />{' '}Única
                    </label>
                    <label style={{ fontSize: 11, fontWeight: 600 }}>
                      <input
                        type="radio"
                        name={`mode-${seg.id}`}
                        checked={seg.mode === 'variable'}
                        onChange={() => updateSeg(seg.id, { mode: 'variable' })}
                      />{' '}Variable
                    </label>
                  </div>
                  {seg.mode === 'variable' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <input
                        placeholder="Mín cm"
                        value={seg.minCm}
                        onFocus={() => setActiveSeg(seg.id)}
                        onChange={(e) => updateSeg(seg.id, { minCm: e.target.value })}
                        onBlur={() => focusNext(seg.id)}
                        style={input}
                        inputMode="decimal"
                        data-testid={`despiece-seg-min-${seg.id}`}
                      />
                      <input
                        placeholder="Máx cm"
                        value={seg.maxCm}
                        onFocus={() => setActiveSeg(seg.id)}
                        onChange={(e) => updateSeg(seg.id, { maxCm: e.target.value })}
                        onBlur={() => focusNext(seg.id)}
                        style={input}
                        inputMode="decimal"
                        data-testid={`despiece-seg-max-${seg.id}`}
                      />
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: ui?.muted || '#64748b' }}>
                        Promedio: {Number.isFinite(segmentLengthCm(seg)) ? `${Math.round(segmentLengthCm(seg))} cm` : '—'}
                      </div>
                    </div>
                  ) : (
                    <input
                      placeholder="Longitud cm"
                      value={seg.lengthCm}
                      onFocus={() => setActiveSeg(seg.id)}
                      onChange={(e) => updateSeg(seg.id, { lengthCm: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusNext(seg.id)
                        }
                      }}
                      style={input}
                      inputMode="decimal"
                      data-testid={`despiece-seg-${seg.id}`}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
          background: t.bgHover || 'rgba(15,118,110,0.08)',
          border: `1px solid ${t.border}`,
        }}
        >
          <div data-testid="despiece-live-parcial">
            <div style={{ fontSize: 11, color: ui?.muted || '#64748b', fontWeight: 700 }}>Longitud parcial</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{metrics.ok ? `${fmt2(metrics.partialM)} m` : '—'}</div>
          </div>
          <div data-testid="despiece-live-total">
            <div style={{ fontSize: 11, color: ui?.muted || '#64748b', fontWeight: 700 }}>Longitud total</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{metrics.ok ? `${fmt2(metrics.totalM)} m` : '—'}</div>
          </div>
          <div data-testid="despiece-live-peso">
            <div style={{ fontSize: 11, color: ui?.muted || '#64748b', fontWeight: 700 }}>Peso</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {metrics.ok ? `${fmt2(metrics.pesoKg)} kg` : '—'}
              {metrics.ok ? (
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color: ui?.muted || '#64748b' }}>
                  ({despieceFmtPesoKgM(metrics.pesoKgM)} kg/m)
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Crear forma nueva desde polilínea</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: ui?.muted || '#64748b' }}>
              Dibuje una polilínea, selecciónela y asígnele nombre (y nombre a cada segmento). Queda en la biblioteca del contrato para todos los usuarios.
            </div>
            <input
              placeholder="Nombre de la forma"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={input}
              data-testid="despiece-custom-name"
            />
            <button
              type="button"
              onClick={saveCustomShape}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bgCard || '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              data-testid="despiece-save-custom-shape"
            >
              Guardar forma en biblioteca
            </button>
          </div>
        </details>

        {error ? <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{error}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', fontWeight: 700, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: t.primary || '#0f766e', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            data-testid="despiece-pos-save"
          >
            Guardar posición
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Sección del panel lateral: lista de cuadros + tabla tipo Excel.
 */
export function EsquemaDespiecePanel({
  t,
  ui,
  contratoId,
  schedules = [],
  activeId = null,
  onChangeSchedules,
  onActiveId,
  selectedPolyline = null,
}) {
  const [popup, setPopup] = useState(null) // null | { scheduleId, position? }
  const active = schedules.find((s) => s.id === activeId) || schedules[0] || null

  const setActive = (id) => onActiveId?.(id)

  const updateSchedule = (id, patch) => {
    const next = (schedules || []).map((s) => (
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s
    ))
    onChangeSchedules?.(next)
  }

  const addSchedule = () => {
    const s = createEmptySchedule('')
    const next = [...(schedules || []), s]
    onChangeSchedules?.(next)
    setActive(s.id)
  }

  const removeSchedule = (id) => {
    const next = (schedules || []).filter((s) => s.id !== id)
    onChangeSchedules?.(next)
    if (activeId === id) setActive(next[0]?.id || null)
  }

  const savePosition = (pos) => {
    if (!active) return
    const list = [...(active.positions || [])]
    const idx = list.findIndex((p) => p.id === pos.id)
    if (idx >= 0) list[idx] = pos
    else list.push(pos)
    updateSchedule(active.id, { positions: list })
    setPopup(null)
  }

  const deletePosition = (posId) => {
    if (!active) return
    updateSchedule(active.id, {
      positions: (active.positions || []).filter((p) => p.id !== posId),
    })
  }

  const totalKg = active ? computeScheduleTotalKg(active.positions || []) : 0

  return (
    <div data-testid="esquema-despiece-panel" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={addSchedule}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: 'none',
            background: t.primary || '#0f766e',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 12,
          }}
          data-testid="despiece-add-cuadro"
        >
          + Nuevo cuadro
        </button>
      </div>

      {(schedules || []).length > 1 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {schedules.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: `1px solid ${t.border}`,
                background: s.id === active?.id ? (t.primary || '#0f766e') : (t.bgCard || '#fff'),
                color: s.id === active?.id ? '#fff' : t.text,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {s.nombre || '(sin nombre)'}
            </button>
          ))}
        </div>
      ) : null}

      {active ? (
        <>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>
            Nombre del cuadro (obligatorio)
            <input
              value={active.nombre || ''}
              onChange={(e) => updateSchedule(active.id, { nombre: e.target.value })}
              placeholder="Alcantarilla K1+316 – Cabezal Descole"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.inputBg || '#fff',
                color: t.text,
                fontSize: 13,
              }}
              data-testid="despiece-cuadro-nombre"
            />
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setPopup({ scheduleId: active.id, position: null })}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bgCard || '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 12,
              }}
              data-testid="despiece-add-posicion"
            >
              Agregar posición
            </button>
            <button
              type="button"
              onClick={() => removeSchedule(active.id)}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: 'transparent',
                color: '#b91c1c',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Eliminar cuadro
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 11 }} data-testid="despiece-tabla">
              <thead>
                <tr>
                  {['Posición', 'N°', 'N° piezas', 'Long. parcial', 'Forma', 'Long. total', 'kg/m', 'Peso kg'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 4px',
                        background: t.primary || '#0f766e',
                        color: '#fff',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(active.positions || []).map((pos, idx) => {
                  const norm = normalizeDespiecePosition(pos) || pos
                  const m = computePositionMetrics(norm)
                  const shape = findDespieceShape(contratoId, norm.shapeId)
                  return (
                    <tr
                      key={pos.id}
                      data-testid={`despiece-row-${pos.id}`}
                      onClick={() => setPopup({ scheduleId: active.id, position: norm })}
                      style={{ cursor: 'pointer', background: idx % 2 ? (ui?.wrap || '#f8fafc') : (t.bgCard || '#fff') }}
                    >
                      <td style={{ padding: '6px 4px', fontWeight: 700 }}>{norm.name}</td>
                      <td style={{ padding: '6px 4px' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 4px' }}>{m.ok ? m.pieces : '—'}</td>
                      <td style={{ padding: '6px 4px' }}>{m.ok ? fmt2(m.partialM) : '—'}</td>
                      <td style={{ padding: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ShapeSvg shape={shape} size={56} />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deletePosition(pos.id) }}
                            style={{ border: 'none', background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}
                            aria-label="Eliminar posición"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '6px 4px' }}>{m.ok ? fmt2(m.totalM) : '—'}</td>
                      <td style={{ padding: '6px 4px' }}>{m.ok ? despieceFmtPesoKgM(m.pesoKgM) : '—'}</td>
                      <td style={{ padding: '6px 4px', fontWeight: 700 }}>{m.ok ? fmt2(m.pesoKg) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div
            data-testid="despiece-total"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bgHover || 'rgba(15,118,110,0.08)',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            Total: {fmt2(totalKg)} kg
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: ui?.muted || '#64748b' }}>
          Cree un cuadro de despiece e indique su nombre. Luego agregue posiciones.
        </div>
      )}

      {popup ? (
        <EsquemaDespiecePositionPopup
          t={t}
          ui={ui}
          contratoId={contratoId}
          initial={popup.position}
          selectedPolyline={selectedPolyline}
          onCancel={() => setPopup(null)}
          onSave={savePosition}
        />
      ) : null}
    </div>
  )
}

export { createEmptySchedule }
