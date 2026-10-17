/**
 * UI del modo 3D: popup de cotas/longitud, toolbar de 6 caras + isométricas.
 */
import React, { useState } from 'react'
import {
  ESQUEMA_3D_VIEWS,
  extrudeModeForView,
  isEsquema3dDrawView,
  normalizeViewId,
} from './esquema3dViews.js'
import { formatVolumeM3 } from './esquema3dSolids.js'
import { alturaFromCotasText } from './esquema3dCalc.js'

export { alturaFromCotasText }

export function Esquema3dViewToolbar({
  t,
  viewId,
  onView,
  iconBtn,
  ghost,
}) {
  const current = normalizeViewId(viewId)
  const drawViews = ESQUEMA_3D_VIEWS.filter((v) => v.draw)
  const isoViews = ESQUEMA_3D_VIEWS.filter((v) => !v.draw)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {drawViews.map((v) => {
        const tip = `${v.label} (dibujo)`
        return (
          <button
            key={v.id}
            type="button"
            title={tip}
            data-cc-tooltip={tip}
            data-cc-tooltip-variant="short"
            data-testid={`esquema-3d-view-${v.id}`}
            aria-label={v.label}
            onClick={() => onView(v.id)}
            style={{
              ...iconBtn(t, current === v.id),
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              fontSize: 9,
              fontWeight: 700,
              minWidth: 44,
              padding: '4px 6px',
              lineHeight: 1.1,
            }}
          >
            <CubeFaceIcon face={v.face || v.id} active={current === v.id} primary={t.primary || '#0f766e'} />
            <span>{viewShort(v.id)}</span>
          </button>
        )
      })}
      <span style={{ width: 1, alignSelf: 'stretch', background: t.border || '#cbd5e1', margin: '0 2px' }} />
      {isoViews.map((v) => {
        const tip = `${v.label} (solo vista)`
        return (
          <button
            key={v.id}
            type="button"
            title={tip}
            data-cc-tooltip={tip}
            data-cc-tooltip-variant="short"
            aria-label={v.label}
            onClick={() => onView(v.id)}
            style={{
              ...iconBtn(t, current === v.id),
              fontSize: 10,
              fontWeight: 700,
              minWidth: 36,
              padding: '6px 8px',
            }}
          >
            {viewShort(v.id)}
          </button>
        )
      })}
      {!isEsquema3dDrawView(current) ? (
        <span style={{ ...ghost(t), fontSize: 11, opacity: 0.85 }}>
          Vista isométrica: solo inspección
        </span>
      ) : null}
    </span>
  )
}

/** Ícono de cubo isométrico con una cara resaltada. */
function CubeFaceIcon({ face, active, primary }) {
  const stroke = active ? primary : '#64748b'
  const fillFace = active ? primary : '#94a3b8'
  const fillDim = active ? 'rgba(15,118,110,0.12)' : '#e2e8f0'
  // Cubo isométrico simple (vista 3/4)
  // Caras: top trapecio, front parallelogram, right parallelogram
  const top = '8,2 18,2 22,6 12,6'
  const front = '8,2 12,6 12,16 8,12'
  const right = '18,2 22,6 22,16 18,12'
  // Para bottom/back/left usamos las caras opuestas con el mismo esquema visual
  // remarcando la cara correspondiente del cubo dibujado.
  let highlight = top
  if (face === 'front' || face === 'back') highlight = front
  if (face === 'right' || face === 'left' || face === 'side') highlight = right
  if (face === 'bottom') highlight = '8,12 12,16 22,16 18,12'
  return (
    <svg width="26" height="18" viewBox="0 0 30 18" aria-hidden="true">
      <polygon points={top} fill={face === 'top' ? fillFace : fillDim} stroke={stroke} strokeWidth="1" />
      <polygon points={front} fill={(face === 'front' || face === 'back') ? fillFace : fillDim} stroke={stroke} strokeWidth="1" />
      <polygon points={right} fill={(face === 'right' || face === 'left' || face === 'side') ? fillFace : fillDim} stroke={stroke} strokeWidth="1" />
      {face === 'bottom' ? (
        <polygon points={highlight} fill={fillFace} stroke={stroke} strokeWidth="1.2" />
      ) : null}
    </svg>
  )
}

