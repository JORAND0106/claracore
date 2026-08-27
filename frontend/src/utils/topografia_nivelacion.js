/** Utilidades de nivelación geométrica (cálculo en cliente). */

export const STADIA_K = 100

export function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Lectura de nivelación: siempre hilo medio (automático) o valor único (electrónico). */
export function lecturaMedioBloque(bloque, tipoNivel) {
  if (!bloque) return null
  if (tipoNivel === 'automatico') {
    return numOrNull(bloque.hM)
  }
  return numOrNull(bloque.lectura)
}

/** Distancia horizontal taquimétrica: K × |hilo inf − hilo sup|. */
export function distanciaTaquimetrica(hSup, hInf, k = STADIA_K) {
  const s = numOrNull(hSup)
  const i = numOrNull(hInf)
  if (s == null || i == null) return null
  return Math.abs(i - s) * k
}

/** Tolerancia (m) para comparar separación S–M vs M–I en nivel automático. */
export const HILO_PAR_TOL = 0.002

export const HILO_INCONGRUENCIA_MSG =
  'Hilos inconsistentes: |S−M| debe igualar |M−I| y el medio debe quedar entre superior e inferior.'

export const HILO_INCONGRUENCIA_SEP_MSG =
  'Separación desigual: |S−M| ≠ |M−I|. Revise HS, HM e HI.'

export const HILO_INCONGRUENCIA_ORDEN_MSG =
  'El hilo medio (HM) debe quedar entre el superior (HS) y el inferior (HI).'

/**
 * Diagnóstico de inconsistencia S/M/I (nivel automático).
 * @returns {null | { tipo: 'separacion'|'orden'|'ambos', msg: string }}
 */
export function diagnosticoHilosIncongruentes(bloque, tipoNivel, tol = HILO_PAR_TOL) {
  if (tipoNivel !== 'automatico' || !bloque) return null
  const s = numOrNull(bloque.hS)
  const m = numOrNull(bloque.hM)
  const i = numOrNull(bloque.hI)
  if (s == null || m == null || i == null) return null
  const sepOk = Math.abs(Math.abs(m - s) - Math.abs(i - m)) <= tol
  const lo = Math.min(s, i)
  const hi = Math.max(s, i)
  const ordenOk = m >= lo - tol && m <= hi + tol
  if (sepOk && ordenOk) return null
  if (!sepOk && !ordenOk) {
    return { tipo: 'ambos', msg: HILO_INCONGRUENCIA_MSG }
  }
  if (!sepOk) return { tipo: 'separacion', msg: HILO_INCONGRUENCIA_SEP_MSG }
  return { tipo: 'orden', msg: HILO_INCONGRUENCIA_ORDEN_MSG }
}

/** True si los tres hilos están diligenciados y hay incongruencia taquimétrica u orden. */
export function hilosIncongruentes(bloque, tipoNivel, tol = HILO_PAR_TOL) {
  return diagnosticoHilosIncongruentes(bloque, tipoNivel, tol) != null
}

export const ABSCISA_NUMERICA_MSG = 'Seleccione la ubicación en el plano PK.'

