/**
 * Smoke test: niveles de vencimiento proporcionales.
 * Ejecutar: node frontend/src/modules/seguimiento/vencimientoLevels.test.mjs
 */
import {
  calcularNivelVencimiento,
  sortByProximidadVencimiento,
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

console.log('vencimientoLevels.test.mjs OK')
