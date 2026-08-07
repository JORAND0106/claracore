/**
 * Sincroniza logos del contrato activo desde la lista fresca de contratos.
 * Evita que la sesión conserve logos obsoletos tras reemplazarlos en Admin.
 *
 * @param {{ contrato_id?: number|string|null, logo_contratista?: string|null, logo_interventoria?: string|null, logo_entidad?: string|null }|null|undefined} prev
 * @param {Array<{ id?: number|string, logo_contratista?: string|null, logo_interventoria?: string|null, logo_entidad?: string|null }>|null|undefined} list
 */
export function logosDesdeContratosActivo(prev, list) {
  const fallback = {
    logo_contratista: prev?.logo_contratista ?? null,
    logo_interventoria: prev?.logo_interventoria ?? null,
    logo_entidad: prev?.logo_entidad ?? null,
  }
  if (!Array.isArray(list) || !list.length) return fallback
  const cid = prev?.contrato_id
  const c =
    (cid != null ? list.find((x) => Number(x.id) === Number(cid)) : null) || list[0]
  if (!c) return fallback
  return {
    logo_contratista: c.logo_contratista ?? null,
    logo_interventoria: c.logo_interventoria ?? null,
    logo_entidad: c.logo_entidad ?? null,
  }
}
