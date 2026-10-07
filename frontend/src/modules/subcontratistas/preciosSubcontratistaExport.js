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

/** Cantidades a 2 decimales (regla de exportación Excel / sumatorias). */
export function roundQty(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

/**
 * ▲ unitario = VU Costo M.O. − VU Cobro.
 * Rojo si sub > cobro (positivo); verde si ≤ (cero o negativo).
 */
export function deltaVuCostoVsCobro(vuCostoMo, vuCobro) {
  const a = roundCop(vuCostoMo)
  const b = roundCop(vuCobro)
  return roundCop(a - b)
}

/** ▲ Valor Total = Valor Total Antes AIU/IVA − Valor Total VU Cobro. */
export function deltaValorTotalVsCobro(totalAntesAiu, totalVuCobro) {
  return roundCop(roundCop(totalAntesAiu) - roundCop(totalVuCobro))
}

/** Texto con signo explícito para impresión B/N (+ / − / 0). */
export function formatDeltaConSigno(delta) {
  const n = roundCop(delta)
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}` // ya trae −
  return '0'
}

export function deltaEsRojo(delta) {
  return roundCop(delta) > 0
}

/**
 * Arma filas exportables a partir de lo visible en pantalla (rows + drafts).
 * Incluye presupuesto y manuales; omite borradores incompletos y filas sin VU/cantidad.
 * Cantidades a 2 dp; valores económicos a 0 dp (coherente con fórmulas Excel).
 * @param {boolean} [incluirVuCobro=false]
 */
export function buildPreciosExportLineas(
  rows,
  drafts = {},
  impuesto = EMPTY_IMPUESTO,
  incluirVuCobro = false,
) {
  const out = []
  for (const r of rows || []) {
    const key = rowKey(r)
    const d = drafts[key] || {}
    const vuRaw = d.vu_costo != null ? d.vu_costo : r.vu_costo_mo
    const cantRaw = d.cantidad != null ? d.cantidad : r.cantidad
    const vuParsed = parseNum(vuRaw)
    const cantParsed = parseNum(cantRaw)
    if (vuParsed == null || Number.isNaN(vuParsed) || vuParsed < 0) continue
    if (cantParsed == null || Number.isNaN(cantParsed) || cantParsed < 0) continue
    if (!r.listado_precio_id && !(r.item_numero || r.descripcion)) continue

    const cant = roundQty(cantParsed)
    const vuCosto = roundCop(vuParsed)
    const vuConAiu = computeValorDespuesAiuIva(vuCosto, impuesto || EMPTY_IMPUESTO, {
      valoresEnDecimal: true,
    })
    const totalAntes = roundCop(cant * vuCosto)
    const totalCon = roundCop(cant * vuConAiu)

    const row = {
      item: String(r.item_numero || '').trim() || '—',
      descripcion: String(r.descripcion || '').trim() || '—',
      und: String(r.unidad || r.und || '').trim() || '—',
      cantidad: cant,
      vu_costo_mo: vuCosto,
      total_antes_aiu: totalAntes,
      total_con_aiu: totalCon,
      vu_con_aiu: vuConAiu,
    }

    if (incluirVuCobro) {
      const vuCobroRaw = parseNum(r.vu_cobro)
      const vuCobro = vuCobroRaw == null || Number.isNaN(vuCobroRaw) ? 0 : roundCop(vuCobroRaw)
      row.vu_cobro = vuCobro
      row.total_vu_cobro = roundCop(cant * vuCobro)
      row.delta_vu = deltaVuCostoVsCobro(vuCosto, vuCobro)
      row.delta_valor_total = deltaValorTotalVsCobro(totalAntes, row.total_vu_cobro)
    }

    out.push(row)
  }
  return out
}

export function sumarTotalesExport(lineas, incluirVuCobro = false) {
  let sumAntes = 0
  let sumCon = 0
  let sumCobro = 0
  let sumDeltaValor = 0
  for (const L of lineas || []) {
    sumAntes += Number(L.total_antes_aiu) || 0
    sumCon += Number(L.total_con_aiu) || 0
    if (incluirVuCobro) {
      sumCobro += Number(L.total_vu_cobro) || 0
      sumDeltaValor += Number(L.delta_valor_total) || 0
    }
  }
  sumAntes = roundCop(sumAntes)
  sumCon = roundCop(sumCon)
  sumCobro = roundCop(sumCobro)
  sumDeltaValor = roundCop(sumDeltaValor)
  const out = {
    sumatoria_antes_aiu: sumAntes,
    valor_aiu_iva: roundCop(sumCon - sumAntes),
    total_general_con_aiu: sumCon,
  }
  if (incluirVuCobro) {
    out.sumatoria_vu_cobro = sumCobro
    out.diferencia_total_vs_cobro = roundCop(sumAntes - sumCobro)
    out.sumatoria_delta_valor_total = sumDeltaValor
  }
  return out
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
export function validatePreciosExport({
  rows,
  drafts,
  impuesto,
  incluirVuCobro = false,
} = {}) {
  const conCobro = !!incluirVuCobro
  const lineas = buildPreciosExportLineas(rows, drafts, impuesto, conCobro)
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
    incluirVuCobro: conCobro,
    lineas,
    totales: sumarTotalesExport(lineas, conCobro),
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

/**
 * Fórmula Excel del VU unitario con AIU/IVA (literales de %; se recalcula al editar VU).
 * @param {string} vuRef — p.ej. "G8"
 * @param {{ administracion?: number|null, imprevistos?: number|null, utilidad?: number|null, iva_sobre_utilidad?: number|null, tipo?: string|null }} aiu
 */
export function formulaVuConAiuExcel(vuRef, aiu = {}) {
  const a = Number(aiu.administracion) || 0
  const i = Number(aiu.imprevistos) || 0
  const u = Number(aiu.utilidad) || 0
  const iva = Number(aiu.iva_sobre_utilidad) || 0
  const tipo = aiu.tipo
  if (tipo === 'iva_pleno') {
    return `ROUND(${vuRef}*(1+${iva}/100),0)`
  }
  if (tipo === 'aiu_sin_iva') {
    return `ROUND(${vuRef}*(1+${a}/100+${i}/100+${u}/100),0)`
  }
  if (tipo === 'iva_sobre_utilidad') {
    return `ROUND(${vuRef}*(1+${a}/100+${i}/100+${u}/100+${u}/100*${iva}/100),0)`
  }
  return `ROUND(${vuRef},0)`
}

/**
 * Total fila con AIU/IVA: ROUND(ROUND(cant,2) * VU_con_AIU, 0)
 * @param {string} cantRef
 * @param {string} vuRef
 */
export function formulaTotalConAiuExcel(cantRef, vuRef, aiu = {}) {
  return `ROUND(ROUND(${cantRef},2)*${formulaVuConAiuExcel(vuRef, aiu)},0)`
}
