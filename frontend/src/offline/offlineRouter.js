/**
 * OfflineRouter — lecturas locales de IndexedDB para el módulo Sicoe Obra.
 * Todos los contratoId se normalizan a Number para evitar mismatches de tipo en Dexie.
 */
import { db } from './db'

// Helper: busca registros por contrato_id usando índice con fallback a scan
async function byContrato(table, contratoId) {
  const cid = Number(contratoId)
  const byIdx = await table.where('contrato_id').equals(cid).toArray()
  if (byIdx.length > 0) return byIdx
  const all = await table.toArray()
  return all.filter(r => Number(r.contrato_id) === cid)
}

// ── Lecturas básicas ───────────────────────────────────────────────────────────

export async function getRegistrosOffline(contratoId, reporteId) {
  const cid = Number(contratoId)
  const rid = Number(reporteId)
  const byIdx = await db.so_registros
    .where('reporte_id').equals(rid)
    .and(r => Number(r.contrato_id) === cid)
    .toArray()
  if (byIdx.length > 0) return byIdx
  const all = await db.so_registros.toArray()
  return all.filter(r => Number(r.contrato_id) === cid && Number(r.reporte_id) === rid)
}

export async function getPreciosOffline(contratoId) {
  return byContrato(db.listado_precios, contratoId)
}

// ── Filtros de UI (dropdowns) ──────────────────────────────────────────────────

export async function getCapitulosOffline(contratoId) {
  // Los capítulos se extraen de so_registros (siempre descargados en el pack)
  // listado_precios puede estar incompleto, los registros tienen el campo 'capitulo' directamente
  const regs = await byContrato(db.so_registros, contratoId)
  const caps = [...new Set(regs.map(r => r.capitulo).filter(Boolean))]
  return caps.sort((a, b) => {
    const na = parseInt(String(a).match(/^(\d+)/)?.[1] || '9999')
    const nb = parseInt(String(b).match(/^(\d+)/)?.[1] || '9999')
    return na - nb
  })
}

export async function getActasOffline(contratoId) {
  const rows = await byContrato(db.actas, contratoId)
  return rows
    .filter(a => a.numero_rpo != null)
    .map(a => ({ id: a.id, numero_rpo: a.numero_rpo, consecutivo: a.consecutivo }))
}

export async function getSemanasOffline(contratoId) {
  const rows = await byContrato(db.so_semanas, contratoId)
  return rows.sort((a, b) => (a.numero_semana ?? 0) - (b.numero_semana ?? 0))
}

export async function getSubcontratistasOffline(contratoId) {
  const reportes = await byContrato(db.so_reportes, contratoId)
  const mapa = new Map()
  reportes.forEach(r => {
    if (r.subcontratista_id && !mapa.has(r.subcontratista_id)) {
      const nombre = (r.subcontratistas?.razon_social) || r.subcontratista_nombre || String(r.subcontratista_id)
      mapa.set(r.subcontratista_id, { id: r.subcontratista_id, razon_social: nombre })
    }
  })
  return [...mapa.values()]
}

export async function getTramosOffline(contratoId) {
  const reportes = await byContrato(db.so_reportes, contratoId)
  return [...new Set(reportes.map(r => r.tramo).filter(Boolean))].sort()
}

export async function getCostadosOffline(contratoId) {
  const reportes = await byContrato(db.so_reportes, contratoId)
  return [...new Set(reportes.map(r => r.calzada || r.costado).filter(Boolean))].sort()
}

// ── Filtro de capas de validación (replica la lógica del backend) ─────────────

const CARGO_NIVEL_MAP = {
  54: 'nivel1_estado',
  44: 'nivel2_estado', 45: 'nivel2_estado', 51: 'nivel2_estado', 56: 'nivel2_estado',
  50: 'nivel3_estado', 58: 'nivel3_estado',
}
const NIVEL_CAMPO = { 1: 'nivel1_estado', 2: 'nivel2_estado', 3: 'nivel3_estado' }

/**
 * Prerequisito de nivel: para que aplique nivel2, nivel1 debe ser Aprobado.
 * Para nivel3, nivel2 debe ser Aprobado.
 */
const NIVEL_PRERREQUISITO = {
  nivel2_estado: ['nivel1_estado', 'Aprobado'],
  nivel3_estado: ['nivel2_estado', 'Aprobado'],
}

