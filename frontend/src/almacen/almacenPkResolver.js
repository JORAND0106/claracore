/**
 * Resolución PK plano ↔ maestro — capa Almacén (no modifica SICOE Obra).
 */
import { buscarPkMaestroPorValorPlano } from '../modules/sicoe-obra/sicoePkResolver'

/** Campos del GeoJSON del plano con código PK (evitar OBJECTID / id internos). */
const PK_PROPS_CANDIDATOS = ['pk_id', 'CIV', 'codigo', 'PK', 'id_pk', 'PK_ID', 'civ', 'Layer', 'layer', 'Name']

/**
 * Extrae el código PK legible desde properties del feature o el valor del clic.
 */
export function codigoPkDesdePlano(properties, fallbackVal) {
  if (properties && typeof properties === 'object') {
    for (const key of PK_PROPS_CANDIDATOS) {
      const val = properties[key]
      if (val != null && String(val).trim()) {
        return String(val).trim()
      }
    }
  }
  return String(fallbackVal || '').trim()
}

export function resolverPkMaestroAlmacen(pkVal, pkList, properties) {
  const codigo = codigoPkDesdePlano(properties, pkVal)
  if (!codigo) {
    return { ok: false, error: 'No se pudo leer el código PK del polígono seleccionado.' }
  }
  if (!Array.isArray(pkList) || pkList.length === 0) {
    return { ok: false, error: 'El maestro PK del contrato aún no está disponible. Espere un momento e intente de nuevo.' }
  }
  const row = buscarPkMaestroPorValorPlano(codigo, pkList)
  if (!row || row.id == null) {
    return { ok: false, error: `No se encontró «${codigo}» en el maestro PK del contrato.` }
  }
  return {
    ok: true,
    row,
    codigo,
    pk_id_id: String(row.id),
    pk_label: String(row.pk_id || row.civ || codigo),
    tramo: row.tramo || '',
  }
}
