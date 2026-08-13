import { useRef, useState } from 'react'

/**
 * Barra de fuentes de imagen: archivo | galería | Ctrl+V | dibujar esquema.
 * - Ctrl+V: lee el portapapeles (Clipboard API) vía onPasteClipboard; si falla, enfoca la zona de pegado.
 * - El paste por teclado lo maneja el padre (listener window).
 */
export default function PptoImageSourceBar({
  t,
  disabled,
  onPickFiles,
  onOpenGaleria,
  onPasteClipboard,
  onFocusPasteZone,
  onOpenEsquema,
  hint = 'Archivo, galería, Ctrl+V o dibujar esquema',
  galeriaTitle = 'Buscar en la galería de gráficos de Presupuesto',
}) {
  const fileRef = useRef(null)
  const [pegando, setPegando] = useState(false)

  const clickCtrlV = async () => {
    if (disabled || pegando) return
    if (onPasteClipboard) {
      setPegando(true)
      try {
        await onPasteClipboard()
      } finally {
        setPegando(false)
      }
      return
    }
    onFocusPasteZone?.()
  }

  const busy = disabled || pegando
  const btnSecondary = {
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 12px',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        title="Cargar archivo nuevo"
        style={{
          background: t.primary,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 'var(--cc-sm)',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        📁 Archivo
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onOpenGaleria?.()}
        title={galeriaTitle}
        style={btnSecondary}
      >
        🖼 Galería
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void clickCtrlV()}
        title="Pegar captura del portapapeles (lee la imagen al hacer clic; también puede usar Ctrl+V)"
        style={btnSecondary}
      >
        {pegando ? '…' : '⌘ Ctrl+V'}
      </button>
      {onOpenEsquema && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onOpenEsquema?.()}
          title="Dibujar esquema (lápiz, figuras, hatch, texto, tabla…)"
          style={btnSecondary}
        >
          ✎ Dibujar esquema
        </button>
      )}
      <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>{hint}</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onPickFiles?.(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
