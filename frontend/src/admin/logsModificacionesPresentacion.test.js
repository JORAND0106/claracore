import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  accionLegible,
  camposDeLog,
  cargaDeLog,
  registroDeLog,
} from './logsModificacionesPresentacion.js'

const vista = readFileSync(new URL('./SeccionLogs.jsx', import.meta.url), 'utf8')

describe('presentación de modificaciones', () => {
  it('muestra todos los campos de una edición con anterior y nuevo', () => {
    const log = {
      accion: 'EDITAR',
      modulo: 'Presupuesto',
      detalle: {
        registro: 'Ítem de presupuesto · Excavación',
        campos: [
          { etiqueta: 'Cantidad', anterior: '10', nuevo: '12' },
          { etiqueta: 'Descripción', anterior: 'Vieja', nuevo: 'Nueva' },
        ],
      },
    }
    assert.equal(accionLegible(log), 'Edición')
    assert.equal(registroDeLog(log), 'Ítem de presupuesto · Excavación')
    const campos = camposDeLog(log)
    assert.equal(campos.length, 2)
    assert.deepEqual(campos[0], { etiqueta: 'Cantidad', anterior: '10', nuevo: '12' })
  })

  it('reconoce una carga masiva y su identificador', () => {
    const log = {
      accion: 'CARGA_MASIVA',
      detalle: { operacion: 'CREAR', carga_id: 'abc12345-zzzz', registro: 'Rasante · 0+100' },
    }
    assert.equal(accionLegible(log), 'Carga masiva · Creación')
    assert.equal(cargaDeLog(log).corto, 'abc12345')
    assert.equal(registroDeLog(log), 'Rasante · 0+100')
  })
})

describe('vista de Logs', () => {
  it('pide modificaciones, exporta Excel y no ofrece editar ni borrar el log', () => {
    assert.match(vista, /categoria: 'datos'/)
    assert.match(vista, /\/logs\/export\.xlsx/)
    assert.match(vista, /user\?\.contrato_id\) params\.set\('contrato_id'/)
    assert.match(vista, /title="Descargar Excel"/)
    assert.match(vista, /title="Limpiar filtros"/)
    assert.match(vista, /title="Actualizar"/)
    assert.doesNotMatch(vista, /\/logs\/export\.csv/)
    assert.doesNotMatch(vista, /Eliminar entrada/)
    assert.doesNotMatch(vista, /Editar log/)
    assert.doesNotMatch(vista, /position:\s*['"]fixed/)
  })

  it('los botones de acción son solo icono con tooltip y la vista responde al viewport', () => {
    assert.match(vista, /useClaraViewport/)
    assert.match(vista, /aria-label=\{title\}/)
    assert.doesNotMatch(vista, />\s*Limpiar\s*</)
    assert.doesNotMatch(vista, />\s*Actualizar\s*</)
    assert.doesNotMatch(vista, />\s*Excel\s*</)
  })
})
