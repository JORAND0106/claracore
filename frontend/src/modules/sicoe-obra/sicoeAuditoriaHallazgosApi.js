/**
 * API del Ambiente de Auditoría (hallazgos del contrato).
 */
import { usuarioVeAuditoriaTraslapos } from './sicoeAuditoriaTraslapos'
import { mensajeErrorCarga } from './sicoeAuditoriaMensajes'

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
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(mensajeErrorCarga({ message: txt || `Error ${res.status}` }, 'No se pudieron cargar los hallazgos.'))
  }
  return res.json()
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
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/sincronizar${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(
      mensajeErrorCarga(
        { message: txt || `Error ${res.status}` },
        'No se pudo sincronizar el análisis de hallazgos.',
      ),
    )
  }
  return res.json()
}

export async function fetchAuditoriaHallazgoDetalle({
  API_URL,
  contratoId,
  token,
  hallazgoId,
}) {
  const res = await fetch(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/${hallazgoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(
      mensajeErrorCarga(
        { message: txt || `Error ${res.status}` },
        'No se pudo cargar el detalle del hallazgo.',
      ),
    )
  }
  return res.json()
}

export async function justificarAuditoriaHallazgo({
  API_URL,
  contratoId,
  token,
  hallazgoId,
  justificacion,
}) {
  const res = await fetch(
    `${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/${hallazgoId}/justificar`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ justificacion }),
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Error ${res.status}`)
  }
  return res.json()
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
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/export${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Error ${res.status}`)
  }
  return res.json()
}

export { mensajeErrorCarga } from './sicoeAuditoriaMensajes'
