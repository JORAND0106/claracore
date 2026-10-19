/**
 * Usuario de sesión para la herramienta de esquema (transversal a módulos).
 * Fuente: cc_usuario en localStorage / sessionStorage (igual que borradores).
 */
import { esDesarrolladorUsuario } from '../../utils/permisosContrato.js'

export function getEsquemaUsuario() {
  try {
    const raw = localStorage.getItem('cc_usuario') || sessionStorage.getItem('cc_usuario')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Alineado con App `esUsuarioDesarrollador` / backend `_es_desarrollador`:
 * rol_id=1, cargo/rol «desarrollador», o flags es_desarrollador / acceso_total.
 */
export function esEsquemaUsuarioDesarrollador(usuario = getEsquemaUsuario()) {
  if (!usuario) return false
  try {
    if (Number(usuario.rol_id) === 1) return true
  } catch { /* ignore */ }
  if (usuario.es_desarrollador === true || usuario.acceso_total === true) return true
  return esDesarrolladorUsuario(usuario)
}
