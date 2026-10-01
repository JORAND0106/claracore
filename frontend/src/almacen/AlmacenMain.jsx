import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ModuloDataRefreshBar from '../components/ModuloDataRefreshBar'
import { useModulo } from '../context/ModuloContext'
import SeccionCatalogoInsumos from '../admin/SeccionCatalogoInsumos'
import EntradasPanel from './EntradasPanel'
import InventarioPanel from './InventarioPanel'
import SalidasPanel from './SalidasPanel'
import SolicitudesPanel from './SolicitudesPanel'
import { puedeCrearSolicitudAlmacen } from './almacenPermisos'
import {
  AlmacenProviders,
  buildAlmacenCssVars,
  useAlmacenApi,
  useAlmacenTheme,
  useAlmacenViewport,
} from './almacenShared'

const TABS = [
  { id: 'solicitudes', label: 'Solicitudes', icon: '📋', ayuda: 'Crear, consultar y revisar solicitudes de materiales.', ambito: 'almacen' },
  { id: 'entradas', label: 'Entradas', icon: '📥', ayuda: 'Registrar ingreso de material contra OC.', ambito: 'entsal' },
  { id: 'salidas', label: 'Salidas', icon: '📤', ayuda: 'Despachar material hacia obra contra entradas por PK-ID.', ambito: 'entsal' },
  { id: 'inventario', label: 'Inventario', icon: '📊', ayuda: 'Capítulo → Ítem → Insumos: valores financieros y rentabilidad.', ambito: 'almacen' },
]

