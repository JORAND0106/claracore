/**
 * Botón «Solicitar aprobación» visible con permiso Crear (sin Editar).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

/** Réplica de puedeEnviarSolicitudAlmacen (evita imports Vite sin extensión). */
function puedeEnviarSolicitudAlmacen(permisos, sol = null, { modoReabrirOc = false, solicitudId = null } = {}) {
  if (modoReabrirOc) return false
  if (!permisos?.crear && !permisos?.editar) return false
  const id = solicitudId ?? sol?.id
  if (!id) return Boolean(permisos?.crear || permisos?.editar)
  return ['borrador', 'rechazada'].includes(sol?.estado)
}

describe('enviar solicitud a aprobación con Crear', () => {
  it('Crear sin Editar puede enviar borrador', () => {
    const p = { ver: true, crear: true, editar: false }
    assert.equal(
      puedeEnviarSolicitudAlmacen(p, { id: 4, estado: 'borrador' }, { solicitudId: 4 }),
      true,
    )
  })

  it('solo Ver no puede enviar', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { ver: true, crear: false, editar: false },
        { id: 1, estado: 'borrador' },
        { solicitudId: 1 },
      ),
      false,
    )
  })

  it('Editar sin Crear también puede enviar', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { ver: true, crear: false, editar: true },
        { id: 1, estado: 'borrador' },
        { solicitudId: 1 },
      ),
      true,
    )
  })

  it('no muestra el botón en enviada/aprobada ni en reabrir OC', () => {
    const p = { crear: true, editar: true }
    assert.equal(
      puedeEnviarSolicitudAlmacen(p, { id: 1, estado: 'enviada' }, { solicitudId: 1 }),
      false,
    )
    assert.equal(
      puedeEnviarSolicitudAlmacen(p, { id: 1, estado: 'borrador' }, {
        solicitudId: 1,
        modoReabrirOc: true,
      }),
      false,
    )
  })

  it('formulario y API usan Crear o Editar (no solo Editar)', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const helpers = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    const perms = readFileSync(join(dir, '../../../backend/almacen_permissions.py'), 'utf8')
    assert.match(helpers, /export function puedeEnviarSolicitudAlmacen/)
    assert.match(form, /puedeEnviarSolicitudAlmacen/)
    assert.match(form, /permisos\?\.editar \|\| permisos\?\.crear/)
    assert.doesNotMatch(
      form,
      /solicitudId && \['borrador', 'rechazada'\]\.includes\(sol\?\.estado\) && permisos\?\.editar/,
    )
    assert.match(routes, /require_crear_o_editar_almacen/)
    assert.match(routes, /def route_enviar_solicitud[\s\S]*?require_crear_o_editar_almacen/)
    assert.match(routes, /def route_update_solicitud[\s\S]*?require_crear_o_editar_almacen/)
    assert.match(perms, /def require_crear_o_editar_almacen/)
  })
})