/** Abscisa en metros; acepta coma decimal. */
export function parseAbscisa(v) {
  if (v === '' || v == null) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function abscisaInvalida(fila) {
  if (fila?.ubicacion_pk_id) return false
  const raw = String(fila?.abscisa ?? '').trim()
  if (!raw) return false
  return parseAbscisa(fila.abscisa) === null
}

export function bloqueVacio() {
  return { hS: '', hM: '', hI: '', lectura: '' }
}

/** Convierte lecturas al cambiar entre automático y electrónico en pantalla. */
export function convertirFilasTipoNivel(filas, desde, hacia) {
  if (desde === hacia) return filas
  const conv = (bloque) => {
    if (!bloque) return bloqueVacio()
    if (desde === 'automatico' && hacia === 'electronico') {
      const m = bloque.hM ?? ''
      const lectura = m !== '' && m != null ? m : (bloque.lectura ?? '')
      return { ...bloqueVacio(), lectura }
    }
    if (desde === 'electronico' && hacia === 'automatico') {
      const l = bloque.lectura ?? ''
      return { hS: '', hM: l, hI: '', lectura: '' }
    }
    return { ...bloque }
  }
  return filas.map((fila) => ({
    ...fila,
    vplus: conv(fila.vplus),
    vi: conv(fila.vi),
    vminus: conv(fila.vminus),
  }))
}

export function nuevaFilaPunto(orden = 1, esPrimera = false) {
  return {
    orden,
    nombre_punto: '',
    tipo_punto: esPrimera ? 'BM' : '',
    abscisa: '',
    descripcion_punto: '',
    dist_vplus_m: '',
    dist_vminus_m: '',
    vplus: bloqueVacio(),
    vi: bloqueVacio(),
    vminus: bloqueVacio(),
    es_fila_cierre: false,
    punto_biblioteca_id: null,
    ubicacion_pk_id: null,
    ubicacion_pk: '',
    ubicacion_tramo: '',
    ubicacion_costado: '',
    ubicacion_infraestructura: '',
    ubicacion_lat: null,
    ubicacion_lng: null,
  }
}

/** Fila de cierre: V− en BM de biblioteca para calcular error de cierre. */
export function nuevaFilaCierre(punto, orden, abscisaSugerida = '0') {
  const nombre = (punto?.nombre || '').trim()
  const abscisaRaw = punto?.abscisa != null ? String(punto.abscisa) : abscisaSugerida
  return {
    ...nuevaFilaPunto(orden, false),
    nombre_punto: nombre,
    tipo_punto: 'estacion',
    descripcion_punto: 'Punto de cierre',
    es_fila_cierre: true,
    punto_biblioteca_id: punto?.id || null,
    abscisa: abscisaRaw.trim() || '0',
  }
}

export function filasTieneCierre(filas) {
  return (filas || []).some((f) => f.es_fila_cierre)
}

/** Filas/puntos con nombre en la cartera (no lecturas sueltas V+/Vi/V−). */
export function contarPuntosFilas(filas) {
  return (filas || []).filter((f) => String(f?.nombre_punto ?? '').trim()).length
}

/** Índice (0-based) y datos de la fila de cierre, si existe. */
export function filaCierreInfo(filas) {
  const idx = (filas || []).findIndex((f) => f.es_fila_cierre)
  if (idx < 0) return null
  const f = filas[idx]
  return {
    idx,
    numero: idx + 1,
    nombre: (f.nombre_punto || '').trim() || '—',
    descripcion: (f.descripcion_punto || '').trim() || 'Punto de cierre',
  }
}

export function mensajeFilaCierreExistente(filas) {
  const info = filaCierreInfo(filas)
  if (!info) return 'Ya hay una fila de cierre.'
  return `La fila ${info.numero} (${info.nombre} · ${info.descripcion}) es el cierre del circuito. Elimínela con × si necesita agregar tramos o registrar otro cierre.`
}

export function filaTieneVminus(fila, tipoNivel) {
  return bloqueTieneLecturaCalculo(fila?.vminus, tipoNivel)
}

export function filaTieneVplus(fila, tipoNivel) {
  return bloqueTieneLecturaCalculo(fila?.vplus, tipoNivel)
}

export function filaTieneVi(fila, tipoNivel) {
  return bloqueTieneLecturaCalculo(fila?.vi, tipoNivel)
}

/** V+ sin Vi ni V− en la misma fila (tramo abierto). Fila 1 (BM) puede iniciar solo con V+. */
export function filaVplusSinVistaAdelante(fila, idx, tipoNivel, filas = null) {
  if (idx === 0) return false
  if (!filaTieneVplus(fila, tipoNivel)) return false
  if (filas?.[idx + 1]?.es_fila_cierre) return false
  return !filaTieneVminus(fila, tipoNivel) && !filaTieneVi(fila, tipoNivel)
}

export function ultimaFilaVplusSinVista(filas, tipoNivel) {
  if (!filas.length) return false
  const last = filas[filas.length - 1]
  if (last.es_fila_cierre) return false
  if (!filaTieneVplus(last, tipoNivel)) return false
  return !filaTieneVminus(last, tipoNivel) && !filaTieneVi(last, tipoNivel)
}

export function carteraVplusSinVista(filas, tipoNivel) {
  return filas.some((fila, idx) => filaVplusSinVistaAdelante(fila, idx, tipoNivel, filas))
    || ultimaFilaVplusSinVista(filas, tipoNivel)
}

export function puedeIngresarCierre(filas, tipoNivel, bmInicialNombre) {
  if (filasTieneCierre(filas)) {
    return { ok: false, msg: mensajeFilaCierreExistente(filas), esCierre: true }
  }
  if (!filas.length) {
    return { ok: false, msg: 'Registre al menos un tramo antes de ingresar cierre.' }
  }
  const lastIdx = filas.length - 1
  const last = filas[lastIdx]
  if (!metadatosFilaCompletos(last, lastIdx, bmInicialNombre)) {
    return {
      ok: false,
      msg: 'Complete nombre, abscisa, descripción y tipo en la última fila antes del cierre.',
    }
  }
  if (ultimaFilaVminusSinVplus(filas, tipoNivel)) {
    return {
      ok: false,
      msg: 'La última fila tiene V− sin V+. Cierre el tramo con V+ (cambio) antes de ingresar cierre.',
    }
  }
  return { ok: true }
}

export const MSG_VPLUS_SIN_VISTA =
  'Hay V+ sin Vi ni V− en la misma fila. Registre vista adelante o borre la V+ antes de continuar.'

export const COLORES_BLOQUE_NIV = {
  vplus: { bg: '#eff6ff', border: '#93c5fd', header: '#dbeafe' },
  vi: { bg: '#f0fdf4', border: '#86efac', header: '#dcfce7' },
  vminus: { bg: '#fff7ed', border: '#fdba74', header: '#ffedd5' },
}

export function metadatosFilaCompletos(fila, idx, bmInicialNombre) {
  const f = faltantesMetadatosFila(fila, idx, bmInicialNombre)
  return !f.nombre && !f.abscisa && !f.descripcion && !f.tipo
}

/** Campos de metadatos faltantes en una fila (para resaltar en UI). */
export function faltantesMetadatosFila(fila, idx, bmInicialNombre) {
  const nombre = idx === 0
    ? (bmInicialNombre || (fila.nombre_punto || '').trim())
    : (fila.nombre_punto || '').trim()
  const abscisaVal = fila?.ubicacion_pk_id
    ? String(fila.ubicacion_pk || fila.abscisa || '').trim() || 'pk'
    : parseAbscisa(fila.abscisa)
  const descripcion = (fila.descripcion_punto || '').trim()
  let tipo = (fila.tipo_punto || '').trim()
  if (idx === 0 && !tipo) tipo = 'BM'
  const abscisaNoNumerica = abscisaInvalida(fila)
  return {
    nombre: !nombre,
    abscisa: abscisaVal == null,
    abscisaNoNumerica,
    descripcion: !descripcion,
    tipo: idx > 0 && !tipo,
  }
}

export function resaltadoValidacionUltimaFila(filas, tipoNivel, bmInicialNombre) {
  if (!filas.length) return null
  const idx = filas.length - 1
  const fila = filas[idx]
  const meta = faltantesMetadatosFila(fila, idx, bmInicialNombre)
  const vminusSinVplus = ultimaFilaVminusSinVplus(filas, tipoNivel)
  const incompleta = !metadatosFilaCompletos(fila, idx, bmInicialNombre)
  if (!incompleta && !vminusSinVplus) return null
  return { idx, meta, vminusSinVplus, incompleta }
}

export function ultimaFilaVminusSinVplus(filas, tipoNivel) {
  if (!filas.length) return false
  const last = filas[filas.length - 1]
  return filaTieneVminus(last, tipoNivel) && !filaTieneVplus(last, tipoNivel)
}

/**
 * Circuito formalmente abierto (botón «Abrir circuito»).
 * La marca persiste en `circuito_abierto_at` aunque el estado vuelva a borrador al guardar.
 */
export function circuitoEstaAbierto(nivelacion) {
  return Boolean(nivelacion?.circuito_abierto_at)
}

/**
 * Primera vuelta completa: BM con V+ y al menos una vista adelante (Vi/V−) en otra fila.
 * A partir de aquí aplican las validaciones estrictas de tramo/cambio.
 */
export function primeraVueltaCompleta(filas, tipoNivel) {
  const rows = filas || []
  if (rows.length < 2) return false
  if (!filaTieneVplus(rows[0], tipoNivel)) return false
  return rows.slice(1).some(
    (f) => filaTieneVminus(f, tipoNivel) || filaTieneVi(f, tipoNivel),
  )
}

/**
 * Fase de apertura: aún no se abrió el circuito, o se abrió pero falta cerrar la primera vuelta.
 * En esta fase se permite V+ (BM) y V− en puntos distintos sin exigir consistencia de tramo.
 */
export function modoAperturaNivelacion(filas, tipoNivel, nivelacion) {
  if (!circuitoEstaAbierto(nivelacion)) return true
  return !primeraVueltaCompleta(filas, tipoNivel)
}

export function puedeAbrirCircuito(nivelacion, form = {}) {
  if (circuitoEstaAbierto(nivelacion)) {
    return { ok: false, msg: 'El circuito ya está abierto.' }
  }
  const bm = form.bm_inicial_id || nivelacion?.bm_inicial_id
  if (!bm) {
    return { ok: false, msg: 'Seleccione el BM inicial antes de abrir el circuito.' }
  }
  return { ok: true }
}

export function puedeAgregarFila(filas, tipoNivel, bmInicialNombre, opts = {}) {
  const apertura = Boolean(opts.modoApertura)
  if (filasTieneCierre(filas)) {
    return {
      ok: false,
      msg: mensajeFilaCierreExistente(filas),
      esCierre: true,
    }
  }
  if (!filas.length) return { ok: true }
  const lastIdx = filas.length - 1
  const last = filas[lastIdx]
  if (!metadatosFilaCompletos(last, lastIdx, bmInicialNombre)) {
    return {
      ok: false,
      msg: 'Complete nombre, abscisa, descripción y tipo en la última fila antes de agregar otra.',
    }
  }
  if (apertura) {
    // Primera vuelta: BM con solo V+, o V− intermedia en otro punto, no bloquean +Fila.
    return { ok: true }
  }
  if (ultimaFilaVminusSinVplus(filas, tipoNivel)) {
    return {
      ok: false,
      msg: 'La última fila tiene V− sin V+. Cierre el tramo con V+ (cambio) o quite la V− antes de continuar.',
    }
  }
  if (ultimaFilaVplusSinVista(filas, tipoNivel)) {
    return { ok: false, msg: MSG_VPLUS_SIN_VISTA }
  }
  return { ok: true }
}

/** V+ nueva H.I. (fila > 0): exige V− gestionada en la misma fila. */
export function puedeRegistrarVplus(fila, idx, tipoNivel) {
  if (idx === 0) return { ok: true }
  if (!filaTieneVminus(fila, tipoNivel)) {
    return {
      ok: false,
      msg: 'Registre V− en esta fila antes de V+ (cambio de instrumento).',
    }
  }
  return { ok: true }
}

export function validarCarteraNivelacion(filas, tipoNivel, bmInicialNombre, opts = {}) {
  const apertura = Boolean(opts.modoApertura)
  const errores = []
  filas.forEach((fila, idx) => {
    const tieneLect = ['vplus', 'vi', 'vminus'].some((k) => bloqueTieneLecturaCalculo(fila[k], tipoNivel))
    if (!tieneLect) return
    if (!metadatosFilaCompletos(fila, idx, bmInicialNombre)) {
      errores.push(`Fila ${idx + 1}: complete nombre, abscisa, descripción y tipo.`)
    } else if (abscisaInvalida(fila)) {
      errores.push(`Fila ${idx + 1}: seleccione la ubicación en el plano PK.`)
    }
    if (!apertura && idx > 0 && filaTieneVplus(fila, tipoNivel) && !filaTieneVminus(fila, tipoNivel)) {
      errores.push(`Fila ${idx + 1}: V+ requiere V− previa en la misma fila (cambio).`)
    }
    if (!apertura && filaVplusSinVistaAdelante(fila, idx, tipoNivel, filas)) {
      errores.push(`Fila ${idx + 1}: V+ sin Vi ni V−. Registre vista adelante o borre la V+.`)
    }
  })
  const cierre = filas.find((f) => f.es_fila_cierre)
  if (cierre && !filaTieneVminus(cierre, tipoNivel)) {
    errores.push('Complete la lectura V− en la fila de cierre.')
  }
  if (!apertura && ultimaFilaVminusSinVplus(filas, tipoNivel)) {
    errores.push('La última fila tiene V− sin V+. Complete el cambio o el cierre del tramo.')
  }
  if (!apertura && ultimaFilaVplusSinVista(filas, tipoNivel)) {
    errores.push(MSG_VPLUS_SIN_VISTA)
  }
  return errores
}

/** Validación laxa al guardar borrador: no exige cierre ni tramos cerrados. */
export function validarCarteraParaGuardado(filas, tipoNivel, bmInicialNombre, opts = {}) {
  const apertura = Boolean(opts.modoApertura)
  const errores = []
  filas.forEach((fila, idx) => {
    const tieneLect = ['vplus', 'vi', 'vminus'].some((k) => bloqueTieneLecturaCalculo(fila[k], tipoNivel))
    const esMarcador = Boolean(fila.es_fila_cierre)
    if (!tieneLect && !esMarcador) return
    if (!metadatosFilaCompletos(fila, idx, bmInicialNombre)) {
      errores.push(`Fila ${idx + 1}: complete nombre, abscisa, descripción y tipo.`)
    } else if (abscisaInvalida(fila)) {
      errores.push(`Fila ${idx + 1}: seleccione la ubicación en el plano PK.`)
    }
    if (
      !apertura
      && tieneLect
      && idx > 0
      && filaTieneVplus(fila, tipoNivel)
      && !filaTieneVminus(fila, tipoNivel)
    ) {
      errores.push(`Fila ${idx + 1}: V+ requiere V− previa en la misma fila (cambio).`)
    }
  })
  const conLectura = filas.some((f, i) => (
    ['vplus', 'vi', 'vminus'].some((k) => bloqueTieneLecturaCalculo(f[k], tipoNivel))
    || f.es_fila_cierre
  ))
  if (!conLectura) {
    errores.push('No hay lecturas ni fila de cierre para guardar.')
  }
  return errores
}

/** Lectura efectiva: hilo medio (automático) o lectura única; admite hM si el tipo declarado no coincide. */
function lecturaMedioEfectiva(bloque, tipoNivel) {
  const m = lecturaMedioBloque(bloque, tipoNivel)
  if (m != null) return m
  return numOrNull(bloque?.hM)
}

function bloqueTieneHilosAutomaticos(filas) {
  return (filas || []).some((fila) => (
    ['vplus', 'vi', 'vminus'].some((k) => {
      const b = fila[k]
      return b && [b.hS, b.hM, b.hI].some((v) => v !== '' && v != null)
    })
  ))
}

function bloqueTieneLecturaElectronica(filas) {
  return (filas || []).some((fila) => (
    ['vplus', 'vi', 'vminus'].some((k) => {
      const b = fila[k]
      return b && b.lectura !== '' && b.lectura != null && numOrNull(b.lectura) != null
    })
  ))
}

/** Tipo real de las lecturas en pantalla (puede diferir del selector si no se guardó el cambio). */
export function inferirTipoNivelFilas(filas, tipoDeclarado = 'electronico') {
  const auto = bloqueTieneHilosAutomaticos(filas)
  const elec = bloqueTieneLecturaElectronica(filas)
  if (auto && !elec) return 'automatico'
  if (elec && !auto) return 'electronico'
  return tipoDeclarado || 'electronico'
}

function bloqueTieneDatos(bloque, tipoNivel) {
  if (!bloque) return false
  return lecturaMedioEfectiva(bloque, tipoNivel) != null
    || [bloque.hS, bloque.hM, bloque.hI].some((v) => v !== '' && v != null)
    || (bloque.lectura !== '' && bloque.lectura != null)
}

function bloqueTieneLecturaCalculo(bloque, tipoNivel) {
  return lecturaMedioEfectiva(bloque, tipoNivel) != null
}

export function lecturaBloque(bloque, tipoNivel) {
  return lecturaMedioBloque(bloque, tipoNivel)
}

/** Distancia taquimétrica o manual del bloque V+ (solo si hay lectura V+). */
export function distanciaVplusFila(fila, tipoNivel) {
  if (!filaTieneVplus(fila, tipoNivel)) return null
  if (tipoNivel === 'electronico') {
    const manual = numOrNull(fila.dist_vplus_m)
    if (manual != null) return manual
    const t = distanciaTaquimetrica(fila.vplus?.hS, fila.vplus?.hI)
    return t != null ? t : null
  }
  return distanciaTaquimetrica(fila.vplus?.hS, fila.vplus?.hI)
}

/** Distancia taquimétrica o manual del bloque V− (solo si hay lectura V−). */
export function distanciaVminusFila(fila, tipoNivel) {
  if (!filaTieneVminus(fila, tipoNivel)) return null
  if (tipoNivel === 'electronico') {
    const manual = numOrNull(fila.dist_vminus_m)
    if (manual != null) return manual
    return distanciaTaquimetrica(fila.vminus?.hS, fila.vminus?.hI)
  }
  return distanciaTaquimetrica(fila.vminus?.hS, fila.vminus?.hI)
}

/** @deprecated Use distanciaVplusFila / distanciaVminusFila */
export function distanciaFila(fila, tipoNivel) {
  const dVp = distanciaVplusFila(fila, tipoNivel)
  const dVm = distanciaVminusFila(fila, tipoNivel)
  if (dVp != null && dVm != null) return dVp + dVm
  return dVp ?? dVm
}

const TIPO_KEYS = { 'V+': 'vplus', Vi: 'vi', 'V-': 'vminus' }
/** Cambio: V− → Vi → V+ (V+ actualiza H.I. con cota de la misma fila). */
const ORDEN_LECTURAS = ['V-', 'Vi', 'V+']
const TIPO_ORDEN = { 'V-': 1, Vi: 2, 'V+': 3 }

function tiposProcesamientoFila(fila, tipoNivel) {
  return ORDEN_LECTURAS.filter((tipo) => {
    const key = TIPO_KEYS[tipo]
    return bloqueTieneLecturaCalculo(fila[key], tipoNivel)
  })
}

export function procesarFilaNivelacion(fila, hi, cotas, tipoNivel, idx, avisos) {
  const nombre = (fila.nombre_punto || '').trim()
  let rowHi = hi
  let rowCota = null
  /** Cota calculada por V−/Vi en esta fila (para V+ en cambio y visualización). */
  let cotaCalculadaFila = null
  const cotasLocal = { ...cotas }

  for (const tipo of tiposProcesamientoFila(fila, tipoNivel)) {
    const bloque = fila[TIPO_KEYS[tipo]]
    const lect = lecturaMedioBloque(bloque, tipoNivel) ?? numOrNull(bloque?.hM)
    if (lect == null) continue

    if (tipo === 'V+') {
      const cotaRef = cotasLocal[nombre] ?? cotaCalculadaFila
      if (cotaRef == null) {
        avisos.push(
          `Fila ${idx + 1}: V+ requiere cota conocida (biblioteca, V−/Vi previa o V− en la misma fila de cambio).`,
        )
      } else {
        hi = cotaRef + lect
        rowHi = hi
        if (cotaCalculadaFila == null) rowCota = cotaRef
      }
    } else if (hi != null) {
      const cota = hi - lect
      cotaCalculadaFila = cota
      rowCota = cota
      rowHi = hi
      if (nombre) cotasLocal[nombre] = cota
    } else {
      avisos.push(`Fila ${idx + 1}: ${tipo} sin altura instrumental previa (registre V+ en BM o cambio).`)
    }
  }

  return { hi, rowHi, rowCota, cotas: cotasLocal }
}

export function filasToLecturas(filas, tipoNivel) {
  const tipoExport = inferirTipoNivelFilas(filas, tipoNivel)
  const out = []
  const filasConOrden = (filas || []).map((fila, rowIdx) => ({ fila, rowIdx }))

  filasConOrden.forEach(({ fila, rowIdx }) => {
    if (!fila.nombre_punto?.trim()) return
    const distVplus = distanciaVplusFila(fila, tipoExport)
    const distVminus = distanciaVminusFila(fila, tipoExport)
    ;['V-', 'Vi', 'V+'].forEach((tipo) => {
      const key = TIPO_KEYS[tipo]
      const bloque = fila[key]
      if (!bloqueTieneLecturaCalculo(bloque, tipoExport)) return
      const lectura = lecturaMedioEfectiva(bloque, tipoExport)
      const distLect = tipo === 'V+' ? distVplus : tipo === 'V-' ? distVminus : null
      const item = {
        orden: rowIdx * 10 + TIPO_ORDEN[tipo],
        nombre_punto: fila.nombre_punto.trim(),
        tipo_punto: fila.tipo_punto || (rowIdx === 0 ? 'BM' : 'estacion'),
        tipo_lectura: tipo,
        abscisa: (fila.ubicacion_pk || fila.abscisa)?.trim?.() || fila.abscisa?.trim?.() || null,
        descripcion_punto: fila.descripcion_punto?.trim() || null,
        distancia_m: distLect,
        lectura,
        punto_biblioteca_id: fila.punto_biblioteca_id || null,
        ubicacion_pk_id: fila.ubicacion_pk_id || null,
        ubicacion_pk: fila.ubicacion_pk || null,
        ubicacion_tramo: fila.ubicacion_tramo || null,
        ubicacion_costado: fila.ubicacion_costado || null,
        ubicacion_infraestructura: fila.ubicacion_infraestructura || null,
        ubicacion_lat: fila.ubicacion_lat != null ? Number(fila.ubicacion_lat) : null,
        ubicacion_lng: fila.ubicacion_lng != null ? Number(fila.ubicacion_lng) : null,
      }
      if (tipoExport === 'automatico' || numOrNull(bloque?.hM) != null) {
        item.hilo_superior = numOrNull(bloque.hS)
        item.hilo_medio = numOrNull(bloque.hM) ?? lectura
        item.hilo_inferior = numOrNull(bloque.hI)
      }
      out.push(item)
    })
  })

  // Fila de cierre sin V− aún: persistir metadatos para que no desaparezca al recargar
  filasConOrden.forEach(({ fila, rowIdx }) => {
    const nombre = (fila.nombre_punto || '').trim()
    if (!nombre || !fila.es_fila_cierre) return
    if (out.some((l) => Math.floor(((l.orden || 1) - 1) / 10) === rowIdx)) return
    out.push({
      orden: rowIdx * 10 + 2,
      nombre_punto: nombre,
      tipo_punto: fila.tipo_punto || 'estacion',
      tipo_lectura: 'Vi',
      abscisa: (fila.ubicacion_pk || fila.abscisa)?.trim?.() || fila.abscisa?.trim?.() || null,
      descripcion_punto: fila.descripcion_punto?.trim() || null,
      distancia_m: null,
      lectura: null,
      punto_biblioteca_id: fila.punto_biblioteca_id || null,
      ubicacion_pk_id: fila.ubicacion_pk_id || null,
      ubicacion_pk: fila.ubicacion_pk || null,
      ubicacion_tramo: fila.ubicacion_tramo || null,
      ubicacion_costado: fila.ubicacion_costado || null,
      ubicacion_infraestructura: fila.ubicacion_infraestructura || null,
      ubicacion_lat: fila.ubicacion_lat != null ? Number(fila.ubicacion_lat) : null,
      ubicacion_lng: fila.ubicacion_lng != null ? Number(fila.ubicacion_lng) : null,
    })
  })

  return out.sort((a, b) => a.orden - b.orden)
}

export function lecturasToFilas(lecturas, tipoNivel) {
  // Cartera vacía: el panel de ingreso compacto captura la primera lectura (patrón Poligonal).
  if (!lecturas?.length) return []
  const sorted = [...lecturas].sort((a, b) => (a.orden || 0) - (b.orden || 0))
  const legacy = sorted.every((l) => (l.orden || 0) < 10)

  const assignLectura = (fila, l) => {
    fila.nombre_punto = l.nombre_punto || fila.nombre_punto
    fila.tipo_punto = l.tipo_punto === 'TP' ? 'estacion' : (l.tipo_punto || fila.tipo_punto)
    fila.abscisa = l.abscisa ?? fila.abscisa ?? ''
    fila.descripcion_punto = l.descripcion_punto ?? l.ubicacion ?? fila.descripcion_punto ?? ''
    if (l.ubicacion_pk_id != null) fila.ubicacion_pk_id = l.ubicacion_pk_id
    if (l.ubicacion_pk != null) fila.ubicacion_pk = l.ubicacion_pk
    if (l.ubicacion_tramo != null) fila.ubicacion_tramo = l.ubicacion_tramo
    if (l.ubicacion_costado != null) fila.ubicacion_costado = l.ubicacion_costado
    if (l.ubicacion_infraestructura != null) fila.ubicacion_infraestructura = l.ubicacion_infraestructura
    if (l.ubicacion_lat != null) fila.ubicacion_lat = l.ubicacion_lat
    if (l.ubicacion_lng != null) fila.ubicacion_lng = l.ubicacion_lng
    const tipo = (l.tipo_lectura || 'V+').replace('V−', 'V-')
    if (tipoNivel === 'electronico' && l.distancia_m != null) {
      if (tipo === 'V+') fila.dist_vplus_m = l.distancia_m
      else if (tipo === 'V-') fila.dist_vminus_m = l.distancia_m
    }
    const key = TIPO_KEYS[tipo] || 'vplus'
    if (tipoNivel === 'automatico') {
      fila[key] = {
        hS: l.hilo_superior ?? '',
        hM: l.hilo_medio ?? '',
        hI: l.hilo_inferior ?? '',
        lectura: '',
      }
    } else {
      fila[key] = { ...bloqueVacio(), lectura: l.lectura ?? '' }
    }
  }

  if (legacy) {
    return sorted.map((l, i) => {
      const fila = nuevaFilaPunto(i + 1, i === 0)
      assignLectura(fila, l)
      if (l.punto_biblioteca_id) {
        fila.punto_biblioteca_id = l.punto_biblioteca_id
        fila.es_fila_cierre = true
      } else if ((l.descripcion_punto || l.ubicacion || '').toLowerCase().includes('cierre')) {
        fila.es_fila_cierre = true
      }
      if (i > 0 && !fila.tipo_punto) fila.tipo_punto = l.tipo_punto === 'TP' ? 'estacion' : (l.tipo_punto || '')
      return fila
    })
  }

  const rowMap = new Map()
  for (const l of sorted) {
    const rowIdx = Math.floor(((l.orden || 1) - 1) / 10)
    if (!rowMap.has(rowIdx)) {
      rowMap.set(rowIdx, nuevaFilaPunto(rowIdx + 1, rowIdx === 0))
    }
    assignLectura(rowMap.get(rowIdx), l)
    if (l.punto_biblioteca_id) {
      const fila = rowMap.get(rowIdx)
      fila.punto_biblioteca_id = l.punto_biblioteca_id
      fila.es_fila_cierre = true
    } else if ((l.descripcion_punto || l.ubicacion || '').toLowerCase().includes('cierre')) {
      const fila = rowMap.get(rowIdx)
      fila.es_fila_cierre = true
    }
  }

  return [...rowMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, f]) => f)
}

