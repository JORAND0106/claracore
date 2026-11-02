/**
 * Selector de soporte Remisión / Foto descargue: cámara, galería o archivo.
 */
import { useRef } from 'react'
import { useAlmacenTheme } from './almacenShared'

const btnMini = (ui, active) => ({
  ...ui.btnSecondary,
  minHeight: 40,
  padding: '6px 10px',
  fontSize: 'var(--cc-xs, 0.8rem)',
  fontWeight: 700,
  flex: 1,
  background: active ? (ui.accentSoft || 'rgba(0,119,182,0.12)') : undefined,
})

export default function EntradaSoportePicker({
  kind, // 'remision' | 'material'
  file,
  previewUrl,
  busy,
  onPickFile,
  labelReady,
  labelEmpty,
}) {
  const ui = useAlmacenTheme()
  const camRef = useRef(null)
  const galRef = useRef(null)
  const fileRef = useRef(null)
  const isRemision = kind === 'remision'
  const isPdf = Boolean(file && ((file.type || '').includes('pdf') || /\.pdf$/i.test(file.name || '')))

  return (
    <div
      data-testid={`entrada-soporte-${kind}`}
      style={{ display: 'grid', gap: 6 }}
    >
      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
        {isRemision ? '📄 Remisión' : '📷 Foto del descargue'}
        <span style={{ fontWeight: 500, color: ui.textMuted }}> (obligatoria)</span>
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
      </div>
      {file ? (
        <div
          data-testid={`entrada-soporte-${kind}-preview`}
          style={{
            border: `1px solid ${ui.borderColor}`,
            borderRadius: 10,
            padding: 8,
            background: ui.card?.background || 'var(--cc-almacen-bg-card, #fff)',
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
          <div style={{ marginTop: 4, fontSize: '0.85rem', color: '#15803d', fontWeight: 700 }}>
            {labelReady || 'Listo'} · toque Cámara/Galería/Archivo para reemplazar
          </div>
        </div>
      ) : (
        <div
          data-testid={`entrada-soporte-${kind}-falta`}
          style={{ color: '#b45309', fontWeight: 700, fontSize: '0.85rem' }}
        >
          {labelEmpty || (isRemision ? 'Falta la remisión' : 'Falta la foto del descargue')}
        </div>
      )}
    </div>
  )
}
