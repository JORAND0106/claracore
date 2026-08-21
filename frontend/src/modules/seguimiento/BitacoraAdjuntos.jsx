import { useEffect, useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { MAX_FOTOS_BITACORA } from './bitacoraConstants'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'

/**
 * Adjuntos en una sola línea de íconos (archivo | galería | Ctrl+V | esquema)
 * + miniaturas compactas. Máx. 4 fotos por entrada.
 */
export default function BitacoraAdjuntos({
  t,
  api,
  imagenes = [],
  onChange,
  onUploadPersisted,
  disabled = false,
  entradaId = null,
  singleLine = true,
}) {
  const ui = bitacoraSheetStyles(t)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [galeriaItems, setGaleriaItems] = useState([])
  const [galeriaQ, setGaleriaQ] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const pasteZoneRef = useRef(null)

  const list = Array.isArray(imagenes) ? imagenes : []
  const full = list.length >= MAX_FOTOS_BITACORA

  const pushLocal = (im) => {
    if (list.length >= MAX_FOTOS_BITACORA) {
      setError(`Máximo ${MAX_FOTOS_BITACORA} fotografías por entrada`)
      return false
    }
    setError('')
    onChange?.([...list, im])
    return true
  }

  const fileToDataUri = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const addFile = async (file, origen = 'archivo') => {
    if (!file || !String(file.type || '').startsWith('image/')) return
    if (disabled) return
    if (entradaId != null && onUploadPersisted) {
      setBusy(true)
      setError('')
      try {
        const dataUri = await fileToDataUri(file)
        await onUploadPersisted({
          nombre: file.name || `foto-${Date.now()}.png`,
          data_base64: dataUri,
          mime_type: file.type || 'image/png',
          origen,
        })
      } catch (e) {
        setError(e.message || 'No se pudo adjuntar')
      } finally {
        setBusy(false)
      }
      return
    }
    const dataUri = await fileToDataUri(file)
    pushLocal({
      nombre: file.name || `foto-${Date.now()}.png`,
      data_uri: dataUri,
      mime_type: file.type || 'image/png',
      origen,
      pending: true,
      created_at: new Date().toISOString(),
    })
  }

  const onPasteClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((x) => x.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        await addFile(new File([blob], `pegar-${Date.now()}.png`, { type }), 'pegar')
        return
      }
      setError('No hay imagen en el portapapeles')
    } catch {
      pasteZoneRef.current?.focus()
      setError('Use Ctrl+V sobre la zona de pegado')
    }
  }

  useEffect(() => {
    if (disabled || esquemaOpen || galeriaOpen) return undefined
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items?.length) return
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void addFile(file, 'pegar')
          }
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, esquemaOpen, galeriaOpen, list.length, entradaId])

  const openGaleria = async () => {
    setGaleriaOpen(true)
    try {
      const rows = await api.listBitacoraGaleria(galeriaQ)
      setGaleriaItems(Array.isArray(rows) ? rows : [])
    } catch {
      setGaleriaItems([])
    }
  }

  const iconBtn = (label, title, onClick, extra = {}) => (
    <button
      type="button"
      title={title}
      disabled={disabled || busy || full}
      onClick={onClick}
      style={{
        ...ui.clipBtn,
        border: `1px solid ${ui.border}`,
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 13,
        background: t.bg,
        opacity: (disabled || busy || full) ? 0.5 : 1,
        cursor: (disabled || busy || full) ? 'not-allowed' : 'pointer',
        ...extra,
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div style={{
        display: 'flex',
        flexWrap: singleLine ? 'nowrap' : 'wrap',
        alignItems: 'center',
        gap: 6,
        overflowX: singleLine ? 'auto' : 'visible',
      }}>
        <span style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-sm)', whiteSpace: 'nowrap' }}>
          Adjuntos ({list.length}/{MAX_FOTOS_BITACORA})
        </span>
        {!disabled && (
          <>
            {iconBtn('📁', 'Cargar archivo', () => fileRef.current?.click())}
            {iconBtn('🖼', 'Galería Bitácora', () => void openGaleria())}
            {iconBtn('⌘V', 'Pegar del portapapeles', () => void onPasteClipboard())}
            {iconBtn('✎', 'Dibujar esquema', () => setEsquemaOpen(true))}
          </>
        )}
        {list.map((im, idx) => {
          const src = imagenSrc(im)
          return (
            <div
              key={`${im.blob_path || im.nombre || 'im'}-${idx}`}
              style={{
                position: 'relative',
                width: 36,
                height: 28,
                border: `1px solid ${ui.border}`,
                borderRadius: 3,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {src ? (
                <button
                  type="button"
                  onClick={() => openImageInNewTab(im)}
                  style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 'none', cursor: 'zoom-in' }}
                >
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ) : (
                <div style={{ fontSize: 9, color: t.textMuted, display: 'grid', placeItems: 'center', height: '100%' }}>—</div>
              )}
              {!disabled && (
                <button
                  type="button"
                  title="Quitar"
                  onClick={() => onChange?.(list.filter((_, i) => i !== idx))}
                  style={{
                    position: 'absolute', top: -2, right: -2,
                    border: 'none', background: '#fff', color: '#B91C1C',
                    borderRadius: 8, width: 14, height: 14, fontSize: 9,
                    lineHeight: 1, cursor: 'pointer', padding: 0, fontWeight: 800,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            Array.from(e.target.files || []).forEach((f) => { void addFile(f, 'archivo') })
            e.target.value = ''
          }}
        />
        <div ref={pasteZoneRef} tabIndex={0} style={{ width: 1, height: 1, outline: 'none' }} aria-hidden />
      </div>
      {error && (
        <div style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>{error}</div>
      )}

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title="Esquema · Bitácora"
          onClose={() => setEsquemaOpen(false)}
          onSave={async (dataUrl) => {
            setEsquemaOpen(false)
            if (!dataUrl) return
            if (entradaId != null && onUploadPersisted) {
              setBusy(true)
              try {
                await onUploadPersisted({
                  nombre: `esquema-${Date.now()}.png`,
                  data_base64: dataUrl,
                  mime_type: 'image/png',
                  origen: 'esquema',
                })
              } catch (e) {
                setError(e.message || 'No se pudo guardar el esquema')
              } finally {
                setBusy(false)
              }
              return
            }
            pushLocal({
              nombre: `esquema-${Date.now()}.png`,
              data_uri: dataUrl,
              mime_type: 'image/png',
              origen: 'esquema',
              pending: true,
              created_at: new Date().toISOString(),
            })
          }}
        />
      )}

      {galeriaOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 13000,
          background: 'rgba(15,23,42,0.45)',
          display: 'grid', placeItems: 'center', padding: 16,
        }}>
          <div style={{
            width: 'min(720px, 100%)', maxHeight: '80vh', overflow: 'auto',
            background: t.bgCard, borderRadius: 12, border: `1px solid ${t.border}`, padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: t.text }}>Galería Bitácora</div>
              <button type="button" onClick={() => setGaleriaOpen(false)} style={ui.clipBtn}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={galeriaQ}
                onChange={(e) => setGaleriaQ(e.target.value)}
                placeholder="Buscar…"
                style={{ flex: 1, ...ui.cellInp, border: `1px solid ${ui.border}`, height: 32 }}
              />
              <button type="button" onClick={() => void openGaleria()} style={{
                background: t.primary, color: '#fff', border: 'none', borderRadius: 6,
                padding: '6px 12px', fontWeight: 700, cursor: 'pointer',
              }}>Buscar</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {galeriaItems.map((it, i) => {
                const src = imagenSrc(it)
                return (
                  <button
                    key={`${it.blob_path || i}`}
                    type="button"
                    onClick={() => {
                      if (full) {
                        setError(`Máximo ${MAX_FOTOS_BITACORA} fotografías`)
                        return
                      }
                      pushLocal({
                        nombre: it.nombre || 'galeria.png',
                        blob_path: it.blob_path,
                        data_uri: it.data_uri,
                        url: it.url,
                        mime_type: it.mime_type || 'image/png',
                        content_hash: it.content_hash,
                        origen: 'galeria',
                        created_at: new Date().toISOString(),
                      })
                      setGaleriaOpen(false)
                    }}
                    style={{
                      border: `1px solid ${ui.border}`, borderRadius: 6, padding: 0,
                      background: t.bg, cursor: 'pointer', overflow: 'hidden',
                    }}
                  >
                    {src
                      ? <img src={src} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 72 }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Clip genérico para adjuntar uno o varios archivos (vales / preoperacionales). */
export function BitacoraClipAdjuntos({
  t,
  files = [],
  onChange,
  disabled = false,
  accept = 'image/*,application/pdf',
  title = 'Adjuntar',
}) {
  const ui = bitacoraSheetStyles(t)
  const ref = useRef(null)
  const list = Array.isArray(files) ? files : []

  const addFiles = (fileList) => {
    const readers = Array.from(fileList || []).map((file) => new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        nombre: file.name || `adjunto-${Date.now()}`,
        data_uri: reader.result,
        mime_type: file.type || 'application/octet-stream',
        origen: 'archivo',
        pending: true,
        created_at: new Date().toISOString(),
        kind: 'adjunto',
      })
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }))
    Promise.all(readers).then((rows) => {
      const ok = rows.filter(Boolean)
      if (ok.length) onChange?.([...list, ...ok])
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) ref.current?.click()
        }}
        style={{
          ...ui.clipBtn,
          color: list.length ? (t.primary || '#2563eb') : t.textMuted,
          fontWeight: list.length ? 800 : 500,
        }}
      >
        📎{list.length > 0 ? ` ${list.length}` : ''}
      </button>
      {!disabled && list.length > 0 && (
        <button
          type="button"
          title="Quitar último"
          onClick={(e) => {
            e.stopPropagation()
            onChange?.(list.slice(0, -1))
          }}
          style={{ ...ui.clipBtn, fontSize: 11, color: '#B91C1C' }}
        >
          ×
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
