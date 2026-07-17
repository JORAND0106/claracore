import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BibliiotecaPuntos from './BibliiotecaPuntos'
import PoligonalForm from './PoligonalForm'
import NewPointForm from './NewPointForm'
import NivelacionForm from './NivelacionForm'
import DisenoGeometricoForm from './DisenoGeometricoForm'
import EntregaDgObraForm from './EntregaDgObraForm'
import TuberiaForm from './TuberiaForm'
import TuberiaRegistroDiario from './TuberiaRegistroDiario'
import AreasForm from './AreasForm'
import EquiposForm from './EquiposForm'
import TopoConfirmModal from './TopoConfirmModal'
import { TopoOfflineProvider, useTopoOffline } from './offline/TopoOfflineContext.jsx'
import { TopoOfflineStatusBar } from './offline/TopoOfflinePanel.jsx'
import TopoConflictModal from './offline/TopoConflictModal.jsx'
import {
  OfflineBadge,
  defaultPermisos,
  topoStyles,
  TopoThemeProvider,
  useTopoTheme,
  useTopoViewport,
  useTopografiaApi,
} from './topografiaShared'

const PUNTOS_Y_CIRCUITOS = [
  {
    id: 'topo_biblioteca',
    label: 'Biblioteca de puntos',
    ayuda: 'Consulta de puntos verificados del contrato (poligonales selladas, NewPoint, etc.).',
  },
  {
    id: 'topo_poligonal',
    label: 'Poligonal',
    ayuda: 'Circuito trigonométrico: libreta, cierre, validación contratista e interventoría.',
  },
  {
    id: 'topo_newpoint',
    label: 'NewPoint',
    ayuda: 'Resección desde puesto arbitrario: referencia 00.0000 hacia P1, ángulo observado P1→P2 y distancias a dos puntos verificados de la misma poligonal sellada.',
  },
  {
    id: 'topo_nivelacion',
    label: 'Circuito Nivelación',
    ayuda: 'Registre un circuito o nivelación directa entre puntos con cota en biblioteca.',
  },
]

const VIAS = [
  {
    id: 'topo_diseno_geometrico',
    label: 'Configuración DG',
    ayuda: 'Rasante, esquema transversal y estructura de vía por eje (diseño geométrico).',
  },
  {
    id: 'topo_entrega_dg',
    label: 'Entrega DG Obra',
    ayuda: 'Seguimiento de entrega en obra por eje y capa: lecturas, deltas y avance por tramo.',
  },
]

const OTROS = [
  { id: 'topo_tuberia', label: 'Tuberia' },
  { id: 'topo_areas', label: 'Areas por Coordenadas' },
  { id: 'topo_equipos', label: 'Equipos' },
]

const ALL_MODS = [...PUNTOS_Y_CIRCUITOS, ...VIAS, ...OTROS]

function NavBtn({ mod, active, onClick, alertas, ui, compact }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={mod.ayuda || mod.label}
      className="cc-topo-nav-btn"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        textAlign: 'left',
        padding: compact ? '12px 14px' : '10px 12px',
        marginBottom: compact ? 0 : 4,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? ui.accentSoft : 'transparent',
        color: active ? ui.accent : ui.text,
        fontWeight: active ? 600 : 400,
        fontSize: 'var(--cc-sm)',
        minHeight: compact ? 44 : undefined,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ flex: 1 }}>{mod.label}</span>
      {mod.ayuda && (
        <span
          title={mod.ayuda}
          style={{
            display: 'inline-flex', width: compact ? 22 : 14, height: compact ? 22 : 14, borderRadius: '50%',
            background: active ? ui.accent : '#cbd5e1', color: '#fff', fontSize: compact ? 11 : 9,
            fontWeight: 700, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          ?
        </span>
      )}
      {mod.id === 'topo_equipos' && alertas > 0 && (
        <span style={{ color: '#dc2626', fontSize: 'var(--cc-xs)' }}>({alertas})</span>
      )}
    </button>
  )
}

function NavGroup({ titulo, mods, submodulo, intentarSubmodulo, alertas, ui, compact }) {
  return (
    <>
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, margin: compact ? '8px 0 4px' : '12px 0 6px', letterSpacing: 0.5 }}>
        {titulo}
      </div>
      {mods.map((mod) => (
        <NavBtn
          key={mod.id}
          mod={mod}
          active={submodulo === mod.id}
          onClick={() => intentarSubmodulo(mod.id)}
          alertas={alertas}
          ui={ui}
          compact={compact}
        />
      ))}
    </>
  )
}

