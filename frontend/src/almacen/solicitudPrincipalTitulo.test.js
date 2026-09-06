/**
 * Principal vs asociado + título con consecutivo.
 * node --test frontend/src/almacen/solicitudPrincipalTitulo.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('insumo principal / asociado', () => {
  it('grilla Excel incluye casilla Principal marcada por defecto', () => {
    const excel = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const helpers = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')
    assert.match(excel, /abbr: 'Principal'/)
    assert.match(excel, /onPrincipalChange/)
    assert.match(excel, /checked=\{it\.es_principal !== false\}/)
    assert.match(form, /es_principal: true/)
    assert.match(form, /es_principal: it\.es_principal !== false/)
    assert.match(form, /cantBorradorPrincipales/)
    assert.match(helpers, /it\.es_principal !== false && it\.preview\?\.supera_presupuesto/)
  })

  it('backend persiste es_principal y excluye asociados del acumulado', () => {
    const svc = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    const insumos = readFileSync(join(dir, '../../../backend/almacen_insumos_service.py'), 'utf8')
    const sql = readFileSync(join(dir, '../../../backend/sql/almacen_solicitud_es_principal.sql'), 'utf8')
    assert.match(svc, /"es_principal"/)
    assert.match(insumos, /def _item_es_principal/)
    assert.match(insumos, /if not _item_es_principal\(it\):/)
    assert.match(sql, /ADD COLUMN IF NOT EXISTS es_principal/)
  })
})

describe('título automático con consecutivo', () => {
  it('consulta próximo consecutivo en solicitud nueva', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    assert.match(form, /getProximoConsecutivoSolicitud/)
    assert.match(form, /sol\?\.consecutivo \?\? proximoConsecutivo/)
    assert.match(api, /solicitudes\/proximo-consecutivo/)
    assert.match(routes, /solicitudes\/proximo-consecutivo/)
  })
})
