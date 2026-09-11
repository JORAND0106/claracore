import { useCallback, useRef, useState } from 'react'
import CcDatePickerInput from '../../components/CcDatePickerInput'
import CatalogSelect from './CatalogSelect'
import ContratoLaboralBlock from './ContratoLaboralBlock'
import DocumentosTrabajadorBlock from './DocumentosTrabajadorBlock'
import { rrhhSheetStyles, rrhhUi } from './rrhhSheetStyles'

const panelStyle = (tTok) => ({
  padding: 12,
  border: `1px solid ${tTok.border}`,
  borderRadius: 10,
  background: tTok.bgCard,
})

/**
 * TAB unificado Documentación: soporte, ingreso, contrato, bancario,
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

  const refSoporte = useRef(null)
  const refIngreso = useRef(null)
  const refBancario = useRef(null)
  const refAfiliacion = useRef(null)

  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [obsValidacion, setObsValidacion] = useState(detalle?.doc_validacion_observacion || '')

  const setField = useCallback((key, val) => {
    setEditForm((prev) => ({ ...(prev || {}), [key]: val }))
  }, [setEditForm])

  const guardarTodo = async () => {
    if (!api || !detalle || !canEdit) return
    setBusy(true)
    try {
      // Campos del TAB (contrato + bancarios + fecha ingreso)
      await api.updateTrabajador(detalle.id, {
        fecha_ingreso: editForm?.fecha_ingreso || null,
        tipo_contrato: editForm?.tipo_contrato || null,
        banco_entidad: editForm?.banco_entidad || null,
        banco_tipo_cuenta: editForm?.banco_tipo_cuenta || null,
        banco_numero_cuenta: editForm?.banco_numero_cuenta || null,
      })
      const refs = [refSoporte, refIngreso, refBancario, refAfiliacion]
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

  const onCertBancariaSelected = async (file) => {
    if (!file || !api || !detalle || !canEdit) return
    // Encolar via ref: el bloque bancario ya maneja pending; aquí solo OCR
    setOcrBusy(true)
    try {
      const r = await api.ocrBancario(detalle.id, file)
      const sug = r?.sugerencias || {}
      if (sug.banco_entidad) setField('banco_entidad', sug.banco_entidad)
      if (sug.banco_tipo_cuenta) setField('banco_tipo_cuenta', sug.banco_tipo_cuenta)
      if (sug.banco_numero_cuenta) setField('banco_numero_cuenta', sug.banco_numero_cuenta)
      flash(r?.ok ? 'success' : 'error', r?.mensaje || 'OCR bancario completado.')
    } catch (e) {
      flash('error', e.message || 'OCR bancario falló.')
    } finally {
      setOcrBusy(false)
    }
  }

  // Intercept bancario file via wrapping: DocumentosTrabajadorBlock stages files;
  // we hook OCR by listening after pending — simpler: add OCR button that uses vigente/pending file.
  const runOcrFromPendingOrVigente = async () => {
    if (!api || !detalle) return
    setOcrBusy(true)
    try {
      // Prefer pending file from bancario block
      const pending = refBancario.current
      // Fallback: download vigente cert and re-upload to OCR endpoint
      const docs = await api.listDocumentos(detalle.id, 'bancario')
      const vig = (docs?.items || []).find((d) => d.tipo === 'certificacion_bancaria' && d.vigente)
      if (!vig) {
        flash('error', 'Cargue primero la certificación bancaria (queda pendiente) y guarde, o use OCR tras seleccionar el archivo.')
        // Try to OCR from a file picker
        return
      }
      const url = await api.fetchBlobUrl(api.documentoArchivoUrl(detalle.id, vig.id))
      const blob = await fetch(url).then((r) => r.blob())
      const file = new File([blob], vig.nombre_archivo || 'cert.pdf', { type: vig.mime_type || 'application/pdf' })
      await onCertBancariaSelected(file)
    } catch (e) {
      flash('error', e.message || 'No se pudo ejecutar OCR.')
    } finally {
      setOcrBusy(false)
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
          {detalle?.doc_consolidado_blob_path && (
            <button
              type="button"
              style={S.btnGhost}
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
              style={{
                ...S.btnPrimary,
                width: 40,
                height: 40,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
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
        <div style={{ ...ui.sectionTitle, marginBottom: 8 }}>Contrato laboral</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted, marginBottom: 2 }}>Tipo de contrato</div>
            <CatalogSelect
              value={editForm?.tipo_contrato || ''}
              options={catalogo?.tipo_contrato || []}
              canEdit={canEdit}
              style={inputStyle}
              onChange={(v) => setField('tipo_contrato', v)}
              onAddNew={async (v) => addCatalogValue('tipo_contrato', v)}
            />
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted, marginBottom: 2 }}>Fecha de ingreso</div>
            <CcDatePickerInput
              value={editForm?.fecha_ingreso || ''}
              onChange={(v) => setField('fecha_ingreso', v)}
              disabled={!canEdit}
            />
          </div>
        </div>
        <ContratoLaboralBlock
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          tiposContrato={(catalogo?.tipo_contrato || []).map((nombre) => ({ nombre, activo: true }))}
          tipoContrato={editForm?.tipo_contrato || detalle.tipo_contrato || ''}
          onTipoContratoChange={(v) => setField('tipo_contrato', v)}
          onAddTipoContrato={async (v) => addCatalogValue('tipo_contrato', v)}
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

      {/* Bancario */}
      <div style={panelStyle(tTok)}>
        <div style={{ ...ui.sectionTitle, marginBottom: 8 }}>Datos bancarios</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted }}>Entidad bancaria</div>
            <input style={inputStyle} disabled={!canEdit} value={editForm?.banco_entidad || ''} onChange={(e) => setField('banco_entidad', e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted }}>Tipo de cuenta</div>
            <select style={inputStyle} disabled={!canEdit} value={editForm?.banco_tipo_cuenta || ''} onChange={(e) => setField('banco_tipo_cuenta', e.target.value)}>
              <option value="">—</option>
              <option value="ahorros">Ahorros</option>
              <option value="corriente">Corriente</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 'var(--cc-xs)', color: tTok.textMuted }}>Número de cuenta</div>
            <input style={inputStyle} disabled={!canEdit} value={editForm?.banco_numero_cuenta || ''} onChange={(e) => setField('banco_numero_cuenta', e.target.value)} />
          </div>
        </div>
        {canEdit && (
          <button type="button" style={{ ...S.btnGhost, marginBottom: 8 }} disabled={ocrBusy || busy} onClick={runOcrFromPendingOrVigente}>
            {ocrBusy ? 'OCR…' : 'OCR desde certificación cargada'}
          </button>
        )}
        <DocumentosTrabajadorBlock
          ref={refBancario}
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          categoria="bancario"
          canEdit={canEdit}
          locked={locked}
          hideSave
          tituloOverride="Certificación bancaria (adjunto)"
          onMsg={(m) => flash(m.type, m.text)}
          onFileStaged={(file) => onCertBancariaSelected(file)}
        />
      </div>

      {/* Afiliaciones */}
      <div style={panelStyle(tTok)}>
        <div style={{ marginBottom: 8, fontSize: 'var(--cc-caption)', color: tTok.textMuted }}>
          Certificaciones obligatorias según afiliaciones del registro:
          {[detalle.eps && `EPS: ${detalle.eps}`, detalle.pension && `Pensión: ${detalle.pension}`, detalle.arl && `ARL: ${detalle.arl}`, detalle.cesantias && `Cesantías: ${detalle.cesantias}`, detalle.caja_compensacion && `Caja: ${detalle.caja_compensacion}`]
            .filter(Boolean).join(' · ') || 'Complete las afiliaciones en Registro.'}
        </div>
        <DocumentosTrabajadorBlock
          ref={refAfiliacion}
          theme={theme}
          api={api}
          trabajadorId={detalle.id}
          categoria="afiliacion"
          canEdit={canEdit}
          locked={locked}
          hideSave
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button type="button" style={S.btnPrimary} disabled={busy || locked} onClick={consolidar}>
                Consolidar documentación
              </button>
              <button
                type="button"
                style={S.btnGhost}
                disabled={busy || locked || !detalle.doc_auditoria_ok}
                onClick={() => setValidacion('aprobado')}
                title={!detalle.doc_auditoria_ok ? 'Requiere auditoría sin discrepancias' : ''}
              >
                Aprobado
              </button>
              <button type="button" style={S.btnGhost} disabled={busy || locked} onClick={() => setValidacion('pendiente')}>
                Pendiente
              </button>
              <button type="button" style={S.btnDanger} disabled={busy || locked} onClick={() => setValidacion('rechazado')}>
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
