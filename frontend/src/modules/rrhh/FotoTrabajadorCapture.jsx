import { useRef, useState } from 'react'
import { esArchivoImagen, prepararImagenParaUpload } from '../../comprimirImagen.js'

/**
 * Captura / carga de fotografía del trabajador.
 */
export default function FotoTrabajadorCapture({
  previewUrl,
  onFileReady,
  onClear,
  disabled = false,
  themeTokens = {},
}) {
  const fileRef = useRef(null)
  const camRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const border = themeTokens.border || '#e2e8f0'
  const muted = themeTokens.textMuted || '#64748b'
  const card = themeTokens.bgCard || '#fff'

  const handleFile = async (file) => {
    if (!file || disabled) return
    if (!esArchivoImagen(file)) {
      setErr('Use una imagen (JPEG, PNG, WebP…).')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const prepared = await prepararImagenParaUpload(file, { maxWidthPx: 960, calidadJpeg: 0.8 })
      onFileReady?.(prepared instanceof File ? prepared : new File([prepared], 'foto.jpg', { type: 'image/jpeg' }))
    } catch (e) {
      setErr(e.message || 'No se pudo procesar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: 10,
      background: card,
      marginBottom: 12,
    }}>
      <div style={{
        width: 96,
        height: 112,
        borderRadius: 8,
        border: `1px dashed ${border}`,
        overflow: 'hidden',
        background: themeTokens.inputBg || '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {previewUrl ? (
          <img src={previewUrl} alt="Foto trabajador" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 'var(--cc-caption)', color: muted, textAlign: 'center', padding: 6 }}>Sin foto</span>
        )}
      </div>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', marginBottom: 6 }}>Fotografía del trabajador</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1px solid ${border}`,
              background: 'transparent',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 'var(--cc-caption)',
              fontFamily: 'inherit',
            }}
          >
            Cargar imagen
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => camRef.current?.click()}
            style={{
              border: `1px solid ${border}`,
              background: 'transparent',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 'var(--cc-caption)',
              fontFamily: 'inherit',
            }}
          >
            Tomar foto
          </button>
          {previewUrl && !disabled && (
            <button
              type="button"
              onClick={() => onClear?.()}
              style={{
                border: `1px solid ${border}`,
                background: 'transparent',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 'var(--cc-caption)',
                fontFamily: 'inherit',
              }}
            >
              Quitar
            </button>
          )}
        </div>
        {err && <div style={{ color: '#DC2626', fontSize: 'var(--cc-caption)', marginTop: 6 }}>{err}</div>}
        {busy && <div style={{ color: muted, fontSize: 'var(--cc-caption)', marginTop: 6 }}>Procesando…</div>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />
    </div>
  )
}
