/**
 * Caso · estabilidad crear nota, post-it exacto, fechas, semanario, guías (C-TX-11).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')
const frontendRoot = join(__dirname, '../../..')

describe('caso · Bloc estabilidad, fechas, semanario y guías', () => {
  it('App no remonta Bloc al limpiar blocOpenTarget', () => {
    const app = readFileSync(join(srcRoot, 'App.jsx'), 'utf8')
    assert.match(app, /key=\{`bloc-notas-\$\{usuario\?\.contrato_id/)
    assert.doesNotMatch(app, /blocOpenTarget\?\.noteId \|\| 'x'/)
    assert.match(app, /consumeBlocOpenTarget/)
  })

  it('reload usa folderIdRef y generación (sin carrera stale)', () => {
    const mod = readFileSync(join(__dirname, 'ModuloBlocNotas.jsx'), 'utf8')
    assert.match(mod, /folderIdRef/)
    assert.match(mod, /reloadGenRef/)
    assert.match(mod, /initialDiaryHtml/)
    assert.match(mod, /ensureDiaryDayInHtml/)
    assert.match(mod, /ensureHandDayMark/)
    assert.match(mod, /dedupeDiaryDaysInHtml|sanitizeNoteBody/)
    assert.match(mod, /enableBlocDayMarkers/)
    assert.match(mod, /Creada:/)
    assert.match(mod, /Modificada:/)
    assert.match(mod, /cycleHandGuide|Guía:/)
    assert.match(mod, /enableSemanario/)
    assert.match(mod, /iconOnlyTableTools/)
    assert.match(mod, /creatingRef/)
  })

  it('TemaRichEditor opt-in conserva data-bloc-day (BlocDayParagraph)', () => {
    const ed = readFileSync(join(srcRoot, 'modules/seguimiento/TemaRichEditor.jsx'), 'utf8')
    assert.match(ed, /enableBlocDayMarkers/)
    assert.match(ed, /BlocDayParagraph/)
    const ext = readFileSync(join(__dirname, 'blocDayMarkerExtension.js'), 'utf8')
    assert.match(ext, /data-bloc-day/)
    assert.match(ext, /bloc-day-marker/)
  })

  it('Pizarra hidrata folder_id para abrir la nota exacta', () => {
    const pz = readFileSync(join(__dirname, 'blocNotasPizarra.js'), 'utf8')
    assert.match(pz, /folder_id:\s*note\.folder_id/)
  })

  it('TemaRichEditor: semanario y tabla solo icono (opt-in Bloc)', () => {
    const ed = readFileSync(join(srcRoot, 'modules/seguimiento/TemaRichEditor.jsx'), 'utf8')
    assert.match(ed, /enableSemanario/)
    assert.match(ed, /Insertar semanario/)
    assert.match(ed, /iconOnlyTableTools/)
    assert.match(ed, /buildSemanarioTableHtml/)
  })

  it('canvas: guías de fondo y dayMarks', () => {
    const canvas = readFileSync(join(__dirname, 'BlocNotasNoteCanvas.jsx'), 'utf8')
    assert.match(canvas, /guide === 'dots'|guide === "dots"/)
    assert.match(canvas, /rail/)
    assert.match(canvas, /dayMarks/)
  })

  it('contrato C-TX-11 y cableado test:esquema', () => {
    const md = readFileSync(join(srcRoot, 'components/esquema/CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-TX-11/)
    assert.match(md, /semanario|bitácora por día/i)
    assert.match(md, /blocNotasDiary|blocNotasEstabilidad/)
    assert.match(md, /caso 45|45\./)
    const pkg = JSON.parse(readFileSync(join(frontendRoot, 'package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /blocNotasDiary\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /blocNotasEstabilidad\.scenario\.test\.js/)
  })
})
