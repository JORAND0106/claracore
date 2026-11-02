/**
 * Selector de soporte Remisión / Foto descargue:
 * cámara, galería, archivo, zona «Pegar aquí» (iPad) y botón Pegar.
 */
import { useRef } from 'react'
import { useAlmacenTheme } from './almacenShared'
import { fileFromClipboardApi, fileFromClipboardEvent, MSG_PEGADO_VACIO } from './entradaSoportePaste'

const btnMini = (ui, active) => ({
  ...ui.btnSecondary,
  minHeight: 40,
  padding: '6px 10px',
  fontSize: 'var(--cc-xs, 0.8rem)',
  fontWeight: 700,
  flex: 1,
  background: active ? (ui.accentSoft || 'var(--cc-almacen-accent-soft)') : undefined,
  color: 'var(--cc-almacen-text)',
  borderColor: 'var(--cc-almacen-border)',
})

export default function EntradaSoportePicker({
  kind, // 'remision' | 'material'
  file,
  previewUrl,
  busy,
  onPickFile,
  /** (file: File) => void — pegado desde zona o botón de ESTE soporte */
  onPasteFile,
  labelReady,
  labelEmpty,
  selected = false,
  onSelect,
}) {
  const ui = useAlmacenTheme()
  const camRef = useRef(null)
  const galRef = useRef(null)
  const fileRef = useRef(null)
  const pasteZoneRef = useRef(null)
  const isRemision = kind === 'remision'
  const isPdf = Boolean(file && ((file.type || '').includes('pdf') || /\.pdf$/i.test(file.name || '')))

  /** Evita que contentEditable deje texto/imagen nativa; el rótulo vive en capa no editable. */
  const clearPasteZone = () => {
    const el = pasteZoneRef.current
    if (el) el.textContent = ''
  }

  const handleZonePaste = (e) => {
    onSelect?.(kind)
    const f = fileFromClipboardEvent(e)
    e.preventDefault()
    e.stopPropagation()
    clearPasteZone()
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
      style={{
        display: 'grid',
        gap: 6,
        outline: selected ? `2px solid var(--cc-almacen-accent, ${ui.accent})` : '1px solid transparent',
        outlineOffset: 2,
        borderRadius: 10,
        padding: 4,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--cc-almacen-text)' }}>
        {isRemision ? '📄 Remisión' : '📷 Foto del descargue'}
        <span style={{ fontWeight: 500, color: 'var(--cc-almacen-text-muted)' }}> (obligatoria)</span>
      </div>

      {/* Zona visible: contentEditable vacío + rótulo en capa; iPad Safari muestra menú «Pegar». */}
      <div
        data-testid={`entrada-soporte-${kind}-pegar-zona`}
        onClick={() => {
          onSelect?.(kind)
          pasteZoneRef.current?.focus?.()
        }}
        style={{
          position: 'relative',
          minHeight: 72,
          border: `2px dashed ${selected ? 'var(--cc-almacen-accent)' : 'var(--cc-almacen-border)'}`,
          borderRadius: 10,
          background: 'var(--cc-almacen-input-bg)',
          cursor: 'text',
        }}
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
            gap: 4,
            padding: '12px 10px',
            pointerEvents: 'none',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--cc-almacen-text-muted)',
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>📋</span>
          <span style={{ color: 'var(--cc-almacen-text)' }}>Pegar aquí</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {isRemision
              ? 'Mantenga y Pegar · imagen o PDF'
              : 'Mantenga y Pegar · imagen'}
          </span>
        </div>
        <div
          ref={pasteZoneRef}
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          aria-label={isRemision ? 'Pegar remisión aquí' : 'Pegar foto del descargue aquí'}
          onFocus={() => { onSelect?.(kind) }}
          onPaste={handleZonePaste}
          onInput={clearPasteZone}
          onBlur={clearPasteZone}
          style={{
            position: 'relative',
            zIndex: 1,
            minHeight: 72,
            padding: '12px 10px',
            outline: 'none',
            color: 'transparent',
            caretColor: 'var(--cc-almacen-accent)',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          ref={galRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          data-testid={`entrada-soporte-${kind}-gal-input`}
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
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-camara`}
          style={btnMini(ui, false)}
          disabled={busy}
          onClick={() => camRef.current?.click()}
          title="Tomar foto"
        >
          📸 Cámara
        </button>
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-galeria`}
          style={btnMini(ui, false)}
          disabled={busy}
          onClick={() => galRef.current?.click()}
          title="Elegir de la galería"
        >
          🖼 Galería
        </button>
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-archivo`}
          style={btnMini(ui, false)}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          title={isRemision ? 'Imagen o PDF del dispositivo' : 'Imagen del dispositivo'}
        >
          📁 Archivo
        </button>
        <button
          type="button"
          data-testid={`entrada-soporte-${kind}-pegar`}
          style={btnMini(ui, selected)}
          disabled={busy}
          onClick={() => { void handlePegarClick() }}
          title="Leer imagen o PDF del portapapeles"
        >
          📋 Pegar
        </button>
      </div>
      {file ? (
        <div
          data-testid={`entrada-soporte-${kind}-preview`}
          style={{
            border: '1px solid var(--cc-almacen-border)',
            borderRadius: 10,
            padding: 8,
            background: 'var(--cc-almacen-bg-card)',
            color: 'var(--cc-almacen-text)',
          }}
        >
          {isPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <span style={{ fontSize: '1.6rem' }} aria-hidden>📎</span>
              <span style={{ wordBreak: 'break-word' }}>{file.name || 'remision.pdf'}</span>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={labelReady || kind}
              style={{ width: '100%', maxHeight: 100, objectFit: 'cover', borderRadius: 8 }}
            />
          ) : null}
          <div style={{ marginTop: 4, fontSize: '0.85rem', color: 'var(--cc-almacen-ok-text, #15803d)', fontWeight: 700 }}>
            {labelReady || 'Listo'} · toque Pegar aquí / Pegar / Cámara / Galería / Archivo para reemplazar
          </div>
        </div>
      ) : (
        <div
          data-testid={`entrada-soporte-${kind}-falta`}
          style={{ color: 'var(--cc-almacen-warn-text, #b45309)', fontWeight: 700, fontSize: '0.85rem' }}
        >
          {labelEmpty || (isRemision ? 'Falta la remisión' : 'Falta la foto del descargue')}
        </div>
      )}
    </div>
  )
}