export function calcularVistaNivelacion(filas, tipoNivel, cotasBiblioteca = {}, opts = {}) {
  const distMax = opts.distMax ?? 50
  let cotas = { ...cotasBiblioteca }
  let hi = null
  let distVplusTotal = 0
  let distVminusTotal = 0
  const avisos = []

  const filasVista = filas.map((fila, idx) => {
    const distVp = distanciaVplusFila(fila, tipoNivel)
    const distVm = distanciaVminusFila(fila, tipoNivel)
    if (distVp != null) {
      distVplusTotal += Math.abs(distVp)
      if (distVp > distMax) {
        avisos.push(`Fila ${idx + 1}: Dist (V+) ${distVp.toFixed(2)} m supera ${distMax} m.`)
      }
    }
    if (distVm != null) {
      distVminusTotal += Math.abs(distVm)
      if (distVm > distMax) {
        avisos.push(`Fila ${idx + 1}: Dist (V−) ${distVm.toFixed(2)} m supera ${distMax} m.`)
      }
    }

    const res = procesarFilaNivelacion(fila, hi, cotas, tipoNivel, idx, avisos)
    hi = res.hi
    cotas = res.cotas

    return {
      ...fila,
      distancia_vplus_calc: distVp,
      distancia_vminus_calc: distVm,
      altura_instrumento: res.rowHi,
      cota: res.rowCota,
    }
  })

  const distTotal = distVplusTotal + distVminusTotal

  return {
    filasVista,
    cotas,
    distancia_vplus_m: distVplusTotal,
    distancia_vminus_m: distVminusTotal,
    distancia_total_m: distTotal,
    avisos,
    lecturas: filasToLecturas(filas, tipoNivel),
  }
}

