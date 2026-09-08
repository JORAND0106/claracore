/**
 * Carrusel único de adjuntos (foto, gráfico, esquema).
 * object-fit: contain para no recortar el rotulado (márgenes + título).
 */
export default function AdjuntosMediaSlider({
  t,
  items = [],
  index = 0,
  onIndexChange,
  onClickItem,
  emptyLabel = 'Sin adjuntos',
  height = 200,
  aspectRatio = null,
  compact = false,
  renderImage = null,
  overlay = null,
}) {
  const lista = Array.isArray(items) ? items.filter((x) => x && (x.url || x.source)) : []
  const safeIdx = Math.min(Math.max(0, index), Math.max(0, lista.length - 1))
  const actual = lista[safeIdx] || null
  const theme = t || {}
  const go = (dir) => {
    if (!lista.length || typeof onIndexChange !== 'function') return
    const next = Math.min(lista.length - 1, Math.max(0, safeIdx + dir))
    if (next !== safeIdx) onIndexChange(next)
  }

  if (!actual) {
    return (
      <div
        style={{
          minHeight: compact ? 56 : height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.textMuted || '#64748b',
          background: theme.bg || '#f8fafc',
          borderRadius: compact ? 6 : 8,
          border: `1px dashed ${theme.border || '#cbd5e1'}`,
          fontSize: compact ? 11 : 'var(--cc-sm)',
          padding: 8,
          textAlign: 'center',
        }}
      >
        {emptyLabel}
      </div>
    )
  }

  const stageStyle = {
    position: 'relative',
    width: '100%',
    height: aspectRatio ? undefined : (compact ? 72 : height),
    aspectRatio: aspectRatio || undefined,
    background: '#fff',
    borderRadius: compact ? 6 : 8,
    overflow: 'hidden',
    border: `1px solid ${theme.border || '#e2e8f0'}`,
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={stageStyle}>
        <button
          type="button"
          onClick={() => onClickItem?.(actual, safeIdx)}
          disabled={!onClickItem}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            padding: 0,
            border: 'none',
            background: '#fff',
            cursor: onClickItem ? 'pointer' : 'default',
          }}
          title={actual.label || 'Adjunto'}
        >
          {typeof renderImage === 'function' ? (
            renderImage(actual, safeIdx)
          ) : (
            <img
              src={actual.url}
              alt={actual.label || 'Adjunto'}
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                display: 'block',
                background: '#fff',
              }}
            />
          )}
        </button>
        {lista.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              disabled={safeIdx <= 0}
              onClick={(e) => { e.stopPropagation(); go(-1) }}
              style={{
                position: 'absolute',
                left: compact ? 2 : 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: compact ? 20 : 28,
                height: compact ? 20 : 28,
                fontSize: compact ? 12 : 16,
                lineHeight: 1,
                cursor: safeIdx <= 0 ? 'default' : 'pointer',
                opacity: safeIdx <= 0 ? 0.35 : 1,
              }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              disabled={safeIdx >= lista.length - 1}
              onClick={(e) => { e.stopPropagation(); go(1) }}
              style={{
                position: 'absolute',
                right: compact ? 2 : 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: compact ? 20 : 28,
                height: compact ? 20 : 28,
                fontSize: compact ? 12 : 16,
                lineHeight: 1,
                cursor: safeIdx >= lista.length - 1 ? 'default' : 'pointer',
                opacity: safeIdx >= lista.length - 1 ? 0.35 : 1,
              }}
            >
              ›
            </button>
            <div
              style={{
                position: 'absolute',
                bottom: compact ? 4 : 8,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                borderRadius: 12,
                padding: compact ? '1px 7px' : '2px 10px',
                fontSize: compact ? 10 : 'var(--cc-caption)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {safeIdx + 1} / {lista.length}
              {actual.label ? ` · ${actual.label}` : ''}
            </div>
          </>
        )}
        {lista.length === 1 && actual.label && (
          <div
            style={{
              position: 'absolute',
              bottom: compact ? 4 : 8,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.45)',
              color: '#fff',
              borderRadius: 12,
              padding: compact ? '1px 7px' : '2px 10px',
              fontSize: compact ? 10 : 'var(--cc-caption)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {actual.label}
          </div>
        )}
        {typeof overlay === 'function' ? overlay(actual, safeIdx) : overlay}
      </div>
    </div>
  )
}
