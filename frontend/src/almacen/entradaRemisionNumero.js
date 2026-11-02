/**
 * Número de remisión del proveedor (Llegó material / recibo).
 * Distinto del archivo/foto de remisión y del código Ent-… interno.
 */

/** Normaliza para guardar/comparar: mayúsculas, sin espacios sobrantes. */
export function normalizeRemisionNumero(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 64)
}

/** Mientras se escribe: mayúsculas; permite letras, números y guiones. */
export function formatRemisionNumeroInput(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-\s]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 64)
}

export function remisionNumeroOk(raw) {
  return Boolean(normalizeRemisionNumero(raw))
}
