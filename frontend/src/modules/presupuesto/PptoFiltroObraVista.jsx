import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PptoFiltroMapaPk from './PptoFiltroMapaPk'
import PptoFiltroModal from './PptoFiltroModal'
import {
  pptoFiltroChipResumen,
  pptoFiltroDef,
  pptoFiltroPatchActivar,
  pptoFiltrosActivosKeys,
} from './pptoFiltroCatalogo'

/**
 * Barra compacta: botón Filtros (modal) + resumen + acciones (mapa, Excel, etc.).
 */
export default function PptoFiltroObraVista({
  t,
  contratoId,
  token,
  f,
  onF,
  onBuscar,
  onLimpiar,
  filtroResetKey = 0,
  onRestablecerPksItem,
  onRevisorTramos,
  semaforo,
  barraResumen,
  buscando,
  onActualizar,
  actualizarDisabled,
  onMapPkPick,
  onExportarExcel,
  exportandoExcel,
  pkIdsDeGrilla,
  mostrarToggleTipoEjecucion = false,
  onTipoEjecucionChange,
  mostrarVersionador = false,
  esVersionInicial = true,
  onAbrirCrearVersion,
  onAbrirPanelVersiones,
  versionActiva = null,
  versionVistaTemporal = false,
  onVolverPresupuestoVivo,
  tramoOptions: _tramoOptions,
  calzadaOptions: _calzadaOptions,
  listadoPrecios = [],
  registrosGrilla = [],
}) {
  const [modalFiltrosOpen, setModalFiltrosOpen] = useState(false)
  const [mapaOpen, setMapaOpen] = useState(false)
  const mapPkSelRef = useRef('')

  const tipoEjecucionActivo = f.tipoEjecucion || 'Presupuesto de Obra'

  const hayFiltroFinoPks = !!(
    (f.pkCriterio && String(f.pkCriterio).trim()) ||
    (f.idPol && String(f.idPol).trim()) ||
    (f.texto && String(f.texto).trim())
  )
  const hayCap = !!(f.cap && String(f.cap).trim())

  useEffect(() => {
    mapPkSelRef.current = ''
  }, [filtroResetKey])

  useEffect(() => {
    mapPkSelRef.current = String(f.pkCriterio || '').trim()
  }, [f.pkCriterio])

  const itemLabels = useMemo(() => {
    const m = {}
    for (const p of listadoPrecios || []) {
      const num = String(p.item_numero ?? '').trim()
      if (!num) continue
      const desc = String(p.descripcion ?? '').trim()
      m[num] = desc ? `${num} — ${desc}` : num
    }
    return m
  }, [listadoPrecios])

  const chipKeys = pptoFiltrosActivosKeys(f, [])
  const resumenFiltros = useMemo(() => {
    if (!chipKeys.length) return 'Sin filtros adicionales'
    const partes = chipKeys.slice(0, 4).map((key) => {
      const def = pptoFiltroDef(key)
      if (!def) return null
      return `${def.label}: ${pptoFiltroChipResumen(def, f, itemLabels)}`
    }).filter(Boolean)
    const extra = chipKeys.length > 4 ? ` +${chipKeys.length - 4}` : ''
    return partes.join(' · ') + extra
  }, [chipKeys, f, itemLabels])

  const onPkFromMap = useCallback(
    (pkVal) => {
      const v = String(pkVal || '').trim()
      if (!v) return
      mapPkSelRef.current = v
      onF({ pkCriterio: v, ...pptoFiltroPatchActivar(pptoFiltroDef('pk_id')) })
      if (onMapPkPick) onMapPkPick(v)
    },
    [onF, onMapPkPick],
  )

  const onMapClearPk = useCallback(() => {
    mapPkSelRef.current = ''
    onF({ pkCriterio: '' })
  }, [onF])

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
      {versionActiva?.id && (
        <div
          style={{
            marginBottom: 10,
            padding: '10px 14px',
            borderRadius: 10,
            border: versionVistaTemporal ? '2px solid #B45309' : '2px solid #2563EB',
            background: versionVistaTemporal ? '#F59E0B14' : '#2563EB14',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 'var(--cc-sm)', color: t.text, lineHeight: 1.45 }}>
            {versionVistaTemporal ? (
              <>
                <strong style={{ color: '#B45309' }}>👁 Vista temporal</strong>
                <span style={{ marginLeft: 8 }}>
                  «{versionActiva.etiqueta}»
                  {versionActiva.numero_version != null ? ` (V${versionActiva.numero_version})` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
                  Solo visible para ti · Esta no es la versión oficial
                </span>
              </>
            ) : (
              <>
                <strong style={{ color: '#2563EB' }}>📚 Biblioteca de versión activa</strong>
                <span style={{ marginLeft: 8 }}>
                  Trabajando en «{versionActiva.etiqueta}»
                  {versionActiva.numero_version != null ? ` (V${versionActiva.numero_version})` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
                  Lectura y escritura en la biblioteca de esta versión — no modifica el presupuesto vivo.
                </span>
              </>
            )}
          </div>
          {typeof onVolverPresupuestoVivo === 'function' && (
            <button
              type="button"
              onClick={onVolverPresupuestoVivo}
              style={{
                ...btnSec,
                background: t.bgCard,
                border: `1px solid ${t.primary}`,
                color: t.primary,
                fontWeight: 800,
              }}
            >
              Volver al presupuesto vivo
            </button>
          )}
        </div>
      )}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 25,
          marginBottom: 10,
          background: t.bgCard,
          borderRadius: 8,
          boxShadow: t.shadow,
          border: `1px solid ${t.border}`,
          padding: '6px 10px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, rowGap: 6 }}>
          <button
            type="button"
            onClick={() => setModalFiltrosOpen(true)}
            style={{
              ...btnSec,
              background: t.primary,
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              padding: '6px 14px',
            }}
          >
            🔍 Filtros
            {chipKeys.length > 0 ? (
              <span style={{ marginLeft: 6, background: '#fff3', borderRadius: 10, padding: '1px 7px', fontSize: 'var(--cc-caption)' }}>
                {chipKeys.length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setMapaOpen(true)}
            title="Plano PK"
            style={{ ...btnSec, padding: '5px 8px' }}
          >
            🗺️
          </button>

          {mostrarToggleTipoEjecucion && typeof onTipoEjecucionChange === 'function' && (
            <div
              role="group"
              aria-label="Tipo de ejecución"
              style={{ display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}
            >
              {[
                ['Presupuesto de Obra', 'Presupuesto de Obra'],
                ['Obra Ejecutada', 'Obra Ejecutada'],
              ].map(([valor, etiqueta], idx) => {
                const activo = tipoEjecucionActivo === valor
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => onTipoEjecucionChange(valor)}
                    disabled={buscando}
                    style={{
                      background: activo ? t.primary : t.bg,
                      color: activo ? '#fff' : t.textMuted,
                      border: 'none',
                      borderRight: idx === 0 ? `1px solid ${t.border}` : 'none',
                      padding: '5px 10px',
                      fontSize: 'var(--cc-caption)',
                      fontWeight: activo ? 700 : 500,
                      cursor: buscando ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {etiqueta}
                  </button>
                )
              })}
            </div>
          )}

          {barraResumen != null && (
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, whiteSpace: 'nowrap' }}>{barraResumen}</div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {typeof onActualizar === 'function' && (
              <button type="button" onClick={onActualizar} disabled={!!actualizarDisabled} title="Recarga capítulos y datos del filtro actual" style={{ ...btnSec, border: 'none', color: '#94a3b8', opacity: actualizarDisabled ? 0.5 : 0.92 }}>
                🔄 Actualizar
              </button>
            )}
            {typeof onExportarExcel === 'function' && (
              <button type="button" onClick={onExportarExcel} disabled={!!exportandoExcel} style={{ ...btnSec, background: '#0077B618', borderColor: '#0077B6', color: '#0077B6', fontWeight: 700 }}>
                {exportandoExcel ? '⏳…' : '📥 Excel'}
              </button>
            )}
            {onRestablecerPksItem && hayFiltroFinoPks && hayCap && (
              <button type="button" onClick={onRestablecerPksItem} disabled={buscando} style={{ ...btnSec, background: '#0D948820', borderColor: '#0D9488', color: '#0D9488', fontWeight: 700 }}>
                Ver PK
              </button>
            )}
            <button type="button" onClick={onRevisorTramos} style={{ ...btnSec, background: '#0D948820', borderColor: '#0D9488', color: '#0D9488', fontWeight: 700 }}>
              🛣️ Tramos
            </button>
            {mostrarVersionador && typeof onAbrirCrearVersion === 'function' && (
              <button
                type="button"
                onClick={onAbrirCrearVersion}
                style={{
                  ...btnSec,
                  background: esVersionInicial ? t.primary : `${t.primary}18`,
                  color: esVersionInicial ? '#fff' : t.primary,
                  borderColor: t.primary,
                  fontWeight: 800,
                }}
              >
                {esVersionInicial ? 'Crear versión inicial' : 'Nueva versión'}
              </button>
            )}
            {mostrarVersionador && typeof onAbrirPanelVersiones === 'function' && (
              <button type="button" onClick={onAbrirPanelVersiones} style={btnSec}>
                Versiones
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px solid ${t.border}`,
            fontSize: 'var(--cc-caption)',
            color: t.textMuted,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={resumenFiltros}
        >
          <strong style={{ color: t.text }}>Criterios:</strong> {resumenFiltros}
        </div>
      </div>

      <PptoFiltroModal
        open={modalFiltrosOpen}
        onClose={() => setModalFiltrosOpen(false)}
        t={t}
        contratoId={contratoId}
        token={token}
        fAplicado={f}
        tipoEjecucionActivo={tipoEjecucionActivo}
        onBuscar={async (fSnap) => {
          if (typeof onBuscar === 'function') await onBuscar(fSnap)
        }}
        onLimpiarAplicado={onLimpiar}
        listadoPrecios={listadoPrecios}
        registrosGrilla={registrosGrilla}
        tramoOptions={_tramoOptions}
        calzadaOptions={_calzadaOptions}
        semaforo={semaforo}
        buscando={buscando}
      />

      {mapaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setMapaOpen(false)}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              height: '100%',
              background: t.bgCard,
              borderLeft: `1px solid ${t.border}`,
              boxShadow: t.shadow,
              display: 'flex',
              flexDirection: 'column',
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.text }}>Plano · PK</div>
              <button type="button" onClick={() => setMapaOpen(false)} style={{ ...btnSec, padding: '4px 10px' }}>
                Cerrar
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PptoFiltroMapaPk
                t={t}
                token={token}
                contratoId={contratoId}
                onPkPick={onPkFromMap}
                pkIdsDeGrilla={pkIdsDeGrilla}
                selectedPk={mapPkSelRef.current || f.pkCriterio}
                onClearSelection={onMapClearPk}
                height="100%"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
