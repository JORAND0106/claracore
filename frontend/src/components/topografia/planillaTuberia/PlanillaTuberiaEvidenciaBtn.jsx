/**
 * Icono de adjuntar foto por línea de cantidad / descuento.
 * Fuentes (mismo patrón SICOE Obra): cámara, archivo o galería del contrato.
 *
 * Galería: se envía la URL al backend (descarga server-side). No se redescarga
 * la imagen en el navegador — las URLs de Azure/CDN fallan por CORS y el
 * ícono quedaba en rojo tras cerrar el popup.
 */
import { useRef, useState } from 'react'
import { API_BASE } from '../../../apiBase'
import { comprimirImagenADataUrl, esArchivoImagen } from '../../../comprimirImagen'
import PptoSicoeGaleriaPicker from '../../../modules/presupuesto/PptoSicoeGaleriaPicker'
import { fotosLineaEvidencia } from './planillaTuberiaUtils'

const MAX_FOTOS = 4
/** Por encima del editor de planilla (100030). */
export const EVIDENCIA_GALERIA_Z_INDEX = 100080

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
  contratoId,
  token,
  theme,
  onError,
}) {
  const camRef = useRef(null)
  const fileRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const fotos = fotosLineaEvidencia(evidencias, scope, codigo)
  const n = fotos.length
  const ok = n > 0
  const need = !!requiere && !ok
  const disabled = !editable || busy || localBusy

  const reportError = (err) => {
    const msg = err?.message || String(err || 'No se pudo adjuntar la foto')
    console.warn('evidencia', err)
    onError?.(msg)
  }

  const procesarArchivo = async (file, nombreFallback) => {
    if (!file || !esArchivoImagen(file)) return
    setLocalBusy(true)
    try {
      const dataUri = await comprimirImagenADataUrl(file, { maxWidthPx: 1280, calidadJpeg: 0.75 })
      await onAdjuntar?.({
        scope,
        codigo,
        nombre: file.name || nombreFallback || `${codigo}.jpg`,
        data_base64: dataUri,
        mime_type: 'image/jpeg',
        origen: 'archivo',
      })
    } catch (err) {
      reportError(err)
      throw err
    } finally {
      setLocalBusy(false)
    }
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setMenuOpen(false)
    try {
      await procesarArchivo(file)
    } catch {
      /* error ya reportado */
    }
  }

  const onGaleriaSelect = async ({ url, numero }) => {
    setGaleriaOpen(false)
    setMenuOpen(false)
    if (!url) {
      reportError(new Error('La foto de galería no tiene URL'))
      return
    }
    setLocalBusy(true)
    try {
      // El backend descarga la URL (sin CORS en el browser).
      await onAdjuntar?.({
        scope,
        codigo,
        nombre: `sicoe_${numero || 'foto'}.jpg`,
        url: String(url),
        mime_type: 'image/jpeg',
        origen: 'galeria',
      })
    } catch (err) {
      reportError(err)
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
    ? `${label || codigo}: ${n} foto(s). Clic para agregar (cámara / archivo / galería).`
    : need
      ? `${label || codigo}: falta registro fotográfico`
      : `${label || codigo}: adjuntar foto (cámara / archivo / galería)`

  const t = theme || {
    bg: '#fff',
    bgCard: '#fff',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    primary: '#2563eb',
  }

  const menuBtn = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'transparent',
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: t.text,
    cursor: 'pointer',
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, position: 'relative' }}>
      <button
        type="button"
        title={title}
        disabled={disabled || n >= MAX_FOTOS}
        onClick={() => {
          if (disabled || n >= MAX_FOTOS) return
          setMenuOpen((o) => !o)
        }}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-evidencia-fuente-menu
        data-evidencia-ok={ok ? '1' : '0'}
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
      {menuOpen && !disabled && n < MAX_FOTOS && (
        <div
          role="menu"
          data-evidencia-menu
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 40,
            marginTop: 4,
            minWidth: 160,
            background: t.bgCard || '#fff',
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            role="menuitem"
            style={menuBtn}
            onClick={() => { setMenuOpen(false); camRef.current?.click() }}
          >
            📷 Cámara
          </button>
          <button
            type="button"
            role="menuitem"
            style={menuBtn}
            onClick={() => { setMenuOpen(false); fileRef.current?.click() }}
          >
            📁 Archivo
          </button>
          <button
            type="button"
            role="menuitem"
            style={menuBtn}
            disabled={!contratoId || !token}
            onClick={() => { setMenuOpen(false); setGaleriaOpen(true) }}
          >
            🖼 Galería
          </button>
        </div>
      )}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      <PptoSicoeGaleriaPicker
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API_BASE}
        tipo="foto"
        zIndex={EVIDENCIA_GALERIA_Z_INDEX}
        onSelect={onGaleriaSelect}
      />
    </span>
  )
}
