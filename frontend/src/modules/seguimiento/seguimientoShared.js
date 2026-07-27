import { useClaraViewport } from '../../useClaraViewport'

/** Móvil, teléfono landscape, tablet e iPad (mismo rango que menú hamburguesa). */
export function useSeguimientoCompact() {
  const vp = useClaraViewport()
  return vp.isNavDrawer
}

export function seguimientoModalOverlayStyle(compact) {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 11000,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: compact ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: compact ? 0 : 16,
  }
}

export function seguimientoModalSheetStyle(compact, { wide = false, zIndex = 11000 } = {}) {
  if (!compact) {
    return {
      width: wide ? 'min(1640px, 98vw)' : 'min(820px, 100%)',
      maxHeight: '92vh',
      overflow: 'auto',
      borderRadius: 12,
      padding: 20,
    }
  }
  return {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '96dvh',
    overflow: 'auto',
    borderRadius: '16px 16px 0 0',
    padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
    zIndex,
  }
}
