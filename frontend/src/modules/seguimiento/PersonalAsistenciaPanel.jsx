import { useMemo, useState } from 'react'
import { CARGOS_PERSONAL } from './bitacoraConstants'
import { HINT_DOCUMENTACION_NO_APROBADA } from './bitacoraAsistenciaRrhhPolicy'
import NombreRrhhAutocomplete from './NombreRrhhAutocomplete'
import PersonalCargoDetalleModal from './PersonalCargoDetalleModal'
import {
  HORA_SALIDA_DEFAULT,
  asistenciaRowFromRrhh,
  cantidadManualPorCargo,
  emptyAsistenciaRow,
  filasAsistenciaPorCargo,
  mapaEstadosRrhh,
  mergePersonalCantidades,
  personalAgregadoDesdeAsistencia,
} from './personalAsistenciaHelpers'
import { useSeguimientoCompact } from './seguimientoShared'

export { default as NombreRrhhAutocomplete } from './NombreRrhhAutocomplete'

/**
 * Personal en obra: resumen compacto por cargo + detalle en popup.
 * El registro (campos/validaciones) se mantiene; solo cambia la visualización.
 */
export default function PersonalAsistenciaPanel({
  t,
  rows = [],
  onChange,
  disabled = false,
  sheetStyles = null,
  compact = false,
  rrhhCatalogo = [],
  /** Catálogo de tramos (maestro PK) para dropdown por fila. */
  tramosCatalogo = [],
  /** Si true (reporte cerrado), el resumen usa el snapshot guardado, no el estado live de RRHH. */
  resumenCongelado = false,
  /** Filas {cargo, cantidad} del botón temporal. */
  personalManual = [],
  onChangePersonalManual,
  /** Mostrar botón «Registrar cargo y cantidad». */
  permitirCargoCantidad = false,
  /** Gate post-corte: solo documentación Aprobada. */
  gateRrhhAprobado = false,
  cargosOpciones = CARGOS_PERSONAL,
}) {
  const ui = sheetStyles || {}
  const viewportCompact = useSeguimientoCompact() || compact
  const [cargoFormOpen, setCargoFormOpen] = useState(false)
  const [draftCargo, setDraftCargo] = useState(CARGOS_PERSONAL[0] || 'Oficial')
  const [draftCargoOtro, setDraftCargoOtro] = useState('')
  const [draftCantidad, setDraftCantidad] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [draftAdd, setDraftAdd] = useState(() => emptyAsistenciaRow())
  const [cargoDetalle, setCargoDetalle] = useState(null)

  const liveMap = useMemo(
    () => (resumenCongelado ? null : mapaEstadosRrhh(rrhhCatalogo)),
    [resumenCongelado, rrhhCatalogo],
  )
  const agregadoRrhh = useMemo(
    () => personalAgregadoDesdeAsistencia(rows, { liveEstadosByRrhhId: liveMap }),
    [rows, liveMap],
  )
  const agregado = useMemo(
    () => mergePersonalCantidades(agregadoRrhh, personalManual),
    [agregadoRrhh, personalManual],
  )

  const usedIds = useMemo(
    () => (rows || []).map((r) => r.rrhh_trabajador_id).filter((x) => x != null),
    [rows],
  )

  const entriesDetalle = useMemo(
    () => (cargoDetalle ? filasAsistenciaPorCargo(rows, cargoDetalle) : []),
    [rows, cargoDetalle],
  )

  const cantidadManualDetalle = useMemo(
    () => (cargoDetalle ? cantidadManualPorCargo(personalManual, cargoDetalle) : 0),
    [personalManual, cargoDetalle],
  )

  const addCargoCantidad = () => {
    let cargo = String(draftCargo || '').trim()
    if (cargo.toLowerCase() === 'otro') {
      cargo = String(draftCargoOtro || '').trim()
    }
    const n = Number(draftCantidad)
    if (!cargo || !Number.isFinite(n) || n <= 0) return
    const next = mergePersonalCantidades(personalManual, [{ cargo, cantidad: n }])
    onChangePersonalManual?.(next)
    setDraftCantidad(1)
    setDraftCargoOtro('')
    setCargoFormOpen(false)
  }

  const pickDraftAdd = (trab) => {
    setDraftAdd(asistenciaRowFromRrhh(trab, {
      hora_ingreso: draftAdd.hora_ingreso || '',
      hora_salida: draftAdd.hora_salida || HORA_SALIDA_DEFAULT,
      tramo: draftAdd.tramo || '',
    }))
  }

  const confirmDraftAdd = () => {
    if (!String(draftAdd.nombre || '').trim()) return
    onChange?.([...(rows || []), { ...draftAdd }])
    setDraftAdd(emptyAsistenciaRow())
    setAddOpen(false)
    const cargo = String(draftAdd.cargo || '').trim()
    if (cargo) setCargoDetalle(cargo)
  }

  const setCantidadManualCargo = (cargo, cantidad) => {
    const key = String(cargo || '').trim().toLowerCase()
    const rest = (personalManual || []).filter(
      (r) => String(r?.cargo || '').trim().toLowerCase() !== key,
    )
    const n = Number(cantidad)
    const next = Number.isFinite(n) && n > 0
      ? mergePersonalCantidades(rest, [{ cargo, cantidad: n }])
      : mergePersonalCantidades(rest)
    onChangePersonalManual?.(next)
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

  const resumenRows = agregado.length ? agregado : [{ cargo: '—', cantidad: 0 }]
  const totalPersonas = agregado.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)

  return (
    <div>
      <div style={ui.sectionBarSolo || {
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 6,
      }}>
        <div style={ui.sectionBarSolo ? undefined : { ...ui.sectionTitle, marginBottom: 0 }}>
          Personal en obra
        </div>
        {!disabled && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {permitirCargoCantidad && (
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false)
                  setCargoFormOpen((v) => !v)
                }}
                style={ui.sectionBarSolo
                  ? { ...btnGhost, padding: '4px 8px', fontSize: 'var(--cc-caption)' }
                  : btnGhost}
                title={gateRrhhAprobado
                  ? 'Registro directo cargo/cantidad'
                  : 'Registro por cargo y cantidad (sin identificación individual)'}
              >
                Registrar cargo y cantidad
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCargoFormOpen(false)
                setDraftAdd(emptyAsistenciaRow())
                setAddOpen((v) => !v)
              }}
              style={ui.sectionBarSolo
                ? { ...btnGhost, padding: '4px 8px', fontSize: 'var(--cc-caption)' }
                : btnGhost}
            >
              + Agregar colaborador
            </button>
          </div>
        )}
      </div>

      {gateRrhhAprobado && (
        <div style={{
          fontSize: 'var(--cc-caption)',
          color: '#0F766E',
          background: 'rgba(13,148,136,0.08)',
          border: '1px solid rgba(13,148,136,0.25)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 8,
          lineHeight: 1.4,
        }}>
          {HINT_DOCUMENTACION_NO_APROBADA}
        </div>
      )}

      {!disabled && (
        <div style={{
          fontSize: 'var(--cc-caption)',
          color: t.textMuted,
          marginBottom: 6,
          lineHeight: 1.35,
        }}>
          {gateRrhhAprobado
            ? 'Agregue colaboradores con documentación Aprobada en RRHH. El resumen agrupa por cargo; haga clic en un cargo para ver el detalle.'
            : 'Agregue colaboradores desde RRHH. El resumen agrupa por cargo; haga clic en un cargo para ver y editar el detalle.'}
        </div>
      )}

      {!disabled && addOpen && (
        <div style={{
          ...ui.sheetWrap,
          marginBottom: 8,
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
              value={draftAdd.nombre}
              catalogo={rrhhCatalogo}
              excludeIds={usedIds}
              onPick={pickDraftAdd}
              style={cellInp}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Tramo *</span>
            <select
              value={draftAdd.tramo || ''}
              onChange={(e) => setDraftAdd((d) => ({ ...d, tramo: e.target.value }))}
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
              value={(draftAdd.hora_ingreso || '').slice(0, 5)}
              onChange={(e) => setDraftAdd((d) => ({ ...d, hora_ingreso: e.target.value }))}
              style={{ ...cellInp, width: 96 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Salida</span>
            <input
              type="time"
              value={(draftAdd.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5)}
              onChange={(e) => setDraftAdd((d) => ({
                ...d,
                hora_salida: e.target.value || HORA_SALIDA_DEFAULT,
              }))}
              style={{ ...cellInp, width: 96 }}
            />
          </label>
          <button
            type="button"
            onClick={confirmDraftAdd}
            disabled={!String(draftAdd.nombre || '').trim()}
            style={{
              ...btnGhost,
              borderStyle: 'solid',
              background: t.primary,
              color: '#fff',
              borderColor: t.primary,
              opacity: String(draftAdd.nombre || '').trim() ? 1 : 0.5,
              cursor: String(draftAdd.nombre || '').trim() ? 'pointer' : 'default',
            }}
          >
            Registrar
          </button>
        </div>
      )}

      {permitirCargoCantidad && cargoFormOpen && !disabled && (
        <div style={{
          ...ui.sheetWrap,
          marginBottom: 8,
          padding: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'flex-end',
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Cargo</span>
            <select
              value={draftCargo}
              onChange={(e) => setDraftCargo(e.target.value)}
              style={cellInp}
            >
              {(cargosOpciones?.length ? cargosOpciones : CARGOS_PERSONAL).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          {String(draftCargo).toLowerCase() === 'otro' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, flex: 1 }}>
              <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Cuál</span>
              <input
                value={draftCargoOtro}
                onChange={(e) => setDraftCargoOtro(e.target.value)}
                style={cellInp}
                placeholder="Nombre del cargo"
              />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 88 }}>
            <span style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: t.textMuted }}>Cantidad</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draftCantidad}
              onChange={(e) => setDraftCantidad(e.target.value)}
              style={cellInp}
            />
          </label>
          <button
            type="button"
            onClick={addCargoCantidad}
            style={{
              ...btnGhost,
              borderStyle: 'solid',
              background: t.primary,
              color: '#fff',
              borderColor: t.primary,
            }}
          >
            Sumar al resumen
          </button>
        </div>
      )}

      <div style={{
        ...(ui.sectionBar || { ...ui.sectionTitle, marginBottom: 6 }),
        marginTop: addOpen || cargoFormOpen ? 4 : 0,
      }}>
        <span>Resumen por cargo</span>
        {totalPersonas > 0 && (
          <span style={{ fontWeight: 700, textTransform: 'none', letterSpacing: 0, fontSize: 'var(--cc-caption)' }}>
            {totalPersonas} persona{totalPersonas === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div style={ui.sheetWrapFlush || ui.sheetWrap} className="cc-bitacora-sheet-scroll">
        <table
          className="cc-bitacora-responsive-table cc-bitacora-personal-table"
          style={{ ...ui.sheetTable, tableLayout: 'auto', minWidth: 0 }}
        >
          <thead>
            <tr>
              <th style={{ ...ui.th, width: '70%' }}>Cargo</th>
              <th style={{ ...ui.th, width: '30%', textAlign: 'center' }}>Cant.</th>
            </tr>
          </thead>
          <tbody>
            {resumenRows.map((row) => {
              const clickable = row.cargo && row.cargo !== '—'
              return (
                <tr key={`ag-${row.cargo}`}>
                  <td style={ui.td} data-label="Cargo">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => setCargoDetalle(row.cargo)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          margin: 0,
                          cursor: 'pointer',
                          color: t.primary,
                          fontSize: 'var(--cc-xs)',
                          fontWeight: 700,
                          textAlign: 'left',
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                        title={`Ver detalle de ${row.cargo}`}
                      >
                        {row.cargo}
                      </button>
                    ) : (
                      <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 600, color: t.textMuted }}>
                        {row.cargo}
                      </span>
                    )}
                  </td>
                  <td style={{ ...ui.td, textAlign: 'center', fontWeight: 800 }} data-label="Cant.">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => setCargoDetalle(row.cargo)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                          fontWeight: 800,
                          color: t.text,
                          fontSize: 'inherit',
                        }}
                        title={`Ver detalle de ${row.cargo}`}
                      >
                        {row.cantidad}
                      </button>
                    ) : row.cantidad}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {cargoDetalle && (
        <PersonalCargoDetalleModal
          t={t}
          cargo={cargoDetalle}
          entries={entriesDetalle}
          rows={rows}
          onChange={onChange}
          disabled={disabled}
          rrhhCatalogo={rrhhCatalogo}
          tramosCatalogo={tramosCatalogo}
          cantidadManual={cantidadManualDetalle}
          onChangeCantidadManual={(n) => setCantidadManualCargo(cargoDetalle, n)}
          permitirCargoCantidad={permitirCargoCantidad}
          viewportCompact={viewportCompact}
          onClose={() => setCargoDetalle(null)}
        />
      )}
    </div>
  )
}
