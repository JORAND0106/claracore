/**
 * Puente SicoeObra ↔ cuadro de despiece de acero.
 * Un registro por posición; Cant Total = peso de la posición en el cuadro
 * (peso kg/m con precisión de despiece, p. ej. #4 = 0,994).
 * No modifica la tabla NTC de sicoeVarilla ni los cálculos del despiece.
 */
import {
  computePositionMetrics,
  despieceResolverDiametro,
  despieceSchedulesIncomplete,
} from '../../components/esquema/esquemaDespiece.js'
import { calcularCantidadRegistro, sicoeNormalizarDiametroVarilla } from './sicoeVarilla.js'

export function sicoeEsRegistroDeCuadroAceros(reg) {
  return !!(reg && String(reg.cuadro_aceros_id || '').trim())
}

export function sicoeEtiquetaCuadroPosicion(reg) {
  const nombre = String(reg?.cuadro_aceros_nombre || '').trim()
  const pos = String(reg?.cuadro_aceros_posicion || '').trim()
  if (nombre && pos) return `${nombre} · ${pos}`
  return nombre || pos || ''
}

/**
 * Mapea una posición del cuadro → campos de so_registros (varilla Kg).
 * Longitud = parcial (m); Cantidad = N° piezas; peso = despiece (3 dp).
 */
export function sicoeRegistroDesdePosicionCuadro(pos, {
  cuadroId,
  cuadroNombre,
  schedule,
  fotoPayload = {},
  graficoPayload = {},
} = {}) {
  const m = computePositionMetrics(pos)
  if (!m.ok) {
    return { ok: false, error: m.error || 'Posición incompleta', registro: null, metrics: m }
  }
  const diam = sicoeNormalizarDiametroVarilla(despieceResolverDiametro(pos?.diameter ?? pos?.diametro))
  if (!diam) {
    return { ok: false, error: 'Diámetro no válido.', registro: null, metrics: m }
  }
  const peso = m.pesoKgM
  const longitud = m.partialM
  const cantidad = m.pieces
  const cantidad_total = calcularCantidadRegistro({
    es_varilla: true,
    longitud,
    cantidad,
    peso_kg_m: peso,
    diametro_varilla: diam,
  })
  // Debe coincidir con el peso mostrado en el cuadro (2 dp).
  if (Math.abs(Number(cantidad_total) - Number(m.pesoKg)) > 0.011) {
    return {
      ok: false,
      error: `Cant Total (${cantidad_total}) no coincide con el peso del cuadro (${m.pesoKg}).`,
      registro: null,
      metrics: m,
    }
  }
  const posName = String(pos?.name || '').trim()
  const nombreCuadro = String(cuadroNombre || schedule?.nombre || '').trim()
  const registro = {
    unidad: 'kg',
    es_varilla: true,
    diametro_varilla: diam,
    peso_kg_m: peso,
    longitud,
    ancho: null,
    espesor: null,
    cantidad,
    cantidad_total,
    nombre: posName || null,
    observacion: nombreCuadro && posName ? `${nombreCuadro} · ${posName}` : (posName || nombreCuadro || null),
    descripcion: nombreCuadro && posName ? `${nombreCuadro} · ${posName}` : null,
    cuadro_aceros_id: cuadroId,
    cuadro_aceros_nombre: nombreCuadro,
    cuadro_aceros_posicion: posName,
    cuadro_aceros_posicion_id: pos?.id || null,
    cuadro_aceros_schedule: schedule || null,
    item_numero: null,
    item_descripcion: null,
    ...fotoPayload,
    ...graficoPayload,
    _fotoOk: !!(fotoPayload.foto_url || (fotoPayload.fotos_historial || []).length),
  }
  return { ok: true, error: null, registro, metrics: m }
}

/** Genera borradores de registro (uno por posición) a partir de un schedule. */
export function sicoeRegistrosDesdeCuadro(schedule, {
  cuadroId,
  fotoPayload = {},
  graficoPayload = {},
} = {}) {
  const nombre = String(schedule?.nombre || '').trim()
  if (!nombre) return { ok: false, error: 'El nombre del cuadro es obligatorio.', registros: [] }
  const positions = Array.isArray(schedule?.positions) ? schedule.positions : []
  if (!positions.length) return { ok: false, error: 'Agregue al menos una posición.', registros: [] }
  if (despieceSchedulesIncomplete([schedule])) {
    return { ok: false, error: 'Complete nombre, posiciones y campos obligatorios del cuadro.', registros: [] }
  }
  const id = cuadroId || schedule.id || `cuadro_${Date.now().toString(36)}`
  const registros = []
  for (const pos of positions) {
    const r = sicoeRegistroDesdePosicionCuadro(pos, {
      cuadroId: id,
      cuadroNombre: nombre,
      schedule: { ...schedule, id, nombre },
      fotoPayload,
      graficoPayload,
    })
    if (!r.ok) return { ok: false, error: `${pos?.name || 'Posición'}: ${r.error}`, registros: [] }
    registros.push(r.registro)
  }
  return { ok: true, error: null, registros, cuadroId: id }
}

/**
 * Plan de sincronización al editar un cuadro ya cargado.
 * Conserva ítem de posiciones que siguen existiendo (por posicion_id o nombre).
 */
export function sicoePlanSyncCuadroAceros({
  schedule,
  registrosExistentes = [],
  fotoPayload = {},
  graficoPayload = {},
} = {}) {
  const mapped = sicoeRegistrosDesdeCuadro(schedule, {
    cuadroId: schedule?.id,
    fotoPayload,
    graficoPayload,
  })
  if (!mapped.ok) return { ok: false, error: mapped.error, crear: [], actualizar: [], eliminarIds: [] }

  const existentes = (registrosExistentes || []).filter((r) => (
    String(r.cuadro_aceros_id || '') === String(mapped.cuadroId || schedule?.id || '')
  ))
  const byPosId = new Map()
  const byName = new Map()
  for (const r of existentes) {
    if (r.cuadro_aceros_posicion_id) byPosId.set(String(r.cuadro_aceros_posicion_id), r)
    if (r.cuadro_aceros_posicion) byName.set(String(r.cuadro_aceros_posicion).trim().toLowerCase(), r)
  }

  const actualizar = []
  const crear = []
  const usedIds = new Set()

  for (const draft of mapped.registros) {
    const prev = (draft.cuadro_aceros_posicion_id && byPosId.get(String(draft.cuadro_aceros_posicion_id)))
      || byName.get(String(draft.cuadro_aceros_posicion || '').trim().toLowerCase())
      || null
    if (prev?.id != null) {
      usedIds.add(String(prev.id))
      actualizar.push({
        id: prev.id,
        patch: {
          ...draft,
          // Conservar ítem ya asignado
          item_numero: prev.item_numero ?? null,
          item_descripcion: prev.item_descripcion ?? null,
          item_listado_id: prev.item_listado_id ?? null,
          vlr_unitario: prev.vlr_unitario ?? null,
          costo_directo: prev.costo_directo ?? null,
          capitulo: prev.capitulo ?? null,
          competencia: prev.competencia ?? null,
        },
      })
    } else {
      crear.push(draft)
    }
  }

  const eliminarIds = existentes
    .filter((r) => r.id != null && !usedIds.has(String(r.id)))
    .map((r) => r.id)

  return {
    ok: true,
    error: null,
    cuadroId: mapped.cuadroId,
    crear,
    actualizar,
    eliminarIds,
  }
}

export const SICOE_AVISO_EDITAR_DESDE_CUADRO = 'Edítelo desde el cuadro de aceros'
