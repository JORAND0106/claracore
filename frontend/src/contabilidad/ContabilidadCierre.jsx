import { useCallback, useEffect, useState } from 'react'
import { contabGet, contabSend, contabDownloadExport } from './contabilidadApi'
import { fmtCOP, mesLabel } from './contabilidadUi'

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function ContabilidadCierre({ t, token, esContador, esDeveloper }) {
  const [cierres, setCierres] = useState([])
  const [selId, setSelId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await contabGet('/cierres', token)
      setCierres(r.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const cargarDetalle = async (id) => {
    setSelId(id)
    try {
      const d = await contabGet(`/cierres/${id}`, token)
      setDetalle(d)
      setNotas(d.notas_contador || '')
    } catch (e) {
      setError(e.message)
    }
  }

  const generar = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await contabSend('/cierres/generar', token, { body: { anio, mes } })
      await cargar()
      await cargarDetalle(d.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const guardarNotas = async () => {
    if (!selId) return
    setBusy(true)
    try {
      const d = await contabSend(`/cierres/${selId}/notas`, token, { method: 'PATCH', body: { notas } })
      setDetalle(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aprobar = async () => {
    if (!selId || !window.confirm('¿Aprobar cierre? El período quedará bloqueado.')) return
    setBusy(true)
    try {
      const d = await contabSend(`/cierres/${selId}/aprobar`, token, { method: 'POST' })
      setDetalle(d)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const firmar = async () => {
    if (!selId) return
    setBusy(true)
    try {
      const d = await contabSend(`/cierres/${selId}/firmar`, token, { method: 'POST', body: { notas } })
      setDetalle(d)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const exportar = async () => {
    if (!selId) return
    try {
      await contabDownloadExport('cierre', token, { cierre_id: selId })
    } catch (e) {
      setError(e.message)
    }
  }

  const inp = { background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 10px', color: t.text, fontSize: 'var(--cc-sm)' }
  const btn = (p) => ({ background: p ? t.primary : 'transparent', color: p ? '#fff' : t.primary, border: p ? 'none' : `1.5px solid ${t.primary}`, borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)' })
  const puedeFirmar = esContador || esDeveloper
  const bloqueado = detalle?.estado === 'aprobado'
  const firmado = !!detalle?.firma_contenido_hash

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8, color: t.text }}>Generar cierre</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="number" style={{ ...inp, width: 80 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          <select style={inp} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button type="button" style={btn(true)} disabled={busy} onClick={generar}>Generar / recalcular</button>
        <div style={{ marginTop: 20, fontWeight: 700, color: t.text }}>Historial</div>
        {loading ? <div style={{ color: t.textMuted, marginTop: 8 }}>…</div> : (
          <div style={{ marginTop: 8 }}>
            {cierres.map((c) => (
              <button key={c.id} type="button" onClick={() => cargarDetalle(c.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '10px 12px',
                background: selId === c.id ? t.primary + '22' : t.bgCard,
                border: `1px solid ${selId === c.id ? t.primary : t.border}`,
                borderRadius: 10, cursor: 'pointer', color: t.text, fontSize: 'var(--cc-sm)',
              }}>
                {mesLabel(c.anio, c.mes)} · <span style={{ fontWeight: 700 }}>{c.estado}</span>
                {c.firma_contenido_hash && ' · ✓ firmado'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {error && <div style={{ color: '#EF4444', marginBottom: 12 }}>{error}</div>}
        {!detalle ? (
          <div style={{ color: t.textMuted, padding: 40, textAlign: 'center' }}>Selecciona o genera un cierre mensual</div>
        ) : (
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.primary }}>{MESES[detalle.mes]} {detalle.anio}</div>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Estado: <strong>{detalle.estado}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btn(false)} onClick={exportar}>⬇ Excel</button>
                {detalle.estado === 'borrador' && (
                  <button type="button" style={btn(true)} disabled={busy} onClick={aprobar}>Aprobar cierre</button>
                )}
                {bloqueado && !firmado && puedeFirmar && (
                  <button type="button" style={btn(true)} disabled={busy} onClick={firmar}>Firmar digitalmente</button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                ['Ingresos brutos', detalle.ingresos_brutos],
                ['Deducciones', detalle.total_deducciones],
                ['Gastos', detalle.total_gastos],
                ['Utilidad neta', detalle.utilidad_neta],
                ['Flujo de caja', detalle.flujo_caja_neto],
                ['Saldo operativa', detalle.saldo_operativa],
                ['Cap. licenciamiento', detalle.saldo_capitalizacion_lic],
                ['Cap. servicios', detalle.saldo_capitalizacion_srv],
                ['IVA neto', detalle.saldo_impuestos_iva_neto],
                ['Retenciones', detalle.saldo_impuestos_retencion],
              ].map(([l, v]) => (
                <div key={l} style={{ background: t.inputBg, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{l}</div>
                  <div style={{ fontWeight: 700, color: t.text }}>{fmtCOP(v)}</div>
                </div>
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>Notas del contador</span>
              <textarea
                style={{ ...inp, width: '100%', minHeight: 80, marginTop: 4, boxSizing: 'border-box' }}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                disabled={firmado}
              />
            </label>
            {!firmado && (
              <button type="button" style={btn(false)} disabled={busy} onClick={guardarNotas}>Guardar notas</button>
            )}

            {firmado && (
              <div style={{ marginTop: 16, padding: 12, background: t.primary + '11', borderRadius: 8, fontSize: 'var(--cc-sm)' }}>
                <div><strong>Firmado por:</strong> {detalle.firmado_por?.nombre || '—'}</div>
                <div><strong>Fecha:</strong> {detalle.firmado_at ? new Date(detalle.firmado_at).toLocaleString('es-CO') : '—'}</div>
                <div style={{ wordBreak: 'break-all', marginTop: 4 }}><strong>Hash SHA-256:</strong> {detalle.firma_contenido_hash}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
