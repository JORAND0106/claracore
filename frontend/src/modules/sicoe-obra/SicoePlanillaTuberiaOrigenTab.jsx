/**
 * Pestaña SICOE: vista de la planilla de tubería de origen (solo lectura).
 * Reutiliza PlanillaTuberiaForm en modo embebido para fidelidad visual
 * (cabecera, cartera, sección, perfil, cantidades y descuentos).
 */
import { useEffect, useState } from 'react'
import { API_BASE } from '../../apiBase'
import PlanillaTuberiaForm from '../../components/topografia/planillaTuberia/PlanillaTuberiaForm'

export default function SicoePlanillaTuberiaOrigenTab({
  contratoId,
  token,
  reporteId,
  t,
  permisos = { ver: true },
  usuario = null,
}) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [detalle, setDetalle] = useState(null)

  useEffect(() => {
    if (!contratoId || !token || !reporteId) {
      setLoading(false)
      setErr('Falta contrato o reporte')
      return undefined
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
  if (!detalle?.planilla) {
    return <div style={{ padding: 16, color: t?.textMuted || '#64748b' }}>Sin datos de planilla.</div>
  }

  return (
    <div
      data-sicoe-planilla-tuberia-origen
      style={{ padding: 4, overflow: 'auto', minHeight: 0, flex: 1 }}
    >
      <PlanillaTuberiaForm
        contratoId={contratoId}
        token={token}
        permisos={permisos}
        usuario={usuario}
        modoSoloLectura
        detalleInicial={detalle}
      />
    </div>
  )
}
