/**
 * Helpers de bloques de evento embebidos en Reporte Diario.
 */
import {
  actividadesFromDetalle,
  actividadesParaPayload,
  emptyActividadRow,
} from './bitacoraEventoActividades.js'
import { eventoTieneDestinatario } from './bitacoraConstants.js'
import { emptyVisitanteRow, visitantesFromDetalle } from './visitantesEventoHelpers.js'

function nuevoBloqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ev-${Date.now()}-${Math.random()}`
}

/** Detalle vacío según tipo (misma forma que BitacoraEntradaEditor). */
export function emptyEventoDetalle(tipo) {
  const base = { actividades: [emptyActividadRow()] }
  if (tipo === 'incidente_sst') {
    return {
      ...base,
      descripcion_incidente: '',
      lugar: '',
      personas_involucradas: '',
      acciones_inmediatas: '',
      gravedad: 'leve',
      requiere_seguimiento: false,
    }
  }
  if (tipo === 'visita_terceros') {
    return {
      ...base,
      visitantes: '',
      visitantes_lista: [emptyVisitanteRow()],
      entidad: '',
      motivo: '',
    }
  }
  return base
}

/** Bloque nuevo para «+ Agregar evento». */
export function emptyEventoBloque() {
  return {
    id: nuevoBloqueId(),
    evento_tipo: 'reporte_actividades',
    dirigido_a: '',
    cuerpo_html: '',
    evento_detalle: { actividades: [emptyActividadRow()] },
    imagenes: [],
    created_at: new Date().toISOString(),
  }
}

function normalizeBloque(item) {
  if (!item || typeof item !== 'object') return null
  const tipo = String(item.evento_tipo || '').trim() || 'reporte_actividades'
  const base = item.evento_detalle && typeof item.evento_detalle === 'object'
    ? { ...emptyEventoDetalle(tipo), ...item.evento_detalle }
    : emptyEventoDetalle(tipo)
  const withActs = { ...base, actividades: actividadesFromDetalle(base) }
  let detalle = withActs
  if (tipo === 'visita_terceros' || Array.isArray(base.visitantes_lista) || base.visitantes) {
    detalle = { ...withActs, visitantes_lista: visitantesFromDetalle(base) }
  }
  return {
    id: String(item.id || '').trim() || nuevoBloqueId(),
    evento_tipo: tipo,
    dirigido_a: item.dirigido_a || '',
    cuerpo_html: item.cuerpo_html || '',
    evento_detalle: detalle,
    imagenes: Array.isArray(item.imagenes) ? item.imagenes : [],
    created_at: item.created_at || new Date().toISOString(),
    created_by: item.created_by,
    created_by_nombre: item.created_by_nombre || null,
    legacy_entrada_id: item.legacy_entrada_id ?? null,
  }
}

/** Normaliza `entrada.eventos` para el editor. */
export function eventosFromEntrada(entrada) {
  const raw = Array.isArray(entrada?.eventos) ? entrada.eventos : []
  return raw.map(normalizeBloque).filter(Boolean)
}

function imagenesParaPayload(imagenes) {
  if (!Array.isArray(imagenes)) return []
  return imagenes
    .filter((im) => im && (im.data_uri || im.data_base64 || im.blob_path || im.url))
    .map((im) => {
      const row = {
        nombre: im.nombre || `foto-${Date.now()}.png`,
        mime_type: im.mime_type || 'image/png',
        origen: im.origen || 'archivo',
      }
      // Conservar data_uri de pendientes; no enviar flag `pending`.
      const dataUri = im.data_uri || im.data_base64
      if (dataUri) row.data_uri = dataUri
      if (im.blob_path) row.blob_path = im.blob_path
      if (im.url) row.url = im.url
      if (im.content_hash) row.content_hash = im.content_hash
      if (im.pie) row.pie = im.pie
      if (im.kind) row.kind = im.kind
      return row
    })
}

function visitantesListaParaPayload(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((v) => v && String(v.nombre || '').trim())
    .map((v) => ({
      visitante_id: v.visitante_id ?? null,
      usuario_id: v.usuario_id ?? null,
      nombre: String(v.nombre).trim(),
      cargo: String(v.cargo || '').trim(),
      origen: v.origen || (v.usuario_id ? 'plataforma' : 'catalogo'),
    }))
}

/** Limpia bloques para enviar al API del Diario. */
export function eventosParaPayload(eventos) {
  if (!Array.isArray(eventos)) return []
  return eventos
    .map((ev) => {
      if (!ev || typeof ev !== 'object') return null
      const tipo = String(ev.evento_tipo || '').trim()
      if (!tipo) return null
      const prev = ev.evento_detalle && typeof ev.evento_detalle === 'object'
        ? { ...ev.evento_detalle }
        : {}
      const detalle = { ...prev }
      detalle.actividades = actividadesParaPayload(prev.actividades)
      if (tipo === 'visita_terceros') {
        const lista = visitantesListaParaPayload(prev.visitantes_lista)
        detalle.visitantes_lista = lista
        detalle.visitantes = lista
          .map((v) => (v.cargo ? `${v.nombre} (${v.cargo})` : v.nombre))
          .join(', ')
      }
      return {
        id: ev.id || nuevoBloqueId(),
        evento_tipo: tipo,
        dirigido_a: eventoTieneDestinatario(tipo) ? String(ev.dirigido_a || '').trim() : '',
        cuerpo_html: ev.cuerpo_html || '',
        evento_detalle: detalle,
        imagenes: imagenesParaPayload(ev.imagenes),
        created_at: ev.created_at || new Date().toISOString(),
        ...(ev.created_by != null ? { created_by: ev.created_by } : {}),
        ...(ev.created_by_nombre ? { created_by_nombre: ev.created_by_nombre } : {}),
        ...(ev.legacy_entrada_id != null ? { legacy_entrada_id: ev.legacy_entrada_id } : {}),
      }
    })
    .filter(Boolean)
}
