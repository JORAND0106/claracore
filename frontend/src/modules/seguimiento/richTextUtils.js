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

/** Texto plano para compromisos / Clara (sin etiquetas). */
export function htmlToPlainText(html) {
  const s = String(html ?? '')
  if (!s) return ''
  if (!looksLikeHtml(s)) return s
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = s
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim()
  }
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isRichTextEmpty(html) {
  const plain = htmlToPlainText(html)
  return !plain.trim()
}
