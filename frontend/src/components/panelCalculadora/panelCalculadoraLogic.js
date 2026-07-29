/** Lógica pura de la calculadora de paneles dinámicos. */

export const PANEL_CALC_OPS = [
  { id: '+', symbol: '+', label: 'Sumar' },
  { id: '-', symbol: '−', label: 'Restar' },
  { id: '*', symbol: '×', label: 'Multiplicar' },
  { id: '/', symbol: '÷', label: 'Dividir' },
]

export function panelCalcApplyOp(a, op, b) {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    case '/':
      if (y === 0) return null
      return x / y
    default:
      return null
  }
}

/** Evalúa una cadena [num, op, num, op, num, ...] de izquierda a derecha. */
export function panelCalcEvalChain(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null
  let acc = null
  let pendingOp = null
  for (const tok of tokens) {
    if (tok?.type === 'op') {
      pendingOp = tok.op
      continue
    }
    if (tok?.type !== 'num') continue
    const v = Number(tok.value)
    if (!Number.isFinite(v)) return null
    if (acc == null) {
      acc = v
      continue
    }
    if (!pendingOp) return null
    const next = panelCalcApplyOp(acc, pendingOp, v)
    if (next == null) return null
    acc = next
    pendingOp = null
  }
  return acc
}

export function panelCalcFmtNumber(n, { money = false } = {}) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (money) {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(v)
    } catch {
      return `$${Math.round(v).toLocaleString('es-CO')}`
    }
  }
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6
  return v.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

export function panelCalcCategoryId(colKey, kind) {
  return `${String(colKey || '')}::${String(kind || 'valor')}`
}