export function cotasDesdePuntos(puntos) {
  const m = {}
  ;(puntos || []).forEach((p) => {
    if (p.cota != null && p.nombre) m[p.nombre.trim()] = Number(p.cota)
  })
  return m
}

/** True si el punto está marcado verificado en biblioteca (acepta boolean / 1 / "true"). */
export function esPuntoVerificadoBiblioteca(p) {
  const v = p?.verificado
  return v === true || v === 1 || v === '1' || v === 'true' || v === 't' || v === 'True'
}

/**
 * Puntos de biblioteca aptos como BM de nivelación (misma fuente que Biblioteca).
 * Prioriza verificados con cota; si ninguno tiene cota, lista verificados para que el selector no quede vacío.
 */
export function puntosBmParaNivelacion(puntos) {
  const list = Array.isArray(puntos) ? puntos : []
  const verif = list.filter(esPuntoVerificadoBiblioteca)
  const conCota = verif.filter((p) => p.cota != null && p.cota !== '')
  const base = conCota.length ? conCota : verif
  return base
    .slice()
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }))
}

export function nombreBmDesdeId(puntos, bmId) {
  if (bmId == null || bmId === '') return ''
  const id = String(bmId)
  const p = (puntos || []).find((x) => String(x?.id) === id)
  return (p?.nombre || '').trim()
}

