/**
 * Botón de solo lectura para abrir historial de trazabilidad de Almacén.
 * Reutiliza TrazabilidadRegistroModal (misma UX que SicoeObra / Presupuesto).
 * No ofrece editar ni eliminar eventos.
 */
import { useState } from 'react'
import { API_BASE } from '../apiBase'
import TrazabilidadRegistroModal from '../TrazabilidadRegistroModal'

export default function AlmacenTrazabilidadButton({
  token,
  theme,
  entidadTipo,
  entidadId,
  titulo,
  ui,
  compact = false,
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
          e.stopPropagation()
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
          titulo={titulo || `Almacén · ${entidadTipo} #${entidadId}`}
          theme={theme}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
