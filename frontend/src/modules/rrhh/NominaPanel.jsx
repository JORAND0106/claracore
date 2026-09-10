import { useCallback, useEffect, useState } from 'react'
import { fmtSalario, nombreCompleto } from './rrhhHelpers'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const TIPOS_NOV = [
  { value: 'ausencia', label: 'Ausencia' },
  { value: 'incapacidad', label: 'Incapacidad' },
  { value: 'licencia', label: 'Licencia' },
]

const TIPOS_HE = [
  { value: 'extra_diurna', label: 'Extra diurna' },
  { value: 'extra_nocturna', label: 'Extra nocturna' },
  { value: 'recargo_nocturno', label: 'Recargo nocturno' },
  { value: 'dominical_diurna', label: 'Dominical/festivo diurno' },
  { value: 'dominical_nocturna', label: 'Dominical/festivo nocturno' },
  { value: 'extra_dominical_diurna', label: 'Extra dominical diurna' },
  { value: 'extra_dominical_nocturna', label: 'Extra dominical nocturna' },
  { value: 'bonificacion', label: 'Bonificación' },
]

const now = new Date()

/**
 * Panel Nómina — generación por periodo, novedades, horas extras, cierre + xlsx.
 */
export default function NominaPanel({
  api,
  permisos,
  trabajadores = [],
  S,
  tTok,
  sheetUi,
  flash,
}) {
  const [nominas, setNominas] = useState([])
  const [detalle, setDetalle] = useState(null) // { nomina, items }
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [genForm, setGenForm] = useState({
    periodicidad: 'mensual',
    anio: now.getFullYear(),
    mes: now.getMonth() + 1,
    quincena: 1,
  })

  const [tabSec, setTabSec] = useState('nominas') // nominas | novedades | extras
  const [novedades, setNovedades] = useState([])
  const [horas, setHoras] = useState([])
  const [novForm, setNovForm] = useState({
    trabajador_id: '',
    tipo: 'ausencia',
    fecha_inicio: '',
    fecha_fin: '',
    porcentaje_pago: 0,
    notas: '',
  })
  const [heForm, setHeForm] = useState({
    trabajador_id: '',
    tipo: 'extra_diurna',
    fecha: '',
    cantidad_horas: '',
    valor_fijo: '',
    notas: '',
  })

  const [activosList, setActivosList] = useState([])

  const cargarTrabajadores = useCallback(async () => {
    if (!api) return
    try {
      const r = await api.listTrabajadores({ estado: 'activo' })
      setActivosList(r?.items || [])
    } catch {
      setActivosList(trabajadores.filter((t) => t.estado === 'activo'))
    }
  }, [api, trabajadores])

  const activos = activosList.length ? activosList : (trabajadores || []).filter((t) => t.estado === 'activo')

  const cargarNominas = useCallback(async () => {
    if (!api) return
    setLoading(true)
    try {
      const r = await api.listNominas()
      setNominas(r?.items || [])
    } catch (e) {
      flash?.('error', e.message || 'No se pudieron cargar las nóminas.')
    } finally {
      setLoading(false)
    }
  }, [api, flash])

  const cargarNovedades = useCallback(async () => {
    if (!api) return
    try {
      const r = await api.listNovedades()
      setNovedades(r?.items || [])
    } catch (e) {
      flash?.('error', e.message || 'No se pudieron cargar novedades.')
    }
  }, [api, flash])

  const cargarHoras = useCallback(async () => {
    if (!api) return
    try {
      const r = await api.listHorasExtras()
      setHoras(r?.items || [])
    } catch (e) {
      flash?.('error', e.message || 'No se pudieron cargar horas extras.')
    }
  }, [api, flash])

  useEffect(() => {
    cargarNominas()
    cargarTrabajadores()
  }, [cargarNominas, cargarTrabajadores])

  useEffect(() => {
    if (tabSec === 'novedades') cargarNovedades()
    if (tabSec === 'extras') cargarHoras()
  }, [tabSec, cargarNovedades, cargarHoras])

  const abrirNomina = async (id) => {
    if (!api) return
    setBusy(true)
    try {
      const r = await api.getNomina(id)
      setDetalle(r)
    } catch (e) {
      flash?.('error', e.message || 'No se pudo abrir la nómina.')
    } finally {
      setBusy(false)
    }
  }

  const generar = async () => {
    if (!api || !permisos.crear) return
    setBusy(true)
    try {
      const body = {
        periodicidad: genForm.periodicidad,
        anio: Number(genForm.anio),
        mes: Number(genForm.mes),
        quincena: genForm.periodicidad === 'quincenal' ? Number(genForm.quincena) : null,
      }
      const r = await api.generarNomina(body)
      flash?.('success', 'Nómina generada en borrador.')
      setDetalle(r)
      await cargarNominas()
    } catch (e) {
      flash?.('error', e.message || 'No se pudo generar la nómina.')
    } finally {
      setBusy(false)
    }
  }

  const regenerar = async () => {
    if (!api || !detalle?.nomina?.id || !permisos.editar) return
    setBusy(true)
    try {
      const r = await api.regenerarNomina(detalle.nomina.id)
      setDetalle(r)
      flash?.('success', 'Nómina recalculada.')
    } catch (e) {
      flash?.('error', e.message || 'No se pudo regenerar.')
    } finally {
      setBusy(false)
    }
  }

  const cerrar = async () => {
    if (!api || !detalle?.nomina?.id || !permisos.editar) return
    if (!window.confirm(
      '¿Cerrar y aprobar esta nómina? Se generarán desprendibles PDF, se enviarán por correo y se creará el archivo Excel.'
    )) return
    setBusy(true)
    try {
      const r = await api.cerrarNomina(detalle.nomina.id)
      setDetalle(r)
      flash?.('success', 'Nómina cerrada. Desprendibles enviados y Excel disponible.')
      await cargarNominas()
    } catch (e) {
      flash?.('error', e.message || 'No se pudo cerrar la nómina.')
    } finally {
      setBusy(false)
    }
  }

  const descargarXlsx = async () => {
    if (!api || !detalle?.nomina?.id) return
    try {
      await api.downloadBlob(
        api.nominaXlsxUrl(detalle.nomina.id),
        detalle.nomina.xlsx_nombre || `nomina_${detalle.nomina.id}.xlsx`,
      )
    } catch (e) {
      flash?.('error', e.message || 'No se pudo descargar el Excel.')
    }
  }

  const crearNovedad = async () => {
    if (!api || !permisos.crear) return
    if (!novForm.trabajador_id || !novForm.fecha_inicio || !novForm.fecha_fin) {
      flash?.('error', 'Complete colaborador y fechas.')
      return
    }
    setBusy(true)
    try {
      await api.createNovedad({
        ...novForm,
        trabajador_id: Number(novForm.trabajador_id),
        porcentaje_pago: Number(novForm.porcentaje_pago) || 0,
      })
      flash?.('success', 'Novedad registrada.')
      setNovForm({
        trabajador_id: '',
        tipo: 'ausencia',
        fecha_inicio: '',
        fecha_fin: '',
        porcentaje_pago: 0,
        notas: '',
      })
      await cargarNovedades()
    } catch (e) {
      flash?.('error', e.message || 'No se pudo registrar la novedad.')
    } finally {
      setBusy(false)
    }
  }

  const crearHora = async () => {
    if (!api || !permisos.crear) return
    if (!heForm.trabajador_id || !heForm.fecha) {
      flash?.('error', 'Complete colaborador y fecha.')
      return
    }
    setBusy(true)
    try {
      const body = {
        trabajador_id: Number(heForm.trabajador_id),
        tipo: heForm.tipo,
        fecha: heForm.fecha,
        cantidad_horas: Number(heForm.cantidad_horas) || 0,
        valor_fijo: heForm.tipo === 'bonificacion'
          ? Number(heForm.valor_fijo) || 0
          : (heForm.valor_fijo ? Number(heForm.valor_fijo) : null),
        notas: heForm.notas || null,
      }
      await api.createHoraExtra(body)
      flash?.('success', 'Registro de horas/bonificación creado.')
      setHeForm({
        trabajador_id: '',
        tipo: 'extra_diurna',
        fecha: '',
        cantidad_horas: '',
        valor_fijo: '',
        notas: '',
      })
      await cargarHoras()
    } catch (e) {
      flash?.('error', e.message || 'No se pudo registrar.')
    } finally {
      setBusy(false)
    }
  }

  const nombreTrab = (id) => {
    const t = (trabajadores || []).find((x) => Number(x.id) === Number(id))
    return t ? nombreCompleto(t) : `#${id}`
  }

  const inputStyle = {
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${tTok.border}`,
    background: tTok.inputBg || tTok.bgCard,
    color: tTok.text,
    fontSize: 'var(--cc-sm)',
  }
  const labelStyle = { fontSize: 'var(--cc-xs)', color: tTok.textMuted, marginBottom: 2, display: 'block' }
  const secTabs = [
    { id: 'nominas', label: 'Nóminas' },
    { id: 'novedades', label: 'Novedades' },
    { id: 'extras', label: 'Horas extras / bonificaciones' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {secTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTabSec(t.id)}
            style={{
              ...S.btnGhost,
              fontWeight: tabSec === t.id ? 700 : 500,
              borderBottom: tabSec === t.id ? `2px solid ${tTok.primary || '#0077B6'}` : '2px solid transparent',
              borderRadius: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabSec === 'nominas' && (
        <>
          {permisos.crear && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'flex-end',
              padding: 12,
              background: tTok.bgCard,
              border: `1px solid ${tTok.border}`,
              borderRadius: 10,
            }}>
              <div>
                <span style={labelStyle}>Periodicidad</span>
                <select
                  style={inputStyle}
                  value={genForm.periodicidad}
                  onChange={(e) => setGenForm((f) => ({ ...f, periodicidad: e.target.value }))}
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                </select>
              </div>
              <div>
                <span style={labelStyle}>Año</span>
                <input
                  type="number"
                  style={{ ...inputStyle, width: 90 }}
                  value={genForm.anio}
                  onChange={(e) => setGenForm((f) => ({ ...f, anio: e.target.value }))}
                />
              </div>
              <div>
                <span style={labelStyle}>Mes</span>
                <select
                  style={inputStyle}
                  value={genForm.mes}
                  onChange={(e) => setGenForm((f) => ({ ...f, mes: Number(e.target.value) }))}
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              {genForm.periodicidad === 'quincenal' && (
                <div>
                  <span style={labelStyle}>Quincena</span>
                  <select
                    style={inputStyle}
                    value={genForm.quincena}
                    onChange={(e) => setGenForm((f) => ({ ...f, quincena: Number(e.target.value) }))}
                  >
                    <option value={1}>1ª (1–15)</option>
                    <option value={2}>2ª (16–fin)</option>
                  </select>
                </div>
              )}
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={generar}>
                Generar nómina
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: detalle ? 'minmax(240px, 1fr) 2fr' : '1fr', gap: 12, minHeight: 0, flex: 1 }}>
            <div style={{
              background: tTok.bgCard,
              border: `1px solid ${tTok.border}`,
              borderRadius: 10,
              overflow: 'auto',
              maxHeight: '60vh',
            }}>
              {loading ? (
                <div style={{ padding: 16, color: tTok.textMuted }}>Cargando…</div>
              ) : nominas.length === 0 ? (
                <div style={{ padding: 16, color: tTok.textMuted }}>
                  Aún no hay nóminas. Genere la primera del periodo.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr>
                      <th style={sheetUi.th}>Periodo</th>
                      <th style={sheetUi.th}>Estado</th>
                      <th style={sheetUi.th}>Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nominas.map((n) => (
                      <tr
                        key={n.id}
                        onClick={() => abrirNomina(n.id)}
                        style={{
                          cursor: 'pointer',
                          background: detalle?.nomina?.id === n.id ? 'rgba(0,119,182,0.08)' : undefined,
                        }}
                      >
                        <td style={sheetUi.td}>
                          {n.periodicidad === 'quincenal' ? `Q${n.quincena} ` : ''}
                          {MESES[(n.mes || 1) - 1]} {n.anio}
                        </td>
                        <td style={sheetUi.td}>{n.estado}</td>
                        <td style={{ ...sheetUi.td, textAlign: 'right' }}>{fmtSalario(n.total_neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {detalle && (
              <div style={{
                background: tTok.bgCard,
                border: `1px solid ${tTok.border}`,
                borderRadius: 10,
                padding: 14,
                overflow: 'auto',
                maxHeight: '60vh',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, flex: 1 }}>
                    Nómina {detalle.nomina.periodicidad}
                    {detalle.nomina.quincena ? ` Q${detalle.nomina.quincena}` : ''}{' '}
                    · {detalle.nomina.fecha_inicio} — {detalle.nomina.fecha_fin}
                    <span style={{ marginLeft: 8, fontWeight: 500, color: tTok.textMuted }}>
                      ({detalle.nomina.estado})
                    </span>
                  </div>
                  {detalle.nomina.estado === 'borrador' && permisos.editar && (
                    <>
                      <button type="button" style={S.btnGhost} disabled={busy} onClick={regenerar}>
                        Recalcular
                      </button>
                      <button type="button" style={S.btnPrimary} disabled={busy} onClick={cerrar}>
                        Cerrar / aprobar
                      </button>
                    </>
                  )}
                  {(detalle.nomina.estado === 'cerrada' || detalle.nomina.xlsx_blob_path) && (
                    <button type="button" style={S.btnPrimary} onClick={descargarXlsx}>
                      Descargar Excel
                    </button>
                  )}
                  {detalle.nomina.estado === 'borrador' && (
                    <button type="button" style={S.btnGhost} onClick={descargarXlsx}>
                      Vista previa Excel
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: 'var(--cc-sm)' }}>
                  <span>Devengado: <b>{fmtSalario(detalle.nomina.total_devengado)}</b></span>
                  <span>Deducciones: <b>{fmtSalario(detalle.nomina.total_deducciones)}</b></span>
                  <span>Neto: <b>{fmtSalario(detalle.nomina.total_neto)}</b></span>
                  <span>Aportes patronales: <b>{fmtSalario(detalle.nomina.total_aportes_patronales)}</b></span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr>
                      <th style={sheetUi.th}>Colaborador</th>
                      <th style={sheetUi.th}>Devengado</th>
                      <th style={sheetUi.th}>Deducciones</th>
                      <th style={sheetUi.th}>Neto</th>
                      <th style={sheetUi.th}>Email</th>
                      <th style={sheetUi.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {(detalle.items || []).map((it) => {
                      const det = it.detalle_json || {}
                      return (
                        <tr key={it.id}>
                          <td style={sheetUi.td}>{det.nombre || nombreTrab(it.trabajador_id)}</td>
                          <td style={{ ...sheetUi.td, textAlign: 'right' }}>{fmtSalario(it.total_devengado)}</td>
                          <td style={{ ...sheetUi.td, textAlign: 'right' }}>{fmtSalario(it.total_deducciones)}</td>
                          <td style={{ ...sheetUi.td, textAlign: 'right' }}>{fmtSalario(it.neto_pagar)}</td>
                          <td style={sheetUi.td}>{it.email_estado || '—'}</td>
                          <td style={sheetUi.td}>
                            {it.desprendible_blob_path && (
                              <button
                                type="button"
                                style={S.btnGhost}
                                onClick={() => api.downloadBlob(
                                  api.desprendibleUrl(detalle.nomina.id, it.id),
                                  it.desprendible_nombre || 'desprendible.pdf',
                                )}
                              >
                                PDF
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tabSec === 'novedades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {permisos.crear && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
              padding: 12, background: tTok.bgCard, border: `1px solid ${tTok.border}`, borderRadius: 10,
            }}>
              <div>
                <span style={labelStyle}>Colaborador</span>
                <select
                  style={{ ...inputStyle, minWidth: 180 }}
                  value={novForm.trabajador_id}
                  onChange={(e) => setNovForm((f) => ({ ...f, trabajador_id: e.target.value }))}
                >
                  <option value="">Seleccione…</option>
                  {activos.map((t) => (
                    <option key={t.id} value={t.id}>{nombreCompleto(t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={labelStyle}>Tipo</span>
                <select
                  style={inputStyle}
                  value={novForm.tipo}
                  onChange={(e) => setNovForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {TIPOS_NOV.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <span style={labelStyle}>Desde</span>
                <input type="date" style={inputStyle} value={novForm.fecha_inicio}
                  onChange={(e) => setNovForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Hasta</span>
                <input type="date" style={inputStyle} value={novForm.fecha_fin}
                  onChange={(e) => setNovForm((f) => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>% pago</span>
                <input type="number" style={{ ...inputStyle, width: 70 }} value={novForm.porcentaje_pago}
                  onChange={(e) => setNovForm((f) => ({ ...f, porcentaje_pago: e.target.value }))} />
              </div>
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={crearNovedad}>
                Agregar
              </button>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', background: tTok.bgCard }}>
            <thead>
              <tr>
                <th style={sheetUi.th}>Colaborador</th>
                <th style={sheetUi.th}>Tipo</th>
                <th style={sheetUi.th}>Fechas</th>
                <th style={sheetUi.th}>Días</th>
                <th style={sheetUi.th}>% pago</th>
                <th style={sheetUi.th} />
              </tr>
            </thead>
            <tbody>
              {novedades.map((n) => (
                <tr key={n.id}>
                  <td style={sheetUi.td}>{nombreTrab(n.trabajador_id)}</td>
                  <td style={sheetUi.td}>{n.tipo}</td>
                  <td style={sheetUi.td}>{n.fecha_inicio} — {n.fecha_fin}</td>
                  <td style={sheetUi.td}>{n.dias}</td>
                  <td style={sheetUi.td}>{n.porcentaje_pago}%</td>
                  <td style={sheetUi.td}>
                    {permisos.eliminar && (
                      <button
                        type="button"
                        style={S.btnGhost}
                        onClick={async () => {
                          await api.deleteNovedad(n.id)
                          await cargarNovedades()
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {novedades.length === 0 && (
                <tr><td colSpan={6} style={{ ...sheetUi.td, color: tTok.textMuted }}>Sin novedades registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tabSec === 'extras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {permisos.crear && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
              padding: 12, background: tTok.bgCard, border: `1px solid ${tTok.border}`, borderRadius: 10,
            }}>
              <div>
                <span style={labelStyle}>Colaborador</span>
                <select
                  style={{ ...inputStyle, minWidth: 180 }}
                  value={heForm.trabajador_id}
                  onChange={(e) => setHeForm((f) => ({ ...f, trabajador_id: e.target.value }))}
                >
                  <option value="">Seleccione…</option>
                  {activos.map((t) => (
                    <option key={t.id} value={t.id}>{nombreCompleto(t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={labelStyle}>Tipo</span>
                <select
                  style={inputStyle}
                  value={heForm.tipo}
                  onChange={(e) => setHeForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {TIPOS_HE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <span style={labelStyle}>Fecha</span>
                <input type="date" style={inputStyle} value={heForm.fecha}
                  onChange={(e) => setHeForm((f) => ({ ...f, fecha: e.target.value }))} />
              </div>
              {heForm.tipo === 'bonificacion' ? (
                <div>
                  <span style={labelStyle}>Valor</span>
                  <input type="number" style={{ ...inputStyle, width: 110 }} value={heForm.valor_fijo}
                    onChange={(e) => setHeForm((f) => ({ ...f, valor_fijo: e.target.value }))} />
                </div>
              ) : (
                <div>
                  <span style={labelStyle}>Horas</span>
                  <input type="number" style={{ ...inputStyle, width: 80 }} value={heForm.cantidad_horas}
                    onChange={(e) => setHeForm((f) => ({ ...f, cantidad_horas: e.target.value }))} />
                </div>
              )}
              <button type="button" style={S.btnPrimary} disabled={busy} onClick={crearHora}>
                Agregar
              </button>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)', background: tTok.bgCard }}>
            <thead>
              <tr>
                <th style={sheetUi.th}>Colaborador</th>
                <th style={sheetUi.th}>Tipo</th>
                <th style={sheetUi.th}>Fecha</th>
                <th style={sheetUi.th}>Horas / valor</th>
                <th style={sheetUi.th} />
              </tr>
            </thead>
            <tbody>
              {horas.map((h) => (
                <tr key={h.id}>
                  <td style={sheetUi.td}>{nombreTrab(h.trabajador_id)}</td>
                  <td style={sheetUi.td}>{h.tipo}</td>
                  <td style={sheetUi.td}>{h.fecha}</td>
                  <td style={sheetUi.td}>
                    {h.tipo === 'bonificacion'
                      ? fmtSalario(h.valor_fijo)
                      : `${h.cantidad_horas} h`}
                  </td>
                  <td style={sheetUi.td}>
                    {permisos.eliminar && (
                      <button
                        type="button"
                        style={S.btnGhost}
                        onClick={async () => {
                          await api.deleteHoraExtra(h.id)
                          await cargarHoras()
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {horas.length === 0 && (
                <tr><td colSpan={5} style={{ ...sheetUi.td, color: tTok.textMuted }}>Sin registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
