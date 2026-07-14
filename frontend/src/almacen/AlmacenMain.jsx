import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ModuloDataRefreshBar from '../components/ModuloDataRefreshBar'
import { useModulo } from '../context/ModuloContext'
import EntradasPanel from './EntradasPanel'
import InventarioPanel from './InventarioPanel'
import SalidasPanel from './SalidasPanel'
import SolicitudesPanel from './SolicitudesPanel'
import {
  AlmacenProviders,
  buildAlmacenCssVars,
  useAlmacenApi,
  useAlmacenTheme,
  useAlmacenViewport,
} from './almacenShared'

const TABS = [
  { id: 'solicitudes', label: 'Solicitudes', icon: '📋', ayuda: 'Crear, consultar y revisar solicitudes de materiales.' },
  { id: 'entradas', label: 'Entradas', icon: '📥', ayuda: 'Registrar ingreso de material contra OC.' },
  { id: 'salidas', label: 'Salidas', icon: '📤', ayuda: 'Despachar material hacia obra contra entradas por PK-ID.' },
  { id: 'inventario', label: 'Inventario', icon: '📊', ayuda: 'Gráficos comparativos: presupuesto, entradas, salidas y cobro SICOE.' },
]

function AlmacenLayout({ permisos, token, t, compact }) {
  const ui = useAlmacenTheme()
  const api = useAlmacenApi()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [tab, setTab] = useState('solicitudes')
  const [pendientes, setPendientes] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const refreshPendingRef = useRef(false)

  const theme = useMemo(() => t || {
    primary: ui.accent,
    border: '#e2e8f0',
    text: ui.text,
    textMuted: ui.textMuted,
    bgCard: ui.card?.background || '#fff',
  }, [t, ui])

  const onDataLoaded = useCallback(() => {
    setUpdatedAt(Date.now())
    if (refreshPendingRef.current) {
      refreshPendingRef.current = false
      setRefreshBusy(false)
    }
  }, [])

  const doRefresh = useCallback(async () => {
    refreshPendingRef.current = true
    setRefreshBusy(true)
    setRefreshSignal((s) => s + 1)
    if (permisos?.validar) {
      try {
        const r = await api.listSolicitudes('enviada')
        setPendientes(r.length)
      } catch { /* ignore */ }
    }
  }, [api, permisos?.validar])

  useEffect(() => {
    setModuloRefresh({
      label: 'Almacén',
      fn: doRefresh,
      disabled: refreshBusy,
      busy: refreshBusy,
    })
    return clearModuloRefresh
  }, [setModuloRefresh, clearModuloRefresh, doRefresh, refreshBusy])

  useEffect(() => {
    if (!permisos?.validar) return
    api.listSolicitudes('enviada').then((r) => setPendientes(r.length)).catch(() => {})
  }, [api, permisos?.validar, tab])

  const visibleTabs = useMemo(() => TABS.filter((tb) => {
    if (tb.id === 'entradas' || tb.id === 'salidas') {
      return permisos?.crear || permisos?.editar || permisos?.ver
    }
    return true
  }), [permisos])

  const cssVars = useMemo(() => buildAlmacenCssVars(t), [t])

  return (
    <div
      className={`cc-almacen-theme-scope ${compact ? 'cc-almacen-root cc-almacen-root--compact' : 'cc-almacen-root'}`}
      style={{ ...cssVars, maxWidth: compact ? '100%' : 1200, margin: '0 auto' }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 20,
      }}
      >
        <div>
          <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700 }}>🏪 Almacén de Obra</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: ui.textMuted, marginTop: 4 }}>
            Compras, entradas, salidas e inventario de materiales ligados al presupuesto del contrato.
          </div>
        </div>
        <ModuloDataRefreshBar
          theme={theme}
          label="Almacén"
          updatedAt={updatedAt}
          busy={refreshBusy}
          onRefresh={() => { void doRefresh() }}
        />
      </div>

      <div style={ui.tabBar} className="cc-almacen-tab-bar">
        {visibleTabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            title={tb.ayuda}
            style={ui.tabBtn(tab === tb.id)}
            onClick={() => setTab(tb.id)}
          >
            <span>{tb.icon}</span>
            <span>{tb.label}</span>
            {tb.id === 'solicitudes' && pendientes > 0 && permisos?.validar && (
              <span style={{
                background: '#dc2626',
                color: '#fff',
                borderRadius: 10,
                padding: '0 6px',
                fontSize: 'var(--cc-xs)',
              }}
              >
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
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
      {tab === 'entradas' && (
        <EntradasPanel
          permisos={permisos}
          t={t}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
      {tab === 'salidas' && (
        <SalidasPanel
          permisos={permisos}
          t={t}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
      {tab === 'inventario' && (
        <InventarioPanel
          permisos={permisos}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
    </div>
  )
}

export default function AlmacenMain({ t, token, permisos }) {
  const { isCompact } = useAlmacenViewport()
  const contratoId = permisos?.contratoId
  if (!contratoId) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: t?.textMuted }}>
        Seleccione un contrato para usar el módulo de Almacén.
      </div>
    )
  }

  return (
    <AlmacenProviders t={t} compact={isCompact} contratoId={contratoId} token={token}>
      <AlmacenLayout permisos={permisos} token={token} t={t} compact={isCompact} />
    </AlmacenProviders>
  )
}
