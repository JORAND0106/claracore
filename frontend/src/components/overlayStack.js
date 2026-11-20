/**
 * Apilamiento de overlays portaleados a document.body.
 *
 * Problema recurrente: un popup A (p. ej. planilla z=100030) abre otro B
 * (p. ej. Esquema con z fijo 17000). B se pinta detrás de A y bloquea la UI.
 *
 * Solución: el overlay padre declara su z con OverlayStackProvider; el hijo
 * pide useStackedOverlayZ(preferido) y obtiene max(preferido, padre + paso),
 * de modo que siempre queda delante — sin importar la escala del módulo.
 *
 * createPortal conserva el contexto de React, así que el hijo puede portarse
 * a body y seguir leyendo el z del padre.
 */
import { createContext, createElement, useContext } from 'react'
import {
  OVERLAY_NEST_STEP,
  nestedOverlayZ,
  resolveStackedOverlayZ,
} from './overlayStackMath.js'

export { OVERLAY_NEST_STEP, nestedOverlayZ, resolveStackedOverlayZ }

const OverlayStackContext = createContext(0)

/**
 * Declara el z-index del overlay actual para que los hijos anidados
 * (aunque usen createPortal a body) queden por encima.
 */
export function OverlayStackProvider({ zIndex = 0, children }) {
  const parent = useContext(OverlayStackContext)
  const raw = Number(zIndex)
  const own = Number.isFinite(raw) && raw > 0 ? raw : 0
  const value = Math.max(own, parent)
  return createElement(OverlayStackContext.Provider, { value }, children)
}

/**
 * Z efectivo para un overlay a body.
 * @param {number} preferredZ z por defecto del componente (escala del módulo)
 * @returns {number}
 */
export function useStackedOverlayZ(preferredZ) {
  const parent = useContext(OverlayStackContext)
  return resolveStackedOverlayZ(preferredZ, parent)
}
