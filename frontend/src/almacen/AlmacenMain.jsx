import { useEffect, useMemo, useState } from 'react'
import EntradasPanel from './EntradasPanel'
import InventarioPanel from './InventarioPanel'
import SolicitudesPanel from './SolicitudesPanel'
import SolicitudValidacionPanel from './SolicitudValidacionPanel'
import {
  AlmacenApiProvider,
  AlmacenThemeProvider,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

const TABS = [
  { id: 'solicitudes', label: 'Solicitudes', icon: '📋', ayuda: 'Crear y gestionar solicitudes de materiales.' },
  { id: 'validacion', label: 'Validación', icon: '✅', ayuda: 'Aprobar o rechazar solicitudes pendientes.' },
  { id: 'entradas', label: 'Entradas', icon: '📥', ayuda: 'Registrar ingreso de material contra OC.' },
  { id: 'inventario', label: 'Inventario', icon: '📊', ayuda: 'Stock, semáforo presupuesto e historial.' },
]

function AlmacenLayout({ permisos, token, t, pendingSolicitudId }) {
  const ui = useAlmacenTheme()
  const api = useAlmacenApi()
  const [tab, setTab] = useState('solicitudes')
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    if (pendingSolicitudId && permisos?.validar) setTab('validacion')
  }, [pendingSolicitudId, permisos?.validar])

  useEffect(() => {
    if (!permisos?.validar) return
    api.listSolicitudes('enviada').then((r) => setPendientes(r.length)).catch(() => {})
  }, [api, permisos?.validar, tab])

  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.id === 'validacion') return permisos?.validar
    if (t.id === 'entradas') return permisos?.crear || permisos?.ver
    return true
  }), [permisos])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700 }}>🏪 Almacén de Obra</div>
        <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
          Compras, entradas e inventario de materiales ligados al presupuesto del contrato.
        </div>
      </div>

      <div style={ui.tabBar}>
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.ayuda}
            style={ui.tabBtn(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'validacion' && pendientes > 0 && (
              <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 'var(--cc-xs)' }}>
                {pendientes}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'solicitudes' && (
        <SolicitudesPanel
          permisos={permisos}
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
        />
      )}
      {tab === 'validacion' && <SolicitudValidacionPanel permisos={permisos} token={token} />}
      {tab === 'entradas' && <EntradasPanel permisos={permisos} token={token} />}
      {tab === 'inventario' && <InventarioPanel permisos={permisos} token={token} />}
    </div>
  )
}

export default function AlmacenMain({ t, token, permisos, pendingSolicitudId }) {
  const contratoId = permisos?.contratoId
  if (!contratoId) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: t?.textMuted }}>
        Seleccione un contrato para usar el módulo de Almacén.
      </div>
    )
  }

  return (
    <AlmacenThemeProvider t={t}>
      <AlmacenApiProvider contratoId={contratoId} token={token}>
        <AlmacenLayout permisos={permisos} token={token} t={t} pendingSolicitudId={pendingSolicitudId} />
      </AlmacenApiProvider>
    </AlmacenThemeProvider>
  )
}
