import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../../apiBase'
import {
  labelTramoBitacora,
  tramosDisponiblesParaNuevo,
} from './bitacoraTramoHelpers'
import { seguimientoModalOverlayStyle, seguimientoModalSheetStyle } from './seguimientoShared'

/**
 * Selector de tramos para una fecha de Bitácora:
 * - lista diarios ya diligenciados
 * - permite abrir uno o crear nuevo para un tramo libre
 */
export default function BitacoraTramoDiaModal({
  t,
  api,
  token,
  contratoId,
  fecha,
  diariosIniciales = null,
  permisosBitacora,
  viewportCompact = false,
  onClose,
  onAbrirDiario,
  onNuevoDiario,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [diarios, setDiarios] = useState(() => (
    Array.isArray(diariosIniciales) ? diariosIniciales : []
  ))
  const [catalogo, setCatalogo] = useState([])
  const [tramoNuevo, setTramoNuevo] = useState('')

  const load = useCallback(async () => {
    if (!fecha || !api?.getBitacoraDiariosFecha) return
    setBusy(true)
    setError('')
    try {
      const data = await api.getBitacoraDiariosFecha(fecha)
      const list = Array.isArray(data?.diarios)
        ? data.diarios
        : (Array.isArray(data) ? data : [])
      setDiarios(list)
    } catch (e) {
      setError(e.message || 'No se pudo cargar la bitácora del día')
    } finally {
      setBusy(false)
    }
  }, [api, fecha])

  const loadTramos = useCallback(async () => {
    if (!contratoId || !token) return
    try {
      const res = await fetch(
        `${API_BASE}/presupuesto/${contratoId}/maestro-ubicacion-pk`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) return
      const data = await res.json()
      const tramos = Array.isArray(data?.tramos) ? data.tramos : []
      setCatalogo(tramos.map((x) => String(x || '').trim()).filter(Boolean))
    } catch { /* ignore */ }
  }, [contratoId, token])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadTramos() }, [loadTramos])

  const disponibles = useMemo(
    () => tramosDisponiblesParaNuevo(catalogo, diarios),
    [catalogo, diarios],
  )

  useEffect(() => {
    if (!tramoNuevo && disponibles.length) setTramoNuevo(disponibles[0])
    if (tramoNuevo && !disponibles.includes(tramoNuevo)) {
      setTramoNuevo(disponibles[0] || '')
    }
  }, [disponibles, tramoNuevo])

  const puedeCrear = Boolean(permisosBitacora?.crear)

  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }
  const btnGhost = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '8px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={viewportCompact ? 'cc-seguim-modal-overlay cc-seguim-modal-overlay--compact' : 'cc-seguim-modal-overlay'}
      style={seguimientoModalOverlayStyle(viewportCompact)}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={viewportCompact ? 'cc-seguim-modal-sheet' : 'cc-seguim-modal-sheet--desktop'}
        style={{
          ...seguimientoModalSheetStyle(viewportCompact, { wide: false }),
          background: t.bgCard,
          border: viewportCompact ? 'none' : `1px solid ${t.border}`,
          boxShadow: t.shadow,
          width: viewportCompact ? '100%' : 'min(480px, 100%)',
          maxHeight: viewportCompact ? '90dvh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '12px 14px', borderBottom: `1px solid ${t.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-title)' }}>
              Bitácora del día
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
              {String(fecha || '').split('-').reverse().join('/')}
              {diarios.length > 0
                ? ` · ${diarios.length} tramo${diarios.length === 1 ? '' : 's'} con reporte`
                : ' · sin reportes aún'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnGhost}>Cerrar</button>
        </div>

        <div style={{ padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{
              background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
              borderRadius: 8, padding: '8px 10px', fontSize: 'var(--cc-xs)',
            }}>{error}</div>
          )}

          <div>
            <div style={{
              fontWeight: 800, fontSize: 'var(--cc-xs)', color: t.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
            }}>
              Tramos con bitácora
            </div>
            {busy && !diarios.length ? (
              <div style={{ color: t.textMuted, fontSize: 'var(--cc-sm)' }}>Cargando…</div>
            ) : diarios.length === 0 ? (
              <div style={{
                color: t.textMuted, fontSize: 'var(--cc-sm)',
                border: `1px dashed ${t.border}`, borderRadius: 8, padding: 12,
              }}>
                Ningún tramo tiene Reporte Diario este día.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {diarios.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onAbrirDiario?.(d)}
                      style={{
                        width: '100%', textAlign: 'left',
                        border: `1px solid ${t.border}`, borderRadius: 8,
                        background: t.bg, color: t.text, padding: '10px 12px',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 800, color: t.primary }}>
                        {labelTramoBitacora(d.tramo)}
                      </span>
                      <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                        {[
                          d.estado ? `Estado: ${d.estado}` : null,
                          d.created_by_nombre ? `Elaborado por ${d.created_by_nombre}` : null,
                          Array.isArray(d.eventos) && d.eventos.length
                            ? `${d.eventos.length} evento${d.eventos.length === 1 ? '' : 's'}`
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {puedeCrear && (
            <div style={{
              borderTop: `1px solid ${t.border}`, paddingTop: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{
                fontWeight: 800, fontSize: 'var(--cc-xs)', color: t.textMuted,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Nuevo reporte por tramo
              </div>
              {disponibles.length === 0 ? (
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  {catalogo.length === 0
                    ? 'No hay tramos en el maestro de ubicación PK de este contrato.'
                    : 'Todos los tramos del maestro ya tienen bitácora este día.'}
                </div>
              ) : (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-xs)', color: t.textMuted }}>
                    Tramo
                    <select
                      value={tramoNuevo}
                      onChange={(e) => setTramoNuevo(e.target.value)}
                      style={{
                        padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
                        background: t.inputBg || t.bg, color: t.text, fontSize: 'var(--cc-sm)',
                      }}
                    >
                      {disponibles.map((tr) => (
                        <option key={tr} value={tr}>{tr}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!tramoNuevo}
                    onClick={() => onNuevoDiario?.({ fecha, tramo: tramoNuevo })}
                    style={{ ...btnPrimary, opacity: tramoNuevo ? 1 : 0.5 }}
                  >
                    Crear Reporte Diario
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
