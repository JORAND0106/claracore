/**
 * Tests del mapeo calendario Seguimiento.
 * Ejecutar: node frontend/src/modules/seguimiento/seguimientoCalendarioUtils.test.mjs
 */
import {
  actaToEvent,
  bandejaItemToEvent,
  bitacoraToEvent,
  buildCalendarioEvents,
  dayHasVencidos,
  filterEventsByOrigen,
  eventDisplayTime,
  eventDisplayTitle,
  formatDayCountLabel,
  formatDayCountLabelShort,
  isEventoVencido,
  resolveFetchRange,
  sortDayEvents,
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

const diario = bitacoraToEvent({
  id: 40,
  tipo: 'diario',
  fecha: '2026-08-14',
  hora_inicio_labores: '07:00',
  created_by_nombre: 'Ana Pérez',
})
assert(diario.id === 'bitacora-40', 'id bitácora diario')
assert(diario.start === '2026-08-14T07:00:00', 'start diario con hora')
assert(diario.extendedProps.kind === 'bitacora_diario', 'kind diario')
assert(diario.backgroundColor === CALENDARIO_KIND.bitacora_diario.color, 'color diario')
assert(diario.title.includes('Ana Pérez'), 'elaborador en título diario')
assert(diario.extendedProps.elaborador === 'Ana Pérez', 'elaborador prop')

const eventoBit = bitacoraToEvent({
  id: 41,
  tipo: 'evento',
  fecha: '2026-08-14',
  evento_tipo: 'visita_terceros',
  created_by_nombre: 'Luis Gómez',
})
assert(eventoBit.extendedProps.kind === 'bitacora_evento', 'kind evento')
assert(eventoBit.backgroundColor === CALENDARIO_KIND.bitacora_evento.color, 'color evento')
assert(eventoBit.backgroundColor !== CALENDARIO_KIND.bitacora_diario.color, 'colores bitácora distintos')
assert(eventoBit.title.includes('Luis Gómez'), 'elaborador en título evento')

assert(CALENDARIO_KIND.bitacora_diario.tooltip, 'tooltip diario')
assert(CALENDARIO_KIND.bitacora_evento.tooltip, 'tooltip evento')

const events = buildCalendarioEvents(
  [
    { id: 1, origen: 'tarea', titulo: 'T', fecha_vencimiento: '2026-08-01' },
    { id: 2, origen: 'compromiso', titulo: 'C', fecha_vencimiento: '2026-08-02' },
  ],
  [{ id: 9, consecutivo: 1, fecha_reunion: '2026-08-03' }],
  [{ id: 7, tipo: 'diario', fecha: '2026-08-04', created_by_nombre: 'X' }],
)
assert(events.length === 4, 'build une bandeja+actas+bitácora')
assert(filterEventsByOrigen(events, 'acta').length === 1, 'filtro origen acta')
assert(filterEventsByOrigen(events, 'tarea').length === 1, 'filtro origen tarea')
assert(filterEventsByOrigen(events, 'bitacora_diario').length === 1, 'filtro bitácora diario')
assert(filterEventsByOrigen(events, '').length === 4, 'sin filtro → todos')

const daySum = summarizeDayCounts([
  { start: '2026-08-10', extendedProps: { kind: 'tarea' } },
  { start: '2026-08-10T09:00:00', extendedProps: { kind: 'tarea' } },
  { start: '2026-08-10', extendedProps: { kind: 'acta' } },
  { start: '2026-08-10', extendedProps: { kind: 'bitacora_diario' } },
  { start: '2026-08-11', extendedProps: { kind: 'compromiso' } },
], '2026-08-10')
assert(daySum.tareas === 2 && daySum.actas === 1 && daySum.diarios === 1 && daySum.total === 4, 'conteo día')
assert(daySum.label === '2 tareas · 1 acta · 1 diario', 'label día')
assert(formatDayCountLabel({ compromisos: 1 }) === '1 compromiso', 'label singular')
assert(formatDayCountLabelShort({ tareas: 2, actas: 1, diarios: 1 }) === '2T · 1A · 1D', 'label corto widget')

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

const sorted = sortDayEvents([
  { id: 'a', title: '📝 Acta', start: '2026-08-10', extendedProps: { kind: 'acta' } },
  { id: 'b', title: '✅ Tarde', start: '2026-08-10T15:00:00', extendedProps: { kind: 'tarea' } },
  { id: 'c', title: '✅ Mañana', start: '2026-08-10T09:00:00', extendedProps: { kind: 'tarea' } },
  { id: 'd', title: '📋 Comp', start: '2026-08-10', extendedProps: { kind: 'compromiso' } },
  { id: 'e', title: '✅ Sin hora', start: '2026-08-10', extendedProps: { kind: 'tarea' } },
  { id: 'f', title: '📒 Diario', start: '2026-08-10', extendedProps: { kind: 'bitacora_diario' } },
])
assert(sorted.map((x) => x.id).join(',') === 'c,b,e,d,a,f', 'orden tipo→hora→sin hora')
assert(eventDisplayTitle({ title: '✅ Revisar planos' }) === 'Revisar planos', 'título sin icono')
assert(eventDisplayTime({ start: '2026-08-10T09:30:00' }) === '09:30', 'hora timed')
assert(eventDisplayTime({ start: '2026-08-10' }) === null, 'sin hora → null')

import { filterEventsSoloMias } from './seguimientoCalendarioUtils.js'
const solo = filterEventsSoloMias([
  { id: '1', extendedProps: { kind: 'tarea', raw: { created_by: 9 } } },
  { id: '2', extendedProps: { kind: 'bitacora_diario', raw: { created_by: 5 } } },
  { id: '3', extendedProps: { kind: 'bitacora_evento', raw: { created_by: 9 } } },
], 5)
assert(solo.map((x) => x.id).join(',') === '1,2', 'solo_mias filtra bitácora ajena; bandeja ya filtrada en API')

console.log('seguimientoCalendarioUtils.test.mjs OK')
