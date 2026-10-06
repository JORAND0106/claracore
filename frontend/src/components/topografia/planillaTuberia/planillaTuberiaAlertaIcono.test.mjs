/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAlertaIcono.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  notifyPlanillaTuberiaAlerta,
  PLANILLA_TUBERIA_ALERTA_EVENT,
  planillaListaSinReporteVigente,
  etiquetaReportesAsociadosLista,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const appSrc = readFileSync(join(dir, '../../../App.jsx'), 'utf8')

describe('alerta del ícono de Topografía', () => {
  it('avisa al crear, asociar, crear reporte o eliminar', () => {
    const events = []
    const prev = globalThis.window
    globalThis.window = {
      dispatchEvent(ev) { events.push(ev) },
    }
    try {
      notifyPlanillaTuberiaAlerta(12)
    } finally {
      globalThis.window = prev
    }
    assert.equal(events.length, 1)
    assert.equal(events[0].type, PLANILLA_TUBERIA_ALERTA_EVENT)
    assert.equal(events[0].detail.contratoId, 12)
    assert.equal((formSrc.match(/notifyPlanillaTuberiaAlerta\(contratoId\)/g) || []).length, 4)
  })

  it('el ícono reutiliza el indicador del buzón y solo consulta con acceso', () => {
    assert.match(appSrc, /className="cc-buzon-badge"/)
    assert.match(appSrc, /planillas-tuberia\/alerta-sin-reporte/)
    assert.match(appSrc, /if \(!tienePermisoTopografia/)
    assert.match(appSrc, /key === 'topografia' \? alertaPlanillasSinReporte : 0/)
    assert.match(appSrc, /PLANILLA_TUBERIA_ALERTA_EVENT/)
  })

  it('la grilla resalta solo la planilla sin reporte vigente', () => {
    assert.equal(planillaListaSinReporteVigente({ reportes_sicoe: [] }), true)
    assert.equal(etiquetaReportesAsociadosLista({ reportes_sicoe: [] }), '—')
    assert.equal(
      planillaListaSinReporteVigente({
        reportes_sicoe: [{ reporte_id: 9, numero_reporte: 64 }],
      }),
      false,
    )
    assert.equal(
      etiquetaReportesAsociadosLista({
        reportes_sicoe: [{ reporte_id: 9, numero_reporte: 64 }],
      }),
      '#64',
    )
    assert.match(formSrc, /planillaListaSinReporteVigente/)
    assert.match(formSrc, /#fffbeb/)
    assert.match(formSrc, /Sin reporte vigente en SICOE Obra/)
  })
})
