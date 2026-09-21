import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import {
  buildGuionModeradorGrabacion,
  formatMinutosCupo,
} from './actaGrabacionHelpers'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

/** Ancho previo ~560px → el doble en escritorio. */
const MODAL_WIDTH_DESKTOP = 'min(1120px, 98vw)'

/**
 * Consentimiento DURANTE la grabación (Ley 1581).
 * La lectura del guion debe quedar capturada en el audio ya iniciado.
 */
export default function ActaGrabacionConsentModal({
  t,
  cupo = null,
  busy = false,
  /** Detener en curso: no bloquear Detener por busy de inicio/checkpoint. */
  stopping = false,
  error = '',
  viewportCompact = false,
  /** true = mic+pestaña; false = solo mic (informativo; ya no se elige aquí). */
  tabAudioOk = false,
  onCancel,
  onConfirm,
  zIndex = 13000,
  /** Inyectable para pruebas de saludo dinámico. */
  now = null,
}) {
  const [leido, setLeido] = useState(false)
  const [ronda, setRonda] = useState(false)

  const guion = useMemo(
    () => buildGuionModeradorGrabacion(now || new Date()),
    [now],
  )

  useEffect(() => {
    setLeido(false)
    setRonda(false)
  }, [])

  const restantes = cupo?.segundos_restantes
  const bloqueado = cupo?.blocked === true || (restantes != null && restantes <= 0)
  const canContinue = leido && ronda && !busy && !stopping

  return (
    <div
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cc-grabacion-consent-title"
      // No cerrar al clic fuera: la grabación ya corre; exige Continuar o Detener.
    >
      <div
        style={{
          ...seguimientoModalSheetStyle(viewportCompact),
          width: viewportCompact ? undefined : MODAL_WIDTH_DESKTOP,
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
        <div
          style={{
            padding: viewportCompact ? '12px 14px 16px' : '16px 22px 20px',
            overflow: viewportCompact ? 'auto' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
          }}
        >
          <div>
            <h2 id="cc-grabacion-consent-title" style={{ margin: '0 0 4px', fontSize: 'var(--cc-title)', color: t.text }}>
              Grabación en curso — consentimiento
            </h2>
            <p style={{ margin: 0, fontSize: 'var(--cc-sm)', color: t.textMuted, lineHeight: 1.4 }}>
              La captura ya está activa. Lea el aviso en voz alta para que quede registrado en el audio,
              confirme la ronda de consentimiento y continúe la reunión.
            </p>
          </div>

          <div style={{
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 8%, transparent)',
            fontSize: 'var(--cc-sm)',
            color: t.text,
            fontWeight: 600,
            flexShrink: 0,
          }}
          >
            ● Grabando ahora · {tabAudioOk ? 'Micrófono + pestaña' : 'Solo micrófono'}
            {cupo && !bloqueado && (
              <span style={{ fontWeight: 500, color: t.textMuted }}>
                {' '}· Cupo restante: {formatMinutosCupo(cupo.segundos_restantes)} min
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewportCompact ? '1fr' : 'minmax(0, 1.35fr) minmax(280px, 0.9fr)',
              gap: viewportCompact ? 12 : 18,
              alignItems: 'start',
              minHeight: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--cc-label)', fontWeight: 600, color: t.textMuted, marginBottom: 6 }}>
                Guion para leer en voz alta
              </div>
              <div
                data-testid="cc-grabacion-guion"
                role="document"
                aria-label="Texto para leer en voz alta"
                style={{
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg || '#fff',
                  color: t.text,
                  fontSize: viewportCompact ? 'var(--cc-sm)' : 'calc(var(--cc-sm) + 1px)',
                  lineHeight: 1.42,
                  whiteSpace: 'pre-wrap',
                  overflow: 'visible',
                  maxHeight: 'none',
                }}
              >
                {guion}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
                <span>Confirmó que leyó el aviso en voz alta a los asistentes.</span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--cc-sm)', color: t.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={ronda} onChange={(e) => setRonda(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
                <span>
                  Cada asistente indicó nombre, entidad y consentimiento (o negativa) conforme a la Ley 1581 de 2012.
                </span>
              </label>
              <p style={{ margin: 0, fontSize: 'var(--cc-xs, 11px)', color: t.textMuted, lineHeight: 1.4 }}>
                Al detener, el archivo se descarga en su equipo. ClaraCore no lo guarda en servidores.
                Conserve esa copia usted mismo si necesita un archivo de la reunión. Apps nativas fuera del navegador no se capturan.
              </p>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--cc-color-danger,#b91c1c)',
              background: 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 12%, transparent)',
              color: t.text,
              fontSize: 'var(--cc-sm)',
              flexShrink: 0,
            }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <button
              type="button"
              disabled={stopping}
              onClick={onCancel}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 12px',
                cursor: stopping ? 'wait' : 'pointer',
                background: 'transparent',
                color: t.text,
                fontSize: 'var(--cc-sm)',
              }}
            >
              {stopping ? 'Deteniendo…' : 'Detener grabación'}
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => onConfirm?.()}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: canContinue ? 'pointer' : 'not-allowed',
                background: canContinue ? t.primary : `${t.border}`,
                color: canContinue ? '#fff' : t.textMuted,
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
                opacity: canContinue ? 1 : 0.7,
              }}
            >
              Continuar la reunión
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { MODAL_WIDTH_DESKTOP }
