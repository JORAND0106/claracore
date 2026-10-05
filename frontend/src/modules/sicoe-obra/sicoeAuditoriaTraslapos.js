/**
 * Motor único de auditoría de traslapos / vacíos / no-auditable (SicoeObra).
 * Misma semántica que backend/sicoe_auditoria_traslapos.py.
 */

export const SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M = 0.5
export const SICOE_AUDITORIA_TOLERANCIA_MIN_M = 0.1

export const SICOE_AUDITORIA_JUSTIFICACIONES = [
  'Sector diferente',
  'Capa o nivel diferente',
  'Elemento paralelo en el mismo sitio',
  'Reposición o reproceso',
  'Complemento de un cobro parcial',
]

export const SICOE_AUDITORIA_JUSTIFICACIONES_VACIO = [
  'No ejecutado aún',
  'El ítem no aplica en ese tramo',
  'Ejecutado, pendiente de reportar',
  'Cobrado en otro ítem',
]

export const SICOE_AUDITORIA_ESTADOS = ['pendiente', 'justificado', 'corregido']

export const SICOE_AUDITORIA_ACCION_LOG = 'AUDITORIA_TRASLAPO'
export const SICOE_AUDITORIA_HALLAZGO_ACCION_LOG = 'AUDITORIA_HALLAZGO'

export function normalizarToleranciaM(raw) {
  if (raw == null || raw === '') return SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M
  const v = Number(raw)
  if (!Number.isFinite(v)) return SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M
  return Math.max(SICOE_AUDITORIA_TOLERANCIA_MIN_M, v)
}

export function parseAbsNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function txt(v) {
  return String(v || '').trim()
}

export function justificacionesParaTipo(tipo) {
  const t = txt(tipo).toLowerCase()
  if (t === 'vacio') return SICOE_AUDITORIA_JUSTIFICACIONES_VACIO
  if (t === 'ubicacion_inconsistente') {
    return [
      'Coordenada de referencia del PK, no del elemento',
      'Abscisado del plano desactualizado',
      'Elemento en curva compleja',
      'Error de digitación corregido en campo',
    ]
  }
  if (t === 'costado_inconsistente') {
    return [
      'Costado reportado según calzada de cobro',
      'Eje del plano no coincide con el eje de obra',
      'Elemento central / sobre el eje',
      'Error de digitación corregido en campo',
    ]
  }
  if (t === 'cantidad_mayor_area') {
    return [
      'Cantidad incluye desperdicio / desperdicios de obra',
      'Polígono parcial; cobro por sector',
      'Área levantada pendiente de actualizar',
      'Error de digitación corregido en campo',
    ]
  }
  return SICOE_AUDITORIA_JUSTIFICACIONES
}

export function costadoDe(reg) {
  return txt(reg?.calzada || reg?.margen).toLowerCase()
}

export function sectorDe(reg) {
  return txt(reg?.sector).toLowerCase()
}

export function modoComparacion(reg) {
  const a0 = parseAbsNum(reg?.abs_inicio)
  const a1 = parseAbsNum(reg?.abs_final)
  if (a0 != null && a1 != null) return 'lineal'
  if (reg?.pk_id_id != null && String(reg.pk_id_id).trim() !== '') return 'puntual'
  return 'no_auditable'
}

export function claveGrupoLineal(reg) {
  return [
    txt(reg?.item_numero),
    txt(reg?.tramo).toLowerCase(),
    txt(reg?.infraestructura).toLowerCase(),
    costadoDe(reg),
  ].join('\u0001')
}

export function claveGrupoPuntual(reg) {
  return [txt(reg?.item_numero), String(reg?.pk_id_id)].join('\u0001')
}

function intervalo(a0, a1) {
  return [Math.min(a0, a1), Math.max(a0, a1)]
}

export function medidaTraslapo(a0, a1, b0, b1) {
  const [loA, hiA] = intervalo(a0, a1)
  const [loB, hiB] = intervalo(b0, b1)
  return Math.max(0, Math.min(hiA, hiB) - Math.max(loA, loB))
}

export function sectoresSeparan(a, b) {
  const sa = sectorDe(a)
  const sb = sectorDe(b)
  return !!(sa && sb && sa !== sb)
}

/** True si ambos registros pertenecen al mismo reporte (ids o número de reporte). */
export function mismoReporte(a, b) {
  if (!a || !b) return false
  const ra = a.reporte_id
  const rb = b.reporte_id
  if (ra != null && rb != null) {
    const sa = String(ra).trim()
    const sb = String(rb).trim()
    if (sa && sb) return sa === sb
  }
  const na = a.numero_reporte
  const nb = b.numero_reporte
  if (na != null && nb != null) {
    const sa = String(na).trim()
    const sb = String(nb).trim()
    if (sa && sb) return sa === sb
  }
  return false
}

