import { FolderPlus, Plus, StickyNote } from 'lucide-react'
import { fmtFecha, fmtFechaHora, ESTADOS_GESTION } from './seguimientoTheme'
import { fmtNota, resumenAvancePartes } from './tareaMadrePartes'

/**
 * Presentación carpeta + post-its de partes.
 * Botones solo ícono + tooltip. Armoniza con tema (usa tokens t.*).
 */
export default function TareaMadrePartesView({
  t,
  partes = [],
  promedioNota = null,
  onAbrirParte,
  onAgregarParte,
  canAgregar = false,
  compact = false,
}) {
  const resumen = resumenAvancePartes(partes)
  const pct = resumen.avance_pct != null ? resumen.avance_pct : 0

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 8, flexWrap: 'wrap',
      }}
      >
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderPlus size={16} aria-hidden />
          Partes de la tarea
          {promedioNota != null && (
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 600,
              color: t.primary, background: `${t.primary}18`,
              borderRadius: 6, padding: '2px 8px',
            }}
            >
              Promedio {fmtNota(promedioNota)}
            </span>
          )}
        </div>
        {canAgregar && (
          <button
            type="button"
            title="Agregar parte"
            aria-label="Agregar parte"
            onClick={onAgregarParte}
            style={iconBtn(t)}
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Barra de avance con conteo de estados */}
      <div style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: compact ? '8px 10px' : '10px 12px',
        background: t.bg || `${t.primary}08`,
        marginBottom: 12,
      }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          gap: 8, marginBottom: 6, flexWrap: 'wrap',
        }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
            Avance {resumen.avance_pct != null ? `${resumen.avance_pct}%` : '—'}
          </span>
          <span style={{ fontSize: 11, color: t.textMuted }}>
            {resumen.cumplidas} cumplidas · {resumen.en_curso} en curso · {resumen.pendientes} pendientes · {resumen.vencidas} vencidas
          </span>
        </div>
        <div style={{
          height: 8, borderRadius: 999, background: `${t.border}`, overflow: 'hidden', display: 'flex',
        }}
        >
          <div style={{ width: `${pct}%`, background: t.primary, transition: 'width .25s ease' }} />
        </div>
      </div>

      {partes.length === 0 ? (
        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, padding: '8px 0' }}>
          Sin partes aún. Agregue partes con responsable, fecha y contenido propios.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(auto-fill, minmax(140px, 1fr))'
            : 'repeat(auto-fill, minmax(168px, 1fr))',
          gap: 10,
        }}
        >
          {partes.map((p) => {
            const vencida = String(p.estado_gestion || '').toLowerCase() === 'vencido'
            const estadoLabel = ESTADOS_GESTION.find((x) => x.value === p.estado_gestion)?.label
              || p.estado_gestion
              || '—'
            const nota = fmtNota(p.calificacion_nota)
            return (
              <button
                key={p.id}
                type="button"
                title={p.titulo}
                onClick={() => onAbrirParte?.(p)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${vencida ? 'var(--cc-color-danger,#b91c1c)' : t.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: vencida
                    ? 'color-mix(in srgb, var(--cc-color-danger,#b91c1c) 10%, transparent)'
                    : (t.bgCard || t.bg),
                  boxShadow: t.shadow || '0 1px 2px rgba(0,0,0,.06)',
                  cursor: 'pointer',
                  minHeight: 110,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  color: t.text,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <StickyNote size={14} style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }} aria-hidden />
                  <div style={{
                    fontSize: 12, fontWeight: 700, lineHeight: 1.3,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}
                  >
                    {p.titulo || 'Parte'}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.35 }}>
                  {p.asignado_a_nombre || 'Sin responsable'}
                </div>
                <div style={{ fontSize: 10, color: t.textMuted }}>
                  {fmtFechaHora(p.fecha_vencimiento, p.hora_vencimiento) || fmtFecha(p.fecha_vencimiento)}
                </div>
                <div style={{
                  marginTop: 'auto', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 4,
                }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: vencida ? 'var(--cc-color-danger,#b91c1c)' : t.primary,
                  }}
                  >
                    {estadoLabel}
                  </span>
                  {nota && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.text }}>{nota}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function iconBtn(t) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: t.bgCard || 'transparent',
    color: t.text,
    cursor: 'pointer',
    padding: 0,
  }
}
