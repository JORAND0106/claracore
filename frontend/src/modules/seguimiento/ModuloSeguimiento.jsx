import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import SeguimientoCalendarioPanel from './SeguimientoCalendarioPanel'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

export default function ModuloSeguimiento({ t, usuario, token, contratoId }) {
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, contratoId ?? usuario?.contrato_id),
    [usuario, contratoId],
  )
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [calKey, setCalKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)

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
            Calendario de tareas, compromisos y actas de reunión
          </div>
        </div>
        <ModuloDataRefreshBar
          theme={t}
          updatedAt={updatedAt}
          busy={refreshBusy}
          onRefresh={doRefresh}
          label="Seguimiento"
        />
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
    </div>
  )
}
