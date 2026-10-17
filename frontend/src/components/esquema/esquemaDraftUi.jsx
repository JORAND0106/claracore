/**
 * Popups institucionales breves para borrador del esquema.
 */
import React from 'react'

export function EsquemaDraftNoticePopup({
  t,
  title,
  message,
  confirmLabel = 'Aceptar',
  cancelLabel = null,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="esquema-draft-notice"
      style={{
        position: 'fixed', inset: 0, zIndex: 15000,
        background: t.overlay || 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(400px, 94vw)',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: t.shadow || '0 12px 32px rgba(15,23,42,0.2)',
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: t.textMuted || '#64748b', marginBottom: 14, lineHeight: 1.45 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {cancelLabel ? (
            <button type="button" onClick={onCancel} style={btnGhost(t)}>{cancelLabel}</button>
          ) : null}
          <button type="button" onClick={onConfirm} style={btnPrimary(t)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
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
