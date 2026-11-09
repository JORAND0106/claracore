/**
 * node --test src/components/topografia/viasModulo.verify.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8')
const mainSrc = read('TopografiaMain.jsx')
const formSrc = read('EntregaDgObraForm.jsx')
const librosSrc = read('ViasLibrosVista.jsx')
const cargaSrc = read('EntregaCarteraCargaModal.jsx')
const matrizSrc = read('EntregaVerificacionMatriz.jsx')
const utilsSrc = fs.readFileSync(
  path.join(__dirname, '../../../../backend/topografia_diseno_utils.py'),
  'utf8',
)

describe('Módulo Vías — rename y libros', () => {
  it('menú muestra Vías', () => {
    assert.match(mainSrc, /label: 'Vías'/)
    assert.doesNotMatch(mainSrc, /label: 'Estructura de Vía'/)
  })

  it('form usa libros, popup de entrega, modos y carga', () => {
    assert.match(formSrc, /ViasLibrosVista/)
    assert.match(formSrc, /Entrega de vía/)
    assert.match(formSrc, /modoCartera/)
    assert.match(formSrc, /EntregaCarteraCargaModal/)
    assert.match(formSrc, /Por cotas directas/)
  })

  it('libros agrupa por eje/capa', () => {
    assert.match(librosSrc, /agruparEntregasPorEjeYCapa/)
    assert.match(librosSrc, /Cada libro es un tramo/)
  })
})

describe('Cota de diseño y matriz', () => {
  it('backend: cota = rasante − espesores encima', () => {
    assert.match(utilsSrc, /espesores de las capas que estan por encima|espesores de las capas que están por encima/i)
    assert.match(utilsSrc, /espesor_acumulado_hasta_capa\(capas, indice_capa\)/)
    assert.doesNotMatch(
      utilsSrc.split('def cota_diseno_capa')[1].split('def ')[0],
      /cota_fondo_capa\(cota_rasante/,
    )
  })

  it('matriz usa diseno como superficie de entrega', () => {
    assert.match(matrizSrc, /Superficie de entrega = cota de diseño/)
    assert.match(matrizSrc, /modoCartera/)
    assert.match(matrizSrc, /nombre_punto/)
  })
})

describe('Carga cartera', () => {
  it('soporta pegado, CSV y Excel con hoja', () => {
    assert.match(cargaSrc, /parseCarteraMatriz/)
    assert.match(cargaSrc, /listDisenoExcelSheetNames/)
    assert.match(cargaSrc, /DisenoExcelHojaModal/)
    assert.match(cargaSrc, /No se inventan valores/)
  })
})
