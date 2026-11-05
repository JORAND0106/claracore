import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarActividad,
  construirTarjetasEquipo,
  filtrarTarjetas,
  agruparPorDepartamento,
  rangoSemanaActual,
  resolverPeriodo,
  sumarIndicadores,
  tooltipCarga,
} from './planActividadesEquipo.js'

describe('planActividadesEquipo', () => {
  const hoy = new Date(2026, 10, 5) // jueves 5 nov 2026

  it('rangoSemanaActual es lunes–domingo', () => {
    const r = rangoSemanaActual(hoy)
    assert.equal(r.desde, '2026-11-02')
    assert.equal(r.hasta, '2026-11-08')
  })

  it('resolverPeriodo mes y rango', () => {
    const m = resolverPeriodo({ modo: 'mes', hoy })
    assert.equal(m.desde, '2026-11-01')
    assert.equal(m.hasta, '2026-11-30')
    const r = resolverPeriodo({ modo: 'rango', desde: '2026-11-10', hasta: '2026-11-01', hoy })
    assert.equal(r.desde, '2026-11-01')
    assert.equal(r.hasta, '2026-11-10')
  })

  it('clasificarActividad cubos mutuamente excluyentes', () => {
    assert.equal(clasificarActividad({ estado_gestion: 'cumplido', fecha_fin: '2026-11-01' }, hoy), 'cumplidas')
    assert.equal(clasificarActividad({ estado_gestion: 'vencido', fecha_fin: '2026-12-01' }, hoy), 'vencidas')
    assert.equal(clasificarActividad({ estado_gestion: 'abierto', fecha_fin: '2026-10-01' }, hoy), 'vencidas')
    assert.equal(clasificarActividad({ estado_gestion: 'abierto', fecha_fin: '2026-11-07' }, hoy), 'porVencer')
    assert.equal(clasificarActividad({ estado_gestion: 'abierto', fecha_fin: '2026-11-20' }, hoy), 'abiertas')
    assert.equal(clasificarActividad({ estado_gestion: 'cancelado' }, hoy), null)
  })

  it('vencidas fuera de período sí cuentan; abiertas fuera no', () => {
    const periodo = { desde: '2026-11-02', hasta: '2026-11-08' }
    const usuarios = [
      { id: 1, nombre: 'Ana', apellidos: 'Pérez', cargo_nombre: 'Residente' },
      { id: 2, nombre: 'Luis', apellidos: 'Gómez', cargo_nombre: 'Auxiliar' },
    ]
    const actividades = [
      {
        id: 10,
        titulo: 'Vencida antigua',
        estado_gestion: 'abierto',
        fecha_inicio: '2026-09-01',
        fecha_fin: '2026-09-05',
        grupo_nombre: 'Obra',
        asignaciones: [{ usuario_id: 1 }],
        ocurrencias: [{ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-05' }],
      },
      {
        id: 11,
        titulo: 'Abierta semana',
        estado_gestion: 'abierto',
        fecha_inicio: '2026-11-03',
        fecha_fin: '2026-11-20',
        grupo_nombre: 'Calidad',
        asignaciones: [{ usuario_id: 1 }],
        ocurrencias: [{ fecha_inicio: '2026-11-03', fecha_fin: '2026-11-20' }],
      },
      {
        id: 12,
        titulo: 'Abierta fuera',
        estado_gestion: 'abierto',
        fecha_inicio: '2026-12-01',
        fecha_fin: '2026-12-10',
        grupo_nombre: 'Obra',
        asignaciones: [{ usuario_id: 2 }],
        ocurrencias: [{ fecha_inicio: '2026-12-01', fecha_fin: '2026-12-10' }],
      },
      {
        id: 13,
        titulo: 'Cumplida semana',
        estado_gestion: 'cumplido',
        fecha_inicio: '2026-11-04',
        fecha_fin: '2026-11-05',
        grupo_nombre: 'Calidad',
        asignaciones: [{ usuario_id: 1 }],
        ocurrencias: [{ fecha_inicio: '2026-11-04', fecha_fin: '2026-11-05' }],
      },
    ]
    const cards = construirTarjetasEquipo({ actividades, usuarios, periodo, hoy })
    assert.equal(cards.length, 1)
    assert.equal(cards[0].id, 1)
    assert.equal(cards[0].counts.vencidas, 1)
    assert.equal(cards[0].counts.abiertas, 1)
    assert.equal(cards[0].counts.cumplidas, 1)
    assert.equal(cards[0].departamento, 'Calidad')
    const sum = sumarIndicadores(cards)
    assert.equal(sum.vencidas, 1)
    assert.equal(sum.abiertas, 1)
  })

  it('filtra por indicador y agrupa por departamento', () => {
    const cards = [
      {
        id: 1,
        nombre: 'A',
        departamento: 'Obra',
        counts: { abiertas: 0, porVencer: 0, vencidas: 2, cumplidas: 0 },
      },
      {
        id: 2,
        nombre: 'B',
        departamento: 'Calidad',
        counts: { abiertas: 1, porVencer: 0, vencidas: 0, cumplidas: 0 },
      },
      {
        id: 3,
        nombre: 'C',
        departamento: 'Obra',
        counts: { abiertas: 0, porVencer: 0, vencidas: 5, cumplidas: 0 },
      },
    ]
    const f = filtrarTarjetas(cards, 'vencidas')
    assert.equal(f.length, 2)
    const groups = agruparPorDepartamento(f)
    assert.equal(groups.length, 1)
    assert.equal(groups[0][0], 'Obra')
    assert.equal(groups[0][1][0].id, 3)
  })

  it('tooltipCarga menciona solapes', () => {
    const tip = tooltipCarga({
      loadPct: 40,
      maxSimultaneas: 2,
      tieneSolape: true,
      pares: [{ a: 'Uno', b: 'Dos' }],
    })
    assert.match(tip, /Solapes/)
    assert.match(tip, /Uno/)
  })
})
