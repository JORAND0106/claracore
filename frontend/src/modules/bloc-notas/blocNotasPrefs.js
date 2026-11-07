/** Preferencia de modo de escritura por usuario (local, funciona offline). */

const KEY_PREFIX = 'claracore_bloc_write_mode_'

export function getDefaultWriteMode(usuarioId) {
  try {
    const v = localStorage.getItem(`${KEY_PREFIX}${usuarioId}`)
    if (v === 'hand' || v === 'text') return v
  } catch { /* ignore */ }
  return 'text'
}

export function setDefaultWriteMode(usuarioId, mode) {
  const m = mode === 'hand' ? 'hand' : 'text'
  try {
    localStorage.setItem(`${KEY_PREFIX}${usuarioId}`, m)
  } catch { /* ignore */ }
  return m
}
