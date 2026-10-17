/**
 * UI del modo 3D: popup de cotas/longitud y tooltips de vistas.
 */
import React, { useState } from 'react'
import { ESQUEMA_3D_VIEWS, isEsquema3dDrawView } from './esquema3dViews.js'
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
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {ESQUEMA_3D_VIEWS.map((v) => {
        const tip = v.label + (v.draw ? ' (dibujo)' : ' (solo vista)')
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
              ...iconBtn(t, viewId === v.id),
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
      {!isEsquema3dDrawView(viewId) ? (
        <span style={{ ...ghost(t), fontSize: 11, opacity: 0.85 }}>
          Vista isométrica: solo inspección
        </span>
      ) : null}
    </span>
  )
}

function viewShort(id) {
  switch (id) {
    case 'top': return 'Sup'
    case 'front': return 'Front'
    case 'side': return 'Lat'
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
}) {
  const [cotaSup, setCotaSup] = useState('100')
  const [cotaInf, setCotaInf] = useState('98')
  const [lengthM, setLengthM] = useState('1')
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
          {mode === 'cotas' ? 'Extruir por cotas' : 'Extruir por longitud'}
        </div>
        <div style={{ fontSize: 13, color: ui?.muted || '#64748b', marginBottom: 12 }}>
          {mode === 'cotas'
            ? 'Indique la cota superior y la cota inferior (metros). El sólido se construye entre ambas.'
            : 'Indique la longitud de extrusión en metros (vista frontal o lateral).'}
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
            Longitud (m)
            <input value={lengthM} onChange={(e) => setLengthM(e.target.value)} style={inputStyle(t)} inputMode="decimal" />
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
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    background: t.primary || '#0f766e',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  }
}
