import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../apiBase'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom } from '../../theme/adminPanelTheme'
import {
  fetchBlobUrl,
  polizaArchivoPath,
  updatePolizaMeta,
  uploadPoliza,
} from './subcontratistasApi'
import {
  emptyPolizaDraft,
  fmtMoneda,
  polizaTipoOptions,
} from './subcontratistasDocsHelpers'
import { subcontratistasSheetStyles, subUi } from './subcontratistasSheetStyles'

/**
 * Bloque Excel de pólizas.
 * - mode "stage": filas locales (crear subcontratista)
 * - mode "live": CRUD contra API (edición)
 */
export default function PolizasExcelBlock({
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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [renovarDe, setRenovarDe] = useState(null)
  const [draft, setDraft] = useState(null)
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
      const res = await fetch(`${API_BASE}/subcontratistas/${subId}/polizas?incluir_historico=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setRows((await res.json()) || [])
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar las pólizas.' })
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

  const agregarLinea = () => {
    if (isStage) {
      setList([...list, emptyPolizaDraft()])
      return
    }
    setDraft(emptyPolizaDraft())
    setRenovarDe(null)
  }

  const iniciarRenovar = (poliza) => {
    const d = emptyPolizaDraft({
      tipo: poliza.tipo || 'garantia',
      tipo_otro_texto: poliza.tipo_otro_texto || '',
      valor_asegurado: poliza.valor_asegurado ?? '',
      replaces_id: poliza.id,
      fecha_vencimiento: '',
    })
    if (isStage) {
      setList([...list, d])
      return
    }
    setDraft(d)
    setRenovarDe(poliza)
  }

  const patchStage = (localId, patch) => {
    setList(list.map((r) => (r._localId === localId ? { ...r, ...patch } : r)))
  }

  const removeStage = (localId) => {
    const row = list.find((r) => r._localId === localId)
    if (row?.archivoPreviewUrl) URL.revokeObjectURL(row.archivoPreviewUrl)
    setList(list.filter((r) => r._localId !== localId))
  }

  const onPickFile = (rowOrDraft, file, isDraft = false) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    if (isDraft) {
      if (draft?.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
      setDraft((d) => ({ ...d, archivo: file, archivoPreviewUrl: url }))
    } else {
      if (rowOrDraft.archivoPreviewUrl) URL.revokeObjectURL(rowOrDraft.archivoPreviewUrl)
      patchStage(rowOrDraft._localId, { archivo: file, archivoPreviewUrl: url })
    }
  }

  const abrirPreviewLocal = (file, nombre, url) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true,
      loading: false,
      error: '',
      nombre: nombre || file?.name || 'Documento',
      mime: file?.type || '',
      blobUrl: url,
    })
  }

  const abrirPreviewRemote = async (poliza) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview({
      open: true, loading: true, error: '', nombre: poliza.nombre_archivo || 'Póliza',
      mime: poliza.mime_type || '', blobUrl: null,
    })
    try {
      const { blobUrl, mime } = await fetchBlobUrl(polizaArchivoPath(subId, poliza.id), token)
      previewUrlRef.current = blobUrl
      setPreview((p) => ({ ...p, loading: false, blobUrl, mime: mime || p.mime }))
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, error: e.message || 'Error al cargar' }))
    }
  }

  const guardarDraft = async () => {
    if (!draft) return
    if (!draft.fecha_vencimiento) {
      onMsg?.({ type: 'error', text: 'La fecha de vencimiento es obligatoria.' })
      return
    }
    if (draft.tipo === 'otro' && !(draft.tipo_otro_texto || '').trim()) {
      onMsg?.({ type: 'error', text: 'Indique el nombre del tipo cuando elige «Otro».' })
      return
    }
    setBusy(true)
    try {
      await uploadPoliza(subId, {
        tipo: draft.tipo,
        tipo_otro_texto: draft.tipo_otro_texto,
        fecha_vencimiento: draft.fecha_vencimiento,
        valor_asegurado: draft.valor_asegurado,
        replaces_id: draft.replaces_id,
        notas: draft.notas,
        archivo: draft.archivo,
      }, token)
      onMsg?.({
        type: 'success',
        text: draft.replaces_id ? 'Póliza renovada (la anterior queda como histórico).' : 'Póliza registrada.',
      })
      if (draft.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
      setDraft(null)
      setRenovarDe(null)
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const guardarMeta = async (poliza, patch) => {
    if (!canEdit || isStage) return
    setBusy(true)
    try {
      await updatePolizaMeta(subId, poliza.id, patch, token)
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const renderDraftCells = (d, onChange, onFile, onRemove) => (
    <tr key={d._localId || 'draft'}>
      <td style={ui.td}>
        <select
          style={ui.cellSelect}
          value={d.tipo}
          disabled={!canEdit}
          onChange={(e) => onChange({ tipo: e.target.value, tipo_otro_texto: e.target.value === 'otro' ? d.tipo_otro_texto : '' })}
        >
          {polizaTipoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {d.tipo === 'otro' && (
          <input
            style={{ ...ui.cellInp, marginTop: 2, borderTop: `1px solid ${ui.border}` }}
            placeholder="Nombre del tipo…"
            value={d.tipo_otro_texto || ''}
            disabled={!canEdit}
            onChange={(e) => onChange({ tipo_otro_texto: e.target.value })}
          />
        )}
      </td>
      <td style={ui.td}>
        <input
          type="date"
          style={ui.cellInp}
          value={d.fecha_vencimiento || ''}
          disabled={!canEdit}
          onChange={(e) => onChange({ fecha_vencimiento: e.target.value })}
        />
      </td>
      <td style={ui.td}>
        <input
          style={{ ...ui.cellInp, textAlign: 'right' }}
          inputMode="decimal"
          placeholder="0"
          value={d.valor_asegurado}
          disabled={!canEdit}
          onChange={(e) => onChange({ valor_asegurado: e.target.value.replace(/[^0-9.,]/g, '') })}
        />
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
        {d.replaces_id ? (
          <span style={{ fontSize: 11, color: '#f59e0b' }}>Renueva #{d.replaces_id}</span>
        ) : (
          <span style={{ color: ui.textMuted }}>—</span>
        )}
      </td>
      <td style={ui.td}>
        {canEdit && (
          <button type="button" style={S.btn('danger', true)} onClick={onRemove}>✕</button>
        )}
      </td>
    </tr>
  )

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={ui.sectionTitle}>Pólizas</div>
        {canEdit && !draft && (
          <button type="button" style={S.btn('ghost', true)} onClick={agregarLinea}>+ Agregar línea</button>
        )}
      </div>
      {renovarDe && (
        <div style={{ ...S.alert('warn'), fontSize: 12 }}>
          Renovando póliza #{renovarDe.id} ({renovarDe.tipo_label || renovarDe.tipo}). La anterior quedará como histórico.
        </div>
      )}
      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Tipo', 'Vencimiento', 'Valor asegurado', 'Documento', 'Estado / Renovar', ''].map((h) => (
                <th key={h || 'acc'} style={ui.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Cargando…</td></tr>
            )}
            {!loading && list.length === 0 && !draft && (
              <tr><td colSpan={6} style={{ ...ui.td, textAlign: 'center', color: ui.textMuted }}>Sin pólizas. Use «Agregar línea».</td></tr>
            )}
            {!isStage && list.map((p) => (
              <tr key={p.id} style={p.estado === 'reemplazada' ? { opacity: 0.55 } : undefined}>
                <td style={ui.td}>
                  {canEdit && p.estado === 'vigente' ? (
                    <select
                      style={ui.cellSelect}
                      value={p.tipo || 'garantia'}
                      onChange={(e) => guardarMeta(p, { tipo: e.target.value, tipo_otro_texto: e.target.value === 'otro' ? (p.tipo_otro_texto || '') : null })}
                    >
                      {polizaTipoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span>{p.tipo_label || p.tipo}</span>
                  )}
                  {p.tipo === 'otro' && canEdit && p.estado === 'vigente' && (
                    <input
                      style={{ ...ui.cellInp, marginTop: 2 }}
                      defaultValue={p.tipo_otro_texto || ''}
                      placeholder="Nombre…"
                      onBlur={(e) => {
                        if (e.target.value !== (p.tipo_otro_texto || '')) {
                          guardarMeta(p, { tipo: 'otro', tipo_otro_texto: e.target.value })
                        }
                      }}
                    />
                  )}
                </td>
                <td style={ui.td}>
                  {canEdit && p.estado === 'vigente' ? (
                    <input
                      type="date"
                      style={ui.cellInp}
                      defaultValue={(p.fecha_vencimiento || '').slice(0, 10)}
                      onBlur={(e) => {
                        if (e.target.value && e.target.value !== (p.fecha_vencimiento || '').slice(0, 10)) {
                          guardarMeta(p, { fecha_vencimiento: e.target.value })
                        }
                      }}
                    />
                  ) : (p.fecha_vencimiento || '—')}
                </td>
                <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {canEdit && p.estado === 'vigente' ? (
                    <input
                      style={{ ...ui.cellInp, textAlign: 'right' }}
                      defaultValue={p.valor_asegurado ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value
                        if (String(v) !== String(p.valor_asegurado ?? '')) {
                          guardarMeta(p, { valor_asegurado: v === '' ? null : Number(String(v).replace(/,/g, '')) })
                        }
                      }}
                    />
                  ) : fmtMoneda(p.valor_asegurado)}
                </td>
                <td style={ui.td}>
                  {p.azure_blob_path || p.nombre_archivo ? (
                    <button type="button" style={S.btn('ghost', true)} onClick={() => abrirPreviewRemote(p)}>
                      {p.nombre_archivo || 'Ver archivo'}
                    </button>
                  ) : <span style={{ color: ui.textMuted }}>Sin archivo</span>}
                </td>
                <td style={ui.td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: (p.estado_efectivo || p.estado) === 'vencida' ? '#ef4444'
                        : p.estado === 'reemplazada' ? ui.textMuted
                          : '#22c55e',
                    }}>
                      {p.estado === 'reemplazada' ? 'Histórico' : (p.estado_efectivo || p.estado || 'vigente')}
                    </span>
                    {canEdit && p.estado === 'vigente' && (
                      <button type="button" style={S.btn('secondary', true)} onClick={() => iniciarRenovar(p)} disabled={busy}>
                        Renovar
                      </button>
                    )}
                  </div>
                </td>
                <td style={ui.td} />
              </tr>
            ))}
            {isStage && list.map((d) => renderDraftCells(
              d,
              (patch) => patchStage(d._localId, patch),
              (file) => onPickFile(d, file, false),
              () => removeStage(d._localId),
            ))}
            {draft && renderDraftCells(
              draft,
              (patch) => setDraft((prev) => ({ ...prev, ...patch })),
              (file) => onPickFile(draft, file, true),
              () => {
                if (draft.archivoPreviewUrl) URL.revokeObjectURL(draft.archivoPreviewUrl)
                setDraft(null)
                setRenovarDe(null)
              },
            )}
          </tbody>
        </table>
      </div>
      {draft && canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={S.btn('ghost', true)} onClick={() => { setDraft(null); setRenovarDe(null) }} disabled={busy}>Cancelar</button>
          <button type="button" style={S.btn('primary', true)} onClick={guardarDraft} disabled={busy}>
            {busy ? 'Guardando…' : (draft.replaces_id ? 'Confirmar renovación' : 'Guardar póliza')}
          </button>
        </div>
      )}
      {canEdit && (
        <button type="button" style={ui.addRowBtn} onClick={agregarLinea} disabled={!!draft}>
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
          a.download = preview.nombre || 'poliza'
          a.click()
        }}
      />
    </div>
  )
}
