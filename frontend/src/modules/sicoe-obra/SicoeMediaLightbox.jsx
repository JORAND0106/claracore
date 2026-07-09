import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Visor de foto/gráfico con estilo ClaraCore: encabezado, meta del registro e imagen.
 * Solo presentación — no altera datos del registro.
 */
export default function SicoeMediaLightbox({
  open,
  items = [],
  index = 0,
  onClose,
  onIndexChange,
  t,
  title,
  meta = null,
}) {
  const lista = Array.isArray(items) ? items.filter((x) => x?.url) : []
  const safeIdx = Math.min(Math.max(0, index), Math.max(0, lista.length - 1))
  const actual = lista[safeIdx] || null

  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const pinchRef = useRef(null)
  const panRef = useRef(null)
  const swipeRef = useRef(null)

  const theme = t || {
    bgCard: '#0F1923',
    bg: '#15202B',
    border: '#334155',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    primary: '#0EA5A8',
  }

  useEffect(() => {
    if (!open) return
    setScale(1)
    setTx(0)
    setTy(0)
  }, [open, safeIdx])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const go = useCallback((dir) => {
    if (!lista.length || typeof onIndexChange !== 'function') return
    const next = Math.min(lista.length - 1, Math.max(0, safeIdx + dir))
    if (next !== safeIdx) onIndexChange(next)
  }, [lista.length, onIndexChange, safeIdx])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, go])

  if (!open || !actual) return null

  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDist: dist(e.touches[0], e.touches[1]),
        startScale: scale,
      }
      panRef.current = null
      swipeRef.current = null
      return
    }
    if (e.touches.length === 1) {
      const t0 = e.touches[0]
      if (scale > 1.05) {
        panRef.current = { x: t0.clientX, y: t0.clientY, tx, ty }
        swipeRef.current = null
      } else {
        swipeRef.current = { x: t0.clientX, y: t0.clientY, t: Date.now() }
        panRef.current = null
      }
    }
  }

  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const ratio = dist(e.touches[0], e.touches[1]) / Math.max(1, pinchRef.current.startDist)
      setScale(Math.min(4, Math.max(1, pinchRef.current.startScale * ratio)))
      return
    }
    if (e.touches.length === 1 && panRef.current && scale > 1.05) {
      e.preventDefault()
      const t0 = e.touches[0]
      setTx(panRef.current.tx + (t0.clientX - panRef.current.x))
      setTy(panRef.current.ty + (t0.clientY - panRef.current.y))
    }
  }

  const onTouchEnd = (e) => {
    if (pinchRef.current && e.touches.length < 2) {
      pinchRef.current = null
      if (scale < 1.05) {
        setScale(1)
        setTx(0)
        setTy(0)
      }
    }
    if (panRef.current && e.touches.length === 0) panRef.current = null
    if (swipeRef.current && e.changedTouches.length === 1 && scale <= 1.05) {
      const t0 = e.changedTouches[0]
      const dx = t0.clientX - swipeRef.current.x
      const dy = t0.clientY - swipeRef.current.y
      const elapsed = Date.now() - swipeRef.current.t
      swipeRef.current = null
      if (elapsed < 600) {
        if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          onClose?.()
          return
        }
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? 1 : -1)
        }
      }
    }
  }

  const encabezado = title
    || (actual.label ? String(actual.label) : null)
    || (meta?.numero_registro != null ? `Registro #${meta.numero_registro}` : 'Visor de imagen')

  const metaRows = [
    { label: 'Ítem', value: meta?.item },
    { label: 'Descripción', value: meta?.descripcion },
    { label: 'Unidad', value: meta?.unidad },
    { label: 'Vlr. unitario', value: meta?.vlrUnitario },
  ].filter((row) => row.value != null && String(row.value).trim() !== '')

  return (
    <div
      className="cc-sicoe-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={encabezado}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="cc-sicoe-lightbox-panel"
        style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="cc-sicoe-lightbox-header"
          style={{
            borderBottom: `1px solid ${theme.border}`,
            background: `color-mix(in srgb, ${theme.primary} 14%, ${theme.bgCard})`,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: theme.primary, lineHeight: 1.3 }}>
              {encabezado}
            </div>
            {lista.length > 1 && (
              <div style={{ fontSize: 'var(--cc-caption)', color: theme.textMuted, marginTop: 2 }}>
                {safeIdx + 1} / {lista.length}
                {actual.label ? ` · ${actual.label}` : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            className="cc-sicoe-lightbox-close"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            ✕
          </button>
        </div>

        {metaRows.length > 0 && (
          <div
            className="cc-sicoe-lightbox-meta"
            style={{
              borderBottom: `1px solid ${theme.border}`,
              background: theme.bg,
            }}
          >
            {metaRows.map((row) => (
              <div key={row.label} className="cc-sicoe-lightbox-meta-item">
                <span style={{ color: theme.textMuted }}>{row.label}</span>
                <span
                  style={{ color: theme.text }}
                  title={String(row.value)}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="cc-sicoe-lightbox-body">
          {lista.length > 1 && (
            <>
              <button
                type="button"
                className="cc-sicoe-lightbox-nav cc-sicoe-lightbox-prev"
                aria-label="Anterior"
                disabled={safeIdx <= 0}
                onClick={() => go(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="cc-sicoe-lightbox-nav cc-sicoe-lightbox-next"
                aria-label="Siguiente"
                disabled={safeIdx >= lista.length - 1}
                onClick={() => go(1)}
              >
                ›
              </button>
            </>
          )}

          <div className="cc-sicoe-lightbox-stage">
            <img
              src={actual.url}
              alt={actual.label || 'Imagen'}
              referrerPolicy="no-referrer"
              draggable={false}
              style={{
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: pinchRef.current || panRef.current ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
