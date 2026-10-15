import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import {
  FILTROS_ESTADO_DOCUMENTAL,
  FORMATOS_ESTADO_DOCUMENTAL,
} from './estadoDocumentalInformeOptions.js'

export {
  FILTROS_ESTADO_DOCUMENTAL,
  FORMATOS_ESTADO_DOCUMENTAL,
  ESTADO_DOCUMENTAL_CODIGO,
} from './estadoDocumentalInformeOptions.js'

/** @typedef {'todos' | 'aprobado' | 'sin_aprobar'} FiltroEstadoDocumental */
/** @typedef {'xlsx' | 'pdf'} FormatoEstadoDocumental */

/**
 * Modal: filtro + formato para el informe «Estado documental de colaboradores».
 */
export default function EstadoDocumentalInformeModal({
  open,
  theme,
  tTok,
  procesando = false,
  onCancel,
  onConfirm,
}) {
  const t = tTok || theme || {}
  /** @type {[FiltroEstadoDocumental, function]} */
  const [filtro, setFiltro] = useState('todos')
  /** @type {[FormatoEstadoDocumental, function]} */
  const [formato, setFormato] = useState('xlsx')

  useEffect(() => {
    if (open) {
      setFiltro('todos')
      setFormato('xlsx')
    }
  }, [open])

  if (!open) return null

  const surface = t.bgCard || '#ffffff'
  const text = t.text || '#0f172a'
  const border = t.border || '#e2e8f0'
  const primary = t.primary || '#0077B6'
  const muted = t.textMuted || '#64748b'

  const optionStyle = (active) => ({
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${active ? primary : border}`,
    background: active ? `color-mix(in srgb, ${primary} 8%, ${surface})` : 'transparent',
    marginBottom: 8,
    cursor: procesando ? 'wait' : 'pointer',
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10070,
        background: t.overlay || 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !procesando && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="estado-documental-informe-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          color: text,
        }}
      >
        <CcModalBrandHeader theme={theme || t} />
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${border}`,
            background: `color-mix(in srgb, ${primary} 12%, ${surface})`,
          }}
        >
          <div
            id="estado-documental-informe-title"
            style={{
              fontSize: 'var(--cc-body)',
              fontWeight: 800,
              color: primary,
            }}
          >
            Estado documental de colaboradores
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 4, lineHeight: 1.4 }}>
            Elija el alcance del personal y el formato de exportación (Excel o PDF).
          </div>
        </div>

        <div style={{ padding: '16px 18px', fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: text }}>Personal a incluir</div>
          {FILTROS_ESTADO_DOCUMENTAL.map((opt) => (
            <label key={opt.id} style={optionStyle(filtro === opt.id)}>
              <input
                type="radio"
                name="estado-documental-filtro"
                checked={filtro === opt.id}
                onChange={() => setFiltro(opt.id)}
                disabled={procesando}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>{opt.label}</strong>
                <span style={{ display: 'block', color: muted, fontSize: 'var(--cc-caption)', marginTop: 2 }}>
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}

          <div style={{ fontWeight: 700, margin: '14px 0 8px', color: text }}>Formato</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FORMATOS_ESTADO_DOCUMENTAL.map((opt) => {
              const active = formato === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={procesando}
                  onClick={() => setFormato(opt.id)}
                  style={{
                    flex: '1 1 140px',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${active ? primary : border}`,
                    background: active ? `color-mix(in srgb, ${primary} 10%, ${surface})` : 'transparent',
                    color: active ? primary : text,
                    fontWeight: active ? 800 : 600,
                    cursor: procesando ? 'wait' : 'pointer',
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px 16px',
            borderTop: `1px solid ${border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={procesando}
            onClick={() => onCancel?.()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: `1px solid ${border}`,
              background: 'transparent',
              color: text,
              fontWeight: 600,
              cursor: procesando ? 'wait' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={procesando}
            onClick={() => onConfirm?.({ filtro, formato })}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: primary,
              color: '#fff',
              fontWeight: 800,
              cursor: procesando ? 'wait' : 'pointer',
              opacity: procesando ? 0.75 : 1,
            }}
          >
            {procesando ? 'Generando…' : 'Generar informe'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Botón solo ícono + tooltip institucional (permiso Exportar). */
export function EstadoDocumentalInformeButton({ onClick, disabled, tTok, S }) {
  const base = S?.btnGhost || {
    border: `1px solid ${tTok?.border || '#e2e8f0'}`,
    background: tTok?.bgCard || '#fff',
    color: tTok?.text || '#0f172a',
    borderRadius: 8,
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Generar informe Estado documental de colaboradores"
      aria-label="Generar informe Estado documental de colaboradores"
      style={{
        ...base,
        width: 40,
        height: 40,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
