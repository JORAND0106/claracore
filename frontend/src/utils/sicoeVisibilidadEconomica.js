/**
 * Visibilidad de valores económicos SicoeObra / ClaraGIS.
 * Alineado con determinarNivelValidacion (App.jsx) y ocultar_costo_directo_reportes (BE).
 */
import { esVistaSubcontratista } from './empresaUsuario.js'

/**
 * @param {object|null|undefined} usuario
 * @param {{ puedeValidarBase?: boolean }} [opts]
 * @returns {boolean}
 */
export function sicoeUsuarioVeValoresEconomicos(usuario, opts = {}) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .trim()
    .toLowerCase()
    .replace(/í/g, 'i')
  const cargo = String(usuario?.cargo_nombre || usuario?.cargo || '')
    .trim()
    .toLowerCase()
  const esOperativoContratista = rol === 'operativo contratista'
  const esOperativoInterventoria = rol === 'operativo interventoria'
  const esInterventoria = rol.includes('intervent')
  const puedeValidarBase = !!opts.puedeValidarBase
  const esApoyoTecnico =
    esInterventoria
    && !puedeValidarBase
    && (cargo.includes('apoyo') || cargo.includes('técnico') || cargo.includes('tecnico'))
  const esSubcontratista = esVistaSubcontratista(usuario)
  // Subcontratista: ve precios propios (overlay BE); no ve economía del contrato principal.
  const verContrato = !(esOperativoContratista || esOperativoInterventoria || esApoyoTecnico || esSubcontratista)
  const verSub = !!esSubcontratista
  return verContrato || verSub
}
