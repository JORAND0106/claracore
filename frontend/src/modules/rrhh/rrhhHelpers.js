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
  tipo_contrato: '',
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

export function validateTrabajadorForm(form) {
  const faltantes = []
  for (const c of CAMPOS_OBLIGATORIOS_TRABAJADOR) {
    const v = form?.[c.key]
    if (v == null || String(v).trim() === '') faltantes.push(c.label)
  }
  const doc = String(form?.numero_documento || '').trim()
  if (doc && !/^\d+$/.test(doc)) {
    faltantes.push('Número de documento (solo dígitos)')
  }
  return {
    ok: faltantes.length === 0,
    faltantes,
    mensaje: faltantes.length
      ? `Complete los campos obligatorios: ${faltantes.join(', ')}.`
      : '',
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
    ...t,
    salario: t.salario != null ? formatSalarioInput(String(Math.round(Number(t.salario)))) : '',
    salario_liquidable: t.salario_liquidable !== false,
    tipo_contrato: t.tipo_contrato || '',
    tipo_sangre: t.tipo_sangre || '',
    lugar_expedicion: t.lugar_expedicion || '',
    periodicidad: t.periodicidad || 'mensual',
    arl_nivel_riesgo: t.arl_nivel_riesgo || 'I',
    fecha_ingreso: (t.fecha_ingreso || '').toString().slice(0, 10),
    fecha_retiro: (t.fecha_retiro || '').toString().slice(0, 10),
    banco_entidad: t.banco_entidad || '',
    banco_tipo_cuenta: t.banco_tipo_cuenta || '',
    banco_numero_cuenta: t.banco_numero_cuenta || '',
    empresa_key: empresaKeyFromTrabajador(t),
    empresa_subcontratista_id: t.empresa_subcontratista_id != null
      ? String(t.empresa_subcontratista_id)
      : '',
    empresa_nit: t.empresa_nit || '',
    subsidio_transporte: Boolean(t.subsidio_transporte),
    fecha_nacimiento: (t.fecha_nacimiento || '').toString().slice(0, 10),
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
    empresa_key: empresaKey,
    empresa_tipo: form.empresa_tipo || (empresaKey.startsWith('sub:') ? 'subcontratista' : 'consorcio'),
    empresa_subcontratista_id: empresaKey.startsWith('sub:')
      ? Number(empresaKey.slice(4))
      : null,
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
