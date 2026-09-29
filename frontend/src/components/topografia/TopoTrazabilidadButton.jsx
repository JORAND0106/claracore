/**
 * Botón de solo lectura para abrir historial de trazabilidad Topografía.
 * Reutiliza TrazabilidadRegistroModal (misma UX que Almacén / Presupuesto / SICOE).
 */
import { useState } from 'react'
import { API_BASE } from '../../apiBase'
import TrazabilidadRegistroModal from '../../TrazabilidadRegistroModal'

export const ENTIDAD_PLANILLA_TUBERIA = 'topo_planilla_tuberia'
export const ENTIDAD_POLIGONAL = 'topo_poligonal'
export const ENTIDAD_NIVELACION = 'topo_nivelacion'

export default function TopoTrazabilidadButton({
  token,
  theme,
  entidadTipo,
  entidadId,
  titulo,
  ui,
  compact = false,
  stopPropagation = true,
}) {
  const [open, setOpen] = useState(false)
  if (entidadId == null || entidadId === '' || !entidadTipo || !token) return null

  return (
    <>
      <button
        type="button"
        title="Trazabilidad / historial (solo lectura)"
        aria-label="Ver historial de trazabilidad"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          setOpen(true)
        }}
        style={{
          ...(ui?.btnSecondary || {}),
          padding: compact ? '2px 6px' : '4px 8px',
          fontSize: compact ? 'var(--cc-xs)' : 'var(--cc-sm)',
          lineHeight: 1.2,
          minWidth: compact ? 32 : undefined,
          minHeight: compact ? 32 : undefined,
        }}
      >
        📜
      </button>
      {open && (
        <TrazabilidadRegistroModal
          apiBase={API_BASE}
          token={token}
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          titulo={titulo || `Topografía · ${entidadTipo} #${entidadId}`}
          theme={theme}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
