/**
 * Al guardar desde plantilla: no subir líneas sin tocar; exigir completas las tocadas.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  sicoePrepararRegistrosWizardDesdePlantilla,
  sicoeRegistroDesdeItemPlantilla,
} from './sicoePlantillaLineasWizard.js'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')

describe('Sicoe — plantilla líneas no diligenciadas', () => {
  it('wizard usa preparar + modal institucional', () => {
    assert.match(app, /sicoePrepararRegistrosWizardDesdePlantilla/)
    assert.match(app, /sicoeRegistroDesdeItemPlantilla/)
    assert.match(app, /wizardRegistrosAviso/)
    assert.match(app, /registrosASubir/)
  })

  it('caso 10→3 y cuarta incompleta', () => {
    const regs = Array.from({ length: 10 }, (_, i) =>
      sicoeRegistroDesdeItemPlantilla({ nombre: `Act ${i + 1}` }),
    )
    for (const i of [0, 1, 2]) {
      regs[i] = {
        ...regs[i],
        unidad: 'm3',
        longitud: 2,
        observacion: 'ok',
        _fotoOk: true,
        foto_url: `https://cdn/x${i}.jpg`,
      }
    }
    const ok = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(ok.ok, true)
    assert.equal(ok.registros.length, 3)

    regs[3] = { ...regs[3], observacion: 'empezó' }
    const bad = sicoePrepararRegistrosWizardDesdePlantilla(regs)
    assert.equal(bad.ok, false)
    assert.equal(bad.codigo, 'incompleto')
  })

  it('diagnóstico backend de vacíos tipo plantilla', () => {
    assert.match(main, /registros-vacios-plantilla/)
  })
})
