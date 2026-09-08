import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom } from '../../theme/adminPanelTheme'
import {
  deleteDocumento,
  documentoArchivoPath,
  fetchBlobUrl,
  uploadDocumento,
} from './subcontratistasApi'
import {
  DOC_TIPO_LABEL,
  docTipoContractuales,
  emptyDocDraft,
} from './subcontratistasDocsHelpers'
import { subcontratistasSheetCssVars, subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Documentos Contractuales (Contrato Firmado + Propuesta Económica).
 * - Clic en fila vacía → selector de archivo → carga / stage
 * - Filas con documento: Eliminar + Reemplazar
 * - Sin botones «+Tipo» ni Seguridad Social (SS vive en el corte).
 */
export default function DocumentosCorteExcelBlock({
  theme,
  token,
  subId,
  canEdit = true,
  mode = 'live',
  stagedRows,
  onStagedChange,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const cssVars = subcontratistasSheetCssVars(tTok)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [histTipo, setHistTipo] = useState(null)
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)
  const fileInputRef = useRef(null)
  const pendingActionRef = useRef(null) // { tipo, replaceId?, stageLocalId? }

  const isStage = mode === 'stage'
  const list = isStage ? (stagedRows || []) : rows

  const cargar = async () => {
    if (isStage || !subId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subcontratistas/${subId}/documentos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const all = (await res.json()) || []
      setRows(all.filter((r) => r.tipo !== 'seguridad_social'))
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar los documentos.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isStage && subId) cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subId, isStage])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const setList = (next) => {
    if (isStage) onStagedChange?.(typeof next === 'function' ? next(list) : next)
    else setRows(next)
  }

  const vigentesPorTipo = useMemo(() => {
    const map = {}
    for (const meta of docTipoContractuales) {
      const ofTipo = list.filter((r) => !r._localId && r.tipo === meta.tipo)
      const vig = ofTipo.find((r) => r.vigente) || ofTipo[0] || null
      map[meta.tipo] = vig || null
      map[`${meta.tipo}__hist`] = ofTipo
      const staged = list.filter((r) => r._localId && r.tipo === meta.tipo)
      map[`${meta.tipo}__stage`] = staged[0] || null
    }
    return map
  }, [list])

  const displayRows = useMemo(() => {
    return docTipoContractuales.map((meta) => {
      if (isStage) {
        const staged = vigentesPorTipo[`${meta.tipo}__stage`]
        if (staged) return { ...staged, _meta: meta }
        return { _placeholder: true, tipo: meta.tipo, label: meta.label, _meta: meta }
      }
      const vig = vigentesPorTipo[meta.tipo]
      if (vig) return { ...vig, _meta: meta }
      return { _placeholder: true, tipo: meta.tipo, label: meta.label, _meta: meta }
    })
  }, [isStage, vigentesPorTipo])

  const abrirFilePicker = (action) => {
    if (!canEdit) return
    pendingActionRef.current = action
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const onFileChosen = async (file) => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (!file || !action) return

    if (isStage) {
      const url = URL.createObjectURL(file)
      const existing = list.find((r) => r._localId && r.tipo === action.tipo)
      if (existing?.archivoPreviewUrl) URL.revokeObjectURL(existing.archivoPreviewUrl)
      const draft = emptyDocDraft(action.tipo, {
        archivo: file,
        archivoPreviewUrl: url,
        version_label: action.replaceId || existing ? 'Actualización' : 'Original',
      })
      if (existing) {
        setList(list.map((r) => (r._localId === existing._localId ? { ...draft, _localId: existing._localId } : r)))
      } else {
        setList([...list.filter((r) => !(r._localId && r.tipo === action.tipo)), draft])
      }
      return
    }

    setBusy(true)
    try {
      await uploadDocumento(subId, {
        tipo: action.tipo,
        archivo: file,
        version_label: action.replaceId ? 'Reemplazo' : 'Original',
        marcar_vigente: true,
      }, token)
      onMsg?.({ type: 'success', text: action.replaceId ? 'Documento reemplazado.' : 'Documento cargado.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const eliminar = async (doc) => {
    if (!canEdit) return
    if (doc._localId) {
      if (doc.archivoPreviewUrl) URL.revokeObjectURL(doc.archivoPreviewUrl)
      setList(list.filter((r) => r._localId !== doc._localId))
      return
    }
    if (!window.confirm('¿Eliminar este documento?')) return
    setBusy(true)
    try {
      await deleteDocumento(subId, doc.id, token)
      onMsg?.({ type: 'success', text: 'Documento eliminado.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const abrirPreviewLocal = (file, nombre, url) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true, loading: false, error: '',
      nombre: nombre || file?.name || 'Documento',
      mime: file?.type || '',
      blobUrl: url,
    })
  }

  const abrirPreviewRemote = async (doc) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true, loading: true, error: '',
      nombre: doc.nombre_archivo || 'Documento',
      mime: doc.mime_type || '',
      blobUrl: null,
    })
    try {
      const { blobUrl, mime } = await fetchBlobUrl(documentoArchivoPath(subId, doc.id), token)
      previewUrlRef.current = blobUrl
      setPreview((p) => ({ ...p, loading: false, blobUrl, mime: mime || p.mime }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error al cargar' }))
    }
  }

  return (
    <div style={{ marginTop: 18, ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => onFileChosen(e.target.files?.[0])}
      />
      <div style={ui.sectionTitle}>Documentos Contractuales</div>
      <div style={{ fontSize: 'var(--cc-caption)', color: ui.textMuted, marginBottom: 8 }}>
        Contrato Firmado y Propuesta Económica. Haga clic en una fila vacía para cargar el archivo.
        Use Reemplazar para una nueva versión (el historial se conserva).
      </div>

      <div style={{ ...ui.sheetWrap, maxHeight: 'min(420px, 50vh)' }}>
        <table style={ui.sheetTable}>
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Tipo', 'Versión', 'Documento', 'Estado', 'Acciones'].map((h) => (
                <th key={h} style={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Cargando…</td>
              </tr>
            )}
            {!loading && displayRows.map((r) => {
              if (r._placeholder) {
                return (
                  <tr
                    key={`ph-${r.tipo}`}
                    onClick={() => canEdit && !busy && abrirFilePicker({ tipo: r.tipo })}
                    style={{ cursor: canEdit && !busy ? 'pointer' : 'default' }}
                    title={canEdit ? 'Clic para cargar documento' : undefined}
                    onMouseEnter={(e) => {
                      if (canEdit) e.currentTarget.style.background = `${tTok.primary}12`
                    }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={ui.td}>{r.label || DOC_TIPO_LABEL[r.tipo]}</td>
                    <td style={{ ...ui.td, color: ui.textMuted }}>—</td>
                    <td style={{ ...ui.td, color: ui.textMuted }}>
                      {canEdit ? 'Clic para cargar…' : 'Sin documento'}
                    </td>
                    <td style={ui.td}>
                      <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 'var(--cc-caption)' }}>Pendiente</span>
                    </td>
                    <td style={ui.td} />
                  </tr>
                )
              }

              const isLocal = !!r._localId
              return (
                <tr key={r.id || r._localId}>
                  <td style={ui.td}>{r.tipo_label || DOC_TIPO_LABEL[r.tipo] || r.tipo}</td>
                  <td style={ui.td}>
                    {isLocal
                      ? (r.version_label || 'Pendiente')
                      : (r.version_label || (r.vigente ? 'Vigente' : 'Histórico'))}
                  </td>
                  <td style={ui.td}>
                    {isLocal ? (
                      <button
                        type="button"
                        style={S.btn('ghost', true)}
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirPreviewLocal(r.archivo, r.archivo?.name, r.archivoPreviewUrl)
                        }}
                      >
                        {r.archivo?.name || 'Vista previa'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={S.btn('ghost', true)}
                        onClick={(e) => { e.stopPropagation(); abrirPreviewRemote(r) }}
                      >
                        {r.nombre_archivo || 'Ver archivo'}
                      </button>
                    )}
                  </td>
                  <td style={ui.td}>
                    <span style={{
                      fontSize: 'var(--cc-caption)',
                      fontWeight: 700,
                      color: isLocal ? '#f59e0b' : (r.vigente ? '#22c55e' : ui.textMuted),
                    }}
                    >
                      {isLocal ? 'Por guardar' : (r.vigente ? 'Vigente' : 'Histórico')}
                    </span>
                    {!isLocal && (
                      <button
                        type="button"
                        style={{ ...S.btn('ghost', true), marginLeft: 6 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setHistTipo(histTipo === r.tipo ? null : r.tipo)
                        }}
                      >
                        Historial
                      </button>
                    )}
                  </td>
                  <td style={ui.td} onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={S.btn('secondary', true)}
                          disabled={busy}
                          onClick={() => abrirFilePicker({
                            tipo: r.tipo,
                            replaceId: r.id || null,
                          })}
                        >
                          Reemplazar
                        </button>
                        <button
                          type="button"
                          style={S.btn('danger', true)}
                          disabled={busy}
                          onClick={() => eliminar(r)}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {!isStage && histTipo && (vigentesPorTipo[`${histTipo}__hist`] || []).map((h) => (
              <tr key={`hist-${h.id}`} style={{ opacity: 0.75 }}>
                <td style={{ ...ui.td, paddingLeft: 16, fontSize: 'var(--cc-caption)', color: ui.textMuted }}>↳ historial</td>
                <td style={ui.td}>{h.version_label || (h.created_at || '').slice(0, 10) || '—'}</td>
                <td style={ui.td}>
                  <button type="button" style={S.btn('ghost', true)} onClick={() => abrirPreviewRemote(h)}>
                    {h.nombre_archivo || 'Ver'}
                  </button>
                </td>
                <td style={ui.td}>
                  <span style={{ fontSize: 'var(--cc-caption)', color: h.vigente ? '#22c55e' : ui.textMuted }}>
                    {h.vigente ? 'Vigente' : 'Histórico'}
                  </span>
                </td>
                <td style={ui.td} />
              </tr>
            ))}
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
          a.download = preview.nombre || 'documento'
          a.click()
        }}
      />
    </div>
  )
}
