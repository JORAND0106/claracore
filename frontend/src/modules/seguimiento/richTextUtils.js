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
  // Si trae numerales de síntesis, preferir <ol> compatible con el editor.
  if (/^\s*\d+[\.)]\s+\S/m.test(raw)) {
    return sintesisPlainToHtml(raw)
  }
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((l) => escapeHtml(l)).join('<br>')
      return `<p>${lines || '<br>'}</p>`
    })
    .join('')
}

const SINTESIS_ITEM_RE = /^\s*(?:(\d+)[.)]\s+|[-*•]\s+)(.+?)\s*$/u

/**
 * Separa intro + ítems numerados (texto plano o HTML simple del editor).
 * @returns {{ intro: string, items: string[] }}
 */
export function parseSintesisEstructura(texto) {
  let raw = String(texto ?? '').trim()
  if (!raw) return { intro: '', items: [] }
  if (looksLikeHtml(raw)) {
    // Marcar <li> como ítems numerados para no perder la lista al quitar etiquetas.
    raw = raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n1. ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
  }
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .map((ln) => ln.trim())
    .filter(Boolean)
  const introParts = []
  const items = []
  let seenItem = false
  for (const ln of lines) {
    const m = ln.match(SINTESIS_ITEM_RE)
    if (m) {
      seenItem = true
      const body = String(m[2] || '').trim()
      if (body) items.push(body)
      continue
    }
    if (!seenItem) introParts.push(ln)
    else if (items.length) items[items.length - 1] = `${items[items.length - 1]} ${ln}`.trim()
    else introParts.push(ln)
  }
  return { intro: introParts.join(' ').trim(), items }
}

/** HTML TipTap: párrafo intro + lista numerada (o un solo párrafo si no hay lista). */
export function sintesisPlainToHtml(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return '<p></p>'
  if (looksLikeHtml(raw) && /<ol[\s>]/i.test(raw)) return raw
  const { intro, items } = parseSintesisEstructura(raw)
  if (!items.length) {
    return plainTextToHtmlLegacyParagraphs(intro || raw)
  }
  const introHtml = intro ? `<p>${escapeHtml(intro)}</p>` : ''
  const lis = items.map((it) => `<li><p>${escapeHtml(it)}</p></li>`).join('')
  return `${introHtml}<ol>${lis}</ol>`
}

function plainTextToHtmlLegacyParagraphs(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return '<p></p>'
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((l) => escapeHtml(l)).join('<br>')
      return `<p>${lines || '<br>'}</p>`
    })
    .join('')
}

function normItemKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
}

/**
 * Anexa síntesis nueva al HTML/plano existente con numeración continua.
 * No reemplaza intro ni ítems ya presentes (p. ej. corregidos a mano).
 */
export function appendSintesisTemaHtml(prevHtml, nuevoTexto) {
  const prevRaw = String(prevHtml || '').trim()
  const newRaw = String(nuevoTexto || '').trim()
  if (!newRaw) return prevRaw || '<p></p>'
  if (!prevRaw || isRichTextEmpty(prevRaw)) return sintesisPlainToHtml(newRaw)

  const prev = parseSintesisEstructura(prevRaw)
  let incoming = parseSintesisEstructura(newRaw)
  if (!incoming.items.length && incoming.intro) {
    incoming = { intro: '', items: [incoming.intro] }
  }
  const existing = new Set([
    ...prev.items.map(normItemKey),
    ...(prev.intro ? [normItemKey(prev.intro)] : []),
  ].filter(Boolean))
  const added = incoming.items.filter((it) => !existing.has(normItemKey(it)))
  const intro = prev.intro || incoming.intro || ''

  if (!prev.items.length && !added.length && incoming.intro && !existing.has(normItemKey(incoming.intro))) {
    // Dos párrafos sueltos → lista de dos.
    return sintesisPlainToHtml(
      [prev.intro, incoming.intro].filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join('\n'),
    )
  }

  const items = [...prev.items, ...added]
  if (!items.length) {
    return intro ? `<p>${escapeHtml(intro)}</p>` : sintesisPlainToHtml(newRaw)
  }
  // Si el previo era un párrafo sin lista y ahora anexamos ítems, el intro previo
  // puede pasar a ser el primer ítem solo cuando no hay intro separada útil.
  let finalIntro = intro
  let finalItems = items
  if (!prev.items.length && prev.intro && added.length) {
    finalIntro = prev.intro
    finalItems = added
  }
  const introHtml = finalIntro ? `<p>${escapeHtml(finalIntro)}</p>` : ''
  const lis = finalItems.map((it) => `<li><p>${escapeHtml(it)}</p></li>`).join('')
  return `${introHtml}<ol>${lis}</ol>`
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
