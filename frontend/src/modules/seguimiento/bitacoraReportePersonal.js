/**
 * Resumen completo de Bitácora (diario + eventos embebidos):
 * tablas por sección (Personal, Maquinaria, Materiales/vales, Eventos,
 * Recorridos, Actividades, Clima, Observaciones, Adjuntos, …).
 * Personal/Maquinaria se agrupan Tramo × Empresa; el resto en tablas propias.
 * Nuevas secciones se registran en SECTION_BUILDERS sin tocar el botón.
 */

import { labelClima, labelEventoTipo } from './bitacoraConstants.js'
import { labelTramoBitacora, normalizeTramoValue } from './bitacoraTramoHelpers.js'
import { htmlToPlainText, isRichTextEmpty } from './richTextUtils.js'
import { visitantesFromDetalle } from './visitantesEventoHelpers.js'
import {
  EMPRESA_SIN_NOMBRE,
  esEtiquetaAdministrativoExcluida,
  estadoCuentaEnResumen,
  keyEmpresa,
  nombreCompletoRrhh,
  nombreEmpresaAsistencia,
  normalizeEstadoRrhh,
  normalizarCargoNombrePropio,
} from './personalAsistenciaHelpers.js'

/** Empresa del operador de una fila de maquinaria vía catálogo RRHH. */
export function empresaDeOperadorUso(uso, rrhhCatalogo = []) {
  let tid = null
  try {
    tid = uso?.operador_rrhh_id != null && uso.operador_rrhh_id !== ''
      ? Number(uso.operador_rrhh_id)
      : null
    if (!Number.isFinite(tid)) tid = null
  } catch { tid = null }

  const list = Array.isArray(rrhhCatalogo) ? rrhhCatalogo : []
  if (tid != null) {
    const t = list.find((x) => Number(x?.id) === tid)
    if (t) {
      const n = String(t.empresa_nombre || '').trim()
      return n || EMPRESA_SIN_NOMBRE
    }
  }

  const nombre = String(uso?.operador || '').trim().toLowerCase()
  if (nombre) {
    const t = list.find((x) => nombreCompletoRrhh(x).toLowerCase() === nombre)
    if (t) {
      const n = String(t.empresa_nombre || '').trim()
      return n || EMPRESA_SIN_NOMBRE
    }
  }
  return EMPRESA_SIN_NOMBRE
}

/**
 * Mapa empresa_key → logo_url desde opciones RRHH + logo del contratista del contrato.
 */
export function resolveLogosPorEmpresa({ empresasOpciones = [], contrato = {} } = {}) {
  const out = {}
  for (const e of Array.isArray(empresasOpciones) ? empresasOpciones : []) {
    const nombre = String(e?.nombre || '').trim()
    const url = String(e?.logo_url || '').trim()
    if (nombre && url) out[keyEmpresa(nombre)] = url
  }
  const contratista = String(contrato?.contratista || '').trim()
  const logo = String(contrato?.logo_contratista || '').trim()
  if (contratista && logo) {
    const ek = keyEmpresa(contratista)
    if (!out[ek]) out[ek] = logo
  }
  return out
}

function emptyCell() {
  return { personal: 0, maquinaria: 0 }
}

function cantidadMaquinaria(uso) {
  const c = uso?.cantidad
  if (c === '' || c == null) return 1
  const n = Number(c)
  if (!Number.isFinite(n) || n <= 0) return 1
  return n
}

function cantidadMaterial(m) {
  const c = m?.cantidad
  if (c === '' || c == null) return 1
  const n = Number(c)
  if (!Number.isFinite(n) || n <= 0) return 1
  return n
}

export const SIN_TIPO_MATERIAL_LABEL = 'Sin tipo'

function materialRowActiva(m) {
  if (!m || typeof m !== 'object') return false
  const tipo = String(m.tipo_material || '').trim()
  const prov = String(m.proveedor || '').trim()
  const placa = String(m.placa || '').trim()
  const cant = m.cantidad
  const hasCant = cant !== '' && cant != null && Number.isFinite(Number(cant)) && Number(cant) > 0
  return Boolean(tipo || prov || placa || hasCant)
}

function labelTipoMaterial(raw) {
  const n = String(raw || '').trim()
  return n || SIN_TIPO_MATERIAL_LABEL
}

function keyTipoMaterial(raw) {
  const n = String(raw || '').trim().toLowerCase()
  return n || '__sin_tipo__'
}

