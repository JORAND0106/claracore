/**
 * Tests — Reporte de personal por empresa (Bitácora Diario).
 * node --test src/modules/seguimiento/bitacoraReportePersonal.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPRESA_SIN_NOMBRE } from './personalAsistenciaHelpers.js'
import {
  buildReportePersonalPorEmpresa,
  empresaDeOperadorUso,
  formatearFechaReportePersonal,
  resolveLogosPorEmpresa,
  tituloReportePersonal,
} from './bitacoraReportePersonal.js'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'BitacoraReportePersonalModal.jsx'), 'utf8')

describe('bitacoraReportePersonal', () => {
  it('agrupa personal y maquinaria por empresa (2+ empresas)', () => {
    const catalogo = [
      { id: 1, nombres: 'Luis', apellidos: 'Mora', empresa_nombre: 'Empresa A' },
      { id: 2, nombres: 'Ana', apellidos: 'Perez', empresa_nombre: 'Empresa B' },
      { id: 3, nombres: 'Sin', apellidos: 'Logo', empresa_nombre: '' },
    ]
    const asistencia = [
      { nombre: 'Ana Perez', cargo: 'Ayudante', subcontratista_nombre: 'Empresa B' },
      { nombre: 'Beto Ruiz', cargo: 'Oficial', subcontratista_nombre: 'Empresa A' },
    ]
    const usos = [
      { equipo_nombre: 'Retro', operador: 'Luis Mora', operador_rrhh_id: 1, cantidad: 1 },
      { equipo_nombre: 'Volqueta', operador: 'Ana Perez', operador_rrhh_id: 2, cantidad: 2 },
      { equipo_nombre: 'Compactadora', operador: 'Fantasma', operador_rrhh_id: null, cantidad: 1 },
    ]
    const logos = resolveLogosPorEmpresa({
      contrato: { contratista: 'Empresa A', logo_contratista: 'https://cdn.example/a.png' },
      empresasOpciones: [
        { nombre: 'Empresa B', logo_url: 'https://cdn.example/b.png' },
      ],
    })
    const bloques = buildReportePersonalPorEmpresa({
      asistencia,
      usos,
      rrhhCatalogo: catalogo,
      logosByEmpresaKey: logos,
    })
    assert.equal(bloques.length, 3)
    const a = bloques.find((b) => b.empresa === 'Empresa A')
    const b = bloques.find((b) => b.empresa === 'Empresa B')
    const sin = bloques.find((b) => b.empresa === EMPRESA_SIN_NOMBRE)
    assert.ok(a)
    assert.ok(b)
    assert.ok(sin)
    assert.equal(a.logo_url, 'https://cdn.example/a.png')
    assert.equal(b.logo_url, 'https://cdn.example/b.png')
    assert.equal(sin.logo_url, null)
    assert.equal(a.personal.length, 1)
    assert.equal(a.personal[0].nombre, 'Beto Ruiz')
    assert.equal(a.maquinaria.length, 1)
    assert.equal(a.maquinaria[0].equipo, 'Retro')
    assert.equal(b.personal[0].nombre, 'Ana Perez')
    assert.equal(b.maquinaria[0].equipo, 'Volqueta')
    assert.equal(sin.maquinaria[0].equipo, 'Compactadora')
    // Sin empresa al final
    assert.equal(bloques[bloques.length - 1].empresa, EMPRESA_SIN_NOMBRE)
  })

  it('empresaDeOperadorUso resuelve por id RRHH o nombre; vacío → Sin empresa', () => {
    const cat = [{ id: 9, nombres: 'Carla', apellidos: 'Diaz', empresa_nombre: 'Consorcio X' }]
    assert.equal(
      empresaDeOperadorUso({ operador: 'Carla Diaz', operador_rrhh_id: 9 }, cat),
      'Consorcio X',
    )
    assert.equal(
      empresaDeOperadorUso({ operador: 'Carla Diaz', operador_rrhh_id: null }, cat),
      'Consorcio X',
    )
    assert.equal(
      empresaDeOperadorUso({ operador: 'Nadie', operador_rrhh_id: 99 }, cat),
      EMPRESA_SIN_NOMBRE,
    )
  })

  it('título y fecha', () => {
    assert.equal(tituloReportePersonal('2026-09-23'), 'Reporte de personal · 2026-09-23')
    assert.equal(formatearFechaReportePersonal('2026-09-23'), '23/09/2026')
  })

  it('editor expone botón y modal Reporte de personal (no toca PDF completo)', () => {
    assert.match(editorSrc, /Reporte de personal/)
    assert.match(editorSrc, /BitacoraReportePersonalModal/)
    assert.match(editorSrc, /exportBitacoraPdfBlob/)
    assert.match(modalSrc, /buildReportePersonalPorEmpresa/)
    assert.match(modalSrc, /Imprimir/)
    assert.doesNotMatch(modalSrc, /generar_pdf_bitacora_dia/)
  })
})
