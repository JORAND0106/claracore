import { useEffect, useMemo, useRef, useState } from 'react'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import { DOC_TIPOS_INGRESO, DOC_TIPOS_SOPORTE } from './rrhhHelpers'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Bloque Excel de documentos versionados (soporte o ingreso).
 * Mismo patrón visual/UX que Documentos Contractuales de Subcontratistas.
 */
export default function DocumentosTrabajadorBlock({
  theme,
  api,
  trabajadorId,
  categoria = 'soporte',
  canEdit = true,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const S = rrhhUi(theme, tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const tipos = categoria === 'ingreso' ? DOC_TIPOS_INGRESO : DOC_TIPOS_SOPORTE

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [histTipo, setHistTipo] = useState(null)
  const [otroTexto, setOtroTexto] = useState('')
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const previewUrlRef = useRef(null)
  const fileInputRef = useRef(null)
  const pendingActionRef = useRef(null)

  const cargar = async () => {
    if (!trabajadorId || !api) return
    setLoading(true)
    try {
      const res = await api.listDocumentos(trabajadorId, categoria)
      setRows(res?.items || [])
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar los documentos.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadorId, categoria])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const vigentesPorTipo = useMemo(() => {
    const map = {}
    for (const meta of tipos) {
      const ofTipo = rows.filter((r) => r.tipo === meta.tipo)
      map[meta.tipo] = ofTipo.find((r) => r.vigente) || ofTipo[0] || null
      map[`${meta.tipo}__hist`] = ofTipo
    }
    return map
  }, [rows, tipos])

  const displayRows = useMemo(
    () => tipos.map((meta) => {
      const vig = vigentesPorTipo[meta.tipo]
      if (vig) return { ...vig, _meta: meta }
      return { _placeholder: true, tipo: meta.tipo, label: meta.label, _meta: meta }
    }),
    [tipos, vigentesPorTipo],
  )

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
    if (!file || !action || !api) return
    setBusy(true)
    try {
      await api.uploadDocumento(trabajadorId, {
        categoria,
        tipo: action.tipo,
        archivo: file,
        version_label: action.replaceId ? 'Reemplazo' : 'Original',
        tipo_otro_texto: action.tipo === 'otro' ? (otroTexto || 'Otro documento') : null,
        marcar_vigente: true,
      })
      onMsg?.({ type: 'success', text: action.replaceId ? 'Documento reemplazado.' : 'Documento cargado.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo cargar el documento.' })
    } finally {
      setBusy(false)
    }
  }

  const abrirPreview = async (doc) => {
    if (!doc?.id || !api) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    setPreview({ open: true, loading: true, error: '', nombre: doc.nombre_archivo, mime: doc.mime_type, blobUrl: null })
    try {
      const url = await api.fetchBlobUrl(api.documentoArchivoUrl(trabajadorId, doc.id))
      previewUrlRef.current = url
      setPreview({ open: true, loading: false, error: '', nombre: doc.nombre_archivo, mime: doc.mime_type, blobUrl: url })
    } catch (e) {
      setPreview({ open: true, loading: false, error: e.message || 'No se pudo abrir el archivo.', nombre: doc.nombre_archivo, mime: doc.mime_type, blobUrl: null })
    }
  }

  const eliminar = async (doc) => {
    if (!canEdit || !doc?.id) return
    if (!window.confirm('¿Eliminar este documento? Quedará en historial como eliminado.')) return
    setBusy(true)
    try {
      await api.deleteDocumento(trabajadorId, doc.id)
      onMsg?.({ type: 'success', text: 'Documento eliminado.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo eliminar.' })
    } finally {
      setBusy(false)
    }
  }

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
  }

  const titulo = categoria === 'ingreso'
    ? 'Documentación de ingreso / inducción'
    : 'Documentación de soporte'

  const histRows = histTipo ? (vigentesPorTipo[`${histTipo}__hist`] || []) : []

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      <div style={ui.sectionTitle}>{titulo}</div>
      <div style={{ marginBottom: 6, color: tTok.textMuted, fontSize: 'var(--cc-caption)' }}>
        Clic en fila vacía para cargar. Reemplazar genera nueva versión y conserva el historial.
      </div>
      {tipos.some((t) => t.tipo === 'otro') && canEdit && (
        <div style={{ marginBottom: 8 }}>
          <input
            style={{ ...S.input, maxWidth: 360 }}
            placeholder="Nombre si el tipo es «Otro»"
            value={otroTexto}
            onChange={(e) => setOtroTexto(e.target.value)}
          />
        </div>
      )}
      <div style={{ ...ui.sheetWrap, maxHeight: 'min(360px, 42vh)' }}>
        <table style={ui.sheetTable}>
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '34%' }}>Tipo</th>
              <th style={{ ...ui.th, width: '28%' }}>Archivo</th>
              <th style={{ ...ui.th, width: '14%' }}>Versión</th>
              <th style={{ ...ui.th, width: '24%' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td style={ui.td} colSpan={4}>Cargando…</td></tr>
            )}
            {!loading && displayRows.map((row) => {
              const meta = row._meta
              if (row._placeholder) {
                return (
                  <tr
                    key={`ph-${meta.tipo}`}
                    onClick={() => abrirFilePicker({ tipo: meta.tipo })}
                    style={{ cursor: canEdit && !busy ? 'pointer' : 'default' }}
                  >
                    <td style={lbl}>{meta.label}</td>
                    <td style={{ ...ui.td, color: tTok.textMuted }}>
                      {canEdit ? 'Clic para cargar…' : 'Sin documento'}
                    </td>
                    <td style={ui.td}>—</td>
                    <td style={ui.td}>—</td>
                  </tr>
                )
              }
              return (
                <tr key={row.id}>
                  <td style={lbl}>
                    {meta.label}
                    {row.tipo === 'otro' && row.tipo_otro_texto ? ` — ${row.tipo_otro_texto}` : ''}
                    {row.vigente ? (
                      <span style={{ marginLeft: 6, color: S.successColor, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>
                        vigente
                      </span>
                    ) : null}
                  </td>
                  <td style={ui.td}>
                    <button
                      type="button"
                      onClick={() => abrirPreview(row)}
                      style={{ ...S.btnGhost, padding: '4px 8px', border: 'none', color: tTok.primary }}
                    >
                      {row.nombre_archivo || 'Ver archivo'}
                    </button>
                  </td>
                  <td style={ui.td}>{row.version_label || '—'}</td>
                  <td style={ui.td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" style={{ ...S.btnGhost, padding: '4px 8px' }} onClick={() => setHistTipo(meta.tipo)}>
                        Historial
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            style={{ ...S.btnGhost, padding: '4px 8px' }}
                            disabled={busy}
                            onClick={() => abrirFilePicker({ tipo: meta.tipo, replaceId: row.id })}
                          >
                            Reemplazar
                          </button>
                          <button type="button" style={{ ...S.btnDanger }} disabled={busy} onClick={() => eliminar(row)}>
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {histTipo && (
        <div style={{ marginTop: 10, ...ui.sheetWrap, maxHeight: 220 }}>
          <div style={{ ...ui.sectionTitle, padding: '8px 10px 0' }}>
            Historial — {tipos.find((t) => t.tipo === histTipo)?.label || histTipo}
            <button type="button" onClick={() => setHistTipo(null)} style={{ ...S.btnGhost, marginLeft: 10, padding: '2px 8px' }}>
              Cerrar
            </button>
          </div>
          <table style={ui.sheetTable}>
            <thead>
              <tr>
                <th style={ui.th}>Archivo</th>
                <th style={ui.th}>Versión</th>
                <th style={ui.th}>Estado</th>
                <th style={ui.th}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {histRows.length === 0 && (
                <tr><td style={ui.td} colSpan={4}>Sin versiones.</td></tr>
              )}
              {histRows.map((h) => (
                <tr key={h.id}>
                  <td style={ui.td}>
                    <button type="button" style={{ ...S.btnGhost, border: 'none', color: tTok.primary, padding: 0 }} onClick={() => abrirPreview(h)}>
                      {h.nombre_archivo}
                    </button>
                  </td>
                  <td style={ui.td}>{h.version_label || '—'}</td>
                  <td style={ui.td}>{h.vigente ? 'Vigente' : 'Histórico'}</td>
                  <td style={ui.td}>{(h.created_at || '').toString().slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => onFileChosen(e.target.files?.[0])}
      />

      {preview.open && (
        <SoportePreviewModal
          t={tTok}
          open={preview.open}
          loading={preview.loading}
          error={preview.error}
          nombre={preview.nombre}
          mime={preview.mime}
          blobUrl={preview.blobUrl}
          onClose={() => {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
            setPreview({ open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null })
          }}
          onDownload={() => {
            if (!preview.blobUrl) return
            const a = document.createElement('a')
            a.href = preview.blobUrl
            a.download = preview.nombre || 'documento'
            a.click()
          }}
        />
      )}
    </div>
  )
}
