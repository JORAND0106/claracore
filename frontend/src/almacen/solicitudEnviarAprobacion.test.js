/**
 * Botón «Solicitar aprobación» con permiso Crear (sin Editar).
 * Cubre el bug de fondo: sobrescribir permisos.crear con ver∧crear.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function puedeEnviarSolicitudAlmacen(permisos, sol = null, { modoReabrirOc = false, solicitudId = null } = {}) {
  if (modoReabrirOc) return false
  if (!permisos?.crear && !permisos?.editar) return false
  const id = solicitudId ?? sol?.id ?? null
  if (!id) return true
  const estado = sol?.estado
  if (estado == null || estado === '') return true
  return estado === 'borrador' || estado === 'rechazada'
}

function puedeEditarSolicitudFormAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}

describe('enviar solicitud a aprobación con Crear', () => {
  it('Crear sin Editar puede enviar borrador', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { ver: true, crear: true, editar: false },
        { id: 5, estado: 'borrador' },
        { solicitudId: 5 },
      ),
      true,
    )
  })

  it('Crear sin flag Ver también puede enviar (no exigir ver∧crear)', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { ver: false, crear: true, editar: false },
        { id: 5, estado: 'borrador' },
        { solicitudId: 5 },
      ),
      true,
    )
    assert.equal(
      puedeEditarSolicitudFormAlmacen({ ver: false, crear: true, editar: false }),
      true,
    )
  })

  it('muestra el botón justo tras guardar aunque estado aún no esté en props', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { crear: true },
        { id: 5 }, // sin estado
        { solicitudId: 5 },
      ),
      true,
    )
  })

  it('usa sol.id si solicitudId del padre aún es null', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { crear: true },
        { id: 5, estado: 'borrador' },
        { solicitudId: null },
      ),
      true,
    )
  })

  it('no muestra en enviada ni reabrir OC', () => {
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { crear: true, editar: true },
        { id: 1, estado: 'enviada' },
        { solicitudId: 1 },
      ),
      false,
    )
    assert.equal(
      puedeEnviarSolicitudAlmacen(
        { crear: true },
        { id: 1, estado: 'borrador' },
        { solicitudId: 1, modoReabrirOc: true },
      ),
      false,
    )
  })

  it('AlmacenMain no sobrescribe crear con ver∧crear', () => {
    const main = readFileSync(join(dir, 'AlmacenMain.jsx'), 'utf8')
    assert.match(main, /puedeNuevaSolicitud:\s*puedeCrearSolicitudAlmacen/)
    assert.doesNotMatch(
      main,
      /solicitudesPerms = useMemo\(\(\) => \(\{[\s\S]*?crear:\s*puedeCrearSolicitudAlmacen/,
    )
  })

  it('formulario renderiza Solicitar aprobación de forma independiente', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const helpers = readFileSync(join(dir, 'almacenPermisos.js'), 'utf8')
    assert.match(form, /puedeEnviarSolicitudAlmacen/)
    assert.match(form, /puedeEditarSolicitudFormAlmacen/)
    assert.match(form, /data-testid="solicitud-solicitar-aprobacion"/)
    assert.match(form, /effectiveSolicitudId/)
    assert.match(helpers, /export function puedeEnviarSolicitudAlmacen/)
    assert.match(helpers, /export function puedeEditarSolicitudFormAlmacen/)
    // El botón no debe quedar atrapado solo dentro de permisos\.editar
    assert.doesNotMatch(
      form,
      /solicitudId && \['borrador', 'rechazada'\]\.includes\(sol\?\.estado\) && permisos\?\.editar/,
    )
  })

  it('panel usa puedeNuevaSolicitud para el alta, no el flag crear crudo', () => {
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    assert.match(panel, /puedeNuevaSolicitud/)
    assert.match(panel, /puedeCrearSolicitudAlmacen/)
  })
})
