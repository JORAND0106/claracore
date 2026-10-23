/**
 * Helpers para la ventana de registros por ítem (rejilla de tarjetas + detalle).
 * Sustituye el acordeón de SicoeReporteItemsTabla sin cambiar reglas de validación.
 */

import { listaFotosRegistro } from './sicoeFotosHelpers.js'

/** Colores de estado ya usados en la plataforma (puntos / tarjetas). */
export const COLOR_ESTADO_VALIDACION_UI = Object.freeze({
  Aprobado: '#10B981',
  Pendiente: '#F59E0B',
  Rechazado: '#EF4444',
  'No Revisado': '#3B82F6',
  'No Objeto de Cobro': '#374151',
})

/** Convención mínima mostrada en la ventana (sin texto adicional). */
export const ESTADOS_CONVENCION_VENTANA = Object.freeze([
  { key: 'Aprobado', label: 'Aprobado', color: COLOR_ESTADO_VALIDACION_UI.Aprobado },
  { key: 'Pendiente', label: 'Pendiente', color: COLOR_ESTADO_VALIDACION_UI.Pendiente },
  { key: 'Rechazado', label: 'Rechazado', color: COLOR_ESTADO_VALIDACION_UI.Rechazado },
  { key: 'No Revisado', label: 'No revisado', color: COLOR_ESTADO_VALIDACION_UI['No Revisado'] },
])

/**
 * Inventario de funciones del acordeón que la ventana debe conservar (paso 13).
 * Usado por pruebas de contrato de UI.
 */
export const SICOE_ACORDEON_FUNCIONES_REQUERIDAS = Object.freeze([
  'ver_editar_datos_registro',
  'validar_por_nivel_segun_permisos',
  'objeto_pago_subcontratista',
  'fotos',
  'graficos_esquema',
  'galerias',
  'adjuntos_via_comentarios',
  'coordenadas_topografia_hoja',
  'trazabilidad',
  'comentarios',
  'seleccion_masiva_desde_listado_items',
  'permisos_sellado_visibilidad_valores',
])

