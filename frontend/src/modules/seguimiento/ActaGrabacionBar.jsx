import { formatMinutosCupo, formatMmSs } from './actaGrabacionHelpers'

/**
 * Barra fija durante la grabación activa (no bloquea el editor / Clara).
 */
export default function ActaGrabacionBar({
  t,
  elapsedSec = 0,
  segundosRestantes = null,
  tabAudioOk = false,
  stopping = false,
  onStop,
}) {
  const low = segundosRestantes != null && segundosRestantes <= 120

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${low ? 'var(--cc-color-danger,#b91c1c)' : t.border}`,
        background: low
          ? 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 12%, transparent)'
          : 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 8%, transparent)',
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 'var(--cc-sm)', color: t.text }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--cc-color-danger,#b91c1c)',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--cc-color-danger,#b91c1c) 25%, transparent)',
            }}
          />
          Grabando {formatMmSs(elapsedSec)}
        </span>
        {segundosRestantes != null && (
          <span style={{ color: t.textMuted }}>
            Cupo restante: {formatMinutosCupo(segundosRestantes)} min
          </span>
        )}
        <span style={{ color: t.textMuted }}>
          {tabAudioOk ? 'Micrófono + pestaña' : 'Solo micrófono'}
        </span>
      </div>
      <button
        type="button"
        disabled={stopping}
        onClick={onStop}
        style={{
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: stopping ? 'wait' : 'pointer',
          background: 'var(--cc-color-danger,#b91c1c)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 'var(--cc-sm)',
        }}
      >
        {stopping ? 'Deteniendo…' : 'Detener y descargar'}
      </button>
    </div>
  )
}
