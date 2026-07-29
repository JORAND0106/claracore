import { useEffect, useMemo, useState } from 'react'
import { createSeguimientoApi } from '../../modules/seguimiento/seguimientoApi'
import { accesoSeguimiento } from '../../modules/seguimiento/seguimientoPermisos'
import { ESTADOS, ORIGEN_COLOR, fmtFecha, fmtFechaHora } from '../../modules/seguimiento/seguimientoTheme'
import ItemDetalleModal from '../../modules/seguimiento/ItemDetalleModal'
import BandejaResumenLinea from '../../modules/seguimiento/BandejaResumenLinea'
import { useSeguimientoCompact } from '../../modules/seguimiento/seguimientoShared'
import VencimientoIcon from '../../modules/seguimiento/VencimientoIcon'
import { destinatarioLabel } from '../../modules/seguimiento/tareaAsignaciones'
import { calcularAvanceTarea, labelAvance } from '../../modules/seguimiento/tareaAvance'
import {
  fechaVencimientoEfectiva,
  nivelVencimientoItem,
  origenRemitenteLabel,
  resumenVencimientoBandeja,
  sortByProximidadVencimiento,
  tipoLaborLabel,
  truncateTema,
} from '../../modules/seguimiento/vencimientoLevels'

/**
 * Widget de inicio: resumen de una línea colapsado por defecto;
 * al expandir, misma grilla que la bandeja (filtrada por contrato activo).
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
  const [abierto, setAbierto] = useState(false)

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
  const resumen = useMemo(() => resumenVencimientoBandeja(sorted), [sorted])
  const uid = usuario?.id
  const viewportCompact = useSeguimientoCompact()

  if (!permisos.ver || cid == null || cid === '') return null

  const smSize = fs?.sm || 'var(--cc-sm)'

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      boxShadow: t.shadow,
      overflow: 'hidden',
    }}>
      <BandejaResumenLinea
        t={t}
        resumen={resumen}
        abierto={abierto}
        onToggle={() => setAbierto((v) => !v)}
        titulo="Seguimiento"
        subtitulo={permisos.esGerencial ? '(equipo)' : null}
        loading={loading}
        emptyLabel="Sin pendientes"
      />

      {abierto && (
        <div style={{ padding: '0 14px 14px' }}>
          {loading ? (
            <div style={{ fontSize: 'var(--cc-body)', color: t.textMuted }}>Cargando…</div>
          ) : sorted.length === 0 ? (
            <div style={{ fontSize: 'var(--cc-body)', color: t.textMuted }}>Sin pendientes.</div>
          ) : (
            <div className={viewportCompact ? 'cc-seguim-table-scroll cc-seguim-bandeja--compact' : 'cc-seguim-table-scroll'} style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 10 }}>
              <table className="cc-seguim-table" style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: smSize, minWidth: viewportCompact ? 0 : 860,
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
                    const dest = destinatarioLabel(r)
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
                        <td data-label="#" style={td}>{r.consecutivo ?? r.id}</td>
                        <td data-label="Creación" style={td}>{fmtFecha(r.created_at)}</td>
                        <td data-label="Vencimiento" style={td}>{fmtFechaHora(due.fecha || r.fecha_vencimiento, due.hora || r.hora_vencimiento)}</td>
                        <td data-label="Nivel" style={td}><VencimientoIcon nivel={nivel} t={t} /></td>
                        <td
                          data-label="Estado / avance"
                          style={{
                          ...td,
                          fontWeight: 700,
                          color: (r.origen === 'tarea' ? avance?.pct === 100 : r.estado_gestion === 'cumplido')
                            ? 'var(--cc-color-positive,#0f766e)'
                            : t.text,
                        }}
                        >
                          {estadoLabel}
                        </td>
                        <td data-label="Tema" style={{ ...td, fontWeight: 600, color: t.text, maxWidth: 180 }}>
                          <span style={{ color: o.border, fontSize: 'var(--cc-xs)', marginRight: 6 }}>{o.label}</span>
                          <span className="cc-seguim-tema-trunc" title={r.titulo || ''}>
                            {truncateTema(r.titulo)}
                          </span>
                        </td>
                        <td data-label="Destinatario" style={td}>{dest}</td>
                        <td data-label="Origen / remitente" style={td}>{origenRemitenteLabel(r, uid)}</td>
                        <td data-label="Tipo de labor" style={td}>{tipoLaborLabel(r, uid)}</td>
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
