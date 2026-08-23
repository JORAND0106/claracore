import { useEffect, useState } from 'react'
import { imagenSrc, openImageInNewTab } from './imagenUtils'

/**
 * Miniatura con carga autenticada cuando solo hay blob_path
 * (el backend ya no embebe data_uri en list/save).
 *
 * @param {(payload: { src: string, im: object }) => void} [onZoom]
 *   Si se define, al hacer clic abre zoom in-app en lugar de nueva pestaña.
 */
export default function BitacoraAuthThumb({
  api,
  im,
  width = 36,
  height = 28,
  style = {},
  interactive = true,
  onZoom,
}) {
  const direct = imagenSrc(im)
  const [src, setSrc] = useState(direct)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    setSrc(direct)
    setFailed(false)
    if (direct || !im?.blob_path || !api?.getBitacoraMediaBlob) {
      return () => { cancelled = true }
    }
    ;(async () => {
      try {
        const blob = await api.getBitacoraMediaBlob(im.blob_path)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [api, direct, im?.blob_path])

  const frame = {
    width, height, display: 'block', ...style,
  }

  if (!src) {
    return (
      <div style={{
        fontSize: 9, color: '#94a3b8', display: 'grid', placeItems: 'center',
        ...frame,
      }}>
        {failed ? '!' : '…'}
      </div>
    )
  }

  const img = (
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )

  if (!interactive) {
    return <div style={frame}>{img}</div>
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        const payload = {
          src,
          im: {
            ...im,
            data_uri: String(src).startsWith('data:') ? src : undefined,
            url: String(src).startsWith('blob:') || String(src).startsWith('http') ? src : im?.url,
          },
        }
        if (typeof onZoom === 'function') {
          onZoom(payload)
          return
        }
        openImageInNewTab(payload.im)
      }}
      style={{
        ...frame, padding: 0, border: 'none', cursor: 'zoom-in', background: 'transparent',
      }}
    >
      {img}
    </button>
  )
}
