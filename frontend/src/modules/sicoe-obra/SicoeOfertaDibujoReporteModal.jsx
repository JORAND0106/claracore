/**
 * Oferta no bloqueante: dibujar el reporte ahora o después
 * (tras guardar el primer registro).
 */
export default function SicoeOfertaDibujoReporteModal({
  t,
  numeroReporte = null,
  onDibujarAhora,
  onDespues,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onDespues}
    >
      <div
        role="dialog"
        aria-label="Dibujar reporte"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          color: t.text,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          width: '100%',
          maxWidth: 440,
          padding: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 'var(--cc-md)', marginBottom: 8 }}>
          ¿Dibujar el reporte
          {numeroReporte != null ? ` #${numeroReporte}` : ''}?
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45, marginBottom: 16 }}>
          El dibujo sobre el plano semáforo será la huella de todos los registros de este
          reporte. Puede hacerlo ahora o más tarde desde el botón Dibujar.
          El guardado del registro ya quedó listo.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDespues}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              borderRadius: 10,
              padding: '10px 14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Después
          </button>
          <button
            type="button"
            onClick={onDibujarAhora}
            style={{
              background: t.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Dibujar ahora
          </button>
        </div>
      </div>
    </div>
  )
}
