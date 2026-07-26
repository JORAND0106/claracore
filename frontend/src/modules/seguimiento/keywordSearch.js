/**
 * Buscador de palabras clave reutilizable (actas / bandeja).
 * Pensado para ampliarse a otros módulos de la plataforma.
 */
export function tokenizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[\s,.;:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

export function normalizeText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** True si todas las tokens aparecen en el corpus textual. */
export function matchesKeywords(corpus, query) {
  const tokens = tokenizeQuery(query)
  if (!tokens.length) return true
  const hay = normalizeText(corpus)
  return tokens.every((t) => hay.includes(t))
}

export function buildCorpus(...parts) {
  return parts
    .flatMap((p) => {
      if (p == null) return []
      if (Array.isArray(p)) return p.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)))
      if (typeof p === 'object') return [JSON.stringify(p)]
      return [String(p)]
    })
    .join('\n')
}