/**
 * Filtra un array de registros por las capas de validación activas.
 * Replica _so_registros_q_y_capas_validacion del backend:
 *  - Verifica el prerequisito de nivel superior
 *  - Para "No Revisado": campo es null / '' / 'No Revisado' Y item_numero asignado
 *  - Para nivel2/3 en cualquier estado: item_numero debe estar asignado
 */
function aplicarCapasFiltro(registros, capas) {
  if (!capas || capas.length === 0) return registros
  return registros.filter(reg => {
    for (const capa of capas) {
      const campo = capa.nivel ? NIVEL_CAMPO[capa.nivel] : CARGO_NIVEL_MAP[capa.cargo_id]
      if (!campo) continue
      const estado = (capa.estado || '').trim()
      if (!estado) continue

      // Prerequisito: nivel2 exige nivel1=Aprobado; nivel3 exige nivel2=Aprobado
      const prereq = NIVEL_PRERREQUISITO[campo]
      if (prereq) {
        if ((reg[prereq[0]] || '') !== prereq[1]) return false
      }

      const est = reg[campo]
      const esNoRevisado = estado === 'No Revisado' || estado === 'No Revisados'
      if (esNoRevisado) {
        // Campo debe ser null / '' / 'No Revisado'
        if (est != null && est !== '' && est !== 'No Revisado') return false
        // Todos los niveles en cola de validación exigen ítem asignado
        if (!reg.item_numero) return false
      } else {
        if ((est || '') !== estado) return false
        // Nivel 2 y 3: siempre exigen ítem asignado
        if (campo === 'nivel2_estado' || campo === 'nivel3_estado') {
          if (!reg.item_numero) return false
        }
      }
    }
    return true
  })
}

// ── Panel dinámico offline (réplica básica de /analisis) ──────────────────────

/**
 * Calcula el análisis del panel dinámico localmente desde IndexedDB.
 * Agrupa registros por capítulo (modo capitulo_items).
 */
