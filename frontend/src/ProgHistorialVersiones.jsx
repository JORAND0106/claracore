import {
  progVersionFechaLinea,
  progVersionMotivo,
  progVersionSelladoTooltip,
} from './progObraVersiones'

const ESTADO_STYLE = {
  borrador: { bg: '#e0e7ff', fg: '#3730a3' },
  en_validacion: { bg: '#fef3c7', fg: '#92400e' },
  sellada: { bg: '#d1fae5', fg: '#065f46' },
  archivada: { bg: '#f3f4f6', fg: '#4b5563' },
  rechazada: { bg: '#fee2e2', fg: '#991b1b' },
}

function btnGhost(t, disabled) {
  return {
    padding: '0.2rem 0.5rem',
    fontSize: 'var(--cc-caption)',
    fontWeight: 600,
    borderRadius: 5,
    border: `1px solid ${t.border}`,
    background: t.bgCard,
    color: t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function btnPrimary(t, disabled) {
  return {
    ...btnGhost(t, disabled),
    border: `1px solid ${t.primary}`,
    color: t.primary,
    background: `${t.primary}12`,
  }
}

export default function ProgHistorialVersiones({
  versiones = [],
  versionBaselineId = null,
  t,
  puedeEditar = false,
  panelBusy = false,
  onConsultar,
  onContinuar,
  onComparar,
}) {
  const n = versiones.length
  if (n === 0) return null

  const baselineId = versionBaselineId ? String(versionBaselineId) : null

  return (
    <details style={{ marginTop: '0.15rem' }}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 'var(--cc-sm)',
          fontWeight: 700,
          color: t.textMuted,
          userSelect: 'none',
          listStylePosition: 'inside',
          lineHeight: 1.4,
        }}
      >
        Historial ({n} versión{n === 1 ? '' : 'es'})
      </summary>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {versiones.map((v) => {
          const est = (v.estado || '').toLowerCase()
          const archivada = est === 'archivada'
          const vigente = Boolean(v.es_vigente)
          const esBorrador = est === 'borrador'
          const esSellada = est === 'sellada'
          const fecha = progVersionFechaLinea(v)
          const selladoTip = progVersionSelladoTooltip(v)
          const motivo = progVersionMotivo(v)
          const estStyle = ESTADO_STYLE[est] || { bg: t.bg, fg: t.textMuted }
          const puedeComparar =
            esSellada &&
            (v.tipo || '') !== 'baseline' &&
            baselineId &&
            String(v.id) !== baselineId

          return (
            <div
              key={v.id}
              style={{
                border: `1px solid ${vigente ? t.primary : t.border}`,
                borderRadius: 8,
                padding: '0.5rem 0.65rem',
                background: vigente ? `${t.primary}0c` : t.bg,
                opacity: archivada ? 0.62 : 1,
                fontSize: 'var(--cc-sm)',
                lineHeight: 1.4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700, color: archivada ? t.textMuted : t.text }}>
                  nº{v.numero_version}
                </span>
                <span style={{ color: t.textMuted }}>·</span>
                <span style={{ color: t.text }}>{v.tipo || '—'}</span>
                <span style={{ color: t.textMuted }}>·</span>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.05rem 0.35rem',
                    borderRadius: 4,
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    background: estStyle.bg,
                    color: estStyle.fg,
                  }}
                >
                  {v.estado || '—'}
                </span>
                {fecha && (
                  <>
                    <span style={{ color: t.textMuted }}>·</span>
                    <span style={{ color: t.textMuted }} title={selladoTip || undefined}>
                      {fecha}
                    </span>
                  </>
                )}
                {vigente && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 'var(--cc-caption)',
                      fontWeight: 700,
                      color: t.primary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ← vigente
                  </span>
                )}
              </div>
              <div
                style={{
                  color: archivada ? t.textMuted : t.text,
                  fontStyle: motivo !== '—' ? 'italic' : 'normal',
                  marginBottom: 6,
                  fontSize: 'var(--cc-caption)',
                }}
              >
                &ldquo;{motivo}&rdquo;
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {esBorrador && puedeEditar ? (
                  <button
                    type="button"
                    style={btnPrimary(t, panelBusy)}
                    disabled={panelBusy}
                    onClick={() => onContinuar?.(v)}
                  >
                    Continuar edición
                  </button>
                ) : (
                  <button
                    type="button"
                    style={btnGhost(t, panelBusy)}
                    disabled={panelBusy}
                    onClick={() => onConsultar?.(v)}
                  >
                    Consultar
                  </button>
                )}
                {puedeComparar && (
                  <button
                    type="button"
                    style={btnGhost(t, panelBusy)}
                    disabled={panelBusy}
                    onClick={() => onComparar?.(v)}
                  >
                    Comparar vs baseline
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}
