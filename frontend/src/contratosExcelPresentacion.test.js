import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const modal = readFileSync(new URL('./ContratoEditModal.jsx', import.meta.url), 'utf8')
const admin = readFileSync(new URL('./AdminPanel.jsx', import.meta.url), 'utf8')
const docs = readFileSync(new URL('./ContratoDocumentosContractuales.jsx', import.meta.url), 'utf8')
const ordenes = readFileSync(new URL('./ContratoOrdenesPago.jsx', import.meta.url), 'utf8')

describe('Contratos — presentación tipo Excel', () => {
  it('el modal importa TopoExcelSheet y topoSheetStyles', () => {
    assert.match(modal, /import TopoExcelSheet from/)
    assert.match(modal, /import \{ topoSheetStyles \}/)
  })

  it('todas las pestañas del popup usan hoja Excel', () => {
    for (const tab of ['info', 'financiera', 'exportacion', 'niveles']) {
      assert.match(modal, new RegExp(`tab === "${tab}"`))
    }
    assert.match(modal, /title="Identificación"/)
    assert.match(modal, /title="Tasas \(fracción 0–1\)"/)
    assert.match(modal, /title="Valores contractuales \(COP\$\)"/)
    assert.match(modal, /title="Costos adicionales"/)
    assert.match(modal, /title="Paleta de colores para exportes"/)
    assert.match(modal, /title="Niveles de validación SICOE"/)
  })

  it('el listado admin de contratos usa sheet Excel', () => {
    assert.match(admin, /function SeccionContratos/)
    assert.match(admin, /topoSheetStyles/)
    assert.match(admin, /sheet\.sheetWrap/)
    assert.match(admin, /sheet\.sheetTable/)
    assert.match(admin, /Contratos registrados/)
  })

  it('licencia y órdenes usan TopoExcelSheet; matriz sincroniza tema', () => {
    assert.match(docs, /TopoExcelSheet/)
    assert.match(docs, /title="Datos del licenciatario"/)
    assert.match(docs, /topoSheetStyles\(tok\)/)
    assert.match(docs, /theme = "dark"/)
    assert.match(ordenes, /TopoExcelSheet/)
    assert.match(ordenes, /title="Configuración de cobro"/)
    assert.match(ordenes, /title="Próximo corte"/)
    assert.match(ordenes, /Historial de órdenes/)
  })

  it('AdminPanel pasa theme/t a la matriz documental', () => {
    assert.match(admin, /<ContratoDocumentosMatriz[\s\S]*?theme=\{theme\}[\s\S]*?t=\{t\}/)
  })
})
