import { useMemo, useState } from 'react'
import { CARGOS_PERSONAL } from './bitacoraConstants'
import { HINT_DOCUMENTACION_NO_APROBADA } from './bitacoraAsistenciaRrhhPolicy'
import NombreRrhhAutocomplete from './NombreRrhhAutocomplete'
import PersonalCargoDetalleModal from './PersonalCargoDetalleModal'
import {
  EMPRESA_REGISTRO_DIRECTO,
  HORA_INGRESO_DEFAULT,
  HORA_SALIDA_DEFAULT,
  asistenciaRowFromRrhh,
  cantidadManualPorCargo,
  emptyAsistenciaRow,
  filasAsistenciaPorCargo,
  mapaEstadosRrhh,
  mergePersonalCantidades,
  nombreEmpresaAsistencia,
  normalizarCargoNombrePropio,
  personalAgregadoDesdeAsistencia,
  resolverCatalogoCargos,
  resumenCargosDesdeCatalogo,
  resumenEmpresasCargos,
} from './personalAsistenciaHelpers'
import { useSeguimientoCompact } from './seguimientoShared'

export { default as NombreRrhhAutocomplete } from './NombreRrhhAutocomplete'

/**
 * Personal en obra: resumen compacto (chips) por consolidado / empresa
 * + detalle en popup. El registro (campos/validaciones) se mantiene.
 */
