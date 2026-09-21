import { capitalizarNombrePropio } from '../seguimiento/personalAsistenciaHelpers.js'

export const EMPTY_TRABAJADOR_FORM = {
  nombres: '',
  apellidos: '',
  tipo_documento: 'CC',
  numero_documento: '',
  lugar_expedicion: '',
  fecha_nacimiento: '',
  genero: '',
  tipo_sangre: '',
  direccion: '',
  ciudad: '',
  telefono: '',
  email: '',
  emergencia_nombre: '',
  emergencia_parentesco: '',
  emergencia_telefono: '',
  eps: '',
  pension: '',
  cesantias: '',
  arl: '',
  caja_compensacion: '',
  cargo_aspira: '',
  salario: '',
  salario_liquidable: true,
  subsidio_transporte: false,
  periodicidad: 'mensual',
  arl_nivel_riesgo: 'I',
  fecha_ingreso: '',
  fecha_retiro: '',
  banco_entidad: '',
  banco_tipo_cuenta: '',
  banco_numero_cuenta: '',
  _cert_bancaria_file: null,
  _cert_bancaria_nombre: '',
  tipo_contrato: '',
  dedicacion: 'tiempo_completo',
  requiere_renovacion: false,
  periodicidad_renovacion_meses: '',
  contrato_requiere_renovacion: false,
  contrato_periodicidad_renovacion: '',
  periodo_prueba_dias: '',
  empresa_key: 'consorcio',
  empresa_tipo: 'consorcio',
  empresa_subcontratista_id: '',
  empresa_nombre: '',
  empresa_nit: '',
  estado: 'activo',
  notas: '',
  foto_preview_url: '',
  firma_data_url: '',
  _foto_file: null,
  _foto_clear: false,
  _firma_changed: false,
}

export const TIPOS_SANGRE = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export const PARENTESCO_DEFAULTS = [
  'Padre',
  'Madre',
  'Cónyuge',
  'Compañero(a) permanente',
  'Hij@',
  'Herman@',
  'Abuel@',
  'Ti@',
  'Prim@',
  'Suegr@',
  'Amig@',
  'Otro',
]

export const CAMPOS_OBLIGATORIOS_TRABAJADOR = [
  { key: 'nombres', label: 'Nombres' },
  { key: 'apellidos', label: 'Apellidos' },
  { key: 'tipo_documento', label: 'Tipo de documento' },
  { key: 'numero_documento', label: 'Número de documento' },
  { key: 'empresa_key', label: 'Empresa' },
]

