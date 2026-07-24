import ExcelJS from 'exceljs'

/** Paleta sobria ClaraCore (presupuesto). */
const CC = {
  dark: 'FF0F1923',
  primary: 'FF1F4E70',
  text: 'FF0F2942',
  muted: 'FF64748B',
  border: 'FF94A3B8',
  borderLight: 'FFE2E8F0',
  metaBg: 'FFEEF7FB',
  headerBg: 'FFE5F4FA',
  rowBg: 'FFF8FAFC',
  subtotalCapBg: 'FF64748B',
  subtotalTramoBg: 'FF475569',
  totalBg: 'FF0F2942',
  green: 'FF059669',
  red: 'FFDC2626',
  white: 'FFFFFFFF',
}

const FILL_META = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.metaBg } }
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.headerBg } }
const FILL_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.rowBg } }
const FILL_SUBTOTAL_CAP = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.subtotalCapBg } }
const FILL_SUBTOTAL_TRAMO = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.subtotalTramoBg } }
const FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.totalBg } }

const COP_NUM_FMT = '"$"#,##0'
const QTY_NUM_FMT = '#,##0.00'
/** Verde positivo / rojo negativo (formato Excel). */
const DELTA_QTY_FMT = '[Color10]+#,##0.00;[Color3]-#,##0.00;[Color1]"—"'
const DELTA_COP_FMT = '[Color10]+"$"#,##0;[Color3]-"$"#,##0;[Color1]"—"'
/** Signo +/- sobre fondo oscuro (sin color condicional; texto blanco en celda). */
const DELTA_QTY_FMT_OSCURO = '+#,##0.00;-#,##0.00;"—"'
const DELTA_COP_FMT_OSCURO = '+"$"#,##0;-"$"#,##0;"—"'

/** Alturas de fila al 80% del valor base. */
const rowH = (h) => Math.max(6, Math.round(h * 0.8))

function prepararHojaCompare(ws) {
  ws.properties.defaultRowHeight = rowH(15)
}

const ANCHO_DESC_ITEMS = Math.round(48 * 1.6)
const ANCHO_DESC_TRAMO = Math.round(42 * 1.6)
const ANCHO_UND = 8
const ANCHO_VLR_UNIT = 14
const LABEL_HEADERS_ITEMS = ['Capítulo / Ítem', 'Und', 'Vlr. unitario']
const LABEL_COUNT_ITEMS = LABEL_HEADERS_ITEMS.length

