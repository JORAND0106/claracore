/**
 * ModuloContext — publica el módulo activo de ClaraCore para que AVI
 * lo consuma sin necesidad de prop-drilling a través del árbol de Dashboard.
 *
 * Valores que el contexto puede publicar:
 *   inicio | dashboard | cobro | presupuesto | sicoe | informes |
 *   almacen | programacion_obra | plano_semaforo | guias | sst |
 *   ensayos | auditor_sst | admin | listado_precios | notificaciones | general
 *
 * Responsabilidad del emisor (Dashboard en App.jsx):
 *   - Llamar setModuloActivo(slug) cada vez que cambia moduloActivo local.
 *   - Llamar setModuloActivo("admin") cuando showAdmin pasa a true.
 *   - Llamar setModuloActivo("cobro") cuando el panelFoco activo o dashTab
 *     corresponde a la vista de cobro dentro del Dashboard.
 *   - Llamar setModuloActivo(moduloActivo) cuando showAdmin vuelve a false.
 */
import { createContext, useContext, useState } from 'react'

const ModuloContext = createContext({
  moduloActivo: 'general',
  setModuloActivo: () => {},
})

/**
 * ModuloProvider — envuelve el árbol de la app autenticada.
 * Debe montarse como ancestro de Dashboard y de AVI.
 */
export function ModuloProvider({ children }) {
  const [moduloActivo, setModuloActivo] = useState('general')

  return (
    <ModuloContext.Provider value={{ moduloActivo, setModuloActivo }}>
      {children}
    </ModuloContext.Provider>
  )
}

/**
 * useModulo — hook de consumo. Lanza si se usa fuera de ModuloProvider.
 *
 * Ejemplo de uso en AVI.jsx:
 *   const { moduloActivo } = useModulo()
 */
export function useModulo() {
  const ctx = useContext(ModuloContext)
  if (!ctx) throw new Error('useModulo debe usarse dentro de <ModuloProvider>')
  return ctx
}

export default ModuloContext
