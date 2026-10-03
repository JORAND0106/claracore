/**
 * API biblioteca de bloques de nodo (SicoeObra).
 */

async function parseErr(res) {
  const txt = await res.text().catch(() => '')
  try {
    const j = JSON.parse(txt)
    return j?.detail || txt || `Error ${res.status}`
  } catch {
    return txt || `Error ${res.status}`
  }
}

export async function listarBloquesNodo({ API_URL, contratoId, token, incluirInactivos = false }) {
  const q = incluirInactivos ? '?incluir_inactivos=true' : ''
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/bloques-nodo${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return res.json()
}

export async function crearBloqueNodo({ API_URL, contratoId, token, body }) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/bloques-nodo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return res.json()
}

export async function actualizarBloqueNodo({ API_URL, contratoId, token, bloqueId, body }) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/bloques-nodo/${bloqueId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return res.json()
}

export async function desactivarBloqueNodo({ API_URL, contratoId, token, bloqueId }) {
  const res = await fetch(`${API_URL}/sicoe-obra/${contratoId}/bloques-nodo/${bloqueId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return res.json()
}
