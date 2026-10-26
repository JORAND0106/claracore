import { useEffect, useState } from 'react'
import { almacenContraste } from './almacenContraste'
import { useAlmacenTheme } from './almacenShared'
import {
  aplicarRespuestaTodos,
  respuestaNotificarCompleta,
} from './ocNotificarProveedor'

/**
 * Después de confirmar los proveedores y antes de generar.
 * Una fila por proveedor, sin respuesta por defecto. Cancelar no genera nada.
 * Muestra el correo exacto de destino y permite redirigirlo solo esta vez.
 */
export default function OcNotificarProveedorModal({
  proveedores = [],
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const ui = useAlmacenTheme()
  const contraste = almacenContraste(ui)
  const [respuestas, setRespuestas] = useState({})
  const [redirects, setRedirects] = useState({})
  const listo = respuestaNotificarCompleta(proveedores, respuestas)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const marcar = (key, valor) => {
    if (busy) return
    setRespuestas((prev) => ({ ...prev, [key]: valor }))
  }

  return (
    <div
      data-testid="oc-notificar-proveedor"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100070,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (!busy) onCancel?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-notificar-titulo"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...ui.card,
          width: 'min(640px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 20,
          color: ui.text,
        }}
      >
        <div id="oc-notificar-titulo" style={{ fontWeight: 800, fontSize: 'var(--cc-title)', marginBottom: 6 }}>
          Notificar al comercial
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginBottom: 12 }}>
          Responda por cada proveedor antes de generar. Se muestra el correo de la cotización elegida.
          Si elige No, la orden queda como documento de sistema y no se envía correo.
          Puede redirigir temporalmente el envío a otro correo (solo esta vez; no cambia la cotización).
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={ui.btnSecondary}
            disabled={busy || !proveedores.length}
            data-testid="oc-notificar-si-todos"
            onClick={() => setRespuestas(aplicarRespuestaTodos(proveedores, true))}
          >
            Sí a todos
          </button>
          <button
            type="button"
            style={ui.btnSecondary}
            disabled={busy || !proveedores.length}
            data-testid="oc-notificar-no-todos"
            onClick={() => setRespuestas(aplicarRespuestaTodos(proveedores, false))}
          >
            No a todos
          </button>
        </div>
        {proveedores.map((p) => {
          const valor = respuestas[p.key]
          const btn = (activo) => ({
            ...(activo ? ui.btnPrimary : ui.btnSecondary),
            minWidth: 72,
          })
          const correoDestino = String(redirects[p.key] || '').trim() || p.correo || null
          return (
            <div
              key={p.key}
              data-testid="oc-notificar-fila"
              style={{
                borderTop: `1px solid ${ui.textMuted}33`,
                padding: '10px 0',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, flex: '1 1 220px' }}>
                  ¿Desea notificar al comercial del proveedor {p.nombre}?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    style={btn(valor === true)}
                    aria-pressed={valor === true}
                    data-testid="oc-notificar-si"
                    disabled={busy}
                    onClick={() => marcar(p.key, true)}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    style={btn(valor === false)}
                    aria-pressed={valor === false}
                    data-testid="oc-notificar-no"
                    disabled={busy}
                    onClick={() => marcar(p.key, false)}
                  >
                    No
                  </button>
                </div>
              </div>
              <div
                data-testid="oc-notificar-correo"
                style={{ marginTop: 6, fontSize: 'var(--cc-sm)', color: ui.textMuted }}
              >
                {p.sin_correo && !String(redirects[p.key] || '').trim()
                  ? 'Sin correo en la cotización elegida. Indique uno abajo para enviar, o elija No.'
                  : (
                    <>
                      Correo de destino:
                      {' '}
                      <strong style={{ color: ui.text }}>{correoDestino || '—'}</strong>
                      {String(redirects[p.key] || '').trim() && p.correo
                        ? ` (cotización: ${p.correo})`
                        : ''}
                    </>
                  )}
              </div>
              {valor === true && (
                <label style={{ display: 'block', marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                  Redirigir solo esta vez a
                  <input
                    data-testid="oc-notificar-redirect"
                    style={{ ...ui.input, marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                    type="email"
                    disabled={busy}
                    placeholder={p.correo || 'correo@ejemplo.com'}
                    value={redirects[p.key] || ''}
                    onChange={(e) => setRedirects((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  />
                </label>
              )}
            </div>
          )
        })}
        {error ? (
          <div style={{ marginTop: 12, color: contraste.dangerText, fontSize: 'var(--cc-sm)' }} data-testid="oc-notificar-error">
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={ui.btnSecondary} disabled={busy} onClick={() => onCancel?.()}>
            Cancelar
          </button>
          <button
            type="button"
            style={ui.btnPrimary}
            data-testid="oc-notificar-continuar"
            disabled={busy || !listo}
            onClick={() => onConfirm?.(respuestas, redirects)}
          >
            {busy ? 'Generando…' : 'Generar'}
          </button>
        </div>
      </div>
    </div>
  )
}
