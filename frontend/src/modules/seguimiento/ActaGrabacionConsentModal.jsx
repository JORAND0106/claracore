import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { formatMinutosCupo } from './actaGrabacionHelpers'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

const GUION_MODERADOR = `Buenos días / buenas tardes. Antes de iniciar, informo que esta reunión será grabada únicamente para elaborar el acta de compromisos y temas en ClaraCore.

El audio no se almacena de forma permanente en la plataforma: se descarga en el dispositivo de quien graba y se usa de manera temporal para la síntesis del acta.

Con fundamento en la Ley 1581 de 2012 (protección de datos personales), cada participante debe indicar en voz alta su nombre completo, la entidad o empresa que representa, y si autoriza o no la grabación de su voz para este fin.

Quien no autorice podrá permanecer en la reunión sin que su intervención sea objeto de grabación, en la medida de lo posible. Continuamos con la ronda de presentaciones y consentimientos.`

/**
 * Consentimiento previo a grabar (Ley 1581) + aviso de cupo y captura.
 */
export default function ActaGrabacionConsentModal({
  t,
  cupo = null,
  busy = false,
  error = '',
  viewportCompact = false,
  onCancel,
  onConfirm,
  zIndex = 13000,
}) {
  const [leido, setLeido] = useState(false)
  const [ronda, setRonda] = useState(false)
  const [tabAudio, setTabAudio] = useState(true)

  useEffect(() => {
    setLeido(false)
    setRonda(false)
    setTabAudio(true)
  }, [])

  const restantes = cupo?.segundos_restantes
  const bloqueado = cupo?.blocked === true || (restantes != null && restantes <= 0)
  const canStart = leido && ronda && !bloqueado && !busy

  return (
    <div
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cc-grabacion-consent-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.()
      }}
    >
      <div
        style={{
          ...seguimientoModalSheetStyle(viewportCompact),
          width: viewportCompact ? undefined : 'min(560px, 100%)',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 12px 40px rgba(0,0,0,0.2)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: viewportCompact ? '96dvh' : '92vh',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ padding: '14px 18px 18px', overflow: 'auto' }}>
          <h2 id="cc-grabacion-consent-title" style={{ margin: '0 0 6px', fontSize: 'var(--cc-title)', color: t.text }}>
            Grabar reunión
          </h2>
          <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.45 }}>
            Antes de capturar audio, el moderador debe leer el aviso y completar la ronda de consentimiento.
            La grabación coexiste con «Redactar con Clara»; no sustituye la redacción de temas.
          </p>

          {cupo && (
            <div style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${bloqueado ? 'var(--cc-color-danger,#b91c1c)' : t.border}`,
              background: bloqueado
                ? 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 10%, transparent)'
                : (t.bg || '#fff'),
              fontSize: 'var(--cc-sm)',
              color: t.text,
            }}
            >
              Cupo del contrato hoy:{' '}
              <strong>{formatMinutosCupo(cupo.segundos_restantes)} min</strong>
              {' '}restantes de {cupo.limite_minutos ?? 180} min (hora Colombia).
              {bloqueado && ' El cupo está agotado; podrá grabar mañana.'}
            </div>
          )}

          <label style={{ display: 'block', fontSize: 'var(--cc-label)', fontWeight: 600, color: t.textMuted, marginBottom: 4 }}>
            Guion para leer en voz alta
          </label>
          <textarea
            readOnly
            value={GUION_MODERADOR}
            rows={10}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: 'var(--cc-sm)',
              lineHeight: 1.45,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bg || '#fff',
              color: t.text,
              resize: 'vertical',
              marginBottom: 12,
            }}
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
            <span>Confirmó que leyó el aviso en voz alta a los asistentes.</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={ronda} onChange={(e) => setRonda(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
            <span>
              Cada asistente indicó nombre, entidad y consentimiento (o negativa) conforme a la Ley 1581 de 2012.
            </span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={tabAudio} onChange={(e) => setTabAudio(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
            <span>
              Incluir audio de pestaña/ventana del navegador (Meet, Teams web, etc.). Si cancela el diálogo del navegador, se grabará solo el micrófono.
            </span>
          </label>

          <p style={{ margin: '0 0 12px', fontSize: 'var(--cc-xs, 11px)', color: t.textMuted, lineHeight: 1.4 }}>
            El archivo se descarga automáticamente en su equipo al detener. ClaraCore no guarda el audio en servidores.
            Apps de escritorio nativas fuera del navegador no se capturan.
          </p>

          {error && (
            <div style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--cc-color-danger,#b91c1c)',
              background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 12%, transparent)',
              color: t.text,
              fontSize: 'var(--cc-sm)',
            }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 12px',
                cursor: busy ? 'wait' : 'pointer',
                background: 'transparent',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canStart}
              onClick={() => onConfirm?.({ includeTabAudio: tabAudio })}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: canStart ? 'pointer' : 'not-allowed',
                background: canStart ? t.primary : `${t.border}`,
                color: canStart ? '#fff' : t.textMuted,
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
                opacity: canStart ? 1 : 0.7,
              }}
            >
              {busy ? 'Iniciando…' : 'Continuar y grabar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { GUION_MODERADOR }
