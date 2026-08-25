/**
 * Regresión Fase 1 offline Topografía — bugs críticos y contratos de API.
 *
 * node --test src/components/topografia/offline/topoOfflineFase1.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const router = readFileSync(join(dir, 'topoOfflineRouter.js'), 'utf8')
const downloader = readFileSync(join(dir, 'topoReferenceDownloader.js'), 'utf8')
const panel = readFileSync(join(dir, 'TopoOfflinePanel.jsx'), 'utf8')
const shared = readFileSync(join(dir, '../topografiaShared.jsx'), 'utf8')
const sync = readFileSync(join(dir, 'topoSyncEngine.js'), 'utf8')
const areas = readFileSync(join(dir, '../AreasForm.jsx'), 'utf8')

describe('Topo offline Fase 1', () => {
  it('entrega-dg detail GET no usa la condición imposible !path.includes("/")', () => {
    assert.doesNotMatch(router, /entrega-dg\/\[\^\/\]\+\$\/\) && !path\.includes\('\/'\)/)
    assert.match(router, /path\.match\(\/\^\\\/entrega-dg\\\/\[\^\/\]\+\$\/\)/)
  })

  it('poligonal anidada tiene optimistic write (estaciones/armadas)', () => {
    assert.match(router, /applyPoligonalNestedOptimistic/)
    assert.match(router, /parts\[2\] === 'estaciones'/)
    assert.match(router, /parts\[2\] === 'armadas'/)
    assert.match(router, /parts\[2\] === 'amarres'/)
  })

  it('calcular/cerrar poligonal usan paths con /calcular y /cerrar', () => {
    assert.match(router, /poligonales\\\/\[\^\/\]\+\\\/calcular/)
    assert.match(router, /poligonales\\\/\[\^\/\]\+\\\/cerrar/)
  })

  it('descarga de referencia cachea detalles calientes', () => {
    assert.match(downloader, /cacheHotEntityDetails/)
    assert.match(downloader, /\/poligonales\/\$\{p\.id\}/)
    assert.match(downloader, /\/nivelaciones\/\$\{n\.id\}/)
    assert.match(downloader, /\/entrega-dg\/\$\{e\.id\}/)
  })

  it('indicador usa copy Sin conexión — N pendientes', () => {
    assert.match(panel, /Sin conexión — \$\{totalPend\}/)
    assert.match(shared, /Sin conexión — \$\{totalPend\}/)
  })

  it('conflictos 409 persisten server_entity; resolver servidor refresca caché', () => {
    assert.match(sync, /response\.status === 409/)
    assert.match(sync, /topo_conflicts\.add/)
    assert.match(sync, /applyServerEntityToCache/)
  })

  it('Areas offline usa api POST (Dexie) no solo localStorage', () => {
    assert.match(areas, /api\('\/areas', \{ method: 'POST'/)
    assert.doesNotMatch(
      areas,
      /if \(!online\) \{\s*saveDraft\('areas'/,
    )
  })

  it('enqueue infiere server_updated_at desde caché', () => {
    assert.match(router, /inferServerUpdatedAt/)
  })
})