/**
 * Traslapo cuyos involucrados son todos del mismo reporte.
 * No es hallazgo válido: dentro de un reporte es normal reportar varios ítems en el mismo sitio.
 */
export function esTraslapoMismoReporte(hallazgo) {
  if (!hallazgo) return false
  if (txt(hallazgo.tipo).toLowerCase() !== 'traslapo') return false
  const regs = hallazgo.registros_involucrados || []
  if (regs.length < 2) return false
  const keys = []
  for (const r of regs) {
    if (!r) return false
    let key = ''
    if (r.reporte_id != null && String(r.reporte_id).trim() !== '') {
      key = `id:${String(r.reporte_id).trim()}`
    } else if (r.numero_reporte != null && String(r.numero_reporte).trim() !== '') {
      key = `n:${String(r.numero_reporte).trim()}`
    } else {
      return false
    }
    keys.push(key)
  }
  return keys.length > 0 && new Set(keys).size === 1
}

export function costoDirectoParcial(cantidadTotal, vlrUnitario, fraccion) {
  const q = Number(cantidadTotal) || 0
  const vu = Number(vlrUnitario) || 0
  if (!q || !vu) return 0
  const frac = Math.max(0, Math.min(1, Number(fraccion) || 0))
  const qRed = Math.round(q * 100) / 100
  return Math.round(qRed * frac * vu)
}

export function fmtAbscisaK(v) {
  const n = parseAbsNum(v)
  if (n == null) return '—'
  const km = Math.trunc(n / 1000)
  const m = Math.abs(n - km * 1000)
  const mR = Math.round(m * 100) / 100
  const mStr = Number.isInteger(mR)
    ? String(mR)
    : mR.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
  return `K${km}+${mStr}`
}

export function fmtMedidaM(v) {
  const r = Math.round(Number(v) * 100) / 100
  if (!Number.isFinite(r)) return '0'
  if (Number.isInteger(r)) return String(r)
  return r.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
}

export function fmtValorCop(v) {
  const n = Math.round(Number(v) || 0)
  return `$${n.toLocaleString('es-CO')}`
}

function numeroReg(reg) {
  return reg?.numero_registro != null ? reg.numero_registro : reg?.id
}

function textoHallazgo(tipo, medida, absDesde, absHasta, involucradosOtros, valor) {
  const partes = []
  if (tipo === 'traslapo') partes.push(`Traslapo ${fmtMedidaM(medida || 0)} m`)
  else if (tipo === 'vacio') partes.push(`Vacío ${fmtMedidaM(medida || 0)} m`)
  else partes.push('No auditable')

  if (absDesde != null && absHasta != null) {
    partes.push(`${fmtAbscisaK(absDesde)} a ${fmtAbscisaK(absHasta)}`)
  }

  const nums = (involucradosOtros || [])
    .map((r) => numeroReg(r))
    .filter((n) => n != null && n !== '')
  if (nums.length) partes.push(`Reg. ${nums.join(', ')}`)

  if (tipo === 'traslapo' && valor) partes.push(fmtValorCop(valor))
  if (tipo === 'no_auditable') partes.push('faltan datos de ubicación')

  return partes.join(' · ')
}

function hallazgo(tipo, medida, absDesde, absHasta, candidato, otros, valor) {
  const involucrados = [candidato, ...(otros || [])].filter(Boolean)
  return {
    tipo,
    medida_m: medida == null ? null : Math.round(Number(medida) * 10000) / 10000,
    abs_desde: absDesde,
    abs_hasta: absHasta,
    valor_en_juego: Number(valor) || 0,
    texto: textoHallazgo(tipo, medida, absDesde, absHasta, otros || [], valor),
    registros_involucrados: involucrados.map((r) => ({
      id: r.id,
      numero_registro: r.numero_registro,
      reporte_id: r.reporte_id,
      item_numero: r.item_numero,
    })),
  }
}

/**
 * Analiza un candidato contra pares del mismo ítem.
 */
