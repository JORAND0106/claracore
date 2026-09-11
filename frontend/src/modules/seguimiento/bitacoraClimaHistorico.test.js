/**
 * Tests — selección de clima histórico Open-Meteo.
 * Run: node --test src/modules/seguimiento/bitacoraClimaHistorico.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { esFechaPasadaBitacora, pickHourlyClima } from './bitacoraClimaHelpers.js'

describe('clima histórico bitácora', () => {
  it('detecta fecha pasada vs hoy', () => {
    assert.equal(esFechaPasadaBitacora('2026-08-25', '2026-09-11'), true)
    assert.equal(esFechaPasadaBitacora('2026-09-11', '2026-09-11'), false)
    assert.equal(esFechaPasadaBitacora('2026-09-12', '2026-09-11'), false)
  })

  it('pickHourlyClima elige slot cercano a hora preferida', () => {
    const hourly = {
      time: [
        '2026-08-25T09:00',
        '2026-08-25T12:00',
        '2026-08-25T15:00',
      ],
      temperature_2m: [18, 22, 20],
      weather_code: [3, 0, 61],
    }
    const noon = pickHourlyClima(hourly, 12)
    assert.equal(noon.clima_temp_c, 22)
    assert.equal(noon.clima_codigo, 0)
    const morning = pickHourlyClima(hourly, 8)
    assert.equal(morning.clima_temp_c, 18)
    assert.equal(morning.clima_codigo, 3)
  })
})
