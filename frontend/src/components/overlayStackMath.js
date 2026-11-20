/**
 * Helpers puros del apilamiento de overlays (sin React — usable en node:test).
 * Ver overlayStack.js para OverlayStackProvider / useStackedOverlayZ.
 */

/** Separación mínima entre overlay padre e hijo en la misma cadena. */
export const OVERLAY_NEST_STEP = 10

/** Helper puro: z del hijo = padre + paso. */
export function nestedOverlayZ(parentZ, step = OVERLAY_NEST_STEP) {
  const p = Number(parentZ)
  const parent = Number.isFinite(p) && p > 0 ? p : 0
  return parent + (Number(step) || OVERLAY_NEST_STEP)
}

/** Misma regla que useStackedOverlayZ, sin contexto. */
export function resolveStackedOverlayZ(preferredZ, parentZ = 0) {
  const preferred = Number(preferredZ)
  const base = Number.isFinite(preferred) && preferred > 0 ? preferred : 0
  const parent = Number(parentZ)
  const p = Number.isFinite(parent) && parent > 0 ? parent : 0
  if (p > 0) return Math.max(base, p + OVERLAY_NEST_STEP)
  return base
}
