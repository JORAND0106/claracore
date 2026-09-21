import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BitacoraMaterialUbicacionModal from '../../../modules/seguimiento/BitacoraMaterialUbicacionModal'
import TopoExcelSheet from '../TopoExcelSheet'
import { topoSheetStyles } from '../topoSheetStyles'
import {
  esDesarrolladorTopo,
  puede,
  useTopoTheme,
  useTopoViewport,
  useTopografiaApi,
} from '../topografiaShared'
import TopoConfirmModal from '../TopoConfirmModal'
import PlanillaTuberiaPerfil from './PlanillaTuberiaPerfil'
import PlanillaTuberiaSeccionSvg from './PlanillaTuberiaSeccionSvg'
import {
  CALC_CELL_BG,
  RELACIONES_ATRAQUE,
  TIPOS_PLANILLA,
  confirmarGuardadoCartera,
  FILAS_INICIALES_CARTERA,
  CARTERA_ROW_HEIGHT,
  CARTERA_INPUT_HEIGHT,
  RESUMEN_ROW_HEIGHT,
  filaCampoVacia,
  filasDesdeApi,
  fmtNDash,
  handleEnterAsTab,
  migrarFilasAlCambiarTipo,
  coordsGeoDesdePlanilla,
  payloadCoordsGeo,
  payloadFilas,
  tieneDatosExportables,
} from './planillaTuberiaUtils'

const CARTERA_MIN_WIDTH = 720

