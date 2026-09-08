/**
 * Smoke — columnas Entrada/Salida en grilla de solicitudes.
 * node --test frontend/src/almacen/solicitudEstadoEntradaSalida.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('formatEstadoOcMovimiento', () => {
  it('exporta labels Total/Parcial', () => {
    const src = readFileSync(join(dir, 'almacenShared.jsx'), 'utf8')
    assert.match(src, /ESTADO_OC_MOVIMIENTO_LABEL/)
    assert.match(src, /total:\s*'Total'/)
    assert.match(src, /parcial:\s*'Parcial'/)
    assert.match(src, /export function formatEstadoOcMovimiento/)
  })
})

describe('SolicitudesPanel columnas Entrada/Salida', () => {
  it('renderiza columnas y usa el formateador', () => {
    const src = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(src, />Entrada</)
    assert.match(src, />Salida</)
    assert.match(src, /formatEstadoOcMovimiento\(s\.estado_entrada\)/)
    assert.match(src, /formatEstadoOcMovimiento\(s\.estado_salida\)/)
    assert.match(src, /data-testid="solicitud-estado-entrada"/)
    assert.match(src, /data-testid="solicitud-estado-salida"/)
  })

  it('reparte anchos: texto acotado y acciones amplias', () => {
    const src = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(src, /width: '16%'.*Título|Título[\s\S]*width: '16%'/)
    assert.match(src, /width: '12%'.*Solicitante|Solicitante[\s\S]*width: '12%'/)
    assert.match(src, /width: '12%'.*Aprobación|Aprobación[\s\S]*width: '12%'/)
    assert.match(src, /width: 280.*Acciones|Acciones[\s\S]*width: 280/)
    assert.match(src, /minWidth: 1180/)
    assert.match(src, /flexWrap: 'nowrap'/)
    assert.match(src, /textOverflow: 'ellipsis'/)
  })

  it('backend calcula estados en resumen', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(src, /def _estado_entrada_vs_oc/)
    assert.match(src, /def _estado_salida_vs_entrada/)
    assert.match(src, /def _enriquecer_ocs_estado_entrada_salida/)
    assert.match(src, /sol\["estado_entrada"\]/)
    assert.match(src, /sol\["estado_salida"\]/)
  })
})
