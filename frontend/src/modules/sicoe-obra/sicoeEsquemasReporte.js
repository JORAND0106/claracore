/**
 * Esquemas a nivel de reporte SicoeObra: agregación, asignación y sellado.
 * Los PNG viven en graficos_historial de cada registro; se agrupan por
 * esquema_id (estable) o por numero (origen=esquema).
 */
import {
  listaGraficosRegistro,
  pickPrimaryGraficoFromHistorial,
} from './sicoeGraficosHelpers.js'

export function nuevoEsquemaId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* ignore */ }
  return `esq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function esEntradaEsquema(g) {
  if (!g?.url) return false
  const origen = String(g.origen || '').toLowerCase()
  const kind = String(g.kind || '').toLowerCase()
  if (kind === 'esquema-pdf' || kind === 'esquema-dxf' || kind === 'esquema-scene') return false
  if (kind === 'memoria-calculo' || kind === 'grafico-isometrico') return false
  if (origen === 'esquema' || kind === 'esquema') return true
  return false
}

function keyEsquema(g) {
  if (g?.esquema_id) return String(g.esquema_id)
  if (g?.numero != null && g.numero !== '') return `num:${g.numero}`
  return `url:${g?.url}`
}

/**
 * @param {object[]} registros
 * @param {(reg: object) => boolean} [isSellado]
 * @returns {Array<{
 *   esquema_id: string,
 *   numero: number|null,
 *   nombre: string,
 *   url: string,
 *   scene: object|null,
 *   registros: Array<{ id: any, numero_registro: any, sellado: boolean, url: string }>,
 *   thumb: string,
 * }>}
 */
export function listarEsquemasDelReporte(registros, isSellado = () => false) {
  /** @type {Map<string, any>} */
  const map = new Map()
  for (const reg of registros || []) {
    const sellado = !!isSellado(reg)
    const hist = listaGraficosRegistro(reg).filter(esEntradaEsquema)
    for (const g of hist) {
      const k = keyEsquema(g)
      let row = map.get(k)
      if (!row) {
        row = {
          esquema_id: g.esquema_id || (g.numero != null ? `num:${g.numero}` : k),
          numero: g.numero ?? null,
          nombre: String(g.nombre || g.descripcion || `Esquema ${g.numero ?? ''}`).trim() || 'Esquema',
          url: g.url,
          scene: g.esquema_scene || g.scene || null,
          creado_en: g.creado_en || null,
          registros: [],
          thumb: g.url,
        }
        map.set(k, row)
      }
      // Preferir versión más reciente (no sellada) como URL/escena canónica de edición.
      const ta = g.creado_en ? Date.parse(g.creado_en) : 0
      const tb = row.creado_en ? Date.parse(row.creado_en) : 0
      if (!sellado && (ta >= tb || !row.url)) {
        row.url = g.url
        row.scene = g.esquema_scene || g.scene || row.scene
        row.creado_en = g.creado_en || row.creado_en
        row.thumb = g.url
        if (g.nombre) row.nombre = String(g.nombre)
        if (g.numero != null) row.numero = g.numero
        if (g.esquema_id) row.esquema_id = g.esquema_id
      }
      const rid = reg.id
      if (!row.registros.some((r) => String(r.id) === String(rid))) {
        row.registros.push({
          id: rid,
          numero_registro: reg.numero_registro,
          sellado,
          url: g.url,
          item: reg.item || reg.codigo_item || null,
          cant_total: reg.cantidad_total ?? reg.cant_total ?? null,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const na = Number(a.numero)
    const nb = Number(b.numero)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    if (Number.isFinite(na)) return -1
    if (Number.isFinite(nb)) return 1
    return String(a.nombre).localeCompare(String(b.nombre), 'es')
  })
}

/**
 * Construye entrada de historial para un esquema del reporte.
 */
export function buildEsquemaHistorialEntrada({
  url,
  numero,
  nombre,
  esquemaId,
  scene = null,
  reporteId = null,
} = {}) {
  return {
    url,
    numero: numero ?? null,
    creado_en: new Date().toISOString(),
    origen: 'esquema',
    kind: 'esquema',
    nombre: String(nombre || 'Esquema').trim() || 'Esquema',
    esquema_id: esquemaId || nuevoEsquemaId(),
    ...(scene ? { scene, esquema_scene: scene } : {}),
    ...(reporteId != null ? { reporte_id: reporteId } : {}),
  }
}

/**
 * Aplica / actualiza asignación: los sellados que ya tienen el esquema se conservan;
 * no se asignan ni quitan sellados. Unsealed se alinean a la lista deseada.
 *
 * @returns {{ patches: Array<{ registro: object, body: object }>, skippedSellados: any[] }}
 */
export function planificarAsignacionEsquema({
  registros,
  entrada,
  idsDeseados,
  isSellado = () => false,
} = {}) {
  const desired = new Set((idsDeseados || []).map(String))
  const patches = []
  const skippedSellados = []
  const eid = entrada?.esquema_id
  const num = entrada?.numero

  const pertenece = (g) => {
    if (!esEntradaEsquema(g)) return false
    if (eid && g.esquema_id && String(g.esquema_id) === String(eid)) return true
    if (num != null && g.numero != null && Number(g.numero) === Number(num)) return true
    return false
  }

  for (const reg of registros || []) {
    const sellado = !!isSellado(reg)
    const rid = String(reg.id)
    let hist = listaGraficosRegistro(reg)
    const tiene = hist.some(pertenece)
    const quiere = desired.has(rid)

    if (sellado) {
      if (tiene !== quiere) skippedSellados.push(reg.numero_registro ?? reg.id)
      continue
    }

    if (quiere && !tiene) {
      hist = [...hist.filter((g) => !pertenece(g)), { ...entrada }]
    } else if (!quiere && tiene) {
      hist = hist.filter((g) => !pertenece(g))
    } else if (quiere && tiene) {
      // Actualizar URL/escena/nombre (misma asignación)
      hist = hist.map((g) => (pertenece(g) ? { ...g, ...entrada, creado_en: entrada.creado_en || g.creado_en } : g))
    } else {
      continue
    }

    const prim = pickPrimaryGraficoFromHistorial(hist)
    patches.push({
      registro: reg,
      body: {
        reporte_id: reg.reporte_id,
        numero_registro: reg.numero_registro,
        grafico_url: prim?.url || null,
        grafico_numero: prim?.numero ?? null,
        graficos_historial: hist,
      },
    })
  }

  return { patches, skippedSellados }
}

/**
 * Al editar un esquema: nueva URL/escena con el mismo numero/esquema_id.
 * Solo registros no sellados reciben la nueva versión.
 */
export function planificarActualizacionVersionEsquema({
  registros,
  entradaNueva,
  isSellado = () => false,
} = {}) {
  const idsConEsquema = []
  const eid = entradaNueva?.esquema_id
  const num = entradaNueva?.numero
  for (const reg of registros || []) {
    const hist = listaGraficosRegistro(reg)
    const tiene = hist.some((g) => {
      if (!esEntradaEsquema(g)) return false
      if (eid && g.esquema_id && String(g.esquema_id) === String(eid)) return true
      return num != null && g.numero != null && Number(g.numero) === Number(num)
    })
    if (tiene) idsConEsquema.push(reg.id)
  }
  return planificarAsignacionEsquema({
    registros,
    entrada: entradaNueva,
    idsDeseados: idsConEsquema,
    isSellado,
  })
}

/** Etiqueta de galería: "Gráfico 161 · Rep. #57 · Reg. 354, 356, 357" */
export function etiquetaGaleriaGrafico({
  numero,
  reporteNumero,
  reporteNombre = '',
  registrosNums = [],
} = {}) {
  const n = numero != null && numero !== '' ? String(numero) : '—'
  const rep = reporteNumero != null && reporteNumero !== '' ? String(reporteNumero) : '—'
  const regs = (registrosNums || []).filter((x) => x != null && x !== '').map(String)
  const regTxt = regs.length ? regs.join(', ') : '—'
  const nombre = String(reporteNombre || '').trim()
  const repPart = nombre ? `Rep. #${rep} (${nombre})` : `Rep. #${rep}`
  return `Gráfico ${n} · ${repPart} · Reg. ${regTxt}`
}

/**
 * Filtra galería por número de gráfico o de reporte (texto libre).
 */
export function filtrarGaleriaGraficos(items, q) {
  const s = String(q || '').trim().toLowerCase()
  if (!s) return Array.isArray(items) ? items : []
  return (items || []).filter((it) => {
    const blob = [
      it.numero,
      it.reporte_numero,
      it.reporte_nombre,
      ...(it.registros_numeros || []),
      it.descripcion,
      it.label,
    ].map((x) => String(x ?? '').toLowerCase()).join(' ')
    return blob.includes(s)
  })
}

export function ordenarGaleriaPorNumero(items) {
  return [...(items || [])].sort((a, b) => {
    const na = Number(a?.numero)
    const nb = Number(b?.numero)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    if (Number.isFinite(na)) return -1
    if (Number.isFinite(nb)) return 1
    return 0
  })
}
