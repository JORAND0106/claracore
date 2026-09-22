/**
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCrearReportePermiso.test.mjs
 *
 * «Crear reporte» solo visible con crear y/o editar so_registros
 * (matriz «Reporte de Cantidades» / SICOE Obra).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { puedeVerBotonCrearReporteSicoe } from './planillaTuberiaUtils.js'
import {
  usuarioPuedeCrearRegistrosSicoe,
  usuarioPuedeEditarRegistrosSicoe,
} from '../../../utils/permisosContrato.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const utilsSrc = readFileSync(join(dir, 'planillaTuberiaUtils.js'), 'utf8')

function usuarioConPermiso(flags, contratoId = 10) {
  return {
    cargo_nombre: 'Residente',
    contrato_id: contratoId,
    permisos: [
      {
        funcion_nombre: 'Reporte de Cantidades',
        contrato_id: contratoId,
        ver: true,
        crear: !!flags.crear,
        editar: !!flags.editar,
        eliminar: false,
        validar: false,
        exportar: false,
      },
    ],
  }
}

describe('Crear reporte — permiso SICOE Obra (so_registros)', () => {
  it('helpers SICOE: crear y editar leen la matriz Reporte de Cantidades', () => {
    const conCrear = usuarioConPermiso({ crear: true, editar: false })
    const conEditar = usuarioConPermiso({ crear: false, editar: true })
    const sinPerm = usuarioConPermiso({ crear: false, editar: false })
    const soloVer = {
      cargo_nombre: 'Residente',
      contrato_id: 10,
      permisos: [
        {
          funcion_nombre: 'Reporte de Cantidades',
          contrato_id: 10,
          ver: true,
          crear: false,
          editar: false,
          eliminar: false,
          validar: false,
          exportar: false,
        },
      ],
    }

    assert.equal(usuarioPuedeCrearRegistrosSicoe(conCrear, 10), true)
    assert.equal(usuarioPuedeEditarRegistrosSicoe(conCrear, 10), false)
    assert.equal(usuarioPuedeCrearRegistrosSicoe(conEditar, 10), false)
    assert.equal(usuarioPuedeEditarRegistrosSicoe(conEditar, 10), true)
    assert.equal(usuarioPuedeCrearRegistrosSicoe(sinPerm, 10), false)
    assert.equal(usuarioPuedeEditarRegistrosSicoe(sinPerm, 10), false)
    assert.equal(usuarioPuedeCrearRegistrosSicoe(soloVer, 10), false)
    assert.equal(usuarioPuedeEditarRegistrosSicoe(soloVer, 10), false)
  })

  it('puedeVerBotonCrearReporteSicoe: crear O editar; sin ambos → oculto', () => {
    assert.equal(
      puedeVerBotonCrearReporteSicoe(usuarioConPermiso({ crear: true, editar: false }), 10),
      true,
    )
    assert.equal(
      puedeVerBotonCrearReporteSicoe(usuarioConPermiso({ crear: false, editar: true }), 10),
      true,
    )
    assert.equal(
      puedeVerBotonCrearReporteSicoe(usuarioConPermiso({ crear: true, editar: true }), 10),
      true,
    )
    assert.equal(
      puedeVerBotonCrearReporteSicoe(usuarioConPermiso({ crear: false, editar: false }), 10),
      false,
    )
    assert.equal(
      puedeVerBotonCrearReporteSicoe({ cargo_nombre: 'Residente', permisos: [] }, 10),
      false,
    )
  })

  it('Desarrollador siempre puede ver el botón', () => {
    const dev = { cargo_nombre: 'Desarrollador', permisos: [] }
    assert.equal(puedeVerBotonCrearReporteSicoe(dev, 10), true)
  })

  it('aisla permiso por contrato (no reutiliza matriz de otro contrato)', () => {
    const u = {
      cargo_nombre: 'Residente',
      contrato_id: 10,
      permisos: [
        {
          funcion_nombre: 'Reporte de Cantidades',
          contrato_id: 99,
          ver: true,
          crear: true,
          editar: true,
          eliminar: false,
          validar: false,
          exportar: false,
        },
      ],
    }
    assert.equal(puedeVerBotonCrearReporteSicoe(u, 10), false)
    assert.equal(puedeVerBotonCrearReporteSicoe(u, 99), true)
  })

  it('Form oculta el botón con puedeVerCrearReporte (no solo disabled)', () => {
    assert.match(utilsSrc, /usuarioPuedeCrearRegistrosSicoe/)
    assert.match(utilsSrc, /usuarioPuedeEditarRegistrosSicoe/)
    assert.match(utilsSrc, /puedeVerBotonCrearReporteSicoe/)
    assert.match(formSrc, /puedeVerBotonCrearReporteSicoe/)
    assert.match(formSrc, /puedeVerCrearReporte/)
    assert.match(formSrc, /planilla\?\.id && puedeVerCrearReporte/)
    assert.match(formSrc, /data-crear-reporte-sicoe-btn/)
    // No debe quedar el botón sin gate de permiso SICOE
    assert.doesNotMatch(
      formSrc,
      /\{planilla\?\.id && \(\s*<span style=\{\{ display: 'inline-flex'/,
    )
  })
})
