import { useEffect } from 'react'

export default function SoportePreviewModal({ t, open, loading, error, nombre, mime, blobUrl, onClose, onDownload }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isPdf = (mime || '').includes('pdf')
  const isImage = (mime || '').startsWith('image/')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa del soporte"
      style={{
        position: 'fixed', inset: 0, zIndex: 13000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          width: 'min(920px, 96vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${t.border}`, gap: 12,
        }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombre || 'Soporte adjunto'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {blobUrl && (
              <button
                type="button"
                onClick={onDownload}
                style={{
                  background: 'transparent', border: `1px solid ${t.primary}`, color: t.primary,
                  borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
                }}
              >
                ⬇ Descargar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: t.primary, border: 'none', color: '#fff',
                borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, minHeight: 320, background: t.bg }}>
          {loading && <div style={{ color: t.textMuted, textAlign: 'center', padding: 40 }}>Cargando vista previa…</div>}
          {error && <div style={{ color: '#EF4444', textAlign: 'center', padding: 40 }}>{error}</div>}
          {!loading && !error && blobUrl && isPdf && (
            <iframe
              title={nombre || 'PDF'}
              src={blobUrl}
              style={{ width: '100%', height: 'min(70vh, 640px)', border: `1px solid ${t.border}`, borderRadius: 8, background: '#fff' }}
            />
          )}
          {!loading && !error && blobUrl && isImage && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={blobUrl}
                alt={nombre || 'Soporte'}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, border: `1px solid ${t.border}` }}
              />
            </div>
          )}
          {!loading && !error && blobUrl && !isPdf && !isImage && (
            <div style={{ textAlign: 'center', color: t.textMuted, padding: 40 }}>
              Vista previa no disponible para este formato. Use descargar.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
