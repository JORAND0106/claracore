import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  esDesarrolladorTopo,
  puede,
  useTopoTheme,
  useTopografiaApi,
} from '../topografiaShared'
import PlanillaTuberiaPerfil from './PlanillaTuberiaPerfil'
import PlanillaTuberiaSeccionSvg from './PlanillaTuberiaSeccionSvg'
import {
  RELACIONES_ATRAQUE,
  TIPOS_PLANILLA,
  confirmarGuardadoCartera,
  filaCampoVacia,
  filasDesdeApi,
  fmtNDash,
  handleEnterAsTab,
  payloadFilas,
} from './planillaTuberiaUtils'

export default function PlanillaTuberiaForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const { api, downloadPdf, downloadExcel } = useTopografiaApi(contratoId, token)
  const esDev = esDesarrolladorTopo(usuario)
  const editablePerm = puede(permisos, 'editar')

  const [lista, setLista] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [filas, setFilas] = useState(() => Array.from({ length: 12 }, (_, i) => filaCampoVacia(i + 1)))
  const [params, setParams] = useState({
    tipo: 'ALCANTARILLA',
    nombre: '',
    pk_id: '',
    costado: '',
    diametro_m: '',
    espesor_m: '0',
    ancho_excavacion_m: '',
    relacion_atraque: '1:3',
    material: '',
    norte_ref: '',
    este_ref: '',
  })
  const [version, setVersion] = useState(1)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [infos, setInfos] = useState([])
  const [busy, setBusy] = useState(false)
  const tableRef = useRef(null)

  const planilla = detalle?.planilla
  const calculo = detalle?.calculo
  const sellada = ['cerrado', 'validado'].includes(String(planilla?.estado || '').toLowerCase())
  const editable = editablePerm && !sellada

  const inputStyle = (readOnly) => ({
    ...(ui.inputStyle || {}),
    width: '100%',
    boxSizing: 'border-box',
    background: readOnly ? '#f1f5f9' : '#fff',
  })

  const cargarLista = useCallback(async () => {
    const data = await api('/planillas-tuberia')
    setLista(Array.isArray(data) ? data : [])
  }, [api])

  useEffect(() => {
    cargarLista().catch((e) => setErr(e.message))
  }, [cargarLista])

  const aplicarDetalle = useCallback((det) => {
    setDetalle(det)
    const p = det?.planilla || {}
    setVersion(p.version || 1)
    setParams({
      tipo: p.tipo || 'ALCANTARILLA',
      nombre: p.nombre || '',
      pk_id: p.pk_id || '',
      costado: p.costado || '',
      diametro_m: p.diametro_m ?? '',
      espesor_m: p.espesor_m ?? '0',
      ancho_excavacion_m: p.ancho_excavacion_m ?? '',
      relacion_atraque: p.relacion_atraque || '1:3',
      material: p.material || '',
      norte_ref: p.norte_ref ?? '',
      este_ref: p.este_ref ?? '',
    })
    setFilas(filasDesdeApi(det?.filas_campo, p.tipo || 'ALCANTARILLA'))
    setInfos(det?.validacion?.infos || [])
  }, [])

  const abrir = async (id) => {
    setErr(''); setMsg(''); setBusy(true)
    try {
      aplicarDetalle(await api(`/planillas-tuberia/${id}`))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const crear = async () => {
    setBusy(true); setErr(''); setMsg('')
    try {
      const det = await api('/planillas-tuberia', {
        method: 'POST',
        body: JSON.stringify({ tipo: params.tipo, nombre: params.nombre || undefined }),
      })
      aplicarDetalle(det)
      await cargarLista()
      setMsg('Planilla creada.')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const guardarParams = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const body = {
        version,
        tipo: params.tipo,
        nombre: params.nombre || null,
        pk_id: params.pk_id || null,
        costado: params.costado || null,
        diametro_m: params.diametro_m === '' ? null : Number(params.diametro_m),
        espesor_m: params.espesor_m === '' ? 0 : Number(params.espesor_m),
        ancho_excavacion_m: params.ancho_excavacion_m === '' ? null : Number(params.ancho_excavacion_m),
        relacion_atraque: params.relacion_atraque,
        material: params.material || null,
        norte_ref: params.norte_ref === '' ? null : Number(params.norte_ref),
        este_ref: params.este_ref === '' ? null : Number(params.este_ref),
      }
      aplicarDetalle(await api(`/planillas-tuberia/${planilla.id}/params`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }))
      setMsg('Parámetros guardados.')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const guardarCartera = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const filasPayload = payloadFilas(filas, params.tipo)
      const res = await api(`/planillas-tuberia/${planilla.id}/cartera`, {
        method: 'PUT',
        body: JSON.stringify({ version, filas: filasPayload, descuentos_manuales: [] }),
      })
      const conf = confirmarGuardadoCartera(res, filasPayload.length)
      if (!conf.ok) {
        setErr(conf.error)
        return
      }
      aplicarDetalle(res)
      setMsg(`Cartera guardada y verificada (${conf.count} filas, v${conf.version}).`)
      await cargarLista()
    } catch (e) {
      setErr(typeof e.message === 'string' ? e.message : JSON.stringify(e.message))
    } finally {
      setBusy(false)
    }
  }

  const cerrar = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      aplicarDetalle(await api(`/planillas-tuberia/${planilla.id}/cerrar`, { method: 'POST' }))
      setMsg('Planilla cerrada. Consolidado generado.')
      await cargarLista()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const reabrir = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      aplicarDetalle(await api(`/planillas-tuberia/${planilla.id}/reabrir`, { method: 'POST' }))
      setMsg('Planilla reabierta (Desarrollador).')
      await cargarLista()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const revocar = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      aplicarDetalle(await api(`/planillas-tuberia/${planilla.id}/revocar-validacion`, { method: 'POST' }))
      setMsg('Validación revocada (Desarrollador).')
      await cargarLista()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const exportarPdf = async () => {
    if (!planilla?.id) return
    try {
      await downloadPdf(
        `/planillas-tuberia/${planilla.id}/pdf`,
        `planilla_tuberia_${String(planilla.id).slice(0, 8)}.pdf`,
      )
    } catch (e) {
      setErr(e.message)
    }
  }

  const exportarExcel = async () => {
    if (!planilla?.id) return
    try {
      await downloadExcel(
        `/planillas-tuberia/${planilla.id}/excel`,
        `planilla_tuberia_${String(planilla.id).slice(0, 8)}.xlsx`,
      )
    } catch (e) {
      setErr(e.message)
    }
  }

  const setFila = (idx, key, value) => {
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)))
  }

  const calcFilas = useMemo(() => {
    const map = new Map((calculo?.cartera?.filas || []).map((f) => [f.orden, f]))
    return filas.map((f, i) => map.get(i + 1) || map.get(f.orden) || {})
  }, [calculo, filas])

  const nivelLabel = params.tipo === 'FILTRO' ? 'Terminado filtro' : 'Subrasante vía'
  const nivelKey = params.tipo === 'FILTRO' ? 'terminado_filtro' : 'subrasante_via'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...ui.card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <strong>Planillas de Tubería</strong>
        <select
          value={params.tipo}
          disabled={!!planilla && !editable}
          onChange={(e) => setParams((p) => ({ ...p, tipo: e.target.value }))}
          style={inputStyle(false)}
        >
          {TIPOS_PLANILLA.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {puede(permisos, 'crear') && (
          <button type="button" style={ui.btnPrimary} disabled={busy} onClick={crear}>
            Nueva planilla
          </button>
        )}
        {planilla && (
          <span style={{ color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
            Estado: <b>{planilla.estado}</b> · v{version}
          </span>
        )}
      </div>

      {err && <div style={{ color: '#dc2626', padding: 8, background: '#fef2f2', borderRadius: 8 }}>{err}</div>}
      {msg && <div style={{ color: '#166534', padding: 8, background: '#f0fdf4', borderRadius: 8 }}>{msg}</div>}
      {infos?.length > 0 && (
        <div style={{ color: '#92400e', padding: 8, background: '#fffbeb', borderRadius: 8, fontSize: 'var(--cc-sm)' }}>
          {infos.map((a, i) => (
            <div key={i} title={a.detalle || ''}>
              ⚠ {a.msg}{a.detalle ? `: ${a.detalle}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 12 }}>
        <div style={{ ...ui.card, maxHeight: 520, overflow: 'auto' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Planillas del contrato</div>
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => abrir(p.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 6,
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                border: planilla?.id === p.id ? `2px solid ${ui.accent}` : `1px solid ${ui.t?.border || '#e2e8f0'}`,
                background: planilla?.id === p.id ? (ui.accentSoft || '#dbeafe') : '#fff',
              }}
            >
              <div style={{ fontWeight: 600 }}>{p.nombre || p.tipo}</div>
              <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                {p.tipo} · {p.estado} · {p.pk_id || 'sin PK'}
              </div>
            </button>
          ))}
          {!lista.length && <div style={{ color: ui.textMuted }}>Sin planillas aún.</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!planilla ? (
            <div style={{ ...ui.card, color: ui.textMuted }}>Seleccione o cree una planilla.</div>
          ) : (
            <>
              <div
                style={{
                  ...ui.card,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
                  gap: 8,
                }}
              >
                {[
                  ['nombre', 'Nombre', 'text'],
                  ['pk_id', 'PK / ID', 'text'],
                  ['costado', 'Costado', 'text'],
                  ['diametro_m', 'Ø (m)', 'number'],
                  ['espesor_m', 'Espesor (m)', 'number'],
                  ['ancho_excavacion_m', 'Ancho exc. B (m)', 'number'],
                  ['material', 'Material', 'text'],
                  ['norte_ref', 'Norte ref.', 'number'],
                  ['este_ref', 'Este ref.', 'number'],
                ].map(([k, lab, typ]) => (
                  <label key={k} style={{ fontSize: 'var(--cc-xs)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {lab}
                    <input
                      type={typ}
                      disabled={!editable}
                      value={params[k]}
                      onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))}
                      style={inputStyle(!editable)}
                    />
                  </label>
                ))}
                <label style={{ fontSize: 'var(--cc-xs)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  Relación atraque
                  <select
                    disabled={!editable}
                    value={params.relacion_atraque}
                    onChange={(e) => setParams((p) => ({ ...p, relacion_atraque: e.target.value }))}
                    style={inputStyle(!editable)}
                  >
                    {RELACIONES_ATRAQUE.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: 'var(--cc-xs)', gridColumn: '1 / -1', color: ui.textMuted }}>
                  H.Relleno={fmtNDash(planilla.altura_relleno_m, 4)} ·
                  A1={fmtNDash(planilla.area_1_m2, 4)} ·
                  A2={fmtNDash(planilla.area_2_m2, 4)}
                  {detalle?.coords_wgs84 && (
                    <> · WGS84 {fmtNDash(detalle.coords_wgs84.lat, 6)}, {fmtNDash(detalle.coords_wgs84.lon, 6)}</>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {editable && (
                    <button type="button" style={ui.btnSecondary} disabled={busy} onClick={guardarParams}>
                      Guardar parámetros
                    </button>
                  )}
                  {editable && (
                    <button type="button" style={ui.btnPrimary} disabled={busy} onClick={guardarCartera}>
                      Guardar cartera
                    </button>
                  )}
                  {editable && (
                    <button type="button" style={ui.btnSecondary} disabled={busy} onClick={cerrar}>
                      Cerrar planilla
                    </button>
                  )}
                  {esDev && sellada && (
                    <button type="button" style={ui.btnSecondary} disabled={busy} onClick={reabrir}>
                      Reabrir (Dev)
                    </button>
                  )}
                  {esDev && String(planilla?.estado || '').toLowerCase() === 'validado' && (
                    <button type="button" style={ui.btnSecondary} disabled={busy} onClick={revocar}>
                      Revocar validación (Dev)
                    </button>
                  )}
                  {puede(permisos, 'exportar') && (
                    <>
                      <button type="button" style={ui.btnSecondary} onClick={exportarPdf}>PDF</button>
                      <button type="button" style={ui.btnSecondary} onClick={exportarExcel}>Excel</button>
                    </>
                  )}
                </div>
              </div>

              <div
                ref={tableRef}
                onKeyDown={(e) => handleEnterAsTab(e, tableRef.current)}
                style={{ ...ui.card, overflow: 'auto' }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Cartera de campo</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                  <thead>
                    <tr style={{ background: ui.t?.inputBg || '#f8fafc' }}>
                      {['#', 'Abscisa', 'TN', nivelLabel, 'CFE', 'H.Exc', 'H.Trit', 'H.Rell', 'Ancho Geo'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: 4,
                            borderBottom: `1px solid ${ui.t?.border || '#e2e8f0'}`,
                            textAlign: 'center',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, idx) => {
                      const c = calcFilas[idx] || {}
                      return (
                        <tr key={idx}>
                          <td style={{ padding: 2, textAlign: 'center' }}>{idx + 1}</td>
                          {['abscisa', 'terreno_natural', nivelKey, 'cota_fondo_excavacion'].map((k) => (
                            <td key={k} style={{ padding: 2 }}>
                              <input
                                type="number"
                                step="any"
                                disabled={!editable}
                                value={f[k]}
                                onChange={(e) => setFila(idx, k, e.target.value)}
                                style={inputStyle(!editable)}
                              />
                            </td>
                          ))}
                          <td style={{ padding: 2, textAlign: 'right', background: '#f8fafc' }}>{fmtNDash(c.altura_excavacion)}</td>
                          <td style={{ padding: 2, textAlign: 'right', background: '#f8fafc' }}>{fmtNDash(c.altura_triturado)}</td>
                          <td style={{ padding: 2, textAlign: 'right', background: '#f8fafc' }}>{fmtNDash(c.altura_relleno)}</td>
                          <td style={{ padding: 2, textAlign: 'right', background: '#f8fafc' }}>{fmtNDash(c.ancho_geotextil)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {calculo?.cartera?.totales && (
                  <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                    L={fmtNDash(calculo.cartera.totales.longitud_m, 2)} m ·
                    prom H.Exc={fmtNDash(calculo.cartera.totales.prom_altura_excavacion)} ·
                    prom Geo={fmtNDash(calculo.cartera.totales.prom_ancho_geotextil)}
                  </div>
                )}
                {editable && (
                  <button
                    type="button"
                    style={{ ...ui.btnSecondary, marginTop: 8 }}
                    onClick={() => setFilas((prev) => [...prev, filaCampoVacia(prev.length + 1)])}
                  >
                    + Fila
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.2fr)', gap: 12 }}>
                <PlanillaTuberiaSeccionSvg seccionTipica={calculo?.seccion_tipica} ui={ui} />
                <PlanillaTuberiaPerfil perfil={calculo?.perfil} ui={ui} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={ui.card}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Resumen de cantidades</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                    <thead>
                      <tr>
                        {['Cód', 'Ítem', 'Ud', 'Bruto', 'Desc', 'Neto'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(calculo?.netos || []).map((n) => (
                        <tr key={n.codigo}>
                          <td style={{ padding: 4 }}>{n.codigo}</td>
                          <td style={{ padding: 4 }}>{n.nombre}</td>
                          <td style={{ padding: 4 }}>{n.unidad}</td>
                          <td style={{ padding: 4, textAlign: 'right' }}>{fmtNDash(n.bruto)}</td>
                          <td style={{ padding: 4, textAlign: 'right' }}>{fmtNDash(n.descuentos)}</td>
                          <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>{fmtNDash(n.neto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={ui.card}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Descuentos (por código de ítem)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--cc-sm)' }}>
                    <thead>
                      <tr>
                        {['Cód', 'Nombre', 'Ítem cant.', 'Cantidad'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(calculo?.descuentos || []).map((d) => (
                        <tr key={d.codigo}>
                          <td style={{ padding: 4 }}>{d.codigo}</td>
                          <td style={{ padding: 4 }}>{d.nombre}</td>
                          <td style={{ padding: 4 }}>{d.item_cant_codigo}</td>
                          <td style={{ padding: 4, textAlign: 'right' }}>{fmtNDash(d.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
