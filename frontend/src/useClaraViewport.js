import { useEffect, useState } from 'react'

/** Breakpoints alineados con la plataforma ClaraCore (móvil / tablet / desktop). */
export const CLARA_BP = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1024,
  desktopMin: 1025,
}

function readViewport() {
  if (typeof window === 'undefined') {
    return { width: 1280, isMobile: false, isTablet: false, isDesktop: true }
  }
  const width = window.innerWidth
  const isMobile = width <= CLARA_BP.mobileMax
  const isTablet = width >= CLARA_BP.tabletMin && width <= CLARA_BP.tabletMax
  const isDesktop = width >= CLARA_BP.desktopMin
  return { width, isMobile, isTablet, isDesktop }
}

export function useClaraViewport() {
  const [vp, setVp] = useState(readViewport)

  useEffect(() => {
    const onResize = () => setVp(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return vp
}
