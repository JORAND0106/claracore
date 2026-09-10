import { useCallback, useEffect, useState } from 'react'
import { fmtSalario, nombreCompleto } from './rrhhHelpers'

/**
 * Panel Liquidación — finalización de relación laboral.
 */
export default function LiquidacionPanel({
  api,
  permisos,
  trabajadores = [],
  S,
  tTok,
  sheetUi,
  flash,
  onTrabajadoresChanged,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    trabajador_id: '',
    fecha_retiro: '',
    causa: '',
    indemnizacion: '',
    salario_pendiente: '',
    dias_vacaciones_pendientes: '',
  })
  const [provPreview, setProvPreview] = useState(null)

  const activosORetiro = (trabajadores || []).filter(
    (t) => t.estado === 'activo' || t.estado === 'inactivo',
  )

  const cargar = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const r = await api.listLiquidaciones()
      setItems(r?.items || [])
    } catch (e) {
      flash?.('error', e.message || 'No se pudieron cargar liquidaciones.')
    } finally {
      setLoading(false)
    }
  }, [api, flash])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!api || !form.trabajador_id) {
      setProvPreview(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const p = await api.getProvisiones(Number(form.trabajador_id))
        if (!cancelled) setProvPreview(p)
      } catch {
        if (!cancelled) setProvPreview(null)
      }
    })()
    return () => { cancelled = true }
  }, [api, form.trabajador_id])

  const generar = async () => {
    if (!api || !permisos.crear) return
    if (!form.trabajador_id || !form.fecha_retiro) {
      flash?.('error', 'Seleccione colaborador y fecha de retiro.')
      return
    }
    if (!window.confirm(
      '¿Generar liquidación? Se creará el PDF, se enviará al correo del colaborador y se marcará como retirado.'
    )) return
    setBusy(true)
    try {
      const body = {
        trabajador_id: Number(form.trabajador_id),
        fecha_retiro: form.fecha_retiro,
        causa: form.causa || null,
        indemnizacion: Number(form.indemnizacion) || 0,
        salario_pendiente: Number(form.salario_pendiente) || 0,
        dias_vacaciones_pendientes: form.dias_vacaciones_pendientes !== ''
          ? Number(form.dias_vacaciones_pendientes)
          : null,
      }
      await api.generarLiquidacion(body)
      flash?.('success', 'Liquidación generada y enviada.')
      setForm({
        trabajador_id: '',
        fecha_retiro: '',
        causa: '',
        indemnizacion: '',
        salario_pendiente: '',
        dias_vacaciones_pendientes: '',
      })
      await cargar()
      onTrabajadoresChanged?.()
    } catch (e) {
      flash?.('error', e.message || 'No se pudo generar la liquidación.')
    } finally {
      setBusy(false)
    }
  }

  const nombreTrab = (id) => {
    const t = (trabajadores || []).find((x) => Number(x.id) === Number(id))
    return t ? nombreCompleto(t) : `#${id}`
  }

  const inputStyle = {
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${tTok.border}`,
    background: tTok.inputBg || tTok.bgCard,
    color: tTok.text,
    fontSize: 'var(--cc-sm)',
  }
  const labelStyle = { fontSize: 'var(--cc-xs)', color: tTok.textMuted, marginBottom: 2, display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {permisos.crear && (
        <div style={{
          padding: 14,
          background: tTok.bgCard,
          border: `1px solid ${tTok.border}`,
          borderRadius: 10,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Nueva liquidación</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <span style={labelStyle}>Colaborador</span>
              <select
                style={{ ...inputStyle, minWidth: 200 }}
                value={form.trabajador_id}
                onChange={(e) => setForm((f) => ({ ...f, trabajador_id: e.target.value }))}
              >
                <option value="">Seleccione…</option>
                {activosORetiro.map((t) => (
                  <option key={t.id} value={t.id}>{nombreCompleto(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Fecha retiro</span>
              <input
                type="date"
                style={inputStyle}
                value={form.fecha_retiro}
                onChange={(e) => setForm((f) => ({ ...f, fecha_retiro: e.target.value }))}
              />
            </div>
            <div>
              <span style={labelStyle}>Causa</span>
              <input
                style={{ ...inputStyle, minWidth: 160 }}
                value={form.causa}
                placeholder="Renuncia, despido…"
                onChange={(e) => setForm((f) => ({ ...f, causa: e.target.value }))}
              />
            </div>
            <div>
              <span style={labelStyle}>Salario pendiente</span>
              <input
                type="number"
                style={{ ...inputStyle, width: 120 }}
                value={form.salario_pendiente}
                onChange={(e) => setForm((f) => ({ ...f, salario_pendiente: e.target.value }))}
              />
            </div>
            <div>
              <span style={labelStyle}>Días vacaciones pend.</span>
              <input
                type="number"
                style={{ ...inputStyle, width: 90 }}
                value={form.dias_vacaciones_pendientes}
                placeholder="auto"
                onChange={(e) => setForm((f) => ({ ...f, dias_vacaciones_pendientes: e.target.value }))}
              />
            </div>
            <div>
              <span style={labelStyle}>Indemnización</span>
              <input
                type="number"
                style={{ ...inputStyle, width: 120 }}
                value={form.indemnizacion}
                onChange={(e) => setForm((f) => ({ ...f, indemnizacion: e.target.value }))}
              />
            </div>
            <button type="button" style={S.btnPrimary} disabled={busy} onClick={generar}>
              Generar y enviar
            </button>
          </div>
          {provPreview && (
            <div style={{
              marginTop: 12,
              fontSize: 'var(--cc-sm)',
              color: tTok.textMuted,
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
            }}>
              <span>Provisiones acum.:</span>
              <span>Cesantías {fmtSalario(provPreview.cesantias)}</span>
              <span>Intereses {fmtSalario(provPreview.interes_cesantias)}</span>
              <span>Prima {fmtSalario(provPreview.prima)}</span>
              <span>Vacaciones {fmtSalario(provPreview.vacaciones)}</span>
            </div>
          )}
        </div>
      )}

      <div style={{
        background: tTok.bgCard,
        border: `1px solid ${tTok.border}`,
        borderRadius: 10,
        overflow: 'auto',
      }}>
        {loading ? (
          <div style={{ padding: 16, color: tTok.textMuted }}>Cargando…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
            <thead>
              <tr>
                <th style={sheetUi.th}>Colaborador</th>
                <th style={sheetUi.th}>Retiro</th>
                <th style={sheetUi.th}>Causa</th>
                <th style={sheetUi.th}>Total</th>
                <th style={sheetUi.th}>Email</th>
                <th style={sheetUi.th} />
              </tr>
            </thead>
            <tbody>
              {items.map((liq) => {
                const det = liq.detalle_json || {}
                return (
                  <tr key={liq.id}>
                    <td style={sheetUi.td}>{det.nombre || nombreTrab(liq.trabajador_id)}</td>
                    <td style={sheetUi.td}>{liq.fecha_retiro}</td>
                    <td style={sheetUi.td}>{liq.causa || '—'}</td>
                    <td style={{ ...sheetUi.td, textAlign: 'right' }}>{fmtSalario(liq.total_liquidacion)}</td>
                    <td style={sheetUi.td}>{liq.email_estado || '—'}</td>
                    <td style={sheetUi.td}>
                      {liq.pdf_blob_path && (
                        <button
                          type="button"
                          style={S.btnGhost}
                          onClick={() => api.downloadBlob(
                            api.liquidacionPdfUrl(liq.id),
                            liq.pdf_nombre || 'liquidacion.pdf',
                          )}
                        >
                          PDF
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...sheetUi.td, color: tTok.textMuted }}>
                    Sin liquidaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