export async function calcularAnalisisOffline(contratoId, filtros = {}, capas = []) {
  const cid = Number(contratoId)

  if (filtros.etiqueta_validacion && String(filtros.etiqueta_validacion).trim()) {
    return {
      grupos: [], modo: 'general', encabezado: 'Etiqueta de validación (requiere conexión)',
      total_registros: 0, total_costo_directo: 0, total_cantidad: 0,
      total_aprobados: 0, total_pendientes: 0, total_rechazados: 0,
    }
  }

  // Cargar actas para resolver acta_rpo → acta_id
  const actas = await byContrato(db.actas, contratoId)
  const actaByRpo = {}
  actas.forEach(a => { if (a.numero_rpo != null) actaByRpo[String(a.numero_rpo)] = a })

  // Resolver acta_id para filtrar
  let actaIdFiltro = null
  if (filtros.acta_rpo) {
    const actaMatch = actaByRpo[String(filtros.acta_rpo)]
    actaIdFiltro = actaMatch?.id != null ? Number(actaMatch.id) : -1
  }

  console.log('[calcularAnalisisOffline] contrato:', cid, 'filtros:', filtros, 'actas en caché:', actas.length, 'actaIdFiltro:', actaIdFiltro)

  // Cargar reportes filtrados (comparación robusta con Number() para evitar type mismatch)
  let reportes = await byContrato(db.so_reportes, contratoId)
  console.log('[calcularAnalisisOffline] reportes en caché:', reportes.length)
  if (actaIdFiltro !== null) reportes = reportes.filter(r => Number(r.acta_rpo_id) === actaIdFiltro)
  if (filtros.estado) reportes = reportes.filter(r => r.estado === filtros.estado)
  if (filtros.subcontratista_id) reportes = reportes.filter(r => String(r.subcontratista_id) === String(filtros.subcontratista_id))
  if (filtros.tramo) reportes = reportes.filter(r => (r.tramo||'').toLowerCase().includes(filtros.tramo.toLowerCase()))
  if (filtros.numero_reporte) reportes = reportes.filter(r => String(r.numero_reporte) === String(filtros.numero_reporte))

  console.log('[calcularAnalisisOffline] reportes filtrados:', reportes.length)

  // Normalizar ids a string para comparación robusta
  const repIdSet = new Set(reportes.map(r => String(r.id)))

  // Cargar registros de esos reportes
  const todosRegs = await byContrato(db.so_registros, contratoId)
  console.log('[calcularAnalisisOffline] registros en caché:', todosRegs.length)
  let regs = todosRegs.filter(r => repIdSet.has(String(r.reporte_id)))
  console.log('[calcularAnalisisOffline] registros filtrados por reporte:', regs.length)

  // Aplicar filtros de registros (capas de validación + campos)
  regs = aplicarCapasFiltro(regs, capas)
  console.log('[calcularAnalisisOffline] registros tras capas:', regs.length)
  if (filtros.capitulo) regs = regs.filter(r => r.capitulo === filtros.capitulo)
  if (filtros.item) regs = regs.filter(r => r.item_numero === filtros.item)

  const grupos = {}

  if (filtros.capitulo) {
    // ── Drill-down: usuario hizo clic en un capítulo → agrupar por ítem (capitulo_items) ──
    regs.forEach(r => {
      const it = r.item_numero || 'Sin ítem'
      if (!grupos[it]) {
        grupos[it] = {
          label: it,
          descripcion: r.item_descripcion || '',
          unidad: r.unidad || '',
          capitulo: r.capitulo || '',
          total_registros: 0, cantidad_total: 0, costo_directo: 0,
          aprobados_count: 0, pendientes_count: 0, rechazados_count: 0,
          aprobados: 0, pendientes: 0, rechazados: 0,
          no_revisados: 0, no_revisados_costo: 0,
        }
      }
      const g = grupos[it]
      if (!g.descripcion && r.item_descripcion) g.descripcion = r.item_descripcion
      if (!g.unidad && r.unidad) g.unidad = r.unidad
      const cant = Number(r.cantidad_total) || 0
      const costo = Number(r.costo_directo) || 0
      g.total_registros++; g.cantidad_total += cant; g.costo_directo += costo
      const n1 = r.nivel1_estado || '', n2 = r.nivel2_estado || '', n3 = r.nivel3_estado || ''
      if (n1 === 'Rechazado' || n2 === 'Rechazado' || n3 === 'Rechazado') { g.rechazados_count++; g.rechazados += costo }
      else if (n3 === 'Aprobado' || n2 === 'Aprobado' || n1 === 'Aprobado') { g.aprobados_count++; g.aprobados += costo }
      else { g.no_revisados++; g.no_revisados_costo += costo; g.pendientes_count++; g.pendientes += costo }
    })

    const gruposArr = Object.values(grupos).sort((a, b) => {
      const na = parseFloat(String(a.label).replace(',', '.')) || 9999
      const nb = parseFloat(String(b.label).replace(',', '.')) || 9999
      return na !== nb ? na - nb : String(a.label).localeCompare(String(b.label))
    })
    const total_costo_directo    = gruposArr.reduce((s, g) => s + g.costo_directo, 0)
    const total_aprobados        = gruposArr.reduce((s, g) => s + g.aprobados, 0)
    const total_pendientes       = gruposArr.reduce((s, g) => s + g.pendientes, 0)
    const total_rechazados       = gruposArr.reduce((s, g) => s + g.rechazados, 0)
    const total_cantidad         = gruposArr.reduce((s, g) => s + g.cantidad_total, 0)
    return {
      grupos: gruposArr, modo: 'capitulo_items',
      total_registros: regs.length, total_costo_directo,
      total_aprobados, total_pendientes, total_rechazados, total_cantidad,
      encabezado: `Capítulo ${filtros.capitulo} (offline · ${regs.length} registros)`,
    }

  } else {
    // ── Vista inicial: agrupar por capítulo (modo acta_semana / general) ──
    regs.forEach(r => {
      const cap = r.capitulo || 'Sin capítulo'
      if (!grupos[cap]) {
        grupos[cap] = {
          label: cap,
          costo_directo: 0, total_registros: 0,
          aprobados_count: 0, pendientes_count: 0, rechazados_count: 0,
          aprobados: 0, pendientes: 0, rechazados: 0,
          no_revisados: 0, no_revisados_costo: 0,
        }
      }
      const g = grupos[cap]
      const costo = Number(r.costo_directo) || 0
      g.total_registros++; g.costo_directo += costo
      const n1 = r.nivel1_estado || '', n2 = r.nivel2_estado || '', n3 = r.nivel3_estado || ''
      if (n1 === 'Rechazado' || n2 === 'Rechazado' || n3 === 'Rechazado') { g.rechazados_count++; g.rechazados += costo }
      else if (n3 === 'Aprobado' || n2 === 'Aprobado' || n1 === 'Aprobado') { g.aprobados_count++; g.aprobados += costo }
      else { g.no_revisados++; g.no_revisados_costo += costo }
    })

    const gruposArr = Object.values(grupos).sort((a, b) => {
      const na = parseInt(String(a.label).match(/^(\d+)/)?.[1] || '9999')
      const nb = parseInt(String(b.label).match(/^(\d+)/)?.[1] || '9999')
      return na - nb
    })
    const total_costo_directo    = gruposArr.reduce((s, g) => s + g.costo_directo, 0)
    const total_aprobados        = gruposArr.reduce((s, g) => s + g.aprobados, 0)
    const total_pendientes       = gruposArr.reduce((s, g) => s + g.pendientes, 0)
    const total_rechazados       = gruposArr.reduce((s, g) => s + g.rechazados, 0)
    const total_no_revisados     = gruposArr.reduce((s, g) => s + g.no_revisados, 0)
    const total_no_revisados_costo = gruposArr.reduce((s, g) => s + g.no_revisados_costo, 0)
    return {
      grupos: gruposArr, modo: 'acta_semana',
      total_registros: regs.length,
      total_costo_directo, total_aprobados, total_pendientes, total_rechazados,
      total_no_revisados, total_no_revisados_costo,
      encabezado: `Por capítulo (offline · ${regs.length} registros)`,
    }
  }
}

