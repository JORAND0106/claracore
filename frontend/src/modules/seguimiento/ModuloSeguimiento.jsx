import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import ActasRepositorio from './ActasRepositorio'
import BitacoraPanel from './BitacoraPanel'
import SeguimientoCalendarioPanel from './SeguimientoCalendarioPanel'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

const TABS = [
  { id: 'actas', label: 'Actas' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'bitacora', label: 'Bitácora de Obra' },
]

export default function ModuloSeguimiento({ t, usuario, token, contratoId }) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, cid),
    [usuario, cid],
  )
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [tab, setTab] = useState('calendario')
  const [calKey, setCalKey] = useState(0)
  const [bitKey, setBitKey] = useState(0)
  const [actasKey, setActasKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)

  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creatingActa, setCreatingActa] = useState(false)

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

  useEffect(() => { void loadUsuarios() }, [loadUsuarios])

  const doRefresh = useCallback(async () => {
    setRefreshBusy(true)
    setCalKey((n) => n + 1)
    setBitKey((n) => n + 1)
    setActasKey((n) => n + 1)
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
            Actas, calendario y bitácora de obra del contrato
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

      <div
        role="tablist"
        aria-label="Secciones de Seguimiento"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
          borderBottom: `1px solid ${t.border}`, paddingBottom: 8,
        }}
      >
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              style={{
                border: 'none',
                borderBottom: active ? `2px solid ${t.primary}` : '2px solid transparent',
                background: 'transparent',
                color: active ? t.primary : t.textMuted,
                fontWeight: active ? 800 : 600,
                fontSize: 'var(--cc-body)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'calendario' && (
        <SeguimientoCalendarioPanel
          t={t}
          usuario={usuario}
          token={token}
          contratoId={contratoId}
          viewportCompact={compact}
          refreshKey={calKey}
          showFilters
        />
      )}

      {tab === 'actas' && (
        <ActasRepositorio
          key={actasKey}
          t={t}
          api={api}
          permisos={permisos}
          viewportCompact={compact}
          onNueva={() => { setCreatingActa(true); setEditingActaId(null) }}
          onAbrir={(id) => { setEditingActaId(id); setCreatingActa(false) }}
        />
      )}

      {tab === 'bitacora' && (
        <BitacoraPanel
          t={t}
          usuario={usuario}
          token={token}
          contratoId={contratoId}
          refreshKey={bitKey}
        />
      )}

      {(creatingActa || editingActaId != null) && (
        <ActaEditor
          t={t}
          api={api}
          usuario={usuario}
          usuariosContrato={usuariosContrato}
          actaId={editingActaId}
          permisos={permisos}
          compact={compact}
          asModal
          onCancel={() => {
            setCreatingActa(false)
            setEditingActaId(null)
            setActasKey((n) => n + 1)
          }}
          onSaved={async (row, meta) => {
            if (meta?.deleted) {
              setCreatingActa(false)
              setEditingActaId(null)
              setActasKey((n) => n + 1)
              return
            }
            if (row?.id) {
              setCreatingActa(false)
              setEditingActaId((prev) => (Number(prev) === Number(row.id) ? prev : row.id))
            }
            if (!meta?.stay) setActasKey((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