function colToLetter(col) {
  let s = ''
  let n = col
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function safeSheetName(raw, fallback = 'Tramo') {
  let s = String(raw ?? fallback).replace(/[\\/*?:\[\]]/g, ' ').trim()
  if (!s) s = fallback
  if (s.length > 31) s = s.slice(0, 31)
  return s
}

function formulaDelta(prevCol, currCol, rowNum) {
  return `${colToLetter(currCol)}${rowNum}-${colToLetter(prevCol)}${rowNum}`
}

function bordeCelda(cell, { top, bottom, left, right } = {}) {
  const b = {}
  if (top) b.top = top
  if (bottom) b.bottom = bottom
  if (left) b.left = left
  if (right) b.right = right
  cell.border = b
}

const B_THIN = { style: 'thin', color: { argb: CC.borderLight } }
const B_HEADER = { style: 'thin', color: { argb: CC.border } }

function estiloHeaderTabla(cell) {
  cell.fill = FILL_HEADER
  cell.font = { bold: true, size: 10, color: { argb: CC.primary } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function estiloDato(cell, { align = 'right', numFmt, fill = FILL_ROW, wrapText = false, fontColor } = {}) {
  cell.fill = fill
  cell.alignment = { vertical: wrapText ? 'top' : 'middle', horizontal: align, wrapText }
  if (numFmt) cell.numFmt = numFmt
  cell.font = { size: 10, color: { argb: fontColor || CC.text } }
  bordeCelda(cell, { bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloDelta(cell, numFmt, fill = FILL_ROW) {
  estiloDato(cell, { align: 'right', numFmt, fill, fontColor: CC.text })
  cell.font = { size: 10, bold: false }
}

function ajustarAlturaFilaDescripcion(ws, rowNum, text, colWidth) {
  const len = String(text ?? '').length
  const charsPerLine = Math.max(28, Math.floor(colWidth * 1.12))
  const lines = Math.max(1, Math.ceil(len / charsPerLine))
  const prev = ws.getRow(rowNum).height
  const next = Math.min(rowH(96), Math.max(rowH(22), rowH(15) * lines + rowH(8)))
  if (!prev || prev < next) ws.getRow(rowNum).height = next
}

function escribirCeldaDescripcion(ws, rowNum, colNum, text, colWidth) {
  const cell = ws.getRow(rowNum).getCell(colNum)
  cell.value = text
  estiloDato(cell, { align: 'left', wrapText: true, fill: FILL_ROW })
  ajustarAlturaFilaDescripcion(ws, rowNum, text, colWidth)
}

function resolverMetaItem(itemRows, itemKey, versionesOrd) {
  let und = ''
  let vlrUnitario = null

  for (let vi = versionesOrd.length - 1; vi >= 0; vi -= 1) {
    const v = versionesOrd[vi]
    const block = itemRows.find((x) => String(x.version.id) === String(v.id))
    const it = block?.items?.find((i) => String(i.item) === itemKey)
    if (!it) continue
    if (!und && it.und) und = String(it.und).trim()
    if (vlrUnitario == null && it.vlr_unitario != null && it.vlr_unitario !== '') {
      vlrUnitario = Math.round(Number(it.vlr_unitario) || 0)
    }
  }

  if (!und) {
    for (const { items } of itemRows) {
      const it = items.find((i) => String(i.item) === itemKey)
      if (it?.und) {
        und = String(it.und).trim()
        break
      }
    }
  }

  return { und: und || '—', vlr_unitario: vlrUnitario }
}

function escribirCeldasMetaItem(ws, rowNum, undCol, vlrCol, { und, vlr_unitario: vlrUnitario }) {
  const cUnd = ws.getRow(rowNum).getCell(undCol)
  cUnd.value = und || '—'
  estiloDato(cUnd, { align: 'center' })

  const cVlr = ws.getRow(rowNum).getCell(vlrCol)
  if (vlrUnitario != null && !Number.isNaN(vlrUnitario)) {
    cVlr.value = vlrUnitario
    estiloDato(cVlr, { numFmt: COP_NUM_FMT, align: 'right' })
  } else {
    cVlr.value = null
    estiloDato(cVlr, { align: 'right' })
  }
}

function estiloLabelExtraSubtotalCap(cell) {
  cell.fill = FILL_SUBTOTAL_CAP
  cell.font = { bold: true, size: 10, color: { argb: CC.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloLabelExtraSubtotalTramo(cell) {
  cell.fill = FILL_SUBTOTAL_TRAMO
  cell.font = { bold: true, size: 11, color: { argb: CC.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function estiloLabelExtraTotal(cell) {
  cell.fill = FILL_TOTAL
  cell.font = { bold: true, size: 11, color: { argb: CC.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
}

function estiloSubtotalCapLabel(cell) {
  cell.fill = FILL_SUBTOTAL_CAP
  cell.font = { bold: true, size: 10, color: { argb: CC.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  bordeCelda(cell, { top: B_HEADER, bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloSubtotalCapValor(cell, numFmt) {
  cell.fill = FILL_SUBTOTAL_CAP
  cell.font = { bold: true, size: 10, color: { argb: CC.white } }
  cell.numFmt = numFmt
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function estiloSubtotalTramoLabel(cell) {
  cell.fill = FILL_SUBTOTAL_TRAMO
  cell.font = { bold: true, size: 11, color: { argb: CC.white } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function estiloSubtotalTramoValor(cell, numFmt) {
  cell.fill = FILL_SUBTOTAL_TRAMO
  cell.font = { bold: true, size: 11, color: { argb: CC.white } }
  cell.numFmt = numFmt
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  bordeCelda(cell, { top: B_HEADER, bottom: B_HEADER, left: B_THIN, right: B_THIN })
}

function indicesColumnasCosto(cols) {
  return cols
    .map((c, idx) => ({ ...c, colNum: idx + 1 }))
    .filter((c) => c.kind === 'costo' || c.kind === 'delta_costo')
    .map((c) => ({ colNum: c.colNum, kind: c.kind }))
}

function paresCostoParaDelta(cols) {
  return cols
    .filter((c) => c.kind === 'delta_costo')
    .map((c) => {
      const deltaCol = cols.indexOf(c) + 1
      const currCostoCol = cols.findIndex((x) => x.key === `${c.versionId}-costo`) + 1
      const prevCostoCol = cols.findIndex((x) => x.key === `${c.prevVersionId}-costo`) + 1
      return { deltaCol, currCostoCol, prevCostoCol }
    })
}

function numFmtCostoCol(kind, { subtotal = false } = {}) {
  if (kind === 'delta_costo') return subtotal ? DELTA_COP_FMT_OSCURO : DELTA_COP_FMT
  return COP_NUM_FMT
}

function estiloMetaInforme(cell, { bold = false, align = 'left' } = {}) {
  cell.fill = FILL_META
  cell.font = { size: 10, bold, color: { argb: bold ? CC.primary : CC.text } }
  cell.alignment = { vertical: 'middle', horizontal: align, indent: 1, wrapText: true }
  bordeCelda(cell, { bottom: B_THIN, left: B_THIN, right: B_THIN })
}

function formatearVersionesCompare(versionesOrd) {
  if (!versionesOrd?.length) return '—'
  return versionesOrd.map((v) => v.etiqueta).join('  →  ')
}

function buildVersionColumnPlan(versionesOrd, labelCount = 1) {
  const cols = []
  for (let i = 0; i < labelCount; i += 1) {
    cols.push({ key: `label${i}`, kind: 'label', labelIdx: i })
  }
  versionesOrd.forEach((v, vi) => {
    cols.push({ key: `${v.id}-cant`, versionId: v.id, kind: 'cant', versionIdx: vi })
    cols.push({ key: `${v.id}-costo`, versionId: v.id, kind: 'costo', versionIdx: vi })
    if (vi > 0) {
      cols.push({
        key: `${v.id}-dcant`,
        versionId: v.id,
        kind: 'delta_cant',
        versionIdx: vi,
        prevVersionId: versionesOrd[vi - 1].id,
      })
      cols.push({
        key: `${v.id}-dcosto`,
        versionId: v.id,
        kind: 'delta_costo',
        versionIdx: vi,
        prevVersionId: versionesOrd[vi - 1].id,
      })
    }
  })
  return cols
}

function escribirEncabezadosCompare(ws, versionesOrd, rowOffset, { labelHeaders = ['Capítulo / Ítem'] } = {}) {
  const labelCount = labelHeaders.length
  const cols = buildVersionColumnPlan(versionesOrd, labelCount)
  const r1 = ws.getRow(rowOffset)
  const r2 = ws.getRow(rowOffset + 1)

  labelHeaders.forEach((h, i) => {
    const col = i + 1
    r1.getCell(col).value = h
    ws.mergeCells(rowOffset, col, rowOffset + 1, col)
    estiloHeaderTabla(r1.getCell(col))
    estiloHeaderTabla(r2.getCell(col))
  })

  let colNum = labelCount + 1
  versionesOrd.forEach((v, vi) => {
    const span = vi > 0 ? 4 : 2
    r1.getCell(colNum).value = v.etiqueta
    ws.mergeCells(rowOffset, colNum, rowOffset, colNum + span - 1)
    estiloHeaderTabla(r1.getCell(colNum))

    r2.getCell(colNum).value = 'Cantidad'
    estiloHeaderTabla(r2.getCell(colNum))
    r2.getCell(colNum + 1).value = 'Costo directo'
    estiloHeaderTabla(r2.getCell(colNum + 1))

    if (vi > 0) {
      r2.getCell(colNum + 2).value = '▲ Cantidad'
      estiloHeaderTabla(r2.getCell(colNum + 2))
      r2.getCell(colNum + 3).value = '▲ Costo directo'
      estiloHeaderTabla(r2.getCell(colNum + 3))
    }
    colNum += span
  })

  r1.height = rowH(22)
  r2.height = rowH(22)

  return { cols, firstDataRow: rowOffset + 2, totalCols: cols.length, labelCount }
}

/** Encabezado institucional enriquecido (todas las pestañas del comparador). */
function escribirEncabezadoInforme(ws, totalCols, ctx = {}) {
  const cols = Math.max(totalCols, 10)
  const meta = ctx.metaContrato || {}
  const gen = ctx.generatedAt instanceof Date ? ctx.generatedAt : new Date()
  const fechaTxt = gen.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const horaTxt = gen.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const splitMeta = Math.floor(cols * 0.38)
  const splitExport = Math.floor(cols * 0.62)
  const brandSplit = Math.floor(cols * 0.28)

  ws.mergeCells(1, 1, 1, brandSplit)
  ws.mergeCells(1, brandSplit + 1, 1, cols)
  const cBrand = ws.getCell(1, 1)
  cBrand.value = 'CLARACORE'
  cBrand.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.dark } }
  cBrand.font = { bold: true, size: 14, color: { argb: CC.white } }
  cBrand.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  const cTitulo = ws.getCell(1, brandSplit + 1)
  cTitulo.value = 'Comparación de versiones de presupuesto'
  cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CC.primary } }
  cTitulo.font = { bold: true, size: 11, color: { argb: CC.white } }
  cTitulo.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 }
  ws.getRow(1).height = rowH(32)

  ws.mergeCells(2, 1, 2, splitMeta)
  ws.mergeCells(2, splitMeta + 1, 2, cols)
  ws.getCell(2, 1).value = `Contrato: ${meta.numero ?? meta.contrato ?? '—'}`
  ws.getCell(2, splitMeta + 1).value = `Contratista: ${meta.contratista ?? '—'}`
  estiloMetaInforme(ws.getCell(2, 1), { bold: true })
  estiloMetaInforme(ws.getCell(2, splitMeta + 1), { bold: true })
  ws.getRow(2).height = rowH(22)

  ws.mergeCells(3, 1, 3, splitMeta)
  ws.mergeCells(3, splitMeta + 1, 3, cols)
  ws.getCell(3, 1).value = `Interventoría: ${meta.interventoria ?? '—'}`
  ws.getCell(3, splitMeta + 1).value = `Alcance del informe: ${ctx.alcanceLabel ?? 'General'}`
  estiloMetaInforme(ws.getCell(3, 1))
  estiloMetaInforme(ws.getCell(3, splitMeta + 1))
  ws.getRow(3).height = rowH(22)

  const objeto = meta.objeto ? String(meta.objeto) : '—'
  ws.mergeCells(4, 1, 4, cols)
  ws.getCell(4, 1).value = `Objeto contractual: ${objeto}`
  estiloMetaInforme(ws.getCell(4, 1))
  ws.getRow(4).height = Math.min(rowH(56), rowH(22) + Math.floor(objeto.length / 90) * rowH(12))

  ws.mergeCells(5, 1, 5, cols)
  ws.getCell(5, 1).value = `Versiones comparadas: ${formatearVersionesCompare(ctx.versionesOrd)}`
  estiloMetaInforme(ws.getCell(5, 1), { bold: true })
  ws.getRow(5).height = rowH(22)

  ws.mergeCells(6, 1, 6, splitExport)
  ws.mergeCells(6, splitExport + 1, 6, cols)
  ws.getCell(6, 1).value = `Exportado por: ${ctx.exportadoPor ?? '—'}`
  ws.getCell(6, splitExport + 1).value = `Fecha y hora de descarga: ${fechaTxt} · ${horaTxt}`
  estiloMetaInforme(ws.getCell(6, 1))
  estiloMetaInforme(ws.getCell(6, splitExport + 1), { align: 'right' })
  ws.getRow(6).height = rowH(22)

  let nextRow = 7
  if (ctx.subtituloDestacado) {
    ws.mergeCells(nextRow, 1, nextRow, cols)
    const cSec = ws.getCell(nextRow, 1)
    cSec.value = ctx.subtituloDestacado
    cSec.fill = FILL_HEADER
    cSec.font = { bold: true, size: 15, color: { argb: CC.dark } }
    cSec.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    bordeCelda(cSec, { top: B_HEADER, bottom: B_HEADER, left: B_HEADER, right: B_HEADER })
    ws.getRow(nextRow).height = rowH(34)
    nextRow += 1
  }

  ws.getRow(nextRow).height = rowH(8)
  return nextRow + 1
}

