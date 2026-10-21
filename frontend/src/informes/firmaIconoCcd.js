/**
 * Ícono de firmar en Informes: lo ve el usuario asignado en la Biblioteca CCD
 * al rol que todavía no está firmado. No depende de la acción Validar.
 * Formatos Entidades Externas quedan fuera (siguen con el permiso Validar).
 */

export const ORDEN_SLOTS_FIRMA = ['elaboro', 'elaboro2', 'reviso', 'reviso2', 'aprobo']

export const ETIQUETA_SLOT_FIRMA = {
  elaboro: 'Elaboró',
  elaboro2: 'Elaboró 2',
  reviso: 'Revisó',
  reviso2: 'Revisó 2',
  aprobo: 'Aprobó',
}

/** Mismos slots que FORMATOS_CCD. La biblioteca del contrato manda si trae slots_firma. */
export const SLOTS_FIRMA_POR_FORMATO = {
  'CC-SUB-001': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'subcontratista' },
  ],
  'CC-SUB-002': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'subcontratista' },
  ],
  'CC-SEM-001': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'configuracion' },
  ],
  'CC-SEM-002': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'configuracion' },
  ],
  'CC-MES-001': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'configuracion' },
  ],
  'CC-MES-002': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'configuracion' },
  ],
  'CC-GER-001': [
    { id: 'elaboro', origen: 'configuracion' },
    { id: 'reviso', origen: 'configuracion' },
    { id: 'aprobo', origen: 'configuracion' },
  ],
}

const CODIGO_ENTIDAD_EXTERNA = 'FO-IDU-EO-04-V2'

export function etiquetaSlotFirmaCcd(slot) {
  return ETIQUETA_SLOT_FIRMA[slot] || slot
}

function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[!?.¡¿,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function usuarioIdNumero(usuario) {
  const n = Number(usuario?.id)
  return Number.isFinite(n) && n > 0 ? n : null
}

function idSlot(cfg, slot) {
  const raw = cfg?.[`${slot}_usuario_id`]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function slotOcupado(firmas, slot) {
  const v = firmas?.[slot]
  if (!v || typeof v !== 'object') return false
  return !!(v.registrada || v.usuario_id || v.created_at)
}

function nombreCoincide(cfg, slot, usuario) {
  const nc = normalizarNombre(cfg?.[`${slot}_nombre`])
  if (!nc || nc === '—' || nc === 'ej. elaboró' || nc === 'ej. revisó') return false
  const nom = normalizarNombre(`${usuario?.nombre || ''} ${usuario?.apellidos || ''}`)
  if (!nom) return false
  return nom === nc || nom.includes(nc) || nc.includes(nom)
}

/**
 * Primer rol de origen «configuracion», aún sin firma, asignado a este usuario.
 * null si el formato es de entidades externas, si las firmas del documento no
 * cargaron, o si el usuario no tiene un rol pendiente.
 */
export function slotFirmaPendienteCcd({ codigo, formato, cfg, firmas, usuario }) {
  if (codigo === CODIGO_ENTIDAD_EXTERNA || formato?.grupo_ccd === 'entidades_externas') return null
  if (!firmas || typeof firmas !== 'object') return null
  if (!cfg || typeof cfg !== 'object' || !usuario) return null
  const uid = usuarioIdNumero(usuario)
  const slots = (formato?.slots_firma?.length ? formato.slots_firma : SLOTS_FIRMA_POR_FORMATO[codigo]) || []
  const configurables = new Set(
    slots
      .filter((s) => s && s.origen === 'configuracion' && s.id)
      .map((s) => s.id),
  )
  if (!configurables.size) return null
  for (const slot of ORDEN_SLOTS_FIRMA) {
    if (!configurables.has(slot) || slotOcupado(firmas, slot)) continue
    const sid = idSlot(cfg, slot)
    if (uid != null && sid != null && sid === uid) return slot
    if (sid == null && nombreCoincide(cfg, slot, usuario)) return slot
  }
  return null
}
