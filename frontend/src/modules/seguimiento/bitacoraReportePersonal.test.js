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
  buildResumenBitacoraCompleto,
  buildResumenTramoEmpresa,
  empresaDeOperadorUso,
  formatoCeldaCantidad,
  formatoCeldaResumen,
  formatearFechaReportePersonal,
  nombreArchivoResumenPng,
  RESUMEN_SECTION_BUILDERS,
  resolveLogosPorEmpresa,
  SIN_TIPO_MATERIAL_LABEL,
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

  it('materiales: filas por tipo + tramo con ingreso/salida (solo si hay datos)', () => {
    const vacio = buildResumenTramoEmpresa({ asistencia: [], usos: [], materiales: [] })
    assert.equal(vacio.materiales.hasData, false)
    assert.equal(vacio.materiales.rows.length, 0)

    const conMats = buildResumenTramoEmpresa({
      asistencia: [],
      usos: [],
      materiales: [
        { movimiento: 'ingreso', tipo_material: 'Arena', cantidad: 10, tramo: 'Tramo 1' },
        { movimiento: 'salida', tipo_material: 'Arena', cantidad: 3, tramo: 'Tramo 1' },
        { movimiento: 'ingreso', tipo_material: 'Grava', cantidad: 5, tramo: 'Tramo 2' },
        { movimiento: 'ingreso', tipo_material: 'Arena', cantidad: 2, tramo: 'Tramo 2' },
        { movimiento: 'salida', tipo_material: '', proveedor: 'Acme', cantidad: 1, tramo: 'Tramo 1' },
        { movimiento: 'ingreso', tipo_material: '', cantidad: '', tramo: 'Tramo 1' }, // vacía
      ],
    })
    assert.equal(conMats.materiales.hasData, true)
    assert.equal(conMats.materiales.rows.length, 4)

    const arenaT1 = conMats.materiales.rows.find((r) => r.tipo === 'Arena' && r.tramo === 'Tramo 1')
    const arenaT2 = conMats.materiales.rows.find((r) => r.tipo === 'Arena' && r.tramo === 'Tramo 2')
    const grava = conMats.materiales.rows.find((r) => r.tipo === 'Grava')
    const sinTipo = conMats.materiales.rows.find((r) => r.tipo === SIN_TIPO_MATERIAL_LABEL)
    assert.ok(arenaT1)
    assert.ok(arenaT2)
    assert.ok(grava)
    assert.ok(sinTipo)
    assert.deepEqual(
      { ingreso: arenaT1.ingreso, salida: arenaT1.salida },
      { ingreso: 10, salida: 3 },
    )
    assert.deepEqual(
      { ingreso: arenaT2.ingreso, salida: arenaT2.salida },
      { ingreso: 2, salida: 0 },
    )
    assert.deepEqual(
      { ingreso: grava.ingreso, salida: grava.salida },
      { ingreso: 5, salida: 0 },
    )
    assert.deepEqual(
      { ingreso: sinTipo.ingreso, salida: sinTipo.salida },
      { ingreso: 0, salida: 1 },
    )
    assert.deepEqual(conMats.materiales.grandTotal, { ingreso: 17, salida: 4 })
    // Sin tipo al final
    assert.equal(conMats.materiales.rows[conMats.materiales.rows.length - 1].tipo, SIN_TIPO_MATERIAL_LABEL)
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
      'Resumen de bitácora · 2026-09-23',
    )
    assert.equal(formatearFechaReportePersonal('2026-09-23'), '23/09/2026')
    assert.equal(formatoCeldaResumen({ personal: 3, maquinaria: 1 }), '3p · 1m')
    assert.equal(formatoCeldaResumen({ personal: 2, maquinaria: 0 }), '2p')
    assert.equal(formatoCeldaResumen({ personal: 0, maquinaria: 0 }), '—')
    assert.equal(formatoCeldaCantidad(4), '4')
    assert.equal(formatoCeldaCantidad(0), '—')
    assert.equal(nombreArchivoResumenPng('2026-09-23'), 'resumen-bitacora-2026-09-23.png')
  })

  it('resumen completo: incluye todas las secciones del registro', () => {
    const ids = RESUMEN_SECTION_BUILDERS.map((s) => s.id)
    for (const id of [
      'clima', 'personal', 'maquinaria', 'materiales', 'materiales_vales',
      'eventos', 'recorridos', 'actividades', 'observaciones', 'adjuntos',
    ]) {
      assert.ok(ids.includes(id), `falta sección ${id}`)
    }

    const completo = buildResumenBitacoraCompleto({
      asistencia: [
        { nombre: 'Ana', cargo: 'Ayudante', subcontratista_nombre: 'E1', tramo: 'Tramo 1', estado: 'activo' },
      ],
      usos: [
        { equipo_nombre: 'Retro', operador: 'Ana', cantidad: 1, tramo: 'Tramo 1' },
      ],
      materiales: [
        {
          movimiento: 'ingreso', tipo_material: 'Arena', cantidad: 4, tramo: 'Tramo 1',
          numeros_vale: 'V-9', proveedor: 'Acme', placa: 'ABC123',
        },
      ],
      rrhhCatalogo: [],
      horaInicio: '07:30',
      clima: { clima_codigo: 61, clima_temp_c: 18, clima_descripcion: 'Lluvia' },
      cuerpoHtml: '<p>Nota del día</p>',
      imagenes: [{ nombre: 'foto1.png', mime_type: 'image/png', url: 'https://x/1.png' }],
      elaboradoPor: 'Juan Pérez',
      eventos: [
        {
          evento_tipo: 'visita_terceros',
          dirigido_a: 'Interventoría',
          cuerpo_html: '<p>Recorrido OK</p>',
          evento_detalle: {
            entidad: 'ICCU',
            motivo: 'Seguimiento',
            visitantes_lista: [{ nombre: 'Laura Gómez', cargo: 'Ing.' }],
            actividades: [{ actividad: 'Inspección ABS', abs_inicio: '10+000', ubicacion_tramo: 'Tramo 1' }],
          },
          imagenes: [{ nombre: 'recorrido.jpg', mime_type: 'image/jpeg' }],
        },
        {
          evento_tipo: 'novedades',
          dirigido_a: '',
          cuerpo_html: '<p>Observación general</p>',
          evento_detalle: { actividades: [] },
          imagenes: [],
        },
      ],
    })

    assert.equal(completo.hasAnyData, true)
    assert.equal(completo.personal.hasData, true)
    assert.equal(completo.maquinaria.hasData, true)
    assert.equal(completo.materiales.hasData, true)

    const byId = Object.fromEntries(completo.sections.map((s) => [s.id, s]))
    assert.equal(byId.elaborado.hasData, true)
    assert.equal(byId.clima.hasData, true)
    assert.equal(byId.personal.hasData, true)
    assert.equal(byId.maquinaria.hasData, true)
    assert.equal(byId.materiales.hasData, true)
    assert.equal(byId.materiales_vales.hasData, true)
    assert.equal(byId.materiales_vales.rows[0].vales, 'V-9')
    assert.equal(byId.eventos.hasData, true)
    assert.equal(byId.recorridos.hasData, true)
    assert.equal(byId.recorridos.rows[0].nombre, 'Laura Gómez')
    assert.equal(byId.actividades.hasData, true)
    assert.equal(byId.observaciones.hasData, true)
    assert.equal(byId.adjuntos.hasData, true)
    assert.ok(byId.adjuntos.rows.length >= 2)
  })

  it('editor y modal: tablas completas + copiar PNG (sin descargar)', () => {
    assert.match(editorSrc, /Resumen PNG/)
    assert.match(editorSrc, /BitacoraReportePersonalModal/)
    assert.match(editorSrc, /materiales=\{materiales\}/)
    assert.match(editorSrc, /eventos=\{eventos\}/)
    assert.match(editorSrc, /exportBitacoraPdfBlob/)
    assert.match(modalSrc, /buildResumenBitacoraCompleto/)
    assert.match(modalSrc, /copyInformePeriodicoBlob/)
    assert.match(modalSrc, /Copiar imagen/)
    assert.match(modalSrc, /Imagen copiada/)
    assert.match(modalSrc, /CcConfirmModal/)
    assert.match(modalSrc, /RESUMEN|sections|renderSeccion/)
    assert.match(modalSrc, /data-resumen-chunk/)
    assert.match(modalSrc, /html-to-image/)
    assert.match(modalSrc, /captureRef/)
    assert.doesNotMatch(modalSrc, /Descargar PNG/)
    assert.doesNotMatch(modalSrc, /descargarPng/)
    assert.doesNotMatch(modalSrc, /downloadInformePeriodicoBlob/)
    assert.doesNotMatch(modalSrc, /Imprimir \/ PDF/)
    assert.doesNotMatch(modalSrc, /generar_pdf_bitacora_dia/)
    assert.doesNotMatch(modalSrc, /window\.print/)
  })

  it('editor: resumen PNG ícono+tooltip en header; PDF en íconos (sin duplicar en pie)', () => {
    assert.match(editorSrc, /from 'lucide-react'/)
    assert.match(editorSrc, /<Table2\b/)
    assert.match(editorSrc, /Resumen PNG/)
    assert.match(editorSrc, /title="Resumen de bitácora \(PNG al portapapeles\)"/)
    assert.match(editorSrc, /<Eye\b/)
    assert.match(editorSrc, /<Download\b/)
    assert.match(editorSrc, /aria-label="Resumen PNG por tramo y empresa"/)
    assert.match(editorSrc, /aria-label=\{pdfBusy \? 'Generando vista previa…' : 'Vista previa PDF'\}/)
    assert.match(editorSrc, /aria-label=\{pdfBusy \? 'Generando PDF…' : 'Descargar PDF'\}/)
    assert.match(editorSrc, /aria-label="Cerrar"/)
    // Ícono sin texto «Resumen PNG» pegado al botón (solo tooltip/aria).
    assert.doesNotMatch(editorSrc, /<Table2[^/]*\/>\s*\n\s*Resumen PNG/)
    // Un solo disparador del resumen (header); pie ya no duplica las acciones.
    const opens = editorSrc.match(/setReportePersonalOpen\(true\)/g) || []
    assert.equal(opens.length, 1)
    const previewCalls = editorSrc.match(/exportarPdfDia\(\{\s*preview:\s*true\s*\}\)/g) || []
    const downloadCalls = editorSrc.match(/exportarPdfDia\(\{\s*preview:\s*false\s*\}\)/g) || []
    assert.equal(previewCalls.length, 1)
    assert.equal(downloadCalls.length, 1)
    // Guardar sigue como botón de texto en el pie.
    assert.match(editorSrc, />\s*Guardar\s*</)
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