export function analizarCandidatoContraPares(candidato, pares, toleranciaM = SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M) {
  const tol = normalizarToleranciaM(toleranciaM)
  const candId = candidato?.id
  const item = txt(candidato?.item_numero)
  if (!item) {
    return {
      semaforo: 'amarillo',
      hallazgos: [hallazgo('no_auditable', null, null, null, candidato, [], 0)],
      modo: 'no_auditable',
      tolerancia_m: tol,
      item_numero: item,
      registro_id: candId,
      numero_registro: candidato?.numero_registro,
    }
  }

  const modo = modoComparacion(candidato)
  if (modo === 'no_auditable') {
    return {
      semaforo: 'amarillo',
      hallazgos: [hallazgo('no_auditable', null, null, null, candidato, [], 0)],
      modo,
      tolerancia_m: tol,
      item_numero: item,
      registro_id: candId,
      numero_registro: candidato?.numero_registro,
    }
  }

  const peers = (pares || []).filter(
    (p) => p && txt(p.item_numero) === item && (candId == null || String(p.id) !== String(candId)),
  )

  const hallazgos = []

  if (modo === 'puntual') {
    const pk = candidato.pk_id_id
    const mismos = peers.filter(
      (p) => String(p.pk_id_id) === String(pk)
        && modoComparacion(p) === 'puntual'
        && !mismoReporte(candidato, p),
    )
    for (const p of mismos) {
      const valor = costoDirectoParcial(candidato.cantidad_total, candidato.vlr_unitario, 1)
      const h = hallazgo('traslapo', null, null, null, candidato, [p], valor)
      h.texto = `Traslapo puntual · mismo PK · Reg. ${numeroReg(p)}${valor ? ` · ${fmtValorCop(valor)}` : ''}`
      hallazgos.push(h)
    }
  } else {
    const a0 = parseAbsNum(candidato.abs_inicio)
    const a1 = parseAbsNum(candidato.abs_final)
    const [loC, hiC] = intervalo(a0, a1)
    const longC = hiC - loC
    const grupoC = claveGrupoLineal(candidato)
    const delGrupo = []

    for (const p of peers) {
      if (modoComparacion(p) !== 'lineal') continue
      if (claveGrupoLineal(p) !== grupoC) continue
      if (sectoresSeparan(candidato, p)) continue
      const b0 = parseAbsNum(p.abs_inicio)
      const b1 = parseAbsNum(p.abs_final)
      if (b0 == null || b1 == null) continue
      delGrupo.push(p)

      // Traslapo solo entre reportes distintos.
      if (mismoReporte(candidato, p)) continue
      const ov = medidaTraslapo(a0, a1, b0, b1)
      if (ov >= tol) {
        const frac = longC > 1e-9 ? ov / longC : 1
        const valor = costoDirectoParcial(candidato.cantidad_total, candidato.vlr_unitario, frac)
        const [loB, hiB] = intervalo(b0, b1)
        hallazgos.push(
          hallazgo('traslapo', ov, Math.max(loC, loB), Math.min(hiC, hiB), candidato, [p], valor),
        )
      }
    }

    const segs = []
    for (const p of [...delGrupo, candidato]) {
      const x0 = parseAbsNum(p.abs_inicio)
      const x1 = parseAbsNum(p.abs_final)
      if (x0 == null || x1 == null) continue
      const [lo, hi] = intervalo(x0, x1)
      segs.push({ lo, hi, reg: p })
    }
    segs.sort((a, b) => a.lo - b.lo || a.hi - b.hi || String(a.reg?.id || '').localeCompare(String(b.reg?.id || '')))

    const covered = []
    for (const s of segs) {
      if (!covered.length) {
        covered.push({ lo: s.lo, hi: s.hi, reg: s.reg })
        continue
      }
      const prev = covered[covered.length - 1]
      if (s.lo <= prev.hi + 1e-12) {
        if (s.hi > prev.hi) {
          prev.hi = s.hi
          prev.reg = s.reg
        }
      } else {
        const gap = s.lo - prev.hi
        if (gap >= tol) {
          hallazgos.push(hallazgo('vacio', gap, prev.hi, s.lo, candidato, [prev.reg, s.reg], 0))
        }
        covered.push({ lo: s.lo, hi: s.hi, reg: s.reg })
      }
    }
  }

  const tieneRojo = hallazgos.some((h) => h.tipo === 'traslapo')
  const tieneAmarillo = hallazgos.some((h) => h.tipo === 'vacio' || h.tipo === 'no_auditable')
  const semaforo = tieneRojo ? 'rojo' : tieneAmarillo ? 'amarillo' : 'verde'

  return {
    semaforo,
    hallazgos,
    modo,
    tolerancia_m: tol,
    item_numero: item,
    registro_id: candId,
    numero_registro: candidato?.numero_registro,
  }
}

export function analizarVarios(candidatos, paresPorItem, toleranciaM = SICOE_AUDITORIA_TOLERANCIA_DEFAULT_M) {
  const resultados = []
  const cont = { verde: 0, amarillo: 0, rojo: 0, traslapo: 0, vacio: 0, no_auditable: 0 }
  for (const c of candidatos || []) {
    const item = txt(c?.item_numero)
    const pares = paresPorItem?.[item] || []
    const otrosCand = (candidatos || []).filter((x) => x !== c && txt(x?.item_numero) === item)
    const r = analizarCandidatoContraPares(c, [...pares, ...otrosCand], toleranciaM)
    resultados.push(r)
    cont[r.semaforo] = (cont[r.semaforo] || 0) + 1
    for (const h of r.hallazgos || []) {
      if (h.tipo in cont) cont[h.tipo] += 1
    }
  }
  const semaforo = cont.rojo ? 'rojo' : cont.amarillo ? 'amarillo' : 'verde'
  return {
    semaforo,
    resumen: cont,
    resultados,
    tolerancia_m: normalizarToleranciaM(toleranciaM),
  }
}

