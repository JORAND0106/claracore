import { useCallback, useRef, useState } from 'react'
import ContratoLaboralBlock from './ContratoLaboralBlock'
import DocumentosTrabajadorBlock from './DocumentosTrabajadorBlock'
import { PASTEL_ESTADO_VALIDACION } from '../sicoe-obra/sicoeReporteItemsTablaHelpers'
import { rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

const panelStyle = (tTok) => ({
  padding: 12,
  border: `1px solid ${tTok.border}`,
  borderRadius: 10,
  background: tTok.bgCard,
})

const iconSquare = (base, extra = {}) => ({
  ...base,
  width: 40,
  height: 40,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...extra,
})

function btnEstadoValidacion(estadoKey, disabled) {
  const pastel = PASTEL_ESTADO_VALIDACION[estadoKey] || PASTEL_ESTADO_VALIDACION.Pendiente
  return {
    background: pastel.bg,
    color: pastel.color,
    border: `1px solid ${pastel.border}`,
    borderRadius: 6,
    padding: '6px 12px',
    fontWeight: 700,
    fontSize: 'var(--cc-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}

/**
 * TAB unificado Documentación: soporte, ingreso, contrato,
 * afiliaciones, validación + un solo botón guardar (ícono).
 */
export default function DocumentacionTab({
  theme,
  tTok,
  api,
  detalle,
  editForm,
  setEditForm,
  catalogo,
  addCatalogValue,
  permisos,
  flash,
  onTrabajadorUpdated,
  formFromTrabajador,
}) {
  const S = rrhhUi(theme, tTok)
  const ui = rrhhSheetStyles(tTok)
  const locked = Boolean(detalle?.doc_bloqueado)
  const canEdit = (permisos.crear || permisos.editar) && !locked
  const canValidar = Boolean(permisos.validar || permisos.esDesarrollador)
  const esDesarrollador = Boolean(permisos.esDesarrollador)

  const refSoporte = useRef(null)
  const refIngreso = useRef(null)
  const refAfiliacion = useRef(null)

  const [busy, setBusy] = useState(false)
  const [obsValidacion, setObsValidacion] = useState(detalle?.doc_validacion_observacion || '')

  const setField = useCallback((key, val) => {
    setEditForm((prev) => ({ ...(prev || {}), [key]: val }))
  }, [setEditForm])

  const guardarTodo = async () => {
    if (!api || !detalle || !canEdit) return
    setBusy(true)
    try {
      await api.updateTrabajador(detalle.id, {
        fecha_ingreso: editForm?.fecha_ingreso || null,
        tipo_contrato: editForm?.tipo_contrato || null,
        eps: editForm?.eps || null,
        pension: editForm?.pension || null,
        arl: editForm?.arl || null,
        cesantias: editForm?.cesantias || null,
        caja_compensacion: editForm?.caja_compensacion || null,
      })
      const refs = [refSoporte, refIngreso, refAfiliacion]
      let files = 0
      let tipos = 0
      for (const r of refs) {
        if (r.current?.commitPending) {
          const res = await r.current.commitPending()
          files += res?.files || 0
          tipos += res?.tipos || 0
        }
      }
      const full = await api.getTrabajador(detalle.id)
      onTrabajadorUpdated?.(full)
      flash('success', `Documentación guardada${files || tipos ? ` (${files} archivo(s)${tipos ? `, ${tipos} tipo(s)` : ''})` : ''}.`)
    } catch (e) {
      flash('error', e.message || 'No se pudo guardar la documentación.')
    } finally {
      setBusy(false)
    }
  }

  const consolidar = async () => {
    if (!api || !detalle) return
    if (!canValidar && !permisos.editar) {
      flash('error', 'Sin permiso para consolidar.')
      return
    }
    setBusy(true)
    try {
      const r = await api.consolidarDocumentacion(detalle.id)
      onTrabajadorUpdated?.(r.trabajador)
      if (r.auditoria?.ok) {
        flash('success', 'Auditoría sin discrepancias. Ya puede marcar Aprobado.')
      } else {
        flash('error', 'La auditoría encontró diferencias. Revise las observaciones y corrija.')
      }
    } catch (e) {
      flash('error', e.message || 'No se pudo consolidar.')
    } finally {
      setBusy(false)
    }
  }

  const previewConsolidado = async () => {
    if (!api || !detalle || !esDesarrollador) return
    setBusy(true)
    try {
      await api.downloadBlob(
        api.previewConsolidadoUrl(detalle.id),
        `preview_documentacion_${detalle.numero_documento || detalle.id}.pdf`,
      )
      flash('success', 'Vista previa generada. No se modificaron adjuntos ni el estado de validación.')
    } catch (e) {
      flash('error', e.message || 'No se pudo generar la vista previa.')
    } finally {
      setBusy(false)
    }
  }

  const setValidacion = async (estado) => {
    if (!api || !detalle || !canValidar) return
    if (estado === 'aprobado' && !detalle.doc_auditoria_ok) {
      flash('error', 'Ejecute «Consolidar documentación» sin discrepancias antes de aprobar.')
      return
    }
    if ((estado === 'rechazado' || estado === 'pendiente') && estado === 'rechazado' && !String(obsValidacion || '').trim()) {
      flash('error', 'Indique la causal del rechazo.')
      return
    }
    if (estado === 'aprobado' && !window.confirm(
      '¿Aprobar? Se generará el PDF consolidado, se eliminarán los adjuntos individuales y se bloqueará la documentación.'
    )) return
    setBusy(true)
    try {
      const row = await api.setValidacionDocumentacion(detalle.id, {
        estado,
        observacion: obsValidacion || null,
      })
      onTrabajadorUpdated?.(row)
      flash('success', `Validación: ${estado}.`)
    } catch (e) {
      flash('error', e.message || 'No se pudo actualizar la validación.')
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = {
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${tTok.border}`,
    background: tTok.inputBg || tTok.bgCard,
    color: tTok.text,
    fontSize: 'var(--cc-sm)',
    width: '100%',
  }

  const hallazgos = (detalle?.doc_auditoria_resultado?.hallazgos || []).filter(
    (h) => ['DISCREPANCIA', 'NO ENCONTRADO'].includes(String(h.estado || '').toUpperCase()),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabecera con guardado único (solo ícono) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 700, color: tTok.text }}>Documentación del colaborador</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {esDesarrollador && (
            <button
              type="button"
              style={iconSquare(S.btnGhost)}
              disabled={busy}
              title="Vista previa del PDF consolidado con los documentos actuales (no borra adjuntos ni cambia la validación)"
              aria-label="Vista previa del PDF consolidado"
              onClick={previewConsolidado}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M1 12s4-4 11-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" transform="translate(0 4)" />
                <circle cx="12" cy="15" r="2.2" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}
          {detalle?.doc_consolidado_blob_path && (
            <button
              type="button"
              style={S.btnGhost}
              title="Abrir el PDF consolidado aprobado"
              onClick={() => api.downloadBlob(api.docConsolidadoUrl(detalle.id), detalle.doc_consolidado_nombre || 'consolidado.pdf')}
            >
              Ver PDF consolidado
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              title="Guardar documentación"
              aria-label="Guardar documentación"
              disabled={busy}
              onClick={guardarTodo}
              style={iconSquare(S.btnPrimary)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path d="M17 3v4H7V3" stroke="currentColor" strokeWidth="2" />
                <path d="M7 13h10v8H7z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(4,120,87,0.12)', color: S.successColor, fontWeight: 600 }}>
          Documentación aprobada y bloqueada.
        </div>
      )}

      {/* Contrato laboral */}
      <div style={panelStyle(tTok)}>
        <div style={{ ...ui.sectionTitle, marginBottom: 6 }}>Contrato laboral</div>
        <ContratoLaboralBlock
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          compact
          tiposContrato={(catalogo?.tipo_contrato || []).map((nombre) => ({ nombre, activo: true }))}
          tipoContrato={editForm?.tipo_contrato || detalle.tipo_contrato || ''}
          onTipoContratoChange={(v) => setField('tipo_contrato', v)}
          onAddTipoContrato={async (v) => addCatalogValue('tipo_contrato', v)}
          fechaIngreso={editForm?.fecha_ingreso || ''}
          onFechaIngresoChange={(v) => setField('fecha_ingreso', v)}
          canEdit={canEdit}
          canExport={permisos.exportar || permisos.ver}
          onMsg={(m) => flash(m.type, m.text)}
        />
      </div>

      {/* Soporte */}
      <div style={panelStyle(tTok)}>
        <DocumentosTrabajadorBlock
          ref={refSoporte}
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          categoria="soporte"
          canEdit={canEdit}
          locked={locked}
          hideSave
          customTipos={catalogo?.doc_soporte || []}
          onTiposChange={addCatalogValue}
          onMsg={(m) => flash(m.type, m.text)}
        />
      </div>

      {/* Ingreso */}
      <div style={panelStyle(tTok)}>
        <DocumentosTrabajadorBlock
          ref={refIngreso}
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          categoria="ingreso"
          canEdit={canEdit}
          locked={locked}
          hideSave
          customTipos={catalogo?.doc_ingreso || []}
          onTiposChange={addCatalogValue}
          onMsg={(m) => flash(m.type, m.text)}
        />
      </div>

      {/* Afiliaciones: entidad + certificación en el mismo panel */}
      <div style={panelStyle(tTok)}>
        <DocumentosTrabajadorBlock
          ref={refAfiliacion}
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          categoria="afiliacion"
          canEdit={canEdit}
          locked={locked}
          hideSave
          showAfiliacionEntidad
          afiliacionValues={editForm}
          catalogo={catalogo}
          onAfiliacionChange={(field, v) => setField(field, v)}
          onAfiliacionAdd={async (catalogKey, v) => addCatalogValue(catalogKey, v)}
          onMsg={(m) => flash(m.type, m.text)}
        />
      </div>

      {/* Validación */}
      <div style={panelStyle(tTok)}>
        <div style={{ ...ui.sectionTitle, marginBottom: 8 }}>Validación documental</div>
        {!canValidar ? (
          <div style={{ color: tTok.textMuted, fontSize: 'var(--cc-sm)' }}>
            Requiere permiso «Validar» (Desarrollador tiene acceso pleno).
            Estado actual: <b>{detalle.doc_validacion_estado || 'pendiente'}</b>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              {esDesarrollador && (
                <button
                  type="button"
                  style={iconSquare(S.btnPrimary)}
                  disabled={busy}
                  title="Vista previa del PDF consolidado con los documentos actuales (no borra adjuntos ni cambia la validación)"
                  aria-label="Vista previa del PDF consolidado"
                  onClick={previewConsolidado}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <circle cx="12" cy="15" r="2.2" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                style={esDesarrollador ? S.btnGhost : S.btnPrimary}
                disabled={busy || locked}
                onClick={consolidar}
              >
                {esDesarrollador ? 'Ejecutar auditoría' : 'Consolidar documentación'}
              </button>
              <button
                type="button"
                style={btnEstadoValidacion('Aprobado', busy || locked || !detalle.doc_auditoria_ok)}
                disabled={busy || locked || !detalle.doc_auditoria_ok}
                onClick={() => setValidacion('aprobado')}
                title={!detalle.doc_auditoria_ok ? 'Requiere auditoría sin discrepancias' : 'Marcar documentación como aprobada'}
              >
                Aprobado
              </button>
              <button
                type="button"
                style={btnEstadoValidacion('Pendiente', busy || locked)}
                disabled={busy || locked}
                onClick={() => setValidacion('pendiente')}
                title="Marcar documentación como pendiente"
              >
                Pendiente
              </button>
              <button
                type="button"
                style={btnEstadoValidacion('Rechazado', busy || locked)}
                disabled={busy || locked}
                onClick={() => setValidacion('rechazado')}
                title="Marcar documentación como rechazada"
              >
                Rechazado
              </button>
            </div>
            <div style={{ marginBottom: 8, fontSize: 'var(--cc-sm)' }}>
              Estado: <b>{detalle.doc_validacion_estado || 'pendiente'}</b>
              {detalle.doc_auditoria_ok === true && <span style={{ marginLeft: 8, color: S.successColor }}>· Auditoría OK</span>}
              {detalle.doc_auditoria_ok === false && <span style={{ marginLeft: 8, color: S.dangerColor }}>· Auditoría con diferencias</span>}
            </div>
            <div>
              <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted }}>Causal / observación (Pendiente o Rechazado)</div>
              <textarea
                style={{ ...inputStyle, minHeight: 64 }}
                disabled={locked}
                value={obsValidacion}
                onChange={(e) => setObsValidacion(e.target.value)}
              />
            </div>
            {(hallazgos.length > 0 || detalle.doc_auditoria_observaciones) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Observaciones de auditoría</div>
                <div style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  fontSize: 'var(--cc-sm)',
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(220,38,38,0.06)',
                  padding: 10,
                  borderRadius: 8,
                }}>
                  {detalle.doc_auditoria_observaciones
                    || hallazgos.map((h) => `${h.campo}: ${h.estado} — BD «${h.valor_bd}» / PDF «${h.valor_pdf}»`).join('\n')}
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginTop: 6 }}>
                  Corrija los datos o documentos (con permiso de edición) y vuelva a consolidar. El estado de validación no cambia automáticamente.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
