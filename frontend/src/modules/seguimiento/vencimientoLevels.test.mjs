/**
 * Smoke test: niveles de vencimiento proporcionales.
 * Ejecutar: node frontend/src/modules/seguimiento/vencimientoLevels.test.mjs
 */
import {
  calcularNivelVencimiento,
  fechaVencimientoEfectiva,
  nivelVencimientoItem,
  origenRemitenteLabel,
  sortByProximidadVencimiento,
  tipoLaborLabel,
  truncateTema,
} from './vencimientoLevels.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// Plazo estándar ≥5 días: al crear (5 días restantes) = nivel 1
assert(
  calcularNivelVencimiento({
    fechaVencimiento: '2026-08-10',
    fechaCreacion: '2026-08-05',
    hoy: new Date(2026, 7, 5),
  }) === 1,
  'span 5 → start nivel 1',
)

// Día del vencimiento = 5
assert(
  calcularNivelVencimiento({
    fechaVencimiento: '2026-08-10',
    fechaCreacion: '2026-08-05',
    hoy: new Date(2026, 7, 10),
  }) === 5,
  'día de vencimiento → 5',
)

// Plazo de 2 días: al crear inicia cerca de crítico (nivel 4)
assert(
  calcularNivelVencimiento({
    fechaVencimiento: '2026-08-07',
    fechaCreacion: '2026-08-05',
    hoy: new Date(2026, 7, 5),
  }) === 4,
  'span 2 → start nivel 4',
)

// Vencido → 5
assert(
  calcularNivelVencimiento({
    fechaVencimiento: '2026-08-01',
    fechaCreacion: '2026-07-20',
    hoy: new Date(2026, 7, 5),
  }) === 5,
  'vencido → 5',
)

const sorted = sortByProximidadVencimiento([
  { id: 1, fecha_vencimiento: '2026-08-20' },
  { id: 2, fecha_vencimiento: '2026-08-05', hora_vencimiento: '09:00' },
  { id: 3, fecha_vencimiento: '2026-08-05', hora_vencimiento: '18:00' },
])
assert(sorted[0].id === 2 && sorted[1].id === 3 && sorted[2].id === 1, 'orden por proximidad')

// Tarea: vencimiento efectivo = checklist más próxima
const due = fechaVencimientoEfectiva({
  origen: 'tarea',
  fecha_vencimiento: '2026-09-01',
  campos_libres: {
    checklist: [
      { texto: 'A', fecha: '2026-08-20', hora: '18:00' },
      { texto: 'B', fecha: '2026-08-12', hora: '09:00' },
      { texto: 'C', fecha: null },
    ],
  },
})
assert(due.fecha === '2026-08-12' && due.hora === '09:00', 'checklist más próxima')

const nivelCk = nivelVencimientoItem({
  origen: 'tarea',
  created_at: '2026-08-05',
  campos_libres: { checklist: [{ fecha: '2026-08-10' }] },
}, new Date(2026, 7, 10))
assert(nivelCk === 5, 'nivel desde checklist en día de vencimiento')

// Delegación: etiquetas en bandeja / widget
const delegada = {
  origen: 'tarea',
  relacion_destinatario: 'asignacion',
  created_by: 10,
  asignado_a_id: 20,
  created_by_nombre: 'Ana Pérez',
}
assert(tipoLaborLabel(delegada, 20) === 'Delegada a mí', 'tipo labor delegada')
assert(origenRemitenteLabel(delegada, 20) === 'Delegó: Ana Pérez', 'remitente delegó')
assert(tipoLaborLabel(delegada, 10) === 'Asignada a otro', 'tipo labor delegante')

const refRecv = {
  origen: 'tarea',
  relacion_destinatario: 'referencia',
  created_by: 10,
  asignado_a_id: 10,
  referido_a_id: 20,
  created_by_nombre: 'Ana Pérez',
}
assert(origenRemitenteLabel(refRecv, 20) === 'Referencia de: Ana Pérez', 'remitente referencia')

const multi = {
  origen: 'tarea',
  relacion_destinatario: 'asignacion',
  created_by: 10,
  asignado_a_id: 20,
  created_by_nombre: 'Ana Pérez',
  campos_libres: {
    asignaciones: [
      { usuario_id: 20, nombre: 'Luis', estado_gestion: 'abierto' },
      { usuario_id: 30, nombre: 'María', estado_gestion: 'abierto' },
    ],
  },
}
assert(tipoLaborLabel(multi, 30) === 'Delegada a mí (compartida)', 'multi asignado')
assert(tipoLaborLabel(multi, 10) === 'Delegada a 2', 'multi delegante')
assert(origenRemitenteLabel(multi, 30) === 'Delegó: Ana Pérez', 'multi remitente')

// Compromisos de acta: sin «Asignada por mí»
const compActa = {
  origen: 'compromiso',
  asignado_a_id: 20,
  solicitante_id: 10,
  created_by: 10,
  acta_id: 5,
}
assert(tipoLaborLabel(compActa, 20) === 'Debo entregar', 'compromiso asignado')
assert(tipoLaborLabel(compActa, 10) === '—', 'compromiso elaborador sin Asignada por mí')

const tema = truncateTema('Entregar planos actualizados del tramo norte para revisión del comité')
assert(tema.endsWith('…'), 'tema truncado con ellipsis')
assert(tema.length < 60, 'tema breve')
assert(truncateTema('Corto') === 'Corto', 'tema corto intacto')

console.log('vencimientoLevels.test.mjs OK')
