import { useEffect, useState } from 'react'
import { fmtNota } from './tareaMadrePartes'

/**
 * Vista de cumplimiento por persona (promedio de notas cerradas/vencidas).
 */
export default function CumplimientoPersonaPanel({ t, api, contratoId, onAbrirItem }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api?.cumplimientoPersona || contratoId == null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api.cumplimientoPersona()
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data?.personas) ? data.personas : [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'No se pudo cargar el cumplimiento')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, contratoId])

  return (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: 14,
      background: t.bgCard,
      boxShadow: t.shadow,
    }}
    >
      <div style={{ fontSize: 'var(--cc-h3, 15px)', fontWeight: 700, color: t.text, marginBottom: 4 }}>
        Cumplimiento por persona
      </div>
      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginBottom: 12 }}>
        Promedio de tareas y compromisos asignados ya cerrados o vencidos. Las tareas personales no califican.
      </div>
      {loading && <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando…</div>}
      {error && <div style={{ color: 'var(--cc-color-danger,#b91c1c)', fontSize: 'var(--cc-sm)' }}>{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
          Aún no hay ítems calificados en este contrato.
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((p) => (
            <div
              key={p.usuario_id}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                background: t.bg || `${t.primary}06`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-sm)' }}>{p.nombre}</span>
                <span style={{ fontWeight: 800, color: t.primary, fontSize: 'var(--cc-sm)' }}>
                  {fmtNota(p.promedio) || '—'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                {p.n_calificadas} ítem{p.n_calificadas === 1 ? '' : 's'} calificado{p.n_calificadas === 1 ? '' : 's'}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(p.items || []).slice(0, 8).map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onAbrirItem?.(it.id)}
                    style={{
                      border: 'none', background: 'transparent', textAlign: 'left',
                      cursor: 'pointer', padding: 0, color: t.text, fontSize: 11,
                      display: 'flex', justifyContent: 'space-between', gap: 8,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.origen === 'compromiso' ? '📋' : '✅'} {it.titulo}
                    </span>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>{fmtNota(it.nota)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
