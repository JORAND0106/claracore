import { useCallback, useEffect, useState } from 'react'
import TopoAngularInput from './TopoAngularInput'
import TopoErrorModal from './TopoErrorModal'
import PoligonalValidacionPanel from './PoligonalValidacionPanel'
import NewPointGrafico from './NewPointGrafico'
import {
  parseApiError,
  PermisoAviso,
  puede,
  Semaforo,
  TopoFieldLabel,
  TopoHelpIcon,
  useTopografiaApi,
  useTopoTheme,
} from './topografiaShared'
import { fmtErrorAngularTexto } from '../../utils/topografia_angular'

function camposCampoNewpointCompletos(data) {
  if (!data) return false
  const trim = (v) => (v || '').toString().trim()
  return Boolean(
    trim(data.operador)
    && trim(data.fecha)
    && trim(data.equipo_marca)
    && trim(data.equipo_referencia)
    && trim(data.equipo_serial)
  )
}

const emptyForm = {
  poligonal_id: '',
  nombre_punto_nuevo: '',
  punto1_id: '',
  distancia1: '',
  angulo_observado_gms: '',
  punto2_id: '',
  distancia2: '',
  tolerancia_lineal: 0.05,
  tolerancia_angular_seg: 30,
  tipo_punto: 'auxiliar',
  operador: '',
  fecha: new Date().toISOString().slice(0, 10),
  equipo_marca: '',
  equipo_referencia: '',
  equipo_serial: '',
}

const AYUDA_MODULO_NEWPOINT =
  'Desde un puesto arbitrario no se conoce el azimut inicial: la referencia horizontal es 00.0000 hacia el punto 1. '
  + 'Se mide el ángulo observado hasta el punto 2 y las distancias a ambos puntos conocidos de la poligonal sellada.'

