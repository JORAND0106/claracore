import { useCallback, useEffect, useState } from 'react'
import ExpedienteCompraModal from './ExpedienteCompraModal'
import {
  ESTADO_SOLICITUD_LABEL,
  fmtCant,
  fmtMoney,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

export default function SolicitudValidacionPanel({ permisos, token }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState({ cotizaciones_minimas: 3 })
  const [expedienteOcId, setExpedienteOcId] = useState(null)

  const reload = useCallback(() => {
    api.listSolicitudes('enviada').then(setLista).catch((e) => setError(e.message))
    api.getConfig().then(setConfig).catch(() => {})
  }, [api])

  useEffect(() => { reload() }, [reload])

  const aprobar = async (s) => {
    if (!window.confirm(`¿Aprobar solicitud #${s.consecutivo}? Se generará la Orden de Compra automáticamente.`)) return
    setBusy(true)
    setError('')
    try {
      const r = await api.aprobarSolicitud(s.id, {})
      setSel(null)
      reload()
      const oc = r.orden_compra_generada || r.orden_compra
      if (oc?.id) setExpedienteOcId(oc.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const rechazar = async (s) => {
    if (!motivo.trim()) {
      setError('Indique el motivo del rechazo.')
      return
    }
    setBusy(true)
    try {
      await api.rechazarSolicitud(s.id, motivo)
      setSel(null)
      setMotivo('')
      reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!permisos?.validar) {
    return (
      <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
        No tiene permiso de validación en Almacén.
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>✅ Validación de solicitudes</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
          Apruebe o rechace solicitudes pendientes. Al aprobar, la Orden de Compra se genera de inmediato.
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {lista.length === 0 ? (
        <div style={{ ...ui.card, textAlign: 'center', color: ui.textMuted }}>
          No hay solicitudes pendientes de aprobación.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map((s) => (
            <div key={s.id} style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>Solicitud #{s.consecutivo}</strong>
                  <span style={{ marginLeft: 8, color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
                    {ESTADO_SOLICITUD_LABEL[s.estado]}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={ui.btnSecondary} onClick={() => setSel(sel?.id === s.id ? null : s)}>
                    {sel?.id === s.id ? 'Ocultar' : 'Revisar'}
                  </button>
                </div>
              </div>

              {sel?.id === s.id && (
                <div style={{ marginTop: 16 }}>
                  {(s.items || []).some((it) => it.supera_presupuesto) && (
                    <div style={{
                      background: '#fef2f2',
                      border: '2px solid #dc2626',
                      color: '#991b1b',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 12,
                      fontWeight: 700,
                    }}
                    >
                      ⚠ Esta solicitud supera el presupuesto disponible en uno o más ítems/PK-ID.
                      Revise las líneas marcadas antes de aprobar y generar la Orden de Compra.
                    </div>
                  )}
                  {(s.items || []).map((it) => {
                    const supera = it.supera_presupuesto || it.contexto_presupuesto?.supera_presupuesto
                    const ctx = it.contexto_presupuesto
                    return (
                    <div
                      key={it.id}
                      style={{
                        marginBottom: 12,
                        padding: 10,
                        background: supera ? '#fef2f2' : `${ui.accentSoft}`,
                        border: supera ? '2px solid #dc2626' : `1px solid ${ui.textMuted}33`,
                        borderRadius: 8,
                      }}
                    >
                      {supera && (
                        <div style={{ color: '#dc2626', fontWeight: 800, marginBottom: 6, fontSize: 'var(--cc-sm)' }}>
                          ⚠ SUPERA PRESUPUESTO — {it.capitulo} · {it.item} en PK {it.pk_id}
                        </div>
                      )}
                      <div style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>
                        {it.capitulo} · {it.item} — {it.material_descripcion}
                      </div>
                      <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                        PK: {it.pk_id || '—'} · Cantidad: {fmtCant(it.cantidad)} {it.unidad}
                        {it.es_recurrente ? ' · Compra recurrente' : ` · Cotizaciones: ${(it.cotizaciones || []).length}/${config.cotizaciones_minimas}`}
                      </div>
                      {ctx && (
                        <div style={{ fontSize: 'var(--cc-xs)', marginTop: 6, color: supera ? '#991b1b' : ui.textMuted }}>
                          Presupuestado: {fmtCant(ctx.cant_presupuestada)} ·
                          Solicitado acum.: {fmtCant(ctx.cant_solicitada_acumulada)} ·
                          Saldo: <strong>{fmtCant(ctx.saldo_disponible_despues)}</strong>
                        </div>
                      )}
                      {it.analisis_valor && (
                        <div style={{ fontSize: 'var(--cc-xs)', marginTop: 4, color: ui.textMuted }}>
                          Costo insumo: {fmtMoney(it.analisis_valor.costo_insumo_linea)} ·
                          Valor cobro: {fmtMoney(it.analisis_valor.valor_cobro_linea)} ·
                          Utilidad est.: {fmtMoney(it.analisis_valor.utilidad_estimada_linea)}
                        </div>
                      )}
                      {(it.cotizaciones || []).length > 0 && (
                        <table style={{ width: '100%', marginTop: 8, fontSize: 'var(--cc-sm)' }}>
                          <thead>
                            <tr>
                              <th style={ui.th}>Proveedor</th>
                              <th style={ui.th}>V. unit.</th>
                              <th style={ui.th}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {it.cotizaciones.map((c) => (
                              <tr key={c.id}>
                                <td style={ui.td}>{c.proveedor_nombre}</td>
                                <td style={ui.td}>{fmtMoney(c.valor_unitario)}</td>
                                <td style={ui.td}>{fmtMoney(c.valor_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    )
                  })}

                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted }}>Motivo rechazo (si aplica)</label>
                    <input style={{ ...ui.input, marginTop: 4 }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" style={{ ...ui.btnPrimary, background: '#047857' }} disabled={busy} onClick={() => aprobar(s)}>
                      ✓ Aprobar y generar OC
                    </button>
                    <button type="button" style={{ ...ui.btnPrimary, background: '#dc2626' }} disabled={busy} onClick={() => rechazar(s)}>
                      ✕ Rechazar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {expedienteOcId && (
        <ExpedienteCompraModal
          ocId={expedienteOcId}
          token={token}
          onClose={() => setExpedienteOcId(null)}
        />
      )}
    </div>
  )
}
