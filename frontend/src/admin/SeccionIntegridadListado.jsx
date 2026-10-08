import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCOP } from '../utils/formatCOP'
import {
  CASO_TODOS,
  SIN_VALORIZAR,
  TARJETAS_REVISION,
  presentarRevisionListado,
} from './revisionListadoPresentacion.js'

const API = typeof window !== 'undefined' ? (window.__CC_API_BASE || '') : ''

/**
 * Vista exclusiva Admin / Desarrollador. Solo consulta: no modifica datos.
 */
export default function SeccionIntegridadListado({
  call,
  contratos = [],
  theme,
  token,
  onAbrirRegistro,
}) {
  const [contratoId, setContratoId] = useState(() => {
    const first = contratos?.[0]?.id
    return first != null ? String(first) : ''
  })
  const [actaRpo, setActaRpo] = useState('1')
  const [todoContrato, setTodoContrato] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [filtroCaso, setFiltroCaso] = useState(CASO_TODOS)

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

  const vista = useMemo(
    () => presentarRevisionListado(data?.inconsistencias || [], data?.valor_canonico),
    [data],
  )
  const filas = useMemo(() => {
    if (filtroCaso === CASO_TODOS) return vista.filas
    return vista.filas.filter((f) => f.caso === filtroCaso)
  }, [vista, filtroCaso])

  const contratoSel = useMemo(
    () => (contratos || []).find((c) => String(c.id) === String(contratoId)) || null,
    [contratos, contratoId],
  )

  const text = theme?.text || '#0f172a'
  const muted = theme?.textMuted || '#64748b'
  const border = theme?.border || '#e2e8f0'
  const bgCard = theme?.bgCard || '#fff'

  const abrir = (fila) => {
    if (typeof onAbrirRegistro !== 'function') return
    onAbrirRegistro(contratoSel, fila.registro_id, fila.reporte_id)
  }

  return (
    <div style={{ color: text, fontSize: 'var(--cc-sm)' }}>
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

      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {TARJETAS_REVISION.map((tarjeta) => {
            const activa = filtroCaso === tarjeta.id
            const bucket = tarjeta.id === CASO_TODOS ? null : vista.tarjetas[tarjeta.id]
            const principal = tarjeta.id === CASO_TODOS
              ? formatCOP(vista.tarjetas.valor_canonico)
              : String(bucket?.n ?? 0)
            return (
              <button
                key={tarjeta.id}
                type="button"
                data-testid={`tarjeta-revision-${tarjeta.id}`}
                aria-pressed={activa}
                onClick={() => setFiltroCaso(tarjeta.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${activa ? '#0f766e' : border}`,
                  boxShadow: activa ? 'inset 0 0 0 1px #0f766e' : 'none',
                  background: activa ? 'rgba(15,118,110,0.08)' : bgCard,
                  color: text,
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11, color: muted, lineHeight: 1.3 }}>{tarjeta.label}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4, wordBreak: 'break-word' }}>{principal}</div>
                {bucket && tarjeta.id !== 'sin_item' && (
                  <div style={{ color: muted, fontSize: 12, marginTop: 2 }}>{formatCOP(bucket.impacto || 0)}</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {data && (
        <div style={{ overflowX: 'auto', border: `1px solid ${border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#4472C4', color: '#fff' }}>
                <th style={{ textAlign: 'left', padding: 8 }}>Registro</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Reporte</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Ítem</th>
                <th style={{ textAlign: 'left', padding: 8 }}>Caso</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Cantidad</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Valor guardado</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Valor con listado</th>
                <th style={{ textAlign: 'right', padding: 8 }}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 16, color: muted, textAlign: 'center' }}>
                    Sin registros en este filtro.
                  </td>
                </tr>
              ) : (
                filas.map((fila) => (
                  <tr key={fila.registro_id ?? fila.numero_registro} style={{ borderTop: `1px solid ${border}` }}>
                    <td style={{ padding: 6 }}>
                      <button
                        type="button"
                        data-testid={`revision-registro-${fila.numero_registro ?? fila.registro_id}`}
                        onClick={() => abrir(fila)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#0f766e',
                          fontWeight: 700,
                          cursor: onAbrirRegistro ? 'pointer' : 'default',
                          textDecoration: 'underline',
                        }}
                      >
                        {fila.numero_registro ?? fila.registro_id ?? '—'}
                      </button>
                    </td>
                    <td style={{ padding: 6 }}>{fila.numero_reporte ?? '—'}</td>
                    <td style={{ padding: 6 }}>{fila.item_numero || '—'}</td>
                    <td style={{ padding: 6 }}>{fila.caso_label}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {fila.cantidad == null ? '—' : Number(fila.cantidad).toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {fila.sin_valorizar ? SIN_VALORIZAR : formatCOP(fila.valor_guardado)}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      {fila.sin_valorizar ? SIN_VALORIZAR : formatCOP(fila.valor_listado)}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>
                      {fila.sin_valorizar ? SIN_VALORIZAR : formatCOP(fila.diferencia)}
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
