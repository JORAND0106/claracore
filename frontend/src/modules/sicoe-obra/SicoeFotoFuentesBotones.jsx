/**
 * Selector de origen de foto para SicoeObra:
 * Cámara | Galería del dispositivo | Archivo (+ opcional Galería del contrato).
 * Misma UX en registros y en el cuadro de aceros.
 */
import { useRef } from 'react'

const btnBase = (theme, disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  cursor: disabled ? 'wait' : 'pointer',
  color: theme.primary,
  fontWeight: 700,
  fontSize: 'var(--cc-sm)',
  background: 'transparent',
  opacity: disabled ? 0.55 : 1,
  margin: 0,
})

/**
 * @param {{
 *   t?: object,
 *   disabled?: boolean,
 *   multiple?: boolean,
 *   onFiles: (files: File[], origen: 'camara'|'galeria-dispositivo'|'archivo') => void,
 *   onGaleriaContrato?: () => void,
 *   compact?: boolean,
 *   showContratoGaleria?: boolean,
 * }} props
 */
export default function SicoeFotoFuentesBotones({
  t,
  disabled = false,
  multiple = true,
  onFiles,
  onGaleriaContrato = null,
  compact = false,
  showContratoGaleria = false,
}) {
  const theme = t || {
    border: '#334155',
    primary: '#0EA5A8',
    textMuted: '#94A3B8',
  }
  const camRef = useRef(null)
  const galRef = useRef(null)
  const archRef = useRef(null)

  const emit = (fileList, origen) => {
    const list = Array.from(fileList || []).filter(Boolean)
    if (!list.length) return
    onFiles?.(list, origen)
  }

  const st = btnBase(theme, disabled)
  if (compact) {
    st.padding = '2px 6px'
    st.fontSize = 'var(--cc-caption)'
    st.borderRadius = 4
  }

  return (
    <div
      data-testid="sicoe-foto-fuentes"
      style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6, alignItems: 'center' }}
      role="group"
      aria-label="Origen de la foto"
    >
      <label style={st} title="Tomar con la cámara">
        {compact ? '📷' : '📷 Cámara'}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple={!!multiple}
          disabled={disabled}
          style={{ display: 'none' }}
          data-testid="sicoe-foto-fuente-camara"
          onChange={(e) => {
            emit(e.target.files, 'camara')
            e.target.value = ''
          }}
        />
      </label>
      <label style={st} title="Elegir de la galería del dispositivo">
        {compact ? '🖼' : '🖼 Galería'}
        <input
          ref={galRef}
          type="file"
          accept="image/*"
          multiple={!!multiple}
          disabled={disabled}
          style={{ display: 'none' }}
          data-testid="sicoe-foto-fuente-galeria"
          onChange={(e) => {
            emit(e.target.files, 'galeria-dispositivo')
            e.target.value = ''
          }}
        />
      </label>
      <label style={st} title="Cargar desde archivos">
        {compact ? '📎' : '📎 Archivo'}
        <input
          ref={archRef}
          type="file"
          accept="image/*"
          multiple={!!multiple}
          disabled={disabled}
          style={{ display: 'none' }}
          data-testid="sicoe-foto-fuente-archivo"
          onChange={(e) => {
            emit(e.target.files, 'archivo')
            e.target.value = ''
          }}
        />
      </label>
      {showContratoGaleria && typeof onGaleriaContrato === 'function' && (
        <button
          type="button"
          disabled={disabled}
          onClick={onGaleriaContrato}
          title="Elegir de la galería de fotos del contrato"
          data-testid="sicoe-foto-fuente-galeria-contrato"
          style={{ ...st, borderStyle: 'dashed' }}
        >
          {compact ? '🗂️' : '🗂️ Galería contrato'}
        </button>
      )}
    </div>
  )
}

/** Orígenes que ofrece el control (contrato de UI / pruebas). */
export const SICOE_FOTO_FUENTES = Object.freeze([
  'camara',
  'galeria-dispositivo',
  'archivo',
  'galeria-contrato',
])
