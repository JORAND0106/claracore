import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { X, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { fetchComparar, sortNodosByDesviacion, COMPARE_LABELS } from './progObraCompare'
import { fmtCOP, fmtDateHuman } from './progObraFormat'
import { fmtDateHistorial } from './progObraVersiones'
import { exportComparacionGlobalExcel } from './progObraExportExcel'

const ESTADO_PK = {
  sin_cambio: { icon: '✅', label: 'Sin cambio' },
  adelantado: { icon: '⬆', label: 'Adelantado' },
  atrasado: { icon: '⬇', label: 'Atrasado' },
  nuevo: { icon: '🆕', label: 'Nuevo' },
  eliminado: { icon: '❌', label: 'Eliminado' },
  sin_programar: { icon: '⚠', label: 'Sin programar' },
}

function fmtDelta(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '0'
  return `${v > 0 ? '+' : ''}${v}`
}

function deltaColor(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return '#9ca3af'
  return v < 0 ? '#16a34a' : '#dc2626'
}

export default function ProgObraComparacionGlobalModal({
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
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [pkFilter, setPkFilter] = useState('')
  const [buscar, setBuscar] = useState('')
  const [collapsed, setCollapsed] = useState({})

  useEffect(() => {
    if (!open || !cid || !token || !baselineId) return
    let cancel = false
    setLoading(true)
    setError('')
    fetchComparar(API, cid, token, { baselineId, targetId })
      .then((d) => {
        if (!cancel) setData(d)
      })
      .catch((e) => {
        if (!cancel) setError(e?.message || 'Error al cargar comparación')
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [open, cid, token, API, baselineId, targetId])

  const pkOptions = useMemo(() => {
    const s = new Set()
    for (const n of data?.nodos || []) {
      if (n.pk_id) s.add(String(n.pk_id))
    }
    for (const g of data?.resumen_global?.grupos_pk || []) {
      if (g.pk_id) s.add(String(g.pk_id))
    }
    return [...s].sort()
  }, [data])

  const nodosFiltrados = useMemo(() => {
    let list = sortNodosByDesviacion(data?.nodos || [])
    if (filtro === 'cambios') list = list.filter((n) => n.tipo_cambio !== 'sin_cambio')
    if (filtro === 'atrasados') list = list.filter((n) => n.tipo_cambio === 'atrasado')
    if (filtro === 'criticos') list = list.filter((n) => n.es_ruta_critica_target)
    if (pkFilter) list = list.filter((n) => String(n.pk_id) === pkFilter)
    const q = buscar.trim().toLowerCase()
    if (q) list = list.filter((n) => String(n.label || n.codigo_wbs || '').toLowerCase().includes(q))
    return list
  }, [data, filtro, pkFilter, buscar])

  const grupos = useMemo(() => {
    const byPk = {}
    for (const n of nodosFiltrados) {
      const pk = String(n.pk_id || '')
      if (!byPk[pk]) byPk[pk] = []
      byPk[pk].push(n)
    }
    const meta = {}
    for (const g of data?.resumen_global?.grupos_pk || []) {
      meta[g.pk_id] = g
    }
    return Object.keys(byPk)
      .sort((a, b) => {
        const da = Math.abs(meta[a]?.delta_fin_pk || 0)
        const db = Math.abs(meta[b]?.delta_fin_pk || 0)
        return db - da
      })
      .map((pk) => ({ pk, nodos: byPk[pk], meta: meta[pk] || {} }))
  }, [nodosFiltrados, data])

  const togglePk = useCallback((pk) => {
    setCollapsed((c) => ({ ...c, [pk]: !c[pk] }))
  }, [])

  const handleExport = useCallback(async () => {
    if (!data) return
    await exportComparacionGlobalExcel({
      data,
      contratoNumero,
      contratista,
      filename: `comparacion-global-${cid}.xlsx`,
    })
  }, [data, cid, contratoNumero, contratista])

  if (!open) return null

  const res = data?.resumen || {}
  const rg = data?.resumen_global || {}
  const cell = {
    padding: '5px 8px',
    fontSize: 11,
    borderBottom: `1px solid ${t.border}44`,
    whiteSpace: 'nowrap',
  }

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
          maxWidth: 1400,
          background: t.bgCard,
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: t.primary }}>
              COMPARACIÓN BASELINE VS PROGRAMACIÓN ACTUAL
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              Baseline v{data?.baseline?.numero_version ?? '—'} → Target v{data?.target?.numero_version ?? '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              disabled={!data || loading}
              onClick={() => void handleExport()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${t.primary}`,
                background: t.bgCard,
                color: t.primary,
                cursor: data && !loading ? 'pointer' : 'not-allowed',
                opacity: data && !loading ? 1 : 0.5,
              }}
            >
              <Download size={14} />
              Exportar Excel
            </button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '10px 16px',
            borderBottom: `1px solid ${t.border}`,
            fontSize: 11,
            color: t.text,
            lineHeight: 1.6,
            flexShrink: 0,
            background: `${t.primary}08`,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
            <span>
              Fecha fin baseline: <strong>{fmtDateHistorial(res.fin_proyecto_baseline) || '—'}</strong>
            </span>
            <span>
              Fecha fin actual: <strong>{fmtDateHistorial(res.fin_proyecto_target) || '—'}</strong>
            </span>
            <span>
              Desviación total:{' '}
              <strong style={{ color: deltaColor(res.delta_fin_proyecto_dias) }}>
                {fmtDelta(res.delta_fin_proyecto_dias)} días
              </strong>
            </span>
          </div>
          <div style={{ marginTop: 4, color: t.textMuted }}>
            PKs adelantados: <strong style={{ color: t.text }}>{rg.pks_adelantados ?? 0}</strong>
            {' · '}
            PKs atrasados: <strong style={{ color: t.text }}>{rg.pks_atrasados ?? 0}</strong>
            {' · '}
            PKs sin cambio: <strong style={{ color: t.text }}>{rg.pks_sin_cambio ?? 0}</strong>
            {' · '}
            PKs sin programar: <strong style={{ color: t.text }}>{rg.pks_sin_programar ?? 0}</strong>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
            fontSize: 11,
          }}
        >
          {[
            ['todos', 'Mostrar todos'],
            ['cambios', 'Solo con cambios'],
            ['atrasados', 'Solo atrasados'],
            ['criticos', 'Solo críticos'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              style={{
                padding: '4px 10px',
                borderRadius: 16,
                border: `1px solid ${filtro === id ? t.primary : t.border}`,
                background: filtro === id ? `${t.primary}18` : t.bg,
                color: filtro === id ? t.primary : t.text,
                fontWeight: filtro === id ? 700 : 400,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {label}
            </button>
          ))}
          <select
            value={pkFilter}
            onChange={(e) => setPkFilter(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}
          >
            <option value="">Todos los PKs</option>
            {pkOptions.map((pk) => (
              <option key={pk} value={pk}>
                PK {pk}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Buscar agrupador…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            style={{
              flex: 1,
              minWidth: 140,
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>Cargando comparación…</div>}
          {error && <div style={{ padding: 16, color: '#dc2626' }}>{error}</div>}
          {!loading && !error && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: t.bgCard, position: 'sticky', top: 0, zIndex: 2 }}>
                  {['', 'PK', 'Agrupador', 'B. Inicio', 'A. Inicio', 'Δ Inicio', 'B. Fin', 'A. Fin', 'Δ Fin', 'Δ Costo', 'Estado'].map(
                    (h) => (
                      <th key={h || 'exp'} style={{ ...cell, fontWeight: 700, color: t.textMuted, textAlign: h.startsWith('Δ') || h === 'PK' ? 'center' : 'left' }}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {grupos.map(({ pk, nodos, meta }) => {
                  const est = ESTADO_PK[meta.estado_pk] || ESTADO_PK.sin_cambio
                  const isCollapsed = collapsed[pk]
                  return (
                    <Fragment key={`pk-${pk}`}>
                      <tr
                        style={{ background: `${t.primary}10`, cursor: 'pointer' }}
                        onClick={() => togglePk(pk)}
                      >
                        <td style={{ ...cell, width: 24, textAlign: 'center' }}>
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </td>
                        <td style={{ ...cell, fontWeight: 700, textAlign: 'center' }}>{pk}</td>
                        <td colSpan={6} style={{ ...cell, fontWeight: 600 }}>
                          Resumen PK — {nodos.length} agrupador(es)
                        </td>
                        <td style={{ ...cell, textAlign: 'center', fontWeight: 700, color: deltaColor(meta.delta_fin_pk) }}>
                          {fmtDelta(meta.delta_fin_pk)}
                        </td>
                        <td style={{ ...cell, textAlign: 'right' }}>{meta.delta_costo_total != null ? fmtCOP(meta.delta_costo_total) : '—'}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>
                          {est.icon} {est.label}
                        </td>
                      </tr>
                      {!isCollapsed &&
                        nodos.map((n) => {
                          const tipo = n.tipo_cambio || 'sin_cambio'
                          const estN = ESTADO_PK[tipo] || { icon: '', label: COMPARE_LABELS[tipo] || tipo }
                          return (
                            <tr key={`${pk}-${n.capitulo}-${n.agrupador_id ?? n.label}`}>
                              <td style={cell} />
                              <td style={{ ...cell, textAlign: 'center' }}>{n.pk_id}</td>
                              <td style={{ ...cell, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.label}>
                                {n.codigo_wbs || n.label || '—'}
                              </td>
                              <td style={cell}>{fmtDateHuman(n.baseline?.fecha_inicio)}</td>
                              <td style={cell}>{fmtDateHuman(n.target?.fecha_inicio)}</td>
                              <td style={{ ...cell, textAlign: 'center', color: deltaColor(n.delta?.dias_inicio) }}>
                                {fmtDelta(n.delta?.dias_inicio)}
                              </td>
                              <td style={cell}>{fmtDateHuman(n.baseline?.fecha_fin)}</td>
                              <td style={cell}>{fmtDateHuman(n.target?.fecha_fin)}</td>
                              <td style={{ ...cell, textAlign: 'center', fontWeight: 600, color: deltaColor(n.delta?.dias_fin) }}>
                                {fmtDelta(n.delta?.dias_fin)}
                              </td>
                              <td style={{ ...cell, textAlign: 'right' }}>{n.delta?.costo != null ? fmtCOP(n.delta.costo) : '—'}</td>
                              <td style={cell}>
                                {estN.icon} {estN.label}
                                {n.es_ruta_critica_target ? ' · RC' : ''}
                              </td>
                            </tr>
                          )
                        })}
                    </Fragment>
                  )
                })}
                {grupos.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ ...cell, textAlign: 'center', padding: 24, color: t.textMuted }}>
                      Sin resultados con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