/** Iniciales a partir de nombre y apellidos (p. ej. "Luis López" → "LL"). */
export function inicialesDeNombre(nombre, apellidos = '') {
  const parts = `${nombre || ''} ${apellidos || ''}`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function colorDeEstadoValidacion(estado) {
  const e = String(estado || 'No Revisado').trim()
  if (e === 'No Objeto de Cobro') return COLOR_ESTADO_VALIDACION_UI.Rechazado
  return COLOR_ESTADO_VALIDACION_UI[e] || COLOR_ESTADO_VALIDACION_UI['No Revisado']
}

/**
 * Última validación del registro: nivel con fecha más reciente entre los ≠ No Revisado;
 * si no hay fechas, el nivel más alto con estado distinto de No Revisado.
 * @returns {{ nivel: number|null, estado: string, usuarioId: number|null, fecha: string|null, etiqueta: string }}
 */
export function ultimaValidacionRegistro(reg, nivelesActivos = [1, 2, 3, 4, 5, 6]) {
  const niveles = (nivelesActivos || [1, 2, 3, 4, 5, 6])
    .map((n) => Number(n))
    .filter((n) => n >= 1 && n <= 6)
  const candidatos = []
  for (const n of niveles) {
    const estado = String(reg?.[`nivel${n}_estado`] || '').trim() || 'No Revisado'
    if (estado === 'No Revisado') continue
    candidatos.push({
      nivel: n,
      estado,
      usuarioId: reg?.[`nivel${n}_usuario_id`] != null ? Number(reg[`nivel${n}_usuario_id`]) : null,
      fecha: reg?.[`nivel${n}_fecha`] || null,
    })
  }
  // Subcontratista (si aplica) cuenta como validación
  const subEst = String(reg?.sub_estado || '').trim()
  if (subEst && subEst !== 'No Revisado') {
    candidatos.push({
      nivel: 0,
      estado: subEst,
      usuarioId: reg?.sub_usuario_id != null ? Number(reg.sub_usuario_id) : null,
      fecha: reg?.sub_fecha || null,
      esSub: true,
    })
  }
  if (!candidatos.length) {
    return {
      nivel: null,
      estado: 'No Revisado',
      usuarioId: null,
      fecha: null,
      etiqueta: '—',
    }
  }
  candidatos.sort((a, b) => {
    const ta = a.fecha ? Date.parse(a.fecha) : 0
    const tb = b.fecha ? Date.parse(b.fecha) : 0
    if (ta !== tb) return tb - ta
    return (b.nivel || 0) - (a.nivel || 0)
  })
  const top = candidatos[0]
  const etiqueta = top.esSub ? 'Sub' : `N${top.nivel}`
  return {
    nivel: top.esSub ? null : top.nivel,
    estado: top.estado,
    usuarioId: top.usuarioId,
    fecha: top.fecha,
    etiqueta,
  }
}

/**
 * Etiqueta de tarjeta/detalle: "N2 · LL" o "N2" si no hay iniciales.
 */
export function etiquetaNivelIniciales(uv, usuariosById = {}) {
  if (!uv || uv.estado === 'No Revisado' || !uv.etiqueta || uv.etiqueta === '—') {
    return '—'
  }
  let iniciales = ''
  if (uv.usuarioId != null && usuariosById) {
    const u = usuariosById[uv.usuarioId] || usuariosById[String(uv.usuarioId)]
    if (u) iniciales = inicialesDeNombre(u.nombre, u.apellidos)
  }
  return iniciales ? `${uv.etiqueta} · ${iniciales}` : uv.etiqueta
}

/**
 * Frase del encabezado: "Estado del registro: Aprobado por N4 · OL"
 * @returns {{ prefijo: string, estado: string, color: string, sufijo: string }}
 */
export function fraseEstadoRegistro(uv, usuariosById = {}) {
  const estado = uv?.estado || 'No Revisado'
  const color = colorDeEstadoValidacion(estado)
  if (estado === 'No Revisado' || !uv?.etiqueta || uv.etiqueta === '—') {
    return {
      prefijo: 'Estado del registro:',
      estado: 'No revisado',
      color,
      sufijo: '',
    }
  }
  const etiqueta = etiquetaNivelIniciales(uv, usuariosById)
  return {
    prefijo: 'Estado del registro:',
    estado,
    color,
    sufijo: ` por ${etiqueta}`,
  }
}

/** ¿Mostrar el semáforo de validación? Se oculta solo si el estado actual del nivel es Aprobado. */
export function mostrarSemaforoValidacion(estadoActual) {
  const e = String(estadoActual || 'No Revisado').trim()
  return e !== 'Aprobado'
}

export function fotoMiniaturaRegistro(reg) {
  const lista = listaFotosRegistro(reg)
  if (lista.length) return String(lista[lista.length - 1].url || '').trim() || null
  const u = String(reg?.foto_url || '').trim()
  return u || null
}

export function indiceRegistroEnLista(regs, registroId) {
  if (registroId == null) return -1
  const token = String(registroId)
  return (regs || []).findIndex(
    (r) => String(r.id) === token || (r.numero_registro != null && String(r.numero_registro) === token),
  )
}

export function idRegistroSiguiente(regs, registroId) {
  const i = indiceRegistroEnLista(regs, registroId)
  if (i < 0 || i >= (regs || []).length - 1) return null
  return regs[i + 1]?.id ?? null
}

export function idRegistroAnterior(regs, registroId) {
  const i = indiceRegistroEnLista(regs, registroId)
  if (i <= 0) return null
  return regs[i - 1]?.id ?? null
}

/** Mapa id → usuario desde lista usuarios-contrato. */
export function mapaUsuariosPorId(lista) {
  const map = {}
  for (const u of lista || []) {
    if (u?.id == null) continue
    map[u.id] = u
    map[String(u.id)] = u
  }
  return map
}
