/**
 * API del Ambiente de Auditoría (hallazgos del contrato).
 */
import { usuarioVeAuditoriaTraslapos } from './sicoeAuditoriaTraslapos'

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
    throw new Error(txt || `Error ${res.status}`)
  }
  return res.json()
}

export async function syncAuditoriaHallazgos({ API_URL, contratoId, token, usuario }) {
  if (!usuarioVeAuditoriaTraslapos(usuario)) {
    return { ok: true, oculto_por_rol: true, hallazgos: [], resumen: {} }
  }
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/auditoria-hallazgos/sincronizar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Error ${res.status}`)
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
