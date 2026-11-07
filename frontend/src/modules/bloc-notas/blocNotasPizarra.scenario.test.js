/**
 * Caso · Pizarra en Inicio + tooltips + layout + deshacer (C-TX-10).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..') // frontend/src
const frontendRoot = join(__dirname, '../../..') // frontend

describe('caso · Bloc ancho, tooltips, undo y Pizarra', () => {
  it('visibilidad solo_yo / contrato en código', () => {
    const src = readFileSync(join(__dirname, 'blocNotasPizarra.js'), 'utf8')
    assert.match(src, /PIZARRA_SOLO_YO\s*=\s*'solo_yo'/)
    assert.match(src, /PIZARRA_CONTRATO\s*=\s*'contrato'/)
  })

  it('dedupe exporta bodyHasContent y conserva distinta', () => {
    const dedup = readFileSync(join(__dirname, 'blocNotasDedup.js'), 'utf8')
    assert.match(dedup, /export function bodyHasContent/)
    assert.match(dedup, /softDeleteNote\(parent\.id/)
  })

  it('Módulo Bloc: ancho completo, undo/redo, enviar pizarra, tooltips', () => {
    const src = readFileSync(join(__dirname, 'ModuloBlocNotas.jsx'), 'utf8')
    assert.match(src, /maxWidth:\s*'100%'/)
    assert.match(src, /Deshacer/)
    assert.match(src, /Rehacer/)
    assert.match(src, /Enviar a la Pizarra/)
    assert.match(src, /disableHistory/)
    assert.match(src, /matchUndoRedoKeys/)
    assert.match(src, /creatingRef/)
    assert.doesNotMatch(src, /maxWidth:\s*960/)
  })

  it('IconBtn: long-press sin ejecutar + tip', () => {
    const src = readFileSync(join(__dirname, 'BlocNotasIconBtn.jsx'), 'utf8')
    assert.match(src, /LONG_MS|480/)
    assert.match(src, /suppressClick/)
    assert.match(src, /data-cc-tooltip/)
    assert.match(src, /CcTipChrome/)
  })

  it('Inicio: Pizarra reemplaza Novedades; clima intacto', () => {
    const inicio = readFileSync(join(srcRoot, 'ModuloInicio.jsx'), 'utf8')
    assert.match(inicio, /PizarraInicio/)
    assert.match(inicio, /BarraClima/)
    assert.doesNotMatch(inicio, /<BandejaNovedadesInicio/)
    assert.match(inicio, /cc-inicio-saludo-pizarra/)
  })

  it('API y SQL de pizarra existen', () => {
    const sql = join(frontendRoot, '../backend/sql/bloc_notas_pizarra.sql')
    assert.ok(existsSync(sql))
    assert.match(readFileSync(sql, 'utf8'), /bloc_notas_pizarra/)
    const routes = readFileSync(
      join(frontendRoot, '../backend/bloc_notas_routes.py'),
      'utf8',
    )
    assert.match(routes, /\/pizarra/)
    assert.match(routes, /solo_yo/)
    assert.match(routes, /contrato/)
  })

  it('contrato C-TX-10 y cableado test:esquema', () => {
    const md = readFileSync(
      join(srcRoot, 'components/esquema/CONTRATO_ESQUEMA.md'),
      'utf8',
    )
    assert.match(md, /C-TX-10/)
    assert.match(md, /Pizarra/)
    assert.match(md, /blocNotasPizarra/)
    const pkg = JSON.parse(readFileSync(join(frontendRoot, 'package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /blocNotasPizarra\.scenario\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /blocNotasHistory\.test\.js/)
  })
})