function AlmacenLayout({ permisos, token, t, compact, usuario, activeTheme = null }) {
  const ui = useAlmacenTheme()
  const api = useAlmacenApi()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [tab, setTab] = useState(null)
  const [vistaCatalogo, setVistaCatalogo] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const refreshPendingRef = useRef(false)

  const catalogoPerms = useMemo(() => ({
    ver: Boolean(permisos?.catalogo?.ver),
    crear: Boolean(permisos?.catalogo?.crear),
    editar: Boolean(permisos?.catalogo?.editar),
    eliminar: Boolean(permisos?.catalogo?.eliminar),
    validar: Boolean(permisos?.catalogo?.validar),
    exportar: Boolean(permisos?.catalogo?.exportar),
  }), [permisos?.catalogo])

  const entsalPerms = useMemo(() => ({
    ver: Boolean(permisos?.entradasSalidas?.ver),
    crear: Boolean(permisos?.entradasSalidas?.crear),
    editar: Boolean(permisos?.entradasSalidas?.editar),
    eliminar: Boolean(permisos?.entradasSalidas?.eliminar),
    validar: Boolean(permisos?.entradasSalidas?.validar),
    exportar: Boolean(permisos?.entradasSalidas?.exportar),
    esContratistaGerencial: Boolean(permisos?.esContratistaGerencial),
    esDesarrollador: Boolean(permisos?.esDesarrollador),
    contratoId: permisos?.contratoId,
    userId: permisos?.userId,
    verEconomicos: permisos?.verEconomicos,
  }), [permisos])

  /** Permisos de Solicitudes/Inventario: solo función Almacén (sin herencia). */
  const almacenPerms = useMemo(() => ({
    ver: Boolean(permisos?.ver),
    crear: Boolean(permisos?.crear),
    editar: Boolean(permisos?.editar),
    eliminar: Boolean(permisos?.eliminar),
    validar: Boolean(permisos?.validar),
    exportar: Boolean(permisos?.exportar),
    esContratistaGerencial: Boolean(permisos?.esContratistaGerencial),
    esDesarrollador: Boolean(permisos?.esDesarrollador),
    contratoId: permisos?.contratoId,
    userId: permisos?.userId,
    verEconomicos: permisos?.verEconomicos,
  }), [permisos])

  const puedeVerCatalogo = Boolean(permisos?.verCatalogo)
  const puedeVerEntsal = Boolean(permisos?.verEntradasSalidas)
  const puedeVerSolicitudesInventario = Boolean(permisos?.verSolicitudesInventario)

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

  const bumpRelatedPanels = useCallback(() => {
    setRefreshSignal((s) => s + 1)
  }, [])

  const doRefresh = useCallback(async () => {
    refreshPendingRef.current = true
    setRefreshBusy(true)
    setRefreshSignal((s) => s + 1)
    if (almacenPerms.validar && (almacenPerms.esContratistaGerencial || almacenPerms.esDesarrollador)) {
      try {
        const n = await api.countSolicitudes('enviada')
        setPendientes(n)
      } catch { /* ignore */ }
    }
  }, [api, almacenPerms.validar, almacenPerms.esContratistaGerencial, almacenPerms.esDesarrollador])

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
    if (!(almacenPerms.validar && (almacenPerms.esContratistaGerencial || almacenPerms.esDesarrollador))) return
    api.countSolicitudes('enviada').then(setPendientes).catch(() => {})
  }, [api, almacenPerms.validar, almacenPerms.esContratistaGerencial, almacenPerms.esDesarrollador, tab])

  const visibleTabs = useMemo(() => TABS.filter((tb) => {
    if (tb.ambito === 'entsal') return puedeVerEntsal
    if (tb.ambito === 'almacen') return puedeVerSolicitudesInventario
    return false
  }), [puedeVerEntsal, puedeVerSolicitudesInventario])

  // Tab / vista inicial según permisos (sin mezclar ámbitos).
  useEffect(() => {
    if (visibleTabs.length) {
      if (!tab || !visibleTabs.some((tb) => tb.id === tab)) {
        setTab(visibleTabs[0].id)
      }
      return
    }
    if (puedeVerCatalogo) {
      setVistaCatalogo(true)
      setTab(null)
    }
  }, [visibleTabs, tab, puedeVerCatalogo])

  const cssVars = useMemo(() => buildAlmacenCssVars(t), [t])

  /**
   * Permisos crudos de Almacén para el panel/formulario.
   * NO sobrescribir `crear` con ver∧crear: eso apagaba Guardar/Solicitar aprobación
   * y Anular tras el primer guardado. La regla Ver+Crear aplica solo a «Nueva solicitud».
   */
  const solicitudesPerms = useMemo(() => ({
    ...almacenPerms,
    puedeNuevaSolicitud: puedeCrearSolicitudAlmacen(almacenPerms),
  }), [almacenPerms])

  if (vistaCatalogo && puedeVerCatalogo) {
    return (
      <div
        className={`cc-almacen-theme-scope ${compact ? 'cc-almacen-root cc-almacen-root--compact' : 'cc-almacen-root'}`}
        style={{ ...cssVars, maxWidth: '100%', width: '100%', margin: 0, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {visibleTabs.length > 0 && (
            <button
              type="button"
              onClick={() => setVistaCatalogo(false)}
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.bgCard,
                color: theme.text,
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 'var(--cc-sm)',
                minHeight: 40,
              }}
            >
              ← Volver a Almacén
            </button>
          )}
          <span style={{ fontSize: 'var(--cc-sm)', color: theme.textMuted }}>
            Catálogo de insumos del contrato
          </span>
        </div>
        <SeccionCatalogoInsumos
          token={token}
          user={usuario}
          perms={catalogoPerms}
          theme={activeTheme}
          t={theme}
          embedded
        />
      </div>
    )
  }

  if (!visibleTabs.length && !puedeVerCatalogo) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: ui.textMuted }}>
        No tiene permisos para ninguna sección de Almacén. Un administrador puede habilitarlos en
        Control de accesos (Almacén, Entradas y Salidas o Catálogo de insumos).
      </div>
    )
  }

  return (
    <div
      className={`cc-almacen-theme-scope ${compact ? 'cc-almacen-root cc-almacen-root--compact' : 'cc-almacen-root'}`}
      style={{ ...cssVars, maxWidth: '100%', width: '100%', margin: 0, boxSizing: 'border-box' }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {puedeVerCatalogo && (
            <button
              type="button"
              title="Catálogo de insumos: materiales del contrato (permiso Catálogo de insumos)."
              onClick={() => setVistaCatalogo(true)}
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.bgCard,
                color: theme.primary,
                borderRadius: 8,
                padding: '8px 14px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
                minHeight: 40,
              }}
            >
              Insumos
            </button>
          )}
          <ModuloDataRefreshBar
            theme={theme}
            label="Almacén"
            updatedAt={updatedAt}
            busy={refreshBusy}
            onRefresh={() => { void doRefresh() }}
          />
        </div>
      </div>

      {visibleTabs.length > 0 && (
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
              {tb.id === 'solicitudes' && pendientes > 0 && almacenPerms.validar && (almacenPerms.esContratistaGerencial || almacenPerms.esDesarrollador) && (
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
      )}

      {tab === 'solicitudes' && puedeVerSolicitudesInventario && (
        <SolicitudesPanel
          permisos={solicitudesPerms}
          t={t}
          token={token}
          contratoId={permisos?.contratoId}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
      {tab === 'entradas' && puedeVerEntsal && (
        <EntradasPanel
          permisos={entsalPerms}
          t={t}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
      {tab === 'salidas' && puedeVerEntsal && (
        <SalidasPanel
          permisos={entsalPerms}
          t={t}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
          onSalidaMutated={bumpRelatedPanels}
        />
      )}
      {tab === 'inventario' && puedeVerSolicitudesInventario && (
        <InventarioPanel
          permisos={almacenPerms}
          token={token}
          refreshSignal={refreshSignal}
          onDataLoaded={onDataLoaded}
        />
      )}
    </div>
  )
}

export default function AlmacenMain({ t, token, permisos, usuario, activeTheme = null }) {
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
      <AlmacenLayout
        permisos={permisos}
        token={token}
        t={t}
        compact={isCompact}
        usuario={usuario || { contrato_id: contratoId }}
        activeTheme={activeTheme}
      />
    </AlmacenProviders>
  )
}