/** Entero seguro para payloads (evita NaN que rompe validación Pydantic). */
export function safeIntOrNull(raw) {
  if (raw === '' || raw == null) return null
  if (typeof raw === 'number' && !Number.isFinite(raw)) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

/** Normaliza texto para comparar tipo de contrato (sin tildes / mayúsculas). */
export function normTipoContrato(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function esPrestacionServicios(tipoContrato) {
  const n = normTipoContrato(tipoContrato)
  return n.includes('prestacion de servicios') || n === 'prestacion de servicios'
}

export function esDedicacionParcial(dedicacion) {
  const d = normTipoContrato(dedicacion).replace(/_/g, ' ')
  return d === 'parcial' || d.includes('medio tiempo') || d.includes('tiempo parcial')
}

/**
 * ¿Aplica el piso SMMLV?
 * Excepción: Prestación de servicios con dedicación inferior a tiempo completo.
 */
export function aplicaSalarioMinimo({ tipo_contrato, dedicacion } = {}) {
  if (esPrestacionServicios(tipo_contrato) && esDedicacionParcial(dedicacion)) {
    return false
  }
  return true
}

/**
 * @param {object} form
 * @param {{ smmlv?: number|null, validarSalario?: boolean }} [opts]
 */
export function validateTrabajadorForm(form, opts = {}) {
  const faltantes = []
  for (const c of CAMPOS_OBLIGATORIOS_TRABAJADOR) {
    const v = form?.[c.key]
    if (v == null || String(v).trim() === '') faltantes.push(c.label)
  }
  const doc = String(form?.numero_documento || '').trim()
  if (doc && !/^\d+$/.test(doc)) {
    faltantes.push('Número de documento (solo dígitos)')
  }

  let mensajeSalario = ''
  if (opts.validarSalario !== false) {
    const salario = parseSalarioInput(form?.salario)
    const smmlv = opts.smmlv != null ? Number(opts.smmlv) : null
    if (
      salario != null
      && Number.isFinite(smmlv)
      && smmlv > 0
      && aplicaSalarioMinimo(form)
      && salario < smmlv
    ) {
      mensajeSalario = `El salario no puede ser inferior al salario mínimo legal vigente ($${Math.round(smmlv).toLocaleString('es-CO')}).`
    }
  }

  const mensaje = faltantes.length
    ? `Complete los campos obligatorios: ${faltantes.join(', ')}.`
    : mensajeSalario

  return {
    ok: faltantes.length === 0 && !mensajeSalario,
    faltantes,
    mensaje,
  }
}

export const DOC_TIPOS_SOPORTE = [
  { tipo: 'cedula', label: 'Cédula / Documento de identidad' },
  { tipo: 'hoja_vida', label: 'Hoja de vida' },
  { tipo: 'certificados', label: 'Certificados' },
  { tipo: 'otro', label: 'Otro' },
]

export const DOC_TIPOS_INGRESO = [
  { tipo: 'induccion', label: 'Constancia de inducción' },
  { tipo: 'reglamento', label: 'Entrega de reglamentos' },
  { tipo: 'examen_medico', label: 'Examen médico de ingreso' },
  { tipo: 'otro', label: 'Otro' },
]

/** Slug estable alineado con backend.slug_tipo_documento */
export function slugTipoDocumento(label) {
  const s = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `ext_${(s || 'documento').slice(0, 72)}`
}

export const DOC_TIPOS_BANCARIO = [
  { tipo: 'certificacion_bancaria', label: 'Certificación bancaria' },
]

export const DOC_TIPOS_AFILIACION = [
  { tipo: 'cert_eps', label: 'Certificación EPS' },
  { tipo: 'cert_pension', label: 'Certificación Pensión / AFP' },
  { tipo: 'cert_arl', label: 'Certificación ARL' },
  { tipo: 'cert_cesantias', label: 'Certificación Cesantías' },
  { tipo: 'cert_caja', label: 'Certificación Caja de Compensación' },
]

/** Mapeo certificación → campo/catálogo de entidad en rrhh_trabajadores */
export const AFILIACION_ENTIDAD_BY_TIPO = {
  cert_eps: { field: 'eps', catalogKey: 'eps', label: 'EPS' },
  cert_pension: { field: 'pension', catalogKey: 'pension', label: 'Pensión' },
  cert_arl: { field: 'arl', catalogKey: 'arl', label: 'ARL' },
  cert_cesantias: { field: 'cesantias', catalogKey: 'cesantias', label: 'Cesantías' },
  cert_caja: { field: 'caja_compensacion', catalogKey: 'caja_compensacion', label: 'Caja compensación' },
}

/**
 * Checklist: tipos base + tipos extendidos del catálogo + «Otro» al final.
 * @param {'soporte'|'ingreso'|'bancario'|'afiliacion'} categoria
 * @param {string[]} customLabels
 */
export function buildDocChecklist(categoria, customLabels = []) {
  if (categoria === 'bancario') return [...DOC_TIPOS_BANCARIO]
  if (categoria === 'afiliacion') return [...DOC_TIPOS_AFILIACION]
  const base = (categoria === 'ingreso' ? DOC_TIPOS_INGRESO : DOC_TIPOS_SOPORTE)
    .filter((t) => t.tipo !== 'otro')
  const seen = new Set(base.map((t) => t.tipo))
  const custom = []
  for (const raw of customLabels || []) {
    const label = String(raw || '').trim()
    if (!label) continue
    const tipo = slugTipoDocumento(label)
    if (seen.has(tipo)) continue
    seen.add(tipo)
    custom.push({ tipo, label, custom: true })
  }
  return [...base, ...custom, { tipo: 'otro', label: 'Otro' }]
}

export function nombreCompleto(t) {
  return `${t?.nombres || ''} ${t?.apellidos || ''}`.trim()
}

export function capitalizarOracion(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export { capitalizarNombrePropio }

export function fmtSalario(val) {
  if (val == null || val === '') return '—'
  const n = Number(val)
  if (Number.isNaN(n)) return String(val)
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

/** Formatea dígitos a $ 1.234.567 mientras se digita. */
export function formatSalarioInput(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return `$ ${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

export function parseSalarioInput(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

export function empresaKeyFromTrabajador(t) {
  if (!t) return 'consorcio'
  if (t.empresa_tipo === 'subcontratista' && t.empresa_subcontratista_id != null) {
    return `sub:${t.empresa_subcontratista_id}`
  }
  return 'consorcio'
}

export function formFromTrabajador(t) {
  if (!t) return { ...EMPTY_TRABAJADOR_FORM }
  return {
    ...EMPTY_TRABAJADOR_FORM,
    nombres: t.nombres || '',
    apellidos: t.apellidos || '',
    tipo_documento: t.tipo_documento || 'CC',
    numero_documento: t.numero_documento || '',
    lugar_expedicion: t.lugar_expedicion || '',
    fecha_nacimiento: (t.fecha_nacimiento || '').toString().slice(0, 10),
    genero: t.genero || '',
    tipo_sangre: t.tipo_sangre || '',
    direccion: t.direccion || '',
    ciudad: t.ciudad || '',
    telefono: t.telefono || '',
    email: t.email || '',
    emergencia_nombre: t.emergencia_nombre || '',
    emergencia_parentesco: t.emergencia_parentesco || '',
    emergencia_telefono: t.emergencia_telefono || '',
    eps: t.eps || '',
    pension: t.pension || '',
    cesantias: t.cesantias || '',
    arl: t.arl || '',
    caja_compensacion: t.caja_compensacion || '',
    cargo_aspira: t.cargo_aspira || '',
    salario: t.salario != null && Number.isFinite(Number(t.salario))
      ? formatSalarioInput(String(Math.round(Number(t.salario))))
      : '',
    salario_liquidable: t.salario_liquidable !== false,
    subsidio_transporte: Boolean(t.subsidio_transporte),
    periodicidad: t.periodicidad || 'mensual',
    arl_nivel_riesgo: t.arl_nivel_riesgo || 'I',
    fecha_ingreso: (t.fecha_ingreso || '').toString().slice(0, 10),
    fecha_retiro: (t.fecha_retiro || '').toString().slice(0, 10),
    banco_entidad: t.banco_entidad || '',
    banco_tipo_cuenta: t.banco_tipo_cuenta || '',
    banco_numero_cuenta: t.banco_numero_cuenta || '',
    _cert_bancaria_file: null,
    _cert_bancaria_nombre: '',
    tipo_contrato: t.tipo_contrato || '',
    dedicacion: t.dedicacion || 'tiempo_completo',
    contrato_requiere_renovacion: Boolean(
      t.contrato_requiere_renovacion ?? t.requiere_renovacion,
    ),
    contrato_periodicidad_renovacion: t.contrato_periodicidad_renovacion
      || (t.periodicidad_renovacion_meses
        ? ({ 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 6: 'semestral', 12: 'anual' }[Number(t.periodicidad_renovacion_meses)] || '')
        : ''),
    // aliases legacy (compat formularios antiguos)
    requiere_renovacion: Boolean(t.contrato_requiere_renovacion ?? t.requiere_renovacion),
    periodicidad_renovacion_meses: t.periodicidad_renovacion_meses || '',
    periodo_prueba_dias: t.periodo_prueba_dias != null && t.periodo_prueba_dias !== ''
      ? String(t.periodo_prueba_dias)
      : '',
    empresa_key: empresaKeyFromTrabajador(t),
    empresa_subcontratista_id: t.empresa_subcontratista_id != null
      ? String(t.empresa_subcontratista_id)
      : '',
    empresa_tipo: t.empresa_tipo || (t.empresa_subcontratista_id != null ? 'subcontratista' : 'consorcio'),
    empresa_nombre: t.empresa_nombre || '',
    empresa_nit: t.empresa_nit || '',
    estado: t.estado || 'activo',
    notas: t.notas || '',
    foto_preview_url: '',
    firma_data_url: '',
    _foto_file: null,
    _foto_clear: false,
    _firma_changed: false,
  }
}

export function payloadFromForm(form) {
  const salario = parseSalarioInput(form.salario)
  const empresaKey = form.empresa_key
    || (form.empresa_tipo === 'subcontratista' && form.empresa_subcontratista_id
      ? `sub:${form.empresa_subcontratista_id}`
      : 'consorcio')
  return {
    nombres: form.nombres,
    apellidos: form.apellidos,
    tipo_documento: form.tipo_documento || 'CC',
    numero_documento: form.numero_documento,
    lugar_expedicion: form.lugar_expedicion || null,
    fecha_nacimiento: form.fecha_nacimiento || null,
    genero: form.genero || null,
    tipo_sangre: form.tipo_sangre || null,
    direccion: form.direccion || null,
    ciudad: form.ciudad || null,
    telefono: form.telefono || null,
    email: form.email || null,
    emergencia_nombre: form.emergencia_nombre || null,
    emergencia_parentesco: form.emergencia_parentesco || null,
    emergencia_telefono: form.emergencia_telefono || null,
    eps: form.eps || null,
    pension: form.pension || null,
    cesantias: form.cesantias || null,
    arl: form.arl || null,
    caja_compensacion: form.caja_compensacion || null,
    cargo_aspira: form.cargo_aspira || null,
    salario,
    salario_liquidable: form.salario_liquidable !== false,
    subsidio_transporte: Boolean(form.subsidio_transporte),
    periodicidad: form.periodicidad || 'mensual',
    arl_nivel_riesgo: form.arl_nivel_riesgo || 'I',
    fecha_ingreso: form.fecha_ingreso || null,
    fecha_retiro: form.fecha_retiro || null,
    banco_entidad: form.banco_entidad || null,
    banco_tipo_cuenta: form.banco_tipo_cuenta || null,
    banco_numero_cuenta: form.banco_numero_cuenta || null,
    tipo_contrato: form.tipo_contrato || null,
    dedicacion: (() => {
      const d = String(form.dedicacion || 'tiempo_completo').trim().toLowerCase()
      if (d === 'parcial' || d === 'tiempo_parcial') return 'parcial'
      return 'tiempo_completo'
    })(),
    contrato_requiere_renovacion: Boolean(
      form.contrato_requiere_renovacion ?? form.requiere_renovacion,
    ),
    contrato_periodicidad_renovacion: (() => {
      const requiere = Boolean(form.contrato_requiere_renovacion ?? form.requiere_renovacion)
      if (!requiere) return null
      const per = form.contrato_periodicidad_renovacion
        || ({ 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 6: 'semestral', 12: 'anual' }[
          Number(form.periodicidad_renovacion_meses)
        ] || null)
      return per || null
    })(),
    periodo_prueba_dias: (() => {
      const n = safeIntOrNull(form.periodo_prueba_dias)
      if (n == null) return null
      if (n < 1 || n > 365) return null
      return n
    })(),
    empresa_key: empresaKey,
    empresa_tipo: form.empresa_tipo || (empresaKey.startsWith('sub:') ? 'subcontratista' : 'consorcio'),
    empresa_subcontratista_id: (() => {
      if (!empresaKey.startsWith('sub:')) return null
      const n = Number(empresaKey.slice(4))
      return Number.isFinite(n) ? n : null
    })(),
    estado: form.estado || 'activo',
    notas: form.notas || null,
  }
}

export function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return null
  const mime = m[1]
  const bin = atob(m[2])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
