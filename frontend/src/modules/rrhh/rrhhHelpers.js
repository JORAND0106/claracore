export const EMPTY_TRABAJADOR_FORM = {
  nombres: '',
  apellidos: '',
  tipo_documento: 'CC',
  numero_documento: '',
  fecha_nacimiento: '',
  genero: '',
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
  subsidio_transporte: false,
  tipo_contrato: '',
  empresa_key: 'consorcio',
  empresa_tipo: 'consorcio',
  empresa_subcontratista_id: '',
  empresa_nombre: '',
  empresa_nit: '',
  estado: 'activo',
  notas: '',
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

export function nombreCompleto(t) {
  return `${t?.nombres || ''} ${t?.apellidos || ''}`.trim()
}

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
    salario: t.salario != null ? String(t.salario) : '',
    tipo_contrato: t.tipo_contrato || '',
    empresa_key: empresaKeyFromTrabajador(t),
    empresa_subcontratista_id: t.empresa_subcontratista_id != null
      ? String(t.empresa_subcontratista_id)
      : '',
    empresa_nit: t.empresa_nit || '',
    subsidio_transporte: Boolean(t.subsidio_transporte),
    fecha_nacimiento: (t.fecha_nacimiento || '').toString().slice(0, 10),
  }
}

export function payloadFromForm(form) {
  const raw = String(form.salario ?? '').trim()
  let salario = null
  if (raw !== '') {
    const normalized = raw.includes(',') && raw.includes('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/\./g, '')
    const n = Number(normalized)
    salario = Number.isFinite(n) ? n : null
  }
  const empresaKey = form.empresa_key
    || (form.empresa_tipo === 'subcontratista' && form.empresa_subcontratista_id
      ? `sub:${form.empresa_subcontratista_id}`
      : 'consorcio')
  return {
    nombres: form.nombres,
    apellidos: form.apellidos,
    tipo_documento: form.tipo_documento || 'CC',
    numero_documento: form.numero_documento,
    fecha_nacimiento: form.fecha_nacimiento || null,
    genero: form.genero || null,
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
    subsidio_transporte: Boolean(form.subsidio_transporte),
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
