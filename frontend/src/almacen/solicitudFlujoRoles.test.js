/**
 * Pruebas puras del flujo por rol (sin imports Vite sin extensión).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

function normRol(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function esContratistaGerencialUsuario(usuario) {
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'contratista gerencial') return true
  if (rol.includes('contrat') && rol.includes('gerencial') && !rol.includes('intervent')) return true
  return false
}

function solicitudPuedeValidar(sol, permisos) {
  const esGerencial = Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
  return Boolean(
    permisos?.validar
    && esGerencial
    && sol?.estado === 'enviada'
    && !(sol?.tiene_orden_compra || sol?.orden_compra?.id),
  )
}

function validateSolicitudItems(items) {
  const errors = []
  items.forEach((it, idx) => {
    const n = idx + 1
    if (!it.presupuesto_capitulo || !it.presupuesto_item) {
      errors.push(`Línea ${n}: seleccione capítulo e ítem de cobro.`)
    }
    const desc = String(it.descripcion_solicitada || '').trim()
    if (desc.length < 3) {
      errors.push(`Línea ${n}: describa el material que necesita (mínimo 3 caracteres).`)
    }
    if (!it.pk_id) errors.push(`Línea ${n}: seleccione la ubicación PK-ID en el mapa.`)
    if (!it.presupuesto_id) errors.push(`Línea ${n}: seleccione el registro de presupuesto en la grilla.`)
    if (!it.cantidad || Number(it.cantidad) <= 0) {
      errors.push(`Línea ${n}: indique una cantidad mayor a cero.`)
    }
  })
  return errors.length
    ? { ok: false, message: errors.join('\n') }
    : { ok: true }
}

describe('flujo solicitud por rol', () => {
  it('solo Contratista Gerencial es gerencial', () => {
    assert.equal(esContratistaGerencialUsuario({ rol_nombre: 'Contratista Gerencial' }), true)
    assert.equal(esContratistaGerencialUsuario({ rol_nombre: 'Contratista' }), false)
    assert.equal(esContratistaGerencialUsuario({ rol_nombre: 'Interventoría Gerencial' }), false)
  })

  it('aprobación exige validar + gerencial + enviada', () => {
    const sol = { estado: 'enviada' }
    assert.equal(solicitudPuedeValidar(sol, { validar: true, esContratistaGerencial: false }), false)
    assert.equal(solicitudPuedeValidar(sol, { validar: true, esContratistaGerencial: true }), true)
  })

  it('creación exige texto libre, no insumo', () => {
    const base = {
      presupuesto_capitulo: '1',
      presupuesto_item: '1.1',
      pk_id: 'PK-1',
      presupuesto_id: 10,
      cantidad: 2,
    }
    assert.equal(validateSolicitudItems([{ ...base, descripcion_solicitada: '' }]).ok, false)
    assert.equal(validateSolicitudItems([{ ...base, descripcion_solicitada: 'Cemento gris' }]).ok, true)
  })
})
