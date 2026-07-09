import ExcelJS from 'exceljs'
import { foacChecklistColumnKeys } from './foacExcelParse'

/**
 * @typedef {{
 *   primary?: string
 *   primaryLight?: string
 *   bgCard?: string
 *   text?: string
 *   textMuted?: string
 *   border?: string
 * }} AuditorExportTheme
 */

function safeStr(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function hexToArgb(hex) {
  const h = (hex || '').replace('#', '').trim()
  if (h.length === 6) return `FF${h.toUpperCase()}`
  if (h.length === 8) return h.toUpperCase()
  return 'FFF0F9FF'
}

function labelCampo(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Normaliza tildes para emparejar campo del modelo con claves FOAC */
function normCampo(s) {
  return safeStr(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim()
}

/** Sinónimos frecuentes que el modelo escribe frente a la clave canónica */
const FOAC_ALIASES = {
  numero: ['item', 'no', 'numero'],
  empresa: ['contratista', 'empresa contratista'],
  tipo_contrato: ['tipo contrato', 'tipo de contrato'],
  nombre: ['nombre completo', 'nombres', 'nombre y apellidos'],
  cedula: ['cedula', 'documento', 'cc', 'identificacion'],
  edad: [],
  sexo: ['genero'],
  localidad_residencia: ['localidad', 'residencia', 'ciudad', 'municipio'],
  cargo: ['cargo contratista', 'cargo laboral'],
  fecha_ingreso: ['ingreso'],
  fecha_retiro: ['retiro', 'fecha salida'],
  arl: ['administradora de riesgos', 'riesgos laborales', 'afiliacion arl'],
  clase_riesgo_arl: ['clase riesgo', 'riesgo arl', 'tipo riesgo', 'nivel riesgo', 'riesgo clase'],
  fecha_afiliacion_arl: ['afiliacion', 'fecha afiliacion'],
  eps: ['entidad promotora', 'salud', 'entidad salud'],
  afp: ['pension', 'fondo pensiones'],
  fecha_examen_ingreso: ['examen ingreso', 'ingreso medicina'],
  fecha_examen_periodico: ['examen periodico', 'periodico'],
  fecha_examen_egreso: ['examen egreso', 'egreso medicina'],
  concepto_medico: ['concepto', 'aptitud', 'medicina laboral'],
}

function findHallazgoForField(hallazgos, fieldKey) {
  const nk = normCampo(fieldKey).replace(/\s+/g, ' ')
  const extra = FOAC_ALIASES[fieldKey] || []
  for (const h of hallazgos || []) {
    const c = normCampo(h.campo).replace(/\s+/g, ' ')
    if (!c) continue
    if (c === nk || c.includes(nk) || nk.includes(c)) return h
    for (const a of extra) {
      const na = normCampo(a).replace(/\s+/g, ' ')
      if (na && (c.includes(na) || na.includes(c))) return h
    }
  }
  return null
}

/** ✓ cumple, ✗ discrepancia, ? no encontrado, — sin dato del modelo */
function simboloEstado(h) {
  if (!h) return '—'
  const e = safeStr(h.estado).toUpperCase()
  if (e === 'OK') return '✓'
  if (e === 'DISCREPANCIA') return '✗'
  if (e === 'NO ENCONTRADO') return '?'
  return safeStr(h.estado) || '—'
}

function buildDiscrepanciasRows(usuarioNombre, cedula, hallazgos, contextoExtra = '') {
  const rows = []
  for (const h of hallazgos || []) {
    const e = safeStr(h.estado).toUpperCase()
    if (e === 'OK') continue
    rows.push({
      Contexto: contextoExtra,
      Usuario: usuarioNombre,
      Cedula: cedula,
      Campo: safeStr(h.campo),
      Estado: safeStr(h.estado),
      Valor_sistema: safeStr(h.valor_bd),
      Valor_documento: safeStr(h.valor_pdf),
      Detalle: safeStr(h.detalle),
    })
  }
  return rows
}

/** Une hallazgos aunque vengan anidados o con nombres inconsistentes (lote). */
export function normalizarResultadoAuditoria(row) {
  if (!row || typeof row !== 'object') {
    return {
      hallazgos: [],
      colaborador_identificado: '—',
      cedula_identificada: '—',
      puntuacion: '',
      coincide_con_bd: null,
      resumen: '',
      error: row?.error,
      archivo: row?.archivo,
    }
  }
  const inner = row.resultado && typeof row.resultado === 'object' ? row.resultado : row
  let hall = row.hallazgos
  if (!Array.isArray(hall)) hall = inner.hallazgos
  if (!Array.isArray(hall)) hall = []

  const pick = (a, b) => {
    if (a !== undefined && a !== null && String(a).trim() !== '') return a
    return b
  }
  let nombre = pick(row.colaborador_identificado, inner.colaborador_identificado)
  if (typeof nombre === 'boolean') nombre = '—'

  let ced = pick(row.cedula_identificada, inner.cedula_identificada)
  if (typeof ced === 'boolean') ced = '—'

  let pun = pick(row.puntuacion, inner.puntuacion)
  let coincide = pick(row.coincide_con_bd, inner.coincide_con_bd)
  let resumen = pick(row.resumen, inner.resumen)

  return {
    hallazgos: hall,
    colaborador_identificado: nombre != null && nombre !== '' ? String(nombre) : '—',
    cedula_identificada: ced != null && ced !== '' ? String(ced) : '—',
    puntuacion: pun,
    coincide_con_bd: coincide,
    resumen: resumen || '',
    error: row.error,
    archivo: row.archivo,
  }
}

/**
 * @param {ExcelJS.Worksheet} ws
 * @param {number} colCount columnas de datos (última columna del checklist)
 * @param {{ titulo: string, lineas: string[], theme: AuditorExportTheme, generatedAt: Date }} opts
 */
function escribirEncabezadoInforme(ws, colCount, opts) {
  const th = opts.theme || {}
  const titleBg = hexToArgb(th.primary || '#0077B6')
  const metaBg = hexToArgb(th.bgCard || '#FFFFFF')
  const metaFg = hexToArgb(th.text || '#0F2942')
  const metaMuted = hexToArgb(th.textMuted || '#4A7FA5')
  const borderCol = hexToArgb(th.border || '#BAE6FD')

  const mergeEnd = Math.max(colCount, 8)

  ws.mergeCells(1, 1, 1, mergeEnd)
  const t1 = ws.getCell(1, 1)
  t1.value = opts.titulo
  t1.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: titleBg } }
  t1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  ws.getRow(1).height = 26

  let r = 2
  for (const line of opts.lineas) {
    if (!line) continue
    ws.mergeCells(r, 1, r, mergeEnd)
    const c = ws.getCell(r, 1)
    c.value = line
    c.font = { size: 11, color: { argb: metaFg } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: metaBg } }
    c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 }
    c.border = {
      bottom: { style: 'thin', color: { argb: borderCol } },
    }
    ws.getRow(r).height = Math.min(22 + Math.floor(String(line).length / 90) * 14, 120)
    r += 1
  }

  ws.mergeCells(r, 1, r, mergeEnd)
  const foot = ws.getCell(r, 1)
  const dt = opts.generatedAt || new Date()
  foot.value = `Informe generado: ${dt.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}`
  foot.font = { italic: true, size: 10, color: { argb: metaMuted } }
  foot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: metaBg } }
  foot.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true, indent: 1 }
  ws.getRow(r).height = 18

  r += 1
  return r
}

