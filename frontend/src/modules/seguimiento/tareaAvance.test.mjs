/**
 * Smoke test avance de tareas.
 * Ejecutar: node frontend/src/modules/seguimiento/tareaAvance.test.mjs
 */
import { calcularAvanceTarea } from './tareaAvance.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const a = calcularAvanceTarea([
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'abierto' },
])
assert(a.pct === 80 && a.estadoTarea === 'parcial', '4/5 = 80% parcial')

const b = calcularAvanceTarea([
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cumplido' },
  { estado_gestion: 'cancelado' },
])
assert(b.pct === 100 && b.validos === 4 && b.estadoTarea === 'cumplido', 'cancelado excluido → 100%')

const c = calcularAvanceTarea([])
assert(c.pct == null && c.estadoTarea === 'abierto', 'sin sub-ítems')

console.log('tareaAvance.test.mjs OK')
