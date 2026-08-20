import { useEffect, useRef, useState } from 'react'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import PptoImageSourceBar from '../presupuesto/PptoImageSourceBar'
import { imagenSrc, openImageInNewTab } from './imagenUtils'
import { MAX_FOTOS_BITACORA } from './bitacoraConstants'

/**
 * Adjuntos de bitácora: archivo, galería (con detección de duplicados en backend),
 * Ctrl+V y dibujo de esquema. Máximo 4 fotografías por entrada.
 */
export default function BitacoraAdjuntos({
  t,
  api,
  imagenes = [],
  onChange,
  onUploadPersisted,
  disabled = false,
  entradaId = null,
}) {
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [galeriaItems, setGaleriaItems] = useState([])
  const [galeriaQ, setGaleriaQ] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pasteZoneRef = useRef(null)

  const list = Array.isArray(imagenes) ? imagenes : []

  const pushLocal = (im) => {
    if (list.length >= MAX_FOTOS_BITACORA) {
      setError(`Máximo ${MAX_FOTOS_BITACORA} fotografías por entrada de bitácora`)
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
    if (!file || !file.type?.startsWith('image/')) return
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
        setError(e.message || 'No se pudo adjuntar la imagen')
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

  const onPickFiles = (files) => {
    Array.from(files || []).forEach((f) => { void addFile(f, 'archivo') })
  }

  const onPasteClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((x) => x.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const file = new File([blob], `pegar-${Date.now()}.png`, { type })
        await addFile(file, 'pegar')
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

  const pickFromGaleria = (item) => {
    if (list.length >= MAX_FOTOS_BITACORA) {
      setError(`Máximo ${MAX_FOTOS_BITACORA} fotografías por entrada de bitácora`)
      return
    }
    // Reutilizar referencia existente (sin re-subir → evita duplicado por hash)
    pushLocal({
      nombre: item.nombre || 'galeria.png',
      blob_path: item.blob_path,
      data_uri: item.data_uri,
      url: item.url,
      mime_type: item.mime_type || 'image/png',
      content_hash: item.content_hash,
      origen: 'galeria',
      created_at: new Date().toISOString(),
    })
    setGaleriaOpen(false)
  }

  const removeAt = (idx) => {
    if (disabled) return
    onChange?.(list.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div style={{ fontWeight: 700, color: t.text, marginBottom: 8, fontSize: 'var(--cc-body)' }}>
        Gráficos / fotografías
        <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 8 }}>
          ({list.length}/{MAX_FOTOS_BITACORA})
        </span>
      </div>
      {!disabled && (
        <PptoImageSourceBar
          t={t}
          disabled={busy || list.length >= MAX_FOTOS_BITACORA}
          onPickFiles={onPickFiles}
          onOpenGaleria={() => void openGaleria()}
          onPasteClipboard={onPasteClipboard}
          onFocusPasteZone={() => pasteZoneRef.current?.focus()}
          onOpenEsquema={() => setEsquemaOpen(true)}
          hint={`Máximo ${MAX_FOTOS_BITACORA} fotos · archivo, galería, Ctrl+V o esquema`}
          galeriaTitle="Galería de la Bitácora (fotos ya usadas en este contrato)"
        />
      )}
      <div
        ref={pasteZoneRef}
        tabIndex={0}
        style={{
          marginTop: 8,
          minHeight: 8,
          outline: 'none',
        }}
        aria-label="Zona de pegado de imágenes"
      />
      {error && (
        <div style={{ color: '#B91C1C', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{error}</div>
      )}
      {list.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}>
          {list.map((im, idx) => {
            const src = imagenSrc(im)
            return (
              <div
                key={`${im.blob_path || im.nombre || 'im'}-${idx}`}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: t.bg,
                }}
              >
                {src ? (
                  <button
                    type="button"
                    onClick={() => openImageInNewTab(im)}
                    style={{ display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'zoom-in' }}
                  >
                    <img
                      src={src}
                      alt={im.nombre || 'foto'}
                      style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ) : (
                  <div style={{ height: 90, display: 'grid', placeItems: 'center', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                    Sin vista previa
                  </div>
                )}
                <div style={{
                  padding: '6px 8px', fontSize: 'var(--cc-sm)', color: t.textMuted,
                  display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {im.origen || 'archivo'}
                  </span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      style={{
                        border: 'none', background: 'transparent', color: '#B91C1C',
                        cursor: 'pointer', fontWeight: 700,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title="Esquema · Bitácora de Obra"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: t.text }}>Galería Bitácora</div>
              <button type="button" onClick={() => setGaleriaOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.text }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={galeriaQ}
                onChange={(e) => setGaleriaQ(e.target.value)}
                placeholder="Buscar…"
                style={{
                  flex: 1, background: t.bg, color: t.text, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: '8px 10px',
                }}
              />
              <button
                type="button"
                onClick={() => void openGaleria()}
                style={{
                  background: t.primary, color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Buscar
              </button>
            </div>
            {galeriaItems.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>No hay fotos previas en la bitácora.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {galeriaItems.map((it, i) => {
                  const src = imagenSrc(it)
                  return (
                    <button
                      key={`${it.blob_path || it.url || i}`}
                      type="button"
                      onClick={() => pickFromGaleria(it)}
                      style={{
                        border: `1px solid ${t.border}`, borderRadius: 8, padding: 0,
                        background: t.bg, cursor: 'pointer', overflow: 'hidden',
                      }}
                    >
                      {src ? (
                        <img src={src} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ height: 80, display: 'grid', placeItems: 'center', color: t.textMuted, fontSize: 11 }}>—</div>
                      )}
                      <div style={{ padding: 4, fontSize: 11, color: t.textMuted }}>{it.fecha || ''}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
