import { useEffect, useMemo, useRef, useState } from 'react'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import { buildDocChecklist, slugTipoDocumento } from './rrhhHelpers'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Bloque Excel de documentos versionados (soporte o ingreso).
 * Los archivos se encolan localmente; «Guardar documentación» los asocia al colaborador.
 * «Otro» agrega tipos permanentes al checklist (catálogo reutilizable) al guardar.
 */
export default function DocumentosTrabajadorBlock({
  theme,
  api,
  trabajadorId,
  categoria = 'soporte',
  canEdit = true,
  customTipos = [],
  onTiposChange,
  onMsg,
  /** Tipos locales pendientes de persistir en catálogo (controlado por padre opcional). */
  pendingTiposExtra = null,
  onPendingTiposExtraChange = null,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const S = rrhhUi(theme, tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const catalogKey = categoria === 'ingreso' ? 'doc_ingreso' : 'doc_soporte'

  const [localPendingTipos, setLocalPendingTipos] = useState([])
  const pendingTipos = pendingTiposExtra != null ? pendingTiposExtra : localPendingTipos
  const setPendingTipos = onPendingTiposExtraChange || setLocalPendingTipos

  const tipos = useMemo(
    () => buildDocChecklist(categoria, [...(customTipos || []), ...pendingTipos]),
    [categoria, customTipos, pendingTipos],
  )

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [histTipo, setHistTipo] = useState(null)
  /** @type {Record<string, { file: File, tipo_otro_texto?: string|null, replaceId?: number|null }>} */
  const [pendingByTipo, setPendingByTipo] = useState({})
  const [dirty, setDirty] = useState(false)
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
    setPendingByTipo({})
    setDirty(false)
    if (pendingTiposExtra == null) setLocalPendingTipos([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadorId, categoria])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const vigentesPorTipo = useMemo(() => {
    const map = {}
    for (const meta of tipos) {
      if (meta.tipo === 'otro') continue
      const ofTipo = rows.filter((r) => r.tipo === meta.tipo)
      map[meta.tipo] = ofTipo.find((r) => r.vigente) || ofTipo[0] || null
      map[`${meta.tipo}__hist`] = ofTipo
    }
    for (const r of rows) {
      if (r.tipo === 'otro' && r.tipo_otro_texto) {
        const slug = slugTipoDocumento(r.tipo_otro_texto)
        if (!map[`${slug}__hist`]) map[`${slug}__hist`] = []
        map[`${slug}__hist`].push(r)
        if (!map[slug] || r.vigente) map[slug] = r
      }
    }
    return map
  }, [rows, tipos])

  const displayRows = useMemo(
    () => tipos.map((meta) => {
      if (meta.tipo === 'otro') {
        return { _placeholder: true, tipo: 'otro', label: meta.label, _meta: meta, _isOtro: true }
      }
      const pending = pendingByTipo[meta.tipo]
      const vig = vigentesPorTipo[meta.tipo]
      if (pending) {
        return {
          ...(vig || {}),
          id: vig?.id,
          _meta: meta,
          _pending: true,
          nombre_archivo: pending.file?.name || 'Pendiente de guardar',
          version_label: pending.replaceId ? 'Reemplazo (pendiente)' : 'Nuevo (pendiente)',
        }
      }
      if (vig) return { ...vig, _meta: meta }
      return { _placeholder: true, tipo: meta.tipo, label: meta.label, _meta: meta }
    }),
    [tipos, vigentesPorTipo, pendingByTipo],
  )

  const hasPending = dirty || Object.keys(pendingByTipo).length > 0 || pendingTipos.length > 0

  const abrirFilePicker = (action) => {
    if (!canEdit) return
    pendingActionRef.current = action
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const onClickTipo = async (meta) => {
    if (!canEdit || busy) return
    if (meta.tipo === 'otro') {
      const nombre = window.prompt('¿De qué tipo de documento se trata?')
      const label = String(nombre || '').trim()
      if (!label) {
        onMsg?.({ type: 'error', text: 'Debe indicar el nombre del tipo de documento.' })
        return
      }
      const already = [...(customTipos || []), ...pendingTipos].some(
        (t) => String(t).trim().toLowerCase() === label.toLowerCase(),
      )
      if (!already) {
        setPendingTipos((prev) => [...prev, label])
        setDirty(true)
      }
      const slug = slugTipoDocumento(label)
      abrirFilePicker({ tipo: slug, tipo_otro_texto: label })
      return
    }
    abrirFilePicker({
      tipo: meta.tipo,
      tipo_otro_texto: meta.custom ? meta.label : null,
    })
  }

  const onFileChosen = (file) => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (!file || !action) return
    setPendingByTipo((prev) => ({
      ...prev,
      [action.tipo]: {
        file,
        tipo_otro_texto: action.tipo_otro_texto || null,
        replaceId: action.replaceId || null,
      },
    }))
    setDirty(true)
    onMsg?.({
      type: 'success',
      text: `«${file.name}» listo para guardar. Pulse «Guardar documentación» para asociarlo al colaborador.`,
    })
  }

  const guardarDocumentacion = async () => {
    if (!api || !trabajadorId || !canEdit) return
    const entries = Object.entries(pendingByTipo)
    if (entries.length === 0 && pendingTipos.length === 0) {
      onMsg?.({ type: 'success', text: 'La documentación ya está asociada al colaborador. No hay cambios pendientes.' })
      return
    }
    setBusy(true)
    try {
      // Persistir tipos nuevos del checklist
      for (const label of pendingTipos) {
        if (onTiposChange) {
          await onTiposChange(catalogKey, label)
        } else {
          await api?.addCatalogoOpcion?.(catalogKey, label)
        }
      }
      // Subir archivos pendientes
      for (const [tipo, pending] of entries) {
        await api.uploadDocumento(trabajadorId, {
          categoria,
          tipo,
          archivo: pending.file,
          version_label: pending.replaceId ? 'Reemplazo' : 'Original',
          tipo_otro_texto: pending.tipo_otro_texto || null,
          marcar_vigente: true,
        })
      }
      const nFiles = entries.length
      const nTipos = pendingTipos.length
      setPendingByTipo({})
      setPendingTipos([])
      setDirty(false)
      await cargar()
      const parts = []
      if (nFiles) parts.push(`${nFiles} documento${nFiles === 1 ? '' : 's'}`)
      if (nTipos) parts.push(`${nTipos} tipo${nTipos === 1 ? '' : 's'} nuevo${nTipos === 1 ? '' : 's'}`)
      onMsg?.({
        type: 'success',
        text: parts.length
          ? `Documentación guardada: ${parts.join(' y ')} asociados al colaborador.`
          : 'Documentación guardada.',
      })
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo guardar la documentación.' })
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

  const quitarPendiente = (tipo) => {
    setPendingByTipo((prev) => {
      const next = { ...prev }
      delete next[tipo]
      return next
    })
  }

  const lbl = {
    ...ui.tdLabel,
    background: isDarkMode(theme) ? 'rgba(0,175,197,0.04)' : 'rgba(0,119,182,0.03)',
  }

  const titulo = categoria === 'ingreso'
    ? 'Documentos de ingreso'
    : 'Documentos de soporte'

  const histRows = histTipo ? (vigentesPorTipo[`${histTipo}__hist`] || []) : []

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
      }}>
        <div style={{ ...ui.sectionTitle, margin: 0 }}>{titulo}</div>
        {canEdit && (
          <button
            type="button"
            style={S.btnPrimary}
            disabled={busy}
            onClick={guardarDocumentacion}
            title="Confirma que los adjuntos y tipos nuevos quedan asociados al colaborador"
          >
            {busy ? 'Guardando…' : hasPending ? 'Guardar documentación' : 'Guardar documentación'}
          </button>
        )}
      </div>
      <div style={{ marginBottom: 6, color: tTok.textMuted, fontSize: 'var(--cc-caption)' }}>
        Seleccione archivos en las filas vacías (quedan pendientes). Use «Guardar documentación»
        para asociarlos al registro del colaborador. «Otro» agrega un tipo nuevo al checklist.
        {hasPending ? (
          <span style={{ marginLeft: 6, color: tTok.primary, fontWeight: 700 }}>
            Hay cambios pendientes de guardar.
          </span>
        ) : null}
      </div>
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
                    onClick={() => onClickTipo(meta)}
                    style={{ cursor: canEdit && !busy ? 'pointer' : 'default' }}
                  >
                    <td style={lbl}>{meta.label}</td>
                    <td style={{ ...ui.td, color: tTok.textMuted }}>
                      {canEdit
                        ? (meta.tipo === 'otro' ? 'Clic para agregar tipo…' : 'Clic para seleccionar…')
                        : 'Sin documento'}
                    </td>
                    <td style={ui.td}>—</td>
                    <td style={ui.td}>—</td>
                  </tr>
                )
              }
              return (
                <tr key={row._pending ? `pending-${meta.tipo}` : row.id}>
                  <td style={lbl}>
                    {meta.label}
                    {row._pending ? (
                      <span style={{ marginLeft: 6, color: tTok.primary, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>
                        pendiente
                      </span>
                    ) : row.vigente ? (
                      <span style={{ marginLeft: 6, color: S.successColor, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>
                        vigente
                      </span>
                    ) : null}
                  </td>
                  <td style={ui.td}>
                    {row._pending ? (
                      <span>{row.nombre_archivo}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirPreview(row)}
                        style={{ ...S.btnGhost, padding: '4px 8px', border: 'none', color: tTok.primary }}
                      >
                        {row.nombre_archivo || 'Ver archivo'}
                      </button>
                    )}
                  </td>
                  <td style={ui.td}>{row.version_label || '—'}</td>
                  <td style={ui.td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!row._pending && (
                        <button type="button" style={{ ...S.btnGhost, padding: '4px 8px' }} onClick={() => setHistTipo(meta.tipo)}>
                          Historial
                        </button>
                      )}
                      {canEdit && row._pending && (
                        <button
                          type="button"
                          style={{ ...S.btnGhost, padding: '4px 8px' }}
                          disabled={busy}
                          onClick={() => quitarPendiente(meta.tipo)}
                        >
                          Quitar
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          style={{ ...S.btnGhost, padding: '4px 8px' }}
                          disabled={busy}
                          onClick={() => abrirFilePicker({
                            tipo: meta.tipo,
                            tipo_otro_texto: meta.custom ? meta.label : (row.tipo_otro_texto || null),
                            replaceId: row.id || null,
                          })}
                        >
                          {row._pending ? 'Cambiar archivo' : 'Reemplazar'}
                        </button>
                      )}
                      {canEdit && !row._pending && row.id && (
                        <button type="button" style={{ ...S.btnDanger }} disabled={busy} onClick={() => eliminar(row)}>
                          Eliminar
                        </button>
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
