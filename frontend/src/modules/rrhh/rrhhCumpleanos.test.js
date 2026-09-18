/**
 * Node tests — cumpleaños festivo RRHH (plantillas / rotación).
 * Run: node --test src/modules/rrhh/rrhhCumpleanos.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CUMPLE_PLANTILLAS,
  mensajeMotivacionalConTitular,
  nombreMesEs,
  plantillaCumpleanosFromPayload,
  plantillaCumpleanosIndex,
} from './rrhhCumpleanos.js'
import { RRHH_TARJETA_PASTEL, pastelForEmpresa } from './rrhhTarjetaStyles.js'

describe('rrhhCumpleanos', () => {
  it('nombra el mes en español', () => {
    assert.equal(nombreMesEs(1), 'enero')
    assert.equal(nombreMesEs(9), 'septiembre')
    assert.equal(nombreMesEs(12), 'diciembre')
    assert.equal(nombreMesEs(0), '')
  })

  it('rota plantilla cada 4 meses (alineado al backend)', () => {
    assert.equal(CUMPLE_PLANTILLAS.length, 4)
    const a = plantillaCumpleanosIndex(1, 2026)
    const b = plantillaCumpleanosIndex(4, 2026)
    const c = plantillaCumpleanosIndex(5, 2026)
    assert.equal(a, b)
    assert.notEqual(a, c)
    const pal = plantillaCumpleanosFromPayload({ plantilla_id: 2, mes: 9 })
    assert.equal(pal.id, 2)
    assert.ok(pal.accent)
  })

  it('plantillas usan paleta ClaraCore (azul/cyan/teal)', () => {
    const accents = CUMPLE_PLANTILLAS.map((p) => p.accent)
    assert.ok(accents.includes('#0077B6'))
    assert.ok(accents.includes('#00B4C6'))
    for (const p of CUMPLE_PLANTILLAS) {
      assert.equal(p.cardBg, '#FFFFFF')
      assert.ok(p.decor.length >= 5)
      assert.ok((p.decorExtra || []).length >= 3)
    }
  })

  it('mensaje motivacional incluye titular del contrato', () => {
    const msg = mensajeMotivacionalConTitular('Consorcio Pajarito Pérez')
    assert.ok(msg.startsWith('Consorcio Pajarito Pérez les desea'))
    assert.ok(msg.toLowerCase().includes('feliz cumpleaños'))
  })
})

describe('rrhhTarjetaStyles paleta plataforma', () => {
  it('usa familia azul ClaraCore (sin pasteles ajenos a la plataforma)', () => {
    assert.equal(RRHH_TARJETA_PASTEL.length, 8)
    for (const c of RRHH_TARJETA_PASTEL) {
      assert.match(c.bg, /^#(E|F|C|e|f|c)/i) // tonos claros
      assert.ok(c.accent)
    }
    const p = pastelForEmpresa('consorcio')
    assert.ok(p.bg && p.border && p.text)
  })
})
