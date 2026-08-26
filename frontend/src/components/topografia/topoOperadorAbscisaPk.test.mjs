/**
 * Operador filtrado + abscisa por PK en Circuito de Nivelación.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  abscisaInvalida,
  faltantesMetadatosFila,
  filasToLecturas,
  nuevaFilaPunto,
} from '../../utils/topografia_nivelacion.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Operador / Abscisa PK', () => {
  it('NivelacionForm usa select de operadores y modal PK', () => {
    const src = readFileSync(join(dir, 'NivelacionForm.jsx'), 'utf8')
    assert.match(src, /BitacoraMaterialUbicacionModal/)
    assert.match(src, /setPkMapIdx/)
    assert.match(src, /Solo usuarios con cargo de topografía/)
    assert.doesNotMatch(src, /list="topo-operadores-niv"/)
  })

  it('fila con ubicacion_pk_id no es abscisa inválida', () => {
    const f = { ...nuevaFilaPunto(1), ubicacion_pk_id: 'pk-1', ubicacion_pk: '525254', abscisa: '525254' }
    assert.equal(abscisaInvalida(f), false)
    const meta = faltantesMetadatosFila(f, 1, null)
    assert.equal(meta.abscisa, false)
  })

  it('filasToLecturas propaga campos de ubicación PK', () => {
    const fila = {
      ...nuevaFilaPunto(1, true),
      nombre_punto: 'P1',
      tipo_punto: 'BM',
      descripcion_punto: 'Inicio',
      ubicacion_pk_id: 'uuid-1',
      ubicacion_pk: '525254',
      ubicacion_tramo: 'T1',
      ubicacion_costado: 'Derecho',
      ubicacion_infraestructura: 'Calzada',
      ubicacion_lat: 4.7,
      ubicacion_lng: -74.0,
      abscisa: '525254',
      vplus: { lectura: '1.234' },
    }
    const lect = filasToLecturas([fila], 'electronico')
    assert.ok(lect.length >= 1)
    assert.equal(lect[0].ubicacion_pk_id, 'uuid-1')
    assert.equal(lect[0].ubicacion_pk, '525254')
    assert.equal(lect[0].ubicacion_lat, 4.7)
  })
})
