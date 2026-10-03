import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../utils/formatCOP'

const API = typeof window !== 'undefined' ? (window.__CC_API_BASE || '') : ''

/**
 * Vista exclusiva Admin / Desarrollador: registros por revisar frente al listado.
 * Separa casos que afectan totales vs valores guardados desactualizados.
 */
export default function SeccionIntegridadListado({ call, contratos = [], theme, token }) {
  const [contratoId, setContratoId] = useState(() => {
    const first = contratos?.[0]?.id
    return first != null ? String(first) : ''
  })
  const [actaRpo, setActaRpo] = useState('1')
  const [todoContrato, setTodoContrato] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [filtroCaso, setFiltroCaso] = useState('todos')

  useEffect(() => {
    if (!contratoId && contratos?.[0]?.id != null) {
      setContratoId(String(contratos[0].id))
    }
  }, [contratos, contratoId])

  const cargar = useCallback(async () => {
    if (!contratoId) {
      setError('Seleccione un contrato.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const pm = new URLSearchParams()
      if (todoContrato) pm.set('todo_contrato', 'true')
      else if (actaRpo) pm.set('acta_rpo', String(actaRpo))
      const path = `/sicoe-obra/${encodeURIComponent(contratoId)}/integridad-listado?${pm}`
      let j = null
      if (typeof call === 'function') {
        j = await call('GET', path)
      } else {
        const tok = token || localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
        const r = await fetch(`${API}${path}`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        })
        if (!r.ok) {
          const msg = await r.text().catch(() => '')
          throw new Error(msg || `HTTP ${r.status}`)
        }
        j = await r.json()
      }
      setData(j)
    } catch (e) {
      setData(null)
      setError(String(e?.message || e || 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [actaRpo, call, contratoId, todoContrato, token])

  const filas = useMemo(() => {
    const all = data?.inconsistencias || []
    if (filtroCaso === 'afectan_totales') {
      return all.filter((r) => r.caso === 'afecta_totales')
    }
    if (filtroCaso === 'valor_guardado') {
      return all.filter((r) => r.caso === 'valor_guardado_desactualizado')
    }
    return all
  }, [data, filtroCaso])

  const resumen = data?.resumen || {}
  const at = resumen.afectan_totales || {}
  const st = resumen.valor_guardado_desactualizado || {}
  const text = theme?.text || '#0f172a'
  const muted = theme?.textMuted || '#64748b'
  const border = theme?.border || '#e2e8f0'
  const bgCard = theme?.bgCard || '#fff'

  return (
    <div style={{ color: text, fontSize: 'var(--cc-sm)' }}>
      <p style={{ color: muted, marginTop: 0, lineHeight: 1.45, maxWidth: 720 }}>
        Registros por revisar frente al listado de precios. No modifica datos. Las cifras del Dashboard
        usan VU del listado (regla única); los valores guardados desactualizados no cambian esos totales.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: muted, fontSize: 12 }}>Contrato</span>
          <select
            value={contratoId}
            onChange={(e) => setContratoId(e.target.value)}
            style={{ minWidth: 200, padding: '6px 10px', borderRadius: 6, border: `1px solid ${border}`, background: bgCard, color: text }}
          >
            <option value="">—</option>
            {(contratos || []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.numero || c.id}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: muted, fontSize: 12 }}>Acta RPO</span>
          <input
            type="text"
            value={actaRpo}
            disabled={todoContrato}
            onChange={(e) => setActaRpo(e.target.value)}
            style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: `1px solid ${border}`, background: bgCard, color: text }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}>
          <input type="checkbox" checked={todoContrato} onChange={(e) => setTodoContrato(e.target.checked)} />
          <span>Todo el contrato</span>
        </label>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={loading}
          style={{
            marginTop: 18,
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: '#0f766e',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {data?.aviso && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: 'rgba(148,163,184,0.12)',
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          {data.aviso}
          {data.valor_canonico != null && (
            <div style={{ marginTop: 6, color: muted }}>
              Valor canónico del filtro: <strong style={{ color: text }}>{formatCOP(data.valor_canonico)}</strong>
            </div>
          )}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${border}`, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase' }}>Afectan totales</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{at.n_registros ?? 0}</div>
            <div style={{ color: muted, fontSize: 12 }}>impacto ref. {formatCOP(at.impacto_plata || 0)}</div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${border}`, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase' }}>Valor guardado desact.</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{st.n_registros ?? 0}</div>
            <div style={{ color: muted, fontSize: 12 }}>impacto ref. {formatCOP(st.impacto_plata || 0)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'afectan_totales', label: 'Afectan totales' },
              { id: 'valor_guardado', label: 'Solo guardado' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroCaso(f.id)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${border}`,
                  background: filtroCaso === f.id ? '#0f766e' : bgCard,
                  color: filtroCaso === f.id ? '#fff' : text,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880, fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#4472C4', color: '#fff' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>#</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Ítem</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Capítulo</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Caso</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Tipo</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Cant</th>
                <th style={{ textAlign: 'right', padding: 8 }}>VU guard.</th>
                <th style={{ textAlign: 'right', padding: 8 }}>VU listado</th>
                <th style={{ textAlign: 'right', padding: 8 }}>CD guard.</th>
                <th style={{ textAlign: 'right', padding: 8 }}>CD esp.</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Impacto</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 16, color: muted, textAlign: 'center' }}>
                    Sin registros en este filtro.
                  </td>
                </tr>
              ) : (
                filas.map((r, idx) => (
                  <tr key={`${r.registro_id}-${r.tipo}-${idx}`} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ padding: 6 }}>{r.numero_registro ?? r.registro_id ?? '—'}</td>
                    <td style={{ padding: 6 }}>{r.item_numero || '—'}</td>
                    <td style={{ padding: 6, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.capitulo || '—'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {r.caso === 'afecta_totales' ? 'Afecta totales' : 'Guardado desact.'}
                    </td>
                    <td style={{ padding: 6 }} title={r.detalle || ''}>
                      {r.tipo}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{Number(r.cantidad_total || 0).toLocaleString('es-CO')}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {r.vu_guardado != null ? formatCOP(r.vu_guardado) : '—'}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {r.vu_listado != null ? formatCOP(r.vu_listado) : '—'}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {r.cd_guardado != null ? formatCOP(r.cd_guardado) : '—'}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {r.cd_esperado != null ? formatCOP(r.cd_esperado) : '—'}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>
                      {formatCOP(r.impacto_plata || 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
