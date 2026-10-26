/**
 * Selector de origen de foto para SicoeObra.
 *
 * Causa del bug (Lenovo TB311FU / algunos Android): un solo
 * input de imagen con atributo capture (environment) hace que Chrome abra
 * directamente la cámara trasera, sin chooser de galería/archivos.
 *
 * Aquí se separan las fuentes:
 * - Cámara → input CON capture (abre cámara)
 * - Galería / Archivo → input SIN capture (abre selector del sistema)
 * - Opcional: galería de fotos del contrato
 *
 * Por defecto: solo icono + tooltip (title / aria-label).
 */
import { useRef } from 'react'

const btnBase = (theme, disabled, { iconOnly = true } = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: iconOnly ? 0 : 4,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: iconOnly ? '6px 8px' : '6px 10px',
  minWidth: iconOnly ? 34 : undefined,
  minHeight: iconOnly ? 34 : undefined,
  cursor: disabled ? 'wait' : 'pointer',
  color: theme.primary,
  fontWeight: 700,
  fontSize: 'var(--cc-sm)',
  background: 'transparent',
  opacity: disabled ? 0.55 : 1,
  margin: 0,
  lineHeight: 1,
})

/**
 * @param {{
 *   t?: object,
 *   disabled?: boolean,
 *   multiple?: boolean,
 *   onFiles: (files: File[], origen: 'camara'|'galeria-dispositivo'|'archivo') => void,
 *   onGaleriaContrato?: () => void,
 *   compact?: boolean,
 *   iconOnly?: boolean,
 *   showContratoGaleria?: boolean,
 *   mode?: 'add'|'replace',
 * }} props
 */
export default function SicoeFotoFuentesBotones({
  t,
  disabled = false,
  multiple = true,
  onFiles,
  onGaleriaContrato = null,
  compact = false,
  iconOnly = true,
  showContratoGaleria = false,
  mode = 'add',
}) {
  const theme = t || {
    border: '#334155',
    primary: '#0EA5A8',
    textMuted: '#94A3B8',
  }
  const camRef = useRef(null)
  const galRef = useRef(null)
  const archRef = useRef(null)
  const replacing = mode === 'replace'
  const verb = replacing ? 'Reemplazar con' : 'Tomar / elegir'

  const emit = (fileList, origen) => {
    const list = Array.from(fileList || []).filter(Boolean)
    if (!list.length) return
    onFiles?.(list, origen)
  }

  const st = btnBase(theme, disabled, { iconOnly })
  if (compact) {
    st.padding = iconOnly ? '2px 6px' : '2px 6px'
    st.fontSize = 'var(--cc-caption)'
    st.borderRadius = 4
    st.minWidth = iconOnly ? 28 : undefined
    st.minHeight = iconOnly ? 28 : undefined
  }

  const labelCam = iconOnly ? '📷' : '📷 Cámara'
  const labelGal = iconOnly ? '🖼' : '🖼 Galería'
  const labelArch = iconOnly ? '📎' : '📎 Archivo'
  const labelContrato = iconOnly ? '🗂️' : '🗂️ Galería contrato'

  return (
    <div
      data-testid="sicoe-foto-fuentes"
      data-mode={mode}
      style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6, alignItems: 'center' }}
      role="group"
      aria-label={replacing ? 'Reemplazar foto — origen' : 'Agregar foto — origen'}
    >
      <label
        style={st}
        title={`${verb} la cámara`}
        aria-label={`${verb} la cámara`}
      >
        {labelCam}
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
      <label
        style={st}
        title={`${verb} la galería del dispositivo`}
        aria-label={`${verb} la galería del dispositivo`}
      >
        {labelGal}
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
      <label
        style={st}
        title={`${verb} un archivo de la tablet / PC`}
        aria-label={`${verb} un archivo`}
      >
        {labelArch}
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
          aria-label="Elegir de la galería de fotos del contrato"
          data-testid="sicoe-foto-fuente-galeria-contrato"
          style={{ ...st, borderStyle: 'dashed' }}
        >
          {labelContrato}
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
