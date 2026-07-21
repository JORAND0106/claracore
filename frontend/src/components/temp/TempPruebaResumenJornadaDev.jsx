/**
 * TEMPORAL — botones de desarrollador para probar el correo resumen jornada.
 * Eliminar este archivo y tempPruebaResumenJornada.js tras validar en producción.
 */
import { useCallback, useState } from 'react'
import { enviarPruebaResumenJornada } from '../../utils/tempPruebaResumenJornada'

export default function TempPruebaResumenJornadaDev({
  contratoId,
  apiUrl,
  getToken,
  t,
  du,
}) {
  const [loading, setLoading] = useState(null)
  const [msg, setMsg] = useState(null)

  const disparar = useCallback(
    async (periodo) => {
      if (!contratoId) {
        setMsg({ type: 'err', text: 'Seleccione un contrato activo.' })
        return
      }
      setLoading(periodo)
      setMsg(null)
      try {
        const data = await enviarPruebaResumenJornada({
          apiUrl,
          getToken,
          contratoId,
          periodo,
        })
        const jornada = periodo === 'manana' ? 'inicio de jornada' : 'fin de jornada'
        setMsg({
          type: 'ok',
          text: `Correo de prueba (${jornada}) enviado a ${data.destinatario}. Contrato ${data.contrato_numero || contratoId}, Acta #${data.acta_rpo ?? '—'}.`,
        })
      } catch (err) {
        setMsg({ type: 'err', text: err?.message || 'No se pudo enviar el correo de prueba.' })
      } finally {
        setLoading(null)
      }
    },
    [apiUrl, contratoId, getToken],
  )

  const btnStyle = (busy) => ({
    fontSize: du?.sub || 12,
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${t?.border || '#cbd5e1'}`,
    background: busy ? (t?.bgMuted || '#f1f5f9') : (t?.bgCard || '#fff'),
    color: t?.text || '#0f172a',
    cursor: busy ? 'wait' : 'pointer',
    opacity: loading && !busy ? 0.55 : 1,
  })

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px dashed #f59e0b',
        background: 'rgba(245, 158, 11, 0.08)',
      }}
    >
      <div style={{ fontSize: du?.sub || 12, fontWeight: 700, color: '#b45309' }}>
        TEMP — Prueba correo resumen jornada (solo desarrollador)
      </div>
      <div style={{ fontSize: du?.sub || 12, color: t?.textMuted || '#64748b', marginTop: 4 }}>
        Envía a su propio correo el mismo contenido del resumen programado; no notifica a otros usuarios.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={!!loading}
          style={btnStyle(loading === 'manana')}
          onClick={() => void disparar('manana')}
        >
          {loading === 'manana' ? 'Enviando…' : 'Probar inicio jornada (9:00)'}
        </button>
        <button
          type="button"
          disabled={!!loading}
          style={btnStyle(loading === 'tarde')}
          onClick={() => void disparar('tarde')}
        >
          {loading === 'tarde' ? 'Enviando…' : 'Probar fin jornada (18:00)'}
        </button>
      </div>
      {msg ? (
        <div
          role="status"
          style={{
            marginTop: 10,
            fontSize: du?.sub || 12,
            color: msg.type === 'ok' ? '#15803d' : '#b91c1c',
            fontWeight: msg.type === 'ok' ? 600 : 500,
          }}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  )
}
