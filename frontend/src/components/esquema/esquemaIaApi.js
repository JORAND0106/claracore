import { API_BASE, apiFetchSignal } from '../../apiBase'

function token() {
  return localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
}

async function parseOrThrow(res) {
  if (res.ok) return res.json()
  let detail = `Error ${res.status}`
  try {
    const j = await res.json()
    detail = j.detail || j.message || detail
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  } catch { /* ignore */ }
  const err = new Error(detail)
  err.status = res.status
  throw err
}

export async function fetchEsquemaIaUso() {
  const sig = apiFetchSignal(20000)
  const res = await fetch(`${API_BASE}/esquema/ia/uso`, {
    headers: { Authorization: `Bearer ${token()}` },
    ...(sig ? { signal: sig } : {}),
  })
  return parseOrThrow(res)
}

export async function generarEsquemaIa({ contratoId, ambito, docKey, instruccion, modo, scene }) {
  const sig = apiFetchSignal(120000)
  const res = await fetch(`${API_BASE}/esquema/ia/generar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contrato_id: contratoId ?? null,
      ambito,
      doc_key: docKey,
      instruccion,
      modo,
      scene: scene || [],
    }),
    ...(sig ? { signal: sig } : {}),
  })
  return parseOrThrow(res)
}
