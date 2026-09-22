import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserRoundCheck, Users, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { createSeguimientoApi } from './seguimientoApi'
import { fmtFecha, numeroActaLabel } from './seguimientoTheme'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'

/**
 * Popup de depuración: listado de asistentes externos del histórico de actas
 * y reemplazo obligatorio por un usuario registrado del contrato.
 */
export default function ExternosDepuracionModal({
  t,
  token,
  contratoId,
  onClose,
  zIndex = 12100,
}) {
  const api = useMemo(() => createSeguimientoApi(contratoId, token), [contratoId, token])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [rows, setRows] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [usuarioDestino, setUsuarioDestino] = useState(null)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(max-width: 760px)')
    const apply = () => setNarrow(Boolean(mq.matches))
    apply()
    if (mq.addEventListener) mq.addEventListener('change', apply)
    else mq.addListener?.(apply)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply)
      else mq.removeListener?.(apply)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ext, users] = await Promise.all([
        api.listExternosDepuracion(),
        api.listUsuarios(),
      ])
      setRows(Array.isArray(ext) ? ext : [])
      // Solo usuarios reales (nunca externos) como destino de reemplazo
      setUsuarios((Array.isArray(users) ? users : []).filter((u) => !u?.es_externo && Number(u?.id) > 0))
    } catch (e) {
      setError(e.message || 'No se pudo cargar el listado de externos')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => {
      const blob = [r.nombre, r.email, r.cargo, r.entidad]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return blob.includes(s)
    })
  }, [rows, q])

  const seleccionar = (row) => {
    setSelected(row)
    setUsuarioDestino(null)
    setOkMsg('')
    setError('')
  }

  const puedeConfirmar = Boolean(selected && usuarioDestino?.id && Number(usuarioDestino.id) > 0)

  const confirmar = async () => {
    if (!selected) return
    if (!usuarioDestino?.id || Number(usuarioDestino.id) <= 0) {
      setError('Debe seleccionar un usuario registrado de reemplazo')
      return
    }
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const result = await api.reemplazarExterno({
        usuario_id: Number(usuarioDestino.id),
        externo_id: selected.externo_id ?? undefined,
        match_key: selected.match_key,
        email: selected.email || undefined,
        nombre: selected.nombre || undefined,
      })
      const nActas = result?.actas_count ?? selected.actas_count
      setOkMsg(
        `Reemplazo aplicado en ${nActas} acta${nActas === 1 ? '' : 's'}: `
        + `${selected.nombre || 'externo'} → ${nombreUser(usuarioDestino)}.`,
      )
      setSelected(null)
      setUsuarioDestino(null)
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo completar el reemplazo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Depurar asistentes externos"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(15,23,42,0.48)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 16px 48px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ padding: '16px 18px 0' }}>
          <CcModalBrandHeader theme={t} />
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, padding: '10px 18px 14px',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: `linear-gradient(145deg, ${t.primary}22, ${t.primary}08)`,
              border: `1px solid color-mix(in srgb, ${t.primary} 35%, ${t.border})`,
              color: t.primary,
            }}>
              <Users size={20} strokeWidth={2.2} aria-hidden />
            </div>
            <div>
              <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, color: t.text }}>
                Depurar asistentes externos
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2, maxWidth: 620 }}>
                Revise coincidencias del histórico y reemplácelas por el usuario registrado.
                El reemplazo es obligatorio; no se elimina la participación.
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              border: `1px solid ${t.border}`, background: t.bg || 'transparent',
              color: t.textMuted, borderRadius: 8, padding: 6, cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: selected && !narrow ? 'minmax(0, 1.05fr) minmax(0, 0.95fr)' : '1fr',
          gap: 0,
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', minHeight: 0,
            borderRight: selected ? `1px solid ${t.border}` : undefined,
          }}>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }}
                  aria-hidden
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre, correo, cargo…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 10px 9px 32px', borderRadius: 9,
                    border: `1px solid ${t.border}`, background: t.bg || t.bgCard,
                    color: t.text, fontSize: 'var(--cc-sm)',
                  }}
                />
              </div>
              <span style={{
                fontSize: 'var(--cc-xs)', color: t.textMuted, whiteSpace: 'nowrap',
                fontWeight: 600,
              }}>
                {filtrados.length} externo{filtrados.length === 1 ? '' : 's'}
              </span>
            </div>

            <div style={{ overflow: 'auto', padding: '0 12px 14px', minHeight: 280, maxHeight: '58vh' }}>
              {loading ? (
                <div style={{ color: t.textMuted, padding: 16 }}>Cargando histórico…</div>
              ) : filtrados.length === 0 ? (
                <div style={{
                  color: t.textMuted, padding: 20, textAlign: 'center',
                  border: `1px dashed ${t.border}`, borderRadius: 10, margin: 4,
                }}>
                  No hay asistentes externos pendientes de depurar en este contrato.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtrados.map((r) => {
                    const active = selected?.match_key === r.match_key
                    return (
                      <li key={r.match_key}>
                        <button
                          type="button"
                          onClick={() => seleccionar(r)}
                          style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer',
                            padding: '12px 14px', borderRadius: 11,
                            border: `1px solid ${active ? t.primary : t.border}`,
                            background: active
                              ? `color-mix(in srgb, ${t.primary} 12%, ${t.bgCard})`
                              : (t.bg || t.bgCard),
                            color: t.text,
                            boxShadow: active ? `0 0 0 1px color-mix(in srgb, ${t.primary} 40%, transparent)` : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 750, fontSize: 'var(--cc-body)' }}>
                                {r.nombre || 'Sin nombre'}
                              </div>
                              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 3 }}>
                                {[r.cargo, r.entidad, r.email].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                                border: `1px solid ${t.border}`, fontWeight: 700, fontSize: 'var(--cc-xs)',
                                color: t.textMuted, background: `${t.primary}08`,
                              }}>
                                Externo
                              </span>
                              <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.primary }}>
                                {r.actas_count} acta{r.actas_count === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {selected && (
            <div style={{
              display: 'flex', flexDirection: 'column', minHeight: 0,
              background: `linear-gradient(180deg, ${t.primary}06, transparent 120px)`,
            }}>
              <div style={{ padding: '14px 16px', overflow: 'auto', flex: 1, maxHeight: '62vh' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.primary,
                  marginBottom: 8,
                }}>
                  <UserRoundCheck size={14} aria-hidden />
                  Reemplazo
                </div>
                <div style={{ fontSize: 'var(--cc-lg)', fontWeight: 800, color: t.text }}>
                  {selected.nombre}
                </div>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4 }}>
                  Participó en <strong style={{ color: t.text }}>{selected.actas_count}</strong>
                  {' '}reunión{selected.actas_count === 1 ? '' : 'es'}/acta{selected.actas_count === 1 ? '' : 's'}.
                  Elija el usuario registrado que lo sustituirá.
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                    Usuario registrado de destino *
                  </label>
                  <UserSearchSelect
                    t={t}
                    usuarios={usuarios}
                    valueId={usuarioDestino?.id || null}
                    valueNombre={usuarioDestino ? nombreUser(usuarioDestino) : ''}
                    mode="strict"
                    placeholder="Buscar usuario del contrato…"
                    onSelect={(u) => setUsuarioDestino(u)}
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 'var(--cc-xs)', fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
                    Actas afectadas
                  </div>
                  <div style={{
                    border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden',
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-xs)' }}>
                      <thead>
                        <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>Acta</th>
                          <th style={{ padding: '8px 10px' }}>Fecha</th>
                          <th style={{ padding: '8px 10px' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.actas || []).map((a) => (
                          <tr key={a.id} style={{ borderTop: `1px solid ${t.border}` }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: t.text }}>
                              {numeroActaLabel(a.consecutivo)}
                            </td>
                            <td style={{ padding: '8px 10px', color: t.textMuted }}>{fmtFecha(a.fecha_reunion)}</td>
                            <td style={{ padding: '8px 10px', color: t.textMuted }}>{a.estado || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div style={{
                padding: '12px 16px', borderTop: `1px solid ${t.border}`,
                display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end',
              }}>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setUsuarioDestino(null) }}
                  style={{
                    padding: '9px 14px', borderRadius: 9, border: `1px solid ${t.border}`,
                    background: 'transparent', color: t.text, cursor: 'pointer', fontWeight: 600,
                    fontSize: 'var(--cc-sm)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!puedeConfirmar || saving}
                  onClick={confirmar}
                  title={!puedeConfirmar ? 'Seleccione un usuario registrado' : 'Confirmar reemplazo'}
                  style={{
                    padding: '9px 16px', borderRadius: 9,
                    border: `1px solid ${t.primary}`,
                    background: puedeConfirmar && !saving ? t.primary : `${t.primary}55`,
                    color: '#fff', cursor: puedeConfirmar && !saving ? 'pointer' : 'not-allowed',
                    fontWeight: 800, fontSize: 'var(--cc-sm)',
                  }}
                >
                  {saving ? 'Reemplazando…' : 'Confirmar reemplazo'}
                </button>
              </div>
            </div>
          )}
        </div>

        {(error || okMsg) && (
          <div style={{ padding: '0 16px 14px' }}>
            {error && (
              <div role="alert" style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
                background: 'color-mix(in srgb, #b91c1c 10%, transparent)',
                border: '1px solid color-mix(in srgb, #b91c1c 35%, transparent)',
                color: '#b91c1c',
              }}>
                {error}
              </div>
            )}
            {okMsg && (
              <div role="status" style={{
                padding: '10px 12px', borderRadius: 8, fontSize: 'var(--cc-sm)',
                background: `color-mix(in srgb, ${t.primary} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${t.primary} 35%, ${t.border})`,
                color: t.text, marginTop: error ? 8 : 0,
              }}>
                {okMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