function viewShort(id) {
  switch (normalizeViewId(id)) {
    case 'top': return 'Sup'
    case 'bottom': return 'Inf'
    case 'front': return 'Front'
    case 'back': return 'Post'
    case 'left':
    case 'side': return 'Izq'
    case 'right': return 'Der'
    case 'iso-ne': return 'NE'
    case 'iso-nw': return 'NO'
    case 'iso-se': return 'SE'
    case 'iso-sw': return 'SO'
    default: return id
  }
}

export function Esquema3dExtrudePopup({
  t,
  ui,
  mode, // 'cotas' | 'length'
  onCancel,
  onConfirm,
  defaultLengthM = null,
}) {
  const [cotaSup, setCotaSup] = useState('100')
  const [cotaInf, setCotaInf] = useState('98')
  const [lengthM, setLengthM] = useState(
    defaultLengthM != null && Number(defaultLengthM) > 0
      ? String(defaultLengthM)
      : '0.30',
  )
  const [error, setError] = useState('')

  const alturaM = mode === 'cotas' ? alturaFromCotasText(cotaSup, cotaInf) : null

  const submit = () => {
    setError('')
    if (mode === 'cotas') {
      onConfirm({ cotaSuperior: cotaSup, cotaInferior: cotaInf }, (err) => setError(err || ''))
    } else {
      onConfirm({ lengthM }, (err) => setError(err || ''))
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 14000,
        background: t.overlay || 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="esquema-extruir-popup"
        style={{
          width: 'min(420px, 96vw)',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: t.shadow,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: t.text, marginBottom: 8 }}>
          {mode === 'cotas' ? 'Extruir por cotas' : 'Extruir por profundidad'}
        </div>
        <div style={{ fontSize: 13, color: ui?.muted || '#64748b', marginBottom: 12 }}>
          {mode === 'cotas'
            ? 'Indique la cota superior y la cota inferior (metros). El sólido se construye entre ambas.'
            : 'Indique la longitud en metros (profundidad perpendicular a la cara, hacia el fondo de la vista). La figura conserva su posición y cotas.'}
        </div>
        {mode === 'cotas' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={labelStyle(t)}>
              Cota superior (m)
              <input
                value={cotaSup}
                onChange={(e) => setCotaSup(e.target.value)}
                style={inputStyle(t)}
                inputMode="decimal"
                data-testid="esquema-extruir-cota-sup"
              />
            </label>
            <label style={labelStyle(t)}>
              Cota inferior (m)
              <input
                value={cotaInf}
                onChange={(e) => setCotaInf(e.target.value)}
                style={inputStyle(t)}
                inputMode="decimal"
                data-testid="esquema-extruir-cota-inf"
              />
            </label>
            <div
              data-testid="esquema-extruir-altura"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bgHover || 'rgba(15,118,110,0.08)',
                fontSize: 13,
                color: t.text,
              }}
            >
              <span style={{ fontWeight: 700, color: ui?.muted || '#64748b' }}>Altura calculada</span>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {alturaM != null
                  ? `${alturaM.toFixed(2)} m`
                  : '—'}
              </div>
              <div style={{ fontSize: 11, color: ui?.muted || '#64748b', marginTop: 2 }}>
                Cota superior − cota inferior (solo lectura)
              </div>
            </div>
          </div>
        ) : (
          <label style={labelStyle(t)}>
            Longitud / profundidad (m)
            <input
              value={lengthM}
              onChange={(e) => setLengthM(e.target.value)}
              style={inputStyle(t)}
              inputMode="decimal"
              data-testid="esquema-extruir-longitud"
            />
          </label>
        )}
        {error ? (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{error}</div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onCancel} style={btnGhost(t)}>Cancelar</button>
          <button type="button" onClick={submit} style={btnPrimary(t)}>Extruir</button>
        </div>
      </div>
    </div>
  )
}

export function Esquema3dVolumeHint({ t, volumeM3 }) {
  if (volumeM3 == null || !Number.isFinite(volumeM3)) return null
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: t.text,
      padding: '4px 8px',
      borderRadius: 6,
      background: t.bgHover || 'rgba(15,118,110,0.12)',
    }}
    >
      V = {formatVolumeM3(volumeM3)}
    </span>
  )
}

function labelStyle(t) {
  return { display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: t.text }
}
function inputStyle(t) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.inputBg || '#fff',
    color: t.text,
    fontSize: 14,
  }
}
function btnGhost(t) {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    fontWeight: 700,
    cursor: 'pointer',
  }
}
function btnPrimary(t) {
  return {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: t.primary || '#0f766e',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  }
}

export { extrudeModeForView }
