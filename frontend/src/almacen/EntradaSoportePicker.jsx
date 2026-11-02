/**
 * Soporte Remisión / Foto descargue — columna compacta:
 * etiqueta → (slot opcional, p. ej. N.º remisión) → orígenes → mini preview debajo.
 */
import { useRef } from 'react'
import { useAlmacenTheme } from './almacenShared'
import { fileFromClipboardApi, fileFromClipboardEvent, MSG_PEGADO_VACIO } from './entradaSoportePaste'

const PREVIEW_W = 72
const PREVIEW_H = 64

const btnIcon = (ui, { active = false } = {}) => ({
  ...ui.btnSecondary,
  flex: '0 0 auto',
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  minWidth: 46,
  minHeight: 42,
  padding: '2px 4px',
  fontSize: '0.62rem',
  fontWeight: 800,
  lineHeight: 1.05,
  background: active ? (ui.accentSoft || 'var(--cc-almacen-accent-soft)') : 'var(--cc-almacen-bg-card)',
  color: 'var(--cc-almacen-text)',
  borderColor: active ? 'var(--cc-almacen-accent)' : 'var(--cc-almacen-border)',
  WebkitUserSelect: 'none',
  userSelect: 'none',
})

export default function EntradaSoportePicker({
  kind, // 'remision' | 'material'
  file,
  previewUrl,
  busy,
  onPickFile,
  onPasteFile,
  onOpenGaleriaPlataforma,
  onOpenPreview,
  labelReady,
  labelEmpty,
  selected = false,
  onSelect,
  children,
}) {
  const ui = useAlmacenTheme()
  const camRef = useRef(null)
  const fileRef = useRef(null)
  const pasteRef = useRef(null)
  const isRemision = kind === 'remision'
  const isPdf = Boolean(file && ((file.type || '').includes('pdf') || /\.pdf$/i.test(file.name || '')))

  const clearPasteEl = () => {
    const el = pasteRef.current
    if (el) el.textContent = ''
  }

  const handleZonePaste = (e) => {
    onSelect?.(kind)
    const f = fileFromClipboardEvent(e)
    e.preventDefault()
    e.stopPropagation()
    clearPasteEl()
    if (!f) {
      onPasteFile?.(null, MSG_PEGADO_VACIO)
      return
    }
    onPasteFile?.(f)
  }

  const handlePegarClick = async () => {
    onSelect?.(kind)
    const r = await fileFromClipboardApi()
    if (!r.ok) {
      onPasteFile?.(null, r.message)
      return
    }
    onPasteFile?.(r.file)
  }

  return (
    <div
      data-testid={`entrada-soporte-${kind}`}
      role="group"
      onClick={() => onSelect?.(kind)}
      style={{
        display: 'grid',
        gap: 4,
        alignContent: 'start',
        outline: selected ? `2px solid var(--cc-almacen-accent, ${ui.accent})` : '1px solid var(--cc-almacen-border)',
        outlineOffset: 0,
        borderRadius: 10,
        padding: '6px 8px',
        background: 'var(--cc-almacen-input-bg)',
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div style={{
        fontWeight: 800,
        fontSize: '0.78rem',
        color: 'var(--cc-almacen-text)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
      >
        <span aria-hidden>{isRemision ? '📄' : '📷'}</span>
        {isRemision ? 'Remisión' : 'Descargue'}
        <span style={{ fontWeight: 500, color: 'var(--cc-almacen-text-muted)', fontSize: '0.7rem' }}>*</span>
      </div>

      {children ? (
        <div data-testid={`entrada-soporte-${kind}-extra`} style={{ minWidth: 0 }}>
          {children}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          data-testid={`entrada-soporte-${kind}-cam-input`}
          onChange={(e) => { void onPickFile?.(e) }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={isRemision ? 'image/*,application/pdf,.pdf' : 'image/*'}
          style={{ display: 'none' }}
          data-testid={`entrada-soporte-${kind}-file-input`}
          onChange={(e) => { void onPickFile?.(e) }}
        />
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          data-testid={`entrada-soporte-${kind}-gal-input`}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => { void onPickFile?.(e) }}
        />
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-camara`}
          style={btnIcon(ui)}
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); camRef.current?.click() }}
          title="Tomar foto ahora"
        >
          <span style={{ fontSize: '0.95rem' }} aria-hidden>📸</span>
          Cámara
        </button>
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-archivo`}
          style={btnIcon(ui)}
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          title={isRemision ? 'Foto o PDF del dispositivo' : 'Foto del dispositivo'}
        >
          <span style={{ fontSize: '0.95rem' }} aria-hidden>📁</span>
          Archivo
        </button>
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-galeria`}
          style={btnIcon(ui)}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(kind)
            onOpenGaleriaPlataforma?.(kind)
          }}
          title="Imágenes ya cargadas en Almacén (no del dispositivo)"
        >
          <span style={{ fontSize: '0.95rem' }} aria-hidden>🖼</span>
          Galería
        </button>
        <div
          data-testid={`entrada-soporte-${kind}-pegar`}
          style={{ position: 'relative', ...btnIcon(ui, { active: selected }), padding: 0 }}
          title="Pegar del portapapeles (mantener o toque)"
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              pointerEvents: 'none',
              fontSize: '0.62rem',
              fontWeight: 800,
              color: 'var(--cc-almacen-text)',
            }}
          >
            <span style={{ fontSize: '0.95rem' }}>📋</span>
            Pegar
          </div>
          <div
            ref={pasteRef}
            role="button"
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            aria-label={isRemision ? 'Pegar remisión' : 'Pegar foto del descargue'}
            onFocus={() => onSelect?.(kind)}
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(kind)
              void handlePegarClick()
            }}
            onPaste={handleZonePaste}
            onInput={clearPasteEl}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void handlePegarClick()
              }
            }}
            style={{
              position: 'relative',
              zIndex: 1,
              minWidth: 46,
              minHeight: 42,
              outline: 'none',
              color: 'transparent',
              caretColor: 'transparent',
              cursor: 'pointer',
              WebkitUserSelect: 'text',
              userSelect: 'text',
            }}
          />
        </div>
      </div>

      <button
        type="button"
        data-testid={file ? `entrada-soporte-${kind}-preview` : `entrada-soporte-${kind}-falta`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(kind)
          if (file) onOpenPreview?.(kind)
        }}
        style={{
          width: PREVIEW_W,
          height: PREVIEW_H,
          minWidth: PREVIEW_W,
          minHeight: PREVIEW_H,
          maxWidth: PREVIEW_W,
          maxHeight: PREVIEW_H,
          borderRadius: 8,
          border: `2px solid ${file ? 'var(--cc-almacen-border)' : 'var(--cc-almacen-warn-border, #d97706)'}`,
          background: 'var(--cc-almacen-bg-card)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          fontSize: '0.62rem',
          fontWeight: 800,
          textAlign: 'center',
          padding: 2,
          cursor: file ? 'pointer' : 'default',
          color: file
            ? 'var(--cc-almacen-ok-text, #15803d)'
            : 'var(--cc-almacen-warn-text, #b45309)',
          boxSizing: 'border-box',
          justifySelf: 'start',
        }}
        title={file ? `${labelReady || 'Listo'} · tocar para ampliar` : (labelEmpty || 'Falta')}
        aria-label={file ? 'Ver vista previa del soporte' : (labelEmpty || 'Falta soporte')}
      >
        {file ? (
          isPdf ? (
            <>
              <span aria-hidden style={{ fontSize: '1.2rem' }}>📎</span>
              <span style={{
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: '0 2px',
              }}
              >
                {file.name || 'PDF'}
              </span>
            </>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={labelReady || kind}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>✓</span>
          )
        ) : (
          <span>Falta</span>
        )}
      </button>
    </div>
  )
}
