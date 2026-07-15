import { useEffect, useState } from 'react'

/** Breakpoints alineados con la plataforma ClaraCore (móvil / tablet / desktop). */
export const CLARA_BP = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1024,
  desktopMin: 1025,
  /** Ancho máximo típico de teléfono en landscape (iPhone 14 Pro Max, etc.). */
  landscapeMobileMax: 932,
  /** Hasta este ancho: header con menú hamburguesa (móvil + tablet). */
  navDrawerMax: 1366,
}

function readViewport() {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isLandscape: false,
      isLandscapeMobile: false,
      isNavDrawer: false,
    }
  }
  const width = window.innerWidth
  const isLandscape =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: landscape)').matches
      : window.innerWidth > window.innerHeight
  const isMobile = width <= CLARA_BP.mobileMax
  const isTablet = width >= CLARA_BP.tabletMin && width <= CLARA_BP.tabletMax
  const isDesktop = width >= CLARA_BP.desktopMin
  /** Teléfono en horizontal: ancho suele superar 767px y romper layouts de una columna. */
  const isLandscapeMobile = isLandscape && width <= CLARA_BP.landscapeMobileMax
  /** Móvil + tablet: barra superior mínima y menú lateral (hamburguesa). */
  const isNavDrawer =
    isMobile ||
    isLandscapeMobile ||
    (width >= CLARA_BP.tabletMin && width <= CLARA_BP.navDrawerMax)
  return { width, isMobile, isTablet, isDesktop, isLandscape, isLandscapeMobile, isNavDrawer }
}

export function useClaraViewport() {
  const [vp, setVp] = useState(readViewport)

  useEffect(() => {
    const onResize = () => setVp(readViewport())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    let mql
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(orientation: landscape)')
      if (mql.addEventListener) mql.addEventListener('change', onResize)
      else if (mql.addListener) mql.addListener(onResize)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener('change', onResize)
        else if (mql.removeListener) mql.removeListener(onResize)
      }
    }
  }, [])

  return vp
}
