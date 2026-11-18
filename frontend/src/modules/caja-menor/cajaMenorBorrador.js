/** Conserva la caja, el popup y lo digitado si la página se recarga al volver de otra aplicación. */

const DB = 'claracore-pantalla'
const STORE = 'caja-menor'

export function datosPersistibles(estado) {
  const limpio = (draft) => {
    if (!draft) return null
    const { file, ...resto } = draft
    return resto
  }
  return {
    cajaId: estado?.cajaId || null,
    panel: estado?.panel || null,
    vista: estado?.vista || 'lista',
    origen: estado?.origen || 'lista',
    meta: estado?.meta || null,
    ingreso: limpio(estado?.ingreso),
    gasto: limpio(estado?.gasto),
    rechazo: estado?.rechazo || null,
  }
}

function clave(userId, contratoId) {
  return `${userId}:${contratoId}`
}

function abrirDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('sin indexedDB'))
      return
    }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function pedido(modo, fn) {
  return abrirDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo)
    const store = tx.objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export async function guardarBorradorCaja(userId, contratoId, estado) {
  if (!userId || !contratoId || !estado?.cajaId) return
  const datos = datosPersistibles(estado)
  const gasto = estado?.gasto?.file || null
  const ingreso = estado?.ingreso?.file || null
  await pedido('readwrite', (store) => store.put({ datos, gasto, ingreso }, clave(userId, contratoId)))
}

export async function leerBorradorCaja(userId, contratoId) {
  if (!userId || !contratoId) return null
  const row = await pedido('readonly', (store) => store.get(clave(userId, contratoId)))
  if (!row?.datos?.cajaId) return null
  const fileDe = (blob, nombre) => {
    if (!blob) return null
    try {
      return new File([blob], nombre, { type: blob.type || 'image/jpeg' })
    } catch {
      return null
    }
  }
  const gasto = row.datos.gasto
    ? { ...row.datos.gasto, file: fileDe(row.gasto, 'recibo.jpg') }
    : null
  const ingreso = row.datos.ingreso
    ? { ...row.datos.ingreso, file: fileDe(row.ingreso, 'consignacion.jpg') }
    : null
  return { ...row.datos, gasto, ingreso }
}

export async function borrarBorradorCaja(userId, contratoId) {
  if (!userId || !contratoId) return
  await pedido('readwrite', (store) => store.delete(clave(userId, contratoId)))
}

export function olvidarBorradoresCaja() {
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB)
  } catch { /* ignore */ }
}
