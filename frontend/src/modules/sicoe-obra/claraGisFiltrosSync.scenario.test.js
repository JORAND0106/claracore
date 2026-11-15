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

  it('analisis/mapa aplica Editado por vía collect cabecera∪línea (como grilla)', () => {
    assert.match(
      backendMain,
      /Editado por: misma unión cabecera ∪ línea que \/reportes\/buscar/,
    )
    assert.match(
      backendMain,
      /_sicoe_collect_reporte_ids_editado_por\(contrato_id, _editado_por_ids_ana\)/,
    )
  })

  it('detalle de reporte acepta actas_filtro/capitulos_filtro y enriquece acta_rpo_numero', () => {
    assert.match(backendMain, /def _enriquecer_registros_acta_rpo_numero/)
    const idx = backendMain.indexOf('def obtener_reporte(')
    const chunk = backendMain.slice(idx, idx + 3500)
    assert.match(chunk, /actas_filtro/)
    assert.match(chunk, /capitulos_filtro/)
    assert.match(backendMain, /_enriquecer_registros_acta_rpo_numero\(regs_raw/)
  })

  it('analisis/mapa_calor usa la misma q de línea que la grilla (require_item con Acta)', () => {
    const idx = backendMain.indexOf('def _build_regs_q')
    assert.ok(idx > 0, 'debe existir _build_regs_q en analisis')
    const chunk = backendMain.slice(idx, idx + 2200)
    assert.match(chunk, /_sicoe_so_registros_q_linea_filtros_busqueda/)
    assert.match(chunk, /require_item=bool\(_aids_l\)/)
    assert.match(chunk, /acta_rpo_ids=_aids_l/)
  })
})
