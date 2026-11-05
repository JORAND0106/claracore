import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen, CalendarDays, Percent, Truck, Users,
} from 'lucide-react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import BitacoraAsistenciaRrhhToggle from './BitacoraAsistenciaRrhhToggle'
import { accesoBitacora } from './bitacoraPermisos'
import ExternosDepuracionModal from './ExternosDepuracionModal'
import MaquinariaCatalogoModal from './MaquinariaCatalogoModal'
import LibroDigitalVista, { LibroDigitalSelector } from './LibroDigitalVista'
import CumplimientoPersonaPanel from './CumplimientoPersonaPanel'
import ItemDetalleModal from './ItemDetalleModal'
import SeguimientoCalendarioPanel from './SeguimientoCalendarioPanel'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { accesoPlanActividades } from './planActividadesPermisos'
import PlanActividadesVista from './PlanActividadesVista'
import { useSeguimientoCompact } from './seguimientoShared'

function toolbarIconBtn(t, { active = false, primary = false } = {}) {
  return {
    width: 34,
    height: 34,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    cursor: 'pointer',
    border: primary
      ? `1px solid color-mix(in srgb, ${t.primary} 70%, #0c4a6e)`
      : `1px solid ${active ? t.primary : t.border}`,
    background: primary
      ? `linear-gradient(135deg, ${t.primary}, color-mix(in srgb, ${t.primary} 72%, #0e7490))`
      : active
        ? `${t.primary}22`
        : (t.bgCard || t.bg || 'transparent'),
    color: primary ? '#fff' : t.text,
    boxShadow: primary
      ? `0 6px 14px color-mix(in srgb, ${t.primary} 30%, transparent)`
      : 'none',
  }
}

/** Cierra el tip institucional al activar el botón (evita tip fijo tras clic/toque). */
function hideToolbarTip() {
  try {
    document.dispatchEvent(new CustomEvent('cc-title-tooltip-hide'))
  } catch { /* ignore */ }
}

function withTipHide(handler) {
  return (...args) => {
    hideToolbarTip()
    return handler?.(...args)
  }
}

/**
 * Seguimiento: vista única de Calendario (tareas, actas y bitácora por día).
 * Plan de actividades: visible solo con permiso Ver del submódulo (sin flag por contrato).
 */
