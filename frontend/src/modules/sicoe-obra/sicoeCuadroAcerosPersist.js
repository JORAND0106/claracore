/**
 * Persistencia del cuadro de aceros en un reporte SicoeObra:
 * sube foto(s) + PNG una vez y crea/actualiza/elimina un registro por posición.
 */
import { prepararEsquemaParaUpload, prepararImagenParaUpload, sha256Hex } from '../../comprimirImagen'
import { dataUriToFile } from '../../components/esquema/esquemaSaveExtras.js'
import {
  agregarEntradaFotoHistorial,
  fotosPayloadDesdeHistorial,
  listaFotosRegistro,
} from './sicoeFotosHelpers.js'
import {
  agregarEntradaGraficoHistorial,
  graficosPayloadDesdeHistorial,
} from './sicoeGraficosHelpers.js'
import {
  sicoePlanSyncCuadroAceros,
  sicoeRegistrosDesdeCuadro,
} from './sicoeCuadroAceros.js'

async function sicoeNumeroDesdeNext(res) {
  const data = await res.json().catch(() => ({}))
  if (typeof data === 'number') return data
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0]
  if (data?.numero != null) return Number(data.numero)
  if (data?.data != null) {
    const d = data.data
    if (typeof d === 'number') return d
    if (Array.isArray(d) && typeof d[0] === 'number') return d[0]
  }
  return null
}

async function subirUnaFoto({ API_URL, contratoId, hdrs, file, observacion }) {
  const prepared = await prepararImagenParaUpload(file)
  const digest = await sha256Hex(prepared)
  const fdCheck = new FormData()
  fdCheck.append('content_hash', digest)
  const checkRes = await fetch(`${API_URL}/sicoe-obra/${contratoId}/check-foto-hash`, {
    method: 'POST',
    headers: { Authorization: hdrs.Authorization },
    body: fdCheck,
  })
  const checkData = await checkRes.json().catch(() => ({}))
  if (checkRes.ok && checkData?.exists && checkData.url) {
    return {
      url: checkData.url,
      numero: checkData.numero ?? null,
      creado_en: new Date().toISOString(),
      origen: 'galeria',
    }
  }
  const resN = await fetch(`${API_URL}/sicoe-obra/${contratoId}/next-foto`, {
    method: 'POST', headers: hdrs,
  })
  if (!resN.ok) throw new Error('No se obtuvo el consecutivo de foto')
  const numero = await sicoeNumeroDesdeNext(resN)
  if (numero == null) throw new Error('No se obtuvo el consecutivo de foto')
  const fd = new FormData()
  fd.append('file', prepared)
  fd.append('numero', String(numero))
  fd.append('descripcion', observacion || `Foto-${numero}`)
  fd.append('content_hash', digest)
  const up = await fetch(`${API_URL}/sicoe-obra/${contratoId}/upload-foto`, {
    method: 'POST',
    headers: { Authorization: hdrs.Authorization },
    body: fd,
  })
  if (!up.ok) {
    const body = await up.json().catch(() => ({}))
    const detail = body?.detail
    if (up.status === 409 && typeof detail === 'object' && detail?.url) {
      return {
        url: detail.url,
        numero: detail.numero ?? null,
        creado_en: new Date().toISOString(),
        origen: 'galeria',
      }
    }
    throw new Error(
      typeof detail === 'object'
        ? (detail?.message || 'No se pudo subir la foto.')
        : (typeof detail === 'string' ? detail : 'No se pudo subir la foto.'),
    )
  }
  const data = await up.json()
  return {
    url: data.url,
    numero: data.numero ?? numero,
    creado_en: new Date().toISOString(),
    origen: 'manual',
  }
}

async function subirPngCuadro({ API_URL, contratoId, hdrs, pngAdjunto }) {
  if (!pngAdjunto) return null
  let file = pngAdjunto.blob
    ? new File([pngAdjunto.blob], pngAdjunto.nombre || `despiece_${Date.now()}.png`, { type: 'image/png' })
    : dataUriToFile(pngAdjunto.dataUri, pngAdjunto.nombre || `despiece_${Date.now()}.png`, 'image/png')
  if (!file) throw new Error('No se pudo generar el PNG del cuadro.')
  file = await prepararEsquemaParaUpload(file)
  const resN = await fetch(`${API_URL}/sicoe-obra/${contratoId}/next-grafico`, {
    method: 'POST', headers: hdrs,
  })
  if (!resN.ok) throw new Error('No se obtuvo el consecutivo de gráfico')
  const numero = await sicoeNumeroDesdeNext(resN)
  if (numero == null) throw new Error('No se obtuvo el consecutivo de gráfico')
  const fd = new FormData()
  fd.append('file', file)
  fd.append('numero', String(numero))
  fd.append('descripcion', pngAdjunto.nombre || 'Cuadro de aceros')
  const up = await fetch(`${API_URL}/sicoe-obra/${contratoId}/upload-grafico`, {
    method: 'POST',
    headers: { Authorization: hdrs.Authorization },
    body: fd,
  })
  if (!up.ok) {
    const err = await up.json().catch(() => ({}))
    throw new Error(typeof err?.detail === 'string' ? err.detail : 'No se pudo subir el PNG del cuadro.')
  }
  const data = await up.json()
  return {
    url: data.url,
    numero: data.numero ?? numero,
    creado_en: new Date().toISOString(),
    origen: 'esquema-calculo',
    kind: 'despiece-acero',
    mime: 'image/png',
    nombre: pngAdjunto.nombre || null,
  }
}

