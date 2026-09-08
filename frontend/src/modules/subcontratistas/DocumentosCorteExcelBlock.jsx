import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom } from '../../theme/adminPanelTheme'
import {
  documentoArchivoPath,
  fetchBlobUrl,
  uploadDocumento,
} from './subcontratistasApi'
import {
  DOC_TIPO_LABEL,
  docTipoOrder,
  emptyDocDraft,
} from './subcontratistasDocsHelpers'
import { subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Documentos requeridos para corte (orden jerárquico).
 * - mode "stage": filas locales hasta crear el subcontratista
 * - mode "live": sube / lista versiones
 * - initialSsPeriodo: prellena planilla SS (p. ej. banner de corte bloqueado)
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
  initialSsPeriodo = '',
  forceSsUpload = false,
  onSsUploaded,
}) {
  const tTok = tFrom(theme)
  const ui = subcontratistasSheetStyles(tTok)
  const S = subUi(theme, tTok)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)
  const [histTipo, setHistTipo] = useState(null)
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)

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
      setRows((await res.json()) || [])
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

  useEffect(() => {
    if (forceSsUpload && canEdit && !isStage) {
      setDraft(emptyDocDraft('seguridad_social', {
        periodo: initialSsPeriodo || '',
      }))
    }
  }, [forceSsUpload, initialSsPeriodo, canEdit, isStage])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const setList = (next) => {
    if (isStage) onStagedChange?.(typeof next === 'function' ? next(list) : next)
    else setRows(next)
  }

  const vigentesPorTipo = useMemo(() => {
    const map = {}
    for (const meta of docTipoOrder) {
      const ofTipo = list.filter((r) => !r._localId && r.tipo === meta.tipo)
      if (meta.tipo === 'seguridad_social') {
        map[meta.tipo] = ofTipo
      } else {
        const vig = ofTipo.find((r) => r.vigente) || ofTipo[0] || null
        map[meta.tipo] = vig ? [vig] : []
        map[`${meta.tipo}__hist`] = ofTipo
      }
    }
    return map
  }, [list])

  const agregarLinea = (tipoPref = 'contrato_firmado') => {
    const d = emptyDocDraft(tipoPref, {
      periodo: tipoPref === 'seguridad_social' ? (initialSsPeriodo || '') : '',
    })
    if (isStage) {
      setList([...list, d])
      return
    }
    setDraft(d)
  }

  const patchStage = (localId, patch) => {
    setList(list.map((r) => (r._localId === localId ? { ...r, ...patch } : r)))
  }

  const removeStage = (localId) => {
    const row = list.find((r) => r._localId === localId)
    if (row?.archivoPreviewUrl) URL.revokeObjectURL(row.archivoPreviewUrl)
    setList(list.filter((r) => r._localId !== localId))
  }

  const onPickFile = (target, file, isDraft) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    if (isDraft) {
      if (draft?.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
      setDraft((d) => ({ ...d, archivo: file, archivoPreviewUrl: url }))
    } else {
      if (target.archivoPreviewUrl) URL.revokeObjectURL(target.archivoPreviewUrl)
      patchStage(target._localId, { archivo: file, archivoPreviewUrl: url })
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

  const guardarDraft = async () => {
    if (!draft) return
    if (!draft.archivo) {
      onMsg?.({ type: 'error', text: 'Adjunte el archivo del documento.' })
      return
    }
    if (draft.tipo === 'seguridad_social' && !/^\d{4}-\d{2}$/.test(draft.periodo || '')) {
      onMsg?.({ type: 'error', text: 'Indique el período de Seguridad Social (YYYY-MM).' })
      return
    }
    setBusy(true)
    try {
      await uploadDocumento(subId, {
        tipo: draft.tipo,
        archivo: draft.archivo,
        version_label: draft.version_label,
        periodo: draft.periodo,
        notas: draft.notas,
        marcar_vigente: draft.marcar_vigente !== false,
      }, token)
      onMsg?.({ type: 'success', text: 'Documento cargado.' })
      if (draft.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
      const wasSs = draft.tipo === 'seguridad_social'
      setDraft(null)
      await cargar()
      if (wasSs) onSsUploaded?.()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const renderDraftRow = (d, onChange, onFile, onRemove, key) => (
    <tr key={key}>
      <td style={ui.td}>
        <select
          style={ui.cellSelect}
          value={d.tipo}
          disabled={!canEdit}
          onChange={(e) => onChange({
            tipo: e.target.value,
            periodo: e.target.value === 'seguridad_social' ? (d.periodo || initialSsPeriodo || '') : '',
            version_label: e.target.value === 'seguridad_social' ? '' : d.version_label,
          })}
        >
          {docTipoOrder.map((o) => <option key={o.tipo} value={o.tipo}>{o.label}</option>)}
        </select>
      </td>
      <td style={ui.td}>
        {d.tipo === 'seguridad_social' ? (
          <input
            style={ui.cellInp}
            placeholder="YYYY-MM"
            value={d.periodo || ''}
            disabled={!canEdit}
            onChange={(e) => onChange({ periodo: e.target.value.replace(/[^\d-]/g, '').slice(0, 7) })}
          />
        ) : (
          <input
            style={ui.cellInp}
            placeholder="Etiqueta de versión (opcional)"
            value={d.version_label || ''}
            disabled={!canEdit}
            onChange={(e) => onChange({ version_label: e.target.value })}
          />
        )}
      </td>
      <td style={ui.td}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ ...S.btn('ghost', true), cursor: canEdit ? 'pointer' : 'default', margin: 0 }}>
            {d.archivo ? 'Cambiar' : 'Adjuntar'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              hidden
              disabled={!canEdit}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {d.archivo && (
            <button
              type="button"
              style={S.btn('ghost', true)}
              onClick={() => abrirPreviewLocal(d.archivo, d.archivo.name, d.archivoPreviewUrl)}
            >
              Vista previa
            </button>
          )}
          {d.archivo && <span style={{ fontSize: 11, color: ui.textMuted }}>{d.archivo.name}</span>}
        </div>
      </td>
      <td style={ui.td}>
        <span style={{ color: ui.textMuted, fontSize: 11 }}>Pendiente de guardar</span>
      </td>
      <td style={ui.td}>
        {canEdit && <button type="button" style={S.btn('danger', true)} onClick={onRemove}>✕</button>}
      </td>
    </tr>
  )

  const displayRows = useMemo(() => {
    if (isStage) return []
    const out = []
    for (const meta of docTipoOrder) {
      if (meta.tipo === 'seguridad_social') {
        const ss = (vigentesPorTipo[meta.tipo] || []).slice(0, 12)
        if (ss.length === 0) {
          out.push({ _placeholder: true, tipo: meta.tipo, label: meta.label })
        } else {
          ss.forEach((r) => out.push(r))
        }
      } else {
        const vig = (vigentesPorTipo[meta.tipo] || [])[0]
        if (vig) out.push(vig)
        else out.push({ _placeholder: true, tipo: meta.tipo, label: meta.label })
      }
    }
    return out
  }, [isStage, vigentesPorTipo])

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={ui.sectionTitle}>Documentos requeridos para corte</div>
        {canEdit && !draft && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {docTipoOrder.map((o) => (
              <button key={o.tipo} type="button" style={S.btn('ghost', true)} onClick={() => agregarLinea(o.tipo)}>
                + {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: ui.textMuted, marginBottom: 8 }}>
        Orden: Contrato Firmado → Pago Seguridad Social (mensual YYYY-MM) → Propuesta Económica.
        Contrato y Propuesta mantienen historial de versiones.
      </div>

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable}>
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Tipo', 'Versión / Período', 'Documento', 'Estado', ''].map((h) => (
                <th key={h || 'acc'} style={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Cargando…</td></tr>
            )}
            {!loading && isStage && list.length === 0 && !draft && (
              <tr><td colSpan={5} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Sin documentos. Use «Agregar línea».</td></tr>
            )}
            {!isStage && !loading && displayRows.map((r, idx) => {
              if (r._placeholder) {
                return (
                  <tr key={`ph-${r.tipo}-${idx}`}>
                    <td style={ui.td}>{r.label || DOC_TIPO_LABEL[r.tipo]}</td>
                    <td style={{ ...ui.td, color: ui.textMuted }}>—</td>
                    <td style={{ ...ui.td, color: ui.textMuted }}>Faltante</td>
                    <td style={ui.td}><span style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>Pendiente</span></td>
                    <td style={ui.td}>
                      {canEdit && (
                        <button type="button" style={S.btn('primary', true)} onClick={() => agregarLinea(r.tipo)}>+ Cargar</button>
                      )}
                    </td>
                  </tr>
                )
              }
              const meta = docTipoOrder.find((d) => d.tipo === r.tipo)
              return (
                <tr key={r.id}>
                  <td style={ui.td}>{r.tipo_label || DOC_TIPO_LABEL[r.tipo] || r.tipo}</td>
                  <td style={ui.td}>
                    {r.tipo === 'seguridad_social'
                      ? (r.periodo || '—')
                      : (r.version_label || (r.vigente ? 'Vigente' : 'Histórico'))}
                  </td>
                  <td style={ui.td}>
                    <button type="button" style={S.btn('ghost', true)} onClick={() => abrirPreviewRemote(r)}>
                      {r.nombre_archivo || 'Ver archivo'}
                    </button>
                  </td>
                  <td style={ui.td}>
                    {r.tipo === 'seguridad_social' ? (
                      <span style={{ fontSize: 11, color: '#22c55e' }}>Cargado</span>
                    ) : (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: r.vigente ? '#22c55e' : ui.textMuted,
                      }}>
                        {r.vigente ? 'Vigente' : 'Histórico'}
                      </span>
                    )}
                    {meta?.versionado && (
                      <button
                        type="button"
                        style={{ ...S.btn('ghost', true), marginLeft: 6 }}
                        onClick={() => setHistTipo(histTipo === r.tipo ? null : r.tipo)}
                      >
                        Historial
                      </button>
                    )}
                  </td>
                  <td style={ui.td}>
                    {canEdit && meta?.versionado && (
                      <button type="button" style={S.btn('secondary', true)} onClick={() => agregarLinea(r.tipo)}>
                        Nueva versión
                      </button>
                    )}
                    {canEdit && r.tipo === 'seguridad_social' && (
                      <button type="button" style={S.btn('secondary', true)} onClick={() => agregarLinea('seguridad_social')}>
                        + Mes
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!isStage && histTipo && (vigentesPorTipo[`${histTipo}__hist`] || []).map((h) => (
              <tr key={`hist-${h.id}`} style={{ opacity: 0.7 }}>
                <td style={{ ...ui.td, paddingLeft: 16, fontSize: 11, color: ui.textMuted }}>↳ historial</td>
                <td style={ui.td}>{h.version_label || (h.created_at || '').slice(0, 10) || '—'}</td>
                <td style={ui.td}>
                  <button type="button" style={S.btn('ghost', true)} onClick={() => abrirPreviewRemote(h)}>
                    {h.nombre_archivo || 'Ver'}
                  </button>
                </td>
                <td style={ui.td}>
                  <span style={{ fontSize: 11, color: h.vigente ? '#22c55e' : ui.textMuted }}>
                    {h.vigente ? 'Vigente' : 'Histórico'}
                  </span>
                </td>
                <td style={ui.td} />
              </tr>
            ))}
            {isStage && list.map((d) => renderDraftRow(
              d,
              (patch) => patchStage(d._localId, patch),
              (file) => onPickFile(d, file, false),
              () => removeStage(d._localId),
              d._localId,
            ))}
            {draft && renderDraftRow(
              draft,
              (patch) => setDraft((prev) => ({ ...prev, ...patch })),
              (file) => onPickFile(draft, file, true),
              () => {
                if (draft.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
                setDraft(null)
              },
              'draft-live',
            )}
          </tbody>
        </table>
      </div>

      {draft && canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={S.btn('ghost', true)} onClick={() => setDraft(null)} disabled={busy}>Cancelar</button>
          <button type="button" style={S.btn('primary', true)} onClick={guardarDraft} disabled={busy}>
            {busy ? 'Subiendo…' : 'Guardar documento'}
          </button>
        </div>
      )}

      {canEdit && (
        <button type="button" style={ui.addRowBtn} onClick={() => agregarLinea('contrato_firmado')} disabled={!!draft && !isStage}>
          + Agregar línea
        </button>
      )}

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
