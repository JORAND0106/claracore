import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { dataUriEsquemaAFile } from '../sicoe-obra/sicoeGraficosHelpers'
import PptoImageSourceBar from './PptoImageSourceBar'
import PptoPieFotoField from './PptoPieFotoField'
import PptoGraficosGaleriaPicker from './PptoGraficosGaleriaPicker'
import { imagenDesdeClipboard, imagenDesdePasteEvent } from './pptoPasteImage'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

/** Mensaje corto al cerrar el popup sin cargar gráfico (alternativa A en grilla). */
export const PPTO_SINCRO_CERRAR_SIN_GRAFICO_MSG =
  'Podrá asociar el gráfico más adelante desde la grilla. ¿Salir sin cargarlo?'

function origenLabel(origen) {
  if (origen === 'paste') return 'Ctrl+V'
  if (origen === 'galeria') return 'Galería'
  if (origen === 'esquema') return 'Esquema'
  return 'Archivo'
}

/**
 * Popup de recepción de lote SicoeCAD (alternativa B):
 * confirmación concreta + cargar gráfico asociado a todos los IDs del lote.
 */
export default function PptoSincroSicoeLoteModal({
  open,
  data,
  t,
  contratoId,
  token,
  API,
  onDismiss,
  onSaved,
}) {
  const [imagenes, setImagenes] = useState([])
  const [pieFoto, setPieFoto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(null)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const dropRef = useRef(null)
  const graficoCreadoRef = useRef(false)

  const nRec = Number(data?.insertados ?? 0)
  const nDwg = data?.enviados == null ? null : Number(data.enviados)
  const presupuestoIds = useMemo(() => {
    const raw = data?.presupuesto_ids
    if (!Array.isArray(raw)) return []
    return raw.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
  }, [data?.presupuesto_ids])

  const puedeCargar = presupuestoIds.length > 0

  useEffect(() => {
    if (!open) {
      setImagenes([])
      setPieFoto('')
      setError('')
      setExito(null)
      setGuardando(false)
      setGaleriaOpen(false)
      setEsquemaOpen(false)
      graficoCreadoRef.current = false
      return
    }
    const tmr = setTimeout(() => dropRef.current?.focus?.(), 80)
    return () => clearTimeout(tmr)
  }, [open, data?.ts])

  const addFiles = useCallback(async (fileList, origen = 'upload') => {
    const files = [...(fileList || [])].filter((f) => f && f.type?.startsWith('image/'))
    if (!files.length) return
    setError('')
    const next = []
    for (const file of files) {
      try {
        const prepared = await prepararImagenParaUpload(file)
        const named = prepared instanceof File
          ? prepared
          : new File([prepared], file.name || `grafico-${Date.now()}.jpg`, {
            type: prepared.type || file.type || 'image/jpeg',
          })
        const previewUrl = URL.createObjectURL(named)
        next.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file: named,
          previewUrl,
          url: null,
          origen,
        })
      } catch (err) {
        setError(err?.message || 'No se pudo preparar la imagen')
      }
    }
    if (next.length) setImagenes((prev) => [...prev, ...next])
  }, [])

  const addGaleriaUrl = useCallback((item) => {
    if (!item?.url) return
    setImagenes((prev) => [
      ...prev,
      {
        id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        file: null,
        previewUrl: item.url,
        url: item.url,
        blob_path: item.blob_path || null,
        origen: 'galeria',
      },
    ])
    const piePick = String(item.pie_foto || item.descripcion || '').trim()
    if (piePick && !String(pieFoto || '').trim()) setPieFoto(piePick)
    setGaleriaOpen(false)
  }, [pieFoto])

  const pegarDesdeClipboard = useCallback(async () => {
    try {
      const file = await imagenDesdeClipboard()
      if (!file) {
        setError('El portapapeles no tiene una imagen. Copie una captura e intente de nuevo.')
        dropRef.current?.focus?.()
        return
      }
      await addFiles([file], 'paste')
    } catch {
      setError('No se pudo leer el portapapeles. Use Ctrl+V con el popup activo, o elija archivo.')
      dropRef.current?.focus?.()
    }
  }, [addFiles])

  const guardarEsquema = useCallback(async (dataUrl) => {
    try {
      const file = await dataUriEsquemaAFile(dataUrl, 'esquema-lote')
      if (!file) throw new Error('No se pudo convertir el esquema')
      setEsquemaOpen(false)
      await addFiles([file], 'esquema')
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el esquema')
    }
  }, [addFiles])

  const onPaste = useCallback((e) => {
    const named = imagenDesdePasteEvent(e)
    if (!named) return
    e.preventDefault()
    e.stopPropagation()
    void addFiles([named], 'paste')
  }, [addFiles])

  const intentarCerrar = useCallback(() => {
    if (guardando || esquemaOpen) return
    if (exito || graficoCreadoRef.current) {
      onDismiss?.()
      return
    }
    if (!window.confirm(PPTO_SINCRO_CERRAR_SIN_GRAFICO_MSG)) return
    onDismiss?.()
  }, [guardando, esquemaOpen, exito, onDismiss])

  useEffect(() => {
    if (!open || galeriaOpen || esquemaOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !guardando) intentarCerrar()
    }
    window.addEventListener('keydown', onKey)
    if (!exito) window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [open, galeriaOpen, esquemaOpen, guardando, intentarCerrar, onPaste, exito])

  const removeImg = (id) => {
    setImagenes((prev) => {
      const row = prev.find((x) => x.id === id)
      if (row?.previewUrl && row.file) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }

  const pieOk = !!String(pieFoto || '').trim()

  const guardar = async () => {
    if (!contratoId || !token) return
    if (!presupuestoIds.length) {
      setError('No hay IDs del lote para asociar el gráfico')
      return
    }
    if (!imagenes.length) {
      setError('Aporte al menos una imagen (archivo, galería o Ctrl+V)')
      return
    }
    if (!pieOk) {
      setError('El pie de foto es obligatorio')
      return
    }
    setGuardando(true)
    setError('')
    try {
      const uploaded = []
      for (const img of imagenes) {
        if (img.url && !img.file) {
          uploaded.push({
            url: img.url,
            blob_path: img.blob_path || null,
            origen: img.origen || 'galeria',
            orden: uploaded.length,
          })
          continue
        }
        const fd = new FormData()
        fd.append('file', img.file, img.file.name || 'grafico.jpg')
        const up = await fetch(`${API}/presupuesto/${contratoId}/graficos/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        if (!up.ok) {
          const msg = await up.text().catch(() => '')
          throw new Error(msg || `Error al subir imagen (${up.status})`)
        }
        const upData = await up.json()
        uploaded.push({
          url: upData.url,
          blob_path: upData.blob_path,
          origen: img.origen || 'upload',
          orden: uploaded.length,
        })
      }
      const res = await fetch(`${API}/presupuesto/${contratoId}/graficos/grupos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          presupuesto_ids: presupuestoIds,
          imagenes: uploaded,
          pie_foto: String(pieFoto).trim(),
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error al guardar grupo (${res.status})`)
      }
      const saved = await res.json()
      graficoCreadoRef.current = true
      const resumenExito = {
        grupoId: saved.grupo_id,
        imagenes: saved.imagenes || uploaded.length,
        registros: saved.registros || presupuestoIds.length,
        pieFoto: saved.pie_foto || String(pieFoto).trim(),
        thumbUrl: saved.thumb_url || uploaded[0]?.url || imagenes[0]?.previewUrl || null,
        presupuestoIds: Array.isArray(saved.presupuesto_ids)
          ? saved.presupuesto_ids
          : presupuestoIds,
      }
      setExito(resumenExito)
      onSaved?.(saved)
    } catch (err) {
      setError(err?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!open || !data) return null

  const canSave = puedeCargar && imagenes.length && pieOk && !guardando
  const mismatch = nDwg != null && nDwg !== nRec

  if (exito) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.68)',
          zIndex: 4100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          role="dialog"
          aria-label="Gráfico asociado al lote"
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            width: 480,
            maxWidth: '96vw',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            padding: 22,
          }}
        >
          <CcModalBrandHeader theme={t} />
          <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: '#15803D', marginBottom: 8 }}>
            ✓ Gráfico asociado al lote
          </div>
          <div style={{ fontSize: cc.sm, color: t.textMuted, marginBottom: 14, lineHeight: 1.45 }}>
            Vinculado a los <strong>{exito.registros}</strong> registro(s) recibidos.
          </div>
          {exito.thumbUrl && (
            <div
              style={{
                borderRadius: 10,
                overflow: 'hidden',
                border: `1px solid ${t.border}`,
                marginBottom: 12,
                background: '#fff',
                height: 120,
              }}
            >
              <img src={exito.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ fontSize: cc.sm, color: t.text, marginBottom: 16 }}>
            <strong>Pie:</strong> {exito.pieFoto || '—'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onDismiss?.()}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 18px',
                fontWeight: 700,
                fontSize: cc.sm,
                cursor: 'pointer',
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.68)',
          zIndex: 4100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sincro-sicoe-titulo"
        onClick={() => intentarCerrar()}
      >
        <div
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 22,
            width: 560,
            maxWidth: '96vw',
            maxHeight: '92vh',
            overflow: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
            <div>
              <div
                id="sincro-sicoe-titulo"
                style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text, lineHeight: 1.3 }}
              >
                Lote recibido de SicoeCAD
              </div>
              <div style={{ fontSize: 'var(--cc-body)', color: t.text, marginTop: 6, fontWeight: 600 }}>
                <strong style={{ color: t.primary, fontSize: 'var(--cc-h2)' }}>
                  {nRec.toLocaleString('es-CO')}
                </strong>
                {' '}registro{nRec !== 1 ? 's' : ''}
                {nDwg != null && (
                  <span style={{ fontWeight: 500, color: t.textMuted, fontSize: cc.sm }}>
                    {' '}· DWG: {nDwg.toLocaleString('es-CO')}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={intentarCerrar}
              disabled={guardando}
              style={{
                background: 'transparent',
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: guardando ? 'not-allowed' : 'pointer',
                color: t.textMuted,
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>

          {mismatch && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 10px',
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 8,
                fontSize: cc.sm,
                color: '#92400E',
                fontWeight: 600,
              }}
            >
              El conteo del DWG y el almacenado no coinciden.
            </div>
          )}

          {puedeCargar ? (
            <>
              <div style={{ fontSize: cc.sm, fontWeight: 700, color: t.primary, marginBottom: 8 }}>
                Cargar gráfico del lote (opcional)
              </div>
              <div style={{ fontSize: cc.caption, color: t.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
                Se asociará a los {presupuestoIds.length.toLocaleString('es-CO')} registros de este lote.
              </div>

              <PptoPieFotoField
                t={t}
                value={pieFoto}
                onChange={setPieFoto}
                disabled={guardando}
                contratoId={contratoId}
                token={token}
                API={API}
              />

              <div
                ref={dropRef}
                tabIndex={0}
                onPaste={onPaste}
                style={{
                  border: `2px dashed ${t.border}`,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                  background: t.bg,
                  outline: 'none',
                }}
              >
                <div style={{ marginBottom: imagenes.length ? 10 : 0 }}>
                  <PptoImageSourceBar
                    t={t}
                    disabled={guardando}
                    onPickFiles={(files) => void addFiles(files, 'upload')}
                    onOpenGaleria={() => setGaleriaOpen(true)}
                    onPasteClipboard={pegarDesdeClipboard}
                    onFocusPasteZone={() => dropRef.current?.focus?.()}
                    onOpenEsquema={() => setEsquemaOpen(true)}
                    hint="Archivo, galería de gráficos, Ctrl+V o esquema"
                    galeriaTitle="Buscar Galería · gráficos de Presupuesto"
                  />
                </div>
                {imagenes.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {imagenes.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          position: 'relative',
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: `1px solid ${t.border}`,
                          background: '#fff',
                          aspectRatio: '4/3',
                        }}
                      >
                        <img
                          src={img.previewUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImg(img.id)}
                          disabled={guardando}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            border: 'none',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.55)',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                        <span
                          style={{
                            position: 'absolute',
                            left: 4,
                            bottom: 4,
                            fontSize: 10,
                            background: 'rgba(0,0,0,0.5)',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          {origenLabel(img.origen)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: cc.sm, color: t.textMuted, marginBottom: 12, lineHeight: 1.4 }}>
              Para asociar un gráfico a este lote, use la selección en la grilla.
            </div>
          )}

          {error && (
            <div style={{ color: '#B91C1C', fontSize: cc.sm, marginBottom: 8, fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={guardando}
              onClick={intentarCerrar}
              style={{
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: cc.sm,
                color: t.text,
                cursor: guardando ? 'not-allowed' : 'pointer',
              }}
            >
              Cerrar
            </button>
            {puedeCargar && (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void guardar()}
                style={{
                  background: canSave ? t.primary : t.border,
                  color: canSave ? '#fff' : t.textMuted,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontWeight: 700,
                  fontSize: cc.sm,
                  cursor: canSave ? 'pointer' : 'not-allowed',
                }}
              >
                {guardando ? '⏳ Guardando…' : 'Asociar gráfico al lote'}
              </button>
            )}
          </div>
        </div>
      </div>

      <PptoGraficosGaleriaPicker
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        onSelect={addGaleriaUrl}
        zIndex={4200}
      />

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title="Dibujar esquema · lote SicoeCAD"
          onClose={() => setEsquemaOpen(false)}
          onSave={guardarEsquema}
        />
      )}
    </>
  )
}
