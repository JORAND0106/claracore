/** Editor de esquema a mano (PNG) — compartido entre Seguimiento, SicoeObra, etc. */
export { default as EsquemaEditorModal } from './EsquemaEditorModal'
export { composeEsquemaExport, sceneExportBounds } from './esquemaExport'
export { hydrateIaObjects, sceneForIa } from './esquemaIa'
export { createCota, createCotaAngle, createCotaRadio, createCotaDiametro, drawCota } from './esquemaCota'
export { createAreaLabel, createAreaLabelFromClick } from './esquemaArea'
export { offsetEntity } from './esquemaOffset'
export { arrayPolar, arrayRectangular, mirrorObject } from './esquemaTransform'
export {
  createHatchRegionFromClick,
  detectClosedRegionFromClick,
  drawHatchRegion,
  makeHatchPattern,
  preloadHatchRegions,
} from './esquemaHatch'
