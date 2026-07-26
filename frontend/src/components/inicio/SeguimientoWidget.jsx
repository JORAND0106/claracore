import { useEffect, useMemo, useState } from 'react'
import { createSeguimientoApi } from '../../modules/seguimiento/seguimientoApi'
import { accesoSeguimiento } from '../../modules/seguimiento/seguimientoPermisos'
import { ORIGEN_COLOR, fmtFecha } from '../../modules/seguimiento/seguimientoTheme'
import ItemDetalleModal from '../../modules/seguimiento/ItemDetalleModal'
import VencimientoIcon from '../../modules/seguimiento/VencimientoIcon'
import { calcularNivelVencimiento } from '../../modules/seguimiento/vencimientoLevels'

/**
 * Widget de inicio: refleja la misma bandeja unificada (visibilidad por rol incluida).
 * Hereda tema (t) y tipografía (fs / CSS vars --cc-*).
 */
export default function SeguimientoWidget({ t, fs, usuario, token, onIrSeguimiento }) {
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, usuario?.contrato_id),
    [usuario],
  )
  const api = useMemo(
    () => createSeguimientoApi(usuario?.contrato_id, token),
    [usuario?.contrato_id, token],
  )
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalleId, setDetalleId] = useState(null)
  const [abierto, setAbierto] = useState(true)

  useEffect(() => {
    if (!permisos.ver || !token) {
      setLoading(false)
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    api.listWidget()
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, permisos.ver, token])

  if (!permisos.ver) return null

  const titleSize = fs?.novedadTitulo || fs?.titulo || 'var(--cc-title)'
  const bodySize = fs?.base || 'var(--cc-body)'
  const smSize = fs?.sm || 'var(--cc-sm)'

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      boxShadow: t.shadow,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
          color: t.text,
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: titleSize, fontWeight: 700 }}>Seguimiento</div>
          <div style={{ fontSize: smSize, color: t.textMuted }}>
            Compromisos y tareas {permisos.esGerencial ? '(incluye equipo)' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            minWidth: 22, height: 22, borderRadius: 11, padding: '0 6px',
            background: t.primary, color: '#fff', fontSize: smSize, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {rows.length}
          </span>
          <span style={{ color: t.textMuted }}>{abierto ? '▾' : '▸'}</span>
        </div>
      </button>

      {abierto && (
        <div style={{ padding: '0 14px 14px' }}>
          {loading ? (
            <div style={{ fontSize: bodySize, color: t.textMuted }}>Cargando…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: bodySize, color: t.textMuted }}>Sin pendientes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.slice(0, 8).map((r) => {
                const o = ORIGEN_COLOR[r.origen] || ORIGEN_COLOR.tarea
                const nivel = calcularNivelVencimiento({
                  fechaVencimiento: r.fecha_vencimiento,
                  fechaCreacion: r.created_at || r.fecha_vencimiento_original,
                })
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDetalleId(r.id)}
                    style={{
                      textAlign: 'left', cursor: 'pointer',
                      border: `1px solid ${t.border}`,
                      borderLeft: `4px solid ${o.border}`,
                      background: o.bg,
                      borderRadius: 8,
                      padding: '8px 10px',
                      color: t.text,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <VencimientoIcon nivel={nivel} size="1rem" t={t} />
                      <div style={{ fontWeight: 600, fontSize: bodySize, flex: 1 }}>{r.titulo}</div>
                    </div>
                    <div style={{ fontSize: smSize, color: t.textMuted }}>
                      {r.asignado_a_nombre} · {fmtFecha(r.fecha_vencimiento)} · {r.estado_gestion}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {typeof onIrSeguimiento === 'function' && (
            <button
              type="button"
              onClick={onIrSeguimiento}
              style={{
                marginTop: 10, border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '6px 10px', background: 'transparent', color: t.primary,
                fontWeight: 700, fontSize: smSize, cursor: 'pointer',
              }}
            >
              Abrir Seguimiento →
            </button>
          )}
        </div>
      )}

      {detalleId != null && (
        <ItemDetalleModal
          t={t}
          api={api}
          itemId={detalleId}
          usuario={usuario}
          permisos={permisos}
          onClose={() => setDetalleId(null)}
          onChanged={() => {
            api.listWidget().then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => {})
          }}
        />
      )}
    </div>
  )
}
