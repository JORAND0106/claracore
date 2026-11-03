import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  alertaAgotamientoOc,
  esInsumoConsumido,
  fingerprintEntradaOcItems,
  mensajeAlertaAgotamiento,
  saldoResultante,
  textoSaldoProgreso,
  TOLERANCIA_SALDO_OC,
} from './entradaOcSaldoHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('entradaOcSaldoHelpers', () => {
  it('tolera saldos ≤ 0.0001 como consumido', () => {
    assert.equal(TOLERANCIA_SALDO_OC, 0.0001)
    assert.equal(esInsumoConsumido(0), true)
    assert.equal(esInsumoConsumido(0.0001), true)
    assert.equal(esInsumoConsumido(0.00011), false)
  })

  it('calcula resultante y alertas 20/5', () => {
    assert.equal(saldoResultante(300, 180), 120)
    assert.equal(alertaAgotamientoOc(200, 1000), 'amarillo')
    assert.equal(alertaAgotamientoOc(50, 1000), 'rojo')
    assert.equal(alertaAgotamientoOc(0, 1000), 'rojo')
    assert.equal(alertaAgotamientoOc(500, 1000), 'normal')
    assert.match(mensajeAlertaAgotamiento('amarillo', 200, 1000, 'm³'), /se está acabando/)
    assert.match(mensajeAlertaAgotamiento('rojo', 0, 1000, 'm³'), /nueva solicitud/)
    assert.match(textoSaldoProgreso(300, 1000, 'm³'), /300/)
  })

  it('fingerprint estable de OC+ítems', () => {
    const a = fingerprintEntradaOcItems(9, [
      { orden_compra_item_id: 2, cantidad_recibida: 1 },
      { orden_compra_item_id: 1, cantidad_recibida: 3 },
    ])
    const b = fingerprintEntradaOcItems(9, [
      { orden_compra_item_id: 1, cantidad_recibida: 3 },
      { orden_compra_item_id: 2, cantidad_recibida: 1 },
    ])
    assert.equal(a, b)
    assert.match(a, /^9\|/)
  })
})

describe('cableado anti-dup y saldo OC', () => {
  it('tablet bloquea remisión, idempotencia y muestra saldo/consumido', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(wiz, /idempotency_key/)
    assert.match(wiz, /confirm_posible_duplicado/)
    assert.match(wiz, /remisionBloqueada/)
    assert.match(wiz, /entrada-tablet-oc-consumido/)
    assert.match(wiz, /entrada-tablet-saldo-resultante/)
    assert.match(wiz, /entrada-tablet-confirm-dup/)
    assert.match(wiz, /alerta_saldo_amarillo_pct/)
    assert.match(api, /check-similar-reciente/)
    assert.match(api, /POSIBLE_DUPLICADO/)
  })

  it('backend: migración crítica y bloqueo en create', () => {
    const runner = readFileSync(join(dir, '../../../backend/schema_migrations_runner.py'), 'utf8')
    const svc = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    assert.match(runner, /20261103020000_almacen_entrada_dup_oc_saldo/)
    assert.match(svc, /mensaje_remision_duplicada/)
    assert.match(svc, /lookup_entrada_similar_reciente/)
    assert.match(svc, /_notificar_alerta_saldo_oc_entrada/)
    assert.match(routes, /blocked.: True|blocked": True|"blocked": True/)
    assert.match(routes, /POSIBLE_DUPLICADO/)
  })
})
