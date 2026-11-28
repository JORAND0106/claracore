import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeLineaPlantillaFueDiligenciada,
  sicoeLineaPlantillaSinTocar,
  sicoePrepararRegistrosWizardDesdePlantilla,
  sicoeRegistroDesdeItemPlantilla,
  sicoeValidarRegistroWizardCompleto,
} from './sicoePlantillaLineasWizard.js'

describe('sicoePlantillaLineasWizard', () => {
  it('nombre precargado no cuenta como diligenciado', () => {
    const r = sicoeRegistroDesdeItemPlantilla({ nombre: 'Excavación' })
    assert.equal(r._origenPlantilla, true)
    assert.equal(sicoeLineaPlantillaFueDiligenciada(r), false)
    assert.equal(sicoeLineaPlantillaSinTocar(r), true)
  })

  it('observacion o dim marca diligenciado', () => {
    const base = sicoeRegistroDesdeItemPlantilla({ nombre: 'A' })
    assert.equal(sicoeLineaPlantillaFueDiligenciada({ ...base, observacion: 'ok' }), true)
    assert.equal(sicoeLineaPlantillaFueDiligenciada({ ...base, longitud: 1.2 }), true)
  })

  it('10 líneas: 3 diligenciadas → solo 3 a subir', () => {
    const regs = Array.from({ length: 10 }, (_, i) =>
      sicoeRegistroDesdeItemPlantilla({ nombre: `L${i + 1}` }),
    )
    for (const i of [0, 2, 4]) {
      regs[i] = {
        ...regs[i],
        unidad: 'm3',
        longitud: 1,
        observacion: `obs ${i}`,
        _fotoOk: true,
        foto_url: `https://x/${i}.jpg`,
      }
    }
    const out = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(out.ok, true)
    assert.equal(out.registros.length, 3)
    assert.equal(out.descartadas, 7)
  })

  it('línea tocada incompleta bloquea', () => {
    const regs = [
      {
        ...sicoeRegistroDesdeItemPlantilla({ nombre: 'A' }),
        observacion: 'empezó',
      },
    ]
    const out = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(out.ok, false)
    assert.equal(out.codigo, 'incompleto')
  })

  it('ninguna diligenciada → sin_registros', () => {
    const regs = [
      sicoeRegistroDesdeItemPlantilla({ nombre: 'A' }),
      sicoeRegistroDesdeItemPlantilla({ nombre: 'B' }),
    ]
    const out = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(out.ok, false)
    assert.equal(out.codigo, 'sin_registros')
  })

  it('manual sin origen plantilla no exige foto en este filtro', () => {
    const regs = [{ nombre: 'Manual', observacion: '' }]
    const out = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(out.ok, true)
    assert.equal(out.registros.length, 1)
  })

  it('validar completo exige unidad, dim, obs y foto', () => {
    const bad = sicoeValidarRegistroWizardCompleto({
      ...sicoeRegistroDesdeItemPlantilla({ nombre: 'A' }),
      observacion: 'x',
    })
    assert.equal(bad.ok, false)
    const good = sicoeValidarRegistroWizardCompleto({
      nombre: 'A',
      unidad: 'm',
      longitud: 2,
      observacion: 'ok',
      _fotoOk: true,
      foto_url: 'https://x/a.jpg',
    })
    assert.equal(good.ok, true)
  })
})
