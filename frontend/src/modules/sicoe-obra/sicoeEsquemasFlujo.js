/**
 * Orquestación pura del flujo esquemas-del-reporte (C-OUT-14 / C-OUT-18).
 * Separada del modal para prueba de punta a punta sin React.
 */
import {
  buildEsquemaHistorialEntrada,
  listarEsquemasDelReporte,
  planificarActualizacionVersionEsquema,
  planificarAsignacionEsquema,
} from './sicoeEsquemasReporte.js'
import { mergeEsquemasLista } from './sicoeEsquemasSinAsignar.js'

/** Escena editable: siempre gana la del editor (extras), nunca la stale del target. */
export function resolverEscenaGuardado(extras, sceneFallback = null) {
  return extras?.scene || extras?.esquema_scene || sceneFallback || null
}

/**
 * Aviso breve para pantalla. El detalle técnico no se muestra.
 * @param {unknown} err
 * @param {'guardar'|'asignar'|'editar'} accion
 */
export function mensajeErrorEsquemaUsuario(err, accion = 'asignar') {
  const raw = String(err?.message || err || '').trim()
  if (/seleccione al menos/i.test(raw)) return 'Seleccione al menos un registro'
  if (/no hay cambios de asignación/i.test(raw)) return 'No hay cambios de asignación'
  if (accion === 'guardar' || accion === 'editar') {
    return 'No se pudo guardar el esquema'
  }
  return 'No se pudo asignar el esquema'
}

/** Entrada de historial desde fila de lista (asignado o Sin asignar). */
export function entradaDesdeFilaLista(row, reporteId = null) {
  if (!row) return null
  const url = row.url || row.thumb || row.entrada?.url
  if (!url) return null
  return buildEsquemaHistorialEntrada({
    url,
    numero: row.numero ?? row.entrada?.numero ?? null,
    nombre: row.nombre || row.entrada?.nombre || 'Esquema',
    esquemaId: row.esquema_id || row.entrada?.esquema_id,
    scene: row.scene || row.entrada?.scene || row.entrada?.esquema_scene || null,
    reporteId,
    fuente: row.fuente || row.entrada?.fuente || null,
    dibujoReporte: !!(row.dibujo_reporte || row.entrada?.dibujo_reporte
      || row.fuente === 'dibujo_reporte' || row.entrada?.fuente === 'dibujo_reporte'),
  })
}

/**
 * ¿Hace falta volver a subir PNG? Solo si no hay URL canónica aún.
 * Nunca exige data URI si ya hay entrada.url (asignar / reasignar).
 */
export function necesitaReuploadPng(entrada) {
  return !(entrada && entrada.url)
}

/** El body de patch de esquema no debe tocar cantidades. */
export function patchSoloCamposGrafico(body) {
  if (!body || typeof body !== 'object') return false
  const prohibidos = [
    'cantidad_total', 'cantidad', 'longitud', 'ancho', 'espesor',
    'item', 'codigo_item', 'valor_unitario', 'valor_total',
  ]
  return !prohibidos.some((k) => Object.prototype.hasOwnProperty.call(body, k))
}

/**
 * Simula el flujo punta a punta en memoria (sin red).
 * Usado por la prueba automática de despliegue.
 *
 * @returns {{
 *   ok: boolean,
 *   lista: object[],
 *   patchesAsignar: object[],
 *   patchesEditar: object[],
 *   patchesReasignar: object[],
 *   sceneReabierta: object|null,
 *   log: Array<{ accion: string, antes?: any, despues?: any }>,
 *   error?: string,
 * }}
 */