function sortEmpresas(a, b) {
  if (a.key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return 1
  if (b.key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return -1
  return a.nombre.localeCompare(b.nombre, 'es')
}

function sortTramos(a, b) {
  if (a.key === '__sin_tramo__') return 1
  if (b.key === '__sin_tramo__') return -1
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
}

function buildEmpresaTramoMatrix(rows, {
  logosByEmpresaKey = {},
  field,
} = {}) {
  /** @type {Map<string, { key: string, nombre: string }>} */
  const tramoMap = new Map()
  /** @type {Map<string, { key: string, nombre: string, logo_url: string|null }>} */
  const empresaMap = new Map()
  /** @type {Map<string, Map<string, number>>} */
  const cells = new Map()

  const ensureTramo = (raw) => {
    const nombre = labelTramoBitacora(raw)
    const key = normalizeTramoValue(raw) ? String(normalizeTramoValue(raw)) : '__sin_tramo__'
    if (!tramoMap.has(key)) tramoMap.set(key, { key, nombre })
    return key
  }

  const ensureEmpresa = (empresaNombre) => {
    const nombre = String(empresaNombre || '').trim() || EMPRESA_SIN_NOMBRE
    const key = keyEmpresa(nombre)
    if (!empresaMap.has(key)) {
      const logo = logosByEmpresaKey?.[key] || logosByEmpresaKey?.[nombre] || null
      empresaMap.set(key, {
        key,
        nombre,
        logo_url: logo ? String(logo) : null,
      })
    }
    return key
  }

  const bump = (tramoKey, empresaKey, delta) => {
    if (!cells.has(tramoKey)) cells.set(tramoKey, new Map())
    const row = cells.get(tramoKey)
    row.set(empresaKey, (row.get(empresaKey) || 0) + delta)
  }

  for (const r of rows) {
    bump(ensureTramo(r.tramo), ensureEmpresa(r.empresa), r.delta)
  }

  const tramos = [...tramoMap.values()].sort(sortTramos)
  const empresas = [...empresaMap.values()].sort(sortEmpresas)

  /** @type {Record<string, Record<string, number>>} */
  const cellObj = {}
  /** @type {Record<string, number>} */
  const rowTotals = {}
  /** @type {Record<string, number>} */
  const colTotals = {}
  let grandTotal = 0

  for (const emp of empresas) colTotals[emp.key] = 0

  for (const tr of tramos) {
    cellObj[tr.key] = {}
    rowTotals[tr.key] = 0
    for (const emp of empresas) {
      const n = cells.get(tr.key)?.get(emp.key) || 0
      cellObj[tr.key][emp.key] = n
      rowTotals[tr.key] += n
      colTotals[emp.key] += n
      grandTotal += n
    }
  }

  return {
    field: field || null,
    tramos,
    empresas,
    cells: cellObj,
    rowTotals,
    colTotals,
    grandTotal,
    hasData: grandTotal > 0,
  }
}

function buildMaterialesMatrix(materiales = []) {
  /** @type {Map<string, { key: string, tipo: string, tipoKey: string, tramo: string, tramoKey: string, ingreso: number, salida: number }>} */
  const rowMap = new Map()

  for (const m of Array.isArray(materiales) ? materiales : []) {
    if (!materialRowActiva(m)) continue
    const tipoKey = keyTipoMaterial(m?.tipo_material)
    const tipo = labelTipoMaterial(m?.tipo_material)
    const tramoNorm = normalizeTramoValue(m?.tramo)
    const tramoKey = tramoNorm ? String(tramoNorm) : '__sin_tramo__'
    const tramo = labelTramoBitacora(m?.tramo)
    const key = `${tipoKey}||${tramoKey}`
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        key,
        tipo,
        tipoKey,
        tramo,
        tramoKey,
        ingreso: 0,
        salida: 0,
      })
    }
    const row = rowMap.get(key)
    const delta = cantidadMaterial(m)
    if (String(m?.movimiento || '').toLowerCase() === 'salida') row.salida += delta
    else row.ingreso += delta
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.tipoKey === '__sin_tipo__' && b.tipoKey !== '__sin_tipo__') return 1
    if (b.tipoKey === '__sin_tipo__' && a.tipoKey !== '__sin_tipo__') return -1
    const byTipo = a.tipo.localeCompare(b.tipo, 'es')
    if (byTipo !== 0) return byTipo
    if (a.tramoKey === '__sin_tramo__') return 1
    if (b.tramoKey === '__sin_tramo__') return -1
    return a.tramo.localeCompare(b.tramo, 'es', { numeric: true })
  })

  const colTotals = { ingreso: 0, salida: 0 }
  for (const r of rows) {
    colTotals.ingreso += r.ingreso
    colTotals.salida += r.salida
  }
  const grandTotal = { ingreso: colTotals.ingreso, salida: colTotals.salida }

  return {
    rows,
    colTotals,
    grandTotal,
    hasData: rows.length > 0,
  }
}

