/**
 * Contrato: ClaraGIS usa los mismos params de filtro que la grilla SicoeObra
 * y el backend aplica Acta RPO a nivel de registro (línea).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sicoeBuildMapaCalorSearchParams } from './sicoeMapaCalorParams.js'

const dir = dirname(fileURLToPath(import.meta.url))
const backendMain = readFileSync(join(dir, '../../../../backend/main.py'), 'utf8')

describe('ClaraGIS filtros sync con SicoeObra', () => {
  it('mapa_calor ya no usa scope de cabecera para Acta RPO', () => {
    assert.match(backendMain, /def _sicoe_analisis_aplicar_filtro_actas/)
    assert.match(backendMain, /return _sicoe_registros_q_filtrar_actas_linea\(q, acta_rpo_ids\)/)
    // No debe quedar el branch mapa_calor → scope cabecera.
    const fn = backendMain.slice(
      backendMain.indexOf('def _sicoe_analisis_aplicar_filtro_actas'),
      backendMain.indexOf('def _normalize_items_filtro_list'),
    )
    assert.equal(fn.includes('_sicoe_registros_q_filtrar_actas_scope'), false)
  })

  it('build params replica Acta + capítulo + ítem combinados', () => {
    const params = sicoeBuildMapaCalorSearchParams({
      fSicoe: {
        acta_rpo: '616',
        capitulo: '03',
        item: '3.9.',
        estado: 'No Revisado',
      },
      itemsChips: ['3.9.'],
      capasValidacion: [{ nivel: 2, estado: 'No Revisado' }],
      capasValidacionOp: 'and',
      panelCapitulos: [],
      panelActasRpo: [],
    })
    assert.equal(params.get('formato'), 'mapa_calor')
    assert.equal(params.get('acta_rpo'), '616')
    assert.equal(params.get('capitulo'), '03')
    assert.equal(params.get('item'), '3.9.')
    assert.ok(params.get('validacion_capas'))
  })
})
