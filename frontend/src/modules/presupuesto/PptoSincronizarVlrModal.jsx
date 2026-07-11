/**
 * Modal confirmación + resultado: sincronizar V.U. con listado de precios (solo Desarrollador).
 */
export default function PptoSincronizarVlrModal({
  open,
  phase = 'confirm',
  busy = false,
  error = null,
  result = null,
  onCancel,
  onConfirm,
  onCloseResult,
  t,
}) {
  if (!open) return null

  const isResult = phase === 'result'
  const pptoN = result?.presupuesto_actualizados ?? 0
  const verN = result?.presupuesto_version_items_actualizados ?? 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !busy && (isResult ? onCloseResult?.() : onCancel?.())}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: t.bgCard,
          borderRadius: 14,
          border: `2px solid ${isResult ? '#0D9488' : '#B45309'}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '18px 20px', color: t.text, fontSize: 'var(--cc-sm)', lineHeight: 1.5 }}>
          {isResult ? (
            <p style={{ margin: 0, fontWeight: 600 }}>
              ✓ Sincronizados: {pptoN.toLocaleString('es-CO')} en presupuesto · {verN.toLocaleString('es-CO')} en versiones
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 12px', fontWeight: 700, color: '#B45309' }}>
                Sincronizar valores unitarios
              </p>
              <p style={{ margin: '0 0 12px' }}>
                Se actualizarán los registros del <strong>alcance actual</strong> (filtros activos o todo el contrato),
                incluidos los sellados, con el listado de precios vigente.
              </p>
              <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-caption)' }}>
                Los dados de baja no se modifican.
              </p>
            </>
          )}
          {error ? (
            <p style={{ margin: '12px 0 0', color: '#DC2626', fontWeight: 600 }}>{error}</p>
          ) : null}
        </div>
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {isResult ? (
            <button
              type="button"
              onClick={onCloseResult}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                style={{
                  background: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer',
                  color: t.text,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                style={{
                  background: '#B45309',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy ? 'Sincronizando…' : 'Sincronizar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
