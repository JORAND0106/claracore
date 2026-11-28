/**
 * Líneas de plantilla en el wizard de nuevo reporte:
 * - No tocadas → no se suben (silencioso).
 * - Tocadas / diligenciadas → deben ir completas.
 * Lo precargado por la plantilla (nombre) no cuenta como diligenciado.
 */

function _empty(v) {
  return v === '' || v === null || v === undefined
}

function _trimStr(v) {
  return String(v ?? '').trim()
}

function _tieneNumero(v) {
  if (_empty(v)) return false
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n)
}

function _tieneFoto(reg) {
  if (reg?._fotoOk) return true
  if (reg?.foto_url) return true
  const hist = Array.isArray(reg?.fotos_historial) ? reg.fotos_historial : []
  return hist.some((f) => f?.url)
}

function _tieneGrafico(reg) {
  if (reg?._grafOk) return true
  if (reg?.grafico_url) return true
  const hist = Array.isArray(reg?.graficos_historial) ? reg.graficos_historial : []
  return hist.some((g) => g?.url)
}

/** Marca de origen al aplicar plantilla. */
export function sicoeRegistroDesdeItemPlantilla(item, extras = {}) {
  const nombre = _trimStr(item?.nombre)
  return {
    nombre,
    descripcion: '',
    longitud: '',
    ancho: '',
    espesor: '',
    cantidad: '',
    cantidad_total: null,
    unidad: '',
    observacion: '',
    foto_url: null,
    foto_numero: null,
    foto_descripcion: '',
    fotos_historial: [],
    grafico_url: null,
    grafico_numero: null,
    grafico_descripcion: '',
    _fotoOk: false,
    _grafOk: false,
    _origenPlantilla: true,
    _plantillaNombre: nombre,
    ...extras,
  }
}

/**
 * El usuario diligenció la línea si cambió algo respecto a lo precargado
 * (el nombre de plantilla solo no cuenta).
 */
export function sicoeLineaPlantillaFueDiligenciada(reg) {
  if (!reg) return false
  const baseline = _trimStr(reg._plantillaNombre ?? '')
  if (_trimStr(reg.nombre) && _trimStr(reg.nombre) !== baseline) return true
  if (_trimStr(reg.descripcion)) return true
  if (_trimStr(reg.observacion)) return true
  if (_trimStr(reg.unidad) || _trimStr(reg.unidadOtro)) return true
  if (_tieneNumero(reg.longitud)) return true
  if (_tieneNumero(reg.ancho)) return true
  if (_tieneNumero(reg.espesor)) return true
  if (_tieneNumero(reg.cantidad)) return true
  if (_tieneNumero(reg.cantidad_total)) return true
  if (reg.es_varilla === true || reg.es_varilla === false) return true
  if (_trimStr(reg.diametro_varilla)) return true
  if (_tieneNumero(reg.peso_kg_m)) return true
  if (_tieneFoto(reg)) return true
  if (_tieneGrafico(reg)) return true
  if (reg.cuadro_aceros_id != null) return true
  return false
}

/** Línea de plantilla sin tocar (candidata a descartar al guardar). */
export function sicoeLineaPlantillaSinTocar(reg) {
  if (!reg?._origenPlantilla) return false
  if (reg.id != null) return false
  return !sicoeLineaPlantillaFueDiligenciada(reg)
}

/**
 * Validación de registro completo (mismas reglas del modal «Guardar Registro»).
 * @returns {{ ok: true } | { ok: false, motivo: string }}
 */
export function sicoeValidarRegistroWizardCompleto(reg, { unidadEsKg, validarDiametro } = {}) {
  const unidadFinal = reg?.unidad === 'Otro' ? reg?.unidadOtro : reg?.unidad
  if (!unidadFinal || !_trimStr(unidadFinal)) {
    return { ok: false, motivo: 'falta la unidad' }
  }
  const esKg = typeof unidadEsKg === 'function' ? unidadEsKg(unidadFinal) : false
  if (esKg && reg.es_varilla == null) {
    return { ok: false, motivo: 'indique si es Varilla o No es varilla' }
  }
  if (reg.es_varilla === true) {
    if (typeof validarDiametro === 'function') {
      const chk = validarDiametro(reg.diametro_varilla)
      if (!chk?.ok) return { ok: false, motivo: chk?.error || 'diámetro de varilla inválido' }
    } else if (!_trimStr(reg.diametro_varilla)) {
      return { ok: false, motivo: 'falta el diámetro de varilla' }
    }
    if (!_tieneNumero(reg.longitud) && !_tieneNumero(reg.cantidad)) {
      return { ok: false, motivo: 'falta longitud y/o cantidad (varilla)' }
    }
  } else if (
    !_tieneNumero(reg.longitud)
    && !_tieneNumero(reg.ancho)
    && !_tieneNumero(reg.espesor)
    && !_tieneNumero(reg.cantidad)
  ) {
    return { ok: false, motivo: 'faltan dimensiones (Longitud, Ancho, Espesor o Cantidad)' }
  }
  if (!_trimStr(reg.observacion)) {
    return { ok: false, motivo: 'falta la observación' }
  }
  if (!_tieneFoto(reg)) {
    return { ok: false, motivo: 'falta la foto de obra' }
  }
  return { ok: true }
}

/**
 * Prepara el listado a subir: descarta plantilla sin tocar; valida tocadas.
 * Líneas manuales (sin _origenPlantilla) se conservan sin esta validación extra.
 *
 * @returns {{
 *   ok: true, registros: array, descartadas: number
 * } | {
 *   ok: false, codigo: 'sin_registros'|'incompleto', mensaje: string, indice?: number
 * }}
 */
export function sicoePrepararRegistrosWizardDesdePlantilla(regs, opts = {}) {
  const list = Array.isArray(regs) ? regs : []
  const aSubir = []
  let descartadas = 0

  for (let i = 0; i < list.length; i += 1) {
    const reg = list[i]
    if (sicoeLineaPlantillaSinTocar(reg)) {
      descartadas += 1
      continue
    }
    if (reg?._origenPlantilla && !reg.id) {
      const v = sicoeValidarRegistroWizardCompleto(reg, opts)
      if (!v.ok) {
        const label = _trimStr(reg.nombre) || `#${i + 1}`
        return {
          ok: false,
          codigo: 'incompleto',
          mensaje: `Complete el registro «${label}»: ${v.motivo}.`,
          indice: i,
          motivo: v.motivo,
        }
      }
    }
    aSubir.push(reg)
  }

  if (aSubir.length === 0) {
    return {
      ok: false,
      codigo: 'sin_registros',
      mensaje: 'Debe diligenciar al menos un registro para enviar el reporte.',
      descartadas,
    }
  }

  return { ok: true, registros: aSubir, descartadas }
}