function estiloHeaderTabla(row, theme) {
  const th = theme || {}
  const bg = hexToArgb(th.primary || '#0077B6')
  const bcol = hexToArgb(th.border || '#BAE6FD')
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: bcol } },
      left: { style: 'thin', color: { argb: bcol } },
      bottom: { style: 'thin', color: { argb: bcol } },
      right: { style: 'thin', color: { argb: bcol } },
    }
  })
}

function estiloCuerpo(row, theme) {
  const bcol = hexToArgb((theme || {}).border || '#CBD5E1')
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: bcol } },
      left: { style: 'thin', color: { argb: bcol } },
      bottom: { style: 'thin', color: { argb: bcol } },
      right: { style: 'thin', color: { argb: bcol } },
    }
  })
}

function ajustarAnchos(ws, desdeFila, maxCol = 40) {
  for (let c = 1; c <= maxCol; c++) {
    let max = 10
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < desdeFila) return
      const cell = row.getCell(c)
      const v = cell.value
      const s = v == null ? '' : typeof v === 'object' && v !== null && 'text' in v ? String(v.text) : String(v)
      const len = s.length
      if (len > max) max = len
    })
    ws.getColumn(c).width = Math.min(Math.max(max * 1.1 + 2, 12), 48)
  }
}

/**
 * @param {object} exportContext
 * @param {AuditorExportTheme} [exportContext.theme]
 * @param {Record<string, unknown>|null} [exportContext.contrato]
 * @param {string} [exportContext.residenteSst]
 */
