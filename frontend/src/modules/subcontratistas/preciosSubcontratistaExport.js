/**
 * Datos y validación para exportar la hoja de Precios del subcontratista a Excel
 * (soporte contractual). Lógica pura, alineada con la UI del Tab Precios.
 */
import {
  EMPTY_IMPUESTO,
  computeValorDespuesAiuIva,
  formatPuntosPctExacto,
  impuestoTieneDatos,
  tributosPayloadDesdeForm,
} from '../../admin/catalogoInsumosTributos.js'
import { parseNum, rowKey } from './preciosSubcontratistaSheetHelpers.js'

/** Redondeo COP a 0 decimales (misma regla que fmtMoneda / computeValorDespuesAiuIva). */
export function roundCop(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x)
}

/**
 * Arma filas exportables a partir de lo visible en pantalla (rows + drafts).
 * Incluye presupuesto y manuales; omite borradores incompletos y filas sin VU/cantidad.
 */
export function buildPreciosExportLineas(rows, drafts = {}, impuesto = EMPTY_IMPUESTO) {
  const out = []
  for (const r of rows || []) {
    const key = rowKey(r)
    const d = drafts[key] || {}
    const vuRaw = d.vu_costo != null ? d.vu_costo : r.vu_costo_mo
    const cantRaw = d.cantidad != null ? d.cantidad : r.cantidad
    const vu = parseNum(vuRaw)
    const cant = parseNum(cantRaw)
    if (vu == null || Number.isNaN(vu) || vu < 0) continue
    if (cant == null || Number.isNaN(cant) || cant < 0) continue
    if (!r.listado_precio_id && !(r.item_numero || r.descripcion)) continue

    const vuCosto = roundCop(vu)
    const vuConAiu = computeValorDespuesAiuIva(vu, impuesto || EMPTY_IMPUESTO, {
      valoresEnDecimal: true,
    })
    const totalAntes = roundCop(cant * vu)
    const totalCon = roundCop(cant * vuConAiu)

    out.push({
      item: String(r.item_numero || '').trim() || '—',
      descripcion: String(r.descripcion || '').trim() || '—',
      und: String(r.unidad || r.und || '').trim() || '—',
      cantidad: cant,
      vu_costo_mo: vuCosto,
      total_antes_aiu: totalAntes,
      total_con_aiu: totalCon,
      vu_con_aiu: vuConAiu,
    })
  }
  return out
}

export function sumarTotalesExport(lineas) {
  let sumAntes = 0
  let sumCon = 0
  for (const L of lineas || []) {
    sumAntes += Number(L.total_antes_aiu) || 0
    sumCon += Number(L.total_con_aiu) || 0
  }
  sumAntes = roundCop(sumAntes)
  sumCon = roundCop(sumCon)
  return {
    sumatoria_antes_aiu: sumAntes,
    valor_aiu_iva: roundCop(sumCon - sumAntes),
    total_general_con_aiu: sumCon,
  }
}

/** Desglose AIU/IVA en puntos % (como en plataforma / etiquetaTributos). */
export function desgloseAiuIvaParaExport(impuesto = EMPTY_IMPUESTO) {
  const t = tributosPayloadDesdeForm(impuesto || EMPTY_IMPUESTO)
  const pct = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    administracion: pct(t.administracion),
    imprevistos: pct(t.imprevistos),
    utilidad: pct(t.utilidad),
    iva_sobre_utilidad: pct(t.iva?.porcentaje),
    tipo: t.tipo || null,
  }
}

export function formatPctExport(pts) {
  if (pts == null || !Number.isFinite(Number(pts))) return '—'
  return `${formatPuntosPctExacto(Number(pts))} %`
}

/**
 * Valida antes de generar el archivo.
 * Sin ítems → bloquea. Sin AIU/IVA → ok con `faltaAiu: true` para que la UI confirme Sí/No.
 * @returns {{ ok: true, lineas: object[], totales: object, aiu: object, faltaAiu: boolean }
 *   | { ok: false, message: string }}
 */
export function validatePreciosExport({ rows, drafts, impuesto } = {}) {
  const lineas = buildPreciosExportLineas(rows, drafts, impuesto)
  if (!lineas.length) {
    return {
      ok: false,
      message:
        'No hay ítems con precio pactado (cantidad y VU Costo M.O.) para exportar. '
        + 'Complete la hoja de Precios antes de generar el Excel.',
    }
  }
  const faltaAiu = !impuestoTieneDatos(impuesto || EMPTY_IMPUESTO)
  return {
    ok: true,
    faltaAiu,
    lineas,
    totales: sumarTotalesExport(lineas),
    aiu: desgloseAiuIvaParaExport(impuesto),
  }
}

/** Texto del confirm cuando falta AIU/IVA (Sí → continuar / No → cancelar). */
export const MSG_CONFIRMAR_EXPORT_SIN_AIU =
  'Este subcontratista no tiene asignado AIU/IVA. ¿Desea continuar con la exportación?'

export function slugFilenamePart(txt, max = 40) {
  const s = String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
  return s || 'subcontratista'
}

export function buildPreciosExportFilename(subcontratista, generadoEn = new Date()) {
  const d = generadoEn instanceof Date ? generadoEn : new Date()
  const fecha = d.toISOString().slice(0, 10)
  const slug = slugFilenamePart(subcontratista?.razon_social)
  return `precios_pactados_${slug}_${fecha}.xlsx`
}