function TopografiaLayout({ usuario, token, permisos, alertas, setAlertas, tuberiaSel, setTuberiaSel }) {
  const ui = useTopoTheme()
  const { isCompact, isLandscapeMobile } = useTopoViewport()
  const contratoId = usuario?.contrato_id
  const offline = useTopoOffline()
  const [conflictActivo, setConflictActivo] = useState(null)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [submodulo, setSubmodulo] = useState('topo_biblioteca')
  const [navOpen, setNavOpen] = useState(false)
  const [salirModuloPendiente, setSalirModuloPendiente] = useState(null)
  const [guardSalidaBusy, setGuardSalidaBusy] = useState(false)
  const entregaGuardRef = useRef(null)
  const { api, online } = useTopografiaApi(contratoId, token)

  useEffect(() => {
    if (offline.conflicts?.length && !conflictActivo) {
      setConflictActivo(offline.conflicts[0])
    }
  }, [offline.conflicts, conflictActivo])

  const labelActual = useMemo(
    () => ALL_MODS.find((m) => m.id === submodulo)?.label || 'Topografía',
    [submodulo],
  )

  useEffect(() => {
    if (!isCompact) setNavOpen(false)
  }, [isCompact])

  const registerUnsavedGuard = useCallback((guard) => {
    entregaGuardRef.current = guard
  }, [])

  const intentarSubmodulo = useCallback((id) => {
    if (id === submodulo) {
      setNavOpen(false)
      return
    }
    if (submodulo === 'topo_entrega_dg' && entregaGuardRef.current?.isDirty?.()) {
      setSalirModuloPendiente(id)
      return
    }
    setSubmodulo(id)
    setNavOpen(false)
  }, [submodulo])

  const ejecutarSalidaModulo = async (guardar) => {
    if (!salirModuloPendiente) return
    setGuardSalidaBusy(true)
    try {
      if (guardar) {
        const ok = await entregaGuardRef.current?.saveCartera?.()
        if (ok === false) return
      }
      setSubmodulo(salirModuloPendiente)
      setSalirModuloPendiente(null)
      setNavOpen(false)
    } finally {
      setGuardSalidaBusy(false)
    }
  }

  const renderSubmodulo = () => {
    const props = { contratoId, token, permisos, usuario }
    switch (submodulo) {
      case 'topo_biblioteca':
        return <BibliiotecaPuntos {...props} permisos={permisos} />
      case 'topo_poligonal':
        return <PoligonalForm {...props} />
      case 'topo_newpoint':
        return <NewPointForm {...props} />
      case 'topo_nivelacion':
        return <NivelacionForm {...props} />
      case 'topo_diseno_geometrico':
        return <DisenoGeometricoForm {...props} />
      case 'topo_entrega_dg':
        return <EntregaDgObraForm {...props} registerUnsavedGuard={registerUnsavedGuard} />
      case 'topo_tuberia':
        return (
          <div>
            <TuberiaForm {...props} onSelect={setTuberiaSel} />
            <div style={{ marginTop: 24 }}><TuberiaRegistroDiario {...props} tuberia={tuberiaSel} /></div>
          </div>
        )
      case 'topo_areas':
        return <AreasForm {...props} />
      case 'topo_equipos':
        return <EquiposForm {...props} onAlertasChange={setAlertas} />
      default:
        return null
    }
  }

  const navContent = (
    <nav className="cc-topo-nav">
      <NavGroup
        titulo="PUNTOS Y CIRCUITOS"
        mods={PUNTOS_Y_CIRCUITOS}
        submodulo={submodulo}
        intentarSubmodulo={intentarSubmodulo}
        alertas={alertas}
        ui={ui}
        compact={isCompact}
      />
      <NavGroup
        titulo="VÍAS"
        mods={VIAS}
        submodulo={submodulo}
        intentarSubmodulo={intentarSubmodulo}
        alertas={alertas}
        ui={ui}
        compact={isCompact}
      />
      <NavGroup
        titulo="OTROS"
        mods={OTROS}
        submodulo={submodulo}
        intentarSubmodulo={intentarSubmodulo}
        alertas={alertas}
        ui={ui}
        compact={isCompact}
      />
    </nav>
  )

  return (
    <div
      className={`cc-topo-root${isCompact ? ' cc-topo-root--compact' : ''}${isLandscapeMobile ? ' cc-topo-root--landscape' : ''}`}
      style={{
        display: 'flex',
        gap: isCompact ? 12 : 16,
        alignItems: 'flex-start',
        flexWrap: isCompact ? 'nowrap' : 'wrap',
        flexDirection: isCompact ? 'column' : 'row',
        color: ui.text,
        width: '100%',
        minWidth: 0,
      }}
    >
      {isCompact ? (
        <div className="cc-topo-mobile-nav" style={{ ...ui.card, padding: 0, width: '100%', overflow: 'hidden' }}>
          <button
            type="button"
            className="cc-topo-mobile-nav-toggle"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '12px 14px',
              minHeight: 48,
              border: 'none',
              background: 'transparent',
              color: ui.text,
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 700, color: ui.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Topografía
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: ui.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {labelActual}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <TopoOfflineStatusBar contratoId={contratoId} compact />
              {alertas > 0 && (
                <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 'var(--cc-xs)', fontWeight: 700 }}>
                  {alertas}
                </span>
              )}
              <span aria-hidden style={{ fontSize: 'var(--cc-lg)', color: ui.textMuted }}>{navOpen ? '▴' : '▾'}</span>
            </div>
          </button>
          {navOpen && (
            <div style={{ padding: '0 8px 10px', borderTop: `1px solid ${ui.t?.border || '#e2e8f0'}`, maxHeight: isLandscapeMobile ? '42dvh' : '55dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {navContent}
            </div>
          )}
        </div>
      ) : (
        <aside style={{ width: 260, flexShrink: 0, ...ui.card, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: ui.text }}>Topografia</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {alertas > 0 && (
                <span title="Alertas de equipos" style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 'var(--cc-xs)', fontWeight: 700 }}>
                  {alertas}
                </span>
              )}
              <TopoOfflineStatusBar contratoId={contratoId} compact={false} />
            </div>
          </div>
          <OfflineBadge
            online={online}
            pendingCount={offline.pendingCount}
            failedCount={offline.failedCount}
            syncing={offline.syncState === 'syncing'}
          />
          <div style={{ marginTop: 12 }}>{navContent}</div>
        </aside>
      )}

      <main className="cc-topo-main" style={{ flex: 1, minWidth: 0, width: isCompact ? '100%' : undefined }}>
        {renderSubmodulo()}
      </main>

      {salirModuloPendiente && (
        <TopoConfirmModal
          theme={ui.t}
          titulo="Cartera sin guardar"
          confirmLabel="Guardar"
          cancelLabel="Cancelar"
          secondaryLabel="Salir sin guardar"
          onCancel={() => { if (!guardSalidaBusy) setSalirModuloPendiente(null) }}
          onSecondary={() => ejecutarSalidaModulo(false)}
          onConfirm={() => ejecutarSalidaModulo(true)}
          busy={guardSalidaBusy}
        >
          Hay cambios sin guardar.
        </TopoConfirmModal>
      )}
      {conflictActivo && (
        <TopoConflictModal
          conflict={conflictActivo}
          busy={conflictBusy}
          onCancel={() => setConflictActivo(null)}
          onResolveLocal={async () => {
            setConflictBusy(true)
            try {
              await offline.resolveConflict(conflictActivo, true)
              setConflictActivo(null)
            } finally {
              setConflictBusy(false)
            }
          }}
          onResolveServer={async () => {
            setConflictBusy(true)
            try {
              await offline.resolveConflict(conflictActivo, false)
              setConflictActivo(null)
            } finally {
              setConflictBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}

export default function TopografiaMain({ t, usuario, token, permisos = defaultPermisos }) {
  const contratoId = usuario?.contrato_id
  const [alertas, setAlertas] = useState(0)
  const [tuberiaSel, setTuberiaSel] = useState(null)
  const { api } = useTopografiaApi(contratoId, token)

  const cargarAlertas = useCallback(async () => {
    if (!contratoId) return
    try {
      const al = await api('/equipos/alertas')
      setAlertas(al?.total_alertas || 0)
    } catch { /* ignore */ }
  }, [api, contratoId])

  useEffect(() => {
    cargarAlertas()
  }, [cargarAlertas])

  if (!contratoId) {
    const s = topoStyles(t)
    return (
      <TopoThemeProvider t={t}>
        <div style={{ ...s.card, maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          Seleccione un contrato para usar el modulo de Topografia.
        </div>
      </TopoThemeProvider>
    )
  }

  return (
    <TopoThemeProvider t={t}>
      <TopoOfflineProvider contratoId={contratoId} token={token}>
        <TopografiaLayout
          usuario={usuario}
          token={token}
          permisos={permisos}
          alertas={alertas}
          setAlertas={setAlertas}
          tuberiaSel={tuberiaSel}
          setTuberiaSel={setTuberiaSel}
        />
      </TopoOfflineProvider>
    </TopoThemeProvider>
  )
}
