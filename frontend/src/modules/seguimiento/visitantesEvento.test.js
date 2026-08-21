/**
 * Node tests for asistentes (plataforma + catálogo).
 * Run: node --test src/modules/seguimiento/visitantesEvento.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyVisitanteRow,
  mergeAsistentesSearch,
  visitantesFromDetalle,
} from './visitantesEventoHelpers.js'

describe('visitantesFromDetalle', () => {
  it('usa visitantes_lista estructurada con usuario_id', () => {
    const rows = visitantesFromDetalle({
      visitantes_lista: [
        { visitante_id: 1, nombre: 'Ana Pérez', cargo: 'Auditora' },
        { usuario_id: 9, nombre: 'Luis Gómez', cargo: 'Residente', origen: 'plataforma' },
        { nombre: '  ', cargo: 'x' },
      ],
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].nombre, 'Ana Pérez')
    assert.equal(rows[0].cargo, 'Auditora')
    assert.equal(rows[0].visitante_id, 1)
    assert.equal(rows[1].usuario_id, 9)
    assert.equal(rows[1].origen, 'plataforma')
  })

  it('parsea texto legacy con cargos entre paréntesis', () => {
    const rows = visitantesFromDetalle({
      visitantes: 'Ana Pérez (Auditora), Luis Gómez',
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].nombre, 'Ana Pérez')
    assert.equal(rows[0].cargo, 'Auditora')
    assert.equal(rows[1].nombre, 'Luis Gómez')
    assert.equal(rows[1].cargo, '')
  })

  it('devuelve fila vacía si no hay datos', () => {
    const rows = visitantesFromDetalle({})
    assert.deepEqual(rows, [emptyVisitanteRow()])
  })
})

describe('mergeAsistentesSearch', () => {
  const usuarios = [
    { id: 1, nombre: 'Ana', apellidos: 'Pérez', cargo_nombre: 'Residente', activo: true, es_externo: false },
    { id: 2, nombre: 'Luis', apellidos: 'Gómez', cargo_nombre: 'Ingeniero', activo: true, es_externo: false },
    { id: -5, nombre: 'Externo Acta', cargo_nombre: 'Visitante', es_externo: true, activo: true },
  ]
  const catalogo = [
    { id: 10, nombre: 'Ana Pérez', cargo: 'Viejo cargo catálogo' },
    { id: 11, nombre: 'María López', cargo: 'Auditora' },
  ]

  it('prioriza usuarios plataforma y deduplica por nombre', () => {
    const rows = mergeAsistentesSearch(usuarios, catalogo, '')
    const ana = rows.filter((r) => r.nombre.toLowerCase() === 'ana pérez')
    assert.equal(ana.length, 1)
    assert.equal(ana[0].origen, 'plataforma')
    assert.equal(ana[0].cargo, 'Residente')
    assert.ok(rows.some((r) => r.nombre === 'María López' && r.origen === 'catalogo'))
    assert.ok(!rows.some((r) => r.es_externo || r.nombre === 'Externo Acta'))
  })

  it('filtra por needle en nombre/cargo', () => {
    const rows = mergeAsistentesSearch(usuarios, catalogo, 'audito')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].nombre, 'María López')
  })

  it('lista plataforma antes que catálogo', () => {
    const rows = mergeAsistentesSearch(usuarios, catalogo, 'a')
    const idxPlat = rows.findIndex((r) => r.origen === 'plataforma')
    const idxCat = rows.findIndex((r) => r.origen === 'catalogo')
    assert.ok(idxPlat >= 0 && idxCat > idxPlat)
  })
})
