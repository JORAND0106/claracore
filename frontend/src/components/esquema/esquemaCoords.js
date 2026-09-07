/**
 * Tabla de coordenadas del editor de esquema.
 * Este = X, Norte = Y (Norte positivo hacia arriba del lienzo).
 * Sin transformación de sistema de referencia: solo origen local de dibujo.
 */
import * as XLSX from 'xlsx'
import { PX_PER_METER } from './esquemaGeometry.js'

const HEADER_NUM = /^(n[oº°]?|nro|num|numero|n[uú]mero|#|id)$/
const HEADER_NORTE = /^(norte|north|y)$/
const HEADER_ESTE = /^(este|east|x)$/
const HEADER_COTA = /^(cota|z|elev|elevacion|elevaci[oó]n|altura)$/
const HEADER_DESC = /^(desc|descripcion|descripci[oó]n|detalle|obs|observacion)$/
const HEADER_NODO = /(nodo|punto|pk)/

function normHeader(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9#]+/g, '')
}

function classifyHeader(raw) {
  const s = normHeader(raw)
  if (!s) return null
  if (HEADER_NODO.test(s) && !HEADER_NORTE.test(s)) return 'num'
  if (HEADER_NUM.test(s)) return 'num'
  if (HEADER_NORTE.test(s) || s.includes('norte')) return 'norte'
  if (HEADER_ESTE.test(s) || s.includes('este')) return 'este'
  if (HEADER_COTA.test(s) || s.includes('cota')) return 'cota'
  if (HEADER_DESC.test(s) || s.includes('desc')) return 'desc'
  return null
}

function parseNumber(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function mapRow(cells, map) {
  const num = map.num != null ? cells[map.num] : cells[0]
  const norte = parseNumber(map.norte != null ? cells[map.norte] : cells[1])
  const este = parseNumber(map.este != null ? cells[map.este] : cells[2])
  if (norte == null && este == null) return null
  return {
    num: String(num ?? '').trim() || '',
    norte: norte ?? 0,
    este: este ?? 0,
    cota: parseNumber(map.cota != null ? cells[map.cota] : cells[3]),
    desc: String((map.desc != null ? cells[map.desc] : cells[4]) ?? '').trim(),
  }
}

function detectMap(headerCells) {
  const map = {}
  headerCells.forEach((cell, i) => {
    const kind = classifyHeader(cell)
    if (kind && map[kind] == null) map[kind] = i
  })
  return map
}

export function parseCoordMatrix(matrix) {
  const rows = (matrix || [])
    .map((r) => (Array.isArray(r) ? r : []))
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (!rows.length) return []
  const headerMap = detectMap(rows[0].map((c) => String(c ?? '')))
  const hasHeader = headerMap.norte != null || headerMap.este != null
  const map = hasHeader
    ? headerMap
    : { num: 0, norte: 1, este: 2, cota: 3, desc: 4 }
  const data = hasHeader ? rows.slice(1) : rows
  const out = []
  let auto = 1
  for (const cells of data) {
    const row = mapRow(cells, map)
    if (!row) continue
    if (!row.num) {
      row.num = String(auto)
    }
    auto += 1
    out.push(row)
  }
  return out
}

export function parseCoordCsv(text) {
  const raw = String(text ?? '').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const matrix = lines.map((line) => {
    if (line.includes(';') && !line.includes(',')) return line.split(';')
    if (line.includes('\t')) return line.split('\t')
    return splitCsvLine(line)
  })
  return parseCoordMatrix(matrix)
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        q = !q
      }
    } else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function parseCoordWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
  return parseCoordMatrix(matrix)
}

export async function parseCoordFile(file) {
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCoordCsv(await file.text())
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseCoordWorkbook(await file.arrayBuffer())
  }
  throw new Error('Use un archivo .csv o .xlsx')
}

export function coordOriginFromRows(rows) {
  if (!rows?.length) return { este0: 0, norte0: 0 }
  return { este0: rows[0].este, norte0: rows[0].norte }
}

/** Este → X; Norte → Y hacia arriba (se invierte el eje Y del lienzo). */
export function topoToWorld(este, norte, origin, pxPerMeter = PX_PER_METER) {
  const o = origin || { este0: 0, norte0: 0 }
  return {
    x: ((este ?? 0) - (o.este0 || 0)) * pxPerMeter,
    y: -((norte ?? 0) - (o.norte0 || 0)) * pxPerMeter,
  }
}

export function emptyCoordRow(num = '') {
  return { num: String(num), norte: '', este: '', cota: '', desc: '' }
}
