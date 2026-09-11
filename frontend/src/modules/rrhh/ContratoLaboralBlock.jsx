import { useEffect, useState } from 'react'
import SoportePreviewModal from '../../contabilidad/SoportePreviewModal'
import CcDatePickerInput from '../../components/CcDatePickerInput'
import { tFrom } from '../../theme/adminPanelTheme'
import CatalogSelect from './CatalogSelect'
import { rrhhSheetCssVars, rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

/**
 * Generación de contrato laboral PDF + historial de versiones.
 * compact: omite título/leyenda y admite fecha de ingreso en la misma hoja (TAB Documentación).
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
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [preview, setPreview] = useState({
    open: false, loading: false, error: '', nombre: '', mime: '', blobUrl: null,
  })
  const [previewUrl, setPreviewUrl] = useState(null)

  const tipoOptions = (tiposContrato || [])
    .map((t) => (typeof t === 'string' ? t : t?.nombre))
    .filter(Boolean)

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
              <td style={{ ...ui.tdLabel, width: '28%' }}>Tipo de contrato *</td>
              <td style={ui.td}>
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
            {onFechaIngresoChange && (
              <tr>
                <td style={ui.tdLabel}>Fecha de ingreso</td>
                <td style={ui.td}>
                  <CcDatePickerInput
                    value={fechaIngreso || ''}
                    disabled={!canEdit}
                    style={ui.cellInp}
                    aria-label="Fecha de ingreso"
                    onChange={onFechaIngresoChange}
                  />
                </td>
              </tr>
            )}
            <tr>
              <td style={ui.tdLabel}>N.° contrato laboral</td>
              <td style={{ ...ui.td, color: tTok.textMuted }}>
                Automático (CTO-LAB-0001, CTO-LAB-0002, …)
              </td>
            </tr>
            <tr>
              <td style={ui.tdLabel}>Fecha inicio</td>
              <td style={ui.td}>
                <CcDatePickerInput
                  value={fechaInicio}
                  disabled={!canEdit}
                  style={ui.cellInp}
                  aria-label="Fecha inicio del contrato laboral"
                  onChange={setFechaInicio}
                />
              </td>
            </tr>
            <tr>
              <td style={ui.tdLabel}>Fecha fin</td>
              <td style={ui.td}>
                <CcDatePickerInput
                  value={fechaFin}
                  disabled={!canEdit}
                  style={ui.cellInp}
                  aria-label="Fecha fin del contrato laboral"
                  onChange={setFechaFin}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button type="button" style={{ ...S.btnPrimary, marginBottom: 8, padding: '6px 10px' }} disabled={busy} onClick={generar}>
          {busy ? 'Generando…' : 'Generar PDF del contrato'}
        </button>
      )}

      <div style={ui.sheetWrap}>
        <table style={ui.sheetTable}>
          <thead>
            <tr>
              <th style={ui.th}>Versión</th>
              <th style={ui.th}>N.° CTO-LAB</th>
              <th style={ui.th}>Tipo</th>
              <th style={ui.th}>Estado</th>
              <th style={ui.th}>Fecha</th>
              <th style={ui.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td style={ui.td} colSpan={6}>Cargando…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td style={ui.td} colSpan={6}>Aún no hay contratos generados.</td></tr>
            )}
            {items.map((row) => (
              <tr key={row.id}>
                <td style={ui.td}>v{row.version_num}{row.vigente ? ' · vigente' : ''}</td>
                <td style={ui.td}>{row.numero_contrato_laboral || '—'}</td>
                <td style={ui.td}>{row.tipo_contrato_nombre}</td>
                <td style={ui.td}>{row.estado}</td>
                <td style={ui.td}>{(row.created_at || '').toString().slice(0, 19).replace('T', ' ')}</td>
                <td style={ui.td}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(canExport || true) && (
                      <button type="button" style={{ ...S.btnGhost, padding: '4px 8px' }} onClick={() => abrir(row)}>
                        Ver PDF
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" style={S.btnDanger} disabled={busy} onClick={() => eliminar(row)}>
                        Anular
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
