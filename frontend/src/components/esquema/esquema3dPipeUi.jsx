/**
 * UI · Tubería y accesorios: biblioteca + popup Excel de medidas (C-3D-17).
 */
import { useMemo, useState } from 'react'
import { SICOE_HERRAMIENTA_POPUP_Z } from '../../modules/sicoe-obra/sicoeZIndex'
import {
  PIPE_TEMPLATE_CATALOG,
  pipeOuterDiameterM,
  pipeTemplateById,
  pipeTemplateFields,
  parsePipeMeasure,
} from './esquema3dPipeTemplates.js'

function Thumb({ kind, angleDeg }) {
  const stroke = '#0f766e'
  if (kind === 'tuberia') {
    return (
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden>
        <rect x="6" y="14" width="44" height="12" rx="6" fill="none" stroke={stroke} strokeWidth="2" />
        <line x1="6" y1="20" x2="50" y2="20" stroke={stroke} strokeWidth="1" strokeDasharray="3 2" />
      </svg>
    )
  }
  if (kind === 'codo') {
    const a = Number(angleDeg) || 90
    return (
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden>
        <path
          d={a >= 60
            ? 'M10 28h18a10 10 0 0 0 10-10V8'
            : 'M10 28h22a6 6 0 0 0 6-6V12'}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (kind === 'tee') {
    return (
      <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden>
        <rect x="6" y="16" width="44" height="10" rx="5" fill="none" stroke={stroke} strokeWidth="2" />
        <rect x="23" y="6" width="10" height="14" rx="4" fill="none" stroke={stroke} strokeWidth="2" />
      </svg>
    )
  }
  return (
    <svg width="56" height="40" viewBox="0 0 56 40" aria-hidden>
      <path d="M8 14h18l14 12H8z" fill="none" stroke={stroke} strokeWidth="2" />
      <path d="M8 26h40" stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

export function EsquemaPipeLibraryPopup({
  t,
  open,
  onClose,
  onPick,
}) {
  if (!open) return null
  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#0f766e',
    bg: t?.bgCard || '#fff',
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="esquema-pipe-library"
      style={{
        position: 'fixed', inset: 0, zIndex: SICOE_HERRAMIENTA_POPUP_Z,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 96vw)',
          background: ui.bg,
          border: `1px solid ${ui.border}`,
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(15,23,42,0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 14px', borderBottom: `1px solid ${ui.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
        >
          <strong style={{ color: ui.text, fontSize: 15 }}>Tubería y accesorios</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${ui.border}`,
              borderRadius: 8, padding: '6px 10px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
          padding: 14,
        }}
        >
          {PIPE_TEMPLATE_CATALOG.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`esquema-pipe-template-${item.id}`}
              onClick={() => onPick?.(item.id)}
              style={{
                background: ui.bg,
                border: `1px solid ${ui.border}`,
                borderRadius: 10,
                padding: '10px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                color: ui.text,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              <Thumb kind={item.kind} angleDeg={item.angleDeg} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Popup Excel de una fila (cuando quepan las columnas).
 */
export function EsquemaPipeParamsPopup({
  t,
  templateId,
  initialValues = null,
  onConfirm,
  onCancel,
  busy = false,
}) {
  const fields = useMemo(() => pipeTemplateFields(templateId), [templateId])
  const template = pipeTemplateById(templateId)
  const [values, setValues] = useState(() => {
    const o = {}
    for (const f of fields) o[f.key] = initialValues?.[f.key] ?? ''
    return o
  })
  const [err, setErr] = useState('')

  const dePreview = useMemo(() => {
    if (template?.kind === 'reduccion') {
      const a = pipeOuterDiameterM(parsePipeMeasure(values.diMajorM), parsePipeMeasure(values.espesorM))
      const b = pipeOuterDiameterM(parsePipeMeasure(values.diMinorM), parsePipeMeasure(values.espesorM))
      if (a == null || b == null) return null
      return `Øext ${a.toFixed(3)} → ${b.toFixed(3)} m`
    }
    const di = parsePipeMeasure(values.diM)
    const e = parsePipeMeasure(values.espesorM)
    const de = pipeOuterDiameterM(di, e)
    if (de == null) return null
    return `Ø exterior ${de.toFixed(3)} m`
  }, [template, values])

  const confirmar = () => {
    setErr('')
    onConfirm?.(values, setErr)
  }

  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#0f766e',
    bg: t?.bgCard || '#fff',
    inputBg: t?.bg || '#f8fafc',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="esquema-pipe-params"
      style={{
        position: 'fixed', inset: 0, zIndex: SICOE_HERRAMIENTA_POPUP_Z + 1,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(960px, 98vw)',
          background: ui.bg,
          border: `1px solid ${ui.border}`,
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(15,23,42,0.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 14px', borderBottom: `1px solid ${ui.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
        >
          <strong style={{ color: ui.text, fontSize: 15 }}>
            {template?.label || 'Plantilla'} · medidas (m)
          </strong>
          {dePreview ? (
            <span style={{ color: ui.primary, fontWeight: 800, fontSize: 13 }}>{dePreview}</span>
          ) : null}
        </div>
        <div style={{ padding: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                {fields.map((f) => (
                  <th
                    key={f.key}
                    style={{
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 800,
                      color: ui.muted,
                      padding: '6px 8px',
                      borderBottom: `1px solid ${ui.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {fields.map((f) => (
                  <td key={f.key} style={{ padding: '6px 8px' }}>
                    <input
                      data-testid={`esquema-pipe-field-${f.key}`}
                      value={values[f.key] ?? ''}
                      placeholder={f.label}
                      disabled={busy}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      style={{
                        width: '100%',
                        minWidth: 88,
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${ui.border}`,
                        background: ui.inputBg,
                        color: ui.text,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                      className="esquema-pipe-input"
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <style>{`.esquema-pipe-input::placeholder{color:${ui.muted};opacity:1;font-weight:500}`}</style>
          {err ? (
            <div role="alert" style={{ marginTop: 10, color: '#991b1b', fontWeight: 700, fontSize: 13 }}>
              {err}
            </div>
          ) : null}
        </div>
        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${ui.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{
              background: 'transparent', border: `1px solid ${ui.border}`,
              borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="esquema-pipe-confirm"
            disabled={busy}
            onClick={confirmar}
            style={{
              background: ui.primary, border: 'none', color: '#fff',
              borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
