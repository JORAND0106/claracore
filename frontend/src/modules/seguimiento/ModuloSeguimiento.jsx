import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import ModuloDataRefreshBar from '../../components/ModuloDataRefreshBar'
import { useModulo } from '../../context/ModuloContext'
import { API_BASE, apiFetchSignal } from '../../apiBase'
import ActaEditor from './ActaEditor'
import ActasRepositorio from './ActasRepositorio'
import BitacoraPanel from './BitacoraPanel'
import { accesoBitacora } from './bitacoraPermisos'
import LibroDigitalVista, { LibroDigitalSelector } from './LibroDigitalVista'
import SeguimientoCalendarioPanel from './SeguimientoCalendarioPanel'
import { createSeguimientoApi } from './seguimientoApi'
import { accesoSeguimiento } from './seguimientoPermisos'
import { useSeguimientoCompact } from './seguimientoShared'

const TABS = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'actas', label: 'Actas' },
  { id: 'bitacora', label: 'Bitácora de Obra' },
]

/**
 * Seguimiento: pestañas Calendario · Actas · Bitácora de Obra.
 * El calendario sigue permitiendo crear/abrir actas y bitácora por día.
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
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])
  const compact = useSeguimientoCompact()
  const { setModuloRefresh, clearModuloRefresh } = useModulo()
  const [tab, setTab] = useState('calendario')
  const [calKey, setCalKey] = useState(0)
  const [actasKey, setActasKey] = useState(0)
  const [bitacoraKey, setBitacoraKey] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [libroSelectorOpen, setLibroSelectorOpen] = useState(false)
  const [libroModo, setLibroModo] = useState(null) // 'actas' | 'bitacora' | null
  const [usuariosContrato, setUsuariosContrato] = useState([])

  // Actas tab editor state
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
    setActasKey((n) => n + 1)
    setBitacoraKey((n) => n + 1)
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

  const closeActaEditor = useCallback(() => {
    setEditingActaId(null)
    setCreatingActa(false)
    setActasKey((n) => n + 1)
    setCalKey((n) => n + 1)
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

  const tabsVisibles = TABS.filter((tb) => {
    if (tb.id === 'bitacora') return Boolean(permisosBitacora.ver) || Boolean(permisosBitacora.esDesarrollador)
    return true
  })

  const tabActiva = tabsVisibles.some((tb) => tb.id === tab) ? tab : 'calendario'

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

      <div
        role="tablist"
        aria-label="Secciones de Seguimiento"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 14,
          borderBottom: `1px solid ${t.border}`,
          paddingBottom: 8,
        }}
      >
        {tabsVisibles.map((tb) => {
          const active = tabActiva === tb.id
          return (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb.id)}
              style={{
                border: active ? `1px solid ${t.primary}` : `1px solid ${t.border}`,
                background: active ? t.primary : t.bgCard,
                color: active ? '#fff' : t.text,
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: active ? 800 : 600,
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
              }}
            >
              {tb.label}
            </button>
          )
        })}
      </div>

      {tabActiva === 'calendario' && (
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

      {tabActiva === 'actas' && (
        <div>
          <ActasRepositorio
            key={actasKey}
            t={t}
            api={api}
            permisos={permisos}
            viewportCompact={compact}
            onNueva={() => {
              setCreatingActa(true)
              setEditingActaId(null)
            }}
            onAbrir={(id) => {
              setEditingActaId(id)
              setCreatingActa(false)
            }}
          />
          {(creatingActa || editingActaId != null) && (
            <ActaEditor
              t={t}
              api={api}
              usuario={usuario}
              usuariosContrato={usuariosContrato}
              actaId={creatingActa ? null : editingActaId}
              permisos={permisos}
              compact={compact}
              asModal
              onCancel={closeActaEditor}
              onSaved={(row, meta) => {
                if (meta?.deleted) {
                  closeActaEditor()
                  return
                }
                if (row?.id) {
                  setCreatingActa(false)
                  setEditingActaId((prev) => (Number(prev) === Number(row.id) ? prev : row.id))
                }
                if (!meta?.stay) {
                  setActasKey((n) => n + 1)
                  setCalKey((n) => n + 1)
                }
              }}
            />
          )}
        </div>
      )}

      {tabActiva === 'bitacora' && (
        <BitacoraPanel
          t={t}
          usuario={usuario}
          token={token}
          contratoId={contratoId}
          refreshKey={bitacoraKey}
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
    </div>
  )
}
