/**
 * Filtrado de gráficos de exportación por subtabla (tipo de entidad).
 */
import { clasificarTipoEntidad } from './pptoTipoEntidad.js'

/**
 * Keys de grupo de entidad cubiertas por los tipos_entidad del gráfico
 * (registros del grupo asociados al ítem).
 *
 * @param {{ tipos_entidad?: unknown }} grafico
 * @returns {Set<string>|null} null = sin metadata (mostrar en todas las subtablas)
 */
export function keysGrupoEntidadDeGrafico(grafico) {
  const tipos = Array.isArray(grafico?.tipos_entidad) ? grafico.tipos_entidad : null
  if (!tipos || !tipos.length) return null
  const keys = new Set()
  for (const t of tipos) {
    const k = clasificarTipoEntidad(t)
    keys.add(k || 'otros')
  }
  return keys
}

/**
 * ¿El gráfico debe aparecer tras la subtabla `grupoKey`?
 * Si el grupo cruza varios tipos, el mismo gráfico se repite en cada una.
 *
 * @param {object} grafico
 * @param {string} grupoKey
 * @returns {boolean}
 */
export function graficoAplicaAGrupoEntidad(grafico, grupoKey) {
  if (!grafico) return false
  const keys = keysGrupoEntidadDeGrafico(grafico)
  if (keys == null) return true
  return keys.has(grupoKey)
}

/**
 * @param {Array<object>} graficos
 * @param {string} grupoKey
 * @returns {Array<object>}
 */
export function filtrarGraficosPorGrupoEntidad(graficos, grupoKey) {
  return (Array.isArray(graficos) ? graficos : []).filter(
    (g) => g?.image && graficoAplicaAGrupoEntidad(g, grupoKey),
  )
}
