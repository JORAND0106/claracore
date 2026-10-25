/**
 * Casos C-OUT-09…12 · dibujo editable, PDF, DXF, letra mínima, archivos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canShowEditarEsquema } from './esquemaScenePersist.js'
import { composeEsquemaDxf } from './esquemaExportDxf.js'
import { esquemaMinCellFontPx } from './esquemaDocLegibility.js'
import { mint_temp_token_probe } from './esquemaAssetsSecurity.probe.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(rel) {
  return readFileSync(join(__dirname, rel), 'utf8')
}

describe('caso · esquema editable + PDF + DXF + archivos', () => {
  it('modal emite scene + exports PDF/DXF (no adjuntos de registro)', () => {
    const modal = read('EsquemaEditorModal.jsx')
    assert.match(modal, /initialSceneSnapshot/)
    assert.match(modal, /normalizeEsquemaScene/)
    assert.match(modal, /composeEsquemaPdf/)
    assert.match(modal, /composeEsquemaDxf/)
    assert.match(modal, /scene:\s*sceneSnap/)
    assert.match(modal, /exports:\s*\{\s*pdf:\s*exportPdf/)
    assert.match(modal, /presentEsquemaExportPopup/)
    assert.match(modal, /filterEsquemaRegistroAdjuntos/)
  })

  it('Bitácora muestra Editar esquema y Archivos', () => {
    const bit = readFileSync(
      join(__dirname, '../../modules/seguimiento/BitacoraAdjuntos.jsx'),
      'utf8',
    )
    assert.match(bit, /EsquemaEditIcon/)
    assert.match(bit, /EsquemaArchivosMenu/)
    assert.match(bit, /initialSceneSnapshot/)
    assert.match(bit, /applyEsquemaSaveBundle/)
    assert.match(bit, /sealed/)
  })

  it('sellado oculta Editar; sin permiso también', () => {
    assert.equal(canShowEditarEsquema({
      hasScene: true, canEdit: true, sealed: true,
    }), false)
    assert.equal(canShowEditarEsquema({
      hasScene: true, canEdit: false, sealed: false,
    }), false)
  })

  it('DXF georreferenciado vs local (casos b/c)', () => {
    const geo = composeEsquemaDxf({
      coordRows: [
        { num: 'Inicio', norte: 1_045_000, este: 980_000 },
        { num: 'Fin', norte: 1_045_010, este: 980_010 },
      ],
    })
    assert.equal(geo.georeferenced, true)
    const local = composeEsquemaDxf({
      objects: [{ type: 'linea', x1: 0, y1: 0, x2: 50, y2: 0 }],
    })
    assert.equal(local.georeferenced, false)
    assert.match(local.dxf, /\$INSUNITS/)
  })

  it('letra mínima medible en anchos de memoria/despiece/coords', () => {
    for (const w of [1280, 2200, 4400]) {
      assert.ok(esquemaMinCellFontPx(w) >= w / 55 - 1e-9)
    }
  })

  it('backend assets + token temporal cableados', () => {
    assert.ok(existsSync(join(__dirname, '../../../../backend/esquema_assets_service.py')))
    assert.ok(existsSync(join(__dirname, '../../../../backend/esquema_assets_routes.py')))
    const svc = readFileSync(
      join(__dirname, '../../../../backend/esquema_assets_service.py'),
      'utf8',
    )
    assert.match(svc, /mint_temp_token/)
    assert.match(svc, /verify_temp_token/)
    assert.match(svc, /assert_path_in_contrato/)
    // Probe puro JS equivalente al HMAC (sin Azure)
    const r = mint_temp_token_probe('esquemas/1/m/r/g/a.png', 1, 120)
    assert.equal(r.ok, true)
    assert.equal(r.verify_other_contrato, false)
  })

  it('contrato declara C-OUT-08…13', () => {
    const md = read('CONTRATO_ESQUEMA.md')
    assert.match(md, /C-OUT-08/)
    assert.match(md, /C-OUT-09/)
    assert.match(md, /C-OUT-10/)
    assert.match(md, /C-OUT-11/)
    assert.match(md, /C-OUT-12/)
    assert.match(md, /C-OUT-13/)
    assert.match(md, /1\/55|ancho\/55/)
    assert.match(md, /Editar esquema/)
    assert.match(md, /Archivos del esquema/)
  })
})
