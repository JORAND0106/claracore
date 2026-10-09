import { useState } from 'react'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Abre el PDF con todas las OC de la solicitud, cada una en su hoja.
 */
export default function SolicitudOcsPdfButton({
  solicitudId,
  ordenes = [],
  compact = false,
  puedeExportar = true,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [busy, setBusy] = useState(false)
  if (!solicitudId || !puedeExportar || !ordenes.length) return null

  const nums = ordenes.map((o) => o?.numero_oc).filter((n) => n != null)
  const label = nums.length > 1 ? `PDF · ${nums.length} OC` : `OC #${nums[0] ?? ''}`
  const title = nums.length > 1
    ? `PDF con las OC ${nums.map((n) => `#${n}`).join(', ')}, una por hoja`
    : `Abrir PDF de la OC #${nums[0] ?? ''}`

  const abrir = async (e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (busy) return
    setBusy(true)
    try {
      await api.openSolicitudOcsPdf(solicitudId)
    } catch (err) {
      window.alert(err.message || 'No se pudo abrir el PDF de las órdenes de compra.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      data-testid="solicitud-ocs-pdf"
      title={busy ? 'Abriendo PDF…' : title}
      aria-label={title}
      disabled={busy}
      onClick={abrir}
      style={{
        ...ui.btnSecondary,
        padding: compact ? '2px 6px' : '4px 8px',
        fontSize: compact ? 'var(--cc-xs)' : 'var(--cc-sm)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span aria-hidden>{busy ? '⏳' : '📎'}</span>
      <span>{busy ? 'Abriendo PDF…' : label}</span>
    </button>
  )
}
