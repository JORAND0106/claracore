import { useEffect, useMemo, useState } from 'react'
import { estiloAvisoAlmacen } from './almacenContraste'
import { esDocumentoSistema } from './ocDocumentoSistema'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

function textoReporte(fila) {
  const num = fila?.numero_oc ?? fila?.orden_compra_id ?? ''
  if (fila?.ok) {
    const anterior = fila.version_anterior != null
      ? `La versión ${fila.version_anterior} quedó guardada. `
      : ''
    const vigente = fila.version_vigente != null ? `La versión vigente es la ${fila.version_vigente}.` : ''
    return `OC #${num}: se regeneró el PDF. ${anterior}${vigente}`.trim()
  }
  return `OC #${num}: ${fila?.motivo || 'No se reemplazó el PDF.'}`
}

function destinatarioDe(fila) {
  const lista = Array.isArray(fila?.destinatarios) ? fila.destinatarios.filter(Boolean) : []
  return lista.join(', ')
}

/**
 * Regenera el PDF de las OC de esta solicitud.
 * No muestra cifras. La versión anterior solo se ofrece a quien puede regenerar.
 */
export default function SolicitudRegenerarPdf({
  solicitudId,
  ordenes,
  puedeRegenerar,
  contraste,
  onChanged,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const lista = useMemo(
    () => (ordenes || []).filter((oc) => oc?.id),
    [ordenes],
  )
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [versiones, setVersiones] = useState({})
  const [busy, setBusy] = useState(false)
  const [reporte, setReporte] = useState([])
  const [reenvio, setReenvio] = useState(null)
  const [correoFaltante, setCorreoFaltante] = useState('')
  const [avisoReenvio, setAvisoReenvio] = useState('')

  const ids = lista.map((oc) => oc.id).join(',')
  useEffect(() => {
    if (!puedeRegenerar || !ids) {
      setVersiones({})
      return undefined
    }
    let vivo = true
    const pedidos = ids.split(',').filter(Boolean).map((id) => api.listarVersionesPdfOc(id)
      .then((data) => ({ id, versiones: data?.versiones || [] }))
      .catch(() => ({ id, versiones: [] })))
    Promise.all(pedidos).then((filas) => {
      if (!vivo) return
      const next = {}
      filas.forEach((fila) => { next[String(fila.id)] = fila.versiones })
      setVersiones(next)
    })
    return () => { vivo = false }
  }, [api, ids, puedeRegenerar])

  if (!lista.length) return null
  const hayAviso = lista.some((oc) => oc.pdf_proveedor_desactualizado)
  if (!puedeRegenerar && !hayAviso && !reporte.length) return null

  const alternar = (id, checked) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const regenerar = async (idsOc) => {
    if (!solicitudId || !idsOc.length) return
    setBusy(true)
    setAvisoReenvio('')
    try {
      const data = await api.regenerarPdfsOc(solicitudId, idsOc)
      const filas = data?.resultados || []
      setReporte(filas.map(textoReporte))
      const pendientes = filas.filter((fila) => fila?.ok && fila?.ya_enviada && !fila?.documento_sistema)
      setReenvio(pendientes.length ? pendientes : null)
      setCorreoFaltante('')
      setSeleccion(new Set())
      onChanged?.()
    } catch (err) {
      setReporte([err?.message || 'No se pudo regenerar el PDF.'])
    } finally {
      setBusy(false)
    }
  }

  const cerrarReenvio = async (reenviar) => {
    const pendientes = reenvio || []
    setBusy(true)
    setAvisoReenvio('')
    const avisos = []
    try {
      for (const fila of pendientes) {
        const body = { reenviar }
        const correo = (correoFaltante || '').trim()
        if (reenviar && correo && !destinatarioDe(fila)) body.correo = correo
        const resp = await api.resolverReenvioPdfOc(fila.orden_compra_id, body)
        const num = resp?.numero_oc ?? fila.numero_oc ?? fila.orden_compra_id
        avisos.push(`OC #${num}: ${resp?.detalle || (reenviar ? 'Reenvío registrado.' : 'No se reenvió.')}`)
      }
      setReporte((prev) => [...prev, ...avisos])
      setReenvio(null)
      onChanged?.()
    } catch (err) {
      setAvisoReenvio(err?.message || 'No se pudo registrar el reenvío.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="regenerar-pdf-oc" style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lista.map((oc) => {
        const anteriores = (versiones[String(oc.id)] || []).filter((v) => v && !v.vigente)
        return (
          <div key={oc.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {puedeRegenerar && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--cc-sm)', color: ui.text }}>
                <input
                  type="checkbox"
                  checked={seleccion.has(oc.id)}
                  disabled={busy}
                  onChange={(e) => alternar(oc.id, e.target.checked)}
                />
                <span>
                  OC #{oc.numero_oc}
                  {oc.proveedor_nombre ? ` · ${oc.proveedor_nombre}` : ''}
                  {esDocumentoSistema(oc) ? ' · documento de sistema' : ''}
                </span>
                <button
                  type="button"
                  style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }}
                  disabled={busy}
                  onClick={() => { void regenerar([oc.id]) }}
                >
                  Regenerar PDF
                </button>
              </label>
            )}
            {oc.pdf_proveedor_desactualizado && (
              <div
                data-testid="oc-pdf-proveedor-desactualizado"
                style={estiloAvisoAlmacen(contraste, 'warn', { compact: true })}
              >
                OC #{oc.numero_oc}: el proveedor aún tiene la versión anterior del PDF.
              </div>
            )}
            {puedeRegenerar && anteriores.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {anteriores.map((v) => (
                  <button
                    key={`${oc.id}-${v.version}`}
                    type="button"
                    data-testid="oc-pdf-version-anterior"
                    style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: 'var(--cc-xs)' }}
                    disabled={busy}
                    onClick={() => { void api.openVersionPdfOc(oc.id, v.version).catch((err) => setReporte([err.message])) }}
                  >
                    Ver versión {v.version}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {puedeRegenerar && (
        <div>
          <button
            type="button"
            data-testid="regenerar-pdf-seleccion"
            style={{ ...ui.btnPrimary, padding: '6px 12px', fontSize: 'var(--cc-sm)' }}
            disabled={busy || seleccion.size === 0}
            onClick={() => { void regenerar([...seleccion]) }}
          >
            Regenerar PDF de la selección
          </button>
        </div>
      )}
      {reporte.length > 0 && (
        <div
          data-testid="regenerar-pdf-reporte"
          style={{ ...estiloAvisoAlmacen(contraste, 'panel'), fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}
        >
          {reporte.map((linea) => (
            <div key={linea}>{linea}</div>
          ))}
        </div>
      )}
      {reenvio && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="reenviar-pdf-corregido"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100080,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: ui.card?.background || ui.bg,
              color: ui.text,
              border: `1px solid ${ui.borderColor}`,
              borderRadius: 12,
              padding: 16,
              maxWidth: 480,
              width: '100%',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Reenviar el PDF corregido</div>
            <div style={{ fontSize: 'var(--cc-sm)', lineHeight: 1.45, marginBottom: 10 }}>
              {reenvio.map((fila) => {
                const correo = destinatarioDe(fila)
                const quien = fila.proveedor_nombre ? ` (${fila.proveedor_nombre})` : ''
                return (
                  <div key={fila.orden_compra_id} style={{ marginBottom: 6 }}>
                    {correo
                      ? `OC #${fila.numero_oc ?? fila.orden_compra_id}: el destinatario es ${correo}${quien}.`
                      : `OC #${fila.numero_oc ?? fila.orden_compra_id}: no hay un correo registrado${quien}.`}
                  </div>
                )
              })}
              Nada se reenvía hasta que lo confirme. Si no reenvía, el proveedor sigue con la versión anterior.
            </div>
            {reenvio.some((fila) => !destinatarioDe(fila)) && (
              <input
                style={{ ...ui.input, marginBottom: 10 }}
                placeholder="Correo del proveedor"
                value={correoFaltante}
                disabled={busy}
                onChange={(e) => setCorreoFaltante(e.target.value)}
              />
            )}
            {avisoReenvio && (
              <div style={{ ...estiloAvisoAlmacen(contraste, 'danger'), marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
                {avisoReenvio}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => { void cerrarReenvio(false) }}>
                No reenviar
              </button>
              <button type="button" style={ui.btnPrimary} disabled={busy} onClick={() => { void cerrarReenvio(true) }}>
                Reenviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
