import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { alertaErrorGuardarReporte, mensajeErrorGuardarReporte } from './sicoeGuardarReporteError.js'

describe('mensajeErrorGuardarReporte', () => {
  it('traduce PGRST204 coords_geojson a español accionable', () => {
    const raw =
      "APIError: {'message': \"Could not find the 'coords_geojson' column of 'so_registros' in the schema cache\", 'code': 'PGRST204', 'hint': None, 'details': None}"
    const msg = mensajeErrorGuardarReporte(raw)
    assert.match(msg, /coordenadas opcionales|desajuste temporal/i)
    assert.doesNotMatch(msg, /APIError|PGRST204|Could not find|schema cache/i)
  })

  it('traduce Failed to fetch a mensaje de red en español', () => {
    const msg = mensajeErrorGuardarReporte('Failed to fetch')
    assert.match(msg, /conexión|red|Wi/i)
    assert.doesNotMatch(msg, /Failed to fetch/i)
  })

  it('conserva detail español del backend', () => {
    const msg = mensajeErrorGuardarReporte('Debe tener al menos un registro')
    assert.equal(msg, 'Debe tener al menos un registro')
  })
})

describe('alertaErrorGuardarReporte', () => {
  it('incluye aviso de borrador a salvo', () => {
    const alert = alertaErrorGuardarReporte(
      "APIError: {'message': \"Could not find the 'coords_geojson' column of 'so_registros' in the schema cache\", 'code': 'PGRST204'}",
      { borradorId: 37045 },
    )
    assert.match(alert, /Error guardando reporte:/)
    assert.match(alert, /borrador del reporte permanece/)
    assert.match(alert, /37045/)
    assert.doesNotMatch(alert, /APIError|PGRST204|Could not find/i)
  })
})