// ── Búsqueda completa de reportes (replica /reportes/buscar) ──────────────────

export async function buscarReportesOffline(contratoId, filtros = {}, offset = 0, limit = 50, capas = []) {
  const cid = Number(contratoId)
  if (filtros.etiqueta_validacion && String(filtros.etiqueta_validacion).trim()) {
    return { reportes: [], hay_mas: false }
  }

  console.log('[buscarReportesOffline] contrato:', cid, 'filtros:', filtros, 'capas:', capas.length)

  const [actas, semanas, todosRegistros] = await Promise.all([
    byContrato(db.actas, cid),
    byContrato(db.so_semanas, cid),
    byContrato(db.so_registros, cid),
  ])
  console.log('[buscarReportesOffline] actas:', actas.length, 'registros:', todosRegistros.length)

  const actaByRpo = {}
  const actaById = {}
  actas.forEach(a => {
    actaById[a.id] = a
    if (a.numero_rpo != null) actaByRpo[String(a.numero_rpo)] = a
  })

  const semanaByNum = {}
  const semanaById = {}
  semanas.forEach(s => {
    semanaById[s.id] = s
    if (s.numero_semana != null) semanaByNum[String(s.numero_semana)] = s
  })

  // Resolver filtros de acta y semana
  let actaIdFiltro = null
  if (filtros.acta_rpo) {
    const actaMatch = actaByRpo[String(filtros.acta_rpo)]
    actaIdFiltro = actaMatch?.id != null ? Number(actaMatch.id) : -1
  }

  let semanaIdFiltro = null
  if (filtros.semana) {
    const semanaMatch = semanaByNum[String(filtros.semana)]
    semanaIdFiltro = semanaMatch?.id != null ? Number(semanaMatch.id) : -1
  }

  // Filtrar registros si hay filtros de línea
  let reporteIdsDesdeRegistros = null
  const necesitaRegistros = !!(
    filtros.capitulo || filtros.item || filtros.numero_registro ||
    filtros.cargo || filtros.estado_registro || capas.length > 0
  )

  if (necesitaRegistros) {
    let regs = todosRegistros

    if (filtros.capitulo) regs = regs.filter(r => r.capitulo === filtros.capitulo)
    if (filtros.item) regs = regs.filter(r => r.item_numero === filtros.item)
    if (filtros.numero_registro) {
      regs = regs.filter(r => String(r.numero_registro) === String(filtros.numero_registro))
    }

    if (capas.length > 0) {
      regs = aplicarCapasFiltro(regs, capas)
    } else if (filtros.cargo && filtros.estado_registro) {
      const campoNivel = CARGO_NIVEL_MAP[parseInt(filtros.cargo)]
      if (campoNivel) {
        regs = regs.filter(r => {
          const est = r[campoNivel] || 'No Revisado'
          return filtros.estado_registro === 'No Revisado'
            ? (est === 'No Revisado' || est == null)
            : est === filtros.estado_registro
        })
      }
    }

    reporteIdsDesdeRegistros = new Set(regs.map(r => String(r.reporte_id)))
  }

  // Filtrar reportes
  let todos = await byContrato(db.so_reportes, cid)
  console.log('[buscarReportesOffline] reportes en caché:', todos.length, 'actaIdFiltro:', actaIdFiltro, 'semanaIdFiltro:', semanaIdFiltro)

  todos = todos.filter(r => {
    if (filtros.numero_reporte && String(r.numero_reporte) !== String(filtros.numero_reporte)) return false
    if (filtros.estado && r.estado !== filtros.estado) return false
    if (actaIdFiltro !== null && Number(r.acta_rpo_id) !== actaIdFiltro) return false
    if (semanaIdFiltro !== null && Number(r.semana_id) !== semanaIdFiltro) return false
    if (filtros.subcontratista_id && String(r.subcontratista_id) !== String(filtros.subcontratista_id)) return false
    if (filtros.tramo && !(r.tramo || '').toLowerCase().includes(filtros.tramo.toLowerCase())) return false
    if (filtros.costado && (r.calzada || r.costado || '') !== filtros.costado) return false
    if (filtros.pk_id && String(r.pk_id_id || '') !== String(filtros.pk_id)) return false
    if (filtros.abs_inicio && r.abs_inicio != null && r.abs_inicio < parseFloat(filtros.abs_inicio)) return false
    if (filtros.abs_final  && r.abs_final  != null && r.abs_final  > parseFloat(filtros.abs_final))  return false
    if (reporteIdsDesdeRegistros !== null && !reporteIdsDesdeRegistros.has(String(r.id))) return false
    return true
  })

  console.log('[buscarReportesOffline] reportes tras filtros:', todos.length, '| repIdsDesdeReg:', reporteIdsDesdeRegistros?.size ?? 'N/A')
  todos.sort((a, b) => (b.numero_reporte ?? 0) - (a.numero_reporte ?? 0))

  const total = todos.length
  const pagina = todos.slice(offset, offset + limit)

  const reportes = pagina.map(r => ({
    ...r,
    semana_numero: semanaById[r.semana_id]?.numero_semana ?? null,
    acta_rpo: actaById[r.acta_rpo_id]?.numero_rpo ?? null,
    acta_consecutivo: actaById[r.acta_rpo_id]?.consecutivo ?? null,
  }))

  return { reportes, hay_mas: offset + limit < total }
}

