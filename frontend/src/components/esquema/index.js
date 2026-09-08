/** Editor de esquema a mano (PNG) — compartido entre Seguimiento, SicoeObra, etc. */
export { default as EsquemaEditorModal } from './EsquemaEditorModal'
export { composeEsquemaExport, sceneExportBounds } from './esquemaExport'
export { hydrateIaObjects, sceneForIa } from './esquemaIa'
export { createCota, drawCota } from './esquemaCota'
export { offsetEntity } from './esquemaOffset'
export {
  createHatchRegionFromClick,
  drawHatchRegion,
  makeHatchPattern,
  preloadHatchRegions,
} from './esquemaHatch'
