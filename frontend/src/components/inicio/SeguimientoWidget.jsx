import { useEffect, useMemo, useState } from 'react'
import { createSeguimientoApi } from '../../modules/seguimiento/seguimientoApi'
import { accesoSeguimiento } from '../../modules/seguimiento/seguimientoPermisos'
import { ESTADOS, ORIGEN_COLOR, fmtFecha, fmtFechaHora } from '../../modules/seguimiento/seguimientoTheme'
import ItemDetalleModal from '../../modules/seguimiento/ItemDetalleModal'
import VencimientoIcon from '../../modules/seguimiento/VencimientoIcon'
import { calcularAvanceTarea, labelAvance } from '../../modules/seguimiento/tareaAvance'
import {
  fechaVencimientoEfectiva,
  nivelVencimientoItem,
  origenRemitenteLabel,
  sortByProximidadVencimiento,
  tipoLaborLabel,
} from '../../modules/seguimiento/vencimientoLevels'

/**
 * Widget de inicio: misma grilla de columnas que la bandeja completa,
 * filtrada por el contrato activo.
 */
export default function SeguimientoWidget({ t, fs, usuario, token, contratoId, onIrSeguimiento }) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(
    () => accesoSeguimiento(usuario, cid),
    [usuario, cid],
  )
  const api = useMemo(
    () => createSeguimientoApi(cid, token),
    [cid, token],
  )
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detalleId, setDetalleId] = useState(null)
  const [abierto, setAbierto] = useState(true)

  useEffect(() => {
    if (!permisos.ver || !token || cid == null || cid === '') {
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
  }, [api, permisos.ver, token, cid])

  const sorted = useMemo(() => sortByProximidadVencimiento(rows), [rows])
  const uid = usuario?.id

  if (!permisos.ver || cid == null || cid === '') return null

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
          ) : sorted.length === 0 ? (
            <div style={{ fontSize: bodySize, color: t.textMuted }}>Sin pendientes.</div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: smSize, minWidth: 860,
              }}
              >
                <thead>
                  <tr style={{ background: t.bg || `${t.primary}10`, color: t.textMuted, textAlign: 'left' }}>
                    <th style={th}>#</th>
                    <th style={th}>Creación</th>
                    <th style={th}>Vencimiento</th>
                    <th style={th}>Nivel</th>
                    <th style={th}>Estado / avance</th>
                    <th style={th}>Tema</th>
                    <th style={th}>Destinatario</th>
                    <th style={th}>Origen / remitente</th>
                    <th style={th}>Tipo de labor</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 12).map((r) => {
                    const nivel = nivelVencimientoItem(r)
                    const due = fechaVencimientoEfectiva(r)
                    const o = ORIGEN_COLOR[r.origen] || ORIGEN_COLOR.tarea
                    const dest = r.relacion_destinatario === 'referencia'
                      ? (r.referido_a_nombre || r.asignado_a_nombre || '—')
                      : (r.asignado_a_nombre || '—')
                    const avance = r.origen === 'tarea' ? calcularAvanceTarea(r) : null
                    const estadoLabel = r.origen === 'tarea' && avance?.pct != null
                      ? (avance.pct === 100 ? 'Cumplido' : `${labelAvance(avance)}`)
                      : (ESTADOS.find((x) => x.value === r.estado_gestion)?.label || r.estado_gestion || '—')
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setDetalleId(r.id)}
                        style={{ cursor: 'pointer', borderTop: `1px solid ${t.border}`, background: o.bg }}
                        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.98)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
                      >
                        <td style={td}>{r.consecutivo ?? r.id}</td>
                        <td style={td}>{fmtFecha(r.created_at)}</td>
                        <td style={td}>{fmtFechaHora(due.fecha || r.fecha_vencimiento, due.hora || r.hora_vencimiento)}</td>
                        <td style={td}><VencimientoIcon nivel={nivel} t={t} /></td>
                        <td style={{
                          ...td,
                          fontWeight: 700,
                          color: (r.origen === 'tarea' ? avance?.pct === 100 : r.estado_gestion === 'cumplido')
                            ? 'var(--cc-color-positive,#0f766e)'
                            : t.text,
                        }}
                        >
                          {estadoLabel}
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: t.text, maxWidth: 220 }}>
                          <span style={{ color: o.border, fontSize: 'var(--cc-xs)', marginRight: 6 }}>{o.label}</span>
                          {r.titulo}
                        </td>
                        <td style={td}>{dest}</td>
                        <td style={td}>{origenRemitenteLabel(r, uid)}</td>
                        <td style={td}>{tipoLaborLabel(r, uid)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

const th = { padding: '8px 6px', fontWeight: 700, whiteSpace: 'nowrap' }
const td = { padding: '8px 6px', verticalAlign: 'middle', color: 'inherit' }