export function simularFlujoEsquemasE2E({
  registrosIniciales,
  isSellado = () => false,
  reporteId = 57,
} = {}) {
  const log = []
  let regs = (registrosIniciales || []).map((r) => ({
    ...r,
    graficos_historial: Array.isArray(r.graficos_historial)
      ? r.graficos_historial.map((g) => ({ ...g }))
      : [],
  }))
  let sinAsignar = []

  const snapshotRegs = () => regs.map((r) => ({
    id: r.id,
    numero_registro: r.numero_registro,
    cantidad_total: r.cantidad_total,
    graficos_historial: (r.graficos_historial || []).map((g) => ({ ...g })),
  }))

  try {
    // 1) Crear + Guardar → Sin asignar (independiente de asignación)
    const sceneV1 = {
      v: 1,
      solids: [{ id: 's1', height: 0.63 }],
      objects: [{ id: 'o1', type: 'polyline' }],
    }
    const entradaNueva = buildEsquemaHistorialEntrada({
      url: 'https://cdn/e2e-nuevo.png',
      numero: 174,
      nombre: 'Esquema E2E',
      esquemaId: 'esq-e2e-174',
      scene: sceneV1,
      reporteId,
    })
    sinAsignar = [{
      esquema_id: entradaNueva.esquema_id,
      numero: entradaNueva.numero,
      nombre: entradaNueva.nombre,
      url: entradaNueva.url,
      scene: sceneV1,
      entrada: { ...entradaNueva },
      updatedAt: Date.now(),
    }]
    log.push({ accion: 'guardar_sin_asignar', despues: { esquema_id: entradaNueva.esquema_id, scene: sceneV1 } })

    let lista = mergeEsquemasLista(listarEsquemasDelReporte(regs, isSellado), sinAsignar)
    const filaSin = lista.find((x) => x.esquema_id === 'esq-e2e-174')
    if (!filaSin?.sinAsignar) throw new Error('Tras Guardar debe aparecer Sin asignar')

    // 2) Asignar a sellados + no sellados
    const idsAsignar = regs.map((r) => r.id)
    const antesAsignar = snapshotRegs()
    const { patches: patchesAsignar } = planificarAsignacionEsquema({
      registros: regs,
      entrada: entradaNueva,
      idsDeseados: idsAsignar,
      isSellado,
    })
    if (!patchesAsignar.length) throw new Error('Asignar debe producir patches')
    for (const p of patchesAsignar) {
      if (!patchSoloCamposGrafico(p.body)) throw new Error('Patch tocó cantidades')
      regs = regs.map((r) => (String(r.id) === String(p.registro.id)
        ? { ...r, ...p.body }
        : r))
    }
    sinAsignar = []
    log.push({
      accion: 'asignar',
      antes: antesAsignar,
      despues: snapshotRegs(),
    })

    lista = mergeEsquemasLista(listarEsquemasDelReporte(regs, isSellado), sinAsignar)
    const filaAsig = lista.find((x) => x.esquema_id === 'esq-e2e-174')
    if (!filaAsig || filaAsig.sinAsignar) throw new Error('Tras asignar no debe ser Sin asignar')
    if ((filaAsig.registros || []).length !== regs.length) {
      throw new Error('Lista no refleja todos los registros asignados')
    }

    // 3) Cerrar / reabrir reporte → contenido intacto
    const sceneReabierta = filaAsig.scene
    if (sceneReabierta?.solids?.[0]?.height !== 0.63) {
      throw new Error('Al reabrir falta el contenido guardado')
    }
    log.push({ accion: 'reabrir', despues: { scene: sceneReabierta } })

    // 4) Editar (cambiar extrusión) + Guardar
    const sceneV2 = {
      v: 2,
      solids: [{ id: 's1', height: 1.25 }, { id: 's2', height: 0.4 }],
      objects: sceneV1.objects,
    }
    const entradaV2 = buildEsquemaHistorialEntrada({
      url: 'https://cdn/e2e-v2.png',
      numero: 174,
      nombre: 'Esquema E2E',
      esquemaId: 'esq-e2e-174',
      scene: resolverEscenaGuardado({ scene: sceneV2 }, filaAsig.scene),
      reporteId,
    })
    if (entradaV2.scene?.solids?.[0]?.height !== 1.25) {
      throw new Error('Escena de edición no prevaleció sobre la anterior')
    }
    const antesEditar = snapshotRegs()
    const { patches: patchesEditar } = planificarActualizacionVersionEsquema({
      registros: regs,
      entradaNueva: entradaV2,
      isSellado,
    })
    for (const p of patchesEditar) {
      if (!patchSoloCamposGrafico(p.body)) throw new Error('Edición tocó cantidades')
      regs = regs.map((r) => (String(r.id) === String(p.registro.id)
        ? { ...r, ...p.body }
        : r))
    }
    log.push({ accion: 'editar_guardar', antes: antesEditar, despues: snapshotRegs() })

    lista = mergeEsquemasLista(listarEsquemasDelReporte(regs, isSellado), sinAsignar)
    const filaEdit = lista.find((x) => x.esquema_id === 'esq-e2e-174')
    if (filaEdit?.scene?.solids?.[0]?.height !== 1.25) {
      throw new Error('Tras editar la lista no tiene la escena nueva')
    }

    // 5) Cambiar asignación: quitar el último registro
    const idsRe = regs.slice(0, -1).map((r) => r.id)
    const quitado = regs[regs.length - 1]
    const antesRe = snapshotRegs()
    const { patches: patchesReasignar } = planificarAsignacionEsquema({
      registros: regs,
      entrada: entradaDesdeFilaLista(filaEdit, reporteId),
      idsDeseados: idsRe,
      isSellado,
    })
    for (const p of patchesReasignar) {
      if (!patchSoloCamposGrafico(p.body)) throw new Error('Reasignar tocó cantidades')
      regs = regs.map((r) => (String(r.id) === String(p.registro.id)
        ? { ...r, ...p.body }
        : r))
    }
    log.push({
      accion: 'reasignar',
      antes: antesRe,
      despues: snapshotRegs(),
      quitado: quitado?.numero_registro,
    })

    lista = mergeEsquemasLista(listarEsquemasDelReporte(regs, isSellado), sinAsignar)
    const filaFinal = lista.find((x) => x.esquema_id === 'esq-e2e-174')
    const nums = (filaFinal?.registros || []).map((r) => r.numero_registro)
    if (nums.includes(quitado.numero_registro)) {
      throw new Error('El registro desasignado sigue en la lista')
    }
    // Cantidades intactas
    for (const r of regs) {
      const orig = (registrosIniciales || []).find((o) => String(o.id) === String(r.id))
      if (orig && orig.cantidad_total !== r.cantidad_total) {
        throw new Error('Cambió cantidad_total de un registro')
      }
    }

    return {
      ok: true,
      lista,
      patchesAsignar,
      patchesEditar,
      patchesReasignar,
      sceneReabierta: filaFinal?.scene || null,
      log,
    }
  } catch (e) {
    return {
      ok: false,
      lista: [],
      patchesAsignar: [],
      patchesEditar: [],
      patchesReasignar: [],
      sceneReabierta: null,
      log,
      error: e?.message || String(e),
    }
  }
}
