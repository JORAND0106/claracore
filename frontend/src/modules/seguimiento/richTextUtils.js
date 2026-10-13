/** Utilidades para HTML de temas (TipTap) — sin dependencias externas. */

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i

export function looksLikeHtml(value) {
  return HTML_TAG_RE.test(String(value || ''))
}

/** Convierte texto plano legado a HTML TipTap mínimo. */
export function plainTextToHtml(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return '<p></p>'
  if (looksLikeHtml(raw)) return raw
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((l) => escapeHtml(l)).join('<br>')
      return `<p>${lines || '<br>'}</p>`
    })
    .join('')
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Texto plano para compromisos / Clara / tooltips (sin etiquetas). */
export function htmlToPlainText(html) {
  const s = String(html ?? '')
  if (!s) return ''
  if (!looksLikeHtml(s)) return s
  // Regex (no textContent): evita "equipo.El recurso" al pegar bloques adyacentes.
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<\/th>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isRichTextEmpty(html) {
  const plain = htmlToPlainText(html)
  return !plain.trim()
}
