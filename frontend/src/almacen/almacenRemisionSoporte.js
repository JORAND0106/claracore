import { compressImageForSoporte } from '../contabilidad/contabilidadImageCompress'

export const REMISION_SOPORTE_MAX_BYTES = 300 * 1024

export function fmtSoporteBytes(n) {
  const bytes = Number(n) || 0
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * Prepara foto/PDF de remisión para subida (máx. 300 KB).
 * @param {File} file
 * @returns {Promise<{ file: File, bytes: number }>}
 */
export async function prepareRemisionSoporte(file) {
  if (!file) throw new Error('Seleccione un archivo de remisión.')
  const type = (file.type || '').toLowerCase()
  if (type === 'application/pdf') {
    if (file.size > REMISION_SOPORTE_MAX_BYTES) {
      throw new Error('El PDF no puede superar 300 KB. Use un archivo más liviano.')
    }
    return { file, bytes: file.size }
  }
  const prepared = await compressImageForSoporte(file, REMISION_SOPORTE_MAX_BYTES)
  if (!prepared || prepared.size > REMISION_SOPORTE_MAX_BYTES) {
    throw new Error('No se pudo comprimir la imagen por debajo de 300 KB.')
  }
  return { file: prepared, bytes: prepared.size }
}
