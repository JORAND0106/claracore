/**
 * Tests del mapeo calendario Seguimiento.
 * Ejecutar: node frontend/src/modules/seguimiento/seguimientoCalendarioUtils.test.mjs
 */
import {
  actaToEvent,
  bandejaItemToEvent,
  buildCalendarioEvents,
  dayHasVencidos,
  filterEventsByOrigen,
  formatDayCountLabel,
  isEventoVencido,
  resolveFetchRange,
  summarizeDayCounts,
  toDateOnly,
  CALENDARIO_KIND,
} from './seguimientoCalendarioUtils.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(toDateOnly('2026-08-15T12:00:00Z') === '2026-08-15', 'toDateOnly string')
assert(toDateOnly(new Date(2026, 7, 15)) === '2026-08-15', 'toDateOnly Date local')

const range = resolveFetchRange(new Date(2026, 7, 1), new Date(2026, 8, 1), '', '')
assert(range.fecha_desde === '2026-08-01', 'visible desde')
assert(range.fecha_hasta === '2026-08-31', 'visible hasta exclusivo → inclusivo')

const clipped = resolveFetchRange(
  new Date(2026, 7, 1),
  new Date(2026, 8, 1),
  '2026-08-10',
  '2026-08-20',
)
assert(clipped.fecha_desde === '2026-08-10' && clipped.fecha_hasta === '2026-08-20', 'intersect filtros')

const empty = resolveFetchRange(
  new Date(2026, 7, 1),
  new Date(2026, 8, 1),
  '2026-09-01',
  '2026-09-10',
)
assert(empty === null, 'sin solape → null')

const tarea = bandejaItemToEvent({
  id: 10,
  origen: 'tarea',
  titulo: 'Revisar planos',
  consecutivo: 3,
  campos_libres: {
    checklist: [
      { id: 'a', fecha: '2026-08-20', hora: '09:30' },
      { id: 'b', fecha: '2026-08-18' },
    ],
  },
})
assert(tarea.id === 'tarea-10', 'id tarea')
assert(tarea.start === '2026-08-18', 'vencimiento checklist más próximo')
assert(tarea.allDay === true, 'sin hora → allDay')
assert(tarea.backgroundColor === CALENDARIO_KIND.tarea.color, 'color tarea')
assert(tarea.title.startsWith('✅'), 'icono tarea')

const compromiso = bandejaItemToEvent({
  id: 22,
  origen: 'compromiso',
  titulo: 'Entregar informe',
  fecha_vencimiento: '2026-08-25',
  hora_vencimiento: '14:00',
})
assert(compromiso.id === 'compromiso-22', 'id compromiso')
assert(compromiso.start === '2026-08-25T14:00:00', 'start con hora')
assert(compromiso.allDay === false, 'con hora → timed')
assert(compromiso.backgroundColor === CALENDARIO_KIND.compromiso.color, 'color compromiso')
assert(compromiso.title.startsWith('📋'), 'icono compromiso')

assert(bandejaItemToEvent({ id: 1, origen: 'tarea', titulo: 'Sin fecha' }) === null, 'sin fecha → null')

const acta = actaToEvent({
  id: 5,
  consecutivo: 12,
  fecha_reunion: '2026-08-12',
  ubicacion: 'Sala A',
})
assert(acta.id === 'acta-5', 'id acta')
assert(acta.start === '2026-08-12', 'fecha reunión')
assert(acta.backgroundColor === CALENDARIO_KIND.acta.color, 'color acta')
assert(acta.title.includes('Acta Nº 12'), 'número acta')
assert(acta.title.startsWith('📝'), 'icono acta')

const events = buildCalendarioEvents(
  [
    { id: 1, origen: 'tarea', titulo: 'T', fecha_vencimiento: '2026-08-01' },
    { id: 2, origen: 'compromiso', titulo: 'C', fecha_vencimiento: '2026-08-02' },
  ],
  [{ id: 9, consecutivo: 1, fecha_reunion: '2026-08-03' }],
)
assert(events.length === 3, 'build une tipos')
assert(filterEventsByOrigen(events, 'acta').length === 1, 'filtro origen acta')
assert(filterEventsByOrigen(events, 'tarea').length === 1, 'filtro origen tarea')
assert(filterEventsByOrigen(events, '').length === 3, 'sin filtro → todos')

const daySum = summarizeDayCounts([
  { start: '2026-08-10', extendedProps: { kind: 'tarea' } },
  { start: '2026-08-10T09:00:00', extendedProps: { kind: 'tarea' } },
  { start: '2026-08-10', extendedProps: { kind: 'acta' } },
  { start: '2026-08-11', extendedProps: { kind: 'compromiso' } },
], '2026-08-10')
assert(daySum.tareas === 2 && daySum.actas === 1 && daySum.total === 3, 'conteo día')
assert(daySum.label === '2 tareas · 1 acta', 'label día')
assert(formatDayCountLabel({ compromisos: 1 }) === '1 compromiso', 'label singular')

const hoy = new Date(2026, 7, 20) // 20-ago-2026 local
const evVenc = {
  start: '2026-08-10',
  extendedProps: { kind: 'tarea', raw: { estado_gestion: 'abierto' } },
}
const evOk = {
  start: '2026-08-10',
  extendedProps: { kind: 'tarea', raw: { estado_gestion: 'cumplido' } },
}
const evActa = {
  start: '2026-08-10',
  extendedProps: { kind: 'acta', raw: {} },
}
assert(isEventoVencido(evVenc, hoy) === true, 'tarea pasada abierta → vencida')
assert(isEventoVencido(evOk, hoy) === false, 'cumplida no vence')
assert(isEventoVencido(evActa, hoy) === false, 'acta no marca vencido')
assert(dayHasVencidos([evVenc, evActa], '2026-08-10', hoy) === true, 'día con vencidos')
assert(dayHasVencidos([evOk], '2026-08-10', hoy) === false, 'día sin vencidos')

console.log('seguimientoCalendarioUtils.test.mjs OK')
