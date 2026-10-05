/**
 * API del Ambiente de Auditoría (hallazgos del contrato).
 */
import { usuarioVeAuditoriaTraslapos } from './sicoeAuditoriaTraslapos'
import { mensajeErrorCarga } from './sicoeAuditoriaMensajes'

async function fetchJsonOrThrow(url, opts, fallbackEs) {
  let res
  try {
    res = await fetch(url, opts)
  } catch (e) {
    throw new Error(mensajeErrorCarga(e, fallbackEs))
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(mensajeErrorCarga({ message: txt || `Error ${res.status}` }, fallbackEs))
  }
  try {
    return await res.json()
  } catch (e) {
    throw new Error(mensajeErrorCarga(e, fallbackEs))
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
    'No se pudieron cargar los hallazgos. Compruebe la conexión e intente de nuevo.',
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
    'No se pudo sincronizar el análisis de hallazgos. Compruebe la conexión e intente de nuevo.',
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
  )
}

export { mensajeErrorCarga } from './sicoeAuditoriaMensajes'
