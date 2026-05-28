/** API helpers — Programación de obra (fases 3C-2, 4, 5A) */

async function parseErr(res) {
  const err = await res.json().catch(() => ({}))
  throw new Error(err?.detail || `Error ${res.status}`)
}

export async function fetchCurvaS(API, cid, token, { baselineId, targetId } = {}) {
  const q = new URLSearchParams()
  if (baselineId) q.set('baseline_id', baselineId)
  if (targetId) q.set('target_id', targetId)
  const res = await fetch(`${API}/prog-obra/${cid}/curva-s?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function downloadCurvaSPdf(API, cid, token, { baselineId, targetId } = {}) {
  const q = new URLSearchParams()
  if (baselineId) q.set('baseline_id', baselineId)
  if (targetId) q.set('target_id', targetId)
  const res = await fetch(`${API}/prog-obra/${cid}/curva-s/pdf?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) await parseErr(res)
  return res.blob()
}

export async function fetchAutoSchedulePrereqs(API, cid, token, versionId) {
  const q = new URLSearchParams({ version_id: versionId })
  const res = await fetch(`${API}/prog-obra/${cid}/auto-schedule/prereqs?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function previewAutoSchedule(API, cid, token, body) {
  const res = await fetch(`${API}/prog-obra/${cid}/auto-schedule/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function applyAutoSchedule(API, cid, token, versionId, propuesta) {
  const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/auto-schedule/aplicar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ propuesta }),
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function previewSuspension(API, cid, token, { versionId, fechaInicio, fechaFin }) {
  const res = await fetch(`${API}/prog-obra/${cid}/suspension/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version_id: versionId,
      fecha_inicio_suspension: fechaInicio,
      fecha_fin_suspension: fechaFin,
    }),
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function applySuspension(API, cid, token, { motivo, metadata }) {
  const res = await fetch(`${API}/prog-obra/${cid}/suspension/aplicar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ motivo, metadata }),
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}

export async function clearVersionProgramacion(API, cid, token, versionId) {
  const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionId}/programacion`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) await parseErr(res)
  return res.json()
}
