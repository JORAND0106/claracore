import { useAlmacenTheme } from './almacenShared'

/**
 * Resumen de la última Agrupar. No escribe hasta confirmar.
 * Si algo cambió después, explica por qué no se revierte nada.
 */
export default function DeshacerAgruparModal({
  vista,
  busy = false,
  error = '',
  resumen = '',
  fase = '',
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const puede = Boolean(vista?.puede) && !resumen
  const bloqueos = vista?.bloqueos || []
  const ejemplos = vista?.ejemplos || []
  const creadas = vista?.creadas || []

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="deshacer-agrupar-vista"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100050,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => { if (!busy) onCancel?.() }}
    >
      <div
        style={{ ...ui.card, maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, marginBottom: 6 }}>
          Deshacer la última agrupación
        </div>
        <p data-testid="deshacer-agrupar-resumen" style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          {resumen || vista?.resumen || 'Revisando la última ejecución de Agrupar.'}
        </p>
        {busy && fase && (
          <div data-testid="deshacer-agrupar-progreso" style={{ margin: '0 0 12px', fontWeight: 700 }}>
            {fase}
          </div>
        )}
        {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}
        {bloqueos.length > 0 && (
          <ul data-testid="deshacer-agrupar-bloqueos" style={{ margin: '0 0 12px', paddingLeft: 18, color: '#b45309' }}>
            {bloqueos.map((texto) => (
              <li key={texto} style={{ marginBottom: 6 }}>{texto}</li>
            ))}
          </ul>
        )}
        {puede && (
          <>
            <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
              {vista.lineas} línea(s) en {vista.solicitudes} solicitud(es).
              {creadas.length > 0 ? ` Se eliminan ${creadas.length} solicitud(es) creadas por Agrupar.` : ''}
            </div>
            {ejemplos.length > 0 && (
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 'var(--cc-sm)' }}>
                {ejemplos.map((ej) => (
                  <li key={ej.item_id} style={{ marginBottom: 4 }}>
                    Línea {ej.item_id}: de la solicitud {ej.desde} (n.º {ej.numero_actual ?? '—'})
                    {' '}vuelve a {ej.hacia} (n.º {ej.numero_original ?? '—'}).
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {resumen && vista?.duracion_ms != null && (
          <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 8 }}>Tardó {vista.duracion_ms} ms.</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={onCancel}>
            {resumen || !puede ? 'Cerrar' : 'Cancelar'}
          </button>
          {puede && (
            <button
              type="button"
              style={ui.btnPrimary}
              data-testid="deshacer-agrupar-confirmar"
              disabled={busy}
              onClick={() => onConfirm?.()}
            >
              {busy ? (fase || 'Deshaciendo…') : 'Deshacer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
