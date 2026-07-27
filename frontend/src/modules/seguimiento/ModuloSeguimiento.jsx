import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import ActasRepositorio from './ActasRepositorio'
import BandejaPanel from './BandejaPanel'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'

const TABS = [
  { id: 'bandeja', label: 'Bandeja', icon: '📥' },
  { id: 'actas', label: 'Actas', icon: '📝' },
]

export default function ModuloSeguimiento({ t, usuario, token, contratoId }) {
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, contratoId ?? usuario?.contrato_id),
    [usuario, contratoId],
  )
  const api = useMemo(
    () => createSeguimientoApi(contratoId ?? usuario?.contrato_id, token),
    [contratoId, usuario?.contrato_id, token],
  )
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [tab, setTab] = useState('bandeja')
  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [repoKey, setRepoKey] = useState(0)
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
    setRepoKey((n) => n + 1)
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
    <div style={{ width: '100%', maxWidth: 1200 }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 'var(--cc-h2)', fontWeight: 700, color: t.text }}>Seguimiento</div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
            Actas de reunión y bandeja unificada de compromisos y tareas
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            style={{
              border: `1px solid ${tab === tb.id ? t.primary : t.border}`,
              background: tab === tb.id ? `${t.primary}22` : t.bgCard,
              color: tab === tb.id ? t.primary : t.textMuted,
              fontWeight: tab === tb.id ? 700 : 500,
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            {tb.icon} {tb.label}
          </button>
        ))}
      </div>

      {tab === 'bandeja' && (
        <BandejaPanel
          t={t}
          api={api}
          usuario={usuario}
          usuarios={usuariosContrato}
          permisos={permisos}
        />
      )}

      {tab === 'actas' && (
        <ActasRepositorio
          key={repoKey}
          t={t}
          api={api}
          permisos={permisos}
          onNueva={() => { setCreating(true); setEditingActaId(null) }}
          onAbrir={(id) => { setEditingActaId(id); setCreating(false) }}
        />
      )}

      {(creating || editingActaId != null) && (
        <ActaEditor
          t={t}
          api={api}
          usuario={usuario}
          usuariosContrato={usuariosContrato}
          actaId={editingActaId}
          permisos={permisos}
          asModal
          onCancel={() => { setCreating(false); setEditingActaId(null); setRepoKey((n) => n + 1) }}
          onSaved={async (row, meta) => {
            if (meta?.deleted) {
              setCreating(false)
              setEditingActaId(null)
              setRepoKey((n) => n + 1)
              setTab('actas')
              return
            }
            if (row?.id) {
              setCreating(false)
              setEditingActaId(row.id)
            }
            setRepoKey((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
