import { useCallback, useEffect, useMemo, useState } from 'react'
import BitacoraEntradaEditor from './BitacoraEntradaEditor'
import { accesoBitacora } from './bitacoraPermisos'
import { labelEventoTipo } from './bitacoraConstants'
import { createSeguimientoApi } from './seguimientoApi'
import { htmlToPlainText } from './richTextUtils'

function fmtFecha(iso) {
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Hilo cronológico compartido de Bitácora de Obra (Contratista + Interventoría).
 */
export default function BitacoraPanel({
  t,
  usuario,
  token,
  contratoId,
  refreshKey = 0,
}) {
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = useMemo(() => accesoBitacora(usuario, cid), [usuario, cid])
  const api = useMemo(() => createSeguimientoApi(cid, token), [cid, token])

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState({ tipo: '', fecha_desde: '', fecha_hasta: '', q: '' })
  const [editor, setEditor] = useState(null) // { modo, entrada }

  const load = useCallback(async () => {
    if (!cid || !token || !permisos.ver) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = {}
      Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v })
      const data = await api.listBitacora(params)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Error al cargar la bitácora')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api, cid, token, permisos.ver, filtros])

  useEffect(() => { void load() }, [load, refreshKey])

  if (!permisos.ver) {
    return (
      <div style={{
        padding: 20, borderRadius: 12, border: `1px solid ${t.border}`,
        background: t.bgCard, color: t.textMuted, fontSize: 'var(--cc-body)',
      }}>
        No tiene permiso para ver la Bitácora de Obra. Solicite el permiso «Ver» en Control de accesos.
      </div>
    )
  }

  const inp = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: '8px 10px', fontSize: 'var(--cc-sm)',
  }
  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }
  const btnGhost = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 14,
      }}>
        <div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-title)' }}>
            Bitácora de Obra
          </div>
          <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, maxWidth: 560 }}>
            Registro cronológico único y compartido por contrato entre Contratista e Interventoría.
            Reporte Diario (uno por fecha) y Reportes de Evento.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {permisos.crear && (
            <>
              <button
                type="button"
                style={btnPrimary}
                onClick={() => setEditor({ modo: 'diario', entrada: null })}
              >
                + Reporte Diario
              </button>
              <button
                type="button"
                style={btnGhost}
                onClick={() => setEditor({ modo: 'evento', entrada: null })}
              >
                + Reporte de Evento
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'flex-end',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Tipo
          <select
            value={filtros.tipo}
            onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
            style={inp}
          >
            <option value="">Todos</option>
            <option value="diario">Reporte Diario</option>
            <option value="evento">Reporte de Evento</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Desde
          <input
            type="date"
            value={filtros.fecha_desde}
            onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))}
            style={inp}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)', color: t.textMuted }}>
          Hasta
          <input
            type="date"
            value={filtros.fecha_hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))}
            style={inp}
          />
        </label>
        <label style={{
          display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)',
          color: t.textMuted, flex: '1 1 180px',
        }}>
          Buscar
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') void load() }}
            placeholder="Texto, autor…"
            style={{ ...inp, width: '100%' }}
          />
        </label>
        <button type="button" onClick={() => void load()} style={btnGhost}>Buscar</button>
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: '8px 10px', borderRadius: 8,
          background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
          fontSize: 'var(--cc-sm)',
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted, padding: 20 }}>Cargando bitácora…</div>
      ) : rows.length === 0 ? (
        <div style={{
          padding: 28, textAlign: 'center', color: t.textMuted,
          border: `1px dashed ${t.border}`, borderRadius: 12, background: t.bg,
        }}>
          Aún no hay entradas en la bitácora de este contrato.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => {
            const esDiario = row.tipo === 'diario'
            const cerrado = String(row.estado || '') === 'cerrado' || !esDiario
            const preview = htmlToPlainText(row.cuerpo_html || '').slice(0, 160)
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setEditor({ modo: 'ver', entrada: row })}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${t.border}`, borderRadius: 12,
                  padding: '12px 14px', background: t.bgCard,
                  display: 'grid', gap: 6,
                }}
              >
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8,
                  alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 'var(--cc-sm)', fontWeight: 800,
                      padding: '3px 8px', borderRadius: 999,
                      background: esDiario ? '#ECFDF5' : '#EFF6FF',
                      color: esDiario ? '#065F46' : '#1E40AF',
                    }}>
                      {esDiario ? 'Reporte Diario' : labelEventoTipo(row.evento_tipo)}
                    </span>
                    <span style={{ fontWeight: 700, color: t.text }}>{fmtFecha(row.fecha)}</span>
                    {esDiario && (
                      <span style={{
                        fontSize: 'var(--cc-sm)',
                        color: cerrado ? '#92400E' : '#047857',
                        fontWeight: 600,
                      }}>
                        {cerrado
                          ? (row.cierre_motivo === 'automatico_dia'
                            ? 'Cerrado (auto · cambio de día)'
                            : 'Cerrado')
                          : 'Abierto'}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                    {row.created_by_nombre || '—'}
                    {row.created_by_rol ? ` · ${row.created_by_rol}` : ''}
                  </span>
                </div>
                {esDiario && (row.clima_descripcion || row.clima_temp_c != null) && (
                  <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                    Clima: {row.clima_descripcion || '—'}
                    {row.clima_temp_c != null ? ` · ${row.clima_temp_c}°C` : ''}
                    {row.clima_editado_manual ? ' (editado)' : ''}
                  </div>
                )}
                {preview && (
                  <div style={{
                    fontSize: 'var(--cc-sm)', color: t.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {preview}
                  </div>
                )}
                <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
                  {(row.imagenes || []).length} foto(s)
                  {esDiario && Array.isArray(row.equipos_uso)
                    ? ` · ${row.equipos_uso.length} equipo(s)`
                    : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editor && (
        <BitacoraEntradaEditor
          t={t}
          api={api}
          usuario={usuario}
          token={token}
          contratoId={cid}
          permisos={permisos}
          modo={editor.modo}
          entrada={editor.entrada}
          onClose={() => setEditor(null)}
          onSaved={() => { void load() }}
        />
      )}
    </div>
  )
}
