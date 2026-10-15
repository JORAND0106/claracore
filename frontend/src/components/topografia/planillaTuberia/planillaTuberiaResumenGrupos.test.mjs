/**
 * Resumen de Cantidades agrupado (solo presentación).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaResumenGrupos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GRUPOS_RESUMEN,
  agruparNetosResumen,
  descontarDeDefaultGrupo,
  grupoIdDeLinea,
  tituloGrupoResumen,
} from './planillaTuberiaResumenGrupos.js'
import { calcularPlanillaLocal } from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('planillaTuberiaResumenGrupos', () => {
  it('asigna EXC_ROC a excavación y OTROS con grupo a ese grupo', () => {
    assert.equal(grupoIdDeLinea('EXC'), 'excavacion')
    assert.equal(grupoIdDeLinea('EXC_ROC'), 'excavacion')
    assert.equal(grupoIdDeLinea('TUB'), 'tuberia')
    assert.equal(grupoIdDeLinea('OTROS_1'), 'otros')
    assert.equal(grupoIdDeLinea('OTROS_2', { grupo: 'triturado' }), 'triturado')
    assert.equal(grupoIdDeLinea('OTROS_3', { grupo: 'REL' }), 'relleno')
  })

  it('total de grupo = suma de netos visibles (informativo)', () => {
    const grupos = agruparNetosResumen([
      { codigo: 'EXC', neto: 100 },
      { codigo: 'EXC_ROC', neto: 15 },
      { codigo: 'TUB', neto: 50 },
      { codigo: 'OTROS_1', neto: 2, grupo: 'excavacion', nombre: 'Extra' },
      { codigo: 'OTROS_2', neto: 3 },
    ], {
      displayNeto: (n) => n.neto,
      overridesByCodigo: {
        OTROS_1: { grupo: 'excavacion' },
      },
    })
    const byId = Object.fromEntries(grupos.map((g) => [g.id, g]))
    assert.equal(byId.excavacion.total, 117) // 100+15+2
    assert.equal(byId.tuberia.total, 50)
    assert.equal(byId.otros.total, 3)
    assert.equal(byId.excavacion.lineas.length, 3)
  })

  it('título triturado depende del tipo; defaults de descontar_de', () => {
    assert.match(tituloGrupoResumen('triturado', 'ALCANTARILLA'), /./)
    assert.equal(descontarDeDefaultGrupo('excavacion'), 'EXC')
    assert.equal(descontarDeDefaultGrupo('triturado'), 'TRI')
    assert.equal(descontarDeDefaultGrupo('relleno'), 'REL')
    assert.equal(descontarDeDefaultGrupo('otros'), null)
    assert.equal(GRUPOS_RESUMEN.length, 6)
  })

  it('motor conserva grupo en netos OTROS; fórmulas de EXC no cambian', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 100, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
      ],
      cantidades_manuales: [
        { codigo: 'EXC_ROC', long: 10, ancho: 1.5, espesor: 0.5, descontar_de: 'EXC' },
        { codigo: 'OTROS_1', nombre: 'Extra tri', long: 2, ancho: 1, espesor: 0.5, grupo: 'triturado', descontar_de: 'TRI' },
      ],
    })
    const otr = calc.netos.find((n) => n.codigo === 'OTROS_1')
    assert.equal(otr.grupo, 'triturado')
    assert.equal(otr.nombre, 'Extra tri')
    const grupos = agruparNetosResumen(calc.netos, {
      tipo: 'ALCANTARILLA',
      overridesByCodigo: { OTROS_1: { grupo: 'triturado' } },
      displayNeto: (n) => n.neto,
    })
    const tri = grupos.find((g) => g.id === 'triturado')
    assert.ok(tri.lineas.some((n) => n.codigo === 'OTROS_1'))
    assert.ok(tri.lineas.some((n) => n.codigo === 'TRI'))
  })

  it('UI: grupos expandibles, Observación, + por grupo; sellada sin +', () => {
    assert.match(formSrc, /agruparNetosResumen/)
    assert.match(formSrc, /Observación/)
    assert.match(formSrc, /agregarLineaGrupoResumen/)
    assert.match(formSrc, /gruposResumenAbiertos/)
    assert.match(formSrc, /toggleGrupoResumen/)
    assert.match(formSrc, /Agregar línea en/)
    // + del Resumen está en cabecera de grupo (editable); Descuentos sigue con «+ Otros».
    assert.match(formSrc, /title=\{`Agregar línea en \$\{grupo\.titulo\}`\}/)
  })

  it('gruposResumen useMemo va después de calculoVista (sin TDZ)', () => {
    const idxCalc = formSrc.indexOf('const calculoVista = useMemo')
    const idxGrupos = formSrc.indexOf('const gruposResumen = useMemo')
    assert.ok(idxCalc >= 0 && idxGrupos >= 0)
    assert.ok(idxGrupos > idxCalc, 'gruposResumen debe declararse después de calculoVista')
  })
})
