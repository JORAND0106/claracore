/**
 * Quién puede generar la orden de compra.
 * Las dos condiciones a la vez: permiso Validar en Almacén y rol Contratista Gerencial.
 * El desarrollador conserva acceso total. El cargo Administrador por sí solo no basta.
 * Quien está bloqueado del módulo (Interventoría, Supervisión Externa) tampoco.
 */
export function evaluarGenerarOc({
  excluido = false,
  desarrollador = false,
  contratistaGerencial = false,
  validar = false,
} = {}) {
  if (excluido) return false
  if (desarrollador) return true
  return Boolean(contratistaGerencial && validar)
}
