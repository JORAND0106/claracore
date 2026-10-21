/**
 * Quién puede regenerar el PDF de una OC ya generada.
 * Basta una: cargo Administrador, rol Contratista Gerencial o desarrollador.
 * No es la regla de quién genera la OC.
 * Quien está bloqueado del módulo tampoco puede.
 */
export function evaluarRegenerarPdfOc({
  excluido = false,
  desarrollador = false,
  contratistaGerencial = false,
  cargoAdministrador = false,
} = {}) {
  if (excluido) return false
  if (desarrollador) return true
  if (cargoAdministrador) return true
  return Boolean(contratistaGerencial)
}
