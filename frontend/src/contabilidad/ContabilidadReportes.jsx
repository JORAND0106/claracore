import { useCallback, useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { contabGet, contabDownloadExport } from './contabilidadApi'

const COLORS = ['#0077B6', '#10B981', '#F59E0B', '#7C3AED', '#EF4444', '#00B4C6']

export default function ContabilidadReportes({ t, token }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await contabGet('/reportes/resumen', token, { anio })
      setData(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, anio])

  useEffect(() => { cargar() }, [cargar])

  const exportar = async (tipo) => {
    setExportBusy(true)
    try {
      await contabDownloadExport(tipo, token, { anio })
    } catch (e) {
      setError(e.message)
    } finally {
      setExportBusy(false)
    }
  }

  const inp = { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', color: t.text, fontSize: 'var(--cc-sm)' }
  const btn = { background: t.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)' }
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }

  if (loading) return <div style={{ color: t.textMuted }}>Cargando reportes…</div>

  const evo = data?.evolucion_mensual?.series || []
  const centros = data?.ingresos_centro_costo?.items || []
  const cuentas = data?.cuentas_especiales?.series || []
  const ded = data?.deducciones_tributarias?.series || []

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cc-sm)', color: t.text }}>
          Año
          <input type="number" style={{ ...inp, width: 90 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
        </label>
        <button type="button" style={btn} onClick={cargar}>↻ Actualizar</button>
        <button type="button" style={{ ...btn, background: 'transparent', color: t.primary, border: `1.5px solid ${t.primary}` }} disabled={exportBusy} onClick={() => exportar('resumen')}>⬇ Excel resumen</button>
        <button type="button" style={{ ...btn, background: 'transparent', color: t.primary, border: `1.5px solid ${t.primary}` }} disabled={exportBusy} onClick={() => exportar('completo')}>⬇ Excel completo</button>
      </div>
      {error && <div style={{ color: '#EF4444', marginBottom: 12 }}>{error}</div>}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: t.text }}>Evolución mensual — Ingresos vs Egresos</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={evo}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis dataKey="periodo_label" tick={{ fill: t.textMuted, fontSize: 11 }} />
            <YAxis tick={{ fill: t.textMuted, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}` }} />
            <Legend />
            <Bar dataKey="ingresos_brutos" name="Ingresos" fill="#10B981" />
            <Bar dataKey="egresos_brutos" name="Egresos" fill="#EF4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: t.text }}>Ingresos por centro de costo</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={centros} dataKey="ingresos_brutos" nameKey="label" cx="50%" cy="50%" outerRadius={90} label>
                {centros.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}` }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: t.text }}>Deducciones tributarias por período</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ded}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="periodo" tick={{ fill: t.textMuted, fontSize: 10 }} />
              <YAxis tick={{ fill: t.textMuted, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}` }} />
              <Legend />
              <Bar dataKey="retencion_fuente" name="Retención" stackId="a" fill="#EF4444" />
              <Bar dataKey="iva_recaudado" name="IVA recaudado" stackId="a" fill="#F59E0B" />
              <Bar dataKey="iva_pagado" name="IVA pagado" stackId="a" fill="#0077B6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: t.text }}>Saldo acumulado — Cuentas especiales</div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={cuentas}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis dataKey="periodo" tick={{ fill: t.textMuted, fontSize: 10 }} />
            <YAxis tick={{ fill: t.textMuted, fontSize: 11 }} />
            <Tooltip contentStyle={{ background: t.bgCard, border: `1px solid ${t.border}` }} />
            <Legend />
            <Line type="monotone" dataKey="operativa" name="Operativa" stroke="#0077B6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="capitalizacion_total" name="Capitalización" stroke="#7C3AED" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="impuestos_iva_neto" name="IVA neto" stroke="#F59E0B" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="impuestos_retencion" name="Retenciones" stroke="#EF4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