async function nextNumeroRegistro({ API_URL, contratoId, hdrs }) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/next-registro`, {
    method: 'POST', headers: hdrs,
  })
  if (!res.ok) throw new Error('No se obtuvo consecutivo de registro')
  const n = await sicoeNumeroDesdeNext(res)
  if (n == null) throw new Error('No se obtuvo consecutivo de registro')
  return n
}

function camposApiRegistro(draft) {
  return {
    nombre: draft.nombre || null,
    descripcion: draft.descripcion || draft.observacion || null,
    observacion: draft.observacion || null,
    unidad: 'kg',
    es_varilla: true,
    diametro_varilla: draft.diametro_varilla,
    peso_kg_m: draft.peso_kg_m,
    longitud: draft.longitud,
    ancho: null,
    espesor: null,
    cantidad: draft.cantidad,
    cantidad_total: draft.cantidad_total,
    foto_url: draft.foto_url ?? null,
    foto_numero: draft.foto_numero ?? null,
    foto_descripcion: draft.foto_descripcion ?? null,
    fotos_historial: draft.fotos_historial || [],
    grafico_url: draft.grafico_url ?? null,
    grafico_numero: draft.grafico_numero ?? null,
    grafico_descripcion: draft.grafico_descripcion ?? null,
    graficos_historial: draft.graficos_historial || [],
    cuadro_aceros_id: draft.cuadro_aceros_id,
    cuadro_aceros_nombre: draft.cuadro_aceros_nombre,
    cuadro_aceros_posicion: draft.cuadro_aceros_posicion,
    cuadro_aceros_posicion_id: draft.cuadro_aceros_posicion_id,
    cuadro_aceros_schedule: draft.cuadro_aceros_schedule,
  }
}

/**
 * Carga inicial o sync de edición del cuadro en un reporte ya persistido.
 * @returns {{ ok: boolean, error?: string, cuadroId?: string, ids?: number[] }}
 */
export async function sicoePersistirCuadroAcerosEnReporte({
  API_URL,
  contratoId,
  reporteId,
  hdrs,
  schedule,
  fotoFiles = [],
  fotosExistentes = [],
  pngAdjunto = null,
  registrosExistentes = [],
  placeholderRegistroId = null,
}) {
  const mapped = sicoeRegistrosDesdeCuadro(schedule)
  if (!mapped.ok) return { ok: false, error: mapped.error }

  let histFotos = Array.isArray(fotosExistentes)
    ? fotosExistentes.filter((f) => f?.url && !String(f.url).startsWith('blob:'))
    : []
  for (const file of fotoFiles || []) {
    const entrada = await subirUnaFoto({
      API_URL, contratoId, hdrs, file,
      observacion: schedule?.nombre || 'Cuadro de aceros',
    })
    histFotos = agregarEntradaFotoHistorial(histFotos, entrada)
  }
  if (!histFotos.length) {
    return { ok: false, error: 'Agregue una foto para el cuadro.' }
  }
  const fotoPayload = fotosPayloadDesdeHistorial(histFotos)

  const grafEntrada = await subirPngCuadro({ API_URL, contratoId, hdrs, pngAdjunto })
  if (!grafEntrada) return { ok: false, error: 'No se generó el PNG del cuadro.' }
  const graficoPayload = graficosPayloadDesdeHistorial(
    agregarEntradaGraficoHistorial([], grafEntrada),
  )

  const delCuadros = (registrosExistentes || []).filter(
    (r) => String(r.cuadro_aceros_id || '') === String(mapped.cuadroId),
  )
  const plan = sicoePlanSyncCuadroAceros({
    schedule: { ...schedule, id: mapped.cuadroId },
    registrosExistentes: delCuadros,
    fotoPayload,
    graficoPayload,
  })
  if (!plan.ok) return { ok: false, error: plan.error }

  const ids = []

  for (const { id, patch } of plan.actualizar) {
    const body = {
      reporte_id: reporteId,
      ...camposApiRegistro(patch),
      item_numero: patch.item_numero ?? null,
      item_descripcion: patch.item_descripcion ?? null,
      item_listado_id: patch.item_listado_id ?? null,
      vlr_unitario: patch.vlr_unitario ?? null,
      costo_directo: patch.costo_directo ?? null,
      capitulo: patch.capitulo ?? null,
      competencia: patch.competencia ?? null,
      desde_cuadro_aceros: true,
    }
    // numero_registro lo exige el PUT: tomar del existente
    const prev = delCuadros.find((r) => String(r.id) === String(id))
    if (prev?.numero_registro != null) body.numero_registro = prev.numero_registro
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/${id}`, {
      method: 'PUT',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err?.detail === 'string' ? err.detail : `Error actualizando registro ${id}`)
    }
    ids.push(id)
  }

  let crearList = [...plan.crear]
  // Reutilizar el placeholder vacío (nuevo registro que disparó el popup) como 1.ª posición.
  if (placeholderRegistroId != null && crearList.length) {
    const first = crearList.shift()
    const prev = (registrosExistentes || []).find((r) => String(r.id) === String(placeholderRegistroId))
    const body = {
      reporte_id: reporteId,
      numero_registro: prev?.numero_registro,
      ...camposApiRegistro(first),
      desde_cuadro_aceros: true,
    }
    if (body.numero_registro == null) {
      body.numero_registro = await nextNumeroRegistro({ API_URL, contratoId, hdrs })
    }
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros/${placeholderRegistroId}`, {
      method: 'PUT',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err?.detail === 'string' ? err.detail : 'Error actualizando registro placeholder')
    }
    ids.push(placeholderRegistroId)
  }

  for (const draft of crearList) {
    const numero = await nextNumeroRegistro({ API_URL, contratoId, hdrs })
    const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/registros`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporte_id: reporteId,
        numero_registro: numero,
        ...camposApiRegistro(draft),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err?.detail === 'string' ? err.detail : 'Error creando registro del cuadro')
    }
    const row = await res.json().catch(() => ({}))
    if (row?.id != null) ids.push(row.id)
  }

  for (const id of plan.eliminarIds) {
    if (placeholderRegistroId != null && String(id) === String(placeholderRegistroId)) continue
    const res = await fetch(
      `${API_URL}/sicoe-obra/${contratoId}/registros/${id}/dev?desde_cuadro_aceros=1`,
      { method: 'DELETE', headers: hdrs },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err?.detail === 'string' ? err.detail : `Error eliminando registro ${id}`)
    }
  }

  return { ok: true, cuadroId: mapped.cuadroId, ids }
}

