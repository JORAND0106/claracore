import { useCallback, useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { contabGet, contabDownloadExport } from './contabilidadApi'
import { docCategoriaLabel, fmtFecha } from './contabilidadUi'

const COLORS = ['#0077B6', '#10B981', '#F59E0B', '#7C3AED', '#EF4444', '#00B4C6']

function AlertasDocumentosPanel({ t, alertas, onIrDocumentos }) {
  if (!alertas) return null
  const total = Number(alertas.total_alertas) || 0
  if (total <= 0) return null

  const vencidos = alertas.vencidos || []
  const porVencer = alertas.por_vencer || []
  const dias = alertas.dias_alerta || 30

  const fila = (doc, color) => (
    <div
      key={doc.id}
      style={{
        display: 'flex', justifyContent: 'space-between', gap: 12,
        padding: '8px 0', borderBottom: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: t.text }}>{doc.nombre}</div>
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
          {docCategoriaLabel(doc.categoria)} · vence {fmtFecha(doc.fecha_vencimiento)}
        </div>
      </div>
      <div style={{ color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {doc.dias_restantes < 0
          ? `Vencido hace ${Math.abs(doc.dias_restantes)} d`
          : `${doc.dias_restantes} d`}
      </div>
    </div>
  )

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${alertas.total_vencidos > 0 ? '#EF444466' : '#F59E0B66'}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderLeft: `4px solid ${alertas.total_vencidos > 0 ? '#EF4444' : '#F59E0B'}`,
    }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 12,
      }}>
        <div>
          <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-md)' }}>
            ⚠ Alertas de vencimiento documental
          </div>
          <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)', marginTop: 4 }}>
            {alertas.total_vencidos > 0 && (
              <span style={{ color: '#EF4444', fontWeight: 700, marginRight: 12 }}>
                {alertas.total_vencidos} vencido{alertas.total_vencidos !== 1 ? 's' : ''}
              </span>
            )}
            {alertas.total_por_vencer > 0 && (
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>
                {alertas.total_por_vencer} por vencer en {dias} días
              </span>
            )}
          </div>
        </div>
        {onIrDocumentos && (
          <button
            type="button"
            onClick={onIrDocumentos}
            style={{
              background: 'transparent', border: `1px solid ${t.primary}`, color: t.primary,
              borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Ver documentos →
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {vencidos.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
              Vencidos
            </div>
            {vencidos.slice(0, 8).map((doc) => fila(doc, '#EF4444'))}
            {vencidos.length > 8 && (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                +{vencidos.length - 8} más…
              </div>
            )}
          </div>
        )}
        {porVencer.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, color: '#F59E0B', marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
              Por vencer
            </div>
            {porVencer.slice(0, 8).map((doc) => fila(doc, '#F59E0B'))}
            {porVencer.length > 8 && (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)', marginTop: 6 }}>
                +{porVencer.length - 8} más…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ContabilidadReportes({ t, token, onIrDocumentos }) {
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
  const alertas = data?.alertas_documentos

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

      <AlertasDocumentosPanel t={t} alertas={alertas} onIrDocumentos={onIrDocumentos} />

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