export default function NewPointForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const { api, downloadPdf } = useTopografiaApi(contratoId, token)
  const [poligonales, setPoligonales] = useState([])
  const [puntos, setPuntos] = useState([])
  const [operadores, setOperadores] = useState([])
  const [lista, setLista] = useState([])
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [modo, setModo] = useState('form')
  const [creando, setCreando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [errorModal, setErrorModal] = useState(null)

  const showError = useCallback((err) => {
    setErrorModal(parseApiError(err?.message || String(err)))
  }, [])

  const cargarPoligonales = useCallback(async () => {
    try {
      const data = await api('/poligonales/selladas')
      setPoligonales(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const cargarLista = useCallback(async () => {
    try {
      const data = await api('/newpoints')
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  const cargarPuntosPoligonal = useCallback(async (poligonalId) => {
    if (!poligonalId) {
      setPuntos([])
      return
    }
    try {
      const data = await api(`/poligonales/${poligonalId}/puntos-biblioteca`)
      setPuntos(Array.isArray(data) ? data : [])
    } catch (e) {
      setPuntos([])
      showError(e)
    }
  }, [api, showError])

  useEffect(() => {
    cargarPoligonales()
    cargarLista()
    api('/operadores')
      .then((data) => setOperadores(Array.isArray(data) ? data : []))
      .catch(() => setOperadores([]))
  }, [cargarPoligonales, cargarLista, api])

  useEffect(() => {
    if (form.poligonal_id) cargarPuntosPoligonal(form.poligonal_id)
  }, [form.poligonal_id, cargarPuntosPoligonal])

  const nombreP1 = puntos.find((p) => p.id === form.punto1_id)?.nombre
  const nombreP2 = puntos.find((p) => p.id === form.punto2_id)?.nombre
  const bloqueado = modo === 'detalle' && detalle && ((detalle.nivel2_estado || '') === 'Aprobado' || Boolean(detalle.biblioteca_at))

  const abrirNuevo = () => {
    setForm(emptyForm)
    setDetalle(null)
    setSel(null)
    setCreando(true)
    setModo('form')
  }

  const cargarDetalle = useCallback(async (id) => {
    setCreando(false)
    setSel(id)
    setModo('detalle')
    try {
      const data = await api(`/newpoints/${id}`)
      setDetalle(data)
      setForm({
        poligonal_id: data.poligonal_id || '',
        nombre_punto_nuevo: data.nombre_punto_nuevo || '',
        punto1_id: data.punto1_id || '',
        distancia1: data.distancia1 ?? '',
        angulo_observado_gms: data.angulo_observado_gms ?? '',
        punto2_id: data.punto2_id || '',
        distancia2: data.distancia2 ?? '',
        tolerancia_lineal: data.tolerancia_lineal ?? 0.05,
        tolerancia_angular_seg: data.tolerancia_angular_seg ?? 30,
        tipo_punto: data.tipo_punto || 'auxiliar',
        operador: data.operador || '',
        fecha: data.fecha || '',
        equipo_marca: data.equipo_marca || '',
        equipo_referencia: data.equipo_referencia || '',
        equipo_serial: data.equipo_serial || '',
      })
    } catch (e) {
      showError(e)
    }
  }, [api, showError])

  useEffect(() => {
    if (!lista.length || sel || creando) return
    cargarDetalle(lista[0].id)
  }, [lista, sel, creando, cargarDetalle])

  const payload = () => ({
    ...form,
    distancia1: Number(form.distancia1),
    angulo_observado_gms: Number(form.angulo_observado_gms),
    distancia2: Number(form.distancia2),
    tolerancia_lineal: Number(form.tolerancia_lineal),
    tolerancia_angular_seg: Number(form.tolerancia_angular_seg),
    operador: form.operador || null,
    fecha: form.fecha || null,
    equipo_marca: form.equipo_marca?.trim() || null,
    equipo_referencia: form.equipo_referencia?.trim() || null,
    equipo_serial: form.equipo_serial?.trim() || null,
  })

  const guardar = async () => {
    setBusy(true)
    try {
      const data = await api('/newpoints', { method: 'POST', body: JSON.stringify(payload()) })
      await cargarLista()
      setDetalle(data)
      setSel(data.id)
      setCreando(false)
      setModo('detalle')
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const recalcular = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const data = await api(`/newpoints/${sel}`, { method: 'PUT', body: JSON.stringify(payload()) })
      setDetalle(data)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const descargarPdf = async () => {
    if (!detalle?.id) return
    setPdfBusy(true)
    try {
      await downloadPdf(`/newpoints/${detalle.id}/pdf`, `newpoint_${detalle.nombre_punto_nuevo || 'aux'}.pdf`)
    } catch (e) {
      showError(e)
    } finally {
      setPdfBusy(false)
    }
  }

  const elegirOpcion = async (opcion) => {
    if (!sel || bloqueado) return
    setBusy(true)
    try {
      const data = await api(`/newpoints/${sel}/elegir-opcion`, {
        method: 'PUT',
        body: JSON.stringify({ opcion }),
      })
      setDetalle(data)
      await cargarLista()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  const opciones = detalle?.opciones || []
  const opcionElegida = detalle?.opcion_elegida || null
  const listoValidar = Boolean(detalle?.admisible && opcionElegida)
  const cierreAngularTxt = detalle?.error_angular_gms_texto
    || (detalle?.error_angular_segundos != null ? fmtErrorAngularTexto(detalle.error_angular_segundos) : '—')


  const sellada = detalle ? (detalle.nivel2_estado || '') === 'Aprobado' || Boolean(detalle.biblioteca_at) : false
  const camposCampoOk = camposCampoNewpointCompletos(detalle)
  const polSel = poligonales.find((p) => p.id === form.poligonal_id)
  const inp = ui.compactInput
  const col = ui.compactFieldCol

  return (
    <div>
      <div style={ui.tabBar} role="tablist" aria-label="Cálculos NewPoint">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <PermisoAviso permisos={permisos} accion="crear">
            <button
              type="button"
              style={{ ...ui.tabBtn(creando && modo === 'form'), borderStyle: 'dashed', color: ui.accent }}
              onClick={abrirNuevo}
              title="Nuevo cálculo de resección"
            >
              + Nuevo
            </button>
          </PermisoAviso>
          <TopoHelpIcon ayuda={AYUDA_MODULO_NEWPOINT} />
        </div>
        {lista.map((r) => {
          const active = sel === r.id && modo === 'detalle'
          const src = sel === r.id && detalle ? { ...r, ...detalle } : r
          const label = (src.nombre_punto_nuevo || '').trim() || 'Sin nombre'
          const polNombre = src.poligonal_nombre || r.poligonal_nombre || 'Poligonal'
          const admisible = src.admisible ?? r.admisible
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={active}
              style={ui.tabBtn(active)}
              onClick={() => cargarDetalle(r.id)}
              title={`${label} · ${polNombre}`}
            >
              <span>{label}</span>
              <small style={{ color: ui.textMuted, fontWeight: 400 }}>
                ({admisible ? 'admisible' : 'revisar'}
                {(src.nivel1_estado || r.nivel1_estado) && (src.nivel1_estado || r.nivel1_estado) !== 'No Revisado'
                  ? ` · C:${src.nivel1_estado || r.nivel1_estado}` : ''}
                {(src.nivel2_estado || r.nivel2_estado) && (src.nivel2_estado || r.nivel2_estado) !== 'No Revisado'
                  ? ` · I:${src.nivel2_estado || r.nivel2_estado}` : ''}
                )
              </small>
            </button>
          )
        })}
      </div>

      {!lista.length && modo !== 'form' && (
        <p style={{ color: ui.textMuted, fontSize: 'var(--cc-sm)', margin: '0 0 12px' }}>
          Aún no hay cálculos NewPoint. Pulse «+ Nuevo» para comenzar.
        </p>
      )}

      {(modo === 'form' || (modo === 'detalle' && detalle)) && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={ui.card}>
            <div style={{ ...ui.compactFieldRow }} className="cc-topo-compact-row">
              <label style={col('1.35 1 9em')}>
                <TopoFieldLabel
                  texto="Poligonal"
                  color={ui.textMuted}
                  ayuda="Poligonal sellada (interventoría aprobada). P1 y P2 deben pertenecer a ella."
                />
                <select
                  value={form.poligonal_id}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, poligonal_id: e.target.value, punto1_id: '', punto2_id: '' })}
                  style={inp}
                >
                  <option value="">—</option>
                  {poligonales.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label style={col('1 1 6em')}>
                <TopoFieldLabel texto="Punto" color={ui.textMuted} ayuda="Nombre del punto nuevo en biblioteca tras validación." />
                <input
                  value={form.nombre_punto_nuevo}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, nombre_punto_nuevo: e.target.value })}
                  style={inp}
                  placeholder="Aux1"
                />
              </label>
              <label style={col('0.75 1 5em')}>
                <TopoFieldLabel texto="Tipo" color={ui.textMuted} ayuda="Clasificación al publicar en biblioteca (auxiliar, estación, etc.)." />
                <select
                  value={form.tipo_punto}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, tipo_punto: e.target.value })}
                  style={inp}
                >
                  <option value="auxiliar">Auxiliar</option>
                  <option value="estacion">Estación</option>
                </select>
              </label>
              <label style={col('1.25 1 8em')}>
                <TopoFieldLabel texto="Operador" color={ui.textMuted} ayuda="Profesional u operador que tomó las lecturas en campo." />
                <select
                  value={form.operador}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, operador: e.target.value })}
                  style={inp}
                >
                  <option value="">—</option>
                  {operadores.map((u) => (
                    <option key={u.id || u.nombre} value={u.nombre}>{u.nombre}</option>
                  ))}
                  {form.operador && !operadores.some((u) => u.nombre === form.operador) && (
                    <option value={form.operador}>{form.operador}</option>
                  )}
                </select>
              </label>
              <label style={col('0.85 1 7em')}>
                <TopoFieldLabel texto="Fecha" color={ui.textMuted} ayuda="Fecha de las mediciones en campo." />
                <input
                  type="date"
                  value={form.fecha}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  style={inp}
                />
              </label>
              <label style={col('0.85 1 5.5em')}>
                <TopoFieldLabel texto="Marca" color={ui.textMuted} ayuda="Marca de la estación total utilizada." />
                <input
                  value={form.equipo_marca}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })}
                  style={inp}
                  placeholder="Leica"
                />
              </label>
              <label style={col('0.85 1 5.5em')}>
                <TopoFieldLabel texto="Modelo" color={ui.textMuted} ayuda="Modelo o referencia del equipo." />
                <input
                  value={form.equipo_referencia}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, equipo_referencia: e.target.value })}
                  style={inp}
                  placeholder="TS16"
                />
              </label>
              <label style={col('0.85 1 5.5em')}>
                <TopoFieldLabel texto="Serial" color={ui.textMuted} ayuda="Número de serie del equipo." />
                <input
                  value={form.equipo_serial}
                  disabled={bloqueado}
                  onChange={(e) => setForm({ ...form, equipo_serial: e.target.value })}
                  style={inp}
                  placeholder="123456"
                />
              </label>
            </div>

            {form.poligonal_id && puntos.length < 2 && (
              <p style={{ margin: '12px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                La poligonal «{polSel?.nombre}» necesita al menos 2 puntos verificados en biblioteca.
              </p>
            )}

            <div style={ui.insetPanel}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Referencia horizontal fija: <strong style={{ color: ui.text }}>00.0000</strong>
                {nombreP1 ? ` hacia ${nombreP1}` : ' hacia punto 1'} (puesto desconocido).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                <div style={ui.nestedPanel}>
                  <TopoFieldLabel
                    texto="Punto 1 — referencia 00.0000"
                    ayuda="Primer punto conocido. La visual hacia él define el cero horizontal."
                  />
                  <select
                    value={form.punto1_id}
                    disabled={!form.poligonal_id || bloqueado}
                    onChange={(e) => setForm({ ...form, punto1_id: e.target.value })}
                    style={{ ...ui.inputStyle, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <input
                    placeholder="Distancia a P1 (m)"
                    value={form.distancia1}
                    disabled={bloqueado}
                    onChange={(e) => setForm({ ...form, distancia1: e.target.value })}
                    style={{ ...ui.inputStyle, marginTop: 8 }}
                  />
                </div>

                <div style={ui.nestedPanel}>
                  <TopoFieldLabel
                    texto="Ángulo observado P1 → P2"
                    ayuda="Ángulo horizontal medido desde la visual a P1 hasta la visual a P2 (como en campo)."
                  />
                  <div style={{ marginTop: 6 }}>
                    <TopoAngularInput
                      label=""
                      value={form.angulo_observado_gms}
                      disabled={bloqueado}
                      onChange={(_, v) => setForm({ ...form, angulo_observado_gms: v })}
                    />
                  </div>
                </div>

                <div style={ui.nestedPanel}>
                  <TopoFieldLabel
                    texto={nombreP2 ? `Punto 2 — ${nombreP2}` : 'Punto 2'}
                    ayuda="Segundo punto conocido de la misma poligonal."
                  />
                  <select
                    value={form.punto2_id}
                    disabled={!form.poligonal_id || bloqueado}
                    onChange={(e) => setForm({ ...form, punto2_id: e.target.value })}
                    style={{ ...ui.inputStyle, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {puntos.filter((p) => p.id !== form.punto1_id).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Distancia a P2 (m)"
                    value={form.distancia2}
                    disabled={bloqueado}
                    onChange={(e) => setForm({ ...form, distancia2: e.target.value })}
                    style={{ ...ui.inputStyle, marginTop: 8 }}
                  />
                </div>
              </div>
            </div>

            <div className="cc-topo-actions-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {modo === 'form' && puede(permisos, 'crear') && (
                <button
                  type="button"
                  className="cc-topo-touch-btn"
                  style={ui.btnPrimary}
                  onClick={guardar}
                  disabled={busy || !form.poligonal_id || !form.punto1_id || !form.punto2_id || puntos.length < 2}
                >
                  {busy ? 'Calculando…' : 'Calcular y guardar'}
                </button>
              )}
              {modo === 'detalle' && !sellada && puede(permisos, 'editar') && (
                <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} onClick={recalcular} disabled={busy}>
                  {busy ? 'Recalculando…' : 'Recalcular'}
                </button>
              )}
            </div>
          </div>

          {detalle && (
            <div style={ui.card}>
              <h4 style={{ marginTop: 0 }}>Resultado — {detalle.nombre_punto_nuevo}</h4>
              <Semaforo ok={detalle.admisible} />
              {!opcionElegida && detalle.admisible && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                  Hay dos posiciones posibles del puesto (A y B). Revise el gráfico y elija la que corresponde en campo.
                </p>
              )}
              {opcionElegida && (
                <p style={{ marginTop: 10, fontSize: 'var(--cc-sm)' }}>
                  Opción <strong>{opcionElegida}</strong> · Norte: <strong>{detalle.norte_resultado}</strong> · Este:{' '}
                  <strong>{detalle.este_resultado}</strong>
                </p>
              )}
              {!opcionElegida && (
                <p style={{ marginTop: 10, fontSize: 'var(--cc-sm)', color: ui.textMuted }}>
                  Coordenadas definitivas: pendiente de elegir A o B.
                </p>
              )}

              {opciones.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
                  {opciones.map((op) => {
                    const selOp = opcionElegida === op.id
                    const dentro = op.dentro_poligonal
                    return (
                      <div
                        key={op.id}
                        style={{
                          ...ui.nestedPanel,
                          border: `2px solid ${selOp ? (op.id === 'A' ? '#16a34a' : '#7c3aed') : ui.t?.border || '#e2e8f0'}`,
                          background: selOp ? (op.id === 'A' ? 'rgba(22,163,74,0.12)' : 'rgba(124,58,237,0.12)') : ui.nestedPanel.background,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong style={{ fontSize: 'var(--cc-sm)', color: op.id === 'A' ? '#16a34a' : '#7c3aed' }}>
                            Opción {op.id}
                          </strong>
                          {selOp && <span style={{ fontSize: 'var(--cc-xs)', color: '#16a34a' }}>Elegida</span>}
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: 'var(--cc-xs)' }}>
                          N {op.norte} · E {op.este}
                        </p>
                        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                          Ángulo calc.: {op.angulo_calculado_texto || '—'} · Cierre ang.: {op.error_angular_gms_texto || '—'}
                        </p>
                        {dentro != null && (
                          <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                            {dentro ? 'Dentro del polígono' : 'Fuera del polígono'}
                          </p>
                        )}
                        {!sellada && puede(permisos, 'editar') && (
                          <button
                            type="button"
                            style={selOp ? ui.btnSecondary : ui.btnPrimary}
                            disabled={busy || selOp}
                            onClick={() => elegirOpcion(op.id)}
                          >
                            {selOp ? 'Opción confirmada' : `Elegir opción ${op.id}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <p style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 12 }}>
                Ángulo observado: {detalle.angulo_observado_texto || '—'} ·
                Ángulo calculado: {detalle.angulo_calculado_texto || '—'}
              </p>
              <p style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Dist. P1: {detalle.distancia1} m · Dist. P2: {detalle.distancia2} m
              </p>
              <p style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                Cierre lineal (P1–P2): {detalle.error_lineal} m · Cierre angular: {cierreAngularTxt}
              </p>
              {!detalle.admisible && detalle.angulo_calculado_texto && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                  Revise el ángulo en formato GG.MMSS (ej. 77.3414 = 77°34&apos;14&quot;). Debe coincidir con el ángulo calculado.
                </p>
              )}
              <NewPointGrafico
                verticesPoligonal={detalle.vertices_poligonal || []}
                p1={{
                  nombre: detalle.punto1_nombre,
                  norte: detalle.punto1_norte,
                  este: detalle.punto1_este,
                }}
                p2={{
                  nombre: detalle.punto2_nombre,
                  norte: detalle.punto2_norte,
                  este: detalle.punto2_este,
                }}
                opciones={opciones}
                opcionElegida={opcionElegida}
                nombreNuevo={detalle.nombre_punto_nuevo}
                norteResultado={detalle.norte_resultado}
                esteResultado={detalle.este_resultado}
              />

              {listoValidar && !camposCampoOk && !sellada && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
                  Complete operador, fecha de campo, marca, modelo y serial del equipo; luego pulse «Recalcular» para
                  guardar antes de validar como contratista.
                </p>
              )}

              <PoligonalValidacionPanel
                poligonal={{
                  id: detalle.id,
                  estado: 'cerrado',
                  ajustada_at: listoValidar,
                  nivel1_estado: detalle.nivel1_estado,
                  nivel2_estado: detalle.nivel2_estado,
                  biblioteca_at: detalle.biblioteca_at,
                }}
                cierre={{ cerrado: true, admisible_lineal: detalle.admisible }}
                permisos={permisos}
                usuario={usuario}
                contratoId={contratoId}
                token={token}
                api={api}
                soloLectura={sellada}
                validarPathPrefix={`/newpoints/${detalle.id}`}
                requisitosN1Ok={camposCampoOk}
                avisoRequisitosN1="Complete operador, fecha de campo, marca, modelo y serial del equipo antes de validar como contratista."
                onActualizado={async () => {
                  await cargarDetalle(detalle.id)
                  await cargarLista()
                }}
                onError={showError}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {puede(permisos, 'exportar') && (
                  <button
                    type="button"
                    style={ui.btnSecondary}
                    disabled={pdfBusy || !opcionElegida}
                    title={!opcionElegida ? 'Confirme la opción A o B antes de generar el informe' : ''}
                    onClick={descargarPdf}
                  >
                    {pdfBusy ? 'Generando PDF…' : 'PDF'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {errorModal && (
        <TopoErrorModal theme={ui.t} titulo={errorModal.titulo} onClose={() => setErrorModal(null)}>
          {errorModal.mensaje}
        </TopoErrorModal>
      )}
    </div>
  )
}
