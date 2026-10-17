/**
 * Aplica adjuntos de memoria de cálculo (PNG isométrico + cuadro) al destino
 * del módulo, sin alterar el guardado principal del esquema.
 *
 * Cada consumidor pasa un `commit` unificado:
 *   commit({ dataUri, mime, nombre, kind, origen, blob? }) => Promise|void
 */
export async function applyEsquemaCalcAdjuntos(extras, commit) {
  if (typeof commit !== 'function') return []
  const list = Array.isArray(extras?.adjuntos) ? extras.adjuntos : []
  const done = []
  for (const adj of list) {
    if (!adj?.dataUri && !adj?.blob) continue
    try {
      await commit({
        dataUri: adj.dataUri,
        mime: adj.mime || 'application/octet-stream',
        nombre: adj.nombre || `adjunto-${Date.now()}`,
        kind: adj.kind || 'esquema-calculo',
        origen: adj.origen || 'esquema-calculo',
        blob: adj.blob || null,
      })
      done.push(adj.nombre)
    } catch {
      /* el caller maneja errores de su API */
    }
  }
  return done
}

/** data URI → File (PNG/PDF). */
export function dataUriToFile(dataUri, nombre, mime) {
  const raw = String(dataUri || '')
  const comma = raw.indexOf(',')
  if (comma < 0) return null
  const header = raw.slice(0, comma)
  const b64 = raw.slice(comma + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  const type = mime || (header.match(/data:([^;]+)/)?.[1]) || 'application/octet-stream'
  return new File([bytes], nombre || `archivo-${Date.now()}`, { type })
}
