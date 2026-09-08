import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom } from '../../theme/adminPanelTheme'
import {
  deleteDocumento,
  documentoArchivoPath,
  fetchBlobUrl,
  uploadDocumento,
} from './subcontratistasApi'
import { periodoFromCorte } from './subcontratistasDocsHelpers'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Pago de Seguridad Social ligado a un corte concreto (corte_id + período YYYY-MM).
 * Misma interacción: clic en la fila / adjuntar → queda registrado contra el corte.
 */
export default function CorteSsBlock({
  theme,
  token,
  subId,
  corte,
  canEdit = true,
  onMsg,
  onUploaded,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const cssVars = subcontratistasSheetCssVars(tTok)
  const periodo = periodoFromCorte(corte)
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const fileRef = useRef(null)
  const previewUrlRef = useRef(null)

  const cargar = useCallback(async () => {
    if (!subId) return
    if (!corte?.id && !periodo) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subcontratistas/${subId}/documentos?tipo=seguridad_social`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const all = (await res.json()) || []
      const match = (corte?.id != null
        ? all.find((r) => Number(r.corte_id) === Number(corte.id))
        : null)
        || all.find((r) => String(r.periodo || '') === periodo)
        || null
      setDoc(match)
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo cargar SS del corte.' })
    } finally {
      setLoading(false)
    }
  }, [subId, corte?.id, periodo, token, onMsg])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const pickFile = () => {
    if (!canEdit || busy) return
    if (fileRef.current) {
      fileRef.current.value = ''
      fileRef.current.click()
    }
  }

  const onFile = async (file) => {
    if (!file) return
    if (!periodo) {
      onMsg?.({ type: 'error', text: 'El corte no tiene fecha de inicio válida para el período SS.' })
      return
    }
    setBusy(true)
    try {
      await uploadDocumento(subId, {
        tipo: 'seguridad_social',
        archivo: file,
        periodo,
        corte_id: corte?.id != null ? corte.id : undefined,
        marcar_vigente: true,
      }, token)
      onMsg?.({ type: 'success', text: `Planilla SS ${periodo} registrada en el corte.` })
      await cargar()
      onUploaded?.()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const eliminar = async () => {
    if (!doc?.id || !canEdit) return
    if (!window.confirm('¿Eliminar la planilla de Seguridad Social de este corte?')) return
    setBusy(true)
    try {
      await deleteDocumento(subId, doc.id, token)
      onMsg?.({ type: 'success', text: 'Planilla SS eliminada.' })
      setDoc(null)
      onUploaded?.()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const abrirPreview = async () => {
    if (!doc) return
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true, loading: true, error: '',
      nombre: doc.nombre_archivo || 'Planilla SS',
      mime: doc.mime_type || '',
      blobUrl: null,
    })
    try {
      const { blobUrl, mime } = await fetchBlobUrl(documentoArchivoPath(subId, doc.id), token)
      previewUrlRef.current = blobUrl
      setPreview((p) => ({ ...p, loading: false, blobUrl, mime: mime || p.mime }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error' }))
    }
  }

  return (
    <div style={{ marginTop: 16, ...cssVars }}>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div style={ui.sectionTitle}>Pago de Seguridad Social</div>
      <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted, marginBottom: 8 }}>
        Planilla del período {periodo || '—'} correspondiente a este corte.
        {canEdit ? ' Clic en la fila para adjuntar o reemplazar.' : ''}
      </div>
      <div style={{ ...ui.sheetWrap, maxHeight: 'none' }}>
        <table style={ui.sheetTable}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Documento', 'Período', 'Archivo', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Cargando…</td>
              </tr>
            ) : (
              <tr
                onClick={() => { if (!doc && canEdit) pickFile() }}
                style={{ cursor: !doc && canEdit ? 'pointer' : 'default' }}
                onMouseEnter={(e) => {
                  if (!doc && canEdit) e.currentTarget.style.background = `${tTok.primary}12`
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={ui.td}>Pago de Seguridad Social</td>
                <td style={ui.td}>{periodo || '—'}</td>
                <td style={ui.td}>
                  {doc ? (
                    <button
                      type="button"
                      style={S.btn('ghost', true)}
                      onClick={(e) => { e.stopPropagation(); abrirPreview() }}
                    >
                      {doc.nombre_archivo || 'Ver archivo'}
                    </button>
                  ) : (
                    <span style={{ color: ui.textMuted }}>
                      {canEdit ? 'Clic para cargar planilla…' : 'Sin planilla'}
                    </span>
                  )}
                </td>
                <td style={ui.td}>
                  <span style={{
                    fontSize: 'var(--cc-caption)',
                    fontWeight: 700,
                    color: doc ? '#22c55e' : '#ef4444',
                  }}
                  >
                    {doc ? 'Cargado' : 'Pendiente'}
                  </span>
                </td>
                <td style={ui.td} onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={S.btn('secondary', true)}
                        disabled={busy}
                        onClick={pickFile}
                      >
                        {doc ? 'Reemplazar' : 'Adjuntar'}
                      </button>
                      {doc && (
                        <button
                          type="button"
                          style={S.btn('danger', true)}
                          disabled={busy}
                          onClick={eliminar}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SoportePreviewModal
        t={tTok}
        open={preview.open}
        loading={preview.loading}
        error={preview.error}
        nombre={preview.nombre}
        mime={preview.mime}
        blobUrl={preview.blobUrl}
        onClose={() => {
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
          }
          setPreview((p) => ({ ...p, open: false, blobUrl: null }))
        }}
        onDownload={() => {
          if (!preview.blobUrl) return
          const a = document.createElement('a')
          a.href = preview.blobUrl
          a.download = preview.nombre || 'planilla-ss'
          a.click()
        }}
      />
    </div>
  )
}
