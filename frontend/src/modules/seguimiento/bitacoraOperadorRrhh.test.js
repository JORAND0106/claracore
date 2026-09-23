/**
 * Guardado Diario: Operador valida contra RRHH, no contra asistencia del día.
 * Run: node --test src/modules/seguimiento/bitacoraOperadorRrhh.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HINT_OPERADOR_DESDE_RRHH,
  operadorEstaEnRrhh,
} from './personalAsistenciaHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')

describe('Bitácora Maquinaria — Operador vs RRHH', () => {
  it('editor valida con operadorEstaEnRrhh(rrhhCatalogo), no asistencia del día', () => {
    assert.match(editorSrc, /operadorEstaEnRrhh/)
    assert.match(editorSrc, /HINT_OPERADOR_DESDE_RRHH/)
    assert.match(editorSrc, /NombreRrhhAutocomplete/)
    assert.doesNotMatch(editorSrc, /operadorEstaEnAsistencia/)
    assert.doesNotMatch(editorSrc, /opcionesOperadorDesdeAsistencia/)
    assert.doesNotMatch(editorSrc, /Sin personal en asistencia/)
    assert.doesNotMatch(editorSrc, /no está en asistencia/)
  })

  it('permite guardar: operador en RRHH aunque NO esté en Personal en obra', () => {
    const catalogo = [
      { id: 10, nombres: 'Luis', apellidos: 'Mora', cargo_aspira: 'Operador' },
      { id: 11, nombres: 'Ana', apellidos: 'Perez', cargo_aspira: 'Ayudante' },
    ]
    const asistenciaDelDia = [
      // Solo Ana está nominada hoy; Luis no.
      { nombre: 'Ana Perez', rrhh_trabajador_id: 11, cargo: 'Ayudante' },
    ]
    const uso = {
      equipo_nombre: 'Retroexcavadora',
      operador: 'Luis Mora',
      operador_rrhh_id: 10,
      tramo: 'Tramo A',
    }
    // Criterio antiguo (asistencia) fallaría; el correcto (RRHH) pasa.
    assert.equal(
      asistenciaDelDia.some((r) => Number(r.rrhh_trabajador_id) === 10),
      false,
    )
    assert.equal(operadorEstaEnRrhh(uso, catalogo), true)
    assert.ok(HINT_OPERADOR_DESDE_RRHH.includes('RRHH'))

    // Réplica del gate de guardarDiario: filas con equipo + operadorEstaEnRrhh
    const usosConEquipo = [uso].filter((u) => String(u.equipo_nombre || '').trim())
    const bloqueados = usosConEquipo.filter((u) => !operadorEstaEnRrhh(u, catalogo))
    assert.equal(bloqueados.length, 0, 'guardarDiario no debe bloquear este operador')
  })

  it('bloquea solo si el operador no existe en RRHH', () => {
    const catalogo = [
      { id: 10, nombres: 'Luis', apellidos: 'Mora', cargo_aspira: 'Operador' },
    ]
    assert.equal(
      operadorEstaEnRrhh({ operador: 'Fantasma', operador_rrhh_id: 99 }, catalogo),
      false,
    )
    assert.equal(
      operadorEstaEnRrhh({ operador: 'Luis Mora', operador_rrhh_id: 10 }, catalogo),
      true,
    )
    assert.equal(
      operadorEstaEnRrhh({ operador: '', operador_rrhh_id: null }, catalogo),
      true,
    )
  })
})
