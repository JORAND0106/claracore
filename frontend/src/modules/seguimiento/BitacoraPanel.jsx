import { useCallback, useEffect, useMemo, useState } from 'react'
import BitacoraEntradaEditor from './BitacoraEntradaEditor'
import { accesoBitacora } from './bitacoraPermisos'
import { eventoTieneDestinatario, labelEventoTipo } from './bitacoraConstants'
import { bitacoraSheetStyles } from './bitacoraSheetStyles'
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
 * Hilo cronológico Bitácora: diarios + grilla Excel de eventos.
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
  const ui = bitacoraSheetStyles(t)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState({ tipo: '', fecha_desde: '', fecha_hasta: '', q: '' })
  const [editor, setEditor] = useState(null)

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

  const diarios = useMemo(() => rows.filter((r) => r.tipo === 'diario'), [rows])
  const eventos = useMemo(() => rows.filter((r) => r.tipo === 'evento'), [rows])

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
    borderRadius: 6, padding: '7px 10px', fontSize: 'var(--cc-sm)',
  }
  const btnPrimary = {
    background: t.primary, color: '#fff', border: 'none', borderRadius: 6,
    padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--cc-sm)',
  }
  const btnGhost = {
    background: t.bg, color: t.text, border: `1px solid ${t.border}`,
    borderRadius: 6, padding: '7px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cc-sm)',
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
            Registro cronológico compartido · Reportes Diarios y de Evento
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {permisos.crear && (
            <>
              <button type="button" style={btnPrimary} onClick={() => setEditor({ modo: 'diario', entrada: null })}>
                + Reporte Diario
              </button>
              <button type="button" style={btnGhost} onClick={() => setEditor({ modo: 'evento', entrada: null })}>
                + Reporte de Evento
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'flex-end',
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: t.textMuted }}>
          Tipo
          <select value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))} style={inp}>
            <option value="">Todos</option>
            <option value="diario">Reporte Diario</option>
            <option value="evento">Reporte de Evento</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: t.textMuted }}>
          Desde
          <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((f) => ({ ...f, fecha_desde: e.target.value }))} style={inp} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: t.textMuted }}>
          Hasta
          <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((f) => ({ ...f, fecha_hasta: e.target.value }))} style={inp} />
        </label>
        <label style={{
          display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11,
          color: t.textMuted, flex: '1 1 160px',
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
          marginBottom: 12, padding: '8px 10px', borderRadius: 6,
          background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', fontSize: 12,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: t.textMuted, padding: 20 }}>Cargando bitácora…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Reportes Diarios */}
          {(filtros.tipo === '' || filtros.tipo === 'diario') && (
            <section>
              <div style={{ ...ui.sectionTitle, marginBottom: 8 }}>Reportes Diarios</div>
              {diarios.length === 0 ? (
                <div style={{
                  padding: 16, textAlign: 'center', color: t.textMuted, fontSize: 13,
                  border: `1px dashed ${t.border}`, borderRadius: 6,
                }}>
                  Sin reportes diarios en el rango.
                </div>
              ) : (
                <div style={ui.sheetWrap}>
                  <table style={ui.sheetTable}>
                    <thead>
                      <tr>
                        <th style={{ ...ui.th, width: '16%' }}>Fecha</th>
                        <th style={{ ...ui.th, width: '10%' }}>Hora</th>
                        <th style={{ ...ui.th, width: '14%' }}>Estado</th>
                        <th style={{ ...ui.th, width: '22%' }}>Clima</th>
                        <th style={{ ...ui.th, width: '22%' }}>Autor</th>
                        <th style={{ ...ui.th, width: '8%', textAlign: 'center' }}>Fotos</th>
                        <th style={{ ...ui.th, width: '8%', textAlign: 'center' }}>📎</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diarios.map((row) => {
                        const cerrado = String(row.estado || '') === 'cerrado'
                        return (
                          <tr
                            key={row.id}
                            onClick={() => setEditor({ modo: 'ver', entrada: row })}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = `${t.primary || '#2563eb'}12` }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={ui.td}>{fmtFecha(row.fecha)}</td>
                            <td style={{ ...ui.td, fontVariantNumeric: 'tabular-nums' }}>
                              {String(row.hora_inicio_labores || '').slice(0, 5) || '—'}
                            </td>
                            <td style={ui.td}>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: cerrado ? '#92400E' : '#047857',
                              }}>
                                {cerrado
                                  ? (row.cierre_motivo === 'automatico_dia' ? 'Cerrado (auto)' : 'Cerrado')
                                  : 'Abierto'}
                              </span>
                            </td>
                            <td style={ui.td}>
                              {[row.clima_descripcion, row.clima_temp_c != null ? `${row.clima_temp_c}°C` : '']
                                .filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td style={ui.td}>
                              {row.created_by_nombre || '—'}
                              {row.created_by_rol ? ` · ${row.created_by_rol}` : ''}
                            </td>
                            <td style={{ ...ui.td, textAlign: 'center' }}>{(row.imagenes || []).length}</td>
                            <td style={{ ...ui.td, textAlign: 'center' }}>
                              {(row.imagenes || []).length > 0 ? '📎' : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Reportes de Evento — grilla Excel */}
          {(filtros.tipo === '' || filtros.tipo === 'evento') && (
            <section>
              <div style={{ ...ui.sectionTitle, marginBottom: 8 }}>Reportes de Evento</div>
              {eventos.length === 0 ? (
                <div style={{
                  padding: 16, textAlign: 'center', color: t.textMuted, fontSize: 13,
                  border: `1px dashed ${t.border}`, borderRadius: 6,
                }}>
                  Sin reportes de evento en el rango.
                </div>
              ) : (
                <div style={ui.sheetWrap}>
                  <table style={ui.sheetTable}>
                    <thead>
                      <tr>
                        <th style={{ ...ui.th, width: '12%' }}>Fecha</th>
                        <th style={{ ...ui.th, width: '22%' }}>Tipo de reporte</th>
                        <th style={{ ...ui.th, width: '36%' }}>Descripción</th>
                        <th style={{ ...ui.th, width: '20%' }}>A quién se dirige</th>
                        <th style={{ ...ui.th, width: '10%', textAlign: 'center' }}>📎</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventos.map((row) => {
                        const desc = htmlToPlainText(row.cuerpo_html || '').slice(0, 120)
                        const nAdj = (row.imagenes || []).length
                        const showDest = eventoTieneDestinatario(row.evento_tipo)
                        return (
                          <tr
                            key={row.id}
                            onClick={() => setEditor({ modo: 'ver', entrada: row })}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = `${t.primary || '#2563eb'}12` }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={ui.td}>{fmtFecha(row.fecha)}</td>
                            <td style={{ ...ui.td, fontWeight: 700 }}>{labelEventoTipo(row.evento_tipo)}</td>
                            <td style={ui.td}>
                              <span style={{
                                display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {desc || '—'}
                              </span>
                            </td>
                            <td style={ui.td}>
                              {showDest ? (row.dirigido_a || '—') : '—'}
                            </td>
                            <td style={{ ...ui.td, textAlign: 'center', color: nAdj ? (t.primary || '#2563eb') : t.textMuted }}>
                              {nAdj > 0 ? `📎 ${nAdj}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
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
