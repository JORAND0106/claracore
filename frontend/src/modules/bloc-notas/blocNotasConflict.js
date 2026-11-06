/**
 * Resolución de conflicto local (espejo de la lógica del servidor).
 * Nunca descarta: si hay conflicto, se propone copia automática.
 */

export function conflictTitle(title) {
  const base = String(title || 'Nota').trim() || 'Nota'
  return `${base.slice(0, 240)} · copia`
}

/**
 * @returns {{ keepServer: boolean, copyLocal: boolean }}
 */
export function shouldCreateConflictCopy({ serverRev, baseRev, deleted = false }) {
  if (deleted) return { keepServer: false, copyLocal: false }
  if (serverRev == null || baseRev == null) return { keepServer: false, copyLocal: false }
  if (Number(serverRev) > Number(baseRev)) {
    return { keepServer: true, copyLocal: true }
  }
  return { keepServer: false, copyLocal: false }
}