/**
 * Expande un índice de registro del wizard con N borradores del cuadro (sin API).
 */
export function sicoeExpandirRegistrosWizardConCuadro({
  registros,
  indice,
  schedule,
  fotoPayload,
  graficoPayload,
  stampLoc = {},
}) {
  const out = sicoeRegistrosDesdeCuadro(schedule, { fotoPayload, graficoPayload })
  if (!out.ok) return { ok: false, error: out.error, registros }
  const base = registros[indice] || {}
  const nuevos = out.registros.map((r) => ({
    ...stampLoc,
    ...base,
    ...r,
    id: undefined,
    item_numero: null,
    item_descripcion: null,
    _fotoOk: true,
    _grafOk: true,
  }))
  const next = [...registros]
  next.splice(indice, 1, ...nuevos)
  return { ok: true, registros: next, cuadroId: out.cuadroId }
}

export async function sicoeSubirFotosYPngCuadroLocal({
  API_URL, contratoId, hdrs, fotoFiles, fotosExistentes, pngAdjunto, observacion,
}) {
  let hist = Array.isArray(fotosExistentes)
    ? fotosExistentes.filter((f) => f?.url && !String(f.url).startsWith('blob:'))
    : []
  for (const file of fotoFiles || []) {
    const entrada = await subirUnaFoto({
      API_URL, contratoId, hdrs, file, observacion,
    })
    hist = agregarEntradaFotoHistorial(hist, entrada)
  }
  const fotoPayload = fotosPayloadDesdeHistorial(hist)
  const grafEntrada = await subirPngCuadro({ API_URL, contratoId, hdrs, pngAdjunto })
  const graficoPayload = grafEntrada
    ? graficosPayloadDesdeHistorial(agregarEntradaGraficoHistorial([], grafEntrada))
    : {}
  return { fotoPayload, graficoPayload, histFotos: hist }
}

export { listaFotosRegistro }
