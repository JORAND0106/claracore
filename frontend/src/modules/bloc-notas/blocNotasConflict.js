/**
 * Resolución de conflicto del bloc de notas.
 * Copia automática SOLO si la misma nota se editó en DOS DISPOSITIVOS distintos
 * (server_rev > base_rev y device_id distinto). Mismo dispositivo = upsert, nunca copia.
 */

export function conflictTitle(title) {
  const base = String(title || 'Nota').trim() || 'Nota'
  return `${base.slice(0, 240)} · copia`
}

/**
 * @returns {{ keepServer: boolean, copyLocal: boolean }}
 */
export function shouldCreateConflictCopy({
  serverRev,
  baseRev,
  deleted = false,
  serverDeviceId = null,
  clientDeviceId = null,
}) {
  if (deleted) return { keepServer: false, copyLocal: false }
  if (serverRev == null || baseRev == null) return { keepServer: false, copyLocal: false }
  if (!(Number(serverRev) > Number(baseRev))) return { keepServer: false, copyLocal: false }

  const a = serverDeviceId == null || serverDeviceId === '' ? null : String(serverDeviceId)
  const b = clientDeviceId == null || clientDeviceId === '' ? null : String(clientDeviceId)
  // Sin device_id en ambos → no se puede afirmar conflicto multi-dispositivo
  if (!a || !b) return { keepServer: false, copyLocal: false }
  if (a === b) return { keepServer: false, copyLocal: false }

  return { keepServer: true, copyLocal: true }
}

/** Título típico de copia falsa generada por el bug de sync. */
export function isConflictCopyTitle(title) {
  return / · copia$/i.test(String(title || '').trim())
}
