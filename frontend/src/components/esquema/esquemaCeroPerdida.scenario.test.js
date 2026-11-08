/**
 * Cero pérdida / esquema ligado / descargas repetibles / DXF válido (contrato).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESQUEMA_INVOCATION_POINTS } from './esquemaInvocationPoints.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('esquemaCeroPerdida · modal y host', () => {
  const modal = read('components/esquema/EsquemaEditorModal.jsx')
  const host = read('components/esquema/esquemaExportHost.js')
  const archivos = read('components/esquema/EsquemaArchivosMenu.jsx')
  const draft = read('components/esquema/esquemaDraft.js')
  const draftUi = read('components/esquema/esquemaDraftUi.jsx')
  const dxf = read('components/esquema/esquemaExportDxf.js')

  it('C-OUT-14: no cierra al tocar fuera; solo botón cerrar + confirmación', () => {
    assert.match(modal, /data-esquema-no-backdrop-close/)
    assert.match(modal, /pedirCerrar/)
    assert.match(modal, /EsquemaCloseConfirmPopup/)
    assert.match(draftUi, /¿Guardar cambios\?/)
    assert.match(draftUi, /Guardar/)
    assert.match(draftUi, /Descartar/)
    assert.match(draftUi, /Cancelar/)
    assert.match(modal, /esquema-close-confirm|closeConfirm/)
  })

  it('C-OUT-14: autosave silencioso de borrador (local + nube)', () => {
    assert.match(modal, /saveEsquemaDraft\(\{\s*silent:\s*true/)
    assert.match(modal, /Autosave/)
    assert.match(modal, /uploadEsquemaAsset/)
    assert.match(modal, /beforeunload/)
    assert.match(modal, /pagehide/)
    assert.match(modal, /visibilitychange/)
    assert.match(modal, /esquema-draft-status/)
    assert.doesNotMatch(modal, /idleTimeout|setTimeout\(\s*onClose\s*\)/)
    assert.doesNotMatch(modal, /cerrar.*por inactividad|inactivity.?close/i)
  })

  it('C-OUT-14: indicador Guardando→Guardado / Sin guardar + keepDraft', () => {
    assert.match(modal, /Guardando…/)
    assert.match(modal, /Guardado/)
    assert.match(modal, /Sin guardar/)
    assert.match(modal, /'unsaved'/)
    assert.match(modal, /keepDraft/)
    assert.match(modal, /endStatus/)
    // «Guardado» requiere nube OK (o sin sesión); fallo → unsaved + reintento
    assert.match(modal, /cloudOk/)
    assert.match(modal, /void saveEsquemaDraft\(\{\s*silent:\s*true\s*\}\)/)
  })

  it('C-OUT-14: no remonta hoja Sicoe ni cierra sesión con editor abierto', () => {
    const app = read('App.jsx')
    assert.match(app, /sicoeHojaRegistroStableKey/)
    assert.match(app, /shouldKeepSessionAliveForEsquema/)
    assert.match(app, /touchstart/)
    assert.match(app, /consumeEsquemaEditorPendingReopen/)
    assert.match(read('modules/seguimiento/BitacoraAdjuntos.jsx'), /consumeEsquemaEditorPendingReopen/)
  })

  it('C-OUT-15: rebind de borrador draft → id real', () => {
    assert.match(draft, /esquemaDraftRebind/)
    assert.match(read('modules/seguimiento/BitacoraAdjuntos.jsx'), /esquemaDraftRebind/)
  })

  it('C-OUT-16: Exportar repetible (host no bloquea guardados sucesivos)', () => {
    assert.match(host, /coalesceUntil/)
    assert.match(host, /Guardado nuevo/)
    assert.match(host, /presentEsquemaExportPopup/)
  })

  it('C-OUT-16: Archivos del esquema descarga con blob (no window.open único)', () => {
    assert.match(archivos, /downloadEsquemaAssetBlob/)
    assert.match(archivos, /a\.download/)
    assert.doesNotMatch(archivos, /window\.open\(/)
    assert.match(archivos, /getEsquemaAssetTempUrl/)
  })

  it('C-OUT-17: DXF AC1027 + verificador + 3DFACE + unicode', () => {
    assert.match(dxf, /AC1027/)
    assert.match(dxf, /validateEsquemaDxf/)
    assert.match(dxf, /dxfEncodeText/)
    assert.match(dxf, /3DFACE/)
    assert.match(dxf, /LTYPE/)
    assert.match(dxf, /STYLE/)
  })

  it('restauración automática de borrador al abrir (sin popup interruptivo)', () => {
    assert.match(modal, /Borrador restaurado/)
    assert.match(modal, /applyDraftSnapshot\(row\.snapshot\)/)
  })
})

describe('esquemaCeroPerdida · invocación con escena / draft', () => {
  it('puntos críticos pasan draftModule o initialSceneSnapshot o escena en save', () => {
    const critical = [
      'modules/seguimiento/BitacoraAdjuntos.jsx',
      'modules/sicoe-obra/SicoeGraficosWizardPanel.jsx',
      'modules/presupuesto/PptoGraficosModal.jsx',
      'modules/seguimiento/ActaEditor.jsx',
    ]
    for (const file of critical) {
      const src = read(file)
      assert.match(src, /draftModule|initialSceneSnapshot|esquema_scene/, file)
      assert.match(src, /EsquemaEditorModal/, file)
    }
  })

  it('hosts críticos devuelven keepDraft si Guardar falla', () => {
    const hosts = [
      'modules/seguimiento/BitacoraAdjuntos.jsx',
      'modules/sicoe-obra/SicoeGraficosWizardPanel.jsx',
      'modules/presupuesto/PptoGraficosModal.jsx',
      'modules/seguimiento/ActaEditor.jsx',
      'modules/sicoe-obra/SicoeEsquemasReporteModal.jsx',
    ]
    for (const file of hosts) {
      const src = read(file)
      assert.match(src, /keepDraft:\s*true/, file)
    }
  })

  it('inventario de invocación sigue completo', () => {
    assert.ok(ESQUEMA_INVOCATION_POINTS.length >= 10)
    for (const pt of ESQUEMA_INVOCATION_POINTS) {
      const src = read(pt.file)
      assert.match(src, /EsquemaEditorModal/, pt.id)
    }
  })
})