// ── Número de reporte offline ──────────────────────────────────────────────────

export async function getNextNumeroReporteOffline(contratoId) {
  const reportes = await byContrato(db.so_reportes, contratoId)
  const maxReal = reportes
    .map(r => typeof r.numero_reporte === 'number' ? r.numero_reporte : 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return `TMP-${maxReal + 1}-${Date.now()}`
}

// ── Mutaciones locales ─────────────────────────────────────────────────────────

export async function aplicarValidacionLocal(registroId, campo, valor, extra = {}) {
  const registro = await db.so_registros.get(registroId)
  if (!registro) throw new Error(`Registro ${registroId} no encontrado en cache offline`)
  await db.so_registros.update(registroId, { ...extra, [campo]: valor, _offline: true })
  return { ...registro, ...extra, [campo]: valor, _offline: true }
}

export async function crearReporteLocal(contratoId, datos) {
  const reporte = {
    contrato_id: Number(contratoId),
    _offline: true,
    _local: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...datos,
  }
  await db.so_reportes.put(reporte)
  return reporte
}

export async function crearRegistroLocal(contratoId, reporteId, datos) {
  const localId = `local_reg_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const registro = {
    id: localId,
    contrato_id: Number(contratoId),
    reporte_id: reporteId,
    _offline: true,
    _local: true,
    nivel1_estado: 'No Revisado',
    nivel2_estado: null,
    nivel3_estado: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...datos,
  }
  await db.so_registros.put(registro)
  return registro
}