function valorCantCosto(data, kind) {
  if (!data) return null
  if (kind === 'cant') return Number(data.cant_total)
  return Math.round(Number(data.costo_total) || 0)
}

function escribirFilaCompare(ws, rowNum, cols, getDataForVersion) {
  const colIndexByKey = {}
  cols.forEach((c, idx) => {
    colIndexByKey[c.key] = idx + 1
  })

  cols.forEach((c, idx) => {
    if (c.kind === 'label') return
    const cell = ws.getRow(rowNum).getCell(idx + 1)

    if (c.kind === 'cant' || c.kind === 'costo') {
      const data = getDataForVersion(c.versionId)
      const val = valorCantCosto(data, c.kind)
      cell.value = val == null || Number.isNaN(val) ? null : val
      estiloDato(cell, {
        numFmt: c.kind === 'cant' ? QTY_NUM_FMT : COP_NUM_FMT,
        align: 'right',
      })
      return
    }

    const prevCantCol = colIndexByKey[`${c.prevVersionId}-cant`]
    const currCantCol = colIndexByKey[`${c.versionId}-cant`]
    const prevCostoCol = colIndexByKey[`${c.prevVersionId}-costo`]
    const currCostoCol = colIndexByKey[`${c.versionId}-costo`]

    if (c.kind === 'delta_cant') {
      cell.value = { formula: formulaDelta(prevCantCol, currCantCol, rowNum) }
      estiloDelta(cell, DELTA_QTY_FMT)
    } else if (c.kind === 'delta_costo') {
      cell.value = { formula: formulaDelta(prevCostoCol, currCostoCol, rowNum) }
      estiloDelta(cell, DELTA_COP_FMT)
    }
  })
}

