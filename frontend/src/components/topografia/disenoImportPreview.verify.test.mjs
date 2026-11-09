/**
 * Verificación offline del flujo importación → cotas en vista previa.
 * node --test src/components/topografia/disenoImportPreview.verify.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import {
  parseDisenoExcelBuffer,
  sintetizarPerfilDesdeRasante,
  ordenadasReferenciaSeccion,
} from '../../utils/disenoGeometricoParse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modalSrc = fs.readFileSync(path.join(__dirname, 'DisenoTramoDetalleModal.jsx'), 'utf8')
const previewSrc = fs.readFileSync(path.join(__dirname, 'DisenoPreviewCotasModal.jsx'), 'utf8')

function workbookBuffer(sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function assertPreviewCotas(rasante, eje) {
  const perfil = sintetizarPerfilDesdeRasante(rasante, eje)
  assert.ok(perfil.length > 0, 'debe haber puntos de perfil con cotas')
  const ords = [...new Set(perfil.map((p) => p.ordenada))].sort((a, b) => a - b)
  const izq = ords.filter((o) => o < -1e-9)
  const der = ords.filter((o) => o > 1e-9)
  assert.ok(izq.length >= 1, 'debe haber ordenadas a la izquierda')
  assert.ok(der.length >= 1, 'debe haber ordenadas a la derecha')
  for (const r of rasante) {
    const pts = perfil.filter((p) => Math.abs(p.abscisa - r.abscisa) < 1e-9)
    assert.ok(pts.length >= 2, `abscisa ${r.abscisa} sin cotas de perfil`)
    assert.ok(pts.every((p) => Number.isFinite(p.cota)), 'cotas deben ser numéricas')
    assert.ok(pts.some((p) => Math.abs(p.cota - r.cota_eje) < 1e-6) || r.cota_eje == null)
  }
  return { perfil, izq, der }
}

describe('Importar DG — botón y feedback', () => {
  it('el botón de cargar abre el selector por clic (no label+input deshabilitado)', () => {
    assert.match(modalSrc, /abrirSelectorArchivo/)
    assert.match(modalSrc, /fileRef\.current\?\.click/)
    assert.doesNotMatch(
      modalSrc,
      /as=["']label["'][\s\S]{0,200}type=["']file["']/,
      'no debe usar label con input file anidado (queda mudo si está disabled)',
    )
    assert.match(modalSrc, /Importando diseño/)
    assert.match(modalSrc, /Importación exitosa/)
    assert.match(modalSrc, /resultado\?\.ok/)
  })

  it('la vista previa incluye selector de ordenadas izq/der', () => {
    assert.match(previewSrc, /Ordenadas a la izquierda/)
    assert.match(previewSrc, /Ordenadas a la derecha/)
    assert.match(previewSrc, /sintetizarPerfilDesdeRasante/)
  })
})

describe('Verificación cotas CSV / Excel → vista previa', () => {
  const eje = { tipo_seccion: 'A', ancho_via_m: 9, abscisa_inicio: 11170, abscisa_fin: 11370 }

  it('CSV tipo plantilla produce cotas reales y ordenadas elegibles', () => {
    // Simula filas ya parseadas por backend CSV (misma forma que Excel frontend)
    const rasante = [
      { abscisa: 11170, cota_izquierda: 900.10, cota_eje: 900.20, cota_derecha: 900.15, ancho: 9 },
      { abscisa: 11190, cota_izquierda: 900.12, cota_eje: 900.22, cota_derecha: 900.17, ancho: 9 },
      { abscisa: 11370, cota_izquierda: 901.00, cota_eje: 901.10, cota_derecha: 901.05, ancho: 9 },
    ]
    const { izq, der } = assertPreviewCotas(rasante, eje)
    assert.deepEqual(ordenadasReferenciaSeccion('A', 9), [-4.5, 0, 4.5])
    assert.ok(izq.includes(-4.5))
    assert.ok(der.includes(4.5))
  })

  it('Excel multi-hoja: solo la hoja elegida aporta cotas a la vista previa', () => {
    const buf = workbookBuffer({
      Metadatos: [['nota'], ['sin cotas']],
      Rasante: [
        ['Diseño Tramo 7'],
        ['TRAMO', 'ABSCISA', 'Izquierda (m)', 'Eje (m)', 'Derecha (m)', 'ANCHO'],
        ['T7', 11170, 900.1, 900.2, 900.15, 9],
        ['T7', 11190, 900.12, 900.22, 900.17, 9],
      ],
    })
    const filas = parseDisenoExcelBuffer(buf, { sheetName: 'Rasante' })
    assert.equal(filas.length, 2)
    assert.equal(filas[0].cota_eje, 900.2)
    assertPreviewCotas(filas, eje)
  })

  it('Excel sin cotas se rechaza (no importación “exitosa” vacía)', () => {
    const buf = workbookBuffer({
      SoloPk: [['TRAMO', 'ABSCISA'], ['T7', 11170]],
    })
    assert.throws(() => parseDisenoExcelBuffer(buf), /cotas/i)
  })
})
