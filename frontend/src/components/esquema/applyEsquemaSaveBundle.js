/**
 * Aplica el paquete de guardado del esquema.
 * Registro/documento: SOLO PNG principal + memorias/despieces PNG (+ escena en meta).
 * PDF/DXF NUNCA se adjuntan al registro; van a la nube y/o descarga (popup Exportar).
 */
import { applyEsquemaCalcAdjuntos } from './esquemaSaveExtras.js'
import { sceneFromSaveExtras, ESQUEMA_SCENE_KIND } from './esquemaScenePersist.js'
import { uploadEsquemaAssetBundle } from './esquemaAssetsApi.js'
import {
  filterEsquemaRegistroAdjuntos,
  isEsquemaPngPayload,
} from './esquemaRegistroAdjuntos.js'

/**
 * @param {string} dataUrl PNG principal
 * @param {object} extras onSave extras
 * @param {{
 *   commitImage: Function,
 *   folder?: object|null,
 *   uploadToCloud?: boolean,
 *   token?: string|null,
 *   replacePaths?: string[]|null,
 * }} opts
 */
export async function applyEsquemaSaveBundle(dataUrl, extras, opts = {}) {
  const {
    commitImage,
    folder = null,
    uploadToCloud = false,
    token = null,
    replacePaths = null,
  } = opts
  if (typeof commitImage !== 'function') return { ok: false, error: 'sin commit' }

  if (!isEsquemaPngPayload(dataUrl, extras?.mime || 'image/png')) {
    return { ok: false, error: 'El esquema del registro debe ser PNG' }
  }

  const title = String(extras?.title || 'esquema').trim() || 'Esquema'
  const scene = sceneFromSaveExtras(extras)

  await commitImage({
    dataUri: dataUrl,
    nombre: `${title}.png`,
    mime: 'image/png',
    origen: 'esquema',
    kind: 'esquema',
    pie: '',
    scene: scene || undefined,
    esquema_scene: scene || undefined,
  })

  // Solo memorias / despieces PNG (nunca PDF/DXF/escena como archivo del registro).
  const registroAdjuntos = filterEsquemaRegistroAdjuntos(extras?.adjuntos)
    .filter((adj) => {
      const kind = String(adj.kind || '').toLowerCase()
      return kind !== 'esquema' && kind !== ESQUEMA_SCENE_KIND
    })

  await applyEsquemaCalcAdjuntos({ adjuntos: registroAdjuntos }, async (adj) => {
    const kind = adj.kind || 'esquema-calculo'
    const pie = kind === 'memoria-calculo'
      ? 'Memoria de cálculo (PNG)'
      : kind === 'despiece-acero'
        ? 'Cuadro de despiece (PNG)'
        : 'Gráfico isométrico'
    await commitImage({
      dataUri: adj.dataUri,
      nombre: adj.nombre,
      mime: adj.mime || 'image/png',
      origen: adj.origen || 'esquema-calculo',
      kind,
      pie,
      blob: adj.blob || null,
    })
  })

  let cloud = null
  if (uploadToCloud && folder && token) {
    try {
      const exports = extras?.exports || {}
      const cloudAdjuntos = [
        ...(Array.isArray(extras?.adjuntos) ? extras.adjuntos : []),
        ...(exports.pdf ? [{ ...exports.pdf, kind: 'esquema-pdf' }] : []),
        ...(exports.dxf ? [{ ...exports.dxf, kind: 'esquema-dxf' }] : []),
      ]
      cloud = await uploadEsquemaAssetBundle({
        token,
        folder,
        title,
        pngDataUri: dataUrl,
        scene,
        adjuntos: cloudAdjuntos,
        replacePaths,
      })
    } catch (e) {
      cloud = { ok: false, error: e?.message || 'upload falló' }
    }
  }

  return { ok: true, scene, cloud, exports: extras?.exports || null }
}
