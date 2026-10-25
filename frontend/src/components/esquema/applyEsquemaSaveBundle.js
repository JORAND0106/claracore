/**
 * Aplica el paquete de guardado del esquema: PNG principal + adjuntos
 * (memorias, despiece, escena editable, PDF, DXF) vía callbacks del módulo.
 */
import { applyEsquemaCalcAdjuntos } from './esquemaSaveExtras.js'
import { sceneFromSaveExtras, ESQUEMA_SCENE_KIND } from './esquemaScenePersist.js'
import { uploadEsquemaAssetBundle } from './esquemaAssetsApi.js'

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

  const adjuntos = Array.isArray(extras?.adjuntos) ? extras.adjuntos : []
  await applyEsquemaCalcAdjuntos({ adjuntos }, async (adj) => {
    const kind = adj.kind || 'esquema-calculo'
    const pie = kind === 'memoria-calculo'
      ? 'Memoria de cálculo (PNG)'
      : kind === 'despiece-acero'
        ? 'Cuadro de despiece (PNG)'
        : kind === 'esquema-pdf'
          ? 'PDF del esquema'
          : kind === 'esquema-dxf'
            ? 'DXF del esquema'
            : kind === ESQUEMA_SCENE_KIND
              ? 'Dibujo editable'
              : 'Adjunto de esquema'
    await commitImage({
      dataUri: adj.dataUri,
      nombre: adj.nombre,
      mime: adj.mime,
      origen: adj.origen || 'esquema-calculo',
      kind,
      pie,
      blob: adj.blob || null,
      georeferenced: adj.georeferenced,
      layers: adj.layers,
    })
  })

  let cloud = null
  if (uploadToCloud && folder && token) {
    try {
      cloud = await uploadEsquemaAssetBundle({
        token,
        folder,
        title,
        pngDataUri: dataUrl,
        scene,
        adjuntos,
        replacePaths,
      })
    } catch (e) {
      cloud = { ok: false, error: e?.message || 'upload falló' }
    }
  }

  return { ok: true, scene, cloud }
}