/** Ancho de celdas de hilos (doble del tamaño base). */
export const HILO_INPUT_WIDTH = 88

/**
 * ¿El borrador del panel de ingreso tiene al menos una lectura usable?
 */
export function borradorTieneLectura(borrador, tipoNivel) {
  if (!borrador) return false
  return ['vplus', 'vi', 'vminus'].some((k) => bloqueTieneLecturaCalculo(borrador[k], tipoNivel))
}

/**
 * Valida el borrador del panel compacto antes de «Agregar lectura».
 * No altera fórmulas de HI/cota; solo reglas de captura ya existentes.
 * @returns {{ ok: boolean, msg?: string, avisosHilos?: string[] }}
 */
export function validarBorradorParaAgregar(borrador, filas, tipoNivel, bmInicialNombre, opts = {}) {
  const apertura = Boolean(opts.modoApertura)
  const circuitoAbierto = Boolean(opts.circuitoAbierto)
  if (!circuitoAbierto) {
    return { ok: false, msg: 'Abra el circuito antes de agregar lecturas.' }
  }
  if (filasTieneCierre(filas)) {
    return { ok: false, msg: mensajeFilaCierreExistente(filas), esCierre: true }
  }
  const gate = puedeAgregarFila(filas, tipoNivel, bmInicialNombre, { modoApertura: apertura })
  if (!gate.ok) return { ok: false, msg: gate.msg, esCierre: gate.esCierre }

  if (!borradorTieneLectura(borrador, tipoNivel)) {
    return { ok: false, msg: 'Registre al menos una lectura (V+, Vi o V−) antes de agregar.' }
  }

  const idx = (filas || []).length
  const nombreEfectivo = idx === 0
    ? (bmInicialNombre || (borrador.nombre_punto || '').trim())
    : (borrador.nombre_punto || '').trim()
  const filaCheck = {
    ...borrador,
    nombre_punto: nombreEfectivo,
    tipo_punto: idx === 0 ? (borrador.tipo_punto || 'BM') : borrador.tipo_punto,
  }
  if (!metadatosFilaCompletos(filaCheck, idx, bmInicialNombre)) {
    return { ok: false, msg: 'Complete nombre, abscisa (PK), descripción y tipo antes de agregar.' }
  }
  if (abscisaInvalida(filaCheck)) {
    return { ok: false, msg: ABSCISA_NUMERICA_MSG }
  }

  const vplusGate = puedeRegistrarVplus(filaCheck, idx, tipoNivel)
  if (!apertura && !vplusGate.ok && filaTieneVplus(filaCheck, tipoNivel)) {
    return { ok: false, msg: vplusGate.msg }
  }

  const avisosHilos = []
  if (tipoNivel === 'automatico') {
    for (const [bk, label] of [['vplus', 'V+'], ['vi', 'Vi'], ['vminus', 'V−']]) {
      const diag = diagnosticoHilosIncongruentes(filaCheck[bk], tipoNivel)
      if (diag?.msg) avisosHilos.push(`${label}: ${diag.msg}`)
    }
  }

  return { ok: true, avisosHilos, fila: filaCheck }
}

/** Siguiente borrador vacío tras agregar (no BM si ya hay filas). */
export function prepararBorradorSiguiente(filasLength) {
  return nuevaFilaPunto(filasLength + 1, filasLength === 0)
}

/** Prefill del primer punto con BM inicial de biblioteca. */
export function prepararBorradorBmInicial(bmNombre) {
  return {
    ...nuevaFilaPunto(1, true),
    nombre_punto: (bmNombre || '').trim(),
    tipo_punto: 'BM',
    descripcion_punto: 'BM inicial',
  }
}
