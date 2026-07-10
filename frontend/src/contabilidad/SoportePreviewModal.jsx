import { useEffect, useRef } from 'react'

export default function SoportePreviewModal({
  t,
  open,
  loading,
  error,
  nombre,
  mime,
  blobUrl,
  onClose,
  onDownload,
  onReplace,
  replaceBusy = false,
}) {
  const replaceRef = useRef(null)
  const cameraRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const isPdf = (mime || '').includes('pdf')
  const isImage = (mime || '').startsWith('image/')
  const btnGhost = {
    background: 'transparent',
    border: `1px solid ${t.primary}`,
    color: t.primary,
    borderRadius: 8,
    padding: '10px 12px',
    fontWeight: 600,
    cursor: replaceBusy ? 'wait' : 'pointer',
    fontSize: 'var(--cc-sm)',
    minHeight: 44,
    opacity: replaceBusy ? 0.7 : 1,
  }
  const btnPrimary = {
    background: t.primary,
    border: 'none',
    color: '#fff',
    borderRadius: 8,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 'var(--cc-sm)',
    minHeight: 44,
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa del soporte"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 13000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          width: 'min(920px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            width: 44,
            height: 44,
            borderRadius: 22,
            border: `1px solid ${t.border}`,
            background: t.bgCard,
            color: t.text,
            fontSize: 22,
            fontWeight: 700,
            cursor: 'pointer',
            lineHeight: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          ×
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '14px 56px 12px 16px',
          borderBottom: `1px solid ${t.border}`,
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            fontWeight: 700,
            color: t.text,
            fontSize: 'var(--cc-sm)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingRight: 8,
            maxWidth: '100%',
          }}>
            {nombre || 'Soporte adjunto'}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          minHeight: 180,
          background: t.bg,
          WebkitOverflowScrolling: 'touch',
        }}>
          {loading && <div style={{ color: t.textMuted, textAlign: 'center', padding: 40 }}>Cargando vista previa…</div>}
          {error && <div style={{ color: '#EF4444', textAlign: 'center', padding: 40 }}>{error}</div>}
          {!loading && !error && blobUrl && isPdf && (
            <iframe
              title={nombre || 'PDF'}
              src={blobUrl}
              style={{
                width: '100%',
                height: 'min(55vh, 520px)',
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                background: '#fff',
              }}
            />
          )}
          {!loading && !error && blobUrl && isImage && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={blobUrl}
                alt={nombre || 'Soporte'}
                style={{
                  maxWidth: '100%',
                  maxHeight: 'min(55vh, 520px)',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                }}
              />
            </div>
          )}
          {!loading && !error && blobUrl && !isPdf && !isImage && (
            <div style={{ textAlign: 'center', color: t.textMuted, padding: 40 }}>
              Vista previa no disponible para este formato. Use descargar.
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '12px 16px',
          borderTop: `1px solid ${t.border}`,
          flexShrink: 0,
          background: t.bgCard,
        }}>
          {blobUrl && (
            <button type="button" onClick={onDownload} style={btnGhost}>
              ⬇ Descargar
            </button>
          )}
          {typeof onReplace === 'function' && (
            <>
              <button
                type="button"
                style={btnGhost}
                disabled={replaceBusy}
                onClick={() => cameraRef.current?.click()}
              >
                📷 Nueva foto
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={replaceBusy}
                onClick={() => replaceRef.current?.click()}
              >
                🔁 Reemplazar imagen
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onReplace(f, { fromCamera: true })
                }}
              />
              <input
                ref={replaceRef}
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onReplace(f, { fromCamera: false })
                }}
              />
            </>
          )}
          <button type="button" onClick={onClose} style={{ ...btnPrimary, marginLeft: 'auto' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
