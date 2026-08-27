/** Helpers de asistencia de colaboradores (Reporte Diario). */

export const DOCUMENTO_TIPOS = ['CC', 'CE', 'TI', 'PA', 'NIT', 'OTRO']
export const ESTADOS_COLABORADOR = [
  { value: 'activo', label: 'Activo' },
  { value: 'incapacitado', label: 'Incapacitado' },
  { value: 'inactivo', label: 'Inactivo' },
]
export const HORA_SALIDA_DEFAULT = '16:30'

export function capitalizarNombrePropio(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ')
}

export function soloDigitosDocumento(raw) {
  return String(raw || '').replace(/\D+/g, '')
}

export function emptyAsistenciaRow(partial = {}) {
  return {
    colaborador_id: null,
    nombre: '',
    documento_tipo: 'CC',
    documento_numero: '',
    cargo: '',
    subcontratista_id: null,
    subcontratista_nombre: '',
    estado: 'activo',
    hora_ingreso: '',
    hora_salida: HORA_SALIDA_DEFAULT,
    observacion: '',
    origen: 'catalogo',
    ...partial,
  }
}

export function asistenciaFromEntrada(entradaOrList) {
  const list = Array.isArray(entradaOrList)
    ? entradaOrList
    : (entradaOrList && typeof entradaOrList === 'object'
      ? entradaOrList.asistencia_colaboradores
      : null)
  if (!Array.isArray(list)) return []
  return list.map((r) => emptyAsistenciaRow({
    colaborador_id: r?.colaborador_id ?? null,
    nombre: capitalizarNombrePropio(r?.nombre || ''),
    documento_tipo: String(r?.documento_tipo || 'CC').toUpperCase(),
    documento_numero: soloDigitosDocumento(r?.documento_numero),
    cargo: String(r?.cargo || '').trim(),
    subcontratista_id: r?.subcontratista_id ?? null,
    subcontratista_nombre: String(r?.subcontratista_nombre || '').trim(),
    estado: ['activo', 'incapacitado', 'inactivo'].includes(String(r?.estado || '').toLowerCase())
      ? String(r.estado).toLowerCase()
      : 'activo',
    hora_ingreso: String(r?.hora_ingreso || '').slice(0, 5),
    hora_salida: String(r?.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5) || HORA_SALIDA_DEFAULT,
    observacion: String(r?.observacion || r?.observaciones || '').trim(),
    origen: r?.origen || 'catalogo',
  })).filter((r) => r.nombre)
}

export function personalAgregadoDesdeAsistencia(rows) {
  const counts = new Map()
  for (const r of rows || []) {
    if (String(r?.estado || '').toLowerCase() !== 'activo') continue
    const cargo = String(r?.cargo || '').trim()
    if (!cargo) continue
    counts.set(cargo, (counts.get(cargo) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([cargo, cantidad]) => ({ cargo, cantidad }))
}

export function asistenciaParaPayload(rows) {
  return asistenciaFromEntrada(rows).map((r) => ({
    colaborador_id: r.colaborador_id,
    nombre: r.nombre,
    documento_tipo: r.documento_tipo,
    documento_numero: r.documento_numero,
    cargo: r.cargo,
    subcontratista_id: r.subcontratista_id,
    subcontratista_nombre: r.subcontratista_nombre,
    estado: r.estado,
    hora_ingreso: r.hora_ingreso || null,
    hora_salida: r.hora_salida || HORA_SALIDA_DEFAULT,
    observacion: r.observacion,
    origen: r.origen || 'catalogo',
  }))
}

export function labelEstadoColaborador(estado) {
  const found = ESTADOS_COLABORADOR.find((e) => e.value === String(estado || '').toLowerCase())
  return found?.label || 'Activo'
}

export function formatHorarioAsistencia(row) {
  const ini = String(row?.hora_ingreso || '').slice(0, 5)
  const fin = String(row?.hora_salida || '').slice(0, 5)
  if (ini && fin) return `${ini} – ${fin}`
  if (ini) return `Desde ${ini}`
  if (fin) return `Hasta ${fin}`
  return '—'
}
