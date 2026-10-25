/**
 * Ícono «Editar esquema» junto a la imagen del esquema.
 * Visible solo con permiso de editar y registro no sellado, si hay escena o borrador.
 */
import { canShowEditarEsquema } from './esquemaScenePersist.js'

export default function EsquemaEditIcon({
  hasScene = false,
  hasDraft = false,
  canEdit = false,
  sealed = false,
  onClick,
  size = 28,
  style = null,
}) {
  if (!canShowEditarEsquema({ hasScene, hasDraft, canEdit, sealed })) return null
  return (
    <button
      type="button"
      title="Editar esquema"
      aria-label="Editar esquema"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: '1px solid #cbd5e1',
        background: '#fff',
        color: '#0f172a',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        lineHeight: 1,
        padding: 0,
        boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
        ...(style || {}),
      }}
    >
      ✎
    </button>
  )
}
