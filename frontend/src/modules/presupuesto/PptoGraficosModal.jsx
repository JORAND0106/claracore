import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepararImagenParaUpload } from '../../comprimirImagen'
import { buildCaptionPieFoto } from './pptoGraficosCaption'

const cc = {
  caption: 'var(--cc-caption)',
  sm: 'var(--cc-sm)',
  body: 'var(--cc-body)',
  pad: 'var(--cc-space-3)',
  padSm: 'var(--cc-space-2)',
}

/**
 * Popup: resumen de selección + carga de gráficos (archivo o Ctrl+V).
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
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const fileRef = useRef(null)
  const pasteZoneRef = useRef(null)

  const regsSel = useMemo(() => {
    const ids = seleccionados instanceof Set ? [...seleccionados] : []
    const byId = new Map((registros || []).map((r) => [r.id, r]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  }, [seleccionados, registros])

  const captionPreview = useMemo(() => buildCaptionPieFoto(regsSel), [regsSel])

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
      setError('')
      setOkMsg('')
      setGuardando(false)
    }
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
          origen,
        })
      } catch (err) {
        setError(err?.message || 'No se pudo preparar la imagen')
      }
    }
    if (next.length) setImagenes((prev) => [...prev, ...next])
  }, [])

  const onPaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items?.length) return
    let imageItem = null
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        imageItem = item
        break
      }
    }
    if (!imageItem) return
    e.preventDefault()
    e.stopPropagation()
    const file = imageItem.getAsFile()
    if (!file) return
    const named = new File(
      [file],
      file.name || `captura-${Date.now()}.png`,
      { type: file.type || 'image/png' },
    )
    void addFiles([named], 'paste')
  }, [addFiles])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !guardando) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    // Escucha paste global mientras el modal está abierto (capturas Ctrl+V).
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [open, guardando, onClose, onPaste])

  const removeImg = (id) => {
    setImagenes((prev) => {
      const row = prev.find((x) => x.id === id)
      if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }

  const guardar = async () => {
    if (!contratoId || !token) return
    if (!regsSel.length) {
      setError('Seleccione al menos un registro')
      return
    }
    if (!imagenes.length) {
      setError('Cargue al menos una imagen (archivo o Ctrl+V)')
      return
    }
    setGuardando(true)
    setError('')
    setOkMsg('')
    try {
      const uploaded = []
      for (const img of imagenes) {
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
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Error al guardar grupo (${res.status})`)
      }
      const data = await res.json()
      setOkMsg(
        `Grupo guardado: ${data.imagenes || uploaded.length} gráfico(s) → ${itemsInvolucrados.length} ítem(s).`,
      )
      onSaved?.(data)
      setTimeout(() => onClose?.(), 700)
    } catch (err) {
      setError(err?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  if (!open) return null

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
      onClick={() => !guardando && onClose?.()}
    >
      <div
        ref={pasteZoneRef}
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
            <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text }}>Agregar gráficos</div>
            <div style={{ fontSize: cc.sm, color: t.textMuted, marginTop: 4 }}>
              {regsSel.length} registro{regsSel.length !== 1 ? 's' : ''} · se asociarán a todos los ítems del grupo.
              {' '}Pegue capturas con Ctrl+V o seleccione archivos.
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
            {!itemsInvolucrados.length && (
              <span style={{ fontSize: cc.sm, color: t.textMuted }}>Sin ítems válidos en la selección</span>
            )}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 12,
            maxHeight: 180,
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
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: cc.sm }}>
              <thead>
                <tr style={{ background: t.bg, position: 'sticky', top: 0 }}>
                  {['Cap.', 'Ítem', 'Tramo', 'Infra.', 'Abs', 'Id_Pol'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'left',
                        color: t.textMuted,
                        fontWeight: 700,
                        fontSize: cc.caption,
                        borderBottom: `1px solid ${t.border}`,
                        whiteSpace: 'nowrap',
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
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.capitulo}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.item}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.tramo || '—'}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.infraestructura || '—'}</td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>
                      {[r.abs_inicio, r.abs_final].filter(Boolean).join('–') || '—'}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: `1px solid ${t.border}` }}>{r.id_pol || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            fontSize: cc.caption,
            color: t.textMuted,
            fontStyle: 'italic',
            marginBottom: 12,
            lineHeight: 1.45,
            padding: '8px 10px',
            background: t.bg,
            borderRadius: 8,
            border: `1px dashed ${t.border}`,
          }}
        >
          Pie de foto (automático): {captionPreview}
        </div>

        <div
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: imagenes.length ? 10 : 0 }}>
            <button
              type="button"
              disabled={guardando}
              onClick={() => fileRef.current?.click()}
              style={{
                background: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 700,
                fontSize: cc.sm,
                cursor: guardando ? 'not-allowed' : 'pointer',
              }}
            >
              📁 Seleccionar archivo
            </button>
            <span style={{ fontSize: cc.sm, color: t.textMuted }}>
              o pegue aquí una captura (Ctrl+V)
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files, 'upload')
                e.target.value = ''
              }}
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
                    {img.origen === 'paste' ? 'Ctrl+V' : 'Archivo'}
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
            disabled={guardando || !imagenes.length || !regsSel.length}
            onClick={() => void guardar()}
            style={{
              background: imagenes.length && regsSel.length ? t.primary : t.border,
              color: imagenes.length && regsSel.length ? '#fff' : t.textMuted,
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: cc.sm,
              cursor: imagenes.length && regsSel.length && !guardando ? 'pointer' : 'not-allowed',
            }}
          >
            {guardando ? '⏳ Guardando…' : `Guardar ${imagenes.length || ''} gráfico(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
