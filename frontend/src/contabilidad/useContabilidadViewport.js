import { CLARA_BP, useClaraViewport } from '../useClaraViewport'

/** @deprecated Prefer CLARA_BP — contabilidad usa desktop desde 920px por layouts de formulario. */
export const CONTAB_BP = {
  mobileMax: CLARA_BP.mobileMax,
  tabletMin: CLARA_BP.tabletMin,
  desktopMin: 920,
}

export function useContabilidadViewport() {
  const base = useClaraViewport()
  const isDesktop = base.width >= CONTAB_BP.desktopMin
  const isTablet = base.width >= CONTAB_BP.tabletMin && base.width < CONTAB_BP.desktopMin
  return { ...base, isTablet, isDesktop }
}
