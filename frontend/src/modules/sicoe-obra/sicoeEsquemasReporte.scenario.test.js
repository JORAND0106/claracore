/**
 * Contrato C-OUT-18: esquemas a nivel de reporte + asignación en sellados.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('sicoeEsquemasReporte · contrato UI', () => {
  it('botón Esquemas junto a Editar dibujo en CarpetaReporte', () => {
    const app = read('App.jsx')
    assert.match(app, /sicoe-esquemas-reporte-btn/)
    assert.match(app, /SicoeEsquemasReporteModal/)
    assert.match(app, /Editar dibujo/)
    assert.match(app, /Esquemas/)
  })

  it('registro ya no ofrece botón Crear esquema', () => {
    const app = read('App.jsx')
    assert.match(app, /Crear\/editar esquema: desde el botón «Esquemas»/)
    assert.doesNotMatch(app, /title=\{grafVista \? 'Editar esquema' : 'Crear esquema'\}/)
    assert.doesNotMatch(app, /title="Crear esquema"/)
  })

  it('modal de lista + asignación + editor; Exportar diferido', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /Nuevo esquema/)
    assert.match(modal, /Cambiar asignación/)
    assert.match(modal, /SicoeEsquemaAsignarPopup/)
    assert.match(modal, /EsquemaEditorModal/)
    assert.match(modal, /presentEsquemaExportPopup/)
    assert.match(modal, /planificarActualizacionVersionEsquema/)
    assert.match(modal, /deferExportPopup/)
    // Nuevo: casillas vacías (no precarga editTarget)
    assert.match(modal, /assignMode === 'reasignar'/)
    assert.doesNotMatch(modal, /Cree esquemas del reporte y asígnelos/)
    assert.doesNotMatch(modal, /sealedKeep/)
  })

  it('Guardar independiente: Sin asignar + keepDraft + cancelar no pierde', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /upsertEsquemaSinAsignar/)
    assert.match(modal, /mergeEsquemasLista/)
    assert.match(modal, /Sin asignar/)
    assert.match(modal, /keepDraft/)
    assert.match(modal, /cancelarAsignacion/)
    // Tras cancelar asignación de un nuevo guardado, aún se ofrece Exportar
    assert.match(modal, /assignMode === 'nuevo' && pending/)
  })

  it('Asignar estable: sin convertir PNG; error visible; escena del editor', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /entradaDesdeFilaLista/)
    assert.match(modal, /resolverEscenaGuardado/)
    assert.match(modal, /hostError=\{assignErr\}/)
    assert.match(modal, /No se pudo asignar el esquema|mensajeErrorEsquemaUsuario/)
    assert.doesNotMatch(modal, /sceneIn:\s*target\?\.scene/)
    // PUT verificado: no aceptar 200 vacío (gráfico debe llegar al registro)
    assert.match(modal, /putRegistroPersistioGrafico/)
    const logic = read('modules/sicoe-obra/sicoeEsquemasReporte.js')
    assert.match(logic, /entradaParaRegistroHistorial/)
    assert.match(logic, /aligerarEscenaParaHistorial/)
    assert.match(logic, /grafico_descripcion/)
    const popup = read('modules/sicoe-obra/SicoeEsquemaAsignarPopup.jsx')
    assert.match(popup, /sicoe-esquema-asignar-error/)
    const app = read('App.jsx')
    // Tras Asignar: patch a reporte.registros; sin recargar que pise el gráfico
    assert.match(app, /onRegistrosPatched/)
    assert.doesNotMatch(
      app,
      /onRegistrosPatched[\s\S]{0,500}recargar\(\s*\{\s*forzarSinFiltros/,
    )
  })

  it('Guardar no bloquea: PDF/DXF en segundo plano + onExportsReady', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /onExportsReady/)
    assert.match(modal, /ofrecerExportar/)
    assert.match(modal, /nube tras Guardar \(bg\)|uploadToCloud:\s*true/)
    const editor = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(editor, /exportsPending:\s*true/)
    assert.match(editor, /setDraftSaveStatus\('saved'\)/)
    assert.match(editor, /composeEsquemaPdf/)
  })

  it('popup asignación: sellados togglables, sin texto largo, aviso mínimo', () => {
    const popup = read('modules/sicoe-obra/SicoeEsquemaAsignarPopup.jsx')
    assert.match(popup, /Seleccione al menos un registro/)
    assert.match(popup, /Sellado/)
    assert.doesNotMatch(popup, /Los sellados conservan su versión/)
    assert.doesNotMatch(popup, /canToggle = !sellado/)
    assert.doesNotMatch(popup, /disabled=\{busy \|\| !canToggle\}/)
    assert.match(popup, /Reg\./)
    assert.match(popup, /Cant Total/)
  })

  it('galería busca por número y ordena', () => {
    const app = read('App.jsx')
    assert.match(app, /sicoe-galeria-grafico-buscar/)
    assert.match(app, /Buscar por nº gráfico o reporte/)
  })

  it('contrato documenta C-OUT-18 con sellados asignables', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-OUT-18/)
    assert.match(md, /Esquemas del reporte/)
    assert.match(md, /sicoeEsquemasReporte/)
    assert.match(md, /sellados?.*asignar|asignar.*sellados?/i)
    assert.match(md, /cantidades?.*bloquead/i)
  })
})
