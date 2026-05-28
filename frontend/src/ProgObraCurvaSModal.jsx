import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Download, FileText } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { fetchCurvaS, downloadCurvaSPdf } from './progObraApi'
import { exportCurvaSExcel } from './progObraExportExcel'
import { fmtCOP } from './progObraFormat'

function fmtPct(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default function ProgObraCurvaSModal({
  open,
  onClose,
  t,
  API,
  cid,
  token,
  baselineId,
  targetId,
  contratoNumero,
  contratista,
  interventoria,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)

  useEffect(() => {
    if (!open || !cid || !token) return
    let cancel = false
    setLoading(true)
    setError('')
    fetchCurvaS(API, cid, token, { baselineId, targetId })
      .then((d) => {
        if (!cancel) setData(d)
      })
      .catch((e) => {
        if (!cancel) setError(e?.message || 'Error al cargar curva S')
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [open, cid, token, API, baselineId, targetId])

  const chartData = useMemo(
    () =>
      (data?.meses || []).map((r) => ({
        mes: r.mes_label,
        baseline: r.baseline_acum,
        vigente: r.vigente_acum,
        ejecutado: r.ejecutado_acum,
      })),
    [data],
  )

  const ind = data?.indicadores || {}

  const handleExcel = useCallback(async () => {
    if (!data) return
    setExportBusy(true)
    try {
      await exportCurvaSExcel({
        data,
        contratoNumero,
        contratista,
        interventoria,
        filename: `curva-s-${cid}.xlsx`,
      })
    } finally {
      setExportBusy(false)
    }
  }, [data, cid, contratoNumero, contratista, interventoria])

  const handlePdf = useCallback(async () => {
    setExportBusy(true)
    try {
      const blob = await downloadCurvaSPdf(API, cid, token, { baselineId, targetId })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `curva-s-${cid}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(e?.message || 'Error al exportar PDF')
    } finally {
      setExportBusy(false)
    }
  }, [API, cid, token, baselineId, targetId])

  if (!open) return null

  const cell = { padding: '5px 8px', fontSize: 11, borderBottom: `1px solid ${t.border}44` }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '95vw',
          height: '90vh',
          maxWidth: 1200,
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.primary }}>Curva S — Inversión acumulada</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={!data || exportBusy}
              onClick={() => void handleExcel()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${t.primary}`, background: t.bgCard, color: t.primary, cursor: 'pointer' }}
            >
              <Download size={13} /> Excel
            </button>
            <button
              type="button"
              disabled={exportBusy}
              onClick={() => void handlePdf()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, cursor: 'pointer' }}
            >
              <FileText size={13} /> PDF
            </button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {loading && <div style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Cargando curva S…</div>}
        {error && <div style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

        {!loading && data && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', padding: '10px 16px', fontSize: 11, borderBottom: `1px solid ${t.border}`, background: `${t.primary}08` }}>
              <span>Presupuesto total: <strong>{fmtCOP(ind.presupuesto_total)}</strong></span>
              <span>Programado a la fecha: <strong>{fmtCOP(ind.programado_a_fecha)} ({ind.programado_pct}%)</strong></span>
              <span>Ejecutado a la fecha: <strong>{fmtCOP(ind.ejecutado_a_fecha)} ({ind.ejecutado_pct}%)</strong></span>
              <span>Desviación: <strong style={{ color: Number(ind.desviacion_valor) < 0 ? '#dc2626' : '#16a34a' }}>{fmtCOP(ind.desviacion_valor)} ({fmtPct(ind.desviacion_pct)})</strong></span>
            </div>

            <div style={{ flex: 1, minHeight: 280, padding: '8px 12px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: t.textMuted }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1e9).toFixed(1)}B`} tick={{ fontSize: 10, fill: t.textMuted }} width={72} />
                  <Tooltip formatter={(v) => fmtCOP(v)} labelStyle={{ fontSize: 11 }} />
                  <Legend />
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#1e3a8a" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="vigente" name="Vigente" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ejecutado" name="Ejecutado" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ maxHeight: 220, overflow: 'auto', padding: '0 12px 12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: t.bgCard, position: 'sticky', top: 0 }}>
                    {['Mes', 'Baseline', 'Vigente', 'Ejecutado', 'Δ Vigente', 'Δ Ejecutado'].map((h) => (
                      <th key={h} style={{ ...cell, fontWeight: 700, color: t.textMuted, textAlign: h === 'Mes' ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.meses || []).map((r) => (
                    <tr key={r.mes}>
                      <td style={cell}>{r.mes_label}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{fmtCOP(r.baseline_acum)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{fmtCOP(r.vigente_acum)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{fmtCOP(r.ejecutado_acum)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{fmtPct(r.delta_vigente_pct)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{fmtPct(r.delta_ejecutado_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
