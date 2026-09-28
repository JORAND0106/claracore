import { useEffect, useRef, useState } from 'react'
import {
  fileToDataUri,
  imagenDesdeClipboard,
  imagenDesdePasteEvent,
} from './validacionAdjuntoHelpers'

const MAX_DEFAULT = 3

/**
 * Zona de adjunto de imagen para popups de validación (Aprobado/Pendiente/Rechazado).
 * - Selección de archivo
 * - Ctrl+V / botón portapapeles
 * No sube al servidor: el padre recibe File locales y sube al confirmar.
 *
 * @param {{
 *   value: Array<{ id: string, file?: File, previewUrl: string, nombre: string, mime: string }>,
 *   onChange: (next: typeof value) => void,
 *   t?: { bg?: string, text?: string, textMuted?: string, border?: string, primary?: string, inputBg?: string },
 *   disabled?: boolean,
 *   max?: number,
 *   label?: string,
 * }} props
 */
export default function ValidacionAdjuntoImagen({
  value = [],
  onChange,
  t = {},
  disabled = false,
  max = MAX_DEFAULT,
  label = 'Imagen de respaldo',
}) {
  const fileRef = useRef(null)
  const zoneRef = useRef(null)
  const [error, setError] = useState('')
  const [pegando, setPegando] = useState(false)
  const list = Array.isArray(value) ? value : []
  const full = list.length >= max

  const border = t.border || '#e2e8f0'
  const textMuted = t.textMuted || '#64748b'
  const primary = t.primary || '#2563eb'
  const bg = t.inputBg || t.bg || '#f8fafc'
  const text = t.text || '#0f172a'

  const pushFile = async (file, origen = 'archivo') => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      setError('Solo se admiten imágenes.')
      return
    }
    if (disabled || full) {
      setError(`Máximo ${max} imagen(es).`)
      return
    }
    setError('')
    const previewUrl = await fileToDataUri(file)
    const next = [
      ...list,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl,
        nombre: file.name || `imagen-${Date.now()}.png`,
        mime: file.type || 'image/png',
        origen,
      },
    ]
    onChange?.(next.slice(0, max))
  }

  const removeAt = (id) => {
    onChange?.(list.filter((x) => x.id !== id))
    setError('')
  }

  const onPasteClipboard = async () => {
    if (disabled || full || pegando) return
    setPegando(true)
    setError('')
    try {
      const file = await imagenDesdeClipboard()
      if (!file) {
        setError('No hay imagen en el portapapeles. Use Ctrl+V sobre esta zona.')
        zoneRef.current?.focus()
        return
      }
      await pushFile(file, 'pegar')
    } catch {
      setError('Use Ctrl+V sobre la zona de pegado (el navegador bloqueó la lectura del portapapeles).')
      zoneRef.current?.focus()
    } finally {
      setPegando(false)
    }
  }

  useEffect(() => {
    if (disabled) return undefined
    const onPaste = (e) => {
      const file = imagenDesdePasteEvent(e)
      if (!file) return
      e.preventDefault()
      void pushFile(file, 'pegar')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushFile cierra sobre list actual vía onChange
  }, [disabled, full, list.length, max])

  const btn = {
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 700,
    cursor: disabled || full ? 'not-allowed' : 'pointer',
    opacity: disabled || full ? 0.55 : 1,
    background: bg,
    color: text,
  }

  return (
    <div data-testid="validacion-adjunto-imagen" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 'var(--cc-label)', fontWeight: 700, color: textMuted, letterSpacing: '0.6px' }}>
        {label}{' '}
        <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional · máx. {max})</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => fileRef.current?.click()}
          style={{ ...btn, background: primary, color: '#fff', border: 'none' }}
          title="Seleccionar imagen desde el dispositivo"
        >
          📁 Archivo
        </button>
        <button
          type="button"
          disabled={disabled || full || pegando}
          onClick={() => void onPasteClipboard()}
          style={btn}
          title="Pegar captura del portapapeles"
        >
          {pegando ? '…' : '⌘ Ctrl+V'}
        </button>
        <span style={{ fontSize: 'var(--cc-xs)', color: textMuted }}>
          También puede pegar con Ctrl+V
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void pushFile(f, 'archivo')
          }}
        />
      </div>
      <div
        ref={zoneRef}
        tabIndex={0}
        data-testid="validacion-adjunto-paste-zone"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const f = Array.from(e.dataTransfer?.files || []).find((x) => String(x.type || '').startsWith('image/'))
          if (f) void pushFile(f, 'archivo')
        }}
        style={{
          border: `1.5px dashed ${border}`,
          borderRadius: 10,
          padding: 10,
          minHeight: 56,
          background: bg,
          outline: 'none',
        }}
        title="Zona de pegado / arrastre"
      >
        {list.length === 0 ? (
          <div style={{ fontSize: 'var(--cc-xs)', color: textMuted }}>
            Sin imagen. Arrastre aquí o use Archivo / Ctrl+V.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {list.map((im) => (
              <div
                key={im.id}
                style={{
                  position: 'relative',
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `1px solid ${border}`,
                }}
              >
                <img
                  src={im.previewUrl || im.url}
                  alt={im.nombre || 'adjunto'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  type="button"
                  onClick={() => removeAt(im.id)}
                  disabled={disabled}
                  title="Quitar"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: 'none',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 'var(--cc-xs)', color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '6px 10px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
