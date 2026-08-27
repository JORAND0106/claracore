/**
 * Regresión: pantalla en blanco al pulsar «Agregar lectura».
 *
 * Causa raíz: tras agregar una lectura con V+ (sin Vi/V−) —caso típico del BM—,
 * `carteraVplusSinVista` es true y el JSX renderiza `{MSG_VPLUS_SIN_VISTA}`.
 * En el merge al patrón Poligonal ese símbolo se dejó de importar → ReferenceError.
 *
 * node --test frontend/src/components/topografia/nivelacionAgregarLectura.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  carteraVplusSinVista,
  MSG_VPLUS_SIN_VISTA,
  prepararBorradorBmInicial,
  validarBorradorParaAgregar,
  diagnosticoHilosIncongruentes,
} from '../../utils/topografia_nivelacion.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')

describe('Agregar lectura — blank screen (MSG_VPLUS_SIN_VISTA)', () => {
  it('Form importa MSG_VPLUS_SIN_VISTA y lo usa en el aviso de cartera incompleta', () => {
    assert.match(
      formSrc,
      /import\s*\{[^}]*\bMSG_VPLUS_SIN_VISTA\b[^}]*\}\s*from\s*['"].*topografia_nivelacion['"]/s,
    )
    assert.match(formSrc, /carteraIncompleta[\s\S]*\{MSG_VPLUS_SIN_VISTA\}/)
  })

  it('tras Agregar lectura con solo V+ en BM, carteraIncompleta es true (dispara el aviso)', () => {
    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      vplus: { hS: '1.450', hM: '1.250', hI: '1.050', lectura: '' },
    }
    const gate = validarBorradorParaAgregar(borrador, [], 'automatico', 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(gate.ok, true, gate.msg)
    const filas = [{ ...gate.fila, orden: 1 }]
    assert.equal(
      carteraVplusSinVista(filas, 'automatico'),
      true,
      'V+ solo activa el branch que renderiza MSG_VPLUS_SIN_VISTA',
    )
    assert.equal(typeof MSG_VPLUS_SIN_VISTA, 'string')
    assert.match(MSG_VPLUS_SIN_VISTA, /V\+/)
  })

  it('hilos inconsistentes: validación agrega aviso sin bloquear el alta', () => {
    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      vplus: { hS: '1.500', hM: '1.250', hI: '1.050', lectura: '' },
    }
    const diag = diagnosticoHilosIncongruentes(borrador.vplus, 'automatico')
    assert.ok(diag?.msg)
    const gate = validarBorradorParaAgregar(borrador, [], 'automatico', 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(gate.ok, true, 'inconsistencia de hilos avisa, no bloquea')
    assert.ok(gate.avisosHilos?.length)
    assert.match(gate.avisosHilos[0], /Separación|incongruen|hilos|HS|HM|HI/i)
  })
})
