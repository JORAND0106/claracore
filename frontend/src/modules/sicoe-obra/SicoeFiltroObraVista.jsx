import { useMemo, useState } from 'react'
import SicoeFiltroModal from './SicoeFiltroModal'
import { sicoeBundleTieneCriteriosUsuario, sicoeResumenFiltros } from './sicoeFiltroCatalogo'

/**
 * Barra compacta SicoeObra: botón Filtros (modal) + resumen + acciones.
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

  const numCriterios = busquedaRealizada && tieneCriterios ? 1 : 0

  const btnSec = {
    background: 'transparent',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 'var(--cc-caption)',
    fontWeight: 600,
    color: t.text,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <div
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              ...btnSec,
              background: t.primary,
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              padding: '6px 14px',
              flexShrink: 0,
            }}
          >
            🔍 Filtros
            {busquedaRealizada && tieneCriterios ? (
              <span style={{ marginLeft: 6, background: '#fff3', borderRadius: 10, padding: '1px 7px', fontSize: 'var(--cc-caption)' }}>
                ●
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
              padding: '6px 14px',
              flexShrink: 0,
              opacity: buscando ? 0.65 : 1,
            }}
          >
            {buscando ? '⏳ Buscando…' : 'Buscar'}
          </button>

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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexShrink: 0 }}>
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
                {buscando ? '⏳ Cargando…' : '⟳ Actualizar'}
              </button>
            )}
            {puedeExportar && typeof onExportarExcel === 'function' && (
              <button
                type="button"
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
