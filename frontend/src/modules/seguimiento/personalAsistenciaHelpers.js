/** Helpers de asistencia de colaboradores (Reporte Diario). */

export const DOCUMENTO_TIPOS = ['CC', 'CE', 'TI', 'PA', 'NIT', 'OTRO']
export const ESTADOS_COLABORADOR = [
  { value: 'activo', label: 'Activo' },
  { value: 'incapacitado', label: 'Incapacitado' },
  { value: 'inactivo', label: 'Inactivo' },
]
export const HORA_SALIDA_DEFAULT = '16:30'

/** Solo Activo aporta al resumen por cargo; Inactivo e Incapacitado = sin jornada. */
export const ESTADOS_SIN_JORNADA = new Set(['inactivo', 'incapacitado'])

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

/** Normaliza a YYYY-MM-DD o ''. */
export function parseFechaISO(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function estadoSinJornada(estado) {
  return ESTADOS_SIN_JORNADA.has(String(estado || '').toLowerCase())
}

export function estadoPermiteFechaRetiro(estado) {
  return String(estado || '').toLowerCase() === 'inactivo'
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
    fecha_ingreso: '',
    fecha_retiro: '',
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
  return list.map((r) => {
    const estado = ['activo', 'incapacitado', 'inactivo'].includes(String(r?.estado || '').toLowerCase())
      ? String(r.estado).toLowerCase()
      : 'activo'
    const sinJornada = estadoSinJornada(estado)
    return emptyAsistenciaRow({
      colaborador_id: r?.colaborador_id ?? null,
      nombre: capitalizarNombrePropio(r?.nombre || ''),
      documento_tipo: String(r?.documento_tipo || 'CC').toUpperCase(),
      documento_numero: soloDigitosDocumento(r?.documento_numero),
      cargo: String(r?.cargo || '').trim(),
      subcontratista_id: r?.subcontratista_id ?? null,
      subcontratista_nombre: String(r?.subcontratista_nombre || '').trim(),
      estado,
      hora_ingreso: sinJornada ? '' : String(r?.hora_ingreso || '').slice(0, 5),
      hora_salida: sinJornada
        ? ''
        : (String(r?.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5) || HORA_SALIDA_DEFAULT),
      fecha_ingreso: parseFechaISO(r?.fecha_ingreso),
      fecha_retiro: parseFechaISO(r?.fecha_retiro),
      observacion: String(r?.observacion || r?.observaciones || '').trim(),
      origen: r?.origen || 'catalogo',
    })
  }).filter((r) => r.nombre)
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
  return asistenciaFromEntrada(rows).map((r) => {
    const sinJornada = estadoSinJornada(r.estado)
    return {
      colaborador_id: r.colaborador_id,
      nombre: r.nombre,
      documento_tipo: r.documento_tipo,
      documento_numero: r.documento_numero,
      cargo: r.cargo,
      subcontratista_id: r.subcontratista_id,
      subcontratista_nombre: r.subcontratista_nombre,
      estado: r.estado,
      hora_ingreso: sinJornada ? null : (r.hora_ingreso || null),
      hora_salida: sinJornada ? null : (r.hora_salida || HORA_SALIDA_DEFAULT),
      fecha_ingreso: r.fecha_ingreso || null,
      fecha_retiro: r.fecha_retiro || null,
      observacion: r.observacion,
      origen: r.origen || 'catalogo',
    }
  })
}

export function labelEstadoColaborador(estado) {
  const found = ESTADOS_COLABORADOR.find((e) => e.value === String(estado || '').toLowerCase())
  return found?.label || 'Activo'
}

export function formatHorarioAsistencia(row) {
  if (estadoSinJornada(row?.estado)) {
    return labelEstadoColaborador(row?.estado)
  }
  const ini = String(row?.hora_ingreso || '').slice(0, 5)
  const fin = String(row?.hora_salida || '').slice(0, 5)
  if (ini && fin) return `${ini} – ${fin}`
  if (ini) return `Desde ${ini}`
  if (fin) return `Hasta ${fin}`
  return '—'
}
