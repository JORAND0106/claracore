import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Ícono clip para abrir el PDF de la Orden de Compra generada.
 */
export default function OrdenCompraPdfClip({
  ordenCompra,
  title,
  compact = false,
  puedeExportar = true,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const oc = ordenCompra
  if (!oc?.id || !puedeExportar) return null

  const abrirPdf = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    try {
      await api.openOcPdf(oc.id)
    } catch (err) {
      window.alert(err.message || 'No se pudo abrir el PDF de la Orden de Compra.')
    }
  }

  const label = title || `Orden de Compra #${oc.numero_oc}`

  return (
    <button
      type="button"
      title={`${label} — Abrir PDF`}
      aria-label={`Abrir PDF ${label}`}
      onClick={abrirPdf}
      style={{
        ...ui.btnSecondary,
        padding: compact ? '2px 6px' : '4px 8px',
        fontSize: compact ? 'var(--cc-xs)' : 'var(--cc-sm)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden>📎</span>
      {!compact && <span>OC #{oc.numero_oc}</span>}
    </button>
  )
}
