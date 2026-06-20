import { useState, useEffect, useCallback, useRef } from 'react'
import { Headset, Trash2 } from 'lucide-react'
import { API_BASE } from '../apiBase'

function formatFechaLogBogota(iso) {
  if (!iso) return '—'
  try {
    let s = String(iso).trim().replace(' ', 'T')
    if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z'
    return new Date(s).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

function tiempoRelativo(iso) {
  if (!iso) return '—'
  try {
    let s = String(iso).trim().replace(' ', 'T')
    if (!/Z$/i.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s += 'Z'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return '—'
    const sec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (sec < 45) return 'hace un momento'
    if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`
    if (sec < 604800) return `hace ${Math.floor(sec / 86400)} d`
    return formatFechaLogBogota(iso)
  } catch {
    return '—'
  }
}

function esDesarrollador(usuario) {
  return usuario?.cargo_nombre?.trim().toLowerCase() === 'desarrollador'
}

export function PanelSoporteTecnico({ t, usuario, token }) {
  const [abierto, setAbierto] = useState(false)
  const [tab, setTab] = useState('pendientes')
  const [pendientes, setPendientes] = useState([])
  const [gestionados, setGestionados] = useState([])
  const [pendientesCount, setPendientesCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [accionId, setAccionId] = useState(null)
  const [eliminandoId, setEliminandoId] = useState(null)
  const [limpiando, setLimpiando] = useState(false)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  )

  const cargarPendientes = useCallback(async () => {
    const r = await fetch(`${API_BASE}/admin/soporte?filtro=todos`, { headers: authHeaders() }).catch(() => null)
    if (!r?.ok) return
    const data = await r.json()
    setPendientesCount(data?.kpis?.pendientes ?? 0)
    const lista = (data?.reportes || []).filter((x) => !x.soporte_estado)
    setPendientes(lista)
  }, [authHeaders])

  const cargarGestionados = useCallback(async () => {
    const r = await fetch(`${API_BASE}/admin/soporte?filtro=gestionados`, { headers: authHeaders() }).catch(() => null)
    if (!r?.ok) return
    const data = await r.json()
    setGestionados(data?.reportes || [])
  }, [authHeaders])

  const cargarCount = useCallback(async () => {
    const r = await fetch(`${API_BASE}/admin/soporte?filtro=todos`, { headers: authHeaders() }).catch(() => null)
    if (!r?.ok) return
    const data = await r.json()
    setPendientesCount(data?.kpis?.pendientes ?? 0)
  }, [authHeaders])

  const refrescarTodo = useCallback(async () => {
    await cargarPendientes()
    await cargarGestionados()
    await cargarCount()
  }, [cargarPendientes, cargarGestionados, cargarCount])

  const cargarTab = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'pendientes') {
        await cargarPendientes()
      } else {
        await cargarGestionados()
      }
    } finally {
      setLoading(false)
    }
  }, [tab, cargarPendientes, cargarGestionados])

  const cargarCountRef = useRef(cargarCount)
  cargarCountRef.current = cargarCount
  const cargarTabRef = useRef(cargarTab)
  cargarTabRef.current = cargarTab
  const abiertoRef = useRef(abierto)
  abiertoRef.current = abierto

  useEffect(() => {
    if (!esDesarrollador(usuario) || !token) return
    void cargarCount()
    const iv = setInterval(() => { void cargarCountRef.current?.() }, 60000)
    return () => clearInterval(iv)
  }, [usuario, token, cargarCount])

  useEffect(() => {
    if (!abierto || !esDesarrollador(usuario)) return
    void cargarTab()
    const iv = setInterval(() => {
      if (abiertoRef.current) void cargarTabRef.current?.()
    }, 20000)
    return () => clearInterval(iv)
  }, [abierto, tab, usuario, cargarTab])

  const marcar = async (id, accion) => {
    setAccionId(id)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/${id}/gestionar`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo actualizar el reporte')
        return
      }
      await refrescarTodo()
    } finally {
      setAccionId(null)
    }
  }

  const eliminar = async (id) => {
    setEliminandoId(id)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo eliminar el reporte')
        return
      }
      await refrescarTodo()
    } finally {
      setEliminandoId(null)
    }
  }

  const limpiarTodo = async () => {
    const items = tab === 'pendientes' ? pendientes : gestionados
    const n = items.length
    if (!n) return
    const msg =
      tab === 'pendientes'
        ? `¿Eliminar los ${n} reportes pendientes? Esta acción no se puede deshacer.`
        : `¿Eliminar los ${n} reportes gestionados? Esta acción no se puede deshacer.`
    if (!window.confirm(msg)) return
    setLimpiando(true)
    try {
      const r = await fetch(`${API_BASE}/admin/soporte/limpiar?pestana=${encodeURIComponent(tab)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err?.detail || 'No se pudo limpiar los reportes')
        return
      }
      await refrescarTodo()
    } finally {
      setLimpiando(false)
    }
  }

  if (!esDesarrollador(usuario)) return null

  const lista = tab === 'pendientes' ? pendientes : gestionados

  const btnTab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      style={{
        background: tab === key ? t.primary : 'transparent',
        color: tab === key ? '#fff' : t.textMuted,
        border: `1px solid ${tab === key ? t.primary : t.border}`,
        borderRadius: '20px',
        padding: '4px 14px',
        fontSize: 'var(--cc-sm)',
        fontWeight: tab === key ? '700' : '400',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const urgenciaBadge = (urgencia) => {
    if (!urgencia) return null
    return (
      <span
        style={{
          fontSize: 'var(--cc-caption)',
          fontWeight: 700,
          padding: '1px 7px',
          borderRadius: '20px',
          background: '#FFF7ED',
          color: '#9A3412',
          border: '1px solid #FDBA7444',
          flexShrink: 0,
        }}
      >
        {urgencia}
      </span>
    )
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Soporte técnico"
          onClick={() => setAbierto((o) => !o)}
          style={{
            background: abierto ? `${t.primary}22` : 'transparent',
            border: `1px solid ${abierto ? t.primary : t.border}`,
            borderRadius: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
            color: abierto ? t.primary : t.textMuted,
            fontSize: 'var(--cc-lg)',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Headset size={18} strokeWidth={2} aria-hidden />
          {pendientesCount > 0 && (
            <span
              style={{
                background: '#EF4444',
                color: '#fff',
                borderRadius: '20px',
                fontSize: 'var(--cc-caption)',
                fontWeight: '700',
                padding: '1px 6px',
                minWidth: '16px',
                textAlign: 'center',
              }}
            >
              {pendientesCount > 99 ? '99+' : pendientesCount}
            </span>
          )}
        </button>
      </div>

      {abierto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '400px',
            background: t.bgCard,
            borderLeft: `1px solid ${t.border}`,
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Headset size={20} strokeWidth={2} color={t.primary} aria-hidden />
              <div style={{ fontSize: 'var(--cc-md)', fontWeight: '700', color: t.text }}>
                Soporte técnico
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={limpiarTodo}
                disabled={limpiando || !lista.length}
                style={{
                  background: 'transparent',
                  border: `1px solid ${lista.length ? '#DC2626' : t.border}`,
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontSize: 'var(--cc-label)',
                  fontWeight: '600',
                  cursor: limpiando || !lista.length ? 'not-allowed' : 'pointer',
                  color: lista.length ? '#DC2626' : t.textMuted,
                  opacity: limpiando ? 0.7 : 1,
                }}
              >
                {limpiando ? 'Limpiando…' : 'Limpiar todo'}
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 'var(--cc-lg)',
                  cursor: 'pointer',
                  color: t.textMuted,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div
            style={{
              padding: '10px 16px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              gap: '8px',
            }}
          >
            {btnTab('pendientes', `Pendientes${pendientesCount > 0 ? ` (${pendientesCount})` : ''}`)}
            {btnTab('gestionados', 'Gestionados')}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {loading && !lista.length ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                Cargando reportes…
              </div>
            ) : !lista.length ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: t.textMuted, fontSize: 'var(--cc-sm)' }}>
                {tab === 'pendientes' ? 'No hay reportes pendientes.' : 'No hay reportes gestionados.'}
              </div>
            ) : (
              lista.map((r) => {
                const esError = r.tipo_reporte === 'error'
                const esSug = r.tipo_reporte === 'sugerencia'
                const icono = esError ? '🛟' : esSug ? '💡' : '📩'
                const gestionado = !!r.soporte_estado
                const busy = accionId === r.id
                const borrando = eliminandoId === r.id

                return (
                  <div
                    key={r.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      marginBottom: '6px',
                      background: gestionado ? t.bg : `${t.primary}08`,
                      border: `1px solid ${gestionado ? t.border : `${t.primary}33`}`,
                      opacity: gestionado ? 0.85 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 'var(--cc-lg)', lineHeight: 1, flexShrink: 0 }}>{icono}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <div
                            style={{
                              fontSize: 'var(--cc-sm)',
                              fontWeight: '700',
                              color: t.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginBottom: '4px',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {r.asunto || 'Sin asunto'}
                          </div>
                          <button
                            type="button"
                            title="Eliminar reporte"
                            disabled={borrando || busy}
                            onClick={() => eliminar(r.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: '2px',
                              cursor: borrando || busy ? 'wait' : 'pointer',
                              color: t.textMuted,
                              flexShrink: 0,
                              lineHeight: 0,
                              opacity: borrando ? 0.5 : 1,
                            }}
                          >
                            <Trash2 size={15} strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '4px',
                          }}
                        >
                          <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>
                            {r.remitente_nombre || 'Usuario'}
                          </span>
                          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>·</span>
                          <span style={{ fontSize: 'var(--cc-label)', color: t.textMuted }}>
                            {tiempoRelativo(r.created_at)}
                          </span>
                          {urgenciaBadge(r.urgencia)}
                        </div>
                        {gestionado && (
                          <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: '2px' }}>
                            {r.soporte_estado === 'anotado' ? '💡 Anotado' : '✅ Gestionado'}
                            {r.soporte_gestionado_por_nombre ? ` · ${r.soporte_gestionado_por_nombre}` : ''}
                          </div>
                        )}
                        {!gestionado && (esError || esSug) && (
                          <button
                            type="button"
                            disabled={busy || borrando}
                            onClick={() => marcar(r.id, esError ? 'gestionado' : 'anotado')}
                            style={{
                              marginTop: '8px',
                              background: esError ? '#16A34A' : '#CA8A04',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '5px 12px',
                              fontSize: 'var(--cc-label)',
                              fontWeight: '700',
                              cursor: busy || borrando ? 'wait' : 'pointer',
                              opacity: busy ? 0.7 : 1,
                            }}
                          >
                            {busy ? '…' : esError ? '✅ Gestionado' : '💡 Anotado'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default PanelSoporteTecnico
