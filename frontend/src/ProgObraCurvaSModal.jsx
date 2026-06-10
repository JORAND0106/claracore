import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Download, FileText, GitCompare, FileCode } from 'lucide-react'
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
import { fetchCurvaS, fetchCurvaSEscenarios, downloadCurvaSPdf, downloadCurvaSExcel, downloadProjectXml } from './progObraApi'
import { fmtCOP } from './progObraFormat'
import { pptoVersionOptionLabel } from './ProgPresupuestoSelector'

const ESCENARIO_COLORS = ['#1e3a8a', '#38bdf8', '#16a34a', '#f59e0b', '#9333ea']

function fmtPct(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function fmtMillions(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return fmtCOP(v)
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
  versionPptoId,
  versionProgId,
  pptoVersiones = [],
  contratoNumero,
  contratista,
  interventoria,
  pkIds = null,
  tramoNames = null,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [modoEscenarios, setModoEscenarios] = useState(false)
  const [escenariosSel, setEscenariosSel] = useState(() => new Set())
  const [escenariosData, setEscenariosData] = useState(null)
  const [loadingEscenarios, setLoadingEscenarios] = useState(false)
  const [brechaAlertOpen, setBrechaAlertOpen] = useState(true)
  const [brechaDetalleOpen, setBrechaDetalleOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setModoEscenarios(false)
      setEscenariosData(null)
      setBrechaAlertOpen(true)
      setBrechaDetalleOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (data?.brecha_presupuesto?.tiene_brecha) setBrechaAlertOpen(true)
  }, [data])

  const pkIdsKey = pkIds?.length ? pkIds.join(',') : ''
  const tramosKey = tramoNames?.length ? tramoNames.join(',') : ''

  useEffect(() => {
    if (!open || !cid || !token) return
    let cancel = false
    setLoading(true)
    setError('')
    fetchCurvaS(API, cid, token, {
      baselineId,
      targetId,
      versionPptoId,
      pkIds: pkIds?.length ? pkIds : undefined,
      tramos: tramoNames?.length ? tramoNames : undefined,
    })
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
  }, [open, cid, token, API, baselineId, targetId, versionPptoId, pkIdsKey, tramosKey])

  useEffect(() => {
    if (!open || !modoEscenarios) return
    const initial = new Set()
    if (versionPptoId) initial.add(String(versionPptoId))
    else if (pptoVersiones[0]?.id) initial.add(String(pptoVersiones[0].id))
    setEscenariosSel(initial)
  }, [open, modoEscenarios, versionPptoId, pptoVersiones])

  const escenariosKey = useMemo(() => [...escenariosSel].sort().join(','), [escenariosSel])

  useEffect(() => {
    if (!open || !modoEscenarios || !cid || !token || !versionProgId || !escenariosKey) {
      setEscenariosData(null)
      return
    }
    let cancel = false
    setLoadingEscenarios(true)
    setError('')
    fetchCurvaSEscenarios(API, cid, token, {
      versionProgId: String(versionProgId),
      versionPptoIds: escenariosKey.split(',').filter(Boolean),
    })
      .then((d) => {
        if (!cancel) setEscenariosData(d)
      })
      .catch((e) => {
        if (!cancel) setError(e?.message || 'Error al cargar escenarios')
      })
      .finally(() => {
        if (!cancel) setLoadingEscenarios(false)
      })
    return () => {
      cancel = true
    }
  }, [open, modoEscenarios, cid, token, API, versionProgId, escenariosKey])

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

  const escenariosChartData = useMemo(() => {
    if (!escenariosData?.meses?.length) return []
    const ids = (escenariosData.escenarios || []).map((s) => s.version_ppto_id)
    return escenariosData.meses.map((row) => {
      const point = { mes: row.mes_label }
      for (const id of ids) {
        point[id] = row.series?.[id]
      }
      return point
    })
  }, [escenariosData])

  const ind = data?.indicadores || {}
  const brecha = data?.brecha_presupuesto || null
  const brechaRows = useMemo(() => {
    if (!brecha?.tiene_brecha) return []
    const rows = []
    for (const r of brecha.items_nuevos_sin_actividad || []) {
      rows.push({
        tipo: 'Ítem nuevo sin fila en programación',
        pk: r.pk_id,
        cap: r.capitulo,
        ref: r.codigo_wbs ? `${r.codigo_wbs} · ${r.item}` : r.item,
        desc: r.descripcion,
        costo: r.costo_directo,
      })
    }
    for (const r of brecha.agrupadores_sin_programar || []) {
      rows.push({
        tipo: 'Agrupador sin actividad',
        pk: r.pk_id,
        cap: r.capitulo,
        ref: r.codigo_wbs || r.nombre,
        desc: r.nombre,
        costo: r.costo_directo,
      })
    }
    for (const r of brecha.agrupadores_sin_fecha || []) {
      rows.push({
        tipo: 'Agrupador sin fecha',
        pk: r.pk_id,
        cap: r.capitulo,
        ref: r.codigo_wbs || r.nombre,
        desc: r.nombre,
        costo: r.costo_directo,
      })
    }
    for (const r of brecha.items_sin_agrupador_sin_programar || []) {
      rows.push({
        tipo: 'Ítem sin programar',
        pk: r.pk_id,
        cap: r.capitulo,
        ref: r.item,
        desc: r.descripcion,
        costo: r.costo_directo,
      })
    }
    return rows
  }, [brecha])

  const toggleEscenario = useCallback((id) => {
    setEscenariosSel((prev) => {
      const next = new Set(prev)
      const sid = String(id)
      if (next.has(sid)) {
        if (next.size > 1) next.delete(sid)
      } else if (next.size < 5) {
        next.add(sid)
      }
      return next
    })
  }, [])

  const handleExcel = useCallback(async () => {
    if (modoEscenarios) {
      setError('Exporte Excel desde la vista normal de Curva S (no en comparar escenarios).')
      return
    }
    setExportBusy(true)
    setError('')
    try {
      const blob = await downloadCurvaSExcel(API, cid, token, {
        baselineId,
        targetId,
        versionPptoId,
        pkIds: pkIds?.length ? pkIds : undefined,
        tramos: tramoNames?.length ? tramoNames : undefined,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `curva-s-${cid}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(e?.message || 'Error al exportar Excel')
    } finally {
      setExportBusy(false)
    }
  }, [API, cid, token, baselineId, targetId, versionPptoId, pkIdsKey, tramosKey, modoEscenarios])

  const handlePdf = useCallback(async () => {
    if (modoEscenarios) {
      setError('Exporte PDF desde la vista normal de Curva S (no en comparar escenarios).')
      return
    }
    setExportBusy(true)
    setError('')
    try {
      const blob = await downloadCurvaSPdf(API, cid, token, {
        baselineId,
        targetId,
        versionPptoId,
        pkIds: pkIds?.length ? pkIds : undefined,
        tramos: tramoNames?.length ? tramoNames : undefined,
      })
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
  }, [API, cid, token, baselineId, targetId, versionPptoId, pkIdsKey, tramosKey, modoEscenarios])

  const handleProjectXml = useCallback(async () => {
    const vid = versionProgId || targetId
    if (!vid) {
      setError('No hay versión de programación para exportar.')
      return
    }
    setExportBusy(true)
    setError('')
    try {
      const { blob, filename } = await downloadProjectXml(API, cid, token, {
        versionId: String(vid),
        versionPptoId,
        pkIds: pkIds?.length ? pkIds : undefined,
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(e?.message || 'Error al exportar MS Project XML')
    } finally {
      setExportBusy(false)
    }
  }, [API, cid, token, versionProgId, targetId, versionPptoId, pkIdsKey])

  const exportBtn = (primary, disabled, onClick, icon, label) => (
    <button
      type="button"
      disabled={disabled}
      title={label}
      onClick={() => void onClick()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 11px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 6,
        border: `1px solid ${primary ? t.primary : t.border}`,
        background: primary ? `${t.primary}10` : t.bgCard,
        color: primary ? t.primary : t.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {icon}
      {label}
    </button>
  )

  if (!open) return null

  const cell = { padding: '5px 8px', fontSize: 11, borderBottom: `1px solid ${t.border}44` }
  const busy = loading || loadingEscenarios

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
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderBottom: `1px solid ${t.border}`,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, color: t.primary, minWidth: 0, flex: '1 1 200px' }}>
            Curva S — Inversión acumulada
            {modoEscenarios && ' · Comparar escenarios'}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              justifyContent: 'flex-end',
              flex: '0 1 auto',
              marginLeft: 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => setModoEscenarios((m) => !m)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 11px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${modoEscenarios ? t.primary : t.border}`,
                background: modoEscenarios ? `${t.primary}18` : t.bgCard,
                color: modoEscenarios ? t.primary : t.text,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <GitCompare size={13} /> {modoEscenarios ? 'Vista normal' : 'Comparar escenarios'}
            </button>
            {exportBtn(
              true,
              !data || exportBusy,
              handleExcel,
              <Download size={13} />,
              'Excel',
            )}
            {exportBtn(
              false,
              exportBusy || loading,
              handlePdf,
              <FileText size={13} />,
              'PDF',
            )}
            {exportBtn(
              false,
              exportBusy || !(versionProgId || targetId),
              handleProjectXml,
              <FileCode size={13} />,
              'MS Project',
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: t.textMuted,
                padding: 4,
                flexShrink: 0,
              }}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {busy && <div style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Cargando curva S…</div>}
        {error && <div style={{ padding: 16, color: '#dc2626' }}>{error}</div>}

        {!busy && !modoEscenarios && data && brecha?.tiene_brecha && brechaAlertOpen && (
          <div
            style={{
              margin: '10px 16px 0',
              padding: '12px 14px',
              borderRadius: 8,
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              color: '#92400e',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <strong>Diferencia con el presupuesto vigente</strong>
                <div style={{ marginTop: 4 }}>
                  La Curva S refleja lo programado con fechas. Elementos del presupuesto vigente que
                  aún no están en el cronograma (o ítems nuevos sin sincronizar) explican una brecha de{' '}
                  <strong>{fmtCOP(brecha.diferencia ?? ind.brecha_presupuesto)}</strong> frente al presupuesto
                  vigente ({fmtCOP(brecha.presupuesto_total ?? ind.presupuesto_contrato)}).
                </div>
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Programado en curva: {fmtCOP(brecha.programado_total ?? ind.programado_curva_total)} ·{' '}
                  {brecha.resumen?.n_items_nuevos_sin_actividad ?? 0} ítem(s) nuevo(s) sin fila ·{' '}
                  {brecha.resumen?.n_agrupadores_sin_programar ?? 0} agrupador(es) sin actividad ·{' '}
                  {brecha.resumen?.n_agrupadores_sin_fecha ?? 0} sin fecha ·{' '}
                  {brecha.resumen?.n_items_sin_programar ?? 0} ítem(s) sueltos sin programar.
                  Sincronice para actualizar costos de lo ya programado, o programe ítems en el WBS.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBrechaAlertOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', padding: 0 }}
                aria-label="Cerrar alerta"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setBrechaDetalleOpen((v) => !v)}
                style={{
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid #f59e0b',
                  background: '#fff',
                  color: '#92400e',
                  cursor: 'pointer',
                }}
              >
                {brechaDetalleOpen ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            </div>
            {brechaDetalleOpen && brechaRows.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 180, overflow: 'auto', background: '#fff', borderRadius: 6, border: '1px solid #fcd34d' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Tipo', 'PK', 'Cap.', 'Ref.', 'Descripción', 'Costo'].map((h) => (
                        <th key={h} style={{ ...cell, fontWeight: 700, textAlign: h === 'Costo' ? 'right' : 'left', background: '#fffbeb', position: 'sticky', top: 0 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {brechaRows.map((r, i) => (
                      <tr key={`${r.tipo}-${r.pk}-${r.ref}-${i}`}>
                        <td style={cell}>{r.tipo}</td>
                        <td style={cell}>{r.pk}</td>
                        <td style={cell}>{r.cap}</td>
                        <td style={cell}>{r.ref}</td>
                        <td style={cell}>{r.desc || '—'}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmtCOP(r.costo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {brecha.resumen?.detalle_truncado && (
                  <div style={{ padding: '6px 8px', fontSize: 10, color: '#92400e' }}>
                    Mostrando los primeros registros. Corrija la programación de los elementos listados.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!busy && !modoEscenarios && data && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', padding: '10px 16px', fontSize: 11, borderBottom: `1px solid ${t.border}`, background: `${t.primary}08` }}>
              <span>Presupuesto vigente: <strong>{fmtCOP(ind.presupuesto_contrato ?? ind.presupuesto_total)}</strong></span>
              <span>Programado (curva): <strong>{fmtCOP(ind.programado_curva_total ?? ind.programado_a_fecha)}</strong></span>
              {Number(ind.brecha_presupuesto) > 0.01 && (
                <span style={{ color: '#b45309' }}>
                  Brecha: <strong>{fmtCOP(ind.brecha_presupuesto)}</strong>
                </span>
              )}
              <span>Ejecutado a la fecha: <strong>{fmtCOP(ind.ejecutado_a_fecha)} ({ind.ejecutado_pct}%)</strong></span>
              <span>Desviación: <strong style={{ color: Number(ind.desviacion_valor) < 0 ? '#dc2626' : '#16a34a' }}>{fmtCOP(ind.desviacion_valor)} ({fmtPct(ind.desviacion_pct)})</strong></span>
            </div>

            <div style={{ flex: 1, minHeight: 280, height: 280, padding: '8px 12px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: t.textMuted }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1e9).toFixed(1)}B`} tick={{ fontSize: 10, fill: t.textMuted }} width={72} />
                  <Tooltip formatter={(v) => fmtCOP(v)} labelStyle={{ fontSize: 11 }} />
                  <Legend />
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#1e3a8a" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="vigente" name="Vigente" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ejecutado" name="Ejecutado" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} />
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

        {!busy && modoEscenarios && escenariosData && (
          <>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>
                Mismo cronograma · distintos presupuestos (máx. 5)
              </div>
              {pptoVersiones.map((v, idx) => {
                const sid = String(v.id)
                const checked = escenariosSel.has(sid)
                const esc = (escenariosData.escenarios || []).find((s) => s.version_ppto_id === sid)
                const color = ESCENARIO_COLORS[idx % ESCENARIO_COLORS.length]
                return (
                  <label
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11,
                      cursor: 'pointer',
                      color: t.text,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEscenario(v.id)}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{pptoVersionOptionLabel(v)}</span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 48,
                        height: 8,
                        borderRadius: 2,
                        background: color,
                        opacity: checked ? 1 : 0.25,
                      }}
                    />
                    <span style={{ fontWeight: 600, minWidth: 72, textAlign: 'right' }}>
                      {fmtMillions(esc?.costo_total)}
                    </span>
                  </label>
                )
              })}
            </div>

            <div style={{ flex: 1, minHeight: 280, padding: '8px 12px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={escenariosChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: t.textMuted }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1e9).toFixed(1)}B`} tick={{ fontSize: 10, fill: t.textMuted }} width={72} />
                  <Tooltip formatter={(v) => fmtCOP(v)} labelStyle={{ fontSize: 11 }} />
                  <Legend />
                  {(escenariosData.escenarios || []).map((s, idx) => (
                    <Line
                      key={s.version_ppto_id}
                      type="monotone"
                      dataKey={s.version_ppto_id}
                      name={`v${s.numero_version}${s.etiqueta ? ` · ${s.etiqueta}` : ''}`}
                      stroke={ESCENARIO_COLORS[idx % ESCENARIO_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
