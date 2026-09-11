import { useEffect, useState } from 'react'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import CcDatePickerInput from '../../components/CcDatePickerInput'
import { tFrom } from '../../theme/adminPanelTheme'
import CatalogSelect from './CatalogSelect'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

const iconBtn = (base, extra = {}) => ({
  ...base,
  width: 34,
  height: 34,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...extra,
})

/**
 * Generación de contrato laboral PDF + historial de versiones.
 * compact: omite título/leyenda (TAB Documentación).
 */
export default function ContratoLaboralBlock({
  theme,
  api,
  trabajadorId,
  tiposContrato = [],
  tipoContrato = '',
  onTipoContratoChange,
  onAddTipoContrato,
  fechaIngreso = null,
  onFechaIngresoChange = null,
  compact = false,
  canEdit = true,
  canExport = true,
  onMsg,
}) {
  const tTok = tFrom(theme)
  const ui = rrhhSheetStyles(tTok)
  const S = rrhhUi(theme, tTok)
  const cssVars = rrhhSheetCssVars(tTok)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fechaInicio, setFechaInicio] = useState(fechaIngreso || '')
  const [fechaFin, setFechaFin] = useState('')
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const [previewUrl, setPreviewUrl] = useState(null)

  const tipoOptions = (tiposContrato || [])
    .map((t) => (typeof t === 'string' ? t : t?.nombre))
    .filter(Boolean)

  const cellPad = compact ? { padding: '3px 6px', minHeight: 28, lineHeight: 1.25 } : {}
  const cellLabel = { ...ui.tdLabel, ...cellPad }
  const cell = { ...ui.td, ...cellPad }

  useEffect(() => {
    if (fechaIngreso && !fechaInicio) setFechaInicio(fechaIngreso)
  }, [fechaIngreso, fechaInicio])

  const setInicio = (v) => {
    setFechaInicio(v)
    onFechaIngresoChange?.(v)
  }

  const cargar = async () => {
    if (!api || !trabajadorId) return
    setLoading(true)
    try {
      const res = await api.listContratosLaborales(trabajadorId)
      setItems(res?.items || [])
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudieron cargar los contratos.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajadorId])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const generar = async () => {
    if (!canEdit || !api) return
    if (!tipoContrato) {
      onMsg?.({ type: 'error', text: 'Seleccione un tipo de contrato del catálogo.' })
      return
    }
    setBusy(true)
    try {
      await api.generarContratoLaboral(trabajadorId, {
        tipo_contrato: tipoContrato,
        fecha_inicio: fechaInicio || null,
        fecha_fin: fechaFin || null,
      })
      onMsg?.({ type: 'success', text: 'Contrato laboral generado en PDF.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo generar el contrato.' })
    } finally {
      setBusy(false)
    }
  }

  const abrir = async (row) => {
    if (!api || !row?.id) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreview({ open: true, loading: true, error: '', nombre: row.nombre_archivo, mime: 'application/pdf', blobUrl: null })
    try {
      const url = await api.fetchBlobUrl(api.contratoLaboralArchivoUrl(trabajadorId, row.id))
      setPreviewUrl(url)
      setPreview({ open: true, loading: false, error: '', nombre: row.nombre_archivo, mime: 'application/pdf', blobUrl: url })
    } catch (e) {
      setPreview({ open: true, loading: false, error: e.message || 'No se pudo abrir el PDF.', nombre: row.nombre_archivo, mime: 'application/pdf', blobUrl: null })
    }
  }

  const eliminar = async (row) => {
    if (!canEdit || !row?.id) return
    if (!window.confirm('¿Anular esta versión del contrato laboral?')) return
    setBusy(true)
    try {
      await api.deleteContratoLaboral(trabajadorId, row.id)
      onMsg?.({ type: 'success', text: 'Contrato anulado.' })
      await cargar()
    } catch (e) {
      onMsg?.({ type: 'error', text: e.message || 'No se pudo anular.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cssVars, fontSize: 'var(--cc-sm)', color: 'var(--cc-text)' }}>
      {!compact && (
        <>
          <div style={ui.sectionTitle}>Contrato laboral (PDF)</div>
          <div style={{ marginBottom: 8, color: tTok.textMuted, fontSize: 'var(--cc-caption)' }}>
            Se genera desde plantilla con marcadores tipo {'{{NOMBRE_TRABAJADOR}}'}. El número de contrato se asigna automáticamente con prefijo CTO-LAB-.
          </div>
        </>
      )}

      <div style={{ ...ui.sheetWrap, maxHeight: 'none', marginBottom: 8 }}>
        <table style={{ ...ui.sheetTable, tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td style={{ ...cellLabel, width: '28%' }}>Tipo de contrato *</td>
              <td style={cell}>
                <CatalogSelect
                  value={tipoContrato || ''}
                  options={tipoOptions}
                  canEdit={canEdit}
                  style={ui.cellSelect}
                  onChange={(v) => onTipoContratoChange?.(v)}
                  onAddNew={async (v) => { await onAddTipoContrato?.(v) }}
                />
              </td>
            </tr>
            <tr>
              <td style={cellLabel}>N.° contrato laboral</td>
              <td style={cell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: tTok.textMuted }}>Automático (CTO-LAB-0001, …)</span>
                  {canEdit && (
                    <button
                      type="button"
                      style={iconBtn(S.btnPrimary)}
                      disabled={busy}
                      title="Generar PDF del contrato laboral"
                      aria-label="Generar PDF del contrato laboral"
                      onClick={generar}
                    >
                      {busy ? (
                        <span style={{ fontSize: 11 }}>…</span>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
            <tr>
              <td style={cellLabel}>Fechas</td>
              <td style={cell}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: tTok.textMuted, fontSize: 'var(--cc-caption)', whiteSpace: 'nowrap' }}>Inicio</span>
                  <CcDatePickerInput
                    value={fechaInicio}
                    disabled={!canEdit}
                    style={{ ...ui.cellInp, minWidth: 130, flex: 1 }}
                    aria-label="Fecha inicio del contrato laboral"
                    onChange={setInicio}
                  />
                  <span style={{ color: tTok.textMuted, fontSize: 'var(--cc-caption)', whiteSpace: 'nowrap' }}>Fin</span>
                  <CcDatePickerInput
                    value={fechaFin}
                    disabled={!canEdit}
                    style={{ ...ui.cellInp, minWidth: 130, flex: 1 }}
                    aria-label="Fecha fin del contrato laboral"
                    onChange={setFechaFin}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable}>
          <thead>
            <tr>
              <th style={ui.th}>Número de contrato</th>
              <th style={ui.th}>Estado</th>
              <th style={ui.th}>Fecha</th>
              <th style={{ ...ui.th, width: '22%' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td style={ui.td} colSpan={4}>Cargando…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td style={ui.td} colSpan={4}>Aún no hay contratos generados.</td></tr>
            )}
            {items.map((row) => (
              <tr key={row.id}>
                <td style={ui.td}>
                  {row.numero_contrato_laboral || '—'}
                  {row.vigente ? (
                    <span style={{ marginLeft: 6, color: tTok.primary, fontSize: 'var(--cc-caption)' }}>vigente</span>
                  ) : null}
                </td>
                <td style={ui.td}>{row.estado}</td>
                <td style={ui.td}>{(row.created_at || '').toString().slice(0, 19).replace('T', ' ')}</td>
                <td style={ui.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(canExport || true) && (
                      <button
                        type="button"
                        style={iconBtn(S.btnGhost)}
                        title="Ver PDF del contrato"
                        aria-label="Ver PDF del contrato"
                        onClick={() => abrir(row)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="2" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        style={iconBtn(S.btnDanger)}
                        disabled={busy}
                        title="Anular esta versión del contrato"
                        aria-label="Anular esta versión del contrato"
                        onClick={() => eliminar(row)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
            setPreview({ open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null })
          }}
          onDownload={() => {
            if (!preview.blobUrl) return
            const a = document.createElement('a')
            a.href = preview.blobUrl
            a.download = preview.nombre || 'contrato.pdf'
            a.click()
          }}
        />
      )}
    </div>
  )
}
