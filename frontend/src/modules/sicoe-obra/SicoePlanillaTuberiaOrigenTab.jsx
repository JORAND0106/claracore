/**
 * Pestaña SICOE: vista de la planilla de tubería de origen (solo lectura).
 */
import { useEffect, useState } from 'react'
import { API_BASE } from '../../../apiBase'
import { fmtNDash } from '../planillaTuberia/planillaTuberiaUtils'

export default function SicoePlanillaTuberiaOrigenTab({
  contratoId,
  token,
  reporteId,
  t,
}) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [detalle, setDetalle] = useState(null)

  useEffect(() => {
    if (!contratoId || !token || !reporteId) {
      setLoading(false)
      setErr('Falta contrato o reporte')
      return
    }
    let cancelled = false
    setLoading(true)
    setErr('')
    fetch(
      `${API_BASE}/topografia/${contratoId}/planillas-tuberia/por-reporte-sicoe/${reporteId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          const d = j?.detail
          throw new Error(typeof d === 'string' ? d : (d?.mensaje || `Error ${r.status}`))
        }
        return j
      })
      .then((data) => {
        if (!cancelled) setDetalle(data)
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'No se pudo cargar la planilla de origen')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [contratoId, token, reporteId])

  if (loading) {
    return <div style={{ padding: 16, color: t?.textMuted || '#64748b' }}>Cargando planilla de origen…</div>
  }
  if (err) {
    return <div style={{ padding: 16, color: '#b91c1c' }}>{err}</div>
  }

  const p = detalle?.planilla || {}
  const filas = detalle?.filas_campo || []
  const calc = detalle?.calculo || {}
  const netos = calc.netos || []
  const descuentos = (calc.descuentos || []).filter((d) => d.nombre)
  const th = {
    textAlign: 'left', padding: '4px 6px', background: '#4472C4', color: '#fff',
    fontSize: 11, borderBottom: '1px solid #cbd5e1',
  }
  const td = { padding: '4px 6px', fontSize: 12, borderBottom: '1px solid #e2e8f0' }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
      <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t?.text || '#0f172a' }}>
        Planilla de tubería de origen
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8,
        fontSize: 'var(--cc-sm)', color: t?.text || '#0f172a',
      }}>
        {[
          ['Nombre', p.nombre],
          ['Tipo', p.tipo],
          ['Estado', p.estado],
          ['PK / ID', p.pk_id],
          ['Costado', p.costado],
          ['Ø (m)', p.diametro_m],
          ['Ancho exc. (m)', p.ancho_excavacion_m],
          ['Rel. atraque', p.relacion_atraque],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t?.textMuted || '#64748b' }}>{k}</div>
            <div style={{ fontWeight: 600 }}>{v != null && v !== '' ? String(v) : '—'}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 6, color: t?.textMuted || '#64748b', fontSize: 'var(--cc-xs)' }}>
          Cartera de campo ({filas.length} filas)
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                {['Orden', 'Abscisa', 'TN', 'Nivel', 'CFE'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id || f.orden}>
                  <td style={td}>{f.orden}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNDash(f.abscisa, 3)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNDash(f.terreno_natural, 3)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {fmtNDash(f.subrasante_via ?? f.terminado_filtro, 3)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNDash(f.cota_fondo_excavacion, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6, color: t?.textMuted || '#64748b', fontSize: 'var(--cc-xs)' }}>
            Resumen de Cantidades
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
              <thead>
                <tr>
                  {['Item', 'Cantidad'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {netos.map((n) => (
                  <tr key={n.codigo}>
                    <td style={td}>{n.nombre}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                      {fmtNDash(n.neto ?? n.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6, color: t?.textMuted || '#64748b', fontSize: 'var(--cc-xs)' }}>
            Descuentos Específicos
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
              <thead>
                <tr>
                  {['Item', 'Cantidad'].map((h) => (
                    <th key={h} style={{ ...th, background: '#EA4296' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {descuentos.map((d) => (
                  <tr key={d.codigo}>
                    <td style={td}>{d.nombre}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                      {fmtNDash(d.cantidad)}
                    </td>
                  </tr>
                ))}
                {!descuentos.length && (
                  <tr><td style={td} colSpan={2}>Sin descuentos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
