import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, UserRoundCheck, Users, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { createSeguimientoApi } from './seguimientoApi'
import { fmtFecha, labelEstadoActa, numeroActaLabel } from './seguimientoTheme'
import UserSearchSelect, { nombreUser } from './UserSearchSelect'

/**
 * Popup de depuración: listado de externos → pantalla de reemplazo a protagonismo.
 * El contrato lo toma de la sesión del módulo; el usuario no elige contrato.
 */
export default function ExternosDepuracionModal({
  t,
  token,
  contratoId,
  onClose,
  zIndex = 12100,
}) {
  const cid = contratoId != null && contratoId !== '' ? Number(contratoId) : null
  const api = useMemo(
    () => (cid && Number.isFinite(cid) ? createSeguimientoApi(cid, token) : null),
    [cid, token],
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [rows, setRows] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [usuarioDestino, setUsuarioDestino] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!api || !cid) {
      setRows([])
      setUsuarios([])
      setError('No hay contrato activo en la sesión. Vuelva a seleccionar el contrato e intente de nuevo.')
      setLoading(false)
      return
    }
    try {
      const [ext, users] = await Promise.all([
        api.listExternosDepuracion(),
        api.listUsuarios(),
      ])
      setRows(Array.isArray(ext) ? ext : [])
      setUsuarios((Array.isArray(users) ? users : []).filter((u) => !u?.es_externo && Number(u?.id) > 0))
    } catch (e) {
      setError(e.message || 'No se pudo cargar el listado de externos')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api, cid])

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

  const volverListado = () => {
    setSelected(null)
    setUsuarioDestino(null)
    setError('')
  }

  const puedeConfirmar = Boolean(selected && usuarioDestino?.id && Number(usuarioDestino.id) > 0)

  const confirmar = async () => {
    if (!selected || !api) return
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
        match_keys: Array.isArray(selected.match_keys) ? selected.match_keys : undefined,
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

  const ghostBtn = {
    padding: '10px 16px',
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: 'transparent',
    color: t.text,
    cursor: 'pointer',
    fontWeight: 650,
    fontSize: 'var(--cc-sm)',
  }
  const primaryBtn = (enabled) => ({
    padding: '11px 18px',
    borderRadius: 10,
    border: `1px solid ${t.primary}`,
    background: enabled ? t.primary : `${t.primary}55`,
    color: '#fff',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontWeight: 800,
    fontSize: 'var(--cc-sm)',
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Depurar asistentes externos"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(15,23,42,0.52)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
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
        <div style={{ padding: '16px 20px 0' }}>
          <CcModalBrandHeader theme={t} />
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, padding: '10px 20px 14px',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: `linear-gradient(145deg, ${t.primary}22, ${t.primary}08)`,
              border: `1px solid color-mix(in srgb, ${t.primary} 35%, ${t.border})`,
              color: t.primary,
            }}>
              {selected
                ? <UserRoundCheck size={21} strokeWidth={2.2} aria-hidden />
                : <Users size={21} strokeWidth={2.2} aria-hidden />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, color: t.text }}>
                {selected ? 'Reemplazar externo' : 'Depurar asistentes externos'}
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 3, lineHeight: 1.45 }}>
                {selected
                  ? 'Elija el usuario registrado que sustituirá a este externo en todas sus actas.'
                  : 'Seleccione un externo del histórico. Al elegirlo pasará a la pantalla de reemplazo.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{
              border: `1px solid ${t.border}`, background: t.bg || 'transparent',
              color: t.textMuted, borderRadius: 8, padding: 6, cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {!selected ? (
          <>
            <div style={{ padding: '14px 20px 8px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted }}
                  aria-hidden
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nombre, correo, cargo…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '11px 12px 11px 36px', borderRadius: 10,
                    border: `1px solid ${t.border}`, background: t.bg || t.bgCard,
                    color: t.text, fontSize: 'var(--cc-body)',
                  }}
                />
              </div>
              <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, whiteSpace: 'nowrap', fontWeight: 700 }}>
                {filtrados.length}
              </span>
            </div>

            <div style={{ overflow: 'auto', padding: '6px 16px 18px', flex: 1, minHeight: 300, maxHeight: '58vh' }}>
              {loading ? (
                <div style={{ color: t.textMuted, padding: 20 }}>Cargando histórico…</div>
              ) : filtrados.length === 0 ? (
                <div style={{
                  color: t.textMuted, padding: 28, textAlign: 'center',
                  border: `1px dashed ${t.border}`, borderRadius: 12, margin: 4,
                }}>
                  No hay asistentes externos pendientes de depurar en este contrato.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtrados.map((r) => (
                    <li key={r.match_key}>
                      <button
                        type="button"
                        onClick={() => seleccionar(r)}
                        style={{
                          width: '100%', textAlign: 'left', cursor: 'pointer',
                          padding: '14px 16px', borderRadius: 12,
                          border: `1px solid ${t.border}`,
                          background: t.bg || t.bgCard,
                          color: t.text,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 780, fontSize: 'var(--cc-body)', lineHeight: 1.35 }}>
                              {r.nombre || 'Sin nombre'}
                            </div>
                            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 5, lineHeight: 1.4 }}>
                              {[r.cargo, r.entidad].filter(Boolean).join(' · ') || 'Sin cargo / entidad'}
                            </div>
                            {r.email ? (
                              <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 4 }}>
                                {r.email}
                              </div>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            <span style={{
                              display: 'inline-block', padding: '3px 9px', borderRadius: 7,
                              border: `1px solid ${t.border}`, fontWeight: 700, fontSize: 'var(--cc-xs)',
                              color: t.textMuted, background: `${t.primary}0a`,
                            }}>
                              Externo
                            </span>
                            <span style={{ fontSize: 'var(--cc-sm)', fontWeight: 800, color: t.primary }}>
                              {r.actas_count} acta{r.actas_count === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: '16px 20px 8px',
              overflow: 'auto',
              flex: 1,
              minHeight: 0,
              maxHeight: '62vh',
            }}>
              <button
                type="button"
                onClick={volverListado}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: 'none', background: 'transparent', color: t.primary,
                  fontWeight: 700, fontSize: 'var(--cc-sm)', cursor: 'pointer',
                  padding: '2px 0 12px',
                }}
              >
                <ArrowLeft size={16} aria-hidden />
                Volver al listado
              </button>

              <div style={{
                padding: '16px 18px',
                borderRadius: 12,
                border: `1px solid color-mix(in srgb, ${t.primary} 28%, ${t.border})`,
                background: `linear-gradient(160deg, ${t.primary}12, transparent 70%)`,
                marginBottom: 18,
              }}>
                <div style={{
                  fontSize: 'var(--cc-xs)', fontWeight: 750, color: t.primary,
                  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
                }}>
                  Externo seleccionado
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 820, color: t.text, lineHeight: 1.25 }}>
                  {selected.nombre}
                </div>
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 8, lineHeight: 1.45 }}>
                  {[selected.cargo, selected.entidad, selected.email].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </div>
                <div style={{
                  marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', borderRadius: 8,
                  background: `${t.primary}14`, color: t.text, fontWeight: 720,
                  fontSize: 'var(--cc-sm)',
                }}>
                  Participó en {selected.actas_count} reunión{selected.actas_count === 1 ? '' : 'es'} / acta{selected.actas_count === 1 ? '' : 's'}
                </div>
              </div>

              <label style={{
                display: 'block', fontSize: 'var(--cc-sm)', fontWeight: 780,
                color: t.text, marginBottom: 8,
              }}>
                Usuario registrado de destino *
              </label>
              <UserSearchSelect
                t={t}
                usuarios={usuarios}
                valueId={usuarioDestino?.id || null}
                valueNombre={usuarioDestino ? nombreUser(usuarioDestino) : ''}
                mode="strict"
                placeholder="Buscar usuario de la plataforma…"
                onSelect={(u) => setUsuarioDestino(u)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '14px 16px',
                  borderRadius: 11,
                  border: `1px solid ${t.border}`,
                  background: t.bg || t.bgCard,
                  color: t.text,
                  fontSize: 'var(--cc-body)',
                  fontWeight: 600,
                }}
              />
              {usuarioDestino ? (
                <div style={{
                  marginTop: 10, padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${t.border}`, background: t.bg || `${t.primary}08`,
                }}>
                  <div style={{ fontWeight: 750, color: t.text, fontSize: 'var(--cc-body)' }}>
                    {nombreUser(usuarioDestino)}
                  </div>
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 4 }}>
                    {[usuarioDestino.cargo_nombre, usuarioDestino.empresa, usuarioDestino.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  Escriba para buscar y seleccione un usuario real del contrato.
                </div>
              )}

              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 780, color: t.text, marginBottom: 10 }}>
                  Actas afectadas
                </div>
                <div style={{
                  border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                    <thead>
                      <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Acta</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Fecha</th>
                        <th style={{ padding: '12px 14px', fontWeight: 700 }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.actas || []).map((a) => (
                        <tr key={a.id} style={{ borderTop: `1px solid ${t.border}` }}>
                          <td style={{ padding: '12px 14px', fontWeight: 750, color: t.text }}>
                            {numeroActaLabel(a.consecutivo)}
                          </td>
                          <td style={{ padding: '12px 14px', color: t.textMuted }}>{fmtFecha(a.fecha_reunion)}</td>
                          <td style={{ padding: '12px 14px', color: t.textMuted }}>
                            {labelEstadoActa(a.estado) || a.estado || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end',
              background: t.bgCard,
            }}>
              <button type="button" onClick={volverListado} style={ghostBtn}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!puedeConfirmar || saving}
                onClick={confirmar}
                title={!puedeConfirmar ? 'Seleccione un usuario registrado' : 'Confirmar reemplazo'}
                style={primaryBtn(puedeConfirmar && !saving)}
              >
                {saving ? 'Reemplazando…' : 'Confirmar reemplazo'}
              </button>
            </div>
          </>
        )}

        {(error || okMsg) && (
          <div style={{ padding: '0 20px 16px' }}>
            {error && (
              <div role="alert" style={{
                padding: '11px 13px', borderRadius: 9, fontSize: 'var(--cc-sm)',
                background: 'color-mix(in srgb, #b91c1c 10%, transparent)',
                border: '1px solid color-mix(in srgb, #b91c1c 35%, transparent)',
                color: '#b91c1c',
              }}>
                {error}
              </div>
            )}
            {okMsg && (
              <div role="status" style={{
                padding: '11px 13px', borderRadius: 9, fontSize: 'var(--cc-sm)',
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
