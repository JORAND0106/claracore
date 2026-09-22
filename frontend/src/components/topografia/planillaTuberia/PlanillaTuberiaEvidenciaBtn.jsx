/**
 * Icono de adjuntar foto por línea de cantidad / descuento.
 * Abre selector de archivo, muestra conteo y permite quitar la última foto.
 */
import { useRef, useState } from 'react'
import { comprimirImagenADataUrl, esArchivoImagen } from '../../../comprimirImagen'
import { fotosLineaEvidencia } from './planillaTuberiaUtils'

const MAX_FOTOS = 4

export default function PlanillaTuberiaEvidenciaBtn({
  scope,
  codigo,
  label,
  evidencias,
  editable,
  busy,
  onAdjuntar,
  onEliminar,
  requiere,
}) {
  const inputRef = useRef(null)
  const [localBusy, setLocalBusy] = useState(false)
  const fotos = fotosLineaEvidencia(evidencias, scope, codigo)
  const n = fotos.length
  const ok = n > 0
  const need = !!requiere && !ok
  const disabled = !editable || busy || localBusy

  const pick = () => {
    if (disabled) return
    if (n >= MAX_FOTOS) return
    inputRef.current?.click()
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !esArchivoImagen(file)) return
    setLocalBusy(true)
    try {
      const dataUri = await comprimirImagenADataUrl(file, { maxWidthPx: 1280, calidadJpeg: 0.75 })
      await onAdjuntar?.({
        scope,
        codigo,
        nombre: file.name || `${codigo}.jpg`,
        data_base64: dataUri,
        mime_type: 'image/jpeg',
      })
    } catch (err) {
      // El padre muestra el error
      console.warn('evidencia upload', err)
    } finally {
      setLocalBusy(false)
    }
  }

  const quitarUltima = async (ev) => {
    ev.stopPropagation()
    if (disabled || !fotos.length) return
    const last = fotos[fotos.length - 1]
    if (!last?.id) return
    setLocalBusy(true)
    try {
      await onEliminar?.({ scope, codigo, foto_id: last.id })
    } finally {
      setLocalBusy(false)
    }
  }

  const bg = ok ? '#dcfce7' : need ? '#fef2f2' : '#f1f5f9'
  const fg = ok ? '#166534' : need ? '#b91c1c' : '#64748b'
  const border = ok ? '#86efac' : need ? '#fecaca' : '#cbd5e1'
  const title = ok
    ? `${label || codigo}: ${n} foto(s). Clic para agregar otra.`
    : need
      ? `${label || codigo}: falta registro fotográfico`
      : `${label || codigo}: adjuntar foto`

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        title={title}
        disabled={disabled || n >= MAX_FOTOS}
        onClick={pick}
        aria-label={title}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          minWidth: 36,
          height: 26,
          padding: '0 6px',
          borderRadius: 6,
          border: `1px solid ${border}`,
          background: bg,
          color: fg,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2.2l1.1-1.5h4.4L15.3 5H17.5A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>{n}</span>
      </button>
      {ok && editable && (
        <button
          type="button"
          title="Quitar última foto"
          disabled={disabled}
          onClick={quitarUltima}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#b91c1c',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFile}
      />
    </span>
  )
}
