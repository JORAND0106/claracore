import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
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
  const [actas, setActas] = useState([])
  const [usuariosContrato, setUsuariosContrato] = useState([])
  const [editingActaId, setEditingActaId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const loadActas = useCallback(async () => {
    if (!permisos.ver) return
    try {
      const list = await api.listActas()
      setActas(list || [])
      setUpdatedAt(Date.now())
    } catch {
      setActas([])
    }
  }, [api, permisos.ver])

  const loadUsuarios = useCallback(async () => {
    const cid = contratoId ?? usuario?.contrato_id
    if (!cid || !token) return
    try {
      const data = await api.listUsuarios()
      setUsuariosContrato(Array.isArray(data) ? data : [])
    } catch {
      // Fallback legacy
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
    setTick((n) => n + 1)
    await loadActas()
    setRefreshBusy(false)
  }, [loadActas])

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
    loadActas()
    loadUsuarios()
  }, [loadActas, loadUsuarios, tick])

  if (permisos.bloqueado) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 700, color: t.text, marginBottom: 10 }}>Seguimiento</div>
        <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>
          Tu cargo no tiene permiso para este módulo. Un administrador puede habilitarlo en Panel admin → Control de accesos → función «Seguimiento» (acción Ver).
        </div>
      </div>
    )
  }

  if (creating || editingActaId != null) {
    return (
      <ActaEditor
        t={t}
        api={api}
        usuario={usuario}
        usuariosContrato={usuariosContrato}
        actaId={editingActaId}
        permisos={permisos}
        onCancel={() => { setCreating(false); setEditingActaId(null); loadActas() }}
        onSaved={async (row, meta) => {
          if (meta?.deleted) {
            setCreating(false)
            setEditingActaId(null)
            await loadActas()
            setTab('actas')
            return
          }
          if (row?.id) {
            setCreating(false)
            setEditingActaId(row.id)
          }
          await loadActas()
          if (!meta?.stay) {
            setCreating(false)
            setEditingActaId(null)
            setTab('actas')
          }
        }}
      />
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
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            {permisos.crear && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                  background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
                }}
              >
                + Nueva acta
              </button>
            )}
          </div>
          {actas.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)' }}>Aún no hay actas de reunión.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setEditingActaId(a.id)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    background: t.bgCard, border: `1px solid ${t.border}`,
                    borderRadius: 10, padding: '12px 14px', color: t.text,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 'var(--cc-body)' }}>
                    Acta Nº {a.consecutivo}
                  </div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                    {String(a.fecha_reunion || '').slice(0, 10)} · {a.ubicacion || 'Sin ubicación'} · {a.estado}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
