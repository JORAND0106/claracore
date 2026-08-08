import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import EsquemaEditorModal from '../../components/esquema/EsquemaEditorModal'
import { dataUriEsquemaAFile } from '../sicoe-obra/sicoeGraficosHelpers'
import PptoImageSourceBar from './PptoImageSourceBar'
import PptoPieFotoField from './PptoPieFotoField'
import PptoSicoeGaleriaPicker from './PptoSicoeGaleriaPicker'
import { imagenDesdeClipboard, imagenDesdePasteEvent } from './pptoPasteImage'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

function origenLabel(origen) {
  if (origen === 'paste') return 'Ctrl+V'
  if (origen === 'galeria') return 'Galería'
  if (origen === 'esquema') return 'Esquema'
  return 'Archivo'
}

/**
 * Crear grupo de gráfico desde selección: archivo / galería / Ctrl+V / esquema + pie manual.
 */
export default function PptoGraficosModal({
  open,
  onClose,
  t,
  seleccionados,
  registros,
  contratoId,
  token,
  API,
  onSaved,
}) {
  const [imagenes, setImagenes] = useState([])
  const [pieFoto, setPieFoto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [exito, setExito] = useState(null)
  const [galeriaOpen, setGaleriaOpen] = useState(false)
  const [esquemaOpen, setEsquemaOpen] = useState(false)
  const dropRef = useRef(null)

  const regsSel = useMemo(() => {
    const ids = seleccionados instanceof Set ? [...seleccionados] : []
    const byId = new Map((registros || []).map((r) => [r.id, r]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  }, [seleccionados, registros])

  const itemsInvolucrados = useMemo(() => {
    const keys = new Map()
    for (const r of regsSel) {
      const cap = String(r.capitulo || '').trim()
      const it = String(r.item || '').trim()
      if (!cap || !it) continue
      const k = `${cap} · ${it}`
      keys.set(k, (keys.get(k) || 0) + 1)
    }
    return [...keys.entries()].map(([label, n]) => ({ label, n }))
  }, [regsSel])

  useEffect(() => {
    if (!open) {
      setImagenes([])
      setPieFoto('')
      setError('')
      setOkMsg('')
      setExito(null)
      setGuardando(false)
      setGaleriaOpen(false)
      setEsquemaOpen(false)
      return
    }
    // Enfocar zona de pegado para que Ctrl+V por teclado funcione de inmediato.
    const tmr = setTimeout(() => dropRef.current?.focus?.(), 80)
    return () => clearTimeout(tmr)
  }, [open])

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
        origen: 'galeria',
      },
    ])
    setGaleriaOpen(false)
  }, [])

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
      const file = await dataUriEsquemaAFile(dataUrl, 'esquema-ppto')
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

  useEffect(() => {
    if (!open || galeriaOpen || esquemaOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !guardando) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [open, galeriaOpen, esquemaOpen, guardando, onClose, onPaste])

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
    if (!regsSel.length) {
      setError('Seleccione al menos un registro')
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
    setOkMsg('')
    try {
      const uploaded = []
      for (const img of imagenes) {
        if (img.url && !img.file) {
          uploaded.push({
            url: img.url,
            blob_path: null,
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
        const data = await up.json()
        uploaded.push({
          url: data.url,
          blob_path: data.blob_path,
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
          presupuesto_ids: regsSel.map((r) => r.id),
          imagenes: uploaded,
          pie_foto: String(pieFoto).trim(),
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error al guardar grupo (${res.status})`)
      }
      const data = await res.json()
      const resumenExito = {
        grupoId: data.grupo_id,
        imagenes: data.imagenes || uploaded.length,
        registros: data.registros || regsSel.length,
        pieFoto: data.pie_foto || String(pieFoto).trim(),
        items: Array.isArray(data.items) && data.items.length
          ? data.items
          : itemsInvolucrados.map((it) => it.label),
        thumbUrl: data.thumb_url || uploaded[0]?.url || imagenes[0]?.previewUrl || null,
        presupuestoIds: Array.isArray(data.presupuesto_ids)
          ? data.presupuesto_ids
          : regsSel.map((r) => r.id),
      }
      setExito(resumenExito)
      setOkMsg('')
      onSaved?.(data)
    } catch (err) {
      setError(err?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!open) return null

  const canSave = imagenes.length && regsSel.length && pieOk && !guardando

  if (exito) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 2100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          role="dialog"
          aria-label="Gráfico asociado"
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            width: 520,
            maxWidth: '96vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            padding: 22,
          }}
        >
          <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: '#15803D', marginBottom: 8 }}>
            ✓ Gráfico asociado correctamente
          </div>
          <div style={{ fontSize: cc.sm, color: t.textMuted, marginBottom: 14, lineHeight: 1.45 }}>
            El grupo quedó guardado y vinculado a los registros seleccionados.
            Al exportar la memoria del ítem, el gráfico aparecerá tras la subtabla correspondiente.
          </div>
          {exito.thumbUrl && (
            <div
              style={{
                borderRadius: 10,
                overflow: 'hidden',
                border: `1px solid ${t.border}`,
                marginBottom: 12,
                background: '#fff',
                height: 140,
              }}
            >
              <img src={exito.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div
            style={{
              background: t.bg,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              padding: 12,
              fontSize: cc.sm,
              color: t.text,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginBottom: 16,
            }}
          >
            <div><strong>{exito.imagenes}</strong> gráfico(s) · <strong>{exito.registros}</strong> registro(s)</div>
            <div><strong>Ítems:</strong> {(exito.items || []).join(', ') || '—'}</div>
            <div><strong>Pie de foto:</strong> {exito.pieFoto || '—'}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onClose?.()}
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
          background: 'rgba(0,0,0,0.55)',
          zIndex: 2100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => !guardando && onClose?.()}
      >
        <div
          role="dialog"
          aria-label="Agregar gráficos"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            width: 720,
            maxWidth: '96vw',
            maxHeight: '92vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            padding: 22,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text }}>Nuevo grupo de gráfico</div>
              <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 4 }}>
                {regsSel.length} registro{regsSel.length !== 1 ? 's' : ''} · archivo, galería o Ctrl+V.
              </div>
            </div>
            <button
              type="button"
              onClick={() => !guardando && onClose?.()}
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

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: cc.sm, fontWeight: 700, color: t.primary, marginBottom: 6 }}>
              Ítems involucrados ({itemsInvolucrados.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {itemsInvolucrados.map((it) => (
                <span
                  key={it.label}
                  style={{
                    fontSize: cc.caption,
                    background: t.primary + '18',
                    color: t.primary,
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontWeight: 700,
                  }}
                >
                  {it.label} ({it.n})
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              marginBottom: 12,
              maxHeight: 160,
            }}
          >
            <div
              style={{
                padding: `${cc.padSm} ${cc.pad}`,
                background: t.bg,
                borderBottom: `1px solid ${t.border}`,
                fontSize: cc.sm,
                fontWeight: 700,
                color: t.textMuted,
              }}
            >
              Registros seleccionados
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cc.sm }}>
                <thead>
                  <tr style={{ background: t.bg, position: 'sticky', top: 0 }}>
                    {['Ítem', 'Tramo', 'Id_Pol'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          color: t.textMuted,
                          fontWeight: 700,
                          fontSize: cc.caption,
                          borderBottom: `1px solid ${t.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regsSel.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.item}</td>
                      <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.tramo || '—'}</td>
                      <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.id_pol || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              padding: 14,
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

          {error && (
            <div style={{ color: '#B91C1C', fontSize: cc.sm, marginBottom: 8, fontWeight: 600 }}>{error}</div>
          )}
          {okMsg && (
            <div style={{ color: '#15803D', fontSize: cc.sm, marginBottom: 8, fontWeight: 600 }}>{okMsg}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={guardando}
              onClick={() => onClose?.()}
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
              Cancelar
            </button>
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
              {guardando ? '⏳ Guardando…' : 'Crear grupo'}
            </button>
          </div>
        </div>
      </div>

      <PptoSicoeGaleriaPicker
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        API={API}
        onSelect={addGaleriaUrl}
      />

      {esquemaOpen && (
        <EsquemaEditorModal
          t={t}
          title="Dibujar esquema · grupo de gráfico"
          onClose={() => setEsquemaOpen(false)}
          onSave={guardarEsquema}
        />
      )}
    </>
  )
}
