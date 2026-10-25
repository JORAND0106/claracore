/**
 * Ícono «Archivos del esquema»: lista PNG / PDF / DXF con vista previa y descarga.
 */
import { useEffect, useState } from 'react'
import {
  downloadEsquemaAssetBlob,
  getEsquemaAssetTempUrl,
  listEsquemaAssets,
} from './esquemaAssetsApi.js'

const KIND_LABEL = {
  png: 'PNG',
  pdf: 'PDF',
  dxf: 'DXF',
  scene: 'Dibujo editable',
  memoria: 'Memoria (PNG)',
  despiece: 'Despiece (PNG)',
}

export default function EsquemaArchivosMenu({
  token,
  contratoId,
  modulo,
  reporteId = null,
  registroId = null,
  files: filesProp = null,
  size = 28,
  style = null,
}) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState(Array.isArray(filesProp) ? filesProp : [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (Array.isArray(filesProp)) setFiles(filesProp)
  }, [filesProp])

  const load = async () => {
    if (!token || contratoId == null) return
    setBusy(true)
    setErr('')
    try {
      const res = await listEsquemaAssets({
        token,
        contratoId,
        modulo,
        reporteId,
        registroId,
      })
      setFiles(Array.isArray(res?.files) ? res.files : [])
    } catch (e) {
      setErr(e?.message || 'No se pudieron listar los archivos')
      setFiles([])
    } finally {
      setBusy(false)
    }
  }

  const onOpen = async () => {
    const next = !open
    setOpen(next)
    if (next && !filesProp) await load()
  }

  const onDownload = async (f) => {
    setErr('')
    try {
      // Enlace temporal (vence en minutos) tras verificar permiso.
      const tmp = await getEsquemaAssetTempUrl({
        token,
        contratoId,
        blobPath: f.blob_path || f.path,
        ttlSeconds: 300,
      })
      if (tmp?.url) {
        window.open(tmp.url, '_blank', 'noopener,noreferrer')
        return
      }
      const blob = await downloadEsquemaAssetBlob({
        token,
        contratoId,
        blobPath: f.blob_path || f.path,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = f.nombre || f.name || 'esquema.bin'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e?.status === 403
        ? 'Sin permiso para este archivo'
        : (e?.message || 'No se pudo descargar'))
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...(style || {}) }}>
      <button
        type="button"
        title="Archivos del esquema"
        aria-label="Archivos del esquema"
        onClick={(e) => {
          e.stopPropagation()
          void onOpen()
        }}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: '1px solid #cbd5e1',
          background: '#fff',
          color: '#0f172a',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.5),
          lineHeight: 1,
          padding: 0,
          boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
        }}
      >
        📁
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: size + 4,
            zIndex: 40,
            minWidth: 240,
            maxWidth: 320,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
            padding: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', marginBottom: 6 }}>
            Archivos del esquema
          </div>
          {busy && <div style={{ fontSize: 12, color: '#64748b' }}>Cargando…</div>}
          {err && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 6 }}>{err}</div>}
          {!busy && !files.length && (
            <div style={{ fontSize: 12, color: '#64748b' }}>Sin archivos aún.</div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {files.map((f) => (
              <li
                key={f.blob_path || f.path || f.nombre}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 4px',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: 12,
                }}
              >
                <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {KIND_LABEL[f.kind] || f.kind || 'Archivo'}
                  {f.nombre ? ` · ${f.nombre}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void onDownload(f)}
                  style={{
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  Descargar
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: 6,
              width: '100%',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
