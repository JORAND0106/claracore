/**
 * Contrato: ClaraGIS no tiene filtrado propio paralelo.
 * El fetch de mapa_calor / analisis debe usar la misma q de línea que la grilla.
 * El foco de revisión no puede descartar Acta RPO ni el resto del bloque.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { claraGisBundleFocoItem, claraGisBundleNoRevisado } from './claraGisMesaValidacion.js'
import { sicoeBuildMapaCalorSearchParams, sicoeBuildDetalleFiltradoSearchParams } from './sicoeMapaCalorParams.js'

const dir = dirname(fileURLToPath(import.meta.url))
const backendMain = readFileSync(join(dir, '../../../../backend/main.py'), 'utf8')
const mapaMod = readFileSync(join(dir, 'ModuloPlanoMapaCalor.jsx'), 'utf8')

describe('ClaraGIS paridad con grilla SicoeObra', () => {
  it('analisis _build_regs_q delega en la q compartida de la grilla', () => {
    const idx = backendMain.indexOf('def _build_regs_q')
    const chunk = backendMain.slice(idx, idx + 2500)
    assert.match(chunk, /_sicoe_so_registros_q_linea_filtros_busqueda/)
    assert.match(chunk, /require_item=bool\(_aids_l\)/)
    // No debe reintroducir filtros de acta a mano en paralelo.
    assert.equal(chunk.includes('_sicoe_analisis_aplicar_filtro_actas('), false)
  })

  it('foco conserva acta del bloque de trabajo', () => {
    const base = claraGisBundleNoRevisado([{ nivel: 3, estado: 'No Revisado' }])
    base.fSicoe.acta_rpo = '1'
    const foco = claraGisBundleFocoItem('3.9.', 'Ítem demo', base)
    const params = sicoeBuildMapaCalorSearchParams(foco)
    assert.equal(params.get('acta_rpo'), '1')
    assert.equal(params.get('item'), '3.9.')
    assert.ok(params.get('validacion_capas'))
  })

  it('detalle filtrado y mapa comparten los mismos criterios de acta+capítulo', () => {
    const bundle = {
      fSicoe: { acta_rpo: '3', capitulo: '02' },
      capasValidacion: [{ nivel: 2, estado: 'Pendiente' }],
      panelActasRpo: [],
      panelCapitulos: [],
    }
    const mapa = sicoeBuildMapaCalorSearchParams(bundle)
    const det = sicoeBuildDetalleFiltradoSearchParams(bundle)
    assert.equal(mapa.get('acta_rpo'), det.get('acta_rpo'))
    assert.equal(mapa.get('capitulo'), det.get('capitulo'))
    assert.equal(mapa.get('validacion_capas'), det.get('validacion_capas'))
  })

  it('plano pasa el bundle de trabajo al foco (no solo el ítem)', () => {
    assert.match(mapaMod, /claraGisBundleFocoItem\(\s*item,\s*info\.itemDescripcion,\s*trabajoBundleRef\.current/)
  })
})
