import { useCallback, useEffect, useState } from 'react'
import { APPINSIGHTS_FREE_TIER_GB, fetchDiagnosticSnapshot, fetchEndpointErrorDetail } from './appInsightsApi'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const STATUS = {
  green: { label: 'OK', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  yellow: { label: 'ATENCIÓN', color: '#d29922', bg: 'rgba(210,153,34,0.12)' },
  red: { label: 'CRÍTICO', color: '#f85149', bg: 'rgba(248,81,73,0.12)' },
}

function usageMeterColor(pct) {
  if (pct == null) return '#6e7681'
  if (pct >= 85) return '#f85149'
  if (pct >= 60) return '#d29922'
  return '#3fb950'
}

function AppInsightsUsageMeter({ ingestion, loading }) {
  const limitGb = ingestion?.limitGb ?? APPINSIGHTS_FREE_TIER_GB
  const usedGb = ingestion?.usedGb
  const pct = ingestion?.usagePct
  const remainingGb = ingestion?.remainingGb
  const barColor = usageMeterColor(pct)
  const barWidth = pct == null ? 0 : Math.min(100, pct)

  return (
    <Section title="CONSUMO APPLICATION INSIGHTS (MES ACTUAL)" style={{ marginTop: 12 }}>
      {loading && usedGb == null ? (
        <span style={{ color: '#6e7681' }}>Cargando ingestión…</span>
      ) : usedGb == null ? (
        <span style={{ color: '#6e7681', fontSize: 11 }}>
          No se pudo leer el volumen ingestado (tabla Usage / _BilledSize)
        </span>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 20, color: '#e6edf3', fontWeight: 700 }}>
                {usedGb.toFixed(3)}
              </span>
              <span style={{ color: '#8b949e', marginLeft: 4 }}>GB ingestados</span>
            </div>
            <span style={{ color: '#8b949e', fontSize: 10 }}>
              límite gratuito {limitGb} GB
            </span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: '#21262d',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: `${barWidth}%`,
                height: '100%',
                background: barColor,
                borderRadius: 5,
                transition: 'width 0.4s ease',
                boxShadow: `0 0 8px ${barColor}66`,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: barColor, fontWeight: 600 }}>
              {pct?.toFixed(1) ?? '—'}% del límite
            </span>
            <span style={{ color: '#8b949e' }}>
              ≈ {remainingGb?.toFixed(3) ?? '—'} GB disponibles este mes
            </span>
          </div>
        </>
      )}
    </Section>
  )
}

function fmtMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${Math.round(n).toLocaleString('es-CO')} ms`
}

function maxMsColor(avgMs, maxMs) {
  const avg = Number(avgMs) || 0
  const max = Number(maxMs) || 0
  if (max >= 60000) return '#f85149'
  if (max >= 10000) return '#d29922'
  if (avg > 0 && max >= avg * 5) return '#d29922'
  return '#8b949e'
}
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function Section({ title, children, style }) {
  return (
    <section
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '10px 12px',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.1em',
          color: '#8b949e',
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

export default function DeveloperDiagnosticPanel({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const snap = await fetchDiagnosticSnapshot()
      setData(snap)
    } catch (e) {
      const msg = e?.message || String(e)
      const corsHint = /failed to fetch|networkerror|cors/i.test(msg)
        ? ' Si estás en producción, la API de Application Insights puede bloquear CORS desde el navegador; prueba en local (npm run dev) o añade un proxy edge.'
        : ''
      setError(msg + corsHint)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const iv = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(iv)
  }, [refresh])

  async function openEndpoint(name) {
    setSelectedEndpoint(name)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await fetchEndpointErrorDetail(name)
      setDetail(d)
    } catch (e) {
      setDetail({
        endpoint: name,
        message: e?.message || String(e),
        stack: '',
        httpCode: null,
        timestamp: null,
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const st = STATUS[data?.status || 'green'] || STATUS.green

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100020,
        background: '#010409',
        color: '#c9d1d9',
        fontFamily: MONO,
        fontSize: 12,
        overflow: 'auto',
        lineHeight: 1.45,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: '#0d1117',
          borderBottom: '1px solid #30363d',
        }}
      >
        <span style={{ color: '#58a6ff', fontWeight: 700, fontSize: 13 }}>ClaraCore · Diagnóstico</span>
        <span style={{ color: '#484f58', fontSize: 10 }}>Application Insights · últimos 30 min</span>
        <div style={{ flex: 1 }} />
        {data?.fetchedAt && (
          <span style={{ color: '#6e7681', fontSize: 10 }}>↻ {fmtTime(data.fetchedAt)}</span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #30363d',
            color: '#8b949e',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </header>

      <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        {error && (
          <div
            style={{
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid #f85149',
              borderRadius: 6,
              padding: 12,
              marginBottom: 14,
              color: '#ffa198',
              fontSize: 11,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Section title="ESTADO GENERAL">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: st.color,
                    boxShadow: `0 0 10px ${st.color}`,
                  }}
                />
                <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                {data && (
                  <span style={{ color: '#8b949e', fontSize: 11 }}>
                    tasa error {data.requests.errorRate}%
                  </span>
                )}
              </div>
            </Section>
            <AppInsightsUsageMeter ingestion={data?.ingestion} loading={loading} />
          </div>

          <Section title="REQUESTS (30 min)">
            {loading && !data ? (
              <span style={{ color: '#6e7681' }}>Cargando…</span>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#8b949e', fontSize: 10 }}>TOTAL</div>
                  <div style={{ fontSize: 18, color: '#e6edf3' }}>{data?.requests.total ?? '—'}</div>
                </div>
                <div>
                  <div style={{ color: '#8b949e', fontSize: 10 }}>FALLIDAS</div>
                  <div style={{ fontSize: 18, color: '#f85149' }}>{data?.requests.failed ?? '—'}</div>
                </div>
                <div>
                  <div style={{ color: '#8b949e', fontSize: 10 }}>ERROR %</div>
                  <div style={{ fontSize: 18, color: '#d29922' }}>{data?.requests.errorRate ?? '—'}%</div>
                </div>
              </div>
            )}
          </Section>

          <Section title="SUPABASE (dependencias)">
            {!data ? (
              <span style={{ color: '#6e7681' }}>—</span>
            ) : data.supabase.total === 0 ? (
              <span style={{ color: '#6e7681' }}>Sin llamadas a {data.supabase.host} en 30 min</span>
            ) : (
              <div>
                {data.supabase.ok ? (
                  <div style={{ color: '#3fb950', fontWeight: 600, marginBottom: 4 }}>
                    ✅ Respondiendo normalmente
                  </div>
                ) : null}
                <div style={{ color: '#8b949e', fontSize: 10, marginBottom: data.supabase.ok ? 0 : 8 }}>
                  {data.supabase.total} deps · avg {data.supabase.avgMs} ms
                </div>
                {!data.supabase.ok && (data.supabase.failures || []).length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.supabase.failures.map(f => (
                      <div
                        key={f.name}
                        style={{ color: '#f85149', fontSize: 11, fontFamily: MONO, lineHeight: 1.4 }}
                      >
                        🔴 {f.name} — {f.failures === 1 ? '1 fallo' : `${f.failures} fallos`} ·{' '}
                        {Math.round(f.avgMs).toLocaleString('es-CO')}ms
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Section>
        </div>

        <Section title="USUARIOS ACTIVOS (10 min)" style={{ marginBottom: 12 }}>
          {loading && !data ? (
            <span style={{ color: '#6e7681' }}>Cargando…</span>
          ) : !data?.activeUsers?.length ? (
            <span style={{ color: '#6e7681', fontSize: 11 }}>
              Sin actividad por user_Id o IP en los últimos 10 min
            </span>
          ) : (
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: '#8b949e', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Usuario</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Requests</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Último endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activeUsers.map(u => (
                    <tr key={u.userId}>
                      <td
                        style={{ padding: '5px 6px', color: '#58a6ff', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={u.displayName}
                      >
                        {u.displayName}
                      </td>
                      <td style={{ padding: '5px 6px', color: '#e6edf3', fontWeight: 600 }}>{u.requestCount}</td>
                      <td
                        style={{ padding: '5px 6px', color: '#8b949e', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={u.lastEndpoint}
                      >
                        {u.lastEndpoint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="ENDPOINTS CON ERRORES" style={{ marginBottom: 12 }}>
          {!data?.endpoints?.length ? (
            <div style={{ color: '#3fb950', fontSize: 11 }}>Sin fallos en el periodo</div>
          ) : (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: '#8b949e', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Endpoint</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Fallos</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.endpoints.map(ep => (
                    <tr
                      key={ep.name}
                      onClick={() => openEndpoint(ep.name)}
                      style={{
                        cursor: 'pointer',
                        background: selectedEndpoint === ep.name ? 'rgba(88,166,255,0.08)' : 'transparent',
                      }}
                    >
                      <td
                        style={{
                          padding: '5px 6px',
                          color: '#58a6ff',
                          maxWidth: 280,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ep.name}
                      >
                        {ep.name}
                      </td>
                      <td style={{ padding: '5px 6px', color: '#f85149' }}>{ep.failed}</td>
                      <td style={{ padding: '5px 6px', color: '#d29922' }}>{ep.errorPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="ENDPOINTS MÁS LENTOS (30 min · excl. panel)" style={{ marginBottom: 12 }}>
          {loading && !data ? (
            <span style={{ color: '#6e7681' }}>Cargando…</span>
          ) : !data?.slowest?.length ? (
            <span style={{ color: '#6e7681', fontSize: 11 }}>
              Sin requests en la ventana (excluye auto-consultas appinsights-query)
            </span>
          ) : (
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: '#8b949e', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px', fontWeight: 500 }}>Endpoint</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, width: 72 }}>Llamadas</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, width: 88 }}>Promedio</th>
                    <th style={{ padding: '4px 6px', fontWeight: 500, width: 88 }}>Máximo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowest.map(ep => (
                    <tr key={ep.name}>
                      <td
                        style={{
                          padding: '5px 6px',
                          color: '#58a6ff',
                          maxWidth: 420,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ep.name}
                      >
                        {ep.name}
                      </td>
                      <td style={{ padding: '5px 6px', color: '#e6edf3' }}>{ep.calls}</td>
                      <td style={{ padding: '5px 6px', color: '#d29922', fontWeight: 600 }}>
                        {fmtMs(ep.avgMs)}
                      </td>
                      <td
                        style={{
                          padding: '5px 6px',
                          color: maxMsColor(ep.avgMs, ep.maxMs),
                          fontWeight: 600,
                        }}
                        title={ep.maxMs >= (ep.avgMs || 0) * 5 ? 'Pico muy por encima del promedio' : undefined}
                      >
                        {fmtMs(ep.maxMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {selectedEndpoint && (
          <Section title={`DETALLE · ${selectedEndpoint}`} style={{ marginBottom: 12 }}>
            {detailLoading ? (
              <span style={{ color: '#6e7681' }}>Cargando stack…</span>
            ) : detail ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#8b949e' }}>Último fallo: </span>
                  <span>{fmtTime(detail.timestamp)}</span>
                  {detail.httpCode != null && (
                    <span style={{ marginLeft: 12, color: '#f85149' }}>HTTP {detail.httpCode}</span>
                  )}
                </div>
                <div
                  style={{
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 4,
                    padding: 10,
                    marginBottom: 8,
                    color: '#ffa198',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {detail.message}
                </div>
                {detail.stack && (
                  <pre
                    style={{
                      margin: 0,
                      background: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: 4,
                      padding: 10,
                      color: '#8b949e',
                      fontSize: 10,
                      overflow: 'auto',
                      maxHeight: 280,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {detail.stack}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() => { setSelectedEndpoint(null); setDetail(null) }}
                  style={{
                    marginTop: 8,
                    background: 'transparent',
                    border: '1px solid #30363d',
                    color: '#8b949e',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cerrar detalle
                </button>
              </div>
            ) : null}
          </Section>
        )}

        <Section title="ERRORES RECIENTES (20)">
          {!data?.recentErrors?.length ? (
            <span style={{ color: '#6e7681' }}>Sin errores recientes</span>
          ) : (
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {data.recentErrors.map((err, idx) => (
                <div
                  key={`${err.timestamp}-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr 2fr',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid #21262d',
                    fontSize: 11,
                    alignItems: 'start',
                  }}
                >
                  <span style={{ color: '#6e7681' }}>{fmtTime(err.timestamp)}</span>
                  <span
                    style={{ color: '#58a6ff', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={err.endpoint}
                  >
                    {err.endpoint}
                  </span>
                  <span style={{ color: '#c9d1d9' }}>{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p style={{ marginTop: 16, color: '#484f58', fontSize: 10, textAlign: 'center' }}>
          Fuente: Azure Application Insights · independiente del backend ClaraCore · auto-refresh 30s
        </p>
      </div>
    </div>
  )
}