export default function PersonalAsistenciaPanel({
  t,
  rows = [],
  onChange,
  disabled = false,
  sheetStyles = null,
  compact = false,
  rrhhCatalogo = [],
  /** Catálogo de cargos desde RRHH (categoria cargo). */
  cargosCatalogo = [],
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

  const cargosBase = useMemo(
    () => resolverCatalogoCargos({
      catalogoRrhh: cargosCatalogo,
      trabajadores: rrhhCatalogo,
      fallback: cargosOpciones?.length ? cargosOpciones : CARGOS_PERSONAL,
    }),
    [cargosCatalogo, rrhhCatalogo, cargosOpciones],
  )

  const resumenEmpresas = useMemo(
    () => resumenEmpresasCargos({
      rows,
      personalManual: permitirCargoCantidad ? personalManual : [],
      liveEstadosByRrhhId: liveMap,
    }),
    [rows, personalManual, permitirCargoCantidad, liveMap],
  )

  const resumenConsolidado = useMemo(
    () => resumenCargosDesdeCatalogo(cargosBase, agregado),
    [cargosBase, agregado],
  )

  const usedIds = useMemo(
    () => (rows || []).map((r) => r.rrhh_trabajador_id).filter((x) => x != null),
    [rows],
  )

  const entriesDetalle = useMemo(() => {
    if (!cargoDetalle?.cargo) return []
    if (cargoDetalle.esRegistroDirecto) return []
    if (cargoDetalle.esConsolidado) {
      return filasAsistenciaPorCargo(rows, cargoDetalle.cargo)
    }
    return filasAsistenciaPorCargo(rows, cargoDetalle.cargo, {
      empresa: cargoDetalle.empresa,
    })
  }, [rows, cargoDetalle])

  const cantidadManualDetalle = useMemo(() => {
    if (!cargoDetalle?.cargo || !cargoDetalle.esRegistroDirecto) return 0
    return cantidadManualPorCargo(personalManual, cargoDetalle.cargo)
  }, [personalManual, cargoDetalle])

  const addCargoCantidad = () => {
    let cargo = String(draftCargo || '').trim()
    if (cargo.toLowerCase() === 'otro') {
      cargo = String(draftCargoOtro || '').trim()
    }
    cargo = normalizarCargoNombrePropio(cargo)
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
      hora_ingreso: draftAdd.hora_ingreso || HORA_INGRESO_DEFAULT,
      hora_salida: draftAdd.hora_salida || HORA_SALIDA_DEFAULT,
      tramo: draftAdd.tramo || '',
    }))
  }

  const confirmDraftAdd = () => {
    if (!String(draftAdd.nombre || '').trim()) return
    onChange?.([...(rows || []), { ...draftAdd }])
    const cargo = String(draftAdd.cargo || '').trim()
    const empresa = nombreEmpresaAsistencia(draftAdd)
    setDraftAdd(emptyAsistenciaRow())
    setAddOpen(false)
    if (cargo) {
      setCargoDetalle({
        cargo,
        empresa,
        empresa_key: String(empresa).toLowerCase(),
        esRegistroDirecto: false,
      })
    }
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

  const openCargoDetalle = (grupo, cargoRow) => {
    setCargoDetalle({
      cargo: cargoRow.cargo,
      empresa: grupo.empresa,
      empresa_key: grupo.empresa_key,
      esRegistroDirecto: Boolean(grupo.esRegistroDirecto),
      esConsolidado: false,
    })
  }

  const openCargoConsolidado = (cargoRow) => {
    setCargoDetalle({
      cargo: cargoRow.cargo,
      empresa: '',
      empresa_key: '',
      esRegistroDirecto: false,
      esConsolidado: true,
    })
  }

  /** Chips densos: cargo + contador; clic abre el mismo popup de detalle. */
  const renderCargoChips = (cargos, { onOpen, keyPrefix, ariaLabel }) => (
    <div
      role="list"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        alignItems: 'flex-start',
      }}
    >
      {cargos.map((row) => {
        const n = Number(row.cantidad) || 0
        const activo = n > 0
        return (
          <button
            key={`${keyPrefix}-${row.cargo}`}
            type="button"
            role="listitem"
            onClick={() => onOpen(row)}
            title={`Ver detalle de ${row.cargo}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: '100%',
              margin: 0,
              padding: '3px 8px 3px 9px',
              border: `1px solid ${activo ? (t.primary || '#0077B6') : t.border}`,
              borderRadius: 6,
              background: activo
                ? 'rgba(0, 119, 182, 0.06)'
                : (t.bg || t.bgCard || '#fff'),
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: 'none',
              lineHeight: 1.2,
              transition: 'border-color 120ms ease, background 120ms ease',
            }}
          >
            <span style={{
              fontWeight: 600,
              fontSize: 'var(--cc-caption)',
              color: t.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 140,
            }}>
              {row.cargo}
            </span>
            <span style={{
              flex: '0 0 auto',
              fontWeight: 800,
              fontSize: 'var(--cc-xs)',
              fontVariantNumeric: 'tabular-nums',
              color: activo ? (t.primary || '#0077B6') : (t.textMuted || '#64748b'),
              minWidth: '1.1em',
              textAlign: 'right',
            }}>
              {n}
            </span>
          </button>
        )
      })}
    </div>
  )

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

  const totalPersonas = agregado.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
  const selectCargos = cargosBase.length
    ? cargosBase
    : (cargosOpciones?.length ? cargosOpciones : CARGOS_PERSONAL)

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
            ? 'Consolidado por cargo (catálogo RRHH) y desglose por empresa solo con cargos registrados ese día.'
            : 'Arriba: consolidado general por cargo. Abajo: desglose por empresa solo con los cargos que tiene registrados.'}
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
              value={(draftAdd.hora_ingreso || HORA_INGRESO_DEFAULT).slice(0, 5)}
              onChange={(e) => setDraftAdd((d) => ({
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
              {selectCargos.map((c) => (
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
        <span style={{ fontWeight: 700, textTransform: 'none', letterSpacing: 0, fontSize: 'var(--cc-caption)' }}>
          {totalPersonas} persona{totalPersonas === 1 ? '' : 's'}
        </span>
      </div>
      <div
        data-testid="bitacora-resumen-cargos-compacto"
        style={{
          ...(ui.sheetWrapFlush || ui.sheetWrap || {}),
          /* Chips densos a ancho completo del popup (sin columna vacía a la derecha). */
          width: '100%',
          maxWidth: '100%',
          padding: viewportCompact ? 8 : 10,
          display: 'flex',
          flexDirection: 'column',
          gap: viewportCompact ? 10 : 12,
          boxSizing: 'border-box',
        }}
      >
        <section aria-label="Consolidado general por cargo" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontWeight: 800,
            fontSize: 'var(--cc-caption)',
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Consolidado general
          </div>
          {resumenConsolidado.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
              Sin cargos en el catálogo de RRHH.
            </div>
          ) : renderCargoChips(resumenConsolidado, {
            keyPrefix: 'cons',
            ariaLabel: 'Consolidado por cargo',
            onOpen: openCargoConsolidado,
          })}
        </section>

        <section aria-label="Desglose por empresa" style={{ display: 'flex', flexDirection: 'column', gap: viewportCompact ? 8 : 10 }}>
          <div style={{
            fontWeight: 800,
            fontSize: 'var(--cc-caption)',
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Por empresa
          </div>
          {resumenEmpresas.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-xs)' }}>
              Sin colaboradores nominados por empresa este día.
            </div>
          ) : resumenEmpresas.map((grupo) => (
            <div
              key={`emp-${grupo.empresa_key}`}
              aria-label={grupo.empresa}
              style={{ display: 'flex', flexDirection: 'column', gap: 5 }}
            >
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 4,
                paddingBottom: 2,
                borderBottom: `1px solid ${t.border}`,
              }}>
                <div style={{
                  fontWeight: 700,
                  fontSize: 'var(--cc-caption)',
                  color: t.text,
                  letterSpacing: '0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}>
                  {grupo.empresa}
                </div>
                <div style={{
                  fontSize: 'var(--cc-caption)',
                  fontWeight: 700,
                  color: t.textMuted,
                  flex: '0 0 auto',
                }}>
                  {grupo.total}
                  {grupo.esRegistroDirecto ? ' · directo' : ''}
                </div>
              </div>
              {renderCargoChips(grupo.cargos, {
                keyPrefix: `emp-${grupo.empresa_key}`,
                ariaLabel: `Cargos de ${grupo.empresa}`,
                onOpen: (row) => openCargoDetalle(grupo, row),
              })}
            </div>
          ))}
        </section>
      </div>

      {cargoDetalle?.cargo && (
        <PersonalCargoDetalleModal
          t={t}
          cargo={cargoDetalle.cargo}
          empresa={cargoDetalle.esConsolidado || cargoDetalle.esRegistroDirecto
            ? (cargoDetalle.esRegistroDirecto ? EMPRESA_REGISTRO_DIRECTO : '')
            : cargoDetalle.empresa}
          esRegistroDirecto={Boolean(cargoDetalle.esRegistroDirecto)}
          entries={entriesDetalle}
          rows={rows}
          onChange={onChange}
          disabled={disabled}
          rrhhCatalogo={rrhhCatalogo}
          tramosCatalogo={tramosCatalogo}
          cantidadManual={cantidadManualDetalle}
          onChangeCantidadManual={(n) => setCantidadManualCargo(cargoDetalle.cargo, n)}
          permitirCargoCantidad={permitirCargoCantidad && Boolean(cargoDetalle.esRegistroDirecto)}
          viewportCompact={viewportCompact}
          onClose={() => setCargoDetalle(null)}
        />
      )}
    </div>
  )
}
