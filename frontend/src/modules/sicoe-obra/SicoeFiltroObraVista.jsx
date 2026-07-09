import { useMemo, useState } from 'react'
import SicoeFiltroModal from './SicoeFiltroModal'
import {
  sicoeBundleTieneCriteriosUsuario,
  sicoeResumenFiltros,
  sicoeFiltrosActivosKeys,
  sicoeFiltroDef,
  sicoeFiltroChipResumen,
  sicoeFiltroPatchLimpiar,
  sicoeFSicoeVacios,
  sicoeFiltroSnapshot,
} from './sicoeFiltroCatalogo'
import { useClaraViewport } from '../../useClaraViewport'

/**
 * Barra compacta SicoeObra: botón Filtros (modal / bottom sheet) + chips + acciones.
 */
export default function SicoeFiltroObraVista({
  t,
  contratoId,
  token,
  bundleAplicado,
  onBuscar,
  onLimpiar,
  onActualizar,
  actualizarDisabled,
  buscando,
  puedeExportar,
  onExportarExcel,
  exportDisabled,
  puedeVerSubcontratista,
  estadosReporte,
  etiquetasValidacion,
  nivelesDisponibles,
  encabezadoPorNivel,
  estiloChipCapa,
  avisoCapasY,
  filtroSubcList,
  pkList = [],
  busquedaRealizada = false,
  itemLabels = {},
  validacionMasivaPanel = null,
  extraActions = null,
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const { isMobile: vpMobile, isLandscapeMobile } = useClaraViewport()
  const compact = vpMobile || isLandscapeMobile

  const tieneCriterios = useMemo(
    () => sicoeBundleTieneCriteriosUsuario(bundleAplicado),
    [bundleAplicado],
  )

  const resumen = useMemo(() => {
    if (!busquedaRealizada || !tieneCriterios) {
      return 'Sin criterios aplicados — abra Filtros, defina criterios y pulse Buscar.'
    }
    return sicoeResumenFiltros(bundleAplicado, itemLabels, encabezadoPorNivel)
  }, [bundleAplicado, itemLabels, encabezadoPorNivel, busquedaRealizada, tieneCriterios])

  const chipsActivos = useMemo(() => {
    if (!busquedaRealizada || !tieneCriterios) return []
    const f = bundleAplicado?.fSicoe || {}
    const keys = sicoeFiltrosActivosKeys(f, {
      capasValidacion: bundleAplicado?.capasValidacion,
    })
    const out = []
    for (const key of keys) {
      if (key === '_capas') {
        const n = (bundleAplicado?.capasValidacion || []).length
        out.push({ key: '_capas', label: 'Validación', value: `${n} capa${n === 1 ? '' : 's'}` })
        continue
      }
      if (key === '_fechas_usuario') {
        out.push({ key: '_fechas_usuario', label: 'Fechas', value: 'Activo' })
        continue
      }
      if (key === 'pk_mapa') {
        out.push({ key: 'pk_mapa', label: 'PK', value: f.pk_label || f.pk_id_id || 'Mapa' })
        continue
      }
      const def = sicoeFiltroDef(key)
      if (!def) continue
      out.push({
        key,
        label: def.label,
        value: sicoeFiltroChipResumen(def, f, itemLabels),
      })
    }
    return out
  }, [bundleAplicado, busquedaRealizada, tieneCriterios, itemLabels])

  const quitarChip = (chipKey) => {
    const f = { ...(bundleAplicado?.fSicoe || sicoeFSicoeVacios()) }
    let capas = [...(bundleAplicado?.capasValidacion || [])]
    let capasOp = bundleAplicado?.capasValidacionOp || 'and'

    if (chipKey === '_capas') {
      capas = []
    } else if (chipKey === '_fechas_usuario') {
      Object.assign(f, {
        ambitoFecha: 'reporte',
        tipoFecha: 'creacion',
        fechaDesde: '',
        fechaHasta: '',
        usuario_id: '',
        usuarioLabel: '',
        usuarioAccion: 'creo',
      })
    } else if (chipKey === 'pk_mapa') {
      f.pk_id_id = ''
      f.pk_label = ''
    } else {
      const def = sicoeFiltroDef(chipKey)
      Object.assign(f, sicoeFiltroPatchLimpiar(def))
    }

    const snap = sicoeFiltroSnapshot({
      fSicoe: f,
      itemsChips: Array.isArray(f.items) ? f.items : [],
      itemsOp: f.itemsOp,
      capasValidacion: capas,
      capasValidacionOp: capasOp,
      q_observacion: f.q_observacion,
      q_nodo: f.q_nodo,
    })
    if (!sicoeBundleTieneCriteriosUsuario(snap)) {
      if (typeof onLimpiar === 'function') onLimpiar()
      return
    }
    if (typeof onBuscar === 'function') onBuscar(snap)
  }

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: compact ? '10px 14px' : '5px 10px',
    minHeight: compact ? 44 : undefined,
    fontSize: compact ? 'var(--cc-body)' : 'var(--cc-caption)',
    fontWeight: 600,
    color: t.text,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <div
        className="cc-sicoe-filtro-bar"
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 12,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="cc-sicoe-filtro-bar-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              ...btnSec,
              background: t.primary,
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              padding: compact ? '10px 14px' : '6px 14px',
              flexShrink: 0,
            }}
          >
            🔍 Filtros
            {busquedaRealizada && tieneCriterios ? (
              <span style={{ marginLeft: 6, background: '#fff3', borderRadius: 10, padding: '1px 7px', fontSize: 'var(--cc-caption)' }}>
                {chipsActivos.length || '●'}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            disabled={buscando}
            onClick={() => {
              if (!sicoeBundleTieneCriteriosUsuario(bundleAplicado)) {
                window.alert('Defina al menos un criterio de búsqueda antes de continuar.')
                return
              }
              if (typeof onBuscar === 'function') onBuscar(bundleAplicado)
            }}
            title="Ejecutar búsqueda con los criterios actuales (grilla y panel)"
            style={{
              ...btnSec,
              background: t.primary,
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              padding: compact ? '10px 14px' : '6px 14px',
              flexShrink: 0,
              opacity: buscando ? 0.65 : 1,
            }}
          >
            {buscando ? '⏳ Buscando…' : 'Buscar'}
          </button>

          {!compact && (
            <div
              style={{
                flex: '1 1 200px',
                minWidth: 0,
                fontSize: 'var(--cc-caption)',
                color: t.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={resumen}
            >
              <strong style={{ color: t.text }}>Criterios:</strong>{' '}
              {busquedaRealizada && tieneCriterios ? resumen : 'Ninguno'}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: compact ? 0 : 'auto' }}>
            <button type="button" onClick={onLimpiar} style={{ ...btnSec, color: '#ef4444', borderColor: '#ef444466' }}>
              Limpiar
            </button>
            {typeof onActualizar === 'function' && (
              <button
                type="button"
                onClick={onActualizar}
                disabled={!!actualizarDisabled}
                title="Recarga grilla y panel con los filtros actuales"
                style={{ ...btnSec, border: 'none', color: '#94a3b8', opacity: actualizarDisabled ? 0.5 : 0.92 }}
              >
                {buscando ? '⏳…' : '⟳'}
              </button>
            )}
            {puedeExportar && typeof onExportarExcel === 'function' && (
              <button
                type="button"
                className="cc-sicoe-export-desktop"
                onClick={onExportarExcel}
                disabled={!!exportDisabled}
                style={{ ...btnSec, opacity: exportDisabled ? 0.6 : 1 }}
              >
                ⬇ Excel
              </button>
            )}
            {extraActions}
          </div>
        </div>

        {chipsActivos.length > 0 && (
          <div className="cc-sicoe-filtro-chips" aria-label="Filtros activos">
            {chipsActivos.map((chip) => (
              <span
                key={chip.key}
                className="cc-sicoe-filtro-chip"
                style={{
                  background: `${t.primary}18`,
                  border: `1px solid ${t.primary}44`,
                  color: t.text,
                }}
              >
                <span style={{ color: t.primary, fontWeight: 700 }}>{chip.label}:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{chip.value}</span>
                <button
                  type="button"
                  aria-label={`Quitar filtro ${chip.label}`}
                  onClick={() => quitarChip(chip.key)}
                  style={{ color: t.textMuted }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {validacionMasivaPanel}
      </div>

      <SicoeFiltroModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        bundleAplicado={bundleAplicado}
        onBuscar={(snap) => {
          if (typeof onBuscar === 'function') onBuscar(snap)
        }}
        onLimpiarAplicado={onLimpiar}
        buscando={buscando}
        puedeVerSubcontratista={puedeVerSubcontratista}
        estadosReporte={estadosReporte}
        etiquetasValidacion={etiquetasValidacion}
        nivelesDisponibles={nivelesDisponibles}
        encabezadoPorNivel={encabezadoPorNivel}
        estiloChipCapa={estiloChipCapa}
        avisoCapasY={avisoCapasY}
        filtroSubcList={filtroSubcList}
        pkList={pkList}
      />
    </>
  )
}
