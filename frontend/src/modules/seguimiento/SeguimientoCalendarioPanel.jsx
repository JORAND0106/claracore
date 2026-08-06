import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import SeguimientoCalendario from './SeguimientoCalendario'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

/**
 * Host reutilizable del calendario de Seguimiento + ActaEditor.
 * Usado por el módulo Seguimiento y por la página de inicio (misma lógica).
 */
export default function SeguimientoCalendarioPanel({
  t,
  usuario,
  token,
  contratoId,
  viewportCompact: viewportCompactProp,
  refreshKey = 0,
  showFilters = true,
}) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(() => accesoSeguimiento(usuario, cid), [usuario, cid])
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const compactHook = useSeguimientoCompact()
  const viewportCompact = viewportCompactProp ?? compactHook

  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [fechaActaInicial, setFechaActaInicial] = useState(null)
  const [localKey, setLocalKey] = useState(0)

  const loadUsuarios = useCallback(async () => {
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
  }, [api, cid, token])

  useEffect(() => { loadUsuarios() }, [loadUsuarios])

  if (permisos.bloqueado) {
    return (
      <div style={{
        padding: 16, borderRadius: 10, border: `1px solid ${t.border}`,
        background: t.bgCard, color: t.textMuted, fontSize: 'var(--cc-sm)',
      }}>
        No fue posible abrir el calendario de Seguimiento con la sesión actual.
      </div>
    )
  }

  if (!permisos.ver) return null

  return (
    <>
      <SeguimientoCalendario
        t={t}
        api={api}
        usuario={usuario}
        usuarios={usuariosContrato}
        permisos={permisos}
        viewportCompact={viewportCompact}
        refreshKey={Number(refreshKey) + localKey}
        showFilters={showFilters}
        onNuevaActa={(fecha) => {
          setFechaActaInicial(fecha ? String(fecha).slice(0, 10) : null)
          setCreating(true)
          setEditingActaId(null)
        }}
        onAbrirActa={(id) => {
          setFechaActaInicial(null)
          setEditingActaId(id)
          setCreating(false)
        }}
      />

      {(creating || editingActaId != null) && (
        <ActaEditor
          t={t}
          api={api}
          usuario={usuario}
          usuariosContrato={usuariosContrato}
          actaId={editingActaId}
          permisos={permisos}
          compact={viewportCompact}
          asModal
          fechaReunionInicial={fechaActaInicial}
          onCancel={() => {
            setCreating(false)
            setEditingActaId(null)
            setFechaActaInicial(null)
            setLocalKey((n) => n + 1)
          }}
          onSaved={async (row, meta) => {
            if (meta?.deleted) {
              setCreating(false)
              setEditingActaId(null)
              setFechaActaInicial(null)
              setLocalKey((n) => n + 1)
              return
            }
            if (row?.id) {
              setCreating(false)
              setFechaActaInicial(null)
              setEditingActaId((prev) => (Number(prev) === Number(row.id) ? prev : row.id))
            }
            if (!meta?.stay) setLocalKey((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
