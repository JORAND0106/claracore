import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pascuaOccidental,
  trasladarAlLunes,
  festivosColombiaAnio,
  festivoEnFecha,
  marcaCalendarioFecha,
  toIsoDate,
  isDomingoIso,
} from './festivosColombia.js'

function byNombre(anio) {
  const map = new Map()
  for (const f of festivosColombiaAnio(anio)) {
    for (const part of f.nombre.split(' / ')) {
      map.set(part.trim(), f.iso)
    }
  }
  return map
}

describe('pascuaOccidental', () => {
  it('coincide con años conocidos', () => {
    assert.deepEqual(pascuaOccidental(2024), { y: 2024, m: 3, d: 31 })
    assert.deepEqual(pascuaOccidental(2025), { y: 2025, m: 4, d: 20 })
    assert.deepEqual(pascuaOccidental(2026), { y: 2026, m: 4, d: 5 })
  })
})

describe('trasladarAlLunes (Ley Emiliani)', () => {
  it('deja el lunes igual', () => {
    assert.equal(trasladarAlLunes('2025-01-06'), '2025-01-06') // Reyes ya lunes
  })
  it('mueve miércoles al lunes siguiente', () => {
    // San José 19 mar 2025 = miércoles → 24 mar
    assert.equal(trasladarAlLunes('2025-03-19'), '2025-03-24')
  })
  it('mueve domingo al lunes siguiente', () => {
    assert.equal(trasladarAlLunes('2025-06-29'), '2025-06-30')
  })
})

describe('festivos Colombia 2024', () => {
  it('fijos, Emiliani y Semana Santa', () => {
    const m = byNombre(2024)
    assert.equal(m.get('Año Nuevo'), '2024-01-01')
    assert.equal(m.get('Día de los Reyes Magos'), '2024-01-08') // 6=sáb → lun 8
    assert.equal(m.get('Día de San José'), '2024-03-25') // 19=mar → lun 25
    assert.equal(m.get('Jueves Santo'), '2024-03-28')
    assert.equal(m.get('Viernes Santo'), '2024-03-29')
    assert.equal(m.get('Día del Trabajo'), '2024-05-01')
    assert.equal(m.get('Ascensión del Señor'), '2024-05-13') // +39=9 may jue → 13
    assert.equal(m.get('Corpus Christi'), '2024-06-03')
    assert.equal(m.get('Sagrado Corazón de Jesús'), '2024-06-10')
    assert.equal(m.get('San Pedro y San Pablo'), '2024-07-01') // 29 jun sáb → 1 jul
    assert.equal(m.get('Independencia de Colombia'), '2024-07-20')
    assert.equal(m.get('Batalla de Boyacá'), '2024-08-07')
    assert.equal(m.get('Asunción de la Virgen'), '2024-08-19') // 15=jue → 19
    assert.equal(m.get('Día de la Raza'), '2024-10-14') // 12=sáb → 14
    assert.equal(m.get('Todos los Santos'), '2024-11-04') // 1=vie → 4
    assert.equal(m.get('Independencia de Cartagena'), '2024-11-11') // 11=lun
    assert.equal(m.get('Inmaculada Concepción'), '2024-12-08')
    assert.equal(m.get('Navidad'), '2024-12-25')
  })
})

describe('festivos Colombia 2025', () => {
  it('incluye traslado y Semana Santa', () => {
    const m = byNombre(2025)
    assert.equal(m.get('Día de los Reyes Magos'), '2025-01-06') // lunes
    assert.equal(m.get('Día de San José'), '2025-03-24')
    assert.equal(m.get('Jueves Santo'), '2025-04-17')
    assert.equal(m.get('Viernes Santo'), '2025-04-18')
    assert.equal(m.get('Ascensión del Señor'), '2025-06-02')
    assert.equal(m.get('Corpus Christi'), '2025-06-23')
    assert.equal(m.get('Sagrado Corazón de Jesús'), '2025-06-30')
    assert.equal(m.get('San Pedro y San Pablo'), '2025-06-30') // coinciden
    assert.equal(m.get('Día de la Raza'), '2025-10-13') // 12=dom → lun 13
    assert.equal(m.get('Independencia de Cartagena'), '2025-11-17') // 11=mar → 17
  })
})

describe('festivos Colombia 2026 (año actual del entorno)', () => {
  it('Semana Santa y Emiliani', () => {
    const m = byNombre(2026)
    assert.equal(m.get('Jueves Santo'), '2026-04-02')
    assert.equal(m.get('Viernes Santo'), '2026-04-03')
    assert.equal(m.get('Día de San José'), '2026-03-23') // 19=jue → 23
    assert.equal(m.get('Ascensión del Señor'), '2026-05-18') // +39=14 may jue → 18
    assert.equal(m.get('Día de la Raza'), '2026-10-12') // 12=lun
    assert.equal(festivoEnFecha('2026-10-12')?.nombre, 'Día de la Raza')
  })
})

describe('marcaCalendarioFecha', () => {
  it('festivo tiene prioridad sobre domingo', () => {
    // 12 oct 2025 es domingo y se traslada a lunes 13; el 12 no es festivo laboral
    // Navidad 2022 fue domingo y sigue siendo festivo
    assert.equal(toIsoDate(2022, 12, 25), '2022-12-25')
    assert.equal(isDomingoIso('2022-12-25'), true)
    const m = marcaCalendarioFecha('2022-12-25')
    assert.equal(m?.tipo, 'festivo')
    assert.match(m.tooltip, /^Festivo:/)
    assert.match(m.label, /Navidad/)
  })

  it('domingo sin festivo', () => {
    const m = marcaCalendarioFecha('2026-11-22') // domingo
    assert.equal(isDomingoIso('2026-11-22'), true)
    assert.equal(m?.tipo, 'domingo')
    assert.equal(m?.tooltip, 'Domingo')
  })

  it('día laboral sin marca', () => {
    assert.equal(marcaCalendarioFecha('2026-11-24'), null) // martes
  })
})
