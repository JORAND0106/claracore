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

export const SICOE_AUDITORIA_ACCION_LOG = 'AUDITORIA_TRASLAPO'

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
      (p) => String(p.pk_id_id) === String(pk) && modoComparacion(p) === 'puntual',
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
