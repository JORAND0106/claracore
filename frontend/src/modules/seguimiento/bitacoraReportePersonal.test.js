/**
 * Tests — Resumen cruzado Tramo × Empresa (Bitácora Diario).
 * node --test src/modules/seguimiento/bitacoraReportePersonal.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPRESA_SIN_NOMBRE } from './personalAsistenciaHelpers.js'
import { SIN_TRAMO_ASIGNADO_LABEL } from './bitacoraTramoHelpers.js'
import {
  buildResumenTramoEmpresa,
  empresaDeOperadorUso,
  formatoCeldaCantidad,
  formatoCeldaResumen,
  formatearFechaReportePersonal,
  nombreArchivoResumenPng,
  resolveLogosPorEmpresa,
  tituloReportePersonal,
} from './bitacoraReportePersonal.js'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'BitacoraReportePersonalModal.jsx'), 'utf8')
const adjuntosSrc = readFileSync(join(dir, 'BitacoraAdjuntos.jsx'), 'utf8')
const moduloSrc = readFileSync(join(dir, 'ModuloSeguimiento.jsx'), 'utf8')

describe('bitacoraReportePersonal — resumen Tramo × Empresa', () => {
  it('cruzado: personal y maquinaria por tramo y empresa (varios tramos/empresas)', () => {
    const catalogo = [
      { id: 1, nombres: 'Luis', apellidos: 'Mora', empresa_nombre: 'Empresa A' },
      { id: 2, nombres: 'Ana', apellidos: 'Perez', empresa_nombre: 'Empresa B' },
    ]
    const asistencia = [
      { nombre: 'Ana Perez', cargo: 'Ayudante', subcontratista_nombre: 'Empresa B', tramo: 'Tramo 1', estado: 'activo' },
      { nombre: 'Beto Ruiz', cargo: 'Oficial', subcontratista_nombre: 'Empresa A', tramo: 'Tramo 1', estado: 'activo' },
      { nombre: 'Carla Diaz', cargo: 'Oficial', subcontratista_nombre: 'Empresa A', tramo: 'Tramo 2', estado: 'activo' },
      { nombre: 'Admin User', cargo: 'Administrativo', subcontratista_nombre: 'Empresa A', tramo: 'Tramo 1', estado: 'activo' },
    ]
    const usos = [
      { equipo_nombre: 'Retro', operador: 'Luis Mora', operador_rrhh_id: 1, cantidad: 1, tramo: 'Tramo 1' },
      { equipo_nombre: 'Volqueta', operador: 'Ana Perez', operador_rrhh_id: 2, cantidad: 2, tramo: 'Tramo 2' },
      { equipo_nombre: 'Compactadora', operador: 'Fantasma', operador_rrhh_id: null, cantidad: 1, tramo: 'Tramo 1' },
    ]
    const logos = resolveLogosPorEmpresa({
      contrato: { contratista: 'Empresa A', logo_contratista: 'https://cdn.example/a.png' },
      empresasOpciones: [
        { nombre: 'Empresa B', logo_url: 'https://cdn.example/b.png' },
      ],
    })
    const resumen = buildResumenTramoEmpresa({
      asistencia,
      usos,
      rrhhCatalogo: catalogo,
      logosByEmpresaKey: logos,
    })

    assert.equal(resumen.tramos.length, 2)
    assert.equal(resumen.empresas.length, 3)

    const empA = resumen.empresas.find((e) => e.nombre === 'Empresa A')
    const empB = resumen.empresas.find((e) => e.nombre === 'Empresa B')
    const empSin = resumen.empresas.find((e) => e.nombre === EMPRESA_SIN_NOMBRE)
    assert.ok(empA)
    assert.ok(empB)
    assert.ok(empSin)
    assert.equal(empA.logo_url, 'https://cdn.example/a.png')
    assert.equal(empB.logo_url, 'https://cdn.example/b.png')
    assert.equal(empSin.logo_url, null)
    assert.equal(resumen.empresas[resumen.empresas.length - 1].nombre, EMPRESA_SIN_NOMBRE)

    const t1 = resumen.tramos.find((tr) => tr.nombre === 'Tramo 1')
    const t2 = resumen.tramos.find((tr) => tr.nombre === 'Tramo 2')
    assert.ok(t1)
    assert.ok(t2)

    assert.deepEqual(resumen.cells[t1.key][empA.key], { personal: 1, maquinaria: 1 })
    assert.deepEqual(resumen.cells[t1.key][empB.key], { personal: 1, maquinaria: 0 })
    assert.deepEqual(resumen.cells[t1.key][empSin.key], { personal: 0, maquinaria: 1 })
    assert.deepEqual(resumen.cells[t2.key][empA.key], { personal: 1, maquinaria: 0 })
    assert.deepEqual(resumen.cells[t2.key][empB.key], { personal: 0, maquinaria: 2 })

    assert.equal(resumen.grandTotal.personal, 3)
    assert.equal(resumen.grandTotal.maquinaria, 4)
    assert.equal(resumen.rowTotals[t1.key].personal, 2)
    assert.equal(resumen.rowTotals[t1.key].maquinaria, 2)
    assert.equal(resumen.colTotals[empA.key].personal, 2)
    assert.equal(resumen.colTotals[empB.key].maquinaria, 2)

    // Tablas separadas
    assert.equal(resumen.personal.hasData, true)
    assert.equal(resumen.maquinaria.hasData, true)
    assert.equal(resumen.materiales.hasData, false)
    assert.equal(resumen.personal.cells[t1.key][empA.key], 1)
    assert.equal(resumen.maquinaria.cells[t1.key][empA.key], 1)
    assert.equal(resumen.maquinaria.cells[t2.key][empB.key], 2)
    assert.equal(resumen.personal.grandTotal, 3)
    assert.equal(resumen.maquinaria.grandTotal, 4)
  })

  it('materiales: tabla solo con ingreso/salida y solo si hay datos', () => {
    const vacio = buildResumenTramoEmpresa({ asistencia: [], usos: [], materiales: [] })
    assert.equal(vacio.materiales.hasData, false)

    const conMats = buildResumenTramoEmpresa({
      asistencia: [],
      usos: [],
      materiales: [
        { movimiento: 'ingreso', tipo_material: 'Arena', cantidad: 10, tramo: 'Tramo 1' },
        { movimiento: 'salida', tipo_material: 'Arena', cantidad: 3, tramo: 'Tramo 1' },
        { movimiento: 'ingreso', tipo_material: 'Grava', cantidad: 5, tramo: 'Tramo 2' },
        { movimiento: 'ingreso', tipo_material: '', cantidad: '', tramo: 'Tramo 1' }, // vacía
      ],
    })
    assert.equal(conMats.materiales.hasData, true)
    const t1 = conMats.materiales.tramos.find((tr) => tr.nombre === 'Tramo 1')
    const t2 = conMats.materiales.tramos.find((tr) => tr.nombre === 'Tramo 2')
    assert.ok(t1)
    assert.ok(t2)
    assert.deepEqual(conMats.materiales.cells[t1.key], { ingreso: 10, salida: 3 })
    assert.deepEqual(conMats.materiales.cells[t2.key], { ingreso: 5, salida: 0 })
    assert.deepEqual(conMats.materiales.grandTotal, { ingreso: 15, salida: 3 })
  })

  it('filas sin tramo van a «Sin tramo asignado»', () => {
    const resumen = buildResumenTramoEmpresa({
      asistencia: [
        { nombre: 'X', cargo: 'Oficial', subcontratista_nombre: 'E1', tramo: '', estado: 'activo' },
      ],
      usos: [],
      rrhhCatalogo: [],
    })
    assert.equal(resumen.tramos.length, 1)
    assert.equal(resumen.tramos[0].nombre, SIN_TRAMO_ASIGNADO_LABEL)
    assert.equal(resumen.grandTotal.personal, 1)
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

  it('título, fecha, celda y nombre PNG', () => {
    assert.equal(
      tituloReportePersonal('2026-09-23'),
      'Resumen por tramo y empresa · 2026-09-23',
    )
    assert.equal(formatearFechaReportePersonal('2026-09-23'), '23/09/2026')
    assert.equal(formatoCeldaResumen({ personal: 3, maquinaria: 1 }), '3p · 1m')
    assert.equal(formatoCeldaResumen({ personal: 2, maquinaria: 0 }), '2p')
    assert.equal(formatoCeldaResumen({ personal: 0, maquinaria: 0 }), '—')
    assert.equal(formatoCeldaCantidad(4), '4')
    assert.equal(formatoCeldaCantidad(0), '—')
    assert.equal(nombreArchivoResumenPng('2026-09-23'), 'resumen-tramo-empresa-2026-09-23.png')
  })

  it('editor y modal: tablas separadas + copiar imagen (no descarga por defecto)', () => {
    assert.match(editorSrc, /Resumen por tramo y empresa/)
    assert.match(editorSrc, /BitacoraReportePersonalModal/)
    assert.match(editorSrc, /materiales=\{materiales\}/)
    assert.match(editorSrc, /exportBitacoraPdfBlob/)
    assert.match(modalSrc, /buildResumenTramoEmpresa/)
    assert.match(modalSrc, /copyInformePeriodicoBlob/)
    assert.match(modalSrc, /Copiar imagen/)
    assert.match(modalSrc, /Imagen copiada/)
    assert.match(modalSrc, /tituloSeccion="Personal"/)
    assert.match(modalSrc, /tituloSeccion="Maquinaria"/)
    assert.match(modalSrc, /TablaMateriales/)
    assert.match(modalSrc, /html-to-image/)
    assert.match(modalSrc, /captureRef/)
    assert.doesNotMatch(modalSrc, /Descargar PNG/)
    assert.doesNotMatch(modalSrc, /Imprimir \/ PDF/)
    assert.doesNotMatch(modalSrc, /generar_pdf_bitacora_dia/)
    assert.doesNotMatch(modalSrc, /window\.print/)
  })

  it('adjuntos: drag-drop + Ctrl+V en BitacoraAdjuntos y BitacoraClipAdjuntos', () => {
    assert.match(adjuntosSrc, /onDrop/)
    assert.match(adjuntosSrc, /onDragOver/)
    assert.match(adjuntosSrc, /onPaste/)
    assert.match(adjuntosSrc, /BitacoraClipAdjuntos/)
    assert.match(adjuntosSrc, /fileMatchesAccept/)
    assert.match(adjuntosSrc, /'pegar'/)
    assert.match(adjuntosSrc, /acceptDroppedFiles|addFiles\(.*pegar/)
  })

  it('módulo Seguimiento: catálogo Maquinaria solo Desarrollador', () => {
    assert.match(moduloSrc, /MaquinariaCatalogoModal/)
    assert.match(moduloSrc, /permisosBitacora\?\.esDesarrollador/)
    assert.match(moduloSrc, /setMaquinariaCatalogoOpen/)
  })
})
