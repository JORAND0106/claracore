import { useEffect, useState } from 'react'

/**
 * Muestra el historial de auditoría de una entidad (GET /logs/entidad/...).
 * Tipografía y densidad alineadas con la escala global (--cc-*, --cc-space-*).
 */
export default function TrazabilidadRegistroModal({
  apiBase,
  token,
  entidadTipo,
  entidadId,
  titulo,
  theme,
  onClose,
}) {
  const t = theme
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entidadTipo || entidadId == null || entidadId === '') {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(
      `${apiBase}/logs/entidad/${encodeURIComponent(entidadTipo)}/${encodeURIComponent(String(entidadId))}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [apiBase, token, entidadTipo, entidadId])

  const fmtFecha = (iso) => {
    if (!iso) return '—'
    try {
      const utc = iso.endsWith('Z') ? iso : iso + 'Z'
      return new Date(utc).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      })
    } catch {
      return iso
    }
  }

  const parseDet = (d) => {
    if (d == null) return {}
    if (typeof d === 'string') {
      try {
        return JSON.parse(d)
      } catch {
        return {}
      }
    }
    return typeof d === 'object' ? d : {}
  }

  const sx = {
    shell: {
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: 'var(--cc-space-4) var(--cc-space-5)',
      width: 720,
      maxWidth: '96vw',
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: t.shadow || '0 20px 60px rgba(0,0,0,0.35)',
    },
    title: {
      fontSize: 'var(--cc-title)',
      fontWeight: 800,
      color: t.text,
      lineHeight: 1.25,
    },
    subtitle: {
      fontSize: 'var(--cc-sm)',
      color: t.textMuted,
      marginTop: 'var(--cc-space-1)',
      lineHeight: 1.35,
    },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      fontSize: 'var(--cc-lg)',
      cursor: 'pointer',
      color: t.textMuted,
      lineHeight: 1,
      padding: 'var(--cc-space-1)',
    },
    card: {
      background: t.bg || t.inputBg,
      border: `1px solid ${t.border}`,
      borderRadius: 8,
      padding: 'var(--cc-space-2) var(--cc-space-3)',
      fontSize: 'var(--cc-sm)',
      lineHeight: 1.35,
    },
    accion: { fontWeight: 800, color: t.primary, letterSpacing: '0.02em' },
    fecha: { color: t.textMuted, fontSize: 'var(--cc-caption)' },
    meta: { color: t.textMuted, fontSize: 'var(--cc-caption)', marginTop: 2 },
    detRow: { display: 'flex', gap: 'var(--cc-space-2)', marginBottom: 1, alignItems: 'baseline' },
    detKey: { color: t.textMuted, minWidth: '7.5rem', flexShrink: 0, fontSize: 'var(--cc-caption)' },
    detVal: { color: t.text, fontSize: 'var(--cc-caption)', wordBreak: 'break-word' },
    diffLabel: {
      fontSize: 'var(--cc-caption)',
      fontWeight: 700,
      color: t.textMuted,
      marginBottom: 'var(--cc-space-1)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    pre: {
      margin: 0,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontSize: 'var(--cc-caption)',
      fontFamily: 'ui-monospace, Consolas, "Cascadia Code", monospace',
      lineHeight: 1.32,
      color: t.text,
      maxHeight: 'min(26vh, 11em)',
      overflow: 'auto',
      background: t.inputBg,
      padding: 'var(--cc-space-2)',
      borderRadius: 6,
    },
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 100002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div style={sx.shell} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 'var(--cc-space-3)',
            gap: 'var(--cc-space-3)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={sx.title}>📜 Trazabilidad</div>
            <div style={sx.subtitle}>{titulo}</div>
          </div>
          <button type="button" onClick={onClose} style={sx.closeBtn} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Cargando historial…
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--cc-space-5)',
              color: t.textMuted,
              fontSize: 'var(--cc-sm)',
            }}
          >
            Aún no hay eventos de auditoría para este registro.
          </div>
        ) : (
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--cc-space-2)',
            }}
          >
            {rows.map((h) => {
              const det = parseDet(h.detalle)
              const va = h.valor_anterior
              const vn = h.valor_nuevo
              return (
                <div key={h.id} style={sx.card}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 'var(--cc-space-2)',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <span style={sx.accion}>{h.accion}</span>
                    <span style={sx.fecha}>{fmtFecha(h.created_at)}</span>
                  </div>
                  <div style={sx.meta}>
                    {h.usuario_nombre || '—'} · {h.modulo}
                    {h.severidad ? ` · ${h.severidad}` : ''}
                  </div>
                  {Object.keys(det).length > 0 && (
                    <div style={{ marginTop: 'var(--cc-space-2)', color: t.text }}>
                      {Object.entries(det).map(([k, v]) => (
                        <div key={k} style={sx.detRow}>
                          <span style={sx.detKey}>{k}:</span>
                          <span style={sx.detVal}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(va != null && (typeof va === 'object' ? Object.keys(va).length : true)) ||
                  (vn != null && (typeof vn === 'object' ? Object.keys(vn).length : true)) ? (
                    <div
                      style={{
                        marginTop: 'var(--cc-space-3)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--cc-space-2)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={sx.diffLabel}>Valor anterior</div>
                        <pre style={sx.pre}>{typeof va === 'string' ? va : JSON.stringify(va, null, 2)}</pre>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={sx.diffLabel}>Valor nuevo</div>
                        <pre style={sx.pre}>{typeof vn === 'string' ? vn : JSON.stringify(vn, null, 2)}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
