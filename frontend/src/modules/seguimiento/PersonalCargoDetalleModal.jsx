import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'
import {
  EMPRESA_REGISTRO_DIRECTO,
  HORA_INGRESO_DEFAULT,
  HORA_SALIDA_DEFAULT,
  asistenciaRowFromRrhh,
  emptyAsistenciaRow,
  filtrarCatalogoPorCargoYEmpresa,
  formatHorarioAsistencia,
} from './personalAsistenciaHelpers'
import NombreRrhhAutocomplete from './NombreRrhhAutocomplete'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

/**
 * Detalle por cargo (y empresa): popup con encabezado institucional y grilla
 * tipo Excel. Al agregar, el catálogo RRHH se filtra a cargo + empresa.
 */
export default function PersonalCargoDetalleModal({
  t,
  cargo,
  empresa = '',
  esRegistroDirecto = false,
  entries = [],
  rows = [],
  onChange,
  disabled = false,
  rrhhCatalogo = [],
  tramosCatalogo = [],
  cantidadManual = 0,
  onChangeCantidadManual,
  permitirCargoCantidad = false,
  viewportCompact = false,
  zIndex = 12000,
  onClose,
}) {
  const ui = bitacoraSheetStyles(t)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState(() => emptyAsistenciaRow({ cargo: cargo || '' }))

  const usedIds = useMemo(
    () => (rows || []).map((r) => r.rrhh_trabajador_id).filter((x) => x != null),
    [rows],
  )

  const catalogoFiltrado = useMemo(
    () => filtrarCatalogoPorCargoYEmpresa(
      rrhhCatalogo,
      cargo,
      esRegistroDirecto ? EMPRESA_REGISTRO_DIRECTO : empresa,
    ),
    [rrhhCatalogo, cargo, empresa, esRegistroDirecto],
  )

  const cellInp = {
    ...ui.cellInp,
    width: '100%',
    height: 28,
    fontSize: 'var(--cc-xs)',
  }

  const btnGhost = {
    border: `1px solid ${t.border}`,
    background: t.bg || '#fff',
    color: t.text,
    borderRadius: 8,
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: 'var(--cc-sm)',
    cursor: 'pointer',
  }

  const btnPrimary = {
    ...btnGhost,
    border: 'none',
    background: t.primary,
    color: '#fff',
    fontWeight: 700,
  }

  const updateByIndex = (index, patch) => {
    onChange?.((rows || []).map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeByIndex = (index) => {
    onChange?.((rows || []).filter((_, i) => i !== index))
  }

  const pickDraft = (trab) => {
    setDraft(asistenciaRowFromRrhh(trab, {
      cargo: String(cargo || trab?.cargo_aspira || trab?.cargo || '').trim() || cargo,
      hora_ingreso: draft.hora_ingreso || HORA_INGRESO_DEFAULT,
      hora_salida: draft.hora_salida || HORA_SALIDA_DEFAULT,
      tramo: draft.tramo || '',
    }))
  }

  const confirmDraft = () => {
    if (!String(draft.nombre || '').trim()) return
    const row = {
      ...draft,
      cargo: String(draft.cargo || cargo || '').trim() || cargo,
    }
    onChange?.([...(rows || []), row])
    setDraft(emptyAsistenciaRow({ cargo: cargo || '' }))
    setDraftOpen(false)
  }

  const totalNombrados = entries.length
  const totalResumen = totalNombrados + (Number(cantidadManual) > 0 ? Number(cantidadManual) : 0)

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle ${cargo}${empresa ? ` · ${empresa}` : ''}`}
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={{ ...seguimientoModalOverlayStyle(viewportCompact), zIndex }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={viewportCompact ? 'cc-seguim-modal-sheet' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: true, zIndex }),
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow || '0 20px 50px rgba(0,0,0,0.25)',
          width: viewportCompact ? '100%' : 'min(980px, 98vw)',
          maxHeight: viewportCompact ? '96dvh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <CcModalBrandHeader theme={t} />

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 16px',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-title)' }}>
              {cargo || 'Sin cargo'}
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
              {empresa && empresa !== EMPRESA_REGISTRO_DIRECTO
                ? `${empresa} · `
                : (esRegistroDirecto ? 'Registro directo · ' : '')}
              {totalNombrados} colaborador{totalNombrados === 1 ? '' : 'es'} nominado{totalNombrados === 1 ? '' : 's'}
              {Number(cantidadManual) > 0
                ? ` · ${cantidadManual} por registro directo · total ${totalResumen}`
                : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyAsistenciaRow({ cargo: cargo || '' }))
                  setDraftOpen((v) => !v)
                }}
                style={btnPrimary}
              >
                + Agregar
              </button>
            )}
            <button type="button" onClick={onClose} style={btnGhost}>Cerrar</button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {permitirCargoCantidad && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              padding: '8px 10px',
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              background: t.bg || '#fff',
            }}>
              <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>
                Registro directo (sin nombre)
              </span>
              {disabled ? (
                <span style={{ fontWeight: 800, fontSize: 'var(--cc-sm)' }}>{cantidadManual || 0}</span>
              ) : (
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cantidadManual || 0}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    onChangeCantidadManual?.(Number.isFinite(n) && n >= 0 ? n : 0)
                  }}
                  style={{ ...cellInp, width: 88, textAlign: 'center', border: `1px solid ${t.border}`, borderRadius: 6, height: 32 }}
                  title="Cantidad adicional sin identificación individual"
                />
              )}
            </div>
          )}

          {!disabled && draftOpen && (
            <div style={{
              ...ui.sheetWrap,
              padding: 10,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'flex-end',
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px', minWidth: 160 }}>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Nombre</span>
                <NombreRrhhAutocomplete
                  t={t}
                  value={draft.nombre}
                  catalogo={catalogoFiltrado}
                  excludeIds={usedIds}
                  onPick={pickDraft}
                  style={cellInp}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Tramo *</span>
                <select
                  value={draft.tramo || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, tramo: e.target.value }))}
                  style={{ ...cellInp, height: 28 }}
                >
                  <option value="">Seleccione…</option>
                  {(tramosCatalogo || []).map((tr) => (
                    <option key={tr} value={tr}>{tr}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Ingreso</span>
                <input
                  type="time"
                  value={(draft.hora_ingreso || HORA_INGRESO_DEFAULT).slice(0, 5)}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    hora_ingreso: e.target.value || HORA_INGRESO_DEFAULT,
                  }))}
                  style={{ ...cellInp, width: 96 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Salida</span>
                <input
                  type="time"
                  value={(draft.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5)}
                  onChange={(e) => setDraft((d) => ({
                    ...d,
                    hora_salida: e.target.value || HORA_SALIDA_DEFAULT,
                  }))}
                  style={{ ...cellInp, width: 96 }}
                />
              </label>
              <button
                type="button"
                onClick={confirmDraft}
                disabled={!String(draft.nombre || '').trim()}
                style={{
                  ...btnPrimary,
                  opacity: String(draft.nombre || '').trim() ? 1 : 0.5,
                  cursor: String(draft.nombre || '').trim() ? 'pointer' : 'default',
                }}
              >
                Confirmar
              </button>
            </div>
          )}

          <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
            <table
              className="cc-bitacora-responsive-table cc-bitacora-personal-table"
              style={{ ...ui.sheetTable, minWidth: viewportCompact ? 0 : 720, tableLayout: 'auto' }}
            >
              <thead>
                <tr>
                  <th style={{ ...ui.th, width: '26%' }}>Nombre</th>
                  <th style={{ ...ui.th, width: '16%' }}>Tramo *</th>
                  <th style={{ ...ui.th, width: '18%' }}>Empresa</th>
                  <th style={{ ...ui.th, width: '22%' }}>Horario</th>
                  <th style={{ ...ui.th, width: '10%' }} />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...ui.td, color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
                      {Number(cantidadManual) > 0
                        ? 'Sin nombres nominados; la cantidad proviene del registro directo.'
                        : (disabled
                          ? 'Sin colaboradores en este cargo.'
                          : 'Sin colaboradores. Use «+ Agregar» para registrar desde RRHH.')}
                    </td>
                  </tr>
                ) : entries.map(({ row, index }) => {
                  const locked = disabled || (row.rrhh_trabajador_id != null && !!row.nombre)
                  return (
                    <tr key={`cargo-${row.rrhh_trabajador_id || row.nombre}-${index}`}>
                      <td style={ui.td} data-label="Nombre">
                        {disabled || locked ? (
                          <>
                            <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)' }}>{row.nombre}</div>
                            {row.documento_numero ? (
                              <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                                {row.documento_tipo || 'CC'} {row.documento_numero}
                              </div>
                            ) : null}
                            {!disabled && locked && (
                              <button
                                type="button"
                                onClick={() => updateByIndex(index, {
                                  rrhh_trabajador_id: null,
                                  nombre: '',
                                  cargo: cargo || '',
                                  subcontratista_nombre: '',
                                  subcontratista_id: null,
                                  documento_numero: '',
                                  estado: 'activo',
                                })}
                                style={{
                                  ...ui.clipBtn,
                                  color: t.primary,
                                  fontWeight: 600,
                                  fontSize: 'var(--cc-caption)',
                                  padding: 0,
                                  marginTop: 2,
                                }}
                              >
                                Cambiar
                              </button>
                            )}
                          </>
                        ) : (
                          <NombreRrhhAutocomplete
                            t={t}
                            value={row.nombre}
                            catalogo={catalogoFiltrado}
                            excludeIds={usedIds.filter((id) => id !== row.rrhh_trabajador_id)}
                            onPick={(trab) => {
                              updateByIndex(index, asistenciaRowFromRrhh(trab, {
                                hora_ingreso: row.hora_ingreso || HORA_INGRESO_DEFAULT,
                                hora_salida: row.hora_salida || HORA_SALIDA_DEFAULT,
                                observacion: row.observacion || '',
                                tramo: row.tramo || '',
                                cargo: String(cargo || trab?.cargo_aspira || trab?.cargo || '').trim() || cargo,
                              }))
                            }}
                            style={cellInp}
                          />
                        )}
                      </td>
                      <td style={ui.td} data-label="Tramo">
                        {disabled ? (
                          <span style={{ fontSize: 'var(--cc-xs)' }}>{row.tramo || '—'}</span>
                        ) : (
                          <select
                            value={row.tramo || ''}
                            onChange={(e) => updateByIndex(index, { tramo: e.target.value })}
                            style={{ ...cellInp, height: 28 }}
                            required
                            title="Tramo obligatorio por colaborador"
                          >
                            <option value="">Seleccione…</option>
                            {(tramosCatalogo || []).map((tr) => (
                              <option key={tr} value={tr}>{tr}</option>
                            ))}
                            {row.tramo && !(tramosCatalogo || []).includes(row.tramo) ? (
                              <option value={row.tramo}>{row.tramo}</option>
                            ) : null}
                          </select>
                        )}
                      </td>
                      <td style={ui.td} data-label="Empresa">
                        <span style={{ fontSize: 'var(--cc-xs)' }}>{row.subcontratista_nombre || '—'}</span>
                      </td>
                      <td style={ui.td} data-label="Horario">
                        {disabled ? (
                          formatHorarioAsistencia(row)
                        ) : (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="time"
                              value={(row.hora_ingreso || HORA_INGRESO_DEFAULT).slice(0, 5)}
                              onChange={(e) => updateByIndex(index, {
                                hora_ingreso: e.target.value || HORA_INGRESO_DEFAULT,
                              })}
                              style={{ ...cellInp, width: 96 }}
                              title="Hora de ingreso (defecto 07:30)"
                            />
                            <span style={{ color: t.textMuted }}>–</span>
                            <input
                              type="time"
                              value={(row.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5)}
                              onChange={(e) => updateByIndex(index, {
                                hora_salida: e.target.value || HORA_SALIDA_DEFAULT,
                              })}
                              style={{ ...cellInp, width: 96 }}
                              title="Hora de salida (defecto 16:30)"
                            />
                          </div>
                        )}
                      </td>
                      <td style={{ ...ui.td, textAlign: 'center', whiteSpace: 'nowrap' }} data-label="">
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => removeByIndex(index)}
                            style={{ ...ui.clipBtn, color: '#B91C1C', fontWeight: 700 }}
                            title="Quitar"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}
