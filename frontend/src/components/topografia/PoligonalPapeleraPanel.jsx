/**
 * Papelera de poligonal: armadas y puntos eliminados (retención ~30 días).
 */
export default function PoligonalPapeleraPanel({
  theme,
  data = null,
  loading = false,
  busy = false,
  onRefresh,
  onRestaurarArmada,
  onRestaurarEstacion,
  onPurgarArmada,
  onPurgarEstacion,
  onClose,
}) {
  const t = theme || {}
  const armadas = data?.armadas || []
  const estaciones = data?.estaciones || []
  const dias = data?.dias_retencion ?? 30
  const total = data?.total ?? armadas.length + estaciones.length

  const th = {
    textAlign: 'left',
    fontSize: 'var(--cc-xs)',
    color: t.textMuted || '#64748B',
    padding: '6px 8px',
    borderBottom: `1px solid ${t.border || '#E2E8F0'}`,
  }
  const td = {
    padding: '8px',
    fontSize: 'var(--cc-xs)',
    color: t.text || '#0F172A',
    borderBottom: `1px solid ${t.border || '#F1F5F9'}`,
    verticalAlign: 'middle',
  }
  const btnRestore = {
    border: 'none',
    background: '#E6F4F5',
    color: '#0E7C86',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
    marginRight: 4,
  }
  const btnPurge = {
    border: 'none',
    background: '#FEE2E2',
    color: '#DC2626',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 'var(--cc-xs)',
    fontWeight: 700,
    cursor: busy ? 'default' : 'pointer',
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${t.border || '#E2E8F0'}`,
        borderRadius: 10,
        background: t.bgCard || '#fff',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 12px',
          background: '#F8FAFC',
          borderBottom: `1px solid ${t.border || '#E2E8F0'}`,
        }}
      >
        <div>
          <strong style={{ color: t.text }}>Papelera</strong>
          <span style={{ marginLeft: 8, fontSize: 'var(--cc-xs)', color: t.textMuted }}>
            {total} elemento{total === 1 ? '' : 's'} · retención {dias} días
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || busy}
            style={{
              ...btnRestore,
              background: '#fff',
              border: `1px solid ${t.border || '#CBD5E1'}`,
            }}
          >
            {loading ? '…' : 'Actualizar'}
          </button>
          {onClose && (
            <button type="button" onClick={onClose} style={btnRestore}>
              Cerrar
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 12, maxHeight: 320, overflow: 'auto' }}>
        {loading && !data ? (
          <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando papelera…</p>
        ) : total === 0 ? (
          <p style={{ margin: 0, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
            No hay elementos eliminados. Los puntos y armadas borrados permanecen aquí hasta {dias} días.
          </p>
        ) : (
          <>
            {armadas.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', marginBottom: 6, color: t.text }}>
                  Armadas ({armadas.length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>#</th>
                      <th style={th}>Estación</th>
                      <th style={th}>Visado</th>
                      <th style={th}>Días</th>
                      <th style={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {armadas.map((a) => (
                      <tr key={a.id}>
                        <td style={td}>{a.orden}</td>
                        <td style={td}>{a.estacion_nombre || '—'}</td>
                        <td style={td}>{a.visado_nombre || '—'}</td>
                        <td style={td}>
                          {a.dias_restantes != null ? `${a.dias_restantes} rest.` : '—'}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button type="button" style={btnRestore} disabled={busy} onClick={() => onRestaurarArmada?.(a)}>
                            Restaurar
                          </button>
                          <button type="button" style={btnPurge} disabled={busy} onClick={() => onPurgarArmada?.(a)}>
                            Purgar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {estaciones.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', marginBottom: 6, color: t.text }}>
                  Puntos de cartera ({estaciones.length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>#</th>
                      <th style={th}>Punto</th>
                      <th style={th}>Tipo</th>
                      <th style={th}>Días</th>
                      <th style={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {estaciones.map((e) => (
                      <tr key={e.id}>
                        <td style={td}>{e.orden}</td>
                        <td style={td}><strong>{e.nombre_punto || '—'}</strong></td>
                        <td style={td}>{e.tipo_punto === 'estacion' ? 'Estación' : 'Auxiliar'}</td>
                        <td style={td}>
                          {e.dias_restantes != null ? `${e.dias_restantes} rest.` : '—'}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button type="button" style={btnRestore} disabled={busy} onClick={() => onRestaurarEstacion?.(e)}>
                            Restaurar
                          </button>
                          <button type="button" style={btnPurge} disabled={busy} onClick={() => onPurgarEstacion?.(e)}>
                            Purgar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