/**
 * Tablas separadas Tramo × Empresa (Personal / Maquinaria) + Materiales (Ingreso/Salida).
 *
 * Conserva `cells` / totales combinados `{personal,maquinaria}` por compatibilidad.
 */
export function buildResumenTramoEmpresa({
  asistencia = [],
  usos = [],
  materiales = [],
  rrhhCatalogo = [],
  logosByEmpresaKey = {},
} = {}) {
  const personalRows = []
  for (const r of Array.isArray(asistencia) ? asistencia : []) {
    const nombre = String(r?.nombre || '').trim()
    if (!nombre) continue
    const estado = normalizeEstadoRrhh(r?.estado)
    if (!estadoCuentaEnResumen(estado)) continue
    const cargo = normalizarCargoNombrePropio(r?.cargo || '')
    if (cargo && esEtiquetaAdministrativoExcluida(cargo)) continue
    personalRows.push({
      tramo: r?.tramo,
      empresa: nombreEmpresaAsistencia(r),
      delta: 1,
    })
  }

  const maquinariaRows = []
  for (const u of Array.isArray(usos) ? usos : []) {
    const equipo = String(u?.equipo_nombre || '').trim()
    if (!equipo) continue
    maquinariaRows.push({
      tramo: u?.tramo,
      empresa: empresaDeOperadorUso(u, rrhhCatalogo),
      delta: cantidadMaquinaria(u),
    })
  }

  const personal = buildEmpresaTramoMatrix(personalRows, {
    logosByEmpresaKey,
    field: 'personal',
  })
  const maquinaria = buildEmpresaTramoMatrix(maquinariaRows, {
    logosByEmpresaKey,
    field: 'maquinaria',
  })
  const materialesTabla = buildMaterialesMatrix(materiales)

  // Matriz combinada (compat tests / callers legacy).
  /** @type {Map<string, { key: string, nombre: string }>} */
  const tramoMap = new Map()
  /** @type {Map<string, { key: string, nombre: string, logo_url: string|null }>} */
  const empresaMap = new Map()
  for (const tr of [...personal.tramos, ...maquinaria.tramos]) {
    if (!tramoMap.has(tr.key)) tramoMap.set(tr.key, tr)
  }
  for (const emp of [...personal.empresas, ...maquinaria.empresas]) {
    if (!empresaMap.has(emp.key)) empresaMap.set(emp.key, emp)
  }
  const tramos = [...tramoMap.values()].sort(sortTramos)
  const empresas = [...empresaMap.values()].sort(sortEmpresas)

  /** @type {Record<string, Record<string, { personal: number, maquinaria: number }>>} */
  const cellObj = {}
  /** @type {Record<string, { personal: number, maquinaria: number }>} */
  const rowTotals = {}
  /** @type {Record<string, { personal: number, maquinaria: number }>} */
  const colTotals = {}
  const grandTotal = emptyCell()

  for (const emp of empresas) colTotals[emp.key] = emptyCell()

  for (const tr of tramos) {
    cellObj[tr.key] = {}
    rowTotals[tr.key] = emptyCell()
    for (const emp of empresas) {
      const p = personal.cells[tr.key]?.[emp.key] || 0
      const m = maquinaria.cells[tr.key]?.[emp.key] || 0
      const cell = { personal: p, maquinaria: m }
      cellObj[tr.key][emp.key] = cell
      rowTotals[tr.key].personal += p
      rowTotals[tr.key].maquinaria += m
      colTotals[emp.key].personal += p
      colTotals[emp.key].maquinaria += m
      grandTotal.personal += p
      grandTotal.maquinaria += m
    }
  }

  return {
    personal,
    maquinaria,
    materiales: materialesTabla,
    tramos,
    empresas,
    cells: cellObj,
    rowTotals,
    colTotals,
    grandTotal,
  }
}

/** @deprecated Preferir buildResumenTramoEmpresa. Conservado por compat de imports. */
export function buildReportePersonalPorEmpresa(opts = {}) {
  const resumen = buildResumenTramoEmpresa(opts)
  return resumen.empresas.map((emp) => ({
    empresa: emp.nombre,
    empresa_key: emp.key,
    logo_url: emp.logo_url,
    personal: [],
    maquinaria: [],
    personal_count: resumen.colTotals[emp.key]?.personal || 0,
    maquinaria_count: resumen.colTotals[emp.key]?.maquinaria || 0,
  }))
}

