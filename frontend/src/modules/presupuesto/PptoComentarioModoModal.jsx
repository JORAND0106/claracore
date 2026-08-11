import {
  PPTO_COMENTARIO_MODO_APPEND,
  PPTO_COMENTARIO_MODO_REPLACE,
  pptoTextoModoHistorial,
} from './pptoComentarioModo'

/**
 * Confirmación al crear comentario/observación sobre registros con historial previo.
 * open: { nConHistorial, nTotal, etiqueta?, titulo? } | null
 */
export default function PptoComentarioModoModal({ open, onCancel, onAppend, onReplace, t, busy = false }) {
  if (!open) return null

  const nCon = Number(open.nConHistorial) || 0
  const nTotal = Number(open.nTotal) || 0
  const etiqueta = open.etiqueta || 'comentarios'
  const titulo = open.titulo || 'Ya hay comentarios previos'
  const cuerpo = pptoTextoModoHistorial({ nConHistorial: nCon, nTotal, etiqueta })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !busy && onCancel?.()}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: t.bgCard,
          borderRadius: 14,
          border: '2px solid #B45309',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 20px', background: '#F59E0B18', borderBottom: '1px solid #F59E0B55' }}>
          <div style={{ fontSize: 'var(--cc-body)', fontWeight: 900, color: '#B45309' }}>
            ⚠ {titulo}
          </div>
        </div>
        <div style={{ padding: '18px 20px', color: t.text, fontSize: 'var(--cc-sm)', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 12px' }}>{cuerpo}</p>
          <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
            Agregar mantiene el historial de cada registro. Reemplazar elimina los {etiqueta} previos
            de los registros afectados y deja únicamente el nuevo texto.
          </p>
        </div>
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 'var(--cc-label)',
              color: t.textMuted,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onAppend?.(PPTO_COMENTARIO_MODO_APPEND)}
            disabled={busy}
            style={{
              background: t.primary || '#0077B6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 'var(--cc-label)',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            Agregar al historial
          </button>
          <button
            type="button"
            onClick={() => onReplace?.(PPTO_COMENTARIO_MODO_REPLACE)}
            disabled={busy}
            style={{
              background: '#B45309',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 'var(--cc-label)',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            Reemplazar existentes
          </button>
        </div>
      </div>
    </div>
  )
}