/** Contratista (y no interventoría) ve alertas. */
export function usuarioVeAuditoriaTraslapos(usuario) {
  if (!usuario) return false
  const rn = txt(usuario.rol_nombre || usuario.rol)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (rn.includes('intervent')) return false
  return true
}

export function colorSemaforo(semaforo) {
  if (semaforo === 'rojo') return '#dc2626'
  if (semaforo === 'amarillo') return '#d97706'
  return '#16a34a'
}

export function etiquetaSemaforo(semaforo) {
  if (semaforo === 'rojo') return 'Traslapo'
  if (semaforo === 'amarillo') return 'Atención'
  return 'Sin hallazgos'
}

function absKey(v) {
  const n = parseAbsNum(v)
  if (n == null) return ''
  return n.toFixed(3)
}

/** Huella estable (misma semántica que backend fingerprint_hallazgo). */
export function fingerprintHallazgo(h) {
  const tipo = txt(h?.tipo).toLowerCase()
  const ids = [
    ...new Set(
      (h?.registros_involucrados || [])
        .filter((r) => r && r.id != null && String(r.id).trim() !== '')
        .map((r) => String(r.id)),
    ),
  ].sort()
  const raw = [
    tipo,
    ids.join(','),
    absKey(h?.abs_desde),
    absKey(h?.abs_hasta),
    txt(h?.item_numero),
    txt(h?.pk_id_id),
  ].join('|')
  // Simple FNV-1a 32-bit + hex stretch (browser-safe; backend usa sha256[:40])
  let hash = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}${ids.length}${tipo.slice(0, 2)}${absKey(h?.abs_desde)}`.slice(0, 40)
}

export function resumenAmbienteDesdeFilas(filas) {
  const out = {
    traslapos_sin_justificar: { cantidad: 0, valor: 0 },
    vacios_sin_justificar: { cantidad: 0, valor: 0 },
    no_auditables: { cantidad: 0, valor: 0 },
    inconsistencias: { cantidad: 0, valor: 0 },
    justificados: { cantidad: 0, valor: 0 },
  }
  for (const f of filas || []) {
    if (esTraslapoMismoReporte(f)) continue
    const estado = txt(f?.estado).toLowerCase() || 'pendiente'
    if (estado === 'corregido') continue
    const tipo = txt(f?.tipo).toLowerCase()
    const valor = Number(f?.valor_en_juego) || 0
    if (estado === 'justificado') {
      out.justificados.cantidad += 1
      out.justificados.valor += valor
      continue
    }
    if (tipo === 'traslapo') {
      out.traslapos_sin_justificar.cantidad += 1
      out.traslapos_sin_justificar.valor += valor
    } else if (tipo === 'vacio') {
      out.vacios_sin_justificar.cantidad += 1
      out.vacios_sin_justificar.valor += valor
    } else if (tipo === 'no_auditable') {
      out.no_auditables.cantidad += 1
      out.no_auditables.valor += valor
    } else if (tipo === 'ubicacion_inconsistente' || tipo === 'costado_inconsistente' || tipo === 'cantidad_mayor_area') {
      out.inconsistencias.cantidad += 1
      out.inconsistencias.valor += valor
    }
  }
  return out
}

/** Colores MiniMapa a partir de hallazgos filtrados (capa por ítem vía pct). */
export function coloresMapaDesdeHallazgos(hallazgos, { seleccionadoId = null } = {}) {
  const colores = {}
  for (const h of hallazgos || []) {
    const tipo = txt(h?.tipo).toLowerCase()
    const esSel = seleccionadoId != null && String(h?.id ?? h?.fingerprint) === String(seleccionadoId)
    const basePct = tipo === 'traslapo' ? 100 : tipo === 'vacio' ? 80 : 50
    const pct = esSel ? 110 : basePct
    for (const r of h?.registros_involucrados || []) {
      const pk = r?.pk_id_id != null ? String(r.pk_id_id).trim() : ''
      if (!pk) continue
      const prev = colores[pk]
      if (!prev || pct >= (prev.pct || 0)) {
        colores[pk] = {
          cobrado: 1,
          presupuesto: 1,
          pct,
          sobrecosto: tipo === 'traslapo' || esSel,
          item_numero: h?.item_numero || r?.item_numero || null,
          hallazgo_id: h?.id ?? h?.fingerprint,
        }
      }
    }
  }
  return colores
}
