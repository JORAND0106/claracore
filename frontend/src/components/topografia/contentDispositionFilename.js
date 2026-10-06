/** Nombre de archivo del header Content-Disposition (filename o filename*). */
export function filenameFromContentDisposition(header) {
  const raw = String(header || '')
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(raw)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch { /* filename= plano */ }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(raw)
  if (quoted) return quoted[1].trim()
  const plain = /filename\s*=\s*([^;]+)/i.exec(raw)
  return plain ? plain[1].trim().replace(/^"|"$/g, '') : ''
}
