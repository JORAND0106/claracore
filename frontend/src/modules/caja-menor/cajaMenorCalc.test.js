import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { fmtPct, hoyColombia, indicadores, valorNeto } from './cajaMenorCalc.js'
import { parseCajaMenorDeepLink } from './cajaMenorDeepLink.js'
import { accesoCajaMenor } from './cajaMenorPermisos.js'

describe('caja menor', () => {
  it('calcula el neto y no divide si el fondo es cero', () => {
    assert.equal(valorNeto({ bruto: 100000, iva: 19000, retenciones: 4000, impuestoConsumo: 8000, otros: 2000 }), 121000)
    const vacio = indicadores(0, [], [])
    assert.equal(vacio.gasto_actual, null)
    assert.equal(fmtPct(vacio.gasto_actual), '—')
    const ind = indicadores(10000, [{ valor: 90000 }], [
      { valor_neto: 80000, estado_validacion: 'pendiente' },
      { valor_neto: 50000, estado_validacion: 'rechazado' },
    ])
    assert.equal(ind.fondo_establecido, 100000)
    assert.equal(ind.gastos_periodo, 80000)
    assert.equal(ind.disponible, 20000)
    assert.equal(ind.gasto_actual, 80)
  })

  it('lee el enlace directo a la caja', () => {
    const link = parseCajaMenorDeepLink('?modulo=caja_menor&contrato=5&caja=12&gasto=3')
    assert.deepEqual(link, { cajaId: 12, contratoId: 5, gastoId: 3 })
    assert.equal(parseCajaMenorDeepLink('?modulo=contabilidad&caja=1'), null)
  })

  it('el desarrollador entra sin matriz', () => {
    const acceso = accesoCajaMenor({ cargo_nombre: 'Desarrollador' }, 4)
    assert.equal(acceso.ver, true)
    assert.equal(acceso.validar, true)
    assert.equal(acceso.exportar, true)
    assert.equal(acceso.accesoTotal, true)
    const porRol = accesoCajaMenor({ rol_id: 1 }, 4)
    assert.equal(porRol.crear, true)
    assert.equal(porRol.eliminar, true)
    assert.equal(porRol.accesoTotal, true)
    const otro = accesoCajaMenor({
      permisos: [{ funcion_nombre: 'Caja Menor', contrato_id: 4, ver: true, crear: false, validar: true }],
    }, 4)
    assert.equal(otro.ver, true)
    assert.equal(otro.crear, false)
    assert.equal(otro.validar, true)
    assert.equal(otro.puedeEntrar, true)
    const gerencia = accesoCajaMenor({ rol_nombre: 'Administrador' }, 4)
    assert.equal(gerencia.ver, true)
    assert.equal(gerencia.crear, false)
    const administrativo = accesoCajaMenor({ rol_nombre: 'Administrativo' }, 4)
    assert.equal(administrativo.puedeEntrar, false)
  })

  it('la fecha de hoy es la de Colombia', () => {
    const nocheUtc = new Date('2026-11-18T02:30:00Z')
    assert.equal(hoyColombia(nocheUtc), '2026-11-17')
  })

  it('la pantalla no usa Contabilidad y registra el módulo en el menú', () => {
    const dir = new URL('.', import.meta.url)
    const modulo = readFileSync(new URL('./ModuloCajaMenor.jsx', dir), 'utf8')
    const detalle = readFileSync(new URL('./CajaMenorDetalle.jsx', dir), 'utf8')
    const app = readFileSync(new URL('../../App.jsx', dir), 'utf8')
    assert.equal(modulo.includes('contabilidad'), false)
    assert.equal(detalle.includes('contabilidad'), false)
    assert.equal(modulo.includes('<table'), true)
    assert.equal(detalle.includes('<table'), true)
    assert.equal(modulo.includes('title='), true)
    assert.equal(detalle.includes('role="dialog"'), true)
    assert.equal(detalle.split('role="dialog"').length - 1, 1)
    assert.equal(detalle.includes('Consignaciones'), true)
    assert.equal(detalle.includes('capture="environment"'), true)
    assert.equal(detalle.includes('position: \'sticky\''), true)
    assert.equal(detalle.includes('Leyendo la factura'), true)
    assert.equal(detalle.includes('Escape'), false)
    assert.equal(detalle.includes('whiteSpace: \'nowrap\''), true)
    assert.equal(app.includes('tokenParaUi'), true)
    const guardia = readFileSync(new URL('../../components/RefreshCacheGuard.jsx', dir), 'utf8')
    assert.equal(guardia.includes("addEventListener('beforeunload'"), false)
    assert.equal(app.includes("['caja_menor'"), true)
    assert.equal(app.includes('Caja Menor'), true)
    const logs = readFileSync(new URL('../../admin/logsModificacionesPresentacion.js', dir), 'utf8')
    assert.equal(logs.includes('Caja Menor'), true)
    assert.equal(logs.includes('VALIDAR'), true)
  })
})
