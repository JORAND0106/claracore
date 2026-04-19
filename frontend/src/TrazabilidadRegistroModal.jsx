import { useEffect, useState } from 'react'

/**
 * Muestra el historial de auditoría de una entidad (GET /logs/entidad/...).
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
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: '22px 24px',
          width: 720,
          maxWidth: '96vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: t.shadow || '0 20px 60px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>📜 Trazabilidad</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{titulo}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: t.textMuted }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: t.textMuted }}>Cargando historial…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28, color: t.textMuted, fontSize: 13 }}>
            Aún no hay eventos de auditoría para este registro.
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((h) => {
              const det = parseDet(h.detalle)
              const va = h.valor_anterior
              const vn = h.valor_nuevo
              return (
                <div
                  key={h.id}
                  style={{
                    background: t.bg || t.inputBg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: t.primary }}>{h.accion}</span>
                    <span style={{ color: t.textMuted, fontSize: 11 }}>{fmtFecha(h.created_at)}</span>
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 4 }}>
                    {h.usuario_nombre || '—'} · {h.modulo}
                    {h.severidad ? ` · ${h.severidad}` : ''}
                  </div>
                  {Object.keys(det).length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: t.text }}>
                      {Object.entries(det).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                          <span style={{ color: t.textMuted, minWidth: 100 }}>{k}:</span>
                          <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(va != null && (typeof va === 'object' ? Object.keys(va).length : true)) ||
                  (vn != null && (typeof vn === 'object' ? Object.keys(vn).length : true)) ? (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Valor anterior</div>
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: 10,
                            color: t.text,
                            maxHeight: 160,
                            overflow: 'auto',
                            background: t.inputBg,
                            padding: 8,
                            borderRadius: 6,
                          }}
                        >
                          {typeof va === 'string' ? va : JSON.stringify(va, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 4 }}>Valor nuevo</div>
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: 10,
                            color: t.text,
                            maxHeight: 160,
                            overflow: 'auto',
                            background: t.inputBg,
                            padding: 8,
                            borderRadius: 6,
                          }}
                        >
                          {typeof vn === 'string' ? vn : JSON.stringify(vn, null, 2)}
                        </pre>
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
