import { useState } from 'react'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Ícono clip para abrir el PDF de la Orden de Compra generada.
 * Muestra progreso mientras descarga / genera el PDF (puede tardar varios segundos).
 */
export default function OrdenCompraPdfClip({
  ordenCompra,
  title,
  compact = false,
  puedeExportar = true,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [busy, setBusy] = useState(false)
  const oc = ordenCompra
  if (!oc?.id || !puedeExportar) return null

  const abrirPdf = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (busy) return
    setBusy(true)
    try {
      await api.openOcPdf(oc.id)
    } catch (err) {
      window.alert(err.message || 'No se pudo abrir el PDF de la Orden de Compra.')
    } finally {
      setBusy(false)
    }
  }

  const label = title || `Orden de Compra #${oc.numero_oc}`
  const pdfGenerando = Boolean(oc.pdf_generando) && !oc.tiene_pdf_oc

  return (
    <>
      <button
        type="button"
        title={busy || pdfGenerando ? 'Generando / abriendo PDF…' : `${label} — Abrir PDF`}
        aria-label={busy ? 'Abriendo PDF de la Orden de Compra' : `Abrir PDF ${label}`}
        aria-busy={busy}
        disabled={busy}
        onClick={abrirPdf}
        style={{
          ...ui.btnSecondary,
          padding: compact ? '2px 6px' : '4px 8px',
          fontSize: compact ? 'var(--cc-xs)' : 'var(--cc-sm)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          lineHeight: 1.2,
          opacity: busy ? 0.75 : 1,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <span aria-hidden>{busy ? '⏳' : '📎'}</span>
        {!compact && (
          <span>{busy ? 'Abriendo PDF…' : `OC #${oc.numero_oc}`}</span>
        )}
      </button>
      {busy && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.45)',
            padding: 24,
          }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div
            style={{
              background: ui.card?.background || '#fff',
              color: ui.text,
              borderRadius: 12,
              padding: '28px 32px',
              maxWidth: 360,
              textAlign: 'center',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.35)',
              border: `1px solid ${ui.textMuted}33`,
            }}
          >
            <div
              className="cc-almacen-spinner"
              aria-hidden
              style={{
                width: 36,
                height: 36,
                margin: '0 auto 14px',
                border: `3px solid ${ui.textMuted}33`,
                borderTopColor: ui.accent || '#2563eb',
                borderRadius: '50%',
                animation: 'cc-almacen-spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 6 }}>
              {pdfGenerando ? 'Generando orden de compra…' : 'Preparando PDF…'}
            </div>
            <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, lineHeight: 1.45 }}>
              Esto puede tomar varios segundos. No cierre esta ventana.
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes cc-almacen-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
