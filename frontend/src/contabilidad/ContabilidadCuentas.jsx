import { useCallback, useEffect, useState } from 'react'
import { contabGet } from './contabilidadApi'
import { fmtCOP } from './contabilidadUi'

export default function ContabilidadCuentas({ t, token }) {
  const [data, setData] = useState(null)
  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [cuentas, movData] = await Promise.all([
        contabGet('/cuentas-especiales', token),
        contabGet('/cuentas-especiales/movimientos', token, { limit: 100 }),
      ])
      setData(cuentas)
      setMovs(movData.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const s = data?.saldos
  const cards = [
    { key: 'operativa', label: 'Cuenta operativa', value: s?.operativa?.general, color: '#0077B6', desc: 'Saldo disponible para operación' },
    { key: 'cap', label: 'Capitalización total', value: s?.capitalizacion_total, color: '#7C3AED', desc: `20% bruto ingresos · Lic: ${fmtCOP(s?.capitalizacion?.licenciamiento)} · Srv: ${fmtCOP(s?.capitalizacion?.servicios)}` },
    { key: 'iva', label: 'IVA neto pendiente', value: s?.impuestos_iva_neto, color: '#F59E0B', desc: 'Recaudado − pagado' },
    { key: 'ret', label: 'Retenciones acumuladas', value: s?.impuestos?.retencion_fuente, color: '#EF4444', desc: 'Retención en la fuente' },
  ]

  return (
    <div>
      {error && <div style={{ color: '#EF4444', marginBottom: 12 }}>{error}</div>}
      {loading ? <div style={{ color: t.textMuted }}>Cargando…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            {cards.map((c) => (
              <div key={c.key} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, borderTop: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text }}>{fmtCOP(c.value)}</div>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 6 }}>{c.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 8 }}>Últimos movimientos</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
              <thead>
                <tr style={{ background: t.primary + '18' }}>
                  {['Fecha', 'Cuenta', 'Subcuenta', 'Monto', 'Concepto'].map((h) => (
                    <th key={h} style={{ padding: '8px', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ padding: '8px' }}>{m.fecha}</td>
                    <td style={{ padding: '8px' }}>{m.cuenta_tipo}</td>
                    <td style={{ padding: '8px' }}>{m.subcuenta}</td>
                    <td style={{ padding: '8px', fontWeight: 600, color: m.monto >= 0 ? '#10B981' : '#EF4444' }}>{fmtCOP(m.monto)}</td>
                    <td style={{ padding: '8px', color: t.textMuted }}>{m.concepto}</td>
                  </tr>
                ))}
                {!movs.length && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: t.textMuted }}>Sin movimientos</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
