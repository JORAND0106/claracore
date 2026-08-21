/**
 * Identificación de ubicación de material (PK + tramo/costado/infraestructura).
 * Criterio Almacén (properties del plano) + fallback Cantidades (valor del polígono).
 */
import { buscarPkMaestroPorValorPlano } from '../sicoe-obra/sicoePkResolver.js'

/** Campos del GeoJSON del plano con código PK (alineado a Almacén). */
const PK_PROPS_CANDIDATOS = ['pk_id', 'CIV', 'codigo', 'PK', 'id_pk', 'PK_ID', 'civ', 'Layer', 'layer', 'Name']

function codigoPkDesdePlano(properties, fallbackVal) {
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

function pickTexto(...vals) {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

/**
 * @returns {{ ok: true, ubicacion_pk, ubicacion_pk_id, ubicacion_tramo, ubicacion_costado, ubicacion_infraestructura, row, codigo }
 *          | { ok: false, error: string }}
 */
export function identificarUbicacionMaterial(pkVal, pkList, properties) {
  const codigo = codigoPkDesdePlano(properties, pkVal)
  if (!codigo && !String(pkVal || '').trim()) {
    return { ok: false, error: 'No se pudo leer el código PK del polígono seleccionado.' }
  }
  if (!Array.isArray(pkList) || pkList.length === 0) {
    return { ok: false, error: 'El maestro PK del contrato aún no está disponible. Espere un momento e intente de nuevo.' }
  }

  let row = codigo ? buscarPkMaestroPorValorPlano(codigo, pkList) : null
  let matchedCodigo = codigo
  // Fallback: mismo criterio que Cantidades/Presupuesto (valor del polígono).
  if ((!row || row.id == null) && pkVal != null && String(pkVal).trim()) {
    const fallback = buscarPkMaestroPorValorPlano(pkVal, pkList)
    if (fallback?.id != null) {
      row = fallback
      matchedCodigo = String(pkVal).trim()
    }
  }
  if (!row || row.id == null) {
    const shown = matchedCodigo || String(pkVal || '').trim() || '—'
    return { ok: false, error: `No se encontró «${shown}» en el maestro PK del contrato.` }
  }

  const props = properties && typeof properties === 'object' ? properties : {}
  const tramo = pickTexto(row.tramo, props.tramo, props.Tramo, props.TRAMO)
  const costado = pickTexto(
    row.calzada, row.costado, row.margen,
    props.calzada, props.Calzada, props.costado, props.Costado, props.margen, props.Margen,
  )
  const infraestructura = pickTexto(
    row.infraestructura,
    props.infraestructura, props.Infraestructura, props.INFRAESTRUCTURA,
  )
  return {
    ok: true,
    row,
    codigo: matchedCodigo,
    ubicacion_pk: String(row.pk_id || row.civ || matchedCodigo),
    ubicacion_pk_id: String(row.id),
    ubicacion_tramo: tramo || null,
    ubicacion_costado: costado || null,
    ubicacion_infraestructura: infraestructura || null,
  }
}
