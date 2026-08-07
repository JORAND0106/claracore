import { useRef } from 'react'

/**
 * Barra de fuentes de imagen: archivo | galería | Ctrl+V.
 * El paste real lo maneja el padre (listener window / zona enfocable);
 * el botón Ctrl+V enfoca esa zona para facilitar el pegado.
 */
export default function PptoImageSourceBar({
  t,
  disabled,
  onPickFiles,
  onOpenGaleria,
  onFocusPasteZone,
  hint = 'Archivo, galería del contrato o Ctrl+V',
}) {
  const fileRef = useRef(null)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        disabled={disabled}
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
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        📁 Archivo
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenGaleria?.()}
        title="Buscar en la galería de fotos/gráficos del contrato"
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 'var(--cc-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        🖼 Galería
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onFocusPasteZone?.()}
        title="Pegar captura del portapapeles (Ctrl+V). Haga clic aquí y luego Ctrl+V"
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontWeight: 700,
          fontSize: 'var(--cc-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        ⌘ Ctrl+V
      </button>
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
