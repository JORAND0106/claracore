import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import SeguimientoCalendario from './SeguimientoCalendario'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

export default function ModuloSeguimiento({ t, usuario, token, contratoId }) {
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, contratoId ?? usuario?.contrato_id),
    [usuario, contratoId],
  )
  const api = useMemo(
    () => createSeguimientoApi(contratoId ?? usuario?.contrato_id, token),
    [contratoId, usuario?.contrato_id, token],
  )
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [calKey, setCalKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)

  const loadUsuarios = useCallback(async () => {
    const cid = contratoId ?? usuario?.contrato_id
    if (!cid || !token) return
    try {
      const data = await api.listUsuarios()
      setUsuariosContrato(Array.isArray(data) ? data : [])
    } catch {
      try {
        const sig = apiFetchSignal(20000)
        const res = await fetch(`${API_BASE}/actas/${cid}/usuarios-contrato`, {
          headers: { Authorization: `Bearer ${token}` },
          ...(sig ? { signal: sig } : {}),
        })
        if (res.ok) {
          const data = await res.json()
          setUsuariosContrato(Array.isArray(data) ? data : [])
        }
      } catch { /* ignore */ }
    }
  }, [api, contratoId, usuario?.contrato_id, token])

  const doRefresh = useCallback(async () => {
    setRefreshBusy(true)
    setCalKey((n) => n + 1)
    setUpdatedAt(Date.now())
    await loadUsuarios()
    setRefreshBusy(false)
  }, [loadUsuarios])

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
    loadUsuarios()
    setUpdatedAt(Date.now())
  }, [loadUsuarios])

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
      className={compact ? 'cc-seguim-root cc-seguim-root--compact' : 'cc-seguim-root'}
      style={{ width: '100%', maxWidth: compact ? '100%' : 1200 }}
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

      <SeguimientoCalendario
        t={t}
        api={api}
        usuario={usuario}
        usuarios={usuariosContrato}
        permisos={permisos}
        viewportCompact={compact}
        refreshKey={calKey}
        onNuevaActa={() => { setCreating(true); setEditingActaId(null) }}
        onAbrirActa={(id) => { setEditingActaId(id); setCreating(false) }}
      />

      {(creating || editingActaId != null) && (
        <ActaEditor
          t={t}
          api={api}
          usuario={usuario}
          usuariosContrato={usuariosContrato}
          actaId={editingActaId}
          permisos={permisos}
          compact={compact}
          asModal
          onCancel={() => { setCreating(false); setEditingActaId(null); setCalKey((n) => n + 1) }}
          onSaved={async (row, meta) => {
            if (meta?.deleted) {
              setCreating(false)
              setEditingActaId(null)
              setCalKey((n) => n + 1)
              return
            }
            if (row?.id) {
              setCreating(false)
              setEditingActaId((prev) => (Number(prev) === Number(row.id) ? prev : row.id))
            }
            if (!meta?.stay) setCalKey((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
