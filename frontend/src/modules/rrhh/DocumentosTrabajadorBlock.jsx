import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import { tFrom, isDarkMode } from '../../theme/adminPanelTheme'
import { buildDocChecklist, slugTipoDocumento } from './rrhhHelpers'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Bloque de documentos versionados.
 * Con hideSave: los archivos se encolan; el padre confirma con el guardado único del TAB.
 */
const DocumentosTrabajadorBlock = forwardRef(function DocumentosTrabajadorBlock({
  theme,
  api,
  trabajadorId,
  categoria = 'soporte',
  canEdit = true,
  customTipos = [],
  onTiposChange,
  onMsg,
  hideSave = false,
  locked = false,
  tituloOverride = null,
  onPendingChange = null,
  onFileStaged = null,
}, ref) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const S = rrhhUi(theme, tTok)
  const cssVars = rrhhSheetCssVars(tTok)
  const catalogKey = categoria === 'ingreso' ? 'doc_ingreso' : 'doc_soporte'
  const allowOtro = categoria === 'soporte' || categoria === 'ingreso'
  const editable = canEdit && !locked

  const [pendingTipos, setPendingTipos] = useState([])
  const tipos = useMemo(
    () => buildDocChecklist(categoria, [...(customTipos || []), ...pendingTipos]),
    [categoria, customTipos, pendingTipos],
  )

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [histTipo, setHistTipo] = useState(null)
  const [pendingByTipo, setPendingByTipo] = useState({})
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
    setPendingTipos([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadorId, categoria])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  useEffect(() => {
    const n = Object.keys(pendingByTipo).length + pendingTipos.length
    onPendingChange?.(n > 0)
  }, [pendingByTipo, pendingTipos, onPendingChange])

  useImperativeHandle(ref, () => ({
    hasPending: () => Object.keys(pendingByTipo).length > 0 || pendingTipos.length > 0,
    commitPending: async () => {
      if (!api || !trabajadorId || locked) return { files: 0, tipos: 0 }
      const entries = Object.entries(pendingByTipo)
      for (const label of pendingTipos) {
        if (onTiposChange) await onTiposChange(catalogKey, label)
        else await api?.addCatalogoOpcion?.(catalogKey, label)
      }
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
      const result = { files: entries.length, tipos: pendingTipos.length }
      setPendingByTipo({})
      setPendingTipos([])
      await cargar()
      return result
    },
    reload: cargar,
  }))

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
          nombre_archivo: pending.file?.name || 'Pendiente',
          version_label: pending.replaceId ? 'Reemplazo (pendiente)' : 'Nuevo (pendiente)',
        }
      }
      if (vig) return { ...vig, _meta: meta }
      return { _placeholder: true, tipo: meta.tipo, label: meta.label, _meta: meta }
    }),
    [tipos, vigentesPorTipo, pendingByTipo],
  )

  const abrirFilePicker = (action) => {
    if (!editable) return
    pendingActionRef.current = action
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const onClickTipo = async (meta) => {
    if (!editable || busy) return
    if (meta.tipo === 'otro') {
      if (!allowOtro) return
      const nombre = window.prompt('¿De qué tipo de documento se trata?')
      const label = String(nombre || '').trim()
      if (!label) {
        onMsg?.({ type: 'error', text: 'Debe indicar el nombre del tipo de documento.' })
        return
      }
      const already = [...(customTipos || []), ...pendingTipos].some(
        (t) => String(t).trim().toLowerCase() === label.toLowerCase(),
      )
      if (!already) setPendingTipos((prev) => [...prev, label])
      abrirFilePicker({ tipo: slugTipoDocumento(label), tipo_otro_texto: label })
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
    onFileStaged?.(file, action)
    onMsg?.({
      type: 'success',
      text: hideSave
        ? `«${file.name}» listo. Use el botón guardar del TAB para asociarlo.`
        : `«${file.name}» listo para guardar.`,
    })
  }

  const eliminarTipoOtro = async (meta) => {
    if (!editable || !meta?.custom || !meta.label) return
    if (!window.confirm(`¿Eliminar el tipo «${meta.label}» y sus documentos?`)) return
    setBusy(true)
    try {
      if (pendingTipos.includes(meta.label)) {
        setPendingTipos((prev) => prev.filter((x) => x !== meta.label))
        setPendingByTipo((prev) => {
          const next = { ...prev }
          delete next[meta.tipo]
          return next
        })
      } else {
        await api.eliminarTipoOtro({ categoria, label: meta.label })
        onMsg?.({ type: 'success', text: `Tipo «${meta.label}» eliminado.` })
        await cargar()
      }
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo eliminar el tipo.' })
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
      setPreview({ open: true, loading: false, error: e.message || 'No se pudo abrir.', nombre: doc.nombre_archivo, mime: doc.mime_type, blobUrl: null })
    }
  }

  const eliminar = async (doc) => {
    if (!editable || !doc?.id) return
    if (!window.confirm('¿Eliminar este documento?')) return
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

  const titulo = tituloOverride
    || (categoria === 'ingreso' ? 'Documentos de ingreso'
      : categoria === 'bancario' ? 'Certificación bancaria'
        : categoria === 'afiliacion' ? 'Certificaciones de afiliación'
          : 'Documentos de soporte')

  const histRows = histTipo ? (vigentesPorTipo[`${histTipo}__hist`] || []) : []

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      <div style={{ ...ui.sectionTitle, marginBottom: 6 }}>{titulo}</div>
      {locked && (
        <div style={{ marginBottom: 8, color: tTok.textMuted, fontSize: 'var(--cc-caption)' }}>
          Documentación bloqueada (aprobada). Solo consulta.
        </div>
      )}
      <div style={{ ...ui.sheetWrap, maxHeight: 'min(320px, 38vh)' }}>
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
            {loading && <tr><td style={ui.td} colSpan={4}>Cargando…</td></tr>}
            {!loading && displayRows.map((row) => {
              const meta = row._meta
              if (row._placeholder) {
                return (
                  <tr
                    key={`ph-${meta.tipo}`}
                    onClick={() => onClickTipo(meta)}
                    style={{ cursor: editable && !busy ? 'pointer' : 'default' }}
                  >
                    <td style={lbl}>
                      {meta.label}
                      {meta.custom && editable && (
                        <button
                          type="button"
                          style={{ ...S.btnDanger, marginLeft: 8, padding: '2px 6px', fontSize: 'var(--cc-caption)' }}
                          onClick={(e) => { e.stopPropagation(); eliminarTipoOtro(meta) }}
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                    <td style={{ ...ui.td, color: tTok.textMuted }}>
                      {editable ? (meta.tipo === 'otro' ? 'Clic para agregar tipo…' : 'Clic para seleccionar…') : 'Sin documento'}
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
                    {meta.custom && editable && (
                      <button
                        type="button"
                        style={{ ...S.btnDanger, marginLeft: 8, padding: '2px 6px', fontSize: 'var(--cc-caption)' }}
                        onClick={() => eliminarTipoOtro(meta)}
                      >
                        Eliminar
                      </button>
                    )}
                    {row._pending && (
                      <span style={{ marginLeft: 6, color: tTok.primary, fontSize: 'var(--cc-caption)', fontWeight: 700 }}>pendiente</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    {row._pending ? row.nombre_archivo : (
                      <button type="button" onClick={() => abrirPreview(row)} style={{ ...S.btnGhost, padding: '4px 8px', border: 'none', color: tTok.primary }}>
                        {row.nombre_archivo || 'Ver'}
                      </button>
                    )}
                  </td>
                  <td style={ui.td}>{row.version_label || '—'}</td>
                  <td style={ui.td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!row._pending && (
                        <button type="button" style={{ ...S.btnGhost, padding: '4px 8px' }} onClick={() => setHistTipo(meta.tipo)}>Historial</button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          style={{ ...S.btnGhost, padding: '4px 8px' }}
                          disabled={busy}
                          onClick={() => abrirFilePicker({
                            tipo: meta.tipo,
                            tipo_otro_texto: meta.custom ? meta.label : null,
                            replaceId: row.id || null,
                          })}
                        >
                          {row._pending ? 'Cambiar' : 'Reemplazar'}
                        </button>
                      )}
                      {editable && !row._pending && row.id && (
                        <button type="button" style={S.btnDanger} disabled={busy} onClick={() => eliminar(row)}>Eliminar</button>
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
        <div style={{ marginTop: 8, ...ui.sheetWrap, maxHeight: 180 }}>
          <div style={{ ...ui.sectionTitle, padding: '8px 10px 0' }}>
            Historial
            <button type="button" onClick={() => setHistTipo(null)} style={{ ...S.btnGhost, marginLeft: 10, padding: '2px 8px' }}>Cerrar</button>
          </div>
          <table style={ui.sheetTable}>
            <tbody>
              {histRows.map((h) => (
                <tr key={h.id}>
                  <td style={ui.td}>
                    <button type="button" style={{ ...S.btnGhost, border: 'none', color: tTok.primary, padding: 0 }} onClick={() => abrirPreview(h)}>
                      {h.nombre_archivo}
                    </button>
                  </td>
                  <td style={ui.td}>{h.vigente ? 'Vigente' : 'Histórico'}</td>
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
})

export default DocumentosTrabajadorBlock
