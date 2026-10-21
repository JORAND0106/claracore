import test from 'node:test'
import assert from 'node:assert/strict'
import { slotFirmaPendienteCcd, etiquetaSlotFirmaCcd } from './firmaIconoCcd.js'

const CODIGOS = [
  'CC-SUB-001',
  'CC-SUB-002',
  'CC-SEM-001',
  'CC-SEM-002',
  'CC-MES-001',
  'CC-MES-002',
  'CC-GER-001',
]

const VACIAS = {
  elaboro: null,
  elaboro2: null,
  reviso: null,
  reviso2: null,
  aprobo: null,
  tabla_disponible: true,
}

function cfgBase() {
  return {
    elaboro_usuario_id: 11,
    elaboro_nombre: 'Ana Elaboró',
    reviso_usuario_id: 22,
    reviso_nombre: 'Luis Revisó',
    aprobo_usuario_id: 33,
    aprobo_nombre: 'Pedro Aprobó',
  }
}

function usuario(id, nombre, apellidos) {
  return { id, nombre, apellidos }
}

test('cada formato del inventario muestra el ícono solo en el rol asignado', () => {
  for (const codigo of CODIGOS) {
    const cfg = cfgBase()
    const firmas = { ...VACIAS }
    const elaboro = slotFirmaPendienteCcd({ codigo, cfg, firmas, usuario: usuario(11, 'Ana', 'Elaboró') })
    const reviso = slotFirmaPendienteCcd({ codigo, cfg, firmas, usuario: usuario(22, 'Luis', 'Revisó') })
    const aprobo = slotFirmaPendienteCcd({ codigo, cfg, firmas, usuario: usuario(33, 'Pedro', 'Aprobó') })
    const otro = slotFirmaPendienteCcd({ codigo, cfg, firmas, usuario: usuario(44, 'Nadie', 'Asignado') })
    assert.equal(elaboro, 'elaboro', codigo)
    assert.equal(reviso, 'reviso', codigo)
    if (codigo.startsWith('CC-SUB-')) {
      assert.equal(aprobo, null, `${codigo} Aprobó es el subcontratista`)
    } else {
      assert.equal(aprobo, 'aprobo', codigo)
    }
    assert.equal(otro, null, codigo)
    assert.equal(etiquetaSlotFirmaCcd(elaboro), 'Elaboró')
  }
})

test('un rol firmado oculta el ícono y el cambio de biblioteca mueve el pendiente', () => {
  const codigo = 'CC-MES-001'
  const firmado = { ...VACIAS, elaboro: { registrada: true, usuario_id: 11, created_at: '2026-10-21' } }
  assert.equal(
    slotFirmaPendienteCcd({ codigo, cfg: cfgBase(), firmas: firmado, usuario: usuario(11, 'Ana', 'Elaboró') }),
    null,
  )
  const ambos = {
    ...cfgBase(),
    reviso_usuario_id: 11,
  }
  assert.equal(
    slotFirmaPendienteCcd({ codigo, cfg: ambos, firmas: firmado, usuario: usuario(11, 'Ana', 'Elaboró') }),
    'reviso',
  )
  const movido = { ...cfgBase(), elaboro_usuario_id: 55 }
  assert.equal(
    slotFirmaPendienteCcd({ codigo, cfg: movido, firmas: { ...VACIAS }, usuario: usuario(11, 'Ana', 'Elaboró') }),
    null,
  )
  assert.equal(
    slotFirmaPendienteCcd({ codigo, cfg: movido, firmas: { ...VACIAS }, usuario: usuario(55, 'Nueva', 'Elaboró') }),
    'elaboro',
  )
  assert.equal(
    slotFirmaPendienteCcd({ codigo, cfg: movido, firmas: firmado, usuario: usuario(55, 'Nueva', 'Elaboró') }),
    null,
  )
})

test('sin firmas cargadas no muestra el ícono; entidades externas nunca', () => {
  assert.equal(
    slotFirmaPendienteCcd({ codigo: 'CC-SEM-001', cfg: cfgBase(), firmas: null, usuario: usuario(11, 'Ana', 'Elaboró') }),
    null,
  )
  assert.equal(
    slotFirmaPendienteCcd({
      codigo: 'FO-IDU-EO-04-V2',
      formato: { grupo_ccd: 'entidades_externas', slots_firma: [{ id: 'elaboro', origen: 'configuracion' }] },
      cfg: cfgBase(),
      firmas: { ...VACIAS },
      usuario: usuario(11, 'Ana', 'Elaboró'),
    }),
    null,
  )
})

test('sin usuario_id el nombre exacto asigna el rol; un parecido que no está contenido no', () => {
  const cfg = {
    elaboro_usuario_id: null,
    elaboro_nombre: 'Ana María Pérez',
    reviso_usuario_id: 22,
    reviso_nombre: 'Ana María Pérez',
  }
  assert.equal(
    slotFirmaPendienteCcd({
      codigo: 'CC-GER-001',
      cfg,
      firmas: { ...VACIAS },
      usuario: usuario(11, 'Ana María', 'Pérez'),
    }),
    'elaboro',
  )
  assert.equal(
    slotFirmaPendienteCcd({
      codigo: 'CC-GER-001',
      cfg: { elaboro_usuario_id: null, elaboro_nombre: 'Pedro Gómez' },
      firmas: { ...VACIAS },
      usuario: usuario(11, 'Pedro', 'González'),
    }),
    null,
  )
})
