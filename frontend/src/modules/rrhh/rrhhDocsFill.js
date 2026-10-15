/**
 * Helpers de avance documental (4 grupos) para la grilla RRHH.
 * Espejo de backend/rrhh_docs_fill.py — solo presentación/normalización en FE.
 */

export const DOCS_FILL_GROUPS = ['contrato', 'soporte', 'ingreso', 'afiliacion']

export const docsFillLegend = [
  { key: 'contrato', order: 1, short: 'Contrato', label: 'Contrato laboral' },
  { key: 'soporte', order: 2, short: 'Soporte', label: 'Documentos de soporte' },
  { key: 'ingreso', order: 3, short: 'Ingreso', label: 'Documentos de ingreso' },
  { key: 'afiliacion', order: 4, short: 'Afiliación', label: 'Certificaciones de afiliación' },
]

const EMPTY = { filled: 0, total: 0, ratio: 0 }

export function normalizeDocsFill(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const g of DOCS_FILL_GROUPS) {
    const s = src[g] && typeof src[g] === 'object' ? src[g] : {}
    let filled = Number(s.filled)
    let total = Number(s.total)
    if (!Number.isFinite(filled) || filled < 0) filled = 0
    if (!Number.isFinite(total) || total < 0) total = 0
    if (total > 0) filled = Math.min(filled, total)
    let ratio = Number(s.ratio)
    if (!Number.isFinite(ratio)) {
      ratio = total > 0 ? filled / total : 0
    }
    ratio = Math.max(0, Math.min(1, ratio))
    out[g] = { filled, total, ratio }
  }
  return out
}

export function emptyDocsFill() {
  return Object.fromEntries(DOCS_FILL_GROUPS.map((g) => [g, { ...EMPTY }]))
}