/** Título visible del resumen. */
export function tituloReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  return f
    ? `Resumen de bitácora · ${f}`
    : 'Resumen de bitácora'
}

/** Formatea ISO date a dd/mm/yyyy si aplica. */
export function formatearFechaReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return f
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Nombre de archivo PNG sugerido (fallback interno; el flujo principal solo copia). */
export function nombreArchivoResumenPng(fecha) {
  const f = String(fecha || '').trim().slice(0, 10) || 'dia'
  return `resumen-bitacora-${f}.png`
}

function textoCorto(htmlOrText, max = 280) {
  const plain = htmlToPlainText(htmlOrText || '').replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1)}…`
}

function buildMaterialesDetalle(materiales = []) {
  const rows = []
  for (const m of Array.isArray(materiales) ? materiales : []) {
    if (!materialRowActiva(m)) continue
    const movimiento = String(m?.movimiento || '').toLowerCase() === 'salida' ? 'Salida' : 'Ingreso'
    rows.push({
      movimiento,
      tipo: labelTipoMaterial(m?.tipo_material),
      cantidad: cantidadMaterial(m),
      tramo: labelTramoBitacora(m?.tramo),
      proveedor: String(m?.proveedor || '').trim() || '—',
      placa: String(m?.placa || '').trim() || '—',
      vales: String(m?.numeros_vale || '').trim() || '—',
      ubicacion: String(m?.ubicacion_pk || '').trim() || '—',
    })
  }
  return { rows, hasData: rows.length > 0 }
}

function buildEventosTabla(eventos = []) {
  const rows = []
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev || typeof ev !== 'object') continue
    const tipo = String(ev.evento_tipo || '').trim() || 'reporte_actividades'
    const det = ev.evento_detalle && typeof ev.evento_detalle === 'object' ? ev.evento_detalle : {}
    const partes = []
    const cuerpo = textoCorto(ev.cuerpo_html)
    if (cuerpo) partes.push(cuerpo)
    if (tipo === 'incidente_sst') {
      const desc = String(det.descripcion_incidente || '').trim()
      const lugar = String(det.lugar || '').trim()
      if (desc) partes.push(desc)
      if (lugar) partes.push(`Lugar: ${lugar}`)
      if (det.gravedad) partes.push(`Gravedad: ${det.gravedad}`)
    }
    if (tipo === 'visita_terceros') {
      const entidad = String(det.entidad || '').trim()
      const motivo = String(det.motivo || '').trim()
      if (entidad) partes.push(`Entidad: ${entidad}`)
      if (motivo) partes.push(`Motivo: ${motivo}`)
    }
    const resumen = partes.join(' · ') || '—'
    rows.push({
      tipo: labelEventoTipo(tipo),
      dirigido_a: String(ev.dirigido_a || '').trim() || '—',
      resumen,
    })
  }
  return { rows, hasData: rows.length > 0 }
}

function buildRecorridosTabla(eventos = []) {
  const rows = []
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev || String(ev.evento_tipo || '') !== 'visita_terceros') continue
    const det = ev.evento_detalle && typeof ev.evento_detalle === 'object' ? ev.evento_detalle : {}
    const lista = visitantesFromDetalle(det)
    const entidad = String(det.entidad || '').trim() || '—'
    const motivo = String(det.motivo || '').trim() || '—'
    for (const v of lista) {
      const nombre = String(v?.nombre || '').trim()
      if (!nombre) continue
      rows.push({
        nombre,
        cargo: String(v?.cargo || '').trim() || '—',
        entidad,
        motivo,
        dirigido_a: String(ev.dirigido_a || '').trim() || '—',
      })
    }
  }
  return { rows, hasData: rows.length > 0 }
}

function buildActividadesTabla(eventos = []) {
  const rows = []
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev) continue
    const det = ev.evento_detalle && typeof ev.evento_detalle === 'object' ? ev.evento_detalle : {}
    const acts = Array.isArray(det.actividades) ? det.actividades : []
    const tipoLabel = labelEventoTipo(ev.evento_tipo)
    for (const a of acts) {
      const actividad = String(a?.actividad || '').trim()
      if (!actividad) continue
      rows.push({
        origen: tipoLabel,
        actividad,
        abs: [a?.abs_inicio, a?.abs_fin].filter(Boolean).join(' – ') || '—',
        tramo: String(a?.ubicacion_tramo || '').trim() || '—',
        pk: String(a?.ubicacion_pk || '').trim() || '—',
        cantidad: a?.cantidad != null && a.cantidad !== '' ? String(a.cantidad) : '—',
        observacion: String(a?.observacion || '').trim() || '—',
      })
    }
  }
  return { rows, hasData: rows.length > 0 }
}

function buildClimaKv(clima = {}, horaInicio = '') {
  const rows = []
  const hora = String(horaInicio || '').trim()
  if (hora) rows.push({ label: 'Hora de inicio de labores', value: hora.slice(0, 5) })
  const desc = String(clima?.clima_descripcion || '').trim()
    || labelClima(clima?.clima_codigo)
  if (desc) rows.push({ label: 'Clima', value: desc })
  if (clima?.clima_temp_c != null && clima.clima_temp_c !== '') {
    rows.push({ label: 'Temperatura', value: `${clima.clima_temp_c} °C` })
  }
  return { rows, hasData: rows.length > 0 }
}

function buildObservaciones(cuerpoHtml = '', eventos = []) {
  const chunks = []
  if (!isRichTextEmpty(cuerpoHtml)) {
    chunks.push({ origen: 'Observaciones del día', texto: textoCorto(cuerpoHtml, 600) })
  }
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev) continue
    const tipo = String(ev.evento_tipo || '')
    if (tipo !== 'novedades' && tipo !== 'incidente_sst') continue
    const plain = textoCorto(ev.cuerpo_html, 600)
    const det = ev.evento_detalle && typeof ev.evento_detalle === 'object' ? ev.evento_detalle : {}
    const extra = tipo === 'incidente_sst'
      ? textoCorto(det.descripcion_incidente || '', 400)
      : ''
    const texto = [plain, extra].filter(Boolean).join(' · ')
    if (!texto) continue
    chunks.push({
      origen: labelEventoTipo(tipo),
      texto,
    })
  }
  return { rows: chunks, hasData: chunks.length > 0 }
}

function buildAdjuntos(imagenes = [], eventos = []) {
  const rows = []
  const pushImg = (im, origen) => {
    if (!im) return
    const nombre = String(im.nombre || im.blob_path || im.url || '').trim()
      || (im.data_uri || im.data_base64 ? 'Imagen adjunta' : '')
    if (!nombre && !(im.data_uri || im.data_base64 || im.blob_path || im.url)) return
    rows.push({
      origen,
      nombre: nombre || 'Imagen adjunta',
      mime: String(im.mime_type || '').trim() || '—',
    })
  }
  for (const im of Array.isArray(imagenes) ? imagenes : []) {
    pushImg(im, 'Reporte diario')
  }
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    const origen = labelEventoTipo(ev?.evento_tipo)
    for (const im of Array.isArray(ev?.imagenes) ? ev.imagenes : []) {
      pushImg(im, origen)
    }
  }
  return { rows, hasData: rows.length > 0 }
}

/**
 * Registro de secciones del resumen. Agregar aquí una sección nueva
 * la incluye automáticamente en el modal/PNG (sin cambiar el botón).
 */
export const RESUMEN_SECTION_BUILDERS = [
  {
    id: 'clima',
    title: 'Clima y hora de inicio',
    kind: 'kv',
    groupByTramoEmpresa: false,
    build: ({ clima, horaInicio }) => buildClimaKv(clima, horaInicio),
  },
  {
    id: 'personal',
    title: 'Personal',
    kind: 'tramo_empresa',
    groupByTramoEmpresa: true,
    build: ({ matrices }) => matrices.personal,
  },
  {
    id: 'maquinaria',
    title: 'Maquinaria',
    kind: 'tramo_empresa',
    groupByTramoEmpresa: true,
    build: ({ matrices }) => matrices.maquinaria,
  },
  {
    id: 'materiales',
    title: 'Materiales (ingresos / salidas)',
    kind: 'materiales',
    groupByTramoEmpresa: false,
    build: ({ matrices }) => matrices.materiales,
  },
  {
    id: 'materiales_vales',
    title: 'Materiales · detalle y vales',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'movimiento', label: 'Movimiento' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'cantidad', label: 'Cant.' },
      { key: 'tramo', label: 'Tramo' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'placa', label: 'Placa' },
      { key: 'vales', label: 'Nº vale(s)' },
      { key: 'ubicacion', label: 'Ubicación PK' },
    ],
    build: ({ materiales }) => buildMaterialesDetalle(materiales),
  },
  {
    id: 'eventos',
    title: 'Eventos',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'dirigido_a', label: 'Dirigido a' },
      { key: 'resumen', label: 'Resumen' },
    ],
    build: ({ eventos }) => buildEventosTabla(eventos),
  },
  {
    id: 'recorridos',
    title: 'Recorridos de obra',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'nombre', label: 'Asistente' },
      { key: 'cargo', label: 'Cargo' },
      { key: 'entidad', label: 'Entidad' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'dirigido_a', label: 'Dirigido a' },
    ],
    build: ({ eventos }) => buildRecorridosTabla(eventos),
  },
  {
    id: 'actividades',
    title: 'Actividades ejecutadas',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'origen', label: 'Origen' },
      { key: 'actividad', label: 'Actividad' },
      { key: 'abs', label: 'ABS' },
      { key: 'tramo', label: 'Tramo' },
      { key: 'pk', label: 'PK' },
      { key: 'cantidad', label: 'Cant.' },
      { key: 'observacion', label: 'Observación' },
    ],
    build: ({ eventos }) => buildActividadesTabla(eventos),
  },
  {
    id: 'observaciones',
    title: 'Observaciones y notas',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'origen', label: 'Origen' },
      { key: 'texto', label: 'Texto' },
    ],
    build: ({ cuerpoHtml, eventos }) => buildObservaciones(cuerpoHtml, eventos),
  },
  {
    id: 'adjuntos',
    title: 'Adjuntos',
    kind: 'table',
    groupByTramoEmpresa: false,
    columns: [
      { key: 'origen', label: 'Origen' },
      { key: 'nombre', label: 'Archivo' },
      { key: 'mime', label: 'Tipo' },
    ],
    build: ({ imagenes, eventos }) => buildAdjuntos(imagenes, eventos),
  },
]

/**
 * Resumen completo: conserva matrices Tramo×Empresa y añade `sections`
 * para renderizar/capturar todas las secciones de la bitácora.
 */
export function buildResumenBitacoraCompleto({
  asistencia = [],
  usos = [],
  materiales = [],
  rrhhCatalogo = [],
  logosByEmpresaKey = {},
  eventos = [],
  clima = {},
  horaInicio = '',
  cuerpoHtml = '',
  imagenes = [],
  elaboradoPor = '',
} = {}) {
  const matrices = buildResumenTramoEmpresa({
    asistencia,
    usos,
    materiales,
    rrhhCatalogo,
    logosByEmpresaKey,
  })

  const ctx = {
    matrices,
    materiales,
    eventos,
    clima,
    horaInicio,
    cuerpoHtml,
    imagenes,
    elaboradoPor,
  }

  const sections = []
  if (elaboradoPor) {
    sections.push({
      id: 'elaborado',
      title: 'Elaborado por',
      kind: 'kv',
      groupByTramoEmpresa: false,
      hasData: true,
      rows: [{ label: 'Responsable', value: String(elaboradoPor) }],
    })
  }

  for (const def of RESUMEN_SECTION_BUILDERS) {
    const payload = def.build(ctx) || { hasData: false }
    sections.push({
      id: def.id,
      title: def.title,
      kind: def.kind,
      groupByTramoEmpresa: Boolean(def.groupByTramoEmpresa),
      columns: def.columns || null,
      ...payload,
      hasData: Boolean(payload.hasData),
    })
  }

  const hasAnyData = sections.some((s) => s.hasData)

  return {
    ...matrices,
    sections,
    hasAnyData,
  }
}

/** Formato compacto de celda combinada: «3p · 1m» o «—» si vacío. */
export function formatoCeldaResumen({ personal = 0, maquinaria = 0 } = {}) {
  const p = Number(personal) || 0
  const m = Number(maquinaria) || 0
  if (p <= 0 && m <= 0) return '—'
  const parts = []
  if (p > 0) parts.push(`${p}p`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' · ')
}

/** Cantidad simple para tablas separadas. */
export function formatoCeldaCantidad(n) {
  const v = Number(n) || 0
  return v > 0 ? String(v) : '—'
}

/** Celda de materiales: ingreso / salida. */
export function formatoCeldaMateriales({ ingreso = 0, salida = 0 } = {}) {
  const i = Number(ingreso) || 0
  const s = Number(salida) || 0
  if (i <= 0 && s <= 0) return '—'
  return `${i} / ${s}`
}