function escribirSubtotalCapitulo(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  { firstItemRow, lastItemRow, labelText },
) {
  const r = ws.getRow(rowNum)
  r.getCell(1).value = labelText
  estiloSubtotalCapLabel(r.getCell(1))
  ajustarAlturaFilaDescripcion(ws, rowNum, labelText, ANCHO_DESC_TRAMO)

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraSubtotalCap(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_SUBTOTAL_CAP
      return
    }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${L}${firstItemRow}:${L}${lastItemRow})` }
      estiloSubtotalCapValor(cell, COP_NUM_FMT)
      return
    }

    if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        estiloSubtotalCapValor(cell, DELTA_COP_FMT_OSCURO)
      }
    } else {
      cell.fill = FILL_SUBTOTAL_CAP
    }
  })
}

function escribirSubtotalTramo(ws, rowNum, cols, costoCols, paresDelta, chapterSubRows, tramoLabel) {
  const labelText = `Total tramo — ${tramoLabel}`
  const r = ws.getRow(rowNum)
  r.getCell(1).value = labelText
  estiloSubtotalTramoLabel(r.getCell(1))

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraSubtotalTramo(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_SUBTOTAL_TRAMO
      return
    }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${chapterSubRows.map((sr) => `${L}${sr}`).join(',')})` }
      estiloSubtotalTramoValor(cell, COP_NUM_FMT)
      return
    }

    if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        estiloSubtotalTramoValor(cell, DELTA_COP_FMT_OSCURO)
      }
    } else {
      cell.fill = FILL_SUBTOTAL_TRAMO
    }
  })
}

