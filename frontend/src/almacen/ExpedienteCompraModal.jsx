import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../components/CcModalBrandHeader'
import { fmtCant, fmtFechaAlmacen, fmtFechaAlmacenSolo, fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function ExpedienteCompraModal({
  ocId,
  token,
  onClose,
  verEconomicos = true,
  puedeReenviar = false,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [avisoEnvio, setAvisoEnvio] = useState('')
  const [correoRetry, setCorreoRetry] = useState('')
  const [facturaFile, setFacturaFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getExpediente(ocId).then(setData).catch((e) => setError(e.message))
  }, [api, ocId])

  const download = (url, fname) => {
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = fname
        a.click()
        URL.revokeObjectURL(u)
      })
      .catch(() => setError('No se pudo descargar el archivo.'))
  }

  const reenviarCorreo = async () => {
    setBusy(true)
    setError('')
    setAvisoEnvio('')
    try {
      const correo = correoRetry.trim()
      const r = await api.reenviarOcCorreo(ocId, correo ? { correo } : {})
      const exp = await api.getExpediente(ocId)
      setData(exp)
      const base = r?.detalle || (r?.resultado === 'enviado' ? 'Correo enviado.' : 'Sigue pendiente de envío.')
      setAvisoEnvio(r?.persistido === false
        ? `${base} El registro de envío no quedó guardado en la base de datos.`
        : base)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const subirFactura = async () => {
    if (!facturaFile) return
    setBusy(true)
    try {
      await api.uploadFactura(ocId, facturaFile)
      const exp = await api.getExpediente(ocId)
      setData(exp)
      setFacturaFile(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const oc = data?.orden_compra
  const sol = data?.solicitud

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...ui.card,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={ui.t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700 }}>
            📁 Expediente de compra — OC #{oc?.numero_oc || '…'}
          </div>
          <button type="button" style={ui.btnSecondary} onClick={onClose}>✕</button>
        </div>

        {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

        {!data ? (
          <div style={{ color: ui.textMuted }}>Cargando…</div>
        ) : (
          <>
            <section style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>📄 Orden de compra</div>
              <div style={{ fontSize: 'var(--cc-sm)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span data-testid="expediente-solicitud-nombre" style={{ whiteSpace: 'normal' }}>
                  {sol?.titulo?.trim() || `Solicitud #${sol?.consecutivo}`}
                  {' · Estado OC: '}
                  {oc?.estado}
                </span>
                {sol?.id && (
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    data-testid="expediente-ocs-pdf"
                    onClick={() => {
                      api.openSolicitudOcsPdf(sol.id).catch((err) => {
                        setError(err.message || 'No se pudo abrir el PDF de las órdenes de compra.')
                      })
                    }}
                  >
                    PDF de las OC
                  </button>
                )}
              </div>
              <table style={{ width: '100%', marginTop: 8, fontSize: 'var(--cc-sm)' }}>
                <thead>
                  <tr>
                    <th style={ui.th}>Material</th>
                    <th style={ui.th}>Proveedor</th>
                    <th style={ui.th}>Cant.</th>
                    {verEconomicos && <th style={ui.th}>V. unit.</th>}
                  </tr>
                </thead>
                <tbody>
                  {(oc?.items || []).map((it) => (
                    <tr key={it.id}>
                      <td style={ui.td}>{it.material_descripcion}</td>
                      <td style={ui.td}>{it.proveedor_nombre}</td>
                      <td style={ui.td}>{fmtCant(it.cantidad)}</td>
                      {verEconomicos && <td style={ui.td}>{fmtMoney(it.valor_unitario)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ marginBottom: 16 }} data-testid="oc-envios">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>✉️ Envío al proveedor</div>
              <div style={{ fontSize: 'var(--cc-sm)', marginBottom: 8 }}>
                Estado: {oc?.envio_estado === 'enviado'
                  ? 'enviado'
                  : (oc?.envio_estado === 'pendiente' ? 'pendiente de envío' : 'sin registro de envío')}
                {oc?.envio_correo ? ` · ${oc.envio_correo}` : ''}
              </div>
              {(oc?.envios || []).length === 0 ? (
                <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
                  No hay intentos de envío registrados en esta orden.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr>
                      <th style={ui.th}>Fecha</th>
                      <th style={ui.th}>Destinatario</th>
                      <th style={ui.th}>Quién</th>
                      <th style={ui.th}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(oc.envios || []).map((ev) => (
                      <tr key={ev.id || `${ev.created_at}-${ev.destinatario}`}>
                        <td style={ui.td}>{fmtFechaAlmacen(ev.created_at) || '—'}</td>
                        <td style={ui.td}>{ev.destinatario || '—'}</td>
                        <td style={ui.td}>{ev.disparado_por_nombre || '—'}</td>
                        <td style={ui.td}>
                          {ev.resultado || '—'}
                          {ev.detalle ? ` · ${ev.detalle}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {puedeReenviar && oc?.envio_estado !== 'enviado' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                  <input
                    style={{ ...ui.input, flex: 1, minWidth: 180 }}
                    value={correoRetry}
                    placeholder="Correo para reintentar (opcional)"
                    aria-label="Correo para reintentar el envío"
                    disabled={busy}
                    onChange={(e) => setCorreoRetry(e.target.value)}
                  />
                  <button
                    type="button"
                    style={ui.btnPrimary}
                    data-testid="oc-reenviar-correo"
                    disabled={busy}
                    onClick={() => { void reenviarCorreo() }}
                  >
                    {busy ? 'Enviando…' : 'Reintentar envío'}
                  </button>
                </div>
              )}
              {avisoEnvio && (
                <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: ui.text }}>{avisoEnvio}</div>
              )}
            </section>

            <section style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>🧾 Factura proveedor</div>
              {oc?.factura_nombre ? (
                <button
                  type="button"
                  style={ui.btnSecondary}
                  onClick={() => download(api.facturaDownloadUrl(ocId), oc.factura_nombre)}
                >
                  Descargar {oc.factura_nombre}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="file" accept="image/*,application/pdf" onChange={(e) => setFacturaFile(e.target.files?.[0] || null)} />
                  <button type="button" style={ui.btnPrimary} disabled={!facturaFile || busy} onClick={subirFactura}>
                    Subir factura
                  </button>
                </div>
              )}
            </section>

            <section>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>📥 Entradas y remisiones</div>
              {(data.entradas || []).length === 0 ? (
                <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>Sin entradas registradas.</div>
              ) : (
                data.entradas.map((e) => (
                  <div key={e.id} style={{ marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
                    {fmtFechaAlmacenSolo(e.fecha_entrada)}
                    {e.remision_nombre && (
                      <button
                        type="button"
                        style={{ ...ui.btnSecondary, marginLeft: 8, padding: '2px 8px' }}
                        onClick={() => download(api.remisionDownloadUrl(e.id), e.remision_nombre)}
                      >
                        Remisión: {e.remision_nombre}
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
