import { useEffect, useState } from 'react'
import { API_BASE } from '../apiBase'
import { useAlmacenTheme } from './almacenShared'

function textoJustificacion(ficha) {
  const texto = String(ficha?.justificacion || '').trim()
  if (!texto) return 'Sin justificación'
  const autor = [ficha.justificacion_autor_nombre, ficha.justificacion_at].filter(Boolean).join(' · ')
  return autor ? `${texto} — ${autor}` : texto
}

function textoValor(valor) {
  if (valor == null || valor === '') return '—'
  if (typeof valor === 'object') {
    const partes = Object.entries(valor)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    return partes.join(' · ') || '—'
  }
  return String(valor)
}

/**
 * Historial de una línea de almacén, identificado por su id.
 */
export default function LineaTrazabilidadModal({ token, itemId, onClose }) {
  const ui = useAlmacenTheme()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    const auth = token || localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
    fetch(`${API_BASE}/almacen/lineas/${itemId}/trazabilidad`, {
      headers: { Authorization: `Bearer ${auth}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.detail || body.message || `Error ${res.status}`)
        return body
      })
      .then((body) => {
        if (vivo) setData(body)
      })
      .catch((e) => {
        if (vivo) setError(e.message || 'No se pudo leer la trazabilidad.')
      })
    return () => { vivo = false }
  }, [itemId, token])

  const ficha = data?.ficha || {}
  const filas = [
    ['Material solicitado', ficha.material],
    ['Insumo', [ficha.insumo_codigo, ficha.insumo_descripcion].filter(Boolean).join(' — ') || 'Sin insumo'],
    ['Observación', ficha.observacion || 'Sin observación'],
    ['Justificación', textoJustificacion(ficha)],
    ['Cantidad', [ficha.cantidad, ficha.unidad].filter((v) => v != null && v !== '').join(' ')],
    ['Proveedor', ficha.proveedor || '—'],
    ['Solicitud', ficha.solicitud_consecutivo != null ? `#${ficha.solicitud_consecutivo}` : '—'],
    ['Quién la pidió', ficha.solicitado_por_nombre || 'Sin registro'],
    ['Solicitud de', ficha.solicitud_de_nombre || '—'],
  ]
  if (ficha.valor_compra_unitario != null) {
    filas.push(['Valor unitario', ficha.valor_compra_unitario])
  }
  if (ficha.motivo_rechazo_linea) {
    filas.push(['Motivo de rechazo', ficha.motivo_rechazo_linea])
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100080,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="linea-trazabilidad-titulo"
        data-testid="linea-trazabilidad"
        onClick={(e) => e.stopPropagation()}
        style={{ ...ui.card, width: 'min(840px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}
      >
        <div id="linea-trazabilidad-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 8 }}>
          Trazabilidad de la línea {ficha.numero_linea != null ? `#${ficha.numero_linea}` : ''}
        </div>
        <p style={{ margin: '0 0 12px', color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>
          Esta es la línea {ficha.item_id != null ? `id ${ficha.item_id}` : ''}. El número puede repetirse en otra solicitud; el historial es solo de esta.
        </p>
        {error && <div style={{ color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
        {!data && !error && <div style={{ color: ui.textMuted }}>Cargando…</div>}
        {data && (
          <>
            <table style={{ width: '100%', fontSize: 'var(--cc-sm)', marginBottom: 16 }}>
              <tbody>
                {filas.map(([etiqueta, valor]) => (
                  <tr key={etiqueta}>
                    <td style={{ ...ui.td, fontWeight: 700, width: 180 }}>{etiqueta}</td>
                    <td style={ui.td}>{valor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Recorrido</div>
            {(data.eventos || []).length === 0 ? (
              <div style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)' }}>No hay movimientos registrados para esta línea.</div>
            ) : (data.eventos || []).map((ev) => (
              <div key={ev.id || `${ev.accion}-${ev.cuando}`} style={{ borderTop: `1px solid ${ui.textMuted}33`, padding: '8px 0' }}>
                <div style={{ fontWeight: 700 }}>{ev.accion}{ev.texto ? ` · ${ev.texto}` : ''}</div>
                <div style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>{ev.cuando || ''}</div>
                {(ev.anterior && Object.keys(ev.anterior).length > 0) && (
                  <div style={{ fontSize: 'var(--cc-sm)' }}>Antes: {textoValor(ev.anterior)}</div>
                )}
                {(ev.nuevo && Object.keys(ev.nuevo).length > 0) && (
                  <div style={{ fontSize: 'var(--cc-sm)' }}>Después: {textoValor(ev.nuevo)}</div>
                )}
              </div>
            ))}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} onClick={() => onClose?.()}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

export function LineaTrazabilidadButton({ token, itemId, compact = false, ui }) {
  const [open, setOpen] = useState(false)
  if (itemId == null || itemId === '') return null
  const auth = token || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token'))
  if (!auth) return null
  return (
    <>
      <button
        type="button"
        data-testid="linea-trazabilidad-btn"
        title="Trazabilidad de esta línea"
        aria-label="Ver trazabilidad de la línea"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        style={{
          ...(ui?.btnSecondary || {}),
          padding: compact ? '2px 6px' : '4px 8px',
          minHeight: 0,
          height: compact ? 26 : undefined,
        }}
      >
        📜
      </button>
      {open && (
        <LineaTrazabilidadModal token={auth} itemId={itemId} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