function escribirSubtotalCapituloItems(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  { firstItemRow, lastItemRow, labelText },
) {
  escribirSubtotalCapitulo(ws, rowNum, cols, costoCols, paresDelta, { firstItemRow, lastItemRow, labelText })
}

function escribirFilaTotalesCostoDirecto(
  ws,
  rowNum,
  cols,
  costoCols,
  paresDelta,
  { firstRow, lastRow, label = 'TOTAL COSTO DIRECTO' },
) {
  if (lastRow < firstRow) return
  const r = ws.getRow(rowNum)
  r.getCell(1).value = label
  r.getCell(1).fill = FILL_TOTAL
  r.getCell(1).font = { bold: true, size: 11, color: { argb: CC.white } }
  r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraTotal(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_TOTAL
      return
    }
    cell.fill = FILL_TOTAL
    cell.font = { bold: true, size: 11, color: { argb: CC.white } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${L}${firstRow}:${L}${lastRow})` }
      cell.numFmt = COP_NUM_FMT
    } else if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        cell.numFmt = DELTA_COP_FMT_OSCURO
      }
    }
  })
}

function escribirFilaTotalGeneralItems(ws, rowNum, cols, costoCols, paresDelta, subtotalRows) {
  if (!subtotalRows.length) return
  const r = ws.getRow(rowNum)
  r.getCell(1).value = 'TOTAL GENERAL'
  r.getCell(1).fill = FILL_TOTAL
  r.getCell(1).font = { bold: true, size: 11, color: { argb: CC.white } }
  r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  cols.forEach((c, idx) => {
    if (c.kind === 'label') {
      if (idx > 0) estiloLabelExtraTotal(r.getCell(idx + 1))
      return
    }
    const cell = r.getCell(idx + 1)
    const hit = costoCols.find((cc) => cc.colNum === idx + 1)
    if (!hit) {
      cell.fill = FILL_TOTAL
      return
    }
    cell.fill = FILL_TOTAL
    cell.font = { bold: true, size: 11, color: { argb: CC.white } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }

    if (hit.kind === 'costo') {
      const L = colToLetter(hit.colNum)
      cell.value = { formula: `SUM(${subtotalRows.map((sr) => `${L}${sr}`).join(',')})` }
      cell.numFmt = COP_NUM_FMT
    } else if (hit.kind === 'delta_costo') {
      const pair = paresDelta.find((p) => p.deltaCol === hit.colNum)
      if (pair) {
        cell.value = { formula: formulaDelta(pair.prevCostoCol, pair.currCostoCol, rowNum) }
        cell.numFmt = DELTA_COP_FMT_OSCURO
      }
    }
  })
}

function ajustarAnchosColumnas(ws, versionesOrd, labelWidths) {
  const widths = Array.isArray(labelWidths) ? labelWidths : [labelWidths]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
  let cn = widths.length + 1
  versionesOrd.forEach((_, vi) => {
    ws.getColumn(cn).width = 14
    ws.getColumn(cn + 1).width = 16
    if (vi > 0) {
      ws.getColumn(cn + 2).width = 14
      ws.getColumn(cn + 3).width = 16
    }
    cn += vi > 0 ? 4 : 2
  })
}

function escribirHojaCapitulos(ws, versionesOrd, capitulosUnion, getCapData, exportCtx) {
  prepararHojaCompare(ws)
  const totalCols = buildVersionColumnPlan(versionesOrd, 1).length
  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: 'Resumen por capítulo',
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow)
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow

  capitulosUnion.forEach((cap) => {
    escribirCeldaDescripcion(ws, rowNum, 1, cap, 36)
    escribirFilaCompare(ws, rowNum, cols, (versionId) => getCapData(versionId, cap))
    rowNum += 1
  })

  if (capitulosUnion.length > 0) {
    const lastDataRow = rowNum - 1
    escribirFilaTotalesCostoDirecto(ws, rowNum, cols, costoCols, paresDelta, {
      firstRow: firstDataRow,
      lastRow: lastDataRow,
      label: 'TOTAL COSTO DIRECTO',
    })
  }

  ajustarAnchosColumnas(ws, versionesOrd, 36)
  ws.views = [{ showGridLines: false }]
}

function escribirHojaItems(ws, versionesOrd, capitulosUnion, itemsByCap, exportCtx) {
  prepararHojaCompare(ws)
  const totalCols = buildVersionColumnPlan(versionesOrd, LABEL_COUNT_ITEMS).length
  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: 'Resumen general',
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow, {
    labelHeaders: LABEL_HEADERS_ITEMS,
  })
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow
  const subtotalRows = []

  capitulosUnion.forEach((cap) => {
    const itemRows = itemsByCap[cap]
    if (!itemRows) return

    const itemKeys = [
      ...new Set(itemRows.flatMap(({ items }) => items.map((it) => String(it.item)))),
    ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))

    if (!itemKeys.length) return

    const chapterStartRow = rowNum

    itemKeys.forEach((itemKey) => {
      const desc =
        itemRows
          .map((x) => x.items.find((it) => String(it.item) === itemKey)?.descripcion)
          .find(Boolean) || ''
      const labelText = desc ? `${cap} · ${itemKey} — ${desc}` : `${cap} · ${itemKey}`
      escribirCeldaDescripcion(ws, rowNum, 1, labelText, ANCHO_DESC_ITEMS)

      const meta = resolverMetaItem(itemRows, itemKey, versionesOrd)
      escribirCeldasMetaItem(ws, rowNum, 2, 3, meta)

      escribirFilaCompare(ws, rowNum, cols, (versionId) => {
        const block = itemRows.find((x) => String(x.version.id) === String(versionId))
        return block?.items?.find((it) => String(it.item) === itemKey) || null
      })
      rowNum += 1
    })

    escribirSubtotalCapituloItems(ws, rowNum, cols, costoCols, paresDelta, {
      firstItemRow: chapterStartRow,
      lastItemRow: rowNum - 1,
      labelText: `Subtotal — ${cap}`,
    })
    subtotalRows.push(rowNum)
    rowNum += 2
  })

  if (subtotalRows.length > 1) {
    escribirFilaTotalGeneralItems(ws, rowNum, cols, costoCols, paresDelta, subtotalRows)
  }

  ajustarAnchosColumnas(ws, versionesOrd, [ANCHO_DESC_ITEMS, ANCHO_UND, ANCHO_VLR_UNIT])
  ws.views = [{ showGridLines: false }]
}

/** Una pestaña = un tramo (encabezado + ítems + subtotal por capítulo + total tramo). */
function escribirHojaTramo(ws, tramoLabel, block, versionesOrd, exportCtx) {
  prepararHojaCompare(ws)
  const { capitulosUnion, itemsByCap } = block
  const totalCols = buildVersionColumnPlan(versionesOrd, LABEL_COUNT_ITEMS).length
  const headerRow = escribirEncabezadoInforme(ws, totalCols, {
    ...exportCtx,
    subtituloDestacado: `Tramo: ${tramoLabel}`,
  })

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, headerRow, {
    labelHeaders: LABEL_HEADERS_ITEMS,
  })
  const costoCols = indicesColumnasCosto(cols)
  const paresDelta = paresCostoParaDelta(cols)
  let rowNum = firstDataRow
  const chapterSubRows = []

  capitulosUnion.forEach((cap) => {
    const itemRows = itemsByCap[cap]
    if (!itemRows) return

    const itemKeys = [
      ...new Set(itemRows.flatMap(({ items }) => items.map((it) => String(it.item)))),
    ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))

    if (!itemKeys.length) return

    const chapterStartRow = rowNum

    itemKeys.forEach((itemKey) => {
      const desc =
        itemRows
          .map((x) => x.items.find((it) => String(it.item) === itemKey)?.descripcion)
          .find(Boolean) || ''
      const labelText = desc ? `${cap} · ${itemKey} — ${desc}` : `${cap} · ${itemKey}`
      escribirCeldaDescripcion(ws, rowNum, 1, labelText, ANCHO_DESC_TRAMO)

      const meta = resolverMetaItem(itemRows, itemKey, versionesOrd)
      escribirCeldasMetaItem(ws, rowNum, 2, 3, meta)

      escribirFilaCompare(ws, rowNum, cols, (versionId) => {
        const blk = itemRows.find((x) => String(x.version.id) === String(versionId))
        return blk?.items?.find((it) => String(it.item) === itemKey) || null
      })
      rowNum += 1
    })

    const capSubLabel = `Subtotal cap. — ${cap}`
    escribirSubtotalCapitulo(ws, rowNum, cols, costoCols, paresDelta, {
      firstItemRow: chapterStartRow,
      lastItemRow: rowNum - 1,
      labelText: capSubLabel,
    })
    chapterSubRows.push(rowNum)
    rowNum += 1
  })

  if (chapterSubRows.length) {
    escribirSubtotalTramo(ws, rowNum, cols, costoCols, paresDelta, chapterSubRows, tramoLabel)
  }

  ajustarAnchosColumnas(ws, versionesOrd, [ANCHO_DESC_TRAMO, ANCHO_UND, ANCHO_VLR_UNIT])
  ws.views = [{ showGridLines: false }]
}

function cmpCapitulo(a, b) {
  const key = (c) => {
    const m = String(c ?? '').match(/^(\d+)/)
    return m ? [0, parseInt(m[1], 10), c] : [1, 0, c]
  }
  const ka = key(a)
  const kb = key(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  return String(ka[2] ?? '').localeCompare(String(kb[2] ?? ''), 'es', { numeric: true })
}

export async function fetchVersionCompareTramosData({
  API,
  contratoId,
  token,
  versionesOrd,
  tramosList,
}) {
  const tramosExport = Array.isArray(tramosList) && tramosList.length ? tramosList : [null]
  const authHeaders = { Authorization: `Bearer ${token}` }

  const entries = await Promise.all(
    tramosExport.map(async (tramoName) => {
      const qsCap = tramoName ? `?tramo=${encodeURIComponent(String(tramoName))}` : ''
      const capsByVersion = await Promise.all(
        versionesOrd.map(async (v) => {
          const res = await fetch(
            `${API}/presupuesto/${contratoId}/versiones/${v.id}/capitulos-lista${qsCap}`,
            { headers: authHeaders },
          )
          const caps = res.ok ? await res.json() : []
          return { version: v, caps: Array.isArray(caps) ? caps : [] }
        }),
      )

      const capSet = new Set()
      capsByVersion.forEach(({ caps }) => caps.forEach((c) => capSet.add(c.capitulo)))
      const capitulosUnion = [...capSet].sort(cmpCapitulo)
      if (!capitulosUnion.length) return null

      const itemsByCap = {}
      await Promise.all(
        capitulosUnion.map(async (cap) => {
          const rows = await Promise.all(
            versionesOrd.map(async (v) => {
              const p = new URLSearchParams({ capitulo: cap })
              if (tramoName) p.set('tramo', String(tramoName))
              const res = await fetch(
                `${API}/presupuesto/${contratoId}/versiones/${v.id}/items-lista?${p.toString()}`,
                { headers: authHeaders },
              )
              const items = res.ok ? await res.json() : []
              return { version: v, items: Array.isArray(items) ? items : [] }
            }),
          )
          itemsByCap[cap] = rows
        }),
      )

      const label = tramoName ? String(tramoName) : '(Sin tramo)'
      return [label, { capitulosUnion, itemsByCap }]
    }),
  )

  return Object.fromEntries(entries.filter(Boolean))
}

function reservarNombreHoja(baseName, usedNames) {
  let sheetName = safeSheetName(baseName)
  let n = 1
  while (usedNames.has(sheetName.toLowerCase())) {
    const suffix = `_${n}`
    sheetName = safeSheetName(`${String(baseName).slice(0, 31 - suffix.length)}${suffix}`)
    n += 1
  }
  usedNames.add(sheetName.toLowerCase())
  return sheetName
}

export async function downloadVersionCompareExcel({
  versionesOrd,
  capitulosUnion,
  getCapData,
  itemsByCap,
  tramosData = null,
  metaContrato = null,
  alcanceLabel = 'General',
  contratoId,
  exportadoPor,
  filename,
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Presupuesto'
  const generatedAt = new Date()
  wb.created = generatedAt

  const exportCtx = {
    metaContrato: metaContrato || {},
    versionesOrd,
    alcanceLabel,
    exportadoPor,
    generatedAt,
  }

  const usedNames = new Set()

  const wsCap = wb.addWorksheet(reservarNombreHoja('Capítulos', usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaCapitulos(wsCap, versionesOrd, capitulosUnion, getCapData, exportCtx)

  const wsItems = wb.addWorksheet(reservarNombreHoja('Ítems', usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaItems(wsItems, versionesOrd, capitulosUnion, itemsByCap, exportCtx)

  if (tramosData && Object.keys(tramosData).length) {
    const tramoEntries = Object.entries(tramosData).sort(([a], [b]) =>
      a.localeCompare(b, 'es', { numeric: true }),
    )
    tramoEntries.forEach(([tramoLabel, block]) => {
      const sheetName = reservarNombreHoja(tramoLabel, usedNames)
      const ws = wb.addWorksheet(sheetName, {
        views: [{ showGridLines: false }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      })
      escribirHojaTramo(ws, tramoLabel, block, versionesOrd, exportCtx)
    })
  }

  const meta = wb.addWorksheet('Info')
  meta.getCell(1, 1).value = 'Alcance'
  meta.getCell(1, 2).value = alcanceLabel
  meta.getCell(2, 1).value = 'Versiones'
  meta.getCell(2, 2).value = versionesOrd.map((v) => v.etiqueta).join(' · ')
  meta.getCell(3, 1).value = 'Generado'
  meta.getCell(3, 2).value = new Date().toLocaleString('es-CO')
  meta.state = 'hidden'

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = versionesOrd.map((v) => `v${v.numero_version ?? v.id}`).join('_vs_')
  a.download =
    filename ||
    `comparacion_presupuesto_${contratoId ?? 'NA'}_${slug}_${alcanceLabel.replace(/[^\w.-]+/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
