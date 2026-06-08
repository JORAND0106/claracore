import { useCallback, useEffect, useState } from 'react'
import BibliiotecaPuntos from './BibliiotecaPuntos'
import PoligonalForm from './PoligonalForm'
import NivelacionForm from './NivelacionForm'
import ViasProyectoForm from './ViasProyectoForm'
import ViasRegistroForm from './ViasRegistroForm'
import TuberiaForm from './TuberiaForm'
import TuberiaRegistroDiario from './TuberiaRegistroDiario'
import AreasForm from './AreasForm'
import InterseccionForm from './InterseccionForm'
import EquiposForm from './EquiposForm'
import { OfflineBadge, defaultPermisos, topoStyles, TopoThemeProvider, useTopoTheme, useTopografiaApi } from './topografiaShared'

const SUBMODULOS = [
  { id: 'topo_biblioteca', label: 'Biblioteca de Puntos' },
  { id: 'topo_poligonal', label: 'Poligonal' },
  { id: 'topo_nivelacion', label: 'Nivelacion' },
  { id: 'topo_vias', label: 'Verificacion de Vias' },
  { id: 'topo_tuberia', label: 'Tuberia' },
  { id: 'topo_areas', label: 'Areas por Coordenadas' },
  { id: 'topo_interseccion', label: 'Interseccion de Puntos' },
  { id: 'topo_equipos', label: 'Equipos' },
]

function TopografiaLayout({ usuario, token, permisos, alertas, setAlertas, tuberiaSel, setTuberiaSel }) {
  const ui = useTopoTheme()
  const contratoId = usuario?.contrato_id
  const [submodulo, setSubmodulo] = useState('topo_biblioteca')
  const { api, online } = useTopografiaApi(contratoId, token)

  const renderSubmodulo = () => {
    const props = { contratoId, token, permisos }
    switch (submodulo) {
      case 'topo_biblioteca':
        return <BibliiotecaPuntos {...props} />
      case 'topo_poligonal':
        return <PoligonalForm {...props} />
      case 'topo_nivelacion':
        return <NivelacionForm {...props} />
      case 'topo_vias':
        return (
          <div>
            <ViasProyectoForm {...props} />
            <div style={{ marginTop: 24 }}><ViasRegistroForm {...props} /></div>
          </div>
        )
      case 'topo_tuberia':
        return (
          <div>
            <TuberiaForm {...props} onSelect={setTuberiaSel} />
            <div style={{ marginTop: 24 }}><TuberiaRegistroDiario {...props} tuberia={tuberiaSel} /></div>
          </div>
        )
      case 'topo_areas':
        return <AreasForm {...props} />
      case 'topo_interseccion':
        return <InterseccionForm {...props} />
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
          {SUBMODULOS.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => setSubmodulo(mod.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 4,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                background: submodulo === mod.id ? ui.accentSoft : 'transparent',
                color: submodulo === mod.id ? ui.accent : ui.text,
                fontWeight: submodulo === mod.id ? 600 : 400,
              }}
            >
              {mod.label}
              {mod.id === 'topo_equipos' && alertas > 0 && (
                <span style={{ marginLeft: 6, color: '#dc2626' }}>({alertas})</span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, minWidth: 280 }}>
        {renderSubmodulo()}
      </main>
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
