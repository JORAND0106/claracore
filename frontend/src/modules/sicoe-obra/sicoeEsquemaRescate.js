/**
 * Rescate de esquemas SicoeObra (C-OUT-18): un esquema nunca se borra.
 * Reconstruye entrada + asignaciones desde historial, logs de auditoría,
 * borradores o carpeta nube, priorizando la versión con más cálculos.
 */
import { buildEsquemaHistorialEntrada, planificarAsignacionEsquema } from './sicoeEsquemasReporte.js'

/** Cuántos cálculos de volumen tiene una escena/entrada (para elegir la mejor versión). */
export function contarCalculosEscena(sceneOrEntrada) {
  const scene = sceneOrEntrada?.scene || sceneOrEntrada?.esquema_scene || sceneOrEntrada
  const calcs = scene?.volumeCalcs
  if (!Array.isArray(calcs)) return 0
  return calcs.filter((c) => Array.isArray(c?.lines) && c.lines.length > 0).length
}

/**
 * Elige la mejor candidata a restaurar:
 * 1) más volumeCalcs con líneas
 * 2) más reciente (creado_en)
 * 3) con URL
 */
export function elegirMejorVersionEsquema(candidatos = []) {
  const list = (candidatos || []).filter((c) => c && (c.url || c.scene || c.esquema_scene))
  if (!list.length) return null
  const scored = list.map((c, idx) => {
    const nCalcs = contarCalculosEscena(c)
    const ts = c.creado_en ? Date.parse(c.creado_en) : 0
    return { c, idx, nCalcs, ts: Number.isFinite(ts) ? ts : 0, hasUrl: !!c.url }
  })
  scored.sort((a, b) => {
    if (b.nCalcs !== a.nCalcs) return b.nCalcs - a.nCalcs
    if (b.ts !== a.ts) return b.ts - a.ts
    if (a.hasUrl !== b.hasUrl) return a.hasUrl ? -1 : 1
    return a.idx - b.idx
  })
  const best = scored[0]
  return {
    entrada: best.c,
    nCalcs: best.nCalcs,
    fuente: best.c._rescateFuente || best.c.fuente_rescate || 'desconocida',
    razon: best.nCalcs > 1
      ? `versión con ${best.nCalcs} cálculos`
      : (best.nCalcs === 1 ? 'última versión con un cálculo' : 'última versión guardada (sin cálculos en escena)'),
  }
}

/**
 * Extrae entradas de esquema desde snapshots de auditoría / historiales previos.
 * @param {Array<object>} auditSnapshots — p.ej. cuerpos previos de so_registros
 */
export function extraerCandidatosDesdeAuditoria(auditSnapshots = []) {
  const out = []
  for (const snap of auditSnapshots || []) {
    const hist = Array.isArray(snap?.graficos_historial)
      ? snap.graficos_historial
      : (typeof snap?.graficos_historial === 'string'
        ? (() => { try { return JSON.parse(snap.graficos_historial) } catch { return [] } })()
        : [])
    for (const g of hist || []) {
      if (!g?.url && !g?.scene && !g?.esquema_scene) continue
      const origen = String(g.origen || '').toLowerCase()
      const kind = String(g.kind || '').toLowerCase()
      if (origen === 'esquema' || kind === 'esquema' || g.esquema_id) {
        out.push({
          ...g,
          _rescateFuente: 'log_modificaciones',
          _registroId: snap.id ?? snap.registro_id ?? null,
          _numeroRegistro: snap.numero_registro ?? null,
        })
      }
    }
  }
  return out
}

/**
 * Plan de rescate: restaura entrada canónica y (opcional) reasigna a registros.
 * No borra nada; produce patches + fila Sin asignar.
 *
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   entrada: object|null,
 *   razon: string,
 *   fuente: string,
 *   nCalcs: number,
 *   patches: object[],
 *   upsertSinAsignar: boolean,
 *   idsAsignar: any[],
 * }}
 */
export function planificarRescateEsquema({
  candidatos = [],
  registros = [],
  idsRegistrosDeseados = null,
  isSellado = () => false,
  reporteId = null,
  nombreFallback = 'Esquema rescatado',
} = {}) {
  const elegido = elegirMejorVersionEsquema(candidatos)
  if (!elegido?.entrada) {
    return {
      ok: false,
      error: 'No se encontró versión recuperable del esquema',
      entrada: null,
      razon: '',
      fuente: '',
      nCalcs: 0,
      patches: [],
      upsertSinAsignar: false,
      idsAsignar: [],
    }
  }
  const raw = elegido.entrada
  const entrada = buildEsquemaHistorialEntrada({
    url: raw.url,
    numero: raw.numero ?? null,
    nombre: String(raw.nombre || raw.descripcion || nombreFallback).trim() || nombreFallback,
    esquemaId: raw.esquema_id || null,
    scene: raw.scene || raw.esquema_scene || null,
    reporteId,
  })
  let ids = idsRegistrosDeseados
  if (ids == null) {
    // Inferir desde candidatos con _registroId
    const inferred = new Set()
    for (const c of candidatos || []) {
      if (c?._registroId != null
        && (String(c.esquema_id || '') === String(entrada.esquema_id)
          || (c.numero != null && Number(c.numero) === Number(entrada.numero)))) {
        inferred.add(c._registroId)
      }
    }
    ids = [...inferred]
  }
  ids = (ids || []).filter((id) => (registros || []).some((r) => String(r.id) === String(id)))

  if (!ids.length) {
    return {
      ok: true,
      entrada,
      razon: elegido.razon,
      fuente: elegido.fuente,
      nCalcs: elegido.nCalcs,
      patches: [],
      upsertSinAsignar: true,
      idsAsignar: [],
    }
  }

  const { patches } = planificarAsignacionEsquema({
    registros,
    entrada,
    idsDeseados: ids,
    isSellado,
  })
  return {
    ok: true,
    entrada,
    razon: elegido.razon,
    fuente: elegido.fuente,
    nCalcs: elegido.nCalcs,
    patches,
    upsertSinAsignar: false,
    idsAsignar: ids,
  }
}

/** Regla de producto: no hay acción de borrado de esquema. */
export function esquemaPuedeBorrarse() {
  return false
}
