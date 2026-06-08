import ExcelJS from 'exceljs'
import { fmtDateHistorial } from './progObraVersiones'

function hexArgb(hex) {
  const h = (hex || '').replace('#', '').trim()
  return h.length === 6 ? `FF${h.toUpperCase()}` : 'FF0F766E'
}

function styleHeader(row, color = '0F766E') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexArgb(color) } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 22
}

function fmtDelta(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '0'
  return `${v > 0 ? '+' : ''}${v}`
}

export async function exportComparacionGlobalExcel({
  data,
  contratoNumero,
  contratista,
  filename = 'comparacion-global.xlsx',
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClaraCore'
  const ws = wb.addWorksheet('Comparación global', { views: [{ state: 'frozen', ySplit: 5 }] })

  ws.mergeCells('A1:J1')
  ws.getCell('A1').value = `COMPARACIÓN BASELINE VS PROGRAMACIÓN ACTUAL — Contrato ${contratoNumero || ''}`
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: hexArgb('0F766E') } }

  const res = data?.resumen || {}
  const rg = data?.resumen_global || {}
  ws.getCell('A3').value = 'Fecha fin baseline:'
  ws.getCell('B3').value = fmtDateHistorial(res.fin_proyecto_baseline) || '—'
  ws.getCell('D3').value = 'Fecha fin actual:'
  ws.getCell('E3').value = fmtDateHistorial(res.fin_proyecto_target) || '—'
  ws.getCell('G3').value = 'Desviación total:'
  ws.getCell('H3').value = `${fmtDelta(res.delta_fin_proyecto_dias)} días`
  ws.getCell('A4').value = `PKs adelantados: ${rg.pks_adelantados ?? 0}  |  atrasados: ${rg.pks_atrasados ?? 0}  |  sin cambio: ${rg.pks_sin_cambio ?? 0}  |  sin programar: ${rg.pks_sin_programar ?? 0}`

  const hdr = ws.addRow([
    'PK', 'Agrupador', 'B. Inicio', 'A. Inicio', 'Δ Inicio', 'B. Fin', 'A. Fin', 'Δ Fin', 'Δ Costo', 'Estado',
  ])
  styleHeader(hdr)

  for (const n of data?.nodos || []) {
    ws.addRow([
      n.pk_id,
      n.label || n.codigo_wbs || '—',
      fmtDateHistorial(n.baseline?.fecha_inicio),
      fmtDateHistorial(n.target?.fecha_inicio),
      fmtDelta(n.delta?.dias_inicio),
      fmtDateHistorial(n.baseline?.fecha_fin),
      fmtDateHistorial(n.target?.fecha_fin),
      fmtDelta(n.delta?.dias_fin),
      n.delta?.costo ?? '',
      n.tipo_cambio || 'sin_cambio',
    ])
  }

  ws.columns = [
    { width: 10 }, { width: 28 }, { width: 14 }, { width: 14 }, { width: 10 },
    { width: 14 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 14 },
  ]

  const meta = wb.addWorksheet('Metadatos')
  meta.addRow(['Contratista', contratista || ''])
  meta.addRow(['Generado', new Date().toLocaleString('es-CO')])

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
