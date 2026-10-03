import { useMemo, useState } from 'react'
import {
  SICOE_AUDITORIA_JUSTIFICACIONES,
  colorSemaforo,
  etiquetaSemaforo,
} from './sicoeAuditoriaTraslapos'

/**
 * Semáforo de auditoría al asignar ítem.
 * Rojo: exige justificación o cancelar.
 * Amarillo: informativo, continuar sin justificar.
 * Verde: no se monta normalmente.
 */
export default function SicoeAuditoriaTraslaposModal({
  t,
  analisis,
  modoLote = false,
  onContinuar,
  onCancelar,
  onAbrirRegistro,
  zIndex = 12000,
}) {
  const [justificacion, setJustificacion] = useState('')
  const [idxLote, setIdxLote] = useState(0)
  const resultados = analisis?.resultados || (analisis ? [analisis] : [])
  const semaforo = analisis?.semaforo || 'verde'
  const color = colorSemaforo(semaforo)
  const actual = resultados[Math.min(idxLote, Math.max(0, resultados.length - 1))] || analisis
  const hallazgos = actual?.hallazgos || []
  const resumen = analisis?.resumen

  const titulo = useMemo(() => {
    if (modoLote) return `Auditoría de ubicación · ${resultados.length} registro(s)`
    const n = actual?.numero_registro
    return n != null ? `Auditoría · Reg. ${n}` : 'Auditoría de ubicación'
  }, [modoLote, resultados.length, actual?.numero_registro])

  if (!analisis || semaforo === 'verde') return null

  const puedeContinuarRojo = semaforo !== 'rojo' || !!justificacion

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancelar}
    >
      <div
        role="dialog"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `2px solid ${color}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 0 4px ${color}33`,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t.text }}>{titulo}</div>
            <div style={{ fontSize: 'var(--cc-sm)', color, fontWeight: 700 }}>
              {etiquetaSemaforo(semaforo)}
              {modoLote && resumen
                ? ` · 🔴 ${resumen.rojo || 0} · 🟡 ${resumen.amarillo || 0} · 🟢 ${resumen.verde || 0}`
                : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              background: 'transparent',
              border: 'none',
              color: t.textMuted,
              fontSize: 'var(--cc-lg)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {modoLote && resultados.length > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={idxLote <= 0}
              onClick={() => setIdxLote((i) => Math.max(0, i - 1))}
              style={{
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                borderRadius: 8,
                padding: '4px 10px',
                cursor: idxLote <= 0 ? 'default' : 'pointer',
                opacity: idxLote <= 0 ? 0.45 : 1,
              }}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, fontWeight: 600 }}>
              {idxLote + 1} / {resultados.length}
              {actual?.numero_registro != null ? ` · Reg. ${actual.numero_registro}` : ''}
              {actual?.semaforo ? ` · ${etiquetaSemaforo(actual.semaforo)}` : ''}
            </span>
            <button
              type="button"
              disabled={idxLote >= resultados.length - 1}
              onClick={() => setIdxLote((i) => Math.min(resultados.length - 1, i + 1))}
              style={{
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                borderRadius: 8,
                padding: '4px 10px',
                cursor: idxLote >= resultados.length - 1 ? 'default' : 'pointer',
                opacity: idxLote >= resultados.length - 1 ? 0.45 : 1,
              }}
            >
              Siguiente →
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {hallazgos.length === 0 && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Sin hallazgos en este registro.</div>
          )}
          {hallazgos.map((h, i) => (
            <div
              key={`${h.tipo}-${i}`}
              style={{
                border: `1px solid ${h.tipo === 'traslapo' ? '#dc262655' : '#d9770655'}`,
                background: h.tipo === 'traslapo' ? '#dc262612' : '#d9770612',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-sm)', lineHeight: 1.4 }}>
                {h.texto}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(h.registros_involucrados || [])
                  .filter((r) => r?.id != null)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onAbrirRegistro?.(r)}
                      style={{
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        color: t.primary,
                        borderRadius: 999,
                        padding: '3px 10px',
                        fontSize: 'var(--cc-caption)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Abrir registro involucrado"
                    >
                      Reg. {r.numero_registro ?? r.id}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {semaforo === 'rojo' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Justificación para continuar
            </div>
            <select
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              style={{
                width: '100%',
                background: t.bg,
                color: t.text,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 'var(--cc-sm)',
              }}
            >
              <option value="">— Elija una justificación —</option>
              {SICOE_AUDITORIA_JUSTIFICACIONES.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
        )}

        {semaforo === 'amarillo' && (
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 14 }}>
            Alerta informativa: puede continuar sin justificar, o cancelar para corregir.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              color: t.textMuted,
              borderRadius: 10,
              padding: '10px 16px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Cancelar asignación
          </button>
          <button
            type="button"
            disabled={!puedeContinuarRojo}
            onClick={() => {
              if (!puedeContinuarRojo) return
              onContinuar?.({
                decision: semaforo === 'rojo' ? 'justifico' : 'continuo_sin_justificar',
                justificacion: semaforo === 'rojo' ? justificacion : null,
              })
            }}
            style={{
              background: puedeContinuarRojo ? color : `${color}66`,
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              padding: '10px 16px',
              fontWeight: 800,
              cursor: puedeContinuarRojo ? 'pointer' : 'not-allowed',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
