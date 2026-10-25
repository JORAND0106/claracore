/** Avisa a las demás pantallas abiertas del mismo contrato, sin recargar la página. */

const CANAL = 'claracore-almacen-contrato'

export function publicarCambioAlmacen(contratoId, detalle = {}) {
  if (contratoId == null) return
  const msg = { contratoId: String(contratoId), at: Date.now(), ...detalle }
  try {
    const canal = new BroadcastChannel(CANAL)
    canal.postMessage(msg)
    canal.close()
  } catch {
    /* el navegador no tiene BroadcastChannel */
  }
  try {
    localStorage.setItem(CANAL, JSON.stringify(msg))
  } catch {
    /* almacenamiento no disponible */
  }
}

export function escucharCambiosAlmacen(contratoId, onCambio) {
  if (contratoId == null || typeof onCambio !== 'function') return () => {}
  const propio = String(contratoId)
  const recibir = (msg) => {
    if (!msg || String(msg.contratoId) !== propio) return
    onCambio(msg)
  }
  let canal = null
  try {
    canal = new BroadcastChannel(CANAL)
    canal.onmessage = (ev) => recibir(ev?.data)
  } catch {
    canal = null
  }
  const onStorage = (ev) => {
    if (ev.key !== CANAL || !ev.newValue) return
    try {
      recibir(JSON.parse(ev.newValue))
    } catch {
      /* mensaje ajeno */
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('storage', onStorage)
    try { canal?.close() } catch { /* ya cerrado */ }
  }
}