export default function PlanillaTuberiaForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { isCompact } = useTopoViewport()
  const { api, downloadPdf, downloadExcel } = useTopografiaApi(contratoId, token)
  const esDev = esDesarrolladorTopo(usuario)
  const editablePerm = puede(permisos, 'editar')

  const [lista, setLista] = useState([])
  const [detalle, setDetalle] = useState(null)
  const [filas, setFilas] = useState(() => Array.from({ length: FILAS_INICIALES_CARTERA }, (_, i) => filaCampoVacia(i + 1)))
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
    norte_abs_inicial: '',
    este_abs_inicial: '',
    norte_abs_final: '',
    este_abs_final: '',
  })
  const [version, setVersion] = useState(1)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [infos, setInfos] = useState([])
  const [busy, setBusy] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null) // null | 'vacia' | 'con_datos'
  const [pkMapOpen, setPkMapOpen] = useState(false)
  const tableRef = useRef(null)

  const planilla = detalle?.planilla
  const calculo = detalle?.calculo
  const sellada = ['cerrado', 'validado'].includes(String(planilla?.estado || '').toLowerCase())
  const editable = editablePerm && !sellada
  const conDatos = useMemo(() => tieneDatosExportables(filas, detalle), [filas, detalle])
  const puedeExportar = puede(permisos, 'exportar') || esDev
  const puedeEliminar = puede(permisos, 'eliminar')
  const exportPlantillaVacia = esDev && !conDatos

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
      ...coordsGeoDesdePlanilla(p),
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
        ...payloadCoordsGeo(params),
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

  
  const solicitarEliminar = () => {
    if (!planilla?.id) return
    setConfirmEliminar(conDatos ? 'con_datos' : 'vacia')
  }

  const eliminarPlanilla = async () => {
    if (!planilla?.id) return
    setBusy(true); setErr(''); setMsg('')
    try {
      await api(`/planillas-tuberia/${planilla.id}`, { method: 'DELETE' })
      setConfirmEliminar(null)
      setDetalle(null)
      setFilas(Array.from({ length: FILAS_INICIALES_CARTERA }, (_, i) => filaCampoVacia(i + 1)))
      await cargarLista()
      setMsg(conDatos
        ? 'Planilla eliminada (incluía datos de cartera).'
        : 'Planilla vacía eliminada.')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const exportarPdf = async () => {
    if (!planilla?.id) return
    if (!conDatos && !esDev) {
      setErr('Sin datos para exportar. Complete la cartera o use un rol Desarrollador para plantilla vacía.')
      return
    }
    try {
      const suffix = exportPlantillaVacia ? '_plantilla' : ''
      await downloadPdf(
        `/planillas-tuberia/${planilla.id}/pdf`,
        `planilla_tuberia_${String(planilla.id).slice(0, 8)}${suffix}.pdf`,
      )
    } catch (e) {
      setErr(e.message)
    }
  }

  const exportarExcel = async () => {
    if (!planilla?.id) return
    if (!conDatos && !esDev) {
      setErr('Sin datos para exportar. Complete la cartera o use un rol Desarrollador para plantilla vacía.')
      return
    }
    try {
      const suffix = exportPlantillaVacia ? '_plantilla' : ''
      await downloadExcel(
        `/planillas-tuberia/${planilla.id}/excel`,
        `planilla_tuberia_${String(planilla.id).slice(0, 8)}${suffix}.xlsx`,
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

  const nivelLabel = params.tipo === 'FILTRO' ? 'Terminado Filtro' : 'Subrasante de Vía'
  const nivelKey = params.tipo === 'FILTRO' ? 'terminado_filtro' : 'subrasante_via'

  const thBase = { ...sheet.th, textAlign: 'center' }
  const thCalc = { ...thBase, background: CALC_CELL_BG }
  const tdEdit = { ...sheet.td, padding: 0, minWidth: 88 }
  const tdCalc = {
    ...sheet.td,
    background: CALC_CELL_BG,
    textAlign: 'right',
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    minWidth: 72,
  }

  // Cartera: 70% de altura de fila del sheet base (32 → 22)
  // Encabezado cartera un tono más oscuro que el sheet base (#D9D9D9 → #B0B0B0)
  const thCartera = { ...thBase, padding: '3px 4px', lineHeight: 1.1, height: CARTERA_ROW_HEIGHT, background: '#B0B0B0', color: '#1e293b' }
  const thCarteraCalc = { ...thCalc, padding: '3px 4px', lineHeight: 1.1, height: CARTERA_ROW_HEIGHT, background: '#A3A3A3', color: '#1e293b' }
  const tdCartera = { ...sheet.td, height: CARTERA_ROW_HEIGHT, padding: '1px 3px', lineHeight: 1.1 }
  const tdCarteraEdit = { ...tdEdit, height: CARTERA_ROW_HEIGHT }
  const tdCarteraCalc = { ...tdCalc, height: CARTERA_ROW_HEIGHT, padding: '1px 3px', lineHeight: 1.1 }
  const inpCartera = { ...sheet.cellInp, height: CARTERA_INPUT_HEIGHT, padding: '2px 3px' }

  // Resumen / Descuentos: 50% de altura (32 → 16)
  const thResumen = { ...thBase, padding: '2px 4px', lineHeight: 1.05, height: RESUMEN_ROW_HEIGHT, fontSize: 9 }
  const thResumenCalc = { ...thCalc, padding: '2px 4px', lineHeight: 1.05, height: RESUMEN_ROW_HEIGHT, fontSize: 9 }
  const tdResumen = { ...sheet.td, height: RESUMEN_ROW_HEIGHT, padding: '1px 3px', lineHeight: 1.05, fontSize: 'var(--cc-xs)' }
  const tdResumenItem = { ...tdResumen, whiteSpace: 'nowrap', minWidth: 148, width: '38%' }
  const tdResumenCalc = { ...tdCalc, height: RESUMEN_ROW_HEIGHT, padding: '1px 3px', lineHeight: 1.05, fontSize: 'var(--cc-xs)' }
  const thResumenItem = { ...thResumen, whiteSpace: 'nowrap', minWidth: 148, width: '38%', textAlign: 'left' }

  const layoutMain = isCompact
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 12 }
  const layoutCharts = isCompact
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.2fr)', gap: 12 }
  const layoutTables = isCompact
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
  const cardPad = isCompact ? { ...ui.card, padding: 12 } : ui.card

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ ...cardPad, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: isCompact ? 'var(--cc-base)' : undefined }}>Planillas de Tubería</strong>
        <select
          value={params.tipo}
          disabled={!!planilla && !editable}
          onChange={(e) => {
            const nuevo = e.target.value
            const filasMig = migrarFilasAlCambiarTipo(filas, nuevo)
            setFilas(filasMig)
            setParams((p) => ({ ...p, tipo: nuevo }))
            // Recalcular al guardar params si ya hay planilla abierta (evita residuos del tipo anterior)
            if (planilla?.id && editable) {
              // defer: params state aún no actualizado; usamos valor nuevo explícito
              ;(async () => {
                try {
                  setBusy(true); setErr(''); setMsg('')
                  const body = {
                    version,
                    tipo: nuevo,
                    nombre: params.nombre || null,
                    pk_id: params.pk_id || null,
                    costado: params.costado || null,
                    diametro_m: params.diametro_m === '' ? null : Number(params.diametro_m),
                    espesor_m: params.espesor_m === '' ? 0 : Number(params.espesor_m),
                    ancho_excavacion_m: params.ancho_excavacion_m === '' ? null : Number(params.ancho_excavacion_m),
                    relacion_atraque: params.relacion_atraque,
                    material: params.material || null,
                    ...payloadCoordsGeo(params),
                  }
                  const det = await api(`/planillas-tuberia/${planilla.id}/params`, {
                    method: 'PUT',
                    body: JSON.stringify(body),
                  })
                  // Reenviar cartera migrada para persistir nivel en la columna del nuevo tipo
                  const filasPayload = payloadFilas(filasMig, nuevo)
                  if (filasPayload.length) {
                    const res = await api(`/planillas-tuberia/${planilla.id}/cartera`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        version: det?.planilla?.version ?? det?.version ?? body.version,
                        filas: filasPayload,
                        descuentos_manuales: [],
                      }),
                    })
                    aplicarDetalle(res)
                  } else {
                    aplicarDetalle(det)
                  }
                  setMsg('Tipo actualizado; cálculos recalculados.')
                } catch (err) {
                  setErr(err.message || String(err))
                } finally {
                  setBusy(false)
                }
              })()
            }
          }}
          style={{
            ...sheet.cellSelect,
            border: `1px solid ${sheet.border}`,
            borderRadius: 6,
            minWidth: 140,
            height: 36,
            background: ui.t?.inputBg || '#fff',
          }}
        >
          {TIPOS_PLANILLA.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {puede(permisos, 'crear') && (
          <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} disabled={busy} onClick={crear}>
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

      <div style={layoutMain}>
        <div style={{ ...cardPad, maxHeight: isCompact ? 220 : 520, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Planillas del contrato</div>
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cc-topo-touch-btn"
              onClick={() => abrir(p.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 6,
                padding: isCompact ? '10px 12px' : '8px 10px',
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {!planilla ? (
            <div style={{ ...cardPad, color: ui.textMuted }}>Seleccione o cree una planilla.</div>
          ) : (
            <>
              <div style={cardPad}>
                <TopoExcelSheet
                  sheet={sheet}
                  title="Cabecera / tramo"
                  minWidth={isCompact ? undefined : 640}
                  compact={isCompact}
                  columns={[
                    { key: 'nombre', label: 'Nombre', compactFull: true },
                    { key: 'pk_id', label: 'PK / ID' },
                    { key: 'costado', label: 'Costado' },
                    { key: 'diametro_m', label: 'Ø (m)' },
                    { key: 'espesor_m', label: 'Espesor (m)' },
                    { key: 'ancho_excavacion_m', label: 'Ancho exc. B (m)' },
                    { key: 'relacion_atraque', label: 'Relación atraque' },
                    { key: 'material', label: 'Material' },
                    { key: 'norte_abs_inicial', label: 'Norte Abs Inicial' },
                    { key: 'este_abs_inicial', label: 'Este Abs Inicial' },
                    { key: 'norte_abs_final', label: 'Norte Abs Final' },
                    { key: 'este_abs_final', label: 'Este Abs Final' },
                  ]}
                  cells={[
                    <input key="nombre" disabled={!editable} value={params.nombre} onChange={(e) => setParams((p) => ({ ...p, nombre: e.target.value }))} style={sheet.cellInp} />,
                    <button
                      key="pk"
                      type="button"
                      disabled={!editable}
                      onClick={() => setPkMapOpen(true)}
                      title={params.pk_id ? `PK ${params.pk_id}` : 'Seleccionar PK en el mapa'}
                      style={{
                        ...sheet.cellInp,
                        display: 'block',
                        width: '100%',
                        boxSizing: 'border-box',
                        textAlign: 'left',
                        cursor: editable ? 'pointer' : 'default',
                        color: params.pk_id ? (ui.t?.text || '#0f172a') : (ui.textMuted || '#64748b'),
                        fontWeight: params.pk_id ? 700 : 600,
                      }}
                    >
                      {params.pk_id || '📍 Elegir PK'}
                    </button>,
                    <input
                      key="cost"
                      disabled={!editable}
                      value={params.costado}
                      onChange={(e) => setParams((p) => ({ ...p, costado: e.target.value }))}
                      placeholder="Desde mapa"
                      title={params.costado ? `Costado: ${params.costado}` : 'Se diligencia al elegir PK en el mapa'}
                      style={sheet.cellInp}
                    />,
                    <input key="dia" type="number" step="any" disabled={!editable} value={params.diametro_m} onChange={(e) => setParams((p) => ({ ...p, diametro_m: e.target.value }))} style={sheet.cellInp} />,
                    <input key="esp" type="number" step="any" disabled={!editable} value={params.espesor_m} onChange={(e) => setParams((p) => ({ ...p, espesor_m: e.target.value }))} style={sheet.cellInp} />,
                    <input key="b" type="number" step="any" disabled={!editable} value={params.ancho_excavacion_m} onChange={(e) => setParams((p) => ({ ...p, ancho_excavacion_m: e.target.value }))} style={sheet.cellInp} />,
                    <select key="rel" disabled={!editable} value={params.relacion_atraque} onChange={(e) => setParams((p) => ({ ...p, relacion_atraque: e.target.value }))} style={sheet.cellSelect}>
                      {RELACIONES_ATRAQUE.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>,
                    <input key="mat" disabled={!editable} value={params.material} onChange={(e) => setParams((p) => ({ ...p, material: e.target.value }))} style={sheet.cellInp} />,
                    <input key="nIni" type="number" step="any" disabled={!editable} value={params.norte_abs_inicial} onChange={(e) => setParams((p) => ({ ...p, norte_abs_inicial: e.target.value }))} style={sheet.cellInp} />,
                    <input key="eIni" type="number" step="any" disabled={!editable} value={params.este_abs_inicial} onChange={(e) => setParams((p) => ({ ...p, este_abs_inicial: e.target.value }))} style={sheet.cellInp} />,
                    <input key="nFin" type="number" step="any" disabled={!editable} value={params.norte_abs_final} onChange={(e) => setParams((p) => ({ ...p, norte_abs_final: e.target.value }))} style={sheet.cellInp} />,
                    <input key="eFin" type="number" step="any" disabled={!editable} value={params.este_abs_final} onChange={(e) => setParams((p) => ({ ...p, este_abs_final: e.target.value }))} style={sheet.cellInp} />,
                  ]}
                />
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted, marginTop: 4 }}>
                  H.Relleno={fmtNDash(planilla.altura_relleno_m, 4)} ·
                  A1={fmtNDash(planilla.area_1_m2, 4)} ·
                  A2={fmtNDash(planilla.area_2_m2, 4)}
                  {detalle?.coords_wgs84 && (
                    <> · WGS84 (inicio) {fmtNDash(detalle.coords_wgs84.lat, 6)}, {fmtNDash(detalle.coords_wgs84.lon, 6)}</>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {editable && (
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} disabled={busy} onClick={guardarParams}>
                      Guardar parámetros
                    </button>
                  )}
                  {editable && (
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} disabled={busy} onClick={guardarCartera}>
                      Guardar cartera
                    </button>
                  )}
                  {editable && (
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} disabled={busy} onClick={cerrar}>
                      Cerrar planilla
                    </button>
                  )}
                  {esDev && sellada && (
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} disabled={busy} onClick={reabrir}>
                      Reabrir (Dev)
                    </button>
                  )}
                  {esDev && String(planilla?.estado || '').toLowerCase() === 'validado' && (
                    <button type="button" className="cc-topo-touch-btn" style={ui.btnSecondary} disabled={busy} onClick={revocar}>
                      Revocar validación (Dev)
                    </button>
                  )}
                  
                  {puedeEliminar && planilla?.id && (
                    <button
                      type="button"
                      className="cc-topo-touch-btn"
                      style={{ ...ui.btnSecondary, color: '#b91c1c', borderColor: '#fca5a5' }}
                      disabled={busy}
                      onClick={solicitarEliminar}
                    >
                      Eliminar planilla
                    </button>
                  )}
                  {puedeExportar && (
                    <>
                      <button
                        type="button"
                        className="cc-topo-touch-btn"
                        style={ui.btnSecondary}
                        disabled={!conDatos && !esDev}
                        title={exportPlantillaVacia ? 'Plantilla vacía — solo Desarrollador (verificación de formato)' : undefined}
                        onClick={exportarPdf}
                      >
                        {exportPlantillaVacia ? 'PDF (plantilla)' : 'PDF'}
                      </button>
                      <button
                        type="button"
                        className="cc-topo-touch-btn"
                        style={ui.btnSecondary}
                        disabled={!conDatos && !esDev}
                        title={exportPlantillaVacia ? 'Plantilla vacía — solo Desarrollador (verificación de formato)' : undefined}
                        onClick={exportarExcel}
                      >
                        {exportPlantillaVacia ? 'Excel (plantilla)' : 'Excel'}
                      </button>
                    </>
                  )}
                </div>
                {exportPlantillaVacia && (
                  <div style={{ marginTop: 8, fontSize: 'var(--cc-xs)', color: '#92400e', background: '#fffbeb', padding: '6px 8px', borderRadius: 6 }}>
                    Sin datos diligenciados: como Desarrollador puede descargar PDF/Excel vacíos para verificar formato (sin valores de ejemplo).
                  </div>
                )}
              </div>

              <div
                ref={tableRef}
                onKeyDown={(e) => handleEnterAsTab(e, tableRef.current)}
                style={{ ...cardPad, minWidth: 0 }}
              >
                <div style={sheet.sectionTitle}>Cartera de campo</div>
                <div
                  style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}
                  className="cc-topo-table-scroll"
                >
                  <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: CARTERA_MIN_WIDTH }}>
                    <thead>
                      <tr>
                        <th style={{ ...thCartera, width: 36 }}>#</th>
                        <th style={thCartera}>Abscisa</th>
                        <th style={thCartera}>Terreno Natural</th>
                        <th style={thCartera}>{nivelLabel}</th>
                        <th style={thCartera}>Cota Fondo Excavación</th>
                        <th style={thCarteraCalc}>Altura Excavacion</th>
                        <th style={thCarteraCalc}>Altura Triturado</th>
                        <th style={thCarteraCalc}>Altura Relleno</th>
                        <th style={thCarteraCalc}>Ancho Geotextil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, idx) => {
                        const c = calcFilas[idx] || {}
                        return (
                          <tr key={idx}>
                            <td style={{ ...tdCartera, textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                            {['abscisa', 'terreno_natural', nivelKey, 'cota_fondo_excavacion'].map((k) => (
                              <td key={k} style={tdCarteraEdit}>
                                <input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  disabled={!editable}
                                  value={f[k]}
                                  onChange={(e) => setFila(idx, k, e.target.value)}
                                  style={{
                                    ...inpCartera,
                                    background: editable ? 'transparent' : CALC_CELL_BG,
                                  }}
                                />
                              </td>
                            ))}
                            <td style={tdCarteraCalc}>{fmtNDash(c.altura_excavacion)}</td>
                            <td style={tdCarteraCalc}>{fmtNDash(c.altura_triturado)}</td>
                            <td style={tdCarteraCalc}>{fmtNDash(c.altura_relleno)}</td>
                            <td style={tdCarteraCalc}>{fmtNDash(c.ancho_geotextil)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {isCompact && (
                  <div style={{ marginTop: 6, fontSize: 'var(--cc-xxs)', color: ui.textMuted }}>
                    Deslice horizontalmente para ver todas las columnas (formato hoja de cálculo).
                  </div>
                )}
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
                    className="cc-topo-touch-btn"
                    style={{ ...ui.btnSecondary, marginTop: 8 }}
                    onClick={() => setFilas((prev) => [...prev, filaCampoVacia(prev.length + 1)])}
                  >
                    + Fila
                  </button>
                )}
              </div>

              <div style={layoutCharts}>
                <PlanillaTuberiaSeccionSvg seccionTipica={{ ...(calculo?.seccion_tipica || {}), tipo: params.tipo }} ui={ui} />
                <PlanillaTuberiaPerfil perfil={calculo?.perfil} ui={ui} />
              </div>

              <div style={layoutTables}>
                <div style={cardPad}>
                  <div style={sheet.sectionTitle}>Resumen de Cantidades</div>
                  <div style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch' }} className="cc-topo-table-scroll">
                    <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: 580 }}>
                      <thead>
                        <tr>
                          {['Item', 'Long', 'Ancho', 'Espesor', 'Desc.', 'Cantidad'].map((h, i) => (
                            <th
                              key={h}
                              style={{
                                ...(i === 0 ? thResumenItem : thResumenCalc),
                                background: '#4472C4',
                                color: '#fff',
                                ...(i === 0 ? { textAlign: 'left' } : null),
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(calculo?.netos || []).map((n) => (
                          <tr key={n.codigo}>
                            <td style={tdResumenItem}>{n.nombre}</td>
                            <td style={tdResumenCalc}>{fmtNDash(n.long)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(n.ancho)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(n.espesor)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(n.descuentos)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(n.neto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div style={cardPad}>
                  <div style={sheet.sectionTitle}>Descuentos Específicos</div>
                  <div style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch' }} className="cc-topo-table-scroll">
                    <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: 480 }}>
                      <thead>
                        <tr>
                          {['Item', 'Long', 'Ancho', 'Espesor', 'Cantidad'].map((h, i) => (
                            <th
                              key={h}
                              style={{
                                ...(i === 0 ? thResumenItem : thResumenCalc),
                                background: '#EA4296',
                                color: '#fff',
                                ...(i === 0 ? { textAlign: 'left' } : null),
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(calculo?.descuentos || []).filter((d) => d.nombre).map((d) => (
                          <tr key={d.codigo}>
                            <td style={tdResumenItem}>{d.nombre}</td>
                            <td style={tdResumenCalc}>{fmtNDash(d.long)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(d.ancho)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(d.espesor)}</td>
                            <td style={tdResumenCalc}>{fmtNDash(d.cantidad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...cardPad,
                  display: 'flex',
                  flexDirection: isCompact ? 'column' : 'row',
                  gap: isCompact ? 16 : 24,
                  marginTop: 4,
                }}
              >
                {[
                  { title: 'Elaboró', role: 'Topografo de Obra (Contratista)' },
                  { title: 'Aprobó:', role: 'Topografo Interventoria' },
                ].map((f) => (
                  <div
                    key={f.title}
                    style={{
                      flex: 1,
                      borderTop: `1px solid ${sheet.border}`,
                      paddingTop: 8,
                      minHeight: 56,
                      fontSize: 'var(--cc-xs)',
                      color: ui.textMuted,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: ui.text }}>{f.title}</div>
                    <div>{f.role}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmEliminar && (
        <TopoConfirmModal
          theme={ui.t}
          danger
          titulo={confirmEliminar === 'con_datos' ? 'Eliminar planilla con datos' : 'Eliminar planilla'}
          confirmLabel={busy ? 'Eliminando…' : 'Eliminar'}
          cancelLabel="Cancelar"
          onCancel={() => { if (!busy) setConfirmEliminar(null) }}
          onConfirm={eliminarPlanilla}
          busy={busy}
        >
          {confirmEliminar === 'con_datos' ? (
            <p style={{ margin: 0 }}>
              Esta planilla <strong>ya tiene datos diligenciados en la cartera</strong>.
              Al eliminarla se perderán de forma permanente la cabecera, la cartera,
              los cálculos, las cantidades y los descuentos. Esta acción no se puede deshacer.
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              ¿Eliminar esta planilla vacía? No hay datos de cartera diligenciados.
            </p>
          )}
        </TopoConfirmModal>
      )}

      {pkMapOpen && (
        <BitacoraMaterialUbicacionModal
          t={ui.t}
          token={token}
          contratoId={contratoId}
          pkLabel={params.pk_id || ''}
          costado={params.costado || ''}
          readOnly={!editable}
          onClose={() => setPkMapOpen(false)}
          onConfirm={(loc) => {
            setParams((p) => ({
              ...p,
              pk_id: loc?.ubicacion_pk || '',
              costado: loc?.ubicacion_costado || '',
            }))
            setPkMapOpen(false)
          }}
        />
      )}
    </div>
  )
}
