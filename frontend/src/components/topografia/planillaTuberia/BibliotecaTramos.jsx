/**
 * Biblioteca de tramos — listado de planillas de tubería del contrato
 * (borradores y definitivas). Abrir lleva a Planillas de Tubería.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  puede,
  useTopoTheme,
  useTopoViewport,
  useTopografiaApi,
} from '../topografiaShared'

export default function BibliotecaTramos({
  contratoId,
  token,
  permisos,
  onAbrirPlanilla,
}) {
  const ui = useTopoTheme()
  const { isCompact } = useTopoViewport()
  const { api } = useTopografiaApi(contratoId, token)
  const [lista, setLista] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const puedeVer = puede(permisos, 'ver') || puede(permisos, 'editar') || puede(permisos, 'crear')

  const cargar = useCallback(async () => {
    setBusy(true)
    setErr('')
    try {
      const data = await api('/planillas-tuberia')
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      setLista([])
      setErr(e.message || 'No se pudo cargar la biblioteca de tramos.')
    } finally {
      setBusy(false)
    }
  }, [api])

  useEffect(() => {
    if (!contratoId || !puedeVer) return
    void cargar()
  }, [contratoId, puedeVer, cargar])

  const cardPad = isCompact ? { ...ui.card, padding: 12 } : ui.card

  if (!puedeVer) {
    return (
      <div style={{ ...cardPad, color: ui.textMuted }}>
        No tiene permiso para ver la biblioteca de tramos.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ ...cardPad, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: isCompact ? 'var(--cc-base)' : undefined }}>
          Biblioteca de tramos
        </strong>
        <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
          Borradores y planillas definitivas del contrato
        </span>
        <button
          type="button"
          className="cc-topo-touch-btn"
          style={ui.btnSecondary}
          disabled={busy}
          onClick={() => void cargar()}
          title="Actualizar listado"
        >
          Actualizar
        </button>
      </div>

      {err && (
        <div style={{ color: '#dc2626', padding: 8, background: '#fef2f2', borderRadius: 8 }}>
          {err}
        </div>
      )}

      <div style={{ ...cardPad, minWidth: 0 }}>
        {busy && !lista.length ? (
          <div style={{ color: ui.textMuted }}>Cargando…</div>
        ) : null}
        {!busy && !lista.length ? (
          <div style={{ color: ui.textMuted }}>
            Sin planillas aún. Cree una desde «Planillas de Tubería».
          </div>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isCompact ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 8,
          }}
        >
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cc-topo-touch-btn"
              onClick={() => onAbrirPlanilla?.(p.id)}
              title={`Abrir «${p.nombre || p.tipo}» en Planillas de Tubería`}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: isCompact ? '12px 14px' : '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `1px solid ${ui.t?.border || '#e2e8f0'}`,
                background: '#fff',
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontWeight: 600 }}>{p.nombre || p.tipo}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 2 }}>
                {p.tipo} · {p.estado} · {p.pk_id || 'sin PK'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
