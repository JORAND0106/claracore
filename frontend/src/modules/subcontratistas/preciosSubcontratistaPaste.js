/**
 * Pegado de columna VU Costo M.O. desde Excel → Tab Precios.
 * Valores por posición desde la fila activa; formatos numéricos habituales de Excel.
 */
import { parseNum, rowKey } from './preciosSubcontratistaSheetHelpers.js'
import { roundCop } from './preciosSubcontratistaExport.js'

/**
 * ¿El clipboard aporta más de un valor (columna / varias filas)?
 * Un solo valor sin saltos se deja al pegado nativo del input.
 */
export function esPasteColumnaVu(text) {
  if (text == null || text === '') return false
  const vals = parseClipboardColumnValues(text)
  if (vals.length > 1) return true
  if (vals.length === 1 && /[\n\r\t]/.test(String(text))) return true
  return false
}

/**
 * Extrae la primera columna del TSV/CSV del portapapeles (una celda por fila).
 * @returns {string[]}
 */
export function parseClipboardColumnValues(text) {
  if (text == null || text === '') return []
  const raw = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (!lines.length) return []
  const hasTab = lines.some((l) => l.includes('\t'))
  return lines.map((line) => {
    const parts = hasTab ? line.split('\t') : [line]
    return String(parts[0] ?? '').trim()
  })
}

/**
 * Interpreta un valor pegado desde Excel como dinero COP (antes AIU/IVA).
 * Acepta $, COP, miles (punto o coma), decimal coma/punto, espacios, (negativos).
 * @returns {{ ok: true, value: number|null, empty: boolean }
 *   | { ok: false, raw: string }}
 *   value null + empty true = celda vacía (borrar precio).
 */
export function parseExcelMoneyCell(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return { ok: true, value: null, empty: true }

  // Negativo contable Excel: (1.234,56)
  let neg = false
  const paren = s.match(/^\((.*)\)$/)
  if (paren) {
    neg = true
    s = paren[1].trim()
  }

  // Quitar moneda / ruido
  s = s
    .replace(/COP\.?/gi, '')
    .replace(/USD\.?/gi, '')
    .replace(/EUR\.?/gi, '')
    .replace(/[$€£]/g, '')
    .replace(/\s/g, '')
    .trim()

  if (!s) return { ok: true, value: null, empty: true }
  if (/^-/.test(s)) {
    neg = true
    s = s.slice(1)
  }

  // Solo dígitos y separadores
  if (!/^[\d.,]+$/.test(s)) {
    return { ok: false, raw: String(raw ?? '').trim() }
  }

  let normalized = s
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // El último separador es decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 1.234.567,89
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234,567.89
      normalized = s.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    // 1234,56 o 1.234 → si hay exactamente un grupo de 3 tras coma → miles? 
    // Heurística: si parte decimal tiene 1-2 dígitos → decimal; si 3 → miles raro.
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0].replace(/\./g, '')}.${parts[1]}`
    } else if (parts.every((p, i) => i === 0 || p.length === 3)) {
      // 1,234,567 miles estilo US sin decimal
      normalized = s.replace(/,/g, '')
    } else {
      normalized = s.replace(',', '.')
    }
  } else if (hasDot && !hasComma) {
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = s // decimal punto
    } else if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3)) {
      // 1.234.567 o 1.234 miles es-CO
      normalized = s.replace(/\./g, '')
    } else {
      normalized = s
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return { ok: false, raw: String(raw ?? '').trim() }
  const signed = neg ? -Math.abs(n) : n
  if (signed < 0) return { ok: false, raw: String(raw ?? '').trim() }
  return { ok: true, value: roundCop(signed), empty: false }
}

/**
 * Arma el plan de pegado por posición desde startIndex en el orden visible de `rows`.
 */
export function buildVuCostoPastePlan({
  rows = [],
  drafts = {},
  startIndex = 0,
  pastedTexts = [],
} = {}) {
  const list = Array.isArray(rows) ? rows : []
  const start = Math.max(0, Number(startIndex) || 0)
  const texts = Array.isArray(pastedTexts) ? pastedTexts : []
  const aplicaran = []
  const invalidos = []
  const vacios = []
  let consumed = 0

  for (let i = 0; i < texts.length; i += 1) {
    const rowIdx = start + i
    const raw = texts[i]
    const parsed = parseExcelMoneyCell(raw)

    if (rowIdx >= list.length) {
      // Sobrantes: no hay fila
      if (!parsed.ok) {
        invalidos.push({ offset: i, raw: parsed.raw, motivo: 'fuera_de_tabla' })
      } else if (parsed.empty) {
        vacios.push({ offset: i, raw: '', motivo: 'fuera_de_tabla' })
      } else {
        invalidos.push({
          offset: i,
          raw: String(raw ?? ''),
          value: parsed.value,
          motivo: 'fuera_de_tabla',
        })
      }
      continue
    }

    consumed += 1
    const r = list[rowIdx]
    const key = rowKey(r)
    const d = drafts[key] || {}
    const actualRaw = d.vu_costo != null && d.vu_costo !== ''
      ? d.vu_costo
      : (r.vu_costo_mo != null && r.vu_costo_mo !== '' ? r.vu_costo_mo : '')
    const actualNum = parseNum(actualRaw)
    const actual = actualNum == null || Number.isNaN(actualNum) ? null : roundCop(actualNum)

    if (!parsed.ok) {
      invalidos.push({
        offset: i,
        rowIndex: rowIdx,
        key,
        item: String(r.item_numero || '').trim() || '—',
        descripcion: String(r.descripcion || '').trim() || '—',
        actual,
        raw: parsed.raw,
        motivo: 'no_numerico',
      })
      continue
    }

    if (parsed.empty) {
      vacios.push({
        offset: i,
        rowIndex: rowIdx,
        key,
        item: String(r.item_numero || '').trim() || '—',
        descripcion: String(r.descripcion || '').trim() || '—',
        actual,
        nuevo: null,
        motivo: 'vacio',
      })
      aplicaran.push({
        key,
        rowIndex: rowIdx,
        item: String(r.item_numero || '').trim() || '—',
        descripcion: String(r.descripcion || '').trim() || '—',
        actual,
        nuevo: null,
        nuevoDraft: '',
        vacio: true,
      })
      continue
    }

    aplicaran.push({
      key,
      rowIndex: rowIdx,
      item: String(r.item_numero || '').trim() || '—',
      descripcion: String(r.descripcion || '').trim() || '—',
      actual,
      nuevo: parsed.value,
      nuevoDraft: String(parsed.value),
      vacio: false,
    })
  }

  const capacity = Math.max(0, list.length - start)
  const sobrantesVals = texts.slice(capacity)
  const sobrantesCount = sobrantesVals.length

  return {
    startIndex: start,
    filasDisponibles: capacity,
    totalPegados: texts.length,
    aplicaran,
    invalidos: invalidos.filter((x) => x.motivo === 'no_numerico'),
    sobrantesCount,
    sobrantesVals,
    vaciosEnRango: vacios.filter((x) => x.motivo === 'vacio'),
    consumed,
    puedeAplicar: aplicaran.length > 0,
  }
}

/** Aplica el plan a drafts (solo vu_costo). No muta rows. */
export function applyVuCostoPastePlan(drafts, plan) {
  const next = { ...(drafts || {}) }
  for (const row of plan?.aplicaran || []) {
    next[row.key] = { ...(next[row.key] || {}), vu_costo: row.nuevoDraft }
  }
  return next
}
