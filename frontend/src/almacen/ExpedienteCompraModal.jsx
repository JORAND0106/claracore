import { useEffect, useState } from 'react'
import { fmtCant, fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function ExpedienteCompraModal({ ocId, token, onClose }) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
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
              <div style={{ fontSize: 'var(--cc-sm)' }}>
                Solicitud #{sol?.consecutivo} · Estado: {oc?.estado}
              </div>
              <table style={{ width: '100%', marginTop: 8, fontSize: 'var(--cc-sm)' }}>
                <thead>
                  <tr>
                    <th style={ui.th}>Material</th>
                    <th style={ui.th}>Proveedor</th>
                    <th style={ui.th}>Cant.</th>
                    <th style={ui.th}>V. unit.</th>
                  </tr>
                </thead>
                <tbody>
                  {(oc?.items || []).map((it) => (
                    <tr key={it.id}>
                      <td style={ui.td}>{it.material_descripcion}</td>
                      <td style={ui.td}>{it.proveedor_nombre}</td>
                      <td style={ui.td}>{fmtCant(it.cantidad)}</td>
                      <td style={ui.td}>{fmtMoney(it.valor_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    {e.fecha_entrada}
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
