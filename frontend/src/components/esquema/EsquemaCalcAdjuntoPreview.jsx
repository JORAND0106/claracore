/**
 * Vista previa + descarga de memoria de cálculo (PNG lado a lado),
 * gráfico isométrico y esquema/fotos. Transversal a todos los módulos.
 * Compat: PDF antiguos de memoria siguen abriéndose si aparecen en el historial.
 */
import { useEffect, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'

function isMemoriaPngItem(item) {
  const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
  const mime = String(item?.mime || item?.mime_type || item?.source?.mime || '').toLowerCase()
  const name = String(item?.nombre || item?.name || item?.label || item?.source?.nombre || '').toLowerCase()
  if (kind === 'memoria-calculo' && (mime.startsWith('image/') || name.endsWith('.png'))) return true
  if (kind === 'memoria-calculo' && !mime.includes('pdf') && !name.endsWith('.pdf')) return true
  return false
}

function isPdfItem(item) {
  const mime = String(item?.mime || item?.mime_type || item?.source?.mime || item?.source?.mime_type || '').toLowerCase()
  const name = String(item?.nombre || item?.name || item?.label || item?.source?.nombre || '').toLowerCase()
  const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
  // Memoria nueva es PNG; solo PDF legacy cuenta como PDF.
  if (kind === 'memoria-calculo' && isMemoriaPngItem(item)) return false
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

function dataUriToBlob(dataUri) {
  const raw = String(dataUri || '')
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(raw)
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

function toObjectUrl(url) {
  if (!url) return { href: null, revoke: null }
  if (String(url).startsWith('blob:') || String(url).startsWith('http')) {
    return { href: url, revoke: null }
  }
  if (String(url).startsWith('data:')) {
    const blob = dataUriToBlob(url)
    if (!blob) return { href: url, revoke: null }
    const href = URL.createObjectURL(blob)
    return { href, revoke: href }
  }
  return { href: url, revoke: null }
}

function downloadFromUrl(url, nombre, mime) {
  if (!url) return
  const { href, revoke } = toObjectUrl(url)
  if (!href) return
  const a = document.createElement('a')
  a.href = href
  a.download = nombre || (String(mime || '').includes('pdf') ? 'memoria_calculo.pdf' : 'adjunto.png')
  a.rel = 'noopener'
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 60_000)
}

function openInNewTab(url) {
  if (!url) return
  const { href, revoke } = toObjectUrl(url)
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 120_000)
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

  // El slide abierto manda: no buscar el «primer PNG» del carrusel completo
  // (eso descargaba el gráfico 1/2 al previsualizar el 3.º).
  const active = item || list[0] || null
  const activeIsPdf = isPdfItem(active)
  const rawUrl = resolveUrl(active)

  /** Pares PDF/PNG solo de memoria de cálculo relacionada con el ítem activo. */
  const pdfItem = useMemo(() => {
    if (isPdfItem(active)) return active
    return list.find((x) => x !== active && isPdfItem(x)) || null
  }, [list, active])
  const pngItem = useMemo(() => {
    if (active && !isPdfItem(active) && resolveUrl(active)) return active
    return list.find((x) => {
      if (x === active) return false
      const kind = String(x?.kind || x?.source?.kind || '').toLowerCase()
      const mime = String(x?.mime || x?.mime_type || x?.source?.mime || '').toLowerCase()
      return isMemoriaPngItem(x)
        || kind === 'grafico-isometrico'
        || kind === 'esquema'
        || (mime.startsWith('image/') && !isPdfItem(x))
    }) || null
  }, [list, active])
  const pdfUrl = resolveUrl(pdfItem)
  const pngUrl = resolveUrl(pngItem)

  const [viewUrl, setViewUrl] = useState(null)

  useEffect(() => {
    if (!open || !rawUrl) {
      setViewUrl(null)
      return undefined
    }
    if (activeIsPdf && String(rawUrl).startsWith('data:')) {
      const blob = dataUriToBlob(rawUrl)
      if (blob) {
        const u = URL.createObjectURL(blob)
        setViewUrl(u)
        return () => URL.revokeObjectURL(u)
      }
    }
    setViewUrl(rawUrl)
    return undefined
  }, [open, rawUrl, activeIsPdf])

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

  const downloadName = active?.nombre || active?.label || active?.source?.nombre
    || (activeIsPdf ? 'memoria_calculo.pdf' : 'esquema.png')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de adjunto"
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
            {active?.label || active?.nombre || active?.source?.nombre || (activeIsPdf ? 'Memoria de cálculo' : 'Adjunto')}
          </strong>
          {activeIsPdf && (viewUrl || pdfUrl) ? (
            <button
              type="button"
              data-testid="esquema-calc-open-pdf"
              style={btn.ghost}
              onClick={() => openInNewTab(viewUrl || pdfUrl)}
            >
              Abrir PDF
            </button>
          ) : null}
          {rawUrl ? (
            <button
              type="button"
              data-testid="esquema-calc-download-file"
              style={btn.primary}
              onClick={() => downloadFromUrl(
                rawUrl,
                downloadName,
                activeIsPdf ? 'application/pdf' : 'image/png',
              )}
            >
              Descargar
            </button>
          ) : null}
          {/* Alternos de la misma memoria de cálculo (no otros slides del carrusel). */}
          {pdfUrl && pdfUrl !== rawUrl ? (
            <button
              type="button"
              data-testid="esquema-calc-download-pdf"
              style={btn.ghost}
              onClick={() => downloadFromUrl(
                pdfUrl,
                pdfItem?.nombre || pdfItem?.source?.nombre || 'memoria_calculo.pdf',
                'application/pdf',
              )}
            >
              Descargar PDF
            </button>
          ) : null}
          {pngUrl && pngUrl !== rawUrl ? (
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
          {activeIsPdf && viewUrl ? (
            <object
              data={viewUrl}
              type="application/pdf"
              title="Vista previa PDF"
              style={{ width: '100%', height: 'min(70vh, 640px)', border: 'none', background: '#fff' }}
            >
              <iframe
                title="Vista previa PDF"
                src={viewUrl}
                style={{ width: '100%', height: 'min(70vh, 640px)', border: 'none', background: '#fff' }}
              />
            </object>
          ) : viewUrl || rawUrl ? (
            <img
              src={viewUrl || rawUrl}
              alt={active?.label || 'Adjunto'}
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
              No hay vista previa disponible. Use Descargar o Abrir PDF si el archivo está en el registro.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { isPdfItem as isEsquemaCalcPdfItem, resolveUrl as resolveEsquemaCalcAdjuntoUrl }
