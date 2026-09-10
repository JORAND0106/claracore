import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { personalEnColumnas } from './bitacoraConstants'
import {
  HINT_REGISTRAR_EN_RRHH,
  HORA_SALIDA_DEFAULT,
  asistenciaRowFromRrhh,
  emptyAsistenciaRow,
  filtrarTrabajadoresRrhh,
  formatHorarioAsistencia,
  mapaEstadosRrhh,
  nombreCompletoRrhh,
  personalAgregadoDesdeAsistencia,
} from './personalAsistenciaHelpers'

/**
 * Autocompletado de nombre contra catálogo RRHH del contrato.
 */
function NombreRrhhAutocomplete({
  t,
  value,
  catalogo = [],
  excludeIds = [],
  disabled = false,
  onPick,
  style,
}) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const matches = useMemo(
    () => filtrarTrabajadoresRrhh(catalogo, query, excludeIds).slice(0, 12),
    [catalogo, query, excludeIds],
  )

  const showEmptyHint = open && String(query || '').trim().length >= 1 && matches.length === 0

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Buscar en RRHH…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        style={style}
        title="Seleccione un colaborador del catálogo de RRHH"
      />
      {open && !disabled && (matches.length > 0 || showEmptyHint) && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 2,
            maxHeight: 220,
            overflowY: 'auto',
            background: '#fff',
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {showEmptyHint ? (
            <div style={{
              padding: '10px 12px',
              fontSize: 'var(--cc-caption)',
              color: t.textMuted,
              lineHeight: 1.35,
            }}>
              {HINT_REGISTRAR_EN_RRHH}
            </div>
          ) : matches.map((trab) => {
            const label = nombreCompletoRrhh(trab)
            const doc = [trab.tipo_documento || 'CC', trab.numero_documento].filter(Boolean).join(' ')
            const meta = [trab.cargo_aspira, trab.empresa_nombre].filter(Boolean).join(' · ')
            return (
              <button
                key={`rrhh-${trab.id}`}
                type="button"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick?.(trab)
                  setQuery(label)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)', color: t.text }}>{label}</div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                  {[doc, meta].filter(Boolean).join(' · ')}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Personal en obra: asistencia diaria desde catálogo RRHH (sin popup de alta).
 */
export default function PersonalAsistenciaPanel({
  t,
  rows = [],
  onChange,
  disabled = false,
  sheetStyles = null,
  compact = false,
  rrhhCatalogo = [],
  /** Si true (reporte cerrado), el resumen usa el snapshot guardado, no el estado live de RRHH. */
  resumenCongelado = false,
}) {
  const ui = sheetStyles || {}
  const liveMap = useMemo(
    () => (resumenCongelado ? null : mapaEstadosRrhh(rrhhCatalogo)),
    [resumenCongelado, rrhhCatalogo],
  )
  const agregado = useMemo(
    () => personalAgregadoDesdeAsistencia(rows, { liveEstadosByRrhhId: liveMap }),
    [rows, liveMap],
  )
  const personalCols = useMemo(() => personalEnColumnas(
    agregado.length
      ? agregado
      : [{ cargo: '—', cantidad: 0 }],
  ), [agregado])
  const maxRows = Math.max(...personalCols.map((c) => c.length), 0)

  const usedIds = useMemo(
    () => (rows || []).map((r) => r.rrhh_trabajador_id).filter((x) => x != null),
    [rows],
  )

  const updateRow = (idx, patch) => {
    onChange?.((rows || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const pickTrabajador = (idx, trab) => {
    const base = asistenciaRowFromRrhh(trab, {
      hora_ingreso: rows[idx]?.hora_ingreso || '',
      hora_salida: rows[idx]?.hora_salida || HORA_SALIDA_DEFAULT,
      observacion: rows[idx]?.observacion || '',
    })
    updateRow(idx, base)
  }

  const addRow = () => {
    onChange?.([...(rows || []), emptyAsistenciaRow({ nombre: '', rrhh_trabajador_id: null })])
  }

  const removeRow = (idx) => {
    onChange?.((rows || []).filter((_, i) => i !== idx))
  }

  const btnGhost = {
    border: `1px dashed ${t.border}`,
    background: t.bg || '#fff',
    color: t.primary,
    borderRadius: 8,
    padding: '6px 10px',
    fontWeight: 700,
    fontSize: 'var(--cc-xs)',
    cursor: disabled ? 'default' : 'pointer',
  }

  const cellInp = {
    ...(ui.cellInp || {}),
    width: '100%',
    height: 28,
    fontSize: 'var(--cc-xs)',
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 6,
      }}>
        <div style={{ ...ui.sectionTitle, marginBottom: 0 }}>Personal en obra</div>
        {!disabled && (
          <button type="button" onClick={addRow} style={btnGhost}>
            + Agregar colaborador
          </button>
        )}
      </div>

      {!disabled && (
        <div style={{
          fontSize: 'var(--cc-caption)',
          color: t.textMuted,
          marginBottom: 6,
          lineHeight: 1.35,
        }}>
          Busque por nombre en el catálogo de RRHH. Cargo y empresa se completan solos.
          Los colaboradores nuevos se registran en Recursos Humanos.
        </div>
      )}

      <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
        <table
          className={compact ? 'cc-bitacora-responsive-table cc-bitacora-personal-table' : 'cc-bitacora-personal-table'}
          style={{ ...ui.sheetTable, minWidth: compact ? 0 : 640 }}
        >
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '28%' }}>Nombre</th>
              <th style={{ ...ui.th, width: '18%' }}>Cargo</th>
              <th style={{ ...ui.th, width: '20%' }}>Empresa</th>
              <th style={{ ...ui.th, width: '22%' }}>Horario</th>
              <th style={{ ...ui.th, width: '12%' }} />
            </tr>
          </thead>
          <tbody>
            {(rows || []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...ui.td, color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
                  {disabled
                    ? 'Sin colaboradores registrados este día.'
                    : 'Sin colaboradores. Use «+ Agregar colaborador» y selecciónelo desde RRHH.'}
                </td>
              </tr>
            ) : (rows || []).map((row, idx) => {
              const locked = disabled || (row.rrhh_trabajador_id != null && !!row.nombre)
              return (
                <tr key={`as-${row.rrhh_trabajador_id || row.colaborador_id || row.nombre}-${idx}`}>
                  <td style={ui.td} data-label="Nombre">
                    {disabled ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)' }}>{row.nombre}</div>
                        {row.documento_numero ? (
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                            {row.documento_tipo || 'CC'} {row.documento_numero}
                          </div>
                        ) : null}
                      </>
                    ) : locked ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 'var(--cc-xs)' }}>{row.nombre}</div>
                        {row.documento_numero ? (
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                            {row.documento_tipo || 'CC'} {row.documento_numero}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => updateRow(idx, {
                            rrhh_trabajador_id: null,
                            nombre: '',
                            cargo: '',
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
                      </>
                    ) : (
                      <NombreRrhhAutocomplete
                        t={t}
                        value={row.nombre}
                        catalogo={rrhhCatalogo}
                        excludeIds={usedIds.filter((id) => id !== row.rrhh_trabajador_id)}
                        onPick={(trab) => pickTrabajador(idx, trab)}
                        style={cellInp}
                      />
                    )}
                  </td>
                  <td style={ui.td} data-label="Cargo">
                    <span style={{ fontSize: 'var(--cc-xs)' }}>{row.cargo || '—'}</span>
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
                          value={(row.hora_ingreso || '').slice(0, 5)}
                          onChange={(e) => updateRow(idx, { hora_ingreso: e.target.value })}
                          style={{ ...cellInp, width: 96 }}
                          title="Hora de ingreso"
                        />
                        <span style={{ color: t.textMuted }}>–</span>
                        <input
                          type="time"
                          value={(row.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5)}
                          onChange={(e) => updateRow(idx, {
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
                        onClick={() => removeRow(idx)}
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

      <div style={{ ...ui.sectionTitle, marginTop: 12, marginBottom: 6 }}>
        Resumen por cargo (automático · solo Activos en RRHH)
      </div>
      <div style={ui.sheetWrap} className="cc-bitacora-sheet-scroll">
        {compact ? (
          <table
            className="cc-bitacora-responsive-table cc-bitacora-personal-table"
            style={{ ...ui.sheetTable, tableLayout: 'auto' }}
          >
            <thead>
              <tr>
                <th style={{ ...ui.th, width: '70%' }}>Cargo</th>
                <th style={{ ...ui.th, width: '30%', textAlign: 'center' }}>Cant.</th>
              </tr>
            </thead>
            <tbody>
              {(agregado.length ? agregado : [{ cargo: '—', cantidad: 0 }]).map((row) => (
                <tr key={`ag-${row.cargo}`}>
                  <td style={ui.td} data-label="Cargo">
                    <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 600 }}>{row.cargo}</span>
                  </td>
                  <td style={{ ...ui.td, textAlign: 'center', fontWeight: 800 }} data-label="Cant.">
                    {row.cantidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={ui.sheetTable} className="cc-bitacora-personal-table">
            <thead>
              <tr>
                {[0, 1, 2].map((c) => (
                  <th key={`h${c}`} colSpan={2} style={{ ...ui.th, textAlign: 'center' }}>
                    Col. {c + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {[0, 1, 2].map((c) => (
                  <Fragment key={`hh${c}`}>
                    <th style={{ ...ui.th, width: '18%' }}>Cargo</th>
                    <th style={{ ...ui.th, width: '7%', textAlign: 'center' }}>Cant.</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, ri) => (
                <tr key={`pr${ri}`}>
                  {[0, 1, 2].map((ci) => {
                    const row = personalCols[ci][ri]
                    return (
                      <Fragment key={`c${ci}-${ri}`}>
                        <td style={ui.td}>
                          {row ? (
                            <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 600 }}>{row.cargo}</span>
                          ) : null}
                        </td>
                        <td style={{ ...ui.td, textAlign: 'center', fontWeight: 800 }}>
                          {row && row.cargo !== '—' ? row.cantidad : (row ? 0 : '')}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
