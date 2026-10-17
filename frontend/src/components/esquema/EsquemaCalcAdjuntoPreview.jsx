/**
 * Vista previa + descarga de memoria de cálculo (PDF) y gráfico isométrico (PNG).
 * Transversal a todos los módulos que muestran adjuntos del esquema.
 */
import { useEffect, useMemo } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'

function isPdfItem(item) {
  const mime = String(item?.mime || item?.mime_type || item?.source?.mime || item?.source?.mime_type || '').toLowerCase()
  const name = String(item?.nombre || item?.name || item?.label || item?.source?.nombre || '').toLowerCase()
  const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
  if (kind === 'memoria-calculo') return true
  if (mime.includes('pdf')) return true
  if (name.endsWith('.pdf')) return true
  return false
}

function resolveUrl(item) {
  return item?.url
    || item?.previewUrl
    || item?.data_uri
    || item?.dataUri
    || item?.blob_url
    || item?.source?.url
    || item?.source?.previewUrl
    || item?.source?.data_uri
    || item?.source?.dataUri
    || null
}

function downloadFromUrl(url, nombre, mime) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = nombre || (String(mime || '').includes('pdf') ? 'memoria_calculo.pdf' : 'grafico_isometrico.png')
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * @param {{
 *   t: object,
 *   open: boolean,
 *   item: object|null,
 *   siblings?: object[],
 *   onClose: () => void,
 * }} props
 */
export default function EsquemaCalcAdjuntoPreview({
  t,
  open,
  item,
  siblings = [],
  onClose,
}) {
  const theme = t || {}
  const list = useMemo(() => {
    const base = Array.isArray(siblings) && siblings.length ? siblings : (item ? [item] : [])
    return base.filter(Boolean)
  }, [siblings, item])

  const pdfItem = useMemo(
    () => list.find((x) => isPdfItem(x) || String(x?.kind || x?.source?.kind || '') === 'memoria-calculo') || (isPdfItem(item) ? item : null),
    [list, item],
  )
  const pngItem = useMemo(
    () => list.find((x) => {
      const kind = String(x?.kind || x?.source?.kind || '').toLowerCase()
      const mime = String(x?.mime || x?.source?.mime || '').toLowerCase()
      return kind === 'grafico-isometrico' || (mime.startsWith('image/') && !isPdfItem(x))
    }) || (!isPdfItem(item) ? item : null),
    [list, item],
  )

  const active = item || pdfItem || pngItem
  const activeIsPdf = isPdfItem(active)
  const url = resolveUrl(active)
  const pdfUrl = resolveUrl(pdfItem)
  const pngUrl = resolveUrl(pngItem)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !active) return null

  const btn = {
    ghost: {
      background: 'transparent',
      border: `1px solid ${theme.primary || '#0f766e'}`,
      color: theme.primary || '#0f766e',
      borderRadius: 8,
      padding: '10px 12px',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 13,
      minHeight: 44,
    },
    primary: {
      background: theme.primary || '#0f766e',
      border: 'none',
      color: '#fff',
      borderRadius: 8,
      padding: '10px 14px',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 13,
      minHeight: 44,
    },
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa memoria de cálculo"
      data-testid="esquema-calc-adjunto-preview"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.bgCard || '#fff',
          border: `1px solid ${theme.border || '#e2e8f0'}`,
          borderRadius: 14,
          width: 'min(960px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
          position: 'relative',
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: `1px solid ${theme.border || '#e2e8f0'}`,
          flexWrap: 'wrap',
        }}
        >
          <strong style={{ flex: 1, color: theme.text || '#0f172a', fontSize: 14 }}>
            {active?.label || active?.nombre || active?.source?.nombre || (activeIsPdf ? 'Memoria de cálculo' : 'Gráfico isométrico')}
          </strong>
          {pdfUrl ? (
            <button
              type="button"
              data-testid="esquema-calc-download-pdf"
              style={btn.primary}
              onClick={() => downloadFromUrl(
                pdfUrl,
                pdfItem?.nombre || pdfItem?.source?.nombre || 'memoria_calculo.pdf',
                'application/pdf',
              )}
            >
              Descargar PDF
            </button>
          ) : null}
          {pngUrl ? (
            <button
              type="button"
              data-testid="esquema-calc-download-png"
              style={btn.ghost}
              onClick={() => downloadFromUrl(
                pngUrl,
                pngItem?.nombre || pngItem?.source?.nombre || 'grafico_isometrico.png',
                'image/png',
              )}
            >
              Descargar PNG
            </button>
          ) : null}
          <button type="button" style={btn.ghost} onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>

        <div style={{
          flex: 1,
          minHeight: 280,
          maxHeight: 'min(70vh, 640px)',
          background: '#ffffff',
          overflow: 'auto',
        }}
        >
          {activeIsPdf && url ? (
            <iframe
              title="Vista previa PDF"
              src={url}
              style={{ width: '100%', height: 'min(70vh, 640px)', border: 'none', background: '#fff' }}
            />
          ) : url ? (
            <img
              src={url}
              alt={active?.label || 'Gráfico'}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: 'min(70vh, 640px)',
                margin: '0 auto',
                objectFit: 'contain',
                background: '#fff',
              }}
            />
          ) : (
            <div style={{ padding: 24, color: theme.textMuted || '#64748b', textAlign: 'center' }}>
              No hay vista previa disponible. Use Descargar si el archivo está en el registro.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { isPdfItem as isEsquemaCalcPdfItem, resolveUrl as resolveEsquemaCalcAdjuntoUrl }
