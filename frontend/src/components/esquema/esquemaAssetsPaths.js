/**
 * Rutas legibles de archivos de esquema en la nube privada del contrato.
 * Contrato / Módulo / Reporte o documento / Registro / archivo
 */

const SAFE = /[^a-zA-Z0-9._\- áéíóúÁÉÍÓÚñÑ]+/g

export function slugEsquemaPathPart(raw, fallback = 'sin-nombre') {
  const s = String(raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SAFE, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return s || fallback
}

/**
 * @param {{
 *   contratoId: string|number,
 *   modulo: string,
 *   reporteId?: string|number|null,
 *   reporteNombre?: string|null,
 *   registroId?: string|number|null,
 *   registroNombre?: string|null,
 * }} opts
 * @returns {string} prefijo sin slash final
 */
export function esquemaAssetsFolderPrefix({
  contratoId,
  modulo,
  reporteId = null,
  reporteNombre = null,
  registroId = null,
  registroNombre = null,
} = {}) {
  const cid = slugEsquemaPathPart(contratoId, 'contrato')
  const mod = slugEsquemaPathPart(modulo, 'modulo')
  const repLabel = [
    reporteId != null && reporteId !== '' ? String(reporteId) : null,
    reporteNombre ? slugEsquemaPathPart(reporteNombre) : null,
  ].filter(Boolean).join('-') || 'documento'
  const regLabel = [
    registroId != null && registroId !== '' ? String(registroId) : null,
    registroNombre ? slugEsquemaPathPart(registroNombre) : null,
  ].filter(Boolean).join('-') || 'registro'
  return `esquemas/${cid}/${mod}/${repLabel}/${regLabel}`
}

/**
 * Nombre de archivo legible por tipo.
 * @param {'png'|'pdf'|'dxf'|'scene'|'memoria'|'despiece'} kind
 * @param {{ title?: string, stamp?: string|number }} [opts]
 */
export function esquemaAssetFileName(kind, { title = 'esquema', stamp = Date.now() } = {}) {
  const base = slugEsquemaPathPart(title, 'esquema')
  const ts = String(stamp)
  switch (String(kind || '').toLowerCase()) {
    case 'pdf':
      return `${base}_${ts}.pdf`
    case 'dxf':
      return `${base}_${ts}.dxf`
    case 'scene':
      return `${base}_${ts}.scene.json`
    case 'memoria':
      return `memoria_${base}_${ts}.png`
    case 'despiece':
      return `despiece_${base}_${ts}.png`
    case 'png':
    default:
      return `${base}_${ts}.png`
  }
}

/**
 * Ruta completa blob privada.
 */
export function esquemaAssetBlobPath(folderOpts, kind, nameOpts = {}) {
  const folder = esquemaAssetsFolderPrefix(folderOpts)
  const file = esquemaAssetFileName(kind, nameOpts)
  return `${folder}/${file}`
}