function lineasContratoExport(exportContext) {
  const c = exportContext?.contrato || {}
  const lineas = []
  if (c.numero != null && c.numero !== '') lineas.push(`Contrato: ${c.numero}`)
  if (c.contratista) lineas.push(`Contratista: ${c.contratista}${c.nit ? ` · NIT ${c.nit}` : ''}`)
  if (c.interventoria) lineas.push(`Interventoría: ${c.interventoria}`)
  if (c.objeto) lineas.push(`Objeto: ${String(c.objeto).slice(0, 280)}${String(c.objeto).length > 280 ? '…' : ''}`)
  if (c.entidad) lineas.push(`Entidad: ${c.entidad}${c.entidad_otra ? ` (${c.entidad_otra})` : ''}`)
  const rs = (exportContext?.residenteSst || '').trim()
  if (rs) lineas.push(`Residente SST: ${rs}`)
  return lineas
}

/**
 * @param {object} apiResponse { resultado, meta }
 * @param {Record<string,any>|null} rosterRow fila FOAC del listado (opcional)
 * @param {object} [exportContext]
 * @param {string} [filenameBase]
 */
export async function downloadAuditorExcelIndividual(apiResponse, rosterRow = null, exportContext = null, filenameBase = 'auditoria-sst') {
  const theme = exportContext?.theme || {}
  const res = apiResponse?.resultado || {}
  const n0 = normalizarResultadoAuditoria(res)
  const hall = n0.hallazgos
  const nombre = rosterRow?.nombre || n0.colaborador_identificado || '—'
  const ced = rosterRow?.cedula || n0.cedula_identificada || '—'
  const cols = foacChecklistColumnKeys()
  const dataHeader = ['Nombre (listado)', 'Cédula (listado)', ...cols.map(labelCampo), 'Puntuación %', 'Coincide listado', 'Resumen']
  const checklistCells = cols.map((ck) => simboloEstado(findHallazgoForField(hall, ck)))
  const dataRow = [
    nombre,
    ced,
    ...checklistCells,
    n0.puntuacion != null && n0.puntuacion !== '' ? n0.puntuacion : '—',
    n0.coincide_con_bd === true ? 'Sí' : n0.coincide_con_bd === false ? 'No' : '—',
    safeStr(n0.resumen).slice(0, 500),
  ]

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Auditor'

  const ws = wb.addWorksheet('Checklist')
  const firstDataRow = escribirEncabezadoInforme(ws, dataHeader.length, {
    titulo: 'Informe de auditoría (individual)',
    lineas: lineasContratoExport(exportContext || {}),
    theme,
    generatedAt: exportContext?.generatedAt || new Date(),
  })

  const hr = ws.addRow(dataHeader)
  estiloHeaderTabla(hr, theme)
  const dr = ws.addRow(dataRow)
  estiloCuerpo(dr, theme)
  ajustarAnchos(ws, firstDataRow, dataHeader.length)

  const disc = buildDiscrepanciasRows(nombre, ced, hall, 'Individual')
  const wsd = wb.addWorksheet('Discrepancias')
  if (disc.length) {
    wsd.addRow(Object.keys(disc[0]))
    disc.forEach((o) => wsd.addRow(Object.values(o)))
    wsd.getRow(1).eachCell((cell) => {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(theme.primary || '#00AFC5') } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    })
    ajustarAnchos(wsd, 1, Object.keys(disc[0]).length)
  } else {
    wsd.addRow(['Sin discrepancias ni ítems NO ENCONTRADO para esta ejecución'])
  }

  const buf = await wb.xlsx.writeBuffer()
  const name = `${filenameBase}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {object} lote { resultados, resumen_lote }
 * @param {object} [exportContext]
 * @param {string} [filenameBase]
 */
export async function downloadAuditorExcelLote(lote, exportContext = null, filenameBase = 'auditoria-sst-lote') {
  const theme = exportContext?.theme || {}
  const results = lote?.resultados || []
  const cols = foacChecklistColumnKeys()
  const dataHeader = ['Archivo', 'Nombre (IA)', 'Cédula (IA)', ...cols.map(labelCampo), 'Puntuación %', 'Coincide listado', 'Error', 'Resumen']

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Auditor'

  const ws = wb.addWorksheet('Checklist')
  const firstDataRow = escribirEncabezadoInforme(ws, dataHeader.length, {
    titulo: 'Informe de auditoría (lote)',
    lineas: lineasContratoExport(exportContext || {}),
    theme,
    generatedAt: exportContext?.generatedAt || new Date(),
  })

  const hr = ws.addRow(dataHeader)
  estiloHeaderTabla(hr, theme)

  const allDisc = []
  for (const raw of results) {
    const r = normalizarResultadoAuditoria(raw)
    if (r.error) {
      const row = ws.addRow([
        r.archivo || '—',
        '—',
        '—',
        ...cols.map(() => '—'),
        '—',
        '—',
        r.error,
        '',
      ])
      estiloCuerpo(row, theme)
      continue
    }
    const checklistCells = cols.map((ck) => simboloEstado(findHallazgoForField(r.hallazgos, ck)))
    const row = ws.addRow([
      r.archivo || '—',
      r.colaborador_identificado,
      r.cedula_identificada,
      ...checklistCells,
      r.puntuacion != null && r.puntuacion !== '' ? r.puntuacion : '—',
      r.coincide_con_bd === true ? 'Sí' : r.coincide_con_bd === false ? 'No' : '—',
      '',
      safeStr(r.resumen).slice(0, 400),
    ])
    estiloCuerpo(row, theme)
    allDisc.push(...buildDiscrepanciasRows(r.colaborador_identificado, r.cedula_identificada, r.hallazgos, safeStr(r.archivo)))
  }

  ajustarAnchos(ws, firstDataRow, dataHeader.length)

  const wsd = wb.addWorksheet('Discrepancias')
  if (allDisc.length) {
    wsd.addRow(Object.keys(allDisc[0]))
    allDisc.forEach((o) => wsd.addRow(Object.values(o)))
    wsd.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(theme.primary || '#00AFC5') } }
    })
    ajustarAnchos(wsd, 1, Object.keys(allDisc[0]).length)
  } else {
    wsd.addRow([
      'Sin filas de discrepancia: el modelo no reportó ítems en DISCREPANCIA ni NO ENCONTRADO. Revisa el resumen por PDF o vuelve a ejecutar con el mismo prompt.',
    ])
  }

  const buf = await wb.xlsx.writeBuffer()
  const name = `${filenameBase}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
