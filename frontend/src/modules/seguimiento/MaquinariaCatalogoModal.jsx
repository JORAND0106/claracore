import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Trash2, Truck, X } from 'lucide-react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { createSeguimientoApi } from './seguimientoApi'

/**
 * Gestión del catálogo de Maquinaria/equipos de Bitácora (solo Desarrollador).
 * Soft-delete: la entrada deja de sugerirse en autocompletado; no altera usos históricos.
 * Patrón visual alineado con ExternosDepuracionModal.
 */
export default function MaquinariaCatalogoModal({
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
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!api || !cid) {
      setRows([])
      setError('No hay contrato activo en la sesión. Vuelva a seleccionar el contrato e intente de nuevo.')
      setLoading(false)
      return
    }
    try {
      const list = await api.listBitacoraEquipos('')
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message || 'No se pudo cargar el catálogo de Maquinaria')
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
      const blob = [r.nombre, r.tipo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return blob.includes(s)
    })
  }, [rows, q])

  const eliminar = async (row) => {
    if (!api || !row?.id) return
    setSavingId(row.id)
    setError('')
    setOkMsg('')
    try {
      await api.deleteBitacoraEquipo(row.id)
      setOkMsg(`«${row.nombre || 'Equipo'}» eliminado del catálogo. Ya no aparecerá en sugerencias.`)
      setConfirmId(null)
      await load()
    } catch (e) {
      setError(e.message || 'No se pudo eliminar la entrada')
    } finally {
      setSavingId(null)
    }
  }

  const tipoLabel = (tipo) => {
    const t0 = String(tipo || 'equipo').toLowerCase()
    if (t0 === 'maquina') return 'Máquina'
    if (t0 === 'volqueta') return 'Volqueta'
    if (t0 === 'otro') return 'Otro'
    return 'Equipo'
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catálogo de Maquinaria"
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
              <Truck size={21} strokeWidth={2.2} aria-hidden />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--cc-title)', fontWeight: 800, color: t.text }}>
                Catálogo de Maquinaria
              </div>
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 3, lineHeight: 1.45 }}>
                Listado del catálogo que alimenta el campo «Equipo/Máquina» en Bitácora.
                Eliminar una entrada la retira de las sugerencias; no altera registros históricos.
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
              placeholder="Buscar por nombre o tipo…"
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
            <div style={{ color: t.textMuted, padding: 20 }}>Cargando catálogo…</div>
          ) : filtrados.length === 0 ? (
            <div style={{
              color: t.textMuted, padding: 28, textAlign: 'center',
              border: `1px dashed ${t.border}`, borderRadius: 12, margin: 4,
            }}>
              No hay equipos registrados en el catálogo de este contrato.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtrados.map((r) => {
                const confirming = confirmId === r.id
                const busy = savingId === r.id
                return (
                  <li key={r.id}>
                    <div
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: `1px solid ${confirming ? 'color-mix(in srgb, #b91c1c 40%, ' + t.border + ')' : t.border}`,
                        background: t.bg || t.bgCard,
                        color: t.text,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 780, fontSize: 'var(--cc-body)', lineHeight: 1.35 }}>
                          {r.nombre || 'Sin nombre'}
                        </div>
                        <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 5 }}>
                          {tipoLabel(r.tipo)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {confirming ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmId(null)}
                              style={{
                                padding: '8px 12px', borderRadius: 8,
                                border: `1px solid ${t.border}`, background: 'transparent',
                                color: t.text, fontWeight: 650, fontSize: 'var(--cc-sm)',
                                cursor: 'pointer',
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void eliminar(r)}
                              style={{
                                padding: '8px 12px', borderRadius: 8,
                                border: '1px solid #b91c1c', background: '#b91c1c',
                                color: '#fff', fontWeight: 750, fontSize: 'var(--cc-sm)',
                                cursor: busy ? 'not-allowed' : 'pointer',
                                opacity: busy ? 0.7 : 1,
                              }}
                            >
                              {busy ? 'Eliminando…' : 'Confirmar'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            title="Eliminar del catálogo"
                            onClick={() => {
                              setConfirmId(r.id)
                              setOkMsg('')
                              setError('')
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '8px 12px', borderRadius: 8,
                              border: `1px solid color-mix(in srgb, #b91c1c 35%, ${t.border})`,
                              background: 'color-mix(in srgb, #b91c1c 8%, transparent)',
                              color: '#b91c1c', fontWeight: 700, fontSize: 'var(--cc-sm)',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={15} aria-hidden />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

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
