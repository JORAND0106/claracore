/**
 * ModuloContext — publica el módulo activo de ClaraCore para que AVI
 * lo consuma sin necesidad de prop-drilling a través del árbol de Dashboard.
 *
 * También expone `moduloRefresh` para que RefreshCacheGuard pueda invocar
 * el botón «Actualizar» del módulo visible sin recargar la página.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ModuloContext = createContext({
  moduloActivo: 'general',
  setModuloActivo: () => {},
  moduloRefresh: null,
  setModuloRefresh: () => {},
  clearModuloRefresh: () => {},
})

export function ModuloProvider({ children }) {
  const [moduloActivo, setModuloActivo] = useState('general')
  const [moduloRefresh, setModuloRefreshState] = useState(null)

  const setModuloRefresh = useCallback((meta) => {
    if (!meta || typeof meta.fn !== 'function') {
      setModuloRefreshState(null)
      return
    }
    setModuloRefreshState({
      label: String(meta.label || 'módulo'),
      fn: meta.fn,
      disabled: !!meta.disabled,
      busy: !!meta.busy,
    })
  }, [])

  const clearModuloRefresh = useCallback(() => {
    setModuloRefreshState(null)
  }, [])

  const value = useMemo(
    () => ({
      moduloActivo,
      setModuloActivo,
      moduloRefresh,
      setModuloRefresh,
      clearModuloRefresh,
    }),
    [moduloActivo, moduloRefresh, setModuloRefresh, clearModuloRefresh],
  )

  return (
    <ModuloContext.Provider value={value}>
      {children}
    </ModuloContext.Provider>
  )
}

export function useModulo() {
  const ctx = useContext(ModuloContext)
  if (!ctx) throw new Error('useModulo debe usarse dentro de <ModuloProvider>')
  return ctx
}

export default ModuloContext
