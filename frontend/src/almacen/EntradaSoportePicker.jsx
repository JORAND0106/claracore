/**
 * Soporte Remisión / Foto descargue — fila compacta:
 * Cámara | Archivo (dispositivo) | Galería módulo | Pegar.
 */
import { useRef } from 'react'
import { useAlmacenTheme } from './almacenShared'
import { fileFromClipboardApi, fileFromClipboardEvent, MSG_PEGADO_VACIO } from './entradaSoportePaste'

const btnIcon = (ui, { active = false, flex = '0 0 auto' } = {}) => ({
  ...ui.btnSecondary,
  flex,
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  minWidth: 52,
  minHeight: 48,
  padding: '4px 6px',
  fontSize: '0.68rem',
  fontWeight: 800,
  lineHeight: 1.1,
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
  /** (file: File|null, message?: string) */
  onPasteFile,
  /** () => void — abre galería del módulo (no dispositivo) */
  onOpenGaleriaPlataforma,
  labelReady,
  labelEmpty,
  selected = false,
  onSelect,
  /** Slot opcional a la izquierda (p. ej. N.º remisión) */
  leading = null,
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
        gridTemplateColumns: leading ? 'minmax(120px, 1.1fr) minmax(0, 1.4fr) auto' : 'minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        outline: selected ? `2px solid var(--cc-almacen-accent, ${ui.accent})` : '1px solid var(--cc-almacen-border)',
        outlineOffset: 0,
        borderRadius: 10,
        padding: '6px 8px',
        background: 'var(--cc-almacen-input-bg)',
        minHeight: 56,
      }}
    >
      {leading}

      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <div style={{
          fontWeight: 800,
          fontSize: '0.82rem',
          color: 'var(--cc-almacen-text)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
        >
          <span aria-hidden>{isRemision ? '📄' : '📷'}</span>
          {isRemision ? 'Remisión' : 'Descargue'}
          <span style={{ fontWeight: 500, color: 'var(--cc-almacen-text-muted)', fontSize: '0.75rem' }}>*</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', alignItems: 'stretch' }}>
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
          {/* Compat tests: galería dispositivo ya no existe; Archivo cubre fotos del dispositivo. */}
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
            <span style={{ fontSize: '1.05rem' }} aria-hidden>📸</span>
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
            <span style={{ fontSize: '1.05rem' }} aria-hidden>📁</span>
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
            <span style={{ fontSize: '1.05rem' }} aria-hidden>🖼</span>
            Módulo
          </button>
          {/* Pegar compacto: rótulo + contentEditable vacío (menú Pegar iPad) + click = clipboard.read */}
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
                fontSize: '0.68rem',
                fontWeight: 800,
                color: 'var(--cc-almacen-text)',
              }}
            >
              <span style={{ fontSize: '1.05rem' }}>📋</span>
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
                minWidth: 52,
                minHeight: 48,
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
      </div>

      <div
        data-testid={file ? `entrada-soporte-${kind}-preview` : `entrada-soporte-${kind}-falta`}
        style={{
          width: 56,
          height: 48,
          borderRadius: 8,
          border: `1px solid var(--cc-almacen-border)`,
          background: 'var(--cc-almacen-bg-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          fontSize: '0.65rem',
          fontWeight: 800,
          textAlign: 'center',
          padding: 2,
          color: file
            ? 'var(--cc-almacen-ok-text, #15803d)'
            : 'var(--cc-almacen-warn-text, #b45309)',
        }}
        title={file ? (labelReady || 'Listo') : (labelEmpty || 'Falta')}
      >
        {file ? (
          isPdf ? (
            <span aria-hidden>📎</span>
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
      </div>
    </div>
  )
}
