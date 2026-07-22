import ExcelJS from 'exceljs'

const PASTEL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F4FA' } }
const PASTEL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFF8' } }
const COP_NUM_FMT = '"$"#,##0'
const QTY_NUM_FMT = '#,##0.00'
const DELTA_QTY_FMT = '+#,##0.00;-#,##0.00;—'
const DELTA_COP_FMT = '+#,##0;-#,##0;—'

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

function estiloHeader(cell) {
  cell.fill = PASTEL_HEADER
  cell.font = { bold: true, size: 10, color: { argb: 'FF1F4E70' } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF64748B' } },
    bottom: { style: 'thin', color: { argb: 'FF64748B' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  }
}

function estiloTitulo(cell) {
  cell.fill = PASTEL_TITLE
  cell.font = { bold: true, size: 12, color: { argb: 'FF0F1923' } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function estiloDato(cell, { align = 'right', numFmt } = {}) {
  cell.alignment = { vertical: 'middle', horizontal: align }
  if (numFmt) cell.numFmt = numFmt
  cell.border = {
    bottom: { style: 'dotted', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }
}

/** Columnas por versión: cant, costo; desde la 2.ª versión: + delta cant, delta costo (fórmulas). */
function buildVersionColumnPlan(versionesOrd) {
  const cols = [{ key: 'label', width: 36 }]
  versionesOrd.forEach((v, vi) => {
    cols.push({ key: `${v.id}-cant`, versionId: v.id, kind: 'cant', versionIdx: vi, etiqueta: v.etiqueta })
    cols.push({ key: `${v.id}-costo`, versionId: v.id, kind: 'costo', versionIdx: vi, etiqueta: v.etiqueta })
    if (vi > 0) {
      cols.push({
        key: `${v.id}-dcant`,
        versionId: v.id,
        kind: 'delta_cant',
        versionIdx: vi,
        etiqueta: v.etiqueta,
        prevVersionId: versionesOrd[vi - 1].id,
      })
      cols.push({
        key: `${v.id}-dcosto`,
        versionId: v.id,
        kind: 'delta_costo',
        versionIdx: vi,
        etiqueta: v.etiqueta,
        prevVersionId: versionesOrd[vi - 1].id,
      })
    }
  })
  return cols
}

function escribirEncabezadosCompare(ws, versionesOrd, rowOffset = 1) {
  const cols = buildVersionColumnPlan(versionesOrd)
  const r1 = ws.getRow(rowOffset)
  const r2 = ws.getRow(rowOffset + 1)

  r1.getCell(1).value = 'Capítulo / Ítem'
  ws.mergeCells(rowOffset, 1, rowOffset + 1, 1)
  estiloHeader(r1.getCell(1))
  estiloHeader(r2.getCell(1))

  let colNum = 2
  versionesOrd.forEach((v, vi) => {
    const span = vi > 0 ? 4 : 2
    r1.getCell(colNum).value = v.etiqueta
    ws.mergeCells(rowOffset, colNum, rowOffset, colNum + span - 1)
    estiloHeader(r1.getCell(colNum))

    r2.getCell(colNum).value = 'Cantidad'
    estiloHeader(r2.getCell(colNum))
    r2.getCell(colNum + 1).value = 'Costo directo'
    estiloHeader(r2.getCell(colNum + 1))

    if (vi > 0) {
      r2.getCell(colNum + 2).value = '▲ Cantidad'
      estiloHeader(r2.getCell(colNum + 2))
      r2.getCell(colNum + 3).value = '▲ Costo directo'
      estiloHeader(r2.getCell(colNum + 3))
    }
    colNum += span
  })

  return { cols, firstDataRow: rowOffset + 2 }
}

function valorCantCosto(data, kind) {
  if (!data) return null
  if (kind === 'cant') return Number(data.cant_total)
  return Math.round(Number(data.costo_total) || 0)
}

function escribirFilaCompare(ws, rowNum, cols, getDataForVersion) {
  const r = ws.getRow(rowNum)
  const colIndexByKey = {}
  cols.forEach((c, idx) => {
    colIndexByKey[c.key] = idx + 1
  })

  cols.forEach((c, idx) => {
    const cell = r.getCell(idx + 1)
    if (c.kind === 'label') return

    const colNum = idx + 1
    if (c.kind === 'cant' || c.kind === 'costo') {
      const data = getDataForVersion(c.versionId)
      const val = valorCantCosto(data, c.kind)
      if (val == null || Number.isNaN(val)) {
        cell.value = null
      } else {
        cell.value = val
      }
      estiloDato(cell, { numFmt: c.kind === 'cant' ? QTY_NUM_FMT : COP_NUM_FMT })
      return
    }

    const prevCantCol = colIndexByKey[`${c.prevVersionId}-cant`]
    const currCantCol = colIndexByKey[`${c.versionId}-cant`]
    const prevCostoCol = colIndexByKey[`${c.prevVersionId}-costo`]
    const currCostoCol = colIndexByKey[`${c.versionId}-costo`]

    if (c.kind === 'delta_cant') {
      cell.value = {
        formula: `IF(OR(${colToLetter(prevCantCol)}${rowNum}="",${colToLetter(currCantCol)}${rowNum}=""),"",${colToLetter(currCantCol)}${rowNum}-${colToLetter(prevCantCol)}${rowNum})`,
      }
      estiloDato(cell, { numFmt: DELTA_QTY_FMT })
    } else if (c.kind === 'delta_costo') {
      cell.value = {
        formula: `IF(OR(${colToLetter(prevCostoCol)}${rowNum}="",${colToLetter(currCostoCol)}${rowNum}=""),"",${colToLetter(currCostoCol)}${rowNum}-${colToLetter(prevCostoCol)}${rowNum})`,
      }
      estiloDato(cell, { numFmt: DELTA_COP_FMT })
    } else {
      estiloDato(cell)
    }
  })
}

function escribirHojaCapitulos(ws, versionesOrd, capitulosUnion, getCapData) {
  ws.getCell(1, 1).value = 'Comparación por capítulo'
  estiloTitulo(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, Math.max(4, versionesOrd.length * 4))

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, 3)
  let rowNum = firstDataRow

  capitulosUnion.forEach((cap) => {
    const r = ws.getRow(rowNum)
    r.getCell(1).value = cap
    estiloDato(r.getCell(1), { align: 'left' })
    escribirFilaCompare(ws, rowNum, cols, (versionId) => getCapData(versionId, cap))
    rowNum += 1
  })

  ws.getColumn(1).width = 36
  let cn = 2
  versionesOrd.forEach((_, vi) => {
    ws.getColumn(cn).width = 14
    ws.getColumn(cn + 1).width = 16
    if (vi > 0) {
      ws.getColumn(cn + 2).width = 14
      ws.getColumn(cn + 3).width = 16
    }
    cn += vi > 0 ? 4 : 2
  })

  ws.views = [{ state: 'frozen', ySplit: firstDataRow - 1, xSplit: 1, showGridLines: true }]
  return rowNum
}

function escribirHojaItems(ws, versionesOrd, capitulosUnion, itemsByCap) {
  ws.getCell(1, 1).value = 'Comparación por ítem (sin detalle de origen)'
  estiloTitulo(ws.getCell(1, 1))
  ws.mergeCells(1, 1, 1, Math.max(4, versionesOrd.length * 4))

  const { cols, firstDataRow } = escribirEncabezadosCompare(ws, versionesOrd, 3)
  let rowNum = firstDataRow

  capitulosUnion.forEach((cap) => {
    const itemRows = itemsByCap[cap]
    if (!itemRows) return
    const itemKeys = [
      ...new Set(itemRows.flatMap(({ items }) => items.map((it) => String(it.item)))),
    ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))

    itemKeys.forEach((itemKey) => {
      const desc =
        itemRows
          .map((x) => x.items.find((it) => String(it.item) === itemKey)?.descripcion)
          .find(Boolean) || ''
      const r = ws.getRow(rowNum)
      r.getCell(1).value = desc ? `${cap} · ${itemKey} — ${desc}` : `${cap} · ${itemKey}`
      estiloDato(r.getCell(1), { align: 'left' })

      escribirFilaCompare(ws, rowNum, cols, (versionId) => {
        const block = itemRows.find((x) => String(x.version.id) === String(versionId))
        return block?.items?.find((it) => String(it.item) === itemKey) || null
      })
      rowNum += 1
    })
  })

  ws.getColumn(1).width = 48
  let cn = 2
  versionesOrd.forEach((_, vi) => {
    ws.getColumn(cn).width = 14
    ws.getColumn(cn + 1).width = 16
    if (vi > 0) {
      ws.getColumn(cn + 2).width = 14
      ws.getColumn(cn + 3).width = 16
    }
    cn += vi > 0 ? 4 : 2
  })

  ws.views = [{ state: 'frozen', ySplit: firstDataRow - 1, xSplit: 1, showGridLines: true }]
}

/**
 * Exporta comparación de versiones (capítulos + ítems) con fórmulas Excel en columnas ▲.
 */
export async function downloadVersionCompareExcel({
  versionesOrd,
  capitulosUnion,
  getCapData,
  itemsByCap,
  alcanceLabel = 'General',
  contratoId,
  filename,
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore · Presupuesto'
  wb.created = new Date()

  const wsCap = wb.addWorksheet('Capítulos', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaCapitulos(wsCap, versionesOrd, capitulosUnion, getCapData)

  const wsItems = wb.addWorksheet('Ítems', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  escribirHojaItems(wsItems, versionesOrd, capitulosUnion, itemsByCap)

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
