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

/** Botón de acción compacto (icono + tooltip nativo). */
function AccionIcono({ title, onClick, disabled, danger, primary, children }) {
  return (
    <button
      type="button"
      className="cc-topo-touch-btn"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        border: `1px solid ${danger ? '#fca5a5' : (primary ? 'transparent' : '#cbd5e1')}`,
        background: danger ? '#fff' : (primary ? '#2563eb' : '#fff'),
        color: danger ? '#b91c1c' : (primary ? '#fff' : '#0f172a'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
      }}
    >
      {children}
    </button>
  )
}

const ico = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}



/** Clip fotográfico por línea de cantidad/descuento (data URI local + preview). */
function FotoLineaBtn({ fotos = [], onChange, disabled, label }) {
  const ref = useRef(null)
  const list = Array.isArray(fotos) ? fotos : []
  const addFiles = (fileList) => {
    const readers = Array.from(fileList || []).map((file) => new Promise((resolve) => {
      if (!String(file.type || '').startsWith('image/')) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({
        nombre: file.name || `foto-${Date.now()}.jpg`,
        data_uri: reader.result,
        mime_type: file.type || 'image/jpeg',
        created_at: new Date().toISOString(),
      })
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }))
    Promise.all(readers).then((rows) => {
      const ok = rows.filter(Boolean)
      if (ok.length) onChange?.([...list, ...ok])
    })
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
      <button
        type="button"
        className="cc-topo-touch-btn"
        title={list.length ? `${label || 'Fotos'}: ${list.length}` : `Adjuntar foto — ${label || 'línea'}`}
        aria-label={list.length ? `Fotos (${list.length})` : `Adjuntar foto ${label || ''}`}
        disabled={disabled && !list.length}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) ref.current?.click()
        }}
        style={{
          width: 32,
          height: 32,
          minWidth: 32,
          minHeight: 32,
          padding: 0,
          borderRadius: 8,
          border: `1px solid ${list.length ? '#86efac' : '#cbd5e1'}`,
          background: list.length ? '#f0fdf4' : '#fff',
          color: list.length ? '#166534' : '#64748b',
          fontSize: 12,
          fontWeight: 700,
          cursor: disabled && !list.length ? 'default' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {list.length ? list.length : ''}
      </button>
      {list.length > 0 && !disabled && (
        <button
          type="button"
          title="Quitar última foto"
          aria-label="Quitar última foto"
          onClick={(e) => {
            e.stopPropagation()
            onChange?.(list.slice(0, -1))
          }}
          style={{
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            color: '#b91c1c',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export default function PlanillaTuberiaForm({ contratoId, token, permisos, usuario }) {
  const ui = useTopoTheme()
  const sheet = useMemo(() => topoSheetStyles(ui.t), [ui.t])
  const { isCompact } = useTopoViewport()
  const { api, downloadPdf, downloadExcel } = useTopografiaApi(contratoId, token)
  const esDev = esDesarrolladorTopo(usuario)
  const editablePerm = puede(permisos, 'editar')

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
  const [lista, setLista] = useState([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null) // null | 'vacia' | 'con_datos'
  const [pkMapOpen, setPkMapOpen] = useState(false)
  /** Overrides Long/Ancho/Espesor (+nombre OTROS) del Resumen de Cantidades. */
  const [cantManuales, setCantManuales] = useState([])
  /** { cantidades: {CODIGO: [foto…]}, descuentos: {CODIGO: [foto…]} } */
  const [fotosLineas, setFotosLineas] = useState({ cantidades: {}, descuentos: {} })
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
    const meta = (p.meta_cabecera && typeof p.meta_cabecera === 'object') ? p.meta_cabecera : {}
    setCantManuales(Array.isArray(meta.cantidades_manuales) ? meta.cantidades_manuales : [])
    const fl = meta.fotos_lineas && typeof meta.fotos_lineas === 'object' ? meta.fotos_lineas : {}
    setFotosLineas({
      cantidades: (fl.cantidades && typeof fl.cantidades === 'object') ? fl.cantidades : {},
      descuentos: (fl.descuentos && typeof fl.descuentos === 'object') ? fl.descuentos : {},
    })
  }, [])

  const abrir = async (id) => {
    setErr(''); setMsg(''); setBusy(true)
    try {
      aplicarDetalle(await api(`/planillas-tuberia/${id}`))
      setEditorOpen(true)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const volverAlListado = (mensaje = '') => {
    setEditorOpen(false)
    setDetalle(null)
    setMsg(mensaje || '')
    setErr('')
    setInfos([])
    setCantManuales([])
    setFotosLineas({ cantidades: {}, descuentos: {} })
    setFilas(Array.from({ length: FILAS_INICIALES_CARTERA }, (_, i) => filaCampoVacia(i + 1)))
    setParams((p) => ({
      ...p,
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
    }))
    setVersion(1)
    cargarLista().catch(() => {})
  }

  const fmtFechaLista = (iso) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return '—'
      return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return '—'
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
      setEditorOpen(true)
      setMsg('Planilla creada.')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }


  const metaCabeceraActual = () => {
    const prev = (planilla?.meta_cabecera && typeof planilla.meta_cabecera === 'object')
      ? planilla.meta_cabecera
      : {}
    return { ...prev, cantidades_manuales: cantManuales, fotos_lineas: fotosLineas }
  }

  const overrideCantidad = (codigo) => (
    (cantManuales || []).find((c) => String(c.codigo || '').toUpperCase() === codigo) || null
  )

  const setOverrideCantidad = (codigo, patch) => {
    setCantManuales((prev) => {
      const list = Array.isArray(prev) ? [...prev] : []
      const idx = list.findIndex((c) => String(c.codigo || '').toUpperCase() === codigo)
      const base = idx >= 0 ? { ...list[idx] } : { codigo }
      const next = { ...base, ...patch, codigo }
      // Limpiar claves vacías de dims
      ;['long', 'ancho', 'espesor'].forEach((k) => {
        if (next[k] === '' || next[k] == null) delete next[k]
      })
      if (idx >= 0) list[idx] = next
      else list.push(next)
      return list
    })
  }

  const cantidadDesdeDims = (long, ancho, espesor) => {
    const xs = [long, ancho, espesor]
      .map((v) => (v === '' || v == null ? null : Number(v)))
      .filter((v) => v != null && !Number.isNaN(v))
    if (!xs.length) return 0
    return Math.round(xs.reduce((a, b) => a * b, 1) * 100) / 100
  }

  const cellValCant = (n, key) => {
    const ov = overrideCantidad(n.codigo)
    if (ov && Object.prototype.hasOwnProperty.call(ov, key) && ov[key] != null && ov[key] !== '') {
      return ov[key]
    }
    return n[key] ?? ''
  }

  const displayNetoCant = (n) => {
    if (!n?.editable_dims) return n?.neto
    const long = cellValCant(n, 'long')
    const ancho = cellValCant(n, 'ancho')
    const espesor = cellValCant(n, 'espesor')
    return cantidadDesdeDims(long, ancho, espesor)
  }

  const displayNombreCant = (n) => {
    if (!n?.editable_nombre) return n?.nombre
    const ov = overrideCantidad(n.codigo)
    if (ov && ov.nombre != null && String(ov.nombre).trim() !== '') {
      const nom = String(ov.nombre).trim()
      return nom.toLowerCase().startsWith('otros') ? nom : `Otros: ${nom}`
    }
    return n?.nombre || 'Otros: ____'
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
        meta_cabecera: metaCabeceraActual(),
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


  const fotosDeLinea = (grupo, codigo) => {
    const bag = fotosLineas?.[grupo] || {}
    const arr = bag[codigo]
    return Array.isArray(arr) ? arr : []
  }

  const setFotosDeLinea = (grupo, codigo, fotos) => {
    setFotosLineas((prev) => ({
      ...prev,
      [grupo]: {
        ...(prev?.[grupo] || {}),
        [codigo]: Array.isArray(fotos) ? fotos : [],
      },
    }))
  }

  const lineasSinFoto = () => {
    const faltantes = []
    for (const n of (calculo?.netos || [])) {
      const cant = Number(displayNetoCant(n))
      if (!Number.isFinite(cant) || Math.abs(cant) < 1e-9) continue
      if (fotosDeLinea('cantidades', n.codigo).length < 1) {
        faltantes.push(`Cantidades · ${displayNombreCant(n)}`)
      }
    }
    for (const d of (calculo?.descuentos || []).filter((x) => x.nombre)) {
      const cant = Number(d.cantidad)
      if (!Number.isFinite(cant) || Math.abs(cant) < 1e-9) continue
      if (fotosDeLinea('descuentos', d.codigo).length < 1) {
        faltantes.push(`Descuentos · ${d.nombre}`)
      }
    }
    return faltantes
  }

  const guardarCartera = async () => {
    if (!planilla?.id) return
    setErr(''); setMsg('')
    const faltan = lineasSinFoto()
    if (faltan.length) {
      setErr(
        `Registro fotográfico obligatorio: adjunte al menos una foto en: ${faltan.join('; ')}.`,
      )
      return
    }
    setBusy(true)
    try {
      const filasPayload = payloadFilas(filas, params.tipo)
      const res = await api(`/planillas-tuberia/${planilla.id}/cartera`, {
        method: 'PUT',
        body: JSON.stringify({
          version,
          filas: filasPayload,
          descuentos_manuales: [],
          cantidades_manuales: cantManuales,
          fotos_lineas: fotosLineas,
        }),
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
    const teniaDatos = conDatos
    try {
      await api(`/planillas-tuberia/${planilla.id}`, { method: 'DELETE' })
      setConfirmEliminar(null)
      volverAlListado(teniaDatos
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

  const layoutMain = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
  const layoutCharts = isCompact
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(280px, 1.2fr)', gap: 12 }
  const layoutTables = isCompact
    ? { display: 'flex', flexDirection: 'column', gap: 12 }
    : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }


  const cardPad = isCompact ? { ...ui.card, padding: 12 } : ui.card
  const tipoSelectStyle = {
    ...sheet.cellSelect,
    border: `1px solid ${sheet.border}`,
    borderRadius: 6,
    minWidth: 140,
    height: 36,
    background: ui.t?.inputBg || '#fff',
  }

  const cambiarTipo = (nuevo) => {

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
          
  }

  const thLista = {
    ...sheet.th,
    textAlign: 'left',
    padding: '6px 8px',
    background: '#B0B0B0',
    color: '#1e293b',
    whiteSpace: 'nowrap',
  }
  const tdLista = {
    ...sheet.td,
    padding: '6px 8px',
    fontSize: 'var(--cc-sm)',
  }

  const editorContent = planilla ? (
<>
  <div style={cardPad}>
    <TopoExcelSheet
      sheet={sheet}
      title="Cabecera / tramo"
      titleRight={(
        <div
          role="toolbar"
          aria-label="Acciones de planilla"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: isCompact ? 6 : 8,
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {editable && (
            <AccionIcono title="Guardar parámetros" disabled={busy} onClick={guardarParams}>
              <svg {...ico}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            </AccionIcono>
          )}
          {editable && (
            <AccionIcono title="Guardar cartera" primary disabled={busy} onClick={guardarCartera}>
              <svg {...ico}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            </AccionIcono>
          )}
          {editable && (
            <AccionIcono title="Cerrar planilla" disabled={busy} onClick={cerrar}>
              <svg {...ico}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </AccionIcono>
          )}
          {esDev && sellada && (
            <AccionIcono title="Reabrir (Dev)" disabled={busy} onClick={reabrir}>
              <svg {...ico}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
            </AccionIcono>
          )}
          {esDev && String(planilla?.estado || '').toLowerCase() === 'validado' && (
            <AccionIcono title="Revocar validación (Dev)" disabled={busy} onClick={revocar}>
              <svg {...ico}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </AccionIcono>
          )}
          {puedeEliminar && planilla?.id && (
            <AccionIcono title="Eliminar planilla" danger disabled={busy} onClick={solicitarEliminar}>
              <svg {...ico}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </AccionIcono>
          )}
          {puedeExportar && (
            <>
              <AccionIcono
                title={exportPlantillaVacia ? 'PDF (plantilla vacía — solo Desarrollador)' : 'Exportar PDF'}
                disabled={!conDatos && !esDev}
                onClick={exportarPdf}
              >
                <svg {...ico}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6" /><path d="M9 11h6" /></svg>
              </AccionIcono>
              <AccionIcono
                title={exportPlantillaVacia ? 'Excel (plantilla vacía — solo Desarrollador)' : 'Exportar Excel'}
                disabled={!conDatos && !esDev}
                onClick={exportarExcel}
              >
                <svg {...ico}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h2l4 5h2" /><path d="M16 13h-2l-4 5H8" /></svg>
              </AccionIcono>
            </>
          )}
        </div>
      )}
      minWidth={960}
      rows={[
        {
          key: 'tramo',
          columns: [
            { key: 'nombre', label: 'Nombre', width: '16%' },
            { key: 'pk_id', label: 'PK / ID', width: '12%' },
            { key: 'costado', label: 'Costado', width: '10%' },
            { key: 'diametro_m', label: 'Ø (m)', width: '8%' },
            { key: 'espesor_m', label: 'Espesor', width: '8%' },
            { key: 'ancho_excavacion_m', label: 'Ancho B', width: '10%' },
            { key: 'relacion_atraque', label: 'Rel. atraque', width: '10%' },
            { key: 'material', label: 'Material', width: '14%' },
          ],
          cells: [
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
          ],
        },
        {
          key: 'coords',
          columns: [
            { key: 'norte_abs_inicial', label: 'Norte Abs Inicial' },
            { key: 'este_abs_inicial', label: 'Este Abs Inicial' },
            { key: 'norte_abs_final', label: 'Norte Abs Final' },
            { key: 'este_abs_final', label: 'Este Abs Final' },
          ],
          cells: [
            <input key="nIni" type="number" step="any" disabled={!editable} value={params.norte_abs_inicial} onChange={(e) => setParams((p) => ({ ...p, norte_abs_inicial: e.target.value }))} style={sheet.cellInp} />,
            <input key="eIni" type="number" step="any" disabled={!editable} value={params.este_abs_inicial} onChange={(e) => setParams((p) => ({ ...p, este_abs_inicial: e.target.value }))} style={sheet.cellInp} />,
            <input key="nFin" type="number" step="any" disabled={!editable} value={params.norte_abs_final} onChange={(e) => setParams((p) => ({ ...p, norte_abs_final: e.target.value }))} style={sheet.cellInp} />,
            <input key="eFin" type="number" step="any" disabled={!editable} value={params.este_abs_final} onChange={(e) => setParams((p) => ({ ...p, este_abs_final: e.target.value }))} style={sheet.cellInp} />,
          ],
        },
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
              {['Item', 'Long', 'Ancho', 'Espesor', 'Desc.', 'Cantidad', 'Foto'].map((h, i) => (
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
            {(calculo?.netos || []).map((n) => {
              const editDims = !!n.editable_dims && editable
              const editNom = !!n.editable_nombre && editable
              const inpStyle = {
                ...sheet.cellInp,
                height: RESUMEN_ROW_HEIGHT,
                padding: '1px 3px',
                textAlign: 'right',
                fontFamily: 'ui-monospace, Consolas, monospace',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                background: editDims ? 'transparent' : undefined,
              }
              return (
                <tr key={n.codigo}>
                  <td style={tdResumenItem}>
                    {editNom ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: '100%' }}>
                        <span>Otros:</span>
                        <input
                          disabled={!editable}
                          value={overrideCantidad('OTROS')?.nombre ?? ''}
                          placeholder="____"
                          onChange={(e) => setOverrideCantidad('OTROS', { nombre: e.target.value })}
                          style={{ ...sheet.cellInp, height: RESUMEN_ROW_HEIGHT, padding: '1px 3px', textAlign: 'left', flex: 1 }}
                        />
                      </span>
                    ) : displayNombreCant(n)}
                  </td>
                  {['long', 'ancho', 'espesor'].map((k) => (
                    <td key={k} style={editDims ? { ...tdResumenCalc, padding: 0 } : tdResumenCalc}>
                      {editDims ? (
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          disabled={!editable}
                          value={cellValCant(n, k)}
                          onChange={(e) => setOverrideCantidad(n.codigo, { [k]: e.target.value })}
                          style={inpStyle}
                        />
                      ) : fmtNDash(n[k])}
                    </td>
                  ))}
                  <td style={tdResumenCalc}>{fmtNDash(n.descuentos)}</td>
                  <td style={tdResumenCalc}>{fmtNDash(displayNetoCant(n))}</td>
                <td style={{ ...tdResumenCalc, textAlign: 'center', padding: 2 }}>
                    <FotoLineaBtn
                      label={displayNombreCant(n)}
                      fotos={fotosDeLinea('cantidades', n.codigo)}
                      disabled={!editable}
                      onChange={(fotos) => setFotosDeLinea('cantidades', n.codigo, fotos)}
                    />
                  </td>
                </tr>
              )
            })}
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
              {['Item', 'Long', 'Ancho', 'Espesor', 'Cantidad', 'Foto'].map((h, i) => (
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
              <td style={{ ...tdResumenCalc, textAlign: 'center', padding: 2 }}>
                  <FotoLineaBtn
                    label={d.nombre}
                    fotos={fotosDeLinea('descuentos', d.codigo)}
                    disabled={!editable}
                    onChange={(fotos) => setFotosDeLinea('descuentos', d.codigo, fotos)}
                  />
                </td>
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
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ ...cardPad, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: isCompact ? 'var(--cc-base)' : undefined }}>Planillas de Tubería</strong>
        <select
          value={params.tipo}
          disabled={busy || (editorOpen && !!planilla && !editable)}
          onChange={(e) => cambiarTipo(e.target.value)}
          style={tipoSelectStyle}
          title="Tipo de planilla para nueva creación"
        >
          {TIPOS_PLANILLA.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {puede(permisos, 'crear') && (
          <button type="button" className="cc-topo-touch-btn" style={ui.btnPrimary} disabled={busy || editorOpen} onClick={crear}>
            Nueva planilla
          </button>
        )}
        <button
          type="button"
          className="cc-topo-touch-btn"
          style={ui.btnSecondary}
          disabled={busy}
          onClick={() => cargarLista().catch((e) => setErr(e.message))}
          title="Actualizar listado"
        >
          Actualizar
        </button>
      </div>

      {!editorOpen && err && <div style={{ color: '#dc2626', padding: 8, background: '#fef2f2', borderRadius: 8 }}>{err}</div>}
      {!editorOpen && msg && <div style={{ color: '#166534', padding: 8, background: '#f0fdf4', borderRadius: 8 }}>{msg}</div>}

      <div style={{ ...cardPad, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Planillas del contrato</div>
        <div
          style={{ ...sheet.sheetWrap, WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}
          className="cc-topo-table-scroll"
        >
          <table style={{ ...sheet.sheetTable, tableLayout: 'auto', minWidth: 560, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thLista, width: 48, textAlign: 'center' }}>No.</th>
                <th style={thLista}>Nombre Planilla</th>
                <th style={thLista}>Fecha de generada</th>
                <th style={thLista}>Quien Validó por última vez</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p, idx) => (
                <tr
                  key={p.id}
                  onClick={() => !busy && abrir(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!busy) abrir(p.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  title={`Abrir «${p.nombre || p.tipo}»`}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  <td style={{ ...tdLista, textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ ...tdLista, fontWeight: 600 }}>
                    {p.nombre || p.tipo}
                    <span style={{ display: 'block', fontWeight: 400, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
                      {p.tipo} · {p.estado}{p.pk_id ? ` · ${p.pk_id}` : ''}
                    </span>
                  </td>
                  <td style={tdLista}>{fmtFechaLista(p.created_at)}</td>
                  <td style={tdLista}>{p.validado_por_nombre || '—'}</td>
                </tr>
              ))}
              {!lista.length && (
                <tr>
                  <td colSpan={4} style={{ ...tdLista, color: ui.textMuted, textAlign: 'center' }}>
                    Sin planillas aún. Use «Nueva planilla» para crear la primera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editorOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100030,
            background: ui.t?.overlay || 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: isCompact ? 'stretch' : 'flex-start',
            justifyContent: 'center',
            padding: isCompact ? 0 : 16,
            overflowY: 'auto',
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="planilla-tuberia-editor-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: isCompact ? '100%' : 'min(98vw, 1400px)',
              minHeight: isCompact ? '100%' : undefined,
              maxHeight: isCompact ? '100dvh' : undefined,
              margin: isCompact ? 0 : '24px auto',
              background: ui.card?.background || '#fff',
              borderRadius: isCompact ? 0 : 14,
              border: ui.card?.border || `1px solid ${ui.t?.border || '#e2e8f0'}`,
              boxShadow: ui.t?.shadow || '0 24px 64px rgba(0,0,0,0.25)',
              color: ui.text,
              padding: isCompact ? 12 : 16,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              overflowY: isCompact ? 'auto' : undefined,
              WebkitOverflowScrolling: isCompact ? 'touch' : undefined,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="cc-topo-touch-btn"
                style={ui.btnSecondary}
                disabled={busy}
                onClick={() => volverAlListado()}
                title="Volver al listado de planillas"
              >
                ← Volver al listado
              </button>
              <strong id="planilla-tuberia-editor-title" style={{ fontSize: isCompact ? 'var(--cc-base)' : undefined }}>
                {planilla?.nombre || planilla?.tipo || 'Planilla de Tubería'}
              </strong>
              <select
                value={params.tipo}
                disabled={!!planilla && !editable}
                onChange={(e) => cambiarTipo(e.target.value)}
                style={tipoSelectStyle}
              >
                {TIPOS_PLANILLA.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              {editorContent || (
                <div style={{ ...cardPad, color: ui.textMuted }}>Cargando planilla…</div>
              )}
            </div>
          </div>
        </div>
      )}

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
