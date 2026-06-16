import { useCallback, useEffect, useRef, useState } from 'react'
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
import { OfflineBadge, defaultPermisos, topoStyles, TopoThemeProvider, useTopoTheme, useTopografiaApi } from './topografiaShared'

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

function NavBtn({ mod, active, onClick, alertas, ui }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={mod.ayuda || mod.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        marginBottom: 4,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? ui.accentSoft : 'transparent',
        color: active ? ui.accent : ui.text,
        fontWeight: active ? 600 : 400,
        fontSize: 'var(--cc-sm)',
      }}
    >
      <span style={{ flex: 1 }}>{mod.label}</span>
      {mod.ayuda && (
        <span
          title={mod.ayuda}
          style={{
            display: 'inline-flex', width: 14, height: 14, borderRadius: '50%',
            background: active ? ui.accent : '#cbd5e1', color: '#fff', fontSize: 9,
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

function NavGroup({ titulo, mods, submodulo, intentarSubmodulo, alertas, ui }) {
  return (
    <>
      <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: ui.textMuted, margin: '12px 0 6px', letterSpacing: 0.5 }}>
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
        />
      ))}
    </>
  )
}

function TopografiaLayout({ usuario, token, permisos, alertas, setAlertas, tuberiaSel, setTuberiaSel }) {
  const ui = useTopoTheme()
  const contratoId = usuario?.contrato_id
  const [submodulo, setSubmodulo] = useState('topo_biblioteca')
  const [salirModuloPendiente, setSalirModuloPendiente] = useState(null)
  const [guardSalidaBusy, setGuardSalidaBusy] = useState(false)
  const entregaGuardRef = useRef(null)
  const { api, online } = useTopografiaApi(contratoId, token)

  const registerUnsavedGuard = useCallback((guard) => {
    entregaGuardRef.current = guard
  }, [])

  const intentarSubmodulo = useCallback((id) => {
    if (id === submodulo) return
    if (submodulo === 'topo_entrega_dg' && entregaGuardRef.current?.isDirty?.()) {
      setSalirModuloPendiente(id)
      return
    }
    setSubmodulo(id)
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
    } finally {
      setGuardSalidaBusy(false)
    }
  }

  const renderSubmodulo = () => {
    const props = { contratoId, token, permisos, usuario }
    switch (submodulo) {
      case 'topo_biblioteca':
        return <BibliiotecaPuntos {...props} />
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

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', color: ui.text }}>
      <aside style={{ width: 260, flexShrink: 0, ...ui.card, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--cc-lg)', color: ui.text }}>Topografia</h2>
          {alertas > 0 && (
            <span title="Alertas de equipos" style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 'var(--cc-xs)', fontWeight: 700 }}>
              {alertas}
            </span>
          )}
        </div>
        <OfflineBadge online={online} />
        <nav style={{ marginTop: 12 }}>
          <NavGroup
            titulo="PUNTOS Y CIRCUITOS"
            mods={PUNTOS_Y_CIRCUITOS}
            submodulo={submodulo}
            intentarSubmodulo={intentarSubmodulo}
            alertas={alertas}
            ui={ui}
          />
          <NavGroup
            titulo="VÍAS"
            mods={VIAS}
            submodulo={submodulo}
            intentarSubmodulo={intentarSubmodulo}
            alertas={alertas}
            ui={ui}
          />
          <NavGroup
            titulo="OTROS"
            mods={OTROS}
            submodulo={submodulo}
            intentarSubmodulo={intentarSubmodulo}
            alertas={alertas}
            ui={ui}
          />
        </nav>
      </aside>
      <main style={{ flex: 1, minWidth: 280 }}>
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
      <TopografiaLayout
        usuario={usuario}
        token={token}
        permisos={permisos}
        alertas={alertas}
        setAlertas={setAlertas}
        tuberiaSel={tuberiaSel}
        setTuberiaSel={setTuberiaSel}
      />
    </TopoThemeProvider>
  )
}
