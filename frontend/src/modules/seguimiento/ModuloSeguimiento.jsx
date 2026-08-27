import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { accesoBitacora } from './bitacoraPermisos'
import LibroDigitalVista, { LibroDigitalSelector } from './LibroDigitalVista'
import SeguimientoCalendarioPanel from './SeguimientoCalendarioPanel'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

/**
 * Seguimiento: vista única de Calendario (tareas, actas y bitácora por día).
 * Las vistas internas de Actas y Bitácora permanecen disponibles vía el
 * flujo de creación/apertura desde el día; no se eliminan sus componentes.
 * El Libro digital es una vista alternativa de solo lectura.
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
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [calKey, setCalKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [libroSelectorOpen, setLibroSelectorOpen] = useState(false)
  const [libroModo, setLibroModo] = useState(null) // 'actas' | 'bitacora' | null

  const doRefresh = useCallback(async () => {
    setRefreshBusy(true)
    setCalKey((n) => n + 1)
    setUpdatedAt(Date.now())
    setRefreshBusy(false)
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
    setUpdatedAt(Date.now())
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
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Calendario del contrato · tareas, actas y bitácora
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="cc-seguim-libro-btn"
            onClick={() => setLibroSelectorOpen(true)}
            title="Abrir libro digital de Actas o Bitácora"
            style={{
              ['--cc-libro-btn-accent']: t.primary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${t.primary} 70%, #0c4a6e)`,
              background: `linear-gradient(135deg, ${t.primary}, color-mix(in srgb, ${t.primary} 72%, #0e7490))`,
              color: '#fff',
              fontWeight: 800,
              fontSize: 'var(--cc-sm)',
              cursor: 'pointer',
              boxShadow: `0 8px 18px color-mix(in srgb, ${t.primary} 35%, transparent)`,
              letterSpacing: '0.01em',
            }}
          >
            <BookOpen size={18} strokeWidth={2.4} aria-hidden />
            <span>Libro digital</span>
          </button>
          <ModuloDataRefreshBar
            theme={t}
            updatedAt={updatedAt}
            busy={refreshBusy}
            onRefresh={doRefresh}
            label="Seguimiento"
          />
        </div>
      </div>

      <SeguimientoCalendarioPanel
        t={t}
        usuario={usuario}
        token={token}
        contratoId={contratoId}
        viewportCompact={compact}
        refreshKey={calKey}
        showFilters
      />

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
    </div>
  )
}
