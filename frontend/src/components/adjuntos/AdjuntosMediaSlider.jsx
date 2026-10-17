/**
 * Carrusel único de adjuntos (foto, gráfico, esquema, memoria de cálculo).
 * object-fit: contain para no recortar el rotulado (márgenes + título).
 * PDF / memoria-calculo: tarjeta + vista previa y descarga al clic.
 */
import { useState } from 'react'
import { isEsquemaAdjunto, isEsquemaCalcAdjunto, isPdfAdjunto } from './adjuntosMedia'
import EsquemaCalcAdjuntoPreview, { resolveEsquemaCalcAdjuntoUrl } from '../esquema/EsquemaCalcAdjuntoPreview'

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
  /** Opcional: resuelve URL async (p. ej. Bitácora blob_path autenticado). */
  resolveItemUrl = null,
}) {
  const [preview, setPreview] = useState(null)
  const lista = Array.isArray(items) ? items.filter((x) => x && (x.url || x.source)) : []
  const safeIdx = Math.min(Math.max(0, index), Math.max(0, lista.length - 1))
  const actual = lista[safeIdx] || null
  const theme = t || {}
  const go = (dir) => {
    if (!lista.length || typeof onIndexChange !== 'function') return
    const next = Math.min(lista.length - 1, Math.max(0, safeIdx + dir))
    if (next !== safeIdx) onIndexChange(next)
  }

  const openItem = async (item, idx) => {
    // Vista previa + descarga unificada (PDF memoria, PNG esquema/gráfico, fotos).
    // En iPad el iframe data: PDF falla; el modal convierte a blob: y ofrece Abrir.
    if (item?.url || item?.source || isEsquemaCalcAdjunto(item) || isPdfAdjunto(item) || isEsquemaAdjunto(item)) {
      let enriched = item
      if (!resolveEsquemaCalcAdjuntoUrl(item) && typeof resolveItemUrl === 'function') {
        try {
          const u = await resolveItemUrl(item, idx)
          if (u) enriched = { ...item, url: u, previewUrl: u }
        } catch { /* preview sin URL */ }
      }
      setPreview({ item: enriched, siblings: lista })
      return
    }
    if (typeof onClickItem === 'function') onClickItem(item, idx)
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

  const showPdfTile = isPdfAdjunto(actual)
  // Cualquier slide con URL/source se puede abrir (esquema PNG, memoria PDF, fotos).
  const clickable = !!(actual && (actual.url || actual.source || typeof onClickItem === 'function'))

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={stageStyle}>
        <button
          type="button"
          onClick={() => openItem(actual, safeIdx)}
          disabled={!clickable}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            padding: 0,
            border: 'none',
            background: '#fff',
            cursor: clickable ? 'pointer' : 'default',
          }}
          title={actual.label || 'Adjunto'}
          data-testid="adjuntos-media-slide"
        >
          {showPdfTile ? (
            <div
              data-testid="adjuntos-media-pdf-tile"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
                color: '#0f172a',
                padding: 12,
                boxSizing: 'border-box',
              }}
            >
              <div style={{
                width: compact ? 36 : 48,
                height: compact ? 44 : 58,
                borderRadius: 6,
                border: '2px solid #0f766e',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: compact ? 10 : 12,
                color: '#0f766e',
              }}
              >
                PDF
              </div>
              <div style={{
                fontSize: compact ? 10 : 12,
                fontWeight: 700,
                textAlign: 'center',
                maxWidth: '90%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              >
                {actual.label || 'Memoria de cálculo'}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>Tocar para vista previa / descargar</div>
            </div>
          ) : typeof renderImage === 'function' ? (
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
        {lista.length === 1 && actual.label && !showPdfTile && (
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

      <EsquemaCalcAdjuntoPreview
        t={theme}
        open={!!preview}
        item={preview?.item || null}
        siblings={preview?.siblings || []}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}