export default function ModuloSeguimiento({ t, usuario, token, contratoId }) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, cid),
    [usuario, cid],
  )
  const permisosBitacora = useMemo(
    () => accesoBitacora(usuario, cid),
    [usuario, cid],
  )
  const permisosPlan = useMemo(
    () => accesoPlanActividades(usuario, cid),
    [usuario, cid],
  )
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [calKey, setCalKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [libroSelectorOpen, setLibroSelectorOpen] = useState(false)
  const [libroModo, setLibroModo] = useState(null)
  const [externosDepuracionOpen, setExternosDepuracionOpen] = useState(false)
  const [maquinariaCatalogoOpen, setMaquinariaCatalogoOpen] = useState(false)
  const [cumplimientoOpen, setCumplimientoOpen] = useState(false)
  const [detalleCumplimientoId, setDetalleCumplimientoId] = useState(null)
  const [vistaPlan, setVistaPlan] = useState(false)
  const api = useMemo(
    () => (token && cid != null ? createSeguimientoApi(cid, token) : null),
    [cid, token],
  )

  const doRefresh = useCallback(async () => {
    setRefreshBusy(true)
    setCalKey((n) => n + 1)
    // En vista Plan el calendario está desmontado: no hay onDataFresh.
    if (vistaPlan) {
      setUpdatedAt(Date.now())
      setRefreshBusy(false)
    }
    // «Al día» en calendario se confirma vía onCalendarioDataFresh.
  }, [vistaPlan])

  const onCalendarioDataFresh = useCallback((result) => {
    setRefreshBusy(false)
    if (result?.ok) setUpdatedAt(Date.now())
  }, [])

  useEffect(() => {
    setModuloRefresh({
      label: 'Seguimiento',
      fn: doRefresh,
      disabled: refreshBusy,
      busy: refreshBusy,
    })
    return clearModuloRefresh
  }, [setModuloRefresh, clearModuloRefresh, doRefresh, refreshBusy])

  useEffect(() => {
    if (!permisosPlan.ver) setVistaPlan(false)
  }, [permisosPlan.ver])

  const toggleVistaPlan = useCallback(() => {
    setVistaPlan((v) => {
      const next = !v
      // Al volver al calendario, forzar refetch (bitácoras/tareas pueden haber cambiado).
      if (v && !next) {
        setRefreshBusy(true)
        setCalKey((n) => n + 1)
      }
      return next
    })
  }, [])

  if (permisos.bloqueado) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.text, marginBottom: 10 }}>Seguimiento</div>
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>
          No fue posible abrir el módulo Seguimiento con la sesión actual. Vuelve a iniciar sesión o elige un contrato activo.
        </div>
      </div>
    )
  }

  const showPlanBtn = Boolean(permisosPlan.ver)

  return (
    <div
      className={compact ? 'cc-seguim-root cc-seguim-root--compact' : 'cc-seguim-root cc-seguim-root--wide'}
      style={{
        width: '100%',
        maxWidth: compact ? '100%' : 1540,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <div className="cc-seguim-page-head" style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text }}>Seguimiento</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Grupo de botones solo icono */}
          <div
            role="group"
            aria-label="Herramientas de Seguimiento"
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              padding: 4,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bgCard || t.bg || 'transparent',
            }}
          >
            <BitacoraAsistenciaRrhhToggle
              t={t}
              token={token}
              contratoId={cid}
              esDesarrollador={Boolean(permisosBitacora?.esDesarrollador)}
            />
            {permisos?.ver && (
              <button
                type="button"
                onClick={withTipHide(() => setCumplimientoOpen((v) => !v))}
                title="Cumplimiento"
                data-cc-tooltip="Cumplimiento"
                data-cc-tooltip-variant="short"
                aria-label="Cumplimiento"
                style={toolbarIconBtn(t, { active: cumplimientoOpen })}
              >
                <Percent size={17} strokeWidth={2.4} aria-hidden />
              </button>
            )}
            {permisos?.editar && (
              <button
                type="button"
                onClick={withTipHide(() => setExternosDepuracionOpen(true))}
                title="Externos"
                data-cc-tooltip="Externos"
                data-cc-tooltip-variant="short"
                aria-label="Externos"
                style={toolbarIconBtn(t)}
              >
                <Users size={17} strokeWidth={2.3} aria-hidden />
              </button>
            )}
            {permisosBitacora?.esDesarrollador && (
              <button
                type="button"
                onClick={withTipHide(() => setMaquinariaCatalogoOpen(true))}
                title="Maquinaria"
                data-cc-tooltip="Maquinaria"
                data-cc-tooltip-variant="short"
                aria-label="Maquinaria"
                style={toolbarIconBtn(t)}
              >
                <Truck size={17} strokeWidth={2.3} aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            className="cc-seguim-libro-btn"
            onClick={withTipHide(() => setLibroSelectorOpen(true))}
            title="Libro digital"
            data-cc-tooltip="Libro digital"
            data-cc-tooltip-variant="short"
            aria-label="Libro digital"
            style={toolbarIconBtn(t, { primary: true })}
          >
            <BookOpen size={18} strokeWidth={2.4} aria-hidden />
          </button>

          {showPlanBtn && (
            <button
              type="button"
              onClick={withTipHide(toggleVistaPlan)}
              title={vistaPlan ? 'Ver calendario' : 'Plan de actividades'}
              data-cc-tooltip={vistaPlan ? 'Ver calendario' : 'Plan de actividades'}
              data-cc-tooltip-variant="short"
              aria-label={vistaPlan ? 'Ver calendario' : 'Plan de actividades'}
              style={{
                ...toolbarIconBtn(t, { active: vistaPlan }),
                /* Icono policromático distintivo (estilo menú lateral; 🧩 no usado en la plataforma). */
                fontSize: vistaPlan ? undefined : 'var(--cc-lg, 18px)',
                lineHeight: 1,
              }}
            >
              {vistaPlan
                ? <CalendarDays size={18} strokeWidth={2.3} aria-hidden />
                : <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>🧩</span>}
            </button>
          )}

          <ModuloDataRefreshBar
            theme={t}
            updatedAt={updatedAt}
            busy={refreshBusy}
            onRefresh={doRefresh}
            label="Seguimiento"
          />
        </div>
      </div>

      {vistaPlan && api ? (
        <PlanActividadesVista
          key={`plan-${calKey}`}
          t={t}
          api={api}
          usuario={usuario}
          permisos={permisosPlan}
          modo="page"
        />
      ) : (
        <SeguimientoCalendarioPanel
          t={t}
          usuario={usuario}
          token={token}
          contratoId={cid}
          viewportCompact={compact}
          refreshKey={calKey}
          showFilters
          onDataFresh={onCalendarioDataFresh}
        />
      )}

      {cumplimientoOpen && api && (
        <div style={{ marginTop: 16 }}>
          <CumplimientoPersonaPanel
            t={t}
            api={api}
            contratoId={cid}
            onAbrirItem={(id) => setDetalleCumplimientoId(id)}
          />
        </div>
      )}

      {detalleCumplimientoId && api && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleCumplimientoId}
          usuario={usuario}
          permisos={permisos}
          onClose={() => setDetalleCumplimientoId(null)}
          onChanged={() => setCalKey((n) => n + 1)}
        />
      )}

      <LibroDigitalSelector
        t={t}
        open={libroSelectorOpen}
        onClose={() => setLibroSelectorOpen(false)}
        puedeBitacora={Boolean(permisosBitacora.ver)}
        onSelect={(modo) => {
          setLibroSelectorOpen(false)
          setLibroModo(modo)
        }}
      />

      {libroModo && (
        <LibroDigitalVista
          modo={libroModo}
          t={t}
          usuario={usuario}
          token={token}
          contratoId={contratoId}
          onClose={() => setLibroModo(null)}
        />
      )}

      {externosDepuracionOpen && (
        <ExternosDepuracionModal
          t={t}
          token={token}
          contratoId={cid}
          onClose={() => setExternosDepuracionOpen(false)}
        />
      )}

      {maquinariaCatalogoOpen && (
        <MaquinariaCatalogoModal
          t={t}
          token={token}
          contratoId={cid}
          onClose={() => setMaquinariaCatalogoOpen(false)}
        />
      )}
    </div>
  )
}
