import { normTxt } from './almacenFiltrosShared.js'

/** Palabras de la búsqueda, sin tildes ni mayúsculas, sin repetir. */
export function tokensBusqueda(q) {
  const raw = normTxt(q)
  if (!raw) return []
  const out = []
  for (const tok of raw.split(/\s+/)) {
    if (tok && !out.includes(tok)) out.push(tok)
    if (out.length >= 20) break
  }
  return out
}

function foldMap(src) {
  let folded = ''
  const map = []
  for (let i = 0; i < src.length; i += 1) {
    const n = src[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    for (const c of n) {
      folded += c
      map.push(i)
    }
  }
  return { folded, map }
}

/**
 * Parte el texto visible en tramos, marcando cada palabra encontrada.
 * "tuberia" resalta "TUBERÍA".
 */
export function partesResaltadas(texto, tokens) {
  const src = String(texto ?? '')
  const toks = (tokens || []).map((t) => normTxt(t)).filter(Boolean)
  if (!src || !toks.length) return [{ text: src, hit: false }]
  const { folded, map } = foldMap(src)
  const marks = new Array(src.length).fill(false)
  for (const tok of toks) {
    let from = 0
    while (from < folded.length) {
      const at = folded.indexOf(tok, from)
      if (at < 0) break
      const start = map[at]
      const end = map[at + tok.length - 1]
      for (let i = start; i <= end && i < src.length; i += 1) marks[i] = true
      from = at + Math.max(tok.length, 1)
    }
  }
  const parts = []
  let buf = ''
  let hit = Boolean(marks[0])
  for (let i = 0; i < src.length; i += 1) {
    if (marks[i] !== hit && buf) {
      parts.push({ text: buf, hit })
      buf = ''
    }
    hit = marks[i]
    buf += src[i]
  }
  if (buf) parts.push({ text: buf, hit })
  return parts.length ? parts : [{ text: src, hit: false }]
}

export function textoConteoBusqueda(n) {
  const c = Number(n) || 0
  if (c === 1) return '1 solicitud'
  return `${c} solicitudes`
}
