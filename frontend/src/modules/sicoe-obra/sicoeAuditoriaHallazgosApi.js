/**
 * API del Ambiente de Auditoría (hallazgos del contrato).
 */
import { usuarioVeAuditoriaTraslapos } from './sicoeAuditoriaTraslapos'
import { mensajeErrorCarga } from './sicoeAuditoriaMensajes'

function httpError(message, status) {
  const e = new Error(message)
  e.status = status
  e.httpStatus = status
  return e
}

async function fetchJsonOrThrow(url, opts, fallbackEs, context) {
  let res
  try {
    res = await fetch(url, opts)
  } catch (e) {
    throw httpError(mensajeErrorCarga(e, fallbackEs, { context }), 0)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw httpError(
      mensajeErrorCarga(
        { message: txt || `Error ${res.status}`, status: res.status },
        fallbackEs,
        { status: res.status, context },
      ),
      res.status,
    )
  }
  try {
    return await res.json()
  } catch (e) {
    throw httpError(
      mensajeErrorCarga(e, 'La respuesta del servidor no es válida.', { status: res.status, context }),
      res.status,
    )
  }
}

export async function fetchAuditoriaHallazgos({
  API_URL,
  contratoId,
  token,
  sincronizar = false,
  usuario,
}) {
  if (!usuarioVeAuditoriaTraslapos(usuario)) {
    return { ok: true, oculto_por_rol: true, hallazgos: [], resumen: {} }
  }
  const q = sincronizar ? '?sincronizar=true' : ''
  return fetchJsonOrThrow(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
    'No se pudieron cargar los hallazgos.',
    'carga',
  )
}

/**
 * Sincroniza hallazgos (traslapos/vacíos). Por defecto NO regenera todas las huellas
 * (evita timeout en tablet/móvil). Pass incluirHuellas=true para refresco completo.
 */
export async function syncAuditoriaHallazgos({
  API_URL,
  contratoId,
  token,
  usuario,
  incluirHuellas = false,
}) {
  if (!usuarioVeAuditoriaTraslapos(usuario)) {
    return { ok: true, oculto_por_rol: true, hallazgos: [], resumen: {} }
  }
  const q = incluirHuellas ? '?incluir_huellas=true' : '?incluir_huellas=false'
  return fetchJsonOrThrow(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/sincronizar${q}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
    'No se pudo sincronizar el análisis de hallazgos.',
    'sync',
  )
}

export async function fetchAuditoriaHallazgoDetalle({
  API_URL,
  contratoId,
  token,
  hallazgoId,
}) {
  return fetchJsonOrThrow(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/${hallazgoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    'No se pudo cargar el detalle del hallazgo.',
    'carga',
  )
}

export async function justificarAuditoriaHallazgo({
  API_URL,
  contratoId,
  token,
  hallazgoId,
  justificacion,
  observacion,
}) {
  const body = { justificacion }
  if (observacion != null && String(observacion).trim()) {
    body.observacion = String(observacion).trim()
  }
  return fetchJsonOrThrow(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/${hallazgoId}/justificar`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    'No se pudo guardar la justificación.',
    'carga',
  )
}

export async function fetchAuditoriaHallazgosExport({
  API_URL,
  contratoId,
  token,
  filtros = {},
}) {
  const params = new URLSearchParams()
  Object.entries(filtros || {}).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== '') params.set(k, String(v))
  })
  const q = params.toString() ? `?${params}` : ''
  return fetchJsonOrThrow(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/export${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
    'No se pudo exportar los hallazgos.',
    'carga',
  )
}

export { mensajeErrorCarga, fmtFechaHallazgosGuardados } from './sicoeAuditoriaMensajes'
